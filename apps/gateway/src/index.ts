import { buildServer } from './server';
import { runMigrations } from '@ai-security-gateway/eventlog';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { MockConnector } from '@ai-security-gateway/connectors';
import { ServiceNowConnector } from '@ai-security-gateway/connectors';

const port = parseInt(process.env.PORT ?? '3001', 10);
const logLevel = (process.env.LOG_LEVEL ?? 'info') as string;

function registerServiceNowConnectorIfConfigured() {
  if (process.env.SERVICENOW_ENABLED !== 'true') return;

  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
  if (!instanceUrl) {
    throw new Error('SERVICENOW_ENABLED=true requires SERVICENOW_INSTANCE_URL');
  }

  const authMode = process.env.SERVICENOW_AUTH_MODE ?? 'basic';
  if (authMode === 'basic') {
    const username = process.env.SERVICENOW_USERNAME;
    const password = process.env.SERVICENOW_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'SERVICENOW_AUTH_MODE=basic requires SERVICENOW_USERNAME and SERVICENOW_PASSWORD',
      );
    }
    globalRegistry.register(
      new ServiceNowConnector({
        instanceUrl,
        auth: {
          mode: 'basic',
          username,
          password,
        },
      }),
    );
    return;
  }

  if (authMode === 'oauth_client_credentials') {
    const clientId = process.env.SERVICENOW_CLIENT_ID;
    const clientSecret = process.env.SERVICENOW_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        'SERVICENOW_AUTH_MODE=oauth_client_credentials requires SERVICENOW_CLIENT_ID and SERVICENOW_CLIENT_SECRET',
      );
    }
    globalRegistry.register(
      new ServiceNowConnector({
        instanceUrl,
        auth: {
          mode: 'oauth_client_credentials',
          clientId,
          clientSecret,
          tokenUrl: process.env.SERVICENOW_TOKEN_URL,
          scope: process.env.SERVICENOW_SCOPE,
        },
      }),
    );
    return;
  }

  throw new Error(
    `Unsupported SERVICENOW_AUTH_MODE '${authMode}'. Use 'basic' or 'oauth_client_credentials'.`,
  );
}

async function main() {
  // Register connectors (add real connectors here as they are built)
  globalRegistry.register(new MockConnector());
  registerServiceNowConnectorIfConfigured();

  // Run DB migrations before accepting traffic
  await runMigrations();

  const app = await buildServer({ logger: { level: logLevel } });

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
