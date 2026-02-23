import { getPool } from '@ai-security-gateway/eventlog';
import type { AgentSecurityEvent } from '@ai-security-gateway/shared';

interface DbEventRow {
  id: string;
  correlation_id: string;
  event_type: string;
  ts: string | Date;
  payload: unknown;
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toEvent(row: DbEventRow): AgentSecurityEvent {
  return {
    id: row.id,
    correlation_id: row.correlation_id,
    event_type: row.event_type as AgentSecurityEvent['event_type'],
    ts: new Date(row.ts).toISOString(),
    payload: parsePayload(row.payload),
  };
}

export async function listEvents(options?: {
  correlation_id?: string;
  event_type?: string;
  limit?: number;
}): Promise<AgentSecurityEvent[]> {
  const pool = getPool();
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500));

  const where: string[] = [];
  const params: unknown[] = [];

  if (options?.correlation_id) {
    params.push(options.correlation_id);
    where.push(`correlation_id = $${params.length}`);
  }
  if (options?.event_type) {
    params.push(options.event_type);
    where.push(`event_type = $${params.length}`);
  }

  params.push(limit);
  const query = `
    SELECT id, correlation_id, event_type, ts, payload
    FROM events
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ts DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query<DbEventRow>(query, params);
  return rows.map(toEvent);
}

export async function getTimeline(correlationId: string): Promise<AgentSecurityEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<DbEventRow>(
    `
      SELECT id, correlation_id, event_type, ts, payload
      FROM events
      WHERE correlation_id = $1
      ORDER BY ts ASC, id ASC
    `,
    [correlationId],
  );
  return rows.map(toEvent);
}

export async function getLatestPolicyTrace(correlationId: string): Promise<{
  correlation_id: string;
  event_id: string;
  ts: string;
  policy_engine?: string;
  policy_input_hash?: string;
  policy_trace?: Record<string, unknown>;
  decision_output?: Record<string, unknown>;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query<DbEventRow>(
    `
      SELECT id, correlation_id, event_type, ts, payload
      FROM events
      WHERE correlation_id = $1
        AND event_type = 'PolicyEvaluated'
      ORDER BY ts DESC
      LIMIT 1
    `,
    [correlationId],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const payload = parsePayload(row.payload);
  return {
    correlation_id: row.correlation_id,
    event_id: row.id,
    ts: new Date(row.ts).toISOString(),
    policy_engine:
      typeof payload.policy_engine === 'string' ? (payload.policy_engine as string) : undefined,
    policy_input_hash:
      typeof payload.policy_input_hash === 'string'
        ? (payload.policy_input_hash as string)
        : undefined,
    policy_trace:
      payload.policy_trace && typeof payload.policy_trace === 'object'
        ? (payload.policy_trace as Record<string, unknown>)
        : undefined,
    decision_output:
      payload.decision_output && typeof payload.decision_output === 'object'
        ? (payload.decision_output as Record<string, unknown>)
        : undefined,
  };
}

export async function getDeniedQueue(limit = 100): Promise<AgentSecurityEvent[]> {
  return listEvents({ event_type: 'ToolCallBlocked', limit });
}
