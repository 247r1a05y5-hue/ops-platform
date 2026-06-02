/**
 * hooks/useSocket.ts
 *
 * Production-ready Socket.io client hook.
 *
 * Connection target:
 *   - If NEXT_PUBLIC_SOCKET_URL is set → connects to that URL (cross-origin, Railway)
 *   - Otherwise → connects to the same origin (combined server, also Railway)
 *
 * Features:
 *   - Single shared Socket.io connection per browser tab (module-level singleton)
 *   - Automatic JWT auth token injection from cookie
 *   - Reconnection with exponential backoff (built-in)
 *   - 15 s heartbeat to keep server-side presence TTL alive
 *   - Visibility + online event reconnect (handles tab switching / network loss)
 *   - Typed emit helpers for conversations, typing, and signaling
 *
 * Usage:
 *   const { socket, connected } = useSocket();
 *   useEffect(() => {
 *     if (!socket) return;
 *     const handler = (data) => { ... };
 *     socket.on('chat_event', handler);
 *     return () => socket.off('chat_event', handler);
 *   }, [socket]);
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// ── Singleton ─────────────────────────────────────────────────────────────────
// One connection per browser regardless of how many components call useSocket().

let _sharedSocket: Socket | null = null;
let _refCount = 0;

/**
 * Read the ops_session JWT from the document cookie so we can pass it
 * as an explicit auth token for cross-origin Socket.io connections.
 * (Cookie-based auth only works automatically for same-origin.)
 */
function getSessionToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/ops_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function createSocket(): Socket {
  // NEXT_PUBLIC_SOCKET_URL can be set to the Railway URL for split deployments,
  // or left empty for combined Railway deployments (same origin).
  const socketUrl  = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  const token      = getSessionToken();

  const socketOpts = {
    path: '/api/socketio',
    transports: ['websocket', 'polling'] as ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    reconnectionAttempts: Infinity,
    timeout: 20_000,
    withCredentials: true,      // send cookies for same-origin auth
    auth: token ? { token } : undefined,  // explicit token for cross-origin auth
  };

  return socketUrl
    ? io(socketUrl, socketOpts)
    : io(socketOpts);            // connect to current origin
}

function getSharedSocket(): Socket {
  if (!_sharedSocket || _sharedSocket.disconnected) {
    _sharedSocket = createSocket();
  }
  return _sharedSocket;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const hbRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    _refCount++;
    const socket = getSharedSocket();
    socketRef.current = socket;

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    if (socket.connected) setConnected(true);

    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);

    // ── Heartbeat ──────────────────────────────────────────────────────────
    const sendHB = () => { if (socket.connected) socket.emit('heartbeat'); };
    sendHB();
    hbRef.current = setInterval(sendHB, 15_000);

    // ── Reconnect on tab visibility ────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        else sendHB();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ── Reconnect on network restore ───────────────────────────────────────
    const onOnline = () => { if (!socket.connected) socket.connect(); };
    window.addEventListener('online', onOnline);

    return () => {
      socket.off('connect',    onConnect);
      socket.off('disconnect', onDisconnect);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      if (hbRef.current) clearInterval(hbRef.current);

      _refCount--;
      if (_refCount <= 0 && _sharedSocket) {
        _sharedSocket.disconnect();
        _sharedSocket = null;
        _refCount = 0;
      }
    };
  }, []);

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('join_conversation', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('leave_conversation', conversationId);
  }, []);

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  const emitSignal = useCallback((data: {
    type: 'ring' | 'answer' | 'ice' | 'ice_restart' | 'reject' | 'hangup';
    targetUserId: string;
    conversationId?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => {
    socketRef.current?.emit('signal', data);
  }, []);

  return {
    socket: socketRef.current,
    connected,
    joinConversation,
    leaveConversation,
    emitTyping,
    emitSignal,
  };
}
