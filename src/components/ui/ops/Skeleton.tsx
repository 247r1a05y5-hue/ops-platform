'use client';
import React from 'react';

// ─── Base Skeleton ────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function OpsSkeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading..."
      aria-busy="true"
      className={`skeleton-enterprise rounded ${className}`}
      style={style}
    />
  );
}

// ─── Card Skeleton ────────────────────────────────────────────────────────────

export function OpsSkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-surface border border-border/50 rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex justify-between items-center">
        <OpsSkeleton className="h-2.5 w-16" />
        <OpsSkeleton className="h-2.5 w-12" />
      </div>
      <OpsSkeleton className="h-3.5 w-full" />
      <OpsSkeleton className="h-3 w-3/4" />
      <div className="flex gap-1.5 pt-1">
        <OpsSkeleton className="h-4 w-14 rounded-full" />
        <OpsSkeleton className="h-4 w-14 rounded-full" />
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-border/30">
        <OpsSkeleton className="w-5 h-5 rounded-full" />
        <OpsSkeleton className="h-2 w-12" />
      </div>
    </div>
  );
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────

export function OpsSkeletonTable({
  rows = 5,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div role="status" aria-label="Loading table..." aria-busy="true">
      {/* Header row */}
      <div className="flex gap-4 px-3 py-2.5 border-b border-border/60">
        {Array.from({ length: cols }).map((_, i) => (
          <OpsSkeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 px-3 py-3 border-b border-border/40"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <OpsSkeleton
              key={c}
              className="h-3 flex-1"
              style={{ opacity: 1 - r * 0.08 - c * 0.03 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Kanban Board Skeleton ────────────────────────────────────────────────────

const BOARD_STAGES = ['Backlog', 'In Progress', 'Review', 'Done'];

export function OpsSkeletonBoard() {
  return (
    <div
      role="status"
      aria-label="Loading board..."
      aria-busy="true"
      className="flex gap-4 h-full min-w-max p-5"
    >
      {BOARD_STAGES.map((stage) => (
        <div
          key={stage}
          className="w-[272px] flex flex-col gap-2.5"
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-1 mb-1">
            <OpsSkeleton className="h-3.5 w-24" />
            <OpsSkeleton className="h-4 w-6 rounded-full" />
          </div>
          {/* Cards */}
          {[0, 1, 2].map((i) => (
            <OpsSkeletonCard key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
