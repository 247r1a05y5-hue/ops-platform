import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, User } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { executeStageWorkflow, type CRMStage, type UserRole } from '@/lib/stageWorkflow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Workspace isolation helper ──────────────────────────────────────────────────
// Lead schema has no workspaceId. We scope by filtering on assignedTo (ObjectId ref
// to User) being within the same workspace. Unassigned leads are also included.
// Existing documents need no migration for single-workspace deployments.
async function getWorkspaceMemberIds(userId: string): Promise<string[] | null> {
  try {
    const currentUser = await User.findById(userId).select('workspaceId').lean() as any;
    if (!currentUser?.workspaceId) return null;
    const members = await User.find({ workspaceId: currentUser.workspaceId })
      .select('_id').lean() as any[];
    return members.map((m: any) => String(m._id));
  } catch {
    return null;
  }
}

// GET all leads
async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '0');
    const stage = searchParams.get('stage');
    const status = searchParams.get('status');

    if (id) {
      const lead = await Lead.findById(id);
      if (!lead) {
        return NextResponse.json({ success: false, error: 'Lead not found' }, {
          status: 404,
          headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
        });
      }
      return NextResponse.json({ success: true, lead }, {
        headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
      });
    }

    // ── Workspace isolation ──────────────────────────────────────────────────
    const memberIds = await getWorkspaceMemberIds(session.sub);

    const filter: any = {};
    if (stage) filter.stage = stage;
    if (status) filter.status = status;
    if (memberIds) {
      // Include leads assigned to workspace members OR unassigned leads
      filter.$or = [
        { assignedTo: { $in: memberIds } },
        { assignedTo: null },
        { assignedTo: { $exists: false } },
      ];
    }

    let query = Lead.find(filter).sort({ createdAt: -1 });

    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const leads = await query;
    const total = await Lead.countDocuments(filter);

    return NextResponse.json({
      success: true,
      leads,
      metadata: { total, page, limit, pages: limit > 0 ? Math.ceil(total / limit) : 1 }
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  }
}

