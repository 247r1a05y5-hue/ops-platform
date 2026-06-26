/**
 * webhookMetrics.ts — Queue observability helpers
 *
 * Provides aggregated statistics for:
 *   - Queue status counts (pending / processing / success / failed / dead)
 *   - Today's volume
 *   - Average delivery time
 *   - Average attempts-per-event
 *   - Worker health
 */

import { connectDB, WebhookEvent, WebhookWorkerStatus } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────────

export interface QueueMetrics {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  dead: number;
  totalToday: number;
  averageDeliveryTime: number | null;   // ms, null if no data
  averageAttempts: number | null;        // null if no data
}

export interface WorkerHealth {
  workerHealthy: boolean;
  lastHeartbeat: string | null;          // ISO string or null
  processedToday: number;
  successCount: number;
  failedCount: number;
  uptime: number;                        // seconds
  workerStatus: 'healthy' | 'idle' | 'error' | 'unknown';
}

export interface IntegrationsQueueBlock {
  pending: number;
  processing: number;
  failed: number;
  dead: number;
  success: number;
  workerHealthy: boolean;
  lastHeartbeat: string | null;
  processedToday: number;
  averageDeliveryTime: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Worker is considered stale if lastHeartbeat is older than this (ms) */
const WORKER_STALE_MS = 5 * 60 * 1000;  // 5 minutes

const WORKER_ID = 'cron-worker';

// ── getQueueMetrics ───────────────────────────────────────────────────────

export async function getQueueMetrics(): Promise<QueueMetrics> {
  await connectDB();

  // 1. Status counts (parallel)
  const [pending, processing, success, failed, dead] = await Promise.all([
    WebhookEvent.countDocuments({ status: 'pending' }),
    WebhookEvent.countDocuments({ status: 'processing' }),
    WebhookEvent.countDocuments({ status: 'success' }),
    WebhookEvent.countDocuments({ status: 'failed' }),
    WebhookEvent.countDocuments({ status: 'dead' }),
  ]);

  // 2. Today's total
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const totalToday = await WebhookEvent.countDocuments({ createdAt: { $gte: startOfDay } });

  // 3. Average delivery time (only successfully delivered, today)
  const avgDurationResult = await WebhookEvent.aggregate([
    { $match: { status: 'success', duration: { $ne: null }, createdAt: { $gte: startOfDay } } },
    { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
  ]);
  const averageDeliveryTime = avgDurationResult.length > 0
    ? Math.round(avgDurationResult[0].avgDuration)
    : null;

  // 4. Average attempts (all non-pending)
  const avgAttemptsResult = await WebhookEvent.aggregate([
    { $match: { status: { $ne: 'pending' } } },
    { $group: { _id: null, avgAttempts: { $avg: '$attempts' } } },
  ]);
  const averageAttempts = avgAttemptsResult.length > 0
    ? Math.round(avgAttemptsResult[0].avgAttempts * 10) / 10
    : null;

  return { pending, processing, success, failed, dead, totalToday, averageDeliveryTime, averageAttempts };
}

// ── getWorkerHealth ───────────────────────────────────────────────────────

export async function getWorkerHealth(): Promise<WorkerHealth> {
  await connectDB();

  const worker = await WebhookWorkerStatus.findOne({ workerId: WORKER_ID }).lean() as any;
  if (!worker) {
    return {
      workerHealthy: false,
      lastHeartbeat: null,
      processedToday: 0,
      successCount: 0,
      failedCount: 0,
      uptime: 0,
      workerStatus: 'unknown',
    };
  }

  const now = Date.now();
  const lastHbMs = new Date(worker.lastHeartbeat).getTime();
  const workerHealthy = (now - lastHbMs) < WORKER_STALE_MS;

  return {
    workerHealthy,
    lastHeartbeat: new Date(worker.lastHeartbeat).toISOString(),
    processedToday: worker.processedCount ?? 0,
    successCount: worker.successCount ?? 0,
    failedCount: worker.failedCount ?? 0,
    uptime: worker.uptime ?? 0,
    workerStatus: worker.status ?? 'unknown',
  };
}

// ── getIntegrationsQueueBlock ─────────────────────────────────────────────
// Used by /api/admin/integrations to return a clean webhook queue block.

export async function getIntegrationsQueueBlock(): Promise<IntegrationsQueueBlock> {
  const [metrics, health] = await Promise.all([
    getQueueMetrics(),
    getWorkerHealth(),
  ]);

  return {
    pending:             metrics.pending,
    processing:          metrics.processing,
    failed:              metrics.failed,
    dead:                metrics.dead,
    success:             metrics.success,
    workerHealthy:       health.workerHealthy,
    lastHeartbeat:       health.lastHeartbeat,
    processedToday:      health.processedToday,
    averageDeliveryTime: metrics.averageDeliveryTime,
  };
}

// ── updateWorkerHeartbeat ─────────────────────────────────────────────────

export async function updateWorkerHeartbeat(params: {
  processedCount: number;
  successCount: number;
  failedCount: number;
  startedAt: Date;
  workerStatus: 'healthy' | 'idle' | 'error';
}): Promise<void> {
  await connectDB();

  const now = new Date();
  const uptime = Math.round((now.getTime() - params.startedAt.getTime()) / 1000);

  await WebhookWorkerStatus.findOneAndUpdate(
    { workerId: WORKER_ID },
    {
      $set: {
        workerId: WORKER_ID,
        lastHeartbeat: now,
        processedCount: params.processedCount,
        successCount: params.successCount,
        failedCount: params.failedCount,
        uptime,
        status: params.workerStatus,
        updatedAt: now,
      },
      $setOnInsert: { startedAt: params.startedAt },
    },
    { upsert: true, new: true }
  );
}
