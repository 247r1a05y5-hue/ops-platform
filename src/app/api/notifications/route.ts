import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Notification } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/notifications — return only the current user's notifications
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    // Filter strictly by the authenticated user's ID — never leak other users' notifications
    const { searchParams } = new URL(req.url);
    const limit  = Math.min(50, parseInt(searchParams.get('limit') || '20'));
    const before = searchParams.get('before'); // cursor: createdAt of last item

    const filter: Record<string, unknown> = { userId: session.sub };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1); // fetch +1 to detect hasMore

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();
    return NextResponse.json({ success: true, notifications, hasMore: hasMore || false }, {
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

// PUT /api/notifications — mark one or all as read, scoped to the current user only
export async function PUT(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { id, action } = body;

    if (action === 'mark_all_read') {
      // Only mark THIS user's notifications — never touch other users' records
      await Notification.updateMany({ userId: session.sub, read: false }, { read: true });
      return NextResponse.json({ success: true });
    }

    if (id) {
      // Verify the notification belongs to the current user before updating
      const notification = await Notification.findOne({ _id: id, userId: session.sub });
      if (!notification) {
        return NextResponse.json(
          { success: false, error: 'Notification not found.' },
          { status: 404 }
        );
      }
      await notification.updateOne({ read: true });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Missing parameters.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
