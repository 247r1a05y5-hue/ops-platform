import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Message, Conversation } from '@/lib/db';
import mongoose from 'mongoose';

/**
 * GET /api/chat/thread?parentMessageId=&limit=
 * Returns the parent message and all replies for a thread.
 */
async function _GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parentMessageId = searchParams.get('parentMessageId');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  if (!parentMessageId)
    return NextResponse.json({ error: 'parentMessageId required' }, { status: 400 });

  await connectDB();

  const parent = await Message.findById(parentMessageId).lean() as any;
  if (!parent) return NextResponse.json({ error: 'Parent message not found' }, { status: 404 });

  const conv = await Conversation.findById(parent.conversationId).lean() as any;
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
  if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const replies = await Message.find({
    parentMessageId: new mongoose.Types.ObjectId(parentMessageId),
    deleted: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean() as any[];

  const formatMsg = (m: any) => ({
    _id:             String(m._id),
    conversationId:  String(m.conversationId),
    senderId:        String(m.senderId),
    senderName:      m.senderName,
    body:            m.deleted ? '[Message deleted]' : m.body,
    createdAt:       m.createdAt,
    attachments:     m.attachments ?? [],
    reactions:       (m.reactions ?? []).map((r: any) => ({
      emoji: r.emoji,
      users: r.users.map(String),
      count: r.users.length,
    })),
    replyCount:      0,
    deleted:         m.deleted ?? false,
    parentMessageId: m.parentMessageId ? String(m.parentMessageId) : null,
    flagged:         m.flagged ?? false,
  });

  return NextResponse.json({
    success: true,
    parent:  formatMsg(parent),
    replies: replies.map(formatMsg),
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
