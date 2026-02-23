/**
 * Represents an AI agent's intent to invoke a tool.
 * This is the primary input to the /v1/intercept endpoint.
 */
export interface ToolCallIntent {
  /** Unique ID tying all events for this request together */
  correlation_id: string;
  /** Identifier of the AI agent making the call */
  agent_id: string;
  /** Name of the tool to invoke (must match a registered connector) */
  tool_name: string;
  /** Risk class assigned by the tool registry */
  risk_tier: ToolRiskTier;
  /** Arguments passed to the tool (validated against tool's JSON Schema) */
  tool_args: Record<string, unknown>;
  /** Optional caller metadata (model version, session id, etc.) */
  metadata?: Record<string, unknown>;
}

/** The three possible policy outcomes */
export type PolicyDecisionResult = 'allow' | 'deny' | 'redact';
/** Risk classes used to constrain tool agency */
export type ToolRiskTier = 'read' | 'write' | 'admin';
/** Stable machine-readable reason codes for audits and metrics */
export type PolicyReasonCode =
  | 'policy.allow.local_default'
  | 'tool.unknown'
  | 'tool.args_invalid'
  | 'policy.deny'
  | 'policy.approval_required';

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalSummary {
  id: string;
  status: ApprovalStatus;
}

/**
 * Outcome returned by the policy engine after evaluating a ToolCallIntent.
 */
export interface PolicyDecision {
  correlation_id: string;
  result: PolicyDecisionResult;
  risk_tier: ToolRiskTier;
  /** Human-readable reason for the decision */
  reason?: string;
  /** Machine-readable reason codes for downstream analytics */
  reason_codes: PolicyReasonCode[];
  /** Whether tool execution must pause for explicit human approval */
  approval_required?: boolean;
  /** Approval state when approval is required */
  approval?: ApprovalSummary;
  /** Sanitised args when result === 'redact' */
  redacted_args?: Record<string, unknown>;
  /** ISO 8601 timestamp of when the decision was made */
  evaluated_at: string;
}

/** All security event types written to the append-only event log */
export type AgentSecurityEventType =
  | 'ToolCallProposed'
  | 'PolicyEvaluated'
  | 'ToolCallExecuted'
  | 'ToolExecuted'
  | 'ToolCallBlocked'
  | 'InterceptCompleted'
  | 'ApprovalRequested'
  | 'ApprovalApproved'
  | 'ApprovalDenied';

/**
 * A single immutable entry in the event log.
 * Maps 1:1 to a row in the `events` Postgres table.
 */
export interface AgentSecurityEvent {
  /** UUIDv4 primary key */
  id: string;
  correlation_id: string;
  event_type: AgentSecurityEventType;
  /** ISO 8601 timestamp */
  ts: string;
  /** Arbitrary event data; schema varies by event_type */
  payload: Record<string, unknown>;
}

/** Generic JSON Schema object – used throughout for draft 2020-12 schemas */
export type JsonSchema = Record<string, unknown>;
