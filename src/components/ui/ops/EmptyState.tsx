'use client';
import React from 'react';

export interface OpsEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function OpsEmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  compact = false,
}: OpsEmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4 gap-3' : 'py-16 px-6 gap-4'
      } ${className}`}
    >
      {icon && (
        <div
          className={`flex items-center justify-center text-border ${
            compact ? 'w-10 h-10' : 'w-14 h-14'
          }`}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      <div className="space-y-1.5 max-w-xs">
        <p className={`font-bold text-primary ${compact ? 'text-sm' : 'text-base'}`}>
          {title}
        </p>
        {description && (
          <p className="text-xs text-secondary leading-relaxed font-medium">{description}</p>
        )}
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
