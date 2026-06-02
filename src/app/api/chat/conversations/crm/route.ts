import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Lead, User, Workspace } from '@/lib/db';
import mongoose from 'mongoose';

/**
 * POST /api/chat/conversations/crm
 * Body: { leadId, name? }
 * Finds or creates a group conversation linked to a CRM Lead.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { leadId, name } = await req.json();
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });

  await connectDB();

  const currentUser = await User.findById(session.sub).lean() as any;
  if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const workspaceId = currentUser.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: 'User has no workspace' }, { status: 400 });

  const lead = await Lead.findById(leadId).lean() as any;
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Check if a conversation linked to this lead already exists in the workspace
  let conv = await Conversation.findOne({
    workspaceId,
    linkedLeadId: leadId,
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
  if (lead.assignedTo) {
    participants.add(String(lead.assignedTo));
  }

  const newConv = await Conversation.create({
    workspaceId,
    type: 'group',
    name: name || `Lead: ${lead.name}`,
    participants: Array.from(participants).map(p => new mongoose.Types.ObjectId(p)),
    linkedLeadId: new mongoose.Types.ObjectId(leadId),
    linkedType: 'lead',
    lastMessage: 'Conversation started',
    lastMessageAt: new Date(),
  });

  return NextResponse.json({ success: true, conversation: newConv });
}
