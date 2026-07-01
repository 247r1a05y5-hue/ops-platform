/**
 * server.mjs — FIXED PRODUCTION ENTRY POINT
 *
 * Fixes:
 * 1. Presence offline broadcast fires immediately after grace period
 * 2. No duplicate message delivery (conv room only — user rooms for non-members)
 * 3. Unified globalThis._socketIO and global._io
 * 4. Full debug logging
 * 5. Rejoin user/workspace rooms logged on reconnect
 */
import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { jwtVerify } from 'jose';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'node:path';

const dev  = process.argv.includes('--dev');
const port = parseInt(process.env.PORT ?? '3000', 10);

// Load local environment config
dotenv.config({ path: path.resolve('.env.local') });

const CRITICAL_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CRON_SECRET',
  'BREVO_API_KEY',
  'SENDER_EMAIL',
  'ADMIN_EMAIL'
];

async function runStartupChecks() {
  console.log('[Startup Check] Validating environment variables...');
  const missing = [];
  for (const v of CRITICAL_VARS) {
    if (!process.env[v] || process.env[v].trim() === '') {
      missing.push(v);
    }
  }
  if (missing.length > 0) {
    console.error(`[Startup Check] ❌ FATAL — Missing required environment variables:\n  • ${missing.join('\n  • ')}`);
    process.exit(1);
  }

  // Format checks
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const uri = process.env.MONGODB_URI || '';
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error(`[Startup Check] ❌ FATAL — MONGODB_URI is invalid: must start with mongodb:// or mongodb+srv://`);
    process.exit(1);
  }
  if ((process.env.JWT_SECRET || '').length < 32) {
    console.error(`[Startup Check] ❌ FATAL — JWT_SECRET is invalid: must be at least 32 characters long`);
    process.exit(1);
  }
  if (!emailRegex.test(process.env.ADMIN_EMAIL || '')) {
    console.error(`[Startup Check] ❌ FATAL — ADMIN_EMAIL is invalid: incorrect email format`);
    process.exit(1);
  }
  if (!emailRegex.test(process.env.SENDER_EMAIL || '')) {
    console.error(`[Startup Check] ❌ FATAL — SENDER_EMAIL is invalid: incorrect email format`);
    process.exit(1);
  }

  console.log('[Startup Check] Testing MongoDB connection...');
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('[Startup Check] ✓ MongoDB connected successfully');
    await mongoose.disconnect();
  } catch (err) {
    console.error(`[Startup Check] ❌ FATAL — MongoDB connection test failed:`, err.message || err);
    process.exit(1);
  }

  console.log('[Startup Check] Testing Cloudinary credentials...');
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure:     true,
    });
    const result = await cloudinary.api.ping();
    if (result.status !== 'ok') {
      throw new Error(`Cloudinary ping returned status: ${result.status}`);
    }
    console.log('[Startup Check] ✓ Cloudinary credentials verified');
    process.env.CLOUDINARY_AVAILABLE = 'true';
    globalThis.cloudinaryAvailable = true;
  } catch (err) {
    console.warn(`[Startup Check] ⚠️ WARNING — Cloudinary credentials test failed: ${err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))}. Cloudinary marked as unavailable.`);
    process.env.CLOUDINARY_AVAILABLE = 'false';
    globalThis.cloudinaryAvailable = false;
  }

  console.log('[Startup Check] Testing Brevo REST API token...');
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY || ''
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    console.log('[Startup Check] ✓ Brevo API credentials verified');
  } catch (err) {
    if (dev || process.env.NODE_ENV === 'test') {
      console.warn(`[Startup Check] ⚠️ WARNING — Brevo email client connection failed: ${err.message || err}. Continuing in dev/test mode.`);
    } else {
      console.error(`[Startup Check] ❌ FATAL — Brevo email client connection failed:`, err.message || err);
      process.exit(1);
    }
  }

  console.log('[Startup Check] ✓ All startup systems operational.');
}

// ── Next.js app ───────────────────────────────────────────────────────────────

await runStartupChecks();

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

const presenceLastSeen = new Map(); // userId → timestamp
const pendingSignals   = new Map(); // userId → [{data, expiresAt}]
const userWorkspace    = new Map(); // userId → workspaceId

const PRESENCE_TTL = 45_000;
const SIGNAL_TTL   = 30_000;

// Set ALL globals so every import path works
globalThis._socketIO         = io;
globalThis._io               = io;
globalThis._presenceLastSeen = presenceLastSeen;
globalThis._pendingSignals   = pendingSignals;
globalThis._userWorkspace    = userWorkspace;

global._io               = io;
global._socketIO         = io;
global._presenceLastSeen = presenceLastSeen;
global._pendingSignals   = pendingSignals;
global._userWorkspace    = userWorkspace;