// POST new lead — triggers Discovery workflow automatically
async function _POST(req: NextRequest) {
  console.log('[TRACE 1] POST /api/leads entered');
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { name, company, value, stage, status, email, phone, assignedTo, leadSource } = body;

    if (!name || !email) {
      return NextResponse.json({ success: false, error: 'Name and Email are required' }, { status: 400 });
    }
    console.log('[TRACE 2] Lead validation passed');

    let assignedToName = 'Unassigned';
    if (assignedTo) {
      const user = await User.findById(assignedTo);
      if (user) assignedToName = user.name;
    }

    const now = new Date();
    const initialStage: CRMStage = (stage as CRMStage) || 'Discovery';

    const history = [{
      event: 'Lead Created',
      user: session.name,
      time: now,
    }];

    const stageEnteredAt: Record<string, Date> = { [initialStage]: now };

    const lead = await Lead.create({
      name,
      company: company || 'Acme Corp',
      value: value || '$0',
      stage: initialStage,
      status: status || 'Warm',
      email,
      phone: phone || '',
      assignedTo: assignedTo || null,
      assignedToName,
      history,
      notes: [],
      emails: [],
      leadSource: leadSource || 'Manual Entry',
      stageEnteredAt,
    });
    console.log('[TRACE 3] Lead saved successfully');

    // Trigger Discovery workflow automatically
    try {
      const workflowResult = await executeStageWorkflow(
        lead,
        'Discovery',  // from (same, for initial entry log)
        'Discovery',  // to
        { userId: session.sub, name: session.name, email: session.email, role: session.role as UserRole },
        true          // force=true since it's creation, not transition
      );
      // Save after workflow mutates the lead
      await lead.save();
    } catch (wfErr) {
      console.error('[leads POST] Discovery workflow error:', wfErr);
    }

    // WhatsApp notification (non-blocking)
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER || '919284788141';
    const leadStatus = status || 'Warm';
    const statusEmoji = leadStatus === 'Hot' ? '🔥' : leadStatus === 'Warm' ? '🌡️' : '❄️';
    const waMessage =
      `🆕 *New Lead Added!*\n\n` +
      `👤 *Name:* ${name}\n` +
      `🏢 *Company:* ${company || 'Acme Corp'}\n` +
      `💰 *Value:* ${value || '$0'}\n` +
      `${statusEmoji} *Status:* ${leadStatus}\n` +
      `📧 *Email:* ${email}\n` +
      (phone ? `📞 *Phone:* ${phone}\n` : '') +
      `👥 *Assigned To:* ${assignedToName}\n\n` +
      `Check your CRM dashboard for details.`;

    const waResult = await sendWhatsAppMessage(adminPhone, waMessage);
    if (!waResult.success) {
      console.warn('[leads] WhatsApp notification skipped:', waResult.error);
    }

    // Enqueue Zapier webhook — delivery handled by the webhook queue worker
    console.log('[TRACE 4] Before enqueueWebhook');
    try {
      const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
      if (!webhookUrl) {
        console.warn('[leads] ZAPIER_WEBHOOK_URL is not set — skipping Zapier notification.');
      } else {
        const { enqueueWebhook } = await import('@/lib/webhookQueue');
        console.log('[TRACE 5] enqueueWebhook imported');
        await enqueueWebhook({
          event: 'new_lead',
          targetUrl: webhookUrl,
          payload: {
            event: 'new_lead',
            name: (lead.name || '').trim(),
            email: (lead.email || '').trim().toLowerCase(),
            company: (lead.company || '').trim(),
            value: (lead.value || '').trim(),
            stage: (lead.stage || '').trim(),
            status: (lead.status || '').trim(),
            assignedTo: (lead.assignedToName || '').trim(),
            createdBy: (session.name || '').trim(),
            leadId: lead._id.toString(),
          },
        });
        console.log('[TRACE 6] enqueueWebhook completed');
      }
    } catch (err) {
      console.error('[leads] Failed to enqueue Zapier webhook:', err);
    }

    await logActivity({
      userId: session.sub,
      actionType: 'task_creation',
      module: 'CRM',
      description: `Created new lead: "${name}" (${company}) with value: ${value || '$0'}`,
      req,
    }).catch(console.error);

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'create_lead',
        module: 'CRM',
        entityId: lead._id.toString(),
        entityType: 'Lead',
        newValue: lead.toObject(),
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Create lead audit log failed:', err.message);
    }

    console.log('[TRACE 7] API response returned');
    return NextResponse.json({ success: true, lead });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT — update lead / notes / pipeline stage / assignment / workflow actions
