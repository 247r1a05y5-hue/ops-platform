/**
 * POST /api/proposals/[id]/respond
 *
 * Public endpoint — client approval/rejection via secureToken.
 * Body: { token: string, action: 'approve' | 'reject', reason?: string }
 *
 * - Validates token
 * - Updates proposal.status to 'approved' | 'rejected'
 * - Updates Lead.proposalStatus
 * - Creates ActivityLog + Notification
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Proposal, Lead, ActivityLog, Notification, User } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const { token, action, reason } = body as {
      token: string;
      action: 'approve' | 'reject';
      reason?: string;
    };

    // ── Validate input ────────────────────────────────────────────────────────
    if (!token || !action) {
      return NextResponse.json(
        { success: false, error: 'token and action are required.' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "approve" or "reject".' },
        { status: 400 }
      );
    }

    // ── Find + validate proposal ──────────────────────────────────────────────
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.secureToken !== token) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired proposal link.' },
        { status: 404 }
      );
    }

    // Prevent responding to already-closed proposals
    if (['approved', 'rejected'].includes(proposal.status)) {
      return NextResponse.json(
        { success: false, error: `Proposal is already ${proposal.status}. No further action needed.` },
        { status: 409 }
      );
    }

    // ── Update proposal ───────────────────────────────────────────────────────
    const now = new Date();
    if (action === 'approve') {
      proposal.status     = 'approved';
      proposal.approvedAt = now;
    } else {
      proposal.status          = 'rejected';
      proposal.rejectedAt      = now;
      proposal.rejectionReason = reason?.slice(0, 500) || 'No reason provided.';
    }
    proposal.updatedAt = now;
    await proposal.save();

    // ── Update lead proposal status ───────────────────────────────────────────
    const lead = await Lead.findById(proposal.leadId);
    if (lead) {
      lead.proposalStatus = action === 'approve' ? 'accepted' : 'rejected';
      lead.history.push({
        event: action === 'approve'
          ? `Proposal approved by client`
          : `Proposal rejected by client${reason ? `: "${reason}"` : ''}`,
        user: 'Client',
        time: now,
      });
      await lead.save();
    }

    // ── ActivityLog ───────────────────────────────────────────────────────────
    try {
      const adminUser = await User.findOne({ role: 'Admin' });
      if (adminUser) {
        await ActivityLog.create({
          userId:      adminUser._id,
          name:        lead?.name || 'Client',
          userEmail:   lead?.email || '',
          userRole:    'Client',
          actionType:  `proposal_${action}d`,
          module:      'CRM',
          description: `Proposal for "${lead?.name || proposal.leadId}" was ${action}d by client.${reason ? ` Reason: ${reason}` : ''}`,
          metadata: {
            proposalId: id,
            leadId:     String(proposal.leadId),
            action,
            reason:     reason || null,
            total:      proposal.total,
          },
        });
      }
    } catch (logErr) {
      console.error('[proposals/respond] ActivityLog failed:', logErr);
    }

    // ── In-app Notification ───────────────────────────────────────────────────
    try {
      const notifTarget = lead?.assignedTo
        ? await User.findById(lead.assignedTo)
        : await User.findOne({ role: 'Admin' });

      if (notifTarget) {
        await Notification.create({
          userId:  notifTarget._id,
          title:   action === 'approve' ? '✅ Proposal Approved!' : '❌ Proposal Rejected',
          message: action === 'approve'
            ? `${lead?.name || 'Client'} approved the proposal for ${lead?.company || ''}. Total: ${proposal.currency} ${proposal.total.toLocaleString()}`
            : `${lead?.name || 'Client'} rejected the proposal${reason ? `. Reason: "${reason}"` : ''}.`,
          read: false,
        });
      }
    } catch (notifErr) {
      console.error('[proposals/respond] Notification failed:', notifErr);
    }

    return NextResponse.json({
      success: true,
      action,
      status:  proposal.status,
      message: action === 'approve'
        ? 'Proposal accepted. Our team will reach out shortly.'
        : 'Proposal declined. Thank you for your feedback.',
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[proposals/respond]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
