/**
 * scripts/seed.ts — Development/staging data seeder
 * Run: npx ts-node --project tsconfig.json scripts/seed.ts
 * Never imported in API routes.
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Dynamically import models
  const { Task, Invoice, Lead } = await import('../src/lib/db');

  const taskCount = await Task.countDocuments();
  if (taskCount === 0) {
    await Task.create([
      { title: 'Design onboarding email sequence', priority: 'High', stage: 'In Progress', dueDate: new Date(Date.now() + 2 * 86400000), assignee: 'Demo User', tags: ['Marketing'] },
      { title: 'Follow-up with Acme Corp lead',    priority: 'Medium', stage: 'Backlog',     dueDate: new Date(Date.now() + 3 * 86400000), assignee: 'Demo User', tags: ['CRM'] },
      { title: 'Prepare invoice',                  priority: 'Low',    stage: 'Backlog',     dueDate: new Date(Date.now() + 7 * 86400000), assignee: 'Demo User', tags: ['Finance'] },
    ]);
    console.log('Seeded 3 tasks');
  }

  const invoiceCount = await Invoice.countDocuments();
  if (invoiceCount === 0) {
    await Invoice.create([
      { invoiceId: 'INV-001', client: 'Demo Client', amount: '$10,000', status: 'Paid',    due: 'Paid', clientEmail: 'demo@example.com' },
      { invoiceId: 'INV-002', client: 'Beta Corp',   amount: '$5,000',  status: 'Pending', due: 'In 7 Days', clientEmail: 'beta@example.com' },
    ]);
    console.log('Seeded 2 invoices');
  }

  await mongoose.disconnect();
  console.log('Seeding complete');
}

seed().catch(e => { console.error(e); process.exit(1); });
