import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Project } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const projects = await Project.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, projects });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { name, description, deadline, owner } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Project name is required.' }, { status: 400 });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description ?? '',
      deadline: deadline ?? '',
      owner: owner ?? session.name,
      createdBy: session.name,
    });

    return NextResponse.json({ success: true, project }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
