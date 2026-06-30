'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, AlignLeft, ListChecks, Paperclip, Timer, History,
  CheckCircle2, Circle, Plus, Trash2, Loader2, AlertCircle,
  ThumbsUp, Calendar as CalendarIcon, CheckSquare
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import {
  OpsDrawer, OpsTabs, OpsBadge, OpsAvatar, OpsButton,
  OpsInput, OpsSelect, OpsEmptyState, OpsSkeleton, OpsErrorState
} from '@/components/ui/ops';
import { stageToBadgeVariant, priorityToBadgeVariant } from '@/components/ui/ops/Badge';

export interface Task {
  _id: string;
  title: string;
  stage: string;
  priority: string;
  code: string;
  tags: string[];
  assignee?: string;
  description?: string;
  dueDate?: string;
  progress?: number;
  subtasks?: { title: string; done: boolean }[];
  logs?: { time: string; note: string; author: string }[];
  createdBy?: string;
  createdAt?: string;
  projectId?: string;
  attachments?: string[];
}

export interface Project {
  _id: string;
  name: string;
}

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export interface TaskDrawerProps {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  onUpdateSuccess?: () => void;
  // Optional pre-fetched lists (if not passed, drawer will fetch dynamically)
  projects?: Project[];
  teamMembers?: TeamMember[];
}

