import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, Lead, Invoice } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

function getPeriodStartDate(period: string): Date {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  // 'custom' / all-time: return a date far in the past
  return new Date(0);
}

function parseAmount(amountStr: string): number {
  if (!amountStr) return 0;
  return parseFloat(String(amountStr).replace(/[^0-9.]/g, '')) || 0;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'today';

    const startDate = getPeriodStartDate(period);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const thisMonthStart = thirtyDaysAgo;
    const prevMonthStart = sixtyDaysAgo;
    const newLeadsQuery = period === 'custom' ? {} : { createdAt: { $gte: startDate } };

    // Fire ALL queries in parallel — no waterfalling
    const [
      openTasksCount,
      newLeadsCount,
      hotLeadsCount,
      currentMRRInvoices,
      previousMRRInvoices,
      totalLeads,
      lostLeads,
      prevTotalLeads,
      prevLostLeads,
    ] = await Promise.all([
      Task.countDocuments({ stage: { $ne: 'Done' } }),
      Lead.countDocuments(newLeadsQuery),
      Lead.countDocuments({ ...newLeadsQuery, status: 'Hot' }),
      Invoice.find({ status: 'Paid', createdAt: { $gte: thirtyDaysAgo } }).select('amount').lean(),
      Invoice.find({ status: 'Paid', createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }).select('amount').lean(),
      Lead.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      Lead.countDocuments({ createdAt: { $gte: thisMonthStart }, stage: 'Closing', status: 'Cold' }),
      Lead.countDocuments({ createdAt: { $gte: prevMonthStart, $lt: thisMonthStart } }),
      Lead.countDocuments({ createdAt: { $gte: prevMonthStart, $lt: thisMonthStart }, stage: 'Closing', status: 'Cold' }),
    ]);

    // MRR calculation
    const mrrSum     = (currentMRRInvoices  as any[]).reduce((acc, inv) => acc + parseAmount(inv.amount), 0);
    const prevMRRSum = (previousMRRInvoices as any[]).reduce((acc, inv) => acc + parseAmount(inv.amount), 0);
    let mrrChange = '+0.0%';
    if (prevMRRSum > 0) {
      const diff = ((mrrSum - prevMRRSum) / prevMRRSum) * 100;
      mrrChange = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    } else if (mrrSum > 0) {
      mrrChange = '+100%';
    }

    const openTasksChange = openTasksCount > 0 ? `+${openTasksCount}` : '0';
    const leadsChange     = hotLeadsCount > 0 ? `+${hotLeadsCount} Hot` : 'Warm';

    // Churn calculation
    const currentChurn = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;
    const prevChurn    = prevTotalLeads > 0 ? (prevLostLeads / prevTotalLeads) * 100 : 0;
    const churnDelta   = currentChurn - prevChurn;
    const finalChurn   = currentChurn.toFixed(1);
    const churnChange  = (churnDelta >= 0 ? '+' : '') + churnDelta.toFixed(1) + '%';

    const responseData = [
      {
        title: 'Total MRR',
        value: `$${mrrSum.toLocaleString()}`,
        change: mrrChange,
        sub: period === 'today' ? 'vs yesterday' : period === 'week' ? 'vs last week' : '30d rolling',
        color: 'text-emerald-600 dark:text-emerald-400'
      },
      {
        title: 'Monthly Churn',
        value: `${finalChurn}%`,
        change: churnChange,
        sub: 'vs prior 30 days',
        color: 'text-blue-600 dark:text-blue-400'
      },
      {
        title: 'Open Tasks',
        value: String(openTasksCount),
        change: openTasksChange,
        sub: period === 'today' ? 'Assigned today' : period === 'week' ? 'Total this week' : 'Historical data',
        color: 'text-orange-600 dark:text-orange-400'
      },
      {
        title: 'New Leads',
        value: String(newLeadsCount),
        change: leadsChange,
        sub: period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'Total in range',
        color: 'text-emerald-600 dark:text-emerald-400'
      }
    ];

    return NextResponse.json({ success: true, stats: responseData }, {
      headers: {
        // Cache KPIs for 30s — they don't change second by second
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dashboard/stats] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
