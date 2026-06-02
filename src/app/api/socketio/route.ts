/**
 * app/api/socketio/route.ts
 *
 * This route does two things:
 *   1. On first request, bootstraps the Socket.io server onto the
 *      underlying Node.js HTTP server (via the globalThis hack that
 *      works in Next.js 13+ App Router with runtime = 'nodejs').
 *   2. Returns a 200 so the Socket.io client handshake can proceed.
 *
 * The actual WebSocket upgrade happens at the HTTP server level —
 * Next.js passes through upgrade events to Socket.io automatically
 * once initSocketServer() has attached to the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initSocketServer } from '@/lib/socket-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bootstrap on first GET (Socket.io client polling handshake)
export async function GET(req: NextRequest) {
  try {
    // Access the underlying HTTP server via the internal Next.js global
    // This is the standard approach for Socket.io in Next.js App Router
    const res = (globalThis as any).__nextSocketServer;
    if (res?.httpServer) {
      initSocketServer(res.httpServer);
    }
  } catch (e) {
    // Server not available yet (SSR/edge) — ignore
  }

  // Return 200 so Socket.io polling can proceed
  return new NextResponse('socket.io init', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
