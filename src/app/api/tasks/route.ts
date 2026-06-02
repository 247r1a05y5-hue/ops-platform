import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, Project, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, sendDualNotification, isValidEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import mongoose from 'mongoose';

const STAGES    = ['Backlog', 'In Progress', 'Review', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

function stagePrefix(stage: string) {
  const map: Record<string, string> = { 'Backlog': 'B', 'In Progress': 'P', 'Review': 'R', 'Done': 'D' };
  return map[stage] ?? 'T';
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const query = projectId ? { projectId } : {};
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, tasks });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { title, description, stage, priority, assignee, dueDate, projectId, tags } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required.' }, { status: 400 });
    }

    // ── projectId reference integrity check ─────────────────────────────────
    let resolvedProjectId: mongoose.Types.ObjectId | undefined;
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid projectId format.' },
          { status: 400 }
        );
      }
      const projectExists = await Project.exists({ _id: projectId });
      if (!projectExists) {
        return NextResponse.json(
          { success: false, error: `Project '${projectId}' does not exist.` },
          { status: 404 }
        );
      }
      resolvedProjectId = new mongoose.Types.ObjectId(projectId);
    }

    const resolvedStage    = STAGES.includes(stage)     ? stage    : 'Backlog';
    const resolvedPriority = PRIORITIES.includes(priority) ? priority : 'Medium';

    const count = await Task.countDocuments();
    const code  = `${stagePrefix(resolvedStage)}-${count + 1}`;

    const task = await Task.create({
      title: title.trim(),
      description: description ?? '',
      stage: resolvedStage,
      priority: resolvedPriority,
      assignee: assignee ?? '',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      projectId: resolvedProjectId,
      tags: Array.isArray(tags) ? tags : [],
      code,
      createdBy: session.name,
    });

    // ── Email assignee + admin on task creation ───────────────────────────
    if (task.assignee) {
      // Look up assignee by name or email
      const assigneeUser = await User.findOne({
        $or: [{ email: task.assignee }, { name: task.assignee }],
      }).select('email name role').lean() as any;

      if (assigneeUser?.email && isValidEmail(assigneeUser.email)) {
        await sendEmail({
          event: 'task_update',
          to: assigneeUser.email,
          vars: {
            name: assigneeUser.name,
            role: assigneeUser.role || 'Employee',
            action: `New Task Assigned: ${task.title}`,
            description: `You have been assigned a new task: "${task.title}" (${task.priority} priority, due ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'no deadline'}). Stage: ${task.stage}.`,
          },
        }).catch(e => console.error('[TaskCreate] assignee email failed:', e.message));
      }

      // Admin copy
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@ops.com';
      if (isValidEmail(adminEmail)) {
        await sendEmail({
          event: 'task_update',
          to: adminEmail,
          vars: {
            name: session.name,
            role: session.role,
            action: `Task Created & Assigned: ${task.title}`,
            description: `${session.name} created task "${task.title}" assigned to ${task.assignee} (${task.priority} priority).`,
          },
        }).catch(e => console.error('[TaskCreate] admin email failed:', e.message));
      }
    }

    await logActivity({
      userId: session.sub,
      actionType: 'task_creation',
      module: 'Tasks',
      description: `Task "${task.title}" created by ${session.name}, assigned to ${task.assignee || 'unassigned'}`,
      req,
    }).catch(console.error);

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
