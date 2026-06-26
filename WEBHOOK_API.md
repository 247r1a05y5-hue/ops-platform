# OPS Platform — Webhook API Reference

## Outbound Webhook Events

All outbound webhooks are delivered via `POST` to `ZAPIER_WEBHOOK_URL`.

### Headers

```
Content-Type:    application/json
X-OPS-Signature: sha256=<hmac>
X-OPS-Timestamp: <unix_seconds>
X-OPS-Event:     <event_name>
```

### Events

#### `new_lead`
```json
{
  "event": "new_lead",
  "eventId": "evt-uuid",
  "name": "John Smith",
  "email": "john@company.com",
  "company": "Acme Corp",
  "value": "$5000",
  "stage": "Discovery",
  "status": "Warm",
  "assignedTo": "Jane Doe",
  "createdBy": "Admin",
  "leadId": "mongo_id"
}
```

#### `new_user_signup`
```json
{
  "event": "new_user_signup",
  "eventId": "evt-uuid",
  "name": "Jane Doe",
  "email": "jane@company.com",
  "role": "Employee",
  "signupTime": "2024-01-15T10:30:00Z",
  "userId": "mongo_id"
}
```

---

## Inbound Webhook (Zapier → OPS)

### Endpoint
```
POST /api/zapier
```

### Authentication
```
x-api-key: <ZAPIER_API_KEY>
```

### Optional Security Headers (when WEBHOOK_SECRET is set)
```
X-OPS-Signature: sha256=<hmac>
X-OPS-Timestamp: <unix_seconds>
```

### Supported Events
- `new_user_signup`
- `new_lead`
- `new_email_received`
- `send_email`

---

## Admin Dashboard API

### List Webhook Events

```
GET /api/admin/webhooks
Authorization: Session cookie (Admin role)

Query params:
  page     integer  default: 1
  limit    integer  default: 20, max: 100
  status   string   pending|processing|success|failed|dead
  eventId  string   exact UUID match
  event    string   event type filter
```

**Response**
```json
{
  "success": true,
  "events": [...],
  "pagination": { "page": 1, "limit": 20, "total": 150, "pages": 8 },
  "queue": { "pending": 2, "processing": 0, "success": 145, "failed": 2, "dead": 1 },
  "today": { "total": 12, "success": 10, "failed": 2 },
  "averageDeliveryTime": 214,
  "retryStats": { "count": 5, "avgAttempts": 2.4, "maxAttempts": 4 },
  "worker": { "workerHealthy": true, "lastHeartbeat": "...", "uptime": 3600 }
}
```

---

### Manual Retry

```
POST /api/admin/webhooks/retry/:eventId
Authorization: Session cookie (Admin role)
```

**Response (success)**
```json
{
  "success": true,
  "message": "Webhook evt-xxx queued for immediate retry",
  "eventId": "evt-xxx",
  "previousStatus": "dead",
  "previousAttempts": 5,
  "nextStatus": "pending",
  "scheduledAt": "2024-01-15T10:30:00Z"
}
```

**Response (not found)**
```json
{ "success": false, "error": "Webhook not found: evt-xxx" }
```

**Response (not retryable)**
```json
{ "success": false, "error": "Cannot retry webhook with status 'success'..." }
```

---

### Webhook Metrics

```
GET /api/admin/webhook-metrics
Authorization: Session cookie (Admin role)
```

**Response**
```json
{
  "success": true,
  "metrics": {
    "successRate": 97.5,
    "failureRate": 2.5,
    "queueSize": 3,
    "queueCounts": { "pending": 2, "processing": 1, "success": 145, "failed": 2, "dead": 1 },
    "averageLatencyMs": 214,
    "p95LatencyMs": 890,
    "averageRetries": 1.3,
    "totalWithRetries": 12,
    "retriesLastHour": 2,
    "totalToday": 45,
    "successToday": 43,
    "workerUptime": 7200,
    "workerHealthy": true,
    "lastHeartbeat": "2024-01-15T10:29:00Z",
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### Integration Health (includes queue block)

```
GET /api/admin/integrations
Authorization: Session cookie (Admin role)
```

**Response** includes `webhookQueue`:
```json
{
  "webhookQueue": {
    "pending": 2,
    "processing": 0,
    "failed": 1,
    "dead": 0,
    "success": 145,
    "workerHealthy": true,
    "lastHeartbeat": "2024-01-15T10:29:00Z",
    "processedToday": 45,
    "averageDeliveryTime": 214
  }
}
```
