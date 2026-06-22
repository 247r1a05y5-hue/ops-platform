import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, Lead, ActivityLog, User } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

/**
 * GET /api/employee/performance
 * Returns performance metrics for the authenticated user.
 * Admins/Managers can pass ?userId= to view any user's stats.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  let targetUserId = searchParams.get('userId') || session.sub;
  if (!['Admin', 'Manager'].includes(session.role)) targetUserId = session.sub;

  try {
    await connectDB();
    const targetUser = await User.findById(targetUserId).select('name email role').lean() as any;
    if (!targetUser) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1); // start of this month

    const [taskTotal, taskDone, taskOverdue, taskByStage] = await Promise.all([
      Task.countDocuments({ assignee: { $in: [targetUser.email, targetUser.name] } }),
      Task.countDocuments({ assignee: { $in: [targetUser.email, targetUser.name] }, stage: 'Done' }),
      Task.countDocuments({ assignee: { $in: [targetUser.email, targetUser.name] }, dueDate: { $lt: now }, stage: { $ne: 'Done' } }),
      Task.aggregate([{ $match: { assignee: { $in: [targetUser.email, targetUser.name] } } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    ]);

    const [leadsAssigned, leadsByStage, leadsClosedMonth] = await Promise.all([
      Lead.countDocuments({ assignedTo: targetUserId }),
      Lead.aggregate([{ $match: { assignedTo: targetUserId as any } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
      Lead.countDocuments({ assignedTo: targetUserId as any, stage: 'Closing', createdAt: { $gte: start } }),
    ]);

    const pipelineAgg = await Lead.aggregate([
      { $match: { assignedTo: targetUserId as any } },
      { $addFields: { numericValue: { $toDouble: { $replaceAll: { input: { $replaceAll: { input: { $ifNull: ['$value', '0'] }, find: '$', replacement: '' } }, find: ',', replacement: '' } } } } },
      { $group: { _id: null, total: { $sum: '$numericValue' } } },
    ]);
    const pipelineValue = pipelineAgg[0]?.total || 0;

    const emailsSentMonth = await ActivityLog.countDocuments({ userId: targetUserId, actionType: 'email_sent', timestamp: { $gte: start } });

    const activityByType = await ActivityLog.aggregate([
      { $match: { userId: targetUserId as any, timestamp: { $gte: start } } },
      { $group: { _id: '$actionType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 10 },
    ]);

    const recentActivity = await ActivityLog.find({ userId: targetUserId }).sort({ timestamp: -1 }).limit(10).lean();

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyTasksDone = await Task.aggregate([
      { $match: { assignee: { $in: [targetUser.email, targetUser.name] }, stage: 'Done', createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return NextResponse.json({
      success: true,
      user: { id: String(targetUser._id), name: targetUser.name, email: targetUser.email, role: targetUser.role },
      tasks: { total: taskTotal, done: taskDone, overdue: taskOverdue, completionRate: taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0, byStage: taskByStage, monthlyCompleted: monthlyTasksDone },
      leads: { assigned: leadsAssigned, closedThisMonth: leadsClosedMonth, byStage: leadsByStage, pipelineValue },
      emails: { sentThisMonth: emailsSentMonth, activityByType },
      recentActivity,
      generatedAt: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  }
}
