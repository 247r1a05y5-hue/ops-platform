import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { connectDB, User, UserSettings } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/settings — return profile + notif prefs for the current user
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const [user, settings] = await Promise.all([
      User.findById(session.sub).select('-password -passwordResetToken -passwordResetExpiry').lean(),
      UserSettings.findOne({ userId: session.sub }).lean(),
    ]);

    if (!user) return NextResponse.json({ success: false, error: 'User not found.' }, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });

    return NextResponse.json({
      success: true,
      profile: user,
      notifSettings: (settings as any)?.notifSettings ?? {},
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  }
}

// PUT /api/settings — update profile, password, or notif prefs
export async function PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { action } = body;

    // ── Profile update ────────────────────────────────────────────────────
    if (!action || action === 'profile') {
      const { name, email } = body;

      if (name !== undefined && typeof name === 'string' && name.trim().length < 2) {
        return NextResponse.json({ success: false, error: 'Name must be at least 2 characters.' }, { status: 400 });
      }
      if (email !== undefined) {
        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRx.test(email)) {
          return NextResponse.json({ success: false, error: 'Invalid email address.' }, { status: 400 });
        }
        // Check email uniqueness (exclude self)
        const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: session.sub } });
        if (existing) {
          return NextResponse.json({ success: false, error: 'Email already in use.' }, { status: 409 });
        }
      }

      const update: Record<string, string> = {};
      if (name?.trim())  update.name  = name.trim();
      if (email?.trim()) update.email = email.toLowerCase().trim();

      const user = await User.findByIdAndUpdate(session.sub, update, { new: true })
        .select('-password -passwordResetToken -passwordResetExpiry');
      if (!user) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });

      // Re-issue JWT if name or email changed (keeps session consistent)
      const res = NextResponse.json({ success: true, profile: user, message: 'Profile updated.' });
      if (update.name || update.email) {
        const token = await createSessionToken({
          sub:   session.sub,
          email: (user as any).email,
          name:  (user as any).name,
          role:  session.role,
        });
        setSessionCookie(res, token);
      }
      return res;
    }

    // ── Password change ───────────────────────────────────────────────────
    if (action === 'password') {
      const { currentPass, newPass } = body;

      if (!currentPass || !newPass) {
        return NextResponse.json({ success: false, error: 'currentPass and newPass are required.' }, { status: 400 });
      }
      if (typeof newPass !== 'string' || newPass.length < 8) {
        return NextResponse.json({ success: false, error: 'New password must be at least 8 characters.' }, { status: 400 });
      }

      const user = await User.findById(session.sub);
      if (!user) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 });

      const match = await bcrypt.compare(currentPass, user.password);
      if (!match) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 400 });
      }

      user.password = await bcrypt.hash(newPass, 12);
      await user.save();

      return NextResponse.json({ success: true, message: 'Password updated successfully.' });
    }

    // ── Notification preferences ──────────────────────────────────────────
    if (action === 'notifications') {
      const { notifSettings } = body;
      if (!notifSettings || typeof notifSettings !== 'object') {
        return NextResponse.json({ success: false, error: 'notifSettings object is required.' }, { status: 400 });
      }

      await UserSettings.findOneAndUpdate(
        { userId: session.sub },
        { userId: session.sub, notifSettings, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      return NextResponse.json({ success: true, message: 'Notification preferences saved.' });
    }

    // ── Security settings (session timeout) ───────────────────────────────
    if (action === 'security') {
      const { sessionTimeout } = body;
      const validTimeouts = ['15', '30', '60', '120'];
      if (!sessionTimeout || !validTimeouts.includes(String(sessionTimeout))) {
        return NextResponse.json({ success: false, error: 'Invalid session timeout. Valid values: 15, 30, 60, 120.' }, { status: 400 });
      }

      await UserSettings.findOneAndUpdate(
        { userId: session.sub },
        { userId: session.sub, sessionTimeout: String(sessionTimeout), updatedAt: new Date() },
        { upsert: true, new: true }
      );

      // Re-issue JWT with the new timeout so it takes effect from the next login
      // (current session is unaffected by design — the user must log out and back in)
      return NextResponse.json({ success: true, message: `Session timeout updated to ${sessionTimeout} minutes. Changes take effect on your next login.` });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
