import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, isValidEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';

/**
 * POST /api/time-tracking
 * Body: { action: 'start' | 'stop' | 'log', duration?: number, project?: string }
 *
 * Fires emails to the employee + admin on every shift event.
 * Employee email comes from the JWT session — never hardcoded.
 */
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { action, duration, project } = body;

    if (!['start', 'stop', 'log'].includes(action)) {
      return NextResponse.json({ success: false, error: 'action must be start | stop | log' }, { status: 400 });
    }

    const now = new Date();
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || process.env.SMTP_USER || 'admin@ops.com').toLowerCase().trim();

    // Build human-readable details
    const durationStr = duration
      ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
      : 'N/A';

    const actionLabels: Record<string, string> = {
      start: 'Shift Started',
      stop:  'Shift Stopped',
      log:   'Time Session Logged',
    };
    const actionLabel = actionLabels[action];

    const description = action === 'log'
      ? `${session.name} logged a ${durationStr} work session on "${project || 'General Work'}" at ${now.toLocaleString()}.`
      : action === 'start'
      ? `${session.name} started their shift at ${now.toLocaleString()}.`
      : `${session.name} stopped their shift at ${now.toLocaleString()}. Duration tracked: ${durationStr}.`;

    // ── 1. Email to employee (session.email from JWT — real, dynamic) ─────
    if (isValidEmail(session.email)) {
      await sendEmail({
        event: 'task_update',
        to: session.email,
        vars: {
          name: session.name,
          role: session.role,
          action: actionLabel,
          description,
        },
      }).then(() => {
        console.log(`[TimeTracking] ✅ Employee email sent to ${session.email} — ${actionLabel}`);
      }).catch(e => {
        console.error(`[TimeTracking] ❌ Employee email failed to ${session.email}:`, e.message);
      });
    } else {
      console.warn(`[TimeTracking] Invalid session email: "${session.email}" — skipping employee notify`);
    }

    // ── 2. Email to admin ─────────────────────────────────────────────────
    if (isValidEmail(adminEmail) && adminEmail !== session.email.toLowerCase()) {
      await sendEmail({
        event: 'activity_alert',
        to: adminEmail,
        vars: {
          name: session.name,
          role: session.role,
          action: `${actionLabel} — ${session.name}`,
          description,
        },
      }).catch(e => {
        console.error(`[TimeTracking] ❌ Admin email failed to ${adminEmail}:`, e.message);
      });
    }

    // ── 3. Activity log ───────────────────────────────────────────────────
    await logActivity({
      userId: session.sub,
      actionType: action === 'start' ? 'shift_start' : action === 'stop' ? 'shift_stop' : 'time_log',
      module: 'TimeTracking',
      description,
      metadata: { action, duration, project, timestamp: now.toISOString() },
      req,
    }).catch(console.error);

    return NextResponse.json({
      success:   true,
      action,
      message:   `${actionLabel} recorded for ${session.name}`,
      emailSent: isValidEmail(session.email),
      timestamp: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TimeTracking] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
