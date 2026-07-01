import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { forceUserOffline } from '@/lib/chat-sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  forceUserOffline(session.sub);
  return NextResponse.json({ success: true });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
