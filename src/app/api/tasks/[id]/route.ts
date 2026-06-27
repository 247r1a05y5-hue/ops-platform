import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Task, User } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { sendEmail, isValidEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const allowed = ['title', 'description', 'stage', 'priority', 'assignee', 'dueDate', 'tags', 'progress', 'subtasks', 'logs', 'attachments'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    // Capture previous stage for comparison
    const previousTask = await Task.findById(id).lean() as any;
    const task = await Task.findByIdAndUpdate(id, update, { new: true });
    if (!task) return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });

    // Determine what changed for email subject
    const stageChanged = previousTask && body.stage && previousTask.stage !== body.stage;
    const completed    = stageChanged && body.stage === 'Done';
    const assigned     = body.assignee && previousTask?.assignee !== body.assignee;

    const actionLabel = completed
      ? `Task Completed: ${task.title}`
      : stageChanged
      ? `Task Stage Updated: ${task.title}`
      : assigned
      ? `Task Reassigned: ${task.title}`
      : `Task Updated: ${task.title}`;

    const details = [
      stageChanged ? `Stage: ${previousTask?.stage} → ${task.stage}` : null,
      assigned ? `Assigned to: ${task.assignee}` : null,
      body.priority ? `Priority: ${task.priority}` : null,
    ].filter(Boolean).join('. ') || 'Task details updated.';

    // Notify assignee
    const assigneeIdentifier = task.assignee as string;
    if (assigneeIdentifier) {
      const assigneeUser = await User.findOne({
        $or: [{ email: assigneeIdentifier }, { name: assigneeIdentifier }],
      }).select('email name role').lean() as any;

      if (assigneeUser?.email && isValidEmail(assigneeUser.email)) {
        await sendEmail({
          event: 'task_update',
          to: assigneeUser.email,
          vars: {
            name: assigneeUser.name,
            role: assigneeUser.role || 'Employee',
            action: actionLabel,
            description: details,
          },
        }).catch(e => console.error('[TaskUpdate] assignee email failed:', e.message));
      }
    }

    // Admin copy
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'admin@ops.com';
    if (isValidEmail(adminEmail)) {
      await sendEmail({
        event: 'task_update',
        to: adminEmail,
        vars: {
          name: session.name,
          role: session.role,
          action: actionLabel,
          description: `Updated by ${session.name}. ${details}`,
        },
      }).catch(e => console.error('[TaskUpdate] admin email failed:', e.message));
    }

    await logActivity({
      userId: session.sub,
      actionType: 'task_update',
      module: 'Tasks',
      description: `Task "${task.title}" updated by ${session.name}. ${details}`,
      req,
    }).catch(console.error);

    // Outbound webhooks
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const { enqueueWebhook } = await import('@/lib/webhookQueue');
        const taskPayload = {
          taskId: task._id.toString(),
          code: task.code,
          title: task.title,
          description: task.description,
          stage: task.stage,
          priority: task.priority,
          assignee: task.assignee || "",
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          createdBy: task.createdBy || "",
        };

        const stageChanged = previousTask && body.stage && previousTask.stage !== body.stage;
        const completed    = stageChanged && body.stage === 'Done';
        const assigned     = body.assignee && previousTask?.assignee !== body.assignee;

        if (assigned) {
          console.log(`[Webhook] Enqueuing task_assigned event for task ${task.code}`);
          await enqueueWebhook({
            event: 'task_assigned',
            targetUrl: webhookUrl,
            payload: {
              event: 'task_assigned',
              timestamp: new Date().toISOString(),
              source: 'ops-platform',
              version: '1.0',
              data: taskPayload,
            },
          });
        }

        if (completed) {
          console.log(`[Webhook] Enqueuing task_completed event for task ${task.code}`);
          await enqueueWebhook({
            event: 'task_completed',
            targetUrl: webhookUrl,
            payload: {
              event: 'task_completed',
              timestamp: new Date().toISOString(),
              source: 'ops-platform',
              version: '1.0',
              data: taskPayload,
            },
          });
        }
      } catch (err: any) {
        console.error('[Webhook] Failed to enqueue task updated webhooks:', err.message);
      }
    }

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
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
        },
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Update task audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, task });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return PUT(req, ctx);
}


export async function DELETE(req: NextRequest, ctx: Ctx) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { error } = await requireAuth(req, ['Admin', 'Manager']);
  if (error) return error;

  try {
    await connectDB();
    const { id } = await ctx.params;
    const task = await Task.findByIdAndDelete(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found.' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
