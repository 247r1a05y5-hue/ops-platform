import { withLogging } from '@/lib/logger';
/**
 * /api/leads/workflow — Stage-specific workflow action endpoint
 *
 * POST { leadId, action, ...params }
 * Actions: send_welcome_email | log_call | score_lead | generate_proposal |
 *          create_payment_link | add_negotiation_note | mark_payment_received |
 *          complete_reminder | add_reminder
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, Invoice, ActivityLog } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import {
  logCallEvent,
  addNegotiationNote,
  markProposalSent,
  markPaymentReceived,
  createFollowUpReminder,
  type UserRole
} from '@/lib/stageWorkflow';
import Razorpay from 'razorpay';
import { sendWhatsAppMessage, isWhatsAppConfigured } from '@/lib/whatsapp';

async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { leadId, action, ...params } = body;

    if (!leadId || !action) {
      return NextResponse.json({ success: false, error: 'leadId and action are required' }, { status: 400 });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const workflowSession = {
      userId: session.sub,
      name: session.name,
      email: session.email,
      role: session.role as UserRole,
    };

    // ── Discovery: Send Welcome Email ───────────────────────────────────
    if (action === 'send_welcome_email') {
      if (lead.welcomeEmailSent) {
        return NextResponse.json({ success: false, error: 'Welcome email already sent for this lead' }, { status: 400 });
      }

      // Use the existing email send endpoint internally
      const emailRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-bypass': 'internal' },
        body: JSON.stringify({
          leadId,
          to: lead.email,
          subject: `Welcome! We're excited to connect, ${lead.name}`,
          htmlContent: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px;">
              <h2 style="color: #4f46e5;">Hi ${lead.name},</h2>
              <p>Thank you for your interest in working with us. We've received your information and a member of our team will be reaching out shortly.</p>
              <p>In the meantime, feel free to reply to this email with any questions.</p>
              <br/>
              <p>Best regards,<br/><strong>The Ops Team</strong></p>
            </div>
          `,
        }),
      });

      if (emailRes.ok) {
        lead.welcomeEmailSent = true;
        lead.history.push({ event: 'Welcome email sent to lead', user: session.name, time: new Date() });
      } else {
        // Don't fail the action — just mark as attempted
        lead.history.push({ event: 'Welcome email send failed', user: session.name, time: new Date() });
      }

      await lead.save();
      return NextResponse.json({ success: true, lead, message: 'Welcome email dispatched' });
    }

    // ── Contacted: Log Call ─────────────────────────────────────────────
    if (action === 'log_call') {
      const duration = parseInt(params.duration || '0');
      const outcome = params.outcome || 'No outcome recorded';

      await logCallEvent(lead, workflowSession, duration, outcome);
      await lead.save();

      return NextResponse.json({
        success: true,
        lead,
        message: `Call logged: ${duration} min — ${outcome}`,
      });
    }

    // ── Qualified: Manually Set Lead Score ──────────────────────────────
    if (action === 'score_lead') {
      const score = Math.min(100, Math.max(0, parseInt(params.score || '0')));
      const notes = params.notes || '';

      lead.leadScore = score;
      if (notes) lead.qualificationNotes = notes;
      lead.history.push({
        event: `Lead scored: ${score}/100`,
        user: session.name,
        time: new Date(),
      });
      await lead.save();

      return NextResponse.json({ success: true, lead, message: `Lead score set to ${score}/100` });
    }

    // ── Proposal: Generate & Send Proposal ─────────────────────────────
    if (action === 'generate_proposal') {
      const templateName = params.templateName || 'Standard Proposal';

      // Mark proposal as sent
      await markProposalSent(lead, workflowSession);
      await lead.save();

      return NextResponse.json({
        success: true,
        lead,
        message: `Proposal "${templateName}" marked as sent to ${lead.email}`,
      });
    }

    // ── Proposal: Create Razorpay Payment Link ──────────────────────────
    if (action === 'create_payment_link') {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return NextResponse.json({
          success: false,
          error: 'Razorpay keys not configured',
        }, { status: 500 });
      }

      const cleanAmount = parseFloat(String(lead.value || '0').replace(/[^0-9.]/g, ''));
      if (isNaN(cleanAmount) || cleanAmount <= 0) {
        return NextResponse.json({
          success: false,
          error: 'Invalid or missing lead deal value for payment link',
        }, { status: 400 });
      }

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const amountInPaise = Math.round(cleanAmount * 100);

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `lead_${lead._id}`,
        notes: { leadName: lead.name, leadEmail: lead.email, company: lead.company },
      } as any);

      // Build a shareable Razorpay payment page URL
      const paymentPageUrl = `https://rzp.io/l/${order.id}`;

      lead.paymentLink = paymentPageUrl;
      lead.razorpayOrderId = order.id;
      lead.paymentStatus = 'pending';
      lead.history.push({
        event: `Payment link created — ₹${cleanAmount.toLocaleString('en-IN')}`,
        user: session.name,
        time: new Date(),
      });
      await lead.save();

      return NextResponse.json({
        success: true,
        lead,
        paymentLink: paymentPageUrl,
        orderId: order.id,
        amount: cleanAmount,
        message: `Payment link generated for ₹${cleanAmount.toLocaleString('en-IN')}`,
      });
    }

    // ── Negotiation: Add Note ───────────────────────────────────────────
    if (action === 'add_negotiation_note') {
      if (!params.content) {
        return NextResponse.json({ success: false, error: 'content is required' }, { status: 400 });
      }

      await addNegotiationNote(lead, workflowSession, params.content);
      await lead.save();

      return NextResponse.json({
        success: true,
        lead,
        message: `Negotiation note added — revision ${lead.negotiationRevision}`,
      });
    }

    // ── Closing: Mark Payment Received ──────────────────────────────────
    if (action === 'mark_payment_received') {
      await markPaymentReceived(lead, workflowSession);
      await lead.save();

      return NextResponse.json({
        success: true,
        lead,
        message: 'Payment marked as received — lead is onboarding-ready',
      });
    }

    // ── Global: Complete Reminder ───────────────────────────────────────
    if (action === 'complete_reminder') {
      const remIdx = parseInt(params.reminderIndex || '-1');
      if (remIdx < 0 || !lead.followUpReminders?.[remIdx]) {
        return NextResponse.json({ success: false, error: 'Invalid reminder index' }, { status: 400 });
      }
      lead.followUpReminders[remIdx].completed = true;
      await lead.save();
      return NextResponse.json({ success: true, lead, message: 'Reminder marked complete' });
    }

    // ── Global: Add Reminder ────────────────────────────────────────────
    if (action === 'add_reminder') {
      const days = parseInt(params.daysFromNow || '3');
      const note = params.note || `Follow up with ${lead.name}`;
      await createFollowUpReminder(lead, days, note);
      await lead.save();
      return NextResponse.json({ success: true, lead, message: `Follow-up reminder set for ${days} days` });
    }


    // ── WhatsApp: Send direct message ────────────────────────────────────
    if (action === 'send_whatsapp') {
      if (!isWhatsAppConfigured()) {
        return NextResponse.json({ success: false, error: 'WhatsApp not configured. Set WHATSAPP_PHONE_ID and WHATSAPP_TOKEN.' }, { status: 503 });
      }
      const phone = lead.phone?.replace(/[^0-9]/g, '');
      if (!phone) return NextResponse.json({ success: false, error: 'Lead has no phone number' }, { status: 422 });
      const msgText = params.message || `Hi ${lead.name}, following up from the Ops team!`;
      const result = await sendWhatsAppMessage(phone, msgText);
      if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
      lead.history.push({ event: `WhatsApp sent by ${session.name}`, user: session.name, time: new Date() });
      await lead.save();
      await ActivityLog.create({ userId: session.sub, name: session.name, userEmail: session.email, userRole: session.role, actionType: 'workflow_action', module: 'CRM', description: `WhatsApp sent to "${lead.name}" by ${session.name}`, metadata: { leadId, action }, ip: req.headers.get('x-forwarded-for') || '127.0.0.1', userAgent: req.headers.get('user-agent') || 'Unknown', timestamp: new Date() });
      return NextResponse.json({ success: true, message: 'WhatsApp message sent', result });
    }

    // ── WhatsApp: Proposal sent alert ─────────────────────────────────────
    if (action === 'send_proposal_alert') {
      if (!isWhatsAppConfigured()) return NextResponse.json({ success: false, error: 'WhatsApp not configured' }, { status: 503 });
      const phone = lead.phone?.replace(/[^0-9]/g, '');
      if (!phone) return NextResponse.json({ success: false, error: 'Lead has no phone number' }, { status: 422 });
      const msg = `📋 *Proposal Sent!*\n\nHi ${lead.name},\n\nWe\'ve just sent you our proposal for *${lead.value || 'your project'}*.\n\nPlease review it and feel free to reach out with any questions!`;
      const result = await sendWhatsAppMessage(phone, msg);
      lead.history.push({ event: `Proposal WhatsApp alert sent by ${session.name}`, user: session.name, time: new Date() });
      await lead.save();
      return NextResponse.json({ success: true, message: 'Proposal alert sent via WhatsApp', result });
    }

    // ── WhatsApp: Payment due reminder ────────────────────────────────────
    if (action === 'send_payment_reminder') {
      if (!isWhatsAppConfigured()) return NextResponse.json({ success: false, error: 'WhatsApp not configured' }, { status: 503 });
      const phone = lead.phone?.replace(/[^0-9]/g, '');
      if (!phone) return NextResponse.json({ success: false, error: 'Lead has no phone number' }, { status: 422 });
      const dueDate = params.dueDate || 'soon';
      const msg = `💰 *Payment Reminder*\n\nHi ${lead.name},\n\nThis is a reminder that your payment of *${lead.value || 'your invoice'}* is due on *${dueDate}*.\n\nPlease ensure timely payment. Contact us if you have any questions.`;
      const result = await sendWhatsAppMessage(phone, msg);
      lead.history.push({ event: `Payment reminder WhatsApp sent by ${session.name}`, user: session.name, time: new Date() });
      await lead.save();
      return NextResponse.json({ success: true, message: 'Payment reminder sent via WhatsApp', result });
    }

    // ── Request Approval ──────────────────────────────────────────────────
    if (action === 'request_approval') {
      const { ApprovalRequest } = await import('@/lib/db');
      const existing = await ApprovalRequest.findOne({ leadId, status: 'pending' });
      if (existing) return NextResponse.json({ success: false, error: 'Pending approval already exists' }, { status: 409 });
      const approvalReq = await ApprovalRequest.create({
        leadId, requestedBy: session.sub, requestedByName: session.name,
        reason: params.reason || '', dealValue: params.dealValue || lead.value || '',
      });
      lead.approvalStatus = 'pending';
      lead.history.push({ event: `Approval requested by ${session.name}`, user: session.name, time: new Date() });
      await lead.save();
      await ActivityLog.create({ userId: session.sub, name: session.name, userEmail: session.email, userRole: session.role, actionType: 'approval_requested', module: 'CRM', description: `Approval requested for "${lead.name}" by ${session.name}`, metadata: { leadId, requestId: approvalReq._id }, ip: req.headers.get('x-forwarded-for') || '127.0.0.1', userAgent: req.headers.get('user-agent') || 'Unknown', timestamp: new Date() });
      return NextResponse.json({ success: true, message: 'Approval request submitted', request: approvalReq });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[workflow POST]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
