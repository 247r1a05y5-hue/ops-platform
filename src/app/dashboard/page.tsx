'use client';
import { useState, useEffect } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { downloadCSV } from '@/utils/export';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, TrendingUp, CheckCircle, Plus, Calendar, Users, ExternalLink, MoreHorizontal, FileText, AlertCircle, Clock, X, ChevronDown } from 'lucide-react';
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

export default function Dashboard() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  
  // Dynamic dashboard states
  const [stats, setStats] = useState<any[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapse states for widgets
  const [isTasksCollapsed, setIsTasksCollapsed] = useState(false);
  const [isTeamCollapsed, setIsTeamCollapsed] = useState(false);
  const [isApprovalsCollapsed, setIsApprovalsCollapsed] = useState(false);
  const [isDeadlinesCollapsed, setIsDeadlinesCollapsed] = useState(false);

  // Load KPI stats based on selected tab
  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/dashboard/stats?period=${activeTab}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load KPIs:', err);
    }
  };

  // Load actual tasks from DB
  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        // Map backend tasks to frontend expectations
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

  // Load invoices from DB
  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices);
      }
    } catch (err) {
      console.error('Failed to load invoices:', err);
    }
  };

  // Load live team members with task counts
  const [workspaceUsers, setWorkspaceUsers] = useState<{ _id: string; name: string; role: string; email?: string }[]>([]);
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

  // Sync everything on mount and when active period tab changes
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchTasks(), fetchInvoices(), fetchTeam()]);
      setLoading(false);
    };
    loadAll();
  }, [activeTab]);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => { 
      downloadCSV(tasks, `Operations_Report_${activeTab}`);
      setIsExporting(false); 
      showToast('Operations report exported as CSV!', 'success'); 
    }, 1200);
  };

  // Task checklist completed checkbox toggle
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

  // Approve invoice PUT action
  const handleApproveInvoice = async (invoiceId: string, invoiceNum: string) => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoiceId,
          action: 'approve'
        })
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

  // Dynamic invoicing logic
  const pendingInvoices = invoices.filter(inv => inv.status === 'Pending');
  const overdueTotal = invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((sum, inv) => {
      const amt = parseFloat(inv.amount.replace(/[^0-9.]/g, '')) || 0;
      return sum + amt;
    }, 0);

  return (
    <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-base text-primary transition-colors min-h-screen">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Operations Workspace</h1>
          <p className="text-secondary text-sm font-medium">Monitor MRR, handle active tasks, and track outstanding invoices.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
            {['today', 'week', 'custom'].map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); showToast(`Viewing: ${tab}`, 'info'); }}
                className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all duration-200 ${activeTab === tab ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary hover:bg-base/30'}`}>
                {tab}
              </button>
            ))}
          </div>
          <button onClick={handleExport} disabled={isExporting}
            className="btn-enterprise-primary flex items-center gap-2">
            {isExporting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Download size={18} />}
            {isExporting ? 'Exporting...' : 'Export Report'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {loading && stats.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 rounded-2xl border border-border bg-surface animate-pulse h-32 flex flex-col justify-between">
              <div className="w-1/3 bg-base h-4 rounded" />
              <div className="w-2/3 bg-base h-8 rounded" />
            </div>
          ))
        ) : (
          <AnimatePresence mode="wait">
            {stats.map((stat, i) => (
              <motion.div 
                key={`${activeTab}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className="card-enterprise shadow-sm"
              >
                <h3 className="text-xs font-semibold text-secondary mb-4 tracking-wider uppercase">{stat.title}</h3>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold tracking-tight mb-1 text-primary">{stat.value}</div>
                    <div className="text-[11px] font-medium text-tertiary">{stat.sub}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border border-current ${stat.color} bg-current/10`}>
                    <TrendingUp size={10} /> {stat.change}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 flex flex-col gap-8">
 
           {/* Active Tasks */}
           <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="card-enterprise p-0 overflow-hidden">
             <div 
                className="flex justify-between items-center p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                onClick={() => setIsTasksCollapsed(!isTasksCollapsed)}
             >
               <div className="flex items-center gap-3">
                 <CheckCircle className="text-accent" size={20} />
                 <h2 className="text-lg font-bold">Active Tasks</h2>
               </div>
               <ChevronDown size={18} className={`text-secondary transition-transform duration-200 ${isTasksCollapsed ? '-rotate-90' : ''}`} />
             </div>
             <motion.div
                initial={false}
                animate={{ height: isTasksCollapsed ? 0 : 'auto', opacity: isTasksCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
             >
                <div className="p-6 flex flex-col gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {tasks.length === 0 ? (
                    <div className="text-center py-10 text-secondary text-sm font-medium">No tasks logged in dashboard system</div>
                  ) : (
                    tasks.map(task => (
                      <Link key={task._id} href="/tasks"
                        className={`flex justify-between items-start p-5 border rounded-xl transition-all group cursor-pointer shadow-sm ${task.completed ? 'border-border bg-base opacity-60' : 'border-border hover:border-accent/50 bg-base'}`}>
                        <div className="flex items-start gap-4 flex-1">
                          <button onClick={(e) => toggleTask(e, task._id, task.completed)}
                            className={`mt-1 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-accent border-accent text-white' : 'border-gray-300 dark:border-gray-600 hover:border-accent'}`}>
                            {task.completed && <CheckCircle size={12} />}
                          </button>
                          <div>
                            <h4 className={`text-sm font-bold mb-1.5 transition-colors ${task.completed ? 'line-through text-secondary' : 'text-primary group-hover:text-accent'}`}>{task.title}</h4>
                            <div className="flex items-center gap-3 text-[11px] font-semibold text-secondary">
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border border-current text-${task.color}-600 dark:text-${task.color}-400 bg-current/10`}>{task.priority}</span>
                              <span className="flex items-center gap-1"><Calendar size={10}/> Due {task.dueDate}</span>
                              <span><Users size={10} className="inline mr-1"/>{task.assignee}</span>
                            </div>
                          </div>
                        </div>
                        <ExternalLink size={14} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                      </Link>
                    ))
                  )}
                </div>
             </motion.div>
           </motion.div>
 
           {/* Team Overview */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <motion.div 
               initial={{opacity:0,y:20}} 
               animate={{opacity:1,y:0}} 
               transition={{delay:0.1, duration: 0.5, ease: "circOut"}} 
               className="card-enterprise p-0 overflow-hidden"
             >
               <div 
                  className="flex items-center justify-between p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                  onClick={() => setIsTeamCollapsed(!isTeamCollapsed)}
               >
                 <div className="flex items-center gap-3">
                   <Users className="text-blue-500" size={18} />
                   <h2 className="text-base font-bold">Team Overview</h2>
                 </div>
                 <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                   <button onClick={() => showToast('Viewing team performance', 'info')} className="text-xs font-semibold text-accent hover:underline mr-1">View All</button>
                   <ChevronDown size={16} className={`text-secondary transition-transform duration-200 ${isTeamCollapsed ? '-rotate-90' : ''}`} onClick={() => setIsTeamCollapsed(!isTeamCollapsed)} />
                 </div>
               </div>
               <motion.div
                  initial={false}
                  animate={{ height: isTeamCollapsed ? 0 : 'auto', opacity: isTeamCollapsed ? 0 : 1 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
               >
                  <div className="p-6 space-y-4">
                    {loading ? (
                      [1,2,3].map(i => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-base border border-border/50 animate-pulse">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-border"/>
                            <div className="space-y-1.5"><div className="h-2.5 w-24 bg-border rounded"/><div className="h-2 w-16 bg-border rounded"/></div>
                          </div>
                          <div className="h-2.5 w-12 bg-border rounded"/>
                        </div>
                      ))
                    ) : teamMembers.length === 0 ? (
                      <div className="text-center py-8 text-xs text-secondary">No team members found.</div>
                    ) : (
                      teamMembers.map((emp, i) => (
                        <motion.div
                          key={emp.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + (i * 0.08) }}
                          className="flex items-center justify-between p-3 rounded-lg bg-base border border-border/50 hover:border-accent/30 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
                                {emp.name.split(' ').map((n: string) => n[0]).join('')}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${
                                emp.status === 'Online' ? 'bg-emerald-500' :
                                emp.status === 'Away'   ? 'bg-amber-400' : 'bg-border'
                              }`}/>
                            </div>
                            <div>
                              <div className="text-xs font-bold">{emp.name}</div>
                              <div className="text-[10px] text-secondary font-medium">{emp.role}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-xs font-bold">{emp.tasks} Open Tasks</div>
                              <div className={`text-[10px] font-bold ${
                                emp.status === 'Online' ? 'text-emerald-500' :
                                emp.status === 'Away'   ? 'text-amber-400' : 'text-secondary'
                              }`}>{emp.status}</div>
                            </div>
                            <MoreHorizontal size={14} className="text-tertiary" />
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
               </motion.div>
             </motion.div>
 
             {/* Invoices & Overdue */}
             <div className="flex flex-col gap-6">
               <motion.div 
                 initial={{opacity:0,y:20}} 
                 animate={{opacity:1,y:0}} 
                 transition={{delay:0.2, duration: 0.5, ease: "circOut"}} 
                 className="card-enterprise p-0 flex-1 overflow-hidden"
               >
                 <div 
                    className="flex items-center justify-between p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                    onClick={() => setIsApprovalsCollapsed(!isApprovalsCollapsed)}
                 >
                   <div className="flex items-center gap-3">
                     <FileText className="text-orange-500" size={18} />
                     <h2 className="text-base font-bold">Pending Approvals</h2>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">{pendingInvoices.length} Required</span>
                     <ChevronDown size={16} className={`text-secondary transition-transform duration-200 ${isApprovalsCollapsed ? '-rotate-90' : ''}`} />
                   </div>
                 </div>
                 <motion.div
                    initial={false}
                    animate={{ height: isApprovalsCollapsed ? 0 : 'auto', opacity: isApprovalsCollapsed ? 0 : 1 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                 >
                    <div className="p-6 space-y-3">
                       {pendingInvoices.length === 0 ? (
                         <div className="text-center py-6 text-xs text-secondary font-semibold">No pending invoices needing approval</div>
                       ) : (
                         pendingInvoices.map((inv, i) => (
                           <motion.div 
                             key={inv._id} 
                             initial={{ opacity: 0, x: 10 }} 
                             animate={{ opacity: 1, x: 0 }} 
                             transition={{ delay: 0.4 + (i * 0.1) }}
                             className="flex items-center justify-between p-3 bg-base border border-border rounded-lg group hover:border-accent/30 transition-all"
                           >
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="text-xs font-bold text-primary group-hover:text-accent transition-colors truncate">{inv.invoiceId} · {inv.client}</div>
                                <div className="text-[10px] text-secondary font-medium">{inv.amount} · Due {inv.due}</div>
                              </div>
                              <button onClick={() => handleApproveInvoice(inv._id, inv.invoiceId)} className="btn-enterprise-primary text-[9px] px-3 py-1 shrink-0">Approve</button>
                           </motion.div>
                         ))
                       )}
                    </div>
                 </motion.div>
               </motion.div>
 
               <motion.div 
                 initial={{opacity:0, scale: 0.95}} 
                 animate={{opacity:1, scale: 1}} 
                 transition={{delay:0.4}}
                 className="p-5 rounded-2xl border border-red-500/20 bg-red-500/5 shadow-sm flex items-center justify-between hover:bg-red-500/10 transition-colors"
               >
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/20">
                       <AlertCircle size={18} />
                    </div>
                    <div>
                       <div className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total Overdue</div>
                       <div className="text-xl font-bold text-primary">${overdueTotal.toLocaleString()}</div>
                    </div>
                 </div>
                 <button onClick={() => showToast('Opening collections view', 'info')} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-500">
                    <ExternalLink size={18} />
                 </button>
               </motion.div>
             </div>
           </div>
         </div>
 
         {/* Right column */}
         <div className="col-span-1 flex flex-col gap-8">
           <motion.div 
             initial={{opacity:0,x:20}} 
             animate={{opacity:1,x:0}} 
             transition={{delay:0.2, duration: 0.5}} 
             className="card-enterprise p-0 overflow-hidden"
           >
             <div 
                className="flex justify-between items-center p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                onClick={() => setIsDeadlinesCollapsed(!isDeadlinesCollapsed)}
             >
               <h2 className="text-[10px] font-bold text-secondary uppercase tracking-widest flex items-center gap-2"><Calendar size={12}/> Deadlines</h2>
               <div className="flex items-center gap-2">
                 <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-base border border-border text-tertiary">7d</span>
                 <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isDeadlinesCollapsed ? '-rotate-90' : ''}`} />
               </div>
             </div>
             <motion.div
                initial={false}
                animate={{ height: isDeadlinesCollapsed ? 0 : 'auto', opacity: isDeadlinesCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
             >
                <div className="p-6 space-y-5">
                  {tasks.filter(t => !t.completed && t.dueDate && t.dueDate !== 'No due date').slice(0, 3).length === 0 ? (
                    <div className="text-center py-6 text-xs text-secondary">No upcoming deadlines.</div>
                  ) : tasks.filter(t => !t.completed && t.dueDate && t.dueDate !== 'No due date').slice(0, 3).map((d, i) => (
                    <Link 
                      key={i} 
                      href="/tasks"
                      className="group relative pl-4 border-l-2 border-border hover:border-accent transition-colors cursor-pointer block"
                    >
                      <h4 className="text-xs font-bold mb-1 leading-snug group-hover:text-accent transition-colors">{d.title}</h4>
                      <p className="text-[11px] font-semibold text-secondary">Due {d.dueDate} · {d.assignee}</p>
                    </Link>
                  ))}
                </div>
             </motion.div>
           </motion.div>
        </div>
      </div>
    </div>
  );
}
