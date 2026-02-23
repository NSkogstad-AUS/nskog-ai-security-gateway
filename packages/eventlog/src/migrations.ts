import { getPool } from './client';

// Inline migration SQL – kept here so the package is self-contained.
// The canonical source-of-truth copy lives in migrations/001_create_events.sql.
const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id             UUID        PRIMARY KEY,
    correlation_id TEXT        NOT NULL,
    event_type     TEXT        NOT NULL,
    ts             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload        JSONB       NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_correlation_id
    ON events (correlation_id);

  CREATE INDEX IF NOT EXISTS idx_events_ts
    ON events (ts DESC);
`;

/**
 * Runs the initial schema migration.
 * Safe to call on every startup – all statements use IF NOT EXISTS guards.
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  await pool.query(MIGRATION_SQL);
}
