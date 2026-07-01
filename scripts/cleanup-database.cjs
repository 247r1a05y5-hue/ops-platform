const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const dns = require('dns');

// Fix potential Node.js DNS resolution issues with MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('[DNS] Warning: dns.setServers failed:', err);
}

// Load environment configuration
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('CRITICAL: MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function runCleanup() {
  console.log('Connecting to database...');
  try {
    await mongoose.connect(MONGODB_URI);
  } catch (err) {
    console.error('CRITICAL: Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
  console.log('Connected successfully to MongoDB.');

  const db = mongoose.connection.db;

  // 1. Purge Business / Demo collections
  const collectionsToPurge = [
    { name: 'leads', label: 'CRM Leads' },
    { name: 'tasks', label: 'Tasks' },
    { name: 'projects', label: 'Projects' },
    { name: 'invoices', label: 'Invoices' },
    { name: 'proposals', label: 'Proposals' },
    { name: 'notifications', label: 'Notifications' },
    { name: 'activitylogs', label: 'Activity Logs' },
    { name: 'whatsappmessages', label: 'WhatsApp Messages' },
    { name: 'emaillogs', label: 'Email Logs' },
    { name: 'catalogitems', label: 'Catalog Items' }
  ];

  for (const col of collectionsToPurge) {
    try {
      const result = await db.collection(col.name).deleteMany({});
      console.log(`[Purge] Cleared ${col.label} (Deleted ${result.deletedCount} documents)`);
    } catch (err) {
      console.log(`[Purge] Table ${col.name} did not exist or failed to clear:`, err.message);
    }
  }

  // 2. Remove all non-admin users, keeping only admin@ops.com
  try {
    const userResult = await db.collection('users').deleteMany({ email: { $ne: 'admin@ops.com' } });
    console.log(`[Purge] Removed non-admin users (Deleted ${userResult.deletedCount} accounts)`);
  } catch (err) {
    console.error('[Purge] Failed to clean up user collection:', err.message);
  }

  // 3. Ensure Workspace configuration is preserved
  try {
    const workspacesCount = await db.collection('workspaces').countDocuments({});
    if (workspacesCount === 0) {
      await db.collection('workspaces').insertOne({
        name: 'Main Workspace',
        slug: 'ops-main',
        createdAt: new Date()
      });
      console.log('[Setup] Created default Workspace configuration.');
    } else {
      console.log(`[Preserved] Workspace configuration intact (${workspacesCount} workspace(s) found).`);
    }
  } catch (err) {
    console.error('[Setup] Workspace check failed:', err.message);
  }

  // 4. Ensure Administrator account exists and password is set to admin123
  try {
    const adminEmail = 'admin@ops.com';
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    // Find workspaceId
    let workspaceId = null;
    const defaultWorkspace = await db.collection('workspaces').findOne({ slug: 'ops-main' });
    if (defaultWorkspace) {
      workspaceId = defaultWorkspace._id;
    }

    const adminUser = await db.collection('users').findOne({ email: adminEmail });
    if (adminUser) {
      await db.collection('users').updateOne(
        { _id: adminUser._id },
        { 
          $set: { 
            password: hashedPassword,
            role: 'Admin',
            name: adminUser.name || 'System Administrator',
            workspaceId: adminUser.workspaceId || workspaceId,
            suspended: false,
            firstLogin: false
          } 
        }
      );
      console.log('[Re-seed] Updated existing Administrator account successfully.');
    } else {
      await db.collection('users').insertOne({
        email: adminEmail,
        password: hashedPassword,
        name: 'System Administrator',
        role: 'Admin',
        workspaceId: workspaceId,
        suspended: false,
        firstLogin: false,
        createdAt: new Date()
      });
      console.log('[Re-seed] Created new Administrator account successfully.');
    }
  } catch (err) {
    console.error('[Re-seed] Failed to re-seed admin user:', err.message);
  }

  // 5. Verify system settings & configs are preserved
  try {
    const systemConfigs = await db.collection('systemconfigs').countDocuments({});
    console.log(`[Preserved] System Configuration intact (${systemConfigs} config variables found).`);
  } catch (err) {
    console.log('[System] systemconfigs collection check failed or empty:', err.message);
  }

  console.log('Database cleanup and re-seeding complete.');
  await mongoose.disconnect();
  process.exit(0);
}

runCleanup();