console.log('[Server] Socket.IO initialized — globals set');

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
  console.log(`[Server] Presence broadcast: user=${userId} isOnline=${isOnline}`);
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
  let flushed = 0;
  for (const sig of list) {
    if (sig.expiresAt > now) {
      pushToUser(userId, sig.data);
      flushed++;
    }
  }
  if (flushed > 0) console.log(`[Server] Flushed ${flushed} pending signals to user=${userId}`);
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

  console.log(`[Server] User connected: userId=${userId} name=${userName} workspace=${workspaceId} socketId=${socket.id}`);

  userWorkspace.set(userId, workspaceId);
  socket.join(`user:${userId}`);
  socket.join(`workspace:${workspaceId}`);

  console.log(`[Server] User room joined: user:${userId}`);
  console.log(`[Server] Workspace room joined: workspace:${workspaceId}`);

  const wasOffline = !isUserOnline(userId);
  presenceLastSeen.set(userId, Date.now());

  // Presence snapshot for the connecting client
  socket.emit('chat_event', {
    type: 'presence_snapshot',
    onlineUserIds: getOnlineUserIds(),
  });

  // Broadcast presence ONLINE to workspace peers
  if (wasOffline) {
    broadcastPresenceChange(userId, true);
  }

  // Flush any pending signals (e.g. missed ring while briefly disconnected)
  flushPendingSignals(userId);

  // ── Client events ─────────────────────────────────────────────────────────

  socket.on('join_conversation', (conversationId) => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      socket.join(`conv:${conversationId}`);
      console.log(`[Server] Conversation room joined: conv:${conversationId} by userId=${userId}`);
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

    console.log(`[Server] Signal: type=${data.type} from=${userId}(${userName}) to=${data.targetUserId}`);

    const payload = {
      type:           'vid_signal',
      subtype:        data.type,
      from:           userId,
      fromName:       userName,
      conversationId: data.conversationId ?? null,
      workspaceId:    data.workspaceId ?? null,
      reason:         data.reason ?? null,
      sdp:            data.sdp ?? null,
      candidate:      data.candidate ?? null,
    };

    const delivered = pushToUser(data.targetUserId, payload);
    console.log(`[Server] Incoming call signal emitted to user:${data.targetUserId} — delivered=${delivered}`);

    // Queue non-ICE signals for brief offline window
    if (!delivered && data.type !== 'ice') {
      const list = pendingSignals.get(data.targetUserId) ?? [];
      list.push({ data: payload, expiresAt: Date.now() + SIGNAL_TTL });
      pendingSignals.set(data.targetUserId, list);
      console.log(`[Server] Signal queued for offline user=${data.targetUserId}`);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Server] User disconnected: userId=${userId} reason=${reason} socketId=${socket.id}`);

    // Grace period — handles tab reloads without false-offline flicker
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (!room || room.size === 0) {
        // No remaining sockets for this user — broadcast offline immediately
        console.log(`[Server] User offline after grace: userId=${userId}`);
        presenceLastSeen.delete(userId);
        broadcastPresenceChange(userId, false);
      } else {
        console.log(`[Server] User still has ${room.size} socket(s) — not broadcasting offline: userId=${userId}`);
      }
    }, 5_000);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const serverInstance = httpServer.listen(port, '0.0.0.0', () => {
  console.log(`> OPS Platform ready on http://0.0.0.0:${port}`);
  console.log(`> Socket.IO attached at /api/socketio`);
  console.log(`> Environment: ${dev ? 'development' : 'production'}`);

  // ── Webhook Cron Scheduler (Railway-native) ──────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.trim() !== '') {
    console.log('[Scheduler] Initializing once-per-minute loopback cron worker...');
    setInterval(async () => {
      try {
        const url = `http://127.0.0.1:${port}/api/cron/webhooks`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[Scheduler] Cron execution failed (HTTP ${res.status}):`, text);
        } else {
          const data = await res.json();
          console.log(`[Scheduler] Cron run succeeded:`, data);
        }
      } catch (err) {
        console.error('[Scheduler] Loopback request error:', err.message || err);
      }
    }, 60000);
  } else {
    console.warn('[Scheduler] CRON_SECRET is not set. In-process cron scheduler is inactive.');
  }
});

// ── Graceful Shutdown ──────────────────────────────────────────────────────────

async function gracefulShutdown(signal) {
  console.log(`\n[Graceful Shutdown] Received ${signal}. Starting shutdown sequence...`);

  // Close active Socket.IO listener and client connections
  try {
    io.close(() => {
      console.log('[Graceful Shutdown] Socket.IO server closed.');
    });
  } catch (err) {
    console.error('[Graceful Shutdown] Socket.IO close error:', err);
  }

  // Close HTTP server to refuse new traffic
  try {
    serverInstance.close(() => {
      console.log('[Graceful Shutdown] HTTP server closed.');
    });
  } catch (err) {
    console.error('[Graceful Shutdown] HTTP server close error:', err);
  }

  // Close active Mongoose connections
  try {
    await mongoose.disconnect();
    console.log('[Graceful Shutdown] MongoDB connection closed.');
  } catch (err) {
    console.error('[Graceful Shutdown] MongoDB disconnect error:', err);
  }

  console.log('[Graceful Shutdown] Flushing logs and buffers...');
  await new Promise(resolve => setTimeout(resolve, 800));

  console.log('[Graceful Shutdown] Process exiting cleanly.\n');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

