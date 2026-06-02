import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import Razorpay from 'razorpay';

// Ensure Razorpay keys are configured
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;
  try {
    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay keys are missing in environment variables.' },
        { status: 500 }
      );
    }

    await connectDB();
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'Paid') {
      return NextResponse.json({ success: false, error: 'Invoice is already paid' }, { status: 400 });
    }

    // Clean amount string to extract raw numeric value (e.g., "$5,000" -> 5000)
    const cleanAmount = parseFloat(invoice.amount.replace(/[^0-9.]/g, ''));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid invoice amount' }, { status: 400 });
    }

    // Initialize Razorpay client
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Razorpay expects amount in the smallest currency unit (e.g., paise for INR)
    // We will use INR by default as it is standard for Razorpay test mode.
    const amountInPaise = Math.round(cleanAmount * 100);
    const currency = 'INR';

    const options = {
      amount: amountInPaise,
      currency,
      receipt: `receipt_${invoice.invoiceId}`,
      payment_capture: 1, // Auto-capture payments
    };

    const order = await razorpay.orders.create(options);

    // Save the razorpayOrderId to the invoice
    invoice.razorpayOrderId = order.id;
    await invoice.save();

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      clientName: invoice.client,
      invoiceId: invoice.invoiceId,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
