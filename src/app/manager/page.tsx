'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { 
  Users, Sparkles, Zap, FileText, ChevronRight, ChevronDown, ArrowUpRight,
  Shield, ShieldCheck, Download, Layers, Activity, CheckCircle, X,
  Lock, RefreshCw, CheckSquare, TrendingUp, Settings, BarChart3, Clock, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SharedSettingsModule from '@/components/SharedSettingsModule';
import { triggerActivityLog } from '@/utils/activity';
import { QUICK_SHORTCUTS, RECENT_APPROVALS_LOG, TEAM_HIGHLIGHTS } from '@/mock/manager';
import { useSocket } from '@/hooks/useSocket';

// --- Reusable Components (Admin Style) ---

const Card = ({ children, className = "", delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) => {
  const hasBg = className.split(' ').some(c => c.startsWith('bg-'));
  const hasPadding = className.split(' ').some(c => c.startsWith('p-') || c.startsWith('px-') || c.startsWith('py-'));
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`card-enterprise ${hasBg ? "" : "bg-surface"} ${hasPadding ? "" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
};

const Badge = ({ text, type = "default" }: { text: string, type?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const styles = {
    default: "badge-enterprise-default",
    success: "badge-enterprise-success",
    warning: "badge-enterprise-warning",
    danger: "badge-enterprise-danger",
    info: "badge-enterprise-info"
  };
  return (
    <span className={`${styles[type]} text-[9px] font-bold uppercase tracking-wider`}>
      {text}
    </span>
  );
};

// --- Interfaces & Mock Data Types ---

interface ManagerEmployee {
  id: string;          // mapped from member._id — used for PATCH /api/settings/team
  name: string;        // member.name  (DB: UserSchema.name)
  email: string;       // member.email (DB: UserSchema.email)
  role: string;        // member.role  (DB: UserSchema.role)
  status: 'Online' | 'Away' | 'Offline'; // member.status (DB: UserSchema.status)
  // ── Derived from task data (not stored on User doc) ──
  performance: string; // computed: % of tasks Done  e.g. '87%'
  workload: string;    // computed: 'High' | 'Optimal' | 'Balanced' | 'Low'
  attendance: string;  // computed: deterministic hash off name, '95%–99%'
  color: string;       // computed: CSS class e.g. 'bg-indigo-500'
  avatar: string;      // computed: initials e.g. 'SB'
  activeTasks: number; // computed: tasks.filter(stage !== 'Done').length
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
  status: string;
  progress: number;
  subtasks: { title: string; done: boolean }[];
  logs: TaskLog[];
}

// Mapped approval shape (derived from ApprovalRequest + populated Lead)
interface ApprovalItem {
  id: string;       // req._id
  user: string;     // req.requestedByName  or req.requestedBy.name
  type: string;     // req.reason  e.g. 'Close deal'
  detail: string;   // constructed from req.leadId.name / company / dealValue
  date: string;     // req.createdAt formatted
  priority: string; // derived from dealValue: Critical | High | Medium | Low
  status: string;   // 'Authorized' | 'Denied' | 'Pending' (mapped from approved|rejected|pending)
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
        <Card key={i} delay={i * 0.05} className="group border-border/60 p-5 hover:border-accent/40 transition-all">
           <div className="flex items-center gap-4 mb-4">
              <div className="relative shrink-0">
                <div className={`w-12 h-12 rounded-xl ${emp.color} text-white flex items-center justify-center text-sm font-bold shadow-sm group-hover:scale-105 transition-transform`}>
                   {emp.avatar}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-surface ${emp.status === 'Online' ? 'bg-emerald-500' : emp.status === 'Away' ? 'bg-amber-500' : 'bg-red-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                 <h4 className="text-sm font-bold text-primary truncate">{emp.name}</h4>
                 <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mt-0.5">{emp.role}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                 <button onClick={() => onToggleStatus(i)} className="px-2 py-0.5 rounded-full bg-base border border-border/80 text-[10px] font-bold text-secondary hover:text-accent hover:border-accent/40 transition-colors flex items-center gap-1.5 select-none active:scale-95">
                    <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Online' ? 'bg-emerald-500' : emp.status === 'Away' ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`} />
                    <span>{emp.status}</span>
                 </button>
                 <span className="text-[10px] text-secondary font-semibold flex items-center gap-1">
                   <CheckCircle size={10} className="text-secondary/60" /> {emp.activeTasks} Active Tasks
                 </span>
              </div>
           </div>
           <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-tertiary">
                 <span>Efficiency Rating</span>
                 <span className="text-xs font-bold text-primary font-mono">{emp.performance}</span>
              </div>
              <div className="w-full h-1.5 bg-base rounded-full overflow-hidden border border-border/10">
                 <motion.div initial={{ width: 0 }} animate={{ width: emp.performance }} transition={{ duration: 1, delay: 0.3 }} className="h-full bg-gradient-to-r from-accent to-indigo-500 rounded-full"></motion.div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-border mt-4">
                 <span className="text-[10px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                   Workload: 
                   <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                     emp.workload === 'High' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                     emp.workload === 'Optimal' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                     'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                   }`}>{emp.workload}</span>
                 </span>
                 <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Attendance: <span className="text-secondary/70 font-semibold normal-case">Not tracked</span></span>
              </div>
           </div>
        </Card>
      ))}
    </div>
  </div>
);

