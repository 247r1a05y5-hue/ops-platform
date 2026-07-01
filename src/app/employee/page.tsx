'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import { 
  CheckSquare, Clock, MessageSquare, Star, CheckCircle, 
  Pause, Play, RotateCcw, Save, BarChart3, 
  ChevronRight, ChevronDown, X, Paperclip, Check, ListChecks,
  Search, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SharedSettingsModule from '@/components/SharedSettingsModule';
import { triggerActivityLog } from '@/utils/activity';
import ChatModule from '@/components/ChatModule';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useSocket } from '@/hooks/useSocket';

// --- Reusable Components ---

const Card = ({ children, className = "", delay = 0, onClick }: { children: React.ReactNode, className?: string, delay?: number, onClick?: () => void }) => {
  const hasBg = className.split(' ').some(c => c.startsWith('bg-'));
  const hasPadding = className.split(' ').some(c => c.startsWith('p-') || c.startsWith('px-') || c.startsWith('py-'));
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      onClick={onClick}
      className={`card-enterprise ${hasBg ? "" : "bg-surface"} ${hasPadding ? "" : ""} ${className} ${onClick ? 'cursor-pointer' : ''}`}
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

// --- Interfaces ---

interface TaskLog {
  time: string;
  note: string;
  author: string;
}

interface SubTask {
  title: string;
  done: boolean;
}

interface EmployeeTask {
  id: any;
  _id?: string;
  title: string;
  desc: string;
  due: string;
  priority: 'Critical' | 'High' | 'Normal' | 'Medium' | 'Low';
  status: string;
  progress: number;
  estimatedHours: number;
  completed: boolean;
  subtasks: SubTask[];
  attachments: string[];
  logs: TaskLog[];
}

// --- Sub-Modules ---

const WorkspaceModule = ({ tasks, onFullSchedule, onOpenTask }: { tasks: EmployeeTask[]; onFullSchedule: () => void; onOpenTask: (task: EmployeeTask) => void }) => {
  const activeTasks = tasks.filter(t => t.status !== 'Done');
  const completedTasks = tasks.filter(t => t.status === 'Done');

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-sm font-bold text-primary">Assigned Initiatives</h3>
            <p className="text-[11px] text-secondary font-medium mt-0.5">High priority tasks requiring operational clearance.</p>
          </div>
          <button onClick={onFullSchedule} className="text-xs font-bold text-accent uppercase tracking-wider hover:underline flex items-center gap-1">
             Full Schedule <ChevronRight size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {activeTasks.length > 0 ? activeTasks.map((task, i) => (
            <motion.div 
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onOpenTask(task)}
              className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border bg-base/30 hover:border-accent/30 hover:bg-base/60 transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-base border border-border flex items-center justify-center shrink-0 text-indigo-500 font-extrabold text-sm group-hover:bg-accent/5">
                  #{task.id}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors">{task.title}</h4>
                  <div className="flex gap-2 items-center mt-2 flex-wrap">
                    <Badge text={task.priority} type={task.priority === 'Critical' ? 'danger' : task.priority === 'High' ? 'warning' : 'info'} />
                    <span className="text-[9px] text-tertiary font-bold uppercase tracking-wider flex items-center gap-1">
                      <Clock size={10} className="text-accent" /> Due {task.due}
                    </span>
                    <span className="text-[9px] text-tertiary font-bold uppercase tracking-wider">
                      · {task.subtasks.filter(s => s.done).length}/{task.subtasks.length} subtasks
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 md:mt-0 justify-end shrink-0">
                <div className="text-right">
                  <div className="text-xs font-bold text-primary">{task.progress}%</div>
                  <div className="text-[9px] text-tertiary uppercase tracking-wider font-bold">{task.status}</div>
                </div>
                <div className="w-24 h-1.5 bg-base border border-border/50 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${task.progress}%` }}></div>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="p-10 text-center">
              <CheckCircle size={32} className="mx-auto text-emerald-500/20 mb-3" />
              <p className="text-xs text-tertiary font-bold uppercase">No pending assignments</p>
            </div>
          )}
        </div>
      </Card>

      {completedTasks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest px-2">History of Excellence</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedTasks.map((task) => (
              <Card key={task.id} className="p-4 border-dashed border-border/60 bg-base/25 hover:border-accent/30 transition-all" onClick={() => onOpenTask(task)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <span className="text-xs font-bold text-secondary line-through">{task.title}</span>
                  </div>
                  <Badge text="Completed" type="success" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TaskModule = ({ tasks, onOpenTask }: { tasks: EmployeeTask[]; onOpenTask: (task: EmployeeTask) => void }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-2 px-1">
        <div>
          <h2 className="text-xl font-bold text-primary">Strategic Task Board</h2>
          <p className="text-secondary text-xs">Manage assignments, trace timelines, and update performance benchmarks.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* To Do / Blocked Column */}
        <div className="space-y-4 bg-base/20 p-4 rounded-2xl border border-border/50">
          <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-1 flex items-center justify-between">
            <span>Operational queue</span>
            <span className="bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded text-[8px] border border-orange-500/20">{tasks.filter(t => t.status === 'To Do' || t.status === 'Blocked').length}</span>
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'To Do' || t.status === 'Blocked').map(task => (
              <div key={task.id} onClick={() => onOpenTask(task)} className="p-4 bg-surface border border-border rounded-xl shadow-sm hover:border-accent/40 cursor-pointer transition-all group">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <Badge text={task.status} type={task.status === 'Blocked' ? 'danger' : 'default'} />
                  <span className="text-[8px] font-bold text-tertiary uppercase">#{task.id}</span>
                </div>
                <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors mb-2 leading-snug">{task.title}</h4>
                <div className="w-full h-1 bg-base rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-accent" style={{ width: `${task.progress}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-[9px] text-secondary font-bold uppercase">
                  <span>Progress: {task.progress}%</span>
                  <span>{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* In Progress / Review Column */}
        <div className="space-y-4 bg-base/20 p-4 rounded-2xl border border-border/50">
          <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest px-1 flex items-center justify-between">
            <span>Active Sprint</span>
            <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded text-[8px] border border-accent/20">{tasks.filter(t => t.status === 'In Progress' || t.status === 'Under Review').length}</span>
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'In Progress' || t.status === 'Under Review').map(task => (
              <div key={task.id} onClick={() => onOpenTask(task)} className="p-4 bg-surface border border-border rounded-xl shadow-sm hover:border-accent/40 cursor-pointer transition-all group">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <Badge text={task.status} type={task.status === 'Under Review' ? 'warning' : 'info'} />
                  <span className="text-[8px] font-bold text-tertiary uppercase">#{task.id}</span>
                </div>
                <h4 className="text-xs font-bold text-primary group-hover:text-accent transition-colors mb-2 leading-snug">{task.title}</h4>
                <div className="w-full h-1 bg-base rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-accent" style={{ width: `${task.progress}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-[9px] text-secondary font-bold uppercase">
                  <span>Progress: {task.progress}%</span>
                  <span>{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Done Column */}
        <div className="space-y-4 bg-base/20 p-4 rounded-2xl border border-border/50">
          <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest px-1 flex items-center justify-between">
            <span>Completed ledger</span>
            <span className="bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded text-[8px] border border-emerald-500/20">{tasks.filter(t => t.status === 'Done').length}</span>
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'Done').map(task => (
              <div key={task.id} onClick={() => onOpenTask(task)} className="p-4 bg-surface border border-border rounded-xl shadow-sm hover:border-accent/40 cursor-pointer transition-all group opacity-85">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <Badge text="Done" type="success" />
                  <span className="text-[8px] font-bold text-tertiary uppercase">#{task.id}</span>
                </div>
                <h4 className="text-xs font-bold text-secondary line-through mb-2 leading-snug">{task.title}</h4>
                <div className="w-full h-1 bg-base rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-500" style={{ width: '100%' }}></div>
                </div>
                <div className="flex justify-between items-center text-[9px] text-secondary font-bold uppercase">
                  <span>Completed</span>
                  <span>{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const TimeModule = () => {
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [shiftStart, setShiftStart] = useState<Date | null>(null);
  const { showToast } = useUI();

  const [sessionHistory, setSessionHistory] = useState([
    { date: 'May 11', duration: '8h 12m', project: 'Media Campaign', yield: '98%' },
    { date: 'May 10', duration: '7h 45m', project: 'Internal Ops', yield: '94%' },
    { date: 'May 09', duration: '6h 20m', project: 'Global Logistics', yield: '96%' },
  ]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const callTimeApi = async (action: string, duration?: number) => {
    try {
      const res = await fetch('/api/time-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({ action, duration, project: 'Active Session Work' }),
      });
      const data = await res.json();
      if (!data.success) console.error('[TimeTracking]', data.error);
    } catch (e) {
      console.error('[TimeTracking] API call failed:', e);
    }
  };

  const handleToggleShift = async () => {
    if (!isRunning) {
      setIsRunning(true);
      setShiftStart(new Date());
      await callTimeApi('start');
      showToast('Shift started — email notification sent', 'success');
    } else {
      setIsRunning(false);
      await callTimeApi('stop', timer);
      showToast('Shift paused — email notification sent', 'info');
    }
  };

  const handleCompleteSession = async () => {
    if (timer <= 0) {
      showToast('Please start the session timer first!', 'warning');
      return;
    }
    setIsRunning(false);

    const h = Math.floor(timer / 3600);
    const m = Math.floor((timer % 3600) / 60);
    const durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

    // Log to backend (fires email to employee + admin)
    await callTimeApi('log', timer);

    const newSession = {
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      duration: durationStr,
      project: 'Active Session Work',
      yield: `${Math.floor(92 + Math.random() * 7)}%`
    };

    setSessionHistory(prev => [newSession, ...prev]);
    setTimer(0);
    setShiftStart(null);
    showToast('Shift logged — email confirmation sent to your inbox!', 'success');
  };

  const handleExportLogs = () => {
    const headers = 'Date,Duration,Project,Yield\n';
    const rows = sessionHistory.map(h => `${h.date},${h.duration},${h.project},${h.yield}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `time_logs_${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
    showToast('Time logs exported as CSV successfully!', 'success');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
       <Card className="flex flex-col items-center justify-center py-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-accent/5 pointer-events-none"></div>
          <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-6 relative z-10">Active Session</h3>
          <div className="text-6xl font-black text-primary tabular-nums mb-8 tracking-tighter relative z-10">
            {formatTime(timer)}
          </div>
          <div className="flex gap-4 relative z-10">
             <button onClick={handleToggleShift} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-90 ${isRunning ? 'bg-orange-500 shadow-orange-500/20' : 'bg-accent shadow-accent/20'}`}>
                {isRunning ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white fill-white ml-1" />}
             </button>
             <button onClick={() => setTimer(0)} className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-base transition-all active:scale-95">
                <RotateCcw size={24} className="text-secondary" />
             </button>
          </div>
          <button 
             onClick={handleCompleteSession}
             className="btn-enterprise-primary w-48 mt-6 text-[10px] font-bold uppercase"
          >
             Log Current Shift
          </button>
          <p className="mt-8 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Shift Protocol: Active</p>
       </Card>
       <Card>
          <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-6">Session History</h3>
          <div className="space-y-4 max-h-[250px] overflow-y-auto pr-1">
             {sessionHistory.map((log, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-base border border-border/50 group hover:border-accent/30 transition-all">
                   <div>
                      <div className="text-xs font-bold text-primary">{log.date}</div>
                      <div className="text-[10px] text-tertiary font-bold uppercase">{log.project}</div>
                   </div>
                   <div className="text-right">
                      <div className="text-sm font-black text-accent">{log.duration}</div>
                      <div className="text-[9px] text-emerald-500 font-bold">{log.yield} Yield</div>
                   </div>
                </div>
             ))}
          </div>
          <button onClick={handleExportLogs} className="btn-enterprise-secondary w-full mt-6 text-[10px] font-bold uppercase">Export Time Logs</button>
       </Card>
    </div>
  );
};


const PerformanceModule = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/employee/performance', { cache: 'no-store' }).then(r => r.json())
      .then(d => { if (d.success) setData(d); else setErr(d.error); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Card><div className="space-y-3 animate-pulse">{[1,2,3].map(i=><div key={i} className="h-14 bg-base rounded-xl"/>)}</div></Card>;
  if (err || !data) return <Card><p className="text-secondary text-sm">Could not load performance: {err}</p></Card>;
  const { tasks, leads, emails } = data;
  const cr = tasks.completionRate;
  const crColor = cr >= 80 ? 'text-emerald-500' : cr >= 50 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-4 flex items-center gap-2"><BarChart3 size={13} className="text-accent"/> Performance Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            {label:'Tasks Done', value:`${tasks.done}/${tasks.total}`, sub:`${cr}% completion`, color:crColor},
            {label:'Overdue', value:String(tasks.overdue), sub:'tasks overdue', color:tasks.overdue>0?'text-red-500':'text-emerald-500'},
            {label:'Leads Assigned', value:String(leads.assigned), sub:`${leads.closedThisMonth} closed this month`, color:'text-accent'},
            {label:'Emails Sent', value:String(emails.sentThisMonth), sub:'this month', color:'text-blue-500'},
          ].map((s,i)=>(
            <div key={i} className="bg-base border border-border rounded-xl p-3">
              <div className="text-[10px] text-secondary uppercase font-bold tracking-wider mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-secondary mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3">Tasks by Stage</h3>
        <div className="space-y-2">
          {tasks.byStage.length === 0 && <p className="text-secondary text-sm">No tasks.</p>}
          {tasks.byStage.map((s:any)=>(
            <div key={s._id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
              <span className="text-sm text-primary">{s._id}</span>
              <span className="text-sm font-bold text-accent">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3">Pipeline</h3>
        <div className="space-y-2">
          {leads.byStage.map((s:any)=>(
            <div key={s._id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
              <span className="text-sm text-primary">{s._id}</span>
              <span className="text-sm font-bold text-accent">{s.count}</span>
            </div>
          ))}
          {leads.byStage.length === 0 && <p className="text-secondary text-sm">No leads assigned.</p>}
        </div>
        {leads.pipelineValue > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex justify-between">
            <span className="text-xs text-secondary uppercase font-bold tracking-wider">Pipeline Value</span>
            <span className="font-bold text-emerald-500">${leads.pipelineValue.toLocaleString()}</span>
          </div>
        )}
      </Card>
    </div>
  );
};

// SettingsModule removed — settings tab now renders <SharedSettingsModule role="staff" /> directly.

// --- Main Shell ---

function EmployeeDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'workspace' | 'settings' | 'tasks' | 'time' | 'chat' | 'performance'>('workspace');
  const { showToast } = useUI();
  const unreadMessages = useUnreadCount();

  useEffect(() => {
    if (tab && ['workspace', 'settings', 'tasks', 'time', 'chat', 'performance'].includes(tab)) {
      setActiveTab(tab as any);
    } else {
      setActiveTab('workspace');
    }
  }, [tab]);

  const { socket } = useSocket();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isTeamDrawerOpen, setIsTeamDrawerOpen] = useState(false);
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

  // Collapse states for sidebar cards
  const [isPerformerCollapsed, setIsPerformerCollapsed] = useState(false);
  const [isActiveTeamCollapsed, setIsActiveTeamCollapsed] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onChatEvent = (payload: any) => {
      if (payload.type === 'presence_snapshot') {
        setOnlineUsers(new Set<string>(payload.onlineUserIds ?? []));
      } else if (payload.type === 'presence_change') {
        const { userId, isOnline } = payload;
        setOnlineUsers(prev => {
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

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  useEffect(() => {
    async function loadUserData() {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const meData = await meRes.json();
        if (!meData.success) {
          router.push('/login');
          return;
        }
        const user = meData.user;
        setCurrentUser(user);

        // Fetch team members dynamically
        try {
          const teamRes = await fetch('/api/users', { credentials: 'include', cache: 'no-store' });
          const teamData = await teamRes.json();
          if (teamData.success && Array.isArray(teamData.users)) {
            setTeamMembers(teamData.users);
            const initialOnline = new Set<string>();
            teamData.users.forEach((u: any) => {
              if (u.status === 'Online' || u.isOnline) {
                initialOnline.add(u._id);
              }
            });
            setOnlineUsers(prev => {
              const merged = new Set(prev);
              initialOnline.forEach(id => merged.add(id));
              return merged;
            });
          }
        } catch (err) {
          console.error('Failed to load active team members:', err);
        }

        // Fetch tasks
        const tasksRes = await fetch('/api/tasks', { credentials: 'include', cache: 'no-store' });
        const tasksData = await tasksRes.json();
        if (tasksData.success) {
          let userTasks = tasksData.tasks.filter((t: any) =>
            (t.assignedTo && t.assignedTo.toString() === user._id) ||
            (t.assignee && (t.assignee.toLowerCase() === user.email.toLowerCase() || t.assignee.toLowerCase() === user.name.toLowerCase())) ||
            (t.assignedRole && t.assignedRole === user.role)
          );

          // If no tasks are found, seed the mock ones in the DB for the user!
          if (userTasks.length === 0) {
            const initialMockTasks = [
              {
                title: 'Update media assets for Nova Retail',
                description: 'Compress and upload all high-resolution promotional materials, print sequences, and brand videos for the Nova Retail Summer campaign.',
                stage: 'In Progress',
                priority: 'High',
                progress: 65,
                assignee: user.email,
                tags: ['Asset Management', 'Nova Retail'],
                subtasks: [
                  { title: 'Compress high-res promotional sequence assets', done: true },
                  { title: 'Validate asset scaling ratios', done: true },
                  { title: 'Upload bundle sequences to CDN bucket', done: false }
                ],
                logs: [
                  { time: '09:12 AM', author: user.name, note: 'Configured cloud bucket CDN parameters with cache headers.' },
                  { time: '11:30 AM', author: user.name, note: 'Compressed raw summer visuals by 45%.' }
                ]
              },
              {
                title: 'Draft weekly performance overview',
                description: 'Generate weekly analytical report outlining logistics bottlenecks, R2 migration node status, and yield ratios across active nodes.',
                stage: 'Backlog',
                priority: 'Medium',
                progress: 0,
                assignee: user.email,
                tags: ['Reporting', 'Analytics'],
                subtasks: [
                  { title: 'Gather bandwidth consumption telemetry', done: false },
                  { title: 'Calculate personnel output parameters', done: false }
                ],
                logs: []
              },
              {
                title: 'Validate cloud storage bandwidth',
                description: 'Verify load speeds, transfer yield, and potential egress congestion during peak hours for server cluster APAC-West.',
                stage: 'Review',
                priority: 'Critical',
                progress: 95,
                assignee: user.email,
                tags: ['Infrastructure', 'APAC'],
                subtasks: [
                  { title: 'Initiate load simulation nodes', done: true },
                  { title: 'Identify cache bypass bottlenecks', done: true },
                  { title: 'Compile visual telemetry report', done: true }
                ],
                logs: [
                  { time: 'Yesterday', author: user.name, note: 'Initiated active load simulation tests with 10k concurrent virtual users.' },
                  { time: 'Today 08:00 AM', author: user.name, note: 'Telemetry logged. Node APAC-West is holding stable at 99.4% egress yield.' }
                ]
              }
            ];

            const createdTasks = [];
            for (const mockT of initialMockTasks) {
              const createRes = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
                body: JSON.stringify(mockT)
              });
              const createData = await createRes.json();
              if (createData.success) {
                createdTasks.push(createData.task);
              }
            }
            userTasks = createdTasks;
          }

          const mappedTasks = userTasks.map((t: any) => ({
            _id: t._id,
            id: t.code || t._id,
            title: t.title,
            desc: t.description || '',
            due: t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No Due Date',
            priority: t.priority === 'Normal' ? 'Medium' : t.priority,
            status: t.stage === 'Backlog' ? 'To Do' : t.stage === 'Review' ? 'Under Review' : t.stage,
            progress: t.progress || 0,
            estimatedHours: t.estimatedHours || 8,
            completed: t.stage === 'Done',
            subtasks: t.subtasks || [],
            attachments: t.attachments || [],
            logs: t.logs || []
          }));
          setTasks(mappedTasks);
        }
      } catch (err) {
        console.error('Failed to load user tasks:', err);
      } finally {
        setLoadingTasks(false);
      }
    }
    loadUserData();
  }, [router]);

  // Selected Task for Details Modal
  const [selectedTask, setSelectedTask] = useState<EmployeeTask | null>(null);
  
  // Interactive Update State for Modal
  const [editStatus, setEditStatus] = useState<EmployeeTask['status']>('To Do');
  const [editProgress, setEditProgress] = useState<number>(0);
  const [newLogNote, setNewLogNote] = useState<string>('');

  const handleOpenTask = (task: EmployeeTask) => {
    setSelectedTask(task);
    setEditStatus(task.status);
    setEditProgress(task.progress);
    setNewLogNote('');
  };

  const handleToggleSubtask = (index: number) => {
    if (!selectedTask) return;
    const updatedSub = [...selectedTask.subtasks];
    updatedSub[index].done = !updatedSub[index].done;
    
    // Auto calculate progress percentage based on subtasks
    const doneCount = updatedSub.filter(s => s.done).length;
    const computedProgress = Math.round((doneCount / updatedSub.length) * 100);

    const updatedTask = {
      ...selectedTask,
      subtasks: updatedSub,
      progress: computedProgress
    };

    setSelectedTask(updatedTask);
    setEditProgress(computedProgress);

    // Save state locally first so UI updates immediately
    setTasks(tasks.map(t => t._id === selectedTask._id ? {
      ...t,
      subtasks: updatedSub,
      progress: computedProgress
    } : t));

    // Persist subtask checklist to database
    fetch(`/api/tasks/${selectedTask._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
      body: JSON.stringify({
        progress: computedProgress,
        subtasks: updatedSub
      })
    }).catch(err => console.error('Failed to auto-save subtask toggle:', err));
  };

  const handleSaveProgress = () => {
    if (!selectedTask) return;

    const updatedLogs = [...selectedTask.logs];
    if (newLogNote.trim()) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + now.toLocaleDateString([], { month: 'short', day: 'numeric' });
      updatedLogs.push({
        time: timeStr,
        author: currentUser?.name || 'Staff User',
        note: newLogNote.trim()
      });
    }

    const isDone = editStatus === 'Done' || editProgress === 100;
    const finalProgress = isDone ? 100 : editProgress;
    const finalStatus = isDone ? 'Done' : editStatus;

    const updatedTask: EmployeeTask = {
      ...selectedTask,
      status: finalStatus as any,
      progress: finalProgress,
      completed: isDone,
      logs: updatedLogs
    };

    setTasks(tasks.map(t => t._id === selectedTask._id ? updatedTask : t));
    setSelectedTask(null);
    showToast(`Task "${selectedTask.title}" successfully updated to ${finalProgress}% [${finalStatus}]`, 'success');

    // Map status string back to database stage and status fields
    let mappedStage = 'To Do';
    let mappedStatus = finalStatus;
    if (finalStatus === 'In Progress') {
      mappedStage = 'In Progress';
    } else if (finalStatus === 'Under Review') {
      mappedStage = 'Review';
      mappedStatus = 'Review Requested';
    } else if (finalStatus === 'Blocked') {
      mappedStage = 'Blocked';
      mappedStatus = 'Blocked';
    } else if (finalStatus === 'Accepted') {
      mappedStage = 'To Do';
      mappedStatus = 'Accepted';
    }

    // Persist changes to database
    fetch(`/api/tasks/${selectedTask._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
      body: JSON.stringify({
        stage: mappedStage,
        status: mappedStatus,
        progress: finalProgress,
        subtasks: selectedTask.subtasks,
        logs: updatedLogs
      })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showToast('Task updated in database!', 'success');
        triggerActivityLog('task_update', `Task "${selectedTask.title}" successfully updated to ${finalProgress}% [${finalStatus}]`, {
          taskId: selectedTask._id,
          progress: finalProgress,
          status: finalStatus
        }).catch(console.error);
      } else {
        showToast(data.error || 'Failed to save task to database', 'error');
      }
    })
    .catch(err => {
      console.error(err);
      showToast('Network error saving task', 'error');
    });
  };

  // Settings tab gets full-page layout bypassing the two-column grid
  if (activeTab === 'settings') {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <SharedSettingsModule role="staff" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <div className="flex items-center gap-2 mb-2">
             <Badge text="Operations Staff" type="info" />
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-bold text-accent uppercase tracking-widest leading-none">Shift Status: Active</span>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Staff Workspace</h1>
          <p className="text-secondary text-sm mt-1 font-medium">Focus on your active assignments and collaborative tasks.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="bg-surface border border-border p-3 rounded-xl flex items-center gap-4 shadow-sm">
              <div className="text-right border-r border-border pr-4">
                 <div className="text-[10px] font-bold text-secondary uppercase tracking-widest leading-none">Completion Rate</div>
                 <div className="text-lg font-bold text-primary mt-1 leading-none">
                   {tasks.length > 0 ? `${Math.round((tasks.filter(t => t.status === 'Done').length / tasks.length) * 100)}%` : '—'}
                 </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                 <BarChart3 size={20} />
              </div>
           </div>
        </div>
      </motion.div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <Card delay={0} className="p-4 border-border/60 cursor-pointer hover:border-accent/30 group" onClick={() => router.push('/employee?tab=tasks')}>
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                 <CheckSquare size={20} />
              </div>
              <div>
                 <div className="text-[10px] font-bold text-tertiary uppercase mb-0.5 leading-none">My Active Tasks</div>
                 <div className="text-lg font-bold text-primary mt-1 leading-none">{tasks.filter(t => t.status !== 'Done').length}</div>
              </div>
           </div>
        </Card>
        <Card delay={0.05} className="p-4 border-border/60 cursor-pointer hover:border-accent/30 group" onClick={() => router.push('/employee?tab=chat')}>
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                 <MessageSquare size={20} />
              </div>
              <div>
                 <div className="text-[10px] font-bold text-tertiary uppercase mb-0.5 leading-none">Unread Messages</div>
                 <div className="text-lg font-bold text-primary mt-1 leading-none">{unreadMessages > 0 ? unreadMessages : '—'}</div>
              </div>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        
        {/* Dynamic Content */}
        <div className="xl:col-span-2 space-y-8">
           <AnimatePresence mode="wait">
              {activeTab === 'workspace' && (
                <motion.div key="workspace" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <WorkspaceModule tasks={tasks} onFullSchedule={() => router.push('/employee?tab=tasks')} onOpenTask={handleOpenTask} />
                </motion.div>
              )}
              {activeTab === 'tasks' && (
                <motion.div key="tasks" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <TaskModule tasks={tasks} onOpenTask={handleOpenTask} />
                </motion.div>
              )}
              {activeTab === 'time' && (
                <motion.div key="time" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <TimeModule />
                </motion.div>
              )}
              {activeTab === 'chat' && (
                <motion.div key="chat" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                   <ChatModule />
                </motion.div>
              )}
              {activeTab === 'performance' && (
                <motion.div key="performance" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0, y: 10}}>
                 <PerformanceModule />
                </motion.div>
              )}

           </AnimatePresence>
         </div>
         {/* Persistence Sidebar */}
         <div className="space-y-6">
             <Card className="relative group overflow-hidden border-border/80 bg-surface p-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-accent/10 transition-colors pointer-events-none"></div>
                <div className="relative z-10">
                   <div 
                      className="flex justify-between items-center cursor-pointer select-none p-5 md:p-6 hover:bg-base/30 transition-colors"
                      onClick={() => setIsPerformerCollapsed(!isPerformerCollapsed)}
                   >
                      <h3 className="text-xs font-bold flex items-center gap-2 text-orange-500 uppercase tracking-wider">
                         <Star size={14} className="fill-orange-400 text-orange-400"/> Top Performer
                      </h3>
                      <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isPerformerCollapsed ? '-rotate-90' : ''}`} />
                   </div>
                   <motion.div
                      initial={false}
                      animate={{ height: isPerformerCollapsed ? 0 : 'auto', opacity: isPerformerCollapsed ? 0 : 1 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                   >
                      <div className="px-5 md:px-6 pb-6">
                         <p className="text-xs text-secondary leading-relaxed mb-6 font-medium font-sans">Congratulations {currentUser?.name || 'User'}! You&apos;ve maintained a 98% efficiency rate this week. Keep up the great work!</p>
                         <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center font-black text-2xl border border-accent/20">🏆</div>
                            <div>
                               <div className="text-[9px] font-bold uppercase tracking-widest text-tertiary leading-none mb-1">Current Streak</div>
                               <div className="text-lg font-extrabold leading-none text-indigo-600 dark:text-indigo-400">14 Days</div>
                            </div>
                         </div>
                      </div>
                   </motion.div>
                </div>
             </Card>

             <Card className="p-0 overflow-hidden">
                <div 
                   className="flex justify-between items-center cursor-pointer select-none p-5 md:p-6 hover:bg-base/30 transition-colors"
                   onClick={() => setIsActiveTeamCollapsed(!isActiveTeamCollapsed)}
                >
                   <h3 className="text-[10px] font-bold text-tertiary uppercase tracking-widest leading-none">Active Team</h3>
                   <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                         {teamMembers.filter(m => onlineUsers.has(m._id) || m.status === 'Online' || m.isOnline).length} Online
                      </span>
                      <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isActiveTeamCollapsed ? '-rotate-90' : ''}`} />
                   </div>
                </div>
                <motion.div
                   initial={false}
                   animate={{ height: isActiveTeamCollapsed ? 0 : 'auto', opacity: isActiveTeamCollapsed ? 0 : 1 }}
                   transition={{ duration: 0.2 }}
                   className="overflow-hidden"
                >
                   <div className="px-5 md:px-6 pb-6">
                      <div className="relative mb-4">
                         <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                         <input 
                           type="text" 
                           value={previewSearchQuery}
                           onChange={(e) => setPreviewSearchQuery(e.target.value)}
                           placeholder="Search online teammates..." 
                           className="w-full bg-base border border-border rounded-xl pl-8 pr-3 py-1.5 text-[10px] focus:outline-none focus:border-accent text-primary font-medium"
                         />
                      </div>


                      <div className="space-y-3">
                         {(() => {
                            const onlineTeammates = teamMembers.filter(member => {
                              const isOnline = onlineUsers.has(member._id) || member.status === 'Online' || member.isOnline;
                              const matchesSearch = member.name.toLowerCase().includes(previewSearchQuery.toLowerCase());
                              return isOnline && matchesSearch;
                            });
                            const previewList = onlineTeammates.slice(0, 5);

                            if (previewList.length > 0) {
                              return previewList.map((user, i) => {
                                const colors = ['bg-accent', 'bg-emerald-500', 'bg-orange-500', 'bg-indigo-500', 'bg-rose-500', 'bg-purple-500'];
                                const color = colors[i % colors.length];
                                const initials = user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                                return (
                                  <div 
                                    key={user._id || i} 
                                    onClick={() => router.push(`/employee?tab=chat&dmUserId=${user._id}`)}
                                    className="flex items-center justify-between p-2 hover:bg-base rounded-xl transition-colors cursor-pointer group"
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full ${color} text-white flex items-center justify-center font-bold text-[10px] shadow-sm group-hover:scale-110 transition-transform`}>
                                          {initials}
                                        </div>
                                        <div>
                                          <span className="text-xs font-bold text-primary block leading-none">{user.name}</span>
                                          <span className="text-[9px] text-tertiary font-bold mt-1 block">{user.role || 'Teammate'}</span>
                                        </div>
                                     </div>
                                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  </div>
                                );
                              });
                            } else {
                              return <p className="text-[10px] text-secondary italic p-2">No online teammates found.</p>;
                            }
                         })()}
                      </div>

                      <button 
                        onClick={() => { setIsTeamDrawerOpen(true); setVisibleCount(20); }} 
                        className="w-full mt-4 py-2 bg-base border border-border rounded-xl text-[10px] font-bold uppercase hover:bg-surface transition-all flex items-center justify-center gap-2"
                      >
                         <Users size={12}/> View All Team Members
                      </button>
                   </div>
                </motion.div>
             </Card>
         </div>
      </div>

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-start border-b border-border pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[9px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">#{selectedTask.id}</span>
                    <Badge text={selectedTask.priority} type={selectedTask.priority === 'Critical' ? 'danger' : selectedTask.priority === 'High' ? 'warning' : 'info'} />
                  </div>
                  <h3 className="text-lg font-bold text-primary">{selectedTask.title}</h3>
                </div>
                <button onClick={() => setSelectedTask(null)} className="p-1.5 hover:bg-base rounded-lg text-secondary transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar text-xs">
                {/* Description */}
                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase mb-1.5 tracking-wider">Description</h4>
                  <p className="text-secondary leading-relaxed font-sans font-medium p-4 bg-base rounded-2xl border border-border/50">{selectedTask.desc}</p>
                </div>

                {/* Subtasks Checklist */}
                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase mb-2 tracking-wider flex items-center gap-1.5">
                    <ListChecks size={12} className="text-accent" /> Subtask Protocols ({selectedTask.subtasks.filter(s=>s.done).length}/{selectedTask.subtasks.length})
                  </h4>
                  <div className="space-y-2 bg-base p-4 rounded-2xl border border-border/50">
                    {selectedTask.subtasks.map((sub, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleToggleSubtask(idx)}
                        className="flex items-center gap-3 p-2 rounded-xl bg-surface border border-border/30 hover:border-accent/30 cursor-pointer transition-all"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${sub.done ? 'bg-accent border-accent text-white' : 'border-border bg-base'}`}>
                          {sub.done && <Check size={10} strokeWidth={3} />}
                        </div>
                        <span className={`text-[11px] font-semibold ${sub.done ? 'text-secondary line-through' : 'text-primary'}`}>{sub.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Attachments & Target SLA */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[10px] font-bold text-tertiary uppercase mb-2 tracking-wider flex items-center gap-1.5">
                      <Paperclip size={12} className="text-accent" /> Attachments
                    </h4>
                    <div className="space-y-1.5">
                      {selectedTask.attachments.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 bg-base border border-border rounded-xl text-[10px] font-bold text-secondary hover:text-accent hover:border-accent/30 transition-colors">
                          <span className="truncate">{file}</span>
                          <span className="text-[8px] bg-base border border-border/80 px-2 py-0.5 rounded text-tertiary uppercase shrink-0">ZIP/PDF</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-base rounded-2xl border border-border/50 flex flex-col justify-between">
                    <div>
                      <div className="text-[9px] font-bold text-tertiary uppercase tracking-wider mb-2">Estimated Allocation Time</div>
                      <div className="text-2xl font-black text-primary leading-none tracking-tight">{selectedTask.estimatedHours} Hours</div>
                    </div>
                    <div className="pt-4 border-t border-border/50 mt-4 flex justify-between items-center text-[10px] text-secondary font-bold uppercase">
                      <span>Target SLA</span>
                      <span className="text-emerald-500 font-extrabold">Within 24 Hours</span>
                    </div>
                  </div>
                </div>

                {/* Interactive Status & Percentage Updates */}
                <div className="p-5 bg-surface border border-accent/20 rounded-2xl space-y-4">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">⚡ Update Operational Progress</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-tertiary uppercase mb-1.5">Status Clear</label>
                      <select 
                        value={editStatus}
                        onChange={e => setEditStatus(e.target.value as any)}
                        className="w-full bg-base border border-border rounded-xl px-3 py-2.5 text-xs text-primary focus:ring-1 focus:ring-accent outline-none"
                      >
                        <option value="To Do">To Do (Assigned)</option>
                        <option value="Accepted">Accepted</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Under Review">Under Review</option>
                        <option value="Blocked">Blocked</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-tertiary uppercase mb-1.5 flex justify-between">
                        <span>Progress Ratio</span>
                        <span className="text-accent">{editProgress}%</span>
                      </label>
                      <div className="flex items-center gap-3 pt-2">
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={editProgress}
                          onChange={e => setEditProgress(parseInt(e.target.value))}
                          className="flex-1 accent-indigo-600 dark:accent-indigo-400 bg-base rounded-lg h-1.5 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Work Log / Daily Progress Notes */}
                  <div>
                    <label className="block text-[10px] font-bold text-tertiary uppercase mb-1.5">Add Work Log Note</label>
                    <textarea 
                      value={newLogNote}
                      onChange={e => setNewLogNote(e.target.value)}
                      placeholder="Specify log updates (e.g., Compressed files, synced APAC simulation node, verified SLA target)..."
                      className="w-full bg-base border border-border rounded-xl px-4 py-3 text-xs text-primary focus:ring-1 focus:ring-accent outline-none h-20 resize-none font-medium"
                    />
                  </div>
                </div>

                {/* Progress Notes Timeline / Work Logs */}
                <div>
                  <h4 className="text-[10px] font-bold text-tertiary uppercase mb-3 tracking-wider">Telemetry & Work Log History</h4>
                  {selectedTask.logs.length > 0 ? (
                    <div className="space-y-3 pl-2 border-l-2 border-border/80">
                      {selectedTask.logs.map((log, lIdx) => (
                        <div key={lIdx} className="relative pl-4">
                          <div className="absolute left-[-13px] top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface"></div>
                          <div className="text-[10px] text-secondary font-bold flex justify-between mb-0.5">
                            <span>{log.author}</span>
                            <span className="text-tertiary font-mono font-normal text-[8px]">{log.time}</span>
                          </div>
                          <p className="text-xs text-primary font-medium">{log.note}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-base rounded-2xl text-center border border-border border-dashed">
                      <p className="text-[9px] text-tertiary uppercase font-bold">No progress logs recorded for this initiative.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-border pt-4 mt-4 flex justify-end gap-3 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setSelectedTask(null)}
                  className="btn-enterprise-secondary px-4 py-2 text-xs font-bold"
                >
                  Discard Changes
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveProgress}
                  className="btn-enterprise-primary px-5 py-2 text-xs font-bold"
                >
                  <Save size={14} /> Save Progress Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Team Directory Drawer */}
      <AnimatePresence>
        {isTeamDrawerOpen && (
          <div 
            className="fixed inset-0 z-[120] flex justify-end bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsTeamDrawerOpen(false)}
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="bg-surface w-full max-w-md border-l border-border shadow-2xl flex flex-col h-screen overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-accent" />
                  <h2 className="text-md font-bold text-primary">Team Directory</h2>
                  <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-2.5 py-0.5 rounded-full font-bold ml-1">
                    {teamMembers.length} Total
                  </span>
                </div>
                <button 
                  onClick={() => setIsTeamDrawerOpen(false)} 
                  className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"
                >
                  <X size={20}/>
                </button>
              </div>

              {/* Drawer Search */}
              <div className="p-4 border-b border-border bg-base/30">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                  <input 
                    type="text" 
                    value={drawerSearchQuery}
                    onChange={(e) => { setDrawerSearchQuery(e.target.value); setVisibleCount(20); }}
                    placeholder="Search by name, role, or email..." 
                    className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-accent text-primary font-medium shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Drawer Team List */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-base/10"
                onScroll={(e) => {
                  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                  if (scrollHeight - scrollTop <= clientHeight + 50) {
                    const filteredCount = teamMembers.filter(member => {
                      const q = drawerSearchQuery.toLowerCase();
                      return member.name.toLowerCase().includes(q) || 
                             (member.email && member.email.toLowerCase().includes(q)) ||
                             (member.role && member.role.toLowerCase().includes(q));
                    }).length;
                    if (visibleCount < filteredCount) {
                      setVisibleCount(prev => prev + 20);
                    }
                  }
                }}
              >
                {(() => {
                  const filteredDirectory = teamMembers
                    .filter(member => {
                      const q = drawerSearchQuery.toLowerCase();
                      return member.name.toLowerCase().includes(q) || 
                             (member.email && member.email.toLowerCase().includes(q)) ||
                             (member.role && member.role.toLowerCase().includes(q));
                    })
                    .sort((a, b) => {
                      const aOnline = onlineUsers.has(a._id) || a.status === 'Online' || a.isOnline;
                      const bOnline = onlineUsers.has(b._id) || b.status === 'Online' || b.isOnline;
                      if (aOnline && !bOnline) return -1;
                      if (!aOnline && bOnline) return 1;
                      return a.name.localeCompare(b.name);
                    });

                  const visibleTeammates = filteredDirectory.slice(0, visibleCount);

                  if (visibleTeammates.length > 0) {
                    return (
                      <>
                        {visibleTeammates.map((member, i) => {
                          const isOnline = onlineUsers.has(member._id) || member.status === 'Online' || member.isOnline;
                          const colors = ['bg-accent', 'bg-emerald-500', 'bg-orange-500', 'bg-indigo-500', 'bg-rose-500', 'bg-purple-500'];
                          const color = colors[i % colors.length];
                          const initials = member.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                          return (
                            <div 
                              key={member._id || i}
                              className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface hover:border-accent/40 hover:bg-base/30 transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative shrink-0">
                                  <div className={`w-9 h-9 rounded-full ${color} text-white flex items-center justify-center font-bold text-xs shadow-sm`}>
                                    {initials}
                                  </div>
                                  <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-primary block truncate leading-tight">{member.name}</span>
                                  <span className="text-[9px] text-tertiary font-bold uppercase tracking-wider block mt-1">{member.role || 'Teammate'}</span>
                                  <span className="text-[9px] text-secondary font-medium block truncate mt-0.5">{member.email}</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  setIsTeamDrawerOpen(false);
                                  router.push(`/employee?tab=chat&dmUserId=${member._id}`);
                                }}
                                className="p-2 bg-base border border-border rounded-xl text-secondary hover:text-accent hover:border-accent/30 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                                title="Message Teammate"
                              >
                                <MessageSquare size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {visibleCount < filteredDirectory.length && (
                          <button 
                            onClick={() => setVisibleCount(prev => prev + 20)}
                            className="w-full py-2 bg-base border border-border rounded-xl text-[10px] font-bold uppercase hover:bg-surface transition-all text-secondary mt-4"
                          >
                            Load More Teammates
                          </button>
                        )}
                      </>
                    );
                  } else {
                    return (
                      <div className="p-8 text-center bg-base/50 rounded-2xl border border-border border-dashed">
                        <p className="text-xs text-secondary font-bold">No teammates match your query.</p>
                      </div>
                    );
                  }
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EmployeePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
         <div className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Workspace...</div>
      </div>
    }>
       <EmployeeDashboard />
    </Suspense>
  );
}

