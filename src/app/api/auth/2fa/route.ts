import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { generateSecret, verifyToken } from '@/lib/totp';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

// GET twoFactor status or generate secret
export async function GET(req: NextRequest) {
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
export async function POST(req: NextRequest) {
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
export async function DELETE(req: NextRequest) {
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
