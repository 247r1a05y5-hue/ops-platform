import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDB, disconnectTestDB, clearTestDB } from '../helpers/mongo-memory';
import { createTestApp } from '../helpers/test-server';
import { User, Workspace } from '@/lib/db';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import bcrypt from 'bcryptjs';

describe('Auth API Integration Tests', () => {
  let appLogin: any;
  let appLogout: any;

  beforeAll(async () => {
    await connectTestDB();
    appLogin = createTestApp(loginHandler);
    appLogout = createTestApp(logoutHandler);
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it('should log in a user with valid credentials', async () => {
    // 1. Create a workspace
    const workspace = await Workspace.create({ name: 'Test Workspace', slug: 'ops-main' });
    
    // 2. Create a user
    const passwordHash = await bcrypt.hash('SecurePassword123!', 10);
    const user = await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: passwordHash,
      role: 'User',
      firstLogin: false,
      workspaceId: workspace._id
    });

    // 3. Make login request
    const response = await request(appLogin)
      .post('/')
      .set('x-csrf-token', 'test-token')
      .send({
        email: 'john@example.com',
        password: 'SecurePassword123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe('john@example.com');
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'][0]).toContain('ops_session=');
  });

  it('should reject login for invalid credentials', async () => {
    // Create user
    const passwordHash = await bcrypt.hash('SecurePassword123!', 10);
    await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: passwordHash,
      role: 'User',
      firstLogin: false
    });

    const response = await request(appLogin)
      .post('/')
      .set('x-csrf-token', 'test-token')
      .send({
        email: 'john@example.com',
        password: 'WrongPassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid credentials.');
  });

  it('should prevent login for suspended users', async () => {
    // Create suspended user
    const passwordHash = await bcrypt.hash('SecurePassword123!', 10);
    await User.create({
      name: 'Suspended Doe',
      email: 'suspended@example.com',
      password: passwordHash,
      role: 'User',
      suspended: true,
      firstLogin: false
    });

    const response = await request(appLogin)
      .post('/')
      .set('x-csrf-token', 'test-token')
      .send({
        email: 'suspended@example.com',
        password: 'SecurePassword123!'
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('suspended');
  });

  it('should logout a user and clear the session cookie', async () => {
    const response = await request(appLogout)
      .post('/')
      .set('x-csrf-token', 'test-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.headers['set-cookie'][0]).toContain('ops_session=;');
  });
});
