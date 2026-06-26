import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, Sequence } from '@/lib/db';
import { isValidEmail } from '@/lib/email';
import { requireCronAuth } from '@/lib/require-auth';

// ─── GET /api/cron/sequences ──────────────────────────────────────────────────
// Called by Vercel Cron (vercel.json) or an external cron.
// Sends the next due email step to every lead enrolled in a sequence.
// Vercel Cron hits this with the Authorization header set to CRON_SECRET.

export async function GET(req: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) return cronAuthError;


  try {
    await connectDB();

    // Find all leads that are enrolled in a sequence using stream cursor for serverless scalability
    const cursor = Lead.find({
      activeSequence:     { $exists: true, $ne: '' },
      sequenceEnrolledAt: { $exists: true },
    }).cursor();

    // Cache sequences to avoid repeated DB fetches
    const sequenceCache = new Map<string, any>();

    const results = { sent: 0, skipped: 0, completed: 0, errors: [] as string[] };
    const now = Date.now();
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'BREVO_API_KEY is not configured in the environment.' }, { status: 500 });
    }
    const fromAddress = process.env.SENDER_EMAIL || 'admin@ops.com';

    for await (const lead of cursor) {
      try {
        const seqName = lead.activeSequence;

        // Load sequence (cached)
        if (!sequenceCache.has(seqName)) {
          const seq = await Sequence.findOne({ name: seqName });
          sequenceCache.set(seqName, seq ?? null);
        }
        const sequence = sequenceCache.get(seqName);

        if (!sequence || !sequence.steps?.length) {
          // Sequence removed or empty — disenroll
          lead.activeSequence     = '';
          lead.sequenceStep       = 0;
          lead.sequenceEnrolledAt = undefined;
          await lead.save();
          results.skipped++;
          continue;
        }

        const currentStepIdx = (lead.sequenceStep ?? 0);
        if (currentStepIdx >= sequence.steps.length) {
          // All steps done — disenroll
          lead.activeSequence = '';
          lead.sequenceStep   = 0;
          await lead.save();
          results.completed++;
          continue;
        }

        const step       = sequence.steps[currentStepIdx];
        const enrolledAt = new Date(lead.sequenceEnrolledAt).getTime();
        const stepDueAt  = enrolledAt + (step.delayDays ?? 0) * 24 * 60 * 60 * 1000;

        if (now < stepDueAt) {
          results.skipped++; // Not due yet
          continue;
        }

        // ── Send email ──────────────────────────────────────────────────────
        if (!lead.email || !isValidEmail(lead.email)) {
          results.errors.push(`Lead ${lead._id}: invalid or missing email address: ${lead.email}`);
          results.skipped++;
          continue;
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender: { name: 'Antigravity OPS', email: fromAddress },
            to: [{ email: lead.email }],
            subject: step.subject,
            htmlContent: step.body,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Brevo API Error (${response.status}): ${errText}`);
        }

        // Record sent email on lead
        lead.emails.push({
          subject: step.subject,
          body:    step.body,
          sender:  fromAddress,
          sentAt:  new Date(),
          status:  'sent',
        });

        // Advance step
        lead.sequenceStep = currentStepIdx + 1;

        // Disenroll if this was the last step
        if (lead.sequenceStep >= sequence.steps.length) {
          lead.activeSequence = '';
          results.completed++;
        }

        lead.history.push({
          event: `Sequence "${seqName}" step ${currentStepIdx + 1} sent`,
          user:  'System',
          time:  new Date(),
        });

        await lead.save();
        results.sent++;

      } catch (leadErr) {
        const msg = leadErr instanceof Error ? leadErr.message : String(leadErr);
        results.errors.push(`Lead ${lead._id} (${lead.email}): ${msg}`);
        console.error('[SequenceCron] Lead error:', msg);
      }
    }

    console.log(`[SequenceCron] Done — sent:${results.sent} skipped:${results.skipped} completed:${results.completed} errors:${results.errors.length}`);

    return NextResponse.json({ success: true, results });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SequenceCron] Fatal error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
