import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, MessageReadStatus, User, Workspace } from '@/lib/db';
import { getIO } from '@/lib/socket-server';

/**
 * GET /api/chat/send
 * Retrieve current JWT session token (for explicit Socket.io auth)
 */
async function _GET(req: NextRequest) {
  const token = req.cookies.get('ops_session')?.value;
  if (!token) return NextResponse.json({ error: 'No session' }, { status: 401 });
  return NextResponse.json({ token });
}

/**
 * POST /api/chat/send
 * Body: { conversationId?, recipientId?, body, attachments?, parentMessageId? }
 *
 * Broadcasts new messages via Socket.IO (pushes to conversation room +
 * individual user rooms).
 */
async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, recipientId, body, attachments, parentMessageId } = await req.json();
  if (!body?.trim() && (!attachments || attachments.length === 0))
    return NextResponse.json({ error: 'Message body or attachment required' }, { status: 400 });

  await connectDB();

  const sender = await User.findById(session.sub).lean() as any;
  if (!sender) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Ensure workspace and bulk-assign ALL users (idempotent)
  let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
  if (!mainWs) mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });
  await User.updateMany(
    { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }, { workspaceId: { $ne: mainWs._id } }] },
    { $set: { workspaceId: mainWs._id } }
  );
  const workspaceId = mainWs._id;

  let conv: any;

  if (conversationId) {
    conv = await Conversation.findOne({ _id: conversationId, workspaceId });
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
    if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (recipientId) {
    conv = await Conversation.findOne({
      workspaceId,
      type: 'direct',
      participants: { $all: [session.sub, recipientId], $size: 2 },
    });
    if (!conv) {
      conv = await Conversation.create({
        workspaceId,
        type: 'direct',
        participants: [session.sub, recipientId],
      });
    }
  } else {
    return NextResponse.json({ error: 'conversationId or recipientId required' }, { status: 400 });
  }

  const messageData: any = {
    conversationId: conv._id,
    workspaceId,
    senderId:   session.sub,
    senderName: session.name,
    body:       body?.trim() ?? '',
  };

  if (parentMessageId) messageData.parentMessageId = parentMessageId;
  if (attachments?.length) messageData.attachments = attachments;

  const msg = await Message.create(messageData);

  if (!parentMessageId) {
    await Conversation.findByIdAndUpdate(conv._id, {
      lastMessage:   (body?.trim() ?? '').slice(0, 120) || '[attachment]',
      lastMessageAt: msg.createdAt,
      lastMessageBy: session.sub,
    });
  }

  await MessageReadStatus.findOneAndUpdate(
    { conversationId: conv._id, userId: session.sub },
    { lastReadAt: msg.createdAt, lastReadMsgId: msg._id },
    { upsert: true }
  );

  const eventType = parentMessageId ? 'thread_reply' : 'new_message';
  const payload = {
    type: eventType,
    message: {
      _id:             String(msg._id),
      conversationId:  String(conv._id),
      senderId:        session.sub,
      senderName:      session.name,
      body:            msg.body,
      createdAt:       msg.createdAt,
      parentMessageId: parentMessageId ?? null,
      attachments:     (msg as any).attachments ?? [],
      reactions:       [],
      replyCount:      0,
      deleted:         false,
    },
  };

  // Broadcast via Socket.IO
  const io = getIO();
  if (io) {
    // Emit to the conversation room (all participants who joined it)
    io.to(`conv:${String(conv._id)}`).emit('chat_event', payload);
    // Also push to individual user rooms for participants NOT in the conv room
    for (const participantId of conv.participants) {
      io.to(`user:${String(participantId)}`).emit('chat_event', payload);
    }
  } else {
    // Should never happen on VPS — log a warning
    console.warn('[chat/send] Socket.IO not available — message saved but not broadcast in realtime');
  }

  return NextResponse.json({
    success: true,
    message: {
      _id:             String(msg._id),
      conversationId:  String(conv._id),
      body:            msg.body,
      createdAt:       msg.createdAt,
      parentMessageId: parentMessageId ?? null,
      attachments:     (msg as any).attachments ?? [],
    },
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
