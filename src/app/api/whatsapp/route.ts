import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, isWhatsAppConfigured } from '@/lib/whatsapp';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { connectDB, WhatsAppMessage } from '@/lib/db';

async function _POST(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;

  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    const { phone, message } = await req.json();
    if (!phone || !message) {
      return NextResponse.json({ success: false, error: 'phone and message are required' }, { status: 400 });
    }

    const sanitizedPhone = phone.replace(/[^0-9]/g, '');
    if (!sanitizedPhone) {
      return NextResponse.json({ success: false, error: 'invalid phone number' }, { status: 400 });
    }

    await connectDB();

    if (!isWhatsAppConfigured()) {
      // Mock Fallback Protocol
      console.log(`[WhatsApp Mock] Sending message to ${sanitizedPhone}: ${message}`);
      const mockMsg = await WhatsAppMessage.create({
        direction: 'outbound',
        waMessageId: `mock_${Math.random().toString(36).substr(2, 9)}`,
        phone: sanitizedPhone,
        body: message,
        status: 'sent',
        sentAt: new Date(),
      });
      return NextResponse.json({ success: true, mock: true, message: mockMsg });
    }

    const result = await sendWhatsAppMessage(sanitizedPhone, message);
    if (!result.success) {
      console.warn(`[WhatsApp API Failed] falling back to mock send. Error: ${result.error}`);
      const mockMsg = await WhatsAppMessage.create({
        direction: 'outbound',
        waMessageId: `mock_fallback_${Math.random().toString(36).substr(2, 9)}`,
        phone: sanitizedPhone,
        body: message,
        status: 'sent',
        sentAt: new Date(),
      });
      return NextResponse.json({ success: true, mock: true, warning: result.error, message: mockMsg });
    }

    return NextResponse.json({ success: true, details: result.data });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
