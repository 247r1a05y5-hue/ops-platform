# OPS Platform - Deployment Architecture

## Overview

The OPS Platform uses a **split-architecture deployment model**:
- **Frontend**: Deployed on **Vercel** (Next.js with optimized edge functions)
- **Real-time Server**: Deployed on **Railway** (Node.js + Socket.io)

This separation allows independent scaling, auto-deployment, and optimal performance for each component.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                          │
│           (Web, Mobile, Desktop - All Browsers)                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────┴──────────────┐
         │                          │
    ┌────▼─────┐           ┌────────▼──────┐
    │  Vercel  │           │   Railway     │
    │ Frontend │           │  Real-time    │
    │(Next.js) │           │   Server      │
    │          │           │ (Socket.io)   │
    └────┬─────┘           └────┬───────────┘
         │ HTTP/REST            │ WebSocket
         │ (API routes)         │ (Socket.io)
         │                      │
         └──────────┬───────────┘
                    │
            ┌───────▼────────┐
            │    MongoDB     │
            │  Atlas Cloud   │
            │   (Shared DB)  │
            └────────────────┘
```

---

## Server Architecture

### server.mjs (The Entrypoint)

The application uses a **custom Node.js HTTP server** that:

1. **Boots Next.js** with turbopack for fast development and builds
2. **Runs Socket.io** on the same HTTP server (`:3000`)
3. **Shares state** between Next.js API routes and Socket.io via globals

**Why this approach?**
- Socket.io cannot reliably run in Next.js API route handlers across all deployment environments
- A custom server ensures one HTTP server serves both Next.js and real-time communication
- Global objects (`globalThis._socketIO`, etc.) allow API routes to emit events to connected clients

```javascript
// server.mjs structure:
// 1. Create Node.js HTTP server
// 2. Attach Next.js request handler
// 3. Boot Socket.io on the same server
// 4. Export globals for API routes to use
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "node server.mjs --dev",      // Development (with hot-reload via turbopack)
    "build": "next build",                // Build for production
    "start": "node server.mjs",           // Production start
    "lint": "eslint",                     // Linting
    "dev:next": "next dev"                // Debug-only: raw Next.js dev (no Socket.io)
  }
}
```

**Important:**
- Use `npm run dev` for development (includes Socket.io)
- Use `npm run build && npm run start` for production testing
- Never use `next dev` in production; it bypasses the Socket.io server

---

## Deployment Configuration Files

### 1. **railway.toml** - Railway Deployment

Used by Railway to configure the Node.js server deployment:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "node server.mjs"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[[services]]
name = "ops-server"
```

**What it does:**
- Installs dependencies
- Runs the production build
- Starts the server with `node server.mjs`
- Restarts on failure (up to 10 times)

### 2. **Procfile** - Heroku/Railway Fallback

Simple fallback for platforms that read Procfile:

```
web: node server.mjs
```

### 3. **next.config.mjs** - Next.js Configuration

Optimized for both frontend and real-time deployments:

```javascript
// Turbopack configuration for monorepo
// Image optimization for Cloudinary remote images
// Proper ESM module support
```

---

## Environment Variables

### Required for Development

Copy `.env.example` to `.env.local` and fill in actual values:

```bash
cp .env.example .env.local
```

### Critical Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `MONGODB_URI` | Database connection | ✅ Yes |
| `NEXT_PUBLIC_APP_URL` | Frontend URL | ✅ Yes |
| `JWT_SECRET` | Authentication signing | ✅ Yes |
| `SMTP_*` | Email sending | ✅ Yes |
| `WHATSAPP_TOKEN` | WhatsApp integration | ❌ Optional |
| `RAZORPAY_KEY_*` | Payment processing | ❌ Optional |
| `CLOUDINARY_*` | Image storage | ❌ Optional |
| `CRON_SECRET` | Scheduled job auth | ✅ Yes |

### Development vs. Production

**Development (.env.local):**
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
LOG_LEVEL=debug
```

**Production (Railway):**
```
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

---

## Deployment Steps

### Step 1: Vercel Frontend Deployment

1. **Connect GitHub Repository**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import GitHub repository
   - Select the repo: `ops-socketio-updated`

2. **Configure Build Settings**
   - **Framework**: Next.js
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

3. **Set Environment Variables**
   - Add all variables from `.env.example`
   - EXCEPT: Remove `MONGODB_URI` secrets (use Vercel team secrets if needed)
   - CRITICAL: Set `NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app`
   - Set `SOCKET_SERVER_URL=https://railway-domain.com` (after Railway is deployed)

4. **Deploy**
   - Click "Deploy"
   - Vercel will auto-deploy on every push to `main`

### Step 2: Railway Real-time Server Deployment

1. **Connect GitHub Repository**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub"
   - Connect your GitHub account and select `ops-socketio-updated`

2. **Configure Service**
   - Railway will auto-detect `railway.toml`
   - Set **Root Directory**: `ops/` (if not in root)
   - Build command will use: `npm install && npm run build`
   - Start command will use: `node server.mjs`

3. **Set Environment Variables**
   - Go to "Variables"
   - Add all variables from `.env.example`
   - CRITICAL: `PORT=3000` (or Railway assigns automatically)
   - CRITICAL: `NODE_ENV=production`
   - Set `NEXT_PUBLIC_APP_URL=https://vercel-domain.vercel.app` (after Vercel deploys)
   - NO `.env.local` file is needed; use Railway dashboard

