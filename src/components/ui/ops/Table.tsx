'use client';
import React from 'react';

// ─── Table wrapper ────────────────────────────────────────────────────────────
interface OpsTableProps {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function OpsTable({ children, className = '', 'aria-label': ariaLabel }: OpsTableProps) {
  return (
    <table
      className={`w-full border-collapse text-left text-[13px] ${className}`}
      aria-label={ariaLabel}
    >
      {children}
    </table>
  );
}

// ─── Head ─────────────────────────────────────────────────────────────────────
export function OpsTableHead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-base">{children}</thead>;
}

// ─── Body ─────────────────────────────────────────────────────────────────────
export function OpsTableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

// ─── Head Cell ───────────────────────────────────────────────────────────────
interface OpsTableHeadCellProps {
  children?: React.ReactNode;
  className?: string;
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | false;
  onSort?: () => void;
  width?: string;
  align?: 'left' | 'center' | 'right';
  'aria-sort'?: React.AriaAttributes['aria-sort'];
}

export function OpsTableHeadCell({
  children,
  className = '',
  sortable = false,
  sorted = false,
  onSort,
  width,
  align = 'left',
}: OpsTableHeadCellProps) {
  const Tag = sortable ? 'button' : 'span';

  return (
    <th
      scope="col"
      className={`px-3 py-2.5 border-b border-border/60 text-[10px] font-bold text-secondary uppercase tracking-widest whitespace-nowrap align-middle text-${align} ${className}`}
      style={width ? { width } : undefined}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer focus-visible:outline-none"
        >
          {children}
          <span className="text-[9px]" aria-hidden="true">
            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
interface OpsTableRowProps {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function OpsTableRow({
  children,
  onClick,
  selected = false,
  className = '',
  'aria-label': ariaLabel,
}: OpsTableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border/40 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${selected ? 'bg-accent/5' : onClick ? 'hover:bg-accent/[0.025]' : ''} ${className}`}
      aria-selected={selected || undefined}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {children}
    </tr>
  );
}

// ─── Data Cell ────────────────────────────────────────────────────────────────
interface OpsTableCellProps {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}

export function OpsTableCell({
  children,
  className = '',
  align = 'left',
  onClick,
}: OpsTableCellProps) {
  return (
    <td
      className={`px-3 py-2.5 text-primary text-[13px] align-middle text-${align} ${className}`}
      onClick={onClick}
    >
      {children}
    </td>
  );
}
