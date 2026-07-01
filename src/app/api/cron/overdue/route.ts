import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import { requireCronAuth } from '@/lib/require-auth';

// Maximum number of invoice IDs to update in a single bulkWrite call.
// Keeps each operation within serverless memory limits (~512MB in Vercel hobby).
const BATCH_SIZE = 500;

async function _GET(req: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) return cronAuthError;

  try {
    await connectDB();
    const now = new Date();
    let updatedCount = 0;
    let processedCount = 0;

    // ── Cursor-based iteration to avoid loading all pending invoices into RAM ─
    // We fetch details needed to populate email and WhatsApp alerts
    const cursor = Invoice.find(
      { status: 'Pending' },
      { _id: 1, due: 1, client: 1, clientEmail: 1, clientPhone: 1, amount: 1, invoiceId: 1 }
    ).lean().cursor();

    const { sendEmail } = await import('@/lib/email');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp');

    for await (const inv of cursor) {
      processedCount++;
      const due = (inv as any).due as string | undefined;

      // Skip free-form or non-parseable due values
      if (!due || due === 'Next Month' || due === 'On Receipt') continue;

      const dueDate = new Date(due);
      if (!isNaN(dueDate.getTime()) && dueDate < now) {
        // 1. Update this invoice to Overdue in database
        await Invoice.updateOne(
          { _id: inv._id },
          { $set: { status: 'Overdue' }, $inc: { remindersCount: 1 } }
        );
        updatedCount++;

        const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${inv._id}`;

        // 2. Dispatch email reminder if clientEmail is present
        if (inv.clientEmail && inv.clientEmail.trim() !== '') {
          try {
            await sendEmail({
              event: 'activity_alert',
              to: inv.clientEmail,
              vars: {
                name: inv.client,
                role: 'Client',
                action: 'Invoice Overdue Notice',
                description: `This is an automated notice that invoice #${inv.invoiceId} for ${inv.amount} is currently OVERDUE. Original due date was ${inv.due}. Please make a secure payment here: ${paymentLink}`,
              },
            });
          } catch (mailErr) {
            console.error(`[OverdueCron] Failed to send email to ${inv.clientEmail}:`, mailErr);
          }
        }

        // 3. Dispatch WhatsApp reminder if clientPhone is present
        if (inv.clientPhone && inv.clientPhone.trim() !== '') {
          try {
            const cleanPhone = inv.clientPhone.replace(/[^0-9]/g, '');
            if (cleanPhone) {
              const whatsappMessage =
                `⚠️ *Payment Overdue Notice!*\n\n` +
                `Hi ${inv.client},\n` +
                `This is an automated notification that Invoice *#${inv.invoiceId}* for *${inv.amount}* is currently OVERDUE. 📝\n\n` +
                `📅 Due Date: ${inv.due}\n` +
                `💳 Pay securely here: ${paymentLink}\n\n` +
                `Please settle the outstanding balance at your earliest convenience. Thank you!`;

              const waResult = await sendWhatsAppMessage(cleanPhone, whatsappMessage);
              if (!waResult.success) {
                console.warn(`[OverdueCron] WhatsApp notification skipped for ${cleanPhone}:`, waResult.error);
              }
            }
          } catch (waErr) {
            console.error(`[OverdueCron] WhatsApp notification failed for ${inv.clientPhone}:`, waErr);
          }
        }
      }
    }

    console.log(
      `[OverdueCron] Processed ${processedCount} pending invoices. ` +
      `Marked ${updatedCount} as Overdue.`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${processedCount} invoices. Updated ${updatedCount} to Overdue.`,
      processed: processedCount,
      updated: updatedCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OverdueCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
