import { validateEnv } from '@/lib/env';

describe('Environment Variable Validator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass validation with standard secure environment variables', () => {
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail validation if critical variables are missing', () => {
    delete process.env.MONGODB_URI;
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('MONGODB_URI'))).toBe(true);
  });

  it('should fail validation if MONGODB_URI has an invalid scheme', () => {
    process.env.MONGODB_URI = 'postgres://localhost:5432/mydb';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('MONGODB_URI'))).toBe(true);
  });

  it('should fail validation if JWT_SECRET is too short (< 32 chars)', () => {
    process.env.JWT_SECRET = 'short_secret';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
  });

  it('should fail validation if NEXT_PUBLIC_APP_URL does not start with http or https', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'ftp://ftp.example.com';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('NEXT_PUBLIC_APP_URL'))).toBe(true);
  });

  it('should fail validation if ADMIN_EMAIL is not a valid email', () => {
    process.env.ADMIN_EMAIL = 'not_an_email';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ADMIN_EMAIL'))).toBe(true);
  });

  it('should fail validation if SENDER_EMAIL is not a valid email', () => {
    process.env.SENDER_EMAIL = 'not_an_email';
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SENDER_EMAIL'))).toBe(true);
  });
});
