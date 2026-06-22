'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;       // DB role: Admin | Manager | Staff | User
  displayRole: string; // Human-readable: Admin | Manager | Employee | Marketing Representative
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, twoFactorToken?: string, userId?: string) => Promise<{ success: boolean; requires2FA?: boolean; userId?: string; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ─── DB → Display Role map (mirrors server) ──────────────────────────────────

const DB_TO_DISPLAY: Record<string, string> = {
  Admin:    'Admin',
  Manager:  'Manager',
  Staff:    'Employee',
  Employee: 'Employee',
  User:     'Marketing Representative',
  MR:       'Marketing Representative',
};

const DB_TO_ROUTE: Record<string, string> = {
  Admin:    '/dashboard',
  Manager:  '/manager',
  Staff:    '/employee',
  Employee: '/employee',   // alias for Staff in UI
  User:     '/mr',         // Marketing Representative (legacy 'User' role → Media Desk)
  MR:       '/mr',         // Marketing Representative
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ── Restore session on mount / page refresh ──────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser({
            ...data.user,
            displayRole: DB_TO_DISPLAY[data.user.role] ?? data.user.role,
          });
          return;
        }
      }
    } catch {
      // Network error — treat as unauthenticated
    }
    setUser(null);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string, twoFactorToken?: string, userId?: string) => {
    try {
      const body: any = {};
      if (userId && twoFactorToken) {
        body.userId = userId;
        body.twoFactorToken = twoFactorToken;
      } else {
        body.email = email;
        body.password = password;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        return { success: false, error: data.error ?? 'Authentication failed' };
      }

      if (data.requires2FA) {
        return { success: true, requires2FA: true, userId: data.userId };
      }

      const u = data.user;
      setUser({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        displayRole: DB_TO_DISPLAY[u.role] ?? u.role,
      });

      const route = DB_TO_ROUTE[u.role] ?? '/dashboard';
      router.push(route);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection error. Please try again.',
      };
    }
  }, [router]);

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Continue regardless of network error
    } finally {
      setUser(null);
      router.push('/landing');
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─── Convenience exports ──────────────────────────────────────────────────────

export { DB_TO_DISPLAY, DB_TO_ROUTE };
