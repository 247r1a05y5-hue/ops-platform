import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, AuditLog } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

function convertToCSV(data: any[]) {
  const headers = [
    'Action',
    'Module',
    'Entity ID',
    'Entity Type',
    'Old Value',
    'New Value',
    'Performed By',
    'Role',
    'Workspace',
    'IP Address',
    'Browser',
    'Device',
    'Timestamp'
  ];
  
  const rows = data.map(item => [
    item.action || '',
    item.module || '',
    item.entityId || '',
    item.entityType || '',
    JSON.stringify(item.oldValue || ''),
    JSON.stringify(item.newValue || ''),
    item.performedBy || '',
    item.performedByRole || '',
    item.workspace || '',
    item.ipAddress || '',
    item.browser || '',
    item.device || '',
    item.timestamp ? new Date(item.timestamp).toISOString() : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}

async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const action = searchParams.get('action') || '';
    const auditModule = searchParams.get('module') || '';
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const format = searchParams.get('format') || '';

    const query: any = {};

    if (action) query.action = action;
    if (auditModule) query.module = auditModule;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { action: regex },
        { module: regex },
        { entityId: regex },
        { entityType: regex },
        { performedBy: regex },
        { performedByRole: regex },
        { ipAddress: regex }
      ];
    }

    // Export CSV if requested
    if (format === 'csv') {
      const logs = await AuditLog.find(query).sort({ timestamp: -1 }).lean();
      const csv = convertToCSV(logs);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="audit_logs_export.csv"',
        },
      });
    }

    const skip = (page - 1) * limit;
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AuditLog.countDocuments(query);
    const actionTypes = await AuditLog.distinct('action');
    const modules = await AuditLog.distinct('module');

    return NextResponse.json({
      success: true,
      logs,
      meta: {
        actionTypes,
        modules,
      },
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || err }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
