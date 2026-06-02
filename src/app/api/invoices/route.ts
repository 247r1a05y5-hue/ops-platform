import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { logActivity } from '@/lib/activity';


// GET all invoices
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager', 'User']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '0');

    let query = Invoice.find().sort({ createdAt: -1 });
    
    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }
    
    const invoices = await query;
    const total = await Invoice.countDocuments();

    return NextResponse.json({ 
      success: true, 
      invoices,
      metadata: { total, page, limit, pages: limit > 0 ? Math.ceil(total / limit) : 1 } 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST new invoice
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User']);
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

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User']);
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