export function TaskDrawer({
  open,
  onClose,
  taskId,
  onUpdateSuccess,
  projects: initialProjects,
  teamMembers: initialTeamMembers,
}: TaskDrawerProps) {
  const { user } = useAuth();
  const { showToast } = useUI();

  // Component states
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Truncation limits for high-scale performance
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Lookup lists
  const [projects, setProjects] = useState<Project[]>(initialProjects || []);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers || []);

  // Form states (synced with loaded task)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [workLogNote, setWorkLogNote] = useState('');

  // Approval modal/rejection notes state
  const [rejectionMode, setRejectionMode] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');

  // Role permissions helpers
  const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager';
  const isEmployeeOrMR = user?.role === 'Staff' || user?.role === 'Employee' || user?.role === 'User' || user?.role === 'MR';

  // Load single task detail by ID for scalability (GET /api/tasks/:id)
  const loadTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load task');
      const data = await res.json();
      if (data.success && data.task) {
        const found = data.task;
        setTask(found);
        setTitle(found.title || '');
        setDescription(found.description || '');
        setStage(found.stage || 'Backlog');
        setPriority(found.priority || 'Medium');
        setAssignee(found.assignee || '');
        setProjectId(found.projectId || '');
        setDueDate(found.dueDate ? new Date(found.dueDate).toISOString().split('T')[0] : '');
      } else {
        throw new Error(data.error || 'Task not found');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Load lookup lists dynamically if not provided
  useEffect(() => {
    if (!open || !taskId) return;
    loadTask();

    // Reset pagination toggles on drawer open
    setShowAllLogs(false);
    setShowAllActivity(false);

    if (!initialProjects || initialProjects.length === 0) {
      fetch('/api/projects', { credentials: 'include' })
        .then(res => res.json())
        .then(data => data.success && setProjects(data.projects || []))
        .catch(err => console.error('Failed to fetch projects:', err));
    }
    if (!initialTeamMembers || initialTeamMembers.length === 0) {
      fetch('/api/users', { credentials: 'include' })
        .then(res => res.json())
        .then(data => data.success && setTeamMembers(data.users || []))
        .catch(err => console.error('Failed to fetch team members:', err));
    }
  }, [open, taskId, loadTask, initialProjects, initialTeamMembers]);

  // Handle task field update (only payloads changes, e.g. { subtasks, progress })
  const handleUpdate = async (fields: Partial<Task>) => {
    if (!taskId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Task updated successfully', 'success');
        // Refresh local state and parent view
        if (task) {
          const updatedTask = { ...task, ...fields };
          setTask(updatedTask);
        }
        onUpdateSuccess?.();
      } else {
        throw new Error(data.error || 'Failed to update task');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating task', 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Toggle checklist item
  const handleToggleChecklist = async (index: number) => {
    if (!task || !task.subtasks) return;
    const subtasks = [...task.subtasks];
    subtasks[index] = { ...subtasks[index], done: !subtasks[index].done };

    // Recalculate progress
    const total = subtasks.length;
    const checked = subtasks.filter(s => s.done).length;
    const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

    await handleUpdate({ subtasks, progress });
  };

  // Add checklist item
  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistItem.trim() || !task) return;
    const subtasks = [...(task.subtasks || []), { title: newChecklistItem.trim(), done: false }];
    
    // Recalculate progress
    const total = subtasks.length;
    const checked = subtasks.filter(s => s.done).length;
    const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

    setNewChecklistItem('');
    await handleUpdate({ subtasks, progress });
  };

  // Delete checklist item
  const handleDeleteChecklistItem = async (index: number) => {
    if (!task || !task.subtasks) return;
    const subtasks = task.subtasks.filter((_, i) => i !== index);

    // Recalculate progress
    const total = subtasks.length;
    const checked = subtasks.filter(s => s.done).length;
    const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

    await handleUpdate({ subtasks, progress });
  };

  // Log work
  const handleLogWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workLogNote.trim() || !task) return;
    const newLog = {
      time: new Date().toISOString(),
      note: workLogNote.trim(),
      author: user?.name || 'Unknown User'
    };
    const logs = [...(task.logs || []), newLog];
    setWorkLogNote('');
    await handleUpdate({ logs });
  };

  // Submit for Review (Employee/MR Action)
  const handleSubmitForReview = async () => {
    await handleUpdate({ stage: 'Review' });
  };

  // Approve task (Manager/Admin Action)
  const handleApproveTask = async () => {
    await handleUpdate({ stage: 'Done' });
  };

  // Request changes / Reject (Manager/Admin Action)
  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionNote.trim()) return;

    // Log the rejection as a work log or update task status back to In Progress
    const newLog = {
      time: new Date().toISOString(),
      note: `REJECTION NOTE: ${rejectionNote.trim()}`,
      author: `${user?.name || 'Manager'} (Manager)`
    };
    const logs = [...(task?.logs || []), newLog];

    setRejectionMode(false);
    setRejectionNote('');
    await handleUpdate({ stage: 'In Progress', logs });
  };

  // Tabs structure
  const drawerTabs = [
    { id: 'overview', label: 'Overview', icon: <AlignLeft size={13} /> },
    { id: 'checklist', label: 'Checklist', icon: <ListChecks size={13} />, count: task?.subtasks?.length },
    { id: 'attachments', label: 'Files', icon: <Paperclip size={13} />, count: task?.attachments?.length },
    { id: 'timelogs', label: 'Logs', icon: <Timer size={13} />, count: task?.logs?.length },
    { id: 'activity', label: 'Activity', icon: <History size={13} /> },
  ];

  // Helper relative date
  const getRelativeDateString = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 0) return `In ${diff}d`;
    return `${Math.abs(diff)}d ago`;
  };

  // Truncation limits for logs & activity
  const allLogs = task?.logs || [];
  const displayedLogs = showAllLogs ? [...allLogs].reverse() : [...allLogs].reverse().slice(0, 10);
  const displayedActivity = showAllActivity ? allLogs : allLogs.slice(0, 10);

  return (
    <OpsDrawer
      open={open}
      onClose={onClose}
      title={task ? task.title : 'Task Details'}
      subtitle={task ? `Task Code: ${task.code}` : ''}
      width="440px"
      footer={
        task && (
          <div className="flex flex-col gap-2 w-full">
            {/* Rejection / Request Changes input block */}
            {rejectionMode && (
              <form onSubmit={handleRequestChanges} className="border border-border/80 bg-base p-3 rounded-lg flex flex-col gap-2 mb-2 animate-in fade-in duration-200">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                  Changes Request Details
                </label>
                <textarea
                  value={rejectionNote}
                  onChange={e => setRejectionNote(e.target.value)}
                  placeholder="Explain what changes are required before approval…"
                  rows={2}
                  required
                  className="w-full bg-transparent border border-border/60 rounded-md p-2 text-xs focus:outline-none focus:border-accent text-primary placeholder:text-secondary/50"
                />
                <div className="flex items-center justify-end gap-2">
                  <OpsButton variant="ghost" size="xs" onClick={() => setRejectionMode(false)}>
                    Cancel
                  </OpsButton>
                  <OpsButton variant="danger" size="xs" type="submit" loading={updating}>
                    Submit Changes Request
                  </OpsButton>
                </div>
              </form>
            )}

            {/* Stage-based action buttons */}
            <div className="flex items-center gap-2">
              {/* If task is in Review and current user is Manager/Admin */}
              {task.stage === 'Review' && isAdminOrManager && !rejectionMode && (
                <>
                  <OpsButton
                    variant="danger"
                    size="sm"
                    className="flex-1"
                    onClick={() => setRejectionMode(true)}
                  >
                    Request Changes
                  </OpsButton>
                  <OpsButton
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    icon={<ThumbsUp size={13} />}
                    onClick={handleApproveTask}
                    loading={updating}
                  >
                    Approve Task
                  </OpsButton>
                </>
              )}

              {/* If task is not in Review/Done and user is Employee/MR */}
              {task.stage !== 'Review' && task.stage !== 'Done' && isEmployeeOrMR && (
                <OpsButton
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={handleSubmitForReview}
                  loading={updating}
                >
                  Submit for Review
                </OpsButton>
              )}

              {/* If task is in Review and user is Employee/MR */}
              {task.stage === 'Review' && isEmployeeOrMR && (
                <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 text-amber-500 rounded-lg p-2.5 w-full text-xs font-semibold">
                  <AlertCircle size={14} className="shrink-0" />
                  Awaiting Manager Approval
                </div>
              )}

              {/* Default Save Button for Admin/Manager to save metadata details */}
              {isAdminOrManager && !rejectionMode && task.stage !== 'Review' && (
                <OpsButton
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    handleUpdate({
                      title,
                      description,
                      stage,
                      priority,
                      assignee,
                      projectId,
                      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
                    })
                  }
                  loading={updating}
                >
                  Save Changes
                </OpsButton>
              )}
            </div>
          </div>
        )
      }
    >
      {loading ? (
        <div className="p-6 space-y-6">
          <OpsSkeleton className="h-6 w-3/4 rounded" />
          <OpsSkeleton className="h-4 w-1/2 rounded" />
          <div className="space-y-4 pt-4">
            <OpsSkeleton className="h-10 w-full rounded" />
            <OpsSkeleton className="h-10 w-full rounded" />
            <OpsSkeleton className="h-10 w-full rounded" />
          </div>
        </div>
      ) : error ? (
        <div className="p-6">
          <OpsErrorState
            kind="generic"
            title="Failed to load task"
            description={error}
            onRetry={loadTask}
          />
        </div>
      ) : !task ? (
        <div className="p-6">
          <OpsEmptyState
            title="No task selected"
            description="Select a task from the dashboard list or board to view its full details here."
          />
        </div>
      ) : (
        <div className="flex flex-col h-full animate-in fade-in duration-200">
          {/* Header metadata summary */}
          <div className="px-5 py-3.5 bg-base/20 border-b border-border/40 flex flex-wrap gap-2.5 items-center">
            <OpsBadge variant={stageToBadgeVariant(task.stage)} dot>
              {task.stage}
            </OpsBadge>
            <OpsBadge variant={priorityToBadgeVariant(task.priority)}>
              {task.priority} Priority
            </OpsBadge>
            {task.dueDate && (
              <span className="text-[10px] font-bold text-secondary flex items-center gap-1 bg-surface border border-border/50 px-2 py-0.5 rounded-full">
                <Clock size={10} />
                {getRelativeDateString(task.dueDate)}
              </span>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="px-5 shrink-0 border-b border-border/40 bg-surface">
            <OpsTabs
              tabs={drawerTabs}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="underline"
            />
          </div>

          {/* Tab content area */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'overview' && (
              <div className="p-5 space-y-5">
                {/* Title (Editable for Admin/Manager) */}
                <div className="space-y-1">
                  {isAdminOrManager ? (
                    <OpsInput
                      label="Title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Task title"
                      required
                    />
                  ) : (
                    <div>
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Title</span>
                      <h3 className="text-xs font-bold text-primary mt-1">{task.title}</h3>
                    </div>
                  )}
                </div>

                {/* Description (Editable for Admin/Manager) */}
                <div className="space-y-1">
                  {isAdminOrManager ? (
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Add a detailed description for this task…"
                        rows={4}
                        className="w-full bg-base border border-border/70 rounded-lg px-3 py-2 text-[13px] font-medium text-primary placeholder:text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/15"
                      />
                    </div>
                  ) : (
                    <div>
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Description</span>
                      <p className="text-xs text-primary mt-1 leading-relaxed bg-base/30 p-2.5 border border-border/40 rounded-lg">
                        {task.description || <span className="text-secondary italic">No description provided</span>}
                      </p>
                    </div>
                  )}
                </div>

                {/* Settings Grid */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/30">
                  {/* Stage Selection */}
                  <div className="space-y-1">
                    {isAdminOrManager ? (
                      <OpsSelect
                        label="Stage"
                        value={stage}
                        onChange={e => setStage(e.target.value)}
                        options={[
                          { value: 'Backlog', label: 'Backlog' },
                          { value: 'To Do', label: 'To Do' },
                          { value: 'In Progress', label: 'In Progress' },
                          { value: 'Review', label: 'Review' },
                          { value: 'Done', label: 'Done' }
                        ]}
                      />
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Stage</span>
                        <div className="mt-1">
                          <OpsBadge variant={stageToBadgeVariant(task.stage)} dot>
                            {task.stage}
                          </OpsBadge>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Priority Selection */}
                  <div className="space-y-1">
                    {isAdminOrManager ? (
                      <OpsSelect
                        label="Priority"
                        value={priority}
                        onChange={e => setPriority(e.target.value)}
                        options={[
                          { value: 'Low', label: 'Low' },
                          { value: 'Medium', label: 'Medium' },
                          { value: 'High', label: 'High' },
                          { value: 'Critical', label: 'Critical' }
                        ]}
                      />
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Priority</span>
                        <div className="mt-1">
                          <OpsBadge variant={priorityToBadgeVariant(task.priority)}>
                            {task.priority}
                          </OpsBadge>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Assignee Selection */}
                  <div className="space-y-1">
                    {isAdminOrManager ? (
                      <OpsSelect
                        label="Assignee"
                        value={assignee}
                        onChange={e => setAssignee(e.target.value)}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...teamMembers.map(m => ({ value: m.name, label: `${m.name} (${m.role})` }))
                        ]}
                      />
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Assignee</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {task.assignee ? (
                            <>
                              <OpsAvatar name={task.assignee} size="xs" />
                              <span className="text-xs font-semibold text-primary">{task.assignee}</span>
                            </>
                          ) : (
                            <span className="text-xs text-secondary italic">Unassigned</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Due Date Selection */}
                  <div className="space-y-1">
                    {isAdminOrManager ? (
                      <OpsInput
                        label="Due Date"
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                      />
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Due Date</span>
                        <div className="mt-1 text-xs font-semibold text-primary flex items-center gap-1.5">
                          <CalendarIcon size={12} className="text-secondary" />
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : <span className="text-secondary italic">None</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Project Selection */}
                  <div className="space-y-1">
                    {isAdminOrManager ? (
                      <OpsSelect
                        label="Project"
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        options={[
                          { value: '', label: 'None' },
                          ...projects.map(p => ({ value: p._id, label: p.name }))
                        ]}
                      />
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Project</span>
                        <div className="mt-1 text-xs font-semibold text-primary">
                          {projects.find(p => p._id === task.projectId)?.name || <span className="text-secondary italic">None</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progress Indicator */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Progress</span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-2 bg-base rounded-full overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${task.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-primary">{task.progress || 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Metadata creation details */}
                <div className="pt-4 border-t border-border/30 text-[11px] text-secondary space-y-1">
                  {task.createdBy && (
                    <div className="flex justify-between">
                      <span>Created by</span>
                      <span className="font-semibold text-primary">{task.createdBy}</span>
                    </div>
                  )}
                  {task.createdAt && (
                    <div className="flex justify-between">
                      <span>Created date</span>
                      <span className="font-semibold text-primary">
                        {new Date(task.createdAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'checklist' && (
              <div className="p-5 space-y-4">
                {/* List items */}
                {task.subtasks && task.subtasks.length > 0 ? (
                  <div className="space-y-2">
                    {task.subtasks.map((st, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors duration-150 ${
                          st.done
                            ? 'bg-emerald-500/5 border-emerald-500/15 text-secondary'
                            : 'bg-base/30 border-border/60 text-primary hover:border-border'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleChecklist(i)}
                          className="flex items-center gap-2 flex-1 text-left focus:outline-none"
                        >
                          {st.done ? (
                            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                          ) : (
                            <Circle size={15} className="text-border shrink-0" />
                          )}
                          <span className={st.done ? 'line-through text-secondary/70' : 'font-medium'}>
                            {st.title}
                          </span>
                        </button>

                        {/* Delete button (Only for Admin, Manager or task.createdBy) */}
                        {(isAdminOrManager || task.createdBy === user?.name) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteChecklistItem(i)}
                            className="p-1 hover:bg-red-500/5 hover:text-red-500 rounded text-secondary transition-colors"
                            title="Delete item"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <OpsEmptyState
                    icon={<ListChecks size={28} />}
                    title="No checklist items"
                    description="Create atomic checklist tasks to verify step-by-step completion."
                    compact
                  />
                )}

                {/* Add Item Form */}
                <form onSubmit={handleAddChecklistItem} className="flex gap-2 pt-2 border-t border-border/30">
                  <OpsInput
                    placeholder="Add checklist item…"
                    value={newChecklistItem}
                    onChange={e => setNewChecklistItem(e.target.value)}
                    className="flex-1"
                  />
                  <OpsButton variant="secondary" size="sm" type="submit" icon={<Plus size={14} />} />
                </form>
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="p-5">
                {task.attachments && task.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {task.attachments.map((fileUrl, i) => {
                      const fileName = fileUrl.split('/').pop() || 'File attachment';
                      return (
                        <a
                          key={i}
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/60 hover:border-accent/30 bg-base/20 hover:bg-base/40 text-xs font-semibold text-primary transition-all duration-150"
                        >
                          <Paperclip size={14} className="text-secondary shrink-0" />
                          <span className="truncate flex-1">{fileName}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <OpsEmptyState
                    icon={<Paperclip size={28} />}
                    title="No file attachments"
                    description="Files are uploaded and linked directly from the task workflow backend."
                    compact
                  />
                )}
              </div>
            )}

            {activeTab === 'timelogs' && (
              <div className="p-5 space-y-4">
                {/* Log form */}
                <form onSubmit={handleLogWork} className="space-y-2.5 bg-base/20 border border-border/50 p-3 rounded-xl">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                    Add Time or Progress Note
                  </label>
                  <textarea
                    value={workLogNote}
                    onChange={e => setWorkLogNote(e.target.value)}
                    placeholder="Specify logged time or what work was completed…"
                    rows={2}
                    required
                    className="w-full bg-transparent border border-border/60 rounded-md p-2 text-xs focus:outline-none focus:border-accent text-primary placeholder:text-secondary/50"
                  />
                  <div className="flex justify-end">
                    <OpsButton variant="secondary" size="xs" type="submit" loading={updating}>
                      Log Work
                    </OpsButton>
                  </div>
                </form>

                {/* Log List */}
                {allLogs.length > 0 ? (
                  <div className="space-y-2">
                    {displayedLogs.map((log, i) => (
                      <div key={i} className="p-3 border border-border/40 rounded-lg bg-surface flex gap-3 animate-in fade-in duration-150">
                        <OpsAvatar name={log.author} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-bold text-primary">{log.author}</span>
                            <span className="text-[9px] text-secondary font-medium">
                              {new Date(log.time).toLocaleDateString()} {new Date(log.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-secondary leading-relaxed break-words">{log.note}</p>
                        </div>
                      </div>
                    ))}
                    {allLogs.length > 10 && !showAllLogs && (
                      <OpsButton
                        variant="secondary"
                        size="xs"
                        onClick={() => setShowAllLogs(true)}
                        className="w-full mt-2"
                      >
                        Show older logs ({allLogs.length - 10} more)
                      </OpsButton>
                    )}
                  </div>
                ) : (
                  <OpsEmptyState
                    icon={<Timer size={28} />}
                    title="No work logs yet"
                    description="Log status notes, shift progress, and updates as you work."
                    compact
                  />
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="p-5">
                {/* Timeline display generated from logs/creation */}
                <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                  {/* Task creation entry */}
                  <div className="flex gap-4 relative">
                    <div className="w-7 h-7 rounded-full bg-base border border-border flex items-center justify-center shrink-0 z-10 text-secondary">
                      <CheckSquare size={12} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-primary">Task Created</p>
                      <p className="text-[10px] text-secondary">
                        Created by {task.createdBy || 'System'} on {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Stage/Logs history (sliced for high-scale performance) */}
                  {displayedActivity.map((log, i) => {
                    const isRejection = log.note.startsWith('REJECTION NOTE:');
                    return (
                      <div key={i} className="flex gap-4 relative animate-in fade-in duration-150">
                        <div className={`w-7 h-7 rounded-full bg-base border flex items-center justify-center shrink-0 z-10 ${
                          isRejection ? 'border-red-500/30 text-red-500' : 'border-border text-secondary'
                        }`}>
                          {isRejection ? <AlertCircle size={12} /> : <ThumbsUp size={12} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-primary">
                            {isRejection ? 'Rejection / Changes Requested' : 'Work Logged'}
                          </p>
                          <p className="text-[10px] text-secondary">
                            Logged by {log.author} on {new Date(log.time).toLocaleString()}
                          </p>
                          <p className="text-xs text-secondary mt-1 max-w-xs">{log.note}</p>
                        </div>
                      </div>
                    );
                  })}

                  {allLogs.length > 10 && !showAllActivity && (
                    <div className="pl-11">
                      <OpsButton
                        variant="secondary"
                        size="xs"
                        onClick={() => setShowAllActivity(true)}
                        className="w-full mt-2"
                      >
                        Show older activity ({allLogs.length - 10} more)
                      </OpsButton>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </OpsDrawer>
  );
}
