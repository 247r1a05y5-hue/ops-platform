import { withLogging } from '@/lib/logger';
/**
 * GET /api/proposals/[id]/track?token=
 *
 * Public endpoint — no auth required.
 * Called when a client opens the shareable proposal link.
 * - Validates secureToken
 * - Increments viewCount, sets viewedAt on first view
 * - Updates Lead.proposalStatus to 'viewed'
 * - Creates in-app Notification for the assigned owner
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Proposal, Lead, Notification, User } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

async function _GET(req: NextRequest, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const token = new URL(req.url).searchParams.get('token');

    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing token.' }, { status: 400 });
    }

    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.secureToken !== token) {
      return NextResponse.json({ success: false, error: 'Invalid or expired proposal link.' }, { status: 404 });
    }

    // Track view
    proposal.viewCount = (proposal.viewCount || 0) + 1;
    if (!proposal.viewedAt) {
      proposal.viewedAt = new Date();
    }

    // Advance status from 'sent' → 'viewed' (don't regress from approved/rejected)
    if (proposal.status === 'sent') {
      proposal.status = 'viewed';
    }
    proposal.updatedAt = new Date();
    await proposal.save();

    // Update lead proposal status to 'viewed'
    const lead = await Lead.findById(proposal.leadId);
    if (lead && lead.proposalStatus === 'sent') {
      lead.proposalStatus = 'viewed';
      lead.history.push({
        event: `Proposal viewed by client (view #${proposal.viewCount})`,
        user:  'System',
        time:  new Date(),
      });
      await lead.save();
    }

    // Notify the assigned owner / admin
    try {
      const notifTarget = lead?.assignedTo
        ? await User.findById(lead.assignedTo)
        : await User.findOne({ role: 'Admin' });

      if (notifTarget) {
        await Notification.create({
          userId:  notifTarget._id,
          title:   '📄 Proposal Viewed',
          message: `${lead?.name || 'Client'} (${lead?.company || ''}) opened your proposal — view #${proposal.viewCount}`,
          read:    false,
        });
      }
    } catch (notifErr) {
      console.error('[proposals/track] Notification failed:', notifErr);
    }

    // Return proposal data for the public-facing view page
    return NextResponse.json({
      success:    true,
      tracked:    true,
      viewCount:  proposal.viewCount,
      proposal: {
        _id:          proposal._id,
        title:        proposal.title,
        subtitle:     proposal.subtitle,
        introduction: proposal.introduction,
        services:     proposal.services,
        milestones:   proposal.milestones,
        subtotal:     proposal.subtotal,
        discount:     proposal.discount,
        tax:          proposal.tax,
        total:        proposal.total,
        currency:     proposal.currency,
        notes:        proposal.notes,
        terms:        proposal.terms,
        validUntil:   proposal.validUntil,
        signatureName:  proposal.signatureName,
        signatureTitle: proposal.signatureTitle,
        branding:       proposal.branding,
        status:         proposal.status,
        pdfUrl:         proposal.pdfUrl,
        version:        proposal.version,
      },
      lead: lead ? {
        name:    lead.name,
        company: lead.company,
        email:   lead.email,
      } : null,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[proposals/track]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
