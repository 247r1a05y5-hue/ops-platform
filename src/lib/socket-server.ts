/**
 * lib/socket-server.ts
 *
 * Singleton Socket.io server — attached to the Next.js HTTP server.
 *
 * Architecture:
 *   - One persistent Socket.io instance per Node.js process (survives HMR)
 *   - Room-based broadcasting: workspace rooms + conversation rooms
 *   - Heartbeat-based presence with 45 s TTL
 *   - Pending signal queue for vid_signal delivery during reconnect windows
 *   - Drop-in replacement for all pushChatSSE / broadcastPresenceChange calls
 *
 * Room naming conventions:
 *   user:{userId}          — user's personal room (all their tabs/devices)
 *   workspace:{workspaceId} — all users in a workspace
 *   conv:{conversationId}   — all participants in a conversation
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { jwtVerify } from 'jose';

// ── Global state (survives Next.js HMR) ──────────────────────────────────────

interface PendingSignal {
  data: object;
  expiresAt: number;
}

declare global {
  var _io:               SocketIOServer | undefined;
  var _presenceLastSeen: Map<string, number> | undefined;
  var _presenceInterval: NodeJS.Timeout | undefined;
  var _pendingSignals:   Map<string, PendingSignal[]> | undefined;
  // userId → workspaceId mapping (populated on socket connect)
  var _userWorkspace:    Map<string, string> | undefined;
}

if (!global._presenceLastSeen) global._presenceLastSeen = new Map();
if (!global._pendingSignals)   global._pendingSignals   = new Map();
if (!global._userWorkspace)    global._userWorkspace    = new Map();

function lastSeen():      Map<string, number>           { return global._presenceLastSeen!; }
function pendingSignals(): Map<string, PendingSignal[]>  { return global._pendingSignals!; }
function userWorkspace():  Map<string, string>           { return global._userWorkspace!; }

const PRESENCE_TTL = 45_000; // 45 s — 3 missed 15 s heartbeats
const SIGNAL_TTL   = 30_000; // 30 s queued signal window

// ── JWT auth helper ───────────────────────────────────────────────────────────

async function verifySocketAuth(token: string): Promise<{ sub: string; name: string; workspaceId?: string } | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload as any;
  } catch {
    return null;
  }
}

// ── Presence helpers ──────────────────────────────────────────────────────────

export function isUserOnline(userId: string): boolean {
  if (!global._io) return false;
  const room = global._io.sockets.adapter.rooms.get(`user:${userId}`);
  if (room && room.size > 0) return true;
  const t = lastSeen().get(userId);
  return !!t && Date.now() - t < PRESENCE_TTL;
}

export function getOnlineUserIds(): string[] {
  const online = new Set<string>();
  if (global._io) {
    for (const [roomName] of global._io.sockets.adapter.rooms) {
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
  if (wasOffline && global._io) {
    broadcastPresenceChange(userId, true);
  }
}

export function forceUserOffline(userId: string) {
  if (isUserOnline(userId)) return; // still has live sockets
  lastSeen().delete(userId);
  broadcastPresenceChange(userId, false);
}

function cleanExpiredPresence() {
  const now = Date.now();
  for (const [userId, ts] of lastSeen().entries()) {
    const hasConn = isUserOnline(userId);
    if (!hasConn && now - ts > PRESENCE_TTL) {
      lastSeen().delete(userId);
      broadcastPresenceChange(userId, false);
    }
  }
  // Clean expired pending signals
  for (const [uid, signals] of pendingSignals().entries()) {
    const live = signals.filter(s => s.expiresAt > now);
    if (live.length === 0) pendingSignals().delete(uid);
    else pendingSignals().set(uid, live);
  }
}

// ── Signal queue ──────────────────────────────────────────────────────────────

export function storePendingSignal(userId: string, data: object) {
  const list = pendingSignals().get(userId) ?? [];
  list.push({ data, expiresAt: Date.now() + SIGNAL_TTL });
  pendingSignals().set(userId, list);
}

function flushPendingSignals(userId: string) {
  const list = pendingSignals().get(userId);
  if (!list || list.length === 0) return;
  pendingSignals().delete(userId);
  const now = Date.now();
  for (const sig of list) {
    if (sig.expiresAt > now) {
      pushToUser(userId, sig.data);
    }
  }
}

// ── Broadcasting helpers ──────────────────────────────────────────────────────

/**
 * Push a payload to ALL sockets for a specific user (all their tabs/devices).
 * Returns true if the user has at least one connected socket.
 */
export function pushToUser(userId: string, data: object): boolean {
  if (!global._io) return false;
  const room = `user:${userId}`;
  const roomObj = global._io.sockets.adapter.rooms.get(room);
  if (!roomObj || roomObj.size === 0) return false;
  global._io.to(room).emit('chat_event', data);
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
  if (!global._io) return;
  const payload = { type: 'presence_change', userId, isOnline };
  const wsId = userWorkspace().get(userId);
  if (wsId) {
    global._io.to(`workspace:${wsId}`).emit('chat_event', payload);
  } else {
    // Fallback: broadcast to all if workspace unknown
    global._io.emit('chat_event', payload);
  }
}

