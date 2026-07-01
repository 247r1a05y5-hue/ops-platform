import { withLogging } from '@/lib/logger';
import { NextResponse } from "next/server";

async function _GET() {
  return NextResponse.json(
    {
      status: "ok",
      uptime: process.uptime(),
      ts: new Date().toISOString(),
    },
    { status: 200 }
  );
}

// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
