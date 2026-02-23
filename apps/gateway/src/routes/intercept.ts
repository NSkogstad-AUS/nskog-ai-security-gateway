import { randomUUID } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ToolCallIntent } from '@ai-security-gateway/shared';
import { validateToolArgs } from '@ai-security-gateway/validation';
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
              reason: { type: 'string' },
              redacted_args: { type: 'object' },
              evaluated_at: { type: 'string' },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const body = request.body;
        const correlationId = body.correlation_id ?? randomUUID();

        const intent: ToolCallIntent = {
          correlation_id: correlationId,
          agent_id: body.agent_id,
          tool_name: body.tool_name,
          tool_args: body.tool_args,
          ...(body.metadata && { metadata: body.metadata }),
        };

        // 1. Validate tool_args against the tool's JSON Schema (Ajv draft 2020-12)
        const validationErrors = validateToolArgs(intent.tool_name, intent.tool_args);
        if (validationErrors !== null) {
          return reply.status(400).send({
            error: 'tool_args validation failed',
            details: validationErrors,
          });
        }

        // 2. Record the proposed tool call (before policy, so all attempts are captured)
        await appendEvent({
          id: randomUUID(),
          correlation_id: correlationId,
          event_type: 'ToolCallProposed',
          ts: new Date().toISOString(),
          payload: { intent },
        });

        // 3. Run policy decision
        const decision = await policyEngine.decide(intent);

        // 4. Record the policy outcome
        await appendEvent({
          id: randomUUID(),
          correlation_id: correlationId,
          event_type: 'PolicyEvaluated',
          ts: new Date().toISOString(),
          payload: { decision },
        });

        // 5. Return 403 if denied
        if (decision.result === 'deny') {
          return reply.status(403).send(decision);
        }

        // 6. Return decision (allow or redact) – execution is a future concern
        return reply.send(decision);
      },
    },
  );
};
