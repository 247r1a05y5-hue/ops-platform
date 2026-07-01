import { withLogging } from '@/lib/logger';
/**
 * app/api/socketio/route.ts
 *
 * On the single-VPS architecture, Socket.IO is initialized by server.mjs
 * before any HTTP request ever arrives. This route is now a health/status
 * endpoint only — it does NOT attempt to initialize Socket.IO.
 *
 * The Socket.IO client still connects to /api/socketio as the path; that
 * upgrade is handled by the HTTP server in server.mjs, not this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIO } from '@/lib/socket-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function _GET(_req: NextRequest) {
  const io = getIO();
  return NextResponse.json({
    ok: true,
    socketIO: io !== null,
    connectedSockets: io ? io.engine.clientsCount : 0,
  });
}

async function _POST(req: NextRequest) {
  return GET(req);
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
