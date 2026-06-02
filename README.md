# OPS Platform

An integrated SaaS platform for operations management, built with **Next.js 16**, **Socket.io 4.8.1**, **TypeScript**, **Tailwind CSS**, and **MongoDB**.

## 🚀 Features

- **Real-time Chat & Messaging** - Socket.io powered live communication
- **CRM & Lead Management** - Full-featured sales pipeline
- **Project Management** - Tasks, milestones, and timelines
- **Employee Management** - Payroll, performance tracking, time-tracking
- **Email Integration** - Gmail OAuth, SMTP, email templates
- **WhatsApp Integration** - Direct messaging and notifications via Meta Cloud API
- **Payment Processing** - Razorpay integration for invoices and payments
- **Document Management** - Cloud storage via Cloudinary
- **Video Conferencing** - Jitsi integration for calls
- **Audit Logging** - Complete activity tracking
- **Email Sequences** - Automated marketing campaigns
- **Proposal Management** - Generate, track, and manage proposals
- **Analytics** - Real-time dashboards and reporting

## 📋 Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **yarn** 3+
- **MongoDB Atlas** account (cloud database)
- **Git** for version control

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/247r1a05y5/ops-platform.git
cd ops-platform/ops
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your actual secrets
# Required variables:
#   - MONGODB_URI (MongoDB Atlas connection)
#   - JWT_SECRET (authentication key)
#   - NEXT_PUBLIC_APP_URL (frontend URL)
#   - SMTP_* (email configuration)
#   - CRON_SECRET (for scheduled jobs)
```

See `.env.example` for full list of available configuration options.

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📦 Build & Production

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `.next` directory.

### Start Production Server

```bash
npm run start
```

The server will start on port 3000 (or `$PORT` if set).

### Development with Hot-reload

```bash
npm run dev
```

Uses turbopack for fast module replacement and Socket.io real-time updates.

## 🏗️ Project Structure

```
ops/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/                # API routes (REST + Socket.io integration)
│   │   ├── admin/              # Admin dashboard
│   │   ├── dashboard/          # Main user dashboard
│   │   ├── crm/                # CRM module
│   │   ├── chat/               # Chat interface
│   │   ├── tasks/              # Task management
│   │   ├── invoices/           # Invoice management
│   │   ├── login/              # Authentication
│   │   └── ...                 # Other modules
│   ├── components/             # Reusable React components
│   ├── context/                # React Context (Auth, Theme, UI)
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities & services
│   │   ├── socket-server.ts    # Socket.io configuration
│   │   ├── db.ts               # Database client
│   │   ├── auth.ts             # Authentication helpers
│   │   ├── email.ts            # Email service
│   │   ├── whatsapp.ts         # WhatsApp integration
│   │   └── ...                 # Other services
│   └── utils/                  # Helper functions
├── public/                     # Static assets
├── scripts/                    # Database seeding scripts
├── server.mjs                  # Custom Node.js HTTP server (Next.js + Socket.io)
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── next.config.mjs             # Next.js configuration
├── postcss.config.mjs          # PostCSS + Tailwind configuration
├── railway.toml                # Railway deployment config
├── Procfile                    # Heroku/Railway process definition
├── .env.example                # Environment variables template
└── .gitignore                  # Git ignore rules
```

## 🔌 Socket.io Real-time Communication

The application uses a **custom Node.js HTTP server** (`server.mjs`) that:

1. Boots Next.js with turbopack
2. Runs Socket.io on the same HTTP server
3. Allows API routes to emit real-time events to connected clients

### How Real-time Works

1. **Frontend** (Vercel) connects to Socket.io server:
   ```typescript
   // src/hooks/useSocket.ts
   io('https://socket-server.railway.app', {
     path: '/api/socketio',
     transports: ['websocket', 'polling'],
   })
   ```

2. **Backend API Route** (Vercel) performs an action and notifies all clients:
   ```typescript
   // src/app/api/chat/send/route.ts
   globalThis._socketIO.to(`room:${roomId}`).emit('message', messageData)
   ```

3. **Socket.io Server** (Railway) relays the event to all connected clients in that room

### Key Socket.io Features

- **Presence Tracking**: Real-time online status
- **Typing Indicators**: See when others are typing
- **Room-based Messaging**: Emit to specific rooms/users
- **Polling Fallback**: Works on networks that block WebSockets
- **Automatic Reconnection**: Handles network interruptions

## 📊 Database Schema

MongoDB collections include:

- **Users** - Authentication and profile data
- **Messages** - Chat conversations and threads
- **Tasks** - Project tasks and assignments
- **Leads** - CRM lead pipeline
- **Proposals** - Quote/proposal documents
- **Invoices** - Billing and payments
- **Audit** - Activity tracking
- **EmailTemplates** - Reusable email templates
- **Sequences** - Automated email campaigns

## 🔐 Authentication

The platform uses **JWT (JSON Web Token)** authentication:

1. User logs in → JWT token issued
2. Token stored in secure HTTP-only cookie
3. API routes validate token on each request
4. Socket.io connects authenticate via token

```typescript
// Authentication middleware
import { requireAuth } from '@/lib/require-auth'

