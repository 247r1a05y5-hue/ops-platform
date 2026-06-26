/**
 * webhookQueue.ts — Enterprise webhook delivery queue
 *
 * Architecture:
 *   Business Logic → enqueueWebhook() → WebhookEvent (MongoDB)
 *                                              ↓
 *                       recoverStuckWebhooks() [runs at start of each cron tick]
 *                                              ↓
 *                        claimNextWebhook()   [atomic — findOneAndUpdate, no race conditions]
 *                                              ↓
 *                        processNextWebhook() [fetch + AbortController timeout]
 *                                              ↓
 *                    markSuccess() | markFailure() → scheduleRetry() | moveToDeadLetter()
 *
 * Retry Policy:
 *   Attempt 1  → immediate
 *   Attempt 2  → 30 seconds
 *   Attempt 3  → 2 minutes
 *   Attempt 4  → 5 minutes
 *   Attempt 5  → 15 minutes
 *   > maxAttempts → status: 'dead'
 *
 * Lock Recovery:
 *   Any webhook stuck in 'processing' for > 10 minutes is automatically
 *   returned to 'pending' with attempts incremented.
 */

import { connectDB, WebhookEvent } from '@/lib/db';
import { setLastDeliveryStatus } from '@/lib/zapier';

// ── Constants ─────────────────────────────────────────────────────────────
const RETRY_DELAYS_MS = [
  0,           // Attempt 1 — immediate
  30_000,      // Attempt 2 — 30 s
  120_000,     // Attempt 3 — 2 min
  300_000,     // Attempt 4 — 5 min
  900_000,     // Attempt 5 — 15 min
];

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;           // 5
const DELIVERY_TIMEOUT_MS = 5_000;                     // 5 s
const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;   // 10 min — stuck-job threshold
const ACCEPTED_STATUS_CODES = new Set([200, 201, 202]);

// ── UUID helper ────────────────────────────────────────────────────────────
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface WebhookEventRecord {
  _id: string;
  eventId: string;
  event: string;
  payload: Record<string, unknown>;
  targetUrl: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date;
  processingStartedAt: Date | null;
  lastError: string;
  lastResponseCode: number | null;
  lastResponseBody: string;
  duration: number | null;
  enqueuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── TASK 1 & 5: Processing Lock Recovery / Stuck Job Detection ────────────

/**
 * Scan for webhooks stuck in 'processing' for > 10 minutes.
 * Atomically returns them to 'pending' so the next worker pick-up retries them.
 * Logs each recovery with [WebhookQueue] Processing lock recovered.
 */
export async function recoverStuckWebhooks(): Promise<number> {
  await connectDB();

  const lockTimeout = new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS);

  // Find all stuck ones first (for logging)
  const stuck = await WebhookEvent.find({
    status: 'processing',
    processingStartedAt: { $lte: lockTimeout },
  }).lean();

  if (stuck.length === 0) return 0;

  for (const doc of stuck as any[]) {
    await WebhookEvent.findOneAndUpdate(
      {
        eventId: doc.eventId,
        status: 'processing',
        processingStartedAt: { $lte: lockTimeout },
      },
      {
        $set: {
          status: 'pending',
          nextRetryAt: new Date(),       // eligible for immediate retry
          processingStartedAt: null,
          lastError: 'Processing lock timeout — recovered after 10 minutes',
          updatedAt: new Date(),
        },
        $inc: { attempts: 1 },
      }
    );

    console.warn(
      `[WebhookQueue] Processing lock recovered — eventId="${doc.eventId}" event="${doc.event}" ` +
      `stuckSince=${doc.processingStartedAt?.toISOString()} attempts=${doc.attempts}`
    );
    console.warn(`[WebhookQueue] Recovered stuck webhook — eventId="${doc.eventId}"`);
  }

  return stuck.length;
}

// ── Enqueue ────────────────────────────────────────────────────────────────

/**
 * Enqueue a webhook event for asynchronous delivery.
 * Business logic calls this instead of fetch() directly.
 */
