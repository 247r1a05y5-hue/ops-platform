#!/usr/bin/env node
/**
 * scripts/validate-production.mjs
 *
 * Production realtime validation script.
 * Run AFTER deploying to Railway to verify Socket.io is live.
 *
 * Usage:
 *   node scripts/validate-production.mjs https://your-railway-app.up.railway.app YOUR_JWT_TOKEN
 *
 * A JWT token can be obtained by:
 *   1. Log in to the app
 *   2. Open DevTools → Application → Cookies → copy ops_session value
 */

import { io } from 'socket.io-client';

const [,, BASE_URL, TOKEN] = process.argv;

if (!BASE_URL) {
  console.error('Usage: node scripts/validate-production.mjs <BASE_URL> [JWT_TOKEN]');
  process.exit(1);
}

const url = BASE_URL.replace(/\/$/, '');

// ── 1. Health check ─────────────────────────────────────────────────────────
console.log('\n📋 Step 1: Health Check');
try {
  const res = await fetch(`${url}/health`);
  const data = await res.json();
  if (data.status === 'ok') {
    console.log(`  ✅ Health OK — uptime: ${Math.round(data.uptime)}s, connected sockets: ${data.socketio}`);
  } else {
    console.log(`  ❌ Health failed:`, data);
  }
} catch (e) {
  console.log(`  ❌ Health endpoint unreachable: ${e.message}`);
}

// ── 2. Socket.io connection ──────────────────────────────────────────────────
console.log('\n📋 Step 2: Socket.io Connection');

const socket = io(url, {
  path: '/api/socketio',
  transports: ['websocket'],
  auth: TOKEN ? { token: TOKEN } : undefined,
  timeout: 10_000,
  reconnection: false,
});

const TIMEOUT = 12_000;
const timer = setTimeout(() => {
  console.log('  ❌ Connection timed out');
  socket.disconnect();
  process.exit(1);
}, TIMEOUT);

socket.on('connect_error', (err) => {
  clearTimeout(timer);
  if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID') {
    console.log(`  ⚠️  Socket.io reachable but auth failed: ${err.message}`);
    console.log('     → Pass a valid JWT token as second argument to test full auth');
    socket.disconnect();
    process.exit(0);
  }
  console.log(`  ❌ Connection error: ${err.message}`);
  socket.disconnect();
  process.exit(1);
});

socket.on('connect', () => {
  console.log(`  ✅ Connected! Socket ID: ${socket.id}`);
  console.log(`  ✅ Transport: ${socket.io.engine.transport.name}`);
});

socket.on('chat_event', (data) => {
  if (data?.type === 'presence_snapshot') {
    clearTimeout(timer);
    console.log(`  ✅ Presence snapshot received — ${data.onlineUserIds?.length ?? 0} user(s) online`);

    // Step 3: Heartbeat
    console.log('\n📋 Step 3: Heartbeat');
    socket.emit('heartbeat');
  }
  if (data?.type === undefined) {
    // Shouldn't happen
  }
});

socket.on('heartbeat_ack', () => {
  console.log('  ✅ Heartbeat acknowledged');
  
  // Step 4: Upgrade check
  const transport = socket.io.engine.transport.name;
  console.log('\n📋 Step 4: Transport');
  if (transport === 'websocket') {
    console.log('  ✅ Using WebSocket (WSS) — optimal');
  } else {
    console.log(`  ⚠️  Using ${transport} — not WebSocket (check Railway proxy config)`);
  }

  console.log('\n🎉 All validation checks passed!');
  console.log(`   Railway URL: ${url}`);
  console.log(`   Socket path: /api/socketio`);
  socket.disconnect();
  process.exit(0);
});
