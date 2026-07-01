import { withLogging } from '@/lib/logger';
/**
 * GET  /api/proposals?leadId= — list all proposals for a lead
 * POST /api/proposals          — create a new draft proposal
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Proposal, Lead } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { generateSecureToken, computeProposalTotals } from '@/lib/proposalService';

// ── GET — list proposals for a lead ──────────────────────────────────────────
async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const leadId = new URL(req.url).searchParams.get('leadId');
  if (!leadId) {
    return NextResponse.json({ success: false, error: 'leadId is required.' }, { status: 400 });
  }

  try {
    await connectDB();
    const proposals = await Proposal.find({ leadId })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ success: true, proposals });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── POST — create a draft proposal ───────────────────────────────────────────
async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required.' }, { status: 400 });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    const cleanAmount = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, '')) || 0;

    const defaultServices = cleanAmount > 0
      ? [{
          name:        'Enterprise Suite',
          description: 'Full suite implementation and onboarding',
          price:       cleanAmount,
          quantity:    1,
          unit:        'project',
        }]
      : [];

    const totals = computeProposalTotals(defaultServices, body.discount ?? 0, body.tax ?? 0);

    const proposal = await Proposal.create({
      leadId,
      version: 1,
      status: 'draft',
      title: body.title || `Proposal for ${lead.company}`,
      subtitle: body.subtitle || '',
      introduction: body.introduction || `Dear ${lead.name},\n\nWe are pleased to present this proposal for ${lead.company}. Please review the following scope, pricing, and terms.`,
      services: body.services ?? defaultServices,
      milestones: body.milestones ?? [],
      subtotal: totals.subtotal,
      discount: body.discount ?? 0,
      tax: body.tax ?? 0,
      total: totals.total,
      currency: body.currency ?? 'INR',
      notes: body.notes ?? '',
      terms: body.terms ?? 'Payment is due within 7 days of invoice receipt. All work is subject to the agreed scope of work. Any changes to scope must be agreed in writing.',
      validUntil: body.validUntil,
      signatureName: body.signatureName ?? session.name,
      signatureTitle: body.signatureTitle ?? 'Account Manager',
      footerText: body.footerText ?? '',
      branding: body.branding ?? {
        primaryColor: '#4f46e5',
        companyName: 'Antigravity OPS',
        tagline: 'Enterprise Operations Platform',
      },
      secureToken: generateSecureToken(),
      createdBy: session.name,
    });

    return NextResponse.json({ success: true, proposal }, { status: 201 });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
