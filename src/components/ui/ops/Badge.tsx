'use client';
import React from 'react';

export type OpsBadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'stage-backlog'
  | 'stage-todo'
  | 'stage-inprogress'
  | 'stage-review'
  | 'stage-done'
  | 'stage-blocked'
  | 'priority-low'
  | 'priority-medium'
  | 'priority-high'
  | 'priority-critical';

export interface OpsBadgeProps {
  variant?: OpsBadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<OpsBadgeVariant, string> = {
  default:            'bg-zinc-500/8  text-zinc-500  border-zinc-500/15',
  success:            'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  warning:            'bg-amber-500/8  text-amber-600  dark:text-amber-400  border-amber-500/20',
  danger:             'bg-red-500/8    text-red-500    border-red-500/20',
  info:               'bg-indigo-500/8 text-indigo-500 border-indigo-500/20',
  // Stage-specific
  'stage-backlog':    'bg-zinc-500/8   text-zinc-500   border-zinc-500/15',
  'stage-todo':       'bg-sky-500/8    text-sky-500    border-sky-500/15',
  'stage-inprogress': 'bg-indigo-500/8 text-indigo-500 border-indigo-500/20',
  'stage-review':     'bg-amber-500/8  text-amber-600  border-amber-500/20',
  'stage-done':       'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'stage-blocked':    'bg-red-500/8    text-red-500    border-red-500/20',
  // Priority-specific
  'priority-low':     'bg-zinc-500/8   text-zinc-400   border-zinc-500/15',
  'priority-medium':  'bg-indigo-500/8 text-indigo-400 border-indigo-500/15',
  'priority-high':    'bg-amber-500/8  text-amber-500  border-amber-500/20',
  'priority-critical':'bg-red-500/8    text-red-500    border-red-500/20',
};

const DOT_CLASSES: Partial<Record<OpsBadgeVariant, string>> = {
  success:            'bg-emerald-500',
  warning:            'bg-amber-400',
  danger:             'bg-red-500',
  info:               'bg-indigo-500',
  'stage-backlog':    'bg-zinc-400',
  'stage-todo':       'bg-sky-500',
  'stage-inprogress': 'bg-indigo-500',
  'stage-review':     'bg-amber-400',
  'stage-done':       'bg-emerald-500',
  'stage-blocked':    'bg-red-500',
  'priority-low':     'bg-zinc-400',
  'priority-medium':  'bg-indigo-400',
  'priority-high':    'bg-amber-500',
  'priority-critical':'bg-red-500',
};

/** Maps a raw stage string to a badge variant */
export function stageToBadgeVariant(stage: string): OpsBadgeVariant {
  const map: Record<string, OpsBadgeVariant> = {
    Backlog:      'stage-backlog',
    'To Do':      'stage-todo',
    'In Progress':'stage-inprogress',
    Review:       'stage-review',
    'Under Review':'stage-review',
    Done:         'stage-done',
    Blocked:      'stage-blocked',
  };
  return map[stage] ?? 'default';
}

/** Maps a raw priority string to a badge variant */
export function priorityToBadgeVariant(priority: string): OpsBadgeVariant {
  const map: Record<string, OpsBadgeVariant> = {
    Low:      'priority-low',
    Medium:   'priority-medium',
    High:     'priority-high',
    Critical: 'priority-critical',
  };
  return map[priority] ?? 'default';
}

export function OpsBadge({
  variant = 'default',
  dot = false,
  children,
  className = '',
}: OpsBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASSES[variant] ?? 'bg-zinc-400'}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
