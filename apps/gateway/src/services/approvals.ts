import { randomUUID } from 'crypto';
import { getPool } from '@ai-security-gateway/eventlog';
import type { ApprovalStatus, ToolRiskTier } from '@ai-security-gateway/shared';
import { recordEvent } from './event-pipeline';

type ApprovalEventType = 'ApprovalRequested' | 'ApprovalApproved' | 'ApprovalDenied';

export interface ApprovalRecord {
  id: string;
  correlation_id: string;
  status: ApprovalStatus;
  agent_id: string;
  tool_name: string;
  risk_tier: ToolRiskTier;
  requested_at: string;
  decided_at?: string;
}

interface CreateApprovalInput {
  correlation_id: string;
  agent_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  risk_tier: ToolRiskTier;
  requested_by?: string;
  reason?: string;
  approval_id?: string;
  emit_event?: boolean;
  event_payload?: Record<string, unknown>;
}

export async function createApprovalRequest(input: CreateApprovalInput): Promise<ApprovalRecord> {
  const requestedAt = new Date().toISOString();
  const approvalId = input.approval_id ?? randomUUID();

  if (input.emit_event !== false) {
    await recordEvent({
      id: randomUUID(),
      correlation_id: input.correlation_id,
      event_type: 'ApprovalRequested',
      ts: requestedAt,
      payload: {
        approval_id: approvalId,
        status: 'pending',
        agent_id: input.agent_id,
        tool_name: input.tool_name,
        tool_args: input.tool_args,
        risk_tier: input.risk_tier,
        requested_by: input.requested_by ?? 'gateway',
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.event_payload ?? {}),
      },
    });
  }

  return {
    id: approvalId,
    correlation_id: input.correlation_id,
    status: 'pending',
    agent_id: input.agent_id,
    tool_name: input.tool_name,
    risk_tier: input.risk_tier,
    requested_at: requestedAt,
  };
}

function statusFromEventType(eventType: ApprovalEventType): ApprovalStatus {
  if (eventType === 'ApprovalApproved') return 'approved';
  if (eventType === 'ApprovalDenied') return 'denied';
  return 'pending';
}

export async function listApprovals(status?: ApprovalStatus): Promise<ApprovalRecord[]> {
  const pool = getPool();

  const { rows } = await pool.query(
    `
      WITH approval_events AS (
        SELECT
          payload->>'approval_id' AS approval_id,
          correlation_id,
          event_type,
          ts,
          payload
        FROM events
        WHERE event_type IN ('ApprovalRequested', 'ApprovalApproved', 'ApprovalDenied')
          AND payload ? 'approval_id'
      ),
      latest AS (
        SELECT DISTINCT ON (approval_id)
          approval_id,
          correlation_id,
          event_type,
          ts,
          payload
        FROM approval_events
        ORDER BY approval_id, ts DESC
      ),
      requested AS (
        SELECT DISTINCT ON (approval_id)
          approval_id,
          correlation_id,
          ts,
          payload
        FROM approval_events
        WHERE event_type = 'ApprovalRequested'
        ORDER BY approval_id, ts ASC
      )
      SELECT
        latest.approval_id,
        latest.correlation_id,
        latest.event_type AS latest_event_type,
        latest.ts AS decided_at,
        requested.ts AS requested_at,
        requested.payload->>'agent_id' AS agent_id,
        requested.payload->>'tool_name' AS tool_name,
        requested.payload->>'risk_tier' AS risk_tier
      FROM latest
      JOIN requested ON requested.approval_id = latest.approval_id
      WHERE
        $1::text IS NULL
        OR ($1 = 'pending' AND latest.event_type = 'ApprovalRequested')
        OR ($1 = 'approved' AND latest.event_type = 'ApprovalApproved')
        OR ($1 = 'denied' AND latest.event_type = 'ApprovalDenied')
      ORDER BY requested.ts DESC
    `,
    [status ?? null],
  );

  return rows.map((row) => {
    const latestEventType = row.latest_event_type as ApprovalEventType;
    const approvalStatus = statusFromEventType(latestEventType);
    return {
      id: String(row.approval_id),
      correlation_id: String(row.correlation_id),
      status: approvalStatus,
      agent_id: String(row.agent_id),
      tool_name: String(row.tool_name),
      risk_tier: row.risk_tier as ToolRiskTier,
      requested_at: new Date(row.requested_at as string).toISOString(),
      ...(approvalStatus === 'pending'
        ? {}
        : { decided_at: new Date(row.decided_at as string).toISOString() }),
    };
  });
}

