import { getPool } from '@ai-security-gateway/eventlog';
import { globalRegistry } from '@ai-security-gateway/connectors';
import { getPolicyEngine } from './policy';

interface CountRow {
  event_type: string;
  count: string;
}

interface BucketRow {
  bucket: string | Date;
  count: string;
}

interface PendingRow {
  pending_count: string;
}

export async function getOverviewAnalytics(): Promise<{
  generated_at: string;
  policy_backend: string;
  connectors: Array<{ name: string; risk_tier: string; description: string }>;
  counters: {
    total_events: number;
    blocked_events: number;
    pending_approvals: number;
    approvals_approved: number;
  };
  event_type_counts: Array<{ event_type: string; count: number }>;
  events_per_hour_24h: Array<{ bucket: string; count: number }>;
}> {
  const pool = getPool();

  const [totalsRes, typeRes, hourlyRes, pendingRes] = await Promise.all([
    pool.query<CountRow>(
      `
        SELECT event_type, COUNT(*)::text AS count
        FROM events
        GROUP BY event_type
      `,
    ),
    pool.query<CountRow>(
      `
        SELECT event_type, COUNT(*)::text AS count
        FROM events
        WHERE ts >= NOW() - INTERVAL '24 hours'
        GROUP BY event_type
        ORDER BY COUNT(*) DESC
      `,
    ),
    pool.query<BucketRow>(
      `
        SELECT
          date_trunc('hour', ts) AS bucket,
          COUNT(*)::text AS count
        FROM events
        WHERE ts >= NOW() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', ts)
        ORDER BY bucket ASC
      `,
    ),
    pool.query<PendingRow>(
      `
        WITH approval_events AS (
          SELECT payload->>'approval_id' AS approval_id, event_type, ts
          FROM events
          WHERE event_type IN ('ApprovalRequested', 'ApprovalApproved', 'ApprovalDenied')
            AND payload ? 'approval_id'
        ),
        latest AS (
          SELECT DISTINCT ON (approval_id)
            approval_id,
            event_type
          FROM approval_events
          ORDER BY approval_id, ts DESC
        )
        SELECT COUNT(*)::text AS pending_count
        FROM latest
        WHERE event_type = 'ApprovalRequested'
      `,
    ),
  ]);

  const allCounts = new Map<string, number>();
  for (const row of totalsRes.rows) {
    allCounts.set(row.event_type, Number(row.count));
  }

  const totalEvents = [...allCounts.values()].reduce((acc, n) => acc + n, 0);
  const blockedEvents = (allCounts.get('ToolCallBlocked') ?? 0) + (allCounts.get('ApprovalDenied') ?? 0);
  const approvalsApproved = allCounts.get('ApprovalApproved') ?? 0;
  const pendingApprovals = Number(pendingRes.rows[0]?.pending_count ?? 0);

  return {
    generated_at: new Date().toISOString(),
    policy_backend: getPolicyEngine().name,
    connectors: globalRegistry.list().map((c) => ({
      name: c.name,
      risk_tier: c.risk_tier,
      description: c.description,
    })),
    counters: {
      total_events: totalEvents,
      blocked_events: blockedEvents,
      pending_approvals: pendingApprovals,
      approvals_approved: approvalsApproved,
    },
    event_type_counts: typeRes.rows.map((r) => ({
      event_type: r.event_type,
      count: Number(r.count),
    })),
    events_per_hour_24h: hourlyRes.rows.map((r) => ({
      bucket: new Date(r.bucket).toISOString(),
      count: Number(r.count),
    })),
  };
}
