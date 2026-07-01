import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, Lead, Invoice, User, StageWorkflowLog } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

type Period = 'week' | 'month' | 'quarter';

function dateRange(period: Period) {
  const now  = new Date();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const from     = new Date(now.getTime() - days * 864e5);
  const prevTo   = new Date(from.getTime());
  const prevFrom = new Date(from.getTime() - days * 864e5);
  return { from, prevFrom, prevTo };
}

function pct(num: number, den: number) { return den === 0 ? 0 : Math.round((num / den) * 100); }
function change(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? '+100%' : '0%';
  const diff = Math.round(((curr - prev) / prev) * 100);
  return (diff >= 0 ? '+' : '') + diff + '%';
}

/** Parse any currency string (₹1,000 / $5,000.00 / 1500) → number */
function parseAmount(raw: string | number | undefined | null): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const cleaned = String(raw).replace(/[₹$€£¥,\s]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'Staff', 'User', 'MR']);
  if (error) return error;

  const period = (new URL(req.url).searchParams.get('period') ?? 'month') as Period;
  if (!['week', 'month', 'quarter'].includes(period)) {
    return NextResponse.json({ success: false, error: 'Invalid period.' }, { status: 400 });
  }

  try {
    await connectDB();
    const { from, prevFrom, prevTo } = dateRange(period);

    // ── Run all DB queries in parallel ───────────────────────────────────────
    const [
      taskCountsCurr, taskCountsPrev,
      leadCountsCurr, leadCountsPrev,
      taskStages, leadStages,
      invoicesCurr, invoicesPrev, invoicesAll,
      userList,
      workflowLogs,
    ] = await Promise.all([
      // Tasks current period
      Task.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      // Tasks previous period
      Task.aggregate([
        { $match: { createdAt: { $gte: prevFrom, $lt: prevTo } } },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      // Leads current period
      Lead.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      // Leads previous period
      Lead.aggregate([
        { $match: { createdAt: { $gte: prevFrom, $lt: prevTo } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),
      // All tasks by stage
      Task.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      // All leads by stage
      Lead.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      // Invoices — fetch raw docs, parse amount in JS (avoids $replaceAll/$convert issues)
      Invoice.find({ createdAt: { $gte: from } }).select('status amount').lean(),
      Invoice.find({ createdAt: { $gte: prevFrom, $lt: prevTo } }).select('status amount').lean(),
      Invoice.find({}).select('status amount').lean(),
      // Users
      User.find({}).select('name role').lean(),
      // Workflow logs
      StageWorkflowLog.aggregate([
        { $match: { timestamp: { $gte: from } } },
        { $group: { _id: '$toStage', avgDuration: { $avg: '$durationInStageMs' }, count: { $sum: 1 } } },
      ]),
    ]);

    // ── Helper: sum counts from aggregation results ───────────────────────
    const sumAgg = (agg: any[], field = 'count') => agg.reduce((s: number, g: any) => s + (g[field] || 0), 0);
    const byStage = (agg: any[]) => Object.fromEntries(agg.map((g: any) => [g._id, g.count]));

    // ── Task metrics ──────────────────────────────────────────────────────
    const tasksCurrTotal = sumAgg(taskCountsCurr);
    const tasksPrevTotal = sumAgg(taskCountsPrev);
    const taskStageMap   = byStage(taskStages);
    const tasksDone      = taskStageMap['Done'] || 0;
    const tasksTotal     = sumAgg(taskStages);
    const completionRate = pct(tasksDone, tasksTotal);

    // ── Lead metrics ──────────────────────────────────────────────────────
    const leadsCurrTotal = sumAgg(leadCountsCurr);
    const leadsPrevTotal = leadCountsPrev[0]?.count || 0;
    const leadStageMap   = byStage(leadStages);
    const leadsTotal     = sumAgg(leadStages);
    const leadsClosing   = leadStageMap['Closing'] || 0;
    const conversionRate = pct(leadsClosing, leadsTotal);

    // ── Invoice / Revenue metrics (JS-side parsing) ───────────────────────
    type InvMap = Record<string, { total: number; count: number }>;

    const buildInvoiceMap = (docs: any[]): InvMap => {
      const map: InvMap = {};
      for (const inv of docs) {
        const s = inv.status || 'Unknown';
        if (!map[s]) map[s] = { total: 0, count: 0 };
        map[s].total += parseAmount(inv.amount);
        map[s].count += 1;
      }
      return map;
    };

    const invoiceCurrMap  = buildInvoiceMap(invoicesCurr);
    const invoiceAllMap   = buildInvoiceMap(invoicesAll);
    const revenueCurr = Object.values(invoiceCurrMap).reduce((s, v) => s + v.total, 0);
    const revenuePrev = invoicesPrev.reduce((s: number, inv: any) => s + parseAmount(inv.amount), 0);

    // ── CRM Funnel ────────────────────────────────────────────────────────
    const crmStages   = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];
    const stageColors = ['bg-blue-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500'];
    const stageCounts = crmStages.map(s => ({ stage: s, count: leadStageMap[s] || 0 }));

    const funnelData = crmStages.map((s, i) => {
      const current  = stageCounts[i].count;
      const previous = i > 0 ? stageCounts[i - 1].count : (leadsTotal || 1);
      const conv = previous > 0 ? Math.round((current / previous) * 100) : 0;
      return { stage: s, count: current, conversionRate: conv, dropOff: Math.max(0, 100 - conv), color: stageColors[i] };
    });

    // ── Team utilisation ──────────────────────────────────────────────────
    const teamSize        = (userList as any[]).length;
    const teamUtilisation = Math.min(100, pct(tasksCurrTotal, teamSize * 5));

    // ── Avg time-in-stage ─────────────────────────────────────────────────
    const avgTimeInStage = (workflowLogs as any[]).map((g: any) => ({
      stage:   g._id,
      avgDays: g.avgDuration ? Math.round(g.avgDuration / 864e5) : 0,
      count:   g.count,
    }));

    return NextResponse.json({
      success: true,
      period,
      tasks: {
        current: tasksCurrTotal,
        previous: tasksPrevTotal,
        change: change(tasksCurrTotal, tasksPrevTotal),
        completionRate,
        byStage: taskStageMap,
        total: tasksTotal,
      },
      leads: {
        current: leadsCurrTotal,
        previous: leadsPrevTotal,
        change: change(leadsCurrTotal, leadsPrevTotal),
        conversionRate,
        byStage: leadStageMap,
        total: leadsTotal,
        funnel: funnelData,
      },
      revenue: {
        current: revenueCurr,
        previous: revenuePrev,
        change: change(Math.round(revenueCurr), Math.round(revenuePrev)),
        byStatus: invoiceCurrMap,
        allTimeByStatus: invoiceAllMap,
      },
      team: {
        size: teamSize,
        utilisation: teamUtilisation,
        members: (userList as any[]).map((u: any) => ({ name: u.name, role: u.role })),
      },
      avgTimeInStage,
      paymentCollectionRate: pct(
        invoiceAllMap['Paid']?.count || 0,
        (invoiceAllMap['Paid']?.count || 0) + (invoiceAllMap['Pending']?.count || 0) + (invoiceAllMap['Overdue']?.count || 0)
      ),
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    });
  } catch (err) {
    console.error('[Analytics]', err);
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
