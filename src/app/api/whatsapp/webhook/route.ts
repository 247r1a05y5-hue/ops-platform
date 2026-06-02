import { NextRequest, NextResponse } from 'next/server';
import { connectDB, WhatsAppMessage } from '@/lib/db';

// ── GET: Meta Webhook Verification Handshake ─────────────────────────────────
// Meta sends a GET with hub.mode=subscribe + hub.challenge when you set up
// or update the webhook URL in the Meta Developer Console.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set.');
    return new NextResponse('Server misconfiguration', { status: 500 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verification successful.');
    // Must respond with the raw challenge string (plain text, not JSON)
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.warn('[WhatsApp Webhook] Verification failed — token mismatch.');
  return new NextResponse('Forbidden', { status: 403 });
}

// ── POST: Incoming Webhook Events ────────────────────────────────────────────
// Handles two event types:
//   1. Delivery status updates (statuses array): delivered | read | failed
//   2. Inbound messages (messages array): text replies from clients
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Meta always sends entries as body.entry[].changes[].value
    const entries = body?.entry ?? [];
    if (entries.length === 0) {
      return NextResponse.json({ received: true });
    }

    await connectDB();

    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // ── 1. Delivery / Read / Failed status updates ─────────────────────
        const statuses: any[] = value.statuses ?? [];
        for (const status of statuses) {
          const waMessageId = status.id as string;
          const newStatus   = status.status as string; // sent | delivered | read | failed
          const phone       = status.recipient_id as string;
          const statusAt    = new Date(parseInt(status.timestamp, 10) * 1000);

          if (!waMessageId || !newStatus) continue;

          // Map Meta status values to our enum
          const mappedStatus =
            newStatus === 'delivered' ? 'delivered' :
            newStatus === 'read'      ? 'read'      :
            newStatus === 'failed'    ? 'failed'    :
            newStatus === 'sent'      ? 'sent'      : null;

          if (!mappedStatus) continue;

          // Try to update existing record; create a new one if missing
          const existing = await WhatsAppMessage.findOne({ waMessageId });
          if (existing) {
            // Only move status forward (sent→delivered→read / sent→failed)
            const order = ['sent', 'delivered', 'read', 'failed'];
            const currentIdx = order.indexOf(existing.status);
            const newIdx     = order.indexOf(mappedStatus);
            if (newIdx > currentIdx || mappedStatus === 'failed') {
              existing.status   = mappedStatus;
              existing.statusAt = statusAt;
              if (mappedStatus === 'failed' && status.errors?.length) {
                existing.errorCode    = status.errors[0].code;
                existing.errorMessage = status.errors[0].message ?? '';
              }
              await existing.save();
            }
          } else {
            // No outbound record found — persist stub so we have an audit trail
            await WhatsAppMessage.create({
              direction:    'outbound',
              waMessageId,
              phone,
              status:       mappedStatus,
              statusAt,
              errorCode:    mappedStatus === 'failed' && status.errors?.length ? status.errors[0].code : null,
              errorMessage: mappedStatus === 'failed' && status.errors?.length ? status.errors[0].message ?? '' : '',
            });
          }

          console.log(`[WhatsApp Webhook] Status update — ${waMessageId}: ${mappedStatus}`);
        }

        // ── 2. Inbound messages (replies from clients) ─────────────────────
        const messages: any[] = value.messages ?? [];
        for (const msg of messages) {
          const waMessageId = msg.id as string;
          const phone       = msg.from as string;
          const timestamp   = new Date(parseInt(msg.timestamp, 10) * 1000);
          const body        = msg.text?.body ?? msg.type ?? '';

          // Avoid double-inserts for replayed webhooks
          const alreadyExists = await WhatsAppMessage.exists({ waMessageId });
          if (alreadyExists) continue;

          await WhatsAppMessage.create({
            direction:  'inbound',
            waMessageId,
            phone,
            body,
            status:     'received',
            statusAt:   timestamp,
            sentAt:     timestamp,
          });

          console.log(`[WhatsApp Webhook] Inbound message from ${phone}: "${body.slice(0, 80)}"`);
        }
      }
    }

    // Meta expects a 200 response immediately — any non-200 triggers retries
    return NextResponse.json({ received: true });

  } catch (err) {
    // Log but still respond 200 so Meta doesn't disable the webhook
    console.error('[WhatsApp Webhook] Processing error:', err);
    return NextResponse.json({ received: true });
  }
}
