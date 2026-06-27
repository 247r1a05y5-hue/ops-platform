/**
 * webhookQueue.ts — Enterprise webhook delivery queue (RC-5)
 *
 * Architecture:
 *   Business Logic → enqueueWebhook() → WebhookEvent (MongoDB)
 *                                              ↓
 *                       recoverStuckWebhooks() [stuck-job recovery]
 *                                              ↓
 *                        claimNextWebhook()    [atomic findOneAndUpdate]
 *                                              ↓
 *                        isAlreadyDelivered()  [idempotency — Task 3]
 *                                              ↓
 *                        signOutboundWebhook() [HMAC signing — Task 1]
 *                                              ↓
 *                        fetch() + AbortController timeout
 *                                              ↓
 *                        logDeliveryAttempt()  [delivery history — Task 4]
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
 */

import { connectDB, WebhookEvent, WebhookDeliveryLog } from '@/lib/db';
import { setLastDeliveryStatus } from '@/lib/zapier';
import { signOutboundWebhook, isAlreadyDelivered } from '@/lib/webhookSecurity';

// ── Constants ─────────────────────────────────────────────────────────────
const RETRY_DELAYS_MS = [
  0,           // Attempt 1 — immediate
  30_000,      // Attempt 2 — 30 s
  120_000,     // Attempt 3 — 2 min
  300_000,     // Attempt 4 — 5 min
  900_000,     // Attempt 5 — 15 min
];

const MAX_ATTEMPTS             = RETRY_DELAYS_MS.length;     // 5
const DELIVERY_TIMEOUT_MS      = 5_000;                      // 5 s
const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;          // 10 min stuck-job threshold
const ACCEPTED_STATUS_CODES    = new Set([200, 201, 202]);
const WORKER_ID                = 'cron-worker';

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

// ── Structured log helper (Task 8) ────────────────────────────────────────

function structuredLog(
  level: 'info' | 'warn' | 'error',
  context: {
    eventId?: string;
    event?: string;
    workerId?: string;
    attempt?: number;
    duration?: number;
    queueWait?: number;
    responseCode?: number;
    targetUrl?: string;
    message: string;
    [key: string]: unknown;
  }
) {
  const { message, ...fields } = context;
  const logLine = [
    `[WebhookQueue] ${message}`,
    fields.eventId    ? `eventId="${fields.eventId}"`         : '',
    fields.event      ? `event="${fields.event}"`             : '',
    fields.workerId   ? `workerId="${fields.workerId}"`       : '',
    fields.attempt    !== undefined ? `Attempt: ${fields.attempt}` : '',
    fields.duration   !== undefined ? `Delivery: ${fields.duration}ms` : '',
    fields.queueWait  !== undefined ? `Wait: ${(fields.queueWait / 1000).toFixed(1)}s` : '',
    fields.responseCode !== undefined ? `responseCode=${fields.responseCode}` : '',
    fields.targetUrl  ? `url=${fields.targetUrl}` : '',
  ].filter(Boolean).join(' ');

  if (level === 'error')      console.error(logLine);
  else if (level === 'warn')  console.warn(logLine);
  else                        console.log(logLine);
}

// ── Delivery history logger (Task 4) ─────────────────────────────────────

async function logDeliveryAttempt(params: {
  eventId: string;
  event: string;
  targetUrl: string;
  responseCode: number | null;
  duration: number | null;
  attempt: number;
  status: 'success' | 'failed' | 'timeout';
  responseBody?: string;
  error?: string;
}): Promise<void> {
  try {
    await connectDB();
    await WebhookDeliveryLog.create({
      eventId:      params.eventId,
      event:        params.event,
      targetUrl:    params.targetUrl,
      responseCode: params.responseCode,
      duration:     params.duration,
      attempt:      params.attempt,
      status:       params.status,
      responseBody: (params.responseBody ?? '').slice(0, 1000),
      error:        params.error ?? '',
      workerId:     WORKER_ID,
      createdAt:    new Date(),
    });
  } catch (err) {
    // Non-fatal — delivery logging must not block processing
    console.error('[WebhookQueue] DeliveryLog write failed:', err);
  }
}

