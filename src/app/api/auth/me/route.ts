import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, clearSessionCookie, DB_TO_DISPLAY } from '@/lib/auth';

// GET /api/auth/me
// Used by the frontend to restore session on page refresh.
// Returns current user from JWT cookie — no DB hit needed.

async function _GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);

  if (!session) {
    const res = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
    clearSessionCookie(res); // Clear any invalid/expired cookie
    return res;
  }

  return NextResponse.json({
    success: true,
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      role: session.role,
      displayRole: DB_TO_DISPLAY[session.role] ?? session.role,
    },
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
