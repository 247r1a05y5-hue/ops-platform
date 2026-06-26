import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/require-auth';
import { processNextWebhook, recoverStuckWebhooks } from '@/lib/webhookQueue';
import { updateWorkerHeartbeat } from '@/lib/webhookMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/webhooks
 *
 * Webhook queue delivery worker.
 * Called by Vercel Cron (every minute: * * * * *) or Railway Cron.
 *
 * Behaviour:
 *   1. Recover any stuck 'processing' webhooks older than 10 min (Task 1 & 5)
 *   2. Update worker heartbeat in DB (Task 2)
 *   3. Process up to 20 events OR stop after 45 seconds — whichever first (Task 7)
 *   4. One webhook failing NEVER crashes the loop (Task 6 — crash safety)
 *   5. Log performance metrics after every run (Task 8)
 *
 * Protected by CRON_SECRET via requireCronAuth().
 */

const MAX_EVENTS_PER_RUN = 20;
const MAX_WALL_TIME_MS   = 45_000;   // 45 seconds — prevents Railway timeout
const WORKER_ID          = 'cron-worker';

// Track worker lifetime across hot-reloads (module-level singleton)
let _workerStartedAt: Date | null = null;
let _lifetimeProcessed = 0;
let _lifetimeSuccess   = 0;
let _lifetimeFailed    = 0;

export async function GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const runStartedAt = Date.now();
  if (!_workerStartedAt) _workerStartedAt = new Date();

  // ── Task 1 & 5: Recover stuck webhooks before processing ─────────────────
  let recoveredCount = 0;
  try {
    recoveredCount = await recoverStuckWebhooks();
    if (recoveredCount > 0) {
      console.log(`[WebhookQueue] Recovered ${recoveredCount} stuck webhook(s)`);
    }
  } catch (err) {
    console.error('[WebhookQueue] Stuck-job recovery error:', err);
  }

  // ── Task 7: Process loop — time-bounded (45s) OR event-bounded (20) ──────
  let processed  = 0;
  let runSuccess = 0;
  let runFailed  = 0;
  let stopped    = 'queue_empty';

  for (let i = 0; i < MAX_EVENTS_PER_RUN; i++) {
    // Wall-clock gate — stop before Railway times out
    if (Date.now() - runStartedAt >= MAX_WALL_TIME_MS) {
      stopped = 'time_limit';
      console.log(`[WebhookQueue] Wall-clock limit reached (${MAX_WALL_TIME_MS}ms) — stopping after ${processed} events`);
      break;
    }

    // Task 6 — crash safety: one broken event must never kill the loop
    try {
      const didProcess = await processNextWebhook();
      if (!didProcess) {
        stopped = 'queue_empty';
        break;  // queue drained
      }
      processed++;
      runSuccess++;    // conservative — markSuccess updates DB; this tracks "attempted"
    } catch (err) {
      runFailed++;
      console.error('[WebhookQueue] Worker error processing event (continuing):', err);
    }
  }

  if (processed === MAX_EVENTS_PER_RUN) stopped = 'event_limit';

  // ── Update lifetime counters ──────────────────────────────────────────────
  _lifetimeProcessed += processed;
  _lifetimeSuccess   += runSuccess;
  _lifetimeFailed    += runFailed;

  // ── Task 2: Heartbeat ─────────────────────────────────────────────────────
  const workerStatus = runFailed > 0 && processed === 0 ? 'error' : processed > 0 ? 'healthy' : 'idle';
  try {
    await updateWorkerHeartbeat({
      processedCount: _lifetimeProcessed,
      successCount:   _lifetimeSuccess,
      failedCount:    _lifetimeFailed,
      startedAt:      _workerStartedAt,
      workerStatus,
    });
  } catch (err) {
    console.error('[WebhookQueue] Heartbeat update failed:', err);
  }

  // ── Task 8: Performance log ───────────────────────────────────────────────
  const durationMs = Date.now() - runStartedAt;
  const uptimeSec  = Math.round((Date.now() - _workerStartedAt.getTime()) / 1000);
  console.log(
    `[WebhookQueue] Cron run complete — ` +
    `processed=${processed} errors=${runFailed} recovered=${recoveredCount} ` +
    `stopped=${stopped} durationMs=${durationMs} ` +
    `Worker uptime: ${uptimeSec}s`
  );

  return NextResponse.json({
    success:   true,
    processed,
    errors:    runFailed,
    recovered: recoveredCount,
    stopped,
    durationMs,
    workerUptime: uptimeSec,
    workerId: WORKER_ID,
  });
}
