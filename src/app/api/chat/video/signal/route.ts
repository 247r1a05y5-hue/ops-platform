import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getIO, storePendingSignal } from '@/lib/socket-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/video/signal
 *
 * HTTP fallback for call signaling when the Socket.IO client is temporarily
 * disconnected. In normal operation, signaling flows through socket.emit('signal').
 *
 * Valid signal types: ring, answer, reject, hangup
 * (ICE candidates are always sent via socket, not this route)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, targetUserId, conversationId, workspaceId } = body;

  if (!type || !targetUserId) {
    return NextResponse.json({ error: 'type and targetUserId are required' }, { status: 400 });
  }

  const validTypes = ['ring', 'answer', 'reject', 'hangup'];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid signal type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 },
    );
  }

  const payload = {
    type:           'vid_signal',
    subtype:        type,
    from:           session.sub,
    fromName:       session.name,
    conversationId: conversationId ?? null,
    workspaceId:    workspaceId ?? null,
  };

  const io = getIO();
  if (io) {
    const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
    const delivered  = targetRoom && targetRoom.size > 0;

    if (delivered) {
      io.to(`user:${targetUserId}`).emit('chat_event', payload);
      return NextResponse.json({ success: true });
    } else {
      // Queue for delivery when user reconnects (ring/answer/reject/hangup only — not ICE)
      storePendingSignal(targetUserId, payload);
      console.info(`[video/signal] ${type} → ${targetUserId}: queued (no live socket)`);
      return NextResponse.json({ success: true, queued: true });
    }
  }

  // Socket.IO unavailable — this should not happen on VPS
  console.error('[video/signal] Socket.IO not initialized — signal lost');
  return NextResponse.json({ error: 'Realtime server unavailable' }, { status: 503 });
}
