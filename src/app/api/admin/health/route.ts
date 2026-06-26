import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import mongoose from 'mongoose';
import { checkBrevoHealth } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'disconnected';
    const whatsappConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
    const razorpayConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    const brevoStatus = await checkBrevoHealth();
    
    return NextResponse.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: dbStatus, details: dbStatus === 'healthy' ? 'MongoDB Atlas Connected' : 'Disconnected' },
        whatsapp: { status: whatsappConfigured ? 'configured' : 'disabled' },
        paymentGateway: { status: razorpayConfigured ? 'configured' : 'disabled' },
        emailService: brevoStatus
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
