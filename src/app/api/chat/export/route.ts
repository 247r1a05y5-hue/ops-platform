import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, ChatAuditLog, User } from '@/lib/db';

/**
 * GET /api/chat/export?conversationId=&format=json|csv
 * Admin-only. Exports full conversation message history and writes a ChatAuditLog entry.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'Admin')
    return NextResponse.json({ error: 'Forbidden — Admin only' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';

  if (!conversationId)
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  await connectDB();

  const conv = await Conversation.findById(conversationId).lean() as any;
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // Fetch ALL messages (no pagination — this is a full export)
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean() as any[];

  // Write immutable audit log entry
  await ChatAuditLog.create({
    workspaceId:    conv.workspaceId,
    conversationId: conv._id,
    exportedBy:     session.sub,
    exportedByName: session.name,
    format,
    messageCount:   messages.length,
  });

  if (format === 'csv') {
    const header = 'id,senderName,body,createdAt,attachmentCount,reactionCount\n';
    const rows = messages.map((m: any) => [
      String(m._id),
      `"${(m.senderName ?? '').replace(/"/g, '""')}"`,
      `"${(m.deleted ? '[deleted]' : m.body ?? '').replace(/"/g, '""')}"`,
      new Date(m.createdAt).toISOString(),
      m.attachments?.length ?? 0,
      m.reactions?.length ?? 0,
    ].join(',')).join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="chat-export-${conversationId}-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    conversation: {
      _id:         String(conv._id),
      name:        conv.name,
      type:        conv.type,
      linkedType:  conv.linkedType ?? '',
    },
    messages: messages.map((m: any) => ({
      _id:         String(m._id),
      senderId:    String(m.senderId),
      senderName:  m.senderName,
      body:        m.deleted ? '[deleted]' : m.body,
      createdAt:   m.createdAt,
      attachments: m.attachments ?? [],
      reactions:   (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji, count: r.users?.length ?? 0 })),
    })),
    exportedAt: new Date().toISOString(),
    exportedBy: session.name,
  });
}
