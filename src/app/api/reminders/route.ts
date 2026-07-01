import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Reminder } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

/** GET /api/reminders — list reminders for current user (or all for Admin/Manager) */
async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const filter: Record<string, unknown> = {};
    if (!['Admin', 'Manager'].includes(session.role)) filter.assignedTo = session.sub;
    else if (searchParams.get('userId')) filter.assignedTo = searchParams.get('userId');
    const completed = searchParams.get('completed');
    if (completed === 'false') filter.completed = false;
    if (completed === 'true')  filter.completed = true;
    if (searchParams.get('overdue') === 'true') { filter.dueAt = { $lte: new Date() }; filter.completed = false; }
    const reminders = await Reminder.find(filter).sort({ dueAt: 1 }).limit(100).lean();
    return NextResponse.json({ success: true, reminders });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** POST /api/reminders — create reminder. Body: { title, dueAt, description?, leadId?, assignedTo? } */
async function _POST(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;
  const { session, error } = await requireAuth(req);
  if (error) return error;
  try {
    await connectDB();
    const { title, description, dueAt, leadId, assignedTo: bodyAssignee } = await req.json();
    if (!title || !dueAt) return NextResponse.json({ success: false, error: 'title and dueAt required' }, { status: 400 });
    let assignedTo = session.sub;
    if (bodyAssignee && ['Admin', 'Manager'].includes(session.role)) assignedTo = bodyAssignee;
    const reminder = await Reminder.create({
      leadId: leadId || null, assignedTo, title, description: description || '',
      dueAt: new Date(dueAt),
      history: [{ event: `Created by ${session.name}`, at: new Date() }],
    });
    return NextResponse.json({ success: true, reminder }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** PATCH /api/reminders — update. Body: { id, completed?, dueAt?, title?, description? } */
async function _PATCH(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;
  const { session, error } = await requireAuth(req);
  if (error) return error;
  try {
    await connectDB();
    const { id, completed, dueAt, title, description } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const reminder = await Reminder.findById(id);
    if (!reminder) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (String(reminder.assignedTo) !== session.sub && !['Admin', 'Manager'].includes(session.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (completed !== undefined) { reminder.completed = completed; reminder.completedAt = completed ? new Date() : null; reminder.history.push({ event: completed ? `Completed by ${session.name}` : `Reopened by ${session.name}`, at: new Date() }); }
    if (dueAt) reminder.dueAt = new Date(dueAt);
    if (title) reminder.title = title;
    if (description !== undefined) reminder.description = description;
    await reminder.save();
    return NextResponse.json({ success: true, reminder });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/reminders?id=... */
async function _DELETE(req: NextRequest) {
  const csrfErr = csrfCheck(req);
  if (csrfErr) return csrfErr;
  const { session, error } = await requireAuth(req);
  if (error) return error;
  try {
    await connectDB();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const reminder = await Reminder.findById(id);
    if (!reminder) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    if (String(reminder.assignedTo) !== session.sub && !['Admin', 'Manager'].includes(session.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    await reminder.deleteOne();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
export const PATCH = withLogging(_PATCH);
export const DELETE = withLogging(_DELETE);