export async function enqueueWebhook(params: {
  event: string;
  payload: Record<string, unknown>;
  targetUrl: string;
}): Promise<string> {
  await connectDB();

  const eventId = generateEventId();
  const now = new Date();

  await WebhookEvent.create({
    eventId,
    event: params.event,
    payload: params.payload,
    targetUrl: params.targetUrl,
    status: 'pending',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: now,
    processingStartedAt: null,
    lastError: '',
    lastResponseCode: null,
    lastResponseBody: '',
    duration: null,
    enqueuedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[WebhookQueue] Enqueued event="${params.event}" eventId="${eventId}"`);
  return eventId;
}

// ── Atomic Claim ──────────────────────────────────────────────────────────

/**
 * Atomically claim the next eligible webhook event.
 * Sets processingStartedAt = now for lock-recovery tracking.
 */
export async function claimNextWebhook(): Promise<WebhookEventRecord | null> {
  await connectDB();

  const now = new Date();

  const claimed = await WebhookEvent.findOneAndUpdate(
    {
      status: { $in: ['pending', 'failed'] },
      nextRetryAt: { $lte: now },
    },
    {
      $set: {
        status: 'processing',
        processingStartedAt: now,
        updatedAt: now,
      },
    },
    {
      sort: { nextRetryAt: 1 },  // FIFO — oldest first
      new: true,
    }
  );

  if (claimed) {
    // Performance log — queue wait time
    const enqueuedAt = claimed.enqueuedAt ?? claimed.createdAt;
    const waitMs = now.getTime() - new Date(enqueuedAt).getTime();
    console.log(
      `[WebhookQueue] Processing eventId="${claimed.eventId}" event="${claimed.event}" ` +
      `attempt=${claimed.attempts + 1}/${claimed.maxAttempts} ` +
      `Wait: ${(waitMs / 1000).toFixed(1)}s`
    );
  }

  return claimed;
}

// ── Mark Success ──────────────────────────────────────────────────────────

export async function markSuccess(params: {
  eventId: string;
  responseCode: number;
  responseBody: string;
  duration: number;
}): Promise<void> {
  await connectDB();

  await WebhookEvent.findOneAndUpdate(
    { eventId: params.eventId },
    {
      $set: {
        status: 'success',
        processingStartedAt: null,
        lastResponseCode: params.responseCode,
        lastResponseBody: params.responseBody.slice(0, 1000),
        duration: params.duration,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('success');
  console.log(
    `[WebhookQueue] Success eventId="${params.eventId}" ` +
    `status=${params.responseCode} Delivery: ${params.duration}ms`
  );
}

// ── Mark Failure ──────────────────────────────────────────────────────────

export async function markFailure(params: {
  eventId: string;
  error: string;
  responseCode?: number;
  responseBody?: string;
  duration?: number;
}): Promise<void> {
  await connectDB();

  const record = await WebhookEvent.findOne({ eventId: params.eventId });
  if (!record) return;

  const nextAttempts = record.attempts + 1;

  if (nextAttempts >= record.maxAttempts) {
    await moveToDeadLetter({ eventId: params.eventId, reason: params.error });
    return;
  }

  await scheduleRetry({
    eventId: params.eventId,
    attemptNumber: nextAttempts,
    error: params.error,
    responseCode: params.responseCode,
    responseBody: params.responseBody,
    duration: params.duration,
  });
}

// ── Schedule Retry ────────────────────────────────────────────────────────

export async function scheduleRetry(params: {
  eventId: string;
  attemptNumber: number;
  error: string;
  responseCode?: number;
  responseBody?: string;
  duration?: number;
}): Promise<void> {
  await connectDB();

  const delayMs = RETRY_DELAYS_MS[params.attemptNumber] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const nextRetryAt = new Date(Date.now() + delayMs);

  await WebhookEvent.findOneAndUpdate(
    { eventId: params.eventId },
    {
      $set: {
        status: 'failed',
        processingStartedAt: null,
        nextRetryAt,
        lastError: params.error,
        lastResponseCode: params.responseCode ?? null,
        lastResponseBody: (params.responseBody ?? '').slice(0, 1000),
        duration: params.duration ?? null,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('failed');
  console.log(
    `[WebhookQueue] Retry Scheduled eventId="${params.eventId}" ` +
    `Attempt: ${params.attemptNumber}/${MAX_ATTEMPTS} ` +
    `Retry Delay: ${delayMs}ms nextRetryAt=${nextRetryAt.toISOString()}`
  );
}

// ── Dead Letter ───────────────────────────────────────────────────────────

export async function moveToDeadLetter(params: {
  eventId: string;
  reason: string;
}): Promise<void> {
  await connectDB();

  await WebhookEvent.findOneAndUpdate(
    { eventId: params.eventId },
    {
      $set: {
        status: 'dead',
        processingStartedAt: null,
        lastError: params.reason,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('failed');
  console.error(`[WebhookQueue] Dead Letter eventId="${params.eventId}" reason="${params.reason}"`);
}

// ── Worker — process one event ────────────────────────────────────────────

/**
 * Process one queued webhook event.
 * TASK 6 (crash safety): never throws — all errors are caught and handled.
 * Returns true if an event was claimed, false if queue was empty.
 */
export async function processNextWebhook(): Promise<boolean> {
  const record = await claimNextWebhook();
  if (!record) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(record.targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record.payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startedAt;

    let responseBody = '';
    try { responseBody = (await response.text()).slice(0, 1000); } catch (_) { /* ignore */ }

    if (ACCEPTED_STATUS_CODES.has(response.status)) {
      await markSuccess({
        eventId: record.eventId,
        responseCode: response.status,
        responseBody,
        duration,
      });
      console.log(`[Zapier] Delivered`);
    } else {
      const errMsg = `HTTP ${response.status} ${response.statusText}`;
      console.error(`[Zapier] Delivery failed`, {
        status: response.status,
        statusText: response.statusText,
        url: record.targetUrl,
      });
      await markFailure({
        eventId: record.eventId,
        error: errMsg,
        responseCode: response.status,
        responseBody,
        duration,
      });
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startedAt;

    if (err.name === 'AbortError') {
      console.error(`[Zapier] Request timed out`);
      console.error(`[Zapier] Timeout`);
      await markFailure({
        eventId: record.eventId,
        error: `Delivery timeout (${DELIVERY_TIMEOUT_MS}ms)`,
        duration,
      });
    } else {
      console.error(`[Zapier] Delivery failed`, { error: err.message, url: record.targetUrl });
      await markFailure({
        eventId: record.eventId,
        error: err.message ?? 'Unknown fetch error',
        duration,
      });
    }
  }

  // TASK 8 — performance summary line
  const totalDuration = Date.now() - startedAt;
  const enqueuedAt = record.enqueuedAt ?? record.createdAt;
  const waitMs = startedAt - new Date(enqueuedAt).getTime();
  console.log(
    `[WebhookQueue] Wait: ${(waitMs / 1000).toFixed(1)}s ` +
    `Delivery: ${totalDuration}ms ` +
    `Attempt: ${record.attempts + 1}`
  );

  return true;
}
