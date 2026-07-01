import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';

describe('Rate Limiter', () => {
  const ipKey = 'test-ip-rate-limit';

  beforeEach(async () => {
    await resetRateLimit(ipKey);
  });

  it('should allow requests within the specified attempts limit', async () => {
    // Max attempts = 3, window = 1s
    const r1 = await checkRateLimit(ipKey, 3, 1000, 5000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit(ipKey, 3, 1000, 5000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimit(ipKey, 3, 1000, 5000);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('should block requests exceeding the limit and return retryTime', async () => {
    // Max attempts = 2
    await checkRateLimit(ipKey, 2, 1000, 5000);
    await checkRateLimit(ipKey, 2, 1000, 5000);

    const blocked = await checkRateLimit(ipKey, 2, 1000, 5000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should allow requests again after the sliding window expires', async () => {
    // Limit = 1, Window = 50ms, Block = 50ms
    const r1 = await checkRateLimit(ipKey, 1, 50, 50);
    expect(r1.allowed).toBe(true);

    const blocked = await checkRateLimit(ipKey, 1, 50, 50);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    const r2 = await checkRateLimit(ipKey, 1, 50, 50);
    expect(r2.allowed).toBe(true);
  });
});
