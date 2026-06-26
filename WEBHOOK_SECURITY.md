# OPS Platform — Webhook Security

## Signing Algorithm

Every outbound webhook is signed with **HMAC SHA-256**.

### Headers

```
X-OPS-Signature: sha256=<hex_signature>
X-OPS-Timestamp: <unix_seconds>
X-OPS-Event:     <event_name>
```

### Signature Construction

```
signaturePayload = timestamp + "." + rawBody
signature        = HMAC_SHA256(WEBHOOK_SECRET, signaturePayload)
header           = "sha256=" + hex(signature)
```

### Receiver Verification (example: Node.js)

```javascript
const crypto = require('crypto');

function verifyWebhook(req, secret) {
  const sig       = req.headers['x-ops-signature'];   // "sha256=abc..."
  const timestamp = req.headers['x-ops-timestamp'];
  const rawBody   = req.rawBody;                       // MUST be raw bytes

  // 1. Check timestamp freshness (reject if > 5 minutes old)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp expired');
  }

  // 2. Compute expected signature
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody)
    .digest('hex');

  // 3. Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Invalid signature');
  }
}
```

---

## Replay Attack Protection

### Rules

1. **Timestamp window**: Requests older than **5 minutes** are rejected (`401`).
2. **Signature deduplication**: Each signature is stored in MongoDB for 24 hours.
   - If the same signature arrives twice → `409 Conflict`.
   - TTL index auto-deletes after 24 hours.

### Protection Flow

```
Inbound request
      │
      ▼
[1] Check timestamp — reject if > 5 min old
      │
      ▼
[2] Recompute HMAC — reject if mismatch
      │
      ▼  (Task 7 — rotation: try WEBHOOK_SECRET, then OLD_WEBHOOK_SECRET)
[3] Check MongoDB WebhookSignature — reject if already seen
      │
      ▼
[4] Store signature (TTL 24h)
      │
      ▼
[5] Process event ✓
```

---

## Secret Rotation (Zero Downtime)

### Procedure

1. Generate a new secret.
2. Set `OLD_WEBHOOK_SECRET` = current `WEBHOOK_SECRET` value.
3. Set `WEBHOOK_SECRET` = new secret.
4. Deploy — during rotation, BOTH secrets are accepted for inbound verification. Outbound signing uses the new secret only.
5. After all partners have updated their verification keys, remove `OLD_WEBHOOK_SECRET`.

### Environment Variables

```bash
WEBHOOK_SECRET=<new_secret>
OLD_WEBHOOK_SECRET=<old_secret>   # Remove after rotation complete
```

---

## Security Checklist

| Control                          | Status |
|----------------------------------|--------|
| HMAC SHA-256 outbound signing    | ✅     |
| X-OPS-Timestamp staleness check  | ✅     |
| Timing-safe signature comparison | ✅     |
| Replay deduplication (24h TTL)   | ✅     |
| Zero-downtime secret rotation    | ✅     |
| API key inbound auth             | ✅     |
| CRON_SECRET worker protection    | ✅     |
| Secret never logged              | ✅     |
