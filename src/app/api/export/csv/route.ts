import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead, Invoice } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { requireAuth } from '@/lib/require-auth';

// ─── Column definitions ───────────────────────────────────────────────────────

const LEAD_FIELDS = [
  { key: 'name',           label: 'Name' },
  { key: 'email',          label: 'Email' },
  { key: 'phone',          label: 'Phone' },
  { key: 'company',        label: 'Company' },
  { key: 'value',          label: 'Value' },
  { key: 'stage',          label: 'Stage' },
  { key: 'status',         label: 'Status' },
  { key: 'assignedToName', label: 'Assigned To' },
  { key: 'lastContact',    label: 'Last Contact' },
  { key: 'createdAt',      label: 'Created At' },
];

const INVOICE_FIELDS = [
  { key: 'invoiceId',      label: 'Invoice ID' },
  { key: 'client',         label: 'Client' },
  { key: 'clientPhone',    label: 'Client Phone' },
  { key: 'amount',         label: 'Amount' },
  { key: 'category',       label: 'Category' },
  { key: 'status',         label: 'Status' },
  { key: 'date',           label: 'Date' },
  { key: 'due',            label: 'Due Date' },
  { key: 'remindersCount', label: 'Reminders Sent' },
  { key: 'paymentLink',    label: 'Payment Link' },
  { key: 'createdAt',      label: 'Created At' },
];

// ─── CSV serialiser (no external dep needed) ──────────────────────────────────

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date
    ? value.toISOString()
    : String(value);
  // Wrap in quotes if it contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(fields: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const header = fields.map(f => escapeCell(f.label)).join(',');
  const body   = rows.map(row =>
    fields.map(f => escapeCell(row[f.key])).join(',')
  );
  return [header, ...body].join('\r\n');
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Leads: any authenticated user. Invoices: Admin/Manager only.
  const { session, error } = await requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'leads';

  if (type !== 'leads' && type !== 'invoices') {
    return NextResponse.json(
      { success: false, error: 'Invalid type. Use ?type=leads or ?type=invoices' },
      { status: 400 }
    );
  }

  // Invoices are restricted to Admin/Manager
  if (type === 'invoices' && !['Admin', 'Manager'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();

    let csv: string;
    let filename: string;
    let recordCount: number;

    if (type === 'leads') {
      // Lean + select only the columns we export (never expose password, tokens, etc.)
      const leads = await Lead
        .find({})
        .select('name email phone company value stage status assignedToName lastContact createdAt')
        .sort({ createdAt: -1 })
        .lean();

      recordCount = leads.length;
      csv         = buildCSV(LEAD_FIELDS, leads as Record<string, unknown>[]);
      filename    = `leads_${dateSuffix()}.csv`;

    } else {
      const invoices = await Invoice
        .find({})
        .select('invoiceId client clientPhone amount category status date due remindersCount paymentLink createdAt')
        .sort({ createdAt: -1 })
        .lean();

      recordCount = invoices.length;
      csv         = buildCSV(INVOICE_FIELDS, invoices as Record<string, unknown>[]);
      filename    = `invoices_${dateSuffix()}.csv`;
    }

    // Fire-and-forget activity log
    logActivity({
      userId:      session.sub,
      actionType:  'export_csv',
      description: `Exported ${recordCount} ${type} as CSV`,
      metadata:    { type, recordCount },
      req,
    }).catch(console.error);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[export/csv]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
