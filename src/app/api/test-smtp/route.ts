import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { checkBrevoHealth } from '@/lib/email';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  const health = await checkBrevoHealth();
  return NextResponse.json({
    status: 'SMTP has been replaced with the official Brevo Transactional Email REST API.',
    brevoHealth: health,
  });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
