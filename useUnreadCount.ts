'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * useUnreadCount — v2 (production-grade fix)
 *
 * ROOT CAUSE FIXED: The previous version opened its own EventSource to
 * /api/chat/stream, creating 2-3 SSE connections per user per page (one from
 * ChatModule, one from Sidebar/EmployeeSidebar via this hook). Multiple dead
 * controllers in global._chatClients caused silent message drops.
 *
 * NEW APPROACH:
 *   1. ChatModule (the authoritative SSE owner) broadcasts unread updates via
 *      BroadcastChannel('chat_unread') to all same-origin tabs.
 *   2. This hook listens on that BroadcastChannel for instant badge updates.
 *   3. A polling fallback (20 s) keeps the count accurate even when ChatModule
 *      is not mounted (e.g. user is on a non-chat page).
 *   4. No second EventSource is opened — zero SSE connection duplication.
 */

const POLL_MS = 20_000;
const CHANNEL = 'chat_unread';

export function useUnreadCount() {
  const [unread, setUnread] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnread = async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) setUnread(data.totalUnread ?? 0);
    } catch (_) {}
  };

  useEffect(() => {
    // Initial load
    fetchUnread();

    // BroadcastChannel listener — ChatModule posts here on every SSE event that
    // changes the unread count
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => {
        // Full replacement: { totalUnread: number }
        if (typeof e.data?.totalUnread === 'number') {
          setUnread(e.data.totalUnread);
        }
        // Increment: { delta: +1 | -N }
        if (typeof e.data?.delta === 'number') {
          setUnread(prev => Math.max(0, prev + e.data.delta));
        }
      };
    } catch (_) {
      // BroadcastChannel not available (older Safari, some test envs)
      // Polling fallback will cover it
    }

    // Polling fallback — covers pages where ChatModule is not mounted
    pollRef.current = setInterval(fetchUnread, POLL_MS);

    // Re-fetch when tab becomes visible (covers stale counts after tab switch)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchUnread();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (bc) bc.close();
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return unread;
}
