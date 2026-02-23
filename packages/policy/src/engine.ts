import type { ToolCallIntent, PolicyDecision } from '@ai-security-gateway/shared';

/**
 * Core policy engine interface.
 *
 * Implementations may use local rule sets, OPA over REST, or any other backend.
 * The gateway depends only on this interface; concrete engines are injected at
 * startup so the implementation can be swapped without changing route code.
 */
export interface PolicyEngine {
  /** Identifier for logs and telemetry (e.g., local, opa). */
  readonly name: string;
  /**
   * Evaluate a tool call intent and return a policy decision.
   *
   * Contract:
   * - Must never throw. Return `deny` on internal error rather than propagating.
   * - Must always populate `correlation_id` and `evaluated_at` in the response.
   */
  decide(intent: ToolCallIntent): Promise<PolicyDecision>;
  /**
   * Optional richer evaluation output including engine-specific trace details.
   * Used for audit/console visibility; enforcement still depends on `decision`.
   */
  evaluateWithTrace?(
    intent: ToolCallIntent,
  ): Promise<{ decision: PolicyDecision; trace?: Record<string, unknown> }>;
}
