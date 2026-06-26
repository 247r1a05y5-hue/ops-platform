/**
 * webhookQueue.ts — Production-grade webhook delivery queue
 *
 * Architecture:
 *   Business Logic → enqueueWebhook() → WebhookEvent (MongoDB)
 *                                              ↓
 *                              claimNextWebhook() [atomic — no race conditions]
 *                                              ↓
 *                              Delivery Worker (fetch + timeout)
 *                                              ↓
 *                          markSuccess() | markFailure() | moveToDeadLetter()
 *
 * Retry Policy:
 *   Attempt 1  → immediate
 *   Attempt 2  → 30 seconds
 *   Attempt 3  → 2 minutes
 *   Attempt 4  → 5 minutes
 *   Attempt 5  → 15 minutes
 *   > maxAttempts → status: 'dead'
 */

import { connectDB, WebhookEvent } from '@/lib/db';
import { setLastDeliveryStatus } from '@/lib/zapier';

// ── Retry delay ladder (ms) ────────────────────────────────────────────────
const RETRY_DELAYS_MS = [
  0,           // Attempt 1 — immediate
  30_000,      // Attempt 2 — 30 s
  120_000,     // Attempt 3 — 2 min
  300_000,     // Attempt 4 — 5 min
  900_000,     // Attempt 5 — 15 min
];

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length; // 5

// ── UUID helper ────────────────────────────────────────────────────────────
function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes
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
  lastError: string;
  lastResponseCode: number | null;
  lastResponseBody: string;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── TASK 1: Enqueue ────────────────────────────────────────────────────────

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
    nextRetryAt: now,    // ready for immediate delivery
    lastError: '',
    lastResponseCode: null,
    lastResponseBody: '',
    duration: null,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[WebhookQueue] Enqueued event="${params.event}" eventId="${eventId}"`);
  return eventId;
}

// ── TASK 2: Atomic Claim (prevents duplicate workers) ─────────────────────

/**
 * Atomically claim the next eligible webhook event.
 * Uses findOneAndUpdate() so only ONE worker can claim each event — no race conditions.
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
      $set: { status: 'processing', updatedAt: now },
    },
    {
      sort: { nextRetryAt: 1 },  // FIFO — oldest first
      new: true,                  // return the updated document
    }
  );

  if (claimed) {
    console.log(`[WebhookQueue] Processing eventId="${claimed.eventId}" event="${claimed.event}" attempt=${claimed.attempts + 1}/${claimed.maxAttempts}`);
  }

  return claimed;
}

// ── TASK 3: Mark Success ───────────────────────────────────────────────────

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
        lastResponseCode: params.responseCode,
        lastResponseBody: params.responseBody.slice(0, 1000), // cap at 1KB
        duration: params.duration,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('success');
  console.log(`[WebhookQueue] Success eventId="${params.eventId}" status=${params.responseCode} duration=${params.duration}ms`);
}

// ── TASK 4: Mark Failure + Schedule Retry ─────────────────────────────────

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

// ── TASK 5: Schedule Retry ────────────────────────────────────────────────

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
  console.log(`[WebhookQueue] Retry Scheduled eventId="${params.eventId}" attempt=${params.attemptNumber}/${MAX_ATTEMPTS} nextRetryAt=${nextRetryAt.toISOString()} delayMs=${delayMs}`);
}

// ── TASK 6: Dead Letter ───────────────────────────────────────────────────

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
        lastError: params.reason,
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('failed');
  console.error(`[WebhookQueue] Dead Letter eventId="${params.eventId}" reason="${params.reason}"`);
}

// ── TASK 7: Worker — process one event ───────────────────────────────────

const DELIVERY_TIMEOUT_MS = 5000;
const ACCEPTED_STATUS_CODES = new Set([200, 201, 202]);

/**
 * Process one queued webhook event with:
 *   - AbortController timeout (5000ms)
 *   - HTTP status validation (200/201/202)
 *   - Automatic retry scheduling on failure
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

    // Read body (capped) for logging
    let responseBody = '';
    try {
      responseBody = (await response.text()).slice(0, 1000);
    } catch (_) { /* ignore */ }

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
        error: 'Delivery timeout (5000ms)',
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

  return true;
}
