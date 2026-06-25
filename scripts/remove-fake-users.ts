/**
 * scripts/remove-fake-users.ts
 * Deletes the demo/fake user accounts (Maya Thompson, Mateo Rivera, Priya Patel)
 * from the database. These were seeded as demo data and have no real login.
 * 
 * Run: npx tsx scripts/remove-fake-users.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function removeFakeUsers() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const UserSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');

  // These are the fake demo emails that were never real login accounts
  const fakeEmails = [
    'm.thompson@ops.co',
    'm.rivera@ops.co',
    'p.patel@ops.co',
  ];

  const fakeNames = [
    'Maya Thompson',
    'Mateo Rivera',
    'Priya Patel',
  ];

  // Delete by fake email OR fake name (covers both cases)
  const result = await User.deleteMany({
    $or: [
      { email: { $in: fakeEmails } },
      { name: { $in: fakeNames } },
    ]
  });

  console.log(`✅ Deleted ${result.deletedCount} fake user(s)`);

  await mongoose.disconnect();
  console.log('Done. Database now only contains real users.');
}

removeFakeUsers().catch(e => { console.error(e); process.exit(1); });
