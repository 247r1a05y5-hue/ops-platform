/**
 * SocketStatus.tsx — Optional connection indicator
 * Shows a small dot in the UI when Socket.io is disconnected.
 * Import and place this in your layout if you want user-visible feedback.
 */
'use client';
import { useSocket } from '@/hooks/useSocket';

export function SocketStatus() {
  const { connected } = useSocket();
  if (connected) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      background: '#ef4444', color: '#fff',
      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
      boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }}/>
      Reconnecting…
    </div>
  );
}
