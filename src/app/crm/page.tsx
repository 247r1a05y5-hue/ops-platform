'use client';
import { useState, useEffect, useRef } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import {
  Search, Plus, Filter, MoreHorizontal, Mail, Phone, Calendar, ChevronRight,
  LayoutGrid, List, Download, Target, TrendingUp, Clock, CheckCircle, X, Send,
  FileText, Settings, Zap, Upload, User, AlertCircle, MessageSquare, Paperclip,
  Star, DollarSign, ArrowRight, AlertTriangle, CheckSquare, Link, BarChart2,
  Briefcase, Activity, Bell, ChevronDown, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCSV } from '@/utils/export';
import { triggerActivityLog } from '@/utils/activity';

type CRMStage = 'Discovery' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Closing';

type Lead = {
  _id?: string;
  name: string;
  company: string;
  value: string;
  stage: CRMStage;
  status: 'Hot' | 'Warm' | 'Cold';
  lastContact: string;
  email: string;
  phone: string;
  assignedTo?: string;
  assignedToName?: string;
  notes: Array<{ content: string; author: string; createdAt: string }>;
  emails: Array<{
    subject: string; body: string; sender: string; sentAt: string;
    scheduledAt?: string; status: 'sent' | 'scheduled' | 'opened' | 'clicked' | 'replied';
    opens: number; clicks: number;
  }>;
  documents: Array<{ name: string; size: string; url: string; uploadedAt: string }>;
  history: Array<{ event: string; user: string; time: string }>;
  activeSequence?: string;
  sequenceStep?: number;
  // Workflow fields
  leadSource?: string;
  welcomeEmailSent?: boolean;
  lastContactedAt?: string;
  followUpReminders?: Array<{ dueAt: string; note: string; completed: boolean; createdAt: string }>;
  leadScore?: number;
  qualificationNotes?: string;
  proposalStatus?: 'not_sent' | 'sent' | 'viewed' | 'accepted' | 'rejected';
  proposalSentAt?: string;
  paymentLink?: string;
  razorpayOrderId?: string;
  negotiationNotes?: Array<{ content: string; author: string; revision: number; createdAt: string }>;
  negotiationRevision?: number;
  paymentStatus?: 'not_initiated' | 'pending' | 'paid' | 'failed';
  onboardingReady?: boolean;
  closedAt?: string;
  stageEnteredAt?: Record<string, string>;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
};

const STAGES: CRMStage[] = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];

