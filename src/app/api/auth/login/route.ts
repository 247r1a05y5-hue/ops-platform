import { NextRequest, NextResponse } from 'next/server';
import { connectDB, User, Workspace } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/require-auth';
import bcrypt from 'bcryptjs';

// Force dynamic rendering — this route must never be statically pre-rendered.
// Without this, Next.js build tries to collect route data at build time,
// which runs module-scope code before env vars are available.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  let email = '';
  try {
    const body = await req.json();
    email = (body.email || '').toLowerCase().trim();
    const { password } = body;

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

    // ── Verify password ────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ success: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    // ── Reset rate limit on success ────────────────────────────────────────
    await resetRateLimit(ipKey);
    await resetRateLimit(emailKey);

    // ── First-login handling ───────────────────────────────────────────────
    if (user.firstLogin) {
      await sendEmail({
        event: 'welcome',
        to: user.email,
        vars: { name: user.name, role: user.role },
      }).catch(console.error);

      await sendEmail({
        event: 'admin_user_signup',
        to: process.env.ADMIN_EMAIL || 'admin@ops.com',
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

    // ── Ensure workspace assignment for ALL users ──────────────────────────
    let mainWs = await (Workspace as any).findOne({ slug: 'ops-main' });
    if (!mainWs) {
      mainWs = await (Workspace as any).create({ name: 'Main Workspace', slug: 'ops-main' });
    }
    // Bulk-assign any users not yet in this workspace (idempotent)
    await User.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }, { workspaceId: { $ne: mainWs._id } }] },
      { $set: { workspaceId: mainWs._id } }
    );

    user.lastLogin = new Date();
    await user.save();

    // ── Log activity (this also triggers sendDualNotification via activity.ts) ──
    await logActivity({
      userId: user._id,
      actionType: 'login',
      module: 'Authentication',
      description: `User ${user.email} logged in as ${user.role} from ${req.headers.get('x-forwarded-for') || 'unknown IP'}`,
      req,
    });

    // ── Issue JWT and set HTTP-only cookie ─────────────────────────────────
    const token = await createSessionToken({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    setSessionCookie(res, token);
    return res;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
