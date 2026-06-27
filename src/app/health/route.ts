import { NextResponse } from "next/server";
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'disconnected';
  const isHealthy = dbStatus === 'healthy';
  
  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "error",
      database: dbStatus,
      uptime: process.uptime(),
      ts: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 }
  );
}