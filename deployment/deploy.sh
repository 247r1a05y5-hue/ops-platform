#!/usr/bin/env bash
# deployment/deploy.sh
#
# Zero-downtime deployment script for OPS Platform on VPS.
# Run this from the project root on the VPS after pulling latest code.
#
# Usage:
#   ./deployment/deploy.sh
#
# What it does:
#   1. Installs/updates dependencies
#   2. Builds Next.js
#   3. Reloads PM2 with zero downtime (new process → traffic shift → old process dies)
#   4. Verifies the app is healthy

set -euo pipefail

APP_NAME="ops-platform"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="/var/log/ops"

echo "========================================"
echo "  OPS Platform — Deploy $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo "App dir: $APP_DIR"

cd "$APP_DIR"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo ""
echo "[1/5] Pulling latest code..."
git pull origin main

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "[2/5] Installing dependencies..."
npm ci --production=false

# ── 3. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "[3/5] Building Next.js..."
npm run build

# ── 4. Reload via PM2 (zero downtime) ────────────────────────────────────────
echo ""
echo "[4/5] Reloading PM2 process..."

# Ensure log directory exists
sudo mkdir -p "$LOG_DIR"
sudo chown "$(whoami)" "$LOG_DIR"

# Reload (creates new process, waits for it to be ready, then kills old one)
pm2 reload "$APP_NAME" --update-env || pm2 start deployment/ecosystem.config.cjs --env production

pm2 save

# ── 5. Health check ───────────────────────────────────────────────────────────
echo ""
echo "[5/5] Running health check..."
sleep 3

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/socketio)
if [ "$HEALTH" = "200" ]; then
    echo "✓ Health check passed (HTTP $HEALTH)"
else
    echo "✗ Health check FAILED (HTTP $HEALTH)"
    echo "  Check logs: pm2 logs $APP_NAME"
    exit 1
fi

echo ""
echo "========================================"
echo "  Deploy complete ✓"
echo "  Logs: pm2 logs $APP_NAME"
echo "========================================"
