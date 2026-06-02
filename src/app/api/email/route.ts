import { NextRequest, NextResponse } from 'next/server';
import { connectDB, EmailLog } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    const body = await req.json();
    const { event, to, vars } = body;

    await connectDB();

    try {
      const info = await sendEmail({ event, to, vars });
      await EmailLog.create({ event, to, status: 'success', messageId: info.messageId, vars });
      return NextResponse.json({ success: true, messageId: info.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await EmailLog.create({ event, to, status: 'failed', error: message, vars });
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const logs = await EmailLog.find().sort({ sentAt: -1 }).limit(50);
    return NextResponse.json({ success: true, logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
