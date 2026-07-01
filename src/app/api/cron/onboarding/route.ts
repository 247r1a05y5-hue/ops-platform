import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, Project, Task, ActivityLog } from '@/lib/db';
import { sendEmail, isValidEmail } from '@/lib/email';
import { requireCronAuth } from '@/lib/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STARTER_TASKS = [
  { title: 'Initial discovery call',    description: 'Schedule and complete onboarding discovery call with the client.', priority: 'High',   days: 1 },
  { title: 'Send welcome pack',          description: 'Email the welcome package and platform access credentials.',        priority: 'High',   days: 2 },
  { title: 'Configure integrations',    description: 'Set up required integrations or tools for the client.',             priority: 'Medium', days: 5 },
  { title: 'Kickoff presentation',      description: 'Deliver the project kickoff presentation.',                          priority: 'Medium', days: 7 },
  { title: 'Set up project workspace',  description: 'Create project boards, folders, and shared resources.',             priority: 'Low',    days: 10 },
];

/**
 * GET /api/cron/onboarding
 * Vercel Cron: hourly (0 * * * *)
 * When Lead: onboardingReady=true && paymentStatus='paid' && onboardingDoneAt=null
 *   → send onboarding email
 *   → create Project
 *   → create 5 starter Tasks
 *   → stamp lead.onboardingDoneAt
 */
async function _GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    await connectDB();

    const leads = await Lead.find({
      onboardingReady:  true,
      paymentStatus:    'paid',
      onboardingDoneAt: null,
    }).select('_id name email company assignedToName value').lean();

    let processed = 0, failed = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const leadDoc = await Lead.findById(lead._id);
        if (!leadDoc) continue;

        // 1. Create Project
        const project = await Project.create({
          name:        `Onboarding — ${lead.company || lead.name}`,
          description: `Auto-created onboarding project for ${lead.name} (${lead.email})`,
          deadline:    new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0],
          owner:       lead.assignedToName || 'Unassigned',
          createdBy:   'Onboarding Automation',
        });

        // 2. Create starter Tasks
        await Task.insertMany(STARTER_TASKS.map(t => ({
          title:       t.title,
          description: t.description,
          stage:       'Backlog',
          priority:    t.priority,
          assignee:    lead.assignedToName || '',
          dueDate:     new Date(Date.now() + t.days * 86_400_000),
          projectId:   project._id,
          createdBy:   'Onboarding Automation',
        })));

        // 3. Send onboarding email
        if (isValidEmail(lead.email)) {
          await sendEmail({
            event: 'welcome', to: lead.email,
            vars: { name: lead.name, role: 'Client' },
          }).catch(e => errors.push(`Email ${lead.email}: ${e.message}`));
        }

        // 4. Stamp lead
        leadDoc.onboardingDoneAt = new Date();
        leadDoc.history.push({ event: `Onboarding automation triggered — project "${project.name}" created`, user: 'System', time: new Date() });
        await leadDoc.save();

        processed++;
        console.log(`[OnboardingCron] Onboarded lead ${lead._id} → project ${project._id}`);
      } catch (e) {
        failed++;
        errors.push(`Lead ${lead._id}: ${e instanceof Error ? e.message : e}`);
        console.error('[OnboardingCron] Error:', e);
      }
    }

    await ActivityLog.create({
      userId: null, name: 'Cron', userEmail: 'system@ops.com', userRole: 'System',
      actionType: 'onboarding_cron', module: 'Onboarding',
      description: `Onboarding cron: processed ${processed} leads, failed: ${failed}.`,
      metadata: { processed, failed, errors: errors.slice(0, 20), durationMs: Date.now() - startedAt },
      ip: '127.0.0.1', userAgent: 'VercelCron/1.0', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, processed, failed, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OnboardingCron] Fatal:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
