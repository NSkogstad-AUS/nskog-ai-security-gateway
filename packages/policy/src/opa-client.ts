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
 * Expected OPA response shape:
 *   { "result": { "allow": boolean, "reason": string } }
 *
 * Rego policy skeleton (save as gateway/policy.rego in your OPA bundle):
 *   package gateway.policy
 *   default allow = false
 *   allow { not deny }
 *   deny { ... your rules ... }
 *
 * @see https://www.openpolicyagent.org/docs/latest/rest-api/
 *
 * NOT YET IMPLEMENTED – throws on first call.
 * Complete the `decide()` body once an OPA server is available.
 */
export class OPAPolicyEngine implements PolicyEngine {
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

  async decide(_intent: ToolCallIntent): Promise<PolicyDecision> {
    // TODO: implement OPA REST call
    //
    // const controller = new AbortController();
    // const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // try {
    //   const res = await fetch(this.queryUrl, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ input: _intent }),
    //     signal: controller.signal,
    //   });
    //   const body = await res.json() as { result: { allow: boolean; reason?: string } };
    //   return {
    //     correlation_id: _intent.correlation_id,
    //     result: body.result.allow ? 'allow' : 'deny',
    //     reason: body.result.reason,
    //     evaluated_at: new Date().toISOString(),
    //   };
    // } finally {
    //   clearTimeout(timer);
    // }

    throw new Error(
      `OPAPolicyEngine is not yet implemented. ` +
        `Start an OPA server and complete the REST integration at ${this.queryUrl}`,
    );
  }
}
