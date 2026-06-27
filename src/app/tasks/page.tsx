'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import { Search, Plus, Filter, LayoutDashboard, LayoutList, GripVertical, Download, X, Folder, CheckSquare, Trash2 } from 'lucide-react';
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

export function TasksBoard() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'board' | 'list'>('board');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
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
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ _id: string; name: string; role: string }[]>([]);

  // Pagination & Bulk Selection states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Command Palette deep linking trigger
  useEffect(() => {
    if (searchParams) {
      if (searchParams.get('openModal') === 'true') {
        setIsNewTaskOpen(true);
      }
      if (searchParams.get('openProjectModal') === 'true') {
        setIsNewProjectOpen(true);
      }
    }
  }, [searchParams]);

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

  const totalPages = Math.ceil(filteredTasks.length / pageSize);
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [filteredTasks.length, pageSize, totalPages, currentPage]);

  const toggleSelectTask = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPageTasks = () => {
    const allPageIds = paginatedTasks.map(t => t._id);
    const allSelected = allPageIds.every(id => selectedTaskIds.has(id));
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allPageIds.forEach(id => next.delete(id));
      } else {
        allPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBulkUpdateStage = async (targetStage: string) => {
    showToast(`Bulk updating ${selectedTaskIds.size} tasks to ${targetStage}...`, 'info');
    const ids = Array.from(selectedTaskIds);
    let successCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: targetStage }),
        });
        const data = await res.json();
        if (data.success) successCount++;
      } catch (_) {}
    }
    showToast(`Successfully updated ${successCount}/${ids.length} tasks`, 'success');
    setSelectedTaskIds(new Set());
    fetchData();
  };

  const handleBulkDeleteTasks = async () => {
    if (!confirm(`Are you sure you want to permanently delete the ${selectedTaskIds.size} selected tasks?`)) return;
    showToast(`Bulk deleting ${selectedTaskIds.size} tasks...`, 'info');
    const ids = Array.from(selectedTaskIds);
    let successCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) successCount++;
      } catch (_) {}
    }
    showToast(`Successfully deleted ${successCount}/${ids.length} tasks`, 'success');
    setSelectedTaskIds(new Set());
    fetchData();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base text-primary overflow-hidden transition-colors">

      {/* ── Header ── */}
      <div className="px-7 pt-7 pb-4 shrink-0 border-b border-border/60 bg-base z-10 transition-colors">
        <div className="flex justify-between items-start mb-5">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-secondary/70 uppercase tracking-widest">Workspace</p>
            <h1 className="text-2xl font-bold tracking-tight">Projects &amp; Tasks</h1>
            <p className="text-sm text-secondary font-medium">Sprint boards, backlogs, and team assignments.</p>
          </div>
          <div className="flex gap-2.5 relative z-30">
            <button
              type="button"
              onClick={() => { setIsNewProjectOpen(true); showToast('Opening Project Creator', 'info'); }}
              className="btn-enterprise-secondary flex items-center gap-1.5"
            >
              Create Project
            </button>
            <button
              type="button"
              onClick={() => { setIsNewTaskOpen(true); showToast('Opening Task Creator', 'info'); }}
              className="btn-enterprise-primary flex items-center gap-2"
            >
              <Plus size={14} /> New Task
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {/* View tabs */}
          <div className="flex items-center bg-surface border border-border/60 rounded-xl p-0.5">
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-[10px] transition-all duration-150 ${
                activeTab === 'board' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'
              }`}
            >
              <LayoutDashboard size={13} /> Sprint Board
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-[10px] transition-all duration-150 ${
                activeTab === 'list' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'
              }`}
            >
              <LayoutList size={13} /> Backlog List
            </button>
          </div>

          <div className="flex gap-2.5 items-center">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks…"
                className="input-enterprise pl-8 py-2 text-xs w-56"
              />
            </div>
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              className={`p-2 border rounded-xl transition-all ${
                filtersCollapsed
                  ? 'border-border/60 bg-surface text-secondary hover:text-primary'
                  : 'border-accent/30 bg-accent/10 text-accent'
              }`}
              title={filtersCollapsed ? 'Show Filters' : 'Hide Filters'}
            >
              <Filter size={14} />
            </button>
            <button
              onClick={handleExport}
              className="p-2 border border-border/60 bg-surface text-secondary hover:text-primary rounded-xl transition-colors"
              title="Export CSV"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Filter Sidebar ── */}
        <div className={`shrink-0 bg-surface overflow-y-auto hidden lg:block transition-all duration-300 ${
          filtersCollapsed ? 'w-0 p-0 border-r-0 overflow-hidden' : 'w-60 border-r border-border/60 p-5'
        }`}>
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Active Projects</p>
              <div className="space-y-1">
                {projects.map(proj => (
                  <div key={proj._id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-base/60 transition-colors cursor-pointer group">
                    <Folder size={14} className="text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate group-hover:text-accent transition-colors">{proj.name}</div>
                      <div className="text-[10px] text-tertiary">Due {proj.deadline}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Saved Views</p>
              <ul className="space-y-0.5">
                {[
                  { label: 'All Tasks',      filter: null },
                  { label: 'Assigned to Me', filter: 'UI/UX' },
                  { label: 'Due Next',       filter: 'Backend' },
                ].map(({ label, filter }) => (
                  <li key={label}>
                    <button
                      onClick={() => { setActiveFilter(filter); showToast(`Showing ${label}`, 'info'); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-xl font-semibold transition-all ${
                        activeFilter === filter
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'text-secondary hover:bg-base/60 hover:text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Filter by Tag</p>
              <div className="space-y-2">
                {['Frontend', 'Backend', 'Database', 'UI/UX'].map(tag => (
                  <label key={tag} className="flex items-center gap-2.5 cursor-pointer group px-1">
                    <input
                      type="checkbox"
                      checked={activeFilter === tag}
                      onChange={() => setActiveFilter(activeFilter === tag ? null : tag)}
                      className="w-3.5 h-3.5 rounded border-border accent-accent"
                    />
                    <span className={`text-xs font-semibold transition-colors ${
                      activeFilter === tag ? 'text-accent' : 'text-secondary group-hover:text-primary'
                    }`}>{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

          {/* Main Board */}
          <div className="flex-1 overflow-x-auto p-6 bg-base/50 relative shadow-inner flex flex-col">
             {loadingData ? (
                /* Skeleton board */
                <div className="flex gap-5 h-full min-w-max relative z-10">
                   {STAGES.map(stage => (
                      <div key={stage} className="flex flex-col w-[300px] bg-surface/40 rounded-2xl border border-border/50 p-4 space-y-3">
                         <div className="flex items-center justify-between mb-1">
                            <div className="skeleton-enterprise h-3.5 w-24 rounded" />
                            <div className="skeleton-enterprise h-5 w-7 rounded-full" />
                         </div>
                         {[1, 2].map(i => (
                            <div key={i} className="bg-surface border border-border/60 p-4 rounded-xl space-y-2.5">
                               <div className="flex justify-between">
                                  <div className="skeleton-enterprise h-2.5 w-12 rounded" />
                                  <div className="skeleton-enterprise h-2.5 w-10 rounded" />
                               </div>
                               <div className="skeleton-enterprise h-3.5 w-full rounded" />
                               <div className="skeleton-enterprise h-3.5 w-2/3 rounded" />
                               <div className="flex gap-1.5 pt-1">
                                  <div className="skeleton-enterprise h-4 w-14 rounded-full" />
                                  <div className="skeleton-enterprise h-4 w-14 rounded-full" />
                               </div>
                            </div>
                         ))}
                      </div>
                   ))}
                </div>
             ) : filteredTasks.length === 0 ? (
                /* Rich Empty State */
                <div className="flex-1 flex flex-col items-center justify-center p-12 bg-surface/40 backdrop-blur border border-dashed border-border rounded-2xl m-4">
                   <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4">
                      <CheckSquare size={32} />
                   </div>
                   <h3 className="text-lg font-bold text-primary mb-1">No Tasks Found</h3>
                   <p className="text-secondary text-sm mb-6 max-w-sm text-center font-medium">There are no tasks matching your current search or filters. Create a task to start tracking progress.</p>
                   <button 
                     onClick={() => setIsNewTaskOpen(true)} 
                     className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-600 transition-all cursor-pointer active:scale-95"
                   >
                      <Plus size={16} /> Create New Task
                   </button>
                </div>
              ) : activeTab === 'list' ? (
                /* ── Backlog List ── */
                <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
                  <div className="card-enterprise p-0 overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <table className="table-enterprise">
                        <thead>
                          <tr>
                            <th className="w-10 text-center px-5">
                              <input
                                type="checkbox"
                                checked={paginatedTasks.length > 0 && paginatedTasks.every(t => selectedTaskIds.has(t._id))}
                                onChange={toggleSelectAllPageTasks}
                                className="w-3.5 h-3.5 rounded border-border accent-accent"
                              />
                            </th>
                            <th className="px-4">Task Code</th>
                            <th className="px-4">Title</th>
                            <th className="px-4">Priority</th>
                            <th className="px-4">Stage</th>
                            <th className="px-4">Tags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTasks.map(task => {
                            const isSelected = selectedTaskIds.has(task._id);
                            const priorityCls =
                              task.priority === 'Critical' ? 'badge-enterprise badge-enterprise-danger' :
                              task.priority === 'High'     ? 'badge-enterprise badge-enterprise-warning' :
                              task.priority === 'Medium'   ? 'badge-enterprise badge-enterprise-info' :
                              'badge-enterprise';
                            const stageCls =
                              task.stage === 'Done'        ? 'badge-enterprise badge-enterprise-success' :
                              task.stage === 'In Progress' ? 'badge-enterprise badge-enterprise-info' :
                              task.stage === 'Review'      ? 'badge-enterprise badge-enterprise-warning' :
                              'badge-enterprise';
                            return (
                              <tr
                                key={task._id}
                                onClick={() => toggleSelectTask(task._id)}
                                className={`cursor-pointer transition-colors group ${
                                  isSelected ? 'bg-accent/5' : 'hover:bg-accent/[0.02]'
                                }`}
                              >
                                <td className="px-5 text-center" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectTask(task._id)}
                                    className="w-3.5 h-3.5 rounded border-border accent-accent"
                                  />
                                </td>
                                <td className="px-4">
                                  <span className="font-mono text-xs font-bold text-secondary">{task.code || 'TSK-001'}</span>
                                </td>
                                <td className="px-4">
                                  <span className="font-semibold text-primary text-xs group-hover:text-accent transition-colors">{task.title}</span>
                                </td>
                                <td className="px-4"><span className={priorityCls}>{task.priority}</span></td>
                                <td className="px-4"><span className={stageCls}>{task.stage}</span></td>
                                <td className="px-4">
                                  <div className="flex gap-1.5 flex-wrap">
                                    {task.tags.map(tag => (
                                      <span key={tag} className="badge-enterprise text-[10px]">{tag}</span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-base/20 shrink-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] text-secondary font-medium">Rows per page:</span>
                        <select
                          value={pageSize}
                          onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                          className="select-enterprise !w-auto !py-1 !px-2.5 !text-xs"
                        >
                          {[10, 20, 50].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span className="text-[11px] text-tertiary font-medium ml-1">
                          {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTasks.length)} of {filteredTasks.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className="px-3 py-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg text-xs font-semibold transition-all"
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalPages }).map((_, i) => {
                          const pg = i + 1;
                          if (totalPages > 5 && pg !== 1 && pg !== totalPages && Math.abs(currentPage - pg) > 1) {
                            if (pg === 2 && currentPage > 3) return <span key={pg} className="text-secondary text-xs px-1">…</span>;
                            if (pg === totalPages - 1 && currentPage < totalPages - 2) return <span key={pg} className="text-secondary text-xs px-1">…</span>;
                            return null;
                          }
                          return (
                            <button
                              key={pg}
                              onClick={() => setCurrentPage(pg)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                currentPage === pg ? 'bg-accent text-white shadow-sm' : 'border border-border/60 bg-surface text-secondary hover:text-primary'
                              }`}
                            >
                              {pg}
                            </button>
                          );
                        })}
                        <button
                          disabled={currentPage === totalPages || totalPages === 0}
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className="px-3 py-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg text-xs font-semibold transition-all"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Floating bulk action bar */}
                  <AnimatePresence>
                    {selectedTaskIds.size > 0 && (
                      <motion.div
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border/80 rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-5 max-w-lg w-full justify-between backdrop-blur-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center">{selectedTaskIds.size}</div>
                          <span className="text-xs font-semibold text-primary">selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onChange={e => { if (e.target.value) { handleBulkUpdateStage(e.target.value); e.target.value = ''; } }}
                            className="select-enterprise !w-auto !py-1.5 !text-xs"
                          >
                            <option value="">Move Stage…</option>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {(user?.role === 'Admin' || user?.role === 'Manager') && (
                            <button onClick={handleBulkDeleteTasks} className="btn-enterprise-danger !py-1.5 !text-xs flex items-center gap-1.5">
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                          <button onClick={() => setSelectedTaskIds(new Set())} className="text-xs text-secondary hover:text-primary transition-colors font-semibold px-2">Clear</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
             ) : (
                /* ── Sprint Board ── */
                <div className="flex gap-5 h-full min-w-max relative z-10">
                  {STAGES.map(stage => (
                    <div
                      key={stage}
                      className="flex flex-col w-[300px] bg-surface/40 rounded-2xl border border-border/40"
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={e => handleDrop(e, stage)}
                    >
                      <div className="px-4 py-3.5 flex items-center justify-between border-b border-border/40">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            stage === 'Done'        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' :
                            stage === 'In Progress' ? 'bg-accent shadow-[0_0_6px_rgba(99,102,241,0.4)]' :
                            stage === 'Review'      ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]' :
                            'bg-border'
                          }`} />
                          <h3 className="text-xs font-bold text-primary">{stage}</h3>
                        </div>
                        <span className="text-[10px] font-bold bg-base border border-border/60 text-secondary px-2 py-0.5 rounded-full">
                          {filteredTasks.filter(t => t.stage === stage).length}
                        </span>
                      </div>

                      <div className="p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                        <AnimatePresence mode="popLayout">
                          {filteredTasks.filter(t => t.stage === stage).map(task => {
                            const priorityCls =
                              task.priority === 'Critical' ? 'badge-enterprise badge-enterprise-danger' :
                              task.priority === 'High'     ? 'badge-enterprise badge-enterprise-warning' :
                              task.priority === 'Medium'   ? 'badge-enterprise badge-enterprise-info' :
                              'badge-enterprise';
                            return (
                              <motion.div
                                key={task._id}
                                layout
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.92 }}
                                draggable
                                onDragStart={() => setDraggedItem({ id: task._id, stage })}
                                onDragEnd={() => setDraggedItem(null)}
                                className="bg-base border border-border/60 p-4 rounded-xl cursor-grab active:cursor-grabbing hover:border-accent/40 hover:shadow-md transition-all group shadow-sm"
                              >
                                <div className="flex justify-between items-start mb-2.5">
                                  <span className="text-[9px] font-bold text-tertiary uppercase tracking-widest">{task.code}</span>
                                  <span className={priorityCls}>{task.priority}</span>
                                </div>
                                <h4 className="text-xs font-semibold text-primary mb-3 leading-snug group-hover:text-accent transition-colors">{task.title}</h4>
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                  {task.tags.map(tag => (
                                    <span key={tag} className="badge-enterprise text-[9px]">{tag}</span>
                                  ))}
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-auto">
                                  <GripVertical size={13} className="text-tertiary opacity-20 group-hover:opacity-70 transition-opacity" />
                                  <div className="flex -space-x-1.5">
                                    <div className="w-5 h-5 rounded-full border-2 border-base bg-accent/20 text-accent flex items-center justify-center text-[7px] font-bold">JD</div>
                                    <div className="w-5 h-5 rounded-full border-2 border-base bg-surface text-secondary flex items-center justify-center text-[7px] font-bold">+2</div>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                </div>
             )}
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
                  <button 
                    onClick={async () => {
                      if(!ntTitle) { showToast('Title is required', 'warning'); return; }
                      setCreatingTask(true);
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
                      finally { setCreatingTask(false); }
                    }} 
                    disabled={creatingTask}
                    className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-emerald-600 transition-all shadow-lg active:scale-95 text-xs disabled:opacity-50 flex items-center gap-2"
                  >
                     {creatingTask && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                     {creatingTask ? 'Creating...' : 'Create Task'}
                  </button>
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
                  <button 
                    onClick={async () => { 
                      if(!npName) { showToast('Project name is required', 'warning'); return; }
                      setCreatingProject(true);
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
                      finally { setCreatingProject(false); }
                    }} 
                    disabled={creatingProject}
                    className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-emerald-600 transition-all shadow-lg active:scale-95 text-xs disabled:opacity-50 flex items-center gap-2"
                  >
                     {creatingProject && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                     {creatingProject ? 'Initializing...' : 'Create Project'}
                  </button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Tasks() {
  return (
    <Suspense fallback={<div className="p-8 text-secondary">Loading tasks and projects...</div>}>
      <TasksBoard />
    </Suspense>
  );
}