interface ApproveOrDenyInput {
  approval_id: string;
  action: 'approve' | 'deny';
  decided_by?: string;
  note?: string;
}

export async function transitionApproval(
  input: ApproveOrDenyInput,
): Promise<{ approval: ApprovalRecord; transitioned: boolean } | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT correlation_id, event_type, ts, payload
      FROM events
      WHERE payload->>'approval_id' = $1
        AND event_type IN ('ApprovalRequested', 'ApprovalApproved', 'ApprovalDenied')
      ORDER BY ts DESC
      LIMIT 1
    `,
    [input.approval_id],
  );

  if (rows.length === 0) return null;

  const latest = rows[0];
  const latestEventType = latest.event_type as ApprovalEventType;
  if (latestEventType !== 'ApprovalRequested') {
    const requested = await pool.query(
      `
        SELECT ts, payload
        FROM events
        WHERE payload->>'approval_id' = $1
          AND event_type = 'ApprovalRequested'
        ORDER BY ts ASC
        LIMIT 1
      `,
      [input.approval_id],
    );
    const requestPayload = (requested.rows[0]?.payload ?? {}) as Record<string, unknown>;
    return {
      approval: {
        id: input.approval_id,
        correlation_id: String(latest.correlation_id),
        status: statusFromEventType(latestEventType),
        agent_id: String(requestPayload.agent_id ?? ''),
        tool_name: String(requestPayload.tool_name ?? ''),
        risk_tier: (requestPayload.risk_tier as ToolRiskTier) ?? 'admin',
        requested_at: new Date((requested.rows[0]?.ts ?? latest.ts) as string).toISOString(),
        decided_at: new Date(latest.ts as string).toISOString(),
      },
      transitioned: false,
    };
  }

  const correlationId = String(latest.correlation_id);
  const requestedPayload = latest.payload as Record<string, unknown>;
  const decisionTs = new Date().toISOString();
  const nextEventType = input.action === 'approve' ? 'ApprovalApproved' : 'ApprovalDenied';
  const nextStatus: ApprovalStatus = input.action === 'approve' ? 'approved' : 'denied';

  await recordEvent({
    id: randomUUID(),
    correlation_id: correlationId,
    event_type: nextEventType,
    ts: decisionTs,
    payload: {
      approval_id: input.approval_id,
      status: nextStatus,
      decided_by: input.decided_by ?? 'reviewer',
      ...(input.note ? { note: input.note } : {}),
    },
  });

  if (input.action === 'approve') {
    await recordEvent({
      id: randomUUID(),
      correlation_id: correlationId,
      event_type: 'ToolExecuted',
      ts: new Date().toISOString(),
      payload: {
        approval_id: input.approval_id,
        tool_name: requestedPayload.tool_name,
        execution_mode: 'deferred',
      },
    });
  }

  return {
    approval: {
      id: input.approval_id,
      correlation_id: correlationId,
      status: nextStatus,
      agent_id: String(requestedPayload.agent_id ?? ''),
      tool_name: String(requestedPayload.tool_name ?? ''),
      risk_tier: (requestedPayload.risk_tier as ToolRiskTier) ?? 'admin',
      requested_at: new Date(latest.ts as string).toISOString(),
      decided_at: decisionTs,
    },
    transitioned: true,
  };
}
