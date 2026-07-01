import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { connectDB, User } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { csrfCheck } from '@/lib/require-auth';
import { checkRateLimit } from '@/lib/rate-limit';

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

// ─── POST /api/auth/password-reset — Request reset link ──────────────────────
async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  // Rate limiting - prevent spam reset requests (per IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const rl = await checkRateLimit(`password-reset-post:ip:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: `Too many password reset requests. Try again in ${Math.ceil((rl.retryAfterSeconds ?? 300) / 60)} minute(s).` },
      { status: 429 }
    );
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required.' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent user enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
      });
    }

    // Generate a cryptographically random token
    const plainToken   = randomBytes(32).toString('hex');
    const hashedToken  = hashToken(plainToken);
    const expiry       = new Date(Date.now() + TOKEN_EXPIRY_MS);

    user.passwordResetToken  = hashedToken;
    user.passwordResetExpiry = expiry;
    await user.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'password_reset_requested',
        module: 'Authentication',
        entityId: user._id.toString(),
        entityType: 'User',
        newValue: { email: user.email, passwordResetExpiry: expiry },
        session: {
          sub: user._id.toString(),
          name: user.name,
          role: user.role,
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Password reset request audit log failed:', err.message);
    }

    let appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (appUrl.includes('YOUR_RAILWAY_DOMAIN')) {
      const origin = req.headers.get('origin') || req.headers.get('referer');
      if (origin) {
        try {
          appUrl = new URL(origin).origin;
        } catch (_) {
          appUrl = 'http://localhost:3000';
        }
      } else {
        appUrl = 'http://localhost:3000';
      }
    }
    const resetLink = `${appUrl}/reset-password?token=${plainToken}&email=${encodeURIComponent(user.email)}`;

    let emailSent = true;
    await sendEmail({
      event: 'password_reset',
      to: user.email,
      vars: { name: user.name, resetLink },
    }).catch(err => {
      console.error('[PasswordReset] Email send failed:', err.message);
      emailSent = false;
    });

    return NextResponse.json({
      success: true,
      message: 'If that email exists, a reset link has been sent.',
      debugResetLink: resetLink,
      emailSent,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── PUT /api/auth/password-reset — Confirm reset with token ─────────────────
async function _PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  // Rate limiting - prevent brute-forcing reset tokens (per IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const rl = await checkRateLimit(`password-reset-put:ip:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: `Too many password reset attempts. Try again in ${Math.ceil((rl.retryAfterSeconds ?? 300) / 60)} minute(s).` },
      { status: 429 }
    );
  }

  try {
    const { email, token, newPassword } = await req.json();

    if (!email || !token || !newPassword) {
      return NextResponse.json({ success: false, error: 'email, token, and newPassword are required.' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    await connectDB();

    const hashedToken = hashToken(token);
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetToken: hashedToken,
      passwordResetExpiry: { $gt: new Date() }, // not expired
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset token. Please request a new one.' },
        { status: 400 }
      );
    }

    // Update password and clear token fields
    user.password            = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken  = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'password_reset_completed',
        module: 'Authentication',
        entityId: user._id.toString(),
        entityType: 'User',
        newValue: { email: user.email },
        session: {
          sub: user._id.toString(),
          name: user.name,
          role: user.role,
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Password reset completion audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully. Please sign in.' });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
export const PUT = withLogging(_PUT);
