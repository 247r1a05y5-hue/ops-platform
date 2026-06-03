/**
 * server.mjs
 *
 * Production-hardened Next.js + Socket.io combined server.
 * Deploy this entire repo to Railway — it runs BOTH the Next.js app
 * AND the persistent Socket.io realtime server on the same process/port.
 *
 * USAGE:
 *   node server.mjs          (production — Railway)
 *   node server.mjs --dev    (local dev)
 *
 * Environment variables required (set in Railway dashboard):
 *   PORT              — set automatically by Railway
 *   NEXT_PUBLIC_APP_URL — your Railway public URL  e.g. https://ops-xxx.up.railway.app
 *   JWT_SECRET        — same secret used by Next.js auth
 *   MONGODB_URI       — MongoDB Atlas connection string
 *   (all other app env vars — see .env.example)
 */

import { createServer } from 'node:http';
import { parse }        from 'node:url';
import next             from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { jwtVerify }    from 'jose';

const dev  = process.argv.includes('--dev');
const port = parseInt(process.env.PORT ?? '3000', 10);

// ── CORS origin ───────────────────────────────────────────────────────────────
// In production, allow the realtime server host plus the deployed frontend origin(s).
// This is required when the Vercel frontend connects to the Railway Socket.io server.
function getAllowedOrigins() {
  if (dev) return '*';

  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SOCKET_URL,
    process.env.ALLOWED_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : undefined,
  ];

  const origins = candidates
    .flatMap(value => String(value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean))
    .filter((value, index, list) => list.indexOf(value) === index);

  return origins.length > 0 ? origins : ['http://localhost:3000'];
}

// ── Next.js app ───────────────────────────────────────────────────────────────

const app    = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

console.log(`[OPS] Preparing Next.js (${dev ? 'dev' : 'production'})…`);
await app.prepare();
console.log('[OPS] Next.js ready.');

// ── HTTP Server ───────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // Health check endpoint — used by Railway to verify the container is alive
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      ts: new Date().toISOString(),
      socketio: io?.sockets?.sockets?.size ?? 0,
    }));
    return;
  }

  const parsedUrl = parse(req.url ?? '/', true);
  handle(req, res, parsedUrl);
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  path: '/api/socketio',
  cors: {
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Allow both WebSocket (preferred) and long-polling (fallback behind proxies)
  transports: ['websocket', 'polling'],
  // Keep-alive / reconnect tuning
  pingTimeout:    30_000,
  pingInterval:   15_000,
  upgradeTimeout: 15_000,
  // Allow Socket.io v3 clients (forward-compat)
  allowEIO3: true,
  // Max HTTP buffer for large attachments / ICE candidates
  maxHttpBufferSize: 1e6,
});

// Expose io so Next.js API routes can do io.to(...).emit(...)
globalThis._socketIO        = io;

// ── Global state ──────────────────────────────────────────────────────────────

const presenceLastSeen = new Map(); // userId → timestamp
const pendingSignals   = new Map(); // userId → [{data, expiresAt}]
const userWorkspace    = new Map(); // userId → workspaceId

globalThis._presenceLastSeen = presenceLastSeen;
globalThis._pendingSignals   = pendingSignals;
globalThis._userWorkspace    = userWorkspace;

const PRESENCE_TTL = 45_000;
const SIGNAL_TTL   = 30_000;

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

setInterval(cleanExpiredPresence, 15_000).unref();

// ── JWT auth ──────────────────────────────────────────────────────────────────

async function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch {
    return null;
  }
}

// ── Socket.io auth middleware ─────────────────────────────────────────────────

