'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Send, MessageSquare, Plus, Users, X, Search,
  Paperclip, Smile, Flag, Video, Sparkles, Download,
  FileText, CornerDownRight, MessageCircle, Loader2,
  AlertCircle, PhoneCall, PhoneOff, PhoneIncoming,
  MicOff, VideoOff, CheckCheck, Check, Mic, Camera,
  ArrowLeft, MonitorPlay, MoreVertical, Trash2,
  BellOff, CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { useSearchParams } from 'next/navigation';
import JitsiCall from './JitsiCall';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Attachment {
  url: string; publicId: string; name: string;
  size: number; mimeType: string; resourceType: string;
}

interface Reaction { emoji: string; users: string[]; count: number; }

interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deleted?: boolean;
  parentMessageId?: string | null;
  replyCount?: number;
  attachments?: Attachment[];
  reactions?: Reaction[];
  flagged?: boolean;
  flagReason?: string;
}

interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  name: string;
  participants: string[];
  otherParticipants: { _id: string; name: string; email: string; isOnline?: boolean }[];
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  linkedLeadId?: string | null;
  linkedTaskId?: string | null;
  linkedType?: 'lead' | 'task' | '';
  videoRoomUrl?: string;
  workspaceId?: string;
}

interface WorkspaceUser {
  _id: string; name: string; email: string; role: string; isOnline?: boolean;
}

// ── Jitsi types ─────────────────────────────────────────────────────────────────

interface IncomingCall {
  from: string;
  fromName: string;
  conversationId: string;
  workspaceId: string;
}

type CallState = 'idle' | 'ringing_out' | 'ringing_in' | 'connected';

const COMMON_EMOJIS = ['👍','❤️','😂','😮','😢','🙏','🎉','🔥','👏','🚀','👀','💯','✅','❌','✨','💡','🤔','💬','🌟','🤝'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const AVATAR_COLORS = [
  ['#6366f1','#4f46e5'],['#8b5cf6','#7c3aed'],['#ec4899','#db2777'],
  ['#f59e0b','#d97706'],['#10b981','#059669'],['#3b82f6','#2563eb'],
  ['#ef4444','#dc2626'],['#06b6d4','#0891b2'],
];
function avatarBg(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const [c1, c2] = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  return `${c1}, ${c2}`;
}

// ── URL / Google Meet link renderer ──────────────────────────────────────────

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

function renderMessageBody(text: string, isSelf: boolean): React.ReactNode {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (!part.match(URL_REGEX)) return part; // plain text

    const isMeet = /meet\.google\.com/i.test(part);

    if (isMeet) {
      // Render as a prominent "Join Meeting" button
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            padding: '5px 11px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            background: isSelf
              ? 'rgba(255,255,255,0.18)'
              : 'linear-gradient(135deg,#22c55e,#16a34a)',
            color: '#fff',
            border: isSelf ? '1px solid rgba(255,255,255,0.3)' : 'none',
            boxShadow: isSelf ? 'none' : '0 2px 8px rgba(34,197,94,0.35)',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          title={part}
        >
          <span style={{ fontSize: 14 }}>🎥</span> Join Google Meet
        </a>
      );
    }

    // All other URLs — clickable underlined link
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: isSelf ? 'rgba(255,255,255,0.9)' : 'var(--accent-primary)',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          wordBreak: 'break-all',
          cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        {part}
      </a>
    );
  });
}

// ── Main ChatModule ─────────────────────────────────────────────────────────────

