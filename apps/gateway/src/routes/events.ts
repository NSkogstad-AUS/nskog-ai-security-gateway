import type { FastifyPluginAsync } from 'fastify';
import { listApprovals } from '../services/approvals';
import { getOverviewAnalytics } from '../services/analytics';
import {
  getDeniedQueue,
  getLatestPolicyTrace,
  getTimeline,
  listEvents,
  listEventsAfterCursor,
} from '../services/events';

export const eventsRoute: FastifyPluginAsync = async (app) => {
  app.get('/overview', async (_request, reply) => {
    const overview = await getOverviewAnalytics();
    return reply.send(overview);
  });

  app.get<{
    Querystring: {
      correlation_id?: string;
      event_types?: string; // comma-separated list
      since?: string; // ISO timestamp
      poll_ms?: number;
    };
  }>(
    '/events/stream',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            correlation_id: { type: 'string' },
            event_types: { type: 'string' },
            since: { type: 'string' },
            poll_ms: { type: 'integer', minimum: 200, maximum: 5000 },
          },
        },
      },
      handler: async (request, reply) => {
        // Prepare SSE headers and take over the socket.
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Basic CORS so the console (localhost:3000) can open an EventSource to the gateway (3001).
          'Access-Control-Allow-Origin': '*',
          // Helps with buffering through some proxies (e.g. nginx).
          'X-Accel-Buffering': 'no',
        });
        reply.hijack();

        const pollMs = request.query.poll_ms ?? 750;

        const parseEventTypes = (raw?: string): string[] | undefined => {
          if (!raw) return undefined;
          const parts = raw
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          return parts.length > 0 ? parts : undefined;
        };

        const parseCursor = (raw?: string): { afterTs: string; afterId: string } | null => {
          if (!raw) return null;
          const idx = raw.indexOf('|');
          if (idx <= 0) return null;
          const afterTs = raw.slice(0, idx);
          const afterId = raw.slice(idx + 1);
          if (!afterTs || !afterId) return null;
          // Validate that the timestamp parses and the id looks like a uuid.
          const tsMs = Date.parse(afterTs);
          if (Number.isNaN(tsMs)) return null;
          if (!/^[0-9a-fA-F-]{36}$/.test(afterId)) return null;
          return { afterTs: new Date(tsMs).toISOString(), afterId };
        };

        const lastEventIdHeader =
          typeof request.headers['last-event-id'] === 'string'
            ? request.headers['last-event-id']
            : undefined;

        const headerCursor = parseCursor(lastEventIdHeader);

        const nowIso = new Date().toISOString();
        const sinceTs =
          typeof request.query.since === 'string' && !Number.isNaN(Date.parse(request.query.since))
            ? new Date(Date.parse(request.query.since)).toISOString()
            : undefined;

        let afterTs = headerCursor?.afterTs ?? sinceTs ?? nowIso;
        let afterId =
          headerCursor?.afterId ?? '00000000-0000-0000-0000-000000000000';

        const correlationId = request.query.correlation_id;
        const eventTypes = parseEventTypes(request.query.event_types);

        const writeSse = (payload: { id: string; event?: string; data?: unknown; comment?: string }) => {
          if (payload.comment) {
            reply.raw.write(`: ${payload.comment}\n\n`);
            return;
          }
          reply.raw.write(`id: ${payload.id}\n`);
          reply.raw.write(`event: ${payload.event ?? 'agent_event'}\n`);
          reply.raw.write(`data: ${JSON.stringify(payload.data ?? {})}\n\n`);
        };

        // Initial hello so clients can show "connected" immediately.
        writeSse({
          id: `${afterTs}|${afterId}`,
          event: 'hello',
          data: { connected_at: nowIso },
        });

        let closed = false;
        let pollTimer: NodeJS.Timeout | null = null;
        let keepAliveTimer: NodeJS.Timeout | null = null;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (pollTimer) clearInterval(pollTimer);
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          try {
            reply.raw.end();
          } catch {
            // ignore
          }
        };

        request.raw.on('close', cleanup);
        request.raw.on('error', cleanup);

        keepAliveTimer = setInterval(() => {
          if (closed) return;
          writeSse({ id: `${afterTs}|${afterId}`, comment: 'keepalive' });
        }, 15000);

        let pollInFlight = false;
        pollTimer = setInterval(async () => {
          if (closed) return;
          if (pollInFlight) return;
          pollInFlight = true;
          try {
            const events = await listEventsAfterCursor({
              after_ts: afterTs,
              after_id: afterId,
              correlation_id: correlationId,
              event_types: eventTypes,
              limit: 250,
            });

            for (const ev of events) {
              afterTs = ev.ts;
              afterId = ev.id;
              writeSse({
                id: `${afterTs}|${afterId}`,
                event: 'agent_event',
                data: ev,
              });
            }
          } catch (err) {
            // Surface transient DB errors to the client, but keep the stream alive.
            writeSse({
              id: `${afterTs}|${afterId}`,
              event: 'error',
              data: { message: (err as Error)?.message ?? 'stream error' },
            });
          } finally {
            pollInFlight = false;
          }
        }, pollMs);
      },
    },
  );

  app.get<{
    Querystring: {
      correlation_id?: string;
      event_type?: string;
      tool_name?: string;
      agent_id?: string;
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
            tool_name: { type: 'string' },
            agent_id: { type: 'string' },
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
