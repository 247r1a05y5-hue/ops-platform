# ==========================================
# Stage 1: Install dependencies
# ==========================================
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package management files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# ==========================================
# Stage 2: Build the application
# ==========================================
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time env placeholders (to prevent build failures if checked)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile the Next.js production build
RUN npm run build

# ==========================================
# Stage 3: Production runner
# ==========================================
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a non-root system user for secure container execution
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy runtime assets and built bundles
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/seed-admin.js ./seed-admin.js
COPY --from=builder /app/seed-manager.js ./seed-manager.js
COPY --from=builder /app/deployment ./deployment

# Copy built Next.js pages and bundles
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib

# Install only production dependencies to minimize size and vulnerabilities
RUN npm ci --only=production && npm cache clean --force

# Set directory permissions for user nextjs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Define container health check against the custom server health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/auth/me').then(r => process.exit(r.status === 401 || r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
