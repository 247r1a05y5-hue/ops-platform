'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { 
  Target, Mail, Plus, Send, AlertCircle, BarChart3, 
  TrendingUp, ShieldAlert, CheckCircle, Clock, Zap, 
  Award, Sparkles, Megaphone, Eye, MousePointer, 
  Lock, ArrowUpRight 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerActivityLog } from '@/utils/activity';

// --- Reusable UI Elements ---
const Card = ({ children, className = "", delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) => {
  const hasBg = className.split(' ').some(c => c.startsWith('bg-'));
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "circOut" }}
      className={`${hasBg ? "" : "bg-surface"} border border-border rounded-2xl shadow-sm p-6 hover:shadow-md hover:border-accent/30 transition-all ${className}`}
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

function MarketingDashboard() {
  const { showToast } = useUI();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'campaigns' | 'analytics' | 'approvals' | 'restricted'>('campaigns');

  useEffect(() => {
    if (tab && ['campaigns', 'analytics', 'approvals', 'restricted'].includes(tab)) {
      setActiveTab(tab as any);
    } else {
      setActiveTab('campaigns');
    }
  }, [tab]);
  
  const [proposals, setProposals] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [loading, setLoading] = useState(true);

  const [newCampName, setNewCampName] = useState('');
  const [newCampType, setNewCampType] = useState('Email Campaign');
  const [newCampTarget, setNewCampTarget] = useState('');

  const [newPropTitle, setNewPropTitle] = useState('');
  const [newPropType, setNewPropType] = useState('Email Campaign');

  const fetchData = async () => {
    try {
      const [leadsRes, propRes, seqRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/leads/approval'),
        fetch('/api/sequences')
      ]);

      let activeLeads: any[] = [];
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        if (leadsData.success) {
          activeLeads = leadsData.leads || [];
          setLeads(activeLeads);
        }
      }

      let activeProps: any[] = [];
      if (propRes.ok) {
        const propData = await propRes.json();
        if (propData.success) {
          activeProps = propData.requests.map((r: any) => ({
            id: r._id,
            title: r.reason || `Approval for ${r.leadId?.company || r.leadId?.name || 'Deal'}`,
            type: 'Strategy Alignment',
            manager: r.reviewedByName || 'Pending Review',
            status: r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending',
            date: new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
          }));
          setProposals(activeProps);
        }
      }

      if (seqRes.ok) {
        const seqData = await seqRes.json();
        if (seqData.success) {
          const mapped = seqData.sequences.map((seq: any) => {
            const enrolledLeads = activeLeads.filter((l: any) => l.activeSequence === seq.name);
            const sent = enrolledLeads.length;
            let clicks = 0;
            enrolledLeads.forEach((l: any) => {
              l.emails?.forEach((e: any) => {
                clicks += (e.clicks || 0);
              });
            });
            const conversion = sent > 0 ? `${Math.round((clicks / sent) * 100)}%` : '0%';
            return {
              id: seq._id,
              name: seq.name,
              status: 'Active',
              target: 'All Leads',
              sent: sent,
              clicks: clicks,
              conversion: conversion,
              type: 'Email Campaign'
            };
          });
          setCampaigns(mapped);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Error syncing desk with database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName || !newCampTarget) {
      showToast('Please fill out all campaign fields', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName,
          steps: [
            {
              stepNumber: 1,
              delayDays: 0,
              subject: `Introduction to ${newCampTarget}`,
              body: `Welcome to the ${newCampName} outreach sequence targeting ${newCampTarget}.`
            }
          ]
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Campaign ${newCampName} provisioned!`, 'success');
        triggerActivityLog('task_creation', `Provisioned new campaign: "${newCampName}" for ${newCampTarget}`, {
          campaignId: data.sequence._id,
          target: newCampTarget,
          type: newCampType
        }).catch(console.error);
        fetchData();
        setNewCampName('');
        setNewCampTarget('');
      } else {
        showToast(data.error || 'Failed to create campaign', 'error');
      }
    } catch (err) {
      showToast('Failed to create campaign', 'error');
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropTitle) {
      showToast('Please enter a proposal title', 'warning');
      return;
    }
    if (!selectedLeadId) {
      showToast('Please select a CRM lead to link to this proposal', 'warning');
      return;
    }
    try {
      const targetLead = leads.find(l => l._id === selectedLeadId);
      const res = await fetch('/api/leads/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLeadId,
          reason: newPropTitle,
          dealValue: targetLead?.value || '$25,000'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Alignment proposal "${newPropTitle}" submitted to Manager!`, 'success');
        fetchData();
        setNewPropTitle('');
        setSelectedLeadId('');
      } else {
        showToast(data.error || 'Failed to submit proposal', 'error');
      }
    } catch (err) {
      showToast('Failed to submit proposal', 'error');
    }
  };

  const totalLeads = leads.length;
  const totalEmails = leads.reduce((acc, l) => acc + (l.emails?.length || 0), 0);
  const totalClicks = leads.reduce((acc, l) => acc + (l.emails?.reduce((s, e) => s + (e.clicks || 0), 0) || 0), 0);
  
  const totalImpressions = (totalEmails + totalLeads * 3).toLocaleString();
  const conversionRate = totalLeads > 0 
    ? (leads.filter((l: any) => ['Closing', 'Proposal', 'Negotiation'].includes(l.stage)).length / totalLeads * 100).toFixed(1) + '%'
    : '0.0%';
  const linkClicks = totalClicks.toString();
  const strategyAlignment = proposals.length > 0
    ? (proposals.filter(p => p.status === 'Approved').length / proposals.length * 100).toFixed(1) + '%'
    : '100.0%';

  const STAGE_LABELS = ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'];
  const barData = STAGE_LABELS.map(s => {
    const count = leads.filter(l => l.stage === s).length;
    const maxCount = Math.max(...STAGE_LABELS.map(st => leads.filter(l => l.stage === st).length), 1);
    return Math.round((count / maxCount) * 100);
  });

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 min-h-screen bg-base text-primary">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }} 
        animate={{ opacity: 1, x: 0 }} 
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-border/40 pb-6"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Badge text="Marketing Representative" type="info" />
             <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
             <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none">Campaign Console</span>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Marketing Desk</h1>
          <p className="text-secondary text-sm mt-1 font-medium font-sans">Manage active outreach campaigns, monitor conversion analytics, and align strategies.</p>
        </div>
        
        {/* Quick Campaign Metrics (Fills Right Side Empty Space Beautifully) */}
        <div className="flex gap-4 items-center shrink-0">
          <div className="px-4 py-3 bg-surface border border-border/80 rounded-2xl flex flex-col items-end shadow-sm">
             <span className="text-[9px] font-bold uppercase tracking-wider text-tertiary">Active Outreach</span>
             <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">3 Sequences</span>
          </div>
          <div className="px-4 py-3 bg-surface border border-border/80 rounded-2xl flex flex-col items-end shadow-sm">
             <span className="text-[9px] font-bold uppercase tracking-wider text-tertiary">Strategy Status</span>
             <span className="text-sm font-extrabold text-emerald-500">Aligned (100%)</span>
          </div>
        </div>
      </motion.div>

      {/* Navigation Tabs */}
      <div className="flex bg-surface border border-border rounded-xl p-1 mb-8 shadow-inner max-w-xl">
        {[
          { id: 'campaigns', name: 'Outreach & Campaigns' },
          { id: 'analytics', name: 'Analytics & ROI' },
          { id: 'approvals', name: 'Strategy Alignment' },
          { id: 'restricted', name: '🔒 Restricted Systems' }
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all capitalize whitespace-nowrap px-3 ${activeTab === tab.id ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: CAMPAIGNS & OUTREACH */}
        {activeTab === 'campaigns' && (
          <motion.div key="campaigns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                <Megaphone size={20} className="text-accent" />
                Active Promotions & Activities
              </h2>
              <div className="space-y-4">
                {campaigns.map((camp, i) => (
                  <Card key={camp.id} className="p-5 relative overflow-hidden group">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-tertiary uppercase">{camp.id}</span>
                          <Badge text={camp.status} type={camp.status === 'Active' ? 'success' : camp.status === 'Paused' ? 'warning' : 'default'} />
                          <span className="text-[10px] text-tertiary font-bold">• {camp.type}</span>
                        </div>
                        <h3 className="text-lg font-bold text-primary group-hover:text-accent transition-colors mb-2">{camp.name}</h3>
                        <p className="text-xs text-secondary font-medium">Target Demographics: <span className="text-primary font-bold">{camp.target}</span></p>
                      </div>
                      
                      <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6 shrink-0">
                        <div className="text-center">
                          <div className="text-[10px] font-black text-tertiary uppercase mb-1">Reach</div>
                          <div className="text-base font-bold text-primary">{camp.sent.toLocaleString()}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] font-black text-tertiary uppercase mb-1">Clicks</div>
                          <div className="text-base font-bold text-accent">{camp.clicks}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] font-black text-tertiary uppercase mb-1">Conv. Rate</div>
                          <div className="text-base font-bold text-emerald-500">{camp.conversion}</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <Card>
                <h3 className="text-xs font-black text-tertiary uppercase tracking-widest mb-4">Provision New Campaign</h3>
                <form onSubmit={handleCreateCampaign} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Campaign Name</label>
                    <input 
                      type="text" 
                      value={newCampName}
                      onChange={e => setNewCampName(e.target.value)}
                      placeholder="e.g. Developer Beta Launch"
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Activity Type</label>
                    <select 
                      value={newCampType}
                      onChange={e => setNewCampType(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    >
                      <option>Email Campaign</option>
                      <option>Promotions</option>
                      <option>Outreach Activities</option>
                      <option>Social Media Blitz</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Target Demographics</label>
                    <input 
                      type="text" 
                      value={newCampTarget}
                      onChange={e => setNewCampTarget(e.target.value)}
                      placeholder="e.g. CTOs and Developers"
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <button type="submit" className="w-full py-3 bg-accent text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-accent/20">
                    <Plus size={14} /> Launch Promotion
                  </button>
                </form>
              </Card>

              <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
                <div className="flex items-center gap-2 text-indigo-500 mb-3">
                  <Zap size={16} />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Outreach Automation</h4>
                </div>
                <p className="text-[11px] text-secondary leading-relaxed font-semibold">Your trackable outbox links are actively monitoring conversion. Outreach health parameters are operating at 99.4% yield.</p>
              </Card>
            </div>
          </motion.div>
        )}

        {/* TAB 2: ANALYTICS */}
        {activeTab === 'analytics' && (
          <motion.div key="analytics" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            <h2 className="text-xl font-bold text-primary flex items-center gap-2">
              <BarChart3 size={20} className="text-accent" />
              Marketing ROI & Analytics
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { title: 'Total Impressions', value: totalImpressions, icon: Eye, trend: '+14.2%', color: 'text-blue-500' },
                { title: 'Conversion Rate', value: conversionRate, icon: TrendingUp, trend: '+2.8%', color: 'text-emerald-500' },
                { title: 'Link Clicks', value: linkClicks, icon: MousePointer, trend: '+11.5%', color: 'text-indigo-500' },
                { title: 'Strategy Alignment', value: strategyAlignment, icon: Award, trend: 'Optimal', color: 'text-accent' },
              ].map((s, i) => (
                <Card key={i}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-tertiary uppercase">{s.title}</span>
                    <s.icon size={16} className={s.color} />
                  </div>
                  <div className="text-2xl font-black text-primary mb-2">{s.value}</div>
                  <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{s.trend} from last sprint</span>
                </Card>
              ))}
            </div>

            <Card>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold">Campaign Performance Matrix</h3>
                  <p className="text-xs text-secondary font-medium">Visual conversion speed of marketing outreach channels.</p>
                </div>
                <Badge text="Live Analytics feed" type="info" />
              </div>
              <div className="h-64 flex items-end gap-2 px-2 pb-2">
                {barData.map((h, i) => (
                  <div key={i} className="flex-1 h-full flex flex-col justify-end items-center">
                    <div className="w-full h-48 flex items-end">
                      <motion.div 
                        initial={{ height: 0 }} 
                        animate={{ height: `${h}%` }} 
                        transition={{ delay: i * 0.05, duration: 0.8 }}
                        className="w-full bg-accent/20 rounded-t-lg group relative hover:bg-accent transition-all cursor-pointer border border-accent/10"
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20">
                          {h}% Yield
                        </div>
                      </motion.div>
                    </div>
                    <span className="text-[8px] font-bold text-tertiary mt-2 truncate w-full text-center">{STAGE_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* TAB 3: STRATEGY ALIGNMENT & APPROVALS */}
        {activeTab === 'approvals' && (
          <motion.div key="approvals" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                <CheckCircle size={20} className="text-accent" />
                Manager Approvals & Sync
              </h2>
              
              <div className="space-y-4">
                {proposals.map((prop, i) => (
                  <Card key={prop.id} className="p-5 group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-tertiary uppercase">{prop.id}</span>
                          <Badge text={prop.status} type={prop.status === 'Approved' ? 'success' : prop.status === 'Rejected' ? 'danger' : 'warning'} />
                          <span className="text-[10px] text-tertiary font-bold">• Submitted {prop.date}</span>
                        </div>
                        <h3 className="text-sm font-bold text-primary mb-1.5">{prop.title}</h3>
                        <p className="text-xs text-secondary font-medium">Authorized Manager: <span className="text-primary font-bold">{prop.manager}</span></p>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 border-border pt-3 md:pt-0">
                        {prop.status === 'Approved' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                            <CheckCircle size={14} /> Ready to Deploy
                          </div>
                        ) : prop.status === 'Rejected' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                            <AlertCircle size={14} /> Rejected
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500">
                            <Clock size={14} className="animate-spin" /> Pending Review
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <Card>
                <h3 className="text-xs font-black text-tertiary uppercase tracking-widest mb-4">Submit New Strategy Proposal</h3>
                <form onSubmit={handleSubmitProposal} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Strategy / Campaign Title</label>
                    <input 
                      type="text" 
                      value={newPropTitle}
                      onChange={e => setNewPropTitle(e.target.value)}
                      placeholder="e.g. Q3 Re-engagement discounts"
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Associated CRM Lead</label>
                    <select
                      value={selectedLeadId}
                      onChange={e => setSelectedLeadId(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    >
                      <option value="">Select a Lead...</option>
                      {leads.map(l => (
                        <option key={l._id} value={l._id}>{l.company || l.name} ({l.value || '$0'})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Alignment Manager</label>
                    <select className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent">
                      <option>Maya Thompson (Operations Director)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-tertiary uppercase block mb-1.5">Marketing Category</label>
                    <select 
                      value={newPropType}
                      onChange={e => setNewPropType(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs font-bold text-primary outline-none focus:border-accent"
                    >
                      <option>Email Campaign</option>
                      <option>Discount Code</option>
                      <option>Collateral Sharing</option>
                      <option>Strategy Launch</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-3 bg-accent text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-accent/20">
                    <Send size={14} /> Submit Alignment Request
                  </button>
                </form>
              </Card>
            </div>
          </motion.div>
        )}

        {/* TAB 4: RESTRICTED ACCESS SYSTEM */}
        {activeTab === 'restricted' && (
          <motion.div key="restricted" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center p-8 bg-red-500/5 border border-red-500/20 rounded-3xl mb-8">
              <ShieldAlert size={48} className="mx-auto text-red-500 mb-4 animate-bounce" />
              <h2 className="text-xl font-bold text-primary mb-2">Role Isolation Controls Active</h2>
              <p className="text-xs text-secondary font-medium leading-relaxed">
                As a Marketing Representative, your operational access limits are active. External systems outside campaign marketing, alignment, and promotional outreach are secured for data protection.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { name: 'Core Audit & Activity Ledger', desc: 'Organizational access audit trail databases', role: 'Requires Admin/Manager Privilege' },
                { name: 'System Integrations Desk', desc: 'Production Brevo SMTP credentials and Stripe webhook configurations', role: 'Requires Admin Privilege' },
                { name: 'Financial Pipeline Invoicing Hub', desc: 'Direct corporate invoice creation and payment link logs', role: 'Requires Media Rep/Manager Privilege' },
                { name: 'Workspace Security Settings', desc: 'Session timeout boundaries and organizational token limits', role: 'Requires Admin Privilege' },
              ].map((sys, i) => (
                <div key={i} className="flex justify-between items-center p-5 bg-surface border border-border/80 rounded-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-base/40 opacity-70"></div>
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center text-red-500 shrink-0">
                      <Lock size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-primary/80 group-hover:text-primary transition-colors flex items-center gap-2">
                        {sys.name}
                        <span className="text-[9px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded uppercase border border-red-500/20">Locked</span>
                      </h4>
                      <p className="text-[11px] text-secondary/80 font-medium mt-1">{sys.desc}</p>
                    </div>
                  </div>
                  <div className="relative z-10 text-[9px] font-bold text-secondary uppercase bg-base border border-border/80 px-2 py-1 rounded">
                    {sys.role}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}




export default function MarketingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
         <div className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Marketing Desk...</div>
      </div>
    }>
       <MarketingDashboard />
    </Suspense>
  );
}
