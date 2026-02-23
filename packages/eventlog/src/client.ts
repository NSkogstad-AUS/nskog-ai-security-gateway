import { Pool } from 'pg';

let _pool: Pool | null = null;

/**
 * Returns the shared connection pool, creating it on first call.
 * Reads DATABASE_URL from the environment.
 */
export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
          'Copy apps/gateway/.env.example → .env and fill in the value.',
      );
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

/** Gracefully drain and close the connection pool (useful in tests / scripts). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
