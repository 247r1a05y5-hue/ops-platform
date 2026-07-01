import { withLogging } from '@/lib/logger';
/**
 * /api/leads/workflow-log — Immutable stage workflow audit trail
 *
 * GET ?leadId=xxx              → full workflow history for a specific lead
 * GET ?stage=Proposal&from=&to= → cross-lead analytics for a stage
 * GET ?analytics=funnel        → stage-level funnel conversion data
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB, StageWorkflowLog, Lead } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    const stage = searchParams.get('stage');
    const analyticsMode = searchParams.get('analytics');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');

    // ── Lead-specific audit trail ───────────────────────────────────────
    if (leadId) {
      const logs = await StageWorkflowLog.find({ leadId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return NextResponse.json({ success: true, logs, total: logs.length });
    }

    // ── Cross-lead stage analytics ──────────────────────────────────────
    if (stage) {
      const filter: any = { toStage: stage };
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }

      const logs = await StageWorkflowLog.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return NextResponse.json({ success: true, logs, stage, total: logs.length });
    }

    // ── Funnel analytics mode ───────────────────────────────────────────
    if (analyticsMode === 'funnel') {
      const stages = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];

      // Count leads currently in each stage
      const stageCounts = await Promise.all(
        stages.map(async (s) => {
          const count = await Lead.countDocuments({ stage: s });
          return { stage: s, count };
        })
      );

      // Count conversions: transitions TO each stage
      const transitionCounts = await Promise.all(
        stages.map(async (s) => {
          const count = await StageWorkflowLog.countDocuments({ toStage: s });
          return { stage: s, transitionCount: count };
        })
      );

      // Compute conversion rates: stage[n] → stage[n+1]
      const funnelData = stages.map((s, i) => {
        const current = stageCounts[i].count;
        const previous = i > 0 ? stageCounts[i - 1].count : stageCounts[0].count;
        const transIn = transitionCounts[i].transitionCount;
        const conversionRate = previous > 0 ? Math.round((current / previous) * 100) : 0;

        return {
          stage: s,
          count: current,
          transitionsIn: transIn,
          conversionRate,   // % of leads from previous stage that reached this stage
          dropOff: 100 - conversionRate,
        };
      });

      // Avg time in stage (from stageEnteredAt fields in Lead)
      const allLeads = await Lead.find({}, { stage: 1, stageEnteredAt: 1, closedAt: 1, createdAt: 1 }).lean();

      const avgTimeInStage: Record<string, number> = {};
      stages.forEach((s) => {
        const stageLeads = allLeads.filter((l: any) => l.stageEnteredAt?.[s]);
        if (stageLeads.length === 0) { avgTimeInStage[s] = 0; return; }

        const totalDays = stageLeads.reduce((sum: number, l: any) => {
          const entered = new Date(l.stageEnteredAt[s]).getTime();
          const now = Date.now();
          return sum + Math.floor((now - entered) / (1000 * 60 * 60 * 24));
        }, 0);

        avgTimeInStage[s] = Math.round(totalDays / stageLeads.length);
      });

      // Top lead sources
      const sourceCounts: Record<string, number> = {};
      allLeads.forEach((l: any) => {
        const src = (l as any).leadSource || 'Unknown';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      });

      const topSources = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([source, count]) => ({ source, count }));

      // Overall conversion: Discovery to Closing
      const totalLeads = allLeads.length || 1;
      const closedLeads = stageCounts.find((s) => s.stage === 'Closing')?.count || 0;
      const overallConversion = Math.round((closedLeads / totalLeads) * 100);

      // Proposal acceptance rate
      const proposalLeads = await Lead.countDocuments({ proposalStatus: { $in: ['sent', 'viewed', 'accepted'] } });
      const acceptedProposals = await Lead.countDocuments({ proposalStatus: 'accepted' });
      const proposalAcceptanceRate = proposalLeads > 0 ? Math.round((acceptedProposals / proposalLeads) * 100) : 0;

      // Payment conversion
      const closingCount = stageCounts.find((s) => s.stage === 'Closing')?.count || 1;
      const paidLeads = await Lead.countDocuments({ stage: 'Closing', paymentStatus: 'paid' });
      const paymentConversionRate = closingCount > 0 ? Math.round((paidLeads / closingCount) * 100) : 0;

      return NextResponse.json({
        success: true,
        funnelData,
        avgTimeInStage,
        topSources,
        overallConversion,
        proposalAcceptanceRate,
        paymentConversionRate,
        totalLeads: allLeads.length,
        closedLeads,
      });
    }

    // ── Recent workflow logs (global feed) ──────────────────────────────
    const logs = await StageWorkflowLog.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, logs, total: logs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
