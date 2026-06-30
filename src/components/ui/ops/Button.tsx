'use client';
import React from 'react';
import { Loader2 } from 'lucide-react';

export interface OpsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const VARIANT_CLASSES: Record<NonNullable<OpsButtonProps['variant']>, string> = {
  primary:
    'bg-accent text-white border border-transparent hover:opacity-90 active:scale-[0.975] shadow-sm hover:shadow-[0_4px_12px_rgba(99,102,241,0.2)]',
  secondary:
    'bg-surface text-secondary border border-border/70 hover:text-primary hover:border-accent/30 hover:bg-base active:scale-[0.975]',
  danger:
    'bg-red-500/8 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white hover:border-transparent active:scale-[0.975]',
  warning:
    'bg-amber-500/8 text-amber-600 border border-amber-500/20 hover:bg-amber-500 hover:text-white hover:border-transparent active:scale-[0.975]',
  ghost:
    'bg-transparent text-secondary border border-transparent hover:bg-base hover:text-primary active:scale-[0.975]',
};

const SIZE_CLASSES: Record<NonNullable<OpsButtonProps['size']>, string> = {
  xs: 'h-7 px-3 text-[11px] gap-1.5 rounded-lg',
  sm: 'h-8 px-3.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-lg',
};

export function OpsButton({
  variant = 'secondary',
  size = 'sm',
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  disabled,
  className = '',
  ...props
}: OpsButtonProps) {
  const base =
    'inline-flex items-center justify-center font-semibold transition-all duration-150 select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={12} className="animate-spin shrink-0" />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="shrink-0 flex items-center">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0 flex items-center">{icon}</span>
      )}
    </button>
  );
}
