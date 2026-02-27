import type { FastifyPluginAsync } from 'fastify';
import { createAgentKey, listAgentKeys, revokeAgentKey } from '../services/agent-auth';

export const agentKeysRoute: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/agent-keys
   * Create a new API key bound to an agent_id.
   * The raw key is returned ONCE in the response – store it securely.
   */
  app.post<{ Body: { agent_id: string; description?: string } }>(
    '/agent-keys',
    {
      schema: {
        body: {
          type: 'object',
          required: ['agent_id'],
          properties: {
            agent_id: { type: 'string', minLength: 1, maxLength: 128 },
            description: { type: 'string', maxLength: 256 },
          },
          additionalProperties: false,
        },
      },
      handler: async (request, reply) => {
        const { agent_id, description } = request.body;
        const { record, raw } = await createAgentKey(agent_id, description);
        // Include the raw key in this response only – never stored, never retrievable again.
        return reply.status(201).send({ ...record, key: raw });
      },
    },
  );

  /**
   * GET /v1/agent-keys
   * List all keys (active and revoked). Raw key values are never returned.
   */
  app.get('/agent-keys', {
    handler: async (_request, reply) => {
      const keys = await listAgentKeys();
      return reply.send({ items: keys });
    },
  });

  /**
   * DELETE /v1/agent-keys/:id
   * Revoke an API key. Revoked keys are rejected immediately (cache TTL < 1 min).
   */
  app.delete<{ Params: { id: string } }>(
    '/agent-keys/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      handler: async (request, reply) => {
        const revoked = await revokeAgentKey(request.params.id);
        if (!revoked) {
          return reply.status(404).send({ error: 'key not found or already revoked' });
        }
        return reply.status(204).send();
      },
    },
  );
};
