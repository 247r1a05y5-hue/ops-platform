import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { getTransporter, isValidEmail, TEMPLATES } from '@/lib/email';
import { connectDB, EmailLog } from '@/lib/db';

/**
 * POST /api/test-email
 * Admin/Manager only.
 * Sends a real test email via the configured SMTP transport.
 * Returns actual success/failure from the SMTP server — no mocking.
 *
 * Body (all optional):
 *   to        — recipient (defaults to session.email — the logged-in user)
 *   subject   — custom subject
 *   message   — custom body text
 *   template  — template key to use (defaults to 'activity_alert')
 */
export async function POST(req: NextRequest) {
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

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ops.com').toLowerCase().trim();
    const fromAddress = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'admin@ops.com';
    const templateKey = (body.template && TEMPLATES[body.template]) ? body.template : 'activity_alert';
    const template = TEMPLATES[templateKey];

    // Validate SMTP config before attempting
    const smtpConfig = {
      host:     process.env.SMTP_HOST   || '',
      port:     process.env.SMTP_PORT   || '587',
      user:     process.env.SMTP_USER   || '',
      passSet:  !!process.env.SMTP_PASS,
      sender:   fromAddress,
    };

    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.passSet) {
      return NextResponse.json({
        success: false,
        error:   'SMTP not fully configured. Check SMTP_HOST, SMTP_USER, SMTP_PASS in environment.',
        smtpConfig: { ...smtpConfig, passSet: smtpConfig.passSet },
      }, { status: 503 });
    }

    const subject  = body.subject || `[TEST] OPS Platform Email Verification — ${new Date().toLocaleString()}`;
    const htmlBody = body.message
      ? template.html({ name: session.name, role: session.role, action: 'Test Email', description: body.message })
      : template.html({
          name:        session.name,
          role:        session.role,
          action:      'SMTP Test Delivery',
          description: `This is a verification email sent by ${session.name} (${session.email}) at ${new Date().toLocaleString()}. If you received this, SMTP is working correctly. Sender: ${fromAddress}, Host: ${smtpConfig.host}:${smtpConfig.port}`,
        });

    const transporter = getTransporter();

    // Verify connection first
    let smtpVerified = false;
    try {
      await transporter.verify();
      smtpVerified = true;
    } catch (verifyErr) {
      const verifyMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.error('[TestEmail] SMTP verify failed:', verifyMsg);
      return NextResponse.json({
        success:     false,
        error:       `SMTP connection failed: ${verifyMsg}`,
        smtpConfig,
        smtpVerified: false,
        durationMs:  Date.now() - startedAt,
      }, { status: 502 });
    }

    // Send to requested recipient
    const recipients = [to];
    // Also CC admin if different from the recipient
    if (isValidEmail(adminEmail) && adminEmail !== to) {
      recipients.push(adminEmail);
    }

    const results: Array<{ to: string; messageId?: string; success: boolean; error?: string }> = [];

    for (const recipient of recipients) {
      try {
        const info = await transporter.sendMail({
          from:    `"Antigravity OPS" <${fromAddress}>`,
          to:      recipient,
          subject,
          html:    htmlBody,
        });

        console.log(`[TestEmail] ✅ Delivered to ${recipient} — messageId=${info.messageId}`);
        results.push({ to: recipient, messageId: info.messageId, success: true });

        await EmailLog.create({
          event:     'test_email',
          template:  templateKey,
          subject,
          role:      session.role,
          to:        recipient,
          status:    'success',
          messageId: info.messageId,
          vars:      { triggeredBy: session.email, testAt: new Date().toISOString() },
        }).catch(e => console.error('[TestEmail] EmailLog write failed:', e.message));

      } catch (sendErr) {
        const errMsg = sendErr instanceof Error ? sendErr.message.substring(0, 200) : String(sendErr);
        console.error(`[TestEmail] ❌ Failed to ${recipient}:`, errMsg);
        results.push({ to: recipient, success: false, error: errMsg });

        await EmailLog.create({
          event:    'test_email',
          template: templateKey,
          subject,
          role:     session.role,
          to:       recipient,
          status:   'failed',
          error:    errMsg,
          vars:     { triggeredBy: session.email, testAt: new Date().toISOString() },
        }).catch(e => console.error('[TestEmail] EmailLog write failed:', e.message));
      }
    }

    const allSucceeded = results.every(r => r.success);
    const anySucceeded = results.some(r => r.success);

    return NextResponse.json({
      success:      anySucceeded,
      allSucceeded,
      results,
      smtpConfig,
      smtpVerified,
      from:         fromAddress,
      durationMs:   Date.now() - startedAt,
    }, { status: allSucceeded ? 200 : 207 });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TestEmail] Fatal error:', message);
    return NextResponse.json({
      success:    false,
      error:      message,
      durationMs: Date.now() - startedAt,
    }, { status: 500 });
  }
}

/**
 * GET /api/test-email
 * Returns SMTP config status (no credentials exposed).
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const smtpConfig = {
    host:        process.env.SMTP_HOST   || '(not set)',
    port:        process.env.SMTP_PORT   || '587',
    user:        process.env.SMTP_USER   || '(not set)',
    passSet:     !!process.env.SMTP_PASS,
    senderEmail: process.env.SENDER_EMAIL || process.env.SMTP_USER || '(not set)',
    adminEmail:  process.env.ADMIN_EMAIL  || 'admin@ops.com (default)',
  };

  let smtpVerified = false;
  let verifyError: string | null = null;

  if (configured) {
    try {
      const transporter = getTransporter();
      await transporter.verify();
      smtpVerified = true;
    } catch (e) {
      verifyError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    configured,
    smtpVerified,
    smtpConfig,
    verifyError,
    note: 'POST to this endpoint to send a real test email.',
  });
}
