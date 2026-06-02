import { NextRequest, NextResponse } from 'next/server';
import { connectDB, ActivityLog } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

/**
 * GET /api/admin/audit
 * Admin-only. Returns paginated ActivityLog entries.
 * Query: page, limit, actionType, module, userId, from, to, search
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const filter: Record<string, unknown> = {};
    if (searchParams.get('actionType')) filter.actionType = searchParams.get('actionType');
    if (searchParams.get('module'))     filter.module     = searchParams.get('module');
    if (searchParams.get('userId'))     filter.userId     = searchParams.get('userId');
    const from = searchParams.get('from'), to = searchParams.get('to');
    if (from || to) { const r: any = {}; if (from) r.$gte = new Date(from); if (to) r.$lte = new Date(to); filter.timestamp = r; }
    const search = searchParams.get('search');
    if (search) filter.$or = [
      { description: { $regex: search, $options: 'i' } },
      { name:        { $regex: search, $options: 'i' } },
      { userEmail:   { $regex: search, $options: 'i' } },
      { actionType:  { $regex: search, $options: 'i' } },
    ];

    const [logs, total, actionTypes, modules] = await Promise.all([
      ActivityLog.find(filter).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct('actionType'),
      ActivityLog.distinct('module'),
    ]);

    return NextResponse.json({ success: true, logs, pagination: { total, page, limit, pages: Math.ceil(total / limit) }, meta: { actionTypes, modules } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
