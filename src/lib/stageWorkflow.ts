/**
 * stageWorkflow.ts — Core CRM Stage Workflow Engine
 *
 * Every CRM stage transition flows through here.
 * Handles: transition validation, per-stage automation,
 * ActivityLog creation, and StageWorkflowLog audit trail.
 */

import { connectDB, Lead, ActivityLog, StageWorkflowLog, User, Invoice, Proposal, ApprovalRequest } from './db';
import { createNotification } from './notifications';
import { isValidEmail, sendEmail } from './email';
import { jsPDF } from 'jspdf';
import { uploadToCloudinary } from './cloudinary';
import Razorpay from 'razorpay';

export type CRMStage = 'Discovery' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Closing';
export type UserRole = 'Admin' | 'Manager' | 'Staff' | 'User';

export interface WorkflowSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

// ─── Stage Transition Map ──────────────────────────────────────────────────────
// null = terminal stage. Users can only move forward 1 step; Managers/Admins can skip.
const VALID_FORWARD: Record<CRMStage, CRMStage[]> = {
  Discovery:   ['Contacted'],
  Contacted:   ['Qualified', 'Discovery'],   // can move back to Discovery
  Qualified:   ['Proposal', 'Contacted'],
  Proposal:    ['Negotiation', 'Qualified'],
  Negotiation: ['Closing', 'Proposal'],
  Closing:     [],
};

const STAGE_ORDER: CRMStage[] = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];

/**
 * Validate whether fromStage → toStage is allowed for the given role.
 * Managers & Admins may skip stages (with a force flag).
 */
export function validateTransition(
  fromStage: CRMStage,
  toStage: CRMStage,
  role: UserRole,
  force = false
): { allowed: boolean; reason?: string; skipped: boolean } {
  if (fromStage === toStage) {
    return { allowed: false, reason: 'Lead is already in this stage.', skipped: false };
  }

  const allowed = VALID_FORWARD[fromStage];
  const isDirectMove = allowed.includes(toStage);
  const isSkipping = !isDirectMove;

  if (isDirectMove) {
    return { allowed: true, skipped: false };
  }

  // Skipping stages
  if (isSkipping) {
    if (role === 'Admin' || role === 'Manager') {
      if (force) return { allowed: true, skipped: true };
      return {
        allowed: false,
        reason: `Skipping stages requires force=true for ${role} role. Moving ${fromStage} → ${toStage} skips intermediate stages.`,
        skipped: true,
      };
    }
    const fromIdx = STAGE_ORDER.indexOf(fromStage);
    const toIdx = STAGE_ORDER.indexOf(toStage);
    if (toIdx < fromIdx) {
      // Moving backwards as a regular user — only 1 step back allowed
      return { allowed: false, reason: `Users cannot move leads backwards in the pipeline.`, skipped: false };
    }
    return {
      allowed: false,
      reason: `You cannot skip pipeline stages. Please move to ${allowed[0]} first.`,
      skipped: true,
    };
  }

  return { allowed: true, skipped: false };
}

// ─── Lead Scoring ─────────────────────────────────────────────────────────────
function computeLeadScore(lead: any): number {
  let score = 0;

  // Deal value (40 pts): parse numeric value
  const raw = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, ''));
  if (raw >= 50000) score += 40;
  else if (raw >= 20000) score += 30;
  else if (raw >= 5000) score += 20;
  else if (raw > 0) score += 10;

  // Status (30 pts)
  if (lead.status === 'Hot') score += 30;
  else if (lead.status === 'Warm') score += 20;
  else score += 5;

  // Engagement: emails (15 pts)
  const emailCount = (lead.emails || []).length;
  if (emailCount >= 5) score += 15;
  else if (emailCount >= 2) score += 10;
  else if (emailCount >= 1) score += 5;

  // Notes count (15 pts)
  const noteCount = (lead.notes || []).length;
  if (noteCount >= 5) score += 15;
  else if (noteCount >= 2) score += 10;
  else if (noteCount >= 1) score += 5;

  return Math.min(100, score);
}

// ─── Stage Workflow Actions ───────────────────────────────────────────────────

