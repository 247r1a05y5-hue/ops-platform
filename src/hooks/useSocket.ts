/**
 * hooks/useSocket.ts
 *
 * Drop-in replacement for the old SSE-based realtime connection.
 *
 * Features:
 *   - Single Socket.io connection per browser (shared across all components)
 *   - Automatic reconnection with exponential backoff (built into socket.io-client)
 *   - Heartbeat sent every 15 s to keep presence alive
 *   - Visibility + online event handling to reconnect after network loss
 *   - Emits typed events that the server echoes as 'chat_event'
 *   - Returns a stable `socket` ref + `connected` state
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

// Module-level singleton — one connection regardless of how many times
// useSocket() is called in the component tree.
let _sharedSocket: Socket | null = null;
let _refCount = 0;

function getSharedSocket(): Socket {
  if (!_sharedSocket || _sharedSocket.disconnected) {
    _sharedSocket = io({
      path: '/api/socketio',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: Infinity,
      timeout: 20_000,
      withCredentials: true,
      // Auth token will be set via auth option after first connect
      // Cookie-based auth is handled server-side automatically
    });
  }
  return _sharedSocket;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const hbRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    _refCount++;
    const socket = getSharedSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    // If already connected, set state immediately
    if (socket.connected) setConnected(true);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Heartbeat — keeps server-side presence TTL alive
    const sendHB = () => {
      if (socket.connected) socket.emit('heartbeat');
    };
    sendHB(); // fire immediately
    hbRef.current = setInterval(sendHB, 15_000);

    // Re-connect when tab becomes visible after being hidden
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        else sendHB(); // still connected — just refresh presence
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Re-connect when network comes back
    const onOnline = () => {
      if (!socket.connected) socket.connect();
    };
    window.addEventListener('online', onOnline);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      if (hbRef.current) clearInterval(hbRef.current);

      _refCount--;
      // Disconnect the shared socket only when no component is using it
      if (_refCount <= 0 && _sharedSocket) {
        _sharedSocket.disconnect();
        _sharedSocket = null;
        _refCount = 0;
      }
    };
  }, []);

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
    type: 'ring' | 'answer' | 'ice' | 'reject' | 'hangup';
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