// ── Task 1 & 5: Processing Lock Recovery ──────────────────────────────────

export async function recoverStuckWebhooks(): Promise<number> {
  await connectDB();

  const lockTimeout = new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS);

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
          nextRetryAt: new Date(),
          processingStartedAt: null,
          lastError: 'Processing lock timeout — recovered after 10 minutes',
          updatedAt: new Date(),
        },
        $inc: { attempts: 1 },
      }
    );

    structuredLog('warn', {
      message: 'Processing lock recovered',
      eventId: doc.eventId,
      event:   doc.event,
      workerId: WORKER_ID,
      attempt: doc.attempts,
    });
    console.warn(`[WebhookQueue] Recovered stuck webhook — eventId="${doc.eventId}"`);
  }

  return stuck.length;
}

// ── Enqueue ────────────────────────────────────────────────────────────────

export async function enqueueWebhook(params: {
  event: string;
  payload: Record<string, unknown>;
  targetUrl: string;
}): Promise<string> {
  console.log('[TRACE 8] enqueueWebhook entered');
  await connectDB();

  const eventId = generateEventId();
  const now = new Date();

  console.log('[TRACE 9] Before MongoDB insert');
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
  console.log('[TRACE 10] MongoDB insert completed');

  structuredLog('info', {
    message: 'Enqueued',
    eventId,
    event: params.event,
    workerId: WORKER_ID,
    targetUrl: params.targetUrl,
  });

  console.log('[TRACE 11] Returning eventId');
  return eventId;
}

