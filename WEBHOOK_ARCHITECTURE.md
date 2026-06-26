# OPS Platform — Webhook Architecture

## Overview

The OPS Platform webhook infrastructure is a production-grade, enterprise-quality event delivery engine modeled after Stripe and GitHub webhooks. It guarantees **at-least-once delivery** with idempotency protection, HMAC signing, replay-attack prevention, and automatic retry with exponential backoff.

---

## High-Level Flow

```
Business Logic (lead created, user signup)
        │
        ▼  enqueueWebhook()
  WebhookEvent (MongoDB) ← persistent queue
        │
        ▼  GET /api/cron/webhooks (every minute)
        │
        ├─► recoverStuckWebhooks()
        │      • Finds processing jobs older than 10 min
        │      • Atomically resets to 'pending'
        │
        ├─► claimNextWebhook()         ← atomic findOneAndUpdate (no race)
        │      • Sets status: 'processing'
        │      • Sets processingStartedAt = now
        │
        ├─► isAlreadyDelivered()       ← idempotency check
        │
        ├─► signOutboundWebhook()      ← HMAC SHA-256 signing
        │
        ├─► fetch(targetUrl, { headers: signed })
        │
        ├─► logDeliveryAttempt()       ← WebhookDeliveryLog
        │
        └─► markSuccess() | markFailure() → scheduleRetry() | moveToDeadLetter()
```

---

## Queue Status States

```
pending
  │
  ▼  claimNextWebhook()
processing
  │
  ├──► success           (HTTP 200/201/202)
  ├──► failed            (HTTP error or timeout) → retry scheduled
  └──► dead              (maxAttempts exceeded)
```

---

## Retry Policy

| Attempt | Delay       |
|---------|-------------|
| 1       | Immediate   |
| 2       | 30 seconds  |
| 3       | 2 minutes   |
| 4       | 5 minutes   |
| 5       | 15 minutes  |
| > 5     | Dead letter |

---

## MongoDB Collections

| Collection            | Purpose                                    |
|-----------------------|--------------------------------------------|
| `webhookevents`       | Main delivery queue                        |
| `webhookdeliverylogs` | Per-attempt history                        |
| `webhooksignatures`   | Replay-attack deduplication (24h TTL)      |
| `webhookworkerstatuses` | Cron worker heartbeat tracking           |

---

## Key Indexes

```
webhookevents:
  { status: 1, nextRetryAt: 1 }        ← worker claim
  { status: 1, processingStartedAt: 1} ← stuck-job recovery
  { eventId: 1 }                        ← unique lookup
  { createdAt: -1 }                     ← dashboard listing

webhooksignatures:
  { signature: 1 }  unique             ← replay deduplication
  { createdAt: 1 }  TTL 86400          ← auto-expire 24h

webhookdeliverylogs:
  { eventId: 1 }                        ← per-event history
  { event: 1, createdAt: -1 }          ← event-type filtering
```

---

## Cron Worker Behaviour

- **Schedule**: Every minute (`* * * * *`)
- **Max events/run**: 20
- **Wall-clock limit**: 45 seconds (prevents Railway timeout)
- **Crash safety**: One failed event never stops the loop
- **Heartbeat**: Updated in MongoDB after every run

---

## Environment Variables

| Variable              | Required | Description                        |
|-----------------------|----------|------------------------------------|
| `ZAPIER_WEBHOOK_URL`  | Yes      | Outbound delivery target           |
| `ZAPIER_API_KEY`      | Yes      | Inbound auth for `/api/zapier`     |
| `WEBHOOK_SECRET`      | Yes      | HMAC signing key (outbound + inbound verify) |
| `OLD_WEBHOOK_SECRET`  | No       | Used during secret rotation        |
| `CRON_SECRET`         | Yes      | Protects `/api/cron/webhooks`      |
| `MONGODB_URI`         | Yes      | Queue persistence                  |
