import Fastify, { type FastifyServerOptions } from 'fastify';
import { interceptRoute } from './routes/intercept';
import { approvalsRoute } from './routes/approvals';
import { eventsRoute } from './routes/events';
import { agentKeysRoute } from './routes/agent-keys';

export async function buildServer(opts?: FastifyServerOptions) {
  const app = Fastify(opts ?? { logger: true });

  // Health check – used by docker-compose healthcheck and load balancers
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // v1 API routes
  await app.register(interceptRoute, { prefix: '/v1' });
  await app.register(approvalsRoute, { prefix: '/v1' });
  await app.register(eventsRoute, { prefix: '/v1' });
  await app.register(agentKeysRoute, { prefix: '/v1' });

  return app;
}
