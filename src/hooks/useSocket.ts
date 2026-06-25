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
  // NEXT_PUBLIC_SOCKET_URL should point to the Railway realtime host in production.
  const socketUrl  = (process.env.NEXT_PUBLIC_SOCKET_URL || '').replace(/\/$/, '') || undefined;
  const token      = getSessionToken();

  const socketOpts = {
    path: '/api/socketio',
    transports: ['websocket', 'polling'] as ['websocket', 'polling'],
    autoConnect: false,         // Prevents automatic connection until auth token is fetched
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    reconnectionAttempts: Infinity,
    timeout: 20_000,
    withCredentials: true,      // send cookies for same-origin auth
    auth: token ? { token } : undefined,  // explicit token for cross-origin auth
  };

  const targetUrl = socketUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  console.log('[CLIENT] socket created', { target: targetUrl });

  console.info('[Socket] connecting to realtime server', {
    target: targetUrl,
    hasToken: Boolean(token),
    transports: socketOpts.transports,
  });

  return io(targetUrl, socketOpts);
}

function getSharedSocket(): Socket {
  if (!_sharedSocket || _sharedSocket.disconnected) {
    _sharedSocket = createSocket();
  }
  return _sharedSocket;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSocket(enabled = true) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const hbRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    _refCount++;
    const socket = getSharedSocket();
    socketRef.current = socket;

    const onConnect = () => {
      console.log('[CLIENT] socket connected', { id: socket.id });
      console.info('[Socket] connected', {
        id: socket.id,
        transport: socket.io?.engine?.transport?.name || 'unknown',
        url: process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin,
      });
      setConnected(true);
    };
    const onDisconnect = (reason: string) => {
      console.warn('[Socket] disconnected', { reason, id: socket.id });
      setConnected(false);
    };

    if (socket.connected) setConnected(true);

    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);

    // Fetch raw token from HTTP endpoint and connect the socket explicitly
    const initSocket = async () => {
      try {
        const res = await fetch('/api/chat/send');
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            socket.auth = { token: data.token };
          }
        }
      } catch (err) {
        console.warn('[Socket] Failed to fetch session token from endpoint, falling back to headers', err);
      }
      if (!socket.connected) {
        socket.connect();
      }
    };
    initSocket();

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
        const socketToDisconnect = _sharedSocket;
        setTimeout(() => {
          if (_refCount <= 0 && _sharedSocket === socketToDisconnect) {
            console.info('[Socket] Disconnecting shared socket (idle)');
            socketToDisconnect.disconnect();
            _sharedSocket = null;
            _refCount = 0;
          }
        }, 2000);
      }
    };
  }, []);

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const joinConversation = useCallback((conversationId: string) => {
    console.log('[CLIENT] room joined', { conversationId });
    socketRef.current?.emit('join_conversation', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('leave_conversation', conversationId);
  }, []);

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  const emitSignal = useCallback((data: {
    type: 'ring' | 'answer' | 'ice' | 'ice_restart' | 'reject' | 'hangup' | 'offer' | 'call-user' | 'incoming-call' | 'accept-call' | 'ice-candidate' | 'end-call';
    targetUserId: string;
    conversationId?: string;
    workspaceId?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('signal', data);
    if (data.type === 'ring') socket.emit('call-user', data);
    if (data.type === 'answer') socket.emit('accept-call', data);
    if (data.type === 'reject' || data.type === 'hangup') socket.emit('end-call', data);
    if (data.type === 'ice' || data.type === 'ice_restart') socket.emit('ice-candidate', data);
    if (data.type === 'offer') socket.emit('offer', data);
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
