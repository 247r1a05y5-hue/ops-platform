import { NextRequest, NextResponse } from 'next/server';
import { connectDB, CatalogItem } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

const VALID_TYPES    = ['Product', 'Service', 'Document', 'Template'];
const VALID_STATUSES = ['Active', 'Draft', 'Archived'];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const type   = searchParams.get('type');
    const status = searchParams.get('status');
    const query: Record<string, unknown> = {};
    if (type   && VALID_TYPES.includes(type))     query.type   = type;
    if (status && VALID_STATUSES.includes(status)) query.status = status;

    const items = await CatalogItem.find(query).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, items }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });
  }
}

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { name, category, type, price, status, description, tags, rating } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Name is required.' }, { status: 400 });
    }

    const item = await CatalogItem.create({
      name:        name.trim(),
      category:    category    ?? 'General',
      type:        VALID_TYPES.includes(type)      ? type      : 'Product',
      price:       price       ?? '',
      status:      VALID_STATUSES.includes(status) ? status    : 'Active',
      description: description ?? '',
      tags:        Array.isArray(tags) ? tags : (type ? [type] : []),
      rating:      typeof rating === 'number' ? rating : undefined,
    });

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
