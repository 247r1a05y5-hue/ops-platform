import { NextRequest, NextResponse } from 'next/server';
import { checkBrevoHealth } from '@/lib/email';
import { requireAuth } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  const health = await checkBrevoHealth();
  return NextResponse.json({
    status: 'SMTP has been replaced with the official Brevo Transactional Email REST API.',
    brevoHealth: health,
  });
}