const SectionSpinner = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center p-12 text-primary bg-surface/20 border border-border/60 border-dashed rounded-2xl">
     <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="text-[10px] font-bold uppercase tracking-widest text-secondary animate-pulse">{message}</div>
     </div>
  </div>
);

const SectionError = ({ message }: { message: string }) => (
  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2">
     <AlertTriangle size={14} />
     <span>{message}</span>
  </div>
);

// --- Main Manager Dashboard Shell ---

function ManagerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useUI();
  
  const [activeTab, setActiveTab] = useState<'team' | 'approvals' | 'progress' | 'reports' | 'settings'>('team');
  const [isLoading, setIsLoading] = useState(true);

  // Section specific loading and error states
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);

  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Database persistent states
  const [employees, setEmployees] = useState<ManagerEmployee[]>([]);
  const [tasks, setTasks] = useState<ManagerTask[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Real-time Presence
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;
    const onChatEvent = (payload: any) => {
      if (payload.type === 'presence_snapshot') {
        setOnlineUserIds(new Set<string>(payload.onlineUserIds ?? []));
      } else if (payload.type === 'presence_change') {
        const { userId, isOnline } = payload;
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          if (isOnline) {
            next.add(userId);
          } else {
            next.delete(userId);
          }
          return next;
        });
      }
    };
    socket.on('chat_event', onChatEvent);
    return () => {
      socket.off('chat_event', onChatEvent);
    };
  }, [socket]);

  // Derived state combining DB values with socket-derived real-time presence
  const employeesWithRealtimePresence = useMemo(() => {
    return employees.map(emp => ({
      ...emp,
      status: (onlineUserIds.has(emp.id) ? 'Online' : emp.status) as 'Online' | 'Away' | 'Offline'
    }));
  }, [employees, onlineUserIds]);

  // Modals & form states
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [editingEmployees, setEditingEmployees] = useState<ManagerEmployee[]>([]);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [briefingStep, setBriefingStep] = useState(0);

  // Collapse states for sidebar cards
  const [isPulseCollapsed, setIsPulseCollapsed] = useState(false);
  const [isInsightsCollapsed, setIsInsightsCollapsed] = useState(false);
  const [isQuickLinksCollapsed, setIsQuickLinksCollapsed] = useState(false);

  // getVelocityData returns normalised heights for the chart bars.
  // Returns fallback bars when no task data exists.
  const getVelocityData = (): number[] => {
    if (tasks.length === 0) return Array(12).fill(15); // flat baseline bars
    const buckets = Array(12).fill(0);
    tasks.forEach(t => {
      const idx = t.id ? (t.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 12) : 0;
      buckets[idx] += t.progress || 0;
    });
    const maxVal = Math.max(...buckets, 1);
    return buckets.map(val => Math.min(100, Math.max(15, Math.round((val / maxVal) * 80) + 15)));
  };

  // ── DATA FETCHING ENGINE ───────────────────────────────────────────────────
  
  const fetchDashboardData = async () => {
    setLoadingTeam(true);
    setTeamError(null);
    try {
      const teamRes = await fetch('/api/settings/team', { credentials: 'include' });
      if (!teamRes.ok) throw new Error(`HTTP error! status: ${teamRes.status}`);
      const teamData = await teamRes.json();
      if (!teamData.success) throw new Error(teamData.error);
      
      const tasksRes = await fetch('/api/tasks', { credentials: 'include' });
      if (!tasksRes.ok) throw new Error(`HTTP error! status: ${tasksRes.status}`);
      const tasksData = await tasksRes.json();
      if (!tasksData.success) throw new Error(tasksData.error);
      
      const mappedEmployees: ManagerEmployee[] = teamData.members.map((member: any) => {
        const initials = member.name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
        
        const userTasks = tasksData.tasks.filter((t: any) => 
          t.assignee && (t.assignee.toLowerCase() === member.name.toLowerCase() || t.assignee.toLowerCase() === member.email.toLowerCase())
        );
        const activeTasksCount = userTasks.filter((t: any) => t.stage !== 'Done').length;
        const doneTasks = userTasks.filter((t: any) => t.stage === 'Done').length;
        const totalTasks = userTasks.length;
        
        const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-accent', 'bg-orange-500', 'bg-rose-500', 'bg-purple-500', 'bg-pink-500'];
        const colorIdx = member.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
        const color = colors[colorIdx];
        
        const performanceVal = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 85;
        
        let workload = 'Low';
        if (activeTasksCount > 3) workload = 'High';
        else if (activeTasksCount > 1) workload = 'Optimal';
        else if (activeTasksCount === 1) workload = 'Balanced';
        
        const attendanceVal = 95 + (member.name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 5);
        
        return {
          id: member._id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status || 'Offline',
          performance: `${performanceVal}%`,
          workload,
          attendance: `${attendanceVal}%`,
          color,
          avatar: initials,
          activeTasks: activeTasksCount
        };
      });
      setEmployees(mappedEmployees);
      
      const mappedTasks: ManagerTask[] = tasksData.tasks.map((t: any) => {
        return {
          id: t._id,
          title: t.title,
          desc: t.description || 'Strategic operational directive.',
          priority: t.priority || 'Medium',
          owner: t.assignee || 'Unassigned',
          deadline: t.dueDate ? new Date(t.dueDate).toISOString().substring(0, 10) : '',
          status: t.stage,
          progress: t.progress || (t.stage === 'Done' ? 100 : 0),
          subtasks: t.subtasks || [],
          logs: t.logs || []
        };
      });
      setTasks(mappedTasks);
      
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      const msg = err.message || 'Failed to load dashboard data from database';
      setTeamError(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchApprovals = async () => {
    setLoadingApprovals(true);
    setApprovalsError(null);
    try {
      const res = await fetch('/api/leads/approval', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      const mappedApprovals = data.requests.map((req: any) => {
        const valStr = req.dealValue || req.leadId?.value || '0';
        const valNumeric = parseFloat(valStr.replace(/[^0-9.]/g, '')) || 0;
        let calculatedPriority = 'Low';
        if (valNumeric >= 100000) calculatedPriority = 'Critical';
        else if (valNumeric >= 25000) calculatedPriority = 'High';
        else if (valNumeric >= 5000) calculatedPriority = 'Medium';

        return {
          id: req._id,
          user: req.requestedByName || req.requestedBy?.name || 'Unknown',
          type: req.reason || 'Deal Approval Request',
          detail: `Requested approval for lead "${req.leadId?.name || 'Unknown'}" (${req.leadId?.company || 'No Company'}). Value: ${req.dealValue || req.leadId?.value || '$0'}`,
          date: new Date(req.createdAt).toLocaleDateString() + ' ' + new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          priority: calculatedPriority,
          status: req.status === 'approved' ? 'Authorized' : req.status === 'rejected' ? 'Denied' : 'Pending'
        };
      });
      setApprovals(mappedApprovals);
    } catch (err: any) {
      console.error('Error fetching approvals:', err);
      setApprovalsError(err.message || 'Failed to load approvals');
    } finally {
      setLoadingApprovals(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const res = await fetch('/api/analytics?period=month', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setAnalytics(data);
      } else {
        throw new Error(data.error || 'Failed to load analytics');
      }
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setAnalyticsError((err as any).message || 'Failed to load analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const meData = await meRes.json();
        if (meData.success) {
          setCurrentUser(meData.user);
        }
      } catch (meErr) {
        console.error('Error fetching manager self auth:', meErr);
      }
      await Promise.all([
        fetchDashboardData(),
        fetchApprovals(),
        fetchAnalytics()
      ]);
    } catch (err) {
      console.error('Error loading all data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (tab && ['team', 'approvals', 'progress', 'reports', 'settings'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  useEffect(() => {
    if (showRolesModal) {
      setEditingEmployees(JSON.parse(JSON.stringify(employees)));
    }
  }, [showRolesModal, employees]);

  // ── WORKFLOW MUTATIONS (DATABASE CONNECTED) ────────────────────────────────
  
  const toggleStatus = async (idx: number) => {
    const emp = employeesWithRealtimePresence[idx];
    const newStatus = emp.status === 'Online' ? 'Offline' : emp.status === 'Offline' ? 'Away' : 'Online';
    try {
      const res = await fetch('/api/settings/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ userId: (emp as any).id, status: newStatus })
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      showToast(`Status of ${emp.name} updated to ${newStatus}`, 'success');
      await fetchDashboardData();
      triggerActivityLog('workflow_action', `Toggled check-in status for employee ${emp.name} to ${newStatus}`).catch(console.error);
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleUpdateRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      for (const emp of editingEmployees) {
        const original = employees.find(originalEmp => (originalEmp as any).id === (emp as any).id);
        if (original && original.role !== emp.role) {
          const res = await fetch('/api/settings/team', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
            credentials: 'include',
            body: JSON.stringify({ userId: (emp as any).id, role: emp.role })
          });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        }
      }
      showToast('Personnel roles and structural ranks updated successfully!', 'success');
      await fetchDashboardData();
      triggerActivityLog('workflow_action', 'Updated personnel roles and structural ranks').catch(console.error);
      setShowRolesModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to update roles', 'error');
    }
  };

  const handleAuthorizeApproval = async (approvalId: string) => {
    try {
      const res = await fetch(`/api/leads/approval/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ status: 'approved' })
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('Approval authorized successfully.', 'success');
      triggerActivityLog('workflow_action', `Authorized approval request ${approvalId}`).catch(console.error);
      await fetchApprovals();
    } catch (err: any) {
      showToast(err.message || 'Failed to authorize approval', 'error');
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
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      showToast('Approval request denied.', 'success');
      triggerActivityLog('workflow_action', `Denied approval request ${approvalId}`).catch(console.error);
      await fetchApprovals();
    } catch (err: any) {
      showToast(err.message || 'Failed to deny approval', 'error');
    }
  };

  const handleApproveTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ stage: 'Done' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Task approved and completed!', 'success');
        await fetchDashboardData();
      } else {
        showToast(data.error || 'Failed to approve task', 'error');
      }
    } catch {
      showToast('Error approving task', 'error');
    }
  };

  const handleRejectTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        credentials: 'include',
        body: JSON.stringify({ stage: 'In Progress' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Task rejected and sent back to In Progress.', 'info');
        await fetchDashboardData();
      } else {
        showToast(data.error || 'Failed to reject task', 'error');
      }
    } catch {
      showToast('Error rejecting task', 'error');
    }
  };

  const handleGenerateBriefing = () => {
    setIsBriefingLoading(true);
    setShowBriefingModal(true);
    setBriefingStep(0);
    setTimeout(() => setBriefingStep(1), 600);
    setTimeout(() => setBriefingStep(2), 1200);
    setTimeout(() => setIsBriefingLoading(false), 1800);
  };

  const handleApplyBriefingDirective = () => {
    showToast('Briefing directive broadcasted to Department Hub!', 'success');
    triggerActivityLog('workflow_action', 'Applied executive briefing directive: [APAC Cloudflare Sync]').catch(console.error);
    setShowBriefingModal(false);
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] text-primary">
         <div className="flex flex-col items-center gap-4">
           <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
           <div className="text-xs font-bold uppercase tracking-widest animate-pulse">Loading Command Console...</div>
         </div>
      </div>
    );
  }

  // Settings tab gets a full-page layout bypassing the two-column grid
   return (
    <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 md:py-10">
      
      {/* Header Info Section */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-border/40 pb-8"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-2.5">
             <Badge text="Executive Mode" type="info" />
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-bold text-accent uppercase tracking-wider leading-none">Live System Feed</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-primary tracking-tight">Manager Command Panel</h1>
          <p className="text-secondary text-sm mt-1">Direct oversight of personnel velocity, decision overrides, and performance charts.</p>
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
           <div className="bg-surface border border-border p-3.5 rounded-xl flex items-center gap-4 shadow-sm">
              <div className="text-right border-r border-border pr-4">
                 <div className="text-[9px] font-bold text-secondary uppercase tracking-wider leading-none">System Health</div>
                 <div className="text-base font-bold text-primary mt-1.5 leading-none font-mono">99.8%</div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                    <Activity size={18} />
                 </div>
              </div>
           </div>
        </div>
      </motion.div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 md:gap-10">
        
        {/* Left/Middle Column (Dynamic Content) */}
        <div className="xl:col-span-2 space-y-8 md:space-y-10">
           <AnimatePresence mode="wait">
              {activeTab === 'team' && (
                <motion.div key="team" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                   {loadingTeam ? (
                     <SectionSpinner message="Fetching Team Analytics..." />
                   ) : teamError ? (
                     <SectionError message={teamError} />
                   ) : (
                      <TeamModule employees={employeesWithRealtimePresence} onManageRoles={() => setShowRolesModal(true)} onToggleStatus={toggleStatus} />
                   )}
                </motion.div>
              )}
              
              {activeTab === 'approvals' && (
                <motion.div key="approvals" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-6">
                      <h2 className="text-xl font-bold text-primary">Decision Protocols</h2>
                      <p className="text-secondary text-xs">Authorized approvals for system resources and personnel override requests.</p>
                   </div>
                   
                   <div className="space-y-6">
                       {/* Task Review Queue */}
                       <div className="space-y-4">
                         <h3 className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-1.5">📝 Task Review Queue</h3>
                         {tasks.filter(t => t.status === 'Review' || t.status === 'Under Review' || t.status === 'Review Requested').length === 0 ? (
                           <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-surface/30">
                             <p className="text-xs text-secondary font-medium">No tasks pending review.</p>
                           </div>
                         ) : (
                           tasks.filter(t => t.status === 'Review' || t.status === 'Under Review' || t.status === 'Review Requested').map((task, i) => (
                             <Card key={i} className="p-5 border-border/60 hover:border-accent/40 transition-all group">
                               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                 <div className="flex items-start gap-4">
                                   <div className="min-w-0">
                                     <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                       <span className="text-xs font-bold text-primary">{task.title}</span>
                                       <Badge text={task.priority} type={task.priority === 'Critical' ? 'danger' : 'default'} />
                                     </div>
                                     <p className="text-[11px] text-secondary font-medium">{task.desc}</p>
                                     <div className="text-[9px] text-tertiary font-bold uppercase mt-2.5">Assignee: {task.owner}</div>
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0">
                                   <button onClick={() => handleRejectTask(task.id)} className="btn-enterprise-secondary px-4 py-1.5 text-[10px] font-bold uppercase hover:bg-rose-500/5 hover:text-rose-500 hover:border-rose-500/20 active:scale-95">Reject</button>
                                   <button onClick={() => handleApproveTask(task.id)} className="btn-enterprise-primary px-4 py-1.5 text-[10px] font-bold uppercase active:scale-95">Approve</button>
                                 </div>
                               </div>
                             </Card>
                           ))
                         )}
                       </div>

                       {/* Deal Approvals */}
                       <div className="space-y-4 pt-6 border-t border-border/60">
                         <h3 className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-1.5">💰 Deal Approvals</h3>
                         {loadingApprovals ? (
                           <SectionSpinner message="Loading Decisions..." />
                         ) : approvalsError ? (
                           <SectionError message={approvalsError} />
                         ) : approvals.length === 0 ? (
                           <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-surface/30">
                             <Shield size={24} className="text-accent/30 mx-auto mb-2" />
                             <p className="text-xs text-secondary font-medium">No pending deal approvals.</p>
                           </div>
                         ) : approvals.map((req, i) => (
                           <Card key={i} delay={i * 0.05} className="p-5 border-border/60 hover:border-accent/40 hover:shadow-md transition-all group">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                 <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center shrink-0 text-accent group-hover:border-accent/35 transition-colors">
                                       <Shield size={18} />
                                    </div>
                                    <div className="min-w-0">
                                       <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                          <span className="text-xs font-bold text-primary">{req.user}</span>
                                          <Badge text={req.type} type="info" />
                                          <Badge text={req.priority} type={req.priority === 'Critical' ? 'danger' : req.priority === 'High' ? 'warning' : 'default'} />
                                       </div>
                                       <p className="text-[11px] text-secondary font-medium leading-relaxed">{req.detail}</p>
                                       <div className="text-[9px] text-tertiary font-bold uppercase mt-2.5 tracking-wider font-mono">{req.id} · Requested {req.date}</div>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0">
                                    {req.status !== 'Pending' ? (
                                       <Badge text={req.status} type={req.status === 'Authorized' ? 'success' : 'danger'} />
                                    ) : (
                                       <div className="flex items-center gap-2">
                                          <button onClick={() => handleDenyApproval(req.id)} className="btn-enterprise-secondary px-4 py-1.5 text-[10px] font-bold uppercase hover:bg-rose-500/5 hover:text-rose-500 hover:border-rose-500/20 active:scale-95">Deny</button>
                                          <button onClick={() => handleAuthorizeApproval(req.id)} className="btn-enterprise-primary px-4 py-1.5 text-[10px] font-bold uppercase active:scale-95">Authorize</button>
                                       </div>
                                    )}
                                 </div>
                              </div>
                           </Card>
                         ))}
                       </div>
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

                     {loadingAnalytics ? (
                       <SectionSpinner message="Fetching Performance Analytics..." />
                     ) : analyticsError ? (
                       <SectionError message={analyticsError} />
                     ) : (
                       <>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2 p-5 border-border/60">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Velocity Output</h3>
                              <Badge text="Last 30 Days" type="info" />
                           </div>
                           <div className="h-64 flex items-end gap-3 px-2 pb-2">
                              {getVelocityData().map((h, i) => (
                                <div key={i} className="flex-1 h-full flex flex-col justify-end items-center">
                                   <div className="w-full h-48 flex items-end">
                                      <motion.div 
                                       initial={{ height: 0 }} 
                                       animate={{ height: `${h}%` }} 
                                       transition={{ delay: i * 0.03, duration: 0.8 }}
                                       className="w-full bg-gradient-to-t from-accent/20 to-accent/80 rounded-t-lg group relative hover:from-accent hover:to-indigo-500 transition-all cursor-pointer shadow-sm"
                                      >
                                         <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20 border border-border/30">
                                           {h}% Yield
                                         </div>
                                      </motion.div>
                                   </div>
                                   <span className="text-[9px] font-bold text-tertiary mt-2.5 font-mono">W{i+1}</span>
                                </div>
                              ))}
                           </div>
                        </Card>
                        <div className="space-y-6">
                           <Card className="relative overflow-hidden group p-5 border-border/60">
                              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-50"></div>
                              <div className="relative z-10">
                                 <div className="flex items-center gap-3 mb-4">
                                    <Sparkles size={18} className="text-accent animate-pulse" />
                                    <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Completion Rate</h4>
                                 </div>
                                 <div className="text-5xl font-black mb-3 tracking-tighter text-accent font-mono">
                                    {analytics ? `${analytics.tasks.completionRate}%` : `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100) : 0}%`}
                                  </div>
                                  <p className="text-[11px] text-secondary font-medium leading-relaxed">
                                    {analytics ? `Tasks: ${analytics.tasks.change} vs last period. ${analytics.tasks.total} total initiatives tracked.` : `${tasks.filter(t => t.status === 'Done').length} of ${tasks.length} tasks completed this period.`}
                                  </p>
                              </div>
                           </Card>
                           <Card className="p-5 border-border/60">
                              <h4 className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-4">Core Bottlenecks</h4>
                              <div className="space-y-4">
                                 <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-bold">
                                       <span className="text-secondary">Lead Routing Handoff</span>
                                       <span className="text-rose-500 font-mono">2.4 days</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-base rounded-full overflow-hidden border border-border/10">
                                       <div className="w-3/4 h-full bg-rose-500 rounded-full"></div>
                                    </div>
                                 </div>
                                 <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-bold">
                                       <span className="text-secondary">Egress Node Checks</span>
                                       <span className="text-amber-500 font-mono">1.1 days</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-base rounded-full overflow-hidden border border-border/10">
                                       <div className="w-1/2 h-full bg-amber-500 rounded-full"></div>
                                    </div>
                                 </div>
                              </div>
                           </Card>
                        </div>
                     </div>
                       </>
                     )}
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
                        <Card key={i} className="flex items-center justify-between p-4.5 border-border/60 hover:border-accent/40 transition-colors group">
                           <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center group-hover:border-accent/40 group-hover:text-accent transition-all shrink-0">
                                 <FileText size={18} className="text-secondary group-hover:text-accent transition-colors" />
                              </div>
                              <div className="min-w-0">
                                 <h4 className="text-xs font-bold text-primary truncate group-hover:text-accent transition-colors">{report.title}</h4>
<p className="text-[10px] text-secondary font-semibold uppercase tracking-wider mt-0.5">{report.size} · {report.type}</p>
                              </div>
                           </div>
                           <button onClick={() => handleDownloadCSV(report.title)} className="btn-enterprise-secondary p-2 group-hover:text-accent group-hover:border-accent/30 active:scale-90" title="Export CSV">
                              <Download size={14} />
                           </button>
                        </Card>
                      ))}
                   </div>
                </motion.div>
              )}
           </AnimatePresence>
        </div>

          {/* Right Sidebar (Pulse, Shortcuts, Highlights & AI Briefings) */}
          <div className="space-y-6">
             {/* Strategic Pulse */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div 
                   className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors" 
                   onClick={() => setIsPulseCollapsed(!isPulseCollapsed)}
                >
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider flex items-center gap-2">
                      <Activity size={13} className="text-secondary" />
                      Strategic Pulse
                   </h3>
                   <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isPulseCollapsed ? '-rotate-90' : ''}`} />
                </div>
                <motion.div 
                   initial={false}
                   animate={{ height: isPulseCollapsed ? 0 : 'auto', opacity: isPulseCollapsed ? 0 : 1 }}
                   transition={{ duration: 0.2 }}
                   className="overflow-hidden"
                >
                   <div className="px-5 pb-5 space-y-5">
                      <div>
                         <div className="flex justify-between items-center mb-2 text-xs">
                            <span className="font-semibold text-secondary">Global Performance</span>
                            <span className="font-bold text-emerald-500">{analytics?.tasks?.change ?? analytics?.revenue?.change ?? '+8.4%'}</span>
                         </div>
                         <div className="h-10 flex items-end gap-1.5 px-1">
                            {[30, 45, 60, 40, 55, 80, 70, 90, 65, 85].map((h, i) => (
                              <div key={i} className="flex-1 bg-accent/20 rounded-t group relative cursor-pointer hover:bg-accent transition-colors" style={{ height: `${h}%` }}>
                                 <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-[9px] font-bold px-1.5 py-0.5 rounded border border-border/30 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 font-mono">Week {i+1}</div>
                              </div>
                            ))}
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3.5 pt-4 border-t border-border/40">
                         <div className="p-3 bg-base border border-border rounded-xl">
                            <div className="text-[9px] font-bold text-tertiary uppercase tracking-wider mb-1">Revenue</div>
                            <div className="text-sm font-bold text-primary font-mono">
                               {analytics?.revenue?.current
                                 ? `₹${Math.round(analytics.revenue.current).toLocaleString()}`
                                 : '₹14,50,000'}
                            </div>
                         </div>
                         <div className="p-3 bg-base border border-border rounded-xl">
                            <div className="text-[9px] font-bold text-tertiary uppercase tracking-wider mb-1">Task Rate</div>
                            <div className="text-sm font-bold text-primary font-mono">
                               {analytics
                                 ? `${analytics.tasks.completionRate}%`
                                 : `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100) : 85}%`}
                            </div>
                         </div>
                      </div>
                   </div>
                </motion.div>
             </Card>

             {/* Executive Insights (AI Briefing) */}
             <Card className="relative group overflow-hidden p-0 border-border/60">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-accent/10 transition-colors pointer-events-none"></div>
                <div className="relative z-10">
                   <div 
                      className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors" 
                      onClick={() => setIsInsightsCollapsed(!isInsightsCollapsed)}
                   >
                      <div className="flex items-center gap-2">
                         <Zap size={13} className="text-accent animate-pulse" />
                         <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Executive Insights</h3>
                      </div>
                      <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isInsightsCollapsed ? '-rotate-90' : ''}`} />
                   </div>
                   <motion.div 
                      initial={false}
                      animate={{ height: isInsightsCollapsed ? 0 : 'auto', opacity: isInsightsCollapsed ? 0 : 1 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                   >
                      <div className="px-5 pb-5">
                         <p className="text-xs text-secondary leading-relaxed mb-4 font-medium">Based on last week&apos;s sprint velocity, we recommend accelerating the <b>R2 Migration</b> to bypass upcoming bandwidth throttles.</p>
                         <button 
                            onClick={handleGenerateBriefing} 
                            className="btn-enterprise-primary w-full text-xs py-2 font-bold flex items-center justify-center gap-1.5"
                         >
                            <Sparkles size={13} /> Generate AI Briefing
                         </button>
                      </div>
                   </motion.div>
                </div>
             </Card>

             {/* Team Highlights Widget (Future Ready) */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors">
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider flex items-center gap-2">
                      <Sparkles size={13} className="text-accent animate-pulse" />
                      Team Highlights
                   </h3>
                </div>
                <div className="px-5 pb-5 space-y-3">
                   {TEAM_HIGHLIGHTS.map((h, i) => (
                      <div key={i} className="p-3 bg-base border border-border/60 rounded-xl flex flex-col gap-1 hover:border-accent/30 transition-colors">
                         <span className="text-[9px] font-bold text-tertiary uppercase tracking-wider">{h.label}</span>
                         <span className="text-xs font-bold text-primary">{h.value}</span>
                         <span className="text-[10px] text-secondary font-medium">{h.trend}</span>
                      </div>
                   ))}
                </div>
             </Card>

             {/* Quick Team Shortcuts (Future Ready) */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors">
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider flex items-center gap-2">
                      <Zap size={13} className="text-purple-500 animate-pulse" />
                      Quick Shortcuts
                   </h3>
                </div>
                <div className="px-5 pb-5 space-y-2.5">
                   {QUICK_SHORTCUTS.map((item, i) => (
                      <button 
                         key={i} 
                         onClick={() => {
                            showToast(`Shortcut execution: ${item.name}`, 'success');
                            triggerActivityLog('workflow_action', `Executed manager shortcut: [${item.name}]`).catch(console.error);
                         }} 
                         className="w-full text-left p-3 bg-base border border-border/60 rounded-xl hover:border-accent/40 hover:bg-accent/[0.01] transition-all flex items-start gap-2.5 active:scale-98"
                      >
                         <Lock size={12} className="text-secondary/70 mt-0.5 shrink-0" />
                         <div>
                            <div className="text-xs font-bold text-primary">{item.name}</div>
                            <div className="text-[10px] text-secondary font-medium mt-0.5 leading-relaxed">{item.description}</div>
                         </div>
                      </button>
                   ))}
                </div>
             </Card>

             {/* Overdue Tasks Widget */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div className="flex justify-between items-center select-none p-5 hover:bg-base/30 transition-colors">
                   <h3 className="text-[10px] font-bold text-rose-500 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle size={13} className="text-rose-500 animate-pulse" />
                      Overdue Tasks
                   </h3>
                </div>
                <div className="px-5 pb-5 space-y-2.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                   {tasks.filter(t => t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date()).length === 0 ? (
                      <p className="text-[10px] text-secondary italic">No overdue tasks.</p>
                   ) : (
                      tasks.filter(t => t.status !== 'Done' && t.deadline && new Date(t.deadline) < new Date()).map((t, i) => (
                         <div key={i} className="p-3 bg-base border border-border/60 rounded-xl space-y-1.5 hover:border-red-500/20 transition-colors">
                            <div className="flex justify-between items-center">
                               <span className="text-xs font-bold text-primary truncate max-w-[150px]">{t.title}</span>
                               <span className="text-[9px] font-bold text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">{t.priority}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-secondary font-medium">
                               <span>Owner: {t.owner}</span>
                               <span className="text-rose-500 font-bold">Due: {t.deadline}</span>
                            </div>
                         </div>
                      ))
                   )}
                </div>
             </Card>

             {/* Recently Approved Widget (Future Ready) */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors">
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck size={13} className="text-emerald-500" />
                      Recently Approved
                   </h3>
                </div>
                <div className="px-5 pb-5 space-y-2.5">
                   {RECENT_APPROVALS_LOG.map((item, i) => (
                      <div key={i} className="p-3 bg-base border border-border/60 rounded-xl space-y-1.5 hover:border-accent/35 transition-colors">
                         <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-primary truncate max-w-[120px]">{item.leadName}</span>
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono shrink-0">{item.amount}</span>
                         </div>
                         <div className="flex justify-between items-center text-[10px] text-secondary font-medium">
                            <span>By: {item.approvedBy}</span>
                            <span className="text-tertiary">{item.timestamp}</span>
                         </div>
                      </div>
                   ))}
                </div>
             </Card>

             {/* Quick Links */}
             <Card className="p-0 overflow-hidden border-border/60">
                <div 
                   className="flex justify-between items-center cursor-pointer select-none p-5 hover:bg-base/30 transition-colors" 
                   onClick={() => setIsQuickLinksCollapsed(!isQuickLinksCollapsed)}
                >
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-wider flex items-center gap-2">
                      <Layers size={13} className="text-secondary" />
                      Quick Links
                   </h3>
                   <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isQuickLinksCollapsed ? '-rotate-90' : ''}`} />
                </div>
                <motion.div 
                   initial={false}
                   animate={{ height: isQuickLinksCollapsed ? 0 : 'auto', opacity: isQuickLinksCollapsed ? 0 : 1 }}
                   transition={{ duration: 0.2 }}
                   className="overflow-hidden"
                >
                   <div className="px-5 pb-5 space-y-1">
                      {[
                        { name: 'Resource Allocation', icon: Layers, href: '/tasks' },
                        { name: 'Security Audit', icon: ShieldCheck, href: '/manager?tab=approvals' },
                        { name: 'Export Monthly Reports', icon: Download, href: '/manager?tab=reports' },
                      ].map((link, i) => (
                        <button 
                           key={i} 
                           onClick={() => router.push(link.href)} 
                           className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-base/60 transition-all duration-200 group border border-transparent hover:border-border/30 text-left"
                        >
                           <div className="flex items-center gap-2.5">
                              <link.icon size={13} className="text-secondary group-hover:text-accent transition-colors" />
                              <span className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors">{link.name}</span>
                           </div>
                           <ChevronRight size={12} className="text-tertiary group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                   </div>
                </motion.div>
             </Card>
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
                         <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Utilisation</div>
                         <div className="text-xs font-bold text-primary">
                           {analytics ? `${(analytics.team.utilisation / 100).toFixed(2)}x` : '—'}
                         </div>
                       </div>
                       <div className="p-3 bg-base border border-border rounded-xl text-center">
                         <div className="text-[9px] font-bold text-tertiary uppercase mb-0.5">Completion</div>
                         <div className="text-xs font-bold text-emerald-500">
                           {analytics ? `${analytics.tasks.completionRate}%` : `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100) : 0}%`}
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
                        <span className="text-secondary">Reallocate <b className="text-primary">{employees[0]?.name || 'Personnel'}</b> to support <b className="text-primary">{employees[1]?.name || 'Staff'}</b></span>
                        <span className="font-bold text-accent text-[9px] uppercase">Actionable</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowBriefingModal(false)}
                      className="btn-enterprise-secondary flex-1 py-2 text-xs"
                    >
                      Close
                    </button>
                    <button 
                      type="button"
                      onClick={handleApplyBriefingDirective}
                      className="btn-enterprise-primary flex-1 py-2 text-xs"
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
                        <select
                          value={emp.role}
                          onChange={e => {
                            const updated = [...editingEmployees];
                            updated[idx].role = e.target.value;
                            setEditingEmployees(updated);
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
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowRolesModal(false)}
                    className="btn-enterprise-secondary flex-1 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="btn-enterprise-primary flex-1 py-2 text-xs"
                  >
                    Apply Changes
                  </button>
                </div>
              </form>
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

