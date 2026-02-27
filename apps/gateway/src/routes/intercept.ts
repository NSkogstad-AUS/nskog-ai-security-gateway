import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ToolCallIntent, PolicyDecision, AgentSecurityEventType } from '@ai-security-gateway/shared';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { validate } from '@ai-security-gateway/validation';
import { createApprovalRequest } from '../services/approvals';
import { recordEvent } from '../services/event-pipeline';
import { evaluatePolicy } from '../services/policy';

export const interceptRoute: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/intercept
   *
   * Accepts a ToolCallIntent, validates tool_args, runs policy evaluation,
   * executes the tool via its connector, and returns the result.
   *
   * Response codes:
   *   200 – tool executed successfully (allow or redact path)
   *   202 – approval required; tool execution is paused pending human review
   *   403 – denied by policy or failed validation
   *   502 – connector returned an error during execution
   */
  app.post<{ Body: Omit<ToolCallIntent, 'correlation_id' | 'risk_tier'> & { correlation_id?: string } }>(
    '/intercept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['agent_id', 'tool_name', 'tool_args'],
          properties: {
            correlation_id: { type: 'string' },
            agent_id: { type: 'string' },
            tool_name: { type: 'string' },
            tool_args: { type: 'object' },
            metadata: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              correlation_id: { type: 'string' },
              result: { type: 'string', enum: ['allow', 'redact'] },
              risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
              reason: { type: 'string' },
              reason_codes: { type: 'array', items: { type: 'string' } },
              approval_required: { type: 'boolean' },
              redacted_args: { type: 'object' },
              evaluated_at: { type: 'string' },
              // Connector result – schema is intentionally open; shape varies by tool.
              tool_result: {},
              executed_at: { type: 'string' },
            },
          },
          502: {
            type: 'object',
            properties: {
              correlation_id: { type: 'string' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          202: {
            type: 'object',
            properties: {
              correlation_id: { type: 'string' },
              result: { type: 'string', enum: ['allow'] },
              risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
              reason: { type: 'string' },
              reason_codes: { type: 'array', items: { type: 'string' } },
              approval_required: { type: 'boolean', enum: [true] },
              approval: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string', enum: ['pending'] },
                },
              },
              evaluated_at: { type: 'string' },
            },
          },
          403: {
            type: 'object',
            properties: {
              correlation_id: { type: 'string' },
              result: { type: 'string', enum: ['deny'] },
              risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
              reason: { type: 'string' },
              reason_codes: { type: 'array', items: { type: 'string' } },
              evaluated_at: { type: 'string' },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const body = request.body;
        const correlationId = body.correlation_id ?? randomUUID();
        const connector = globalRegistry.get(body.tool_name);
        const riskTier = connector?.risk_tier ?? 'admin';
        let timelineStep = 0;

        const emitTimelineEvent = async (
          eventType: AgentSecurityEventType,
          stage: string,
          payload: Record<string, unknown>,
        ) => {
          timelineStep += 1;
          await recordEvent({
            id: randomUUID(),
            correlation_id: correlationId,
            event_type: eventType,
            ts: new Date().toISOString(),
            payload: {
              timeline: {
                step: timelineStep,
                stage,
              },
              ...payload,
            },
          });
        };

        const intent: ToolCallIntent = {
          correlation_id: correlationId,
          agent_id: body.agent_id,
          tool_name: body.tool_name,
          risk_tier: riskTier,
          tool_args: body.tool_args,
          ...(body.metadata && { metadata: body.metadata }),
        };

        // 1) Record all attempted tool calls before any deny/allow branch.
        await emitTimelineEvent('ToolCallProposed', 'intercept.received', { intent });

        // 2) Unknown tools are denied fail-closed and logged.
        if (!connector) {
          const decision: PolicyDecision = {
            correlation_id: correlationId,
            result: 'deny',
            risk_tier: riskTier,
            reason: `tool '${intent.tool_name}' is not registered`,
            reason_codes: ['tool.unknown'],
            evaluated_at: new Date().toISOString(),
          };

          await emitTimelineEvent('PolicyEvaluated', 'policy.gateway_deny', { decision });
          await emitTimelineEvent('ToolCallBlocked', 'gateway.blocked', {
            blocked_by: 'registry',
            decision,
          });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: decision.result,
          });
          return reply.status(403).send(decision);
        }

        // 3) Validate args against the registered tool schema.
        const schemaId =
          typeof connector.argsSchema.$id === 'string'
            ? (connector.argsSchema.$id as string)
            : `tool-args/${connector.name}`;
        const validationErrors = validate(connector.argsSchema, intent.tool_args, schemaId);
        if (validationErrors !== null) {
          const decision: PolicyDecision = {
            correlation_id: correlationId,
            result: 'deny',
            risk_tier: riskTier,
            reason: 'tool_args validation failed',
            reason_codes: ['tool.args_invalid'],
            evaluated_at: new Date().toISOString(),
          };

          await emitTimelineEvent('PolicyEvaluated', 'policy.gateway_deny', {
            decision,
            validation_errors: validationErrors,
          });
          await emitTimelineEvent('ToolCallBlocked', 'gateway.blocked', {
            blocked_by: 'validation',
            validation_errors: validationErrors,
            decision,
          });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: decision.result,
          });
          return reply.status(403).send(decision);
        }

        // 4) Run policy decision.
        const policyEval = await evaluatePolicy(intent);
        const decision = policyEval.decision;
        await emitTimelineEvent('PolicyEvaluated', 'policy.evaluated', {
          policy_engine: policyEval.engine,
          policy_input_hash: policyEval.input_hash,
          policy_trace: policyEval.trace,
          decision_output: decision,
          decision,
        });

        // 5) Denied decisions emit a blocked event.
        if (decision.result === 'deny') {
          await emitTimelineEvent('ToolCallBlocked', 'policy.blocked', { decision });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: decision.result,
          });
          return reply.status(403).send(decision);
        }

        // 6) Approval-required path: create approval and return pending.
        if (decision.approval_required) {
          const approval = await createApprovalRequest({
            correlation_id: correlationId,
            agent_id: intent.agent_id,
            tool_name: intent.tool_name,
            tool_args: intent.tool_args,
            risk_tier: intent.risk_tier,
            requested_by: 'intercept',
            reason: decision.reason,
            emit_event: false,
          });

          const pendingDecision: PolicyDecision = {
            ...decision,
            approval_required: true,
            approval: {
              id: approval.id,
              status: approval.status,
            },
          };

          await emitTimelineEvent('ApprovalRequested', 'approval.requested', {
            approval_id: approval.id,
            status: approval.status,
            tool_name: approval.tool_name,
            risk_tier: approval.risk_tier,
            decision: pendingDecision,
          });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: 'approval_pending',
            approval_id: approval.id,
          });
          return reply.status(202).send(pendingDecision);
        }

        // 7) Execute the tool. Redact path uses sanitised args from the policy engine.
        const argsToExecute =
          decision.result === 'redact' && decision.redacted_args
            ? decision.redacted_args
            : intent.tool_args;

        let toolResult: unknown;
        try {
          toolResult = await connector.execute(argsToExecute);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await emitTimelineEvent('ToolExecuted', 'tool.error', {
            tool_name: intent.tool_name,
            status: 'error',
            error: message,
          });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: 'error',
          });
          return reply.status(502).send({
            correlation_id: correlationId,
            error: 'connector_error',
            message,
          });
        }

        await emitTimelineEvent('ToolExecuted', 'tool.executed', {
          tool_name: intent.tool_name,
          status: 'success',
          args_redacted: decision.result === 'redact',
        });

        // 8) Close the loop and return the tool result alongside the decision.
        await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
          outcome: decision.result,
        });

        return reply.send({
          ...decision,
          tool_result: toolResult,
          executed_at: new Date().toISOString(),
        });
      },
    },
  );
};
