import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, ApprovalRequest, ActivityLog, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, isValidEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

/**
 * GET /api/leads/approval
 * List approval requests. Admin/Manager only.
 * Query: ?status=pending|approved|rejected
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (session.role === 'User' || session.role === 'MR') {
      filter.requestedBy = session.sub;
    }

    const requests = await ApprovalRequest.find(filter)
      .populate('leadId', 'name email company value stage')
      .populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/leads/approval
 * Submit approval request.
 * Body: { leadId, reason, dealValue }
 */
export async function POST(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { leadId, reason, dealValue } = await req.json();
    if (!leadId) return NextResponse.json({ success: false, error: 'leadId required' }, { status: 400 });

    const lead = await Lead.findById(leadId);
    if (!lead) return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });

    const existing = await ApprovalRequest.findOne({ leadId, status: 'pending' });
    if (existing) return NextResponse.json({ success: false, error: 'Pending approval already exists' }, { status: 409 });

    const request = await ApprovalRequest.create({
      leadId, requestedBy: session.sub, requestedByName: session.name,
      reason: reason || '', dealValue: dealValue || lead.value || '',
    });

    lead.approvalStatus = 'pending';
    lead.history.push({ event: `Approval requested by ${session.name} (${dealValue || lead.value})`, user: session.name, time: new Date() });
    await lead.save();

    await ActivityLog.create({
      userId: session.sub, name: session.name, userEmail: session.email, userRole: session.role,
      actionType: 'approval_requested', module: 'CRM',
      description: `Approval requested for "${lead.name}" (${dealValue || lead.value}) by ${session.name}`,
      metadata: { leadId, requestId: request._id, dealValue },
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent') || 'Unknown', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/leads/approval
 * Review a request. Admin/Manager only.
 * Body: { requestId, action: 'approve'|'reject', reviewNote }
 */
export async function PATCH(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;
  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { requestId, action, reviewNote } = await req.json();
    if (!requestId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'requestId and action (approve|reject) required' }, { status: 400 });
    }

    const approvalReq = await ApprovalRequest.findById(requestId);
    if (!approvalReq) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (approvalReq.status !== 'pending') return NextResponse.json({ success: false, error: `Already ${approvalReq.status}` }, { status: 409 });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    approvalReq.status         = newStatus;
    approvalReq.reviewedBy     = session.sub as any;
    approvalReq.reviewedByName = session.name;
    approvalReq.reviewNote     = reviewNote || '';
    approvalReq.reviewedAt     = new Date();
    await approvalReq.save();

    const lead = await Lead.findById(approvalReq.leadId);
    if (lead) {
      lead.approvalStatus = newStatus as any;
      lead.history.push({ event: `Approval ${newStatus} by ${session.name}${reviewNote ? `: "${reviewNote}"` : ''}`, user: session.name, time: new Date() });
      await lead.save();
    }

    // Outbound webhooks
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const { enqueueWebhook } = await import('@/lib/webhookQueue');
        const approvalPayload = {
          requestId: approvalReq._id.toString(),
          leadId: approvalReq.leadId.toString(),
          requestedBy: approvalReq.requestedBy.toString(),
          requestedByName: approvalReq.requestedByName,
          reviewedBy: approvalReq.reviewedBy ? approvalReq.reviewedBy.toString() : "",
          reviewedByName: approvalReq.reviewedByName || "",
          reason: approvalReq.reason || "",
          reviewNote: approvalReq.reviewNote || "",
          dealValue: approvalReq.dealValue || "",
          status: approvalReq.status,
          reviewedAt: approvalReq.reviewedAt ? approvalReq.reviewedAt.toISOString() : null,
        };

        const eventName = newStatus === 'approved' ? 'workflow_approved' : 'workflow_rejected';
        console.log(`[Webhook] Enqueuing ${eventName} event for request ${approvalReq._id}`);
        await enqueueWebhook({
          event: eventName,
          targetUrl: webhookUrl,
          payload: {
            event: eventName,
            timestamp: new Date().toISOString(),
            source: 'ops-platform',
            version: '1.0',
            data: approvalPayload,
          },
        });
      } catch (err: any) {
        console.error('[Webhook] Failed to enqueue workflow approval/rejection webhook:', err.message);
      }
    }

    // Notify requester
    const requesterUser = await User.findById(approvalReq.requestedBy).select('email').lean() as any;
    if (requesterUser?.email && isValidEmail(requesterUser.email)) {
      await sendEmail({
        event: 'task_update', to: requesterUser.email,
        vars: {
          name: approvalReq.requestedByName, role: 'Team Member',
          action: `Deal ${newStatus.toUpperCase()}: ${lead?.name}`,
          description: `Your approval request for "${lead?.name}" (${approvalReq.dealValue}) was ${newStatus} by ${session.name}.${reviewNote ? ` Note: "${reviewNote}"` : ''}`,
        },
      }).catch(console.error);
    }

    await createNotification(
      String(approvalReq.requestedBy),
      `Deal ${newStatus === 'approved' ? '✅ Approved' : '❌ Rejected'}: ${lead?.name}`,
      `Your request for "${lead?.name}" (${approvalReq.dealValue}) was ${newStatus} by ${session.name}.`
    ).catch(console.error);

    await ActivityLog.create({
      userId: session.sub, name: session.name, userEmail: session.email, userRole: session.role,
      actionType: `approval_${newStatus}`, module: 'CRM',
      description: `Approval ${newStatus} for "${lead?.name}" by ${session.name}. Note: ${reviewNote || 'none'}`,
      metadata: { requestId, leadId: approvalReq.leadId, action, reviewNote },
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent') || 'Unknown', timestamp: new Date(),
    });

    return NextResponse.json({ success: true, request: approvalReq });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
