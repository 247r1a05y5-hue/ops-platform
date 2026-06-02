import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, User, ActivityLog } from '@/lib/db';
import { sendEmail, isValidEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { requireCronAuth } from '@/lib/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/task-overdue
 * Vercel Cron: daily at 07:00 (0 7 * * *)
 * Detects tasks where dueDate < now && stage !== 'Done'.
 * Notifies assignee via in-app + email, logs analytics.
 */
export async function GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    await connectDB();
    const now = new Date();

    const overdueTasks = await Task.find({ dueDate: { $lt: now }, stage: { $ne: 'Done' } }).lean();

    let notified = 0, noAssignee = 0, skipped = 0;
    const errors: string[] = [];
    const userCache = new Map<string, any>();

    for (const task of overdueTasks) {
      const identifier = task.assignee as string | undefined;
      if (!identifier) { noAssignee++; continue; }

      try {
        if (!userCache.has(identifier)) {
          const u = await User.findOne({
            $or: [{ email: identifier }, { name: identifier }],
          }).select('_id email name').lean();
          userCache.set(identifier, u || null);
        }
        const user = userCache.get(identifier);
        const dueFmt = task.dueDate ? new Date(task.dueDate as Date).toLocaleDateString() : 'unknown';

        if (user) {
          await createNotification(
            String(user._id),
            `🔴 Overdue Task: ${task.title}`,
            `"${task.title}" was due ${dueFmt} and is still in "${task.stage}".`
          ).catch(e => errors.push(`SSE: ${e.message}`));

          if (isValidEmail(user.email)) {
            await sendEmail({
              event: 'task_update', to: user.email,
              vars: {
                name: user.name, role: 'Team Member',
                action: `Task Overdue: ${task.title}`,
                description: `Task "${task.title}" (${task.priority} priority) was due on ${dueFmt} and is in "${task.stage}". Please update it.`,
              },
            }).catch(e => errors.push(`Email ${user.email}: ${e.message}`));
          }
          notified++;
        } else { skipped++; }
      } catch (e) {
        skipped++;
        errors.push(`Task ${task._id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Stage-level analytics for dashboard
    const analytics = await Task.aggregate([
      { $match: { dueDate: { $lt: now }, stage: { $ne: 'Done' } } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);

    await ActivityLog.create({
      userId: null, name: 'Cron', userEmail: 'system@ops.com', userRole: 'System',
      actionType: 'task_overdue_cron', module: 'Tasks',
      description: `Task overdue cron: ${overdueTasks.length} overdue. Notified: ${notified}, no-assignee: ${noAssignee}.`,
      metadata: { overdueCount: overdueTasks.length, notified, noAssignee, skipped, analytics, errors: errors.slice(0, 20), durationMs: Date.now() - startedAt },
      ip: '127.0.0.1', userAgent: 'VercelCron/1.0', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, overdueCount: overdueTasks.length, notified, noAssignee, skipped, analytics, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TaskOverdueCron] Fatal:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
