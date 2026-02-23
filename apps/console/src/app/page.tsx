type OverviewResponse = {
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
};

const gatewayBaseUrl = process.env.GATEWAY_URL ?? 'http://localhost:3001';

async function fetchOverview(): Promise<OverviewResponse | null> {
  try {
    const res = await fetch(`${gatewayBaseUrl}/v1/overview`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as OverviewResponse;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const overview = await fetchOverview();
  const hourly = overview?.events_per_hour_24h ?? [];
  const maxHourly = Math.max(1, ...hourly.map((h) => h.count));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>AI Security Gateway Application</h1>
      <p style={{ color: '#555' }}>
        Unified operations dashboard for tool interception, policy enforcement, approvals, connectors, and exports.
      </p>

      <section
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <MetricCard title="Total Events" value={String(overview?.counters.total_events ?? 0)} />
        <MetricCard title="Blocked / Denied" value={String(overview?.counters.blocked_events ?? 0)} />
        <MetricCard
          title="Pending Approvals"
          value={String(overview?.counters.pending_approvals ?? 0)}
        />
        <MetricCard
          title="Approvals Approved"
          value={String(overview?.counters.approvals_approved ?? 0)}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Runtime Overview</h3>
          <a href="/events" style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>
            Open Operations Console
          </a>
        </div>
        <p style={{ color: '#555', marginBottom: '0.5rem' }}>
          Policy backend: <strong>{overview?.policy_backend ?? 'unknown'}</strong>
        </p>

        <h4 style={{ marginBottom: '0.4rem' }}>Connectors</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e5e7eb' }}>Name</th>
              <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e5e7eb' }}>Risk</th>
              <th style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #e5e7eb' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {(overview?.connectors ?? []).map((c) => (
              <tr key={c.name}>
                <td style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{c.name}</td>
                <td style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{c.risk_tier}</td>
                <td style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid #f1f5f9' }}>{c.description}</td>
              </tr>
            ))}
            {(overview?.connectors.length ?? 0) === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '0.7rem 0.6rem', color: '#6b7280' }}>
                  No connectors registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
        <h3 style={{ marginTop: 0 }}>Visualisations</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '1rem',
          }}
        >
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.75rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Events per hour (24h)</strong>
            <div style={{ height: '180px', marginTop: '0.6rem', display: 'flex', alignItems: 'end', gap: '4px' }}>
              {hourly.map((point) => (
                <div
                  key={point.bucket}
                  title={`${new Date(point.bucket).toLocaleString()}: ${point.count}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(6, Math.round((point.count / maxHourly) * 100))}%`,
                    background: 'linear-gradient(180deg, #2563eb, #1e40af)',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              ))}
              {hourly.length === 0 && <span style={{ color: '#6b7280', fontSize: '0.86rem' }}>No data</span>}
            </div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.75rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Top event types (24h)</strong>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1rem' }}>
              {(overview?.event_type_counts ?? []).slice(0, 8).map((t) => (
                <li key={t.event_type} style={{ marginBottom: '0.35rem', fontSize: '0.86rem' }}>
                  {t.event_type}: <strong>{t.count}</strong>
                </li>
              ))}
              {(overview?.event_type_counts.length ?? 0) === 0 && (
                <li style={{ color: '#6b7280', fontSize: '0.86rem' }}>No event data in last 24h</li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        padding: '1rem',
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: '6px',
      }}
    >
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem' }}>{title}</p>
      <p style={{ margin: '0.35rem 0 0', fontSize: '1.4rem', fontWeight: 700 }}>{value}</p>
    </div>
  );
}
