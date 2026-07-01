import request from 'supertest';
import { connectTestDB, disconnectTestDB, clearTestDB } from '../helpers/mongo-memory';
import { createTestApp } from '../helpers/test-server';
import { POST as leadsPostHandler } from '@/app/api/leads/route';
import { createSessionToken } from '@/lib/auth';
import { User } from '@/lib/db';
import * as rateLimitModule from '@/lib/rate-limit';

describe('Security & Observability Route Handler Tests', () => {
  let appPost: any;
  let testUserToken: string;

  beforeAll(async () => {
    await connectTestDB();
    appPost = createTestApp(leadsPostHandler);
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.restoreAllMocks();

    const user = await User.create({
      name: 'Security User',
      email: 'sec@example.com',
      password: 'password123',
      role: 'Admin',
      firstLogin: false
    });

    testUserToken = await createSessionToken({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role
    });
  });

  it('should reject requests exceeding the 1MB payload size limit with HTTP 413', async () => {
    // Generate a payload larger than 1MB
    const largeBody = 'a'.repeat(1.1 * 1024 * 1024);

    const response = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      .set('x-csrf-token', 'test-token')
      .send({ data: largeBody });

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Payload Too Large');
  });

  it('should block state-changing cookie-authenticated requests lacking CSRF tokens with HTTP 403', async () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    const response = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      // No x-csrf-token header set
      .send({
        name: 'New Lead',
        email: 'new@example.com'
      });

    (process.env as any).NODE_ENV = originalEnv;

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('CSRF');
  });

  it('should sanitize user bodies recursively to strip out NoSQL parameters', async () => {
    const response = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      .set('x-csrf-token', 'test-token')
      .send({
        name: 'NoSQL Test',
        email: 'nosql@example.com',
        company: { $ne: 'hacker' } // NoSQL operator injection attempt
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.lead.company).toBe('[object Object]');
  });

  it('should rate-limit requests on API routes and return HTTP 429', async () => {
    // Spy on checkRateLimit from rate-limit module to return blocked on the third call
    const rateLimitSpy = jest.spyOn(rateLimitModule, 'checkRateLimit');
    rateLimitSpy
      .mockResolvedValueOnce({ allowed: true, remaining: 1 })
      .mockResolvedValueOnce({ allowed: true, remaining: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 45 });

    // Request 1
    const res1 = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      .set('x-csrf-token', 'test-token')
      .send({ name: 'Lead 1', email: 'lead1@example.com' });
    expect(res1.status).toBe(200);

    // Request 2
    const res2 = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      .set('x-csrf-token', 'test-token')
      .send({ name: 'Lead 2', email: 'lead2@example.com' });
    expect(res2.status).toBe(200);

    // Request 3 - should trigger rate limiter block
    const res3 = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${testUserToken}`)
      .set('x-csrf-token', 'test-token')
      .send({ name: 'Lead 3', email: 'lead3@example.com' });

    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error).toContain('Too Many Requests');
    expect(res3.headers['retry-after']).toBe('45');
  });
});
