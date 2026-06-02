/**
 * scripts/seed-workspace.ts
 * Run: npx tsx scripts/seed-workspace.ts
 * Seeds the default workspace and assigns all existing users to it.
 */
import { connectDB, Workspace, User } from '../src/lib/db';

async function main() {
  await connectDB();

  // Upsert default workspace
  let ws = await Workspace.findOne({ slug: 'default' });
  if (!ws) {
    ws = await Workspace.create({ name: 'Default Workspace', slug: 'default' });
    console.log('[Seed] Created default workspace:', ws._id);
  } else {
    console.log('[Seed] Default workspace already exists:', ws._id);
  }

  // Assign all users without a workspaceId
  const result = await User.updateMany(
    { workspaceId: { $in: [null, undefined] } },
    { $set: { workspaceId: ws._id } }
  );
  console.log(`[Seed] Assigned workspace to ${result.modifiedCount} users`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
