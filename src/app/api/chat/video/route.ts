import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation } from '@/lib/db';

/**
 * POST /api/chat/video
 * Body: { conversationId }
 * Creates a Daily.co video room, saves it on the conversation, and returns the room URL.
 */
async function _POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  if (!conversationId)
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  await connectDB();

  const conv = await Conversation.findById(conversationId);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
  if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // If room already exists, just return it
  if (conv.videoRoomUrl) {
    return NextResponse.json({ success: true, url: conv.videoRoomUrl });
  }

  let roomUrl = '';
  const apiKey = process.env.DAILY_API_KEY;

  if (apiKey && apiKey !== 'your_daily_co_api_key_here') {
    try {
      const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          properties: {
            exp: Math.floor(Date.now() / 1000) + 3600 * 2, // expires in 2 hours
            enable_people_ui: true,
            enable_screenshare: true,
          },
        }),
      });

      if (dailyRes.ok) {
        const data = await dailyRes.json();
        roomUrl = data.url;
      } else {
        const errText = await dailyRes.text();
        console.error('[Daily.co API Error]', errText);
      }
    } catch (err) {
      console.error('[Daily.co Exception]', err);
    }
  }

  // Fallback room URL if API call fails or no API key provided
  if (!roomUrl) {
    // Generate a unique fallback URL.
    // Daily has a public sandbox, or we can use standard formatting.
    // For local testing, we generate a mock room URL:
    roomUrl = `https://ops-platform.daily.co/room-${conversationId.substring(18)}`;
  }

  // Save room URL in conversation
  conv.videoRoomUrl = roomUrl;
  await conv.save();

  return NextResponse.json({ success: true, url: roomUrl });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const POST = withLogging(_POST);
