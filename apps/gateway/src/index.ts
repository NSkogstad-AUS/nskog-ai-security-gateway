import { buildServer } from './server';
import { runMigrations } from '@ai-security-gateway/eventlog';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { MockConnector } from '@ai-security-gateway/connectors';

const port = parseInt(process.env.PORT ?? '3001', 10);
const logLevel = (process.env.LOG_LEVEL ?? 'info') as string;

async function main() {
  // Register connectors (add real connectors here as they are built)
  globalRegistry.register(new MockConnector());

  // Run DB migrations before accepting traffic
  await runMigrations();

  const app = await buildServer({ logger: { level: logLevel } });

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
