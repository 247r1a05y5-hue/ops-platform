/**
 * webhookSecurity.ts — Enterprise webhook security layer
 *
 * Implements:
 *   Task 1  — HMAC SHA-256 outbound signing
 *   Task 2  — Replay attack protection (5-minute window + 24h signature deduplication)
 *   Task 7  — Secret rotation (WEBHOOK_SECRET + OLD_WEBHOOK_SECRET)
 *
 * Signature format:
 *   X-OPS-Signature: sha256=<HMAC_SHA256(secret, timestamp + "." + rawBody)>
 *   X-OPS-Timestamp: <unix seconds>
 *   X-OPS-Event:     <event name, e.g. new_lead>
 *
 * Rotation:
 *   During rotation, both WEBHOOK_SECRET and OLD_WEBHOOK_SECRET are accepted for
 *   INBOUND verification.  Outbound always uses WEBHOOK_SECRET (the current secret).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { connectDB, WebhookSignature } from '@/lib/db';

// ── Constants ─────────────────────────────────────────────────────────────
const REPLAY_WINDOW_SECONDS = 5 * 60;  // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────

function getSecrets(): { current: string | null; old: string | null } {
  return {
    current: process.env.WEBHOOK_SECRET ?? null,
    old:     process.env.OLD_WEBHOOK_SECRET ?? null,
  };
}

function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// ── Task 1 & 7: Sign outbound payload ────────────────────────────────────

export interface OutboundSignatureHeaders {
  'X-OPS-Signature': string;
  'X-OPS-Timestamp': string;
  'X-OPS-Event': string;
}

/**
 * Sign an outbound webhook payload.
 * Returns the three security headers to attach to the fetch() call.
 * If WEBHOOK_SECRET is not configured, returns empty strings (graceful degradation).
 */
export function signOutboundWebhook(
  rawBody: string,
  event: string,
): OutboundSignatureHeaders {
  const { current } = getSecrets();

  if (!current) {
    // Graceful degradation — headers present but empty, so receivers know signing is off
    console.warn('[WebhookSecurity] WEBHOOK_SECRET not set — outbound signing disabled');
    return {
      'X-OPS-Signature': '',
      'X-OPS-Timestamp': '',
      'X-OPS-Event': event,
    };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signaturePayload = `${timestamp}.${rawBody}`;
  const sig = hmacSha256(current, signaturePayload);

  return {
    'X-OPS-Signature': `sha256=${sig}`,
    'X-OPS-Timestamp': timestamp,
    'X-OPS-Event': event,
  };
}

// ── Task 2: Verify inbound signature ─────────────────────────────────────

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; status: number };

/**
 * Verify an inbound webhook request's HMAC signature.
 * Protects against:
 *   - Missing/malformed signatures
 *   - Expired requests (> 5 min old)
 *   - Replay attacks (duplicate signatures stored in MongoDB for 24h)
 * Task 7: Accepts either WEBHOOK_SECRET or OLD_WEBHOOK_SECRET during rotation.
 */
export async function verifyInboundSignature(
  signature: string,
  timestamp: string,
  rawBody: string,
  eventId: string,
): Promise<VerifyResult> {
  const { current, old } = getSecrets();

  // If neither secret is configured, bypass verification (unconfigured environment)
  if (!current && !old) {
    console.warn('[WebhookSecurity] No WEBHOOK_SECRET configured — skipping inbound verification');
    return { ok: true };
  }

  // 1. Validate timestamp — reject requests older than 5 minutes
  const nowSec    = Math.floor(Date.now() / 1000);
  const tsSec     = parseInt(timestamp, 10);
  if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: 'Request timestamp expired or invalid', status: 401 };
  }

  // 2. Validate signature format
  if (!signature.startsWith('sha256=')) {
    return { ok: false, reason: 'Invalid signature format — expected sha256=...', status: 401 };
  }

  const receivedSig = signature.slice(7);  // strip 'sha256='
  const sigPayload  = `${timestamp}.${rawBody}`;

  // 3. Task 7 — Try current secret first, then old (rotation support)
  let verified = false;
  if (current) {
    const expected = hmacSha256(current, sigPayload);
    verified = safeCompare(expected, receivedSig);
  }
  if (!verified && old) {
    const expected = hmacSha256(old, sigPayload);
    verified = safeCompare(expected, receivedSig);
    if (verified) {
      console.warn('[WebhookSecurity] Accepted signature with OLD_WEBHOOK_SECRET — rotation in progress');
    }
  }

  if (!verified) {
    return { ok: false, reason: 'Invalid HMAC signature', status: 401 };
  }

  // 4. Replay protection — check signature uniqueness in MongoDB (24h window)
  try {
    await connectDB();
    const existing = await WebhookSignature.findOne({ signature });
    if (existing) {
      return { ok: false, reason: 'Replayed request — signature already processed', status: 409 };
    }
    // Store for deduplication (auto-expires in 24h via TTL index)
    await WebhookSignature.create({ signature, timestamp, eventId, createdAt: new Date() });
  } catch (err: any) {
    // If MongoDB write fails (e.g. duplicate key race), treat as replay
    if (err.code === 11000) {
      return { ok: false, reason: 'Replayed request — signature already processed', status: 409 };
    }
    // Other DB errors: log but do not block (availability > security for outbound queue)
    console.error('[WebhookSecurity] Replay-check DB error:', err.message);
  }

  return { ok: true };
}

// ── Task 3: Idempotency check ─────────────────────────────────────────────

/**
 * Check whether an eventId has already been successfully delivered.
 * Used by processNextWebhook() to skip already-completed events.
 */
export async function isAlreadyDelivered(eventId: string): Promise<boolean> {
  const { connectDB: _connectDB, WebhookEvent } = await import('@/lib/db');
  await _connectDB();
  const existing = await WebhookEvent.findOne({ eventId, status: 'success' });
  return !!existing;
}
