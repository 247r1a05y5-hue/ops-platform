import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { registerSSEClient, unregisterSSEClient } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/stream
 * Establishes a Server-Sent Events connection for the authenticated user.
 * Frontend usage:
 *   const es = new EventSource('/api/notifications/stream');
 *   es.onmessage = (e) => { const n = JSON.parse(e.data); ... };
 */
async function _GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.sub;
  let controller: ReadableStreamDefaultController<string> | null = null;

  const stream = new ReadableStream<string>({
    start(ctrl) {
      controller = ctrl;
      registerSSEClient(userId, ctrl);
      ctrl.enqueue(': connected\n\n');

      // Heartbeat every 25 s to keep proxies/LBs from closing idle connections
      const hb = setInterval(() => {
        try { ctrl.enqueue(': heartbeat\n\n'); } catch (_) { clearInterval(hb); }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(hb);
        if (controller) unregisterSSEClient(userId, controller);
        try { ctrl.close(); } catch (_) {}
      });
    },
    cancel() {
      if (controller) unregisterSSEClient(userId, controller);
    },
  });

  return new Response(stream as unknown as BodyInit, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
