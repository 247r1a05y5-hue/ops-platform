import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import crypto from 'crypto';

const keySecret = process.env.RAZORPAY_KEY_SECRET;

async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;
  try {
    const { getSessionFromRequest } = await import('@/lib/auth');
    const session = await getSessionFromRequest(req);
    if (!keySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay secret key is missing in environment variables.' },
        { status: 500 }
      );
    }

    await connectDB();
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoiceId) {
      return NextResponse.json(
        { success: false, error: 'All payment verification credentials are required' },
        { status: 400 }
      );
    }

    // Step 1: Verify the signature using constant-time comparison
    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    const signatureBuffer = Buffer.from(razorpay_signature, 'utf8');
    const generatedBuffer = Buffer.from(generatedSignature, 'utf8');

    const isSignatureValid =
      signatureBuffer.length === generatedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, generatedBuffer);

    if (!isSignatureValid) {
      return NextResponse.json({ success: false, error: 'Payment signature verification failed' }, { status: 400 });
    }

    // Step 2: Update the invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Corresponding invoice not found' }, { status: 404 });
    }

    invoice.status = 'Paid';
    invoice.razorpayPaymentId = razorpay_payment_id;
    invoice.razorpaySignature = razorpay_signature;
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
      await logAudit({
        action: 'pay_invoice',
        module: 'Payments',
        entityId: invoice._id.toString(),
        entityType: 'Invoice',
        oldValue: { status: 'Pending' },
        newValue: { status: 'Paid', paymentId: razorpay_payment_id },
        session: {
          sub: session?.sub || 'system',
          name: session?.name || 'Client',
          role: session?.role || 'User',
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Pay invoice verification audit log failed:', err.message);
    }

    // Step 3: Log user activity
    try {
      let logUserId = session?.sub;
      if (!logUserId) {
        const { User } = await import('@/lib/db');
        const systemAdmin = await User.findOne({ role: 'Admin' }) ?? await User.findOne();
        logUserId = systemAdmin?._id?.toString();
      }
      if (logUserId) {
        await logActivity({
            userId: logUserId,
            actionType: 'invoice_payment',
            description: `Invoice ${invoice.invoiceId} paid successfully via Razorpay (Payment ID: ${razorpay_payment_id})`,
            metadata: {
              invoiceId: invoice.invoiceId,
              amount: invoice.amount,
              client: invoice.client,
              razorpayPaymentId: razorpay_payment_id,
              razorpayOrderId: razorpay_order_id,
            },
          });
      }
    } catch (logError) {
      console.error('Failed to log payment activity:', logError);
    }

    // Step 4: Dispatch payment success notification email to client/sender
    try {
      // Find recipient email
      const recipientEmail = process.env.SENDER_EMAIL || 'vaishnavioz226@gmail.com';
      await sendEmail({
        event: 'activity_alert',
        to: recipientEmail,
        vars: {
          name: invoice.client,
          role: 'Client',
          action: 'Invoice Payment Received',
          description: `We have received a payment of ${invoice.amount} for invoice #${invoice.invoiceId} from ${invoice.client}. Payment Reference: ${razorpay_payment_id}.`,
        },
      });
    } catch (mailError) {
      console.error('Failed to dispatch payment confirmation email:', mailError);
    }

    // sendWhatsAppMessage never throws — it returns a result object
    const whatsappRecipient = invoice.clientPhone && invoice.clientPhone.trim() !== ''
      ? invoice.clientPhone.replace(/[^0-9]/g, '') // strip non-digits
      : process.env.ADMIN_WHATSAPP_NUMBER || '919284788141';

    const whatsappMessage =
      `✅ *Payment Received!*\n\n` +
      `Hi ${invoice.client},\n` +
      `Your payment of *₹${invoice.amount}* for Invoice *#${invoice.invoiceId}* has been received successfully. 🎉\n\n` +
      `📌 Payment ID: ${razorpay_payment_id}\n` +
      `📅 Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `Thank you for your prompt payment! 🙏`;

    const waResult = await sendWhatsAppMessage(whatsappRecipient, whatsappMessage);
    if (!waResult.success) {
      console.warn('[payment/verify] WhatsApp notification skipped:', waResult.error);
    }

    return NextResponse.json({ success: true, message: 'Payment verified and updated successfully' });
  } catch (error) {
    console.error('Error during signature verification:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
