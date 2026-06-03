/**
 * server.mjs  — PRODUCTION ENTRY POINT
 *
 * Single-VPS architecture: Next.js + Socket.IO in one Node.js process.
 *
 * USAGE:
 *   node server.mjs          (production)
 *   node server.mjs --dev    (development — wraps next dev)
 *
 * package.json scripts:
 *   "dev":   "node server.mjs --dev"
 *   "start": "node server.mjs"
 *
 * This is the ONLY place Socket.IO is initialized.
 * It sets BOTH globalThis._socketIO and globalThis._io so that
 * all API routes and lib/socket-server.ts see the same instance.
 */

import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { jwtVerify } from 'jose';

const dev  = process.argv.includes('--dev');
const port = parseInt(process.env.PORT ?? '3000', 10);

// ── Next.js app ───────────────────────────────────────────────────────────────

const app    = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

await app.prepare();

// ── HTTP Server ───────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? '/', true);
  handle(req, res, parsedUrl);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  path: '/api/socketio',
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout:    20_000,
  pingInterval:   10_000,
  upgradeTimeout: 10_000,
  allowEIO3: true,
});

// ── Global state ──────────────────────────────────────────────────────────────
// Keep both _socketIO (legacy) and _io (socket-server.ts) pointing at the same instance.

const presenceLastSeen = new Map(); // userId → timestamp
const pendingSignals   = new Map(); // userId → [{data, expiresAt}]
const userWorkspace    = new Map(); // userId → workspaceId

const PRESENCE_TTL = 45_000;
const SIGNAL_TTL   = 30_000;

// Set ALL globals so every import path works
globalThis._socketIO         = io;   // used by send/typing/read/signal routes directly
globalThis._io               = io;   // used by lib/socket-server.ts helpers
globalThis._presenceLastSeen = presenceLastSeen;
globalThis._pendingSignals   = pendingSignals;
globalThis._userWorkspace    = userWorkspace;

// Also expose on global (Node.js globalThis === global in practice, but be explicit)
global._io               = io;
global._presenceLastSeen = presenceLastSeen;
global._pendingSignals   = pendingSignals;
global._userWorkspace    = userWorkspace;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUserOnline(userId) {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (room && room.size > 0) return true;
  const t = presenceLastSeen.get(userId);
  return !!t && Date.now() - t < PRESENCE_TTL;
}

function getOnlineUserIds() {
  const online = new Set();
  for (const [roomName] of io.sockets.adapter.rooms) {
    if (roomName.startsWith('user:')) online.add(roomName.slice(5));
  }
  const now = Date.now();
  for (const [uid, ts] of presenceLastSeen) {
    if (now - ts < PRESENCE_TTL) online.add(uid);
  }
  return [...online];
}

function pushToUser(userId, data) {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (!room || room.size === 0) return false;
  io.to(`user:${userId}`).emit('chat_event', data);
  return true;
}

function broadcastPresenceChange(userId, isOnline) {
  const payload = { type: 'presence_change', userId, isOnline };
  const wsId = userWorkspace.get(userId);
  if (wsId) {
    io.to(`workspace:${wsId}`).emit('chat_event', payload);
  } else {
    io.emit('chat_event', payload);
  }
}

function flushPendingSignals(userId) {
  const list = pendingSignals.get(userId);
  if (!list?.length) return;
  pendingSignals.delete(userId);
  const now = Date.now();
  for (const sig of list) {
    if (sig.expiresAt > now) pushToUser(userId, sig.data);
  }
}

function cleanExpiredPresence() {
  const now = Date.now();
  for (const [userId, ts] of presenceLastSeen) {
    if (!isUserOnline(userId) && now - ts > PRESENCE_TTL) {
      presenceLastSeen.delete(userId);
      broadcastPresenceChange(userId, false);
    }
  }
  for (const [uid, signals] of pendingSignals) {
    const live = signals.filter(s => s.expiresAt > now);
    if (!live.length) pendingSignals.delete(uid);
    else pendingSignals.set(uid, live);
  }
}

setInterval(cleanExpiredPresence, 15_000);

// ── JWT auth ──────────────────────────────────────────────────────────────────

async function verifyToken(token) {
  try {
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch {
    return null;
  }
}

// ── Socket.IO auth middleware ─────────────────────────────────────────────────

io.use(async (socket, next) => {
  let token = socket.handshake.auth?.token;
  if (!token && socket.handshake.headers.cookie) {
    const match = socket.handshake.headers.cookie.match(/ops_session=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) return next(new Error('AUTH_REQUIRED'));
  const payload = await verifyToken(token);
  if (!payload) return next(new Error('AUTH_INVALID'));
  socket.userId      = payload.sub;
  socket.userName    = payload.name;
  socket.workspaceId = payload.workspaceId ?? 'ops-main';
  next();
});

// ── Connection handler ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { userId, userName, workspaceId } = socket;

  userWorkspace.set(userId, workspaceId);
  socket.join(`user:${userId}`);
  socket.join(`workspace:${workspaceId}`);

  const wasOffline = !isUserOnline(userId);
  presenceLastSeen.set(userId, Date.now());

  // Presence snapshot for the connecting client
  socket.emit('chat_event', {
    type: 'presence_snapshot',
    onlineUserIds: getOnlineUserIds(),
  });

  if (wasOffline) broadcastPresenceChange(userId, true);
  flushPendingSignals(userId);

  // ── Client events ─────────────────────────────────────────────────────────

  socket.on('join_conversation', (conversationId) => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      socket.join(`conv:${conversationId}`);
    }
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
  });

  socket.on('heartbeat', () => {
    presenceLastSeen.set(userId, Date.now());
    socket.emit('heartbeat_ack');
  });

  socket.on('typing', (data) => {
    if (!data?.conversationId) return;
    socket.to(`conv:${data.conversationId}`).emit('chat_event', {
      type:           'typing',
      conversationId: data.conversationId,
      userId,
      name:           userName,
      isTyping:       !!data.isTyping,
    });
  });

  socket.on('signal', (data) => {
    if (!data?.type || !data?.targetUserId) return;

    const VALID_TYPES = ['ring', 'answer', 'ice', 'ice_restart', 'reject', 'hangup'];
    if (!VALID_TYPES.includes(data.type)) return;

    const payload = {
      type:           'vid_signal',
      subtype:        data.type,
      from:           userId,
      fromName:       userName,
      conversationId: data.conversationId ?? null,
      sdp:            data.sdp ?? null,
      candidate:      data.candidate ?? null,
    };

    const delivered = pushToUser(data.targetUserId, payload);

    // Queue non-ICE signals for brief offline window (reconnect recovery)
    if (!delivered && data.type !== 'ice') {
      const list = pendingSignals.get(data.targetUserId) ?? [];
      list.push({ data: payload, expiresAt: Date.now() + SIGNAL_TTL });
      pendingSignals.set(data.targetUserId, list);
    }
  });

  socket.on('disconnect', () => {
    // 5-second grace period — allows tab reloads without false-offline events
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!room || room.size === 0) {
        // Still no sockets after grace — let presence TTL expire naturally.
        // Uncomment next line for instant offline:
        // broadcastPresenceChange(userId, false);
      }
    }, 5_000);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`> OPS Platform ready on http://0.0.0.0:${port}`);
  console.log(`> Socket.IO attached at /api/socketio`);
  console.log(`> Environment: ${dev ? 'development' : 'production'}`);
});
