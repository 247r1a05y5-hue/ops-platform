import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/require-auth';
import { processNextWebhook } from '@/lib/webhookQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/webhooks
 *
 * Webhook queue delivery worker.
 * Called by Vercel Cron (every minute: * * * * *) or Railway Cron.
 * Processes up to 20 pending webhook events per invocation.
 *
 * Protected by CRON_SECRET via requireCronAuth().
 */
export async function GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const MAX_EVENTS_PER_RUN = 20;

  let processed = 0;
  let errors = 0;

  try {
    for (let i = 0; i < MAX_EVENTS_PER_RUN; i++) {
      try {
        const didProcess = await processNextWebhook();
        if (!didProcess) break; // queue empty — stop
        processed++;
      } catch (err) {
        errors++;
        console.error('[WebhookQueue] Cron worker error on event:', err);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[WebhookQueue] Cron run complete — processed=${processed} errors=${errors} durationMs=${durationMs}`);

    return NextResponse.json({
      success: true,
      processed,
      errors,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WebhookQueue] Cron fatal error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
