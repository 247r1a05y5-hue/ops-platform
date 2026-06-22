import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, DB_TO_ROUTE, SESSION_COOKIE } from '@/lib/auth';

// ─── Route Policy ─────────────────────────────────────────────────────────────

// Page routes → redirect to /login on failure
const PROTECTED_PAGE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/manager',
  '/employee',
  '/marketing',
  '/mr',
  '/crm',
  '/invoices',
  '/tasks',
  '/analytics',
  '/catalog',
  '/settings',
  '/integrations',
  '/pay',
];

// API routes → return 401/403 JSON on failure
const PROTECTED_API_PREFIXES = [
  '/api/leads',
  '/api/invoices',
  '/api/notifications',
  '/api/documents',
  '/api/export',
  '/api/activity',
  '/api/email',
  '/api/gmail',
  '/api/payment',
  '/api/test-whatsapp',
  '/api/whatsapp',
  '/api/tasks',
  '/api/projects',
  '/api/catalog',
  '/api/analytics',
  '/api/settings',
  '/api/sequences',
];

// Role-based page access
const ROLE_PAGE_MAP: Record<string, string[]> = {
  '/dashboard': ['Admin'],
  '/admin':     ['Admin'],
  '/manager':   ['Admin', 'Manager'],
  '/employee':  ['Admin', 'Manager', 'Staff'],
  '/marketing': ['Admin', 'Manager', 'User', 'MR'],
  '/mr':        ['Admin', 'Manager', 'User', 'MR'],
  '/crm':       ['Admin', 'Manager'],
  '/tasks':     ['Admin', 'Manager'],
  '/analytics': ['Admin', 'Manager'],
  '/settings':  ['Admin', 'Manager'],
};

// Public routes (always accessible)
const PUBLIC_PATHS = new Set([
  '/login', '/landing', '/', '/reset-password',
  '/api/auth/login', '/api/auth/signup', '/api/auth/me',
  '/api/auth/password-reset',
  '/api/payment/webhook',
]);

// ─── Proxy (Next.js 16+ convention) ─────────────────────────────────────────

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|css|js|woff|woff2|ttf)$/)
  ) {
    return NextResponse.next();
  }

  // Always allow maintenance splash page and maintenance status API
  if (
    pathname.startsWith('/api/admin/maintenance') ||
    pathname.startsWith('/maintenance')
  ) {
    return NextResponse.next();
  }

  // ── Maintenance Mode Check ────────────────────────────────────────────────
  // IMPORTANT: Never use fetch() to call our own API from middleware.
  // In Railway/container environments the server cannot HTTP-call itself
  // (causes ECONNREFUSED). Read DB directly with a strict 2-second timeout
  // so Railway health checks are never blocked.
  let maintenanceEnabled = false;
  try {
    const maintenanceCheck = new Promise<boolean>(async (resolve) => {
      try {
        const { connectDB, SystemConfig } = await import('@/lib/db');
        await connectDB();
        const config = await SystemConfig.findOne({ key: 'maintenance_mode' }).lean();
        resolve(config ? !!(config as any).value : false);
      } catch {
        resolve(false); // DB unavailable → treat as maintenance OFF
      }
    });

    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), 2000)
    );

    maintenanceEnabled = await Promise.race([maintenanceCheck, timeout]);
  } catch {
    // Any unexpected error → default maintenance OFF, never crash middleware
    maintenanceEnabled = false;
  }

  if (maintenanceEnabled) {
    // Maintenance is active — check if user is Admin
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    let isAdmin = false;

    if (token) {
      try {
        const { jwtVerify } = await import('jose');
        const key = new TextEncoder().encode(
          process.env.JWT_SECRET ||
          'ops_platform_change_this_to_a_long_random_secret_min_32_chars_acfd4fe2ac7c04ecbd640f445f1cdd7d'
        );
        const { payload } = await jwtVerify(token, key);
        if (payload && payload.role === 'Admin') {
          isAdmin = true;
        }
      } catch {
        // Invalid token — treat as non-admin
      }
    }

    if (!isAdmin) {
      const mUrl = req.nextUrl.clone();
      mUrl.pathname = '/maintenance';
      return NextResponse.redirect(mUrl);
    }
  }

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(p => pathname.startsWith(p));
  const isProtectedApi  = PROTECTED_API_PREFIXES.some(p => pathname.startsWith(p));

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  // ── Verify session ────────────────────────────────────────────────────────
  const session = await getSessionFromRequest(req);

  if (!session) {
    if (isProtectedApi) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return res;
  }

  // ── Role-based page access ────────────────────────────────────────────────
  if (isProtectedPage) {
    const matchedPrefix = Object.keys(ROLE_PAGE_MAP).find(p => pathname.startsWith(p));
    if (matchedPrefix) {
      const allowed = ROLE_PAGE_MAP[matchedPrefix];
      if (!allowed.includes(session.role)) {
        const homeRoute = DB_TO_ROUTE[session.role] ?? '/login';
        return NextResponse.redirect(new URL(homeRoute, req.url));
      }
    }
  }

  // ── Inject user info into request headers for API routes ─────────────────
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-user-id',    session.sub);
  reqHeaders.set('x-user-email', session.email);
  reqHeaders.set('x-user-name',  session.name);
  reqHeaders.set('x-user-role',  session.role);

  return NextResponse.next({ request: { headers: reqHeaders } });
}


// Keep 'middleware' export as alias so older tooling still works
export const middleware = proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