async function handleDiscovery(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  // Record stage entry time
  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Discovery: new Date() };
  if (!lead.leadSource) lead.leadSource = 'Manual Entry';
  actions.push('lead_source_logged');

  // Optional welcome email
  if (lead.email && isValidEmail(lead.email) && !lead.welcomeEmailSent) {
    try {
      await sendEmail({
        event: 'welcome',
        to: lead.email,
        vars: { name: lead.name, role: 'Lead Partner / Client' }
      });
      lead.welcomeEmailSent = true;
      actions.push('welcome_email_sent');
    } catch (emailErr) {
      console.error('[handleDiscovery] Welcome email failed:', emailErr);
      actions.push('welcome_email_failed');
    }
  }

  // Create activity entry
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_stage_enter',
    module: 'CRM',
    description: `Lead "${lead.name}" entered Discovery stage`,
    metadata: { leadId: lead._id, stage: 'Discovery', source: lead.leadSource },
  });
  actions.push('activity_entry_created');

  return actions;
}

async function handleContacted(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  // Track last contact timestamp
  lead.lastContactedAt = new Date();
  lead.lastContact = 'Just now';
  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Contacted: new Date() };
  actions.push('last_contacted_at_tracked');

  // Save outreach history entry in lead history
  lead.history.push({
    event: `Outreach initiated — stage moved to Contacted`,
    user: session.name,
    time: new Date(),
  });
  actions.push('outreach_history_saved');

  // Create activity log
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_outreach',
    module: 'CRM',
    description: `Lead "${lead.name}" contacted — first outreach logged`,
    metadata: { leadId: lead._id, stage: 'Contacted', lastContactedAt: lead.lastContactedAt },
  });
  actions.push('activity_entry_created');

  // Auto-create a follow-up reminder (3 days from now)
  const reminderDue = new Date();
  reminderDue.setDate(reminderDue.getDate() + 3);
  if (!lead.followUpReminders) lead.followUpReminders = [];
  lead.followUpReminders.push({
    dueAt: reminderDue,
    note: `Follow up with ${lead.name} at ${lead.company}`,
    completed: false,
    createdAt: new Date(),
  });
  actions.push('follow_up_reminder_created');

  return actions;
}

async function handleQualified(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  // Compute and save lead score
  const score = computeLeadScore(lead);
  lead.leadScore = score;
  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Qualified: new Date() };
  actions.push(`lead_scored_${score}`);

  // Auto-assign to owner if still unassigned
  if (!lead.assignedTo && session.userId) {
    lead.assignedTo = session.userId;
    lead.assignedToName = session.name;
    actions.push('owner_assigned');
  }

  // Activity log
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_qualified',
    module: 'CRM',
    description: `Lead "${lead.name}" qualified — score: ${score}/100`,
    metadata: { leadId: lead._id, stage: 'Qualified', leadScore: score, assignedTo: lead.assignedToName },
  });
  actions.push('activity_entry_created');

  return actions;
}

