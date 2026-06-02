'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { 
  Users, Calendar, Plus, Bell, Sparkles, Zap,
  Send, FileText, Command, ChevronRight, ArrowUpRight,
  Shield, ShieldCheck, Download, Layers, Trash2, Clock,
  Activity, Search, Filter, CheckCircle, X, DollarSign, Target, Mail, Phone, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SharedSettingsModule from '@/components/SharedSettingsModule';
import { triggerActivityLog } from '@/utils/activity';

// --- Reusable Components (Admin Style) ---

const Card = ({ children, className = "", delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) => {
  const hasBg = className.split(' ').some(c => c.startsWith('bg-'));
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`${hasBg ? "" : "bg-surface"} border border-border rounded-2xl shadow-sm p-6 hover:shadow-md transition-all ${className}`}
    >
      {children}
    </motion.div>
  );
};

const Badge = ({ text, type = "default" }: { text: string, type?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const styles = {
    default: "bg-base text-secondary border-border",
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400",
    warning: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400",
    danger: "bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400",
    info: "bg-accent/10 text-accent border-accent/20 dark:bg-accent/20 dark:text-indigo-300"
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${styles[type]}`}>
      {text}
    </span>
  );
};

// --- Interfaces & Mock Data Types ---

interface ManagerEmployee {
  name: string;
  email: string;
  role: string;
  status: 'Online' | 'Away' | 'Offline';
  performance: string;
  workload: string;
  attendance: string;
  color: string;
  avatar: string;
  activeTasks: number;
}

interface TaskLog {
  time: string;
  author: string;
  note: string;
}

interface ManagerTask {
  id: string;
  title: string;
  desc: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  owner: string;
  deadline: string;
  status: 'To Do' | 'In Progress' | 'Under Review' | 'Done' | 'Blocked';
  progress: number;
  subtasks: { title: string; done: boolean }[];
  logs: TaskLog[];
}

interface LeadItem {
  id: string;
  name: string;
  company: string;
  value: string;
  status: 'Hot' | 'Warm' | 'Cold';
  stage: 'Qualified' | 'Sequence Active' | 'Proposal Sent' | 'Closed Won';
  source: string;
  email: string;
  communications: { date: string; subject: string; sender: string }[];
}

interface InvoiceItem {
  id: string;
  client: string;
  amount: string;
  due: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  remindersSent: number;
}

// --- Sub-Modules ---

const TeamModule = ({ employees, onToggleStatus, onManageRoles }: { employees: ManagerEmployee[]; onToggleStatus: (index: number) => void; onManageRoles: () => void }) => (
  <div className="space-y-6">
    <div className="flex justify-between items-end mb-2">
       <div>
          <h2 className="text-xl font-bold text-primary">Team Velocity</h2>
          <p className="text-secondary text-xs">Real-time personnel engagement and performance metrics.</p>
       </div>
       <button onClick={onManageRoles} className="text-xs font-bold text-accent flex items-center gap-1 hover:underline cursor-pointer">
          Manage Clearance & Roles <ArrowUpRight size={14}/>
       </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {employees.map((emp, i) => (
        <Card key={i} delay={i * 0.05} className="group border-border/60">
           <div className="flex items-center gap-4 mb-6">
              <div className={`w-12 h-12 rounded-xl ${emp.color} text-white flex items-center justify-center text-sm font-bold shadow-sm group-hover:scale-105 transition-transform`}>
                 {emp.avatar}
              </div>
              <div className="flex-1">
                 <h4 className="text-sm font-bold text-primary">{emp.name}</h4>
                 <p className="text-[10px] font-medium text-secondary uppercase tracking-widest">{emp.role}</p>
              </div>
              <div className="text-right">
                 <button onClick={() => onToggleStatus(i)} className="flex items-center gap-1.5 justify-end mb-1 group/status">
                    <div className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Online' ? 'bg-emerald-500' : emp.status === 'Away' ? 'bg-orange-500' : 'bg-red-500'} animate-pulse`} />
                    <span className="text-[10px] font-bold uppercase text-secondary group-hover/status:text-accent transition-colors">{emp.status}</span>
                 </button>
                 <span className="text-[9px] text-tertiary">Active Tasks: {emp.activeTasks}</span>
              </div>
           </div>
           <div className="space-y-3">
              <div className="flex justify-between items-end">
                 <span className="text-[10px] font-bold text-tertiary uppercase">Efficiency Rating</span>
                 <span className="text-xs font-bold text-primary">{emp.performance}</span>
              </div>
              <div className="w-full h-1.5 bg-base rounded-full overflow-hidden">
                 <motion.div initial={{ width: 0 }} animate={{ width: emp.performance }} transition={{ duration: 1, delay: 0.3 }} className="h-full bg-accent rounded-full"></motion.div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-border mt-3">
                 <span className="text-[10px] font-bold text-secondary uppercase">Workload: <span className="text-primary">{emp.workload}</span></span>
                 <span className="text-[10px] font-bold text-secondary uppercase">Attendance: <span className="text-emerald-500 font-extrabold">{emp.attendance}</span></span>
              </div>
           </div>
        </Card>
      ))}
    </div>
  </div>
);

// --- Main Manager Dashboard Shell ---

function ManagerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useUI();
  
  const [activeTab, setActiveTab] = useState<'team' | 'tasks' | 'approvals' | 'progress' | 'crm' | 'invoices' | 'directory' | 'communication' | 'reports' | 'settings'>('team');

  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (tab && ['team', 'tasks', 'approvals', 'progress', 'crm', 'invoices', 'directory', 'communication', 'reports', 'settings'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  // Personnel State
  const [employees, setEmployees] = useState<ManagerEmployee[]>([
    { name: 'Mateo Rivera', email: 'mateo@opsplatform.io', role: 'Sr. Logistics Lead', status: 'Online', performance: '94%', workload: 'High', attendance: '98%', color: 'bg-indigo-500', avatar: 'MR', activeTasks: 2 },
    { name: 'Sarah Chen', email: 'sarah@opsplatform.io', role: 'Ops Architect', status: 'Away', performance: '88%', workload: 'Optimal', attendance: '96%', color: 'bg-emerald-500', avatar: 'SC', activeTasks: 1 },
    { name: 'Priya Patel', email: 'priya@opsplatform.io', role: 'Operations Staff', status: 'Online', performance: '98%', workload: 'Balanced', attendance: '99%', color: 'bg-accent', avatar: 'PP', activeTasks: 2 },
    { name: 'Jordan Lee', email: 'jordan@opsplatform.io', role: 'Marketing Representative', status: 'Online', performance: '91%', workload: 'Optimal', attendance: '95%', color: 'bg-orange-500', avatar: 'JL', activeTasks: 1 },
    { name: 'Elena Rodriguez', email: 'elena@opsplatform.io', role: 'Compliance Officer', status: 'Offline', performance: '97%', workload: 'Low', attendance: '99%', color: 'bg-rose-500', avatar: 'ER', activeTasks: 0 },
  ]);

  const toggleStatus = (idx: number) => {
    const emp = employees[idx];
    setEmployees(employees.map((e, i) => i === idx ? { ...e, status: e.status === 'Online' ? 'Offline' : 'Online' } : e));
    showToast('Employee check-in status toggled', 'info');
    triggerActivityLog('workflow_action', `Toggled check-in status for employee ${emp.name} to ${emp.status === 'Online' ? 'Offline' : 'Online'}`).catch(console.error);
  };

  // Strategic Tasks / Initiatives State
  const [tasks, setTasks] = useState<ManagerTask[]>([
    { 
      id: 'SYS-442', 
      title: 'Q3 Inventory Recalibration', 
      desc: 'Formulate, validate, and audit Q3 operational logs and warehouse distribution bypass maps.',
      priority: 'High', 
      owner: 'Mateo Rivera', 
      deadline: 'May 15', 
      progress: 65, 
      status: 'In Progress',
      subtasks: [
        { title: 'Bypass map design outlines', done: true },
        { title: 'Live load simulation validation', done: false }
      ],
      logs: [
        { time: '09:00 AM', author: 'Mateo Rivera', note: 'Outline bypass configurations finalized.' }
      ]
    },
    { 
      id: 'SYS-501', 
      title: 'Cloudflare R2 Migration', 
      desc: 'Migrate active video pipelines and sequence assets to cloud flare R2 storage buckets to improve throughput SLA.',
      priority: 'Critical', 
      owner: 'Sarah Chen', 
      deadline: 'May 12', 
      progress: 88, 
      status: 'Under Review',
      subtasks: [
        { title: 'Provision AWS cross-bucket nodes', done: true },
        { title: 'Configure CDN cache settings', done: true },
        { title: 'Final egress verification sprint', done: false }
      ],
      logs: [
        { time: 'Yesterday', author: 'Sarah Chen', note: 'Provisioned cross-bucket nodes. Average latency dropped by 45ms.' }
      ]
    },
    { 
      id: 'SYS-392', 
      title: 'Automated Lead Scoring V2', 
      desc: 'Deploy predictive sequence rating matrices inside campaign lead modules.',
      priority: 'Medium', 
      owner: 'Jordan Lee', 
      deadline: 'May 20', 
      progress: 42, 
      status: 'In Progress',
      subtasks: [
        { title: 'Draft scoring algorithms', done: true },
        { title: 'Test routing endpoints', done: false }
      ],
      logs: []
    },
    { 
      id: 'SYS-101', 
      title: 'Update media assets for Nova Retail', 
      desc: 'Compress and upload all high-resolution promotional materials for Nova Retail campaign.',
      priority: 'High', 
      owner: 'Priya Patel', 
      deadline: 'Today', 
      progress: 65, 
      status: 'In Progress',
      subtasks: [
        { title: 'Compress sequences', done: true },
        { title: 'CDNs cache verify', done: false }
      ],
      logs: [
        { time: 'Today 09:30 AM', author: 'Priya Patel', note: 'Compressed raw 4K visual sequences successfully.' }
      ]
    }
  ]);

  // Task Filter State
  const [filterOwner, setFilterOwner] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Task to View/Edit details
  const [selectedTask, setSelectedTask] = useState<ManagerTask | null>(null);
  
  // Edit Form State inside modal
  const [editOwner, setEditOwner] = useState<string>('');
  const [editPriority, setEditPriority] = useState<ManagerTask['priority']>('Medium');
  const [editStatus, setEditStatus] = useState<ManagerTask['status']>('In Progress');
  const [editDeadline, setEditDeadline] = useState<string>('');

  const handleOpenTask = (task: ManagerTask) => {
    setSelectedTask(task);
    setEditOwner(task.owner);
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDeadline(task.deadline);
  };

  const handleSaveTaskDetails = () => {
    if (!selectedTask) return;
    const isCompleted = editStatus === 'Done';
    const computedProgress = isCompleted ? 100 : selectedTask.progress;
    
    const updated: ManagerTask = {
      ...selectedTask,
      owner: editOwner,
      priority: editPriority,
      status: editStatus,
      deadline: editDeadline,
      progress: computedProgress
    };

    setTasks(tasks.map(t => t.id === selectedTask.id ? updated : t));
    setSelectedTask(null);
    showToast(`Task ${selectedTask.id} parameters successfully synced!`, 'success');
    triggerActivityLog('task_update', `Updated initiative parameters for task ${selectedTask.id} (${editStatus})`, {
      taskId: selectedTask.id,
      status: editStatus,
      priority: editPriority
    }).catch(console.error);
  };

  // Leads State
  const [leads, setLeads] = useState<LeadItem[]>([
    { 
      id: 'L-9201', 
      name: 'Arthur Pendragon', 
      company: 'Camelot Retail', 
      value: '$24,500', 
      status: 'Hot', 
      stage: 'Proposal Sent', 
      source: 'Direct Outreach', 
      email: 'arthur@camelot.co',
      communications: [
        { date: 'May 10', subject: 'Camelot Integration Proposal V2', sender: 'Jordan Lee (MR)' },
        { date: 'May 08', subject: 'Inbound Request for R2 Storage Metrics', sender: 'Arthur Pendragon' }
      ]
    },
    { 
      id: 'L-8832', 
      name: 'Morgana Le Fay', 
      company: 'Avalon Tech', 
      value: '$18,000', 
      status: 'Warm', 
      stage: 'Sequence Active', 
      source: 'Cold Sequence', 
      email: 'morgana@avalon.io',
      communications: [
        { date: 'May 09', subject: 'Automating your operational pipelines', sender: 'Jordan Lee (MR)' }
      ]
    },
    { 
      id: 'L-7741', 
      name: 'Lancelot du Lac', 
      company: 'Logres Logistics', 
      value: '$45,000', 
      status: 'Hot', 
      stage: 'Qualified', 
      source: 'Direct Inbound', 
      email: 'lancelot@logres.com',
      communications: []
    }
  ]);

  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);

  // Invoices State
  const [invoices, setInvoices] = useState<InvoiceItem[]>([
    { id: 'INV-8820', client: 'Camelot Retail', amount: '$12,250.00', due: 'May 20, 2026', status: 'Pending', remindersSent: 0 },
    { id: 'INV-8819', client: 'Nova Retail Corp', amount: '$8,400.00', due: 'May 14, 2026', status: 'Overdue', remindersSent: 1 },
    { id: 'INV-8818', client: 'Goliath Logistics', amount: '$34,500.00', due: 'May 08, 2026', status: 'Paid', remindersSent: 0 },
  ]);

  const handleApproveInvoice = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: 'Paid' } : inv));
    showToast(`Invoice ${id} approved and routed for processing!`, 'success');
    triggerActivityLog('workflow_action', `Approved invoice ${id} and routed for processing`).catch(console.error);
  };

  const handleSendReminder = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, remindersSent: inv.remindersSent + 1 } : inv));
    showToast(`WhatsApp & Email reminder dispatched for invoice ${id}`, 'info');
    triggerActivityLog('workflow_action', `Dispatched billing reminder for invoice ${id}`).catch(console.error);
  };

  // Task creation Modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [editingEmployees, setEditingEmployees] = useState<ManagerEmployee[]>([]);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [briefingStep, setBriefingStep] = useState(0);

  const handleGenerateBriefing = () => {
    setIsBriefingLoading(true);
    setShowBriefingModal(true);
    setBriefingStep(0);
    setTimeout(() => setBriefingStep(1), 600);
    setTimeout(() => setBriefingStep(2), 1200);
    setTimeout(() => setIsBriefingLoading(false), 1800);
  };

  const handleApplyBriefingDirective = () => {
    setDirectives(prev => [
      { user: 'Executive System', msg: '[APAC Cloudflare Sync] Reallocate Alex Johnson to assist Sarah Chen on APAC-West migration nodes.', time: 'Just now', priority: 'High' },
      ...prev
    ]);
    showToast('Briefing directive broadcasted to Department Hub!', 'success');
    triggerActivityLog('workflow_action', 'Broadcasted executive briefing directive: [APAC Cloudflare Sync]').catch(console.error);
    setShowBriefingModal(false);
  };

  useEffect(() => {
    if (showRolesModal) {
      setEditingEmployees(JSON.parse(JSON.stringify(employees)));
    }
  }, [showRolesModal, employees]);

  const handleUpdateRoles = (e: React.FormEvent) => {
    e.preventDefault();
    setEmployees(editingEmployees);
    showToast('Personnel roles and structural ranks updated successfully!', 'success');
    triggerActivityLog('workflow_action', 'Updated personnel roles and structural ranks').catch(console.error);
    setShowRolesModal(false);
  };

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [newTaskOwner, setNewTaskOwner] = useState('Priya Patel');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskDeadline) {
      showToast('Please fill out all task details', 'warning');
      return;
    }
    const nextId = `SYS-${Math.floor(100 + Math.random() * 900)}`;
    const newT: ManagerTask = {
      id: nextId,
      title: newTaskTitle,
      desc: newTaskDesc || 'Strategic operational directive.',
      priority: newTaskPriority,
      owner: newTaskOwner,
      deadline: newTaskDeadline,
      progress: 0,
      status: 'To Do',
      subtasks: [],
      logs: []
    };
    setTasks([newT, ...tasks]);
    
    // Increment assignee active tasks count
    setEmployees(employees.map(emp => emp.name === newTaskOwner ? { ...emp, activeTasks: emp.activeTasks + 1 } : emp));

    showToast(`New Initiative "${newTaskTitle}" deployed!`, 'success');
    triggerActivityLog('task_creation', `Deployed new strategic initiative "${newTaskTitle}" assigned to ${newTaskOwner}`, {
      taskId: nextId,
      owner: newTaskOwner,
      priority: newTaskPriority
    }).catch(console.error);
    
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDeadline('');
    setShowTaskModal(false);
  };

  // Approvals workflow State
  const [approvals, setApprovals] = useState([
    { id: 'REQ-1092', user: 'Mateo Rivera', type: 'Resource Allocation', detail: 'Requesting 40GB R2 Storage for Nova Retail media assets.', date: '2 hours ago', priority: 'High', status: 'Pending' },
    { id: 'REQ-1088', user: 'Priya Patel', type: 'System Access Override', detail: 'Elevated authorization requested to test bandwidth API parameters.', date: '3 hours ago', priority: 'Critical', status: 'Pending' },
    { id: 'REQ-1085', user: 'Sarah Chen', type: 'API Key Access', detail: 'Production access for Razorpay webhook integration.', date: '1 day ago', priority: 'Critical', status: 'Pending' },
  ]);

  const handleAuthorizeApproval = (id: string) => {
    const reqItem = approvals.find(a => a.id === id);
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'Authorized' } : a));
    showToast(`Request ${id} authorized successfully!`, 'success');
    triggerActivityLog('approval_approved', `Authorized request ${id} (${reqItem?.type || 'General Resource'})`).catch(console.error);
  };

  const handleDenyApproval = (id: string) => {
    const reqItem = approvals.find(a => a.id === id);
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'Denied' } : a));
    showToast(`Request ${id} denied`, 'error');
    triggerActivityLog('approval_rejected', `Denied request ${id} (${reqItem?.type || 'General Resource'})`).catch(console.error);
  };

  // Directives and Announcements State
  const [directives, setDirectives] = useState([
    { user: 'Maya Thompson', msg: 'The Q3 strategic roadmap has been uploaded to the shared repository. Please review by EOD.', time: '10 min ago', priority: 'High' },
    { user: 'System Bot', msg: 'Weekly performance reports are now available for all logistics leads.', time: '2 hours ago', priority: 'Normal' },
    { user: 'Elena Rodriguez', msg: 'Compliance audit for the Beacon project starts tomorrow. Ensure all documents are signed.', time: '5 hours ago', priority: 'Critical' },
  ]);

  const [newDirSubject, setNewDirSubject] = useState('');
  const [newDirMsg, setNewDirMsg] = useState('');
  const [newDirPriority, setNewDirPriority] = useState('Normal');

  const handleAddDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDirSubject || !newDirMsg) {
      showToast('Please enter both subject and message', 'warning');
      return;
    }
    const fullMsg = `[${newDirSubject}] ${newDirMsg}`;
    setDirectives(prev => [
      { user: 'Maya Thompson', msg: fullMsg, time: 'Just now', priority: newDirPriority },
      ...prev
    ]);
    showToast('Directive broadcasted successfully!', 'success');
    triggerActivityLog('workflow_action', `Broadcasted new operational directive: [${newDirSubject}]`).catch(console.error);
    setNewDirSubject('');
    setNewDirMsg('');
  };

  const handleAcknowledgeDirective = (index: number) => {
    setDirectives(prev => prev.filter((_, i) => i !== index));
    showToast('Directive archived', 'success');
  };

  // Simulated Live Team Chat State
  const [chatMessages, setChatMessages] = useState([
     { user: 'Sarah Chen', msg: 'Cloudflare R2 sync completed. Yield rate is operating optimally.', time: '10:42 AM', isSelf: false },
     { user: 'Priya Patel', msg: 'Updated raw visual files compressed by 45%. Uploading to Nova now.', time: '11:15 AM', isSelf: false },
     { user: 'Maya Thompson', msg: 'Outstanding. Please ensure Mateo is looped in for the validation.', time: '11:20 AM', isSelf: true },
     { user: 'Mateo Rivera', msg: 'Acknowledged. Standing by.', time: '11:22 AM', isSelf: false }
  ]);
  const [newChatMsg, setNewChatMsg] = useState('');

  const handleSendChatMsg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMsg.trim()) return;
    
    const userMsg = newChatMsg;
    setChatMessages(prev => [
      ...prev,
      { user: 'Maya Thompson', msg: userMsg, time: 'Just now', isSelf: true }
    ]);
    setNewChatMsg('');
    
    setTimeout(() => {
       const replies = [
          "On it, Maya! Task queue synced.",
          "Strategic directives acknowledged, proceeding now.",
          "I will verify the validation results by EOD.",
          "Understood. Initiating recalibration protocol."
       ];
       const names = ["Sarah Chen", "Priya Patel", "Mateo Rivera"];
       const randReply = replies[Math.floor(Math.random() * replies.length)];
       const randName = names[Math.floor(Math.random() * names.length)];
       
       setChatMessages(prev => [
          ...prev,
          { user: randName, msg: randReply, time: 'Just now', isSelf: false }
       ]);
       showToast(`New message from ${randName}`, 'info');
    }, 1200);
  };

  const handleDownloadCSV = (reportTitle: string) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (reportTitle.includes("Personnel Yield")) {
      csvContent += "Employee,Role,Efficiency,Workload,Attendance\n";
      employees.forEach(emp => {
        csvContent += `${emp.name},${emp.role},${emp.performance},${emp.workload},${emp.attendance}\n`;
      });
    } else if (reportTitle.includes("Resource Efficiency")) {
      csvContent += "Task ID,Title,Priority,Owner,Deadline,Progress,Status\n";
      tasks.forEach(t => {
        csvContent += `${t.id},${t.title},${t.priority},${t.owner},${t.deadline},${t.progress}%,${t.status}\n`;
      });
    } else {
      csvContent += "Directives,Broadcast Date,Priority\n";
      directives.forEach(d => {
        csvContent += `"${d.msg.replace(/"/g, '""')}",${d.time},${d.priority}\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportTitle.toLowerCase().replace(/ /g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Spreadsheet for ${reportTitle} successfully compiled!`, 'success');
    triggerActivityLog('export_csv', `Exported spreadsheet for ${reportTitle}`).catch(console.error);
  };

  // Perform dynamic filtering on Tasks list
  const filteredTasks = tasks.filter(task => {
    const matchesOwner = filterOwner === 'All' || task.owner === filterOwner;
    const matchesPriority = filterPriority === 'All' || task.priority === filterPriority;
    const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
    const matchesQuery = searchQuery === '' || 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesOwner && matchesPriority && matchesStatus && matchesQuery;
  });

  // Settings tab gets a full-page layout bypassing the two-column grid
  if (activeTab === 'settings') {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <SharedSettingsModule role="manager" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      
      {/* Header Info Section */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Badge text="Executive Mode" type="info" />
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none">Live System Feed</span>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Manager Command Panel</h1>
          <p className="text-secondary text-sm mt-1">Direct oversight of organizational velocity, project tasks, and lead status.</p>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="bg-surface border border-border p-3 rounded-xl flex items-center gap-4 shadow-sm">
              <div className="text-right border-r border-border pr-4">
                 <div className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none">System Health</div>
                 <div className="text-lg font-bold text-primary mt-1 leading-none">99.8%</div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Activity size={20} />
                 </div>
              </div>
           </div>
        </div>
      </motion.div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        
        {/* Left/Middle Column (Dynamic Content) */}
        <div className="xl:col-span-2 space-y-10">
           <AnimatePresence mode="wait">
              {activeTab === 'team' && (
                <motion.div key="team" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                   <TeamModule employees={employees} onManageRoles={() => setShowRolesModal(true)} onToggleStatus={toggleStatus} />
                </motion.div>
              )}
              
              {activeTab === 'tasks' && (
                <motion.div key="tasks" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
                  <div className="flex justify-between items-end mb-4 flex-wrap gap-4">
                     <div>
                        <h2 className="text-xl font-bold text-primary">Strategic Allocations</h2>
                        <p className="text-secondary text-xs">Manage cross-functional initiatives and project distribution.</p>
                     </div>
                     <button onClick={() => setShowTaskModal(true)} className="px-4 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-lg shadow-accent/20 active:scale-95">
                        <Plus size={14}/> Deploy Initiative
                     </button>
                  </div>

                  {/* Task Filter Controls */}
                  <div className="p-4 bg-surface border border-border rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                      <input 
                        type="text" 
                        placeholder="Search initiative..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-base border border-border rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-accent outline-none"
                      />
                    </div>
                    <div>
                      <select 
                        value={filterOwner} 
                        onChange={e => setFilterOwner(e.target.value)}
                        className="w-full bg-base border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-accent outline-none"
                      >
                        <option value="All">All Assignees</option>
                        {employees.map(emp => (
                          <option key={emp.name} value={emp.name}>{emp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select 
                        value={filterPriority} 
                        onChange={e => setFilterPriority(e.target.value)}
                        className="w-full bg-base border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-accent outline-none"
                      >
                        <option value="All">All Priorities</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <select 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                        className="w-full bg-base border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-accent outline-none"
                      >
                        <option value="All">All Statuses</option>
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Done">Done</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                     {filteredTasks.length > 0 ? filteredTasks.map((t, i) => (
                       <div key={t.id} onClick={() => handleOpenTask(t)} className="p-5 bg-surface border border-border rounded-2xl hover:border-accent/40 group cursor-pointer transition-all">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                             <div className="flex items-start gap-5">
                                <div className="w-12 h-12 rounded-xl bg-base border border-border flex flex-col items-center justify-center shrink-0 group-hover:bg-accent/5 transition-colors">
                                   <span className="text-[7px] font-bold text-tertiary uppercase">SYS</span>
                                   <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 leading-none mt-0.5">{t.id}</span>
                                </div>
                                <div>
                                   <h4 className="text-sm font-bold text-primary mb-2 group-hover:text-accent transition-colors">{t.title}</h4>
                                   <div className="flex flex-wrap gap-2.5">
                                      <Badge text={t.priority} type={t.priority === 'Critical' ? 'danger' : t.priority === 'High' ? 'warning' : 'info'} />
                                      <span className="flex items-center gap-1 text-[9px] font-bold text-secondary uppercase bg-base px-2 py-0.5 rounded border border-border/50"><Users size={10} className="text-accent"/> {t.owner}</span>
                                      <span className="flex items-center gap-1 text-[9px] font-bold text-secondary uppercase bg-base px-2 py-0.5 rounded border border-border/50"><Calendar size={10} className="text-accent"/> Due {t.deadline}</span>
                                   </div>
                                </div>
                             </div>
                             <div className="flex flex-col items-end gap-2 shrink-0">
                                <div className="flex items-center gap-3">
                                   <span className="text-[10px] font-bold text-secondary uppercase">{t.status}</span>
                                   <span className="text-xs font-bold text-primary tabular-nums">{t.progress}%</span>
                                </div>
                                <div className="w-48 h-1.5 bg-base rounded-full overflow-hidden border border-border/50">
                                   <div className={`h-full rounded-full ${t.status === 'Blocked' ? 'bg-red-500' : t.status === 'Done' ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${t.progress}%` }}></div>
                                </div>
                             </div>
                          </div>
                       </div>
                     )) : (
                       <div className="p-12 text-center border border-dashed border-border rounded-3xl bg-surface/30">
                          <p className="text-xs text-secondary font-medium">No initiative tasks matches active filters.</p>
                       </div>
                     )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'approvals' && (
                <motion.div key="approvals" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-6">
                      <h2 className="text-xl font-bold text-primary">Decision Protocols</h2>
                      <p className="text-secondary text-xs">Authorized approvals for system resources and personnel override requests.</p>
                   </div>
                   
                   <div className="space-y-4">
                      {approvals.map((req, i) => (
                        <Card key={i} delay={i * 0.05} className="p-5 border-border/60 hover:border-accent/30 transition-all group">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div className="flex items-start gap-4">
                                 <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center shrink-0">
                                    <Shield size={18} className="text-accent" />
                                 </div>
                                 <div>
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                       <span className="text-xs font-bold text-primary">{req.user}</span>
                                       <Badge text={req.type} type="info" />
                                       <Badge text={req.priority} type={req.priority === 'Critical' ? 'danger' : req.priority === 'High' ? 'warning' : 'default'} />
                                    </div>
                                    <p className="text-[11px] text-secondary font-medium leading-relaxed">{req.detail}</p>
                                    <div className="text-[9px] text-tertiary font-bold uppercase mt-2">{req.id} · Requested {req.date}</div>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                 {req.status !== 'Pending' ? (
                                    <Badge text={req.status} type={req.status === 'Authorized' ? 'success' : 'danger'} />
                                 ) : (
                                    <>
                                       <button onClick={() => handleDenyApproval(req.id)} className="px-4 py-2 bg-base border border-border rounded-lg text-[10px] font-bold uppercase hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all active:scale-95">Deny</button>
                                       <button onClick={() => handleAuthorizeApproval(req.id)} className="px-4 py-2 bg-accent text-white rounded-lg text-[10px] font-bold uppercase hover:bg-indigo-600 transition-all shadow-lg shadow-accent/20 active:scale-95">Authorize</button>
                                    </>
                                 )}
                              </div>
                           </div>
                        </Card>
                      ))}
                   </div>
                </motion.div>
              )}

              {activeTab === 'progress' && (
                <motion.div key="progress" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                  <div className="space-y-6">
                     <div className="flex flex-col gap-1 mb-2">
                        <h2 className="text-xl font-bold text-primary">Performance Velocity</h2>
                        <p className="text-secondary text-xs">Deep analytics and trend projections for active departments.</p>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Velocity Output</h3>
                              <Badge text="Last 30 Days" type="info" />
                           </div>
                           <div className="h-64 flex items-end gap-2 px-2 pb-2">
                              {[60, 80, 45, 90, 70, 85, 55, 95, 80, 75, 90, 88].map((h, i) => (
                                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center">
                                   <div className="w-full h-48 flex items-end">
                                      <motion.div 
                                       initial={{ height: 0 }} 
                                       animate={{ height: `${h}%` }} 
                                       transition={{ delay: i * 0.03, duration: 0.8 }}
                                       className="w-full bg-accent/20 rounded-t-lg group relative hover:bg-accent transition-all cursor-pointer"
                                      >
                                         <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20">
                                           {h}% Yield
                                         </div>
                                      </motion.div>
                                   </div>
                                   <span className="text-[8px] font-bold text-tertiary mt-2">W{i+1}</span>
                                </div>
                              ))}
                           </div>
                        </Card>
                        <div className="space-y-6">
                           <Card className="relative overflow-hidden group">
                              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-50"></div>
                              <div className="relative z-10">
                                 <div className="flex items-center gap-3 mb-4">
                                    <Sparkles size={20} className="text-accent" />
                                    <h4 className="text-sm font-bold text-primary">Velocity Rating</h4>
                                 </div>
                                 <div className="text-5xl font-black mb-2 tracking-tighter text-accent">94.2</div>
                                 <p className="text-[11px] text-secondary font-medium leading-relaxed">+4.8% from last quarter. Team efficiency is operating at peak target.</p>
                              </div>
                           </Card>
                           <Card>
                              <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-4">Core Bottlenecks</h4>
                              <div className="space-y-3">
                                 <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-secondary">Lead Routing Handoff</span>
                                    <span className="text-red-500 font-bold">2.4 days</span>
                                 </div>
                                 <div className="w-full h-1 bg-base rounded-full overflow-hidden">
                                    <div className="w-3/4 h-full bg-red-500"></div>
                                 </div>
                                 <div className="flex items-center justify-between text-xs pt-2">
                                    <span className="font-bold text-secondary">Egress Node Checks</span>
                                    <span className="text-orange-500 font-bold">1.1 days</span>
                                 </div>
                                 <div className="w-full h-1 bg-base rounded-full overflow-hidden">
                                    <div className="w-1/2 h-full bg-orange-500"></div>
                                 </div>
                              </div>
                           </Card>
                        </div>
                     </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'crm' && (
                <motion.div key="crm" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}} className="space-y-6">
                   <div className="flex justify-between items-end mb-2 flex-wrap gap-4">
                      <div>
                         <h2 className="text-xl font-bold text-primary">CRM Operations</h2>
                         <p className="text-secondary text-xs">Read-only monitoring of marketing representative lead streams and communication logs.</p>
                      </div>
                      <Badge text="Telemetry Connected" type="success" />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {['Hot', 'Warm', 'Cold'].map(level => (
                       <div key={level} className="p-4 bg-base/20 rounded-2xl border border-border/50 space-y-4">
                         <h3 className="text-[10px] font-bold uppercase tracking-widest px-1 flex items-center justify-between">
                           <span>{level} pipeline</span>
                           <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${level === 'Hot' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : level === 'Warm' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                             {leads.filter(l => l.status === level).length}
                           </span>
                         </h3>
                         <div className="space-y-3">
                           {leads.filter(l => l.status === level).map(lead => (
                             <div key={lead.id} onClick={() => setSelectedLead(lead)} className="p-4 bg-surface border border-border rounded-xl hover:border-accent/40 cursor-pointer transition-all group">
                               <div className="flex justify-between items-start gap-2 mb-1.5">
                                 <Badge text={lead.stage} type="info" />
                                 <span className="text-[8px] font-mono text-tertiary">#{lead.id}</span>
                               </div>
                               <h4 className="text-xs font-bold text-primary leading-none mb-1 group-hover:text-accent transition-colors">{lead.name}</h4>
                               <span className="text-[10px] text-secondary font-medium block mb-3">{lead.company}</span>
                               
                               <div className="flex justify-between items-center text-[10px] pt-2 border-t border-border/50 text-secondary">
                                 <span className="font-mono font-bold text-primary">{lead.value}</span>
                                 <span className="text-[8px] font-bold uppercase tracking-wider bg-base px-2 py-0.5 border rounded">{lead.source}</span>
                               </div>
                             </div>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                </motion.div>
              )}

              {activeTab === 'invoices' && (
                <motion.div key="invoices" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}} className="space-y-6">
                   <div className="flex justify-between items-end mb-2">
                      <div>
                         <h2 className="text-xl font-bold text-primary">Invoices & Billing</h2>
                         <p className="text-secondary text-xs">Approve employee payment requests and monitor outbound client invoice states.</p>
                      </div>
                      <Badge text="Razorpay Synced" type="info" />
                   </div>

                   <div className="space-y-4">
                     {invoices.map(inv => (
                       <Card key={inv.id} className="p-5 hover:border-accent/20 group transition-all">
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                           <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center text-accent font-bold">
                               $
                             </div>
                             <div>
                               <div className="flex items-center gap-2 mb-1 flex-wrap">
                                 <span className="text-xs font-bold text-primary">{inv.client}</span>
                                 <span className="text-[9px] text-tertiary font-mono">#{inv.id}</span>
                               </div>
                               <div className="text-[10px] text-secondary font-medium">Due Date: {inv.due} · Reminders sent: {inv.remindersSent}</div>
                             </div>
                           </div>
                           <div className="flex items-center gap-3 shrink-0">
                             <span className="text-sm font-black text-primary mr-2">{inv.amount}</span>
                             <Badge text={inv.status} type={inv.status === 'Paid' ? 'success' : inv.status === 'Overdue' ? 'danger' : 'warning'} />
                             
                             {inv.status !== 'Paid' && (
                               <div className="flex items-center gap-2 ml-3">
                                 <button onClick={() => handleSendReminder(inv.id)} className="px-3 py-1.5 bg-base border border-border rounded-lg text-[9px] font-bold uppercase hover:bg-accent/5 hover:border-accent/30 transition-all active:scale-95">Remind Client</button>
                                 <button onClick={() => handleApproveInvoice(inv.id)} className="px-3 py-1.5 bg-accent text-white rounded-lg text-[9px] font-bold uppercase hover:bg-indigo-600 transition-all active:scale-95 shadow-sm shadow-accent/10">Approve</button>
                               </div>
                             )}
                           </div>
                         </div>
                       </Card>
                     ))}
                   </div>
                </motion.div>
              )}

              {activeTab === 'directory' && (
                <motion.div key="directory" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}} className="space-y-6">
                   <div className="flex justify-between items-end mb-2">
                      <div>
                         <h2 className="text-xl font-bold text-primary">Workspace Personnel</h2>
                         <p className="text-secondary text-xs">Directory of all active accounts mapped inside the ops platform workspace.</p>
                      </div>
                      <Badge text={`${employees.length} Accounts Active`} type="success" />
                   </div>

                   <Card className="p-0 overflow-hidden">
                     <table className="w-full text-left text-xs border-collapse">
                       <thead className="bg-base/80 border-b border-border text-[9px] font-bold text-tertiary uppercase tracking-wider">
                         <tr>
                           <th className="px-6 py-3.5">Account Member</th>
                           <th className="px-6 py-3.5">System Email</th>
                           <th className="px-6 py-3.5">Clearance Rank</th>
                           <th className="px-6 py-3.5">Attendance Status</th>
                           <th className="px-6 py-3.5 text-right">Sprint Load</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                         {employees.map((emp, idx) => (
                           <tr key={idx} className="hover:bg-base/30 transition-colors">
                             <td className="px-6 py-4 flex items-center gap-3">
                               <div className={`w-8 h-8 rounded-lg ${emp.color} text-white flex items-center justify-center font-bold text-[10px] shadow-sm`}>
                                 {emp.avatar}
                               </div>
                               <span className="font-bold text-primary">{emp.name}</span>
                             </td>
                             <td className="px-6 py-4 font-medium text-secondary">{emp.email}</td>
                             <td className="px-6 py-4"><Badge text={emp.role} type={emp.role.includes('Director') || emp.role.includes('Admin') ? 'danger' : 'info'} /></td>
                             <td className="px-6 py-4">
                               <div className="flex items-center gap-1.5">
                                 <div className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Online' ? 'bg-emerald-500' : emp.status === 'Away' ? 'bg-orange-500' : 'bg-red-500'} animate-pulse`} />
                                 <span className="font-bold uppercase tracking-wider text-[9px] text-secondary">{emp.status}</span>
                               </div>
                             </td>
                             <td className="px-6 py-4 text-right font-bold text-primary">{emp.activeTasks} active tasks</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </Card>
                </motion.div>
              )}

              {activeTab === 'communication' && (
                <motion.div key="communication" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                   <div className="space-y-6">
                      <div className="flex flex-col gap-1 mb-2">
                         <h2 className="text-xl font-bold text-primary">Department Hub</h2>
                         <p className="text-secondary text-xs">Internal broadcasts, strategic directives, and team feedback.</p>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                         <div className="lg:col-span-2 space-y-4">
                            {directives.length === 0 ? (
                               <div className="p-12 text-center border-2 border-dashed border-border rounded-3xl bg-surface/30">
                                  <p className="text-xs text-secondary font-medium">All directives acknowledged! Team hub is clear.</p>
                               </div>
                            ) : (
                               directives.map((broadcast, i) => (
                                 <Card key={i} delay={i * 0.05} className="hover:border-accent/20">
                                    <div className="flex justify-between items-start mb-3">
                                       <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-xs">
                                            {broadcast.user.split(' ').map(n=>n[0]).join('')}
                                          </div>
                                          <span className="text-xs font-bold text-primary">{broadcast.user}</span>
                                       </div>
                                       <Badge text={broadcast.priority} type={broadcast.priority === 'Critical' ? 'danger' : broadcast.priority === 'High' ? 'warning' : 'default'} />
                                    </div>
                                    <p className="text-xs text-secondary leading-relaxed mb-4">{broadcast.msg}</p>
                                    <div className="flex items-center justify-between pt-3 border-t border-border">
                                       <span className="text-[10px] text-tertiary font-bold uppercase">{broadcast.time}</span>
                                       <button onClick={() => handleAcknowledgeDirective(i)} className="text-[10px] font-bold text-accent uppercase hover:underline cursor-pointer">Acknowledge</button>
                                    </div>
                                 </Card>
                               ))
                            )}
                         </div>
                         <Card className="h-fit sticky top-0">
                            <h3 className="text-xs font-bold text-primary mb-6 uppercase tracking-wider">New Directive</h3>
                            <form onSubmit={handleAddDirective} className="space-y-4">
                               <div>
                                  <label className="text-[9px] font-bold text-tertiary uppercase block mb-1.5">Subject</label>
                                  <input 
                                    type="text" 
                                    required
                                    value={newDirSubject}
                                    onChange={e => setNewDirSubject(e.target.value)}
                                    className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none" 
                                    placeholder="e.g., Egress Bandwidth Check" 
                                  />
                               </div>
                               <div>
                                  <label className="text-[9px] font-bold text-tertiary uppercase block mb-1.5">Priority</label>
                                  <select 
                                    value={newDirPriority}
                                    onChange={e => setNewDirPriority(e.target.value)}
                                    className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                                  >
                                    <option value="Normal">Normal</option>
                                    <option value="High">High</option>
                                    <option value="Critical">Critical</option>
                                  </select>
                               </div>
                               <div>
                                  <label className="text-[9px] font-bold text-tertiary uppercase block mb-1.5">Message</label>
                                  <textarea 
                                    required
                                    value={newDirMsg}
                                    onChange={e => setNewDirMsg(e.target.value)}
                                    className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs text-primary focus:ring-1 focus:ring-accent outline-none h-24 resize-none" 
                                    placeholder="Type your directive here..."
                                  ></textarea>
                               </div>
                               <button type="submit" className="w-full py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 active:scale-95">
                                  <Send size={12} /> Broadcast
                               </button>
                            </form>
                         </Card>
                      </div>
                   </div>
                </motion.div>
              )}
              {activeTab === 'reports' && (
                <motion.div key="reports" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                   <div className="flex flex-col gap-1 mb-6">
                      <h2 className="text-xl font-bold text-primary">Intelligence Reports</h2>
                      <p className="text-secondary text-xs">Detailed data exports and cross-departmental analysis.</p>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { title: 'Personnel Yield Q2 Report', size: '4.2 MB', type: 'CSV Spreadsheet' },
                        { title: 'Resource Efficiency Matrix Summary', size: '1.8 MB', type: 'CSV Spreadsheet' },
                        { title: 'Strategic Roadmap 2026 Directives', size: '12.4 MB', type: 'CSV Spreadsheet' },
                      ].map((report, i) => (
                        <Card key={i} className="flex items-center justify-between p-4 group">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-base border border-border flex items-center justify-center group-hover:border-accent transition-colors">
                                 <FileText size={18} className="text-accent" />
                              </div>
                              <div>
                                 <h4 className="text-xs font-bold text-primary">{report.title}</h4>
                                 <p className="text-[10px] text-tertiary font-bold uppercase">{report.size} · {report.type}</p>
                              </div>
                           </div>
                           <button onClick={() => handleDownloadCSV(report.title)} className="p-2 hover:bg-base rounded-lg transition-colors group-hover:text-accent">
                              <Download size={16} className="text-secondary group-hover:text-accent" />
                           </button>
                        </Card>
                      ))}
                   </div>
                </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* Right Sidebar (Pulse & AI Briefings) */}
        <div className="space-y-8">
           <Card className="p-6">
              <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-6">Strategic Pulse</h3>
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-xs font-bold text-secondary">Global Performance</span>
                       <span className="text-xs font-bold text-emerald-500">+12.5%</span>
                    </div>
                    <div className="h-10 flex items-end gap-1 px-1">
                       {[30, 45, 60, 40, 55, 80, 70, 90, 65, 85].map((h, i) => (
                         <div key={i} className="flex-1 bg-accent/20 rounded-t-sm group relative cursor-pointer hover:bg-accent transition-colors" style={{ height: `${h}%` }}>
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-bold px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Week {i+1}</div>
                         </div>
                       ))}
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div className="p-4 bg-base border border-border rounded-xl">
                       <div className="text-[10px] font-bold text-tertiary uppercase mb-1">Invoices</div>
                       <div className="text-lg font-bold text-primary">$124.5K</div>
                    </div>
                    <div className="p-4 bg-base border border-border rounded-xl">
                       <div className="text-[10px] font-bold text-tertiary uppercase mb-1">Velocity</div>
                       <div className="text-lg font-bold text-primary">0.94x</div>
                    </div>
                 </div>
              </div>
           </Card>

           <Card className="relative group overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-accent/15 transition-colors"></div>
              <div className="relative z-10">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                       <Zap size={20} className="text-accent" />
                    </div>
                    <h3 className="text-sm font-bold text-primary">Executive Insights</h3>
                 </div>
                 <p className="text-xs text-secondary leading-relaxed mb-6 font-medium">Based on last week&apos;s sprint velocity, we recommend accelerating the <b>R2 Migration</b> to bypass upcoming bandwidth throttles.</p>
                 <button onClick={handleGenerateBriefing} className="w-full py-3 bg-accent text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all active:scale-95 shadow-lg shadow-accent/20">
                    Generate AI Briefing
                 </button>
              </div>
           </Card>

           <div className="p-6 rounded-2xl border border-border bg-surface shadow-sm">
              <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-6">Quick Links</h3>
              <div className="space-y-2">
                 {[
                   { name: 'Resource Allocation', icon: Layers, tab: 'tasks' },
                   { name: 'Security Audit', icon: ShieldCheck, tab: 'approvals' },
                   { name: 'Export Monthly Reports', icon: Download, tab: 'reports' },
                 ].map((link, i) => (
                   <button key={i} onClick={() => router.push(`/manager?tab=${link.tab}`)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-base transition-all group border border-transparent hover:border-border/50">
                      <div className="flex items-center gap-3">
                         <link.icon size={16} className="text-secondary group-hover:text-accent transition-colors" />
                         <span className="text-xs font-bold text-secondary group-hover:text-primary transition-colors">{link.name}</span>
                      </div>
                      <ChevronRight size={14} className="text-tertiary group-hover:translate-x-1 transition-transform" />
                   </button>
                 ))}
              </div>
           </div>
        </div>
      </div>
    
      {/* Executive Briefing Modal */}
      <AnimatePresence>
        {showBriefingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl relative"
            >
              {isBriefingLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-primary">
                      {briefingStep === 0 && "Analyzing sprint velocity..."}
                      {briefingStep === 1 && "Synthesizing cross-functional logs..."}
                      {briefingStep === 2 && "Compiling strategic directives..."}
                    </h4>
                    <p className="text-[9px] text-tertiary uppercase tracking-widest animate-pulse font-bold">Level 4 Clearance Secured</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-start border-b border-border pb-4">
                    <div>
                      <span className="text-[8px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                        CONFIDENTIAL - LEVEL 4 ACCESS
                      </span>
                      <h3 className="text-lg font-bold text-primary mt-2">AI Executive Briefing</h3>
                    </div>
                    <span className="text-[10px] text-secondary font-mono">DATE: {new Date().toLocaleDateString()}</span>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-base border border-border rounded-xl text-center">
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Velocity</div>
                        <div className="text-xs font-bold text-primary">0.94x</div>
                      </div>
                      <div className="p-3 bg-base border border-border rounded-xl text-center">
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Efficiency</div>
                        <div className="text-xs font-bold text-emerald-500">92.5%</div>
                      </div>
                      <div className="p-3 bg-base border border-border rounded-xl text-center">
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Yield</div>
                        <div className="text-xs font-bold text-accent">$124.5K</div>
                      </div>
                    </div>

                    <div className="p-4 bg-accent/5 border border-accent/20 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-accent">
                        <Sparkles size={14} /> Core Recommendation
                      </div>
                      <p className="text-xs text-secondary leading-relaxed">
                        Based on APAC-West cluster bandwidth metrics, we recommend accelerating the <b className="text-primary font-bold">Cloudflare R2 Migration</b> by 4 days to bypass upcoming bandwidth throttles.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Strategic Allocations</h4>
                      <div className="p-3 bg-base border border-border rounded-xl flex items-center justify-between text-xs">
                        <span className="text-secondary">Reallocate <b className="text-primary">Alex Johnson</b> to support <b className="text-primary">Sarah Chen</b></span>
                        <span className="font-bold text-accent text-[9px] uppercase">Actionable</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowBriefingModal(false)}
                      className="flex-1 py-3 bg-base border border-border rounded-xl text-xs font-bold text-secondary hover:bg-border/20 transition-all active:scale-95"
                    >
                      Close
                    </button>
                    <button 
                      type="button"
                      onClick={handleApplyBriefingDirective}
                      className="flex-1 py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Zap size={12} /> Apply Directive
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Roles Modal */}
      <AnimatePresence>
        {showRolesModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <h3 className="text-lg font-bold text-primary mb-2">Manage Personnel Roles</h3>
              <p className="text-secondary text-xs mb-6">Update structural ranks and operational clearances for team members.</p>
              
              <form onSubmit={handleUpdateRoles} className="space-y-4">
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                  {editingEmployees.map((emp, idx) => (
                    <div key={idx} className="p-3 bg-base border border-border rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${emp.color} text-white flex items-center justify-center text-xs font-bold shadow-sm`}>
                          {emp.avatar}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-primary leading-tight">{emp.name}</h4>
                          <span className="text-[8px] text-tertiary uppercase font-medium">ID: 00{idx + 1}</span>
                        </div>
                      </div>
                      
                      <div className="w-1/2">
                        <input 
                          type="text" 
                          required
                          value={emp.role}
                          onChange={e => {
                            const updated = [...editingEmployees];
                            updated[idx].role = e.target.value;
                            setEditingEmployees(updated);
                          }}
                          className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowRolesModal(false)}
                    className="flex-1 py-3 bg-base border border-border rounded-xl text-xs font-bold text-secondary hover:bg-border/20 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"
                  >
                    Apply Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Task Creation Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <h3 className="text-lg font-bold text-primary mb-2">Deploy Strategic Initiative</h3>
              <p className="text-secondary text-xs mb-6">Allocate system resources and define ownership protocols.</p>
              
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-tertiary uppercase block mb-1.5">Initiative Title</label>
                  <input 
                    type="text" 
                    required
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="e.g. Compression validation" 
                    className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-tertiary uppercase block mb-1.5">Description</label>
                  <textarea 
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                    placeholder="Brief description of project requirements..." 
                    className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none h-16 resize-none"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-tertiary uppercase block mb-1.5">Priority</label>
                    <select 
                      value={newTaskPriority}
                      onChange={e => setNewTaskPriority(e.target.value as any)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-tertiary uppercase block mb-1.5">Owner</label>
                    <select 
                      value={newTaskOwner}
                      onChange={e => setNewTaskOwner(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    >
                      {employees.map(emp => (
                        <option key={emp.name} value={emp.name}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-tertiary uppercase block mb-1.5">Deadline</label>
                  <input 
                    type="text" 
                    required
                    value={newTaskDeadline}
                    onChange={e => setNewTaskDeadline(e.target.value)}
                    placeholder="e.g. May 24" 
                    className="w-full bg-base border border-border rounded-xl px-4 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowTaskModal(false)}
                    className="flex-1 py-3 bg-base border border-border rounded-xl text-xs font-bold text-secondary hover:bg-border/20 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"
                  >
                    Deploy Initiative
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Advanced Task Edit / Details Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-lg p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-start border-b border-border pb-4 mb-4">
                <div>
                  <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded tracking-wide font-mono">#{selectedTask.id}</span>
                  <h3 className="text-base font-bold text-primary mt-2">{selectedTask.title}</h3>
                </div>
                <button onClick={() => setSelectedTask(null)} className="p-1.5 hover:bg-base rounded-lg text-secondary transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-tertiary uppercase mb-1.5">Strategic Description</label>
                  <p className="p-3 bg-base border border-border rounded-xl text-secondary leading-relaxed font-sans">{selectedTask.desc}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-bold text-tertiary uppercase mb-1.5">Assignee Owner</label>
                    <select 
                      value={editOwner}
                      onChange={e => setEditOwner(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    >
                      {employees.map(emp => (
                        <option key={emp.name} value={emp.name}>{emp.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-tertiary uppercase mb-1.5">Priority Rank</label>
                    <select 
                      value={editPriority}
                      onChange={e => setEditPriority(e.target.value as any)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-bold text-tertiary uppercase mb-1.5">Strategic Status</label>
                    <select 
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value as any)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Blocked">Blocked</option>
                      <option value="Done">Done</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-tertiary uppercase mb-1.5">Target Deadline</label>
                    <input 
                      type="text" 
                      value={editDeadline}
                      onChange={e => setEditDeadline(e.target.value)}
                      className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                    />
                  </div>
                </div>

                {/* Subtask Status list */}
                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">Initiative Subtasks Checklist</h4>
                  {selectedTask.subtasks.length > 0 ? (
                    <div className="space-y-1.5 bg-base p-3 rounded-xl border border-border/50">
                      {selectedTask.subtasks.map((sub, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2 text-xs py-0.5">
                          {sub.done ? <CheckCircle size={12} className="text-emerald-500 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-border shrink-0" />}
                          <span className={sub.done ? 'text-secondary line-through' : 'text-primary'}>{sub.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-base text-center border border-dashed rounded-xl text-tertiary uppercase text-[8px] font-bold">No subtask checklists mapped.</div>
                  )}
                </div>

                {/* Employee Logs list */}
                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2">Employee Telemetry progress logs</h4>
                  {selectedTask.logs.length > 0 ? (
                    <div className="space-y-2 border-l-2 border-border pl-2.5">
                      {selectedTask.logs.map((log, lIdx) => (
                        <div key={lIdx} className="text-xs">
                          <div className="flex justify-between items-center text-[9px] text-secondary font-bold uppercase mb-0.5">
                            <span>{log.author}</span>
                            <span>{log.time}</span>
                          </div>
                          <p className="text-primary font-medium">{log.note}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-base text-center border border-dashed rounded-xl text-tertiary uppercase text-[8px] font-bold">No employee logs registered on this initiative.</div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4 flex justify-end gap-3 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2.5 bg-base border border-border rounded-xl text-xs font-bold text-secondary hover:bg-border/20 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveTaskDetails}
                  className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"
                >
                  Apply Sync Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CRM Lead Details Modal */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="flex justify-between items-start border-b border-border pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded tracking-wide font-mono">#{selectedLead.id}</span>
                    <Badge text={selectedLead.stage} type="info" />
                  </div>
                  <h3 className="text-base font-bold text-primary">{selectedLead.name}</h3>
                  <span className="text-xs text-secondary font-medium">{selectedLead.company}</span>
                </div>
                <button onClick={() => setSelectedLead(null)} className="p-1.5 hover:bg-base rounded-lg text-secondary transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar text-xs">
                <div className="p-4 bg-base border border-border rounded-2xl grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[8px] font-bold text-tertiary uppercase block mb-0.5">Estimated Value</span>
                    <span className="text-sm font-black text-accent">{selectedLead.value}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-tertiary uppercase block mb-0.5">Lead Priority</span>
                    <Badge text={selectedLead.status} type={selectedLead.status === 'Hot' ? 'danger' : 'warning'} />
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-tertiary uppercase block mb-0.5">Acquisition Source</span>
                    <span className="font-semibold text-secondary">{selectedLead.source}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-tertiary uppercase block mb-0.5">Email Line</span>
                    <span className="font-semibold text-secondary truncate block">{selectedLead.email}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-2 flex items-center gap-1"><Mail size={12} className="text-accent" /> Marketing Outbox History</h4>
                  {selectedLead.communications.length > 0 ? (
                    <div className="space-y-2 bg-base p-3 rounded-xl border border-border/50">
                      {selectedLead.communications.map((comm, idx) => (
                        <div key={idx} className="p-2 bg-surface rounded-lg border border-border/40 text-[11px] leading-snug">
                          <div className="flex justify-between items-center text-[8px] font-bold text-secondary uppercase mb-1">
                            <span>From: {comm.sender}</span>
                            <span>{comm.date}</span>
                          </div>
                          <p className="text-primary font-semibold font-sans">{comm.subject}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-base rounded-2xl text-center border border-dashed border-border text-tertiary uppercase text-[8px] font-bold">No outreach communications records.</div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4 flex justify-end shrink-0">
                <button 
                  type="button" 
                  onClick={() => setSelectedLead(null)}
                  className="w-full py-2.5 bg-base border border-border rounded-xl text-xs font-bold text-secondary hover:bg-border/20 transition-all active:scale-95"
                >
                  Close Lead Viewer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
</div>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
         <div className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Command Console...</div>
      </div>
    }>
       <ManagerDashboard />
    </Suspense>
  );
}
