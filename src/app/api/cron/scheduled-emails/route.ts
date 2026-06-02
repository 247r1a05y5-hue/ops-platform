import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, ActivityLog } from '@/lib/db';
import { getTransporter, isValidEmail } from '@/lib/email';
import { requireCronAuth } from '@/lib/require-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/scheduled-emails
 * Vercel Cron: every 15 minutes (* /15 * * * *)
 * Sends Lead.emails where status='scheduled' && scheduledAt <= now.
 * Updates each email status to 'sent' or 'failed'.
 * Writes a single ActivityLog entry per run.
 */
export async function GET(req: NextRequest) {
  const authErr = requireCronAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  try {
    await connectDB();
    const now = new Date();

    const leads = await Lead.find({
      'emails.status':      'scheduled',
      'emails.scheduledAt': { $lte: now },
    })
      .select('_id name email emails')
      .limit(100);

    const transporter  = getTransporter();
    const fromAddress  = process.env.SENDER_EMAIL || process.env.SMTP_USER || 'admin@ops.com';
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      let dirty = false;
      for (let i = 0; i < lead.emails.length; i++) {
        const e = lead.emails[i];
        if (e.status !== 'scheduled' || !e.scheduledAt || e.scheduledAt > now) continue;

        if (!isValidEmail(lead.email)) {
          lead.emails[i].status = 'failed' as any;
          failed++; dirty = true;
          errors.push(`Invalid email for lead ${lead._id}: ${lead.email}`);
          continue;
        }

        try {
          await transporter.sendMail({
            from:    `"Antigravity OPS" <${fromAddress}>`,
            to:      lead.email,
            subject: e.subject || '(No Subject)',
            html:    e.body    || '',
          });
          lead.emails[i].status = 'sent' as any;
          (lead.emails[i] as any).sentAt = new Date();
          sent++; dirty = true;
        } catch (err) {
          lead.emails[i].status = 'failed' as any;
          failed++; dirty = true;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Lead ${lead._id}: ${msg.substring(0, 120)}`);
          console.error('[ScheduledEmails] SMTP error:', msg);
        }
      }
      if (dirty) await lead.save();
    }

    if (sent + failed > 0) {
      await ActivityLog.create({
        userId: null, name: 'Cron', userEmail: 'system@ops.com', userRole: 'System',
        actionType: 'scheduled_emails_cron', module: 'CRM',
        description: `Scheduled email cron: ${leads.length} leads processed. Sent: ${sent}, Failed: ${failed}.`,
        metadata: { sent, failed, errors: errors.slice(0, 20), durationMs: Date.now() - startedAt },
        ip: '127.0.0.1', userAgent: 'VercelCron/1.0', timestamp: new Date(),
      });
    }

    console.log(`[ScheduledEmails] sent=${sent} failed=${failed}`);
    return NextResponse.json({ success: true, sent, failed, leadsProcessed: leads.length, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ScheduledEmails] Fatal:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
