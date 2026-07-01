import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/presence/heartbeat
 *
 * HTTP heartbeat fallback. With Socket.io, heartbeats are sent via
 * socket.emit('heartbeat') — this route is only hit by old clients
 * or environments where the socket isn't connected.
 */
async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Update presence timestamp in global map
  const presenceMap = (globalThis as any)._presenceLastSeen;
  if (presenceMap) {
    presenceMap.set(session.sub, Date.now());
  }

  return NextResponse.json({ success: true });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
