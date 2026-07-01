import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Message, Conversation } from '@/lib/db';
import { pushChatSSE } from '@/lib/chat-sse';

/**
 * POST /api/chat/admin/moderate
 * Body: { messageId, action: 'flag'|'unflag'|'delete', reason? }
 * Admin only. Flag, unflag, or hard-delete a message and notify participants via SSE.
 */
async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { messageId, action, reason } = await req.json();
  if (!messageId || !action)
    return NextResponse.json({ error: 'messageId and action required' }, { status: 400 });

  await connectDB();

  const msg = await Message.findById(messageId);
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  let update: any = {};
  if (action === 'flag') {
    update = { flagged: true, flaggedBy: session.sub, flagReason: reason ?? '' };
  } else if (action === 'unflag') {
    update = { flagged: false, flaggedBy: null, flagReason: '' };
  } else if (action === 'delete') {
    update = { deleted: true };
  } else {
    return NextResponse.json({ error: 'Invalid action. Use flag|unflag|delete' }, { status: 400 });
  }

  await Message.findByIdAndUpdate(messageId, update);

  // Notify participants when a message is deleted
  if (action === 'delete') {
    const conv = await Conversation.findById(msg.conversationId).lean() as any;
    if (conv) {
      const payload = {
        type: 'message_deleted',
        messageId: String(messageId),
        conversationId: String(msg.conversationId),
      };
      for (const p of conv.participants) {
        pushChatSSE(String(p), payload);
      }
    }
  }

  return NextResponse.json({ success: true, action, messageId: String(messageId) });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
