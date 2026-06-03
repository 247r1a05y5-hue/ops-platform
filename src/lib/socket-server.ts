/**
 * lib/socket-server.ts
 *
 * Helper utilities for broadcasting via Socket.IO from within API routes.
 *
 * IMPORTANT: This file does NOT initialize Socket.IO. Initialization is done
 * exclusively in server.mjs at boot time. This file only reads the instance
 * that server.mjs sets on globalThis.
 *
 * All functions are safe to call even before the first request — they check
 * for the global instance and no-op gracefully if not yet available.
 */

import type { Server as SocketIOServer } from 'socket.io';

// ── Shared state references (all set by server.mjs) ──────────────────────────

// TypeScript declarations so we can access the globals set in server.mjs
declare global {
  var _io:               SocketIOServer | undefined;
  var _socketIO:         SocketIOServer | undefined;  // same instance, legacy name
  var _presenceLastSeen: Map<string, number> | undefined;
  var _presenceInterval: NodeJS.Timeout | undefined;
  var _pendingSignals:   Map<string, { data: object; expiresAt: number }[]> | undefined;
  var _userWorkspace:    Map<string, string> | undefined;
}

const PRESENCE_TTL = 45_000;
const SIGNAL_TTL   = 30_000;

// ── IO accessor ───────────────────────────────────────────────────────────────

/**
 * Returns the Socket.IO server instance, or null if not yet initialized.
 * Checks both global names to handle any code path.
 */
export function getIO(): SocketIOServer | null {
  return global._io ?? global._socketIO ?? null;
}

// State map accessors — read from global maps set by server.mjs
function lastSeen():      Map<string, number>                              { return global._presenceLastSeen ?? new Map(); }
function pendingSignals(): Map<string, { data: object; expiresAt: number }[]> { return global._pendingSignals   ?? new Map(); }
function userWorkspace():  Map<string, string>                             { return global._userWorkspace    ?? new Map(); }

// ── Presence helpers ──────────────────────────────────────────────────────────

export function isUserOnline(userId: string): boolean {
  const io = getIO();
  if (!io) return false;
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (room && room.size > 0) return true;
  const t = lastSeen().get(userId);
  return !!t && Date.now() - t < PRESENCE_TTL;
}

export function getOnlineUserIds(): string[] {
  const io = getIO();
  const online = new Set<string>();
  if (io) {
    for (const [roomName] of io.sockets.adapter.rooms) {
      if (roomName.startsWith('user:')) online.add(roomName.slice(5));
    }
  }
  const now = Date.now();
  for (const [uid, ts] of lastSeen().entries()) {
    if (now - ts < PRESENCE_TTL) online.add(uid);
  }
  return [...online];
}

export function touchUserPresence(userId: string) {
  const wasOffline = !isUserOnline(userId);
  lastSeen().set(userId, Date.now());
  if (wasOffline) broadcastPresenceChange(userId, true);
}

export function forceUserOffline(userId: string) {
  if (isUserOnline(userId)) return; // still has live sockets
  lastSeen().delete(userId);
  broadcastPresenceChange(userId, false);
}

// ── Signal queue ──────────────────────────────────────────────────────────────

export function storePendingSignal(userId: string, data: object) {
  const list = pendingSignals().get(userId) ?? [];
  list.push({ data, expiresAt: Date.now() + SIGNAL_TTL });
  pendingSignals().set(userId, list);
}

// ── Broadcasting helpers ──────────────────────────────────────────────────────

/**
 * Push a payload to ALL sockets for a specific user (all their tabs/devices).
 * Returns true if the user has at least one connected socket.
 */
export function pushToUser(userId: string, data: object): boolean {
  const io = getIO();
  if (!io) return false;
  const room = `user:${userId}`;
  const roomObj = io.sockets.adapter.rooms.get(room);
  if (!roomObj || roomObj.size === 0) return false;
  io.to(room).emit('chat_event', data);
  return true;
}

/**
 * Push to a list of user IDs (e.g. conversation participants).
 */
export function pushToParticipants(
  participantIds: string[],
  data: object,
  excludeUserId?: string,
) {
  for (const uid of participantIds) {
    if (uid !== excludeUserId) pushToUser(uid, data);
  }
}

/**
 * Broadcast a presence change to ALL connected users in the same workspace.
 */
export function broadcastPresenceChange(userId: string, isOnline: boolean) {
  const io = getIO();
  if (!io) return;
  const payload = { type: 'presence_change', userId, isOnline };
  const wsId = userWorkspace().get(userId);
  if (wsId) {
    io.to(`workspace:${wsId}`).emit('chat_event', payload);
  } else {
    io.emit('chat_event', payload);
  }
}

/**
 * Broadcast to all users in a workspace.
 */
export function broadcastToWorkspace(workspaceId: string, data: object, excludeUserId?: string) {
  const io = getIO();
  if (!io) return;
  if (excludeUserId) {
    io.to(`workspace:${workspaceId}`).except(`user:${excludeUserId}`).emit('chat_event', data);
  } else {
    io.to(`workspace:${workspaceId}`).emit('chat_event', data);
  }
}

// Legacy alias — keeps all existing callers (send/route, typing/route, etc.) working
export const pushChatSSE = pushToUser;

// ── initSocketServer is a NO-OP on VPS ───────────────────────────────────────
// Kept for import compatibility only. server.mjs handles initialization.
import type { Server as HTTPServer } from 'http';

export function initSocketServer(httpServer: HTTPServer): SocketIOServer | null {
  const existing = getIO();
  if (existing) {
    console.log('[socket-server] initSocketServer called but Socket.IO already running (server.mjs owns it)');
    return existing;
  }
  console.warn('[socket-server] WARNING: initSocketServer called but no Socket.IO instance found. Did server.mjs start?');
  return null;
}