// ── Atomic Claim ──────────────────────────────────────────────────────────

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
      sort: { nextRetryAt: 1 },
      new: true,
    }
  );

  if (claimed) {
    const enqueuedAt = claimed.enqueuedAt ?? claimed.createdAt;
    const waitMs = now.getTime() - new Date(enqueuedAt).getTime();
    structuredLog('info', {
      message: 'Claimed',
      eventId:  claimed.eventId,
      event:    claimed.event,
      workerId: WORKER_ID,
      attempt:  claimed.attempts + 1,
      queueWait: waitMs,
      targetUrl: claimed.targetUrl,
    });
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
    eventId:      params.eventId,
    attemptNumber: nextAttempts,
    error:        params.error,
    responseCode: params.responseCode,
    responseBody: params.responseBody,
    duration:     params.duration,
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

  const delayMs    = RETRY_DELAYS_MS[params.attemptNumber] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const nextRetryAt = new Date(Date.now() + delayMs);

  await WebhookEvent.findOneAndUpdate(
    { eventId: params.eventId },
    {
      $set: {
        status: 'failed',
        processingStartedAt: null,
        nextRetryAt,
        lastError:        params.error,
        lastResponseCode: params.responseCode ?? null,
        lastResponseBody: (params.responseBody ?? '').slice(0, 1000),
        duration:         params.duration ?? null,
        updatedAt:        new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  setLastDeliveryStatus('failed');
  structuredLog('warn', {
    message: 'Retry Scheduled',
    eventId:  params.eventId,
    workerId: WORKER_ID,
    attempt:  params.attemptNumber,
    duration: params.duration,
  });
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
  structuredLog('error', {
    message: 'Dead Letter',
    eventId:  params.eventId,
    workerId: WORKER_ID,
  });
}

// ── Worker — process one event ────────────────────────────────────────────

/**
 * Process one queued webhook event.
 *  - Task 1: HMAC signs outbound request
 *  - Task 3: Checks idempotency (skip if already delivered)
 *  - Task 4: Logs every attempt to WebhookDeliveryLog
 *  - Task 6: Crash-safe — never throws
 */
export async function processNextWebhook(): Promise<boolean> {
  const record = await claimNextWebhook();
  if (!record) return false;

  // Task 3 — Idempotency: skip if already successfully delivered
  const alreadyDone = await isAlreadyDelivered(record.eventId);
  if (alreadyDone) {
    structuredLog('warn', {
      message:  'Skipped (already delivered)',
      eventId:  record.eventId,
      event:    record.event,
      workerId: WORKER_ID,
    });
    // Clear processing lock without incrementing attempts
    await WebhookEvent.findOneAndUpdate(
      { eventId: record.eventId },
      { $set: { status: 'success', processingStartedAt: null, updatedAt: new Date() } }
    );
    return true;
  }

  // Task 1 — Build signed body
  const rawBody = JSON.stringify(record.payload);
  const securityHeaders = signOutboundWebhook(rawBody, record.event);

  const controller  = new AbortController();
  const timeoutId   = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const startedAt   = Date.now();
  const attemptNum  = record.attempts + 1;

  try {
    const response = await fetch(record.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...securityHeaders,
      },
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startedAt;

    let responseBody = '';
    try { responseBody = (await response.text()).slice(0, 1000); } catch (_) { /* ignore */ }

    if (ACCEPTED_STATUS_CODES.has(response.status)) {
      await markSuccess({
        eventId:      record.eventId,
        responseCode: response.status,
        responseBody,
        duration,
      });

      // Task 4 — delivery log
      await logDeliveryAttempt({
        eventId:      record.eventId,
        event:        record.event,
        targetUrl:    record.targetUrl,
        responseCode: response.status,
        duration,
        attempt:      attemptNum,
        status:       'success',
        responseBody,
      });

      structuredLog('info', {
        message:      'Delivered',
        eventId:      record.eventId,
        event:        record.event,
        workerId:     WORKER_ID,
        attempt:      attemptNum,
        duration,
        responseCode: response.status,
        targetUrl:    record.targetUrl,
        queueWait:    startedAt - new Date(record.enqueuedAt ?? record.createdAt).getTime(),
      });
      console.log(`[Zapier] Delivered`);

    } else {
      const errMsg = `HTTP ${response.status} ${response.statusText}`;

      await logDeliveryAttempt({
        eventId:      record.eventId,
        event:        record.event,
        targetUrl:    record.targetUrl,
        responseCode: response.status,
        duration,
        attempt:      attemptNum,
        status:       'failed',
        responseBody,
        error:        errMsg,
      });

      structuredLog('error', {
        message:      'Delivery failed',
        eventId:      record.eventId,
        event:        record.event,
        workerId:     WORKER_ID,
        attempt:      attemptNum,
        duration,
        responseCode: response.status,
        targetUrl:    record.targetUrl,
      });

      await markFailure({
        eventId:      record.eventId,
        error:        errMsg,
        responseCode: response.status,
        responseBody,
        duration,
      });
    }

  } catch (err: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startedAt;
    const isTimeout = err.name === 'AbortError';
    const errMsg    = isTimeout ? `Delivery timeout (${DELIVERY_TIMEOUT_MS}ms)` : (err.message ?? 'Unknown fetch error');

    await logDeliveryAttempt({
      eventId:  record.eventId,
      event:    record.event,
      targetUrl: record.targetUrl,
      responseCode: null,
      duration,
      attempt:  attemptNum,
      status:   isTimeout ? 'timeout' : 'failed',
      error:    errMsg,
    });

    structuredLog('error', {
      message:  isTimeout ? 'Timeout' : 'Delivery failed',
      eventId:  record.eventId,
      event:    record.event,
      workerId: WORKER_ID,
      attempt:  attemptNum,
      duration,
      targetUrl: record.targetUrl,
    });
    if (isTimeout) console.error(`[Zapier] Request timed out`);

    await markFailure({
      eventId: record.eventId,
      error:   errMsg,
      duration,
    });
  }

  return true;
}
