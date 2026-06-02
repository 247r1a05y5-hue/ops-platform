/**
 * GET    /api/proposals/[id] — get single proposal
 * PUT    /api/proposals/[id] — update draft proposal content
 * DELETE /api/proposals/[id] — delete proposal (Admin/Manager only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Proposal } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { computeProposalTotals } from '@/lib/proposalService';

type Ctx = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const proposal = await Proposal.findById(id).lean();
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, proposal });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── PUT — update draft fields ─────────────────────────────────────────────────
export async function PUT(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const proposal = await Proposal.findById(id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found.' }, { status: 404 });
    }

    // Allowed mutable fields (cannot mutate secureToken, leadId, createdBy, version)
    const ALLOWED = [
      'title', 'subtitle', 'introduction',
      'services', 'milestones',
      'discount', 'tax', 'currency',
      'notes', 'terms', 'validUntil',
      'signatureName', 'signatureTitle', 'footerText',
      'branding', 'status',
    ] as const;

    for (const field of ALLOWED) {
      if (field in body) {
        (proposal as any)[field] = body[field];
      }
    }

    // Recompute totals when services/pricing changes
    if ('services' in body || 'discount' in body || 'tax' in body) {
      const totals = computeProposalTotals(
        proposal.services as any[],
        proposal.discount,
        proposal.tax
      );
      proposal.subtotal = totals.subtotal;
      proposal.total    = totals.total;
    }

    proposal.updatedAt = new Date();
    await proposal.save();

    return NextResponse.json({ success: true, proposal });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const proposal = await Proposal.findByIdAndDelete(id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
