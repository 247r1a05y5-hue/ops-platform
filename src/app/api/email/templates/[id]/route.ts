import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, EmailTemplate } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/email/templates/[id] — update a template
async function _PUT(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const allowed = ['name', 'subject', 'body'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'No update data provided.' }, { status: 400 });
    }

    const template = await EmailTemplate.findByIdAndUpdate(id, update, { new: true });
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, template });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/email/templates/[id] — delete a template
async function _DELETE(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;

    const template = await EmailTemplate.findByIdAndDelete(id);
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Template successfully deleted.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const PUT = withLogging(_PUT);
export const DELETE = withLogging(_DELETE);
