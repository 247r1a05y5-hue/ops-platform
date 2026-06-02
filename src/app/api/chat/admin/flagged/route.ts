import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Message, User } from '@/lib/db';

/**
 * GET /api/chat/admin/flagged
 * Admin only. Returns all flagged messages in the current user's workspace.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await connectDB();

  const currentUser = await User.findById(session.sub).lean() as any;
  const workspaceId = currentUser?.workspaceId;

  const filter: any = { flagged: true };
  if (workspaceId) filter.workspaceId = workspaceId;

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean() as any[];

  return NextResponse.json({
    success: true,
    messages: messages.map((m: any) => ({
      _id:            String(m._id),
      conversationId: String(m.conversationId),
      senderId:       String(m.senderId),
      senderName:     m.senderName,
      body:           m.body,
      createdAt:      m.createdAt,
      flagReason:     m.flagReason ?? '',
      flaggedBy:      m.flaggedBy ? String(m.flaggedBy) : null,
    })),
  });
}