io.use(async (socket, next) => {
  try {
    // 1. Token from explicit auth handshake (preferred for cross-origin clients)
    let token = socket.handshake.auth?.token;

    // 2. Fallback: extract from cookie header (same-origin clients)
    if (!token && socket.handshake.headers.cookie) {
      const match = socket.handshake.headers.cookie.match(/ops_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) return next(new Error('AUTH_REQUIRED'));

    const payload = await verifyToken(token);
    if (!payload) return next(new Error('AUTH_INVALID'));

    socket.userId      = String(payload.sub);
    socket.userName    = String(payload.name ?? 'Unknown');
    socket.workspaceId = String(payload.workspaceId ?? 'ops-main');
    next();
  } catch {
    next(new Error('AUTH_ERROR'));
  }
});

// ── Connection handler ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { userId, userName, workspaceId } = socket;

  userWorkspace.set(userId, workspaceId);
  socket.join(`user:${userId}`);
  socket.join(`workspace:${workspaceId}`);

  const wasOffline = !isUserOnline(userId);
  presenceLastSeen.set(userId, Date.now());

  // Send full presence snapshot to the newly connected client
  socket.emit('chat_event', {
    type: 'presence_snapshot',
    onlineUserIds: getOnlineUserIds(),
  });

  if (wasOffline) broadcastPresenceChange(userId, true);

  // Deliver any buffered signals that arrived while the user was offline
  flushPendingSignals(userId);

  // ── Client → server events ────────────────────────────────────────────────

  socket.on('join_conversation', (conversationId) => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      socket.join(`conv:${conversationId}`);
    }
  });

  socket.on('leave_conversation', (conversationId) => {
    if (typeof conversationId === 'string') {
      socket.leave(`conv:${conversationId}`);
    }
  });

  socket.on('heartbeat', () => {
    presenceLastSeen.set(userId, Date.now());
    socket.emit('heartbeat_ack');
  });

  socket.on('typing', (data) => {
    if (!data?.conversationId) return;
    socket.to(`conv:${data.conversationId}`).emit('chat_event', {
      type: 'typing',
      conversationId: data.conversationId,
      userId,
      name: userName,
      isTyping: !!data.isTyping,
    });
  });

  const relaySignal = (data, eventName) => {
    if (!data?.targetUserId) return;

    const VALID_TYPES = ['ring', 'answer', 'ice', 'ice_restart', 'reject', 'hangup', 'offer', 'call-user', 'incoming-call', 'accept-call', 'ice-candidate', 'end-call'];
    const type = data.type ?? eventName;
    if (!VALID_TYPES.includes(type)) return;

    const payload = {
      type: 'vid_signal',
      subtype: type,
      from: userId,
      fromName: userName,
      conversationId: data.conversationId ?? null,
      workspaceId: data.workspaceId ?? null,
      sdp: data.sdp ?? null,
      candidate: data.candidate ?? null,
    };

    console.info('[Railway Relay]', { eventName, from: userId, to: data.targetUserId, subtype: payload.subtype });

    const delivered = pushToUser(data.targetUserId, payload);
    if (!delivered && type !== 'ice' && type !== 'ice-candidate') {
      const list = pendingSignals.get(data.targetUserId) ?? [];
      list.push({ data: payload, expiresAt: Date.now() + SIGNAL_TTL });
      pendingSignals.set(data.targetUserId, list);
    }
  };

  socket.on('signal', (data) => relaySignal(data, 'signal'));
  socket.on('call-user', (data) => relaySignal(data, 'call-user'));
  socket.on('incoming-call', (data) => relaySignal(data, 'incoming-call'));
  socket.on('accept-call', (data) => relaySignal(data, 'accept-call'));
  socket.on('offer', (data) => relaySignal(data, 'offer'));
  socket.on('answer', (data) => relaySignal(data, 'answer'));
  socket.on('ice-candidate', (data) => relaySignal(data, 'ice-candidate'));
  socket.on('end-call', (data) => relaySignal(data, 'end-call'));

  socket.on('disconnect', (reason) => {
    // 5 s grace period — allows tab reloads / brief reconnects without
    // broadcasting a spurious offline event
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!room || room.size === 0) {
        // User truly gone — TTL will handle the presence_change broadcast
        // Uncomment for instant-offline behaviour:
        // presenceLastSeen.delete(userId);
        // broadcastPresenceChange(userId, false);
      }
    }, 5_000);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`[OPS] ${signal} received — shutting down…`);
  io.close(() => {
    httpServer.close(() => {
      console.log('[OPS] Server closed.');
      process.exit(0);
    });
  });
  // Force exit after 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(port, '0.0.0.0', () => {
  const origins = getAllowedOrigins();
  console.log(`[OPS] ✅ Server ready on port ${port}`);
  console.log(`[OPS] Socket.io path: /api/socketio`);
  console.log(`[OPS] CORS origins: ${Array.isArray(origins) ? origins.join(', ') : origins}`);
  console.log(`[OPS] Health check: http://localhost:${port}/health`);
});
