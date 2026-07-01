import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function _GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required.' }, { status: 400 });
    }

    let invoice = null;
    
    // Look up by Mongoose document _id first
    if (mongoose.Types.ObjectId.isValid(id)) {
      invoice = await Invoice.findById(id);
    }
    
    // Fall back to lookup by readable invoiceId string
    if (!invoice) {
      invoice = await Invoice.findOne({ invoiceId: id });
    }

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 });
    }

    // Return only necessary client-facing fields to prevent full database attribute leak
    const clientSafeInvoice = {
      _id: invoice._id,
      invoiceId: invoice.invoiceId,
      client: invoice.client,
      clientEmail: invoice.clientEmail || '',
      clientPhone: invoice.clientPhone || '',
      amount: invoice.amount,
      date: invoice.date,
      due: invoice.due,
      status: invoice.status,
      category: invoice.category,
      paymentLink: invoice.paymentLink,
    };

    return NextResponse.json({ success: true, invoice: clientSafeInvoice }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
