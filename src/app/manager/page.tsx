'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { 
  Users, Sparkles, Zap,
  FileText, ChevronRight, ArrowUpRight,
  Shield, ShieldCheck, Download, Layers,
  Activity, CheckCircle, X
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
  status: 'To Do' | 'In Progress' | 'Under Review' | 'Done' | 'Blocked';
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
                 <span className="text-[10px] font-bold text-secondary uppercase">Attendance: <span className="text-tertiary font-medium normal-case">Not tracked</span></span>
              </div>
           </div>
        </Card>
      ))}
    </div>
  </div>
);

const SectionSpinner = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center p-8 text-primary">
     <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="text-[10px] font-bold uppercase tracking-widest animate-pulse">{message}</div>
     </div>
  </div>
);

const SectionError = ({ message }: { message: string }) => (
  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold text-center">
     {message}
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

  // Modals & form states
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [editingEmployees, setEditingEmployees] = useState<ManagerEmployee[]>([]);
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [briefingStep, setBriefingStep] = useState(0);

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
    const emp = employees[idx];
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
                   {loadingTeam ? (
                     <SectionSpinner message="Fetching Team Analytics..." />
                   ) : teamError ? (
                     <SectionError message={teamError} />
                   ) : (
                     <TeamModule employees={employees} onManageRoles={() => setShowRolesModal(true)} onToggleStatus={toggleStatus} />
                   )}
                </motion.div>
              )}
              
              {activeTab === 'approvals' && (
                <motion.div key="approvals" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <div className="flex flex-col gap-1 mb-6">
                      <h2 className="text-xl font-bold text-primary">Decision Protocols</h2>
                      <p className="text-secondary text-xs">Authorized approvals for system resources and personnel override requests.</p>
                   </div>
                   
                   <div className="space-y-4">
                       {loadingApprovals ? (
                         <SectionSpinner message="Loading Decisions..." />
                       ) : approvalsError ? (
                         <SectionError message={approvalsError} />
                       ) : approvals.length === 0 ? (
                         <div className="p-12 text-center border border-dashed border-border rounded-3xl bg-surface/30">
                           <Shield size={32} className="text-accent/30 mx-auto mb-4" />
                           <p className="text-sm font-bold text-secondary mb-1">All Clear</p>
                           <p className="text-xs text-tertiary">No pending approval requests. All decisions are resolved.</p>
                         </div>
                       ) : approvals.map((req, i) => (
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

                     {loadingAnalytics ? (
                       <SectionSpinner message="Fetching Performance Analytics..." />
                     ) : analyticsError ? (
                       <SectionError message={analyticsError} />
                     ) : (
                       <>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2">
                           <div className="flex items-center justify-between mb-6">
                              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Velocity Output</h3>
                              <Badge text="Last 30 Days" type="info" />
                           </div>
                           <div className="h-64 flex items-end gap-2 px-2 pb-2">
                              {getVelocityData().map((h, i) => (
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
                                    <h4 className="text-sm font-bold text-primary">Completion Rate</h4>
                                 </div>
                                 <div className="text-5xl font-black mb-2 tracking-tighter text-accent">
                                    {analytics ? `${analytics.tasks.completionRate}%` : `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100) : 0}%`}
                                  </div>
                                  <p className="text-[11px] text-secondary font-medium leading-relaxed">
                                    {analytics ? `Tasks: ${analytics.tasks.change} vs last period. ${analytics.tasks.total} total initiatives tracked.` : `${tasks.filter(t => t.status === 'Done').length} of ${tasks.length} tasks completed this period.`}
                                  </p>
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
                       <span className="text-xs font-bold text-emerald-500">{analytics?.tasks?.change ?? analytics?.revenue?.change ?? '+0%'}</span>
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
                       <div className="text-[10px] font-bold text-tertiary uppercase mb-1">Revenue</div>
                       <div className="text-lg font-bold text-primary">
                          {analytics?.revenue?.current
                            ? `₹${Math.round(analytics.revenue.current).toLocaleString()}`
                            : '—'}
                        </div>
                    </div>
                    <div className="p-4 bg-base border border-border rounded-xl">
                       <div className="text-[10px] font-bold text-tertiary uppercase mb-1">Task Rate</div>
                       <div className="text-lg font-bold text-primary">
                          {analytics
                            ? `${analytics.tasks.completionRate}%`
                            : `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100) : 0}%`}
                        </div>
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
                        <select
                          value={emp.role}
                          onChange={e => {
                            const updated = [...editingEmployees];
                            updated[idx].role = e.target.value;
                            setEditingEmployees(updated);
                          }}
                          className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
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

