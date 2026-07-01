import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { connectDB, WebhookEvent, WebhookDeliveryLog } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/webhooks
 *
 * Admin-only webhook delivery dashboard.
 * Returns: latest deliveries, failed queue, dead letters, retry queue,
 *          statistics, worker status.
 *
 * Query params:
 *   page      (default: 1)
 *   limit     (default: 20, max: 100)
 *   status    filter: pending | processing | success | failed | dead
 *   eventId   search by exact eventId
 *   event     filter by event type (e.g. new_lead)
 */
async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  await connectDB();

  const url   = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const skip  = (page - 1) * limit;

  const statusFilter  = url.searchParams.get('status')  ?? '';
  const eventIdSearch = url.searchParams.get('eventId') ?? '';
  const eventFilter   = url.searchParams.get('event')   ?? '';

  try {
    // ── Build filter ──────────────────────────────────────────────────────
    const filter: Record<string, unknown> = {};
    if (statusFilter)  filter.status  = statusFilter;
    if (eventIdSearch) filter.eventId = eventIdSearch;
    if (eventFilter)   filter.event   = eventFilter;

    // ── Latest deliveries (paginated) ─────────────────────────────────────
    const [events, total] = await Promise.all([
      WebhookEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookEvent.countDocuments(filter),
    ]);

    // ── Delivery log for displayed events ─────────────────────────────────
    const eventIds = (events as any[]).map((e: any) => e.eventId);
    const deliveryLogs = await WebhookDeliveryLog.find({ eventId: { $in: eventIds } })
      .sort({ createdAt: -1 })
      .lean();

    // Group delivery logs by eventId
    const logsByEvent: Record<string, any[]> = {};
    for (const log of deliveryLogs as any[]) {
      if (!logsByEvent[log.eventId]) logsByEvent[log.eventId] = [];
      logsByEvent[log.eventId].push(log);
    }

    // ── Queue summary counts ──────────────────────────────────────────────
    const [pending, processing, success, failed, dead] = await Promise.all([
      WebhookEvent.countDocuments({ status: 'pending' }),
      WebhookEvent.countDocuments({ status: 'processing' }),
      WebhookEvent.countDocuments({ status: 'success' }),
      WebhookEvent.countDocuments({ status: 'failed' }),
      WebhookEvent.countDocuments({ status: 'dead' }),
    ]);

    // ── Today's stats ─────────────────────────────────────────────────────
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totalToday, successToday, failedToday] = await Promise.all([
      WebhookEvent.countDocuments({ createdAt: { $gte: startOfDay } }),
      WebhookEvent.countDocuments({ status: 'success', updatedAt: { $gte: startOfDay } }),
      WebhookEvent.countDocuments({ status: { $in: ['failed', 'dead'] }, updatedAt: { $gte: startOfDay } }),
    ]);

    // ── Average delivery time (successful, today) ─────────────────────────
    const avgDurationResult = await WebhookEvent.aggregate([
      { $match: { status: 'success', duration: { $ne: null }, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, avg: { $avg: '$duration' } } },
    ]);
    const averageDeliveryTime = avgDurationResult.length > 0
      ? Math.round(avgDurationResult[0].avg)
      : null;

    // ── Retry statistics ──────────────────────────────────────────────────
    const retryStats = await WebhookEvent.aggregate([
      { $match: { attempts: { $gt: 1 } } },
      { $group: { _id: null, avgAttempts: { $avg: '$attempts' }, maxAttempts: { $max: '$attempts' }, count: { $sum: 1 } } },
    ]);
    const retryStatsSummary = retryStats.length > 0
      ? {
          count:       retryStats[0].count,
          avgAttempts: Math.round(retryStats[0].avgAttempts * 10) / 10,
          maxAttempts: retryStats[0].maxAttempts,
        }
      : { count: 0, avgAttempts: 0, maxAttempts: 0 };

    // ── Worker status ─────────────────────────────────────────────────────
    const { getWorkerHealth } = await import('@/lib/webhookMetrics');
    const workerHealth = await getWorkerHealth();

    return NextResponse.json({
      success: true,
      // Paginated events with their delivery logs
      events: (events as any[]).map((e: any) => ({
        ...e,
        deliveryHistory: logsByEvent[e.eventId] ?? [],
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      // Queue summary
      queue: { pending, processing, success, failed, dead },
      // Today's stats
      today: { total: totalToday, success: successToday, failed: failedToday },
      // Performance
      averageDeliveryTime,
      retryStats: retryStatsSummary,
      // Worker
      worker: workerHealth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WebhookDashboard] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
