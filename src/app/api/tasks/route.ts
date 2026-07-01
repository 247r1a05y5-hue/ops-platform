import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, Project, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, isValidEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';
import mongoose from 'mongoose';

// ── Workspace isolation helper ─────────────────────────────────────────────────
// Resolves the workspaceId of the current session user from DB.
// Tasks have no workspaceId field, so we scope them by restricting to assignees
// who belong to the same workspace. When no workspace is found, no filter is applied
// (single-tenant safe).
const memberCache = new Map<string, { identifiers: string[] | null; expiresAt: number }>();
const MEMBER_CACHE_TTL = 15000;

async function getWorkspaceMemberNames(userId: string): Promise<string[] | null> {
  const now = Date.now();
  const cached = memberCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.identifiers;
  }

  try {
    const currentUser = await User.findById(userId).select('workspaceId').lean() as any;
    if (!currentUser?.workspaceId) {
      memberCache.set(userId, { identifiers: null, expiresAt: now + MEMBER_CACHE_TTL });
      return null;
    }
    const members = await User.find({ workspaceId: currentUser.workspaceId })
      .select('name email').lean() as any[];
    const identifiers = members.flatMap((m: any) => [m.name, m.email].filter(Boolean));
    memberCache.set(userId, { identifiers, expiresAt: now + MEMBER_CACHE_TTL });
    return identifiers;
  } catch {
    return null;
  }
}

const STAGES = ['Backlog', 'In Progress', 'Review', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

function stagePrefix(stage: string) {
  const map: Record<string, string> = { Backlog: 'B', 'In Progress': 'P', Review: 'R', Done: 'D' };
  return map[stage] ?? 'T';
}
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function _GET(req: NextRequest) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    // Resolve current user workspace
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    const workspaceId = currentUser?.workspaceId;
    const workspaceMemberNames = workspaceId ? await getWorkspaceMemberNames(session.sub) : null;

    const query: Record<string, any> = { isDeleted: { $ne: true } };

    // Strict workspace scoping (falls back to ops-main if missing to prevent leakage)
    if (workspaceId) {
      query.$or = [
        { workspaceId },
        { workspaceId: { $exists: false } },
        { workspaceId: null }
      ];
    }

    if (projectId) {
      if (mongoose.Types.ObjectId.isValid(projectId)) {
        query.projectId = new mongoose.Types.ObjectId(projectId);
      } else {
        query.projectId = null;
      }
    }

    // Role-based visibility enforcement
    // Employees and MRs can only retrieve tasks assigned specifically to them, or general role tasks if not assigned to someone else
    if (session.role === 'Staff' || session.role === 'Employee' || session.role === 'MR' || session.role === 'User') {
      const assigneeMatches = [session.name, session.email].filter(Boolean) as string[];
      if (workspaceMemberNames?.length) {
        assigneeMatches.push(...workspaceMemberNames);
      }
      query.$and = [
        {
          $or: [
  { assignedTo: new mongoose.Types.ObjectId(session.sub) },
  { assignee: session.name },
  { assignee: session.email },
  {
    assignedRole: session.role,
    $or: [
      { assignedTo: { $exists: false } },
      { assignedTo: null }
    ]
  }
]        }
      ];
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, tasks }, {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  } catch (err) {
    console.error('[GET /api/tasks] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }
    });
  }
}

