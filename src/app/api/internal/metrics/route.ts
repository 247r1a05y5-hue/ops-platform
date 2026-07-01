import { withLogging } from '@/lib/logger';
import { NextResponse } from 'next/server';

/**
 * GET /api/internal/metrics
 * Exposes internal metrics in structured JSON format.
 */
async function _GET() {
  const metrics = (globalThis as any)._metrics || {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalDuration: 0,
    totalDbTime: 0,
    totalExtTime: 0,
    authFailures: 0,
    mongoFailures: 0,
    webhookFailures: 0,
    whatsappFailures: 0,
    cloudinaryFailures: 0,
    emailFailures: 0
  };

  const reqCount = metrics.totalRequests || 0;

  return NextResponse.json({
    totalRequests: metrics.totalRequests,
    successRequests: metrics.successRequests,
    failedRequests: metrics.failedRequests,
    averageResponseTimeMs: reqCount > 0 ? Number((metrics.totalDuration / reqCount).toFixed(2)) : 0,
    averageDbLatencyMs: reqCount > 0 ? Number((metrics.totalDbTime / reqCount).toFixed(2)) : 0,
    averageExternalLatencyMs: reqCount > 0 ? Number((metrics.totalExtTime / reqCount).toFixed(2)) : 0,
    failures: {
      auth: metrics.authFailures,
      mongo: metrics.mongoFailures,
      webhook: metrics.webhookFailures,
      whatsapp: metrics.whatsappFailures,
      cloudinary: metrics.cloudinaryFailures,
      email: metrics.emailFailures
    }
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
