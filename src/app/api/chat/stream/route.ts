/**
 * GET /api/chat/stream  — DEPRECATED
 *
 * This SSE endpoint is replaced by Socket.io (/api/socketio).
 * Returns 410 Gone so old clients can detect the migration.
 * Remove this file once all clients are updated.
 */
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json(
    { error: 'SSE endpoint removed. Connect via Socket.io at /api/socketio' },
    { status: 410 }
  );
}
