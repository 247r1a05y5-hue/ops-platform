import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Message, Conversation } from '@/lib/db';
import { pushChatSSE } from '@/lib/chat-sse';
import mongoose from 'mongoose';

/**
 * POST /api/chat/react
 * Body: { messageId, emoji }
 * Toggles the emoji reaction for the current user on the message.
 * Pushes SSE reaction_update to all conversation participants.
 */
async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messageId, emoji } = await req.json();
  if (!messageId || !emoji)
    return NextResponse.json({ error: 'messageId and emoji required' }, { status: 400 });

  await connectDB();

  const msg = await Message.findById(messageId);
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const userId = new mongoose.Types.ObjectId(session.sub);
  const reactions: any[] = (msg as any).reactions ?? [];
  const existing = reactions.find((r: any) => r.emoji === emoji);

  if (existing) {
    const hasReacted = existing.users.some((u: any) => String(u) === session.sub);
    if (hasReacted) {
      // Remove user from reaction
      await Message.findByIdAndUpdate(messageId, {
        $pull: { 'reactions.$[el].users': userId },
      }, { arrayFilters: [{ 'el.emoji': emoji }] });
      // Clean up empty reaction arrays
      await Message.findByIdAndUpdate(messageId, {
        $pull: { reactions: { emoji, users: { $size: 0 } } },
      });
    } else {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { 'reactions.$[el].users': userId },
      }, { arrayFilters: [{ 'el.emoji': emoji }] });
    }
  } else {
    await Message.findByIdAndUpdate(messageId, {
      $push: { reactions: { emoji, users: [userId] } },
    });
  }

  const updated = await Message.findById(messageId).lean() as any;
  const updatedReactions = (updated.reactions ?? []).map((r: any) => ({
    emoji: r.emoji,
    users: r.users.map(String),
    count: r.users.length,
  }));

  // Push SSE to all participants
  const conv = await Conversation.findById(updated.conversationId).lean() as any;
  if (conv) {
    const ssePayload = {
      type: 'reaction_update',
      messageId: String(messageId),
      conversationId: String(updated.conversationId),
      reactions: updatedReactions,
    };
    for (const p of conv.participants) {
      pushChatSSE(String(p), ssePayload);
    }
  }

  return NextResponse.json({ success: true, reactions: updatedReactions });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
