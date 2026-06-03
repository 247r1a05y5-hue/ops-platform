import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/video/signal
 *
 * HTTP fallback for Jitsi calling signaling when Socket.io isn't available.
 * With Socket.io, the client emits 'signal' events directly.
 * This route handles cases where the socket connection is temporarily down.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, targetUserId, conversationId, workspaceId, sdp, candidate } = body;

  if (!type || !targetUserId) {
    return NextResponse.json({ error: 'type and targetUserId are required' }, { status: 400 });
  }

  const validTypes = ['ring', 'answer', 'reject', 'hangup', 'ice', 'ice_restart', 'offer', 'call-user', 'incoming-call', 'accept-call', 'ice-candidate', 'end-call'];
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
    sdp:            sdp ?? null,
    candidate:      candidate ?? null,
  };

  const io = (globalThis as any)._socketIO;
  if (io) {
    const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
    const delivered = targetRoom && targetRoom.size > 0;
    if (delivered) {
      io.to(`user:${targetUserId}`).emit('chat_event', payload);
      return NextResponse.json({ success: true });
    } else {
      // Queue for delivery
      const pending = (globalThis as any)._pendingSignals;
      if (pending) {
        const list = pending.get(targetUserId) ?? [];
        list.push({ data: payload, expiresAt: Date.now() + 30_000 });
        pending.set(targetUserId, list);
      }
      console.warn(`[video/signal] ${type} → ${targetUserId}: queued (no live socket)`);
      return NextResponse.json({ success: true, queued: true });
    }
  }

  // Fallback to chat-sse shim
  const { pushChatSSE, storePendingSignal } = await import('@/lib/chat-sse');
  const delivered = pushChatSSE(targetUserId, payload);
  if (!delivered) {
    storePendingSignal(targetUserId, payload);
    return NextResponse.json({ success: true, queued: true });
  }

  return NextResponse.json({ success: true });
}
