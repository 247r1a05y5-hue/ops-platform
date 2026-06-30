'use client';
import React from 'react';

export interface OpsCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  role?: string;
  'aria-label'?: string;
  style?: React.CSSProperties;
}

const PADDING_CLASSES: Record<NonNullable<OpsCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function OpsCard({
  children,
  className = '',
  padding = 'md',
  interactive = false,
  selected = false,
  onClick,
  role,
  'aria-label': ariaLabel,
  style,
}: OpsCardProps) {
  const base = 'bg-surface rounded-xl border transition-all duration-150';
  const interactiveCls = interactive
    ? 'cursor-pointer hover:border-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
    : '';
  const selectedCls = selected
    ? 'border-accent/50 shadow-[0_0_0_2px_rgba(99,102,241,0.12)] ring-1 ring-accent/25'
    : 'border-border/60';

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      className={`${base} ${PADDING_CLASSES[padding]} ${interactiveCls} ${selectedCls} ${className}`}
      onClick={onClick}
      role={role}
      aria-label={ariaLabel}
      aria-selected={selected || undefined}
      style={style}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Tag>
  );
}
