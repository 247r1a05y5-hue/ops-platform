'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { 
  Activity, ArrowUpRight, BarChart2, Briefcase, Calendar, ChevronDown, 
  ChevronRight, Clipboard, Clock, Download, FileText, Folder, Flag,
  Layers, Lock, Loader2, MessageSquare, Plus, Search, Shield, 
  ShieldCheck, Sparkles, AlertCircle, RefreshCw, Trash2, User, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerActivityLog } from '@/utils/activity';
import {
  OpsButton, OpsInput, OpsSelect, OpsBadge, OpsAvatar, 
  OpsTable, OpsTableHead, OpsTableBody, OpsTableRow, OpsTableCell, 
  OpsTableHeadCell, OpsModal, OpsEmptyState, OpsErrorState
} from '@/components/ui/ops';
import { TaskDrawer } from '@/components/TaskDrawer';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ManagerEmployee {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  performance: string;
  workload: string;
  color: string;
  avatar: string;
  activeTasks: number;
}

interface ManagerTask {
  _id: string;
  title: string;
  description: string;
  priority: string;
  assignee: string;
  dueDate: string;
  stage: string;
  progress: number;
  code: string;
  projectId?: string;
  subtasks: { title: string; done: boolean }[];
  logs: { time: string; note: string; author: string }[];
}

interface Project {
  _id: string;
  name: string;
  deadline?: string;
  owner?: string;
}