async function _POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  // Strict check: only Admin or Manager can create tasks
  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { title, description, priority, stage, assignedTo, assignee, dueDate, projectId, tags, checklist } = body;

    // Validate required fields
    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required.' }, { status: 400 });
    }

    // Resolve creator's workspaceId
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    const workspaceId = currentUser?.workspaceId;

    // Validate project existence and workspace matching
    let resolvedProjectId: mongoose.Types.ObjectId | undefined;
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        return NextResponse.json({ success: false, error: 'Invalid projectId format.' }, { status: 400 });
      }
      const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } }).lean() as any;
      if (!project) {
        return NextResponse.json({ success: false, error: `Project '${projectId}' does not exist.` }, { status: 404 });
      }
      // Workspace validation
      if (workspaceId && project.workspaceId && project.workspaceId.toString() !== workspaceId.toString()) {
        return NextResponse.json({ success: false, error: 'Project workspace mismatch.' }, { status: 403 });
      }
      resolvedProjectId = new mongoose.Types.ObjectId(projectId);
    }

    // Validate and resolve assignee
    let resolvedAssignee = null;
    if (assignedTo) {
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return NextResponse.json({ success: false, error: 'Invalid assignedTo format.' }, { status: 400 });
      }
      resolvedAssignee = await User.findOne({ _id: assignedTo, deleted: { $ne: true } }).lean() as any;
    } else if (assignee) {
      resolvedAssignee = await User.findOne({
        $or: [{ email: assignee }, { name: assignee }],
        deleted: { $ne: true }
      }).lean() as any;
    }

    if (resolvedAssignee) {
      // Validate Workspace isolation
      if (workspaceId && resolvedAssignee.workspaceId && resolvedAssignee.workspaceId.toString() !== workspaceId.toString()) {
        return NextResponse.json({ success: false, error: 'Assignee belongs to a different workspace.' }, { status: 403 });
      }
      // Validate suspension
      if (resolvedAssignee.suspended) {
        return NextResponse.json({ success: false, error: 'Cannot assign task to a suspended user.' }, { status: 400 });
      }
      // Validate role clearance: only Employee/Staff/MR/User
      const allowedRoles = ['Employee', 'Staff', 'MR', 'User'];
      const isAllowed = allowedRoles.some(r => r.toLowerCase() === (resolvedAssignee.role || '').toLowerCase());
      if (!isAllowed) {
        return NextResponse.json({ success: false, error: `Assignee role '${resolvedAssignee.role}' is not authorized for task assignments.` }, { status: 400 });
      }
    }

    let resolvedAssignedRole = body.assignedRole || (resolvedAssignee ? resolvedAssignee.role : '');
    if (resolvedAssignedRole) {
      const allowedRoles = ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'];
      const isAllowed = allowedRoles.some(r => r.toLowerCase() === resolvedAssignedRole.toLowerCase());
      if (!isAllowed) {
        return NextResponse.json({ success: false, error: `Invalid assigned role '${resolvedAssignedRole}'.` }, { status: 400 });
      }
      // Normalize role casing
      const roleMap: Record<string, string> = {
        admin: 'Admin',
        manager: 'Manager',
        staff: 'Staff',
        user: 'User',
        employee: 'Employee',
        mr: 'MR'
      };
      resolvedAssignedRole = roleMap[resolvedAssignedRole.toLowerCase()] || resolvedAssignedRole;
    }

    // Validate due date
    let resolvedDueDate: Date | undefined;
    if (dueDate) {
      const parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid due date format.' }, { status: 400 });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDate < today) {
        return NextResponse.json({ success: false, error: 'Due date cannot be in the past.' }, { status: 400 });
      }
      resolvedDueDate = parsedDate;
    }

    // Setup sequential code numbering per workspace
    const taskCount = await Task.countDocuments({ workspaceId, isDeleted: { $ne: true } });
    const taskNumber = taskCount + 1;
    const code = `TSK-${taskNumber}`;

    // Establish checklist & subtasks synchronization
    const mappedChecklist = Array.isArray(checklist)
      ? checklist.map((item: any) => typeof item === 'string' ? { title: item, checked: false } : { title: item.title, checked: !!item.checked })
      : [];
    const mappedSubtasks = mappedChecklist.map((item: any) => ({ title: item.title, done: item.checked }));

    const resolvedPriority = PRIORITIES.includes(priority) ? priority : 'Medium';
    const resolvedStage = ['Backlog', 'To Do', 'In Progress', 'Review', 'Under Review', 'Done', 'Blocked'].includes(stage) ? stage : (resolvedAssignee ? 'To Do' : 'Backlog');
    const initialStatus = resolvedAssignee ? 'Assigned' : 'Draft';

    const task = await Task.create({
      title: title.trim(),
      description: description ?? '',
      stage: resolvedStage,
      priority: resolvedPriority,
      assignee: resolvedAssignee ? resolvedAssignee.name : '',
      assignedTo: resolvedAssignee ? resolvedAssignee._id : null,
      assignedRole: resolvedAssignedRole,
      assignedBy: session.sub,
      workspaceId,
      status: initialStatus,
      dueDate: resolvedDueDate,
      projectId: resolvedProjectId,
      tags: Array.isArray(tags) ? tags : [],
      code,
      taskNumber,
      createdBy: session.name,
      checklist: mappedChecklist,
      subtasks: mappedSubtasks,
      activity: [{
        action: resolvedAssignee ? 'Assigned' : 'Created',
        performedBy: session.name,
        performedById: new mongoose.Types.ObjectId(session.sub),
        timestamp: new Date()
      }]
    });

    // Generate notifications
    if (resolvedAssignee) {
      await createNotification(
        resolvedAssignee._id.toString(),
        'Task Assigned',
        `You have been assigned task "${task.title}" by ${session.name}. Priority: ${task.priority}.`
      ).catch(e => console.error('[TaskCreate] notification failed:', e.message));

      if (resolvedAssignee.email && isValidEmail(resolvedAssignee.email)) {
        await sendEmail({
          event: 'task_update',
          to: resolvedAssignee.email,
          vars: {
            name: resolvedAssignee.name,
            role: resolvedAssignee.role || 'Employee',
            action: `New Task Assigned: ${task.title}`,
            description: `You have been assigned a new task: "${task.title}" (${task.priority} priority, due ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'no deadline'}).`,
          },
        }).catch(e => console.error('[TaskCreate] assignee email failed:', e.message));
      }
    }

    // Global Activity Logging
    await logActivity({
      userId: session.sub,
      actionType: 'task_creation',
      module: 'Tasks',
      description: `Task "${task.title}" (${task.code}) created by ${session.name}, assigned to ${task.assignee || 'unassigned'}`,
      req,
    }).catch(console.error);

    // Audit trail logging
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'create_task',
        module: 'Tasks',
        entityId: task._id.toString(),
        entityType: 'Task',
        newValue: task.toObject(),
        session: {
          sub: session.sub,
          name: session.name,
          role: session.role,
          workspaceId: workspaceId?.toString()
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Create task audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
export const POST = withLogging(_POST);
