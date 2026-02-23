export default function HomePage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>AI Security Gateway Console</h1>
      <p style={{ color: '#555' }}>
        Use this console to inspect intercepted tool calls, policy decisions, and security events.
      </p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
          marginTop: '2rem',
        }}
      >
        <Card
          title="Event Log"
          description="Browse all intercepted tool calls and policy decisions."
          href="/events"
          badge="live"
        />
        <Card
          title="Policy Engine"
          description="LocalPolicyEngine active (stub). Configure OPA to enforce real rules."
          href="#"
          badge="stub"
        />
        <Card
          title="Connectors"
          description="web_search (MockConnector) registered. Add real connectors via ToolRegistry."
          href="#"
          badge="stub"
        />
      </section>

      <section
        style={{
          marginTop: '2.5rem',
          padding: '1.25rem',
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Quick test</h3>
        <pre
          style={{
            background: '#f1f3f5',
            padding: '1rem',
            borderRadius: '4px',
            fontSize: '0.85rem',
            overflowX: 'auto',
          }}
        >
          {`curl -X POST http://localhost:3001/v1/intercept \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "agent-001",
    "tool_name": "web_search",
    "tool_args": { "query": "AI security" }
  }'`}
        </pre>
      </section>
    </div>
  );
}

function Card({
  title,
  description,
  href,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  badge: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: '1.25rem',
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <strong>{title}</strong>
        <span
          style={{
            fontSize: '0.7rem',
            background: badge === 'live' ? '#d1fae5' : '#fef3c7',
            color: badge === 'live' ? '#065f46' : '#92400e',
            padding: '2px 6px',
            borderRadius: '999px',
            fontWeight: 600,
          }}
        >
          {badge}
        </span>
      </div>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#555' }}>{description}</p>
    </a>
  );
}
