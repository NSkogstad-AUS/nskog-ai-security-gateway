import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { getPool } from '@ai-security-gateway/eventlog';

const KEY_PREFIX = 'agk_';

/** In-memory cache: key_hash → { agent_id, expires_at } */
interface CacheEntry {
  agent_id: string;
  expires_at: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a new raw API key and its hash.
 * The raw key is only ever returned to the caller once at creation time.
 */
function generateKey(): { raw: string; hash: string } {
  const raw = KEY_PREFIX + randomBytes(32).toString('hex');
  return { raw, hash: hashKey(raw) };
}

/**
 * Look up the agent_id bound to a raw API key.
 * Returns null if the key is missing, invalid, or revoked.
 * Results are cached for CACHE_TTL_MS to avoid a DB round-trip on every request.
 */
export async function resolveAgentId(rawKey: string): Promise<string | null> {
  const hash = hashKey(rawKey);

  const cached = cache.get(hash);
  if (cached && cached.expires_at > Date.now()) {
    return cached.agent_id;
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT agent_id FROM agent_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );

  if (rows.length === 0) {
    cache.delete(hash);
    return null;
  }

  const agentId = String(rows[0].agent_id);
  cache.set(hash, { agent_id: agentId, expires_at: Date.now() + CACHE_TTL_MS });
  return agentId;
}

export interface AgentKeyRecord {
  id: string;
  agent_id: string;
  description: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Create a new API key bound to an agent_id. Returns the record + the raw key (shown once). */
export async function createAgentKey(
  agentId: string,
  description?: string,
): Promise<{ record: AgentKeyRecord; raw: string }> {
  const { raw, hash } = generateKey();
  const id = randomUUID();
  const pool = getPool();

  const { rows } = await pool.query(
    `INSERT INTO agent_keys (id, key_hash, agent_id, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, agent_id, description, created_at, revoked_at`,
    [id, hash, agentId, description ?? null],
  );

  return {
    record: {
      id: rows[0].id,
      agent_id: rows[0].agent_id,
      description: rows[0].description,
      created_at: new Date(rows[0].created_at as string).toISOString(),
      revoked_at: null,
    },
    raw,
  };
}

/** List all agent keys (active and revoked). Never returns raw key values. */
export async function listAgentKeys(): Promise<AgentKeyRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, agent_id, description, created_at, revoked_at
     FROM agent_keys
     ORDER BY created_at DESC`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    agent_id: String(row.agent_id),
    description: row.description ? String(row.description) : null,
    created_at: new Date(row.created_at as string).toISOString(),
    revoked_at: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null,
  }));
}

/**
 * Revoke an API key by its ID.
 * Returns true if it was found and revoked, false if not found or already revoked.
 */
export async function revokeAgentKey(id: string): Promise<boolean> {
  const pool = getPool();

  // Fetch the hash first so we can evict the exact cache entry.
  const { rows } = await pool.query(
    `UPDATE agent_keys SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING key_hash`,
    [id],
  );

  if (rows.length === 0) return false;

  cache.delete(String(rows[0].key_hash));
  return true;
}
