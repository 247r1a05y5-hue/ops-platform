import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  // Auth check — identity comes from cookie, never from body
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    const { actionType, description, metadata } = await req.json();

    if (!actionType) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const log = await logActivity({
      userId: session.sub,   // from JWT, not client body
      actionType,
      description,
      metadata,
      req,
    });

    return NextResponse.json({ success: true, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
