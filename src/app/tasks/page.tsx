'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { Search, Plus, Filter, LayoutDashboard, LayoutList, GripVertical, Download, X, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCSV } from '@/utils/export';
import { triggerActivityLog } from '@/utils/activity';

type Task = {
  _id: string;
  id?: number;
  title: string;
  stage: string;
  priority: string;
  code: string;
  tags: string[];
  assignee?: string;
  description?: string;
  dueDate?: string;
};

type Project = {
  _id: string;
  id?: number;
  name: string;
  deadline: string;
  owner: string;
};

export default function Tasks() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'board' | 'list'>('board');
  const [draggedItem, setDraggedItem] = useState<{id: string, stage: string} | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  
  const [ntTitle, setNtTitle] = useState('');
  const [ntPriority, setNtPriority] = useState('Medium');
  const [ntStage, setNtStage] = useState('Backlog');
  
  const [npName, setNpName] = useState('');
  const [npDeadline, setNpDeadline] = useState('');
  const [npOwner, setNpOwner] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ _id: string; name: string; role: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, pRes, uRes] = await Promise.all([
        fetch('/api/tasks', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/projects', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/users', { credentials: 'include', cache: 'no-store' }),
      ]);
      const [tData, pData, uData] = await Promise.all([tRes.json(), pRes.json(), uRes.json()]);
      if (tData.success) setTasks(tData.tasks);
      if (pData.success) setProjects(pData.projects);
      if (uData.success && Array.isArray(uData.users)) setTeamMembers(uData.users);
    } catch (err) {
      console.error('Failed to load tasks/projects:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pre-fill project owner with logged-in user's name when modal opens
  useEffect(() => {
    if (isNewProjectOpen && user?.name) {
      setNpOwner(prev => prev || user.name);
    }
  }, [isNewProjectOpen, user?.name]);

  const handleExport = () => {
    downloadCSV(tasks, 'Tasks_Export');
    showToast('Tasks exported as CSV', 'success');
    triggerActivityLog('file_download', 'Exported Tasks to CSV');
  };

  const STAGES = ['Backlog', 'In Progress', 'Review', 'Done'];

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.stage === targetStage) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t._id === draggedItem.id ? { ...t, stage: targetStage } : t));
    setDraggedItem(null);

    try {
      const res = await fetch(`/api/tasks/${draggedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stage: targetStage }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Task moved to ${targetStage}`, 'success');
        triggerActivityLog('task_update', `Task moved to ${targetStage}`);
      } else {
        showToast(data.error || 'Failed to update task', 'error');
        fetchData(); // revert on failure
      }
    } catch {
      showToast('Network error updating task', 'error');
      fetchData();
    }
  };

  const filteredTasks = tasks.filter(t => {
     if (activeFilter && !t.tags.includes(activeFilter)) return false;
     if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
     return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-base text-primary overflow-hidden transition-colors">
      
      {/* Header */}
      <div className="p-8 pb-4 shrink-0 border-b border-border bg-base z-10 transition-colors">
        <div className="flex justify-between items-start mb-6">
           <div>
              <h1 className="text-2xl font-bold tracking-tight mb-1">Projects & Tasks</h1>
              <p className="text-secondary text-sm font-medium">Sprint boards, backlogs, and team assignments.</p>
           </div>
           <div className="flex gap-3 relative z-30">
               <button 
                 type="button"
                 onClick={() => { setIsNewProjectOpen(true); showToast('Opening Project Creator', 'info'); }} 
                 className="px-4 py-2 border border-border bg-surface text-primary rounded-xl text-xs font-semibold hover:bg-base transition-colors shadow-sm cursor-pointer"
               >
                  Create Project
               </button>
               <button 
                 type="button"
                 onClick={() => { setIsNewTaskOpen(true); showToast('Opening Task Creator', 'info'); }} 
                 className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-600 transition-colors cursor-pointer"
               >
                  <Plus size={16} /> New Task
               </button>
           </div>
        </div>

        <div className="flex items-center justify-between">
           <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
              <button onClick={() => setActiveTab('board')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'board' ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>
                <LayoutDashboard size={14} /> Sprint Board
              </button>
              <button onClick={() => setActiveTab('list')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === 'list' ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>
                <LayoutList size={14} /> Backlog List
              </button>
           </div>

           <div className="flex gap-4 items-center">
             <div className="relative group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Search tasks..." 
                  className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent transition-all text-primary font-medium"
                />
             </div>
             <button onClick={handleExport} className="p-2 border border-border bg-surface text-secondary hover:text-primary rounded-xl transition-colors shadow-sm">
                <Download size={16} />
             </button>
           </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 shrink-0 border-r border-border bg-surface p-6 overflow-y-auto hidden lg:block transition-colors">
              <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-4">Active Projects</h3>
              <div className="space-y-2 mb-8">
                 {projects.map(proj => (
                   <div key={proj._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-base transition-colors cursor-pointer group">
                      <Folder size={16} className="text-accent" />
                      <div className="flex-1 min-w-0">
                         <div className="text-xs font-bold truncate group-hover:text-accent transition-colors">{proj.name}</div>
                         <div className="text-[9px] text-tertiary">Due {proj.deadline}</div>
                      </div>
                   </div>
                 ))}
              </div>

              <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-4">Saved Views</h3>
              <ul className="space-y-1 mb-8">
                 <li><button onClick={() => { setActiveFilter(null); showToast('Showing all tasks', 'info') }} className={`w-full text-left px-3 py-2 text-xs rounded font-bold transition-all ${activeFilter === null ? 'bg-base text-accent border border-border shadow-sm' : 'text-secondary hover:bg-base hover:text-primary'}`}>All Tasks</button></li>
                 <li><button onClick={() => { setActiveFilter('UI/UX'); showToast('Showing assigned tasks', 'info') }} className={`w-full text-left px-3 py-2 text-xs rounded font-bold transition-all ${activeFilter === 'UI/UX' ? 'bg-base text-accent border border-border shadow-sm' : 'text-secondary hover:bg-base hover:text-primary'}`}>Assigned to Me</button></li>
                 <li><button onClick={() => { setActiveFilter('Backend'); showToast('Showing priority tasks', 'info') }} className={`w-full text-left px-3 py-2 text-xs rounded font-bold transition-all ${activeFilter === 'Backend' ? 'bg-base text-accent border border-border shadow-sm' : 'text-secondary hover:bg-base hover:text-primary'}`}>Due Next</button></li>
              </ul>

              <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-4">Filter by Tag</h3>
              <div className="space-y-3">
                 {['Frontend', 'Backend', 'Database', 'UI/UX'].map(tag => (
                     <label key={tag} className="flex items-center gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={activeFilter === tag}
                          onChange={() => setActiveFilter(activeFilter === tag ? null : tag)}
                          className="w-4 h-4 rounded border-border bg-transparent accent-accent" 
                        />
                        <span className={`text-xs font-bold transition-colors ${activeFilter === tag ? 'text-accent' : 'text-secondary group-hover:text-primary'}`}>{tag}</span>
                     </label>
                 ))}
              </div>
          </div>

          {/* Main Board */}
          <div className="flex-1 overflow-x-auto p-6 bg-base/50 relative shadow-inner">
             <div className="flex gap-6 h-full min-w-max relative z-10">
                {STAGES.map(stage => (
                   <div 
                     key={stage} 
                     className="flex flex-col w-[320px] bg-surface/40 backdrop-blur rounded-2xl border border-dashed border-border/50"
                     onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                     onDrop={(e) => handleDrop(e, stage)}
                   >
                       <div className="p-4 flex items-center justify-between mb-2">
                          <div className="flex gap-2 items-center">
                             <div className={`w-2 h-2 rounded-full ${stage === 'Done' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : stage === 'In Progress' ? 'bg-blue-500' : stage === 'Review' ? 'bg-yellow-500' : 'bg-gray-500'}`}></div>
                             <h3 className="font-bold text-sm text-primary">{stage}</h3>
                          </div>
                          <span className="text-[10px] font-bold bg-surface border border-border text-secondary px-2.5 py-0.5 rounded-full">
                             {filteredTasks.filter(t => t.stage === stage).length}
                          </span>
                       </div>

                       <div className="p-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                           <AnimatePresence mode="popLayout">
                              {filteredTasks.filter(t => t.stage === stage).map(task => (
                                 <motion.div
                                   key={task._id}
                                   layout
                                   initial={{ opacity: 0, scale: 0.95 }}
                                   animate={{ opacity: 1, scale: 1 }}
                                   exit={{ opacity: 0, scale: 0.9 }}
                                   draggable
                                   onDragStart={() => setDraggedItem({ id: task._id, stage })}
                                   onDragEnd={() => setDraggedItem(null)}
                                   className="bg-base border border-border p-5 rounded-2xl cursor-grab active:cursor-grabbing hover:border-accent/50 hover:shadow-lg transition-all group shadow-sm"
                                 >
                                    <div className="flex justify-between items-start mb-3">
                                       <span className="text-[9px] font-bold text-tertiary uppercase tracking-widest">{task.code}</span>
                                       <div className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                           task.priority === 'Critical' ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                                           task.priority === 'High' ? 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' :
                                           task.priority === 'Medium' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                                           'bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20'
                                       }`}>
                                          {task.priority}
                                       </div>
                                    </div>
                                    <h4 className="text-sm font-bold text-primary mb-3 leading-snug group-hover:text-accent transition-colors">{task.title}</h4>
                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                       {task.tags.map(tag => (
                                          <span key={tag} className="text-[9px] font-bold text-secondary bg-surface border border-border px-2 py-0.5 rounded-md">{tag}</span>
                                       ))}
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                                       <GripVertical size={14} className="text-tertiary opacity-20 group-hover:opacity-100 transition-opacity" />
                                       <div className="flex -space-x-2">
                                          <div className="w-6 h-6 rounded-full border-2 border-base bg-accent text-white flex items-center justify-center text-[8px] font-bold">JD</div>
                                          <div className="w-6 h-6 rounded-full border-2 border-base bg-surface text-secondary flex items-center justify-center text-[8px] font-bold">+2</div>
                                       </div>
                                    </div>
                                 </motion.div>
                              ))}
                           </AnimatePresence>
                       </div>
                   </div>
                ))}
             </div>
          </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isNewTaskOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
               <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Plus size={18} className="text-accent" /> Create New Task</h2>
                  <button onClick={() => setIsNewTaskOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
               </div>
               <div className="p-8 flex flex-col gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Task Title *</label>
                    <input type="text" value={ntTitle} onChange={e=>setNtTitle(e.target.value)} placeholder="e.g. Implement Auth" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Priority</label>
                      <select value={ntPriority} onChange={e=>setNtPriority(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm appearance-none text-primary">
                         <option>Low</option>
                         <option>Medium</option>
                         <option>High</option>
                         <option>Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Stage</label>
                      <select value={ntStage} onChange={e=>setNtStage(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm appearance-none text-primary">
                         {STAGES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
               </div>
               <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button onClick={() => setIsNewTaskOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button onClick={async () => {
                    if(!ntTitle) { showToast('Title is required', 'warning'); return; }
                    try {
                      const res = await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ title: ntTitle, stage: ntStage, priority: ntPriority, tags: ['New'] }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setTasks(prev => [data.task, ...prev]);
                        setIsNewTaskOpen(false);
                        setNtTitle('');
                        showToast('Task created!', 'success');
                        triggerActivityLog('task_update', `Created new task: ${ntTitle}`);
                      } else {
                        showToast(data.error || 'Failed to create task', 'error');
                      }
                    } catch { showToast('Network error', 'error'); }
                  }} className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-emerald-600 transition-all shadow-lg active:scale-95 text-xs">Create Task</button>
               </div>
            </motion.div>
          </motion.div>
        )}

        {isNewProjectOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
               <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Folder size={18} className="text-accent" /> Create New Project</h2>
                  <button onClick={() => setIsNewProjectOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
               </div>
               <div className="p-8 flex flex-col gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Project Name *</label>
                    <input type="text" value={npName} onChange={e=>setNpName(e.target.value)} placeholder="e.g. Q3 Sales Expansion" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Deadline</label>
                      <input type="date" value={npDeadline} onChange={e=>setNpDeadline(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Project Owner</label>
                      <select value={npOwner} onChange={e=>setNpOwner(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm appearance-none text-primary">
                         {user?.name && <option value={user.name}>{user.name} (You)</option>}
                          {teamMembers.filter(m => m.name !== user?.name).map(m => (
                            <option key={m._id} value={m.name}>{m.name} ({m.role})</option>
                          ))}
                          {teamMembers.length === 0 && !user?.name && <option value="">Unassigned</option>}
                      </select>
                    </div>
                  </div>
               </div>
               <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button onClick={() => setIsNewProjectOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button onClick={async () => { 
                    if(!npName) { showToast('Project name is required', 'warning'); return; }
                    try {
                      const res = await fetch('/api/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ name: npName, deadline: npDeadline || '', owner: npOwner }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setProjects(prev => [data.project, ...prev]);
                        setIsNewProjectOpen(false);
                        setNpName(''); setNpDeadline(''); setNpOwner('');
                        showToast('Project workspace initialized!', 'success');
                      } else {
                        showToast(data.error || 'Failed to create project', 'error');
                      }
                    } catch { showToast('Network error', 'error'); }
                  }} className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-emerald-600 transition-all shadow-lg active:scale-95 text-xs">Create Project</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