async function handleProposal(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Proposal: new Date() };

  // ── 1. Create normalized Proposal document ───────────────────────────────────
  const cleanAmount = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, '')) || 0;
  const defaultServices = cleanAmount > 0 ? [{
    name: 'Enterprise Suite Implementation',
    description: 'Full platform setup, configuration, and onboarding',
    price: cleanAmount,
    quantity: 1,
    unit: 'project',
  }] : [];

  let proposalDoc: any = null;
  let docUrl = '';
  let pdfPublicId = '';

  try {
    const { generateSecureToken, computeProposalTotals, generateProposalPDF, uploadProposalToCloudinary } = await import('./proposalService');
    const totals = computeProposalTotals(defaultServices, 0, 0);

    proposalDoc = await Proposal.create({
      leadId:       lead._id,
      version:      1,
      status:       'draft',
      title:        `Proposal for ${lead.company}`,
      introduction: `Dear ${lead.name},\n\nWe are pleased to present this enterprise proposal for ${lead.company}. Please review the following scope, pricing, and terms.`,
      services:     defaultServices,
      milestones:   [],
      subtotal:     totals.subtotal,
      discount:     0,
      tax:          0,
      total:        totals.total,
      currency:     'INR',
      notes:        '',
      terms:        'Payment is due within 7 days of invoice receipt. All work is subject to the agreed scope of work.',
      signatureName:  session.name,
      signatureTitle: session.role,
      branding: {
        primaryColor: '#4f46e5',
        companyName:  'Antigravity OPS',
        tagline:      'Enterprise Operations Platform',
      },
      secureToken: generateSecureToken(),
      createdBy:   session.name,
    });
    actions.push('proposal_record_created');

    // ── 2. Auto-generate PDF ──────────────────────────────────────────────────
    try {
      const pdfBase64 = generateProposalPDF({
        _id:          String(proposalDoc._id),
        version:      1,
        title:        proposalDoc.title,
        subtitle:     proposalDoc.subtitle || '',
        introduction: proposalDoc.introduction,
        services:     defaultServices,
        milestones:   [],
        subtotal:     totals.subtotal,
        discount:     0,
        tax:          0,
        total:        totals.total,
        currency:     'INR',
        notes:        '',
        terms:        proposalDoc.terms,
        signatureName:  session.name,
        signatureTitle: session.role,
        footerText:     '',
        branding:       proposalDoc.branding as any,
      }, {
        _id:     String(lead._id),
        name:    lead.name,
        company: lead.company,
        email:   lead.email,
        phone:   lead.phone,
      });

      const uploaded = await uploadProposalToCloudinary(pdfBase64, String(proposalDoc._id), 1);
      docUrl       = uploaded.secureUrl;
      pdfPublicId  = uploaded.publicId;

      // Update proposal with PDF
      proposalDoc.pdfUrl      = docUrl;
      proposalDoc.pdfPublicId = pdfPublicId;
      proposalDoc.generatedAt = new Date();
      proposalDoc.status      = 'sent';
      proposalDoc.sentAt      = new Date();
      await proposalDoc.save();

      actions.push('proposal_pdf_generated');
    } catch (pdfErr) {
      console.error('[handleProposal] PDF generation failed:', pdfErr);
      docUrl = '';
      actions.push('proposal_pdf_generation_failed');
    }

  } catch (proposalErr) {
    console.error('[handleProposal] Proposal creation failed:', proposalErr);
    actions.push('proposal_record_creation_failed');
  }

  // ── 3. Attach PDF doc to lead documents ──────────────────────────────────────
  if (docUrl) {
    lead.documents.push({
      name:         `Proposal-${lead.name.replace(/\s+/g, '_')}.pdf`,
      size:         '~50 KB',
      url:          docUrl,
      publicId:     pdfPublicId,
      resourceType: 'raw',
      uploadedAt:   new Date(),
    });
    actions.push('proposal_docs_attached');
  }

  // ── 4. Generate Razorpay payment link ────────────────────────────────────────
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const razorpayAmount = cleanAmount || 5000;

  if (keyId && keySecret) {
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const amountInPaise = Math.round(razorpayAmount * 100);
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `lead_${lead._id}`,
        notes: { leadName: lead.name, leadEmail: lead.email, company: lead.company },
      } as any);
      lead.paymentLink     = `https://rzp.io/l/${order.id}`;
      lead.razorpayOrderId = order.id;
      lead.paymentStatus   = 'pending';
      actions.push('razorpay_payment_link_generated');
    } catch (rzpErr) {
      console.error('[handleProposal] Razorpay creation failed:', rzpErr);
      lead.paymentLink     = '';
      lead.razorpayOrderId = '';
      lead.paymentStatus   = 'not_initiated';
      actions.push('razorpay_payment_link_failed');
    }
  } else {
    lead.paymentLink     = '';
    lead.razorpayOrderId = '';
    lead.paymentStatus   = 'not_initiated';
    actions.push('razorpay_not_configured');
  }

  lead.proposalStatus = 'sent';
  lead.proposalSentAt = new Date();
  actions.push('proposal_status_tracked');

  // ── 5. ActivityLog ─────────────────────────────────────────────────────────
  await ActivityLog.create({
    userId:      session.userId,
    name:        session.name,
    userEmail:   session.email,
    userRole:    session.role,
    actionType:  'crm_proposal',
    module:      'CRM',
    description: `Lead "${lead.name}" moved to Proposal — Proposal record created${docUrl ? ' & PDF generated' : ''}.`,
    metadata: {
      leadId:      lead._id,
      stage:       'Proposal',
      value:       lead.value,
      proposalId:  proposalDoc?._id ? String(proposalDoc._id) : null,
      docUrl:      docUrl || null,
      paymentLink: lead.paymentLink || null,
    },
  });
  actions.push('activity_entry_created');

  return actions;
}

