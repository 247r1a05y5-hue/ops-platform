/**
 * rate-limit.ts
 * Production-safe rate limiter.
 * - Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * - Falls back to in-process Map (single-instance only) when Redis is not configured.
 *   ⚠️ The fallback resets on every deploy — upgrade to Redis for multi-instance deploys.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 15 * 60 * 1000; // 15 minutes
const BLOCK_MS     = 5  * 60 * 1000; // 5-minute lockout
const WINDOW_SEC   = Math.ceil(WINDOW_MS / 1000);
const BLOCK_SEC    = Math.ceil(BLOCK_MS  / 1000);

// ── Upstash Redis helpers (lazy-loaded to avoid import errors when not configured) ──
async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res   = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as { result: string | null };
  return json.result;
}

async function redisSet(key: string, value: string, exSeconds: number): Promise<void> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${exSeconds}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function redisDel(key: string): Promise<void> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// ── Redis-backed implementation ───────────────────────────────────────────────
async function checkRateLimitRedis(identifier: string): Promise<RateLimitResult> {
  const key      = `rl:${identifier}`;
  const blockKey = `rl:block:${identifier}`;

  try {
    // Check if blocked
    const blocked = await redisGet(blockKey);
    if (blocked) {
      const ttlRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ttl/${encodeURIComponent(blockKey)}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const ttlJson = await ttlRes.json() as { result: number };
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, ttlJson.result) };
    }

    const raw   = await redisGet(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= MAX_ATTEMPTS) {
      // Set block key; delete counter
      await redisSet(blockKey, '1', BLOCK_SEC);
      await redisDel(key);
      return { allowed: false, remaining: 0, retryAfterSeconds: BLOCK_SEC };
    }

    const newCount = count + 1;
    await redisSet(key, String(newCount), WINDOW_SEC);
    return { allowed: true, remaining: MAX_ATTEMPTS - newCount };
  } catch (e) {
    console.error('[RateLimit] Redis error, allowing request:', e);
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
}

async function resetRateLimitRedis(identifier: string): Promise<void> {
  await redisDel(`rl:${identifier}`).catch(() => {});
  await redisDel(`rl:block:${identifier}`).catch(() => {});
}

// ── In-memory fallback ────────────────────────────────────────────────────────
interface Attempt { count: number; firstAttempt: number; blockedUntil?: number; }
const store = new Map<string, Attempt>();

// Lazy cleanup — started on first request, never during build phase
let _cleanupStarted = false;
function ensureCleanup() {
  if (_cleanupStarted) return;
  _cleanupStarted = true;
  const iv = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.firstAttempt > WINDOW_MS * 2) store.delete(key);
    }
  }, 10 * 60 * 1000);
  // Don't block process exit
  if (typeof iv.unref === 'function') iv.unref();
}

function checkRateLimitMemory(identifier: string): RateLimitResult {
  ensureCleanup(); // lazy-start the cleanup timer on first real request
  const now   = Date.now();
  const entry = store.get(identifier);
  if (!entry) {
    store.set(identifier, { count: 1, firstAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now - entry.firstAttempt > WINDOW_MS) {
    store.set(identifier, { count: 1, firstAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
    store.set(identifier, entry);
    return { allowed: false, remaining: 0, retryAfterSeconds: BLOCK_SEC };
  }
  store.set(identifier, entry);
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

// ── Public API (async — supports both backends) ───────────────────────────────
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  if (isRedisConfigured()) return checkRateLimitRedis(identifier);
  return checkRateLimitMemory(identifier);
}

export async function resetRateLimit(identifier: string): Promise<void> {
  if (isRedisConfigured()) return resetRateLimitRedis(identifier);
  store.delete(identifier);
}