export async function GET(req) {
  const user = await requireAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ user })
}
```

## 📧 Email Integration

### SMTP Configuration

Send emails via configured SMTP service (Brevo/Sendinblue):

```typescript
import { sendEmail } from '@/lib/email'

await sendEmail({
  to: user.email,
  subject: 'Welcome!',
  template: 'welcome',
  data: { name: user.name }
})
```

### Gmail OAuth

Connect user's Gmail account for sending emails and viewing inbox:

```typescript
// Redirects to: /api/gmail/oauth?action=callback
// After auth, access user's Gmail via Google APIs
```

## 📱 WhatsApp Integration

Send WhatsApp messages via Meta Cloud API:

```typescript
import { sendWhatsAppMessage } from '@/lib/whatsapp'

await sendWhatsAppMessage({
  phoneNumber: '919xxxxxxxxx',
  message: 'Hello from OPS Platform!'
})
```

## 💳 Payment Processing

Razorpay integration for invoices:

```typescript
import { createOrder } from '@/lib/payment'

const order = await createOrder({
  amount: 10000, // in paise (₹100)
  receipt: `invoice-${invoiceId}`,
  notes: { invoiceId }
})
```

## 🖼️ Image Management

Cloudinary for image uploads and optimization:

```typescript
import { uploadImage } from '@/lib/cloudinary'

const url = await uploadImage(file, {
  folder: 'ops-platform/chat',
  resource_type: 'auto'
})
```

## 🚀 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Railway

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Create new project → Deploy from GitHub
4. Select `ops-socketio-updated` repo
5. Railway auto-detects `railway.toml` and deploys

### Quick Deploy to Vercel

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. New Project → Import GitHub repo
4. Vercel auto-detects Next.js and deploys
5. Configure environment variables

## 🐛 Troubleshooting

### Socket.io Connection Fails

```bash
# Check if server is running
npm run dev

# Check browser console for errors
# DevTools → Console → Look for Socket.io messages

# Verify CORS settings in server.mjs
```

### Build Fails

```bash
# Clear build cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
npm install

# Build again
npm run build
```

### Database Connection Error

```bash
# Verify MONGODB_URI in .env.local
# Format: mongodb+srv://username:password@cluster.mongodb.net/database?options

# Test connection
node -e "require('mongoose').connect(process.env.MONGODB_URI)"
```

### Email Not Sending

```bash
# Check SMTP credentials in .env.local
# Verify SENDER_EMAIL matches configured account
# Check spam folder
# Review logs for error messages
```

## 📚 Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [.env.example](./.env.example) - Environment variables reference
- [Next.js Docs](https://nextjs.org/docs) - Framework documentation
- [Socket.io Docs](https://socket.io/docs) - Real-time communication
- [Tailwind CSS](https://tailwindcss.com/docs) - Styling framework

## 📄 Scripts

```json
{
  "dev": "node server.mjs --dev",    // Development with Socket.io
  "build": "next build",              // Production build
  "start": "node server.mjs",         // Production start
  "lint": "eslint",                   // Code linting
  "dev:next": "next dev"              // Debug mode (no Socket.io)
}
```

## 🔄 API Routes

Key API endpoints:

- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `POST /api/chat/send` - Send message (Socket.io integration)
- `GET /api/chat/messages` - Fetch messages
- `POST /api/tasks` - Create task
- `GET /api/dashboard/stats` - Dashboard analytics
- `POST /api/payment/order` - Create payment order
- `POST /api/email/send` - Send email

See `src/app/api` for all available routes.

## 🛡️ Security

- JWT-based authentication
- HTTP-only secure cookies
- CORS protection
- Rate limiting on sensitive endpoints
- Input validation and sanitization
- Database query injection prevention
- HTTPS enforcement in production
- Audit logging for sensitive operations

## 📞 Support

For issues or questions:

1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting section
2. Review `.env.example` for configuration help
3. Check logs: `npm run dev` output or Railway/Vercel dashboards
4. Review error messages in browser console and server logs

## 📝 License

Private project - All rights reserved

## 👥 Team

Built by the OPS Platform team for modern business operations management.

---

**Ready to deploy?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step instructions.
