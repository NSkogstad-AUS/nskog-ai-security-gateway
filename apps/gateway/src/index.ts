import { buildServer } from './server';
import { runMigrations } from '@ai-security-gateway/eventlog';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { MockConnector } from '@ai-security-gateway/connectors';
import { ServiceNowConnector } from '@ai-security-gateway/connectors';
import { createGitHubConnectors } from '@ai-security-gateway/connectors';
import { SplunkHECExporter, globalEventExportDispatcher } from '@ai-security-gateway/exporters';
import { configurePolicyEngineFromEnv } from './services/policy';
import { loadEnvFile } from './env';

loadEnvFile('.env');

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

function registerGitHubConnectorsIfConfigured() {
  if (process.env.GITHUB_ENABLED !== 'true') return;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_ENABLED=true requires GITHUB_TOKEN');
  }

  const connectors = createGitHubConnectors({
    token,
    apiBaseUrl: process.env.GITHUB_API_BASE_URL,
    timeoutMs: process.env.GITHUB_TIMEOUT_MS
      ? parseInt(process.env.GITHUB_TIMEOUT_MS, 10)
      : undefined,
  });

  for (const connector of connectors) {
    globalRegistry.register(connector);
  }
}

function registerSplunkExporterIfConfigured() {
  if (process.env.SPLUNK_HEC_ENABLED !== 'true') return;

  const endpoint = process.env.SPLUNK_HEC_URL;
  const token = process.env.SPLUNK_HEC_TOKEN;
  if (!endpoint || !token) {
    throw new Error('SPLUNK_HEC_ENABLED=true requires SPLUNK_HEC_URL and SPLUNK_HEC_TOKEN');
  }

  globalEventExportDispatcher.register(
    new SplunkHECExporter({
      endpoint,
      token,
      index: process.env.SPLUNK_HEC_INDEX,
      source: process.env.SPLUNK_HEC_SOURCE ?? 'ai-security-gateway',
      sourcetype: process.env.SPLUNK_HEC_SOURCETYPE ?? 'agent_security_event',
      host: process.env.SPLUNK_HEC_HOST,
      maxRetries: parseInt(process.env.SPLUNK_HEC_MAX_RETRIES ?? '3', 10),
      retryBaseDelayMs: parseInt(process.env.SPLUNK_HEC_RETRY_BASE_DELAY_MS ?? '300', 10),
      timeoutMs: parseInt(process.env.SPLUNK_HEC_TIMEOUT_MS ?? '5000', 10),
    }),
  );
}

async function main() {
  // Register connectors (add real connectors here as they are built)
  globalRegistry.register(new MockConnector());
  registerServiceNowConnectorIfConfigured();
  registerGitHubConnectorsIfConfigured();
  registerSplunkExporterIfConfigured();
  configurePolicyEngineFromEnv();

  // Run DB migrations before accepting traffic
  await runMigrations();

  const app = await buildServer({ logger: { level: logLevel } });

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
