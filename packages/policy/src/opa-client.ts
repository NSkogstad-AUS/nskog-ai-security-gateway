import type { ToolCallIntent, PolicyDecision } from '@ai-security-gateway/shared';
import type { PolicyEngine } from './engine';

export interface OPAClientOptions {
  /**
   * Base URL of the OPA server.
   * @example 'http://localhost:8181'
   */
  baseUrl: string;
  /**
   * OPA policy data path (without leading /v1/data/).
   * @default 'gateway/policy'
   * @example 'gateway/policy'
   */
  policyPath?: string;
  /** Request timeout in milliseconds. @default 5000 */
  timeoutMs?: number;
}

/**
 * OPAPolicyEngine: forwards decisions to an OPA REST API server.
 *
 * Wire protocol (OPA REST API):
 *   POST /v1/data/{policyPath}
 *   Content-Type: application/json
 *   Body: { "input": <ToolCallIntent> }
 *
 * Supported OPA response shapes:
 *   { "result": { "result": "allow"|"deny"|"redact", ... } }
 *   { "result": { "allow": boolean, ... } }
 *
 * @see https://www.openpolicyagent.org/docs/latest/rest-api/
 */
export class OPAPolicyEngine implements PolicyEngine {
  readonly name = 'opa';
  private readonly baseUrl: string;
  private readonly policyPath: string;
  private readonly timeoutMs: number;

  constructor(options: OPAClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.policyPath = options.policyPath ?? 'gateway/policy';
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  /** Full OPA query URL – useful for logging and health-check scripts. */
  get queryUrl(): string {
    return `${this.baseUrl}/v1/data/${this.policyPath}`;
  }

  async evaluateWithTrace(
    intent: ToolCallIntent,
  ): Promise<{ decision: PolicyDecision; trace?: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.queryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ input: intent }),
        signal: controller.signal,
      });

      const body = (await res.json().catch(() => ({}))) as {
        result?: Record<string, unknown>;
      };
      const result = body.result ?? {};
      if (!res.ok) {
        return {
          decision: denyDecision(intent, `OPA request failed (${res.status})`, ['policy.deny']),
          trace: {
            rule: 'opa.transport_error',
            why: `OPA HTTP ${res.status}`,
          },
        };
      }

      const mappedResult = mapResult(result);
      return {
        decision: {
          correlation_id: intent.correlation_id,
          result: mappedResult.result,
          risk_tier: intent.risk_tier,
          reason: mappedResult.reason,
          reason_codes: mappedResult.reason_codes,
          ...(mappedResult.approval_required !== undefined
            ? { approval_required: mappedResult.approval_required }
            : {}),
          ...(mappedResult.redacted_args ? { redacted_args: mappedResult.redacted_args } : {}),
          evaluated_at: new Date().toISOString(),
        },
        trace: {
          rule:
            typeof result.rule_id === 'string'
              ? result.rule_id
              : typeof result.rule === 'string'
                ? result.rule
                : undefined,
          why:
            typeof result.reason === 'string'
              ? result.reason
              : mappedResult.reason ?? 'OPA decision result',
          matched_rules: Array.isArray(result.matched_rules) ? result.matched_rules : undefined,
          raw: result,
        },
      };
    } catch (err) {
      return {
        decision: denyDecision(
          intent,
          `OPA evaluation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          ['policy.deny'],
        ),
        trace: {
          rule: 'opa.exception',
          why: err instanceof Error ? err.message : 'unknown error',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async decide(intent: ToolCallIntent): Promise<PolicyDecision> {
    const evaluated = await this.evaluateWithTrace(intent);
    return evaluated.decision;
  }
}

function denyDecision(
  intent: ToolCallIntent,
  reason: string,
  reason_codes: PolicyDecision['reason_codes'],
): PolicyDecision {
  return {
    correlation_id: intent.correlation_id,
    result: 'deny',
    risk_tier: intent.risk_tier,
    reason,
    reason_codes,
    evaluated_at: new Date().toISOString(),
  };
}

function mapResult(result: Record<string, unknown>): {
  result: PolicyDecision['result'];
  reason?: string;
  reason_codes: PolicyDecision['reason_codes'];
  approval_required?: boolean;
  redacted_args?: Record<string, unknown>;
} {
  const resultValue = result.result;
  if (resultValue === 'allow' || resultValue === 'deny' || resultValue === 'redact') {
    return {
      result: resultValue,
      reason: typeof result.reason === 'string' ? result.reason : undefined,
      reason_codes: normalizeReasonCodes(result.reason_codes, resultValue),
      approval_required:
        typeof result.approval_required === 'boolean' ? result.approval_required : undefined,
      redacted_args: isRecord(result.redacted_args) ? result.redacted_args : undefined,
    };
  }

  if (typeof result.allow === 'boolean') {
    const mapped = result.allow ? 'allow' : 'deny';
    return {
      result: mapped,
      reason: typeof result.reason === 'string' ? result.reason : undefined,
      reason_codes: normalizeReasonCodes(result.reason_codes, mapped),
      approval_required:
        typeof result.approval_required === 'boolean' ? result.approval_required : undefined,
      redacted_args: isRecord(result.redacted_args) ? result.redacted_args : undefined,
    };
  }

  return {
    result: 'deny',
    reason: 'OPA result missing valid decision fields',
    reason_codes: ['policy.deny'],
  };
}

function normalizeReasonCodes(
  value: unknown,
  result: PolicyDecision['result'],
): PolicyDecision['reason_codes'] {
  const allowed = new Set<PolicyDecision['reason_codes'][number]>([
    'policy.allow.local_default',
    'tool.unknown',
    'tool.args_invalid',
    'policy.deny',
    'policy.approval_required',
  ]);

  if (Array.isArray(value)) {
    const filtered = value
      .filter((item): item is string => typeof item === 'string')
      .filter((item): item is PolicyDecision['reason_codes'][number] =>
        allowed.has(item as PolicyDecision['reason_codes'][number]),
      );
    if (filtered.length > 0) return filtered;
  }

  if (result === 'deny') return ['policy.deny'];
  return ['policy.allow.local_default'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
