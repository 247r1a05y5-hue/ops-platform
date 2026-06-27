import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice, User } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Workspace isolation helper ──────────────────────────────────────────────────
// Invoice schema has no workspaceId field (existing docs need no migration for
// single-workspace deployments — all users share ops-main). For multi-tenant
// isolation, we resolve the current user's workspaceId and look up workspace
// member emails, then filter invoices whose clientEmail matches a workspace
// member. Invoices with no clientEmail are included (internally created).
// Cache workspace member emails for 15 seconds to speed up concurrent invoice loads
const emailCache = new Map<string, { emails: string[] | null; expiresAt: number }>();
const EMAIL_CACHE_TTL = 15000;

async function getWorkspaceMemberEmails(userId: string): Promise<string[] | null> {
  const now = Date.now();
  const cached = emailCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.emails;
  }

  try {
    const currentUser = await User.findById(userId).select('workspaceId').lean() as any;
    if (!currentUser?.workspaceId) {
      emailCache.set(userId, { emails: null, expiresAt: now + EMAIL_CACHE_TTL });
      return null; // single workspace — skip filter
    }
    const members = await User.find({ workspaceId: currentUser.workspaceId })
      .select('email').lean() as any[];
    const emails = members.map((m: any) => m.email).filter(Boolean);
    emailCache.set(userId, { emails, expiresAt: now + EMAIL_CACHE_TTL });
    return emails;
  } catch {
    return null;
  }
}

// GET all invoices
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '0');

    // ── Workspace isolation ─────────────────────────────────────────────────
    const memberEmails = await getWorkspaceMemberEmails(session.sub);
    const baseFilter: any = {};
    if (memberEmails) {
      // Invoices whose clientEmail belongs to a workspace member, or no clientEmail set
      baseFilter.$or = [
        { clientEmail: { $in: memberEmails } },
        { clientEmail: '' },
        { clientEmail: { $exists: false } },
      ];
    }

    let query = Invoice.find(baseFilter).sort({ createdAt: -1 });
    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const invoices = await query;
    const total = await Invoice.countDocuments(baseFilter);

    return NextResponse.json({
      success: true,
      invoices,
      metadata: { total, page, limit, pages: limit > 0 ? Math.ceil(total / limit) : 1 }
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  }
}

// POST new invoice
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { client, clientEmail, clientPhone, amount, category, due, date } = body;

    if (!client || !amount) {
      return NextResponse.json({ success: false, error: 'Client and Amount are required' }, { status: 400 });
    }

    const invoiceId = `INV-${Math.floor(Math.random() * 900) + 100}`;
    const newInvoice = new Invoice({
      invoiceId,
      client,
      clientEmail: clientEmail || '',
      clientPhone: clientPhone || '',
      amount,
      category: category || 'Consulting',
      date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      due: due || 'Next Month',
      status: 'Pending',
      remindersCount: 0
    });

    newInvoice.paymentLink = `/pay/${newInvoice._id}`;
    await newInvoice.save();

    await logActivity({
      userId: session.sub,
      actionType: 'workflow_action',
      module: 'Billing',
      description: `Invoice ${invoiceId} of amount ${amount} created for client "${client}" by ${session.name}`,
      req,
    }).catch(console.error);

    // Outbound webhook
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const { enqueueWebhook } = await import('@/lib/webhookQueue');
        const invoicePayload = {
          invoiceId: newInvoice._id.toString(),
          invoiceNumber: newInvoice.invoiceId,
          client: newInvoice.client,
          clientEmail: newInvoice.clientEmail || "",
          clientPhone: newInvoice.clientPhone || "",
          amount: newInvoice.amount,
          category: newInvoice.category || "",
          date: newInvoice.date || "",
          due: newInvoice.due || "",
          status: newInvoice.status,
          razorpayOrderId: newInvoice.razorpayOrderId || "",
          razorpayPaymentId: newInvoice.razorpayPaymentId || "",
        };

        console.log(`[Webhook] Enqueuing invoice_created event for invoice ${newInvoice.invoiceId}`);
        await enqueueWebhook({
          event: 'invoice_created',
          targetUrl: webhookUrl,
          payload: {
            event: 'invoice_created',
            timestamp: new Date().toISOString(),
            source: 'ops-platform',
            version: '1.0',
            data: invoicePayload,
          },
        });
      } catch (err: any) {
        console.error('[Webhook] Failed to enqueue invoice_created webhook:', err.message);
      }
    }

    // sendWhatsAppMessage never throws — it returns a result object
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || '919284788141';
    const waResult = await sendWhatsAppMessage(adminPhone,
      `🧾 *New Invoice Created!*\n\n📋 *Invoice ID:* ${invoiceId}\n👤 *Client:* ${client}\n💰 *Amount:* ₹${amount}\n📁 *Category:* ${category || 'Consulting'}\n📅 *Due:* ${due || 'Next Month'}\n\nInvoice is now pending payment.`
    );
    if (!waResult.success) {
      console.warn('[invoices] WhatsApp notification skipped:', waResult.error);
    }

    return NextResponse.json({ success: true, invoice: newInvoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT (approve, send reminder, update status)
export async function PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { id, action, status, clientEmail } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    if (action === 'approve') {
      invoice.status = 'Paid';
      await invoice.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'Billing',
        description: `Invoice ${invoice.invoiceId} of amount ${invoice.amount} marked as Paid by ${session.name}`,
        req,
      }).catch(console.error);

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

      return NextResponse.json({ success: true, invoice });
    }

    if (action === 'send_reminder') {
      invoice.remindersCount += 1;
      await invoice.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'Billing',
        description: `Dispatched manual invoice reminder for "${invoice.client}" (Invoice ${invoice.invoiceId}) by ${session.name}`,
        req,
      }).catch(console.error);

      if (clientEmail) {
        try {
          await sendEmail({
            event: 'activity_alert',
            to: clientEmail,
            vars: {
              name: invoice.client,
              role: 'Client',
              action: `Payment Reminder: Invoice ${invoice.invoiceId}`,
              description: `This is a reminder that your invoice ${invoice.invoiceId} for ${invoice.amount} is outstanding. Due date: ${invoice.due}. Please pay here: ${invoice.paymentLink}`
            }
          });
        } catch (mailErr) {
          console.error('Failed to send email reminder:', mailErr);
        }
      }

      return NextResponse.json({ success: true, invoice });
    }

    if (status) {
      invoice.status = status;
      await invoice.save();
    }

    return NextResponse.json({ success: true, invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH invoice (aliased to PUT)
export async function PATCH(req: NextRequest) {
  return PUT(req);
}

// DELETE invoice
export async function DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await Invoice.findByIdAndDelete(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Invoice successfully deleted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
