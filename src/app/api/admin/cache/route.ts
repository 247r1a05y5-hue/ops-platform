import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { logActivity } from '@/lib/activity';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin']);
  if (error) return error;

  try {
    // Revalidate app root layout to purge cache
    revalidatePath('/', 'layout');

    // Log the action to the activity audit trail
    await logActivity({
      userId: session.sub,
      actionType: 'cache_clear',
      module: 'SystemAdmin',
      description: 'System cache manually cleared by administrator',
      req
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'System cache cleared successfully.',
      clearedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
