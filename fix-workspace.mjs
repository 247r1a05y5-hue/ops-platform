import dotenv from 'dotenv';
import dns from 'dns';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config({ path: path.join(__dirname, '.env.local') });

const { Schema, model, models } = mongoose;

const WorkspaceSchema = new Schema({
  name: String,
  slug: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new Schema({
  email: String,
  name: String,
  role: String,
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null }
});

const Workspace = models.Workspace || model('Workspace', WorkspaceSchema);
const User = models.User || model('User', UserSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Upsert ops-main workspace
  let ws = await Workspace.findOneAndUpdate(
    { slug: 'ops-main' },
    { $setOnInsert: { name: 'Main Workspace', slug: 'ops-main' } },
    { upsert: true, new: true }
  );
  console.log('✓ Workspace ops-main:', ws._id.toString());

  // Force-assign ALL users
  const result = await User.updateMany({}, { $set: { workspaceId: ws._id } });
  console.log(`✓ Assigned ${result.modifiedCount} user(s) to workspace`);

  // List all users
  const users = await User.find({}, { email: 1, name: 1, role: 1, workspaceId: 1 }).lean();
  console.log('\nAll users in workspace:');
  for (const u of users) {
    console.log(`  [${u.role}] ${u.name} <${u.email}> ws=${u.workspaceId}`);
  }
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
