# OPS Platform — Webhook Operations Guide

## Day-to-Day Operations

### Health Check

Check worker and queue health via the admin integration dashboard:
```
GET /api/admin/integrations
```

Key fields to monitor:
- `webhookQueue.workerHealthy` — `false` means no heartbeat in last 5 min
- `webhookQueue.pending` — growing pile indicates cron is not running
- `webhookQueue.dead` — requires manual investigation

---

## Monitoring Alerts

Set up alerts for:

| Metric                             | Threshold         | Action                       |
|------------------------------------|-------------------|------------------------------|
| `pending` queue size               | > 50              | Check cron job health        |
| `dead` queue count                 | > 5               | Investigate and manual retry |
| `workerHealthy`                    | `false`           | Check Railway cron config    |
| `p95LatencyMs`                     | > 3000ms          | Check Zapier webhook URL     |
| `failureRate`                      | > 10%             | Check ZAPIER_WEBHOOK_URL     |

---

## Manual Retry Procedure

When a webhook reaches `dead` status (5 failed attempts):

1. Navigate to Admin → Integrations → Webhook Queue
2. Find the dead event by `eventId`
3. Call:
   ```
   POST /api/admin/webhooks/retry/:eventId
   ```
4. The webhook returns to `pending` and will be delivered on the next cron tick
5. The action is recorded in the audit log

---

## Recovery Procedures

### Stuck Worker (cron not firing)

**Symptoms**: `workerHealthy: false`, growing `pending` count

**Steps**:
1. Check Railway Cron job is enabled: `GET /api/cron/webhooks` every minute
2. Verify `CRON_SECRET` environment variable is set
3. Manually trigger one run: `GET /api/cron/webhooks?Authorization=Bearer <CRON_SECRET>`
4. Monitor `lastHeartbeat` to confirm recovery

### Stuck Processing Locks

**Symptoms**: `processing` count stuck > 0 for > 10 minutes

**Resolution**: Automatic — the cron worker calls `recoverStuckWebhooks()` at the start of every run. Processing locks older than 10 minutes are automatically returned to `pending`.

**Log to look for**:
```
[WebhookQueue] Processing lock recovered — eventId="..." stuckSince=...
[WebhookQueue] Recovered stuck webhook — eventId="..."
```

### Database Connection Issues

**Symptoms**: All enqueues failing with MongoDB errors

**Steps**:
1. Check `MONGODB_URI` environment variable
2. Verify MongoDB Atlas IP allowlist includes Railway egress IPs
3. Webhooks already in queue will be delivered once connection is restored (queue is durable)

---

## Secret Rotation (Zero Downtime)

```bash
# Step 1: Add OLD_WEBHOOK_SECRET before changing current
OLD_WEBHOOK_SECRET=<current_value>
WEBHOOK_SECRET=<new_value>

# Step 2: Deploy — both secrets accepted during rotation window

# Step 3: After all Zapier Zaps are updated to use new secret, remove:
# unset OLD_WEBHOOK_SECRET
```

---

## Troubleshooting

### Webhook Stuck in `processing`

Auto-resolved in < 10 minutes by the stuck-job recovery mechanism. No manual action needed.

### All Webhooks Failing with HTTP 4xx

- Check `ZAPIER_WEBHOOK_URL` points to correct endpoint
- Verify Zapier is not rate-limiting the delivery IP
- Check `X-OPS-Signature` — if Zapier rejects signed webhooks, verify `WEBHOOK_SECRET` matches

### Replay Rejection (`409 Conflict`)

Means the same request was delivered twice (network retry from Zapier's side). This is normal and the deduplication is working correctly.

### `WEBHOOK_SECRET not set — outbound signing disabled` in logs

Add `WEBHOOK_SECRET` to environment variables and redeploy. Existing queued events will be signed after the next delivery attempt.

---

## Log Reference

| Log Line | Meaning |
|----------|---------|
| `[WebhookQueue] Enqueued event="..."` | Event added to queue |
| `[WebhookQueue] Claimed eventId="..."` | Worker picked up event |
| `[WebhookQueue] Delivered` | 200/201/202 received |
| `[WebhookQueue] Retry Scheduled` | Delivery failed, retry queued |
| `[WebhookQueue] Dead Letter` | maxAttempts exceeded |
| `[WebhookQueue] Processing lock recovered` | Stuck job fixed |
| `[WebhookQueue] Recovered stuck webhook` | Same (legacy format) |
| `[WebhookQueue] Cron run complete` | Worker finished |
| `[Zapier] Timeout` | fetch() timed out at 5s |
| `[WebhookSecurity] Replay rejected` | Duplicate signature blocked |
