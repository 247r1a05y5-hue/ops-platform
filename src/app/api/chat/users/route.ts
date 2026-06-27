import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, User, Workspace } from '@/lib/db';
import { isUserOnline } from '@/lib/chat-sse';
import mongoose from 'mongoose';

/**
 * GET /api/chat/users
 * Returns all users in the ops-main workspace (excluding self), enriched with online status.
 * Bulk-assigns ALL users to ops-main before querying so no one is missed.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  // 1. Get current user's workspace to respect tenant/workspace isolation
  const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
  let workspaceId = currentUser?.workspaceId;

  if (!workspaceId) {
    let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
    if (!mainWs) {
      mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });
    }
    workspaceId = mainWs._id;
    // Assign the user to the main workspace in the database
    await User.findByIdAndUpdate(session.sub, { $set: { workspaceId } });
  }

  // 2. Fetch other non-suspended users in the same workspace (with explicit ObjectId casting for self-exclusion)
  const users = await User.find(
    {
      workspaceId,
      _id: { $ne: new mongoose.Types.ObjectId(session.sub) },
      suspended: { $ne: true }
    },
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
