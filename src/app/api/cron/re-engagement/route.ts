import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, User, ActivityLog } from '@/lib/db';
import { sendEmail, isValidEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { requireCronAuth } from '@/lib/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STALE_DAYS = 30;

/**
 * GET /api/cron/re-engagement
 * Vercel Cron: weekly Monday 09:00 (0 9 * * 1)
 * Finds leads that have NOT moved stage in 30+ days (excluding Closing & archived)
 * and emails the assigned user + notifies in-app.
 */
export async function GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    await connectDB();
    const cutoff = new Date(Date.now() - STALE_DAYS * 864e5);
    const skipStages = ['Closing', 'Archived', 'Won', 'Lost'];

    // Use aggregation to find leads where the latest history entry is older than cutoff
    const staleLeads = await Lead.find({
      stage:     { $nin: skipStages },
      updatedAt: { $lte: cutoff },
    })
      .select('_id name email company stage assignedTo assignedToName value')
      .lean();

    let notified = 0, skipped = 0;
    const errors: string[] = [];
    const userCache = new Map<string, any>();

    for (const lead of staleLeads) {
      try {
        const assignedToId = String(lead.assignedTo || '');
        if (!assignedToId) { skipped++; continue; }

        if (!userCache.has(assignedToId)) {
          const u = await User.findById(assignedToId).select('email name role').lean();
          userCache.set(assignedToId, u || null);
        }
        const assignee = userCache.get(assignedToId);
        if (!assignee) { skipped++; continue; }

        const stageStr = lead.stage as string;
        const desc = `Lead "${lead.name}" (${lead.company}) has been in the "${stageStr}" stage for over ${STALE_DAYS} days. Review and take action to move the deal forward.`;

        // In-app notification
        await createNotification(
          assignedToId,
          `⏳ Stale Lead: ${lead.name}`,
          desc
        ).catch(e => errors.push(`SSE ${lead._id}: ${e.message}`));

        // Email
        if (isValidEmail(assignee.email)) {
          await sendEmail({
            event: 'task_update',
            to: assignee.email,
            vars: {
              name:        assignee.name,
              role:        assignee.role || 'Team Member',
              action:      `Lead Re-engagement Alert: ${lead.name}`,
              description: desc,
            },
          }).catch(e => errors.push(`Email ${assignee.email}: ${e.message}`));
        }

        notified++;
      } catch (e) {
        skipped++;
        errors.push(`Lead ${lead._id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await ActivityLog.create({
      userId: null, name: 'Cron', userEmail: 'system@ops.com', userRole: 'System',
      actionType: 're_engagement_cron', module: 'CRM',
      description: `Re-engagement cron: ${staleLeads.length} stale leads. Notified: ${notified}, skipped: ${skipped}.`,
      metadata: { staleCount: staleLeads.length, notified, skipped, errors: errors.slice(0, 20), durationMs: Date.now() - startedAt },
      ip: '127.0.0.1', userAgent: 'VercelCron/1.0', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, staleCount: staleLeads.length, notified, skipped, durationMs: Date.now() - startedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ReEngagementCron]', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
