import type { ToolCallIntent, PolicyDecision } from '@ai-security-gateway/shared';
import type { PolicyEngine } from './engine';

/**
 * LocalPolicyEngine: a pass-through stub that allows all tool calls.
 *
 * Use this during development and for unit testing the gateway plumbing.
 * Replace with rule-based logic or swap for OPAPolicyEngine before production.
 */
export class LocalPolicyEngine implements PolicyEngine {
  readonly name = 'local';

  async evaluateWithTrace(
    intent: ToolCallIntent,
  ): Promise<{ decision: PolicyDecision; trace?: Record<string, unknown> }> {
    const decision = await this.decide(intent);
    return {
      decision,
      trace: {
        rule: intent.risk_tier === 'admin' ? 'local.admin_requires_approval' : 'local.allow_default',
        why: decision.reason ?? 'Local fallback policy',
      },
    };
  }

  async decide(intent: ToolCallIntent): Promise<PolicyDecision> {
    if (intent.risk_tier === 'admin') {
      return {
        correlation_id: intent.correlation_id,
        result: 'allow',
        risk_tier: intent.risk_tier,
        reason: 'Admin-risk tools require explicit approval before execution',
        reason_codes: ['policy.approval_required'],
        approval_required: true,
        evaluated_at: new Date().toISOString(),
      };
    }

    return {
      correlation_id: intent.correlation_id,
      result: 'allow',
      risk_tier: intent.risk_tier,
      reason: 'LocalPolicyEngine stub – all requests allowed',
      reason_codes: ['policy.allow.local_default'],
      evaluated_at: new Date().toISOString(),
    };
  }
}
