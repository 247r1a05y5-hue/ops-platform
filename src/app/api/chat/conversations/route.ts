import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, MessageReadStatus, User, Workspace } from '@/lib/db';
import { isUserOnline } from '@/lib/chat-sse';
import mongoose from 'mongoose';

/**
 * GET /api/chat/conversations
 * Returns all conversations the current user participates in,
 * enriched with unread counts and other participant details.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  // Ensure workspace exists and ALL users are assigned (not just current user)
  let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
  if (!mainWs) mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });

  await User.updateMany(
    { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }, { workspaceId: { $ne: mainWs._id } }] },
    { $set: { workspaceId: mainWs._id } }
  );

  const currentUser = await User.findById(session.sub).lean() as any;
  if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const workspaceId = mainWs._id;

  // Fetch conversations for this user in their workspace
  const conversations = await Conversation.find({
    workspaceId,
    participants: session.sub,
  })
    .sort({ lastMessageAt: -1 })
    .lean() as any[];

  if (conversations.length === 0) {
    return NextResponse.json({ success: true, conversations: [], totalUnread: 0 });
  }

  // Batch-fetch read statuses for this user
  const convIds = conversations.map((c: any) => c._id);
  const readStatuses = await MessageReadStatus.find({
    userId: session.sub,
    conversationId: { $in: convIds },
  }).lean() as any[];

  const readMap = new Map<string, Date | null>();
  for (const rs of readStatuses) {
    readMap.set(String(rs.conversationId), rs.lastReadAt);
  }

  // Batch-fetch unread counts using aggregation
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
        latestCreatedAt: { $max: '$createdAt' },
        messages: { $push: { _id: '$_id', createdAt: '$createdAt' } },
      },
    },
  ]);

  // Build unread count per conversation
  const unreadMap = new Map<string, number>();
  for (const agg of unreadAgg) {
    const convId = String(agg._id);
    const lastRead = readMap.get(convId) ?? null;
    const count = lastRead
      ? agg.messages.filter((m: any) => m.createdAt > lastRead).length
      : agg.messages.length;
    unreadMap.set(convId, count);
  }

  // Collect all participant IDs to resolve names
  const allParticipantIds = new Set<string>();
  for (const c of conversations) {
    for (const p of c.participants) allParticipantIds.add(String(p));
  }
  const users = await User.find(
    { _id: { $in: Array.from(allParticipantIds) } },
    { _id: 1, name: 1, email: 1, role: 1 }
  ).lean() as any[];
  const userMap = new Map(users.map((u: any) => [String(u._id), u]));

  let totalUnread = 0;
  const result = conversations.map((c: any) => {
    const convId = String(c._id);
    const unread = unreadMap.get(convId) ?? 0;
    totalUnread += unread;

    const otherParticipants = c.participants
      .filter((p: any) => String(p) !== session.sub)
      .map((p: any) => {
        const u = userMap.get(String(p));
        return u 
          ? { _id: String(u._id), name: u.name, email: u.email, isOnline: isUserOnline(String(u._id)) } 
          : { _id: String(p), name: 'Unknown', email: '', isOnline: false };
      });

    return {
      _id: convId,
      type: c.type,
      name: c.name || (otherParticipants[0]?.name ?? 'Chat'),
      participants: c.participants.map(String),
      otherParticipants,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: unread,
      workspaceId: String(c.workspaceId),
    };
  });

  return NextResponse.json({ success: true, conversations: result, totalUnread });
}
