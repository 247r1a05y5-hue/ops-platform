import {
  createSessionToken,
  verifySessionToken,
  buildSessionCookie,
  buildClearCookie
} from '@/lib/auth';

describe('Authentication Helpers', () => {
  const mockPayload = {
    sub: 'user123',
    email: 'user@example.com',
    role: 'Admin',
    name: 'Test User'
  };

  it('should sign and verify session tokens successfully', async () => {
    const token = await createSessionToken(mockPayload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(mockPayload.sub);
    expect(verified?.email).toBe(mockPayload.email);
    expect(verified?.role).toBe(mockPayload.role);
    expect(verified?.name).toBe(mockPayload.name);
  });

  it('should return null for expired or invalid tokens', async () => {
    const invalidToken = 'invalid.jwt.token.string';
    const verified = await verifySessionToken(invalidToken);
    expect(verified).toBeNull();
  });

  it('should build session cookies with HttpOnly and Lax properties', () => {
    const cookieString = buildSessionCookie('dummy-token', 3600);
    expect(cookieString).toContain('ops_session=dummy-token');
    expect(cookieString).toContain('Path=/');
    expect(cookieString).toContain('HttpOnly');
    expect(cookieString).toContain('SameSite=Lax');
    expect(cookieString).toContain('Max-Age=3600');
  });

  it('should append Secure flag to session and clear cookies in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    const sessionCookie = buildSessionCookie('dummy-token', 3600);
    expect(sessionCookie).toContain('Secure');

    const clearCookie = buildClearCookie();
    expect(clearCookie).toContain('Secure');
    expect(clearCookie).toContain('Max-Age=0');

    (process.env as any).NODE_ENV = originalNodeEnv;
  });
});
