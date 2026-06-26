import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  const watiConfigured      = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const razorpayConfigured  = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const webhookConfigured   = !!process.env.ZAPIER_WEBHOOK_URL;
  const apiKeyConfigured    = !!process.env.ZAPIER_API_KEY;
  const connected           = webhookConfigured && apiKeyConfigured;
  const r2Configured        = false;

  // In-memory last delivery status (backward compatibility)
  const { getLastDeliveryStatus } = await import('@/lib/zapier');
  const lastDeliveryStatus = getLastDeliveryStatus();

  // Task 4 — webhook queue metrics (non-fatal: gracefully degrade if DB unavailable)
  let webhookQueue = null;
  try {
    const { getIntegrationsQueueBlock } = await import('@/lib/webhookMetrics');
    webhookQueue = await getIntegrationsQueueBlock();
  } catch (err) {
    console.error('[integrations] Failed to load webhook queue metrics:', err);
  }

  return NextResponse.json({
    success: true,
    wati: watiConfigured,
    razorpay: razorpayConfigured,
    r2: r2Configured,
    // Keep zapier booleans for frontend backward compatibility
    zapier: connected,
    connected,
    webhookConfigured,
    apiKeyConfigured,
    lastDeliveryStatus,
    // Task 4 — webhook queue block
    webhookQueue,
  });
}
