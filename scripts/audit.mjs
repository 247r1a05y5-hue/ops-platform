import dns from 'dns';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import * as dotenv from 'dotenv';

// Fix Atlas SRV DNS resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('DNS server setting failed:', err);
}

dotenv.config({ path: '.env.local' });

async function runAudit() {
  console.log('=========================================');
  console.log('   PRODUCTION READINESS AUDIT RUNNING    ');
  console.log('=========================================\n');

  const report = {
    env: { ok: true, items: [] },
    db: { ok: true, items: [] },
    socket: { ok: true, items: [] },
    roles: { ok: true, items: [] },
    crm: { ok: true, items: [] },
    meet: { ok: true, items: [] },
    notifications: { ok: true, items: [] },
  };

  // 1. Env Variables Verification
  console.log('📋 Auditing Environment Variables...');
  const criticalEnvVars = [
    { name: 'MONGODB_URI', required: true },
    { name: 'JWT_SECRET', required: true, minLength: 32, placeholder: 'ops_platform_change_this_to_a_long_random_secret_min_32_chars_acfd4fe2ac7c04ecbd640f445f1cdd7d' },
    { name: 'NEXT_PUBLIC_APP_URL', required: true, placeholder: 'http://localhost:3000' },
    { name: 'BREVO_API_KEY', required: true },
    { name: 'SENDER_EMAIL', required: true },
    { name: 'GOOGLE_CLIENT_ID', required: false },
    { name: 'GOOGLE_CLIENT_SECRET', required: false },
    { name: 'RAZORPAY_KEY_ID', required: false },
    { name: 'RAZORPAY_KEY_SECRET', required: false },
    { name: 'WHATSAPP_TOKEN', required: false },
    { name: 'WHATSAPP_PHONE_ID', required: false },
    { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', required: false },
  ];

  for (const v of criticalEnvVars) {
    const val = process.env[v.name];
    if (!val) {
      if (v.required) {
        report.env.ok = false;
        report.env.items.push({ name: v.name, status: 'ERROR', detail: 'Missing required variable' });
        console.log(`  ❌ ${v.name}: Missing! (Required)`);
      } else {
        report.env.items.push({ name: v.name, status: 'WARN', detail: 'Optional variable missing' });
        console.log(`  ⚠️  ${v.name}: Missing (Optional integration)`);
      }
    } else {
      if (v.placeholder && val === v.placeholder) {
        report.env.ok = false;
        report.env.items.push({ name: v.name, status: 'ERROR', detail: 'Using placeholder value' });
        console.log(`  ❌ ${v.name}: Using placeholder value!`);
      } else if (v.minLength && val.length < v.minLength) {
        report.env.ok = false;
        report.env.items.push({ name: v.name, status: 'ERROR', detail: `Value is too short (min ${v.minLength} chars)` });
        console.log(`  ❌ ${v.name}: Value is too short!`);
      } else if (v.name === 'NEXT_PUBLIC_APP_URL' && val.includes('localhost')) {
        report.env.items.push({ name: v.name, status: 'WARN', detail: 'Set to localhost (recommend update for production)' });
        console.log(`  ⚠️  ${v.name}: Set to localhost (${val}) - Needs to be updated for production`);
      } else {
        report.env.items.push({ name: v.name, status: 'OK', detail: 'Set correctly' });
        console.log(`  ✅ ${v.name}: Configured`);
      }
    }
  }

  // 2. Database Connectivity
  console.log('\n📋 Auditing MongoDB Connectivity...');
  if (!process.env.MONGODB_URI) {
    report.db.ok = false;
    report.db.items.push({ status: 'ERROR', detail: 'No MONGODB_URI to connect' });
    console.log('  ❌ Database connection skipped due to missing URI');
  } else {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      report.db.items.push({ status: 'OK', detail: 'Successfully connected' });
      console.log('  ✅ Connected successfully to MongoDB Atlas!');

      // Check User collections and roles
      console.log('\n📋 Auditing Users & Roles...');
      // Dynamically register models
      const { User, Lead, StageWorkflowLog, Message, Workspace } = await import('../src/lib/db.ts');
      const users = await User.find({}).lean();
      console.log(`  ✅ Total Users in DB: ${users.length}`);

      const roles = ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'];
      const countsByRole = {};
      roles.forEach(r => countsByRole[r] = 0);

      users.forEach(u => {
        if (countsByRole[u.role] !== undefined) {
          countsByRole[u.role]++;
        } else {
          countsByRole[u.role] = 1;
        }
      });

      console.log('  Role distribution:');
      for (const [r, count] of Object.entries(countsByRole)) {
        console.log(`    - ${r}: ${count}`);
        report.roles.items.push({ role: r, count });
      }

      // Check if critical roles have users
      if (countsByRole['Admin'] === 0) {
        report.roles.ok = false;
        report.roles.items.push({ status: 'ERROR', detail: 'No Admin user seeded in DB' });
        console.log('  ❌ No users found with Admin role!');
      } else {
        console.log('  ✅ Admin role is present.');
      }
      if (countsByRole['Manager'] === 0) {
        report.roles.items.push({ status: 'WARN', detail: 'No Manager user seeded in DB' });
        console.log('  ⚠️  No users found with Manager role.');
      }
      if (countsByRole['Staff'] === 0 && countsByRole['Employee'] === 0) {
        report.roles.items.push({ status: 'WARN', detail: 'No Employee/Staff user seeded in DB' });
        console.log('  ⚠️  No users found with Employee/Staff role.');
      }
      if (countsByRole['User'] === 0 && countsByRole['MR'] === 0) {
        report.roles.items.push({ status: 'WARN', detail: 'No MR/User user seeded in DB' });
        console.log('  ⚠️  No users found with MR/User role.');
      }

      // CRM check
      console.log('\n📋 Auditing CRM Workflows Data...');
      const leadCount = await Lead.countDocuments();
      const workflowLogs = await StageWorkflowLog.countDocuments();
      console.log(`  ✅ Total CRM Leads: ${leadCount}`);
      console.log(`  ✅ Total Stage Transitions Logged: ${workflowLogs}`);
      report.crm.items.push({ name: 'Leads', count: leadCount });
      report.crm.items.push({ name: 'StageWorkflowLogs', count: workflowLogs });

      // Chat check
      console.log('\n📋 Auditing Chat & Presence...');
      const msgCount = await Message.countDocuments();
      const wsCount = await Workspace.countDocuments();
      console.log(`  ✅ Total Workspaces: ${wsCount}`);
      console.log(`  ✅ Total Messages: ${msgCount}`);
      report.db.items.push({ name: 'Workspaces', count: wsCount });
      report.db.items.push({ name: 'Messages', count: msgCount });

    } catch (dbErr) {
      report.db.ok = false;
      report.db.items.push({ status: 'ERROR', detail: dbErr.message });
      console.log(`  ❌ Database connection failed: ${dbErr.message}`);
    }
  }

  // 3. Socket.io startup verification
  console.log('\n📋 Auditing Socket.IO Startup...');
  try {
    const server = http.createServer();
    const testIo = new SocketIOServer(server, {
      path: '/api/socketio',
      transports: ['websocket', 'polling'],
    });
    if (testIo) {
      report.socket.items.push({ status: 'OK', detail: 'Socket.IO Server initialized successfully' });
      console.log('  ✅ Socket.IO server class can be instantiated successfully');
    }
    testIo.close();
    server.close();
  } catch (ioErr) {
    report.socket.ok = false;
    report.socket.items.push({ status: 'ERROR', detail: ioErr.message });
    console.log(`  ❌ Socket.IO initialization failed: ${ioErr.message}`);
  }

  // 4. Google Meet Integration
  console.log('\n📋 Auditing Google Meet integration...');
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!googleClientId || !googleClientSecret || googleClientId.includes('PLACEHOLDER') || googleClientSecret.includes('PLACEHOLDER')) {
    report.meet.ok = false;
    report.meet.items.push({ status: 'ERROR', detail: 'OAuth Credentials missing or placeholder' });
    console.log('  ❌ Google OAuth credentials are not set or are placeholders. Google Meet links cannot be generated.');
  } else {
    report.meet.items.push({ status: 'OK', detail: 'OAuth Credentials configured' });
    console.log('  ✅ Google OAuth credentials are set');
    // Check if any user has connected Google account
    try {
      const { GmailToken } = await import('../src/lib/db.ts');
      const tokensCount = await GmailToken.countDocuments();
      report.meet.items.push({ name: 'GmailTokens', count: tokensCount });
      console.log(`  ✅ Connected user Google accounts (GmailToken): ${tokensCount}`);
      if (tokensCount === 0) {
        console.log('  ⚠️  No users have connected their Google account yet. Starting meetings will fail until connected.');
      }
    } catch (tErr) {
      console.warn('  ⚠️  Could not query GmailToken count:', tErr.message);
    }
  }

  // 5. Notifications & Brevo API Transport
  console.log('\n📋 Auditing Notifications & Brevo API configuration...');
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    report.notifications.ok = false;
    report.notifications.items.push({ status: 'ERROR', detail: 'BREVO_API_KEY configuration is incomplete' });
    console.log('  ❌ BREVO_API_KEY is not configured');
  } else {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
        },
      });
      if (res.ok) {
        const accountInfo = await res.json();
        report.notifications.items.push({ status: 'OK', detail: `Brevo REST API verified successfully! Account email: ${accountInfo.email}` });
        console.log(`  ✅ Brevo REST API connection verified. Account: ${accountInfo.email}`);
      } else {
        const text = await res.text();
        report.notifications.ok = false;
        report.notifications.items.push({ status: 'ERROR', detail: `Brevo API returned HTTP ${res.status}: ${text}` });
        console.log(`  ❌ Brevo REST API verification failed (HTTP ${res.status}): ${text}`);
      }
    } catch (mailErr: any) {
      report.notifications.ok = false;
      report.notifications.items.push({ status: 'ERROR', detail: mailErr.message });
      console.log(`  ❌ Brevo REST API connection failed: ${mailErr.message}`);
    }
  }

  // WhatsApp configuration
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    report.notifications.items.push({ status: 'WARN', detail: 'WhatsApp Business API is not configured' });
    console.log('  ⚠️  WhatsApp Business API is not configured (WHATSAPP_TOKEN or PHONE_ID is missing)');
  } else {
    report.notifications.items.push({ status: 'OK', detail: 'WhatsApp configured' });
    console.log('  ✅ WhatsApp API tokens are set');
  }

  console.log('\n=========================================');
  console.log('            AUDIT COMPLETED              ');
  console.log('=========================================');

  await mongoose.disconnect();

  // Determine if there are critical blockers
  // Critical blockers are:
  // - Env variables check failed (except optional local warning)
  // - Database connection failed
  // - Socket.IO startup failed
  // - No admin user present
  let hasBlockers = false;
  if (!report.env.ok) {
    // Only block if REQUIRED env vars are missing/placeholder
    const requiredFailures = report.env.items.filter(i => i.status === 'ERROR');
    if (requiredFailures.length > 0) hasBlockers = true;
  }
  if (!report.db.ok) hasBlockers = true;
  if (!report.socket.ok) hasBlockers = true;
  if (!report.roles.ok) hasBlockers = true;

  console.log(hasBlockers ? '\n🚨 CRITICAL BLOCKERS FOUND!' : '\n🎉 NO CRITICAL BLOCKERS FOUND!');
  process.exit(hasBlockers ? 1 : 0);
}

runAudit().catch(e => {
  console.error('Audit crashed:', e);
  process.exit(1);
});
