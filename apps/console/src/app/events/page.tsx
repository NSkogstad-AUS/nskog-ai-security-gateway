type EventItem = {
  id: string;
  correlation_id: string;
  event_type: string;
  ts: string;
  payload: Record<string, unknown>;
};

type PendingApproval = {
  id: string;
  correlation_id: string;
  status: string;
  agent_id: string;
  tool_name: string;
  risk_tier: string;
  requested_at: string;
};

type QueueResponse = {
  denied: EventItem[];
  pending_approvals: PendingApproval[];
};

type TimelineResponse = { items: EventItem[] };

type PolicyTraceResponse = {
  correlation_id: string;
  event_id: string;
  ts: string;
  policy_engine?: string;
  policy_input_hash?: string;
  policy_trace?: Record<string, unknown>;
  decision_output?: Record<string, unknown>;
};

const gatewayBaseUrl = process.env.GATEWAY_URL ?? 'http://localhost:3001';

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${gatewayBaseUrl}${path}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmt(ts?: string): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: { correlation_id?: string };
}) {
  const correlationId = searchParams?.correlation_id?.trim() ?? '';
  const queue = await fetchJson<QueueResponse>('/v1/queue?limit=50');
  const timeline = correlationId
    ? await fetchJson<TimelineResponse>(
        `/v1/events/${encodeURIComponent(correlationId)}/timeline`,
      )
    : null;
  const policyTrace = correlationId
    ? await fetchJson<PolicyTraceResponse>(
        `/v1/events/${encodeURIComponent(correlationId)}/policy-trace`,
      )
    : null;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Security Operations Console</h1>
      <p style={{ color: '#555' }}>
        Queue and trace view for denied requests, pending approvals, and per-correlation decisions.
      </p>

      <section
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Correlation Timeline Viewer</h3>
        <form method="get" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input
            name="correlation_id"
            defaultValue={correlationId}
            placeholder="Enter correlation_id"
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #ced4da',
              borderRadius: '4px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 0.9rem',
              border: '1px solid #1a1a2e',
              background: '#1a1a2e',
              color: '#fff',
              borderRadius: '4px',
            }}
          >
            Load
          </button>
        </form>
        {correlationId ? (
          <small style={{ color: '#666' }}>Showing timeline for: {correlationId}</small>
        ) : (
          <small style={{ color: '#666' }}>Provide a correlation_id to view full event chain.</small>
        )}
      </section>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Incident / Approval Queue</h3>
        <p style={{ color: '#666', marginTop: 0 }}>
          Denied tool calls and pending approvals requiring reviewer action.
        </p>

        <h4 style={{ marginBottom: '0.5rem' }}>Denied Calls</h4>
        <SimpleTable
          headers={['Time', 'Correlation ID', 'Event Type', 'Summary']}
          rows={(queue?.denied ?? []).slice(0, 20).map((event) => [
            fmt(event.ts),
            event.correlation_id,
            event.event_type,
            String(
              (event.payload.decision as { reason?: string } | undefined)?.reason ??
                (event.payload.blocked_by as string | undefined) ??
                '-',
            ),
          ])}
          emptyLabel="No denied calls."
        />

        <h4 style={{ marginBottom: '0.5rem', marginTop: '1.25rem' }}>Pending Approvals</h4>
        <SimpleTable
          headers={['Requested At', 'Approval ID', 'Correlation ID', 'Tool', 'Risk']}
          rows={(queue?.pending_approvals ?? []).slice(0, 20).map((approval) => [
            fmt(approval.requested_at),
            approval.id,
            approval.correlation_id,
            approval.tool_name,
            approval.risk_tier,
          ])}
          emptyLabel="No pending approvals."
        />
      </section>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Correlation Timeline</h3>
        <SimpleTable
          headers={['Time', 'Event Type', 'Event ID']}
          rows={(timeline?.items ?? []).map((event) => [fmt(event.ts), event.event_type, event.id])}
          emptyLabel={correlationId ? 'No events for this correlation_id.' : 'Timeline not loaded.'}
        />
      </section>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Policy Trace</h3>
        {policyTrace ? (
          <div>
            <p style={{ margin: 0 }}>
              <strong>Engine:</strong> {policyTrace.policy_engine ?? '-'}
            </p>
            <p style={{ margin: '0.35rem 0' }}>
              <strong>Input Hash:</strong>{' '}
              <code style={{ fontSize: '0.8rem' }}>{policyTrace.policy_input_hash ?? '-'}</code>
            </p>
            <p style={{ margin: 0 }}>
              <strong>Evaluated At:</strong> {fmt(policyTrace.ts)}
            </p>
            <pre
              style={{
                marginTop: '0.75rem',
                background: '#f1f3f5',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                padding: '0.75rem',
                overflowX: 'auto',
                fontSize: '0.8rem',
              }}
            >
              {JSON.stringify(policyTrace.policy_trace ?? policyTrace.decision_output ?? {}, null, 2)}
            </pre>
          </div>
        ) : (
          <p style={{ color: '#666', marginBottom: 0 }}>
            {correlationId
              ? 'No policy trace found for this correlation_id.'
              : 'Load a correlation timeline to inspect policy trace.'}
          </p>
        )}
      </section>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: string[][];
  emptyLabel: string;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
      <thead>
        <tr style={{ background: '#f1f3f5', textAlign: 'left' }}>
          {headers.map((h) => (
            <th key={h} style={{ padding: '0.55rem 0.65rem', borderBottom: '1px solid #dee2e6' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} style={{ padding: '0.8rem 0.65rem', color: '#666' }}>
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row, idx) => (
            <tr key={`${row.join('|')}-${idx}`}>
              {row.map((cell, cellIdx) => (
                <td
                  key={`${cell}-${cellIdx}`}
                  style={{ padding: '0.55rem 0.65rem', borderBottom: '1px solid #edf0f2' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
