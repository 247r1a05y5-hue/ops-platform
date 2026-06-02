import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Message, MessageReadStatus, User, Conversation } from '@/lib/db';
// pushChatSSE via socket-server (imported lazily below)
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/conversations/read
 * Body: { conversationId }
 * Marks all messages in a conversation as read by the current user.
 * Broadcasts read_receipt to other participants via SSE so they can
 * show seen indicators in real time.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  await connectDB();

  // Fetch conversation to get participants
  const conv = await Conversation.findById(conversationId).lean() as any;
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Find the latest message in this conversation
  const latestMessage = await Message.findOne({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  }).sort({ createdAt: -1 }).lean() as any;

  const readAt = latestMessage ? latestMessage.createdAt : new Date();
  const readMsgId = latestMessage ? latestMessage._id : null;

  await MessageReadStatus.findOneAndUpdate(
    { conversationId, userId: session.sub },
    { lastReadAt: readAt, lastReadMsgId: readMsgId },
    { upsert: true }
  );

  // ── Broadcast read_receipt to other participants so they see "Seen" ──────────
  const readReceiptPayload = {
    type:           'read_receipt',
    conversationId,
    userId:         session.sub,
    userName:       session.name,
    readAt:         readAt.toISOString(),
    lastReadMsgId:  readMsgId ? String(readMsgId) : null,
  };

  // Broadcast via Socket.io
  const io = (globalThis as any)._socketIO;
  for (const participantId of conv.participants) {
    if (String(participantId) !== session.sub) {
      if (io) {
        io.to(`user:${String(participantId)}`).emit('chat_event', readReceiptPayload);
      }
    }
  }

  // ── Compute updated unread count for THIS user (for badge sync across tabs) ──
  const currentUser = await User.findById(session.sub).lean() as any;
  const workspaceId = currentUser?.workspaceId;

  if (workspaceId) {
    const conversations = await Conversation.find({
      workspaceId,
      participants: session.sub,
    }).lean() as any[];

    const convIds = conversations.map((c: any) => c._id);
    const readStatuses = await MessageReadStatus.find({
      userId: session.sub,
      conversationId: { $in: convIds },
    }).lean() as any[];

    const readMap = new Map<string, Date | null>();
    for (const rs of readStatuses) {
      readMap.set(String(rs.conversationId), rs.lastReadAt);
    }

    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds.map((id: any) => new mongoose.Types.ObjectId(String(id))) },
          senderId: { $ne: new mongoose.Types.ObjectId(session.sub) },
          deleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$conversationId',
          messages: { $push: { createdAt: '$createdAt' } },
        },
      },
    ]);

    let totalUnread = 0;
    for (const agg of unreadAgg) {
      const convId = String(agg._id);
      const lastRead = readMap.get(convId) ?? null;
      const count = lastRead
        ? agg.messages.filter((m: any) => m.createdAt > lastRead).length
        : agg.messages.length;
      totalUnread += count;
    }

    // Push to other tabs of this user via Socket.io
    if (io) {
      io.to(`user:${session.sub}`).emit('chat_event', {
        type:         'unread_update',
        conversationId,
        unreadCount:  0,
        totalUnread,
      });
    }
  }

  return NextResponse.json({ success: true });
}
