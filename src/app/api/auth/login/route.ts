import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, Workspace, UserSettings } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/require-auth';
import bcrypt from 'bcryptjs';

// Helper: load session timeout preference (minutes) for a user
async function getUserSessionTimeout(userId: string): Promise<number | undefined> {
  try {
    const settings = await UserSettings.findOne({ userId }).select('sessionTimeout').lean() as any;
    if (settings?.sessionTimeout) {
      const mins = parseInt(settings.sessionTimeout, 10);
      return isNaN(mins) ? undefined : mins;
    }
  } catch { /* fall back to default */ }
  return undefined;
}

// Force dynamic rendering — this route must never be statically pre-rendered.
// Without this, Next.js build tries to collect route data at build time,
// which runs module-scope code before env vars are available.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  try {
    const body = await req.json();
    const { password, userId, twoFactorToken } = body;
    const email = (body.email || '').toLowerCase().trim();

    // ── 2FA Token Verification ─────────────────────────────────────────────
    if (userId && twoFactorToken) {
      await connectDB();
      const user = await User.findById(userId);
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json({ success: false, error: 'Invalid 2FA request.' }, { status: 400 });
      }

      const { verifyToken } = await import('@/lib/totp');
      const isValid = verifyToken(user.twoFactorSecret, twoFactorToken);
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'Invalid verification code.' }, { status: 400 });
      }

      // Complete login
      user.lastLogin = new Date();
      await user.save();

      // Enterprise Audit Log
      try {
        const { logAudit } = await import('@/lib/audit');
        await logAudit({
          action: 'login',
          module: 'Authentication',
          entityId: user._id.toString(),
          entityType: 'User',
          newValue: { email: user.email, twoFactorEnabled: true, lastLogin: user.lastLogin },
          session: {
            sub: user._id.toString(),
            name: user.name,
            role: user.role,
            workspaceId: user.workspaceId?.toString() || 'ops-main',
          },
          req,
        });
      } catch (err: any) {
        console.error('[AuditLog] Login 2FA audit log failed:', err.message);
      }

      // Log activity
      await logActivity({
        userId: user._id,
        actionType: 'login',
        module: 'Authentication',
        description: `User ${user.email} logged in with Two-Factor Authentication.`,
        req
      });

      // Read session timeout preference
      const timeoutMins = await getUserSessionTimeout(String(user._id));
      const maxAgeSec   = timeoutMins ? timeoutMins * 60 : undefined;

      // Issue JWT session cookie
      const token = await createSessionToken({
        sub: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      }, timeoutMins);

      const res = NextResponse.json({
        success: true,
        user: {
          id: String(user._id),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
      setSessionCookie(res, token, maxAgeSec);
      return res;
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // ── Rate limiting (per IP + per email) ─────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const ipKey    = `login:ip:${ip}`;
    const emailKey = `login:email:${email}`;

    const ipLimit    = await checkRateLimit(ipKey);
    const emailLimit = await checkRateLimit(emailKey);

    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many attempts. Try again in ${Math.ceil((ipLimit.retryAfterSeconds ?? 0) / 60)} minute(s).`,
        },
        { status: 429 }
      );
    }
    if (!emailLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Account temporarily locked. Try again in ${Math.ceil((emailLimit.retryAfterSeconds ?? 0) / 60)} minute(s).`,
        },
        { status: 429 }
      );
    }

    await connectDB();

    // ── Find user ──────────────────────────────────────────────────────────
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    if (user.suspended) {
      return NextResponse.json({ success: false, error: 'Your account has been suspended. Please contact administration.' }, { status: 403 });
    }

    // ── Verify password ────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ success: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    // ── Reset rate limit on success ────────────────────────────────────────
    await resetRateLimit(ipKey);
    await resetRateLimit(emailKey);

    // ── Challenge for 2FA if enabled ────────────────────────────────────────
    if (user.twoFactorEnabled) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: user._id.toString()
      });
    }

    // ── First-login handling ───────────────────────────────────────────────
    if (user.firstLogin) {
      await sendEmail({
        event: 'welcome',
        to: user.email,
        vars: { name: user.name, role: user.role },
      }).catch(console.error);

      await sendEmail({
        event: 'admin_user_signup',
        to: process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'admin@ops.com',
        vars: { name: user.name, email: user.email, role: user.role },
      }).catch(console.error);

      await logActivity({
        userId: user._id,
        actionType: 'first_login',
        module: 'Authentication',
        description: `User logged in for the first time as ${user.role}`,
        req,
      });

      user.firstLogin = false;
    }

    // ── Ensure workspace assignment for the logged-in user ──────────────────
    if (!user.workspaceId) {
      let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
      if (!mainWs) {
        mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });
      }
      user.workspaceId = mainWs._id;
    }

    user.lastLogin = new Date();
    await user.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'login',
        module: 'Authentication',
        entityId: user._id.toString(),
        entityType: 'User',
        newValue: { email: user.email, lastLogin: user.lastLogin },
        session: {
          sub: user._id.toString(),
          name: user.name,
          role: user.role,
          workspaceId: user.workspaceId?.toString() || 'ops-main',
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Standard login audit log failed:', err.message);
    }

    // ── Log activity (this also triggers sendDualNotification via activity.ts) ──
    await logActivity({
      userId: user._id,
      actionType: 'login',
      module: 'Authentication',
      description: `User ${user.email} logged in as ${user.role} from ${req.headers.get('x-forwarded-for') || 'unknown IP'}`,
      req,
    });

    // ── Issue JWT and set HTTP-only cookie ─────────────────────────────────
    const timeoutMins = await getUserSessionTimeout(String(user._id));
    const maxAgeSec   = timeoutMins ? timeoutMins * 60 : undefined;

    const token = await createSessionToken({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    }, timeoutMins);

    const res = NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    setSessionCookie(res, token, maxAgeSec);
    return res;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
