import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, EmailLog } from '@/lib/db';
import { sendEmail } from '@/lib/email';

/**
 * Zapier Webhook Endpoint for Gmail Automation
 * 
 * This endpoint receives webhook calls from Zapier when:
 * - New emails arrive in Gmail
 * - New user signups occur
 * 
 * The webhook will trigger email notifications based on configured Zapier rules
 */

export async function POST(req: NextRequest) {
  try {
    console.log('[Zapier] Incoming webhook');

    // ── API key auth ────────────────────────────────────────────────────────
    const serverApiKey = process.env.ZAPIER_API_KEY;
    if (!serverApiKey || serverApiKey.trim() === '') {
      console.error('[Zapier] Auth failed');
      return NextResponse.json(
        { success: false, error: 'Zapier integration is not configured.' },
        { status: 500 }
      );
    }

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      console.error('[Zapier] Auth failed');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Missing API key' },
        { status: 401 }
      );
    }

    if (apiKey !== serverApiKey) {
      console.error('[Zapier] Auth failed');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    // ── Task 2: Replay attack protection ────────────────────────────────────
    // Read raw body as text so we can verify HMAC before parsing JSON
    const rawBody   = await req.text();
    const signature = req.headers.get('x-ops-signature') ?? '';
    const timestamp = req.headers.get('x-ops-timestamp') ?? '';

    // Only verify if the platform has WEBHOOK_SECRET configured
    if (process.env.WEBHOOK_SECRET) {
      let eventIdForReplay = 'unknown';
      try {
        const preview = JSON.parse(rawBody);
        eventIdForReplay = preview?.eventId ?? 'unknown';
      } catch (_) {}

      const { verifyInboundSignature } = await import('@/lib/webhookSecurity');
      const verify = await verifyInboundSignature(signature, timestamp, rawBody, eventIdForReplay);
      if (!verify.ok) {
        const vf = verify as { ok: false; reason: string; status: number };
        console.error('[Zapier] Signature verification failed:', vf.reason);
        return NextResponse.json(
          { success: false, error: vf.reason },
          { status: vf.status }
        );
      }
    }

    const body = JSON.parse(rawBody);
    console.log('Zapier webhook received:', body);

    await connectDB();

    const {
      event,
      email,
      name,
      role,
      subject,
      message,
      userId,
      metadata
    } = body;

    // Handle different event types
    if (event === 'new_user_signup') {
      return await handleNewUserSignup(email, name, role);
    } else if (event === 'new_lead') {
      return await handleNewLead(body);
    } else if (event === 'new_email_received') {
      return await handleNewEmailReceived(body);
    } else if (event === 'send_email') {
      return await handleSendEmail(email, subject, message);
    } else {
      return NextResponse.json(
        { success: false, error: 'Unknown event type', receivedEvent: event },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Zapier webhook error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}


/**
 * Handle new user signup event from Zapier
 * Sends welcome email to user and notification to admin
 */
async function handleNewUserSignup(email: string, name: string, role: string) {
  try {
    // Clean and validate email
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    
    if (!cleanEmail || !cleanName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: email, name' },
        { status: 400 }
      );
    }

    // Send welcome email to user
    const userEmailInfo = await sendEmail({
      event: 'welcome',
      to: cleanEmail,
      vars: { name: cleanName, email: cleanEmail, role: role || 'User' }
    });

    await EmailLog.create({
      event: 'zapier_new_user_welcome',
      to: cleanEmail,
      status: 'success',
      messageId: userEmailInfo.messageId,
      vars: { name: cleanName, role }
    });

    // Send admin notification
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'admin@ops.com';
    const adminEmailInfo = await sendEmail({
      event: 'admin_user_signup',
      to: adminEmail,
      vars: { name: cleanName, email: cleanEmail, role: role || 'User' }
    });

    await EmailLog.create({
      event: 'zapier_admin_notification',
      to: adminEmail,
      status: 'success',
      messageId: adminEmailInfo.messageId,
      vars: { userName: cleanName, userEmail: cleanEmail, role }
    });

    console.log(`✅ New user signup processed: ${cleanEmail}`);

    return NextResponse.json({
      success: true,
      message: 'New user signup processed successfully',
      userEmailId: userEmailInfo.messageId,
      adminEmailId: adminEmailInfo.messageId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error handling new user signup:', message);
    
    try {
      await EmailLog.create({
        event: 'zapier_new_user_error',
        to: email,
        status: 'failed',
        error: message,
        vars: { name, role }
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * Handle new email received event from Zapier
 * This could trigger actions like creating leads or updating contacts
 */
async function handleNewEmailReceived(payload: any) {
  try {
    const { from, to, subject, body, attachments, messageId } = payload;

    if (!from || !subject) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: from, subject' },
        { status: 400 }
      );
    }

    // Log the incoming email
    await EmailLog.create({
      event: 'zapier_gmail_received',
      to: to || 'unknown',
      status: 'logged',
      messageId: messageId || `zapier-${Date.now()}`,
      vars: {
        from,
        subject,
        hasAttachments: !!attachments && attachments.length > 0
      }
    });

    console.log(`✅ Gmail received from ${from}: ${subject}`);

    return NextResponse.json({
      success: true,
      message: 'Email received and logged successfully',
      from,
      subject
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error handling Gmail received:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * Handle generic send email event from Zapier
 * Used for on-demand email sending triggered by Zapier
 */
async function handleSendEmail(to: string, subject: string, body: string) {
  try {
    if (!to || !subject || !body) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    // Use activity_alert template for Zapier custom emails
    const emailInfo = await sendEmail({
      event: 'activity_alert',
      to,
      vars: { action: subject, name: 'System', role: 'Admin', description: body }
    });

    await EmailLog.create({
      event: 'zapier_send_email',
      to,
      status: 'success',
      messageId: emailInfo.messageId,
      vars: { subject }
    });

    console.log(`✅ Email sent via Zapier to ${to}`);

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      messageId: emailInfo.messageId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error sending email:', message);
    
    try {
      await EmailLog.create({
        event: 'zapier_send_email_error',
        to,
        status: 'failed',
        error: message,
        vars: { subject }
      });
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * Handle new lead event from Zapier
 * Triggers Gmail welcome email, notifies marketing rep, and creates Sheets entry
 */
async function handleNewLead(payload: any) {
  try {
    const { name, email, company, value, stage, status, assignedTo, createdBy, leadId } = payload;

    // Clean all string fields
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanCompany = (company || '').trim();
    const cleanValue = (value || '').trim();
    const cleanStage = (stage || '').trim();
    const cleanStatus = (status || '').trim();
    const cleanAssignedTo = (assignedTo || '').trim();

    if (!cleanName || !cleanEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, email' },
        { status: 400 }
      );
    }

    // Log the new lead
    await EmailLog.create({
      event: 'zapier_new_lead',
      to: cleanEmail,
      status: 'logged',
      messageId: `lead-${leadId || Date.now()}`,
      vars: {
        name: cleanName,
        company: cleanCompany || 'Unknown',
        value: cleanValue || '$0',
        stage: cleanStage || 'Discovery',
        status: cleanStatus || 'Warm',
        assignedTo: cleanAssignedTo || 'Unassigned'
      }
    });

    console.log(`✅ New lead received from Zapier: ${cleanName} (${cleanEmail})`);

    return NextResponse.json({
      success: true,
      message: 'New lead received and logged successfully',
      name: cleanName,
      email: cleanEmail,
      leadId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error handling new lead:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Zapier webhook endpoint is active',
    version: '1.0',
    supportedEvents: [
      'new_user_signup',
      'new_lead',
      'new_email_received',
      'send_email'
    ]
  });
}
