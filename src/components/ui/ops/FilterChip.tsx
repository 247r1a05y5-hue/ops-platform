'use client';
import React from 'react';
import { X, ChevronDown } from 'lucide-react';

export interface OpsFilterChipProps {
  label: string;
  value?: string;
  active?: boolean;
  onClear?: () => void;
  onClick?: () => void;
  dropdown?: boolean;
  disabled?: boolean;
  className?: string;
}

export function OpsFilterChip({
  label,
  value,
  active = false,
  onClear,
  onClick,
  dropdown = false,
  disabled = false,
  className = '',
}: OpsFilterChipProps) {
  const isActive = active || !!value;

  return (
    <div
      className={`inline-flex items-center rounded-lg border transition-all duration-150 text-[11px] font-semibold overflow-hidden shrink-0 ${
        isActive
          ? 'bg-accent/8 border-accent/25 text-accent'
          : 'bg-base border-border/60 text-secondary hover:border-accent/20 hover:text-primary'
      } ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${className}`}
    >
      {/* Main clickable area */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isActive}
        aria-label={value ? `${label}: ${value}` : `Filter by ${label}`}
        className="flex items-center gap-1.5 px-2.5 h-7 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-secondary">
          {label}
        </span>
        {value && (
          <>
            <span className="text-border/60" aria-hidden="true">·</span>
            <span className={`font-semibold text-[11px] ${isActive ? 'text-accent' : 'text-primary'}`}>
              {value}
            </span>
          </>
        )}
        {dropdown && !value && (
          <ChevronDown size={10} aria-hidden="true" className="text-secondary" />
        )}
      </button>

      {/* Clear button — only when a value is active */}
      {value && onClear && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={`Clear ${label} filter`}
          className="flex items-center justify-center w-5 h-7 border-l border-accent/15 text-accent hover:text-red-500 hover:bg-red-500/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
        >
          <X size={9} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ─── Filter chip bar — the whole active filter row ────────────────────────────

export interface OpsFilterChipBarProps {
  children: React.ReactNode;
  activeCount?: number;
  onClearAll?: () => void;
  className?: string;
}

export function OpsFilterChipBar({
  children,
  activeCount = 0,
  onClearAll,
  className = '',
}: OpsFilterChipBarProps) {
  return (
    <div
      role="group"
      aria-label="Active filters"
      className={`flex items-center gap-2 flex-wrap ${className}`}
    >
      {children}

      {activeCount > 0 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          aria-label={`Clear all ${activeCount} active filters`}
          className="text-[10px] font-bold text-secondary uppercase tracking-wide hover:text-red-500 transition-colors px-1 ml-1 focus-visible:outline-none focus-visible:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
