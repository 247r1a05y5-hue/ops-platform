import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDB, disconnectTestDB, clearTestDB } from '../helpers/mongo-memory';
import { createTestApp } from '../helpers/test-server';
import { User, Lead, Workspace } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { GET, POST, PUT, DELETE } from '@/app/api/leads/route';

describe('Leads API Integration Tests', () => {
  let appGet: any;
  let appPost: any;
  let appPut: any;
  let appDelete: any;
  
  let adminToken: string;
  let employeeToken: string;
  let employeeUser: any;
  let adminUser: any;
  let workspace1: any;
  let workspace2: any;

  beforeAll(async () => {
    await connectTestDB();
    appGet = createTestApp(GET);
    appPost = createTestApp(POST);
    appPut = createTestApp(PUT);
    appDelete = createTestApp(DELETE);
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // 1. Create Workspaces
    workspace1 = await Workspace.create({ name: 'Workspace One', slug: 'ws-1' });
    workspace2 = await Workspace.create({ name: 'Workspace Two', slug: 'ws-2' });

    // 2. Create Users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'Admin',
      firstLogin: false,
      workspaceId: workspace1._id
    });

    employeeUser = await User.create({
      name: 'Employee User',
      email: 'employee@example.com',
      password: 'password123',
      role: 'User',
      firstLogin: false,
      workspaceId: workspace1._id
    });

    // 3. Create Session Tokens
    adminToken = await createSessionToken({
      sub: String(adminUser._id),
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role
    });

    employeeToken = await createSessionToken({
      sub: String(employeeUser._id),
      email: employeeUser.email,
      name: employeeUser.name,
      role: employeeUser.role
    });
  });

  it('should create a lead successfully if authenticated as Admin', async () => {
    const response = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${adminToken}`)
      .set('x-csrf-token', 'test-csrf')
      .send({
        name: 'John CRM',
        email: 'johncrm@example.com',
        company: 'CRM Corp',
        value: '$5000',
        stage: 'Discovery',
        status: 'Hot'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.lead.name).toBe('John CRM');

    // Confirm it was saved to DB
    const lead = await Lead.findOne({ email: 'johncrm@example.com' });
    expect(lead).toBeDefined();
    expect(lead?.company).toBe('CRM Corp');
  });

  it('should prevent lead creation if name or email are missing', async () => {
    const response = await request(appPost)
      .post('/')
      .set('Cookie', `ops_session=${adminToken}`)
      .set('x-csrf-token', 'test-csrf')
      .send({
        company: 'CRM Corp'
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Name and Email are required');
  });

  it('should enforce workspace isolation on GET requests', async () => {
    // 1. Create a lead assigned to a user in Workspace 2
    const otherUser = await User.create({
      name: 'Other User',
      email: 'other@example.com',
      password: 'password123',
      role: 'User',
      firstLogin: false,
      workspaceId: workspace2._id
    });

    const otherToken = await createSessionToken({
      sub: String(otherUser._id),
      email: otherUser.email,
      name: otherUser.name,
      role: otherUser.role
    });

    // Lead assigned to workspace 2 user
    await Lead.create({
      name: 'Private Lead',
      email: 'private@example.com',
      company: 'WS2 Corp',
      assignedTo: otherUser._id,
      assignedToName: otherUser.name,
      stage: 'Discovery',
      status: 'Warm'
    });

    // Lead assigned to workspace 1 user (our Employee User)
    await Lead.create({
      name: 'Visible Lead',
      email: 'visible@example.com',
      company: 'WS1 Corp',
      assignedTo: employeeUser._id,
      assignedToName: employeeUser.name,
      stage: 'Discovery',
      status: 'Warm'
    });

    // 2. Fetch leads as Employee User (Workspace 1)
    const response = await request(appGet)
      .get('/')
      .set('Cookie', `ops_session=${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // Should see visible lead, but NOT private lead
    const leads = response.body.leads;
    expect(leads.some((l: any) => l.name === 'Visible Lead')).toBe(true);
    expect(leads.some((l: any) => l.name === 'Private Lead')).toBe(false);
  });

  it('should prevent deletion of a lead if role is User (Employee)', async () => {
    const lead = await Lead.create({
      name: 'Delete Me',
      email: 'deleteme@example.com',
      company: 'Acme Corp',
      stage: 'Discovery',
      status: 'Warm'
    });

    // Attempt delete as Employee
    const response = await request(appDelete)
      .delete(`/?id=${lead._id}`)
      .set('Cookie', `ops_session=${employeeToken}`)
      .set('x-csrf-token', 'test-csrf');

    // HTTP 403 Forbidden
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Forbidden');
  });

  it('should allow deletion of a lead if role is Admin', async () => {
    const lead = await Lead.create({
      name: 'Delete Me',
      email: 'deleteme@example.com',
      company: 'Acme Corp',
      stage: 'Discovery',
      status: 'Warm'
    });

    // Attempt delete as Admin
    const response = await request(appDelete)
      .delete(`/?id=${lead._id}`)
      .set('Cookie', `ops_session=${adminToken}`)
      .set('x-csrf-token', 'test-csrf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const check = await Lead.findById(lead._id);
    expect(check).toBeNull();
  });
});
