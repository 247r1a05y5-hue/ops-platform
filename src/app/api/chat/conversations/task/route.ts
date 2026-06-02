import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Task, User, Workspace } from '@/lib/db';
import mongoose from 'mongoose';

/**
 * POST /api/chat/conversations/task
 * Body: { taskId, name? }
 * Finds or creates a group conversation linked to a Task.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId, name } = await req.json();
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });

  await connectDB();

  const currentUser = await User.findById(session.sub).lean() as any;
  if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const workspaceId = currentUser.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: 'User has no workspace' }, { status: 400 });

  const task = await Task.findById(taskId).lean() as any;
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // Check if a conversation linked to this task already exists in the workspace
  let conv = await Conversation.findOne({
    workspaceId,
    linkedTaskId: taskId,
  }).lean() as any;

  if (conv) {
    // If current user is not a participant, add them
    const hasUser = conv.participants.some((p: any) => String(p) === session.sub);
    if (!hasUser) {
      await Conversation.findByIdAndUpdate(conv._id, {
        $addToSet: { participants: new mongoose.Types.ObjectId(session.sub) }
      });
      conv = await Conversation.findById(conv._id).lean() as any;
    }
    return NextResponse.json({ success: true, conversation: conv });
  }

  // Create new conversation
  const participants = new Set<string>();
  participants.add(session.sub);

  // Attempt to resolve task assignee string to a User ObjectId
  if (task.assignee) {
    const assignedUser = await User.findOne({ name: task.assignee }).lean() as any;
    if (assignedUser) {
      participants.add(String(assignedUser._id));
    }
  }

  const newConv = await Conversation.create({
    workspaceId,
    type: 'group',
    name: name || `Task: ${task.title}`,
    participants: Array.from(participants).map(p => new mongoose.Types.ObjectId(p)),
    linkedTaskId: new mongoose.Types.ObjectId(taskId),
    linkedType: 'task',
    lastMessage: 'Conversation started',
    lastMessageAt: new Date(),
  });

  return NextResponse.json({ success: true, conversation: newConv });
}
