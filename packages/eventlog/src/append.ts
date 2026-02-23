import type { AgentSecurityEvent } from '@ai-security-gateway/shared';
import { getPool } from './client';

/**
 * Appends a single security event to the event log.
 *
 * This is the ONLY write path into the events table.
 * No update or delete operations are provided by design (append-only log).
 */
export async function appendEvent(event: AgentSecurityEvent): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO events (id, correlation_id, event_type, ts, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      event.id,
      event.correlation_id,
      event.event_type,
      event.ts,
      JSON.stringify(event.payload),
    ],
  );
}