async function handleNegotiation(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  // Initialize revision tracking
  if (!lead.negotiationNotes) lead.negotiationNotes = [];
  lead.negotiationRevision = (lead.negotiationRevision || 0) + 1;
  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Negotiation: new Date() };
  actions.push('negotiation_revision_initialized');

  // Add initial negotiation note
  lead.negotiationNotes.push({
    content: `Negotiation started — revision ${lead.negotiationRevision}. Ready for approval.`,
    author: session.name,
    revision: lead.negotiationRevision,
    createdAt: new Date(),
  });
  actions.push('negotiation_note_created');

  // Approval workflow — create a real ApprovalRequest for high-value deals
  try {
    const cleanAmount = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, '')) || 0;
    if (cleanAmount >= 50000) {
      // Check for existing pending approval to avoid duplicates
      const existing = await ApprovalRequest.findOne({ leadId: lead._id, status: 'pending' });
      if (!existing) {
        await ApprovalRequest.create({
          leadId:          lead._id,
          requestedBy:     session.userId,
          requestedByName: session.name,
          reason:          `High-value deal (${lead.value}) entered Negotiation stage — approval required before progressing to Closing.`,
          dealValue:       String(lead.value || ''),
          status:          'pending',
        });
        lead.approvalStatus = 'pending';
        // Notify all Admins
        const admins = await User.find({ role: 'Admin' }).select('_id email name').lean() as any[];
        for (const admin of admins) {
          await createNotification(
            String(admin._id),
            `⚠️ High-Value Approval Required: ${lead.name}`,
            `Deal "${lead.name}" (${lead.value}) entered Negotiation and requires admin approval before Closing.`
          ).catch(console.error);
          if (isValidEmail(admin.email)) {
            await sendEmail({
              event: 'task_update',
              to: admin.email,
              vars: {
                name:        admin.name,
                role:        'Admin',
                action:      `High-Value Deal Requires Approval: ${lead.name}`,
                description: `Lead "${lead.name}" (${lead.value}) entered Negotiation stage. Deal value ≥ $50,000 requires admin approval before progressing to Closing. Requested by: ${session.name}.`,
              },
            }).catch(console.error);
          }
        }
      }
      actions.push('high_value_deal_approval_required');
    } else {
      actions.push('standard_approval_auto_granted');
    }
  } catch (err) {
    console.error('[stageWorkflow] Approval hook error:', err);
    actions.push('approval_hook_skipped');
  }

  // Activity log
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_negotiation',
    module: 'CRM',
    description: `Lead "${lead.name}" entered Negotiation — revision ${lead.negotiationRevision}`,
    metadata: { leadId: lead._id, stage: 'Negotiation', revision: lead.negotiationRevision },
  });
  actions.push('activity_entry_created');

  return actions;
}

