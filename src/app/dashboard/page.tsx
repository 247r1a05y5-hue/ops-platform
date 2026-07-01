'use client';
import { useState, useEffect } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { downloadCSV } from '@/utils/export';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, TrendingUp, TrendingDown, CheckCircle, Calendar, Users, ExternalLink, MoreHorizontal, FileText, AlertCircle, ChevronDown, Sparkles, X, Clock } from 'lucide-react';
import Link from 'next/link';

interface TaskItem extends Record<string, unknown> {
  _id: string;
  title: string;
  description: string;
  stage: string;
  priority: string;
  assignee: string;
  dueDate?: string;
  completed: boolean;
  color: string;
}

interface InvoiceItem {
  _id: string;
  invoiceId: string;
  client: string;
  amount: string;
  date: string;
  due: string;
  status: string;
  category: string;
  paymentLink?: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  Critical: { label: 'Critical', cls: 'badge-enterprise badge-enterprise-danger' },
  High:     { label: 'High',     cls: 'badge-enterprise badge-enterprise-warning' },
  Medium:   { label: 'Medium',   cls: 'badge-enterprise badge-enterprise-info' },
  Low:      { label: 'Low',      cls: 'badge-enterprise' },
};

export default function Dashboard() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('today');

  const [stats, setStats] = useState<any[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [workspaceUsers, setWorkspaceUsers] = useState<{ _id: string; name: string; role: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialMount, setIsInitialMount] = useState(true);

  const [isTasksCollapsed, setIsTasksCollapsed] = useState(false);
  const [isTeamCollapsed, setIsTeamCollapsed] = useState(false);
  const [isApprovalsCollapsed, setIsApprovalsCollapsed] = useState(false);
  const [isDeadlinesCollapsed, setIsDeadlinesCollapsed] = useState(false);

  // Task creation modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');

  // Lead creation modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [leadValue, setLeadValue] = useState('5000');

  // Task detail modal
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/dashboard/stats?period=${activeTab}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (err) {
      console.error('Failed to load KPIs:', err);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const mapped: TaskItem[] = data.tasks.map((t: any) => ({
          _id: t._id,
          title: t.title,
          description: t.description || '',
          stage: t.stage,
          priority: t.priority,
          assignee: t.assignee || 'Unassigned',
          dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due date',
          completed: t.stage === 'Done',
          color: t.priority === 'High' || t.priority === 'Critical' ? 'orange' : t.priority === 'Medium' ? 'blue' : 'gray'
        }));
        setTasks(mapped);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setInvoices(data.invoices);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    }
  };

  // Load live team members with task counts and workspace users
  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/dashboard/team');
      const data = await res.json();
      if (data.success) {
        setTeamMembers(data.team);
        if (Array.isArray(data.users)) setWorkspaceUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to load team:', err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchTasks(), fetchInvoices(), fetchTeam()]);
      setLoading(false);
      setIsInitialMount(false);
    };
    loadAll();
  }, []);

  useEffect(() => {
    if (!isInitialMount) fetchStats();
  }, [activeTab, isInitialMount]);

  // Pre-fill task assignee with logged-in user when modal opens
  useEffect(() => {
    if (isTaskModalOpen && user?.name) {
      setTaskAssignee(prev => prev || user.name);
    }
  }, [isTaskModalOpen, user?.name]);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      downloadCSV(tasks, `Operations_Report_${activeTab}`);
      setIsExporting(false);
      showToast('Operations report exported as CSV!', 'success');
    }, 1200);
  };

  const toggleTask = async (e: React.MouseEvent, _id: string, currentlyCompleted: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const newStage = currentlyCompleted ? 'In Progress' : 'Done';
      const res = await fetch(`/api/tasks/${_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      const data = await res.json();
      if (data.success) {
        showToast(!currentlyCompleted ? 'Task completed!' : 'Task re-opened', 'success');
        fetchTasks();
        fetchStats();
      } else {
        showToast('Failed to update task', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error', 'error');
    }
  };

  // Create task POST action
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      showToast('Task title is required.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          priority: taskPriority,
          stage: 'Backlog',
          assignee: taskAssignee,
          dueDate: taskDueDate ? new Date(taskDueDate) : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('New task created successfully!', 'success');
        setIsTaskModalOpen(false);
        setTaskTitle('');
        setTaskDescription('');
        setTaskPriority('Medium');
        setTaskDueDate('');
        fetchTasks();
        fetchStats();
      } else {
        showToast(data.error || 'Failed to create task', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Server connection error', 'error');
    }
  };

  // Add Lead POST action
  const handleImportLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadEmail) {
      showToast('Lead name and email are required.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leadName.trim(),
          email: leadEmail.trim(),
          company: leadCompany.trim() || 'Acme Corp',
          value: `$${parseFloat(leadValue).toLocaleString()}`,
          stage: 'Discovery',
          status: 'Warm',
          assignedToName: user?.name || 'Unassigned'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Lead imported successfully to CRM pipeline!', 'success');
        setIsLeadModalOpen(false);
        setLeadName('');
        setLeadEmail('');
        setLeadCompany('');
        setLeadValue('5000');
        fetchStats();
      } else {
        showToast(data.error || 'Failed to import lead', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Server connection error', 'error');
    }
  };

  // Approve invoice PUT action
  const handleApproveInvoice = async (invoiceId: string, invoiceNum: string) => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, action: 'approve' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Invoice ${invoiceNum} approved and marked Paid!`, 'success');
        fetchInvoices();
        fetchStats();
      } else {
        showToast(data.error || 'Invoice approval failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error', 'error');
    }
  };

  const pendingInvoices = invoices.filter(inv => inv.status === 'Pending');
  const overdueTotal = invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((sum, inv) => sum + (parseFloat(inv.amount.replace(/[^0-9.]/g, '')) || 0), 0);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="flex-1 overflow-y-auto bg-base text-primary transition-colors min-h-screen">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-10 space-y-8">

        {/* ── Hero Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-secondary/80 uppercase tracking-widest">
              <Sparkles size={11} className="text-accent" />
              {getGreeting()}, {firstName}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-primary">
              Operations Workspace
            </h1>
            <p className="text-sm text-secondary font-medium max-w-md">
              Monitor performance, handle active tasks, and track outstanding invoices.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Period tabs */}
            <div className="flex bg-surface border border-border/60 rounded-xl p-1 shadow-sm">
              {(['today', 'week', 'custom'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); showToast(`Viewing: ${tab}`, 'info'); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                    activeTab === tab
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-secondary hover:text-primary hover:bg-base/60'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="btn-enterprise-primary flex items-center gap-2"
            >
              {isExporting
                ? <span className="spinner-enterprise !w-3.5 !h-3.5 !border-white/30 !border-t-white" />
                : <Download size={15} />}
              {isExporting ? 'Exporting…' : 'Export Report'}
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading && stats.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-enterprise p-6 flex flex-col gap-4">
                  <div className="skeleton-enterprise h-3 w-1/3" />
                  <div className="skeleton-enterprise h-8 w-2/3" />
                  <div className="skeleton-enterprise h-2.5 w-1/2" />
                </div>
              ))
            : (
              <AnimatePresence mode="wait">
                {stats.map((stat, i) => (
                  <motion.div
                    key={`${activeTab}-${i}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="card-enterprise p-6 flex flex-col gap-4 group"
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">{stat.title}</p>
                      <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${stat.color} bg-current/8`}>
                        <TrendingUp size={9} /> {stat.change}
                      </span>
                    </div>
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-primary leading-none">{stat.value}</div>
                      <div className="text-[11px] text-secondary mt-1.5 font-medium">{stat.sub}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Tasks + Team + Approvals */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Active Tasks */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="card-enterprise p-0 overflow-hidden"
            >
              <button
                className="w-full flex justify-between items-center px-6 py-4 border-b border-border/60 hover:bg-base/40 transition-colors cursor-pointer select-none"
                onClick={() => setIsTasksCollapsed(!isTasksCollapsed)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                    <CheckCircle size={15} />
                  </div>
                  <span className="text-sm font-bold text-primary">Active Tasks</span>
                  {tasks.length > 0 && (
                    <span className="badge-enterprise badge-enterprise-info">{tasks.filter(t => !t.completed).length} open</span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-secondary transition-transform duration-200 ${isTasksCollapsed ? '-rotate-90' : ''}`} />
              </button>

              <motion.div
                initial={false}
                animate={{ height: isTasksCollapsed ? 0 : 'auto', opacity: isTasksCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="divide-y divide-border/50 max-h-[480px] overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center mb-1">
                        <CheckCircle size={18} className="text-tertiary" />
                      </div>
                      <p className="text-sm font-semibold text-secondary">No active tasks</p>
                      <p className="text-xs text-tertiary">Tasks you create will appear here</p>
                    </div>
                  ) : (
                    tasks.map((task, i) => (
                      <Link
                        key={task._id}
                        href="/tasks"
                        className={`flex items-start gap-4 px-6 py-4 hover:bg-base/40 transition-colors group ${task.completed ? 'opacity-55' : ''}`}
                      >
                        <button
                          onClick={(e) => toggleTask(e, task._id, task.completed)}
                          className={`mt-0.5 flex-shrink-0 w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                            task.completed
                              ? 'bg-accent border-accent text-white'
                              : 'border-border hover:border-accent'
                          }`}
                        >
                          {task.completed && <CheckCircle size={10} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold leading-snug mb-1.5 ${task.completed ? 'line-through text-secondary' : 'text-primary group-hover:text-accent transition-colors'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className={PRIORITY_CONFIG[task.priority]?.cls ?? 'badge-enterprise'}>
                              {task.priority}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-medium text-secondary">
                              <Calendar size={9} /> Due {task.dueDate}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-medium text-secondary">
                              <Users size={9} /> {task.assignee}
                            </span>
                          </div>
                        </div>
                        <ExternalLink size={13} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
                      </Link>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>

            {/* Team + Approvals Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Team Overview */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="card-enterprise p-0 overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-6 py-4 border-b border-border/60 hover:bg-base/40 transition-colors cursor-pointer select-none"
                  onClick={() => setIsTeamCollapsed(!isTeamCollapsed)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Users size={14} />
                    </div>
                    <span className="text-sm font-bold text-primary">Team</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => showToast('Viewing team performance', 'info')}
                      className="text-[11px] font-semibold text-accent hover:underline"
                    >
                      View All
                    </button>
                    <ChevronDown
                      size={15}
                      className={`text-secondary transition-transform duration-200 ${isTeamCollapsed ? '-rotate-90' : ''}`}
                      onClick={() => setIsTeamCollapsed(!isTeamCollapsed)}
                    />
                  </div>
                </div>

                <motion.div
                  initial={false}
                  animate={{ height: isTeamCollapsed ? 0 : 'auto', opacity: isTeamCollapsed ? 0 : 1 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 space-y-2">
                    {loading ? (
                      [1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/40">
                          <div className="skeleton-enterprise w-8 h-8 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <div className="skeleton-enterprise h-2.5 w-24 rounded" />
                            <div className="skeleton-enterprise h-2 w-16 rounded" />
                          </div>
                          <div className="skeleton-enterprise h-2.5 w-12 rounded" />
                        </div>
                      ))
                    ) : teamMembers.length === 0 ? (
                      <div className="py-8 text-center text-xs text-secondary">No team members found.</div>
                    ) : (
                      teamMembers.map((emp, i) => (
                        <motion.div
                          key={emp.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.25 + i * 0.07 }}
                          className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:border-accent/30 hover:bg-base/40 transition-all group cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold group-hover:scale-105 transition-transform">
                                {emp.name.split(' ').map((n: string) => n[0]).join('')}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-surface ${
                                emp.status === 'Online' ? 'bg-emerald-500' :
                                emp.status === 'Away'   ? 'bg-amber-400' : 'bg-border'
                              }`} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-primary">{emp.name}</div>
                              <div className="text-[10px] text-secondary font-medium">{emp.role}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold text-primary">{emp.tasks}</div>
                            <div className={`text-[10px] font-semibold ${
                              emp.status === 'Online' ? 'text-emerald-500' :
                              emp.status === 'Away'   ? 'text-amber-400' : 'text-secondary'
                            }`}>{emp.status}</div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              </motion.div>

              {/* Pending Approvals + Overdue */}
              <div className="flex flex-col gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="card-enterprise p-0 overflow-hidden flex-1"
                >
                  <div
                    className="flex items-center justify-between px-6 py-4 border-b border-border/60 hover:bg-base/40 transition-colors cursor-pointer select-none"
                    onClick={() => setIsApprovalsCollapsed(!isApprovalsCollapsed)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
                        <FileText size={14} />
                      </div>
                      <span className="text-sm font-bold text-primary">Approvals</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {pendingInvoices.length > 0 && (
                        <span className="badge-enterprise badge-enterprise-warning">{pendingInvoices.length} pending</span>
                      )}
                      <ChevronDown size={15} className={`text-secondary transition-transform duration-200 ${isApprovalsCollapsed ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  <motion.div
                    initial={false}
                    animate={{ height: isApprovalsCollapsed ? 0 : 'auto', opacity: isApprovalsCollapsed ? 0 : 1 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {pendingInvoices.length === 0 ? (
                        <div className="py-6 text-center text-xs text-secondary font-medium">All invoices reviewed ✓</div>
                      ) : (
                        pendingInvoices.map((inv, i) => (
                          <motion.div
                            key={inv._id}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + i * 0.09 }}
                            className="flex items-center justify-between p-3 bg-base/60 border border-border/40 rounded-xl group hover:border-accent/30 transition-all"
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="text-xs font-semibold text-primary group-hover:text-accent transition-colors truncate">{inv.invoiceId} · {inv.client}</div>
                              <div className="text-[10px] text-secondary font-medium mt-0.5">{inv.amount} · Due {inv.due}</div>
                            </div>
                            <button
                              onClick={() => handleApproveInvoice(inv._id, inv.invoiceId)}
                              className="btn-enterprise-primary !py-1 !px-2.5 !text-[10px] shrink-0"
                            >
                              Approve
                            </button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </motion.div>

                {/* Overdue Alert */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center justify-between p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/8 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total Overdue</div>
                      <div className="text-xl font-bold text-primary">${overdueTotal.toLocaleString()}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => showToast('Opening collections view', 'info')}
                    className="p-2 hover:bg-red-500/15 rounded-lg transition-colors text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                  >
                    <ExternalLink size={16} />
                  </button>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Right: Deadlines */}
          <div className="col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="card-enterprise p-0 overflow-hidden sticky top-6"
            >
              <button
                className="w-full flex justify-between items-center px-6 py-4 border-b border-border/60 hover:bg-base/40 transition-colors cursor-pointer select-none"
                onClick={() => setIsDeadlinesCollapsed(!isDeadlinesCollapsed)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
                    <Calendar size={14} />
                  </div>
                  <span className="text-sm font-bold text-primary">Deadlines</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-base border border-border/60 text-secondary">Next 7 days</span>
                  <ChevronDown size={15} className={`text-secondary transition-transform duration-200 ${isDeadlinesCollapsed ? '-rotate-90' : ''}`} />
                </div>
              </button>

              <motion.div
                initial={false}
                animate={{ height: isDeadlinesCollapsed ? 0 : 'auto', opacity: isDeadlinesCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-1">
                  {tasks.filter(t => !t.completed && t.dueDate && t.dueDate !== 'No due date').slice(0, 5).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <div className="w-9 h-9 rounded-xl bg-base border border-border flex items-center justify-center mb-1">
                        <Calendar size={16} className="text-tertiary" />
                      </div>
                      <p className="text-xs font-semibold text-secondary">No upcoming deadlines</p>
                    </div>
                  ) : (
                    tasks
                      .filter(t => !t.completed && t.dueDate && t.dueDate !== 'No due date')
                      .slice(0, 5)
                      .map((d, i) => (
                        <Link
                          key={i}
                          href="/tasks"
                          className="group flex items-start gap-3 p-3 rounded-xl hover:bg-base/60 transition-colors"
                        >
                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/60 group-hover:bg-accent shrink-0 transition-colors" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary leading-snug group-hover:text-accent transition-colors">{d.title}</p>
                            <p className="text-[11px] font-medium text-secondary mt-0.5">Due {d.dueDate} · {d.assignee}</p>
                          </div>
                        </Link>
                      ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          </div>

        </div>
      </div>

      {/* Quick Create Modals */}
      <AnimatePresence>
        {isTaskModalOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden">
              <form onSubmit={handleSaveTask}>
                <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-base font-bold">Create New Task</h2>
                  <button type="button" onClick={() => setIsTaskModalOpen(false)} className="p-1 hover:bg-surface rounded-md text-secondary hover:text-primary transition-colors"><X size={18}/></button>
                </div>
                <div className="p-6 flex flex-col gap-5">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Task Title *</label>
                    <input required type="text" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Design homepage hero" className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-accent text-primary text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Description</label>
                    <textarea rows={3} value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} placeholder="Enter details about task..." className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-accent text-primary text-sm font-medium resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Priority</label>
                      <select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)} className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-accent text-primary font-bold text-sm">
                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Due Date</label>
                      <input type="date" value={taskDueDate} onChange={e=>setTaskDueDate(e.target.value)} className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-accent text-primary font-bold text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Assignee</label>
                    <select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)} className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-accent text-primary font-bold text-sm">
                      {user?.name && <option value={user.name}>{user.name} (You)</option>}
                      {workspaceUsers.filter(m => m.name !== user?.name).map(m => (
                        <option key={m._id} value={m.name}>{m.name} ({m.role})</option>
                      ))}
                      {workspaceUsers.length === 0 && !user?.name && <option value="">Unassigned</option>}
                    </select>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button type="button" onClick={() => setIsTaskModalOpen(false)} className="px-5 py-2 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button type="submit" className="px-8 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-indigo-600 shadow-lg active:scale-95 transition-all text-xs">Save Task</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isLeadModalOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden">
              <form onSubmit={handleImportLead}>
                <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-base font-bold flex items-center gap-2 text-primary"><Users size={16} className="text-blue-500"/> Add New Lead</h2>
                  <button type="button" onClick={() => setIsLeadModalOpen(false)} className="p-1 hover:bg-surface rounded-md text-secondary hover:text-primary transition-colors"><X size={18}/></button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Full Name *</label>
                    <input required type="text" value={leadName} onChange={e=>setLeadName(e.target.value)} placeholder="e.g. Maya Thompson" className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-blue-500 text-primary text-sm font-medium" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Lead Email *</label>
                    <input required type="email" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} placeholder="maya@acme.com" className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-blue-500 text-primary text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Company</label>
                    <input type="text" value={leadCompany} onChange={e=>setLeadCompany(e.target.value)} placeholder="Company INC" className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-blue-500 text-primary text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Est. Value ($)</label>
                    <input type="number" value={leadValue} onChange={e=>setLeadValue(e.target.value)} placeholder="24000" className="w-full px-4 py-2 border border-border bg-base rounded-lg focus:outline-none focus:border-blue-500 text-primary text-sm font-medium" />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button type="button" onClick={() => setIsLeadModalOpen(false)} className="px-5 py-2 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button type="submit" className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all text-xs">Import Lead</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {selectedTask && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-base/50">
                <span className="text-[9px] font-mono bg-border px-2 py-1 rounded text-secondary uppercase tracking-wider">OPS-TASK</span>
                <button onClick={() => setSelectedTask(null)} className="p-1 hover:bg-surface rounded-md text-secondary hover:text-primary transition-colors"><X size={18}/></button>
              </div>
              <div className="p-8 pb-4">
                <h2 className="text-xl font-bold mb-4">{selectedTask.title}</h2>
                <p className="text-xs text-secondary leading-relaxed mb-8">{selectedTask.description || 'No description provided.'}</p>
                <div className="grid grid-cols-2 gap-y-6 text-xs border-t border-border pt-6">
                  <div><h4 className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Priority</h4>
                    <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border border-current text-${selectedTask.color}-600 dark:text-${selectedTask.color}-400 bg-current/10`}>{selectedTask.priority}</span></div>
                  <div><h4 className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Owner</h4>
                    <div className="font-bold flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-accent/20 border border-accent flex items-center justify-center text-[9px] text-accent">{selectedTask.assignee[0]}</div>{selectedTask.assignee}</div></div>
                  <div><h4 className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Due Date</h4>
                    <div className="font-bold flex items-center gap-2"><Calendar size={12} className="text-secondary"/> {selectedTask.dueDate}</div></div>
                  <div><h4 className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Status</h4>
                    <div className={`font-bold flex items-center gap-2 ${selectedTask.completed ? 'text-accent' : ''}`}>{selectedTask.completed ? <CheckCircle size={12}/> : <Clock size={12}/>}{selectedTask.completed ? 'Completed' : 'Pending'}</div></div>
                </div>
              </div>
              <div className="px-8 py-5 border-t border-border flex justify-end bg-base/30 mt-4">
                <button onClick={() => setSelectedTask(null)} className="px-8 py-2.5 bg-surface border border-border text-primary font-bold rounded-xl hover:bg-base hover:border-accent transition-all active:scale-95 text-xs">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