4. **Create Domain**
   - Railway → Project → Settings → Domain
   - Create a custom domain: `api.your-domain.com`
   - Update Vercel's `SOCKET_SERVER_URL` env var with this domain

5. **Deploy**
   - Railway will auto-deploy on every push to `main`

---

## Socket.io Real-time Communication Flow

### Client Connection

1. **Frontend (Vercel)** loads and connects to Socket.io:
   ```javascript
   // src/hooks/useSocket.ts
   io('https://railway-domain.com', {
     path: '/api/socketio',
     transports: ['websocket', 'polling'],
   })
   ```

2. **Backend (Railway)** receives connection:
   ```javascript
   // server.mjs
   const io = new SocketIOServer(httpServer, {
     path: '/api/socketio',
     cors: { origin: '*', methods: ['GET', 'POST'] },
     transports: ['websocket', 'polling'],
   })
   ```

### API Route to Real-time Event Flow

1. **Vercel API Route** handles an action (e.g., sending a chat message):
   ```typescript
   // src/app/api/chat/send/route.ts
   // Call: globalThis._socketIO.to(`room:${roomId}`).emit('message', data)
   ```

2. **Via Socket.io** (Railway):
   - Event is emitted from the backend
   - Reaches all connected clients in that room

### Presence & Typing Indicators

- Socket.io rooms manage presence: `user:${userId}`, `room:${roomId}`
- Heartbeat mechanism keeps users online
- Cleaned up on disconnect

---

## Monitoring & Debugging

### Vercel Dashboard
- **Deployments**: View build logs, deployment history
- **Analytics**: Monitor Page Speed Insights, Web Vitals
- **Functions**: Check API route execution time

### Railway Dashboard
- **Deployments**: View build and runtime logs
- **Metrics**: Monitor CPU, Memory, Network usage
- **Incidents**: Auto-restart on failure

### Local Development

```bash
# Terminal 1: Start the server with Socket.io
npm run dev

# Terminal 2: Run database seed (if needed)
npm run seed-admin

# Access at http://localhost:3000
```

### Health Checks

```bash
# Frontend health
curl https://your-vercel-domain.vercel.app/api/auth/me

# Socket.io connectivity
# Check browser DevTools → Network → WS tab for `/api/socketio` connection

# MongoDB connection
# Check logs for "MongoDB connected" message
```

---

## Common Issues & Solutions

### Issue: Socket.io connection fails in production

**Cause**: CORS not configured, or wrong socket server URL

**Solution**:
1. Verify `SOCKET_SERVER_URL` is set correctly on Vercel
2. Ensure Railway domain is accessible
3. Check Railway logs for connection errors
4. Verify cors config in `server.mjs`

### Issue: "Cannot find module 'socket.io'"

**Cause**: Dependencies not installed on deployment

**Solution**:
1. Verify `package.json` has `socket.io` in `dependencies`
2. Check `railway.toml` has correct buildCommand
3. Trigger a re-build on Railway

### Issue: Hot reload not working in development

**Cause**: Using wrong dev command

**Solution**: Always use `npm run dev`, not `next dev`

### Issue: .env variables not loading

**Cause**: Wrong file name or location

**Solution**:
- Development: Use `.env.local` in project root (`ops/` directory)
- Production: Use Railway/Vercel dashboard
- Verify `NEXT_PUBLIC_*` are truly public (visible in client code)

---

## Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore`
2. **Use `.env.example`** - Template for team members
3. **Rotate secrets regularly** - Especially API keys
4. **Enable HTTPS only** - Both Vercel and Railway provide SSL
5. **Use strong JWT_SECRET** - Min 32 characters, random
6. **Restrict CORS** - Set specific origins in production
7. **Validate socket events** - Authenticate all Socket.io messages
8. **Log sensitive operations** - For audit trails

---

## Performance Optimization

### Frontend (Vercel)
- Next.js App Router with automatic code splitting
- Image optimization via Cloudinary
- Edge functions for low-latency responses
- Automatic ISR (Incremental Static Regeneration)

### Real-time (Railway)
- Socket.io polling fallback for unreliable connections
- Message compression to reduce bandwidth
- Room-based message delivery (not broadcast all)
- Presence heartbeat every 10 seconds

### Database (MongoDB)
- Indexes on frequently queried fields
- Connection pooling (mongoose default)
- TTL indexes for auto-cleanup of old documents

---

## Testing Deployment Locally

Before pushing to production:

```bash
# 1. Build locally
npm run build

# 2. Start production server
npm run start

# 3. Test key flows:
#    - Login/authentication
#    - Chat messaging (tests Socket.io)
#    - File upload (tests Cloudinary)
#    - Email sending (tests SMTP)

# 4. Check production build size
npm run build
# Output should show bundle analysis
```

---

## Rollback Procedure

### Vercel
1. Go to Deployments
2. Find the previous successful deployment
3. Click "Redeploy"

### Railway
1. Go to Deployments
2. Select a previous deployment
3. Click "Redeploy"

---

## Support & Resources

- **Next.js**: https://nextjs.org/docs
- **Socket.io**: https://socket.io/docs
- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **MongoDB**: https://docs.mongodb.com

---

## Version Information

- **Next.js**: 16.2.5 (with Turbopack)
- **Node.js**: 18+ required (16+ recommended)
- **Socket.io**: 4.8.1
- **React**: 19.2.4
- **MongoDB**: Atlas (Cloud)

---

**Last Updated**: June 2, 2026
**Architecture**: Split Deployment (Vercel + Railway + MongoDB)