async function handleClosing(lead: any, session: WorkflowSession): Promise<string[]> {
  const actions: string[] = [];

  // Set payment tracking
  lead.paymentStatus = 'pending';
  lead.onboardingReady = false;
  lead.closedAt = new Date();
  if (!lead.stageEnteredAt) lead.stageEnteredAt = {};
  lead.stageEnteredAt = { ...lead.stageEnteredAt, Closing: new Date() };
  lead.conversionSource = lead.leadSource || 'Pipeline';
  actions.push('payment_flow_initiated');
  actions.push('onboarding_state_set');

  // Create Invoice if not already created
  try {
    const cleanAmount = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, '')) || 0;
    // Generate invoiceId: INV-YYYYMMDD-Random
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(Math.random() * 0xfffff).toString(16).padEnd(5, '0');
    const invoiceId = `INV-${dateStr}-${randomHex.toUpperCase()}`;

    const newInvoice = await Invoice.create({
      invoiceId,
      client: lead.name,
      clientEmail: lead.email,
      clientPhone: lead.phone || '',
      amount: String(cleanAmount),
      date: new Date().toISOString().slice(0, 10),
      due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 7 days from now
      status: 'Pending',
      category: 'Enterprise CRM Suite',
      paymentLink: lead.paymentLink || '',
      razorpayOrderId: lead.razorpayOrderId || '',
    });
    actions.push(`invoice_created_${newInvoice.invoiceId}`);

    // Outbound webhook
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const { enqueueWebhook } = await import('./webhookQueue');
        const invoicePayload = {
          invoiceId: newInvoice._id.toString(),
          invoiceNumber: newInvoice.invoiceId,
          client: newInvoice.client,
          clientEmail: newInvoice.clientEmail || "",
          clientPhone: newInvoice.clientPhone || "",
          amount: newInvoice.amount,
          category: newInvoice.category || "",
          date: newInvoice.date || "",
          due: newInvoice.due || "",
          status: newInvoice.status,
          razorpayOrderId: newInvoice.razorpayOrderId || "",
          razorpayPaymentId: newInvoice.razorpayPaymentId || "",
        };

        console.log(`[Webhook] Enqueuing invoice_created event for auto-created invoice ${newInvoice.invoiceId}`);
        await enqueueWebhook({
          event: 'invoice_created',
          targetUrl: webhookUrl,
          payload: {
            event: 'invoice_created',
            timestamp: new Date().toISOString(),
            source: 'ops-platform',
            version: '1.0',
            data: invoicePayload,
          },
        });
      } catch (err: any) {
        console.error('[Webhook] Failed to enqueue auto-created invoice_created webhook:', err.message);
      }
    }

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('./audit');
      await logAudit({
        action: 'create_invoice',
        module: 'Invoices',
        entityId: newInvoice._id.toString(),
        entityType: 'Invoice',
        newValue: newInvoice.toObject(),
        session: {
          sub: session.userId,
          name: session.name,
          role: session.role,
        },
      });
    } catch (err: any) {
      console.error('[AuditLog] Auto-create invoice audit log failed:', err.message);
    }
  } catch (err) {
    console.error('[handleClosing] Failed to create invoice:', err);
  }

  // Activity log — significant action
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_conversion',
    module: 'CRM',
    description: `Lead "${lead.name}" moved to Closing — conversion event recorded`,
    metadata: {
      leadId: lead._id,
      stage: 'Closing',
      value: lead.value,
      leadScore: lead.leadScore,
      source: lead.conversionSource,
    },
  });
  actions.push('conversion_analytics_recorded');

  return actions;
}

// ─── Main Executor ────────────────────────────────────────────────────────────

export interface WorkflowResult {
  success: boolean;
  allowed: boolean;
  skipped: boolean;
  reason?: string;
  workflowActions: string[];
}

export async function executeStageWorkflow(
  lead: any,
  fromStage: CRMStage,
  toStage: CRMStage,
  session: WorkflowSession,
  force = false
): Promise<WorkflowResult> {
  await connectDB();

  // 1. Validate transition
  const validation = validateTransition(fromStage, toStage, session.role, force);
  if (!validation.allowed) {
    return {
      success: false,
      allowed: false,
      skipped: validation.skipped,
      reason: validation.reason,
      workflowActions: [],
    };
  }

  // 2. Update stage
  lead.stage = toStage;
  lead.history.push({
    event: `Stage changed: ${fromStage} → ${toStage}`,
    user: session.name,
    time: new Date(),
  });

  // 3. Run stage-specific automation
  let stageActions: string[] = [];
  try {
    if (toStage === 'Discovery') stageActions = await handleDiscovery(lead, session);
    if (toStage === 'Contacted') stageActions = await handleContacted(lead, session);
    if (toStage === 'Qualified') stageActions = await handleQualified(lead, session);
    if (toStage === 'Proposal')  stageActions = await handleProposal(lead, session);
    if (toStage === 'Negotiation') stageActions = await handleNegotiation(lead, session);
    if (toStage === 'Closing')   stageActions = await handleClosing(lead, session);
  } catch (err) {
    console.error('[StageWorkflow] Stage automation error:', err);
    // Don't block the transition — just log the failure
    stageActions.push('automation_partial_failure');
  }

  const allActions = [`stage_changed_${fromStage}_to_${toStage}`, ...stageActions];

  // 4. Create immutable StageWorkflowLog entry
  try {
    await StageWorkflowLog.create({
      leadId: lead._id,
      leadName: lead.name,
      leadEmail: lead.email,
      fromStage,
      toStage,
      triggeredBy: session.name,
      userId: session.userId,
      workflowActions: allActions,
      metadata: {
        value: lead.value,
        status: lead.status,
        assignedTo: lead.assignedToName,
        leadScore: lead.leadScore,
      },
    });
  } catch (logErr) {
    console.error('[StageWorkflow] Failed to write StageWorkflowLog:', logErr);
  }

  return {
    success: true,
    allowed: true,
    skipped: validation.skipped,
    workflowActions: allActions,
  };
}

