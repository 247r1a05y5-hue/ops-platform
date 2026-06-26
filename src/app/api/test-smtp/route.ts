import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || '587';
  const port = parseInt(portStr);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const sender = process.env.SENDER_EMAIL || user || 'admin@ops.com';
  const recipient = process.env.ADMIN_EMAIL || sender;

  if (!host || !user || !pass) {
    return NextResponse.json({
      success: false,
      error: 'SMTP environment variables are incomplete.',
      env: {
        host: host ? 'set' : 'missing',
        port: portStr,
        user: user ? 'set' : 'missing',
        pass: pass ? 'set' : 'missing',
        sender,
        recipient,
      }
    }, { status: 400 });
  }

  const diagnostics: any = {
    step: 'initialization',
    env: {
      host,
      port,
      user: user.substring(0, 3) + '***',
      sender,
      recipient,
    }
  };

  try {
    const isSecure = port === 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      family: 4,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      requireTLS: !isSecure,
      tls: {
        servername: 'smtp-relay.brevo.com',
        rejectUnauthorized: true,
      },
      logger: true,
      debug: true,
    } as any);

    diagnostics.step = 'sendMail';
    const info = await transporter.sendMail({
      from: `"SMTP Diagnostics" <${sender}>`,
      to: recipient,
      subject: `SMTP Test Diagnostics — ${new Date().toISOString()}`,
      text: 'This is a minimal plain-text SMTP delivery test bypassing all application layers (DB, templates, logs).',
    });

    diagnostics.step = 'success';
    return NextResponse.json({
      success: true,
      diagnostics,
      info,
    });

  } catch (error: any) {
    console.error('[test-smtp] SMTP Diagnostic Failure:', error);
    return NextResponse.json({
      success: false,
      diagnostics,
      error: {
        message: error?.message,
        code: error?.code,
        command: error?.command,
        response: error?.response,
        responseCode: error?.responseCode,
        address: error?.address,
        port: error?.port,
        syscall: error?.syscall,
        errno: error?.errno,
        stack: error?.stack,
      }
    }, { status: 502 });
  }
}