export default function ChatModule() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const searchParams = useSearchParams();
  const dmUserId = searchParams ? searchParams.get('dmUserId') : null;

  // ── Socket.io realtime connection ─────────────────────────────────────────
  const { socket, connected, joinConversation, leaveConversation, emitTyping, emitSignal } = useSocket();

  // ── Conversations ─────────────────────────────────────────────────────────
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs]     = useState(true);
  const [activeConvId, setActiveConvId]     = useState<string | null>(null);

  // ── Messages ──────────────────────────────────────────────────────────────
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore]     = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // ── Presence & Typing ─────────────────────────────────────────────────────
  const [onlineUsers, setOnlineUsers]   = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers]   = useState<Record<string, string>>({});
  const [isLocalTyping, setIsLocalTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Read receipts: conversationId → { userId → readAt } ──────────────────
  const [readReceipts, setReadReceipts] = useState<Record<string, Record<string, string>>>({});

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching]         = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // ── Input ─────────────────────────────────────────────────────────────────
  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);

  // ── File upload ───────────────────────────────────────────────────────────
  const [uploading, setUploading]       = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Threads ───────────────────────────────────────────────────────────────
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies]           = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread]           = useState(false);
  const [threadInput, setThreadInput]               = useState('');
  const [sendingThread, setSendingThread]           = useState(false);

  // ── Emoji picker ──────────────────────────────────────────────────────────
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);

  // ── AI Summary ────────────────────────────────────────────────────────────
  const [showSummary, setShowSummary]     = useState(false);
  const [summaryText, setSummaryText]     = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ── Flag modal ────────────────────────────────────────────────────────────
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagMsgId, setFlagMsgId]         = useState<string | null>(null);
  const [flagReason, setFlagReason]       = useState('');
  const [flagging, setFlagging]           = useState(false);

  // ── New DM modal ──────────────────────────────────────────────────────────
  const [showNewDM, setShowNewDM]           = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);

  // ── Conversation context-menu ─────────────────────────────────────────────
  const [convMenuId, setConvMenuId]         = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingConvId, setDeletingConvId]   = useState<string | null>(null);
  const [deleteToast, setDeleteToast]         = useState<string | null>(null);

  // ── Google Meet State ──────────────────────────────────────────────────────
  const [creatingMeet, setCreatingMeet] = useState(false);
  const [meetingToast, setMeetingToast] = useState<{
    creatorName: string;
    meetingLink: string;
    conversationId: string;
    conversationName: string;
  } | null>(null);
  const [showMeetSetupModal, setShowMeetSetupModal] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [checkingGoogle, setCheckingGoogle] = useState(true);

  // ── Jitsi Video Call State ─────────────────────────────────────────────────
  const [callState, setCallState]     = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCallConvId, setActiveCallConvId] = useState<string | null>(null);
  const [activeCallPeer, setActiveCallPeer]     = useState<{ id: string; name: string } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [activeCallRoomName, setActiveCallRoomName] = useState<string | null>(null);

  const ringTimeoutRef      = useRef<NodeJS.Timeout | null>(null);
  const callTargetRef       = useRef<string | null>(null);  // userId we're calling
  const callStateRef        = useRef<CallState>('idle');
  const activeCallConvIdRef = useRef<string | null>(null);

  // ── Refs (avoid stale closures in SSE handler) ────────────────────────────
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const threadEndRef    = useRef<HTMLDivElement>(null);
  const activeConvIdRef = useRef(activeConvId);
  const activeThreadParentRef = useRef(activeThreadParent);
  // Stable refs for callbacks used inside SSE closure
  const fetchConversationsRef   = useRef<() => Promise<void>>(async () => {});
  const fetchMessagesRef        = useRef<(id: string, cursor?: string) => Promise<void>>(async () => {});
  const markConversationReadRef = useRef<(id: string) => Promise<void>>(async () => {});
  // BroadcastChannel ref for unread badge updates to sidebar (avoids duplicate SSE)
  const unreadChannelRef = useRef<BroadcastChannel | null>(null);
  // Stable ref for sendSignal — avoids stale closures when socket reconnects during a call
  const sendSignalRef = useRef<(type: string, targetUserId: string, extra?: Record<string, any>) => Promise<{ ok: boolean }>>(
    async () => ({ ok: false }),
  );

  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
  useEffect(() => { activeThreadParentRef.current = activeThreadParent; }, [activeThreadParent]);
  // Keep call refs in sync so SSE handler always reads current values
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { activeCallConvIdRef.current = activeCallConvId; }, [activeCallConvId]);
  // Check Google connection status for the current user
  const checkGoogleConnection = useCallback(async () => {
    setCheckingGoogle(true);
    try {
      const res = await fetch('/api/gmail/oauth?action=status');
      if (res.ok) {
        const data = await res.json();
        setIsGoogleConnected(data.connected === true);
        setGoogleEmail(data.email || null);
      } else {
        setIsGoogleConnected(false);
      }
    } catch (err) {
      console.error('[Google Meet Check] Failed to check status:', err);
      setIsGoogleConnected(false);
    } finally {
      setCheckingGoogle(false);
    }
  }, []);

  // ── Fetch conversations ───────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
        // Sync online presence from the server response (source of truth on load/reconnect)
        const online = new Set<string>();
        for (const c of data.conversations) {
          for (const op of c.otherParticipants) {
            if (op.isOnline) online.add(op._id);
          }
        }
        // Merge — don't replace (SSE presence_snapshot may have newer info)
        setOnlineUsers(prev => {
          const next = new Set(prev);
          online.forEach(id => next.add(id));
          return next;
        });
        if (data.conversations.length > 0 && !activeConvIdRef.current) {
          setActiveConvId(data.conversations[0]._id);
        }
        // Broadcast totalUnread to sidebar (useUnreadCount BroadcastChannel listener)
        if (typeof data.totalUnread === 'number') {
          try { unreadChannelRef.current?.postMessage({ totalUnread: data.totalUnread }); } catch (_) {}
        }
      }
    } catch (e) {
      console.error('[Chat] fetchConversations:', e);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // ── Fetch messages ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (convId: string, cursor?: string) => {
    if (!cursor) setLoadingMsgs(true);
    try {
      const params = new URLSearchParams({ conversationId: convId, limit: '40' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/chat/messages?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        if (cursor) {
          setMessages(prev => [...data.messages, ...prev]);
        } else {
          setMessages(data.messages);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
    } catch (e) {
      console.error('[Chat] fetchMessages:', e);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]); setShowSearchResults(false); return;
    }
    const t = setTimeout(async () => {
      setSearching(true); setShowSearchResults(true);
      try {
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success) setSearchResults(data.results);
      } catch (e) { console.error('[Chat Search]', e); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Thread replies ────────────────────────────────────────────────────────

  const fetchThreadReplies = useCallback(async (parentMsg: ChatMessage) => {
    setLoadingThread(true);
    setActiveThreadParent(parentMsg);
    try {
      const res = await fetch(`/api/chat/thread?parentMessageId=${parentMsg._id}`);
      const data = await res.json();
      if (data.success) setThreadReplies(data.replies);
    } catch (e) { console.error('[Chat Thread]', e); }
    finally { setLoadingThread(false); }
  }, []);

  // ── Typing ────────────────────────────────────────────────────────────────

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!activeConvIdRef.current) return;
    // Emit typing via Socket.io directly (no HTTP round-trip needed)
    emitTyping(activeConvIdRef.current, isTyping);
  }, [emitTyping]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (!activeConvId) return;
    if (!isLocalTyping) { setIsLocalTyping(true); sendTypingStatus(true); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsLocalTyping(false); sendTypingStatus(false);
    }, 2000);
  };

  // Reset typing when switching conversation
  useEffect(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isLocalTyping) { sendTypingStatus(false); setIsLocalTyping(false); }
    setTypingUsers({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId]);

  // ── Read marker ───────────────────────────────────────────────────────────

  const markConversationAsRead = useCallback(async (convId: string) => {
    // Optimistically zero local unread immediately (don't wait for API round-trip)
    setConversations(prev => {
      const updated = prev.map(c => c._id === convId ? { ...c, unreadCount: 0 } : c);
      const total = updated.reduce((sum, c) => sum + c.unreadCount, 0);
      try { unreadChannelRef.current?.postMessage({ totalUnread: total }); } catch (_) {}
      return updated;
    });
    try {
      await fetch('/api/chat/conversations/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      });
    } catch { /* ignore */ }
  }, []);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  // Handled automatically by useSocket hook (emits 'heartbeat' every 15 s)

  // ── Call Signaling helpers ────────────────────────────────────────────────

  const sendSignal = useCallback(async (
    type: string, targetUserId: string, extra: Record<string, any> = {},
  ): Promise<{ ok: boolean; code?: string; queued?: boolean }> => {
    // Use Socket.io for signaling — instant, no HTTP overhead
    if (socket && socket.connected) {
      console.log('[STAGE 2] Outgoing socket event (signal) emitted', { type, targetUserId, ...extra });
      socket.emit('signal', { type, targetUserId, ...extra });
      return { ok: true };
    }
    // Fallback to HTTP if socket not available
    try {
      console.log('[STAGE 2] Outgoing HTTP signal (socket offline)', { type, targetUserId, ...extra });
      const res = await fetch('/api/chat/video/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetUserId, ...extra }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, code: body.code };
      }
      const body = await res.json().catch(() => ({}));
      return { ok: true, queued: body.queued === true };
    } catch (e) {
      console.error('[Signal send]', e);
      return { ok: false };
    }
  }, [socket]);

  const hangupLocal = useCallback((sendSignalToRemote = true) => {
    console.log('[Jitsi Call] Call ended (local hangup).');
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (sendSignalToRemote && callTargetRef.current) {
      // Use ref so we always read the current conversationId, not the stale closure value
      sendSignalRef.current('hangup', callTargetRef.current, {
        conversationId: activeCallConvIdRef.current,
      });
    }
    callTargetRef.current = null;
    setCallState('idle');
    setActiveCallConvId(null);
    setActiveCallPeer(null);
    setCallError(null);
    setActiveCallRoomName(null);
  // hangupLocal intentionally has empty deps — it reads everything via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep sendSignalRef fresh so hangupLocal (which has stable identity) always uses latest socket
  useEffect(() => { sendSignalRef.current = sendSignal; }, [sendSignal]);

  // ── Initiate call ─────────────────────────────────────────────────────────

  const handleVideoCall = useCallback(async () => {
    if (!activeConvId) return;
    const conv = conversations.find(c => c._id === activeConvId);
    if (!conv || conv.type !== 'direct') {
      alert('Video calls are currently supported for direct messages only.');
      return;
    }
    const target = conv.otherParticipants[0];
    if (!target) return;

    // Check permission roles
    const allowedRoles = ['Admin', 'Manager', 'Staff', 'Employee', 'User', 'MR'];
    if (user?.role && !allowedRoles.includes(user.role)) {
      alert('You do not have permission to start a video call.');
      return;
    }

    console.log('[STAGE 1] Call button clicked', { conversationId: activeConvId, targetUserId: target._id });

    setCallError(null);
    const wId = conv.workspaceId || 'ops-main';
    console.log('[Jitsi Call] Initiating new Jitsi call to:', target.name);

    const roomName = `workspace-${wId}-conversation-${activeConvId}`;
    setActiveCallRoomName(roomName);

    callTargetRef.current = target._id;
    setCallState('ringing_out');
    setActiveCallConvId(activeConvId);
    setActiveCallPeer({ id: target._id, name: target.name });

    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === 'ringing_out') {
        console.log('[Jitsi Call] Call timed out (no answer).');
        hangupLocal(true);
        setCallError('No answer. Call timed out.');
      }
    }, 30000);

    const result = await sendSignal('ring', target._id, {
      conversationId: activeConvId,
      workspaceId: wId,
    });

    if (!result.ok) {
      console.error('[Jitsi Call] Failed to send ring signal to:', target.name);
      if (ringTimeoutRef.current) {
        clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
      // Hard failure (network error) — abort immediately
      hangupLocal(false);
      setCallError('Could not reach the other user. Please check your connection and try again.');
    }
  }, [activeConvId, conversations, sendSignal, hangupLocal, user]);

  // ── Google Meet creation ──────────────────────────────────────────────────
  const handleCreateGoogleMeetDirect = useCallback(async () => {
    if (!activeConvId || creatingMeet) return;
    setCreatingMeet(true);
    try {
      const res = await fetch('/api/chat/video/meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConvId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.open(data.meetingLink, '_blank');
        fetchMessages(activeConvId);
        setShowMeetSetupModal(false);
      } else {
        if (data.debug) console.error('[Video Meet] Google API error:', data.debug);
        const msg = data.error || 'Failed to start video call.';
        // If token is expired/revoked, refresh connection status and show modal
        if (msg.includes('reconnect') || msg.includes('Integrations') || msg.includes('token')) {
          setIsGoogleConnected(false);
          setGoogleEmail(null);
          setShowMeetSetupModal(true);
        } else if (msg.includes('Calendar API')) {
          alert(`${msg}\n\nThis must be enabled in your Google Cloud Console before video calls will work.`);
        } else {
          alert(msg);
        }
      }
    } catch (error) {
      console.error('[Video Meet] Fetch error:', error);
      alert('Network error. Please check your connection and try again.');
    } finally {
      setCreatingMeet(false);
    }
  }, [activeConvId, fetchMessages, creatingMeet]);

  // Keep backward compat alias
  const handleCreateGoogleMeet = handleCreateGoogleMeetDirect;

  const handleStartMeetClick = useCallback(() => {
    // If not connected, show the guided setup modal
    if (!isGoogleConnected) {
      setShowMeetSetupModal(true);
      return;
    }
    handleCreateGoogleMeetDirect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGoogleConnected, handleCreateGoogleMeetDirect]);

  // ── Accept incoming call ──────────────────────────────────────────────────

  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;
    console.log('[Jitsi Call] Call accepted locally. Connecting Jitsi...');
    setCallError(null);

    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }

    const roomName = `workspace-${incomingCall.workspaceId || 'ops-main'}-conversation-${incomingCall.conversationId}`;
    setActiveCallRoomName(roomName);

    await sendSignal('answer', incomingCall.from, {
      conversationId: incomingCall.conversationId,
    });

    callTargetRef.current = incomingCall.from;
    setActiveCallConvId(incomingCall.conversationId);
    setActiveCallPeer({ id: incomingCall.from, name: incomingCall.fromName });
    setIncomingCall(null);
    setCallState('connected');
  }, [incomingCall, sendSignal]);

  // ── Reject incoming call ──────────────────────────────────────────────────

  const handleRejectCall = useCallback(async () => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (incomingCall) {
      console.log('[Jitsi Call] Call rejected locally:', incomingCall.fromName);
      await sendSignal('reject', incomingCall.from, {
        conversationId: incomingCall.conversationId,
      });
    }
    setIncomingCall(null);
    setCallState('idle');
    setCallError(null);
  }, [incomingCall, sendSignal]);

  // Keep stable callback refs fresh (used in SSE onopen without re-subscribing)
  useEffect(() => { fetchConversationsRef.current   = fetchConversations; },   [fetchConversations]);
  useEffect(() => { fetchMessagesRef.current        = fetchMessages; },        [fetchMessages]);
  useEffect(() => { markConversationReadRef.current = markConversationAsRead; }, [markConversationAsRead]);

  // BroadcastChannel for pushing unread counts to sidebar without a second SSE
  useEffect(() => {
    try {
      unreadChannelRef.current = new BroadcastChannel('chat_unread');
    } catch (_) { /* not available in all envs */ }
    return () => {
      try { unreadChannelRef.current?.close(); } catch (_) {}
      unreadChannelRef.current = null;
    };
  }, []);

  // ── Socket.io event handler ───────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !user) return;

    // Re-hydrate on connect/reconnect
    const onConnect = () => {
      fetchConversationsRef.current().catch(() => {});
      if (activeConvIdRef.current) {
        socket.emit('join_conversation', activeConvIdRef.current);
        fetchMessagesRef.current(activeConvIdRef.current);
        markConversationReadRef.current(activeConvIdRef.current);
      }
    };
    socket.on('connect', onConnect);
    // Fire immediately if already connected (e.g. socket was connected before this effect ran)
    if (socket.connected) onConnect();

    const onChatEvent = async (payload: any) => {
      const currentConvId       = activeConvIdRef.current;
      const currentThreadParent = activeThreadParentRef.current;

      // ── New message ──────────────────────────────────────────────────────
      if (payload.type === 'new_message') {
        console.log('[CLIENT] new_message received', payload.message);
        const msg: ChatMessage = payload.message;
        const isCurrent = msg.conversationId === currentConvId;
        const isSelf = msg.senderId === user?.id;

        if (isCurrent && !msg.parentMessageId) {
          setMessages(prev => {
            const optIdx = isSelf
              ? prev.findIndex(m => m._id.startsWith('opt-') && m.conversationId === msg.conversationId)
              : -1;
            if (optIdx >= 0) {
              const next = [...prev];
              next[optIdx] = msg;
              return next;
            }
            if (prev.some(m => m._id === msg._id)) return prev;
            return [...prev, msg];
          });
          if (!isSelf) markConversationReadRef.current(msg.conversationId);
        }

        setConversations(prev => {
          const exists = prev.some(c => c._id === msg.conversationId);
          if (!exists) {
            setTimeout(() => fetchConversationsRef.current(), 0);
            return prev;
          }
          return prev.map(c => {
            if (c._id !== msg.conversationId) return c;
            const newUnread = (isCurrent || isSelf) ? 0 : c.unreadCount + 1;
            return {
              ...c,
              unreadCount:   newUnread,
              lastMessage:   msg.body || '[attachment]',
              lastMessageAt: msg.createdAt,
            };
          });
        });

        if (!isSelf && !isCurrent) {
          try { unreadChannelRef.current?.postMessage({ delta: 1 }); } catch (_) {}
        }
      }

      // ── Thread reply ─────────────────────────────────────────────────────
      if (payload.type === 'thread_reply') {
        const msg: ChatMessage = payload.message;
        if (msg.conversationId === currentConvId) {
          setMessages(prev => prev.map(m =>
            m._id === msg.parentMessageId
              ? { ...m, replyCount: (m.replyCount ?? 0) + 1 }
              : m
          ));
          if (currentThreadParent?._id === msg.parentMessageId) {
            setThreadReplies(prev => {
              if (prev.some(m => m._id === msg._id)) return prev;
              return [...prev, msg];
            });
          }
        }
      }

      // ── Reaction update ──────────────────────────────────────────────────
      if (payload.type === 'reaction_update') {
        const { messageId, reactions } = payload;
        setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
        if (currentThreadParent?._id === messageId)
          setActiveThreadParent(prev => prev ? { ...prev, reactions } : null);
        setThreadReplies(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
      }

      // ── Message deleted ──────────────────────────────────────────────────
      if (payload.type === 'message_deleted') {
        const { messageId } = payload;
        const deleted = { deleted: true, body: '[Message deleted]' };
        setMessages(prev => prev.map(m => m._id === messageId ? { ...m, ...deleted } : m));
        if (currentThreadParent?._id === messageId)
          setActiveThreadParent(prev => prev ? { ...prev, ...deleted } : null);
        setThreadReplies(prev => prev.map(m => m._id === messageId ? { ...m, ...deleted } : m));
      }

      // ── Presence snapshot ─────────────────────────────────────────────────
      if (payload.type === 'presence_snapshot') {
        setOnlineUsers(new Set<string>(payload.onlineUserIds ?? []));
      }

      // ── Presence change ───────────────────────────────────────────────────
      if (payload.type === 'presence_change') {
        const { userId, isOnline } = payload;
        setOnlineUsers(prev => {
          const next = new Set(prev);
          if (isOnline) next.add(userId); else next.delete(userId);
          return next;
        });
        setConversations(prev => prev.map(c => ({
          ...c,
          otherParticipants: c.otherParticipants.map(op =>
            op._id === userId ? { ...op, isOnline } : op
          ),
        })));
      }

      // ── Typing ───────────────────────────────────────────────────────────
      if (payload.type === 'typing') {
        const { conversationId, userId, name, isTyping } = payload;
        if (conversationId === currentConvId) {
          setTypingUsers(prev => {
            const next = { ...prev };
            if (isTyping) next[userId] = name; else delete next[userId];
            return next;
          });
        }
      }

      // ── Read receipt ─────────────────────────────────────────────────────
      if (payload.type === 'read_receipt') {
        const { conversationId, userId, readAt } = payload;
        setReadReceipts(prev => ({
          ...prev,
          [conversationId]: { ...(prev[conversationId] ?? {}), [userId]: readAt },
        }));
        setConversations(prev => prev.map(c =>
          c._id === conversationId ? { ...c, unreadCount: 0 } : c
        ));
        setConversations(prev => {
          const total = prev.reduce((sum, c) =>
            sum + (c._id === conversationId ? 0 : c.unreadCount), 0);
          try { unreadChannelRef.current?.postMessage({ totalUnread: total }); } catch (_) {}
          return prev;
        });
      }

      // ── Unread update ─────────────────────────────────────────────────────
      if (payload.type === 'unread_update') {
        const { conversationId, unreadCount, totalUnread } = payload;
        setConversations(prev => prev.map(c =>
          c._id === conversationId ? { ...c, unreadCount: unreadCount ?? 0 } : c
        ));
        if (typeof totalUnread === 'number') {
          try { unreadChannelRef.current?.postMessage({ totalUnread }); } catch (_) {}
        }
      }

      // ── Jitsi signaling ──────────────────────────────────────────────────
      if (payload.type === 'vid_signal') {
        const { subtype, from, fromName, conversationId, workspaceId, reason } = payload;

        console.log('[STAGE 6] Receiver listener received vid_signal', { subtype, from, fromName, conversationId });
        console.debug(`[Jitsi Call] Signal received: ${subtype} from ${fromName ?? from}`);

        if (subtype === 'ring') {
          console.log('[CLIENT] incoming_call received', { from: fromName || from, conversationId });
          console.log('[Jitsi Call] Incoming call (ring) received from:', fromName || from);
          if (callStateRef.current !== 'idle') {
            console.log('[Jitsi Call] Busy — auto-rejecting incoming ring from:', fromName || from);
            await sendSignal('reject', from, { conversationId, reason: 'busy' });
            return;
          }
          setIncomingCall({ from, fromName, conversationId, workspaceId: workspaceId || 'ops-main' });
          setCallState('ringing_in');
          console.log('[STAGE 7] Popup state updated to ringing_in', { callState: 'ringing_in', incomingCall: { from, fromName } });
        }

        if (subtype === 'answer') {
          console.log('[Jitsi Call] Answer signal received from:', fromName || from);
          if (ringTimeoutRef.current) {
            clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = null;
          }
          if (callStateRef.current === 'ringing_out') {
            setCallState('connected');
          }
        }

        if (subtype === 'reject') {
          console.log('[Jitsi Call] Call rejected by remote user:', fromName || from);
          if (callStateRef.current === 'ringing_out') {
            const isBusy = reason === 'busy';
            hangupLocal(false);
            setCallError(isBusy ? `${fromName || 'User'} is busy in another call.` : `${fromName || 'User'} declined your call.`);
          }
        }

        if (subtype === 'hangup') {
          console.log('[Jitsi Call] Remote hangup signal received from:', fromName || from);
          hangupLocal(false);
        }
      }

      // ── Video meeting started toast ──
      if (payload.type === 'video_meeting_started') {
        console.log('[CLIENT] video_meeting_started received', payload);
        setMeetingToast({
          creatorName: payload.creatorName,
          meetingLink: payload.meetingLink,
          conversationId: payload.conversationId,
          conversationName: payload.conversationName,
        });
        // Auto-dismiss after 12 seconds
        setTimeout(() => {
          setMeetingToast(current => current?.meetingLink === payload.meetingLink ? null : current);
        }, 12000);
      }
    };

    socket.on('chat_event', onChatEvent);

    return () => {
      socket.off('connect', onConnect);
      socket.off('chat_event', onChatEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Check Google connection on mount ─────────────────────────────────────
  useEffect(() => { checkGoogleConnection(); }, [checkGoogleConnection]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (callStateRef.current !== 'idle') {
        hangupLocal(true);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hangupLocal]);

  useEffect(() => {
    if (activeConvId) {
      // Join Socket.io room for this conversation (enables server to target this room)
      joinConversation(activeConvId);
      fetchMessages(activeConvId);
      markConversationAsRead(activeConvId);
      setActiveThreadParent(null);
      setThreadReplies([]);
      setAttachedFiles([]);
    }
    return () => {
      // Leave previous conversation room
      if (activeConvId) leaveConversation(activeConvId);
    };
  }, [activeConvId, fetchMessages, markConversationAsRead, joinConversation, leaveConversation]);

  // ── Auto scroll ───────────────────────────────────────────────────────────

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [threadReplies]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || !activeConvId || sending) return;
    setSending(true);
    const body = input.trim();
    setInput('');
    const attachmentsToSend = [...attachedFiles];
    setAttachedFiles([]);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isLocalTyping) { sendTypingStatus(false); setIsLocalTyping(false); }

    // Optimistic insert
    const optimisticMsg: ChatMessage = {
      _id: `opt-${Date.now()}`,
      conversationId: activeConvId,
      senderId: user?.id ?? '',
      senderName: user?.name ?? 'You',
      body,
      createdAt: new Date().toISOString(),
      attachments: attachmentsToSend,
      reactions: [],
      replyCount: 0,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    // FIX: also optimistically update the conversation preview for the sender
    // The SSE echo from the server will normalise this, but this prevents the
    // conversation list looking stale between send and server echo
    setConversations(prev => prev.map(c =>
      c._id === activeConvId
        ? { ...c, lastMessage: body || '[attachment]', lastMessageAt: optimisticMsg.createdAt }
        : c
    ));

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConvId, body, attachments: attachmentsToSend }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev =>
          prev.map(m => m._id === optimisticMsg._id ? { ...m, _id: data.message._id } : m)
        );
        if (socket && socket.connected) {
          socket.emit('new_message', {
            conversationId: activeConvId,
            message: data.message,
            participantIds: conversations.find(c => c._id === activeConvId)?.participants || []
          });
        }
      }
    } catch (e) { console.error('[Chat] send error:', e); }
    finally { setSending(false); }
  };

  // ── Thread reply ──────────────────────────────────────────────────────────

  const handleSendThreadReply = async () => {
    if (!threadInput.trim() || !activeConvId || !activeThreadParent || sendingThread) return;
    setSendingThread(true);
    const body = threadInput.trim();
    setThreadInput('');

    const optimistic: ChatMessage = {
      _id: `opt-tr-${Date.now()}`,
      conversationId: activeConvId,
      senderId: user?.id ?? '',
      senderName: user?.name ?? 'You',
      body,
      createdAt: new Date().toISOString(),
      parentMessageId: activeThreadParent._id,
      reactions: [],
    };
    setThreadReplies(prev => [...prev, optimistic]);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvId,
          body,
          parentMessageId: activeThreadParent._id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreadReplies(prev =>
          prev.map(m => m._id === optimistic._id ? { ...m, _id: data.message._id } : m)
        );
        if (socket && socket.connected) {
          socket.emit('new_message', {
            conversationId: activeConvId,
            message: data.message,
            participantIds: conversations.find(c => c._id === activeConvId)?.participants || []
          });
        }
      }
    } catch (e) { console.error('[Thread send]', e); }
    finally { setSendingThread(false); }
  };

  // ── File upload ───────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setAttachedFiles(prev => [...prev, data.attachment]);
      else alert(data.error || 'Upload failed');
    } catch { alert('Upload error'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // ── Reaction ──────────────────────────────────────────────────────────────

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    setActiveReactionPickerMsgId(null);
    try {
      const res = await fetch('/api/chat/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions: data.reactions } : m));
        if (activeThreadParent?._id === messageId)
          setActiveThreadParent(prev => prev ? { ...prev, reactions: data.reactions } : null);
        setThreadReplies(prev => prev.map(m => m._id === messageId ? { ...m, reactions: data.reactions } : m));
      }
    } catch (e) { console.error('[Reaction]', e); }
  };

  // ── AI Summary ────────────────────────────────────────────────────────────

  const handleAISummary = async () => {
    if (!activeConvId) return;
    setLoadingSummary(true); setShowSummary(true);
    try {
      const res = await fetch(`/api/chat/ai-summary?conversationId=${activeConvId}`);
      const data = await res.json();
      setSummaryText(data.success ? data.summary : 'Failed: ' + (data.error ?? 'unknown'));
    } catch { setSummaryText('Connection error.'); }
    finally { setLoadingSummary(false); }
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!activeConvId) return;
    const a = document.createElement('a');
    a.href = `/api/chat/export?conversationId=${activeConvId}&format=csv`;
    a.setAttribute('download', `chat-${activeConvId}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Flag ──────────────────────────────────────────────────────────────────

  const handleFlagMessage = async () => {
    if (!flagMsgId) return;
    setFlagging(true);
    try {
      const res = await fetch('/api/chat/admin/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: flagMsgId, action: 'flag', reason: flagReason }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m._id === flagMsgId ? { ...m, flagged: true, flagReason } : m));
        setShowFlagModal(false);
      }
    } catch (e) { console.error('[Flag]', e); }
    finally { setFlagging(false); }
  };

  // ── Delete Conversation ───────────────────────────────────────────────────

  const handleDeleteConversation = async (convId: string) => {
    setDeleteConfirmId(null);
    setDeletingConvId(convId);

    // Optimistic: remove from sidebar immediately
    setConversations(prev => prev.filter(c => c._id !== convId));
    if (activeConvId === convId) setActiveConvId(null);

    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'client' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Rollback: refetch conversations on error
        await fetchConversations();
        console.error('[Chat] delete conversation error:', data.error);
        setDeleteToast('Could not delete conversation. Please try again.');
        setTimeout(() => setDeleteToast(null), 4000);
      } else {
        setDeleteToast('Conversation deleted.');
        setTimeout(() => setDeleteToast(null), 3000);
      }
    } catch (e) {
      console.error('[Chat] delete conversation network error:', e);
      await fetchConversations();
      setDeleteToast('Network error. Please try again.');
      setTimeout(() => setDeleteToast(null), 4000);
    } finally {
      setDeletingConvId(null);
    }
  };

  // ── New DM ────────────────────────────────────────────────────────────────

  const openNewDMModal = async () => {
    setShowNewDM(true);
    try {
      const res = await fetch('/api/chat/users');
      const data = await res.json();
      if (data.success) {
        setWorkspaceUsers(data.users);
        setOnlineUsers(prev => {
          const next = new Set(prev);
          for (const u of data.users) {
            if (u.isOnline) next.add(u._id); else next.delete(u._id);
          }
          return next;
        });
      }
    } catch (e) { console.error('[fetchUsers]', e); }
  };

  const startDM = async (recipientId: string) => {
    setShowNewDM(false);
    setSending(true);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, body: 'Hi! 👋' }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchConversations();
        setActiveConvId(data.message.conversationId);
      }
    } catch (e) { console.error('[startDM]', e); }
    finally { setSending(false); }
  };

  useEffect(() => {
    if (!dmUserId || loadingConvs) return;

    // Find if direct chat with dmUserId exists
    const existing = conversations.find(c => 
      c.type === 'direct' && 
      c.participants.includes(dmUserId)
    );

    if (existing) {
      if (activeConvId !== existing._id) {
        setActiveConvId(existing._id);
      }
    } else {
      // Start a new DM conversation
      startDM(dmUserId);
    }
  }, [dmUserId, loadingConvs, conversations, activeConvId]);

  const loadMore = () => {
    if (!activeConvId || !hasMore || !nextCursor) return;
    fetchMessages(activeConvId, nextCursor);
  };

  const activeConv = conversations.find(c => c._id === activeConvId);

  // ── Seen label helper ─────────────────────────────────────────────────────
  // For the last message sent by self, check if any other participant has readAt >= createdAt
  const getSeenLabel = (msg: ChatMessage): string | null => {
    if (!activeConv || msg.senderId !== user?.id) return null;
    const convReceipts = readReceipts[msg.conversationId] ?? {};
    const others = activeConv.otherParticipants;
    const seenBy = others.filter(op => {
      const readAt = convReceipts[op._id];
      return readAt && new Date(readAt) >= new Date(msg.createdAt);
    });
    if (seenBy.length === 0) return null;
    if (activeConv.type === 'direct') return 'Seen';
    return `Seen by ${seenBy.map(u => u.name.split(' ')[0]).join(', ')}`;
  };

  // Last sent message id for seen indicator (only show on last msg)
  const lastSentMsgId = [...messages].reverse().find(m => m.senderId === user?.id)?._id;



  // Group messages by date for date separators
  const groupedMessages = messages.reduce((acc, msg, i) => {
    const date = formatDate(msg.createdAt);
    const prevDate = i > 0 ? formatDate(messages[i - 1].createdAt) : null;
    if (date !== prevDate) acc.push({ type: 'date' as const, date, id: `date-${i}` });
    acc.push({ type: 'msg' as const, msg });
    return acc;
  }, [] as Array<{ type: 'date'; date: string; id: string } | { type: 'msg'; msg: ChatMessage }>);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); }
          50%       { box-shadow: 0 0 0 12px rgba(34,197,94,0.06); }
        }
        @keyframes callWiggle {
          0%,50%,100% { transform: rotate(0deg) scale(1); }
          10%         { transform: rotate(-8deg) scale(1.06); }
          20%         { transform: rotate(8deg) scale(1.06); }
          30%         { transform: rotate(-4deg) scale(1.02); }
          40%         { transform: rotate(4deg) scale(1.02); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.45; }
        }
        .cm-fadeIn  { animation: fadeIn  0.22s ease both; }
        .cm-scaleIn { animation: scaleIn 0.18s ease both; }
        .cm-slideUp { animation: slideUp 0.18s ease both; }

        /* ── Conversation item ── */
        .cm-conv-wrap {
          position:relative; display:flex; align-items:center;
          margin:1px 6px; width:calc(100% - 12px);
          border-radius:9px;
        }
        .cm-conv-wrap:hover .cm-conv-menu-btn { opacity:1; pointer-events:all; }
        .cm-conv {
          display:flex; align-items:center; gap:10px;
          padding:9px 10px; flex:1; min-width:0;
          border-radius:9px; cursor:pointer; border:none;
          background:none; text-align:left;
          transition:background 0.12s ease;
        }
        .cm-conv:hover  { background:var(--bg-surface); }
        .cm-conv.active { background:var(--accent-primary); }
        .cm-conv.active .cm-conv-name { color:#fff; }
        .cm-conv.active .cm-conv-sub  { color:rgba(255,255,255,0.65); }

        /* ── Three-dot menu button ── */
        .cm-conv-menu-btn {
          opacity:0; pointer-events:none;
          position:absolute; right:6px; top:50%; transform:translateY(-50%);
          z-index:10; border:none; background:none; cursor:pointer;
          width:26px; height:26px; border-radius:7px;
          display:flex; align-items:center; justify-content:center;
          color:var(--text-secondary);
          transition:opacity 0.12s, background 0.12s, color 0.12s;
        }
        .cm-conv-menu-btn:hover { background:var(--border-subtle); color:var(--text-primary); }
        .cm-conv.active ~ .cm-conv-menu-btn { color:rgba(255,255,255,0.7); }
        .cm-conv.active ~ .cm-conv-menu-btn:hover { background:rgba(255,255,255,0.15); color:#fff; }

        /* ── Conv dropdown menu ── */
        .cm-conv-dropdown {
          position:absolute; right:0; top:calc(100% + 2px); z-index:200;
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          border-radius:10px; padding:4px;
          min-width:160px;
          box-shadow:0 8px 32px rgba(0,0,0,0.15);
          animation:scaleIn 0.13s ease both;
          transform-origin:top right;
        }
        .cm-conv-dropdown-item {
          display:flex; align-items:center; gap:9px;
          width:100%; padding:7px 10px; border:none; background:none;
          border-radius:7px; cursor:pointer; font-family:inherit;
          font-size:12.5px; font-weight:550; color:var(--text-primary);
          text-align:left; transition:background 0.1s;
        }
        .cm-conv-dropdown-item:hover { background:var(--bg-base); }
        .cm-conv-dropdown-item.danger { color:#ef4444; }
        .cm-conv-dropdown-item.danger:hover { background:rgba(239,68,68,0.08); }

        /* ── Bubbles ── */
        .cm-bubble {
          padding:9px 13px; border-radius:16px;
          font-size:13px; line-height:1.52; font-weight:440;
          max-width:420px; word-break:break-word; white-space:pre-wrap;
        }
        .cm-bubble.self  {
          background:var(--accent-primary); color:#fff;
          border-bottom-right-radius:4px;
        }
        .cm-bubble.other {
          background:var(--bg-base);
          color:var(--text-primary);
          border:1px solid var(--border-subtle);
          border-bottom-left-radius:4px;
        }

        /* ── Hover toolbar ── */
        .cm-msgrow { position:relative; }
        .cm-toolbar {
          position:absolute; z-index:20; top:-32px;
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          border-radius:8px; padding:2px 3px;
          display:flex; gap:1px;
          box-shadow:0 4px 16px rgba(0,0,0,.1);
          opacity:0; pointer-events:none;
          transition:opacity 0.14s ease;
        }
        .cm-msgrow:hover .cm-toolbar { opacity:1; pointer-events:all; }

        /* ── Icon button ── */
        .cm-ibtn {
          display:inline-flex; align-items:center; justify-content:center;
          border-radius:7px; padding:5px; border:none; background:none;
          color:var(--text-secondary); cursor:pointer;
          transition:background 0.12s, color 0.12s, transform 0.1s;
        }
        .cm-ibtn:hover   { background:var(--bg-base); color:var(--text-primary); }
        .cm-ibtn:active  { transform:scale(0.9); }
        .cm-ibtn.accent  { color:var(--accent-primary); }

        /* ── Pill buttons ── */
        .cm-pill {
          display:inline-flex; align-items:center; gap:6px;
          padding:7px 16px; border-radius:9px;
          font-size:12px; font-weight:650; cursor:pointer;
          border:none; transition:all 0.14s ease; font-family:inherit;
        }
        .cm-pill.primary { background:var(--accent-primary); color:#fff; }
        .cm-pill.primary:hover { filter:brightness(1.09); transform:translateY(-1px); }
        .cm-pill.ghost   { background:var(--bg-base); color:var(--text-primary); border:1px solid var(--border-subtle); }
        .cm-pill.ghost:hover { background:var(--border-subtle); }
        .cm-pill:disabled { opacity:.42; cursor:not-allowed; transform:none !important; }
        .cm-pill.danger  { background:#ef4444; color:#fff; }
        .cm-pill.danger:hover { background:#dc2626; }

        /* ── Message input ── */
        .cm-input {
          flex:1; background:var(--bg-base);
          border:1.5px solid var(--border-subtle);
          border-radius:12px; padding:9px 14px;
          font-size:13px; font-weight:440; color:var(--text-primary);
          outline:none; font-family:inherit; line-height:1.45;
          transition:border-color 0.15s, box-shadow 0.15s;
        }
        .cm-input:focus {
          border-color:var(--accent-primary);
          box-shadow:0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
        }
        .cm-input::placeholder { color:var(--text-tertiary); }

        /* ── Send button ── */
        .cm-send {
          width:40px; height:40px; border-radius:11px;
          background:var(--accent-primary); color:#fff;
          display:flex; align-items:center; justify-content:center;
          border:none; cursor:pointer; flex-shrink:0;
          box-shadow:0 2px 8px color-mix(in srgb, var(--accent-primary) 38%, transparent);
          transition:filter 0.14s, transform 0.12s;
        }
        .cm-send:hover  { filter:brightness(1.1); transform:scale(1.05); }
        .cm-send:active { transform:scale(0.94); }
        .cm-send:disabled { opacity:.4; cursor:not-allowed; transform:none; filter:none; }

        /* ── Video controls ── */
        .vc-btn {
          width:48px; height:48px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          border:none; cursor:pointer;
          transition:background 0.14s, transform 0.1s;
        }
        .vc-btn:active { transform:scale(0.9); }
        .vc-btn.soft   { background:rgba(255,255,255,.12); color:#fff; }
        .vc-btn.soft:hover { background:rgba(255,255,255,.22); }
        .vc-btn.red    { background:#ef4444; color:#fff; }
        .vc-btn.red:hover { background:#dc2626; }
        .vc-btn.big    { width:56px; height:56px; }

        /* ── Reaction chip ── */
        .cm-rxn {
          display:inline-flex; align-items:center; gap:3px;
          padding:2px 7px; border-radius:10px;
          font-size:11px; font-weight:640;
          border:1px solid var(--border-subtle);
          background:var(--bg-surface);
          color:var(--text-secondary); cursor:pointer;
          transition:all 0.12s;
        }
        .cm-rxn:hover { border-color:var(--accent-primary); }
        .cm-rxn.me {
          background:color-mix(in srgb,var(--accent-primary) 12%,transparent);
          border-color:color-mix(in srgb,var(--accent-primary) 55%,transparent);
          color:var(--accent-primary);
        }

        /* ── Date separator ── */
        .cm-datesep {
          display:flex; align-items:center; gap:12px;
          padding:6px 0; margin:6px 0;
        }
        .cm-datesep::before,.cm-datesep::after {
          content:''; flex:1; height:1px; background:var(--border-subtle);
        }
        .cm-datesep-lbl {
          font-size:11px; font-weight:640; color:var(--text-tertiary);
          padding:2px 10px;
          background:var(--bg-surface);
          border:1px solid var(--border-subtle);
          border-radius:10px; white-space:nowrap;
        }

        /* ── Skeleton pulse ── */
        .cm-skel { animation:pulse 1.6s ease infinite; background:var(--border-subtle); border-radius:6px; }

        /* ── Search input ── */
        .cm-search {
          width:100%; background:var(--bg-base);
          border:1.5px solid var(--border-subtle);
          border-radius:8px; padding:7px 10px 7px 30px;
          font-size:12px; color:var(--text-primary);
          outline:none; font-family:inherit;
          transition:border-color 0.14s;
          box-sizing:border-box;
        }
        .cm-search:focus { border-color:var(--accent-primary); }
        .cm-search::placeholder { color:var(--text-tertiary); }

        /* ── Unread badge ── */
        .cm-badge {
          display:inline-flex; align-items:center; justify-content:center;
          background:var(--accent-primary); color:#fff;
          font-size:9px; font-weight:800;
          min-width:17px; height:17px;
          border-radius:9px; padding:0 4px;
          animation:scaleIn 0.2s ease;
          flex-shrink:0;
        }
      `}</style>

      <div style={{
        display:'flex', height:'calc(100vh - 120px)', minHeight:500, borderRadius:16,
        border:'1px solid var(--border-subtle)',
        overflow:'hidden', background:'var(--bg-surface)',
        boxShadow:'0 4px 32px rgba(0,0,0,.08)',
        position:'relative', fontFamily:'inherit',
      }}>

        {/* ══ INCOMING CALL POPUP ══ */}
        {callState === 'ringing_in' && incomingCall && (
          <div className="cm-fadeIn" style={{
            position:'absolute', inset:0, zIndex:70,
            display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(0,0,0,.6)', backdropFilter:'blur(14px)',
            borderRadius:16,
          }}>
            <div className="cm-scaleIn" style={{
              background:'var(--bg-surface)',
              border:'1px solid var(--border-subtle)',
              borderRadius:20, width:310, padding:28,
              textAlign:'center',
              boxShadow:'0 24px 64px rgba(0,0,0,.3)',
            }}>
              <div style={{ position:'relative', display:'inline-block', marginBottom:16 }}>
                <div style={{
                  width:72, height:72, borderRadius:'50%',
                  background:`linear-gradient(135deg,${avatarBg(incomingCall.fromName)})`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:24, fontWeight:800, color:'#fff',
                  animation:'ringPulse 1.4s ease-in-out infinite',
                  boxShadow:'0 0 0 0 rgba(34,197,94,.45)',
                }}>
                  {getInitials(incomingCall.fromName)}
                </div>
                <span style={{
                  position:'absolute', bottom:2, right:2,
                  width:20, height:20, borderRadius:'50%',
                  background:'#22c55e', border:'2px solid var(--bg-surface)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <PhoneIncoming size={10} color="#fff" />
                </span>
              </div>

              <div style={{ fontSize:17, fontWeight:750, color:'var(--text-primary)', marginBottom:4, letterSpacing:'-0.01em' }}>
                {incomingCall.fromName}
              </div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:24, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'ringPulse 1s infinite' }}/>
                Incoming video call
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={handleRejectCall}
                  className="cm-pill"
                  style={{ flex:1, justifyContent:'center', background:'#ef444418', color:'#ef4444', border:'1px solid #ef444430' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#ef444428')}
                  onMouseLeave={e=>(e.currentTarget.style.background='#ef444418')}
                >
                  <PhoneOff size={14}/> Decline
                </button>
                <button
                  onClick={handleAcceptCall}
                  className="cm-pill"
                  style={{ flex:1, justifyContent:'center', background:'#22c55e', color:'#fff', boxShadow:'0 4px 16px #22c55e44', animation:'callWiggle 2s ease-in-out infinite' }}
                  onMouseEnter={e=>{ e.currentTarget.style.filter='brightness(1.1)'; e.currentTarget.style.animation='none'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.filter=''; e.currentTarget.style.animation='callWiggle 2s ease-in-out infinite'; }}
                >
                  <PhoneCall size={14}/> Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ OUTGOING CALL (RINGING) ══ */}
        {callState === 'ringing_out' && (
          <div className="cm-fadeIn" style={{
            position:'absolute', inset:0, zIndex:50,
            background:'#09090e', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', borderRadius:16,
          }}>
            <div style={{ position:'relative', display:'inline-block', marginBottom:16 }}>
              <div style={{
                width:80, height:80, borderRadius:'50%',
                background:`linear-gradient(135deg,${avatarBg(activeCallPeer?.name ?? '?')})`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:28, fontWeight:800, color:'#fff',
                animation:'ringPulse 1.4s ease-in-out infinite',
                boxShadow:'0 0 0 0 rgba(99,102,241,.45)',
              }}>
                {getInitials(activeCallPeer?.name ?? '?')}
              </div>
            </div>
            <div style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:8 }}>
              Calling {activeCallPeer?.name}...
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', marginBottom:32 }}>
              Waiting for answer...
            </div>
            <button
              onClick={() => hangupLocal(true)}
              style={{
                background:'#ef4444', color:'#fff', border:'none', borderRadius:30,
                padding:'12px 24px', fontSize:14, fontWeight:650, display:'flex',
                alignItems:'center', gap:8, cursor:'pointer', boxShadow:'0 8px 24px rgba(239, 68, 68, 0.4)',
              }}
            >
              <PhoneOff size={16} /> Cancel Call
            </button>
          </div>
        )}

        {/* ══ JITISI CALL DIALOG/MODAL ══ */}
        {callState === 'connected' && activeCallRoomName && (
          <div 
            className="cm-fadeIn"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div 
              style={{
                width: '100%',
                height: '100%',
                maxWidth: 1200,
                maxHeight: 800,
                background: '#09090e',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <JitsiCall
                roomName={activeCallRoomName}
                userName={user?.name || 'User'}
                userEmail={user?.email || ''}
                onEnd={hangupLocal}
              />
            </div>
          </div>
        )}

        {/* ══ SIDEBAR ══ */}
        <div 
          className={`w-full lg:w-[252px] flex flex-col shrink-0 relative ${activeConv ? 'hidden lg:flex' : 'flex'}`}
          style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}
        >
          {/* Header */}
          <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid var(--border-subtle)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                  Team Chat
                </div>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:500, marginTop:1 }}>
                  {onlineUsers.size} online
                </div>
              </div>
              <button
                className="cm-ibtn accent"
                onClick={openNewDMModal}
                title="New message"
                style={{ padding:7, borderRadius:9, background:'color-mix(in srgb,var(--accent-primary) 12%,transparent)' }}
              >
                <Plus size={15}/>
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border-subtle)', position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', color:'var(--text-tertiary)', pointerEvents:'none' }}/>
            <input
              type="text"
              placeholder="Search messages…"
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              className="cm-search"
            />
            {searchQuery && (
              <button
                onClick={()=>setSearchQuery('')}
                style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center' }}
              >
                <X size={12}/>
              </button>
            )}
          </div>

          {/* Search overlay */}
          {showSearchResults && (
            <div className="cm-fadeIn" style={{
              position:'absolute', top:102, left:0, right:0, bottom:0,
              background:'var(--bg-surface)', zIndex:10,
              display:'flex', flexDirection:'column',
              borderTop:'1px solid var(--border-subtle)',
            }}>
              <div style={{ padding:'7px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border-subtle)' }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  {searching?'Searching…':`${searchResults.length} results`}
                </span>
                <button onClick={()=>{setShowSearchResults(false);setSearchQuery('');}} style={{ fontSize:11, fontWeight:700, color:'var(--accent-primary)', background:'none', border:'none', cursor:'pointer' }}>
                  Clear
                </button>
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:'6px 8px' }} className="custom-scrollbar">
                {searching ? (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'32px 0', color:'var(--text-secondary)', fontSize:12 }}>
                    <Loader2 size={14} style={{ animation:'spin 1s linear infinite' } as any}/> Searching…
                  </div>
                ) : searchResults.length===0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', fontSize:12, color:'var(--text-tertiary)' }}>No results</div>
                ) : searchResults.map((r:any)=>(
                  <button key={r._id}
                    onClick={()=>{ setActiveConvId(r.conversationId); setShowSearchResults(false); setSearchQuery(''); }}
                    style={{ width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', gap:3, transition:'background 0.12s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-base)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='none')}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{r.senderName}</span>
                      <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p style={{ fontSize:11, color:'var(--text-secondary)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.body}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section label */}
          <div style={{ padding:'10px 14px 3px', display:'flex', alignItems:'center', gap:5 }}>
            <MessageSquare size={10} style={{ color:'var(--text-tertiary)' }}/>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
              Direct Messages
            </span>
          </div>

          {/* Conv list */}
          <div style={{ flex:1, overflowY:'auto', padding:'2px 0 8px' }} className="custom-scrollbar">
            {loadingConvs ? (
              [72,56,80].map((w,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px' }}>
                  <div className="cm-skel" style={{ width:36, height:36, borderRadius:'50%', flexShrink:0 }}/>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                    <div className="cm-skel" style={{ height:11, width:`${w}%` }}/>
                    <div className="cm-skel" style={{ height:9, width:'50%' }}/>
                  </div>
                </div>
              ))
            ) : conversations.length===0 ? (
              <div style={{ padding:'28px 16px', textAlign:'center' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
                  <MessageSquare size={18} style={{ color:'var(--text-tertiary)' }}/>
                </div>
                <p style={{ fontSize:12, color:'var(--text-tertiary)', fontWeight:600, margin:'0 0 12px' }}>No conversations yet</p>
                <button onClick={openNewDMModal} className="cm-pill primary" style={{ padding:'6px 14px', fontSize:11 }}>
                  <Plus size={12}/> New Chat
                </button>
              </div>
            ) : conversations.map(conv=>{
              const otherUser = conv.otherParticipants[0];
              const isOnline = conv.type==='direct' && otherUser && onlineUsers.has(otherUser._id);
              const isActive = activeConvId===conv._id;
              const menuOpen  = convMenuId === conv._id;
              return (
                <div key={conv._id} className="cm-conv-wrap" style={{ position:'relative' }}>
                  <button onClick={()=>setActiveConvId(conv._id)}
                    className={`cm-conv ${isActive?'active':''}`}
                    style={{ paddingRight: 32 }}
                  >
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <div style={{
                        width:36, height:36, borderRadius:'50%', flexShrink:0,
                        background:`linear-gradient(135deg,${avatarBg(conv.name)})`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:800, color:'#fff',
                      }}>
                        {getInitials(conv.name)}
                      </div>
                      {conv.type==='direct' ? (
                        <span style={{
                          position:'absolute', bottom:0, right:0,
                          width:9, height:9, borderRadius:'50%',
                          background: isActive ? '#fff' : (isOnline?'#22c55e':'#6b7280'),
                          border:`2px solid var(--bg-${isActive?'surface':'base'})`,
                          boxShadow: isOnline&&!isActive ? '0 0 5px #22c55e66' : 'none',
                          transition:'all 0.3s',
                        }}/>
                      ) : (
                        <span style={{
                          position:'absolute', bottom:0, right:0,
                          width:13, height:13, borderRadius:'50%',
                          background: isActive ? 'rgba(255,255,255,.3)' : 'var(--accent-primary)',
                          border:'2px solid var(--bg-base)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <Users size={7} color="#fff"/>
                        </span>
                      )}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4, marginBottom:1 }}>
                        <span className="cm-conv-name" style={{
                          fontSize:13, fontWeight:conv.unreadCount>0?750:600,
                          color: isActive ? '#fff' : 'var(--text-primary)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
                        }}>
                          {conv.name}
                        </span>
                        {conv.unreadCount>0 && (
                          <span className="cm-badge" style={{ background: isActive ? 'rgba(255,255,255,.9)' : 'var(--accent-primary)', color: isActive ? 'var(--accent-primary)' : '#fff' }}>
                            {conv.unreadCount>99?'99+':conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="cm-conv-sub" style={{
                        fontSize:11, margin:0,
                        color: isActive ? 'rgba(255,255,255,.65)' : (conv.unreadCount>0 ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        fontWeight: conv.unreadCount>0 ? 600 : 400,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {conv.lastMessage||'No messages yet'}
                      </p>
                    </div>
                  </button>

                  {/* Three-dot menu button */}
                  <button
                    id={`cm-menu-btn-${conv._id}`}
                    className="cm-conv-menu-btn"
                    title="More options"
                    onClick={e => {
                      e.stopPropagation();
                      setConvMenuId(menuOpen ? null : conv._id);
                    }}
                  >
                    <MoreVertical size={14}/>
                  </button>

                  {/* Dropdown */}
                  {menuOpen && (
                    <>
                      {/* invisible overlay to close on outside click */}
                      <div
                        style={{ position:'fixed', inset:0, zIndex:199 }}
                        onClick={() => setConvMenuId(null)}
                      />
                      <div className="cm-conv-dropdown">
                        <button
                          className="cm-conv-dropdown-item"
                          onClick={() => { setConvMenuId(null); setActiveConvId(conv._id); }}
                        >
                          <MessageSquare size={13}/> Open
                        </button>
                        <button
                          className="cm-conv-dropdown-item"
                          onClick={() => { setConvMenuId(null); markConversationAsRead(conv._id); }}
                        >
                          <CheckCircle size={13}/> Mark as Read
                        </button>
                        <button
                          className="cm-conv-dropdown-item"
                          onClick={() => { setConvMenuId(null); }}
                        >
                          <BellOff size={13}/> Mute
                        </button>
                        <div style={{ height:1, background:'var(--border-subtle)', margin:'3px 4px' }}/>
                        <button
                          className="cm-conv-dropdown-item danger"
                          onClick={() => { setConvMenuId(null); setDeleteConfirmId(conv._id); }}
                        >
                          <Trash2 size={13}/> Delete Conversation
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Self footer */}
          {user && (
            <div style={{
              padding:'9px 12px', borderTop:'1px solid var(--border-subtle)',
              display:'flex', alignItems:'center', gap:8,
              background:'var(--bg-base)',
            }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{
                  width:28, height:28, borderRadius:'50%',
                  background:`linear-gradient(135deg,${avatarBg(user.name)})`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:10, fontWeight:800, color:'#fff',
                }}>
                  {getInitials(user.name)}
                </div>
                <span style={{ position:'absolute', bottom:0, right:0, width:8, height:8, borderRadius:'50%', background:'#22c55e', border:'1.5px solid var(--bg-base)', boxShadow:'0 0 5px #22c55e88' }}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user.name}
                </div>
                <div style={{ fontSize:10, color:'#22c55e', fontWeight:600 }}>● Active</div>
              </div>
            </div>
          )}
        </div>

        {/* ══ MAIN CHAT ══ */}
        <div 
          className={`flex-1 flex flex-col min-w-0 ${!activeConv ? 'hidden lg:flex' : 'flex'}`}
          style={{ background: 'var(--bg-surface)' }}
        >
          {activeConv ? (
            <>
              {/* Chat header */}
              <div style={{
                padding:'11px 16px', borderBottom:'1px solid var(--border-subtle)',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                background:'var(--bg-surface)', zIndex:1,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <button 
                    onClick={() => setActiveConvId(null)}
                    className="lg:hidden p-1 rounded-lg text-secondary hover:text-primary hover:bg-base transition-colors"
                    title="Back to chats"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div style={{ position:'relative' }}>
                    <div style={{
                      width:36, height:36, borderRadius:'50%',
                      background:`linear-gradient(135deg,${avatarBg(activeConv.name)})`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, fontWeight:800, color:'#fff',
                    }}>
                      {getInitials(activeConv.name)}
                    </div>
                    {activeConv.type==='direct' && (
                      <span style={{
                        position:'absolute', bottom:1, right:1,
                        width:9, height:9, borderRadius:'50%',
                        background: onlineUsers.has(activeConv.otherParticipants[0]?._id) ? '#22c55e' : '#6b7280',
                        border:'2px solid var(--bg-surface)',
                        boxShadow: onlineUsers.has(activeConv.otherParticipants[0]?._id) ? '0 0 5px #22c55e66' : 'none',
                        transition:'all 0.3s',
                      }}/>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:750, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                      {activeConv.name}
                    </div>
                    <div style={{ fontSize:11, fontWeight:550, marginTop:1 }}>
                      {activeConv.type==='direct' ? (
                        <span style={{ color: onlineUsers.has(activeConv.otherParticipants[0]?._id) ? '#22c55e' : 'var(--text-tertiary)' }}>
                          {onlineUsers.has(activeConv.otherParticipants[0]?._id) ? 'Online' : 'Offline'}
                        </span>
                      ) : (
                        <span style={{ color:'var(--text-tertiary)', display:'flex', alignItems:'center', gap:4 }}>
                          <Users size={10}/> {activeConv.otherParticipants.length+1} members
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                  {/* ── Jitsi Instant Meet Button (header) ── */}
                  <button
                    className="cm-ibtn"
                    onClick={handleVideoCall}
                    disabled={callState !== 'idle'}
                    title={callState !== 'idle' ? "Call in progress" : "Start Jitsi Video Call"}
                    style={{
                      position: 'relative',
                      background: callState !== 'idle' ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.10)',
                      border: '1px solid rgba(99,102,241,0.22)',
                      borderRadius: 8,
                      padding: '5px 9px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      color: '#818cf8',
                      fontSize: 11,
                      fontWeight: 650,
                      cursor: callState !== 'idle' ? 'not-allowed' : 'pointer',
                      opacity: callState !== 'idle' ? 0.6 : 1,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (callState === 'idle') {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.20)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (callState === 'idle') {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.10)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.22)';
                      }
                    }}
                  >
                    <MonitorPlay size={14}/>
                    <span className="hidden sm:inline">Jitsi</span>
                  </button>

                  {/* ── Google Meet Button (existing — unchanged) ── */}
                  <button
                    className="cm-ibtn"
                    onClick={handleStartMeetClick}
                    disabled={creatingMeet}
                    title={isGoogleConnected ? `Start Google Meet (${googleEmail ?? 'Connected'})` : 'Start Google Meet — Connect your Google account'}
                    style={{ opacity: creatingMeet ? 0.4 : 1, position: 'relative' }}
                  >
                    {creatingMeet ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' } as any}/> : <Video size={16}/>}
                    {/* Connection dot indicator */}
                    {!checkingGoogle && (
                      <span style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 6, height: 6, borderRadius: '50%',
                        background: isGoogleConnected ? '#22c55e' : '#ef4444',
                        border: '1.5px solid var(--bg-surface)',
                        boxShadow: isGoogleConnected ? '0 0 4px #22c55e88' : '0 0 4px #ef444488',
                      }}/>
                    )}
                  </button>
                  <button className="cm-ibtn" onClick={handleAISummary} title="AI Summary">
                    <Sparkles size={16} style={{ color:'#f59e0b' }}/>
                  </button>
                  {isAdmin && (
                    <button className="cm-ibtn" onClick={handleExport} title="Export CSV">
                      <Download size={16}/>
                    </button>
                  )}
                </div>
              </div>

              {/* Load more */}
              {hasMore && (
                <div style={{ padding:'5px 0', textAlign:'center', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-base)' }}>
                  <button onClick={loadMore} style={{ fontSize:11, fontWeight:700, color:'var(--accent-primary)', background:'none', border:'none', cursor:'pointer' }}>
                    ↑ Load older messages
                  </button>
                </div>
              )}

              {/* Call error */}
              {callError && callState==='idle' && (
                <div className="cm-fadeIn" style={{
                  padding:'7px 16px', background:'#ef444410',
                  borderBottom:'1px solid #ef444422',
                  display:'flex', alignItems:'center', gap:8, justifyContent:'center',
                }}>
                  <AlertCircle size={13} style={{ color:'#ef4444', flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:'#ef4444', fontWeight:600 }}>{callError}</span>
                  <button onClick={()=>setCallError(null)} style={{ marginLeft:4, background:'none', border:'none', cursor:'pointer', color:'#ef4444', display:'flex' }}><X size={12}/></button>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'14px 16px 8px', display:'flex', flexDirection:'column', gap:1 }} className="custom-scrollbar">
                {loadingMsgs ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:12, justifyContent:'center', flex:1 }}>
                    {([[36,'35%',false],[36,'52%',true],[36,'44%',false],[36,'38%',true]] as any[]).map(([h,w,s]:any,i:number)=>(
                      <div key={i} style={{ display:'flex', justifyContent:s?'flex-end':'flex-start' }}>
                        <div className="cm-skel" style={{ height:h, width:w, borderRadius:14 }}/>
                      </div>
                    ))}
                  </div>
                ) : messages.length===0 ? (
                  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ width:56, height:56, borderRadius:'50%', background:'var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', border:'1px solid var(--border-subtle)' }}>
                        <MessageSquare size={24} style={{ color:'var(--text-tertiary)' }}/>
                      </div>
                      <p style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', margin:'0 0 4px' }}>No messages yet</p>
                      <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:0 }}>Be the first to say hello 👋</p>
                    </div>
                  </div>
                ) : groupedMessages.map((item,idx)=>{
                  if (item.type==='date') {
                    return (
                      <div key={item.id} className="cm-datesep">
                        <span className="cm-datesep-lbl">{item.date}</span>
                      </div>
                    );
                  }
                  const msg = item.msg;
                  const isSelf = msg.senderId===user?.id;
                  const isFlagged = msg.flagged??false;
                  const isOptimistic = msg._id.startsWith('opt-');
                  const seenLabel = msg._id===lastSentMsgId ? getSeenLabel(msg) : null;
                  const prevItem = groupedMessages[idx-1];
                  const prevMsg = prevItem?.type==='msg' ? prevItem.msg : null;
                  const isGrouped = !!(prevMsg && prevMsg.senderId===msg.senderId &&
                    (new Date(msg.createdAt).getTime()-new Date(prevMsg.createdAt).getTime())<5*60*1000);

                  return (
                    <div key={msg._id}
                      className="cm-msgrow cm-slideUp"
                      style={{
                        display:'flex', flexDirection:'column',
                        alignItems:isSelf?'flex-end':'flex-start',
                        marginTop:isGrouped?1:10,
                        opacity:isOptimistic?0.6:1, transition:'opacity 0.2s',
                      }}
                    >
                      {/* Sender name */}
                      {!isSelf && !isGrouped && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, marginLeft:2 }}>
                          <div style={{
                            width:18, height:18, borderRadius:'50%',
                            background:`linear-gradient(135deg,${avatarBg(msg.senderName)})`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:7, fontWeight:800, color:'#fff', flexShrink:0,
                          }}>
                            {getInitials(msg.senderName)}
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)' }}>
                            {msg.senderName}
                          </span>
                        </div>
                      )}

                      {/* Toolbar */}
                      <div className="cm-toolbar" style={{ [isSelf?'right':'left']:0 }}>
                        <div style={{ position:'relative' }}>
                          <button className="cm-ibtn" style={{ padding:4 }}
                            onClick={()=>setActiveReactionPickerMsgId(msg._id===activeReactionPickerMsgId?null:msg._id)}
                            title="React"
                          >
                            <Smile size={13}/>
                          </button>
                          {activeReactionPickerMsgId===msg._id && (
                            <div style={{
                              position:'absolute', bottom:26, left:0,
                              background:'var(--bg-surface)',
                              border:'1px solid var(--border-subtle)',
                              borderRadius:10, padding:8,
                              display:'grid', gridTemplateColumns:'repeat(5,1fr)',
                              gap:3, zIndex:30, width:148,
                              boxShadow:'0 8px 24px rgba(0,0,0,.14)',
                            }}>
                              {COMMON_EMOJIS.map(emoji=>(
                                <button key={emoji}
                                  onClick={()=>handleToggleReaction(msg._id,emoji)}
                                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, padding:3, borderRadius:6, transition:'background 0.1s' }}
                                  onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-base)')}
                                  onMouseLeave={e=>(e.currentTarget.style.background='none')}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="cm-ibtn" style={{ padding:4 }} onClick={()=>fetchThreadReplies(msg)} title="Thread">
                          <MessageCircle size={13}/>
                        </button>
                        <button className="cm-ibtn" style={{ padding:4 }}
                          onClick={()=>{ setFlagMsgId(msg._id); setFlagReason(''); setShowFlagModal(true); }}
                          title="Flag"
                        >
                          <Flag size={13}/>
                        </button>
                      </div>

                      {/* Bubble */}
                      <div style={{ maxWidth:'72%', marginLeft:(!isSelf&&isGrouped)?24:0 }}>
                        <div className={`cm-bubble ${isSelf?'self':'other'}`}
                          style={{
                            background: isFlagged ? (isSelf?'#c2410c':'#ef444410') : undefined,
                            borderColor: isFlagged ? '#ef444440' : undefined,
                          }}
                        >
                          {msg.deleted ? (
                            <span style={{ color:isSelf?'rgba(255,255,255,.45)':'var(--text-tertiary)', fontStyle:'italic', fontSize:12 }}>
                              Message deleted
                            </span>
                          ) : (
                            <>
                              {msg.body && (
                                <div style={{ lineHeight: 1.52, display: 'flex', flexDirection: 'column', gap: 0 }}>
                                  {renderMessageBody(msg.body, isSelf)}
                                </div>
                              )}
                              {msg.attachments && msg.attachments.length>0 && (
                                <div style={{ marginTop:msg.body?8:0, display:'flex', flexDirection:'column', gap:5 }}>
                                  {msg.attachments.map((file,fidx)=>{
                                    const isImage = file.mimeType?.startsWith('image/');
                                    return (
                                      <div key={fidx} style={{ borderRadius:9, overflow:'hidden', border:'1px solid rgba(255,255,255,.15)', background:'rgba(0,0,0,.1)', maxWidth:220 }}>
                                        {isImage ? (
                                          <a href={file.url} target="_blank" rel="noreferrer">
                                            <img src={file.url} alt={file.name} style={{ width:'100%', maxHeight:140, objectFit:'cover', display:'block' }}/>
                                          </a>
                                        ) : (
                                          <a href={file.url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', textDecoration:'none' }}>
                                            <FileText size={15} style={{ color:isSelf?'rgba(255,255,255,.8)':'var(--accent-primary)', flexShrink:0 }}/>
                                            <div style={{ minWidth:0 }}>
                                              <p style={{ fontSize:11, fontWeight:700, color:isSelf?'#fff':'var(--text-primary)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</p>
                                              <p style={{ fontSize:10, color:isSelf?'rgba(255,255,255,.5)':'var(--text-tertiary)', margin:0 }}>{formatBytes(file.size)}</p>
                                            </div>
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {isFlagged && (
                                <div style={{ marginTop:4, display:'flex', alignItems:'center', gap:4, fontSize:10, color:isSelf?'#fca5a5':'#ef4444', fontWeight:700 }}>
                                  <AlertCircle size={10}/> Flagged
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Reactions */}
                        {msg.reactions && msg.reactions.length>0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4, justifyContent:isSelf?'flex-end':'flex-start' }}>
                            {msg.reactions.map((r,ridx)=>(
                              <button key={ridx}
                                onClick={()=>handleToggleReaction(msg._id,r.emoji)}
                                className={`cm-rxn ${r.users.includes(user?.id??'')?'me':''}`}
                              >
                                <span>{r.emoji}</span><span>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Thread */}
                        {!!msg.replyCount && msg.replyCount>0 && (
                          <button onClick={()=>fetchThreadReplies(msg)} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--accent-primary)', marginTop:4, padding:0 }}>
                            <CornerDownRight size={11}/> {msg.replyCount} {msg.replyCount===1?'reply':'replies'}
                          </button>
                        )}

                        {/* Time + seen */}
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3, justifyContent:isSelf?'flex-end':'flex-start' }}>
                          <span style={{ fontSize:10, color:'var(--text-tertiary)', fontWeight:500 }}>{formatTime(msg.createdAt)}</span>
                          {isSelf && (
                            seenLabel ? (
                              <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'var(--accent-primary)', fontWeight:700 }}>
                                <CheckCheck size={11}/> {seenLabel}
                              </span>
                            ) : isOptimistic ? (
                              <Check size={10} style={{ color:'var(--text-tertiary)' }}/>
                            ) : (
                              <Check size={10} style={{ color:'var(--text-secondary)' }}/>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {Object.keys(typingUsers).length>0 && (
                  <div className="cm-fadeIn" style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'7px 12px', background:'var(--bg-base)',
                    borderRadius:12, alignSelf:'flex-start', marginTop:8,
                    border:'1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                      {[0,1,2].map(i=>(
                        <span key={i} style={{
                          width:5, height:5, borderRadius:'50%', background:'var(--text-secondary)',
                          display:'inline-block',
                          animation:`typingBounce 1.2s ease-in-out ${i*0.2}s infinite`,
                        }}/>
                      ))}
                    </div>
                    <span style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:500 }}>
                      {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length===1?'is':'are'} typing
                    </span>
                  </div>
                )}
                <div ref={messagesEndRef}/>
              </div>

              {/* File previews */}
              {attachedFiles.length>0 && (
                <div style={{ padding:'7px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', flexWrap:'wrap', gap:5, background:'var(--bg-base)' }}>
                  {attachedFiles.map((file,idx)=>(
                    <div key={idx} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8, fontSize:11, fontWeight:600, color:'var(--text-primary)' }}>
                      <FileText size={10} style={{ color:'var(--accent-primary)' }}/>
                      <span style={{ maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span>
                      <button onClick={()=>setAttachedFiles(prev=>prev.filter((_,i)=>i!==idx))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', display:'flex', padding:0 }}>
                        <X size={10}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', borderTop:'1px solid var(--border-subtle)', background:'var(--bg-surface)' }}>
                <button className="cm-ibtn" onClick={()=>fileInputRef.current?.click()} disabled={uploading} title="Attach">
                  {uploading ? <Loader2 size={16} style={{ animation:'spin 1s linear infinite', color:'var(--accent-primary)' } as any}/> : <Paperclip size={16}/>}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display:'none' }}/>
                
                {/* 🎥 Jitsi Video Call Button (input bar) */}
                <button
                  className="cm-ibtn accent"
                  onClick={handleVideoCall}
                  disabled={callState !== 'idle'}
                  title={callState !== 'idle' ? 'Call in progress' : 'Start Video Call'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: callState !== 'idle' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    color: callState !== 'idle' ? 'rgba(129, 140, 248, 0.5)' : 'var(--accent-primary)',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: callState !== 'idle' ? 'not-allowed' : 'pointer',
                    opacity: callState !== 'idle' ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <MonitorPlay size={14} />
                  <span className="hidden sm:inline">Video Call</span>
                </button>
                <input
                  type="text"
                  placeholder={uploading?'Uploading…':`Message ${activeConv?.name??''}…`}
                  value={input}
                  onChange={e=>handleInputChange(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()}
                  disabled={sending||uploading}
                  className="cm-input"
                />
                <button className="cm-send" onClick={handleSend} disabled={(!input.trim()&&attachedFiles.length===0)||sending||uploading}>
                  <Send size={16}/>
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', border:'1px solid var(--border-subtle)' }}>
                  <MessageSquare size={26} style={{ color:'var(--text-tertiary)' }}/>
                </div>
                <p style={{ fontSize:15, fontWeight:750, color:'var(--text-primary)', margin:'0 0 6px', letterSpacing:'-0.01em' }}>No conversation selected</p>
                <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'0 0 18px' }}>Pick from the left or start something new</p>
                <button onClick={openNewDMModal} className="cm-pill primary">
                  <Plus size={14}/> New Chat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══ THREAD PANEL ══ */}
        {activeThreadParent && (
          <div 
            className="w-full lg:w-[296px] absolute lg:relative right-0 top-0 bottom-0 z-20 flex flex-col cm-fadeIn"
            style={{ borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', height: '100%' }}
          >
            <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <MessageCircle size={14} style={{ color:'var(--accent-primary)' }}/>
                <span style={{ fontSize:13, fontWeight:750, color:'var(--text-primary)' }}>Thread</span>
              </div>
              <button className="cm-ibtn" onClick={()=>{ setActiveThreadParent(null); setThreadReplies([]); }}><X size={14}/></button>
            </div>
            <div style={{ padding:'10px 13px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-base)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <div style={{
                  width:18, height:18, borderRadius:'50%',
                  background:`linear-gradient(135deg,${avatarBg(activeThreadParent.senderName)})`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:7, fontWeight:800, color:'#fff',
                }}>
                  {getInitials(activeThreadParent.senderName)}
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{activeThreadParent.senderName}</span>
                <span style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:'auto' }}>{formatTime(activeThreadParent.createdAt)}</span>
              </div>
              <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, lineHeight:1.5, fontStyle:'italic' }}>&quot;{activeThreadParent.body}&quot;</p>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }} className="custom-scrollbar">
              {loadingThread ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'24px 0', fontSize:12, color:'var(--text-secondary)' }}>
                  <Loader2 size={13} style={{ animation:'spin 1s linear infinite' } as any}/> Loading replies…
                </div>
              ) : threadReplies.length===0 ? (
                <div style={{ textAlign:'center', padding:'24px 0' }}>
                  <CornerDownRight size={20} style={{ color:'var(--text-tertiary)', margin:'0 auto 7px', display:'block' }}/>
                  <p style={{ fontSize:12, color:'var(--text-tertiary)', fontWeight:650, margin:'0 0 3px' }}>No replies yet</p>
                  <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0 }}>Be the first to reply</p>
                </div>
              ) : threadReplies.map(reply=>(
                <div key={reply._id} className="cm-slideUp" style={{ background:'var(--bg-base)', border:'1px solid var(--border-subtle)', borderRadius:11, padding:'9px 11px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{
                        width:17, height:17, borderRadius:'50%',
                        background:`linear-gradient(135deg,${avatarBg(reply.senderName)})`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:7, fontWeight:800, color:'#fff',
                      }}>
                        {getInitials(reply.senderName)}
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{reply.senderName}</span>
                    </div>
                    <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>{formatTime(reply.createdAt)}</span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, lineHeight:1.5, wordBreak:'break-word' }}>
                     {renderMessageBody(reply.body, false)}
                   </p>
                  {reply.reactions && reply.reactions.length>0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:5 }}>
                      {reply.reactions.map((r,ri)=>(
                        <button key={ri} onClick={()=>handleToggleReaction(reply._id,r.emoji)} className="cm-rxn">
                          <span>{r.emoji}</span><span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={threadEndRef}/>
            </div>
            <div style={{ padding:'9px 11px', borderTop:'1px solid var(--border-subtle)', display:'flex', gap:7, background:'var(--bg-surface)' }}>
              <input
                type="text"
                placeholder="Reply to thread…"
                value={threadInput}
                onChange={e=>setThreadInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSendThreadReply()}
                disabled={sendingThread}
                className="cm-input"
                style={{ fontSize:12 }}
              />
              <button className="cm-send" style={{ width:34, height:34, borderRadius:9 }} onClick={handleSendThreadReply} disabled={!threadInput.trim()||sendingThread}>
                <Send size={13}/>
              </button>
            </div>
          </div>
        )}

        {/* ══ AI SUMMARY MODAL ══ */}
        {showSummary && (
          <div className="cm-fadeIn" style={{ position:'absolute', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(10px)', borderRadius:16 }}>
            <div className="cm-scaleIn" style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:16, width:'88%', maxWidth:460, padding:22, maxHeight:'80%', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,.28)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, paddingBottom:13, borderBottom:'1px solid var(--border-subtle)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'#f59e0b18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Sparkles size={14} style={{ color:'#f59e0b' }}/>
                  </div>
                  <span style={{ fontSize:14, fontWeight:750, color:'var(--text-primary)' }}>AI Chat Summary</span>
                </div>
                <button className="cm-ibtn" onClick={()=>{ setShowSummary(false); setSummaryText(''); }}><X size={16}/></button>
              </div>
              <div style={{ flex:1, overflowY:'auto', fontSize:13, color:'var(--text-primary)', lineHeight:1.65 }} className="custom-scrollbar">
                {loadingSummary ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'44px 0', gap:10 }}>
                    <Loader2 size={24} style={{ color:'var(--accent-primary)', animation:'spin 1s linear infinite' } as any}/>
                    <p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600, margin:0 }}>Analyzing conversation…</p>
                  </div>
                ) : (
                  <p style={{ margin:0, whiteSpace:'pre-wrap', fontWeight:440 }}>{summaryText}</p>
                )}
              </div>
              <div style={{ marginTop:14, paddingTop:13, borderTop:'1px solid var(--border-subtle)', display:'flex', justifyContent:'flex-end' }}>
                <button className="cm-pill primary" onClick={()=>{ setShowSummary(false); setSummaryText(''); }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ FLAG MODAL ══ */}
        {showFlagModal && (
          <div className="cm-fadeIn" style={{ position:'absolute', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(10px)', borderRadius:16 }}>
            <div className="cm-scaleIn" style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:14, width:310, padding:20, boxShadow:'0 16px 48px rgba(0,0,0,.24)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:13 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <Flag size={14} style={{ color:'#ef4444' }}/><span style={{ fontSize:13, fontWeight:750, color:'#ef4444' }}>Flag Message</span>
                </div>
                <button className="cm-ibtn" onClick={()=>setShowFlagModal(false)}><X size={14}/></button>
              </div>
              <p style={{ fontSize:12, color:'var(--text-secondary)', margin:'0 0 11px', lineHeight:1.5 }}>Flagged messages are reviewed by workspace admins.</p>
              <textarea
                placeholder="Describe the issue…"
                value={flagReason}
                onChange={e=>setFlagReason(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', background:'var(--bg-base)', border:'1.5px solid var(--border-subtle)', borderRadius:9, padding:'8px 11px', fontSize:12, color:'var(--text-primary)', outline:'none', fontFamily:'inherit', height:68, resize:'none', marginBottom:13, lineHeight:1.5, transition:'border-color 0.14s' }}
                onFocus={e=>(e.currentTarget.style.borderColor='var(--accent-primary)')}
                onBlur={e=>(e.currentTarget.style.borderColor='var(--border-subtle)')}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                <button className="cm-pill ghost" onClick={()=>setShowFlagModal(false)}>Cancel</button>
                <button className="cm-pill danger" onClick={handleFlagMessage} disabled={flagging||!flagReason.trim()}>
                  {flagging?'Flagging…':'Submit Flag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ NEW DM MODAL ══ */}
        {showNewDM && (
          <div className="cm-fadeIn" style={{ position:'absolute', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(10px)', borderRadius:16 }}>
            <div className="cm-scaleIn" style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:16, width:310, padding:20, boxShadow:'0 24px 64px rgba(0,0,0,.26)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <span style={{ fontSize:14, fontWeight:750, color:'var(--text-primary)' }}>Start a conversation</span>
                <button className="cm-ibtn" onClick={()=>setShowNewDM(false)}><X size={15}/></button>
              </div>
              <div style={{ maxHeight:276, overflowY:'auto', display:'flex', flexDirection:'column', gap:2 }} className="custom-scrollbar">
                {workspaceUsers.length===0 ? (
                  <div style={{ textAlign:'center', padding:'24px 0' }}>
                    <Users size={24} style={{ color:'var(--text-tertiary)', margin:'0 auto 8px', display:'block' }}/>
                    <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:0, fontWeight:600 }}>No other users found</p>
                  </div>
                ) : workspaceUsers.map(u=>{
                  const isOn = onlineUsers.has(u._id);
                  return (
                    <button key={u._id} onClick={()=>startDM(u._id)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 9px', borderRadius:10, background:'none', border:'none', cursor:'pointer', textAlign:'left', transition:'background 0.12s', width:'100%' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-base)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='none')}
                    >
                      <div style={{ position:'relative', flexShrink:0 }}>
                        <div style={{ width:36, height:36, borderRadius:'50%', background:`linear-gradient(135deg,${avatarBg(u.name)})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff' }}>
                          {getInitials(u.name)}
                        </div>
                        <span style={{ position:'absolute', bottom:0, right:0, width:9, height:9, borderRadius:'50%', background:isOn?'#22c55e':'#6b7280', border:'2px solid var(--bg-surface)', boxShadow:isOn?'0 0 5px #22c55e66':'none' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize:11, color:'var(--text-secondary)' }}>{u.email}</div>
                        <div style={{ fontSize:10, fontWeight:650, color:isOn?'#22c55e':'var(--text-tertiary)', marginTop:1 }}>{isOn?'● Online':'○ Offline'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══ GOOGLE MEET SETUP MODAL ══ */}
        {showMeetSetupModal && (
          <div className="cm-fadeIn" style={{ position:'absolute', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.55)', backdropFilter:'blur(12px)', borderRadius:16 }}>
            <div className="cm-scaleIn" style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:18, width:340, padding:24, boxShadow:'0 24px 64px rgba(0,0,0,.32)', display:'flex', flexDirection:'column', gap:0 }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#4285f4,#34a853)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, boxShadow:'0 4px 12px #4285f440' }}>
                    🎥
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:760, color:'var(--text-primary)', letterSpacing:'-0.01em' }}>Google Meet</div>
                    <div style={{ fontSize:11, color:'var(--text-secondary)', fontWeight:550 }}>Video conferencing</div>
                  </div>
                </div>
                <button className="cm-ibtn" onClick={() => setShowMeetSetupModal(false)}><X size={16}/></button>
              </div>

              {/* Connection status card */}
              <div style={{ background: isGoogleConnected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1.5px solid ${isGoogleConnected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius:12, padding:'12px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: isGoogleConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:14 }}>{isGoogleConnected ? '✅' : '🔗'}</span>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color: isGoogleConnected ? '#22c55e' : '#ef4444' }}>
                    {isGoogleConnected ? 'Google Account Connected' : 'No Google Account Connected'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, fontWeight:500 }}>
                    {isGoogleConnected
                      ? (googleEmail ?? 'Your account is linked and ready')
                      : 'Connect your Google account to host meetings as yourself'}
                  </div>
                </div>
              </div>

              {/* Info */}
              {!isGoogleConnected && (
                <div style={{ marginBottom:16 }}>
                  <p style={{ fontSize:12, color:'var(--text-secondary)', margin:'0 0 10px', lineHeight:1.6, fontWeight:500 }}>
                    When you connect your Google account:
                  </p>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {['You become the meeting organizer & host', 'Manage participant admission requests', 'Full host controls for your meeting'].map((item, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-primary)', fontWeight:550 }}>
                        <span style={{ color:'#22c55e', flexShrink:0 }}>✓</span> {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {isGoogleConnected ? (
                  <button
                    className="cm-pill primary"
                    onClick={() => { setShowMeetSetupModal(false); handleCreateGoogleMeetDirect(); }}
                    disabled={creatingMeet}
                    style={{ justifyContent:'center', padding:'10px 16px', fontSize:13, fontWeight:700, gap:8 }}
                  >
                    {creatingMeet ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' } as any}/> Creating…</> : <><Video size={14}/> Start Meeting Now</>}
                  </button>
                ) : (
                  <a
                    href={`/api/gmail/oauth?action=connect&returnTo=${encodeURIComponent('/employee?tab=chat')}`}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:700,
                      background:'linear-gradient(135deg,#4285f4,#34a853)', color:'#fff',
                      textDecoration:'none', boxShadow:'0 4px 14px rgba(66,133,244,0.35)',
                      transition:'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow='0 6px 20px rgba(66,133,244,0.45)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform='translateY(0)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow='0 4px 14px rgba(66,133,244,0.35)'; }}
                  >
                    🔗 Connect Google Account
                  </a>
                )}
                {isGoogleConnected && (
                  <a
                    href={`/api/gmail/oauth?action=connect&returnTo=${encodeURIComponent('/employee?tab=chat')}`}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:11, color:'var(--text-tertiary)', textDecoration:'none', fontWeight:600, padding:'4px 0' }}
                  >
                    Switch Google Account
                  </a>
                )}
                <button
                  className="cm-pill ghost"
                  onClick={() => setShowMeetSetupModal(false)}
                  style={{ justifyContent:'center', fontSize:12 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instant Jitsi Meet Modal removed - Integrated with the Jitsi Call flow */}

        {/* ══ GOOGLE MEET TOAST NOTIFICATION ══ */}
        {meetingToast && (
          <div className="cm-scaleIn" style={{
            position:'absolute', bottom:74, right:20, zIndex:100,
            background:'rgba(15, 23, 42, 0.9)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(255, 255, 255, 0.1)',
            borderRadius:14, padding:'12px 16px', width:280,
            boxShadow:'0 12px 32px rgba(0,0,0,.35)',
            display:'flex', flexDirection:'column', gap:8,
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:750, color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
                <span>🎥</span> New Meeting
              </span>
              <button 
                onClick={() => setMeetingToast(null)} 
                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', display:'flex', padding:0 }}
              >
                <X size={14}/>
              </button>
            </div>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.85)', margin:0, lineHeight:1.4 }}>
              {meetingToast.creatorName} started a video call in {meetingToast.conversationName}.
            </p>
            <div style={{ display:'flex', gap:8, marginTop:2 }}>
              <button
                onClick={() => {
                  window.open(meetingToast.meetingLink, '_blank');
                  setMeetingToast(null);
                }}
                className="cm-pill primary"
                style={{ flex:1, padding:'6px 10px', fontSize:11, justifyContent:'center' }}
              >
                Join Meeting
              </button>
              <button
                onClick={() => setMeetingToast(null)}
                className="cm-pill ghost"
                style={{ padding:'6px 10px', fontSize:11, background:'rgba(255,255,255,0.1)', border:'none', color:'#fff' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ══ DELETE CONVERSATION CONFIRMATION MODAL ══ */}
        {deleteConfirmId && (() => {
          const convToDelete = conversations.find(c => c._id === deleteConfirmId);
          const convName = convToDelete?.name ?? 'this conversation';
          return (
            <div className="cm-fadeIn" style={{
              position:'absolute', inset:0, zIndex:300,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,.55)', backdropFilter:'blur(10px)',
              borderRadius:16,
            }}>
              <div className="cm-scaleIn" style={{
                background:'var(--bg-surface)',
                border:'1px solid var(--border-subtle)',
                borderRadius:18, width:340, padding:'28px 28px 24px',
                boxShadow:'0 24px 64px rgba(0,0,0,.35)',
                textAlign:'center',
              }}>
                {/* Icon */}
                <div style={{
                  width:52, height:52, borderRadius:14,
                  background:'rgba(239,68,68,0.12)',
                  border:'1.5px solid rgba(239,68,68,0.25)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  margin:'0 auto 16px',
                }}>
                  <Trash2 size={22} color="#ef4444"/>
                </div>

                <div style={{ fontSize:16, fontWeight:780, color:'var(--text-primary)', marginBottom:8, letterSpacing:'-0.01em' }}>
                  Delete Conversation?
                </div>
                <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'0 0 22px', lineHeight:1.55, fontWeight:480 }}>
                  <strong style={{ color:'var(--text-primary)' }}>{convName}</strong> will be removed from your sidebar.
                  Messages and files are preserved for audit purposes.
                </p>

                <div style={{ display:'flex', gap:10 }}>
                  <button
                    className="cm-pill ghost"
                    style={{ flex:1, justifyContent:'center', fontSize:13 }}
                    onClick={() => setDeleteConfirmId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="cm-pill danger"
                    style={{ flex:1, justifyContent:'center', fontSize:13, gap:6 }}
                    disabled={deletingConvId === deleteConfirmId}
                    onClick={() => handleDeleteConversation(deleteConfirmId)}
                  >
                    {deletingConvId === deleteConfirmId
                      ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' } as any}/> Deleting…</>
                      : <><Trash2 size={13}/> Delete</>
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ DELETE TOAST ══ */}
        {deleteToast && (
          <div className="cm-slideUp" style={{
            position:'absolute', bottom:20, left:20, zIndex:200,
            background: deleteToast.startsWith('Could') || deleteToast.startsWith('Network')
              ? 'rgba(239,68,68,0.93)' : 'rgba(15,23,42,0.92)',
            backdropFilter:'blur(10px)',
            border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:12, padding:'10px 16px',
            display:'flex', alignItems:'center', gap:8,
            boxShadow:'0 8px 24px rgba(0,0,0,.25)',
          }}>
            {deleteToast.startsWith('Could') || deleteToast.startsWith('Network')
              ? <AlertCircle size={14} color="#fff"/>
              : <CheckCheck size={14} color="#4ade80"/>
            }
            <span style={{ fontSize:12, fontWeight:600, color:'#fff' }}>{deleteToast}</span>
            <button
              onClick={() => setDeleteToast(null)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.55)', display:'flex', marginLeft:4, padding:0 }}
            >
              <X size={12}/>
            </button>
          </div>
        )}

      </div>
    </>
  );
}
