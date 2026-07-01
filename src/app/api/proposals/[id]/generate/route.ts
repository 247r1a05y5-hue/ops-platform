import { withLogging } from '@/lib/logger';
/**
 * POST /api/proposals/[id]/generate
 *
 * Generates a rich enterprise PDF for the proposal, uploads to Cloudinary,
 * bumps version number, marks status as 'sent', logs ActivityLog, fires Notification.
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Proposal, Lead, ActivityLog, Notification, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import {
  generateProposalPDF,
  uploadProposalToCloudinary,
  computeProposalTotals,
  type ProposalData,
  type LeadContext,
} from '@/lib/proposalService';

type Ctx = { params: Promise<{ id: string }> };

async function _POST(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;

    const proposal = await Proposal.findById(id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found.' }, { status: 404 });
    }

    const lead = await Lead.findById(proposal.leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Associated lead not found.' }, { status: 404 });
    }

    // ── Recompute totals before PDF generation ────────────────────────────────
    const totals = computeProposalTotals(
      proposal.services as any[],
      proposal.discount,
      proposal.tax
    );
    proposal.subtotal = totals.subtotal;
    proposal.total    = totals.total;

    // ── Build typed data objects ───────────────────────────────────────────────
    const proposalData: ProposalData = {
      _id:          String(proposal._id),
      version:      proposal.version,
      title:        proposal.title,
      subtitle:     proposal.subtitle,
      introduction: proposal.introduction,
      services:     proposal.services as any[],
      milestones:   proposal.milestones as any[],
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
      footerText:     proposal.footerText,
      branding:       proposal.branding as any,
    };

    const leadContext: LeadContext = {
      _id:     String(lead._id),
      name:    lead.name,
      company: lead.company,
      email:   lead.email,
      phone:   lead.phone,
    };

    // ── Generate PDF ──────────────────────────────────────────────────────────
    let pdfUrl = '';
    let pdfPublicId = '';

    try {
      const pdfBase64 = generateProposalPDF(proposalData, leadContext);
      const uploaded  = await uploadProposalToCloudinary(pdfBase64, id, proposal.version);
      pdfUrl       = uploaded.secureUrl;
      pdfPublicId  = uploaded.publicId;
    } catch (pdfErr) {
      console.error('[proposals/generate] PDF generation/upload failed:', pdfErr);
      return NextResponse.json(
        { success: false, error: 'PDF generation failed. Check Cloudinary configuration.' },
        { status: 500 }
      );
    }

    // ── Bump version + update status ──────────────────────────────────────────
    proposal.pdfUrl      = pdfUrl;
    proposal.pdfPublicId = pdfPublicId;
    proposal.generatedAt = new Date();
    proposal.status      = 'sent';
    proposal.sentAt      = new Date();
    proposal.version     += 1; // next generation will be v2, v3, etc.
    proposal.updatedAt   = new Date();

    // Attach PDF to lead documents (replaces or appends)
    const docName = `Proposal-v${proposal.version - 1}-${lead.name.replace(/\s+/g, '_')}.pdf`;
    const existingDocIdx = lead.documents.findIndex((d: any) =>
      d.name.startsWith('Proposal-') && d.name.includes(lead.name.replace(/\s+/g, '_'))
    );
    const docEntry = {
      name:         docName,
      size:         '~50 KB',
      url:          pdfUrl,
      publicId:     pdfPublicId,
      resourceType: 'raw',
      uploadedAt:   new Date(),
    };
    if (existingDocIdx >= 0) {
      lead.documents[existingDocIdx] = docEntry;
    } else {
      lead.documents.push(docEntry);
    }

    // Update lead proposal status
    lead.proposalStatus  = 'sent';
    lead.proposalSentAt  = new Date();
    lead.history.push({
      event: `Proposal v${proposal.version - 1} generated & sent — PDF uploaded`,
      user:  session.name,
      time:  new Date(),
    });

    await proposal.save();
    await lead.save();

    // ── ActivityLog ───────────────────────────────────────────────────────────
    await ActivityLog.create({
      userId:      session.sub,
      name:        session.name,
      userEmail:   session.email,
      userRole:    session.role,
      actionType:  'proposal_generated',
      module:      'CRM',
      description: `Proposal v${proposal.version - 1} generated for "${lead.name}" — PDF: ${pdfUrl}`,
      metadata: {
        proposalId:  id,
        leadId:      String(lead._id),
        leadName:    lead.name,
        version:     proposal.version - 1,
        total:       proposal.total,
        currency:    proposal.currency,
        pdfUrl,
      },
    }).catch(console.error);

    // ── In-app Notification ───────────────────────────────────────────────────
    const adminUser = await User.findOne({ role: 'Admin' });
    if (adminUser) {
      await Notification.create({
        userId:  adminUser._id,
        title:   'Proposal Generated',
        message: `${session.name} generated Proposal v${proposal.version - 1} for ${lead.name} (${lead.company}) — Total: ${proposal.currency} ${proposal.total.toLocaleString()}`,
        read:    false,
      }).catch(console.error);
    }

    return NextResponse.json({
      success:     true,
      pdfUrl,
      proposalId:  id,
      version:     proposal.version - 1,
      status:      'sent',
      message:     `Proposal v${proposal.version - 1} generated and uploaded successfully.`,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[proposals/generate] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
