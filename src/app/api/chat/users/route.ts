import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, User, Workspace } from '@/lib/db';
import { isUserOnline } from '@/lib/chat-sse';

/**
 * GET /api/chat/users
 * Returns all users in the ops-main workspace (excluding self), enriched with online status.
 * Bulk-assigns ALL users to ops-main before querying so no one is missed.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  // Ensure workspace exists
  let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
  if (!mainWs) {
    mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });
  }

  // Bulk-assign ALL users who are not yet in this workspace
  // This guarantees newly-registered users appear immediately
  await User.updateMany(
    { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }, { workspaceId: { $ne: mainWs._id } }] },
    { $set: { workspaceId: mainWs._id } }
  );

  // Fetch ALL other users in this workspace (excluding self)
  const users = await User.find(
    { workspaceId: mainWs._id, _id: { $ne: session.sub } },
    { _id: 1, name: 1, email: 1, role: 1 }
  ).lean() as any[];

  return NextResponse.json({
    success: true,
    users: users.map((u: any) => ({
      _id:      String(u._id),
      name:     u.name,
      email:    u.email,
      role:     u.role,
      isOnline: isUserOnline(String(u._id)),
    })),
  });
}
