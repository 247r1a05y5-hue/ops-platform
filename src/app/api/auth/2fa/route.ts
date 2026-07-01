import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { generateSecret, verifyToken } from '@/lib/totp';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

// GET twoFactor status or generate secret
async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const user = await User.findById(session.sub).select('twoFactorEnabled twoFactorSecret');
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json({ success: true, enabled: true });
    }

    // Generate new secret for setup
    const { secret, qrCodeUrl } = generateSecret(session.email);

    return NextResponse.json({
      success: true,
      enabled: false,
      secret,
      qrCodeUrl
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST verify and enable twoFactor
async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    const { token, secret } = await req.json();
    if (!token || !secret) {
      return NextResponse.json({ success: false, error: 'Token and Secret are required.' }, { status: 400 });
    }

    // Verify token matches secret
    const isValid = verifyToken(secret, token);
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid verification code. Please try again.' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(session.sub);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    user.twoFactorEnabled = true;
    user.twoFactorSecret = secret;
    await user.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'two_factor_enabled',
        module: 'Authentication',
        entityId: session.sub,
        entityType: 'User',
        newValue: { twoFactorEnabled: true },
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Enable 2FA audit log failed:', err.message);
    }

    await logActivity({
      userId: session.sub,
      actionType: 'profile_update',
      module: 'Authentication',
      description: 'Two-Factor Authentication (2FA) enabled successfully.',
      req
    }).catch(console.error);

    return NextResponse.json({ success: true, message: 'Two-Factor Authentication has been enabled.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE disable twoFactor
async function _DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const user = await User.findById(session.sub);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'two_factor_disabled',
        module: 'Authentication',
        entityId: session.sub,
        entityType: 'User',
        oldValue: { twoFactorEnabled: true },
        newValue: { twoFactorEnabled: false },
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Disable 2FA audit log failed:', err.message);
    }

    await logActivity({
      userId: session.sub,
      actionType: 'profile_update',
      module: 'Authentication',
      description: 'Two-Factor Authentication (2FA) disabled.',
      req
    }).catch(console.error);

    return NextResponse.json({ success: true, message: 'Two-Factor Authentication has been disabled.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
export const DELETE = withLogging(_DELETE);
