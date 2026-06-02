import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation } from '@/lib/db';

/**
 * POST /api/chat/typing
 *
 * NOTE: With Socket.io, typing events are now emitted directly from the
 * client via socket.emit('typing', ...) — this HTTP route is a fallback
 * for environments where the socket connection isn't available.
 *
 * The socket server handles typing relay in its 'typing' event handler,
 * so this route is largely unused but kept for backwards compatibility.
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

  // Broadcast via Socket.io if available
  // globalThis._socketIO → set by server.mjs (Railway combined server)
  // globalThis._io       → set by src/lib/socket-server.ts (fallback)
  const io = (globalThis as any)._socketIO ?? (globalThis as any)._io;
  if (io) {
    const payload = {
      type: 'typing',
      conversationId,
      userId: session.sub,
      name: session.name,
      isTyping: !!isTyping,
    };
    io.to(`conv:${conversationId}`).except(`user:${session.sub}`).emit('chat_event', payload);
  }

  return NextResponse.json({ success: true });
}
