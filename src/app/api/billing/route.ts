import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice, UserSettings } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing
 * Returns billing plan info and recent paid invoices from the database.
 * Admins see all invoices; other roles see none (billing is admin-only).
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    await connectDB();

    // Fetch the 10 most recent invoices (any status) sorted newest-first
    const invoices = await Invoice.find({})
      .select('invoiceId client amount date status razorpayPaymentId createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Determine plan from UserSettings (placeholder — swap for a real Subscription model later)
    const userSettings = await UserSettings.findOne({ userId: session.sub }).lean() as any;
    const plan = userSettings?.plan ?? 'Growth';

    // Compute total paid revenue for the month (MRR proxy)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const paidThisMonth = await Invoice.countDocuments({
      status: 'Paid',
      createdAt: { $gte: monthStart },
    });

    // Next renewal: 1st of the next month
    const renewsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return NextResponse.json({
      success: true,
      plan,
      amount: null, // Populate from real Subscription model when available
      renewsAt,
      paidThisMonth,
      invoices: invoices.map((inv: any) => ({
        invoiceId: inv.invoiceId,
        client:    inv.client,
        amount:    inv.amount,
        date:      inv.date,
        status:    inv.status,
      })),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
