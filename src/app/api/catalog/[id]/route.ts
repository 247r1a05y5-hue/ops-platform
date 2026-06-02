import { NextRequest, NextResponse } from 'next/server';
import { connectDB, CatalogItem } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const allowed = ['name', 'category', 'type', 'price', 'status', 'description', 'tags', 'rating'];
    const body = await req.json();
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const item = await CatalogItem.findByIdAndUpdate(id, update, { new: true });
    if (!item) return NextResponse.json({ success: false, error: 'Item not found.' }, { status: 404 });

    return NextResponse.json({ success: true, item });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const item = await CatalogItem.findByIdAndDelete(id);
    if (!item) return NextResponse.json({ success: false, error: 'Item not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