/**
 * Broadcast to all users in a workspace.
 */
export function broadcastToWorkspace(workspaceId: string, data: object, excludeUserId?: string) {
  if (!global._io) return;
  if (excludeUserId) {
    global._io.to(`workspace:${workspaceId}`).except(`user:${excludeUserId}`).emit('chat_event', data);
  } else {
    global._io.to(`workspace:${workspaceId}`).emit('chat_event', data);
  }
}

// Legacy alias — keeps all existing callers (send/route, typing/route, etc.) working
export const pushChatSSE = pushToUser;

// ── Server initialization ─────────────────────────────────────────────────────

export function getIO(): SocketIOServer | null {
  return global._io ?? null;
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  if (global._io) return global._io;

  const io = new SocketIOServer(httpServer, {
    path: '/api/socketio',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout:  20_000,
    pingInterval: 10_000,
    upgradeTimeout: 10_000,
    allowEIO3: true,
  });

  global._io = io;

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      // Token can come from auth handshake or cookie header
      let token: string | undefined = socket.handshake.auth?.token;

      if (!token && socket.handshake.headers.cookie) {
        const match = socket.handshake.headers.cookie.match(/ops_session=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }

      if (!token) return next(new Error('AUTH_REQUIRED'));

      const payload = await verifySocketAuth(token);
      if (!payload) return next(new Error('AUTH_INVALID'));

      (socket as any).userId = payload.sub;
      (socket as any).userName = payload.name;
      (socket as any).workspaceId = payload.workspaceId ?? 'ops-main';
      next();
    } catch (err) {
      next(new Error('AUTH_ERROR'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', async (socket: Socket) => {
    const userId: string      = (socket as any).userId;
    const userName: string    = (socket as any).userName;
    const workspaceId: string = (socket as any).workspaceId ?? 'ops-main';

    // Track user → workspace
    userWorkspace().set(userId, workspaceId);

    // Join personal + workspace rooms
    socket.join(`user:${userId}`);
    socket.join(`workspace:${workspaceId}`);

    // Mark presence
    const wasOffline = !isUserOnline(userId);
    lastSeen().set(userId, Date.now());

    // Send presence snapshot to this socket
    socket.emit('chat_event', {
      type: 'presence_snapshot',
      onlineUserIds: getOnlineUserIds(),
    });

    // Broadcast this user coming online to their workspace
    if (wasOffline) {
      broadcastPresenceChange(userId, true);
    }

    // Flush any queued signals
    flushPendingSignals(userId);

    // ── Client events ──────────────────────────────────────────────────────

    /** Join a conversation room for targeted message delivery */
    socket.on('join_conversation', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId.length > 0) {
        socket.join(`conv:${conversationId}`);
      }
    });

    /** Leave a conversation room */
    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conv:${conversationId}`);
    });

    /** Heartbeat — keeps presence TTL alive */
    socket.on('heartbeat', () => {
      lastSeen().set(userId, Date.now());
      socket.emit('heartbeat_ack');
    });

    /** Typing indicator — server relays to conversation room excluding sender */
    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      if (!data?.conversationId) return;
      socket.to(`conv:${data.conversationId}`).emit('chat_event', {
        type: 'typing',
        conversationId: data.conversationId,
        userId,
        name: userName,
        isTyping: !!data.isTyping,
      });
    });

    /** Jitsi calling signaling relay */
    socket.on('signal', (data: {
      type: 'ring' | 'answer' | 'reject' | 'hangup';
      targetUserId: string;
      conversationId?: string;
      workspaceId?: string;
    }) => {
      if (!data?.type || !data?.targetUserId) return;

      const payload = {
        type: 'vid_signal',
        subtype: data.type,
        from: userId,
        fromName: userName,
        conversationId: data.conversationId ?? null,
        workspaceId: data.workspaceId ?? null,
      };

      const delivered = pushToUser(data.targetUserId, payload);

      if (!delivered) {
        storePendingSignal(data.targetUserId, payload);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      // Wait for other sockets of this user before declaring offline
      // Socket.io handles room cleanup automatically
      setTimeout(() => {
        const room = io.sockets.adapter.rooms.get(`user:${userId}`);
        const stillConnected = room && room.size > 0;
        if (!stillConnected) {
          // Don't instantly broadcast offline — let TTL handle brief reconnects
          // But update lastSeen so the TTL can expire naturally
          // For instant-offline behavior, call forceUserOffline(userId)
        }
      }, 5_000); // 5 s grace period for tab reloads
    });
  });

  // ── Presence cleanup interval ──────────────────────────────────────────────
  if (!global._presenceInterval) {
    const iv = setInterval(cleanExpiredPresence, 15_000);
    if (typeof iv.unref === 'function') iv.unref();
    global._presenceInterval = iv;
  }

  console.log('[Socket.io] Server initialized on /api/socketio');
  return io;
}
