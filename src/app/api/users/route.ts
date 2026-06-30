// src/app/api/users/route.ts
// Returns all workspace users for use in dropdowns (Assign To, Project Owner, etc.)
// Requires authentication — never exposes passwords or sensitive fields.
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();

    // Resolve the current user's workspaceId to scope the query
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    const workspaceFilter = currentUser?.workspaceId ? { workspaceId: currentUser.workspaceId } : {};

    const users = await User.find({
      ...workspaceFilter,
      suspended: { $ne: true },
      deleted: { $ne: true }
    })
      .select('_id name email role status department')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    console.error('[/api/users]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
