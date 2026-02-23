/**
 * Standalone migration runner.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @ai-security-gateway/eventlog migrate
 */
import { runMigrations } from './migrations';
import { closePool } from './client';

async function main() {
  console.log('Running eventlog migrations…');
  await runMigrations();
  console.log('Migrations complete.');
  await closePool();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
