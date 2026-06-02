import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, User, Workspace } from '@/lib/db';

/**
 * GET /api/chat/search?q=&conversationId?=&limit=
 * MongoDB $text search across all messages the user can access in their workspace.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const conversationId = searchParams.get('conversationId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);

  if (!q || q.length < 2)
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });

  await connectDB();

  const currentUser = await User.findById(session.sub).lean() as any;
  if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const workspaceId = currentUser.workspaceId;
  if (!workspaceId) return NextResponse.json({ success: true, results: [] });

  // Scope to conversations this user participates in
  const convIds = conversationId
    ? [conversationId]
    : await Conversation.find({ workspaceId, participants: session.sub }).distinct('_id');

  const results = await Message.find({
    $text: { $search: q },
    conversationId: { $in: convIds },
    deleted: { $ne: true },
  } as any)
    .sort({ score: { $meta: 'textScore' } as any, createdAt: -1 })
    .limit(limit)
    .lean() as any[];

  return NextResponse.json({
    success: true,
    results: results.map((m: any) => ({
      _id:            String(m._id),
      conversationId: String(m.conversationId),
      senderId:       String(m.senderId),
      senderName:     m.senderName,
      body:           m.body,
      createdAt:      m.createdAt,
    })),
  });
}