async function _PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { id, action, force, ...data } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Lead ID is required' }, { status: 400 });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const previousLeadState = lead.toObject();

    const actorName = session.name;
    const workflowSession = {
      userId: session.sub,
      name: session.name,
      email: session.email,
      role: session.role as UserRole,
    };

    // ── Stage Transition (now workflow-powered) ─────────────────────────
    if (action === 'update_stage') {
      const fromStage = lead.stage as CRMStage;
      const toStage = data.stage as CRMStage;

      if (!toStage) {
        return NextResponse.json({ success: false, error: 'Target stage is required' }, { status: 400 });
      }

      const result = await executeStageWorkflow(lead, fromStage, toStage, workflowSession, !!force);

      if (!result.allowed) {
        return NextResponse.json({
          success: false,
          error: result.reason || 'Stage transition not allowed',
          skipped: result.skipped,
          currentStage: fromStage,
        }, { status: 422 });
      }

      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Stage moved: ${fromStage} → ${toStage} for lead "${lead.name}" (${lead.company})`,
        req,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        lead,
        workflowActions: result.workflowActions,
        skipped: result.skipped,
        message: result.skipped
          ? `⚠️ Stage skipped from ${fromStage} to ${toStage}. ${result.workflowActions.length} workflow actions executed.`
          : `Stage moved: ${fromStage} → ${toStage}. ${result.workflowActions.length} workflow actions executed.`,
      });
    }

    // ── Add Note ────────────────────────────────────────────────────────
    if (action === 'add_note') {
      lead.notes.push({ content: data.content, author: actorName, createdAt: new Date() });
      lead.history.push({ event: `Added note: "${data.content.substring(0, 30)}..."`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Added note: "${data.content.substring(0, 30)}..." to lead "${lead.name}"`,
        req,
      }).catch(console.error);
    }

    // ── Assign Lead ─────────────────────────────────────────────────────
    else if (action === 'assign_lead') {
      let assignedName = 'Unassigned';
      if (data.assignedTo) {
        const user = await User.findById(data.assignedTo);
        if (user) assignedName = user.name;
      }
      lead.assignedTo = data.assignedTo || null;
      lead.assignedToName = assignedName;
      lead.history.push({ event: `Lead assigned to ${assignedName}`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Assigned lead "${lead.name}" to ${assignedName}`,
        req,
      }).catch(console.error);
    }

    // ── Update Details ──────────────────────────────────────────────────
    else if (action === 'update_details') {
      lead.name = data.name || lead.name;
      lead.company = data.company || lead.company;
      lead.value = data.value || lead.value;
      lead.status = data.status || lead.status;
      lead.email = data.email || lead.email;
      lead.phone = data.phone || lead.phone;
      if (data.leadSource !== undefined) lead.leadSource = data.leadSource;
      lead.history.push({ event: `Lead details updated`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Updated details for lead "${lead.name}" (${lead.company})`,
        req,
      }).catch(console.error);
    }

    // ── Update Qualification ────────────────────────────────────────────
    else if (action === 'update_qualification') {
      if (data.qualificationNotes !== undefined) lead.qualificationNotes = data.qualificationNotes;
      if (data.leadScore !== undefined) lead.leadScore = Math.min(100, Math.max(0, data.leadScore));
      lead.history.push({ event: `Qualification updated — score: ${lead.leadScore}`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Updated qualification for lead "${lead.name}" (score: ${lead.leadScore})`,
        req,
      }).catch(console.error);
    }

    // ── Update Proposal Status ──────────────────────────────────────────
    else if (action === 'update_proposal_status') {
      const validStatuses = ['not_sent', 'sent', 'viewed', 'accepted', 'rejected'];
      if (!validStatuses.includes(data.proposalStatus)) {
        return NextResponse.json({ success: false, error: 'Invalid proposal status' }, { status: 400 });
      }
      lead.proposalStatus = data.proposalStatus;
      if (data.proposalStatus === 'sent') lead.proposalSentAt = new Date();
      lead.history.push({ event: `Proposal status → ${data.proposalStatus}`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Updated proposal status to "${data.proposalStatus}" for lead "${lead.name}"`,
        req,
      }).catch(console.error);
    }

    // ── Save Payment Link ───────────────────────────────────────────────
    else if (action === 'save_payment_link') {
      lead.paymentLink = data.paymentLink || '';
      lead.razorpayOrderId = data.razorpayOrderId || lead.razorpayOrderId;
      lead.paymentStatus = 'pending';
      lead.history.push({ event: `Payment link generated`, user: actorName, time: new Date() });
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Saved payment link for lead "${lead.name}"`,
        req,
      }).catch(console.error);
    }

    // ── Mark Payment Received ───────────────────────────────────────────
    else if (action === 'mark_payment_received') {
      const { markPaymentReceived } = await import('@/lib/stageWorkflow');
      await markPaymentReceived(lead, workflowSession);
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Marked payment as received for lead "${lead.name}"`,
        req,
      }).catch(console.error);
    }

    // ── Fallback generic update ─────────────────────────────────────────
    else {
      Object.assign(lead, data);
      await lead.save();

      await logActivity({
        userId: session.sub,
        actionType: 'workflow_action',
        module: 'CRM',
        description: `Updated lead "${lead.name}" (${lead.company})`,
        req,
      }).catch(console.error);
    }

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: action ? `lead_action_${action}` : 'update_lead',
        module: 'CRM',
        entityId: lead._id.toString(),
        entityType: 'Lead',
        oldValue: previousLeadState,
        newValue: lead.toObject(),
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Update lead audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, lead });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE lead
async function _DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Lead ID is required' }, { status: 400 });
    }

    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'delete_lead',
        module: 'CRM',
        entityId: id,
        entityType: 'Lead',
        oldValue: lead.toObject(),
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Delete lead audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, message: 'Lead successfully deleted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
export const PUT = withLogging(_PUT);
export const DELETE = withLogging(_DELETE);
