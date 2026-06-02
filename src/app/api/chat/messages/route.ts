import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, MessageReadStatus } from '@/lib/db';
import mongoose from 'mongoose';

/**
 * GET /api/chat/messages
 * ?conversationId= &cursor= &limit= &threadId= (for thread view)
 * Returns messages with reactions, attachments, reply counts, and flag info.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const threadId = searchParams.get('threadId');
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '40', 10), 100);

  if (!conversationId && !threadId)
    return NextResponse.json({ error: 'conversationId or threadId required' }, { status: 400 });

  await connectDB();

  if (conversationId) {
    const conv = await Conversation.findById(conversationId).lean() as any;
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
    if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filter: any = {};

  if (threadId) {
    filter.parentMessageId = new mongoose.Types.ObjectId(threadId);
    if (conversationId) filter.conversationId = new mongoose.Types.ObjectId(conversationId);
  } else {
    filter.conversationId = new mongoose.Types.ObjectId(conversationId!);
    filter.parentMessageId = null;
  }

  if (cursor) filter.createdAt = { $lt: new Date(cursor) };

  const messages = await Message.find(filter)
    .sort({ createdAt: threadId ? 1 : -1 })
    .limit(limit + 1)
    .lean() as any[];

  const hasMore = messages.length > limit;
  const page = threadId
    ? messages.slice(0, limit)
    : messages.slice(0, limit).reverse();

  // Reply counts for top-level messages
  const msgIds = page.map((m: any) => m._id);
  const replyCounts = await Message.aggregate([
    { $match: { parentMessageId: { $in: msgIds }, deleted: { $ne: true } } },
    { $group: { _id: '$parentMessageId', count: { $sum: 1 } } },
  ]);
  const replyCountMap = new Map(replyCounts.map((r: any) => [String(r._id), r.count]));

  // Mark read (only in conversation mode)
  if (!threadId && conversationId && page.length > 0) {
    const latest = page[page.length - 1];
    await MessageReadStatus.findOneAndUpdate(
      { conversationId, userId: session.sub },
      { lastReadAt: (latest as any).createdAt, lastReadMsgId: (latest as any)._id },
      { upsert: true }
    );
  }

  const isAdmin = session.role === 'Admin';

  return NextResponse.json({
    success: true,
    messages: page
      .filter((m: any) => !m.deleted || isAdmin)
      .map((m: any) => ({
        _id:             String(m._id),
        conversationId:  String(m.conversationId),
        senderId:        String(m.senderId),
        senderName:      m.senderName,
        body:            m.deleted ? '[Message deleted]' : m.body,
        createdAt:       m.createdAt,
        editedAt:        m.editedAt,
        deleted:         m.deleted ?? false,
        parentMessageId: m.parentMessageId ? String(m.parentMessageId) : null,
        replyCount:      replyCountMap.get(String(m._id)) ?? 0,
        attachments:     m.attachments ?? [],
        reactions:       (m.reactions ?? []).map((r: any) => ({
          emoji: r.emoji,
          users: r.users.map(String),
          count: r.users.length,
        })),
        flagged:    m.flagged ?? false,
        flagReason: isAdmin ? (m.flagReason ?? '') : '',
      })),
    hasMore,
    nextCursor: hasMore && page.length > 0 ? (page[0] as any).createdAt.toISOString() : null,
  });
}
