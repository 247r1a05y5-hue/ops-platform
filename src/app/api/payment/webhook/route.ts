import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice, User } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import crypto from 'crypto';

async function _POST(req: NextRequest) {
  // ── Step 1: Enforce secret is configured ──────────────────────────────────
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'your_razorpay_webhook_secret_here') {
    // Hard-fail if secret is missing or default placeholder — never bypass in any environment.
    // This prevents accidental production deploys without the secret.
    console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is missing or set to a placeholder. Rejecting all webhook requests.');
    return NextResponse.json(
      { success: false, error: 'Webhook secret not configured on server.' },
      { status: 500 }
    );
  }

  // ── Step 2: Read raw body before any parsing ──────────────────────────────
  const bodyText = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  // ── Step 3: Reject if signature header is missing ────────────────────────
  if (!signature) {
    console.warn('[Razorpay Webhook] Missing x-razorpay-signature header. Rejecting request.');
    return NextResponse.json(
      { success: false, error: 'Missing webhook signature.' },
      { status: 401 }
    );
  }

  // ── Step 4: Constant-time HMAC verification ───────────────────────────────
  const digest = crypto.createHmac('sha256', webhookSecret).update(bodyText).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer    = Buffer.from(digest,    'utf8');

  const isValid =
    signatureBuffer.length === digestBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, digestBuffer);

  if (!isValid) {
    console.warn('[Razorpay Webhook] Signature mismatch — possible forgery attempt.');
    return NextResponse.json(
      { success: false, error: 'Invalid webhook signature.' },
      { status: 401 }
    );
  }

  // ── Step 5: Process verified payload ─────────────────────────────────────
  try {
    const payload = JSON.parse(bodyText);
    const event   = payload.event;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId       = paymentEntity?.order_id;
      const paymentId     = paymentEntity?.id;

      if (!orderId) {
        return NextResponse.json({ success: true, message: 'No order ID in event — skipped.' });
      }

      await connectDB();
      const invoice = await Invoice.findOne({ razorpayOrderId: orderId });

      if (!invoice) {
        console.warn(`[Razorpay Webhook] No invoice found for Order ID: ${orderId}`);
        // Return 200 — Razorpay expects 200 even for unknown orders to stop retrying
        return NextResponse.json({ success: true, message: 'Order not found in system.' });
      }

      if (invoice.status !== 'Paid') {
        invoice.status            = 'Paid';
        invoice.razorpayPaymentId = paymentId || '';
        await invoice.save();

        // Outbound webhook
        const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
        if (webhookUrl) {
          try {
            const { enqueueWebhook } = await import('@/lib/webhookQueue');
            const invoicePayload = {
              invoiceId: invoice._id.toString(),
              invoiceNumber: invoice.invoiceId,
              client: invoice.client,
              clientEmail: invoice.clientEmail || "",
              clientPhone: invoice.clientPhone || "",
              amount: invoice.amount,
              category: invoice.category || "",
              date: invoice.date || "",
              due: invoice.due || "",
              status: invoice.status,
              razorpayOrderId: invoice.razorpayOrderId || "",
              razorpayPaymentId: invoice.razorpayPaymentId || "",
            };

            console.log(`[Webhook] Enqueuing invoice_paid event for invoice ${invoice.invoiceId}`);
            await enqueueWebhook({
              event: 'invoice_paid',
              targetUrl: webhookUrl,
              payload: {
                event: 'invoice_paid',
                timestamp: new Date().toISOString(),
                source: 'ops-platform',
                version: '1.0',
                data: invoicePayload,
              },
            });
          } catch (err: any) {
            console.error('[Webhook] Failed to enqueue invoice_paid webhook:', err.message);
          }
        }

        // Enterprise Audit Log
        try {
          const { logAudit } = await import('@/lib/audit');
          const systemUser = await User.findOne({ role: 'Admin' }) ?? await User.findOne();
          await logAudit({
            action: 'pay_invoice_webhook',
            module: 'Payments',
            entityId: invoice._id.toString(),
            entityType: 'Invoice',
            oldValue: { status: 'Pending' },
            newValue: { status: 'Paid', paymentId: paymentId },
            session: {
              sub: systemUser?._id?.toString() || 'system',
              name: systemUser?.name || 'Razorpay Webhook',
              role: systemUser?.role || 'Admin',
            },
            req,
          });
        } catch (err: any) {
          console.error('[AuditLog] Pay invoice webhook audit log failed:', err.message);
        }

        // Activity log (non-blocking)
        try {
          const systemUser = await User.findOne({ role: 'Admin' }) ?? await User.findOne();
          if (systemUser) {
            await logActivity({
              userId:      systemUser._id.toString(),
              actionType:  'invoice_payment_webhook',
              description: `Invoice ${invoice.invoiceId} captured via Razorpay Webhook (Payment ID: ${paymentId})`,
              metadata: {
                invoiceId:         invoice.invoiceId,
                amount:            invoice.amount,
                client:            invoice.client,
                razorpayPaymentId: paymentId,
                razorpayOrderId:   orderId,
              },
            });
          }
        } catch (logErr) {
          console.error('[Razorpay Webhook] Activity log failed:', logErr);
        }

        // Email alert (non-blocking)
        try {
          const recipientEmail = process.env.SENDER_EMAIL || 'vaishnavioz226@gmail.com';
          await sendEmail({
            event: 'activity_alert',
            to:    recipientEmail,
            vars: {
              name:        invoice.client,
              role:        'Client',
              action:      'Invoice Payment Received (Webhook)',
              description: `Invoice #${invoice.invoiceId} for ${invoice.amount} paid by ${invoice.client}. Ref: ${paymentId}.`,
            },
          });
        } catch (mailErr) {
          console.error('[Razorpay Webhook] Email notification failed:', mailErr);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (parseErr) {
    console.error('[Razorpay Webhook] Payload parse error:', parseErr);
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload.' },
      { status: 400 }
    );
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
