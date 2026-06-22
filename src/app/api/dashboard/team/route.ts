import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, Task } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/team
 * Returns active team members with their open task counts.
 * Available to all authenticated roles.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();

    // Fetch active (non-suspended) users, limited to 10 for the widget
    const users = await User.find({ suspended: { $ne: true } })
      .select('_id name role lastLogin')
      .sort({ name: 1 })
      .limit(10)
      .lean();

    // For each user, count their open (non-Done) tasks
    const teamData = await Promise.all(
      users.map(async (u: any) => {
        const openTasks = await Task.countDocuments({
          assignee: u.name,
          stage: { $ne: 'Done' },
        });

        // Determine presence status from lastLogin
        const now = Date.now();
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).getTime() : 0;
        const minutesSinceLogin = (now - lastLogin) / 60000;
        const status =
          minutesSinceLogin < 30 ? 'Online' :
          minutesSinceLogin < 120 ? 'Away' : 'Offline';

        return {
          id: String(u._id),
          name: u.name,
          role:
            u.role === 'Staff' ? 'Employee' :
            u.role === 'User'  ? 'Marketing Rep' : u.role,
          tasks: openTasks,
          status,
        };
      })
    );

    return NextResponse.json({
      success: true,
      team: teamData,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
