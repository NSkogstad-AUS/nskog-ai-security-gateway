import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ToolCallIntent, PolicyDecision, AgentSecurityEventType } from '@ai-security-gateway/shared';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { validate } from '@ai-security-gateway/validation';
import { LocalPolicyEngine } from '@ai-security-gateway/policy';
import { appendEvent } from '@ai-security-gateway/eventlog';

// Inject a concrete policy engine here.
// Swap to OPAPolicyEngine once an OPA server is running.
const policyEngine = new LocalPolicyEngine();

export const interceptRoute: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/intercept
   *
   * Accepts a ToolCallIntent, validates tool_args, runs policy evaluation,
   * appends two events to the log, and returns the PolicyDecision.
   * Tool execution is intentionally out of scope for this scaffold.
   */
  app.post<{ Body: Omit<ToolCallIntent, 'correlation_id'> & { correlation_id?: string } }>(
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
              result: { type: 'string', enum: ['allow', 'deny', 'redact'] },
              risk_tier: { type: 'string', enum: ['read', 'write', 'admin'] },
              reason: { type: 'string' },
              reason_codes: { type: 'array', items: { type: 'string' } },
              redacted_args: { type: 'object' },
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
          await appendEvent({
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
        const decision = await policyEngine.decide(intent);
        await emitTimelineEvent('PolicyEvaluated', 'policy.evaluated', { decision });

        // 5) Denied decisions emit a blocked event.
        if (decision.result === 'deny') {
          await emitTimelineEvent('ToolCallBlocked', 'policy.blocked', { decision });
          await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
            outcome: decision.result,
          });
          return reply.status(403).send(decision);
        }

        // 6) Close the loop with a terminal event so the timeline is complete.
        await emitTimelineEvent('InterceptCompleted', 'intercept.completed', {
          outcome: decision.result,
        });

        // 7) Return decision (allow or redact); tool execution is still out of scope.
        return reply.send(decision);
      },
    },
  );
};
