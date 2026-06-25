import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  const watiConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const razorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const zapierConfigured = !!(process.env.ZAPIER_WEBHOOK_URL && process.env.ZAPIER_API_KEY);
  const r2Configured = false; // R2 storage not configured in local environment

  return NextResponse.json({
    success: true,
    wati: watiConfigured,
    razorpay: razorpayConfigured,
    zapier: zapierConfigured,
    r2: r2Configured,
  });
}
