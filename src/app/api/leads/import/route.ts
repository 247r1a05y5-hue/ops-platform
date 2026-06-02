import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { isValidEmail } from '@/lib/email';

const VALID_STAGES = new Set(['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing']);
const VALID_STATUSES = new Set(['Hot', 'Warm', 'Cold']);

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { csvData, mode = 'insert' } = body; // mode: 'insert' | 'upsert'

    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'No CSV data provided.' }, { status: 400 });
    }

    const lines = csvData.split(/\r?\n/).filter((l: string) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: 'CSV must contain a header row and at least one data row.' }, { status: 400 });
    }

    // Parse headers
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
    const idx = {
      name:    headers.indexOf('name'),
      email:   headers.indexOf('email'),
      company: headers.indexOf('company'),
      value:   headers.indexOf('value'),
      stage:   headers.indexOf('stage'),
      status:  headers.indexOf('status'),
      phone:   headers.indexOf('phone'),
    };

    if (idx.name === -1 || idx.email === -1) {
      return NextResponse.json(
        { success: false, error: 'CSV must contain "name" and "email" column headers.' },
        { status: 400 }
      );
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const cols = parseCSVLine(lines[i]);

      const name  = idx.name  !== -1 ? cols[idx.name]?.trim()  : '';
      const email = idx.email !== -1 ? cols[idx.email]?.trim().toLowerCase() : '';

      // ── Row-level validation ───────────────────────────────────────────
      if (!name) {
        results.errors.push(`Row ${rowNum}: missing name — skipped.`);
        results.skipped++;
        continue;
      }
      if (!email || !isValidEmail(email)) {
        results.errors.push(`Row ${rowNum}: invalid or missing email "${email}" — skipped.`);
        results.skipped++;
        continue;
      }

      const rawStage  = idx.stage  !== -1 ? cols[idx.stage]?.trim()  : '';
      const rawStatus = idx.status !== -1 ? cols[idx.status]?.trim() : '';

      const stage  = VALID_STAGES.has(rawStage)   ? rawStage  : 'Discovery';
      const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'Warm';

      const leadData = {
        name,
        email,
        company: idx.company !== -1 && cols[idx.company]?.trim() ? cols[idx.company].trim() : 'Acme Corp',
        value:   idx.value   !== -1 && cols[idx.value]?.trim()   ? cols[idx.value].trim()   : '$5,000',
        phone:   idx.phone   !== -1 && cols[idx.phone]?.trim()   ? cols[idx.phone].trim()   : '',
        stage,
        status,
      };

      // ── Insert or Upsert ───────────────────────────────────────────────
      try {
        if (mode === 'upsert') {
          const existing = await Lead.findOne({ email });
          if (existing) {
            Object.assign(existing, leadData);
            existing.history.push({ event: 'Lead updated via CSV import', user: session.name, time: new Date() });
            await existing.save();
            results.updated++;
          } else {
            await Lead.create({
              ...leadData,
              history: [{ event: 'Lead imported via CSV', user: session.name, time: new Date() }],
              notes: [], emails: [], documents: [],
            });
            results.created++;
          }
        } else {
          // insert — skip duplicates
          const exists = await Lead.exists({ email });
          if (exists) {
            results.errors.push(`Row ${rowNum}: email "${email}" already exists — skipped (use upsert mode to update).`);
            results.skipped++;
            continue;
          }
          await Lead.create({
            ...leadData,
            history: [{ event: 'Lead imported via CSV', user: session.name, time: new Date() }],
            notes: [], emails: [], documents: [],
          });
          results.created++;
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        results.errors.push(`Row ${rowNum}: ${msg}`);
        results.skipped++;
      }
    }

    const total = results.created + results.updated + results.skipped;
    return NextResponse.json({
      success: true,
      message: `Processed ${total} rows: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped.`,
      results,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
