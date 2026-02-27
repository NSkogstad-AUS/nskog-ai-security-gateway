import { getPool } from '@ai-security-gateway/eventlog';

/**
 * Gateway-specific DB migrations, separate from the eventlog package's own migrations.
 * All statements use IF NOT EXISTS guards — safe to call on every startup.
 */
export async function runGatewayMigrations(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_keys (
      id          UUID        PRIMARY KEY,
      key_hash    TEXT        NOT NULL UNIQUE,
      agent_id    TEXT        NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at  TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_agent_keys_hash_active
      ON agent_keys (key_hash)
      WHERE revoked_at IS NULL;
  `);
}
