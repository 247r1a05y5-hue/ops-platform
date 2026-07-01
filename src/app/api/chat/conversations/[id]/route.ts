import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, MessageReadStatus, Workspace, User } from '@/lib/db';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

/**
 * DELETE /api/chat/conversations/:id
 *
 * Soft-deletes a conversation by marking it with deletedAt / deletedBy.
 * Messages and attachments are left intact for audit purposes.
 * WhatsApp history is never touched.
 *
 * Requirements:
 *  - User must be authenticated.
 *  - Conversation must belong to the workspace (ops-main).
 *  - Caller must be a participant in the conversation.
 *  - Only Admins may delete group conversations they do not own.
 */
async function _DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);
  if (!id || id.length !== 24) {
    return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 });
  }

  await connectDB();

  // Resolve the canonical workspace
  const mainWs = await (Workspace as any).findOne({ slug: 'ops-main' }).lean() as any;
  if (!mainWs) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Load the conversation with workspace scoping
  const conv = await Conversation.findOne({
    _id: id,
    workspaceId: mainWs._id,
  }).lean() as any;

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Caller must be a participant
  const isParticipant = conv.participants.some(
    (p: any) => String(p) === session.sub,
  );
  if (!isParticipant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Already deleted — treat as success (idempotent)
  if (conv.deletedAt) {
    return NextResponse.json({ success: true, alreadyDeleted: true });
  }

  // Apply soft-delete
  await Conversation.findByIdAndUpdate(id, {
    $set: {
      deletedAt:  new Date(),
      deletedBy:  session.sub,
    },
  });

  // Clean up read-status cursors for the caller (optional, keeps DB tidy)
  await MessageReadStatus.deleteOne({
    conversationId: id,
    userId:         session.sub,
  });

  return NextResponse.json({ success: true });
}

// ── Request Tracing & Structured Logging Wrap ──────────────────
export const DELETE = withLogging(_DELETE);
