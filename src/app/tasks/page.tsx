'use client';
import {
  useState, useEffect, useCallback, Suspense,
} from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCSV } from '@/utils/export';
import { triggerActivityLog } from '@/utils/activity';
import {
  LayoutDashboard, LayoutList, Calendar, BarChart2, Users,
  Plus, GripVertical, Clock, Trash2, FolderOpen, Loader2, RefreshCw,
  ClipboardList, TrendingUp, Zap, User, Download, AlertCircle,
  ChevronLeft, ChevronRight, Flag, PanelRightOpen,
  PanelRightClose, Layers, Folder, Activity, CheckCircle2, Circle,
  Paperclip, ListChecks, Timer, History, AlignLeft,
} from 'lucide-react';
import {
  OpsButton, OpsInput, OpsSelect, OpsSearch, OpsBadge,
  OpsAvatar, OpsTable, OpsTableHead, OpsTableBody,
  OpsTableRow, OpsTableCell, OpsTableHeadCell,
  OpsModal, OpsEmptyState, OpsErrorState,
  OpsFilterChip,
} from '@/components/ui/ops';
import { TaskDrawer } from '@/components/TaskDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
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
};

type Project = {
  _id: string;
  name: string;
  deadline?: string;
  owner?: string;
  description?: string;
};

type TeamMember = {
  _id: string;
  name: string;
  email: string;
  role: string;
};

type ViewType = 'board' | 'list' | 'timeline' | 'calendar' | 'workload' | 'reports';
type SortBy = 'createdAt' | 'dueDate' | 'priority' | 'title';

const STAGES = ['Backlog', 'In Progress', 'Review', 'Done'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
const PRIORITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

// ─── Colour helpers ───────────────────────────────────────────────────────────

function stageDot(stage: string) {
  return stage === 'Done'
    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
    : stage === 'In Progress'
    ? 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]'
    : stage === 'Review'
    ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)]'
    : 'bg-zinc-400';
}

function stageVariant(stage: string): 'success' | 'info' | 'warning' | 'default' {
  if (stage === 'Done') return 'success';
  if (stage === 'In Progress') return 'info';
  if (stage === 'Review') return 'warning';
  return 'default';
}

function priorityVariant(p: string): 'danger' | 'warning' | 'info' | 'default' {
  if (p === 'Critical') return 'danger';
  if (p === 'High') return 'warning';
  if (p === 'Medium') return 'info';
  return 'default';
}

function priorityIcon(p: string) {
  const cls =
    p === 'Critical' ? 'text-red-500'
    : p === 'High' ? 'text-amber-500'
    : p === 'Medium' ? 'text-indigo-400'
    : 'text-zinc-400';
  return <Flag size={10} className={cls} />;
}

// ─── relativeDate helper (used by Timeline & Calendar views) ─────────────────

function relativeDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return `In ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}


// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({
  tasks, onDrop, onSelectTask, selectedTaskId,
  draggedId, setDraggedId, dragFromStage, setDragFromStage,
}: {
  tasks: Task[];
  onDrop: (id: string, fromStage: string, toStage: string) => void;
  onSelectTask: (t: Task) => void;
  selectedTaskId?: string;
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
  dragFromStage: string | null;
  setDragFromStage: (s: string | null) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  return (
    <div className="flex gap-4 h-full min-w-max">
      {STAGES.map(stage => {
        const col = tasks.filter(t => t.stage === stage);
        const isTarget = dropTarget === stage && draggedId !== null;
        return (
          <div
            key={stage}
            className={`flex flex-col w-[280px] rounded-xl border transition-all duration-200 ${
              isTarget
                ? 'border-accent/50 bg-accent/5 shadow-[0_0_0_2px_rgba(99,102,241,0.2)]'
                : 'border-border/40 bg-surface/40'
            }`}
            onDragOver={e => { e.preventDefault(); setDropTarget(stage); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => {
              e.preventDefault();
              setDropTarget(null);
              if (draggedId && dragFromStage && dragFromStage !== stage) {
                onDrop(draggedId, dragFromStage, stage);
              }
              setDraggedId(null);
              setDragFromStage(null);
            }}
          >
            {/* Column header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${stageDot(stage)}`} />
                <span className="text-xs font-bold text-primary">{stage}</span>
              </div>
              <span className="text-[10px] font-bold text-secondary bg-base border border-border/50 px-1.5 py-0.5 rounded-full">
                {col.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2.5">
              <AnimatePresence mode="popLayout">
                {col.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 text-center opacity-50">
                    <Circle size={20} className="text-border mb-2" />
                    <p className="text-[11px] text-secondary">Drop tasks here</p>
                  </div>
                ) : col.map(task => {
                  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.stage !== 'Done';
                  const isSelected = selectedTaskId === task._id;
                  return (
                    <motion.div
                      key={task._id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      draggable
                      onDragStart={() => { setDraggedId(task._id); setDragFromStage(stage); }}
                      onDragEnd={() => { setDraggedId(null); setDragFromStage(null); }}
                      onClick={() => onSelectTask(task)}
                      className={`group relative bg-base border rounded-xl p-3.5 cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? 'border-accent/60 shadow-[0_0_0_2px_rgba(99,102,241,0.15)] ring-1 ring-accent/30'
                          : 'border-border/50 hover:border-accent/30 hover:shadow-md'
                      } ${draggedId === task._id ? 'opacity-40 scale-[0.97]' : ''}`}
                    >
                      {/* Top row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={11} className="text-border/40 group-hover:text-border transition-colors cursor-grab" />
                          <span className="font-mono text-[9px] font-bold text-secondary/60 uppercase">{task.code}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {priorityIcon(task.priority)}
                          <span className={`text-[9px] font-bold uppercase tracking-wide ${
                            task.priority === 'Critical' ? 'text-red-500'
                            : task.priority === 'High' ? 'text-amber-500'
                            : task.priority === 'Medium' ? 'text-indigo-400'
                            : 'text-zinc-400'
                          }`}>{task.priority}</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-semibold text-primary leading-snug mb-2.5 group-hover:text-accent transition-colors line-clamp-2">
                        {task.title}
                      </h4>

                      {/* Progress bar */}
                      {(task.progress ?? 0) > 0 && (
                        <div className="h-1 bg-border/30 rounded-full mb-2.5 overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${task.progress ?? 0}%` }}
                          />
                        </div>
                      )}

                      {/* Tags */}
                      {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          {task.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/8 text-accent/80 border border-accent/15">
                              {tag}
                            </span>
                          ))}
                          {task.tags.length > 2 && (
                            <span className="text-[9px] text-secondary font-semibold">+{task.tags.length - 2}</span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        <div className="flex items-center gap-1.5">
                          {task.assignee ? (
                            <OpsAvatar name={task.assignee} size="xs" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-border/40 flex items-center justify-center">
                              <User size={9} className="text-secondary" />
                            </div>
                          )}
                          {task.assignee && (
                            <span className="text-[9px] text-secondary font-medium truncate max-w-[80px]">
                              {task.assignee.split(' ')[0]}
                            </span>
                          )}
                        </div>
                        {task.dueDate && (
                          <div className={`flex items-center gap-1 text-[9px] font-semibold ${overdue ? 'text-red-500' : 'text-secondary'}`}>
                            <Clock size={9} />
                            {relativeDate(task.dueDate)}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  tasks, selectedIds, onToggle, onToggleAll,
  onSelectTask, onBulkMove, onBulkDelete, canDelete,
}: {
  tasks: Task[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSelectTask: (t: Task) => void;
  onBulkMove: (stage: string) => void;
  onBulkDelete: () => void;
  canDelete: boolean;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.ceil(tasks.length / pageSize);
  const paged = tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <OpsTable>
          <OpsTableHead>
            <tr>
              <th className="w-10 px-4 text-center">
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every(t => selectedIds.has(t._id))}
                  onChange={onToggleAll}
                  className="w-3.5 h-3.5 rounded border-border accent-accent"
                />
              </th>
              <OpsTableHeadCell className="w-[90px]">Code</OpsTableHeadCell>
              <OpsTableHeadCell>Title</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[110px]">Priority</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[110px]">Stage</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[130px]">Assignee</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[100px]">Due Date</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[80px] text-center">Progress</OpsTableHeadCell>
              <OpsTableHeadCell className="w-[100px]">Tags</OpsTableHeadCell>
            </tr>
          </OpsTableHead>
          <OpsTableBody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-16 text-secondary text-xs">
                  No tasks match your current filters.
                </td>
              </tr>
            )}
            {paged.map(task => {
              const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.stage !== 'Done';
              return (
                <OpsTableRow
                  key={task._id}
                  selected={selectedIds.has(task._id)}
                  onClick={() => onSelectTask(task)}
                  className="cursor-pointer"
                >
                  <OpsTableCell className="text-center" onClick={e => { e.stopPropagation(); onToggle(task._id); }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task._id)}
                      onChange={() => onToggle(task._id)}
                      className="w-3.5 h-3.5 rounded border-border accent-accent"
                    />
                  </OpsTableCell>
                  <OpsTableCell>
                    <span className="font-mono text-[10px] font-bold text-secondary">{task.code || '—'}</span>
                  </OpsTableCell>
                  <OpsTableCell>
                    <span className="font-semibold text-primary text-xs hover:text-accent transition-colors line-clamp-1">
                      {task.title}
                    </span>
                  </OpsTableCell>
                  <OpsTableCell>
                    <OpsBadge variant={priorityVariant(task.priority)}>{task.priority}</OpsBadge>
                  </OpsTableCell>
                  <OpsTableCell>
                    <OpsBadge variant={stageVariant(task.stage)} dot>{task.stage}</OpsBadge>
                  </OpsTableCell>
                  <OpsTableCell>
                    {task.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <OpsAvatar name={task.assignee} size="xs" />
                        <span className="text-xs text-primary truncate max-w-[90px]">{task.assignee}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-secondary italic">Unassigned</span>
                    )}
                  </OpsTableCell>
                  <OpsTableCell>
                    {task.dueDate ? (
                      <span className={`text-xs font-medium ${overdue ? 'text-red-500' : 'text-secondary'}`}>
                        {new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span className="text-xs text-secondary/40">—</span>
                    )}
                  </OpsTableCell>
                  <OpsTableCell className="text-center">
                    <span className="text-[10px] font-bold text-secondary">{task.progress ?? 0}%</span>
                  </OpsTableCell>
                  <OpsTableCell>
                    <div className="flex gap-1 flex-wrap">
                      {task.tags.slice(0, 1).map(tag => (
                        <OpsBadge key={tag} variant="default">{tag}</OpsBadge>
                      ))}
                      {task.tags.length > 1 && (
                        <span className="text-[9px] text-secondary">+{task.tags.length - 1}</span>
                      )}
                    </div>
                  </OpsTableCell>
                </OpsTableRow>
              );
            })}
          </OpsTableBody>
        </OpsTable>
      </div>

      {/* Pagination */}
      <div className="border-t border-border/60 px-5 py-3 flex items-center justify-between bg-base/20 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-secondary">Rows:</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="select-enterprise !w-auto !py-1 !px-2 !text-xs"
          >
            {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[11px] text-secondary tabular-nums">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, tasks.length)} of {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="p-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg transition-all"
          >
            <ChevronLeft size={13} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pg: number;
            if (totalPages <= 5) { pg = i + 1; }
            else if (currentPage <= 3) { pg = i + 1; }
            else if (currentPage >= totalPages - 2) { pg = totalPages - 4 + i; }
            else { pg = currentPage - 2 + i; }
            return (
              <button
                key={pg}
                onClick={() => setCurrentPage(pg)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  currentPage === pg
                    ? 'bg-accent text-white shadow'
                    : 'border border-border/60 bg-surface text-secondary hover:text-primary'
                }`}
              >{pg}</button>
            );
          })}
          <button
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage(p => p + 1)}
            className="p-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg transition-all"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 70, opacity: 0 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border/80 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-5 backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-accent/15 text-accent font-bold text-xs flex items-center justify-center">
                {selectedIds.size}
              </div>
              <span className="text-xs font-semibold text-primary">task{selectedIds.size !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="h-4 w-px bg-border/60" />
            <select
              onChange={e => { if (e.target.value) { onBulkMove(e.target.value); e.target.value = ''; } }}
              className="select-enterprise !w-auto !py-1.5 !text-xs"
              defaultValue=""
            >
              <option value="" disabled>Move to stage…</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {canDelete && (
              <OpsButton variant="danger" size="sm" onClick={onBulkDelete}>
                <Trash2 size={12} /> Delete
              </OpsButton>
            )}
            <button className="text-xs text-secondary hover:text-primary font-semibold transition-colors">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({ tasks }: { tasks: Task[] }) {
  const withDue = tasks.filter(t => t.dueDate).sort(
    (a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
  );

  if (withDue.length === 0) {
    return (
      <div className="p-8">
        <OpsEmptyState
          icon={<Calendar size={32} />}
          title="No scheduled tasks"
          description="Tasks with due dates will appear on the timeline."
        />
      </div>
    );
  }

  // Build month groups
  type Group = { month: string; tasks: Task[] };
  const groups: Group[] = [];
  for (const task of withDue) {
    const d = new Date(task.dueDate!);
    const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (!last || last.month !== label) groups.push({ month: label, tasks: [task] });
    else last.tasks.push(task);
  }

  const today = new Date();

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
          <Activity size={16} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary">Task Timeline</h2>
          <p className="text-xs text-secondary">{withDue.length} tasks with deadlines</p>
        </div>
      </div>

      {groups.map(group => (
        <div key={group.month}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-black text-secondary uppercase tracking-widest">{group.month}</span>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] text-secondary">{group.tasks.length} tasks</span>
          </div>
          <div className="space-y-2 pl-4 border-l-2 border-border/40">
            {group.tasks.map(task => {
              const d = new Date(task.dueDate!);
              const overdue = d < today && task.stage !== 'Done';
              const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
              return (
                <div key={task._id} className="relative flex items-start gap-4 pb-2">
                  {/* Timeline dot */}
                  <div className="absolute -left-[21px] top-3 w-3.5 h-3.5 rounded-full border-2 border-surface flex items-center justify-center" style={{
                    background: overdue ? '#ef4444' : task.stage === 'Done' ? '#10b981' : 'var(--accent-primary)'
                  }} />

                  {/* Date column */}
                  <div className="w-16 shrink-0 pt-2">
                    <div className={`text-[11px] font-bold ${overdue ? 'text-red-500' : 'text-secondary'}`}>{dayLabel}</div>
                  </div>

                  {/* Card */}
                  <div className={`flex-1 bg-surface border rounded-xl p-3.5 transition-all hover:shadow-md ${
                    overdue ? 'border-red-500/20 bg-red-500/[0.02]' : 'border-border/50'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[9px] font-bold text-secondary/60 uppercase">{task.code}</span>
                          <OpsBadge variant={stageVariant(task.stage)} dot>{task.stage}</OpsBadge>
                          {overdue && <OpsBadge variant="danger">Overdue</OpsBadge>}
                        </div>
                        <h4 className="text-xs font-semibold text-primary line-clamp-1">{task.title}</h4>
                        {task.description && (
                          <p className="text-[11px] text-secondary mt-0.5 line-clamp-1">{task.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <OpsBadge variant={priorityVariant(task.priority)}>{task.priority}</OpsBadge>
                        {task.assignee && <OpsAvatar name={task.assignee} size="xs" />}
                      </div>
                    </div>
                    {(task.progress ?? 0) > 0 && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-border/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${task.progress ?? 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-secondary tabular-nums">{task.progress ?? 0}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ tasks }: { tasks: Task[] }) {
  const tasksWithDue = tasks.filter(t => t.dueDate);
  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="w-full card-enterprise !p-5 space-y-3">
        <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Upcoming Deadlines</h3>
        {tasksWithDue.length === 0 ? (
          <OpsEmptyState
            icon={<Calendar size={28} />}
            title="No tasks with due dates"
            description="Assign due dates to tasks to see them here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {tasksWithDue
              .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
              .map(task => {
                const overdue = new Date(task.dueDate!) < new Date() && task.stage !== 'Done';
                return (
                  <div key={task._id} className="flex items-center gap-4 p-3 bg-base/50 border border-border/40 rounded-xl">
                    <div className={`w-10 text-center shrink-0 ${overdue ? 'text-red-500' : 'text-secondary'}`}>
                      <div className="text-[10px] font-bold uppercase">
                        {new Date(task.dueDate!).toLocaleDateString(undefined, { month: 'short' })}
                      </div>
                      <div className="text-lg font-black leading-none">{new Date(task.dueDate!).getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-primary truncate">{task.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <OpsBadge variant={stageVariant(task.stage)} dot>{task.stage}</OpsBadge>
                        {overdue && <OpsBadge variant="danger">Overdue</OpsBadge>}
                      </div>
                    </div>
                    {task.assignee && <OpsAvatar name={task.assignee} size="xs" />}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workload View ────────────────────────────────────────────────────────────

function WorkloadView({ tasks, teamMembers }: { tasks: Task[]; teamMembers: TeamMember[] }) {
  const members = teamMembers.length > 0
    ? teamMembers
    : [{ _id: 'unassigned', name: 'Unassigned', email: '', role: '' }];

  const membersWithLoad = members.map(member => {
    const assigned = tasks.filter(t =>
      t.assignee && (
        t.assignee.toLowerCase() === member.name.toLowerCase() ||
        t.assignee.toLowerCase() === member.email.toLowerCase()
      )
    );
    const done = assigned.filter(t => t.stage === 'Done').length;
    const inProgress = assigned.filter(t => t.stage === 'In Progress').length;
    const overdue = assigned.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.stage !== 'Done').length;
    const completion = assigned.length > 0 ? Math.round((done / assigned.length) * 100) : 0;
    return { member, assigned, done, inProgress, overdue, completion };
  }).filter(m => m.assigned.length > 0);

  if (membersWithLoad.length === 0) {
    return (
      <div className="p-8">
        <OpsEmptyState
          icon={<Users size={32} />}
          title="No workload data"
          description="Assign tasks to team members to see their workload here."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {membersWithLoad.map(({ member, assigned, done, inProgress, overdue, completion }) => (
          <div key={member._id} className="card-enterprise !p-4 flex items-center gap-5">
            <OpsAvatar name={member.name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-primary truncate">{member.name}</span>
                <span className="text-xs text-secondary font-medium">{assigned.length} tasks</span>
              </div>
              <div className="h-1.5 bg-border/30 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-[10px] font-semibold">
                <span className="text-emerald-500">{done} done</span>
                <span className="text-indigo-400">{inProgress} in progress</span>
                {overdue > 0 && <span className="text-red-500">{overdue} overdue</span>}
                <span className="text-secondary ml-auto">{completion}% complete</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports View ─────────────────────────────────────────────────────────────

function ReportsView({ tasks }: { tasks: Task[] }) {
  const byStage = STAGES.map(s => ({ label: s, count: tasks.filter(t => t.stage === s).length }));
  const byPriority = PRIORITIES.map(p => ({ label: p, count: tasks.filter(t => t.priority === p).length }));
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.stage !== 'Done').length;
  const completion = tasks.length > 0
    ? Math.round((tasks.filter(t => t.stage === 'Done').length / tasks.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: tasks.length, icon: <ClipboardList size={16} />, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
          { label: 'Completed', value: tasks.filter(t => t.stage === 'Done').length, icon: <CheckCircle2 size={16} />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Overdue', value: overdue, icon: <AlertCircle size={16} />, color: 'text-red-500', bg: 'bg-red-500/10' },
          { label: 'Completion Rate', value: `${completion}%`, icon: <TrendingUp size={16} />, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        ].map(kpi => (
          <div key={kpi.label} className="card-enterprise !p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${kpi.bg} ${kpi.color} flex items-center justify-center shrink-0`}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">{kpi.label}</p>
              <p className="text-xl font-bold text-primary">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Stage */}
        <div className="card-enterprise !p-5 space-y-4">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Tasks by Stage</h3>
          <div className="space-y-2.5">
            {byStage.map(({ label, count }) => {
              const pct = tasks.length > 0 ? Math.round((count / tasks.length) * 100) : 0;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-primary">{label}</span>
                    <span className="text-secondary font-bold tabular-nums">
                      {count} <span className="font-normal text-secondary/60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        label === 'Done' ? 'bg-emerald-500'
                        : label === 'In Progress' ? 'bg-indigo-500'
                        : label === 'Review' ? 'bg-amber-400'
                        : 'bg-zinc-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Priority */}
        <div className="card-enterprise !p-5 space-y-4">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Tasks by Priority</h3>
          <div className="space-y-2.5">
            {byPriority.map(({ label, count }) => {
              const pct = tasks.length > 0 ? Math.round((count / tasks.length) * 100) : 0;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      {priorityIcon(label)}
                      <span className="font-semibold text-primary">{label}</span>
                    </div>
                    <span className="text-secondary font-bold tabular-nums">
                      {count} <span className="font-normal text-secondary/60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        label === 'Critical' ? 'bg-red-500'
                        : label === 'High' ? 'bg-amber-500'
                        : label === 'Medium' ? 'bg-indigo-400'
                        : 'bg-zinc-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex gap-4 h-full min-w-max p-6">
      {STAGES.map(s => (
        <div key={s} className="w-[280px] flex flex-col gap-3">
          <div className="skeleton-enterprise h-5 w-32 rounded mb-1" />
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-surface border border-border/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <div className="skeleton-enterprise h-2.5 w-14 rounded" />
                <div className="skeleton-enterprise h-2.5 w-12 rounded" />
              </div>
              <div className="skeleton-enterprise h-3.5 w-full rounded" />
              <div className="skeleton-enterprise h-3 w-2/3 rounded" />
              <div className="flex gap-1.5 pt-1">
                <div className="skeleton-enterprise h-4 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main Console ─────────────────────────────────────────────────────────────

function OperationsConsole() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  // View state
  const [view, setView] = useState<ViewType>('board');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorTaskId, setInspectorTaskId] = useState<string | null>(null);

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [filterOpen, setFilterOpen] = useState(false);

  // Drag state (board)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragFromStage, setDragFromStage] = useState<string | null>(null);

  // Selection (list)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // New task form
  const [ntTitle, setNtTitle] = useState('');
  const [ntPriority, setNtPriority] = useState('Medium');
  const [ntStage, setNtStage] = useState('Backlog');
  const [ntAssignee, setNtAssignee] = useState('');
  const [ntDueDate, setNtDueDate] = useState('');
  const [ntDescription, setNtDescription] = useState('');
  const [ntProjectId, setNtProjectId] = useState('');
  const [ntTags, setNtTags] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // New project form
  const [npName, setNpName] = useState('');
  const [npDeadline, setNpDeadline] = useState('');
  const [npOwner, setNpOwner] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Deep-link support
  useEffect(() => {
    if (searchParams?.get('openModal') === 'true') setNewTaskOpen(true);
    if (searchParams?.get('openProjectModal') === 'true') setNewProjectOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (newProjectOpen && user?.name) setNpOwner(prev => prev || user.name);
  }, [newProjectOpen, user?.name]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch {
      setError('Failed to load workspace data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);


  // ── Computed filtered list ──────────────────────────────────────────────────
  const filtered = tasks
    .filter(t => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !t.code?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterStage && t.stage !== filterStage) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterAssignee) {
        const q = filterAssignee.toLowerCase();
        if (!t.assignee || !t.assignee.toLowerCase().includes(q)) return false;
      }
      if (filterProject && t.projectId !== filterProject) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const hasActiveFilters = !!(filterStage || filterPriority || filterAssignee || filterProject || searchQuery);
  const activeFilterCount = [filterStage, filterPriority, filterAssignee, filterProject].filter(Boolean).length;

  // ── Actions ─────────────────────────────────────────────────────────────────
  const updateTask = useCallback(async (id: string, fields: Partial<Task>) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.success) {
        setTasks(prev => prev.map(t => t._id === id ? { ...t, ...data.task } : t));
        triggerActivityLog('task_update', `Updated task`);
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  }, [showToast]);

  const handleDrop = useCallback(async (id: string, fromStage: string, toStage: string) => {
    setTasks(prev => prev.map(t => t._id === id ? { ...t, stage: toStage } : t));
    await updateTask(id, { stage: toStage });
  }, [updateTask]);

  const handleCreateTask = async () => {
    if (!ntTitle.trim()) { showToast('Title is required', 'warning'); return; }
    setCreatingTask(true);
    try {
      const payload: Record<string, unknown> = {
        title: ntTitle.trim(), stage: ntStage, priority: ntPriority,
        tags: ntTags ? ntTags.split(',').map(s => s.trim()).filter(Boolean) : ['New'],
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
        setTasks(prev => [data.task, ...prev]);
        setNewTaskOpen(false);
        setNtTitle(''); setNtPriority('Medium'); setNtStage('Backlog');
        setNtAssignee(''); setNtDueDate(''); setNtDescription(''); setNtProjectId(''); setNtTags('');
        showToast('Task created!', 'success');
        triggerActivityLog('task_creation', `Created task: ${data.task.title}`);
      } else {
        showToast(data.error || 'Failed to create task', 'error');
      }
    } catch { showToast('Network error', 'error'); }
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
        setProjects(prev => [data.project, ...prev]);
        setNewProjectOpen(false);
        setNpName(''); setNpDeadline(''); setNpOwner('');
        showToast('Project created!', 'success');
      } else {
        showToast(data.error || 'Failed to create project', 'error');
      }
    } catch { showToast('Network error', 'error'); }
    finally { setCreatingProject(false); }
  };

  const handleBulkMove = async (stage: string) => {
    const ids = Array.from(selectedIds);
    let ok = 0;
    setTasks(prev => prev.map(t => ids.includes(t._id) ? { ...t, stage } : t));
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        });
        if ((await res.json()).success) ok++;
      } catch { /* continue */ }
    }
    showToast(`Moved ${ok}/${ids.length} tasks to ${stage}`, 'success');
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected task(s) permanently?`)) return;
    const ids = Array.from(selectedIds);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
        if ((await res.json()).success) ok++;
      } catch { /* continue */ }
    }
    setTasks(prev => prev.filter(t => !ids.includes(t._id)));
    showToast(`Deleted ${ok}/${ids.length} tasks`, ok === ids.length ? 'success' : 'warning');
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setFilterStage(''); setFilterPriority('');
    setFilterAssignee(''); setFilterProject(''); setSearchQuery('');
  };

  const canDelete = user?.role === 'Admin' || user?.role === 'Manager';

  const NAV_VIEWS = [
    { id: 'board' as ViewType, label: 'Board', icon: <LayoutDashboard size={14} /> },
    { id: 'list' as ViewType, label: 'List', icon: <LayoutList size={14} /> },
    { id: 'timeline' as ViewType, label: 'Timeline', icon: <Activity size={14} /> },
    { id: 'calendar' as ViewType, label: 'Calendar', icon: <Calendar size={14} /> },
    { id: 'workload' as ViewType, label: 'Workload', icon: <Users size={14} /> },
    { id: 'reports' as ViewType, label: 'Reports', icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-base text-primary overflow-hidden">

      {/* ── Enterprise Header ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/60 bg-surface/60 backdrop-blur-sm z-20">

        {/* Breadcrumb + title + actions */}
        <div className="px-6 pt-5 pb-0 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-secondary mb-2">
              <span>Workspace</span>
              <ChevronRight size={10} />
              <span className="text-primary font-bold">Operations Console</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                <Layers size={16} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-primary leading-tight">Operations Console</h1>
                <p className="text-[11px] text-secondary font-medium">
                  {loading
                    ? 'Loading…'
                    : `${filtered.length} task${filtered.length !== 1 ? 's' : ''} · ${projects.length} project${projects.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <OpsButton
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </OpsButton>
            <OpsButton
              variant="secondary"
              size="sm"
              onClick={() => downloadCSV(tasks, 'OPS_Tasks_Export')}
            >
              <Download size={13} /> Export
            </OpsButton>
            <OpsButton
              variant="secondary"
              size="sm"
              onClick={() => setNewProjectOpen(true)}
            >
              <FolderOpen size={13} /> New Project
            </OpsButton>
            <OpsButton
              variant="primary"
              size="sm"
              onClick={() => setNewTaskOpen(true)}
            >
              <Plus size={14} /> New Task
            </OpsButton>
          </div>
        </div>

        {/* View tabs + search/filter toolbar */}
        <div className="flex items-center gap-0 px-6 pt-3 pb-0">
          <div className="flex items-center gap-0 flex-1">
            {NAV_VIEWS.map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                  view === v.id
                    ? 'text-accent border-accent'
                    : 'text-secondary hover:text-primary border-transparent hover:border-border/40'
                }`}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          {/* Toolbar right */}
          <div className="flex items-center gap-2 pb-2">
            <OpsSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tasks…"
              className="w-48"
            />

            <button
              onClick={() => setFilterOpen(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                hasActiveFilters
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/60 bg-base text-secondary hover:text-primary'
              }`}
            >
              <Zap size={12} />
              Filter
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="select-enterprise !w-auto !py-1.5 !text-xs"
            >
              <option value="createdAt">Newest first</option>
              <option value="dueDate">Due date</option>
              <option value="priority">Priority</option>
              <option value="title">A → Z</option>
            </select>

            <button
              onClick={() => inspectorTaskId ? setInspectorTaskId(null) : undefined}
              className={`p-1.5 border rounded-lg text-xs transition-all ${
                inspectorTaskId
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/60 bg-base text-secondary hover:text-primary'
              }`}
              title={inspectorTaskId ? 'Close inspector' : 'Click a task to open inspector'}
            >
              {inspectorTaskId ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <AnimatePresence>
          {filterOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-border/40"
            >
              <div className="flex items-center gap-2 px-6 py-3 bg-base/40 flex-wrap">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-widest shrink-0">Filters:</span>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Stage filter */}
                  <div className="flex items-center gap-1">
                    <OpsFilterChip
                      label="Stage"
                      value={filterStage || undefined}
                      active={!!filterStage}
                      onClear={() => setFilterStage('')}
                    />
                    {!filterStage && (
                      <select
                        value={filterStage}
                        onChange={e => setFilterStage(e.target.value)}
                        className="select-enterprise !w-auto !py-1 !text-xs"
                      >
                        <option value="">All stages</option>
                        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Priority filter */}
                  <div className="flex items-center gap-1">
                    <OpsFilterChip
                      label="Priority"
                      value={filterPriority || undefined}
                      active={!!filterPriority}
                      onClear={() => setFilterPriority('')}
                    />
                    {!filterPriority && (
                      <select
                        value={filterPriority}
                        onChange={e => setFilterPriority(e.target.value)}
                        className="select-enterprise !w-auto !py-1 !text-xs"
                      >
                        <option value="">All priorities</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Project filter */}
                  <div className="flex items-center gap-1">
                    <OpsFilterChip
                      label="Project"
                      value={projects.find(p => p._id === filterProject)?.name}
                      active={!!filterProject}
                      onClear={() => setFilterProject('')}
                    />
                    {!filterProject && (
                      <select
                        value={filterProject}
                        onChange={e => setFilterProject(e.target.value)}
                        className="select-enterprise !w-auto !py-1 !text-xs"
                      >
                        <option value="">All projects</option>
                        {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Assignee filter */}
                  <input
                    type="text"
                    value={filterAssignee}
                    onChange={e => setFilterAssignee(e.target.value)}
                    placeholder="Assignee name…"
                    className="input-enterprise !py-1 !text-xs w-36"
                  />
                  {filterAssignee && (
                    <OpsFilterChip
                      label="Assignee"
                      value={filterAssignee}
                      active
                      onClear={() => setFilterAssignee('')}
                    />
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-accent hover:text-accent/80 font-semibold transition-colors flex items-center gap-1 ml-1"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="shrink-0 border-r border-border/60 bg-surface/50 overflow-hidden"
            >
              <div className="w-[220px] h-full overflow-y-auto custom-scrollbar p-4 space-y-6">

                {/* Projects */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black text-secondary uppercase tracking-widest">Projects</span>
                    <button onClick={() => setNewProjectOpen(true)} className="text-secondary hover:text-accent transition-colors">
                      <Plus size={11} />
                    </button>
                  </div>
                  {projects.length === 0 ? (
                    <p className="text-[10px] text-secondary italic px-1">No projects yet</p>
                  ) : projects.map(p => (
                    <button
                      key={p._id}
                      onClick={() => setFilterProject(filterProject === p._id ? '' : p._id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-left group ${
                        filterProject === p._id
                          ? 'bg-accent/10 text-accent'
                          : 'hover:bg-base/70 text-secondary hover:text-primary'
                      }`}
                    >
                      <Folder size={12} className={filterProject === p._id ? 'text-accent' : 'text-accent/60'} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{p.name}</div>
                        {p.deadline && <div className="text-[9px] text-secondary/60">{p.deadline}</div>}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Quick Filters */}
                <div>
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">Quick Filters</span>
                  {[
                    { label: 'All Tasks', fn: clearFilters },
                    { label: 'My Tasks', fn: () => { if (user?.name) setFilterAssignee(user.name); } },
                    { label: 'High Priority', fn: () => setFilterPriority('High') },
                    { label: 'Critical', fn: () => setFilterPriority('Critical') },
                    { label: 'In Review', fn: () => setFilterStage('Review') },
                    { label: 'In Progress', fn: () => setFilterStage('In Progress') },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.fn}
                      className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-secondary hover:text-primary hover:bg-base/70 transition-all font-medium"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Labels */}
                <div>
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">Labels</span>
                  {['Frontend', 'Backend', 'Database', 'UI/UX', 'DevOps', 'New'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSearchQuery(searchQuery === tag ? '' : tag)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-all font-medium flex items-center gap-2 ${
                        searchQuery === tag ? 'text-accent bg-accent/10' : 'text-secondary hover:text-primary hover:bg-base/70'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-accent/40 shrink-0" />
                      {tag}
                    </button>
                  ))}
                </div>

                {/* By Priority */}
                <div>
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">By Priority</span>
                  {PRIORITIES.map(p => (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(filterPriority === p ? '' : p)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-all font-medium flex items-center gap-2 ${
                        filterPriority === p ? 'text-accent bg-accent/10' : 'text-secondary hover:text-primary hover:bg-base/70'
                      }`}
                    >
                      {priorityIcon(p)} {p}
                    </button>
                  ))}
                </div>

                {/* Teams — future-ready */}
                <div>
                  <span className="text-[9px] font-black text-secondary uppercase tracking-widest block mb-2">
                    Teams <span className="normal-case font-normal text-secondary/50">(coming soon)</span>
                  </span>
                  <p className="text-[10px] text-secondary italic px-1">Team grouping will be available in v2</p>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(s => !s)}
          className="absolute bottom-8 z-30 w-5 h-10 flex items-center justify-center bg-surface border border-border/60 border-l-0 rounded-r-lg text-secondary hover:text-primary transition-colors"
          style={{ left: sidebarOpen ? 220 : 0 }}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
        </button>

        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {error ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <OpsErrorState
                kind="network"
                title="Failed to load data"
                description={error}
                onRetry={fetchData}
              />
            </div>
          ) : loading ? (
            <LoadingSkeleton />
          ) : (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <div className={`flex-1 overflow-auto ${view === 'board' ? 'overflow-x-auto' : ''}`}>
                {view === 'board' && (
                  filtered.length === 0 && !hasActiveFilters ? (
                    <div className="p-8">
                      <OpsEmptyState
                        icon={<ClipboardList size={32} />}
                        title="No tasks yet"
                        description="Create your first task to start tracking work across your team."
                        action={
                          <OpsButton variant="primary" onClick={() => setNewTaskOpen(true)}>
                            <Plus size={14} /> New Task
                          </OpsButton>
                        }
                      />
                    </div>
                  ) : (
                    <div className="p-5">
                      <KanbanBoard
                        tasks={filtered}
                        onDrop={handleDrop}
                        onSelectTask={t => setInspectorTaskId(t._id)}
                        selectedTaskId={inspectorTaskId ?? undefined}
                        draggedId={draggedId}
                        setDraggedId={setDraggedId}
                        dragFromStage={dragFromStage}
                        setDragFromStage={setDragFromStage}
                      />
                    </div>
                  )
                )}
                {view === 'list' && (
                  <ListView
                    tasks={filtered}
                    selectedIds={selectedIds}
                    onToggle={id => setSelectedIds(prev => {
                      const n = new Set(prev);
                      n.has(id) ? n.delete(id) : n.add(id);
                      return n;
                    })}
                    onToggleAll={() => {
                      const allIds = filtered.map(t => t._id);
                      const allSelected = allIds.every(id => selectedIds.has(id));
                      setSelectedIds(allSelected ? new Set() : new Set(allIds));
                    }}
                    onSelectTask={t => setInspectorTaskId(t._id)}
                    onBulkMove={handleBulkMove}
                    onBulkDelete={handleBulkDelete}
                    canDelete={canDelete}
                  />
                )}
                {view === 'timeline' && <TimelineView tasks={filtered} />}
                {view === 'calendar' && <CalendarView tasks={filtered} />}
                {view === 'workload' && <WorkloadView tasks={filtered} teamMembers={teamMembers} />}
                {view === 'reports' && <ReportsView tasks={filtered} />}
              </div>

              {/* Right Inspector */}
              <TaskDrawer
                open={!!inspectorTaskId}
                onClose={() => setInspectorTaskId(null)}
                taskId={inspectorTaskId}
                onUpdateSuccess={fetchData}
                projects={projects}
                teamMembers={teamMembers}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Create Task Modal ─────────────────────────────────────────────── */}
      <OpsModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        title="Create Task"
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
              {creatingTask ? 'Creating…' : 'Create Task'}
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
              onKeyDown={e => e.key === 'Enter' && handleCreateTask()}
              placeholder="e.g. Implement user authentication flow"
              autoFocus
            />
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              value={ntDescription}
              onChange={e => setNtDescription(e.target.value)}
              placeholder="What needs to be done? (optional)"
              rows={2}
              className="input-enterprise !py-2.5 resize-none"
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
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Assign to</label>
            <OpsSelect
              value={ntAssignee}
              onChange={e => setNtAssignee(e.target.value)}
              options={[
                { value: '', label: 'Unassigned' },
                ...teamMembers.map(m => ({ value: m.name, label: `${m.name} (${m.role})` })),
              ]}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Project</label>
            <OpsSelect
              value={ntProjectId}
              onChange={e => setNtProjectId(e.target.value)}
              options={[
                { value: '', label: 'No project' },
                ...projects.map(p => ({ value: p._id, label: p.name })),
              ]}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Due Date</label>
            <OpsInput type="date" value={ntDueDate} onChange={e => setNtDueDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">
              Labels <span className="normal-case font-normal text-secondary/50">(comma-separated)</span>
            </label>
            <OpsInput
              value={ntTags}
              onChange={e => setNtTags(e.target.value)}
              placeholder="Frontend, Backend, UI/UX"
            />
          </div>
        </div>
      </OpsModal>

      {/* ── Create Project Modal ──────────────────────────────────────────── */}
      <OpsModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        title="Create Project"
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
              {creatingProject ? 'Creating…' : 'Create Project'}
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
              placeholder="e.g. Q3 Sales Campaign"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Deadline</label>
              <OpsInput type="date" value={npDeadline} onChange={e => setNpDeadline(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Owner</label>
              <OpsSelect
                value={npOwner}
                onChange={e => setNpOwner(e.target.value)}
                options={[
                  ...(user?.name ? [{ value: user.name, label: `${user.name} (You)` }] : []),
                  ...teamMembers.filter(m => m.name !== user?.name).map(m => ({ value: m.name, label: m.name })),
                ]}
              />
            </div>
          </div>
        </div>
      </OpsModal>
    </div>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function Tasks() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-base">
        <div className="flex items-center gap-3 text-secondary">
          <Loader2 size={20} className="animate-spin text-accent" />
          <span className="text-sm font-medium">Loading Operations Console…</span>
        </div>
      </div>
    }>
      <OperationsConsole />
    </Suspense>
  );
}
