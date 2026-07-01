import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage, isWhatsAppConfigured } from '@/lib/whatsapp';
import { requireAuth } from '@/lib/require-auth';

async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to') || '919284788141';
  const message = searchParams.get('message') || 'Hello from your project 🚀';

  const sanitizedTo = to.replace(/[^0-9]/g, '');
  if (!sanitizedTo) {
    return NextResponse.json(
      { success: false, message: 'Invalid recipient phone number.' },
      { status: 400 }
    );
  }

  if (!isWhatsAppConfigured()) {
    return NextResponse.json(
      { success: false, message: 'WhatsApp is not configured. Set WHATSAPP_PHONE_ID and WHATSAPP_TOKEN.' },
      { status: 503 }
    );
  }

  // sendWhatsAppMessage never throws — it returns a result object
  const result: any = await sendWhatsAppMessage(sanitizedTo, message);

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to send WhatsApp message',
        error: result.error,
        code: result.code,
      },
      { status: result.code === 190 ? 401 : 502 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `WhatsApp message dispatched to ${sanitizedTo}`,
    details: { recipient: sanitizedTo, messageContent: message, metaResponse: result.data },
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
