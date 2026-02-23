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
  PolicyApprovalRequired = 'policy.approval_required',
}

export enum EventType {
  ToolCallProposed = 'ToolCallProposed',
  PolicyEvaluated = 'PolicyEvaluated',
  ToolCallExecuted = 'ToolCallExecuted',
  ToolExecuted = 'ToolExecuted',
  ToolCallBlocked = 'ToolCallBlocked',
  InterceptCompleted = 'InterceptCompleted',
  ApprovalRequested = 'ApprovalRequested',
  ApprovalApproved = 'ApprovalApproved',
  ApprovalDenied = 'ApprovalDenied',
}
