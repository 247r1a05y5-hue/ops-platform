import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  const watiConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const razorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  
  const webhookConfigured = !!process.env.ZAPIER_WEBHOOK_URL;
  const apiKeyConfigured = !!process.env.ZAPIER_API_KEY;
  const connected = webhookConfigured && apiKeyConfigured;
  
  const { getLastDeliveryStatus } = await import('@/lib/zapier');
  const lastDeliveryStatus = getLastDeliveryStatus();
  
  const r2Configured = false; // R2 storage not configured in local environment

  return NextResponse.json({
    success: true,
    wati: watiConfigured,
    razorpay: razorpayConfigured,
    r2: r2Configured,
    // Keep zapier boolean for frontend backward compatibility
    zapier: connected,
    // Return required fields
    connected,
    webhookConfigured,
    apiKeyConfigured,
    lastDeliveryStatus
  });
}