// ─── Workflow Action Helpers ──────────────────────────────────────────────────

/**
 * Log a call/meeting event on a lead in Contacted/Negotiation stage.
 */
export async function logCallEvent(
  lead: any,
  session: WorkflowSession,
  duration: number,
  outcome: string
): Promise<void> {
  lead.lastContactedAt = new Date();
  lead.lastContact = 'Just now';
  lead.history.push({
    event: `Call logged: ${duration} min — ${outcome}`,
    user: session.name,
    time: new Date(),
  });

  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_call_logged',
    module: 'CRM',
    description: `Call with "${lead.name}" — ${duration} min, outcome: ${outcome}`,
    metadata: { leadId: lead._id, duration, outcome },
  });
}

/**
 * Add a negotiation note with revision tracking.
 */
export async function addNegotiationNote(
  lead: any,
  session: WorkflowSession,
  content: string
): Promise<void> {
  if (!lead.negotiationNotes) lead.negotiationNotes = [];
  lead.negotiationRevision = (lead.negotiationRevision || 0) + 1;
  lead.negotiationNotes.push({
    content,
    author: session.name,
    revision: lead.negotiationRevision,
    createdAt: new Date(),
  });
  lead.history.push({
    event: `Negotiation note added — revision ${lead.negotiationRevision}`,
    user: session.name,
    time: new Date(),
  });
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_negotiation_note',
    module: 'CRM',
    description: `Negotiation note rev.${lead.negotiationRevision} added for "${lead.name}"`,
    metadata: { leadId: lead._id, revision: lead.negotiationRevision },
  });
}

/**
 * Mark a proposal as sent and set proposalSentAt.
 */
export async function markProposalSent(lead: any, session: WorkflowSession): Promise<void> {
  lead.proposalStatus = 'sent';
  lead.proposalSentAt = new Date();
  lead.history.push({
    event: `Proposal sent to ${lead.email}`,
    user: session.name,
    time: new Date(),
  });
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_proposal_sent',
    module: 'CRM',
    description: `Proposal sent to "${lead.name}" (${lead.email})`,
    metadata: { leadId: lead._id, proposalStatus: 'sent' },
  });
}

/**
 * Mark payment as received and set onboarding-ready state.
 */
export async function markPaymentReceived(lead: any, session: WorkflowSession): Promise<void> {
  lead.paymentStatus = 'paid';
  lead.onboardingReady = true;
  lead.history.push({
    event: `Payment confirmed — onboarding ready`,
    user: session.name,
    time: new Date(),
  });
  await ActivityLog.create({
    userId: session.userId,
    name: session.name,
    userEmail: session.email,
    userRole: session.role,
    actionType: 'crm_payment_received',
    module: 'CRM',
    description: `Payment received from "${lead.name}" — onboarding state activated`,
    metadata: { leadId: lead._id, paymentStatus: 'paid', onboardingReady: true },
  });
}

/**
 * Create a follow-up reminder on any stage.
 */
export async function createFollowUpReminder(
  lead: any,
  daysFromNow: number,
  note: string
): Promise<void> {
  if (!lead.followUpReminders) lead.followUpReminders = [];
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + daysFromNow);
  lead.followUpReminders.push({ dueAt, note, completed: false, createdAt: new Date() });
}
