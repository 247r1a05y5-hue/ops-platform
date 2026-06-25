import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, Task } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/team
 * Returns active team members with their open task counts.
 * Uses aggregation (single query) instead of N+1 countDocuments.
 * Also returns raw users list so the dashboard doesn't need /api/users separately.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();

    // Single aggregation: count open tasks grouped by assignee name
    const taskCounts: { _id: string; count: number }[] = await Task.aggregate([
      { $match: { stage: { $ne: 'Done' } } },
      { $group: { _id: '$assignee', count: { $sum: 1 } } },
    ]);
    const taskCountMap = new Map(taskCounts.map(t => [t._id, t.count]));

    // Fetch active users in one query
    const users = await User.find({ suspended: { $ne: true } })
      .select('_id name email role lastLogin status')
      .sort({ name: 1 })
      .limit(20)
      .lean() as any[];

    const now = Date.now();

    const teamData = users.map((u: any) => {
      const lastLogin = u.lastLogin ? new Date(u.lastLogin).getTime() : 0;
      const minutesSinceLogin = (now - lastLogin) / 60000;
      const status =
        u.status === 'Online' ? 'Online' :
        minutesSinceLogin < 30 ? 'Online' :
        minutesSinceLogin < 120 ? 'Away' : 'Offline';

      return {
        id: String(u._id),
        name: u.name,
        email: u.email,
        role:
          u.role === 'Staff' ? 'Employee' :
          u.role === 'User'  ? 'Marketing Rep' : u.role,
        tasks: taskCountMap.get(u.name) || 0,
        status,
      };
    });

    // Also expose raw users list for dropdowns (eliminates /api/users call)
    const usersList = users.map((u: any) => ({
      _id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
    }));

    return NextResponse.json({
      success: true,
      team: teamData,
      users: usersList,
    }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
