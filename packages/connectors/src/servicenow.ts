import type { ToolConnector } from './registry';

type ServiceNowAuthConfig =
  | {
      mode: 'basic';
      username: string;
      password: string;
    }
  | {
      mode: 'oauth_client_credentials';
      clientId: string;
      clientSecret: string;
      tokenUrl?: string;
      scope?: string;
    };

export interface ServiceNowConnectorOptions {
  instanceUrl: string;
  auth: ServiceNowAuthConfig;
  timeoutMs?: number;
}

interface OAuthToken {
  accessToken: string;
  expiresAtMs: number;
}

interface CreateIncidentArgs {
  short_description: string;
  description?: string;
  category?: string;
  subcategory?: string;
  impact?: 1 | 2 | 3;
  urgency?: 1 | 2 | 3;
  assignment_group?: string;
  caller_id?: string;
  cmdb_ci?: string;
}

/**
 * ServiceNow connector for creating incidents through the Table API.
 *
 * Uses caller-provided credentials and should be configured with a dedicated
 * least-privilege integration account/application in ServiceNow.
 */
export class ServiceNowConnector implements ToolConnector {
  readonly name = 'sn_create_incident';
  readonly description = 'Create a ServiceNow incident via Table API';
  readonly risk_tier = 'write' as const;

  readonly argsSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'tool-args/sn_create_incident',
    type: 'object',
    required: ['short_description'],
    properties: {
      short_description: { type: 'string', minLength: 1, maxLength: 160 },
      description: { type: 'string', maxLength: 4000 },
      category: { type: 'string', maxLength: 40 },
      subcategory: { type: 'string', maxLength: 40 },
      impact: { type: 'integer', enum: [1, 2, 3] },
      urgency: { type: 'integer', enum: [1, 2, 3] },
      assignment_group: { type: 'string', maxLength: 64 },
      caller_id: { type: 'string', maxLength: 64 },
      cmdb_ci: { type: 'string', maxLength: 64 },
    },
    additionalProperties: false,
  };

  private readonly instanceUrl: string;
  private readonly auth: ServiceNowAuthConfig;
  private readonly timeoutMs: number;
  private oauthToken: OAuthToken | null = null;

  constructor(options: ServiceNowConnectorOptions) {
    this.instanceUrl = options.instanceUrl.replace(/\/+$/, '');
    this.auth = options.auth;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const input = args as unknown as CreateIncidentArgs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.instanceUrl}/api/now/table/incident`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: await this.getAuthorizationHeader(),
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          `ServiceNow incident create failed with ${response.status}: ${JSON.stringify(body)}`,
        );
      }

      const result = (body as { result?: Record<string, unknown> }).result ?? {};
      return {
        sys_id: result.sys_id,
        number: result.number,
        short_description: result.short_description,
        state: result.state,
        link: result.link,
        raw: result,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAuthorizationHeader(): Promise<string> {
    if (this.auth.mode === 'basic') {
      const value = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
      return `Basic ${value}`;
    }

    const token = await this.getOAuthToken();
    return `Bearer ${token}`;
  }

  private async getOAuthToken(): Promise<string> {
    if (this.auth.mode !== 'oauth_client_credentials') {
      throw new Error('OAuth token requested while connector is configured for basic auth');
    }

    const auth = this.auth;
    const now = Date.now();
    if (this.oauthToken && this.oauthToken.expiresAtMs - 30_000 > now) {
      return this.oauthToken.accessToken;
    }

    const tokenUrl = auth.tokenUrl ?? `${this.instanceUrl}/oauth_token.do`;
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    if (auth.scope) {
      params.set('scope', auth.scope);
    }

    const basic = Buffer.from(`${auth.clientId}:${auth.clientSecret}`).toString('base64');
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new Error(
        `ServiceNow OAuth token request failed with ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    const ttlSec = typeof body.expires_in === 'number' ? body.expires_in : 300;
    this.oauthToken = {
      accessToken: body.access_token,
      expiresAtMs: Date.now() + ttlSec * 1000,
    };
    return body.access_token;
  }
}
