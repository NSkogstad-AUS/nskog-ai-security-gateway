export enum PolicyResultCode {
  Allow = 'allow',
  Deny = 'deny',
  Redact = 'redact',
}

export enum ToolRiskTierCode {
  Read = 'read',
  Write = 'write',
  Admin = 'admin',
}

export enum PolicyReasonCodeEnum {
  PolicyAllowLocalDefault = 'policy.allow.local_default',
  ToolUnknown = 'tool.unknown',
  ToolArgsInvalid = 'tool.args_invalid',
  PolicyDeny = 'policy.deny',
}

export enum EventType {
  ToolCallProposed = 'ToolCallProposed',
  PolicyEvaluated = 'PolicyEvaluated',
  ToolCallExecuted = 'ToolCallExecuted',
  ToolCallBlocked = 'ToolCallBlocked',
  InterceptCompleted = 'InterceptCompleted',
}
