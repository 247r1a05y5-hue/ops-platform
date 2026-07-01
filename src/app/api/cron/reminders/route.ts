import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Reminder, User, ActivityLog } from '@/lib/db';
import { sendEmail, isValidEmail } from '@/lib/email';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { createNotification } from '@/lib/notifications';
import { requireCronAuth } from '@/lib/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/reminders
 * Vercel Cron: daily at 08:00 (0 8 * * *)
 * Scans Reminder where dueAt <= now && completed=false,
 * notifies assigned user via in-app + email + WhatsApp,
 * appends history entry.
 */
async function _GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    await connectDB();
    const now = new Date();

    const reminders = await Reminder.find({ dueAt: { $lte: now }, completed: false })
      .populate('assignedTo', 'email name phone')
      .lean();

    let notified = 0, skipped = 0;
    const errors: string[] = [];

    for (const reminder of reminders) {
      try {
        const assignee = reminder.assignedTo as any;
        if (!assignee) { skipped++; continue; }

        const dueStr = new Date(reminder.dueAt).toLocaleString();

        // 1. In-app SSE notification
        await createNotification(
          String(assignee._id),
          `⏰ Reminder Due: ${reminder.title}`,
          `Your reminder "${reminder.title}" was due on ${dueStr}.`
        ).catch(e => errors.push(`SSE: ${e.message}`));

        // 2. Email
        if (isValidEmail(assignee.email)) {
          await sendEmail({
            event: 'task_update', to: assignee.email,
            vars: {
              name: assignee.name, role: 'Team Member',
              action: `Reminder Due: ${reminder.title}`,
              description: `Your follow-up "${reminder.title}" was due on ${dueStr}. ${reminder.description || ''}`,
            },
          }).catch(e => errors.push(`Email ${assignee.email}: ${e.message}`));
        }

        // 3. WhatsApp (if phone on record)
        const phone = assignee.phone?.replace(/[^0-9]/g, '');
        if (phone) {
          await sendWhatsAppMessage(
            phone,
            `⏰ *Reminder Due!*\n\nHi ${assignee.name},\n\nYour follow-up *"${reminder.title}"* was due on ${dueStr}.\n\n${reminder.description ? `Details: ${reminder.description}` : ''}Please action this in the OPS platform.`
          ).catch(e => errors.push(`WA: ${e.message}`));
        }

        // 4. Update history
        await Reminder.updateOne(
          { _id: reminder._id },
          {
            $set:  { notified: true },
            $push: { history: { event: `Notified at ${new Date().toISOString()}`, at: new Date() } },
          }
        );
        notified++;
      } catch (e) {
        skipped++;
        errors.push(`Reminder ${reminder._id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    await ActivityLog.create({
      userId: null, name: 'Cron', userEmail: 'system@ops.com', userRole: 'System',
      actionType: 'reminder_cron', module: 'Reminders',
      description: `Reminder cron: notified ${notified}, skipped ${skipped}.`,
      metadata: { notified, skipped, errors: errors.slice(0, 20), durationMs: Date.now() - startedAt },
      ip: '127.0.0.1', userAgent: 'VercelCron/1.0', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, notified, skipped, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ReminderCron] Fatal:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
