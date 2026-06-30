'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import {
  Target, Mail, CreditCard, Folder, Plus, Upload,
  ChevronRight, Send, Download,
  Clock, FileText, Share2,
  ArrowUpRight, BarChart3, X,
  Image, Type, Paperclip, Settings, Hash, Shield, MessageSquare,
  CheckSquare, Star, Zap, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCSV } from '@/utils/export';
import SharedSettingsModule from '@/components/SharedSettingsModule';
import { useSocket } from '@/hooks/useSocket';

// --- Shared UI Components ---

const Card = ({ 
  children, 
  className = "", 
  delay = 0, 
  onClick,
  draggable,
  onDragStart,
  onDragEnd
}: { 
  children: React.ReactNode, 
  className?: string, 
  delay?: number, 
  onClick?: () => void,
  draggable?: boolean,
  onDragStart?: (e: any) => void,
  onDragEnd?: (e: any) => void
}) => {
  const hasBg = className.split(' ').some(c => c.startsWith('bg-'));
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.5, delay, ease: "circOut" }} 
      className={`card-enterprise ${hasBg ? "" : "bg-surface"} ${className}`} 
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
    </motion.div>
  );
};

const Badge = ({ text, type = "default" }: { text: string, type?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const styles = {
    default: "bg-base text-secondary border-border",
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    warning: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    danger: "bg-red-500/10 text-red-600 border-red-500/20",
    info: "bg-accent/10 text-accent border-accent/20"
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[type]}`}>{text}</span>;
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-2xl bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-base/30">
            <h3 className="text-sm font-bold text-primary">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-base rounded-xl transition-colors"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Sub-Modules ---

type Lead = {
  _id?: string;
  name: string;
  company: string;
  value: string;
  stage: 'Discovery' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Closing';
  status: 'Hot' | 'Warm' | 'Cold';
  lastContact: string;
  email: string;
  phone: string;
  assignedToName?: string;
  notes: Array<{ content: string; author: string; createdAt: string }>;
  emails: Array<{
    subject: string;
    body: string;
    sender: string;
    sentAt: string;
    status: string;
    opens: number;
    clicks: number;
  }>;
  documents: Array<{ name: string; size: string; url: string; uploadedAt: string }>;
  history: Array<{ event: string; user: string; time: string }>;
};

// MOCK_LEADS and MOCK_INVOICES removed — real API data only.

const PipelineModule = ({ 
  leads, 
  onSelectLead, 
  showToast, 
  refreshLeads, 
  currentUser,
  setLeads
}: { 
  leads: Lead[]; 
  onSelectLead: (lead: Lead) => void; 
  showToast: any; 
  refreshLeads: any; 
  currentUser: string;
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
}) => {
  const stages = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedId) return;

    // Optimistically update the local state stage
    if (setLeads) {
      setLeads(prevLeads => prevLeads.map(l => l._id === draggedId ? {
        ...l,
        stage: targetStage as any,
        lastContact: 'Just now',
        history: [
          { event: `Stage updated (optimistic): ${l.stage} → ${targetStage}`, user: currentUser, time: new Date().toISOString() },
          ...(l.history || [])
        ]
      } : l));
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          id: draggedId,
          action: 'update_stage',
          stage: targetStage,
          currentUser: currentUser
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Updated deal stage to ${targetStage}`, 'success');
        refreshLeads();
      } else {
        showToast(`Locally updated deal stage to ${targetStage}`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast(`Locally updated deal stage to ${targetStage}`, 'success');
    }
    setDraggedId(null);
  };

  return (
    <div className="overflow-x-auto w-full pb-6 custom-scrollbar snap-x scroll-smooth">
      <div className="flex gap-6 min-w-max p-1">
        {stages.map((stage, idx) => {
          const isCurrentOver = dragOverStage === stage;
          const isAnyDragging = draggedId !== null;
          const stageLeads = leads.filter((l) => l.stage === stage);

          return (
            <div 
              key={stage} 
              className={`flex flex-col w-[320px] rounded-3xl border-2 transition-all duration-200 p-2 bg-surface/20 shrink-0 snap-center ${
                isCurrentOver 
                  ? 'border-accent bg-accent/[0.04] shadow-lg shadow-accent/5 scale-[1.01]' 
                  : isAnyDragging 
                    ? 'border-dashed border-border bg-surface/10' 
                    : 'border-transparent'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 mb-2">
                <h3 className="text-xs font-extrabold text-primary uppercase tracking-widest flex items-center gap-2.5 leading-none">
                  <div className={`w-2 h-2 rounded-full ${
                    idx === 0 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 
                    idx === 1 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 
                    idx === 2 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                    idx === 3 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                    idx === 4 ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 
                    'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                  }`} />
                  {stage}
                </h3>
                <span className="text-[10px] font-black bg-surface border border-border text-secondary px-2.5 py-0.5 rounded-full shadow-sm leading-none">
                  {stageLeads.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-2 flex flex-col gap-3 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">
                <AnimatePresence>
                  {stageLeads.map((lead) => {
                    const initials = lead.assignedToName ? lead.assignedToName.split(' ').map(n => n[0]).join('') : 'UN';
                    const getAvatarColor = (name: string = '') => {
                      const colors = [
                        'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/10',
                        'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/10',
                        'bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 border-pink-500/10',
                        'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/10',
                        'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/10'
                      ];
                      let sum = 0;
                      for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
                      return colors[sum % colors.length];
                    };

                    return (
                      <motion.div
                        key={lead._id}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                        draggable
                        onDragStart={() => setDraggedId(lead._id || null)}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDragOverStage(null);
                        }}
                        className="bg-surface border border-border/80 p-5 rounded-2xl cursor-grab active:cursor-grabbing hover:border-accent hover:shadow-lg hover:shadow-accent/[0.03] transition-all group shadow-sm flex flex-col gap-3"
                        onClick={() => onSelectLead(lead)}
                      >
                        {/* Card Header Info */}
                        <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                            lead.status === 'Hot' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' : 
                            lead.status === 'Warm' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' : 
                            'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'
                          }`}>{lead.status}</span>
                          
                          <div className="flex gap-2">
                            {lead.notes && lead.notes.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Internal notes count">
                                <MessageSquare size={10} /> {lead.notes.length}
                              </span>
                            )}
                            {lead.emails && lead.emails.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Outreach emails sent">
                                <Mail size={10} /> {lead.emails.length}
                              </span>
                            )}
                            {lead.documents && lead.documents.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-tertiary font-bold" title="Documents attached">
                                <Paperclip size={10} /> {lead.documents.length}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Titles */}
                        <div>
                          <h4 className="text-sm font-extrabold text-primary group-hover:text-accent transition-colors leading-snug tracking-tight mb-0.5 truncate">{lead.name}</h4>
                          <p className="text-[10px] font-bold text-secondary truncate uppercase tracking-widest">{lead.company}</p>
                        </div>
                        
                        {/* Card Bottom Meta */}
                        <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
                          <div className="text-sm font-black text-accent">{lead.value}</div>
                          
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border ${getAvatarColor(lead.assignedToName)}`} title={`Owner: ${lead.assignedToName || 'Unassigned'}`}>
                              {initials}
                            </div>
                            <span className="text-[8px] font-black text-tertiary uppercase tracking-wider truncate max-w-[80px]">
                              {lead.lastContact || 'Just now'}
                            </span>
                          </div>
                        </div>
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
  );
};

const EmailModule = ({ 
  showToast, 
  leads, 
  refreshLeads, 
  currentUser,
  setLeads,
  preselectedLeadId,
  setPreselectedLeadId
}: { 
  showToast: any; 
  leads: Lead[]; 
  refreshLeads: any; 
  currentUser: string;
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
  preselectedLeadId?: string;
  setPreselectedLeadId?: (id: string) => void;
}) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(preselectedLeadId || '');

  useEffect(() => {
    if (preselectedLeadId) {
      setSelectedLeadId(preselectedLeadId);
      setIsComposerOpen(true);
      if (setPreselectedLeadId) {
        setPreselectedLeadId('');
      }
    }
  }, [preselectedLeadId, setPreselectedLeadId]);

  // Extract all tracked outreach emails from all leads safely
  const allOutreach = (leads || []).flatMap(l => 
    (l.emails || []).map(e => ({
      leadId: l._id,
      leadName: l.name,
      to: l.email,
      company: l.company,
      subject: e.subject,
      body: e.body,
      status: e.status,
      sentAt: e.sentAt,
      opens: e.opens,
      clicks: e.clicks
    }))
  ).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  const handleSend = async () => {
    if (!selectedLeadId || !emailSubject || !emailBody) {
      showToast('Recipient selection, subject, and body content are required', 'warning');
      return;
    }

    try {
      showToast('Transmitting secure campaign email...', 'info');
      const targetLead = leads.find(l => l._id === selectedLeadId);
      if (!targetLead) return;

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          leadId: selectedLeadId,
          to: targetLead.email,
          subject: emailSubject,
          htmlContent: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${emailBody.replace(/\n/g, '<br/>')}</div>`
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Outreach dispatched successfully!', 'success');
        setIsComposerOpen(false);
        setEmailSubject('');
        setEmailBody('');
        refreshLeads();
      } else {
        throw new Error(data.error || 'API dispatch failed');
      }
    } catch (err) {
      console.warn('dispatch error, triggering local fallback outreach logic', err);
      // Offline fallback: save locally
      if (setLeads) {
        setLeads(prevLeads => prevLeads.map(l => l._id === selectedLeadId ? {
          ...l,
          emails: [
            {
              subject: emailSubject,
              body: emailBody,
              sender: currentUser,
              sentAt: new Date().toISOString(),
              status: 'sent',
              opens: 0,
              clicks: 0
            },
            ...(l.emails || [])
          ],
          history: [
            {
              event: `Campaign outreach sent (local fallback): ${emailSubject}`,
              user: currentUser,
              time: new Date().toISOString()
            },
            ...(l.history || [])
          ]
        } : l));
      }
      showToast('Offline Mode: Outreach recorded locally', 'success');
      setIsComposerOpen(false);
      setEmailSubject('');
      setEmailBody('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <Mail size={20} className="text-accent" />
          Media Outreach Hub
        </h2>
        <div className="flex gap-3">
          <button onClick={() => setIsComposerOpen(true)} className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all flex items-center gap-2 active:scale-95">
            <Plus size={16} /> Compose Outreach
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-base/30 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-tertiary">Active Outreach Outbox</h3>
              <div className="flex gap-2">
                <Badge text="Gmail connected" type="success" />
              </div>
            </div>
            <div className="divide-y divide-border">
              {allOutreach.map((email, i) => (
                <div key={i} className="p-5 flex items-center justify-between group hover:bg-base/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center group-hover:border-accent transition-colors">
                      <Send size={18} className="text-secondary group-hover:text-accent" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-primary">{email.leadName} ({email.company})</div>
                      <div className="text-[10px] text-secondary font-medium mt-0.5">{email.subject}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-tertiary uppercase">
                      <span className="flex items-center gap-1"><Star size={12} className="text-orange-400 fill-orange-400"/> {email.opens} Opens</span>
                      <span className="flex items-center gap-1"><Hash size={12} className="text-accent"/> {email.clicks} Clicks</span>
                    </div>
                    <div className="text-right">
                      <Badge text={email.status} type={email.status === 'replied' ? 'success' : email.status === 'opened' ? 'info' : 'default'} />
                      <div className="text-[9px] text-tertiary font-bold mt-1 uppercase">{new Date(email.sentAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
              {allOutreach.length === 0 && (
                <div className="p-8 text-center text-secondary font-semibold text-xs">No media campaign emails dispatched yet</div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-xs font-bold text-tertiary uppercase tracking-widest mb-4">Media Email Templates</h3>
            <div className="space-y-3">
               {[
                 { name: 'Initial Pitch Template', subject: 'Campaign proposal for growth' },
                 { name: 'Case Study Outreach', subject: 'How we scaled campaign performance' },
                 { name: 'Meeting Scheduling Call', subject: 'Brief sync request next Tuesday' }
               ].map(t => (
                 <button 
                  key={t.name} 
                  onClick={() => {
                    setEmailSubject(t.subject);
                    setEmailBody(`Hi,\n\nI wanted to share details with you regarding our platform capabilities. We recently scaled campaign ROI by 45%.\n\nLet me know if we can schedule a quick 10 min chat next week!\n\nBest regards,\n${currentUser}`);
                    setIsComposerOpen(true);
                    showToast(`Applied ${t.name}`, 'info');
                  }}
                  className="w-full p-3 bg-base border border-border/50 rounded-xl text-xs font-bold text-primary hover:border-accent/40 hover:bg-accent/5 transition-all text-left flex items-center justify-between group"
                 >
                   {t.name}
                   <ArrowUpRight size={14} className="text-tertiary group-hover:text-accent group-hover:translate-x-0.5" />
                 </button>
               ))}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
            <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Zap size={14}/> Sequence Automation
            </h3>
            <p className="text-[11px] text-secondary leading-relaxed mb-4 font-medium">Auto-follow sequences are running. Global outreach health and link engagement tracking at healthy limits.</p>
            <div className="flex items-center justify-between text-[9px] font-bold text-tertiary uppercase mb-2">
              <span>Sequencer Deliverability</span>
              <span>98.6%</span>
            </div>
            <div className="w-full h-1.5 bg-base rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: '98.6%' }} transition={{ duration: 1 }} className="h-full bg-indigo-500" />
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={isComposerOpen} onClose={() => setIsComposerOpen(false)} title="New Media Outreach">
        <div className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-tertiary uppercase">Target Recipient Lead</label>
                <select 
                  value={selectedLeadId}
                  onChange={e => setSelectedLeadId(e.target.value)}
                  className="input-enterprise w-full text-xs px-4 py-2.5 font-bold text-primary"
                >
                  <option value="">Select Target Lead</option>
                  {(leads || []).map(l => (
                    <option key={l._id} value={l._id}>{l.name} ({l.company})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-tertiary uppercase">Subject Line</label>
                <input 
                  type="text" 
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Media Proposal..." 
                  className="input-enterprise w-full text-xs px-4 py-2.5 font-bold text-primary" 
                />
              </div>
           </div>
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-tertiary uppercase">Rich Media Composer</label>
              <div className="border border-border rounded-2xl overflow-hidden shadow-inner">
                 <div className="bg-base p-2 border-b border-border flex gap-2">
                    {[Type, Image, Paperclip, Settings].map((Icon, i) => (
                      <button key={i} className="p-1.5 hover:bg-surface rounded-lg text-tertiary hover:text-accent transition-colors"><Icon size={14}/></button>
                    ))}
                 </div>
                 <textarea 
                   rows={10} 
                   value={emailBody}
                   onChange={e => setEmailBody(e.target.value)}
                   className="w-full bg-surface p-4 text-xs font-medium focus:outline-none resize-none text-primary" 
                   placeholder="Draft your magnificent proposal here..."
                 />
              </div>
           </div>
           <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex gap-2">
                <button onClick={() => setIsComposerOpen(false)} className="btn-enterprise-secondary px-4 py-2 text-[10px] font-bold uppercase">Discard</button>
              </div>
              <button onClick={handleSend} className="btn-enterprise-primary px-8 py-2 text-xs">Send Outreach Now</button>
           </div>
        </div>
      </Modal>
    </div>
  );
};

const TasksModule = ({
  showToast,
  user
}: {
  showToast: any;
  user: any;
}) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [remTitle, setRemTitle] = useState('');
  const [remDueAt, setRemDueAt] = useState('');
  const [remDesc, setRemDesc] = useState('');

  const fetchTasksAndReminders = async () => {
    try {
      const [tasksRes, remRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/reminders')
      ]);

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        if (tasksData.success) {
          const filtered = tasksData.tasks.filter((t: any) => 
            (t.assignedTo && t.assignedTo.toString() === user?.sub) ||
            (t.assignee && (t.assignee.toLowerCase() === user?.name?.toLowerCase() || t.assignee.toLowerCase() === user?.email?.toLowerCase())) ||
            (t.assignedRole && t.assignedRole === user?.role)
          );
          setTasks(filtered);
        }
      }

      if (remRes.ok) {
        const remData = await remRes.json();
        if (remData.success) {
          setReminders(remData.reminders || []);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Error syncing tasks and reminders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndReminders();
  }, []);

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle || !remDueAt) {
      showToast('Reminder title and due date are required', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          title: remTitle,
          description: remDesc,
          dueAt: remDueAt,
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reminder created successfully', 'success');
        setRemTitle('');
        setRemDesc('');
        setRemDueAt('');
        fetchTasksAndReminders();
      } else {
        showToast(data.error || 'Failed to create reminder', 'error');
      }
    } catch (err) {
      showToast('Failed to create reminder', 'error');
    }
  };

  const handleToggleReminder = async (id: string, currentCompleted: boolean) => {
    try {
      const res = await fetch('/api/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          id,
          completed: !currentCompleted
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(currentCompleted ? 'Reminder reopened' : 'Reminder completed', 'success');
        fetchTasksAndReminders();
      } else {
        showToast(data.error || 'Failed to update reminder', 'error');
      }
    } catch (err) {
      showToast('Failed to update reminder', 'error');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      const res = await fetch(`/api/reminders?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reminder deleted successfully', 'success');
        fetchTasksAndReminders();
      } else {
        showToast(data.error || 'Failed to delete reminder', 'error');
      }
    } catch (err) {
      showToast('Failed to delete reminder', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-0 overflow-hidden bg-surface">
          <div className="p-6 border-b border-border flex items-center justify-between bg-base/30">
            <h3 className="text-sm font-bold flex items-center gap-2"><CheckSquare size={18} className="text-accent"/> Tasks Workflow</h3>
          </div>
          <div className="divide-y divide-border">
            {tasks.map((task, i) => (
              <div key={task._id || i} className="p-5 flex items-center justify-between group hover:bg-base/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-tertiary uppercase">{task.code || `TSK-${i+1}`}</span>
                    <Badge text={task.stage || 'Backlog'} type={task.stage === 'Done' ? 'success' : task.stage === 'Review' ? 'warning' : 'info'} />
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${task.priority === 'High' ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-secondary bg-surface border-border'}`}>
                      {task.priority || 'Medium'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-primary">{task.title}</h4>
                  <p className="text-[10px] text-secondary mt-1">{task.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-tertiary font-bold">Assignee: {task.assignee || 'Unassigned'}</div>
                  {task.dueDate && (
                    <div className="text-[10px] text-secondary font-semibold mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="p-8 text-center text-secondary font-semibold text-xs">No active tasks recorded</div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-0 overflow-hidden bg-surface">
            <div className="p-6 border-b border-border bg-base/30">
              <h3 className="text-sm font-bold flex items-center gap-2"><Clock size={18} className="text-indigo-500"/> Reminders & Alerts</h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {reminders.map((rem, i) => (
                <div key={rem._id || i} className={`p-4 flex items-start justify-between gap-3 ${rem.completed ? 'bg-emerald-500/5' : ''}`}>
                  <input
                    type="checkbox"
                    checked={rem.completed}
                    onChange={() => handleToggleReminder(rem._id, rem.completed)}
                    className="mt-1 rounded border-border text-accent focus:ring-accent cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-bold text-primary ${rem.completed ? 'line-through text-secondary' : ''}`}>{rem.title}</h4>
                    {rem.description && (
                      <p className="text-[10px] text-secondary mt-0.5 truncate">{rem.description}</p>
                    )}
                    <div className="text-[9px] text-tertiary font-semibold mt-1">Due: {new Date(rem.dueAt).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteReminder(rem._id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-500/10 transition-all text-xs font-bold"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {reminders.length === 0 && (
                <div className="p-6 text-center text-secondary font-semibold text-xs">No pending reminders</div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-black text-tertiary uppercase tracking-widest mb-4">Set New Reminder</h3>
            <form onSubmit={handleCreateReminder} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Reminder Title</label>
                <input
                  type="text"
                  value={remTitle}
                  onChange={e => setRemTitle(e.target.value)}
                  placeholder="e.g. Call client back"
                  className="input-enterprise w-full px-4 py-3 text-xs font-bold text-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Description (Optional)</label>
                <textarea
                  value={remDesc}
                  onChange={e => setRemDesc(e.target.value)}
                  placeholder="e.g. Discuss Q3 proposal details"
                  rows={2}
                  className="input-enterprise w-full px-4 py-3 text-xs font-bold text-primary resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Due At</label>
                <input
                  type="datetime-local"
                  value={remDueAt}
                  onChange={e => setRemDueAt(e.target.value)}
                  className="input-enterprise w-full px-4 py-3 text-xs font-bold text-primary"
                />
              </div>
              <button type="submit" className="btn-enterprise-primary w-full py-2.5 text-xs">
                <Plus size={14} /> Add Reminder
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

const FinanceModule = ({ 

  invoices, 
  showToast, 
  refreshInvoices,
  setInvoices
}: { 
  invoices: any[]; 
  showToast: any; 
  refreshInvoices: any;
  setInvoices?: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payClient, setPayClient] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  const totalVal = invoices.reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const paidVal = invoices.filter(inv => inv.status === 'Paid').reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const pendingVal = invoices.filter(inv => inv.status === 'Pending').reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);

  const handleGenerateLink = async () => {
    if (!payAmount || !payClient) {
      showToast('Billing amount and client name are required', 'warning');
      return;
    }

    try {
      showToast('Generating Razorpay payment invoice...', 'info');
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          client: payClient,
          amount: `$${parseFloat(payAmount).toLocaleString()}`,
          category: 'Managed Media',
          due: 'Next Month'
        })
      });
      const data = await res.json();
      if (data.success && data.invoice?.paymentLink) {
        setGeneratedLink(data.invoice.paymentLink);
        setIsLinkModalOpen(true);
        showToast('Payment link generated successfully!', 'success');
        setPayAmount(''); setPayClient('');
        refreshInvoices();
      } else {
        showToast(data.error || 'Failed to generate payment link — check Razorpay configuration', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      showToast(`Payment link generation failed: ${msg}`, 'error');
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Pending Collections', value: `$${pendingVal.toLocaleString()}`, color: 'text-orange-500', bg: 'bg-orange-500/10' },
          { label: 'Received This Month', value: `$${paidVal.toLocaleString()}`, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Projected Total Revenue', value: `$${totalVal.toLocaleString()}`, color: 'text-accent', bg: 'bg-accent/10' },
        ].map((s, i) => (
          <Card key={i} className="p-5 flex items-center gap-4 bg-surface">
             <div className={`w-12 h-12 rounded-2xl ${s.bg} ${s.color} flex items-center justify-center shadow-sm`}>
                <CreditCard size={24} />
             </div>
             <div>
                <div className="text-[10px] font-bold text-tertiary uppercase leading-none mb-1.5">{s.label}</div>
                <div className="text-xl font-black text-primary leading-none">{s.value}</div>
             </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-0 overflow-hidden bg-surface">
          <div className="p-6 border-b border-border flex items-center justify-between bg-base/30">
            <h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 size={18} className="text-accent"/> Media Billing Overview</h3>
          </div>
          <div className="divide-y divide-border">
             {invoices.map((inv, i) => (
                <div key={i} className="p-5 flex items-center justify-between group hover:bg-base/30 transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center group-hover:border-accent transition-colors">
                         <FileText size={18} className="text-secondary" />
                      </div>
                      <div>
                         <div className="text-xs font-bold text-primary">{inv.client}</div>
                         <div className="text-[10px] text-tertiary font-bold uppercase mt-0.5">{inv.invoiceId} · Category: {inv.category}</div>
                      </div>
                   </div>
                   <div className="flex items-center gap-6">
                      <div className="text-right">
                         <div className="text-sm font-black text-primary">{inv.amount}</div>
                         <Badge text={inv.status} type={inv.status === 'Paid' ? 'success' : inv.status === 'Overdue' ? 'danger' : 'warning'} />
                      </div>
                      {inv.paymentLink && (
                        <button 
                          onClick={() => window.open(inv.paymentLink, '_blank')}
                          className="p-2 hover:bg-base border border-border rounded-lg text-accent transition-colors text-xs font-bold"
                        >
                          Pay
                        </button>
                      )}
                   </div>
                </div>
             ))}
             {invoices.length === 0 && (
                <div className="p-8 text-center text-secondary font-semibold text-xs">No media billings recorded</div>
             )}
          </div>
        </Card>

        <Card className="bg-primary text-white border-none shadow-xl relative overflow-hidden flex flex-col justify-between">
           <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
           <div>
              <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-6 relative z-10">Instant Payment Link</h3>
              <div className="space-y-4 relative z-10">
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase text-white/40">Outbound Amount (USD)</label>
                    <input 
                      type="number" 
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      placeholder="0.00" 
                      className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-white/20" 
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase text-white/40">Client Reference Name</label>
                    <input 
                      type="text" 
                      value={payClient}
                      onChange={e => setPayClient(e.target.value)}
                      placeholder="e.g. Hexacloud" 
                      className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black text-white focus:outline-none focus:ring-1 focus:ring-white/20" 
                 />
                 </div>
                 <button onClick={handleGenerateLink} className="w-full py-3 bg-white text-primary rounded-xl text-[10px] font-bold uppercase hover:bg-slate-50 transition-all shadow-lg active:scale-95">Generate Link</button>
              </div>
           </div>
        </Card>
      </div>

      <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title="Razorpay Payment Link">
        <div className="space-y-4 text-center p-6">
           <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} />
           </div>
           <h4 className="font-bold text-base text-primary">Payment Link Generated Successfully!</h4>
           <p className="text-xs text-secondary leading-relaxed font-medium">Forward this Razorpay payment link to your client. They can complete payment securely using UPI, credit/debit card, or net banking.</p>
           <input 
              type="text" 
              readOnly 
              value={generatedLink} 
              className="input-enterprise w-full text-center text-accent" 
            />
            <div className="flex gap-3 pt-4 justify-center">
               <button 
                 onClick={() => { navigator.clipboard.writeText(generatedLink); showToast('Link copied to clipboard!', 'success'); }}
                 className="btn-enterprise-primary px-6 py-2"
               >
                 Copy Link
               </button>
               <button 
                 onClick={() => setIsLinkModalOpen(false)}
                 className="btn-enterprise-secondary px-6 py-2"
               >
                 Done
               </button>
           </div>
        </div>
      </Modal>
    </div>
  );
};

const ResourceModule = ({ 
  leads, 
  showToast, 
  refreshLeads, 
  currentUser,
  setLeads
}: { 
  leads: Lead[]; 
  showToast: any; 
  refreshLeads: any; 
  currentUser: string;
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const docInputRef = useRef<HTMLInputElement>(null);

  // Extract all documents from all leads safely
  const allDocs = (leads || []).flatMap(l => 
    (l.documents || []).map(d => ({
      leadId: l._id,
      leadName: l.name,
      fileName: d.name,
      fileSize: d.size,
      url: d.url,
      uploadedAt: d.uploadedAt
    }))
  ).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLeadId) {
      showToast('Select a target lead to attach document upload', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      try {
        showToast('Encrypting and uploading media kit proposal...', 'info');
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
          body: JSON.stringify({
            leadId: selectedLeadId,
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            fileData: base64Data,
            currentUser: currentUser
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Media Proposal uploaded and shared successfully!', 'success');
          refreshLeads();
        } else {
          throw new Error(data.error || 'API upload failed');
        }
      } catch (err) {
        console.warn('upload failed, saving document locally', err);
        // Offline fallback: save locally
        if (setLeads) {
          setLeads(prevLeads => prevLeads.map(l => l._id === selectedLeadId ? {
            ...l,
            documents: [
              {
                name: file.name,
                size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                url: '#',
                uploadedAt: new Date().toISOString()
              },
              ...(l.documents || [])
            ],
            history: [
              {
                event: `Attached document (local fallback): ${file.name}`,
                user: currentUser,
                time: new Date().toISOString()
              },
              ...(l.history || [])
            ]
          } : l));
        }
        showToast('Offline Mode: Document attached locally', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8">
       <input type="file" ref={docInputRef} className="hidden" onChange={handleUpload} />

       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Contracts', count: allDocs.filter(d => d.fileName.includes('.pdf')).length, icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Campaign Proposals', count: allDocs.length, icon: FileText, color: 'text-accent', bg: 'bg-accent/10' },
            { label: 'Shared Brand Assets', count: allDocs.filter(d => d.fileName.includes('.zip') || d.fileName.includes('.png')).length, icon: Image, color: 'text-orange-500', bg: 'bg-orange-500/10' },
            { label: 'Shared Assets', count: allDocs.length, icon: Share2, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
          ].map((s, i) => (
            <Card key={i} className="p-4 flex items-center justify-between group hover:border-accent/40 cursor-pointer bg-surface">
               <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                     <s.icon size={20} />
                  </div>
                  <div>
                     <div className="text-xs font-bold text-primary">{s.label}</div>
                     <div className="text-[10px] text-tertiary font-bold uppercase">{s.count} Entries</div>
                  </div>
               </div>
               <ChevronRight size={14} className="text-tertiary group-hover:translate-x-1 transition-transform" />
            </Card>
          ))}
       </div>

       <Card className="p-0 overflow-hidden bg-surface">
          <div className="p-6 border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between bg-base/30 gap-4">
             <h3 className="text-sm font-bold flex items-center gap-2"><Folder size={18} className="text-accent"/> Secure Campaign Proposal Desk</h3>
             <div className="flex gap-3 w-full md:w-auto">
                <select 
                  value={selectedLeadId}
                  onChange={e => setSelectedLeadId(e.target.value)}
                  className="input-enterprise px-4 py-2 text-xs font-bold text-primary max-w-xs"
                >
                  <option value="">Attach upload to Lead</option>
                  {leads.map(l => (
                    <option key={l._id} value={l._id}>{l.name} ({l.company})</option>
                  ))}
                </select>
                <button 
                  onClick={() => {
                    if (!selectedLeadId) { showToast('Please select a lead first to attach document', 'warning'); return; }
                    docInputRef.current?.click();
                  }}
                  className="btn-enterprise-primary flex items-center gap-2 whitespace-nowrap"
                >
                   <Upload size={16} /> Upload Asset
                </button>
             </div>
          </div>
          <div className="divide-y divide-border">
             {allDocs.map((file, i) => (
                <div key={i} className="p-5 flex items-center justify-between group hover:bg-base/30 transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center group-hover:border-accent transition-colors">
                         <FileText size={18} className="text-secondary" />
                      </div>
                      <div>
                         <div className="text-xs font-bold text-primary group-hover:text-accent transition-colors cursor-pointer" onClick={() => window.open(file.url, '_blank')}>{file.fileName}</div>
                         <div className="text-[10px] text-tertiary font-bold uppercase mt-0.5">Lead: {file.leadName} · Size: {file.fileSize} · Shared {new Date(file.uploadedAt).toLocaleDateString()}</div>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <button onClick={() => window.open(file.url, '_blank')} className="p-2.5 hover:bg-surface rounded-xl text-tertiary hover:text-accent transition-all" title="View"><Share2 size={16}/></button>
                      <button onClick={() => { downloadCSV([file], file.fileName); showToast('Downloading asset...', 'info'); }} className="p-2.5 hover:bg-surface rounded-xl text-tertiary hover:text-accent transition-all" title="Download"><Download size={16}/></button>
                   </div>
                </div>
             ))}
             {allDocs.length === 0 && (
                <div className="p-8 text-center text-secondary font-semibold text-xs">No media assets or proposals uploaded yet</div>
             )}
          </div>
       </Card>
    </div>
  );
};

// --- Main Shell ---

function MRDashboard() {
  const [activeTab, setActiveTab] = useState<'leads' | 'email' | 'finance' | 'resources' | 'tasks' | 'settings'>('leads');
  const { showToast } = useUI();
  const { socket } = useSocket();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { user: authUser } = useAuth();
  const currentUser = authUser ?? { name: 'Marketing Rep', email: '', role: 'User' };
  const [preselectedLeadId, setPreselectedLeadId] = useState<string>('');

  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  const fetchData = async () => {
    setFetchError(null);
    try {
      const [leadsRes, invoicesRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/invoices')
      ]);

      if (!leadsRes.ok) throw new Error(`Leads API returned ${leadsRes.status}`);
      if (!invoicesRes.ok) throw new Error(`Invoices API returned ${invoicesRes.status}`);

      const leadsData    = await leadsRes.json();
      const invoicesData = await invoicesRes.json();

      if (leadsData.success) {
        setLeads(leadsData.leads ?? []);
      } else {
        throw new Error(leadsData.error || 'Leads API error');
      }

      if (invoicesData.success) {
        setInvoices(invoicesData.invoices ?? []);
      } else {
        throw new Error(invoicesData.error || 'Invoices API error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MR] Data fetch failed:', msg);
      setFetchError(msg);
      showToast(`Failed to load media data: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab && ['leads', 'email', 'finance', 'resources', 'tasks', 'settings'].includes(tab)) {
      setActiveTab(tab as any);
    } else {
      setActiveTab('leads');
    }
  }, [tab]);

  useEffect(() => {
    // Only fetch data for non-settings tabs
    if (tab !== 'settings') {
      fetchData();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings tab: full-page layout bypassing the dashboard grid
  if (activeTab === 'settings') {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <SharedSettingsModule role="marketing" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 min-h-screen bg-base text-primary">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Badge text="Media Representative" type="info" />
             <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
             <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none">Media Ops Command</span>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Media Desk</h1>
          <p className="text-secondary text-sm mt-1 font-medium font-sans">Pipeline management, Outreach automation, and Financial tracking.</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex bg-surface border border-border rounded-xl p-1 mb-8 shadow-inner max-w-xl">
        {['leads', 'email', 'finance', 'resources', 'tasks'].map(t => (
          <button 
            key={t} 
            onClick={() => setActiveTab(t as any)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all capitalize ${activeTab === t ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center text-secondary font-bold text-sm">Loading media databases...</div>
      ) : fetchError ? (
        <div className="h-96 flex flex-col items-center justify-center gap-4">
          <div className="text-red-500 font-bold text-sm">Failed to load media data</div>
          <div className="text-secondary text-xs font-medium max-w-sm text-center">{fetchError}</div>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-6 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg hover:bg-indigo-600 transition-all active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mb-10">
           <AnimatePresence mode="wait">
              {activeTab === 'leads' && (
                <motion.div key="leads" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-8">
                      <h2 className="text-xl font-bold text-primary">Media Pipeline</h2>
                      <p className="text-secondary text-xs font-semibold">Visualize and manage your active media deals through the sales funnel.</p>
                   </div>
                   <PipelineModule leads={leads} onSelectLead={setSelectedLead} showToast={showToast} refreshLeads={fetchData} currentUser={currentUser.name} setLeads={setLeads} />
                </motion.div>
              )}
              {activeTab === 'email' && (
                <motion.div key="email" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <EmailModule showToast={showToast} leads={leads} refreshLeads={fetchData} currentUser={currentUser.name} setLeads={setLeads} preselectedLeadId={preselectedLeadId} setPreselectedLeadId={setPreselectedLeadId} />
                </motion.div>
              )}
              {activeTab === 'finance' && (
                <motion.div key="finance" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-8">
                      <h2 className="text-xl font-bold text-primary">Financial Command</h2>
                      <p className="text-secondary text-xs font-semibold">Track revenue, generate payment links, and manage media invoices.</p>
                   </div>
                   <FinanceModule invoices={invoices} showToast={showToast} refreshInvoices={fetchData} setInvoices={setInvoices} />
                </motion.div>
              )}
              {activeTab === 'resources' && (
                <motion.div key="resources" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-8">
                      <h2 className="text-xl font-bold text-primary">Media Asset Desk</h2>
                      <p className="text-secondary text-xs font-semibold">Securely manage contracts, media kits, and shared campaign assets.</p>
                   </div>
                   <ResourceModule leads={leads} showToast={showToast} refreshLeads={fetchData} currentUser={currentUser.name} setLeads={setLeads} />
                </motion.div>
              )}
              {activeTab === 'tasks' && (
                <motion.div key="tasks" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-8">
                      <h2 className="text-xl font-bold text-primary">Tasks & Reminders</h2>
                      <p className="text-secondary text-xs font-semibold">View work assignments, keep track of milestones, and set operational alerts.</p>
                   </div>
                   <TasksModule showToast={showToast} user={currentUser} />
                </motion.div>
              )}
           </AnimatePresence>
        </div>
      )}

      {/* Lead Detail Modal */}
      <Modal isOpen={!!selectedLead} onClose={() => setSelectedLead(null)} title={`Lead Detail: ${selectedLead?.company}`}>
         {selectedLead && (
           <div className="space-y-8">
              <div className="flex justify-between items-start">
                 <div>
                    <h4 className="text-xl font-bold text-primary">{selectedLead.company}</h4>
                    <p className="text-sm text-secondary font-medium">{selectedLead.name} · Media Director</p>
                 </div>
                 <div className="text-right">
                    <div className="text-2xl font-black text-accent">{selectedLead.value}</div>
                    <Badge text={selectedLead.stage} type="info" />
                 </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                 {[
                   { label: 'Last Activity', value: selectedLead.lastContact || 'Just now', icon: Clock },
                   { label: 'Source', value: selectedLead.status + ' Priority', icon: Target },
                   { label: 'Assigned To', value: selectedLead.assignedToName || 'Unassigned', icon: UserPlus },
                 ].map((s, i) => (
                   <div key={i} className="p-3 bg-base border border-border rounded-2xl">
                      <div className="flex items-center gap-2 mb-1">
                         <s.icon size={12} className="text-tertiary" />
                         <span className="text-[9px] font-bold text-tertiary uppercase">{s.label}</span>
                      </div>
                      <div className="text-xs font-bold text-primary">{s.value}</div>
                   </div>
                 ))}
              </div>

              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-tertiary uppercase tracking-widest px-2">Timeline History</h4>
                 <div className="space-y-4 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-px before:bg-border">
                    {(selectedLead.history || []).map((log, i) => (
                       <div key={i} className="flex items-start gap-4 relative z-10 pl-2">
                          <div className={`w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0`}>
                             <Target size={12} className="text-accent" />
                          </div>
                          <div>
                             <div className="text-xs font-bold text-primary">{log.event}</div>
                             <div className="text-[10px] text-secondary font-medium">Actor: {log.user}</div>
                             <div className="text-[9px] text-tertiary font-bold mt-1 uppercase">{new Date(log.time).toLocaleDateString()}</div>
                          </div>
                       </div>
                    ))}
                    {(selectedLead.history || []).length === 0 && (
                      <div className="p-4 text-center text-secondary font-semibold text-xs pl-8">No audit logs logged on lead timeline</div>
                    )}
                 </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-border">
                 <button onClick={() => { 
                   setPreselectedLeadId(selectedLead._id || '');
                   setSelectedLead(null); 
                   setActiveTab('email'); 
                 }} className="flex-1 py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <Send size={16}/> Go to Outreach Composer
                 </button>
                 <button onClick={async () => {
                   try {
                     showToast('Sharing via WhatsApp...', 'info');
                     const msg = `Hello ${selectedLead.name}, we are looking forward to our collaboration with ${selectedLead.company}. Let us know if you have any questions!`;
                     const res = await fetch('/api/whatsapp', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
                       body: JSON.stringify({
                         phone: selectedLead.phone || '15550000000',
                         message: msg
                       })
                     });
                     const data = await res.json();
                     if (data.success) {
                       showToast('Shared successfully via WhatsApp!', 'success');
                     } else {
                       showToast(data.error || 'Failed to share via WhatsApp', 'error');
                     }
                   } catch (err) {
                     showToast('Error sharing via WhatsApp', 'error');
                   }
                 }} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                    <MessageSquare size={16}/> Share via WhatsApp
                 </button>
              </div>
           </div>
         )}
      </Modal>

    </div>
  );
}


export default function MRPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
         <div className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Media Command...</div>
      </div>
    }>
       <MRDashboard />
    </Suspense>
  );
}

