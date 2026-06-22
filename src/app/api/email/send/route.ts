import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, EmailLog, GmailToken } from '@/lib/db';
import { getTransporter, isValidEmail } from '@/lib/email';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { getGmailAccessToken } from '../../gmail/oauth/route';
import nodemailer from 'nodemailer';
import { logActivity } from '@/lib/activity';

async function sendSystemSmtp(to: string, subject: string, html: string, emailId: string) {
  const smtpTransporter = getTransporter();
  const fromAddress = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'admin@ops.com';
  
  await smtpTransporter.sendMail({
    from: `"Antigravity OPS" <${fromAddress}>`,
    to,
    subject,
    html
  });

  await EmailLog.create({
    event: 'composed_email',
    to,
    status: 'success',
    messageId: emailId,
    vars: { subject }
  });
}

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'MR']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { leadId, to, subject, htmlContent, scheduledAt, sequenceName } = body;

    // ── Validate required fields ────────────────────────────────────────────
    if (!to || !subject || !htmlContent) {
      return NextResponse.json(
        { success: false, error: 'Recipient, Subject and Body are required' },
        { status: 400 }
      );
    }

    // ── Validate recipient email ────────────────────────────────────────────
    if (!isValidEmail(to)) {
      return NextResponse.json(
        { success: false, error: `Invalid or placeholder recipient email: "${to}". Please use a real email address.` },
        { status: 400 }
      );
    }

    const lead = leadId ? await Lead.findById(leadId) : null;
    const emailId = Math.random().toString(36).substring(7);

    const trackingPixel = `<img src="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/tracking?id=${emailId}&leadId=${leadId || ''}&type=open" width="1" height="1" style="display:none;" />`;
    let processedHtml = htmlContent + trackingPixel;
    const trackingBaseUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/email/tracking?id=${emailId}&leadId=${leadId || ''}&type=click&redirect=`;

    processedHtml = processedHtml.replace(/href="([^"]+)"/g, (match: string, url: string) => {
      if (url.startsWith('mailto:') || url.startsWith('/') || url.startsWith('#')) return match;
      return `href="${trackingBaseUrl}${encodeURIComponent(url)}"`;
    });

    const emailStatus = scheduledAt ? 'scheduled' : 'sent';
    const emailRecord = {
      subject, body: htmlContent,
      sender: process.env.SENDER_EMAIL || '',
      sentAt: new Date(),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      status: emailStatus, opens: 0, clicks: 0
    };

    if (lead) {
      lead.emails.push(emailRecord);
      lead.history.push({
        event: scheduledAt ? `Email Scheduled: "${subject}"` : `Email Sent: "${subject}"`,
        user: session.name,
        time: new Date()
      });
      lead.lastContact = 'Just now';

      if (sequenceName) {
        lead.activeSequence = sequenceName;
        lead.sequenceStep = 1;
        lead.sequenceEnrolledAt = new Date();
      }

      await lead.save();
    }

    // ── Send immediately if not scheduled ──────────────────────────────────
    if (!scheduledAt) {
      try {
        // Check for personal Gmail OAuth token first
        const gmailAccessToken = await getGmailAccessToken(session.sub);
        const gmailTokenRecord = gmailAccessToken ? await GmailToken.findOne({ userId: session.sub }) : null;

        if (gmailAccessToken && gmailTokenRecord && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
          try {
            console.log(`[email/send] Dispatched via personal Gmail OAuth for user ${session.name} (${gmailTokenRecord.email})`);
            const oauthTransporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                type: 'OAuth2',
                user: gmailTokenRecord.email,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: gmailTokenRecord.refreshToken,
                accessToken: gmailAccessToken,
              }
            });

            await oauthTransporter.sendMail({
              from: `"${session.name}" <${gmailTokenRecord.email}>`,
              to,
              subject,
              html: processedHtml
            });

            await EmailLog.create({
              event: 'composed_email', to, status: 'success',
              messageId: emailId, vars: { subject }
            });

          } catch (gmailErr: unknown) {
            console.error('[email/send] Personalized Gmail OAuth dispatch failed. Falling back to system SMTP.', gmailErr);
            // Fall back to system SMTP
            await sendSystemSmtp(to, subject, processedHtml, emailId);
          }
        } else {
          // No personalized Gmail setup found, use system SMTP
          await sendSystemSmtp(to, subject, processedHtml, emailId);
        }
      } catch (err: unknown) {
        const smtpMsg = err instanceof Error ? err.message : String(err);
        // Sanitize before returning to client
        const safeMsg = smtpMsg.replace(/pass(?:word)?[=:\s]+\S+/gi, 'pass=***').substring(0, 200);

        console.error(`[email/send] Email dispatch failure for ${to}: ${smtpMsg}`);

        await EmailLog.create({
          event: 'composed_email', to, status: 'failed',
          error: safeMsg, vars: { subject }
        }).catch(() => {}); // Don't let log failure mask the real error

        return NextResponse.json(
          { success: false, error: `Email delivery failed: ${safeMsg}` },
          { status: 502 }
        );
      }
    }


    await logActivity({
      userId: session.sub,
      actionType: 'email_sent',
      module: 'Media',
      description: `Dispatched campaign outreach email "${subject}" to ${to}`,
      req,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      message: scheduledAt ? 'Email scheduled successfully!' : 'Email transmitted successfully!',
      email: emailRecord
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email/send] Unexpected error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
