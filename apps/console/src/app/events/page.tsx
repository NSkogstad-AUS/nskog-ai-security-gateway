/**
 * Event log list page – placeholder.
 *
 * TODO: fetch from GET /v1/events on the gateway and render rows.
 * The gateway will need a new route that SELECTs from the events table
 * (read-only – the append-only constraint applies only to writes).
 */
export default function EventsPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Event Log</h1>
      <p style={{ color: '#555' }}>
        Append-only record of every intercepted tool call and policy decision.
      </p>

      {/* Placeholder panel */}
      <div
        style={{
          marginTop: '1.5rem',
          padding: '3rem 2rem',
          background: '#fff',
          border: '2px dashed #ced4da',
          borderRadius: '6px',
          textAlign: 'center',
          color: '#868e96',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Event list placeholder</p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
          Add a <code>GET /v1/events</code> endpoint to the gateway, then fetch and render
          rows here.
        </p>
      </div>

      {/* Schema preview – hidden until data is wired up */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginTop: '1.5rem',
          fontSize: '0.875rem',
          display: 'none',
        }}
      >
        <thead>
          <tr style={{ background: '#f1f3f5', textAlign: 'left' }}>
            {['ID', 'Correlation ID', 'Event Type', 'Timestamp'].map((h) => (
              <th key={h} style={{ padding: '0.6rem 0.75rem', borderBottom: '2px solid #dee2e6' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{/* rows rendered here */}</tbody>
      </table>
    </div>
  );
}
