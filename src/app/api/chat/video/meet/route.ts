import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message, MessageReadStatus, Meeting, ActivityLog, User, Workspace, GmailToken } from '@/lib/db';
import { getIO } from '@/lib/socket-server';
import { getGmailAccessToken } from '@/app/api/gmail/oauth/route';
import { google } from 'googleapis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/video/meet
 * Body: { conversationId }
 * Starts a video meeting by integrating Google Calendar/Meet API.
 * Logs the creation activity, saves it to DB, auto-posts in chat, and broadcasts via Socket.IO.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  if (!conversationId)
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  await connectDB();

  // 1. Verify user is in conversation
  const conv = await Conversation.findById(conversationId);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
  if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sender = await User.findById(session.sub).lean() as any;
  if (!sender) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  let meetUrl = '';
  let apiUsed = false;

  // 2. Google Calendar API Integration — Central Account Model
  // All meetings are created using the central Admin's Google OAuth token.
  // This means any user (Admin, Manager, Employee) can start meetings
  // without needing their own Google account connected.
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const hasGoogleConfig = googleClientId && googleClientSecret &&
                            googleClientId !== 'YOUR_GOOGLE_CLIENT_ID_PLACEHOLDER' &&
                            googleClientSecret !== 'YOUR_GOOGLE_CLIENT_SECRET_PLACEHOLDER';

    if (!hasGoogleConfig) {
      return NextResponse.json(
        { error: 'Google OAuth configuration is missing. Cannot generate a Google Meet link.' },
        { status: 400 }
      );
    }

    console.info(`[Video Meet] ── MEETING CREATION ATTEMPT (User-Owned Accounts Model) ──`);
    console.info(`  Initiating User: ID=${session.sub}, Email=${session.email}, Name=${session.name}, Role=${session.role}`);

    // ── Step 1: Find the initiating user's GmailToken ────────────────────────
    const userAccessToken = await getGmailAccessToken(session.sub);
    const tokenRecord = await GmailToken.findOne({ userId: session.sub }).lean();

    if (!userAccessToken) {
      console.error(`[Video Meet] No Google account token found for user ${session.sub} (${session.email}).`);
      return NextResponse.json(
        { error: 'You must connect your Google account in Settings → Integrations before you can start a Google Meet.' },
        { status: 401 }
      );
    }

    const userGoogleEmail = tokenRecord?.email ?? 'unknown';
    console.info(`  Using Google Account to Create Meet: ${userGoogleEmail}`);
    console.info(`  NOTE: This account will be the Google Calendar organizer/host.`);

    // ── Step 2: Build attendee list from conversation participants ────────────
    // Pre-accept other participants so they can bypass the waiting room.
    // We filter out the initiator themselves since they are the organizer/host.
    const participants = await User.find({ _id: { $in: conv.participants } }).select('email name').lean() as any[];
    const attendees = participants
      .filter((p: any) => String(p._id) !== session.sub)
      .map((p: any) => ({
        email: p.email,
        responseStatus: 'accepted', // Pre-accept so they bypass the waiting room
      }));
    console.info(`  Conversation Participants (Attendees):`, JSON.stringify(attendees));

    // ── Step 3: Create the Google Calendar event with Meet ────────────────────
    const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret);
    oauth2Client.setCredentials({ access_token: userAccessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const requestId = `ops-meet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.info(`  Inserting calendar event with requestId=${requestId}...`);

    const calendarRes = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'none', // Don't spam participants with Google Calendar invites
      requestBody: {
        summary: `OPS Video Call — ${session.name}`,
        description: `Meeting started by ${session.name} (${session.email}) via OPS Platform.\nOther conversation participants have been pre-invited.`,
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date(Date.now() + 3600 * 1000).toISOString() },
        attendees,
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        visibility: 'default',
      },
    });

    if (calendarRes.data.hangoutLink) {
      meetUrl = calendarRes.data.hangoutLink;
      apiUsed = true;
      console.info(`[Video Meet] ✅ Google Calendar Event Created Successfully!`);
      console.info(`  Meet Link: ${meetUrl}`);
      console.info(`  Event ID: ${calendarRes.data.id}`);
      console.info(`  Organizer (Google Event): ${JSON.stringify(calendarRes.data.organizer)}`);
      console.info(`  Creator  (Google Event): ${JSON.stringify(calendarRes.data.creator)}`);
      console.info(`  ─────────────────────────────────────────────────────────────`);
      console.info(`  IMPORTANT: The Google Meet host is '${userGoogleEmail}'.`);
      console.info(`  Participants who join using a Google account matching their app email`);
      console.info(`  will bypass the waiting room (they are pre-accepted attendees).`);
      console.info(`  Participants using a different Google account will need host admission.`);
      console.info(`  ─────────────────────────────────────────────────────────────`);
    } else {
      throw new Error('Google Calendar API did not return a hangoutLink.');
    }
  } catch (err: any) {
    const googleMsg = err?.cause?.message ?? err?.message ?? String(err);
    const googleCode = err?.code ?? err?.status ?? 'unknown';
    const googleErrors = err?.cause?.errors ?? err?.errors ?? [];

    console.error('[Video Meet] ❌ Google API calendar creation failed:');
    console.error('  Code:', googleCode);
    console.error('  Message:', googleMsg);
    console.error('  Errors:', JSON.stringify(googleErrors));

    let userMessage = 'Failed to create Google Meet link.';
    if (googleMsg.includes('disabled') || googleMsg.includes('has not been used')) {
      userMessage = 'Google Calendar API is not enabled in Google Cloud Console. Please ask your Admin to enable it.';
    } else if (googleCode === 401 || googleMsg.includes('invalid_grant') || googleMsg.includes('token')) {
      userMessage = 'Your Google account token has expired or was revoked. Please reconnect your Google account in Settings → Integrations.';
    } else if (googleCode === 403 || googleMsg.includes('insufficient')) {
      userMessage = 'Insufficient Google Calendar permissions on your account. Please reconnect your Google account in Settings → Integrations.';
    }

    return NextResponse.json({ error: userMessage, debug: { googleCode, googleMessage: googleMsg } }, { status: 500 });
  }

  const meetingId = `meet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // 4. Create meeting record in MongoDB
  const meeting = await Meeting.create({
    meetingId,
    creatorId: session.sub,
    creatorName: session.name,
    roomId: conversationId,
    meetingLink: meetUrl,
    status: 'active',
    createdAt: new Date(),
  });

  // 5. Track and log meeting creation activity
  try {
    await ActivityLog.create({
      userId: session.sub,
      name: session.name,
      userEmail: sender.email,
      userRole: sender.role,
      actionType: 'video_call_creation',
      module: 'chat',
      description: `Started a Google Meet video call: ${meetUrl}`,
      metadata: { conversationId, meetingId, meetingLink: meetUrl, apiUsed },
      timestamp: new Date()
    });
  } catch (logErr) {
    console.error('[Video Meet] Failed to save ActivityLog:', logErr);
  }

  // 6. Format and send automatic chat message
  const createdTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const messageBody = `🎥 Video Meeting Started\n\nStarted By: ${session.name}\n\n🔗 Join Meeting:\n${meetUrl}\n\n🕒 Time:\n${createdTime}\n\nClick the link above to join the meeting.`;

  const msg = await Message.create({
    conversationId: conv._id,
    workspaceId: conv.workspaceId || 'ops-main',
    senderId: session.sub,
    senderName: session.name,
    body: messageBody,
  });

  // Update conversation last message details
  await Conversation.findByIdAndUpdate(conv._id, {
    lastMessage: `🎥 Video Meeting Started`,
    lastMessageAt: msg.createdAt,
    lastMessageBy: session.sub,
  });

  await MessageReadStatus.findOneAndUpdate(
    { conversationId: conv._id, userId: session.sub },
    { lastReadAt: msg.createdAt, lastReadMsgId: msg._id },
    { upsert: true }
  );

  // 7. Real-Time Communication via Socket.IO
  const io = getIO();
  const messagePayload = {
    type: 'new_message',
    message: {
      _id: String(msg._id),
      conversationId: String(conv._id),
      senderId: session.sub,
      senderName: session.name,
      body: msg.body,
      createdAt: msg.createdAt,
      parentMessageId: null,
      attachments: [],
      reactions: [],
      replyCount: 0,
      deleted: false,
    },
  };

  const notifyPayload = {
    type: 'video_meeting_started',
    meetingId: meeting.meetingId,
    creatorName: session.name,
    meetingLink: meetUrl,
    conversationId: String(conv._id),
    conversationName: conv.name || 'Direct Message',
  };

  if (io) {
    // Broadcast message to room members in the room view
    io.to(`conv:${String(conv._id)}`).emit('chat_event', messagePayload);

    // Push new message and instant meeting notifications to all participants' individual rooms
    for (const participantId of conv.participants) {
      io.to(`user:${String(participantId)}`).emit('chat_event', messagePayload);
      
      // Send real-time toast signal to other online participants
      if (String(participantId) !== String(session.sub)) {
        io.to(`user:${String(participantId)}`).emit('chat_event', notifyPayload);
      }
    }
    console.info(`[Video Meet] Sockets broadcasted to room conv:${conv._id}`);
  } else {
    console.warn('[Video Meet] Socket.IO server not available, relying on manual refresh / database persistence.');
  }

  return NextResponse.json({
    success: true,
    meetingId: meeting.meetingId,
    meetingLink: meetUrl,
    messageId: String(msg._id),
  });
}
