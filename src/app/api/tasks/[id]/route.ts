import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, User, Project } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, isValidEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import mongoose from 'mongoose';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid task ID format.' }, { status: 400 });
    }

    const task = await Task.findById(id).lean() as any;
    if (!task || task.isDeleted) {
      return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });
    }

    // Resolve user workspace to isolate tasks
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    if (currentUser?.workspaceId && task.workspaceId && task.workspaceId.toString() !== currentUser.workspaceId.toString()) {
      return NextResponse.json({ success: false, error: 'Access denied: task outside workspace.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, task });
  } catch (err) {
    console.error('[GET /api/tasks/:id] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid task ID format.' }, { status: 400 });
    }

    const previousTask = await Task.findById(id).lean() as any;
    if (!previousTask || previousTask.isDeleted) {
      return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });
    }

    // Workspace Check
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    const userWorkspaceId = currentUser?.workspaceId;
    if (userWorkspaceId && previousTask.workspaceId && previousTask.workspaceId.toString() !== userWorkspaceId.toString()) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const isManagerOrAdmin = ['Admin', 'Manager'].includes(session.role);

    // Enforce assignee identity check for Employees and MRs
    if (!isManagerOrAdmin) {
      const isAssigned =
        (previousTask.assignedTo && previousTask.assignedTo.toString() === session.sub) ||
        (previousTask.assignee && (previousTask.assignee.toLowerCase() === session.name.toLowerCase() || previousTask.assignee.toLowerCase() === session.email.toLowerCase()));

      if (!isAssigned) {
        return NextResponse.json({ success: false, error: 'Access denied: You can only update tasks assigned to you.' }, { status: 403 });
      }
    }

    // Role-based metadata edit restrictions
    const managerOnlyFields = ['title', 'description', 'priority', 'dueDate', 'projectId', 'tags', 'assignedTo', 'assignee'];
    if (!isManagerOrAdmin) {
      const attemptedEdits = managerOnlyFields.filter(f => f in body);
      if (attemptedEdits.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Permission denied: Only managers can edit task details (${attemptedEdits.join(', ')}).`
        }, { status: 403 });
      }
    }

    const update: Record<string, any> = {};

    // ── Task Assignment changes & validation ──
    if (isManagerOrAdmin && (body.assignedTo || body.assignee)) {
      let resolvedNewAssignee = null;
      if (body.assignedTo) {
        if (mongoose.Types.ObjectId.isValid(body.assignedTo)) {
          resolvedNewAssignee = await User.findOne({ _id: body.assignedTo, deleted: { $ne: true } }).lean() as any;
        }
      } else if (body.assignee) {
        resolvedNewAssignee = await User.findOne({
          $or: [{ name: body.assignee }, { email: body.assignee }],
          deleted: { $ne: true }
        }).lean() as any;
      }

      if (resolvedNewAssignee) {
        // Workspace check
        if (userWorkspaceId && resolvedNewAssignee.workspaceId && resolvedNewAssignee.workspaceId.toString() !== userWorkspaceId.toString()) {
          return NextResponse.json({ success: false, error: 'Assignee belongs to a different workspace.' }, { status: 403 });
        }
        // Suspension check
        if (resolvedNewAssignee.suspended) {
          return NextResponse.json({ success: false, error: 'Assignee user is suspended.' }, { status: 400 });
        }
        // Allowed role check
        if (!['Employee', 'Staff', 'MR', 'User'].includes(resolvedNewAssignee.role)) {
          return NextResponse.json({ success: false, error: `User with role '${resolvedNewAssignee.role}' cannot be assigned tasks.` }, { status: 400 });
        }

        const prevAssignedStr = previousTask.assignedTo ? previousTask.assignedTo.toString() : '';
        const newAssignedStr = resolvedNewAssignee._id.toString();

        if (prevAssignedStr !== newAssignedStr) {
          // Log to assignment history
          const historyEntry = {
            previousAssignee: previousTask.assignedTo || null,
            previousAssigneeName: previousTask.assignee || 'Unassigned',
            newAssignee: resolvedNewAssignee._id,
            newAssigneeName: resolvedNewAssignee.name,
            changedBy: new mongoose.Types.ObjectId(session.sub),
            changedByName: session.name,
            reason: body.reassignmentReason || 'Task reassigned by manager.',
            timestamp: new Date()
          };

          update.assignedTo = resolvedNewAssignee._id;
          update.assignedRole = resolvedNewAssignee.role;
          update.assignee = resolvedNewAssignee.name;
          update.status = 'Assigned';
          update.stage = 'To Do';
          update.assignmentHistory = [...(previousTask.assignmentHistory || []), historyEntry];

          // Append to activity timeline
          update.activity = [...(previousTask.activity || []), {
            action: 'Reassigned',
            performedBy: session.name,
            performedById: new mongoose.Types.ObjectId(session.sub),
            timestamp: new Date()
          }];

          // Trigger notifications
          await createNotification(
            resolvedNewAssignee._id.toString(),
            'Task Assigned',
            `You have been assigned task "${previousTask.title}" by ${session.name}.`
          ).catch(console.error);
        }
      }
    }

    // ── Task Stage / Status Lifecycle State Machine ──
    const targetStage = body.stage || previousTask.stage;
    const targetStatus = body.status || previousTask.status;

    if (body.stage && body.stage !== previousTask.stage) {
      // Map stages and statuses
      let nextStatus = previousTask.status || 'Assigned';

      if (body.stage === 'In Progress') {
        nextStatus = 'In Progress';
        update.startedAt = new Date();
      } else if (body.stage === 'Review' || body.stage === 'Under Review') {
        nextStatus = 'Review Requested';
        update.reviewRequestedAt = new Date();
      } else if (body.stage === 'Done') {
        if (!isManagerOrAdmin) {
          return NextResponse.json({ success: false, error: 'Only Managers and Admins can approve tasks.' }, { status: 403 });
        }
        nextStatus = 'Approved';
        update.approvedAt = new Date();
        update.completedAt = new Date();
      }

      update.stage = body.stage;
      update.status = nextStatus;

      // Log transitions in timeline
      let actionLabel = 'Updated';
      if (nextStatus === 'In Progress') actionLabel = 'Started';
      else if (nextStatus === 'Review Requested') actionLabel = 'Review Requested';
      else if (nextStatus === 'Approved') actionLabel = 'Approved';

      update.activity = [...(update.activity || previousTask.activity || []), {
        action: actionLabel,
        performedBy: session.name,
        performedById: new mongoose.Types.ObjectId(session.sub),
        timestamp: new Date()
      }];

      // Generate notifications for lifecycle actions
      if (nextStatus === 'Review Requested') {
        // Notify creator/manager
        const mgrId = previousTask.assignedBy || session.sub;
        await createNotification(
          String(mgrId),
          'Review Requested',
          `Task "${previousTask.title}" submitted for review by ${session.name}.`
        ).catch(console.error);
      } else if (nextStatus === 'Approved') {
        // Notify worker
        if (previousTask.assignedTo) {
          await createNotification(
            previousTask.assignedTo.toString(),
            'Task Approved',
            `Your task "${previousTask.title}" has been approved and completed.`
          ).catch(console.error);
        }
      }
    }

    // Supports status updates (e.g. Employee accepting task)
    if (body.status && body.status !== previousTask.status) {
      if (body.status === 'Accepted') {
        update.status = 'Accepted';
        update.stage = 'To Do';
        update.acceptedAt = new Date();
        update.activity = [...(update.activity || previousTask.activity || []), {
          action: 'Accepted',
          performedBy: session.name,
          performedById: new mongoose.Types.ObjectId(session.sub),
          timestamp: new Date()
        }];

        // Notify manager
        const mgrId = previousTask.assignedBy || session.sub;
        await createNotification(
          String(mgrId),
          'Task Accepted',
          `Task "${previousTask.title}" was accepted by ${session.name}.`
        ).catch(console.error);
      } else if (body.status === 'Blocked') {
        update.status = 'Blocked';
        update.stage = 'Blocked';
        update.activity = [...(update.activity || previousTask.activity || []), {
          action: 'Blocked',
          performedBy: session.name,
          performedById: new mongoose.Types.ObjectId(session.sub),
          timestamp: new Date()
        }];
      } else if (body.status === 'Archived') {
        if (!isManagerOrAdmin) {
          return NextResponse.json({ success: false, error: 'Only managers can archive tasks.' }, { status: 403 });
        }
        update.status = 'Archived';
        update.archivedAt = new Date();
      }
    }

    // ── Checklist & Subtask Synchronization ──
    if (body.checklist && Array.isArray(body.checklist)) {
      update.checklist = body.checklist;
      // sync with subtasks
      update.subtasks = body.checklist.map((item: any) => ({ title: item.title, done: !!item.checked }));
      
      update.activity = [...(update.activity || previousTask.activity || []), {
        action: 'Checklist Updated',
        performedBy: session.name,
        performedById: new mongoose.Types.ObjectId(session.sub),
        timestamp: new Date()
      }];
    } else if (body.subtasks && Array.isArray(body.subtasks)) {
      update.subtasks = body.subtasks;
      // sync with checklist
      update.checklist = body.subtasks.map((item: any) => ({ title: item.title, checked: !!item.done }));
    }

    // ── Comments Handling ──
    if (body.commentText?.trim()) {
      const comment = {
        text: body.commentText.trim(),
        author: session.name,
        authorId: new mongoose.Types.ObjectId(session.sub),
        createdAt: new Date()
      };
      update.comments = [...(previousTask.comments || []), comment];

      update.activity = [...(update.activity || previousTask.activity || []), {
        action: 'Comment Added',
        performedBy: session.name,
        performedById: new mongoose.Types.ObjectId(session.sub),
        timestamp: new Date()
      }];

      // Notify other party
      const notifyTarget = isManagerOrAdmin ? previousTask.assignedTo : previousTask.assignedBy;
      if (notifyTarget) {
        await createNotification(
          notifyTarget.toString(),
          'New Comment Added',
          `${session.name} commented on task "${previousTask.title}".`
        ).catch(console.error);
      }
    }

    // Map remaining allowed fields
    const generalAllowed = ['title', 'description', 'priority', 'dueDate', 'projectId', 'tags', 'progress', 'logs', 'attachments'];
    for (const key of generalAllowed) {
      if (key in body && !(key in update)) {
        update[key] = body[key];
      }
    }

    // Auto-calculate progress if subtasks are updated
    if (update.subtasks && update.subtasks.length > 0) {
      const done = update.subtasks.filter((s: any) => s.done).length;
      update.progress = Math.round((done / update.subtasks.length) * 100);
    }

    // Save changes
    const task = await Task.findByIdAndUpdate(id, update, { new: true });
    if (!task) return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });

    // Global Activity Log
    await logActivity({
      userId: session.sub,
      actionType: 'task_update',
      module: 'Tasks',
      description: `Task "${task.title}" updated by ${session.name}. Progress: ${task.progress}%. Status: ${task.status}.`,
      req,
    }).catch(console.error);

    // Audit trail logging
    try {
      await logAudit({
        action: 'update_task',
        module: 'Tasks',
        entityId: task._id.toString(),
        entityType: 'Task',
        oldValue: previousTask,
        newValue: task.toObject(),
        session: {
          sub: session.sub,
          name: session.name,
          role: session.role,
          workspaceId: userWorkspaceId?.toString()
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Update task audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, task });
  } catch (err) {
    console.error('[PUT /api/tasks/:id] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return PUT(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid task ID format.' }, { status: 400 });
    }

    const task = await Task.findById(id);
    if (!task || task.isDeleted) {
      return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });
    }

    // Workspace scoping check
    const currentUser = await User.findById(session.sub).select('workspaceId').lean() as any;
    if (currentUser?.workspaceId && task.workspaceId && task.workspaceId.toString() !== currentUser.workspaceId.toString()) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    // Soft delete
    task.isDeleted = true;
    task.deletedAt = new Date();
    task.deletedBy = session.sub;
    await task.save();

    // Audit log deletion
    try {
      await logAudit({
        action: 'delete_task',
        module: 'Tasks',
        entityId: task._id.toString(),
        entityType: 'Task',
        oldValue: task.toObject(),
        newValue: null,
        session: {
          sub: session.sub,
          name: session.name,
          role: session.role,
          workspaceId: currentUser.workspaceId?.toString()
        },
        req
      });
    } catch (err: any) {
      console.error('[AuditLog] Delete task audit log failed:', err.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
