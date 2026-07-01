import { withLogging } from '@/lib/logger';
// src/app/api/admin/mail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendAdminMail } from '@/lib/mail';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

async function _POST(request: NextRequest) {
  // Prevent cross-origin submissions
  const csrfError = csrfCheck(request);
  if (csrfError) return csrfError;

  // Restrict to Admin
  const { session, error } = await requireAuth(request, ['Admin']);
  if (error) return error;

  try {
    const { subject, body, recipients } = await request.json();
    console.log('Admin mail API received:', { subject, body, recipients });
    if (!subject || !body) {
      return NextResponse.json({ error: 'Missing subject or body' }, { status: 400 });
    }
    await sendAdminMail(subject, body, recipients);
    console.log('Admin mail sent successfully by admin:', session.email);
    return NextResponse.json({ message: 'Email sent' }, { status: 200 });
  } catch (err) {
    console.error('Error in admin mail route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}



// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
