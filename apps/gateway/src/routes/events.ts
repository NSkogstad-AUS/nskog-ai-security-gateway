import type { FastifyPluginAsync } from 'fastify';
import { listApprovals } from '../services/approvals';
import { getOverviewAnalytics } from '../services/analytics';
import { getDeniedQueue, getLatestPolicyTrace, getTimeline, listEvents } from '../services/events';

export const eventsRoute: FastifyPluginAsync = async (app) => {
  app.get('/overview', async (_request, reply) => {
    const overview = await getOverviewAnalytics();
    return reply.send(overview);
  });

  app.get<{
    Querystring: {
      correlation_id?: string;
      event_type?: string;
      limit?: number;
    };
  }>(
    '/events',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            correlation_id: { type: 'string' },
            event_type: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 500 },
          },
        },
      },
      handler: async (request, reply) => {
        const events = await listEvents(request.query);
        return reply.send({ items: events });
      },
    },
  );

  app.get<{ Querystring: { limit?: number } }>(
    '/queue',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 500 },
          },
        },
      },
      handler: async (request, reply) => {
        const limit = request.query.limit ?? 100;
        const [denied, pendingApprovals] = await Promise.all([
          getDeniedQueue(limit),
          listApprovals('pending'),
        ]);
        return reply.send({
          denied,
          pending_approvals: pendingApprovals,
        });
      },
    },
  );

  app.get<{ Params: { correlation_id: string } }>(
    '/events/:correlation_id/timeline',
    {
      schema: {
        params: {
          type: 'object',
          required: ['correlation_id'],
          properties: {
            correlation_id: { type: 'string' },
          },
        },
      },
      handler: async (request, reply) => {
        const timeline = await getTimeline(request.params.correlation_id);
        return reply.send({ items: timeline });
      },
    },
  );

  app.get<{ Params: { correlation_id: string } }>(
    '/events/:correlation_id/policy-trace',
    {
      schema: {
        params: {
          type: 'object',
          required: ['correlation_id'],
          properties: {
            correlation_id: { type: 'string' },
          },
        },
      },
      handler: async (request, reply) => {
        const trace = await getLatestPolicyTrace(request.params.correlation_id);
        if (!trace) {
          return reply.status(404).send({ error: 'policy trace not found' });
        }
        return reply.send(trace);
      },
    },
  );
};
