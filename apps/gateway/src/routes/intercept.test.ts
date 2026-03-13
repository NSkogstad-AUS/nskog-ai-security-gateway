import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server';
import { globalRegistry, MockConnector, type ToolConnector } from '@ai-security-gateway/connectors';
import * as eventPipeline from '../services/event-pipeline';
import * as policyService from '../services/policy';
import * as approvalsService from '../services/approvals';
import * as agentAuthService from '../services/agent-auth';
import type { AgentSecurityEvent, PolicyDecision } from '@ai-security-gateway/shared';

const originalRecordEvent = eventPipeline.recordEvent;
const originalEvaluatePolicy = policyService.evaluatePolicy;
const originalCreateApprovalRequest = approvalsService.createApprovalRequest;
const originalResolveAgentId = agentAuthService.resolveAgentId;
const originalAuthEnabled = process.env.AGENT_AUTH_ENABLED;
const mutableEventPipeline = eventPipeline as {
  recordEvent: typeof eventPipeline.recordEvent;
};
const mutablePolicyService = policyService as {
  evaluatePolicy: typeof policyService.evaluatePolicy;
};
const mutableApprovalsService = approvalsService as {
  createApprovalRequest: typeof approvalsService.createApprovalRequest;
};
const mutableAgentAuthService = agentAuthService as {
  resolveAgentId: typeof agentAuthService.resolveAgentId;
};

function ensureRegistered(connector: ToolConnector) {
  if (!globalRegistry.has(connector.name)) {
    globalRegistry.register(connector);
  }
}

ensureRegistered(new MockConnector());
ensureRegistered({
  name: 'admin_test_tool',
  description: 'Admin-only connector used by tests',
  risk_tier: 'admin',
  argsSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'tool-args/admin_test_tool',
    type: 'object',
    required: ['resource_id'],
    properties: {
      resource_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>) {
    return {
      ok: true,
      resource_id: args.resource_id,
    };
  },
});

afterEach(() => {
  mutableEventPipeline.recordEvent = originalRecordEvent;
  mutablePolicyService.evaluatePolicy = originalEvaluatePolicy;
  mutableApprovalsService.createApprovalRequest = originalCreateApprovalRequest;
  mutableAgentAuthService.resolveAgentId = originalResolveAgentId;

  if (originalAuthEnabled === undefined) {
    delete process.env.AGENT_AUTH_ENABLED;
  } else {
    process.env.AGENT_AUTH_ENABLED = originalAuthEnabled;
  }
});

function allowDecision(
  overrides: Partial<PolicyDecision> = {},
): {
  decision: PolicyDecision;
  engine: string;
  input_hash: string;
  trace?: Record<string, unknown>;
} {
  return {
    decision: {
      correlation_id: 'corr-test',
      result: 'allow',
      risk_tier: 'read',
      reason: 'test allow',
      reason_codes: ['policy.allow.local_default'],
      evaluated_at: '2026-03-13T00:00:00.000Z',
      ...overrides,
    },
    engine: 'test-policy',
    input_hash: 'hash-test',
    trace: { rule: 'test.allow' },
  };
}

test('POST /v1/intercept returns 200 and tool result for valid requests', async () => {
  const events: AgentSecurityEvent[] = [];
  mutableEventPipeline.recordEvent = async (event: AgentSecurityEvent) => {
    events.push(event);
  };
  mutablePolicyService.evaluatePolicy = async () => allowDecision();

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intercept',
      payload: {
        agent_id: 'agent-001',
        tool_name: 'web_search',
        tool_args: { query: 'AI security' },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.result, 'allow');
    assert.equal(body.tool_result.total, 1);
    assert.equal(events.at(-1)?.event_type, 'InterceptCompleted');
  } finally {
    await app.close();
  }
});

test('POST /v1/intercept returns 403 for unknown tools', async () => {
  const events: AgentSecurityEvent[] = [];
  mutableEventPipeline.recordEvent = async (event: AgentSecurityEvent) => {
    events.push(event);
  };

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intercept',
      payload: {
        agent_id: 'agent-001',
        tool_name: 'not_registered',
        tool_args: {},
      },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json();
    assert.equal(body.reason_codes[0], 'tool.unknown');
    assert.equal(events.at(-1)?.event_type, 'InterceptCompleted');
  } finally {
    await app.close();
  }
});

test('POST /v1/intercept returns 403 when tool args fail validation', async () => {
  const events: AgentSecurityEvent[] = [];
  mutableEventPipeline.recordEvent = async (event: AgentSecurityEvent) => {
    events.push(event);
  };

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intercept',
      payload: {
        agent_id: 'agent-001',
        tool_name: 'web_search',
        tool_args: {},
      },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json();
    assert.equal(body.reason_codes[0], 'tool.args_invalid');
    assert.equal(events.at(-2)?.event_type, 'ToolCallBlocked');
  } finally {
    await app.close();
  }
});

test('POST /v1/intercept returns 202 when policy requires approval', async () => {
  const events: AgentSecurityEvent[] = [];
  mutableEventPipeline.recordEvent = async (event: AgentSecurityEvent) => {
    events.push(event);
  };
  mutablePolicyService.evaluatePolicy = async () =>
    allowDecision({
      risk_tier: 'admin',
      approval_required: true,
      reason: 'approval required',
      reason_codes: ['policy.approval_required'],
    });
  mutableApprovalsService.createApprovalRequest = async () => ({
    id: 'approval-123',
    correlation_id: 'corr-test',
    status: 'pending',
    agent_id: 'agent-001',
    tool_name: 'admin_test_tool',
    risk_tier: 'admin',
    requested_at: '2026-03-13T00:00:00.000Z',
  });

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intercept',
      payload: {
        agent_id: 'agent-001',
        tool_name: 'admin_test_tool',
        tool_args: { resource_id: 'res-001' },
      },
    });

    assert.equal(response.statusCode, 202);
    const body = response.json();
    assert.equal(body.approval.id, 'approval-123');
    assert.equal(body.approval_required, true);
    assert.equal(events.at(-2)?.event_type, 'ApprovalRequested');
  } finally {
    await app.close();
  }
  });

test('POST /v1/intercept returns 401 when agent auth is enabled and header is missing', async () => {
  process.env.AGENT_AUTH_ENABLED = 'true';
  mutableEventPipeline.recordEvent = async () => {};
  mutableAgentAuthService.resolveAgentId = async () => 'agent-from-key';

  const app = await buildServer({ logger: false });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intercept',
      payload: {
        tool_name: 'web_search',
        tool_args: { query: 'AI security' },
      },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, 'X-Agent-Key header is required');
  } finally {
    await app.close();
  }
});
