import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation } from '@/lib/db';
import { getIO } from '@/lib/socket-server';

/**
 * POST /api/chat/typing
 *
 * HTTP fallback for typing indicators. In normal operation, clients emit
 * typing events directly via socket.emit('typing', ...) — this route only
 * handles cases where the socket connection is temporarily unavailable.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, isTyping } = await req.json();
  if (!conversationId)
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

  await connectDB();

  const conv = await Conversation.findById(conversationId).lean() as any;
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
  if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Broadcast via Socket.IO
  const io = getIO();
  if (io) {
    const payload = {
      type:           'typing',
      conversationId,
      userId:         session.sub,
      name:           session.name,
      isTyping:       !!isTyping,
    };
    io.to(`conv:${conversationId}`).except(`user:${session.sub}`).emit('chat_event', payload);
  }

  return NextResponse.json({ success: true });
}
