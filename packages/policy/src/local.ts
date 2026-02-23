import type { ToolCallIntent, PolicyDecision } from '@ai-security-gateway/shared';
import type { PolicyEngine } from './engine';

/**
 * LocalPolicyEngine: a pass-through stub that allows all tool calls.
 *
 * Use this during development and for unit testing the gateway plumbing.
 * Replace with rule-based logic or swap for OPAPolicyEngine before production.
 */
export class LocalPolicyEngine implements PolicyEngine {
  async decide(intent: ToolCallIntent): Promise<PolicyDecision> {
    return {
      correlation_id: intent.correlation_id,
      result: 'allow',
      reason: 'LocalPolicyEngine stub – all requests allowed',
      evaluated_at: new Date().toISOString(),
    };
  }
}
