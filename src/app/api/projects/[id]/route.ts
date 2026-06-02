import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Project, Task } from '@/lib/db';
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
    const { name, description, deadline, owner } = await req.json();
    const update: Record<string, unknown> = {};
    if (name)        update.name        = name.trim();
    if (description !== undefined) update.description = description;
    if (deadline)    update.deadline    = deadline;
    if (owner)       update.owner       = owner;

    const project = await Project.findByIdAndUpdate(id, update, { new: true });
    if (!project) return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });

    return NextResponse.json({ success: true, project });
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
    const project = await Project.findByIdAndDelete(id);
    if (!project) return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });

    // Unlink tasks from deleted project
    await Task.updateMany({ projectId: id }, { $unset: { projectId: '' } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
