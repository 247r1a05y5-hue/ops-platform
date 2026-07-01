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
async function checkRateLimitRedis(
  identifier: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): Promise<RateLimitResult> {
  const key      = `rl:${identifier}`;
  const blockKey = `rl:block:${identifier}`;
  const countKey = `rl:bc:${identifier}`;
  const windowSec = Math.ceil(windowMs / 1000);

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

    if (count >= maxAttempts) {
      // Increment block count
      const bcRaw = await redisGet(countKey);
      const blockCount = (bcRaw ? parseInt(bcRaw, 10) : 0) + 1;
      const multiplier = Math.min(4, blockCount);
      const durationSec = Math.ceil((blockMs * multiplier) / 1000);

      // Save progressive block count
      await redisSet(countKey, String(blockCount), 3600); // 1 hour TTL
      await redisSet(blockKey, '1', durationSec);
      await redisDel(key);
      return { allowed: false, remaining: 0, retryAfterSeconds: durationSec };
    }

    const newCount = count + 1;
    await redisSet(key, String(newCount), windowSec);
    return { allowed: true, remaining: maxAttempts - newCount };
  } catch (e) {
    console.error('[RateLimit] Redis error, allowing request:', e);
    return { allowed: true, remaining: maxAttempts - 1 };
  }
}

async function resetRateLimitRedis(identifier: string): Promise<void> {
  await redisDel(`rl:${identifier}`).catch(() => {});
  await redisDel(`rl:block:${identifier}`).catch(() => {});
  await redisDel(`rl:bc:${identifier}`).catch(() => {});
}

// ── In-memory fallback ────────────────────────────────────────────────────────
interface Attempt { count: number; firstAttempt: number; blockedUntil?: number; blockCount: number; }
const store = new Map<string, Attempt>();

// Lazy cleanup — started on first request, never during build phase
let _cleanupStarted = false;
function ensureCleanup(windowMs: number) {
  if (_cleanupStarted) return;
  _cleanupStarted = true;
  const iv = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.firstAttempt > windowMs * 2) store.delete(key);
    }
  }, 10 * 60 * 1000);
  if (typeof iv.unref === 'function') iv.unref();
}

function checkRateLimitMemory(
  identifier: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): RateLimitResult {
  ensureCleanup(windowMs);
  const now   = Date.now();
  let entry = store.get(identifier);
  if (!entry) {
    entry = { count: 1, firstAttempt: now, blockCount: 0 };
    store.set(identifier, entry);
    return { allowed: true, remaining: maxAttempts - 1 };
  }
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now - entry.firstAttempt > windowMs) {
    entry.count = 1;
    entry.firstAttempt = now;
  } else {
    entry.count += 1;
  }
  if (entry.count > maxAttempts) {
    entry.blockCount = (entry.blockCount ?? 0) + 1;
    const multiplier = Math.min(4, entry.blockCount);
    const duration = blockMs * multiplier;
    entry.blockedUntil = now + duration;
    store.set(identifier, entry);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(duration / 1000) };
  }
  store.set(identifier, entry);
  return { allowed: true, remaining: maxAttempts - entry.count };
}

// ── Public API (async — supports both backends) ───────────────────────────────
export async function checkRateLimit(
  identifier: string,
  maxAttempts: number = 60,
  windowMs: number = 60 * 1000,
  blockMs: number = 5 * 60 * 1000
): Promise<RateLimitResult> {
  if (isRedisConfigured()) return checkRateLimitRedis(identifier, maxAttempts, windowMs, blockMs);
  return checkRateLimitMemory(identifier, maxAttempts, windowMs, blockMs);
}

export async function resetRateLimit(identifier: string): Promise<void> {
  if (isRedisConfigured()) return resetRateLimitRedis(identifier);
  store.delete(identifier);
}
