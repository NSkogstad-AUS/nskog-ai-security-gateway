/**
 * Canonical JSON Schemas (draft 2020-12) for shared types.
 * Import these into the validation package to compile with Ajv2020.
 */

export const ToolCallIntentSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'ToolCallIntent',
  type: 'object',
  required: ['correlation_id', 'agent_id', 'tool_name', 'risk_tier', 'tool_args'],
  properties: {
    correlation_id: { type: 'string', minLength: 1 },
    agent_id: { type: 'string', minLength: 1 },
    tool_name: { type: 'string', minLength: 1 },
    risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
    tool_args: { type: 'object' },
    metadata: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const PolicyDecisionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'PolicyDecision',
  type: 'object',
  required: ['correlation_id', 'result', 'risk_tier', 'reason_codes', 'evaluated_at'],
  properties: {
    correlation_id: { type: 'string' },
    result: { type: 'string', enum: ['allow', 'deny', 'redact'] },
    risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
    reason: { type: 'string' },
    reason_codes: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'policy.allow.local_default',
          'tool.unknown',
          'tool.args_invalid',
          'policy.deny',
          'policy.approval_required',
        ],
      },
      minItems: 1,
    },
    approval_required: { type: 'boolean' },
    approval: {
      type: 'object',
      required: ['id', 'status'],
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'denied'] },
      },
      additionalProperties: false,
    },
    redacted_args: { type: 'object' },
    evaluated_at: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
} as const;
