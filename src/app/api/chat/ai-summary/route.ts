import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { connectDB, Conversation, Message } from '@/lib/db';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Keyword-frequency fallback summarizer — works without an API key.
 */
function buildFallbackSummary(messages: any[]): string {
  if (messages.length === 0) return 'No messages to summarize.';

  const participants = [...new Set(messages.map((m: any) => m.senderName))].join(', ');
  const stopWords = new Set([
    'the','and','that','this','with','have','from','they','will','been','your',
    'more','when','were','what','then','than','which','their','there','could',
    'would','should','about','these','those','some','into','each','just','also',
  ]);

  const wordFreq: Record<string, number> = {};
  for (const m of messages) {
    for (const w of (m.body ?? '').toLowerCase().split(/\s+/)) {
      const clean = w.replace(/[^a-z]/g, '');
      if (clean.length > 4 && !stopWords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] ?? 0) + 1;
      }
    }
  }
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
    .join(', ');

  const first = new Date(messages[0].createdAt).toLocaleDateString();
  const last  = new Date(messages[messages.length - 1].createdAt).toLocaleDateString();

  return `This conversation has ${messages.length} messages between ${participants} (${first} – ${last}). Key topics discussed: ${topWords || 'general discussion'}.`;
}

/**
 * GET /api/chat/ai-summary?conversationId=
 * Returns a Gemini-powered (or fallback) summary of the last 50 messages.
 * Results are cached on the Conversation document for 10 minutes.
 */
async function _GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  if (!conversationId)
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  await connectDB();

  const conv = await Conversation.findById(conversationId) as any;
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const isParticipant = conv.participants.some((p: any) => String(p) === session.sub);
  if (!isParticipant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Return cache if still fresh
  if (conv.aiSummaryCache && conv.aiSummaryCachedAt) {
    const age = Date.now() - new Date(conv.aiSummaryCachedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, summary: conv.aiSummaryCache, cached: true });
    }
  }

  const messages = await Message.find({ conversationId, deleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean() as any[];

  const chronological = messages.reverse();
  let summary: string;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    try {
      const prompt = [
        'You are an expert business assistant summarizing a team chat conversation.',
        'Write a concise 3–5 sentence summary covering:',
        '1. Key topics discussed  2. Decisions made (if any)  3. Action items (if any)',
        'Be specific and professional. Do not start with "This conversation".\n',
        'Conversation:',
        chronological.map((m: any) => `${m.senderName}: ${m.body}`).join('\n'),
        '\nSummary:',
      ].join('\n');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 350, temperature: 0.3 },
          }),
        }
      );
      const data = await res.json();
      summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? buildFallbackSummary(chronological);
    } catch {
      summary = buildFallbackSummary(chronological);
    }
  } else {
    summary = buildFallbackSummary(chronological);
  }

  // Cache result on conversation
  await Conversation.findByIdAndUpdate(conversationId, {
    aiSummaryCache:    summary,
    aiSummaryCachedAt: new Date(),
  });

  return NextResponse.json({ success: true, summary, cached: false });
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
