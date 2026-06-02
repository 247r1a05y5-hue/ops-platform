import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/auth';
import { csrfCheck } from '@/lib/require-auth';

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  try {
    // Read identity from the JWT cookie — never trust request body for identity
    const session = await getSessionFromRequest(req);

    if (session) {
      await connectDB();
      await logActivity({
        userId: session.sub,
        actionType: 'logout',
        module: 'Authentication',
        description: `User ${session.email} (${session.role}) logged out.`,
        req,
      }).catch(console.error);
    }

    const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
    clearSessionCookie(res);
    return res;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Always clear cookie even on error
    const res = NextResponse.json({ success: false, error: message }, { status: 500 });
    clearSessionCookie(res);
    return res;
  }
}