const STAGE_META: Record<CRMStage, { color: string; dot: string; icon: React.ReactNode; desc: string }> = {
  Discovery:   { color: 'text-blue-500',   dot: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',    icon: <Target size={14}/>,      desc: 'Lead identified' },
  Contacted:   { color: 'text-indigo-500', dot: 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]', icon: <Phone size={14}/>,       desc: 'Outreach initiated' },
  Qualified:   { color: 'text-emerald-500',dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',icon: <CheckCircle size={14}/>, desc: 'Lead scored & approved' },
  Proposal:    { color: 'text-amber-500',  dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',  icon: <FileText size={14}/>,    desc: 'Proposal in progress' },
  Negotiation: { color: 'text-orange-500', dot: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]', icon: <Briefcase size={14}/>,   desc: 'Terms being discussed' },
  Closing:     { color: 'text-rose-500',   dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',    icon: <DollarSign size={14}/>,  desc: 'Deal closing' },
};

// ── Stage Action Panel Definitions ────────────────────────────────────────────
function StageActionsPanel({
  lead, onAction, loading
}: {
  lead: Lead;
  onAction: (action: string, params?: Record<string, any>) => void;
  loading: Record<string, boolean>;
}) {
  const [callDuration, setCallDuration] = useState('15');
  const [callOutcome, setCallOutcome] = useState('');
  const [negNote, setNegNote] = useState('');
  const [scoreValue, setScoreValue] = useState(String(lead.leadScore || 50));
  const [qualNotes, setQualNotes] = useState(lead.qualificationNotes || '');

  const btn = (key: string, label: string, onClick: () => void, color = 'bg-accent', icon?: React.ReactNode) => (
    <button
      onClick={onClick}
      disabled={loading[key]}
      className={`flex items-center gap-2 px-4 py-2.5 ${color} text-white rounded-xl text-xs font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-50`}
    >
      {loading[key] ? <RefreshCw size={12} className="animate-spin" /> : icon}
      {loading[key] ? 'Working...' : label}
    </button>
  );

  // ── Discovery ──
  if (lead.stage === 'Discovery') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Discovery Actions</p>
      <div className="flex flex-wrap gap-2">
        {!lead.welcomeEmailSent
          ? btn('welcome_email', 'Send Welcome Email', () => onAction('send_welcome_email'), 'bg-blue-500', <Mail size={12}/>)
          : <span className="flex items-center gap-1 text-xs text-emerald-500 font-bold"><CheckCircle size={12}/> Welcome email sent</span>
        }
        {btn('move_contacted', 'Mark as Contacted →', () => onAction('move_stage', { stage: 'Contacted' }), 'bg-indigo-500', <ArrowRight size={12}/>)}
      </div>
      <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1">Lead Source</p>
        <p className="text-xs text-secondary font-medium">{lead.leadSource || 'Manual Entry'}</p>
      </div>
    </div>
  );

  // ── Contacted ──
  if (lead.stage === 'Contacted') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Contacted Actions</p>
      {lead.lastContactedAt && (
        <div className="p-3 bg-surface border border-border rounded-xl">
          <p className="text-[10px] text-secondary font-bold mb-0.5">Last Contacted</p>
          <p className="text-xs font-bold text-primary">{new Date(lead.lastContactedAt).toLocaleString()}</p>
        </div>
      )}
      <div className="p-4 bg-base border border-border rounded-xl space-y-3">
        <p className="text-[10px] text-secondary font-bold uppercase">Log Call</p>
        <div className="flex gap-2">
          <input type="number" value={callDuration} onChange={e => setCallDuration(e.target.value)}
            placeholder="Min" className="w-20 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-bold text-primary focus:ring-1 focus:ring-accent outline-none" />
          <input type="text" value={callOutcome} onChange={e => setCallOutcome(e.target.value)}
            placeholder="Outcome / notes..." className="flex-1 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-medium text-primary focus:ring-1 focus:ring-accent outline-none" />
        </div>
        {btn('log_call', 'Log Call', () => onAction('log_call', { duration: callDuration, outcome: callOutcome }), 'bg-indigo-500', <Phone size={12}/>)}
      </div>
      <div className="flex gap-2 flex-wrap">
        {btn('add_reminder', 'Set Follow-Up (+3d)', () => onAction('add_reminder', { daysFromNow: 3 }), 'bg-surface border border-border text-primary !text-primary', <Bell size={12}/>)}
        {btn('move_qualified', 'Mark Qualified →', () => onAction('move_stage', { stage: 'Qualified' }), 'bg-emerald-500', <ArrowRight size={12}/>)}
      </div>
      {(lead.followUpReminders?.filter(r => !r.completed) || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-secondary font-bold uppercase">Pending Reminders</p>
          {lead.followUpReminders!.filter(r => !r.completed).map((r, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <div>
                <p className="text-xs font-bold text-primary">{r.note}</p>
                <p className="text-[10px] text-secondary">Due: {new Date(r.dueAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => onAction('complete_reminder', { reminderIndex: i })}
                className="text-[10px] font-bold text-emerald-500 hover:underline">Done</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Qualified ──
  if (lead.stage === 'Qualified') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Qualification Actions</p>
      <div className="p-4 bg-base border border-border rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-secondary font-bold uppercase">Lead Score</p>
          <span className={`text-lg font-black ${(lead.leadScore || 0) >= 70 ? 'text-emerald-500' : (lead.leadScore || 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
            {lead.leadScore || 0}/100
          </span>
        </div>
        <div className="w-full bg-border rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${(lead.leadScore || 0) >= 70 ? 'bg-emerald-500' : (lead.leadScore || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${lead.leadScore || 0}%` }} />
        </div>
        <div className="flex gap-2">
          <input type="number" min="0" max="100" value={scoreValue} onChange={e => setScoreValue(e.target.value)}
            className="w-20 px-3 py-2 bg-surface border border-border rounded-xl text-xs font-bold text-primary focus:ring-1 focus:ring-accent outline-none" />
          {btn('score_lead', 'Update Score', () => onAction('score_lead', { score: scoreValue, notes: qualNotes }), 'bg-emerald-500', <Star size={12}/>)}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] text-secondary font-bold uppercase">Qualification Notes</p>
        <textarea value={qualNotes} onChange={e => setQualNotes(e.target.value)} rows={3}
          placeholder="Budget confirmed, timeline 3 months, decision maker identified..."
          className="w-full bg-base border border-border rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-accent resize-none text-primary" />
        {btn('save_qual', 'Save Notes', () => onAction('update_qualification', { qualificationNotes: qualNotes, leadScore: scoreValue }), 'bg-surface border border-border text-primary !text-primary')}
      </div>
      <div className="flex flex-wrap gap-2">
        {btn('move_proposal', 'Move to Proposal →', () => onAction('move_stage', { stage: 'Proposal' }), 'bg-amber-500', <ArrowRight size={12}/>)}
      </div>
    </div>
  );

  // ── Proposal ──
  if (lead.stage === 'Proposal') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Proposal Actions</p>
      <div className="p-3 bg-surface border border-border rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-secondary font-bold">Proposal Status</p>
          <span className={`text-xs font-black ${
            lead.proposalStatus === 'accepted' ? 'text-emerald-500' :
            lead.proposalStatus === 'rejected' ? 'text-red-500' :
            lead.proposalStatus === 'sent' ? 'text-blue-500' : 'text-secondary'
          }`}>{(lead.proposalStatus || 'not_sent').replace('_', ' ').toUpperCase()}</span>
        </div>
        {lead.proposalSentAt && (
          <p className="text-[10px] text-tertiary">Sent {new Date(lead.proposalSentAt).toLocaleDateString()}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {btn('gen_proposal', 'Generate & Send Proposal', () => onAction('generate_proposal'), 'bg-amber-500', <FileText size={12}/>)}
        {!lead.paymentLink
          ? btn('create_payment_link', 'Create Payment Link', () => onAction('create_payment_link'), 'bg-emerald-600', <Link size={12}/>)
          : (
            <a href={lead.paymentLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-all">
              <Link size={12}/> View Payment Link
            </a>
          )
        }
      </div>
      {lead.paymentLink && (
        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <p className="text-[10px] text-emerald-600 font-bold mb-1">Payment Link Active</p>
          <p className="text-[10px] text-secondary font-mono break-all">{lead.paymentLink}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select onChange={e => onAction('update_proposal_status', { proposalStatus: e.target.value })}
          className="px-3 py-2 bg-base border border-border rounded-xl text-xs font-bold text-primary focus:ring-1 focus:ring-accent outline-none">
          <option value="">Update Status...</option>
          {['not_sent','sent','viewed','accepted','rejected'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ').toUpperCase()}</option>
          ))}
        </select>
        {btn('move_negotiation', 'Move to Negotiation →', () => onAction('move_stage', { stage: 'Negotiation' }), 'bg-orange-500', <ArrowRight size={12}/>)}
      </div>
    </div>
  );

  // ── Negotiation ──
  if (lead.stage === 'Negotiation') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Negotiation Actions</p>
      <div className="flex items-center justify-between p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl">
        <p className="text-xs font-bold text-orange-600 dark:text-orange-400">Revision Tracker</p>
        <span className="text-lg font-black text-orange-500">Rev. {lead.negotiationRevision || 0}</span>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] text-secondary font-bold uppercase">Add Negotiation Note</p>
        <textarea value={negNote} onChange={e => setNegNote(e.target.value)} rows={3}
          placeholder="Terms discussed, revised pricing, concessions made..."
          className="w-full bg-base border border-border rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-accent resize-none text-primary" />
        {btn('add_neg_note', 'Save Note + Increment Rev.', () => { onAction('add_negotiation_note', { content: negNote }); setNegNote(''); }, 'bg-orange-500', <Briefcase size={12}/>)}
      </div>
      {(lead.negotiationNotes || []).length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {lead.negotiationNotes!.slice().reverse().map((n, i) => (
            <div key={i} className="p-3 bg-base border border-border rounded-xl">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] font-black text-orange-500 uppercase">Rev. {n.revision}</span>
                <span className="text-[9px] text-tertiary">{new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-primary font-medium">{n.content}</p>
              <p className="text-[9px] text-secondary mt-1">— {n.author}</p>
            </div>
          ))}
        </div>
      )}
      {/* Approval Gate */}
      {lead.approvalStatus === 'pending' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Approval Pending</p>
            <p className="text-[10px] text-secondary">High-value deal — waiting for Admin approval before Closing.</p>
          </div>
        </div>
      )}
      {lead.approvalStatus === 'rejected' && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-xs font-bold text-red-600 dark:text-red-400">Approval Rejected — contact Admin to proceed.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {btn(
          'move_closing',
          lead.approvalStatus === 'pending' ? 'Awaiting Approval…' : 'Move to Closing →',
          () => lead.approvalStatus !== 'pending' && onAction('move_stage', { stage: 'Closing' }),
          lead.approvalStatus === 'pending' ? 'bg-slate-400 opacity-50 cursor-not-allowed' : 'bg-rose-500',
          <ArrowRight size={12}/>
        )}
      </div>
    </div>
  );

  // ── Closing ──
  if (lead.stage === 'Closing') return (
    <div className="space-y-4">
      <p className="text-[10px] text-secondary font-bold uppercase tracking-widest">Closing Actions</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-surface border border-border rounded-xl">
          <p className="text-[10px] text-secondary font-bold mb-1">Payment Status</p>
          <span className={`text-sm font-black ${
            lead.paymentStatus === 'paid' ? 'text-emerald-500' :
            lead.paymentStatus === 'pending' ? 'text-amber-500' :
            lead.paymentStatus === 'failed' ? 'text-red-500' : 'text-secondary'
          }`}>{(lead.paymentStatus || 'not_initiated').replace('_', ' ').toUpperCase()}</span>
        </div>
        <div className="p-3 bg-surface border border-border rounded-xl">
          <p className="text-[10px] text-secondary font-bold mb-1">Onboarding</p>
          <span className={`text-sm font-black ${lead.onboardingReady ? 'text-emerald-500' : 'text-secondary'}`}>
            {lead.onboardingReady ? '✓ READY' : 'Pending'}
          </span>
        </div>
      </div>
      {lead.paymentStatus !== 'paid' && (
        <div className="flex flex-wrap gap-2">
          {btn('mark_paid', 'Mark Payment Received', () => onAction('mark_payment_received'), 'bg-emerald-600', <CheckSquare size={12}/>)}
        </div>
      )}
      {lead.paymentStatus === 'paid' && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-emerald-500" />
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Deal Closed — Payment Confirmed</p>
          </div>
          <p className="text-xs text-secondary">This lead has been converted and is ready for onboarding.</p>
          {lead.closedAt && <p className="text-[10px] text-tertiary mt-1">Closed: {new Date(lead.closedAt).toLocaleDateString()}</p>}
        </div>
      )}
      <div className="p-3 bg-base border border-border rounded-xl">
        <p className="text-[10px] text-secondary font-bold mb-1">Lead Score at Close</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-border rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${lead.leadScore || 0}%` }} />
          </div>
          <span className="text-xs font-black text-emerald-500">{lead.leadScore || 0}/100</span>
        </div>
      </div>
    </div>
  );

  return null;
}

// ── Funnel Mini Chart ─────────────────────────────────────────────────────────
function FunnelBar({ funnelData }: { funnelData: Array<{ stage: string; count: number; conversionRate: number; color: string }> }) {
  const max = Math.max(...funnelData.map(f => f.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {funnelData.map((f, i) => (
        <div key={f.stage} className="flex-1 flex flex-col items-center gap-1">
          <div className="text-[8px] font-black text-secondary">{f.count}</div>
          <div className={`w-full rounded-sm transition-all ${STAGE_META[f.stage as CRMStage]?.dot.split(' ')[0] || 'bg-gray-400'}`}
            style={{ height: `${Math.max(4, (f.count / max) * 40)}px` }} />
        </div>
      ))}
    </div>
  );
}

export default function CRM() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Modals & Dynamic State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [modalTab, setModalTab] = useState<'workflow' | 'proposal' | 'timeline' | 'notes' | 'outreach' | 'documents' | 'history' | 'approvals'>('workflow');

  // Workflow action loading state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Workflow log
  const [workflowLog, setWorkflowLog] = useState<any[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // Funnel analytics
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [showFunnel, setShowFunnel] = useState(false);

  // Dynamic Email Templates States
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [tempModalMode, setTempModalMode] = useState<'create' | 'edit'>('create');
  const [tempId, setTempId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempSubject, setTempSubject] = useState('');
  const [tempBody, setTempBody] = useState('');

  // Input states for new lead
  const [nlName, setNlName] = useState('');
  const [nlEmail, setNlEmail] = useState('');
  const [nlCompany, setNlCompany] = useState('');
  const [nlPhone, setNlPhone] = useState('');
  const [nlValue, setNlValue] = useState('5000');
  const [nlStatus, setNlStatus] = useState<'Hot' | 'Warm' | 'Cold'>('Warm');
  const [nlStage, setNlStage] = useState<CRMStage>('Discovery');
  const [nlAssigned, setNlAssigned] = useState('Maya Thompson');
  const [nlSource, setNlSource] = useState('Manual Entry');

  // Input states for outreach
  const [outSubject, setOutSubject] = useState('');
  const [outBody, setOutBody] = useState('');
  const [outTemplate, setOutTemplate] = useState('Custom Email');
  const [outScheduled, setOutScheduled] = useState('');

  // Input states for notes
  const [newNote, setNewNote] = useState('');

  // Proposal-specific states
  const [proposals, setProposals] = useState<any[]>([]);
  const [activeProposal, setActiveProposal] = useState<any | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSaving, setProposalSaving] = useState(false);
  const [proposalGenerating, setProposalGenerating] = useState(false);

  // Form states for builder
  const [propTitle, setPropTitle] = useState('');
  const [propSubtitle, setPropSubtitle] = useState('');
  const [propIntro, setPropIntro] = useState('');
  const [propServices, setPropServices] = useState<any[]>([]);
  const [propMilestones, setPropMilestones] = useState<any[]>([]);
  const [propColor, setPropColor] = useState('#4f46e5');
  const [propCompanyName, setPropCompanyName] = useState('Antigravity OPS');
  const [propTagline, setPropTagline] = useState('Enterprise Operations Platform');
  const [propNotes, setPropNotes] = useState('');
  const [propTerms, setPropTerms] = useState('');
  const [propValidUntil, setPropValidUntil] = useState('');
  const [propSigName, setPropSigName] = useState('');
  const [propSigTitle, setPropSigTitle] = useState('');
  const [propFooter, setPropFooter] = useState('');
  const [propDiscount, setPropDiscount] = useState(0);
  const [propTax, setPropTax] = useState(0);

  // Service input temp states
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcDesc, setNewSvcDesc] = useState('');
  const [newSvcPrice, setNewSvcPrice] = useState(0);
  const [newSvcQty, setNewSvcQty] = useState(1);
  const [newSvcUnit, setNewSvcUnit] = useState('project');

  // Milestone input temp states
  const [newMsName, setNewMsName] = useState('');
  const [newMsDesc, setNewMsDesc] = useState('');
  const [newMsDate, setNewMsDate] = useState('');
  const [newMsDelivs, setNewMsDelivs] = useState('');

  const loadProposalIntoForm = (prop: any) => {
    if (!prop) {
      setPropTitle(`Proposal for ${selectedLead?.company || 'Client'}`);
      setPropSubtitle('');
      setPropIntro(`Dear ${selectedLead?.name || 'Client'},\n\nWe are pleased to present this enterprise proposal. Please review the following scope, pricing, and terms.`);
      setPropServices(selectedLead?.value ? [{
        name: 'Enterprise Suite Implementation',
        description: 'Full platform setup, configuration, and onboarding',
        price: parseFloat(String(selectedLead.value).replace(/[^0-9.]/g, '')) || 5000,
        quantity: 1,
        unit: 'project',
      }] : []);
      setPropMilestones([]);
      setPropColor('#4f46e5');
      setPropCompanyName('Antigravity OPS');
      setPropTagline('Enterprise Operations Platform');
      setPropNotes('');
      setPropTerms('Payment is due within 7 days of invoice receipt. All work is subject to the agreed scope of work.');
      setPropValidUntil(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setPropSigName(user?.name || '');
      setPropSigTitle(user?.role || '');
      setPropFooter('© Antigravity OPS. Confidential.');
      setPropDiscount(0);
      setPropTax(0);
      return;
    }

    setPropTitle(prop.title || '');
    setPropSubtitle(prop.subtitle || '');
    setPropIntro(prop.introduction || '');
    setPropServices(prop.services || []);
    setPropMilestones(prop.milestones || []);
    setPropColor(prop.branding?.primaryColor || '#4f46e5');
    setPropCompanyName(prop.branding?.companyName || 'Antigravity OPS');
    setPropTagline(prop.branding?.tagline || 'Enterprise Operations Platform');
    setPropNotes(prop.notes || '');
    setPropTerms(prop.terms || '');
    setPropValidUntil(prop.validUntil ? new Date(prop.validUntil).toISOString().split('T')[0] : '');
    setPropSigName(prop.signatureName || '');
    setPropSigTitle(prop.signatureTitle || '');
    setPropFooter(prop.footerText || '');
    setPropDiscount(prop.discount || 0);
    setPropTax(prop.tax || 0);
  };

  const fetchProposals = async (leadId: string) => {
    setProposalLoading(true);
    try {
      const res = await fetch(`/api/proposals?leadId=${leadId}`);
      const data = await res.json();
      if (data.success) {
        setProposals(data.proposals || []);
        const active = data.proposals?.[0] || null;
        setActiveProposal(active);
        loadProposalIntoForm(active);
      } else {
        showToast(data.error || 'Failed to fetch proposals', 'error');
      }
    } catch (err) {
      showToast('Error loading proposals', 'error');
    } finally {
      setProposalLoading(false);
    }
  };

  // Recalculate totals
  const subtotal = propServices.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountVal = subtotal * (propDiscount / 100);
  const taxVal = (subtotal - discountVal) * (propTax / 100);
  const totalVal = subtotal - discountVal + taxVal;

  const saveProposalDraft = async () => {
    if (!selectedLead?._id) return;
    setProposalSaving(true);

    const payload = {
      leadId: selectedLead._id,
      title: propTitle,
      subtitle: propSubtitle,
      introduction: propIntro,
      services: propServices,
      milestones: propMilestones,
      branding: {
        primaryColor: propColor,
        companyName: propCompanyName,
        tagline: propTagline,
      },
      notes: propNotes,
      terms: propTerms,
      validUntil: propValidUntil ? new Date(propValidUntil) : undefined,
      signatureName: propSigName,
      signatureTitle: propSigTitle,
      footerText: propFooter,
      discount: propDiscount,
      tax: propTax,
    };

    try {
      const method = activeProposal?._id ? 'PUT' : 'POST';
      const endpoint = activeProposal?._id ? `/api/proposals/${activeProposal._id}` : `/api/proposals`;

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showToast('Proposal draft saved successfully', 'success');
        fetchProposals(selectedLead._id);
      } else {
        showToast(data.error || 'Failed to save draft', 'error');
      }
    } catch (err) {
      showToast('Error saving proposal', 'error');
    } finally {
      setProposalSaving(false);
    }
  };

  const handleGenerateProposal = async () => {
    if (!selectedLead?._id) return;
    
    // Save draft first to ensure all edits are reflected in the PDF
    await saveProposalDraft();
    
    if (!activeProposal?._id) {
      showToast('Please save a draft first', 'error');
      return;
    }

    setProposalGenerating(true);
    try {
      const res = await fetch(`/api/proposals/${activeProposal._id}/generate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Proposal PDF generated and sent!', 'success');
        fetchProposals(selectedLead._id);
        fetchLeads(); // refresh lead list to update document counts and proposalStatus
      } else {
        showToast(data.error || 'PDF generation failed', 'error');
      }
    } catch (err) {
      showToast('Error generating PDF', 'error');
    } finally {
      setProposalGenerating(false);
    }
  };

  const sendProposalWhatsApp = async () => {
    if (!activeProposal?._id || !selectedLead) return;
    try {
      const token = activeProposal.secureToken;
      const shareUrl = `${window.location.origin}/proposals/${activeProposal._id}?token=${token}`;
      const msg = `Hello ${selectedLead.name}, we have prepared a proposal for you: ${activeProposal.title}. You can view and approve it online here: ${shareUrl}`;
      
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedLead.phone,
          message: msg,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Proposal link shared via WhatsApp!', 'success');
      } else {
        showToast('Failed to send WhatsApp message', 'error');
      }
    } catch (err) {
      showToast('Error sharing proposal', 'error');
    }
  };

  // Refs
  const csvInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        if (selectedLead) {
          const updated = data.leads.find((l: Lead) => l._id === selectedLead._id);
          if (updated) setSelectedLead(updated);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load leads from database', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/email/templates');
      const data = await res.json();
      if (data.success) setTemplates(data.templates);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const fetchWorkflowLog = async (leadId: string) => {
    setLoadingLog(true);
    try {
      const res = await fetch(`/api/leads/workflow-log?leadId=${leadId}`);
      const data = await res.json();
      if (data.success) setWorkflowLog(data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLog(false);
    }
  };

  const fetchFunnelData = async () => {
    try {
      const res = await fetch('/api/leads/workflow-log?analytics=funnel');
      const data = await res.json();
      if (data.success) setFunnelData(data.funnelData || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchTemplates();
    fetchFunnelData();
  }, []);

  useEffect(() => {
    if (selectedLead?._id && modalTab === 'timeline') {
      fetchWorkflowLog(selectedLead._id);
    }
  }, [selectedLead?._id, modalTab]);

  useEffect(() => {
    if (selectedLead?._id && modalTab === 'proposal') {
      fetchProposals(selectedLead._id);
    }
  }, [selectedLead?._id, modalTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedLead(null);
        setIsAddModalOpen(false);
        setIsProposalModalOpen(false);
        setIsSequenceModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Workflow Action Handler ─────────────────────────────────────────────
  const handleWorkflowAction = async (action: string, params: Record<string, any> = {}) => {
    if (!selectedLead?._id) return;

    // Handle stage moves via the leads API
    if (action === 'move_stage') {
      setActionLoading(prev => ({ ...prev, [`move_${params.stage}`]: true }));
      try {
        const res = await fetch('/api/leads', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedLead._id,
            action: 'update_stage',
            stage: params.stage,
            force: user?.role === 'Admin' || user?.role === 'Manager',
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || `Moved to ${params.stage}`, 'success');
          triggerActivityLog('workflow_action', `Lead ${selectedLead.name} moved to ${params.stage}`);
          fetchLeads();
          if (selectedLead._id) fetchWorkflowLog(selectedLead._id);
          fetchFunnelData();
        } else {
          showToast(data.error || 'Stage transition failed', 'error');
        }
      } catch (err) {
        showToast('Stage transition error', 'error');
      } finally {
        setActionLoading(prev => ({ ...prev, [`move_${params.stage}`]: false }));
      }
      return;
    }

    // Handle update_qualification and update_proposal_status via leads API
    if (action === 'update_qualification' || action === 'update_proposal_status') {
      setActionLoading(prev => ({ ...prev, [action]: true }));
      try {
        const res = await fetch('/api/leads', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedLead._id, action, ...params }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Updated successfully', 'success');
          fetchLeads();
        } else {
          showToast(data.error || 'Update failed', 'error');
        }
      } finally {
        setActionLoading(prev => ({ ...prev, [action]: false }));
      }
      return;
    }

    // All other actions go to /api/leads/workflow
    const actionKey = action;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch('/api/leads/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead._id, action, ...params }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Action completed', 'success');
        fetchLeads();
        if (selectedLead._id) fetchWorkflowLog(selectedLead._id);
      } else {
        showToast(data.error || 'Action failed', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // ── Drag & Drop with validation ─────────────────────────────────────────
  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedItem) return;
    const lead = leads.find(l => l._id === draggedItem);
    if (!lead || lead.stage === targetStage) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draggedItem,
          action: 'update_stage',
          stage: targetStage,
          force: user?.role === 'Admin' || user?.role === 'Manager',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads(prev => prev.map(l => l._id === draggedItem ? { ...l, stage: targetStage as CRMStage } : l));
        showToast(data.message || `Moved ${lead.name} to ${targetStage}`, 'success');
        triggerActivityLog('workflow_action', `Lead ${lead.name} moved to ${targetStage}`);
        fetchLeads();
        fetchFunnelData();
      } else {
        showToast(data.error || 'Cannot move to that stage', 'error');
      }
    } catch (err) {
      console.error(err);
    }
    setDraggedItem(null);
  };

  const handleCreateLead = async () => {
    if (!nlName || !nlEmail) {
      showToast('Lead name and email are required', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nlName, email: nlEmail, company: nlCompany, phone: nlPhone,
          value: `$${parseFloat(nlValue).toLocaleString()}`,
          status: nlStatus, stage: nlStage, assignedToName: nlAssigned,
          leadSource: nlSource,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads([data.lead, ...leads]);
        setIsAddModalOpen(false);
        setNlName(''); setNlEmail(''); setNlCompany(''); setNlPhone(''); setNlValue('5000'); setNlSource('Manual Entry');
        showToast('Lead created and added to pipeline!', 'success');
        triggerActivityLog('workflow_action', `Created lead ${nlName}`);
        fetchFunnelData();
      } else {
        showToast(data.error || 'Failed to create lead', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async () => {
    if (!newNote || !selectedLead) return;
    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedLead._id, action: 'add_note', content: newNote }),
      });
      const data = await res.json();
      if (data.success) {
        setNewNote('');
        showToast('Note logged successfully', 'success');
        fetchLeads();
      }
    } catch (err) {
      console.error(err);
    }
  };


  const sendWhatsAppTemplate = async (templateAction: string, extraParams?: Record<string, string>) => {
    if (!selectedLead) return;
    try {
      showToast('Sending WhatsApp message…', 'info');
      const res = await fetch('/api/leads/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead._id, action: templateAction, ...extraParams }),
      });
      const data = await res.json();
      if (data.success) { showToast('WhatsApp sent!', 'success'); fetchLeads(); }
      else showToast(data.error || 'WhatsApp failed', 'error');
    } catch { showToast('WhatsApp request failed', 'error'); }
  };

  const handleRequestApproval = async () => {
    if (!selectedLead) return;
    try {
      const res = await fetch('/api/leads/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLead._id, action: 'request_approval', dealValue: selectedLead.value }),
      });
      const data = await res.json();
      if (data.success) { showToast('Approval request submitted!', 'success'); fetchLeads(); }
      else showToast(data.error || 'Approval request failed', 'error');
    } catch { showToast('Approval request failed', 'error'); }
  };

  const handleSendEmail = async () => {
    if (!selectedLead || !outSubject || !outBody) {
      showToast('Subject and body are required', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!selectedLead.email || !emailRegex.test(selectedLead.email)) {
      showToast(`Invalid lead email address`, 'error');
      return;
    }
    try {
      showToast('Sending email...', 'info');
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead._id, to: selectedLead.email,
          subject: outSubject,
          htmlContent: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333">${outBody.replace(/\n/g, '<br/>')}</div>`,
          scheduledAt: outScheduled || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(outScheduled ? 'Email scheduled!' : 'Email sent!', 'success');
        setOutSubject(''); setOutBody(''); setOutScheduled('');
        fetchLeads();
      } else {
        showToast(data.error || 'Failed to send email', 'error');
      }
    } catch (err) {
      showToast('Unable to send email', 'error');
    }
  };

  const handleCallLead = (phone: string | undefined, name: string) => {
    if (!phone?.trim()) { showToast(`No phone number for ${name}`, 'error'); return; }
    const clean = phone.replace(/[^\d+]/g, '');
    if (!clean) { showToast(`Invalid phone for ${name}`, 'error'); return; }
    showToast(`Calling ${name}...`, 'success');
    window.location.href = `tel:${clean}`;
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        showToast('Processing leads...', 'info');
        const res = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvData: text, currentUser: user?.name ?? 'unknown' }),
        });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); fetchLeads(); }
        else showToast(data.error || 'CSV Parsing failed', 'error');
      } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLead) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      try {
        showToast('Uploading document...', 'info');
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: selectedLead._id, fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            fileData: base64Data, currentUser: user?.name ?? 'unknown',
          }),
        });
        const data = await res.json();
        if (data.success) { showToast('Document uploaded!', 'success'); fetchLeads(); }
        else showToast(data.error || 'Upload failed', 'error');
      } catch (err) { console.error(err); }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName || !tempSubject || !tempBody) { showToast('All template fields required', 'warning'); return; }
    try {
      const isEdit = tempModalMode === 'edit';
      const res = await fetch(isEdit ? `/api/email/templates/${tempId}` : '/api/email/templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tempName, subject: tempSubject, body: tempBody }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(isEdit ? 'Template updated!' : 'Template created!', 'success');
        setIsTemplateModalOpen(false);
        setTempName(''); setTempSubject(''); setTempBody(''); setTempId(null);
        fetchTemplates();
      } else showToast(data.error || 'Failed to save', 'error');
    } catch (err) { console.error(err); }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('Template delete endpoint returned an error or was not found', 'error');
        return;
      }
      const data = await res.json();
      if (data.success) { showToast('Template deleted', 'success'); setOutTemplate('Custom Email'); setOutSubject(''); setOutBody(''); fetchTemplates(); }
      else showToast(data.error || 'Failed to delete', 'error');
    } catch (err) { console.error(err); }
  };

  const applyTemplate = (templateName: string) => {
    setOutTemplate(templateName);
    if (templateName === 'Custom Email') { setOutSubject(''); setOutBody(''); return; }
    if (!selectedLead) return;
    const t = templates.find(temp => temp.name === templateName);
    if (t) {
      setOutSubject(t.subject.replace(/\{\{company\}\}/g, selectedLead.company).replace(/\{\{name\}\}/g, selectedLead.name));
      setOutBody(t.body.replace(/\{\{company\}\}/g, selectedLead.company).replace(/\{\{name\}\}/g, selectedLead.name));
    }
  };

  const getAvatarColor = (name: string = '') => {
    const colors = [
      'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/10',
      'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/10',
      'bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 border-pink-500/10',
      'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/10',
      'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/10',
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const MODAL_TABS = [
    { id: 'workflow', label: 'Workflow' },
    { id: 'proposal', label: 'Proposal' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'notes', label: `Notes (${selectedLead?.notes.length || 0})` },
    { id: 'outreach', label: 'Outreach' },
    { id: 'documents', label: `Docs (${selectedLead?.documents.length || 0})` },
    { id: 'history', label: 'Audit Log' },
    ...(user?.role === 'Admin' || user?.role === 'Manager' ? [{ id: 'approvals', label: '⚠️ Approvals' }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-base text-primary overflow-hidden transition-colors">

      <input type="file" ref={csvInputRef} accept=".csv" className="hidden" onChange={handleCSVImport} />
      <input type="file" ref={docInputRef} className="hidden" onChange={handleDocUpload} />

      {/* Header */}
      <div className="p-8 pb-4 shrink-0 border-b border-border bg-base z-10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">CRM Pipeline</h1>
            <p className="text-secondary text-sm font-medium">Workflow-driven lead management with stage automations.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowFunnel(v => !v)} className={`px-4 py-2.5 border border-border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${showFunnel ? 'bg-accent text-white border-accent' : 'bg-surface text-primary hover:bg-base'}`}>
              <BarChart2 size={14} /> Funnel
            </button>
            <button onClick={() => csvInputRef.current?.click()} className="px-4 py-2.5 border border-border bg-surface text-primary rounded-xl text-xs font-semibold hover:bg-base transition-all shadow-sm flex items-center gap-2">
              <Upload size={14} /> Import CSV
            </button>
            <button onClick={() => { downloadCSV(leads, 'CRM_Leads'); triggerActivityLog('file_download', 'Exported CRM Leads to CSV'); }} className="px-4 py-2.5 border border-border bg-surface text-primary rounded-xl text-xs font-semibold hover:bg-base transition-all shadow-sm flex items-center gap-2">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-[0_4px_14px_rgba(99,102,241,0.3)] hover:bg-indigo-600 transition-all active:scale-95">
              <Plus size={16} /> Add Lead
            </button>
          </div>
        </div>

        {/* Funnel Bar */}
        <AnimatePresence>
          {showFunnel && funnelData.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-4 bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-widest">Conversion Funnel</p>
                <div className="flex gap-4 text-[10px] font-bold text-secondary">
                  <span>Total: <span className="text-primary">{funnelData[0]?.count || 0}</span> leads</span>
                  <span>Closed: <span className="text-emerald-500">{funnelData[5]?.count || 0}</span></span>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {funnelData.map((f, i) => (
                  <div key={f.stage} className="flex flex-col items-center gap-1.5">
                    <div className="text-[11px] font-black text-primary">{f.count}</div>
                    <div className="w-full rounded-lg overflow-hidden bg-border h-2">
                      <div className={`h-2 ${STAGE_META[f.stage as CRMStage]?.dot.split(' ')[0] || 'bg-gray-400'} transition-all`}
                        style={{ width: `${f.conversionRate}%` }} />
                    </div>
                    <div className="text-[9px] font-bold text-secondary text-center">{f.stage}</div>
                    {i > 0 && (
                      <div className={`text-[9px] font-black ${f.conversionRate >= 50 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {f.conversionRate}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
            <button onClick={() => setView('board')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${view === 'board' ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>
              <LayoutGrid size={14} /> Board View
            </button>
            <button onClick={() => setView('list')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${view === 'list' ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>
              <List size={14} /> List View
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads..." className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-primary font-medium" />
            </div>
            <button className="p-2 border border-border rounded-xl bg-surface text-secondary hover:text-primary transition-colors"><Filter size={16} /></button>
          </div>
        </div>
      </div>

      {/* Board / List */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-secondary font-bold text-sm">Synchronizing pipeline...</div>
        ) : view === 'board' ? (
          <div className="h-full overflow-x-auto p-8 bg-base/30 relative shadow-inner custom-scrollbar snap-x scroll-smooth">
            <div className="flex gap-6 h-full min-w-max p-1 pb-4">
              {STAGES.map(stage => {
                const isCurrentOver = dragOverStage === stage;
                const isAnyDragging = draggedItem !== null;
                const stageLeads = filteredLeads.filter(l => l.stage === stage);
                const meta = STAGE_META[stage];

                return (
                  <div key={stage}
                    className={`flex flex-col w-[300px] rounded-3xl border-2 transition-all duration-200 p-2 bg-surface/20 shrink-0 snap-center ${
                      isCurrentOver ? 'border-accent bg-accent/[0.04] shadow-lg shadow-accent/5 scale-[1.01]' :
                      isAnyDragging ? 'border-dashed border-border bg-surface/10' : 'border-transparent'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverStage !== stage) setDragOverStage(stage); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => { handleDrop(e, stage); setDragOverStage(null); }}
                  >
                    <div className="p-4 flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                        <h3 className="font-extrabold text-xs text-primary uppercase tracking-widest leading-none">{stage}</h3>
                        <span className={`text-[9px] font-bold ${meta.color}`}>{meta.desc}</span>
                      </div>
                      <span className="text-[10px] font-black bg-surface border border-border text-secondary px-2.5 py-0.5 rounded-full shadow-sm leading-none">{stageLeads.length}</span>
                    </div>

                    <div className="p-2 flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">
                      <AnimatePresence initial={false}>
                        {stageLeads.map(lead => {
                          const initials = lead.assignedToName ? lead.assignedToName.split(' ').map(n => n[0]).join('') : 'UN';
                          return (
                            <motion.div key={lead._id} layout
                              initial={{ opacity: 0, y: 10, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              whileHover={{ y: -4, scale: 1.01 }}
                              transition={{ duration: 0.2 }}
                              draggable
                              onDragStart={() => setDraggedItem(lead._id || null)}
                              onDragEnd={() => { setDraggedItem(null); setDragOverStage(null); }}
                              onClick={() => { setSelectedLead(lead); setModalTab('workflow'); }}
                              className="bg-surface border border-border/80 p-5 rounded-2xl cursor-grab active:cursor-grabbing hover:border-accent hover:shadow-lg hover:shadow-accent/[0.03] transition-all group shadow-sm flex flex-col gap-3"
                            >
                              <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  lead.status === 'Hot' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' :
                                  lead.status === 'Warm' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' :
                                  'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'
                                }`}>{lead.status}</span>
                                <div className="flex gap-2">
                                  {lead.leadScore != null && lead.leadScore > 0 && (
                                    <span className={`text-[9px] font-black ${lead.leadScore >= 70 ? 'text-emerald-500' : 'text-amber-500'}`} title="Lead score">
                                      ★ {lead.leadScore}
                                    </span>
                                  )}
                                  {lead.notes?.length > 0 && <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Notes"><MessageSquare size={10}/>{lead.notes.length}</span>}
                                  {lead.emails?.length > 0 && <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Emails"><Mail size={10}/>{lead.emails.length}</span>}
                                  {lead.documents?.length > 0 && <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Docs"><Paperclip size={10}/>{lead.documents.length}</span>}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-sm font-extrabold text-primary group-hover:text-accent transition-colors leading-snug tracking-tight mb-0.5 truncate">{lead.name}</h4>
                                <p className="text-[10px] font-bold text-secondary truncate uppercase tracking-widest">{lead.company}</p>
                              </div>
                              <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
                                <div className="text-sm font-black text-accent">{lead.value}</div>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border ${getAvatarColor(lead.assignedToName)}`} title={`Owner: ${lead.assignedToName || 'Unassigned'}`}>{initials}</div>
                                  <span className="text-[8px] font-black text-tertiary uppercase tracking-wider truncate max-w-[70px]">{lead.lastContact || 'Just now'}</span>
                                </div>
                              </div>
                              {/* Stage-specific indicator */}
                              {lead.stage === 'Proposal' && lead.proposalStatus !== 'not_sent' && (
                                <div className={`text-[8px] font-black px-2 py-0.5 rounded-full w-fit ${lead.proposalStatus === 'accepted' ? 'bg-emerald-500/10 text-emerald-600' : lead.proposalStatus === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600'}`}>
                                  PROPOSAL {(lead.proposalStatus || '').replace('_', ' ').toUpperCase()}
                                </div>
                              )}
                              {lead.stage === 'Closing' && lead.paymentStatus === 'paid' && (
                                <div className="text-[8px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 w-fit">✓ PAID</div>
                              )}
                              {lead.stage === 'Closing' && lead.onboardingReady && (
                                <div className="text-[8px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 w-fit">🚀 ONBOARDING READY</div>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 overflow-y-auto h-full bg-base/30 shadow-inner">
            <div className="rounded-2xl border border-border bg-base shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface border-b border-border text-secondary font-bold uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Lead Name</th>
                    <th className="px-6 py-4">Stage</th>
                    <th className="px-6 py-4">Score</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Deal Value</th>
                    <th className="px-6 py-4">Assigned Rep</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeads.map(lead => (
                    <tr key={lead._id} className="hover:bg-surface/50 transition-colors group cursor-pointer" onClick={() => { setSelectedLead(lead); setModalTab('workflow'); }}>
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm text-primary group-hover:text-accent transition-colors">{lead.name}</div>
                        <div className="text-[11px] font-medium text-secondary mt-0.5">{lead.company} · {lead.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-base border border-border font-bold text-[10px] ${STAGE_META[lead.stage]?.color}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${STAGE_META[lead.stage]?.dot.split(' ')[0]}`} />
                          {lead.stage}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {lead.leadScore != null && lead.leadScore > 0 ? (
                          <span className={`font-black text-sm ${lead.leadScore >= 70 ? 'text-emerald-500' : lead.leadScore >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                            {lead.leadScore}/100
                          </span>
                        ) : <span className="text-tertiary">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${
                          lead.status === 'Hot' ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                          lead.status === 'Warm' ? 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' :
                          'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20'
                        }`}>{lead.status}</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-accent text-sm">{lead.value}</td>
                      <td className="px-6 py-4 text-secondary font-bold uppercase tracking-wider">{lead.assignedToName || 'Unassigned'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); handleCallLead(lead.phone, lead.name); }} className="p-2 bg-base border border-border rounded-lg hover:text-accent transition-colors"><Phone size={14}/></button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setModalTab('outreach'); }} className="p-2 bg-base border border-border rounded-lg hover:text-accent transition-colors"><Mail size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLead && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedLead(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-surface w-full max-w-5xl rounded-3xl border border-border shadow-2xl flex flex-col md:flex-row h-[90vh] max-h-[860px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}>

              {/* Sidebar */}
              <div className="w-full md:w-72 border-r border-border bg-base/50 p-6 flex flex-col gap-5 shrink-0 overflow-y-auto">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-2xl font-black text-accent mb-3 shadow-inner">
                    {selectedLead.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <h2 className="text-lg font-extrabold text-primary mb-0.5 tracking-tight">{selectedLead.name}</h2>
                  <p className="text-[10px] font-bold text-secondary mb-1 uppercase tracking-widest">{selectedLead.company}</p>
                  <p className="text-[10px] font-bold text-tertiary mb-3">{selectedLead.email}</p>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1 ${
                    selectedLead.status === 'Hot' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                    selectedLead.status === 'Warm' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                    'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  }`}>{selectedLead.status} Lead</span>
                </div>

                {/* Stage Badge */}
                <div className={`p-3 rounded-2xl border text-center`}>
                  <div className={`flex items-center justify-center gap-1.5 ${STAGE_META[selectedLead.stage]?.color}`}>
                    {STAGE_META[selectedLead.stage]?.icon}
                    <span className="text-xs font-black uppercase tracking-wider">{selectedLead.stage}</span>
                  </div>
                  <p className="text-[9px] text-secondary font-medium mt-0.5">{STAGE_META[selectedLead.stage]?.desc}</p>
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-surface rounded-2xl border border-border shadow-sm">
                    <h4 className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Deal Value</h4>
                    <div className="text-xl font-black text-accent">{selectedLead.value}</div>
                  </div>
                  {selectedLead.leadScore != null && selectedLead.leadScore > 0 && (
                    <div className="p-3 bg-surface rounded-2xl border border-border shadow-sm">
                      <h4 className="text-[10px] font-black text-secondary uppercase tracking-widest mb-2">Lead Score</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-border rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${selectedLead.leadScore >= 70 ? 'bg-emerald-500' : selectedLead.leadScore >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${selectedLead.leadScore}%` }} />
                        </div>
                        <span className={`text-sm font-black ${selectedLead.leadScore >= 70 ? 'text-emerald-500' : selectedLead.leadScore >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                          {selectedLead.leadScore}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="p-3 bg-surface rounded-2xl border border-border shadow-sm">
                    <h4 className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={10} className="text-accent" /> Owner</h4>
                    <div className="text-xs font-bold text-primary">{selectedLead.assignedToName || 'Unassigned'}</div>
                  </div>
                  {selectedLead.leadSource && (
                    <div className="p-3 bg-surface rounded-2xl border border-border shadow-sm">
                      <h4 className="text-[10px] font-black text-secondary uppercase tracking-widest mb-1">Lead Source</h4>
                      <div className="text-xs font-bold text-primary">{selectedLead.leadSource}</div>
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="mt-auto space-y-2">
                  <button onClick={() => handleCallLead(selectedLead.phone, selectedLead.name)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-base border border-border rounded-xl text-xs font-bold hover:border-accent hover:text-accent transition-all active:scale-95"><Phone size={13}/> Call Lead</button>
                  <button onClick={() => setModalTab('outreach')} className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"><Mail size={13}/> Compose Outreach</button>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="p-5 border-b border-border flex justify-between items-center bg-base/30">
                  <div className="flex bg-surface border border-border rounded-2xl p-1 shadow-inner overflow-x-auto relative">
                    {MODAL_TABS.map(t => {
                      const isTabActive = modalTab === t.id;
                      return (
                        <button key={t.id} onClick={() => setModalTab(t.id as any)}
                          className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all shrink-0 relative ${isTabActive ? 'text-accent' : 'text-secondary hover:text-primary'}`}>
                          <span className="relative z-10">{t.label}</span>
                          {isTabActive && (
                            <motion.span layoutId="activeModalTabCrm"
                              className="absolute inset-0 bg-base border border-border/60 rounded-xl shadow-sm"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-surface rounded-xl text-secondary hover:text-primary transition-colors border border-transparent hover:border-border"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">

                  {/* ── Workflow Tab ── */}
                  {modalTab === 'workflow' && (
                    <div className="space-y-6">
                      {/* Stage-specific action panel */}
                      <div className="p-5 bg-base border border-border rounded-2xl shadow-sm">
                        <StageActionsPanel lead={selectedLead} onAction={handleWorkflowAction} loading={actionLoading} />
                      </div>

                      {/* Quick stage change dropdown */}
                      <div className="p-4 bg-surface border border-border rounded-2xl shadow-sm">
                        <h4 className="text-[10px] font-black text-secondary uppercase tracking-widest mb-3 flex items-center gap-1.5"><Target size={12} className="text-accent" /> Manual Stage Override</h4>
                        <select value={selectedLead.stage}
                          onChange={async (e) => {
                            await handleWorkflowAction('move_stage', { stage: e.target.value });
                          }}
                          className="w-full bg-base border border-border rounded-xl px-3 py-2 text-xs font-bold text-primary focus:ring-1 focus:ring-accent outline-none cursor-pointer">
                          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {(user?.role === 'Admin' || user?.role === 'Manager') && (
                          <p className="text-[9px] text-secondary mt-1.5 font-medium">As {user.role}, you can skip stages. Non-sequential moves will fire a warning.</p>
                        )}
                      </div>

                      {/* Quick actions: proposal + sequence */}
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setIsProposalModalOpen(true)}
                          className="flex items-center gap-3 p-4 bg-base border border-border rounded-2xl hover:border-accent/50 hover:bg-accent/5 transition-all group shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={18}/></div>
                          <div className="text-left"><div className="text-xs font-bold group-hover:text-accent transition-colors">Generate Proposal</div><div className="text-[10px] text-secondary font-medium">Custom quote & scope</div></div>
                        </button>
                        <button onClick={() => setIsSequenceModalOpen(true)}
                          className="flex items-center gap-3 p-4 bg-base border border-border rounded-2xl hover:border-accent/50 hover:bg-accent/5 transition-all group shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform"><Zap size={18}/></div>
                          <div className="text-left"><div className="text-xs font-bold group-hover:text-accent transition-colors">Enroll in Sequence</div><div className="text-[10px] text-secondary font-medium">Automated email workflow</div></div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Timeline Tab (Workflow Log) ── */}
                  {modalTab === 'timeline' && (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Workflow Timeline</h3>
                      {loadingLog ? (
                        <div className="text-center text-secondary py-6 text-xs">Loading timeline...</div>
                      ) : workflowLog.length > 0 ? (
                        <div className="space-y-3 relative pl-6 border-l-2 border-border/50">
                          {workflowLog.map((log, i) => (
                            <div key={i} className="relative group">
                              <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-base z-10 ${STAGE_META[log.toStage as CRMStage]?.dot.split(' ')[0] || 'bg-gray-400'}`} />
                              <div className="bg-base border border-border rounded-2xl p-4 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-black uppercase ${STAGE_META[log.toStage as CRMStage]?.color || 'text-secondary'}`}>→ {log.toStage}</span>
                                    {log.fromStage && log.fromStage !== 'none' && (
                                      <span className="text-[9px] text-tertiary">from {log.fromStage}</span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-tertiary">{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-secondary font-medium mb-2">By: {log.triggeredBy}</p>
                                {log.workflowActions?.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {log.workflowActions.map((a: string, j: number) => (
                                      <span key={j} className="text-[8px] font-bold px-2 py-0.5 bg-accent/5 text-accent border border-accent/10 rounded-full uppercase tracking-wider">
                                        {a.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {/* Fallback: show email + history timeline */}
                          <div className="space-y-4 relative pl-6 border-l-2 border-border/50">
                            {selectedLead.emails.map((email, idx) => (
                              <div key={idx} className="relative group">
                                <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-base bg-blue-500 z-10" />
                                <div className="bg-base border border-border rounded-2xl p-4 shadow-sm">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="text-sm font-bold text-primary flex items-center gap-2"><Mail size={12} className="text-accent" /> {email.subject}</div>
                                    <div className="text-[10px] font-bold text-tertiary">{new Date(email.sentAt).toLocaleDateString()}</div>
                                  </div>
                                  <div className="text-[10px] flex gap-4 text-tertiary font-bold mt-2">
                                    <span>Status: <span className="text-accent">{email.status}</span></span>
                                    <span>{email.opens} opens · {email.clicks} clicks</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {selectedLead.history.slice(0, 8).map((h, i) => (
                              <div key={i} className="relative group">
                                <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-base bg-emerald-500 z-10" />
                                <div className="bg-base border border-border rounded-2xl p-4 shadow-sm">
                                  <div className="flex justify-between items-center">
                                    <div className="text-xs font-bold text-primary">{h.event}</div>
                                    <div className="text-[9px] font-bold text-tertiary">{new Date(h.time).toLocaleDateString()}</div>
                                  </div>
                                  <div className="text-[10px] text-secondary font-medium mt-1">By: {h.user}</div>
                                </div>
                              </div>
                            ))}
                            {selectedLead.emails.length === 0 && selectedLead.history.length === 0 && (
                              <div className="text-center text-secondary font-bold py-6 text-xs">No timeline events yet</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Notes Tab ── */}
                  {modalTab === 'notes' && (
                    <div className="space-y-6">
                      <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Internal Notes</h3>
                      <div className="flex gap-3">
                        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3}
                          placeholder="Write details about the deal, requirements, or client feedback..."
                          className="flex-1 bg-base border border-border rounded-2xl p-4 text-xs font-medium focus:outline-none focus:border-accent resize-none text-primary shadow-sm" />
                        <button onClick={handleAddNote} className="px-5 bg-accent text-white font-bold rounded-2xl hover:bg-indigo-600 transition-all flex items-center justify-center shadow-md active:scale-95"><Send size={16}/></button>
                      </div>
                      <div className="space-y-3">
                        {selectedLead.notes.map((n, i) => (
                          <div key={i} className="p-4 bg-base border border-border rounded-2xl shadow-sm">
                            <p className="text-xs text-primary font-medium leading-relaxed">{n.content}</p>
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/40 text-[9px] font-bold text-tertiary uppercase">
                              <div className="w-4 h-4 rounded-full bg-accent/10 flex items-center justify-center text-[7px]">{n.author[0]}</div>
                              {n.author} · {new Date(n.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                        {selectedLead.notes.length === 0 && <div className="text-center text-secondary font-bold py-8 text-xs">No notes yet.</div>}
                      </div>
                    </div>
                  )}

                  {/* ── Outreach Tab ── */}
                  {modalTab === 'outreach' && (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Outreach Composer</h3>
                        <div className="flex items-center gap-3">
                          <select value={outTemplate} onChange={e => applyTemplate(e.target.value)}
                            className="bg-surface border border-border text-xs font-bold px-3 py-1.5 rounded-xl text-primary focus:outline-none">
                            <option value="Custom Email">Custom Email</option>
                            {templates.map((t: any) => <option key={t._id} value={t.name}>{t.name}</option>)}
                          </select>
                          {outTemplate !== 'Custom Email' && (
                            <>
                              <button type="button" onClick={() => { const cur = templates.find((t: any) => t.name === outTemplate); if (cur) { setTempId(cur._id); setTempName(cur.name); setTempSubject(cur.subject); setTempBody(cur.body); setTempModalMode('edit'); setIsTemplateModalOpen(true); } }} className="text-xs text-indigo-500 font-bold hover:underline">Edit</button>
                              <button type="button" onClick={() => { const cur = templates.find((t: any) => t.name === outTemplate); if (cur) handleDeleteTemplate(cur._id); }} className="text-xs text-red-500 font-bold hover:underline">Delete</button>
                            </>
                          )}
                          <button type="button" onClick={() => { setTempId(null); setTempName(''); setTempSubject(''); setTempBody(''); setTempModalMode('create'); setIsTemplateModalOpen(true); }} className="text-xs text-emerald-500 font-bold hover:underline flex items-center gap-1"><Plus size={12}/> New</button>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[9px] font-bold text-secondary uppercase mb-1">Subject</label>
                          <input type="text" value={outSubject} onChange={e => setOutSubject(e.target.value)} placeholder="Subject..."
                            className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-1 focus:ring-accent outline-none text-primary" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-secondary uppercase mb-1">Body</label>
                          <textarea rows={8} value={outBody} onChange={e => setOutBody(e.target.value)} placeholder="Hi, draft your follow up here..."
                            className="w-full bg-base border border-border rounded-2xl p-4 text-xs font-medium focus:outline-none focus:border-accent resize-none text-primary" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-[9px] font-bold text-secondary uppercase mb-1">Schedule (Optional)</label>
                            <input type="datetime-local" value={outScheduled} onChange={e => setOutScheduled(e.target.value)}
                              className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-1 focus:ring-accent outline-none text-primary" />
                          </div>
                          <div className="flex items-end justify-end gap-3">
                            {outSubject && outBody && (
                              <button type="button" onClick={() => { setTempId(null); setTempName(''); let cleanedSub = outSubject; let cleanedBody = outBody; if (selectedLead) { cleanedSub = cleanedSub.replace(new RegExp(selectedLead.company, 'g'), '{{company}}').replace(new RegExp(selectedLead.name, 'g'), '{{name}}'); cleanedBody = cleanedBody.replace(new RegExp(selectedLead.company, 'g'), '{{company}}').replace(new RegExp(selectedLead.name, 'g'), '{{name}}'); } setTempSubject(cleanedSub); setTempBody(cleanedBody); setTempModalMode('create'); setIsTemplateModalOpen(true); }} className="px-4 py-3 border border-border bg-surface text-primary rounded-xl text-xs font-semibold hover:bg-base transition-all active:scale-95 flex items-center gap-1.5 shadow-sm">Save as Template</button>
                            )}
                            <button onClick={handleSendEmail} className="px-8 py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95 flex items-center gap-2">
                              <Send size={14} /> {outScheduled ? 'Schedule' : 'Send'}
                            </button>
                          </div>
                        </div>
                        {/* ── WhatsApp & Approval Quick Actions ── */}
                        <div className="border-t border-border pt-4 mt-2">
                          <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">WhatsApp &amp; Approvals</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => sendWhatsAppTemplate('send_whatsapp')}
                              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition-colors">
                              <MessageSquare size={12}/> Send WhatsApp
                            </button>
                            <button type="button" onClick={() => sendWhatsAppTemplate('send_proposal_alert')}
                              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition-colors">
                              <FileText size={12}/> Proposal Alert
                            </button>
                            <button type="button" onClick={() => sendWhatsAppTemplate('send_payment_reminder')}
                              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition-colors">
                              <AlertCircle size={12}/> Payment Reminder
                            </button>
                            <button type="button" onClick={handleRequestApproval}
                              disabled={selectedLead?.approvalStatus === 'pending' || selectedLead?.approvalStatus === 'approved'}
                              className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                              <CheckCircle size={12}/> {selectedLead?.approvalStatus === 'pending' ? 'Approval Pending' : selectedLead?.approvalStatus === 'approved' ? 'Approved ✓' : 'Request Approval'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Proposal Tab ── */}
                  {modalTab === 'proposal' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center pb-4 border-b border-border">
                        <div>
                          <h3 className="text-sm font-bold text-primary">Proposal Builder & Manager</h3>
                          <p className="text-[11px] text-secondary">Draft, customize, and generate professional PDFs for this lead.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveProposalDraft}
                            disabled={proposalSaving || proposalGenerating}
                            className="px-4 py-2 border border-border bg-surface text-primary rounded-xl text-xs font-semibold hover:bg-base transition-all active:scale-95 disabled:opacity-50"
                          >
                            {proposalSaving ? 'Saving...' : 'Save Draft'}
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateProposal}
                            disabled={proposalSaving || proposalGenerating}
                            className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-indigo-600 transition-all active:scale-95 shadow-md shadow-accent/10 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {proposalGenerating ? 'Generating...' : 'Generate & Send'}
                          </button>
                        </div>
                      </div>

                      {proposalLoading ? (
                        <div className="text-center py-12 text-xs text-secondary font-medium">Loading proposal...</div>
                      ) : (
                        <div className="space-y-6">
                          {/* Active Proposal Status Banner */}
                          {activeProposal && (
                            <div className="p-4 bg-surface border border-border rounded-2xl space-y-3">
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-primary">Version {activeProposal.version}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeProposal.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                    activeProposal.status === 'rejected' ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400' :
                                    activeProposal.status === 'viewed' ? 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400' :
                                    activeProposal.status === 'sent' ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' :
                                    'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400'
                                  }`}>
                                    {activeProposal.status.toUpperCase()}
                                  </span>
                                  {activeProposal.viewCount > 0 && (
                                    <span className="text-[10px] text-secondary font-medium flex items-center gap-1">
                                      <Activity size={10} /> Viewed {activeProposal.viewCount} times
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {activeProposal.pdfUrl && (
                                    <button
                                      type="button"
                                      onClick={() => window.open(activeProposal.pdfUrl, '_blank')}
                                      className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold"
                                    >
                                      <FileText size={12} /> View PDF
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={sendProposalWhatsApp}
                                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    Share WhatsApp
                                  </button>
                                </div>
                              </div>

                              {activeProposal.secureToken && (
                                <div className="flex gap-2 items-center text-xs">
                                  <div className="flex-1 px-3 py-2 bg-base border border-border rounded-xl text-secondary select-all font-mono truncate">
                                    {`${window.location.origin}/proposals/${activeProposal._id}?token=${activeProposal.secureToken}`}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${window.location.origin}/proposals/${activeProposal._id}?token=${activeProposal.secureToken}`);
                                      showToast('Share link copied!', 'success');
                                    }}
                                    className="px-3 py-2 bg-base hover:bg-surface border border-border rounded-xl text-primary font-semibold transition-all active:scale-95 shrink-0"
                                  >
                                    Copy Link
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Version selector if multiple proposals */}
                          {proposals.length > 1 && (
                            <div className="flex items-center gap-2 overflow-x-auto py-1">
                              <span className="text-[10px] font-bold text-secondary uppercase tracking-wider shrink-0">History:</span>
                              {proposals.map((p, idx) => (
                                <button
                                  key={p._id}
                                  type="button"
                                  onClick={() => {
                                    setActiveProposal(p);
                                    loadProposalIntoForm(p);
                                  }}
                                  className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                                    activeProposal?._id === p._id
                                      ? 'bg-accent text-white'
                                      : 'bg-surface hover:bg-base text-primary border border-border'
                                  }`}
                                >
                                  v{p.version} ({p.status})
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveProposal(null);
                                  loadProposalIntoForm(null);
                                }}
                                className="px-3 py-1 bg-surface hover:bg-base text-accent border border-dashed border-accent/50 rounded-full text-xs font-bold shrink-0 transition-all"
                              >
                                + New Draft
                              </button>
                            </div>
                          )}

                          {/* Form Section */}
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Branding Configuration</label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <span className="text-[10px] text-secondary font-semibold">Brand Color</span>
                                  <div className="flex gap-2 items-center mt-1">
                                    <input
                                      type="color"
                                      value={propColor}
                                      onChange={(e) => setPropColor(e.target.value)}
                                      className="w-10 h-8 rounded-lg border border-border cursor-pointer bg-transparent"
                                    />
                                    <span className="text-xs font-mono text-secondary">{propColor}</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] text-secondary font-semibold">Company Name</span>
                                  <input
                                    type="text"
                                    value={propCompanyName}
                                    onChange={(e) => setPropCompanyName(e.target.value)}
                                    className="w-full px-3 py-2 bg-base border border-border rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                    placeholder="Company Name"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-secondary font-semibold">Company Tagline</span>
                                  <input
                                    type="text"
                                    value={propTagline}
                                    onChange={(e) => setPropTagline(e.target.value)}
                                    className="w-full px-3 py-2 bg-base border border-border rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                    placeholder="Branding tagline..."
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Proposal Title</label>
                                <input
                                  type="text"
                                  value={propTitle}
                                  onChange={(e) => setPropTitle(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent"
                                  placeholder="e.g. Enterprise Services Agreement"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Subtitle / Version Ref</label>
                                <input
                                  type="text"
                                  value={propSubtitle}
                                  onChange={(e) => setPropSubtitle(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent"
                                  placeholder="e.g. Prepared for Acme Corp"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Introduction Text</label>
                              <textarea
                                value={propIntro}
                                onChange={(e) => setPropIntro(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-3 bg-base border border-border rounded-2xl text-xs font-medium text-primary focus:outline-none focus:border-accent resize-y"
                                placeholder="Enter a professional greeting and scope summary..."
                              />
                            </div>

                            {/* Services Table */}
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block">Scope & Pricing (Services)</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPropServices([...propServices, { name: '', description: '', price: 0, quantity: 1, unit: 'project' }]);
                                  }}
                                  className="text-xs text-accent hover:underline flex items-center gap-1 font-bold"
                                >
                                  + Add Row
                                </button>
                              </div>
                              <div className="border border-border rounded-2xl overflow-hidden bg-base/30">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-surface text-[10px] font-bold text-secondary uppercase tracking-wider border-b border-border">
                                      <th className="p-3 w-1/4">Service</th>
                                      <th className="p-3 w-1/3">Description</th>
                                      <th className="p-3 w-1/6">Price</th>
                                      <th className="p-3 w-1/12 text-center">Qty</th>
                                      <th className="p-3 w-1/12">Unit</th>
                                      <th className="p-3 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {propServices.map((svc, sidx) => (
                                      <tr key={sidx} className="border-b border-border/50 text-xs">
                                        <td className="p-2">
                                          <input
                                            type="text"
                                            value={svc.name}
                                            onChange={(e) => {
                                              const updated = [...propServices];
                                              updated[sidx].name = e.target.value;
                                              setPropServices(updated);
                                            }}
                                            className="w-full px-2 py-1.5 bg-base border border-border/65 rounded-lg focus:outline-none focus:border-accent text-xs font-medium"
                                            placeholder="Service name"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <input
                                            type="text"
                                            value={svc.description}
                                            onChange={(e) => {
                                              const updated = [...propServices];
                                              updated[sidx].description = e.target.value;
                                              setPropServices(updated);
                                            }}
                                            className="w-full px-2 py-1.5 bg-base border border-border/65 rounded-lg focus:outline-none focus:border-accent text-xs font-medium"
                                            placeholder="Brief scope details"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <input
                                            type="number"
                                            value={svc.price}
                                            onChange={(e) => {
                                              const updated = [...propServices];
                                              updated[sidx].price = parseFloat(e.target.value) || 0;
                                              setPropServices(updated);
                                            }}
                                            className="w-full px-2 py-1.5 bg-base border border-border/65 rounded-lg focus:outline-none focus:border-accent text-xs font-medium font-mono"
                                            placeholder="0.00"
                                          />
                                        </td>
                                        <td className="p-2 text-center">
                                          <input
                                            type="number"
                                            value={svc.quantity}
                                            onChange={(e) => {
                                              const updated = [...propServices];
                                              updated[sidx].quantity = parseInt(e.target.value) || 1;
                                              setPropServices(updated);
                                            }}
                                            className="w-12 mx-auto px-1 py-1.5 bg-base border border-border/65 rounded-lg focus:outline-none focus:border-accent text-xs text-center font-medium font-mono"
                                            placeholder="1"
                                          />
                                        </td>
                                        <td className="p-2">
                                          <input
                                            type="text"
                                            value={svc.unit}
                                            onChange={(e) => {
                                              const updated = [...propServices];
                                              updated[sidx].unit = e.target.value;
                                              setPropServices(updated);
                                            }}
                                            className="w-full px-2 py-1.5 bg-base border border-border/65 rounded-lg focus:outline-none focus:border-accent text-xs font-medium"
                                            placeholder="e.g. project"
                                          />
                                        </td>
                                        <td className="p-2 text-center">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...propServices];
                                              updated.splice(sidx, 1);
                                              setPropServices(updated);
                                            }}
                                            className="p-1.5 text-secondary hover:text-rose-500 transition-colors"
                                          >
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                    {propServices.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="text-center p-6 text-secondary text-xs font-medium italic">
                                          No services added. Click "+ Add Row" to begin.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Discount, Tax & Totals */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1">Discount %</label>
                                <input
                                  type="number"
                                  value={propDiscount}
                                  onChange={(e) => setPropDiscount(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                  className="w-full px-3 py-2 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent font-mono"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1">Tax %</label>
                                <input
                                  type="number"
                                  value={propTax}
                                  onChange={(e) => setPropTax(Math.max(0, parseFloat(e.target.value) || 0))}
                                  className="w-full px-3 py-2 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent font-mono"
                                  placeholder="0"
                                />
                              </div>
                              <div className="p-4 bg-surface border border-border rounded-2xl flex flex-col justify-between shadow-sm">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-secondary font-medium">Subtotal:</span>
                                  <span className="font-mono font-bold">INR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-rose-500 mt-1">
                                  <span className="font-medium">Discount ({propDiscount}%):</span>
                                  <span className="font-mono font-bold">- INR {discountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs mt-1">
                                  <span className="text-secondary font-medium">Tax ({propTax}%):</span>
                                  <span className="font-mono font-bold">INR {taxVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-bold border-t border-border/80 pt-2 mt-2">
                                  <span>Total Amount:</span>
                                  <span className="text-accent font-mono">INR {totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            </div>

                            {/* Milestones / Delivery Blocks */}
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block">Scope & Timeline (Milestones)</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPropMilestones([...propMilestones, { name: '', description: '', dueDate: '', deliverables: [] }]);
                                  }}
                                  className="text-xs text-accent hover:underline flex items-center gap-1 font-bold"
                                >
                                  + Add Milestone
                                </button>
                              </div>
                              <div className="space-y-3">
                                {propMilestones.map((ms, msidx) => (
                                  <div key={msidx} className="p-4 bg-base/40 border border-border rounded-2xl space-y-3 relative group">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...propMilestones];
                                        updated.splice(msidx, 1);
                                        setPropMilestones(updated);
                                      }}
                                      className="absolute top-4 right-4 text-xs text-secondary hover:text-rose-500 font-bold transition-colors"
                                    >
                                      Remove
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-11/12">
                                      <div>
                                        <span className="text-[10px] text-secondary font-semibold font-medium">Milestone Name</span>
                                        <input
                                          type="text"
                                          value={ms.name}
                                          onChange={(e) => {
                                            const updated = [...propMilestones];
                                            updated[msidx].name = e.target.value;
                                            setPropMilestones(updated);
                                          }}
                                          className="w-full px-3 py-1.5 bg-base border border-border/80 rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                          placeholder="e.g. Kickoff & Discovery"
                                        />
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-secondary font-semibold font-medium">Due Date</span>
                                        <input
                                          type="text"
                                          value={ms.dueDate || ''}
                                          onChange={(e) => {
                                            const updated = [...propMilestones];
                                            updated[msidx].dueDate = e.target.value;
                                            setPropMilestones(updated);
                                          }}
                                          className="w-full px-3 py-1.5 bg-base border border-border/80 rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                          placeholder="e.g. Week 2 or Date string"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-secondary font-semibold font-medium">Milestone Description</span>
                                      <input
                                        type="text"
                                        value={ms.description}
                                        onChange={(e) => {
                                          const updated = [...propMilestones];
                                          updated[msidx].description = e.target.value;
                                          setPropMilestones(updated);
                                        }}
                                        className="w-full px-3 py-1.5 bg-base border border-border/80 rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                        placeholder="Detailed description of deliverables..."
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-secondary font-semibold font-medium">Deliverables (comma-separated list)</span>
                                      <input
                                        type="text"
                                        value={ms.deliverables?.join(', ') || ''}
                                        onChange={(e) => {
                                          const updated = [...propMilestones];
                                          updated[msidx].deliverables = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                          setPropMilestones(updated);
                                        }}
                                        className="w-full px-3 py-1.5 bg-base border border-border/80 rounded-xl text-xs font-medium text-primary mt-1 focus:outline-none focus:border-accent"
                                        placeholder="e.g. Audit checklist, Architecture diagram"
                                      />
                                    </div>
                                  </div>
                                ))}
                                {propMilestones.length === 0 && (
                                  <div className="text-center p-6 bg-base/10 border border-dashed border-border rounded-2xl text-secondary text-xs font-medium italic">
                                    No milestones added. Click "+ Add Milestone" to outline project steps.
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Notes & Terms */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Special Notes / Highlighted Comments</label>
                                <textarea
                                  value={propNotes}
                                  onChange={(e) => setPropNotes(e.target.value)}
                                  rows={3}
                                  className="w-full px-4 py-3 bg-base border border-border rounded-2xl text-xs font-medium text-primary focus:outline-none focus:border-accent resize-y"
                                  placeholder="Highlighted in yellow in the PDF. Good for custom notes..."
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Terms & Conditions</label>
                                <textarea
                                  value={propTerms}
                                  onChange={(e) => setPropTerms(e.target.value)}
                                  rows={3}
                                  className="w-full px-4 py-3 bg-base border border-border rounded-2xl text-xs font-medium text-primary focus:outline-none focus:border-accent resize-y"
                                  placeholder="Terms and conditions..."
                                />
                              </div>
                            </div>

                            {/* Signatures & Expiry */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Valid Until</label>
                                <input
                                  type="date"
                                  value={propValidUntil}
                                  onChange={(e) => setPropValidUntil(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Signature Representative</label>
                                <input
                                  type="text"
                                  value={propSigName}
                                  onChange={(e) => setPropSigName(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent"
                                  placeholder="Your name"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Signature Title</label>
                                <input
                                  type="text"
                                  value={propSigTitle}
                                  onChange={(e) => setPropSigTitle(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent"
                                  placeholder="Your title"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest block mb-1.5">Footer Text</label>
                                <input
                                  type="text"
                                  value={propFooter}
                                  onChange={(e) => setPropFooter(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-medium text-primary focus:outline-none focus:border-accent"
                                  placeholder="Custom confidentiality footer..."
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Documents Tab ── */}
                  {modalTab === 'documents' && (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Shared Documents & Contracts</h3>
                      {selectedLead.documents.map((doc, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-base border border-border rounded-2xl hover:border-accent/30 transition-all group shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-accent/5 text-accent flex items-center justify-center"><FileText size={18}/></div>
                            <div>
                              <div className="text-sm font-bold group-hover:text-accent transition-colors">{doc.name}</div>
                              <div className="text-[10px] text-secondary font-medium">{doc.size} · {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { window.open(doc.url, '_blank'); showToast('Opening document', 'info'); }} className="p-2 text-secondary hover:text-accent transition-colors" title="View"><ChevronRight size={16}/></button>
                            <button onClick={() => { downloadCSV([doc], doc.name); showToast('Downloading...', 'info'); }} className="p-2 text-secondary hover:text-accent transition-colors" title="Download"><Download size={16}/></button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => docInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-border rounded-2xl text-xs font-bold text-secondary hover:text-accent hover:border-accent/50 transition-all mt-2">+ Upload Document</button>
                    </div>
                  )}

                  {/* ── Audit Log Tab ── */}
                  {modalTab === 'approvals' && (
                    <ApprovalPanel />
                  )}
                  {modalTab === 'history' && (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Complete Audit Log</h3>
                      <div className="space-y-3">
                        {selectedLead.history.map((log, i) => (
                          <div key={i} className="flex items-start gap-4 p-4 bg-base/50 border border-border rounded-2xl shadow-sm">
                            <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-[10px] font-bold text-accent shadow-inner">{log.user[0] || 'S'}</div>
                            <div className="flex-1">
                              <div className="text-sm font-bold text-primary">{log.event}</div>
                              <div className="flex justify-between items-center mt-1">
                                <div className="text-[10px] text-secondary font-medium">Actor: {log.user}</div>
                                <div className="text-[10px] text-tertiary font-bold">{new Date(log.time).toLocaleString()}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {selectedLead.history.length === 0 && <div className="text-center text-secondary font-bold py-8 text-xs">No audit log entries yet.</div>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t border-border bg-base/30 flex justify-end">
                  <button onClick={() => setSelectedLead(null)} className="px-8 py-2.5 bg-surface border border-border text-primary font-bold rounded-xl hover:bg-base hover:border-accent transition-all text-xs active:scale-95 shadow-sm">Close Record</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                <h2 className="text-lg font-bold flex items-center gap-2"><Target size={18} className="text-accent" /> New Pipeline Lead</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
              </div>
              <div className="p-8 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
                <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Lead Name *</label><input type="text" value={nlName} onChange={e => setNlName(e.target.value)} placeholder="e.g. Sarah Jenkins" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Lead Email *</label><input type="email" value={nlEmail} onChange={e => setNlEmail(e.target.value)} placeholder="sarah@company.com" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Company</label><input type="text" value={nlCompany} onChange={e => setNlCompany(e.target.value)} placeholder="Acme Inc" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Deal Value ($)</label><input type="number" value={nlValue} onChange={e => setNlValue(e.target.value)} placeholder="5000" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Phone</label><input type="text" value={nlPhone} onChange={e => setNlPhone(e.target.value)} placeholder="+1 555-0199" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Lead Source</label>
                    <select value={nlSource} onChange={e => setNlSource(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm text-primary">
                      {['Manual Entry','Website','Referral','LinkedIn','Cold Outreach','Event','Inbound Call','Email Campaign','Google Ads','Partner'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Pipeline Stage</label>
                    <select value={nlStage} onChange={e => setNlStage(e.target.value as CRMStage)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm text-primary">
                      {STAGES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Lead Priority</label>
                    <select value={nlStatus} onChange={e => setNlStatus(e.target.value as any)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm text-primary">
                      <option>Warm</option><option>Hot</option><option>Cold</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                <button onClick={() => setIsAddModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                <button onClick={handleCreateLead} className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-indigo-600 transition-all shadow-lg active:scale-95 text-xs">Create Lead</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Proposal Modal */}
      <AnimatePresence>
        {isProposalModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-surface w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                <h2 className="text-lg font-bold flex items-center gap-2"><FileText size={18} className="text-orange-500" /> Proposal Generator</h2>
                <button onClick={() => setIsProposalModalOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
              </div>
              <div className="p-8">
                <h3 className="text-sm font-bold mb-4">Select Proposal Template</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[{ name: 'Standard SaaS Retainer', type: 'Annual' }, { name: 'Managed Services MSA', type: 'Enterprise' }, { name: 'Quick Pilot Proposal', type: 'Pilot' }, { name: 'Development SOW', type: 'Project' }].map((t, i) => (
                    <button key={i} onClick={() => showToast(`${t.name} selected`, 'info')} className="p-4 border border-border bg-base rounded-2xl text-left hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group shadow-sm">
                      <div className="text-xs font-bold text-primary group-hover:text-orange-600 transition-colors mb-1">{t.name}</div>
                      <div className="text-[10px] text-secondary font-medium uppercase tracking-widest">{t.type}</div>
                    </button>
                  ))}
                </div>
                <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
                  <p className="text-xs text-orange-600 font-bold mb-1">Proposal Inclusions</p>
                  <p className="text-[11px] text-secondary font-medium leading-relaxed">Auto-compiles: Scope of Operations, Deliverables schedule, SLA guarantees, Pricing structure, and e-sign consent block.</p>
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                <button onClick={() => setIsProposalModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Close</button>
                <button onClick={async () => {
                  if (!selectedLead) return;
                  await handleWorkflowAction('generate_proposal', { templateName: 'Standard Proposal' });
                  setIsProposalModalOpen(false);
                }} className="px-8 py-2.5 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all shadow-lg active:scale-95 text-xs">Generate & Send</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sequence Modal */}
      <AnimatePresence>
        {isSequenceModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                <h2 className="text-lg font-bold flex items-center gap-2"><Zap size={18} className="text-purple-500" /> Automation Sequence Engine</h2>
                <button onClick={() => setIsSequenceModalOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
              </div>
              <div className="p-8">
                <h3 className="text-sm font-bold mb-6">Enroll in Email Sequence</h3>
                <div className="space-y-4">
                  {[{ name: 'Warm Intro Sequence', steps: 5, days: 12, color: 'bg-emerald-500' }, { name: 'Follow-up After Demo', steps: 3, days: 7, color: 'bg-blue-500' }, { name: 'Long-term Nurturing', steps: 8, days: 60, color: 'bg-purple-500' }].map((s, i) => (
                    <button key={i} onClick={async () => {
                      if (!selectedLead) return;
                      try {
                        showToast(`Enrolling in ${s.name}...`, 'info');
                        const res = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: selectedLead._id, to: selectedLead.email, subject: `Warm welcome from Antigravity Operations`, htmlContent: `<p>Hi ${selectedLead.name}, hope you are doing well!</p>`, sequenceName: s.name }) });
                        if (res.ok) { showToast(`Enrolled in: ${s.name}`, 'success'); setIsSequenceModalOpen(false); fetchLeads(); }
                      } catch (err) { console.error(err); }
                    }} className="w-full flex items-center justify-between p-5 bg-base border border-border rounded-2xl hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-10 rounded-full ${s.color}`} />
                        <div className="text-left"><div className="text-sm font-bold group-hover:text-purple-600 transition-colors">{s.name}</div><div className="text-[10px] text-secondary font-medium uppercase tracking-widest">{s.steps} Emails · {s.days} Days</div></div>
                      </div>
                      <Send size={16} className="text-tertiary group-hover:text-purple-600 transition-all group-hover:translate-x-1" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end bg-base/50">
                <button onClick={() => setIsSequenceModalOpen(false)} className="px-10 py-2.5 bg-surface border border-border text-primary font-bold rounded-2xl hover:bg-base hover:border-accent transition-all active:scale-95 text-xs shadow-sm">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Modal */}
      <AnimatePresence>
        {isTemplateModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
              <form onSubmit={handleSaveTemplate}>
                <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Mail size={18} className="text-indigo-500" /> {tempModalMode === 'edit' ? 'Edit Template' : 'Create Template'}</h2>
                  <button type="button" onClick={() => setIsTemplateModalOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
                </div>
                <div className="p-8 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Template Name *</label><input required type="text" value={tempName} onChange={e => setTempName(e.target.value)} placeholder="Follow up on proposal" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Subject *</label><input required type="text" value={tempSubject} onChange={e => setTempSubject(e.target.value)} placeholder="Exploring growth for {{company}}" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" /></div>
                  <div><label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Body *</label><textarea required rows={8} value={tempBody} onChange={e => setTempBody(e.target.value)} placeholder="Hi {{name}},&#10;&#10;I wanted to follow up..." className="w-full px-5 py-4 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary resize-none" /></div>
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl"><p className="text-xs text-indigo-600 font-bold mb-1">Dynamic Substitutions</p><p className="text-[10px] text-secondary font-medium leading-relaxed">Use <strong>{"{{company}}"}</strong> and <strong>{"{{name}}"}</strong> as placeholders.</p></div>
                </div>
                <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button type="button" onClick={() => setIsTemplateModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button type="submit" className="px-10 py-2.5 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95 text-xs">{tempModalMode === 'edit' ? 'Save Changes' : 'Create Template'}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Approval Panel Component ─────────────────────────────────────────────────
function ApprovalPanel() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useUI();

  const fetchApprovals = async () => {
    try {
      const res = await fetch('/api/leads/approval?status=pending', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch (e) {
      console.error('[ApprovalPanel]', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchApprovals(); }, []);

  const review = async (requestId: string, action: 'approve' | 'reject', reviewNote?: string) => {
    try {
      const res = await fetch('/api/leads/approval', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, action, reviewNote: reviewNote || '' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Deal ${action}d successfully`, 'success');
        fetchApprovals();
      } else {
        showToast(data.error || 'Action failed', 'error');
      }
    } catch { showToast('Request failed', 'error'); }
  };

  if (loading) return <div className="p-4 text-secondary text-sm animate-pulse">Loading approvals…</div>;
  if (requests.length === 0) return (
    <div className="p-6 text-center text-secondary text-sm">
      <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500 opacity-50" />
      No pending approvals
    </div>
  );

  return (
    <div className="space-y-3 p-1">
      {requests.map((req: any) => (
        <div key={req._id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-primary">{req.leadId?.name || 'Unknown Lead'}</p>
              <p className="text-xs text-secondary">{req.leadId?.company} · {req.dealValue}</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold uppercase">Pending</span>
          </div>
          {req.reason && <p className="text-xs text-secondary">{req.reason}</p>}
          <p className="text-[10px] text-tertiary">Requested by {req.requestedByName} · {new Date(req.createdAt).toLocaleDateString()}</p>
          <div className="flex gap-2">
            <button
              onClick={() => review(req._id, 'approve')}
              className="flex-1 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => {
                const note = prompt('Reason for rejection (optional):') || '';
                review(req._id, 'reject', note);
              }}
              className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors"
            >
              ✗ Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
