import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'ops_session';
const DEFAULT_JWT_EXPIRY = '8h'; // default 8-hour sessions
const DEFAULT_COOKIE_MAX_AGE = 8 * 60 * 60; // seconds

// ─── Secret ──────────────────────────────────────────────────────────────────

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

// ─── Role Normalization ───────────────────────────────────────────────────────
// DB roles: Admin, Manager, Staff, User
// UI roles (login page): Admin, Manager, Employee, Marketing Representative
// Normalized: we store DB roles in JWT and map for display

export const DB_TO_ROUTE: Record<string, string> = {
  Admin:    '/dashboard',
  Manager:  '/manager',
  Staff:    '/employee',
  Employee: '/employee',   // alias for Staff in UI
  User:     '/mr',         // Marketing Representative (legacy 'User' role → Media Desk)
  MR:       '/mr',         // Marketing Representative
};

export const DB_TO_DISPLAY: Record<string, string> = {
  Admin:    'Admin',
  Manager:  'Manager',
  Staff:    'Employee',
  Employee: 'Employee',
  User:     'Marketing Representative',
  MR:       'Marketing Representative',
};

// ─── Token Payload ────────────────────────────────────────────────────────────

export interface SessionPayload {
  sub: string;      // userId
  email: string;
  name: string;
  role: string;     // DB role: Admin | Manager | Staff | User
  iat?: number;
  exp?: number;
}

// ─── Create / Verify ─────────────────────────────────────────────────────────

export async function createSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  expiryMinutes?: number
): Promise<string> {
  const expiry = expiryMinutes ? `${expiryMinutes}m` : DEFAULT_JWT_EXPIRY;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

export function buildSessionCookie(token: string, maxAgeSeconds?: number): string {
  const isProd = process.env.NODE_ENV === 'production';
  const age = maxAgeSeconds ?? DEFAULT_COOKIE_MAX_AGE;
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Path=/`,
    `Max-Age=${age}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds?: number): void {
  res.headers.set('Set-Cookie', buildSessionCookie(token, maxAgeSeconds));
}

export function clearSessionCookie(res: NextResponse): void {
  res.headers.set('Set-Cookie', buildClearCookie());
}

// ─── Get Session From Request ─────────────────────────────────────────────────

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ─── Get Session (Server Component) ──────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
