import type { AgentSecurityEvent } from '@ai-security-gateway/shared';
import type { EventExporter } from './index';

export interface SplunkHECExporterOptions {
  /** Full HEC URL or base URL. Base URL is normalized to /services/collector/event. */
  endpoint: string;
  token: string;
  index?: string;
  source?: string;
  sourcetype?: string;
  host?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class SplunkHECExporter implements EventExporter {
  readonly name = 'splunk-hec';
  private readonly endpoint: string;
  private readonly token: string;
  private readonly index?: string;
  private readonly source?: string;
  private readonly sourcetype?: string;
  private readonly host?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: SplunkHECExporterOptions) {
    this.endpoint = normalizeSplunkEndpoint(options.endpoint);
    this.token = options.token;
    this.index = options.index;
    this.source = options.source;
    this.sourcetype = options.sourcetype;
    this.host = options.host;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
  }

  async export(events: AgentSecurityEvent[]): Promise<void> {
    for (const event of events) {
      await this.sendWithRetry(event);
    }
  }

  private async sendWithRetry(event: AgentSecurityEvent): Promise<void> {
    let lastError: unknown;
    const idempotencyKey = `${event.correlation_id}:${event.id}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.postEvent(event, idempotencyKey);
        if (response.ok) {
          return;
        }

        const bodyText = await response.text().catch(() => '');
        const message = `Splunk HEC export failed (${response.status}) ${bodyText}`;
        if (!isRetryableStatus(response.status) || attempt === this.maxRetries) {
          throw new Error(message);
        }
        lastError = new Error(message);
      } catch (err) {
        lastError = err;
        if (attempt === this.maxRetries) break;
      }

      await sleep(backoffMs(this.retryBaseDelayMs, attempt));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Splunk HEC export failed after retries');
  }

  private async postEvent(event: AgentSecurityEvent, idempotencyKey: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Splunk ${this.token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          time: Date.parse(event.ts) / 1000,
          ...(this.host ? { host: this.host } : {}),
          ...(this.source ? { source: this.source } : {}),
          ...(this.sourcetype ? { sourcetype: this.sourcetype } : {}),
          ...(this.index ? { index: this.index } : {}),
          event,
          fields: {
            event_id: event.id,
            correlation_id: event.correlation_id,
            event_type: event.event_type,
            idempotency_key: idempotencyKey,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeSplunkEndpoint(urlOrBase: string): string {
  const trimmed = urlOrBase.replace(/\/+$/, '');
  if (trimmed.includes('/services/collector/')) {
    return trimmed;
  }
  return `${trimmed}/services/collector/event`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.max(50, Math.floor(baseMs / 2)));
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
