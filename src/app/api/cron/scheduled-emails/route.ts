import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, ActivityLog } from '@/lib/db';
import { isValidEmail } from '@/lib/email';
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
async function _GET(req: NextRequest) {
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

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error('BREVO_API_KEY is not configured in the environment.');
    }

    const fromAddress  = process.env.SENDER_EMAIL || 'admin@ops.com';
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
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'accept': 'application/json',
              'content-type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({
              sender: {
                name: 'Antigravity OPS',
                email: fromAddress
              },
              to: [
                {
                  email: lead.email
                }
              ],
              subject: e.subject || '(No Subject)',
              htmlContent: e.body    || '',
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Brevo API Error (${response.status}): ${errText}`);
          }

          lead.emails[i].status = 'sent' as any;
          (lead.emails[i] as any).sentAt = new Date();
          sent++; dirty = true;
        } catch (err) {
          lead.emails[i].status = 'failed' as any;
          failed++; dirty = true;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Lead ${lead._id}: ${msg.substring(0, 120)}`);
          console.error('[ScheduledEmails] Brevo API error:', msg);
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


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
