import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { connectDB, SystemConfig } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

// GET maintenance mode status (publicly queryable)
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const config = await SystemConfig.findOne({ key: 'maintenance_mode' });
    const isEnabled = config ? !!config.value : false;
    return NextResponse.json({ success: true, enabled: isEnabled });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST toggle maintenance mode status (admin only)
export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    const { enabled } = await req.json();
    if (enabled === undefined) {
      return NextResponse.json({ success: false, error: 'enabled boolean is required.' }, { status: 400 });
    }

    await connectDB();
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'maintenance_mode' },
      { value: !!enabled, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    // Log the toggle event
    await logActivity({
      userId: session.sub,
      actionType: 'maintenance_mode_toggle',
      module: 'SystemAdmin',
      description: `Maintenance mode turned ${!!enabled ? 'ON' : 'OFF'}`,
      req
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      enabled: !!enabled,
      message: `Maintenance mode has been turned ${!!enabled ? 'ON' : 'OFF'}`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
