import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, SessionPayload } from './auth';

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Call at the top of any API route handler.
// Returns { session } on success, or a NextResponse (401/403) to return immediately.

type RequireAuthResult =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse };

// Cache suspension checks for 15 seconds to prevent hammering the DB during concurrent API loads
const suspensionCache = new Map<string, { suspended: boolean; expiresAt: number }>();
const SUSPENSION_CACHE_TTL = 15000;

export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<RequireAuthResult> {
  const session = await getSessionFromRequest(req);

  if (!session) {
    return {
      session: null,
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  // Instantly enforce account suspension by checking DB status with short-lived cache
  try {
    const cachedEntry = suspensionCache.get(session.sub);
    const now = Date.now();
    let isSuspended = false;

    if (cachedEntry && cachedEntry.expiresAt > now) {
      isSuspended = cachedEntry.suspended;
    } else {
      const { connectDB, User } = await import('./db');
      await connectDB();
      const user = await User.findById(session.sub).select('suspended').lean() as any;
      isSuspended = !user || !!user.suspended;
      suspensionCache.set(session.sub, {
        suspended: isSuspended,
        expiresAt: now + SUSPENSION_CACHE_TTL
      });
    }

    if (isSuspended) {
      return {
        session: null,
        error: NextResponse.json(
          { success: false, error: 'Your account has been suspended or deactivated.' },
          { status: 403 }
        ),
      };
    }
  } catch (err) {
    console.error('[requireAuth] Suspended check failed:', err);
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return {
      session: null,
      error: NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      ),
    };
  }

  return { session, error: null };
}

// ─── CSRF / Origin Check ─────────────────────────────────────────────────────
// For state-changing endpoints (POST/PUT/DELETE) with cookie auth,
// verify the Origin or Referer header matches the host,
// OR the request includes our custom x-csrf-token header (double-submit pattern).

export function checkOrigin(req: NextRequest): boolean {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  // Custom header present → request came from our JS code (not a cross-site form)
  const csrfHeader = req.headers.get('x-csrf-token');
  if (csrfHeader && csrfHeader.length > 0) return true;

  const origin  = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host    = req.headers.get('host');

  if (!host) return true; // Can't check without host

  const allowed = [`http://${host}`, `https://${host}`];

  if (origin)  return allowed.some(a => origin.startsWith(a));
  if (referer) return allowed.some(a => referer.startsWith(a));

  // No origin/referer - allow in dev, block in prod
  return process.env.NODE_ENV !== 'production';
}

export function csrfCheck(req: NextRequest): NextResponse | null {
  if (!checkOrigin(req)) {
    return NextResponse.json(
      { success: false, error: 'CSRF check failed' },
      { status: 403 }
    );
  }
  return null;
}


// ─── Cron Authentication ─────────────────────────────────────────────────────
// Enforce CRON_SECRET Bearer token validation for cron endpoints.
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret || cronSecret.trim() === '') {
      console.error('[Cron Auth] CRON_SECRET is not configured in production. Rejecting cron request.');
      return NextResponse.json(
        { success: false, error: 'Cron secret is not configured on server.' },
        { status: 500 }
      );
    }
    const expectedHeader = `Bearer ${cronSecret}`;
    if (!authHeader || authHeader !== expectedHeader) {
      console.warn('[Cron Auth] Unauthorized cron request attempt in production.');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  } else {
    // Local development: enforce check if CRON_SECRET is defined and not using default placeholders
    if (cronSecret && cronSecret.trim() !== '') {
      const expectedHeader = `Bearer ${cronSecret}`;
      if (!authHeader || authHeader !== expectedHeader) {
        console.warn('[Cron Auth] Unauthorized cron request in local development.');
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      console.warn('[Cron Auth] CRON_SECRET is missing. Bypassing cron auth check in local development.');
    }
  }

  return null;
}
