'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword]   = useState('');
  const [show, setShow]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [message, setMessage]     = useState<{ text: string; ok: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setMessage({ text: 'Password must be at least 8 characters.', ok: false }); return; }
    setLoading(true);
    setMessage(null);
    try {
      const res  = await fetch('/api/auth/password-reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword: password }),
      });
      const data = await res.json();
      setMessage({ text: data.message || data.error, ok: data.success });
      if (data.success) setTimeout(() => router.push('/login'), 2000);
    } catch {
      setMessage({ text: 'Connection error. Please try again.', ok: false });
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div style={{ textAlign: 'center', color: '#991b1b', padding: 40 }}>
        Invalid or missing reset link. <Link href="/login" style={{ color: '#4f46e5' }}>Return to login</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e1b4b', marginBottom: 8, textAlign: 'center' }}>Set New Password</h1>
      <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
        Resetting password for <strong>{email}</strong>
      </p>

      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 13, fontWeight: 600, textAlign: 'center',
          background: message.ok ? '#ecfdf5' : '#fef2f2',
          color:      message.ok ? '#065f46' : '#991b1b',
          border:     `1px solid ${message.ok ? '#10b981' : '#ef4444'}`,
        }}>
          {message.text}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Lock size={16} color="#9ca3af" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type={show ? 'text' : 'password'}
          required minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
          style={{ width: '100%', boxSizing: 'border-box', padding: '13px 44px 13px 42px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none' }}
        />
        <button type="button" onClick={() => setShow(!show)}
          style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {show ? <EyeOff size={16} color="#9ca3af" /> : <Eye size={16} color="#9ca3af" />}
        </button>
      </div>

      <button type="submit" disabled={loading} style={{
        width: '100%', padding: '13px 0', background: 'linear-gradient(135deg, #3730a3, #4f46e5)',
        color: 'white', fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
      }}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update Password'}
      </button>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
        <Link href="/login" style={{ color: '#4f46e5', fontWeight: 600 }}>Back to login</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #dde0f7 0%, #e8eaf6 40%, #cfd2ee 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #3730a3, #4f46e5)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={22} color="white" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1e1b4b' }}>Ops Platform</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Password Reset</div>
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 24, padding: '40px 44px', width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(79,70,229,0.12)' }}>
        <Suspense fallback={<div style={{ textAlign: 'center', color: '#6b7280' }}>Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
