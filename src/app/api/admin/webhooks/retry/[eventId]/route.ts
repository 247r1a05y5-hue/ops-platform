import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { connectDB, WebhookEvent, ActivityLog } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/webhooks/retry/:eventId
 *
 * Admin-only manual retry for a failed or dead webhook.
 * Resets status to 'pending', clears processingStartedAt,
 * schedules immediate nextRetryAt, and writes an audit log entry.
 * Existing attempt history is preserved.
 */
async function _POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  const { eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 });
  }

  await connectDB();

  const webhook = await WebhookEvent.findOne({ eventId });
  if (!webhook) {
    return NextResponse.json(
      { success: false, error: `Webhook not found: ${eventId}` },
      { status: 404 }
    );
  }

  // Only allow retry of failed or dead webhooks
  if (!['failed', 'dead'].includes(webhook.status)) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot retry webhook with status '${webhook.status}'. Only 'failed' or 'dead' webhooks can be retried.`,
      },
      { status: 409 }
    );
  }

  const previousStatus   = webhook.status;
  const previousAttempts = webhook.attempts;
  const now              = new Date();

  // Reset to pending — immediate delivery on next cron tick
  await WebhookEvent.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status:              'pending',
        nextRetryAt:         now,
        processingStartedAt: null,
        lastError:           '',
        updatedAt:           now,
      },
    }
  );

  // Audit log
  try {
    await ActivityLog.create({
      userId:     session.sub,
      name:       session.name ?? 'Admin',
      userEmail:  session.email ?? '',
      userRole:   session.role ?? 'Admin',
      actionType: 'webhook_retry',
      module:     'Webhooks',
      description: `Manual retry triggered for webhook eventId="${eventId}" event="${webhook.event}" (was ${previousStatus} after ${previousAttempts} attempt(s))`,
      metadata: {
        eventId,
        event:           webhook.event,
        previousStatus,
        previousAttempts,
        targetUrl:       webhook.targetUrl,
      },
      ip:        req.headers.get('x-forwarded-for') ?? '127.0.0.1',
      userAgent: req.headers.get('user-agent') ?? '',
      timestamp: now,
    });
  } catch (logErr) {
    console.error('[WebhookRetry] Failed to write audit log:', logErr);
  }

  // Enterprise Audit Log
  try {
    const { logAudit } = await import('@/lib/audit');
    await logAudit({
      action: 'webhook_retry',
      module: 'Integrations',
      entityId: eventId,
      entityType: 'WebhookEvent',
      oldValue: { status: previousStatus, attempts: previousAttempts },
      newValue: { status: 'pending', nextRetryAt: now.toISOString() },
      session,
      req,
    });
  } catch (err: any) {
    console.error('[AuditLog] Webhook retry audit log failed:', err.message);
  }

  console.log(
    `[WebhookQueue] Manual retry — eventId="${eventId}" event="${webhook.event}" ` +
    `by=${session.email} previousStatus=${previousStatus}`
  );

  return NextResponse.json({
    success: true,
    message: `Webhook ${eventId} queued for immediate retry`,
    eventId,
    event:           webhook.event,
    previousStatus,
    previousAttempts,
    nextStatus:      'pending',
    scheduledAt:     now.toISOString(),
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
