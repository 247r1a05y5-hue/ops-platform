import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { sendEmail, isValidEmail, TEMPLATES, checkBrevoHealth } from '@/lib/email';
import { connectDB, EmailLog } from '@/lib/db';

async function _POST(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  const startedAt = Date.now();

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));

    // Recipient — use session email by default (the real logged-in user email)
    const to = (body.to || session.email || '').toLowerCase().trim();

    if (!to) {
      return NextResponse.json({ success: false, error: 'No recipient email. Pass "to" in body or ensure session has email.' }, { status: 400 });
    }

    if (!isValidEmail(to)) {
      return NextResponse.json({ success: false, error: `Invalid recipient: "${to}"` }, { status: 400 });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'admin@ops.com').toLowerCase().trim();
    const templateKey = (body.template && TEMPLATES[body.template]) ? body.template : 'activity_alert';

    const recipients = [to];
    if (isValidEmail(adminEmail) && adminEmail !== to) {
      recipients.push(adminEmail);
    }

    const results: Array<{ to: string; messageId?: string; success: boolean; error?: string }> = [];

    for (const recipient of recipients) {
      try {
        const info = await sendEmail({
          event: templateKey as any,
          to: recipient,
          vars: {
            name: session.name,
            role: session.role,
            action: 'SMTP Test Delivery',
            description: body.message || `This is a verification email sent by ${session.name} (${session.email}) at ${new Date().toLocaleString()}.`,
          }
        });
        results.push({ to: recipient, messageId: info.messageId, success: true });
      } catch (sendErr: any) {
        results.push({ to: recipient, success: false, error: sendErr.message });
      }
    }

    const allSucceeded = results.every(r => r.success);
    const anySucceeded = results.some(r => r.success);

    return NextResponse.json({
      success: anySucceeded,
      allSucceeded,
      results,
      brevoVerified: true,
      durationMs: Date.now() - startedAt,
    }, { status: allSucceeded ? 200 : 207 });

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      durationMs: Date.now() - startedAt,
    }, { status: 500 });
  }
}

async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  const health = await checkBrevoHealth();

  return NextResponse.json({
    configured: !!process.env.BREVO_API_KEY,
    brevoHealth: health,
    note: 'POST to this endpoint to send a real test email.',
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
export const GET = withLogging(_GET);
