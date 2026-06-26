import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { connectDB, WebhookEvent, WebhookDeliveryLog } from '@/lib/db';
import { getWorkerHealth } from '@/lib/webhookMetrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/webhook-metrics
 *
 * Returns comprehensive webhook infrastructure metrics:
 *   - success rate / failure rate
 *   - average retries
 *   - p95 delivery latency
 *   - queue size
 *   - dead letter count
 *   - retries/hour
 *   - worker uptime
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  await connectDB();

  try {
    const now        = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const oneHourAgo = new Date(now.getTime() - 3_600_000);

    // ── Status counts ────────────────────────────────────────────────────
    const [pending, processing, success, failed, dead] = await Promise.all([
      WebhookEvent.countDocuments({ status: 'pending' }),
      WebhookEvent.countDocuments({ status: 'processing' }),
      WebhookEvent.countDocuments({ status: 'success' }),
      WebhookEvent.countDocuments({ status: 'failed' }),
      WebhookEvent.countDocuments({ status: 'dead' }),
    ]);

    const total = success + failed + dead;
    const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : null;  // %
    const failureRate = total > 0 ? Math.round(((failed + dead) / total) * 1000) / 10 : null;

    // ── Delivery latency (all-time successful) ────────────────────────────
    const latencyResult = await WebhookEvent.aggregate([
      { $match: { status: 'success', duration: { $ne: null } } },
      { $sort: { duration: 1 } },
      {
        $group: {
          _id:      null,
          count:    { $sum: 1 },
          avg:      { $avg: '$duration' },
          durations: { $push: '$duration' },
        },
      },
    ]);

    let averageLatency: number | null = null;
    let p95Latency:     number | null = null;

    if (latencyResult.length > 0) {
      const { durations, avg, count } = latencyResult[0];
      averageLatency = Math.round(avg);
      // p95 = value at 95th percentile index
      const p95Index = Math.min(Math.floor(count * 0.95), count - 1);
      p95Latency = durations[p95Index] ?? null;
    }

    // ── Average retries (all non-pending events) ──────────────────────────
    const retryResult = await WebhookEvent.aggregate([
      { $match: { status: { $ne: 'pending' }, attempts: { $gt: 1 } } },
      { $group: { _id: null, avgAttempts: { $avg: '$attempts' }, count: { $sum: 1 } } },
    ]);
    const avgRetries         = retryResult.length > 0 ? Math.round(retryResult[0].avgAttempts * 10) / 10 : 0;
    const totalWithRetries   = retryResult.length > 0 ? retryResult[0].count : 0;

    // ── Retries in last hour ──────────────────────────────────────────────
    const retriesLastHour = await WebhookDeliveryLog.countDocuments({
      status:    'failed',
      createdAt: { $gte: oneHourAgo },
    });

    // ── Today's throughput ────────────────────────────────────────────────
    const [totalToday, successToday] = await Promise.all([
      WebhookEvent.countDocuments({ createdAt: { $gte: startOfDay } }),
      WebhookDeliveryLog.countDocuments({ status: 'success', createdAt: { $gte: startOfDay } }),
    ]);

    // ── Worker health ─────────────────────────────────────────────────────
    const worker = await getWorkerHealth();

    return NextResponse.json({
      success: true,
      metrics: {
        // Rates
        successRate,
        failureRate,
        // Queue size
        queueSize:   pending + processing,
        queueCounts: { pending, processing, success, failed, dead },
        // Latency
        averageLatencyMs: averageLatency,
        p95LatencyMs:     p95Latency,
        // Retries
        averageRetries:    avgRetries,
        totalWithRetries,
        retriesLastHour,
        // Today
        totalToday,
        successToday,
        // Worker
        workerUptime:    worker.uptime,
        workerHealthy:   worker.workerHealthy,
        workerStatus:    worker.workerStatus,
        lastHeartbeat:   worker.lastHeartbeat,
        processedTotal:  worker.processedToday,
        // Timestamp
        generatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WebhookMetrics] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
