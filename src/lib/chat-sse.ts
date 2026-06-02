/**
 * lib/chat-sse.ts — COMPATIBILITY SHIM
 *
 * All exports here delegate to socket-server.ts.
 * Kept so existing API routes that import from chat-sse don't need changes.
 */

export {
  pushToUser        as pushChatSSE,
  pushToUser        as default,
  pushToParticipants,
  broadcastPresenceChange,
  broadcastToWorkspace as broadcastToAll,
  isUserOnline,
  getOnlineUserIds,
  touchUserPresence,
  forceUserOffline,
  storePendingSignal,
  // Stubs for old SSE registration (no-ops — Socket.io handles this)
} from '@/lib/socket-server';

// No-ops kept for any remaining callers
export function registerChatSSEClient(_userId: string, _ctrl: any) {}
export function unregisterChatSSEClient(_userId: string, _ctrl: any) {}
