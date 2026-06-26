import { NextRequest, NextResponse } from 'next/server';
import { checkBrevoHealth } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const health = await checkBrevoHealth();
  return NextResponse.json({
    status: 'SMTP has been replaced with the official Brevo Transactional Email REST API.',
    brevoHealth: health,
  });
}