interface LeadApproval {
  _id: string;
  requestedByName: string;
  reason: string;
  dealValue: string;
  createdAt: string;
  status: string;
  leadId?: {
    name: string;
    company: string;
    value?: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES = ['Backlog', 'In Progress', 'Review', 'Done'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

// ─── Main Manager Dashboard ──────────────────────────────────────────────────

function ManagerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useUI();
  const { user } = useAuth();

  // Unified Loading & Error State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Core Data
  const [tasks, setTasks] = useState<ManagerTask[]>([]);
  const [employees, setEmployees] = useState<ManagerEmployee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<LeadApproval[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Filters & Interactivity
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [inspectorTaskId, setInspectorTaskId] = useState<string | null>(null);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [briefingStep, setBriefingStep] = useState(0);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  
  // Creation Modals
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // New task form state
  const [ntTitle, setNtTitle] = useState('');
  const [ntPriority, setNtPriority] = useState('Medium');
  const [ntStage, setNtStage] = useState('Backlog');
  const [ntAssignee, setNtAssignee] = useState('');
  const [ntDueDate, setNtDueDate] = useState('');
  const [ntDescription, setNtDescription] = useState('');
  const [ntProjectId, setNtProjectId] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // New project form state
  const [npName, setNpName] = useState('');
  const [npDeadline, setNpDeadline] = useState('');
  const [npOwner, setNpOwner] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Role permissions helpers
  const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager';

  // ─── Fetch Engine ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [tRes, pRes, uRes, aRes, analRes] = await Promise.all([
        fetch('/api/tasks', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/projects', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/users', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/leads/approval', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/analytics?period=month', { credentials: 'include', cache: 'no-store' }),
      ]);

      if (!tRes.ok || !pRes.ok || !uRes.ok || !aRes.ok) {
        throw new Error('Failed to synchronize with central databases.');
      }

      const [tData, pData, uData, aData, analData] = await Promise.all([
        tRes.json(), pRes.json(), uRes.json(), aRes.json(), analRes.json()
      ]);

      if (tData.success) setTasks(tData.tasks);
      if (pData.success) setProjects(pData.projects);
      if (aData.success) setApprovals(aData.requests || []);
      if (analData.success) setAnalytics(analData);

      if (uData.success && Array.isArray(uData.users)) {
        // Map users to local ManagerEmployee structures
        const mappedEmployees: ManagerEmployee[] = uData.users.map((member: any) => {
          const initials = member.name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
          const userTasks = (tData.tasks || []).filter((t: any) => 
            t.assignee && (t.assignee.toLowerCase() === member.name.toLowerCase() || t.assignee.toLowerCase() === member.email.toLowerCase())
          );
          const activeTasksCount = userTasks.filter((t: any) => t.stage !== 'Done').length;
          const doneTasks = userTasks.filter((t: any) => t.stage === 'Done').length;
          const totalTasks = userTasks.length;
          
          const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-accent', 'bg-orange-500', 'bg-rose-500', 'bg-purple-500', 'bg-pink-500'];
          const colorIdx = member.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
          
          const performanceVal = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 85;
          let workload = 'Low';
          if (activeTasksCount > 3) workload = 'High';
          else if (activeTasksCount > 1) workload = 'Optimal';
          else if (activeTasksCount === 1) workload = 'Balanced';

          return {
            _id: member._id,
            name: member.name,
            email: member.email,
            role: member.role,
            status: member.status || 'Offline',
            performance: `${performanceVal}%`,
            workload,
            color: colors[colorIdx],
            avatar: initials,
            activeTasks: activeTasksCount
          };
        });
        setEmployees(mappedEmployees);
      }
    } catch (err: any) {
      setError(err.message || 'Operational feed lost connection. Retry below.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Actions & Submissions ─────────────────────────────────────────────────

  const handleAuthorizeApproval = async (approvalId: string) => {
    try {
      const res = await fetch(`/api/leads/approval/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ status: 'approved' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Approval request authorized', 'success');
        triggerActivityLog('workflow_action', `Authorized override request ${approvalId}`);
        fetchData(true);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      showToast(err.message || 'Authorization failed', 'error');
    }
  };

  const handleDenyApproval = async (approvalId: string) => {
    try {
      const res = await fetch(`/api/leads/approval/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ status: 'rejected' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Approval request rejected', 'warning');
        triggerActivityLog('workflow_action', `Denied override request ${approvalId}`);
        fetchData(true);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      showToast(err.message || 'Deny process failed', 'error');
    }
  };

  const handleCreateTask = async () => {
    if (!ntTitle.trim()) { showToast('Title is required', 'warning'); return; }
    setCreatingTask(false);
    setCreatingTask(true);
    try {
      const payload: Record<string, any> = {
        title: ntTitle.trim(), stage: ntStage, priority: ntPriority,
        tags: ['Management'],
      };
      if (ntAssignee) payload.assignee = ntAssignee;
      if (ntDueDate) payload.dueDate = ntDueDate;
      if (ntDescription) payload.description = ntDescription;
      if (ntProjectId) payload.projectId = ntProjectId;

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setNewTaskOpen(false);
        setNtTitle(''); setNtPriority('Medium'); setNtStage('Backlog');
        setNtAssignee(''); setNtDueDate(''); setNtDescription(''); setNtProjectId('');
        showToast('Task launched successfully', 'success');
        triggerActivityLog('task_creation', `Created task: ${data.task.title}`);
        fetchData(true);
      } else {
        showToast(data.error || 'Task launch failed', 'error');
      }
    } catch { showToast('Network database error', 'error'); }
    finally { setCreatingTask(false); }
  };

  const handleCreateProject = async () => {
    if (!npName.trim()) { showToast('Project name is required', 'warning'); return; }
    setCreatingProject(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: npName.trim(), deadline: npDeadline, owner: npOwner }),
      });
      const data = await res.json();
      if (data.success) {
        setNewProjectOpen(false);
        setNpName(''); setNpDeadline(''); setNpOwner('');
        showToast('Project configured', 'success');
        fetchData(true);
      } else {
        showToast(data.error || 'Project creation failed', 'error');
      }
    } catch { showToast('Network database error', 'error'); }
    finally { setCreatingProject(false); }
  };

  const handleGenerateBriefing = () => {
    setIsBriefingLoading(true);
    setShowBriefingModal(true);
    setBriefingStep(0);
    setTimeout(() => setBriefingStep(1), 600);
    setTimeout(() => setBriefingStep(2), 1200);
    setTimeout(() => setIsBriefingLoading(false), 1800);
  };

  const handleDownloadCSV = (reportTitle: string) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (reportTitle.includes("Personnel Yield")) {
      csvContent += "Employee,Role,Efficiency,Workload\n";
      employees.forEach(emp => {
        csvContent += `"${emp.name}","${emp.role}","${emp.performance}","${emp.workload}"\n`;
      });
    } else if (reportTitle.includes("Resource Efficiency")) {
      csvContent += "Code,Title,Priority,Owner,Deadline,Progress,Status\n";
      tasks.forEach(t => {
        csvContent += `"${t.code}","${t.title}","${t.priority}","${t.assignee}","${t.dueDate}","${t.progress}%","${t.stage}"\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportTitle.toLowerCase().replace(/ /g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Compiled report spreadsheet!`, 'success');
  };

  // ─── Computed Filtering ────────────────────────────────────────────────────

  const filteredTasks = tasks.filter(t => {
    if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchCode = t.code?.toLowerCase().includes(q);
      const matchAssignee = t.assignee?.toLowerCase().includes(q);
      if (!matchTitle && !matchCode && !matchAssignee) return false;
    }
    return true;
  });

  const todayStr = new Date().toISOString().substring(0, 10);

  const todayTasks = filteredTasks.filter(t => t.dueDate && t.dueDate.substring(0, 10) === todayStr && t.stage !== 'Done');
  const overdueTasks = filteredTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.stage !== 'Done');
  const blockedTasks = filteredTasks.filter(t => t.stage === 'Blocked');
  const reviewTasks = filteredTasks.filter(t => t.stage === 'Review');
  const upcomingDeadlines = filteredTasks
    .filter(t => t.dueDate && t.stage !== 'Done' && new Date(t.dueDate) >= new Date())
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  const activeProject = projects.find(p => p._id === selectedProjectId);

  // ─── View Subcomponents ────────────────────────────────────────────────────

  const WidgetHeader = ({ title, count, color = 'text-accent' }: { title: string; count: number; color?: string }) => (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3 shrink-0">
      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{title}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-base border border-border/60 ${color}`}>
        {count}
      </span>
    </div>
  );

  const MiniTaskCard = ({ task }: { task: ManagerTask }) => (
    <div 
      onClick={() => setInspectorTaskId(task._id)}
      className="p-3 bg-base/40 border border-border/60 hover:border-accent/40 rounded-xl cursor-pointer hover:shadow-sm transition-all duration-150 group flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold text-secondary/60 uppercase">{task.code}</span>
        <OpsBadge variant={
          task.priority === 'Critical' ? 'danger' 
          : task.priority === 'High' ? 'warning' 
          : task.priority === 'Medium' ? 'info' 
          : 'default'
        }>
          {task.priority}
        </OpsBadge>
      </div>
      <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors line-clamp-1">
        {task.title}
      </h4>
      <div className="flex items-center justify-between pt-1 border-t border-border/30">
        <div className="flex items-center gap-1.5">
          <OpsAvatar name={task.assignee} size="xs" />
          <span className="text-[9px] font-bold text-secondary truncate max-w-[80px]">
            {task.assignee || 'Unassigned'}
          </span>
        </div>
        {task.dueDate && (
          <span className="text-[9px] font-bold text-secondary">
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 h-full bg-base text-primary overflow-hidden">
      
      {/* ─── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/60 bg-surface/60 backdrop-blur-sm px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 z-20">
        
        {/* Left: Project Switcher & Breadcrumb */}
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center border border-accent/20">
            <Layers size={16} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-secondary uppercase tracking-wider mb-1">
              <span>Workspace</span>
              <ChevronRight size={8} />
              <span>Command Hub</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="select-enterprise !py-1 !text-xs font-bold !w-48 bg-transparent"
              >
                <option value="all">All Projects Combined</option>
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Center: Live Search */}
        <div className="flex-1 max-w-md mx-0 sm:mx-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search initiatives, tasks, assignees..."
              className="w-full bg-base border border-border/60 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-accent text-primary font-medium"
            />
          </div>
        </div>

        {/* Right: Quick Actions & Refresh */}
        <div className="flex items-center gap-2.5">
          <OpsButton
            variant="ghost"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            title="Refresh dashboard feeds"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </OpsButton>
          <OpsButton variant="secondary" size="sm" onClick={() => setNewProjectOpen(true)}>
            <Folder size={12} /> New Project
          </OpsButton>
          <OpsButton variant="primary" size="sm" onClick={() => setNewTaskOpen(true)}>
            <Plus size={13} /> Launch Task
          </OpsButton>
        </div>
      </div>

      {/* ─── Main Content Area ──────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <OpsErrorState
            kind="network"
            title="Database Connection Lost"
            description={error}
            onRetry={fetchData}
          />
        </div>
      ) : loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-accent" />
          <span className="text-xs font-bold uppercase tracking-widest text-secondary animate-pulse">
            Compiling Operational Telemetry...
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          
          {/* Main Area: Top widgets grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            
            {/* Today Widget */}
            <div className="card-enterprise !p-4 flex flex-col min-h-[220px] max-h-[300px]">
              <WidgetHeader title="Due Today" count={todayTasks.length} color="text-indigo-400" />
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {todayTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center opacity-40 py-8">
                    <span className="text-[10px] font-bold text-secondary uppercase">No tasks due today</span>
                  </div>
                ) : (
                  todayTasks.map(t => <MiniTaskCard key={t._id} task={t} />)
                )}
              </div>
            </div>

            {/* Overdue Widget */}
            <div className="card-enterprise !p-4 flex flex-col min-h-[220px] max-h-[300px]">
              <WidgetHeader title="Overdue SLA" count={overdueTasks.length} color="text-red-500" />
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {overdueTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center opacity-40 py-8">
                    <span className="text-[10px] font-bold text-secondary uppercase">SLA Deadlines Clear</span>
                  </div>
                ) : (
                  overdueTasks.map(t => <MiniTaskCard key={t._id} task={t} />)
                )}
              </div>
            </div>

            {/* Blocked Widget */}
            <div className="card-enterprise !p-4 flex flex-col min-h-[220px] max-h-[300px]">
              <WidgetHeader title="Blocked Stream" count={blockedTasks.length} color="text-amber-500" />
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {blockedTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center opacity-40 py-8">
                    <span className="text-[10px] font-bold text-secondary uppercase">No blocked dependencies</span>
                  </div>
                ) : (
                  blockedTasks.map(t => <MiniTaskCard key={t._id} task={t} />)
                )}
              </div>
            </div>

            {/* Review Queue Widget */}
            <div className="card-enterprise !p-4 flex flex-col min-h-[220px] max-h-[300px]">
              <WidgetHeader title="Review Queue" count={reviewTasks.length} color="text-emerald-500" />
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {reviewTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center opacity-40 py-8">
                    <span className="text-[10px] font-bold text-secondary uppercase">Queue clean & clear</span>
                  </div>
                ) : (
                  reviewTasks.map(t => <MiniTaskCard key={t._id} task={t} />)
                )}
              </div>
            </div>
          </div>

          {/* Main Area: Team Capacity & Project Health row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Team Capacity Widget */}
            <div className="card-enterprise !p-5 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-primary">Department Personnel Velocity</h3>
                  <p className="text-[10px] text-secondary font-medium mt-0.5">Real-time team distribution and efficiency loads.</p>
                </div>
                <OpsButton variant="ghost" size="xs" onClick={() => setShowRolesModal(true)}>
                  Manage Roles <ArrowUpRight size={12} />
                </OpsButton>
              </div>

              {employees.length === 0 ? (
                <OpsEmptyState
                  title="No staff allocated"
                  description="Add department personnel in settings to monitor capacity."
                  compact
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {employees.map(emp => (
                    <div key={emp._id} className="p-3.5 bg-base/30 border border-border/60 rounded-xl space-y-3">
                      <div className="flex items-center gap-3">
                        <OpsAvatar name={emp.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-primary truncate leading-tight">{emp.name}</h4>
                          <span className="text-[9px] text-secondary font-bold uppercase tracking-wider block mt-0.5">{emp.role}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          emp.workload === 'High' ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                          : emp.workload === 'Optimal' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : 'bg-base border border-border/60 text-secondary'
                        }`}>{emp.workload} Load</span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-bold text-secondary uppercase">
                          <span>Efficiency Index</span>
                          <span className="text-primary font-mono">{emp.performance}</span>
                        </div>
                        <div className="w-full h-1 bg-border/40 rounded-full overflow-hidden">
                          <div className="h-full bg-accent" style={{ width: emp.performance }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-bold text-secondary uppercase pt-1 border-t border-border/30">
                        <span>Active Tasks: {emp.activeTasks}</span>
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Online' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                          {emp.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Health Widget */}
            <div className="card-enterprise !p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-primary">Strategic Milestones</h3>
                    <p className="text-[10px] text-secondary font-medium mt-0.5">Focus tracking on chosen initiative scope.</p>
                  </div>
                  <Briefcase size={14} className="text-secondary" />
                </div>

                {activeProject ? (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-secondary uppercase tracking-widest block">Project Name</span>
                      <h4 className="text-sm font-bold text-primary mt-1">{activeProject.name}</h4>
                    </div>
                    {activeProject.deadline && (
                      <div>
                        <span className="text-[9px] font-bold text-secondary uppercase tracking-widest block">Core Deadline</span>
                        <span className="text-xs font-bold text-primary flex items-center gap-1.5 mt-1">
                          <Calendar size={12} className="text-accent" />
                          {new Date(activeProject.deadline).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-[9px] font-bold text-secondary uppercase tracking-widest block">Task Allocation</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-black text-accent font-mono">
                          {filteredTasks.filter(t => t.stage === 'Done').length}
                        </span>
                        <span className="text-xs font-bold text-secondary">/ {filteredTasks.length} Completed</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-secondary leading-relaxed font-medium">
                      Select a project from the top dropdown to render individual health matrices.
                    </p>
                    <div className="grid grid-cols-2 gap-3.5 pt-2">
                      <div className="p-3 bg-base/50 border border-border rounded-xl">
                        <div className="text-[9px] font-bold text-secondary uppercase">All Initiatives</div>
                        <div className="text-lg font-black text-primary font-mono mt-1">{tasks.length}</div>
                      </div>
                      <div className="p-3 bg-base/50 border border-border rounded-xl">
                        <div className="text-[9px] font-bold text-secondary uppercase">Active Projects</div>
                        <div className="text-lg font-black text-primary font-mono mt-1">{projects.length}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border/40 mt-5 flex items-center gap-3">
                <OpsButton variant="secondary" size="sm" className="w-full" onClick={handleGenerateBriefing}>
                  <Sparkles size={12} /> Executive AI Brief
                </OpsButton>
              </div>
            </div>
          </div>

          {/* Bottom Area: Approvals & Upcoming SLA Deadlines row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Approvals Queue */}
            <div className="card-enterprise !p-5 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-primary">Override Approvals Required</h3>
                  <p className="text-[10px] text-secondary font-medium mt-0.5">Personnel and Deal flow overrides waiting for security clearance.</p>
                </div>
                <Shield size={14} className="text-secondary" />
              </div>

              {approvals.length === 0 ? (
                <OpsEmptyState
                  title="Decision queue clear"
                  description="No pending deal or personnel override clearances require authorization."
                  compact
                />
              ) : (
                <div className="space-y-3">
                  {approvals.slice(0, 3).map(app => (
                    <div key={app._id} className="p-4 bg-base/30 border border-border/60 hover:border-accent/30 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold text-primary leading-none">{app.requestedByName}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-accent/10 border border-accent/20 text-accent rounded uppercase tracking-wider">{app.reason}</span>
                          <span className="text-[9px] font-black text-primary font-mono uppercase">{app.dealValue}</span>
                        </div>
                        <p className="text-xs text-secondary font-medium leading-relaxed">
                          Requested override clearance for lead: <b className="text-primary">{app.leadId?.name || 'Unknown'}</b> ({app.leadId?.company || 'No company'})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {app.status === 'pending' ? (
                          <>
                            <OpsButton variant="ghost" size="xs" onClick={() => handleDenyApproval(app._id)}>
                              Deny
                            </OpsButton>
                            <OpsButton variant="primary" size="xs" onClick={() => handleAuthorizeApproval(app._id)}>
                              Authorize
                            </OpsButton>
                          </>
                        ) : (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            app.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}>{app.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Deadlines Widget */}
            <div className="card-enterprise !p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-primary">SLA Timeline Warning</h3>
                  <p className="text-[10px] text-secondary font-medium mt-0.5">Upcoming task deadlines monitored by SLA.</p>
                </div>
                <AlertCircle size={14} className="text-secondary" />
              </div>

              {upcomingDeadlines.length === 0 ? (
                <OpsEmptyState
                  title="No upcoming targets"
                  description="Assign due dates to tasks to populate warning markers."
                  compact
                />
              ) : (
                <div className="space-y-3">
                  {upcomingDeadlines.map(t => (
                    <div 
                      key={t._id}
                      onClick={() => setInspectorTaskId(t._id)}
                      className="p-3 bg-base/30 border border-border/60 hover:border-accent/40 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 group"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[9px] font-bold text-secondary/60 block mb-0.5">{t.code}</span>
                        <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors truncate">
                          {t.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-secondary shrink-0">
                        {new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Intelligence Reports CSV Section */}
          <div className="card-enterprise !p-5 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-primary">Compiled Analytics Sheets</h3>
              <p className="text-[10px] text-secondary font-medium mt-0.5">Download database telemetry logs for auditing.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Personnel Yield Q2 Report', type: 'Staff load matrix' },
                { title: 'Resource Efficiency Matrix Summary', type: 'Task SLA metrics' },
              ].map(sheet => (
                <div key={sheet.title} className="p-4 bg-base/30 border border-border/60 hover:border-accent/30 rounded-xl flex items-center justify-between transition-colors group">
                  <div>
                    <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors">{sheet.title}</h4>
                    <span className="text-[9px] text-secondary font-bold uppercase tracking-wider block mt-0.5">{sheet.type}</span>
                  </div>
                  <OpsButton variant="secondary" size="xs" onClick={() => handleDownloadCSV(sheet.title)}>
                    <Download size={12} /> Compile CSV
                  </OpsButton>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Task Drawer ────────────────────────────────────────────────────── */}
      <TaskDrawer
        open={!!inspectorTaskId}
        onClose={() => setInspectorTaskId(null)}
        taskId={inspectorTaskId}
        onUpdateSuccess={() => { fetchData(true); }}
        projects={projects}
        teamMembers={employees}
      />

      {/* ─── Create Task Modal ──────────────────────────────────────────────── */}
      <OpsModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        title="Launch Operation Task"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <OpsButton variant="secondary" onClick={() => setNewTaskOpen(false)}>Cancel</OpsButton>
            <OpsButton
              variant="primary"
              disabled={creatingTask || !ntTitle.trim()}
              loading={creatingTask}
              onClick={handleCreateTask}
            >
              {creatingTask ? 'Launching…' : 'Launch Task'}
            </OpsButton>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Task Title *</label>
            <OpsInput
              value={ntTitle}
              onChange={e => setNtTitle(e.target.value)}
              placeholder="e.g. Sync CDN assets with Cloudflare R2"
              autoFocus
            />
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              value={ntDescription}
              onChange={e => setNtDescription(e.target.value)}
              placeholder="Provide strategic operational parameters..."
              rows={3}
              className="w-full bg-base border border-border/70 rounded-lg px-3 py-2 text-[13px] font-medium text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/15 resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Stage</label>
            <OpsSelect
              value={ntStage}
              onChange={e => setNtStage(e.target.value)}
              options={STAGES.map(s => ({ value: s, label: s }))}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Priority</label>
            <OpsSelect
              value={ntPriority}
              onChange={e => setNtPriority(e.target.value)}
              options={PRIORITIES.map(p => ({ value: p, label: p }))}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Assignee</label>
            <OpsSelect
              value={ntAssignee}
              onChange={e => setNtAssignee(e.target.value)}
              options={[
                { value: '', label: 'Unassigned' },
                ...employees.map(m => ({ value: m.name, label: `${m.name} (${m.role})` })),
              ]}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Project Scope</label>
            <OpsSelect
              value={ntProjectId}
              onChange={e => setNtProjectId(e.target.value)}
              options={[
                { value: '', label: 'No Specific Project' },
                ...projects.map(p => ({ value: p._id, label: p.name })),
              ]}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Due Date</label>
            <OpsInput type="date" value={ntDueDate} onChange={e => setNtDueDate(e.target.value)} />
          </div>
        </div>
      </OpsModal>

      {/* ─── Create Project Modal ───────────────────────────────────────────── */}
      <OpsModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        title="Configure New Project"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <OpsButton variant="secondary" onClick={() => setNewProjectOpen(false)}>Cancel</OpsButton>
            <OpsButton
              variant="primary"
              disabled={creatingProject || !npName.trim()}
              loading={creatingProject}
              onClick={handleCreateProject}
            >
              {creatingProject ? 'Configuring…' : 'Configure Project'}
            </OpsButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Project Name *</label>
            <OpsInput
              value={npName}
              onChange={e => setNpName(e.target.value)}
              placeholder="e.g. APAC R2 Asset Cache Sync"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Deadline Target</label>
              <OpsInput type="date" value={npDeadline} onChange={e => setNpDeadline(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Owner Manager</label>
              <OpsSelect
                value={npOwner}
                onChange={e => setNpOwner(e.target.value)}
                options={[
                  ...(user?.name ? [{ value: user.name, label: `${user.name} (You)` }] : []),
                  ...employees.filter(m => m.name !== user?.name).map(m => ({ value: m.name, label: m.name })),
                ]}
              />
            </div>
          </div>
        </div>
      </OpsModal>

      {/* ─── Executive Briefing Modal ───────────────────────────────────────── */}
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
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Utilisation</div>
                        <div className="text-xs font-bold text-primary">
                          {analytics ? `${(analytics.team.utilisation / 100).toFixed(2)}x` : '—'}
                        </div>
                      </div>
                      <div className="p-3 bg-base border border-border rounded-xl text-center">
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Completion</div>
                        <div className="text-xs font-bold text-emerald-500">
                          {analytics ? `${analytics.tasks.completionRate}%` : '—'}
                        </div>
                      </div>
                      <div className="p-3 bg-base border border-border rounded-xl text-center">
                        <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Revenue</div>
                        <div className="text-xs font-bold text-accent">
                          {analytics?.revenue?.current
                            ? `₹${Math.round(analytics.revenue.current).toLocaleString()}`
                            : '—'}
                        </div>
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
                        <span className="text-secondary">Reallocate <b className="text-primary">{employees[0]?.name || 'Personnel'}</b> to support critical review tracks</span>
                        <span className="font-bold text-accent text-[9px] uppercase">Actionable</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <OpsButton variant="secondary" className="flex-1" onClick={() => setShowBriefingModal(false)}>
                      Close
                    </OpsButton>
                    <OpsButton variant="primary" className="flex-1" onClick={() => {
                      showToast('Directive Sync Broadcasted', 'success');
                      setShowBriefingModal(false);
                    }}>
                      <Zap size={12} /> Apply Directive
                    </OpsButton>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Manage Roles Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showRolesModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
            >
              <h3 className="text-lg font-bold text-primary mb-2">Manage Personnel Roles</h3>
              <p className="text-secondary text-xs mb-6">Update structural ranks and operational clearances for team members.</p>
              
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                {employees.map((emp, idx) => (
                  <div key={emp._id} className="p-3 bg-base border border-border rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <OpsAvatar name={emp.name} size="sm" />
                      <div>
                        <h4 className="text-xs font-bold text-primary leading-tight">{emp.name}</h4>
                        <span className="text-[8px] text-tertiary uppercase font-medium">Clearance: {emp.role}</span>
                      </div>
                    </div>
                    
                    <div className="w-1/2">
                      <select
                        value={emp.role}
                        onChange={async e => {
                          const newRole = e.target.value;
                          try {
                            const res = await fetch('/api/settings/team', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
                              credentials: 'include',
                              body: JSON.stringify({ userId: emp._id, role: newRole })
                            });
                            const data = await res.json();
                            if (data.success) {
                              showToast(`Updated role of ${emp.name} to ${newRole}`, 'success');
                              fetchData(true);
                            } else {
                              throw new Error(data.error);
                            }
                          } catch (err: any) {
                            showToast(err.message || 'Failed to update clearance', 'error');
                          }
                        }}
                        className="select-enterprise w-full text-xs px-3 py-1.5 cursor-pointer font-bold"
                      >
                        <option value="Employee">Employee</option>
                        <option value="Staff">Staff</option>
                        <option value="MR">MR</option>
                        <option value="User">User</option>
                        <option value="Manager">Manager</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-border/40 mt-4">
                <OpsButton variant="secondary" className="w-full" onClick={() => setShowRolesModal(false)}>
                  Close
                </OpsButton>
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
      <div className="flex-1 flex items-center justify-center bg-base min-h-screen">
        <div className="flex items-center gap-3 text-secondary">
          <Loader2 size={20} className="animate-spin text-accent" />
          <span className="text-sm font-medium">Loading Manager Dashboard…</span>
        </div>
      </div>
    }>
      <ManagerDashboard />
    </Suspense>
  );
}
