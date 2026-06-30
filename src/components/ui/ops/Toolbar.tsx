'use client';
import React from 'react';

export interface OpsToolbarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  /** Render a second row below (e.g. the expanded filter bar) */
  bottom?: React.ReactNode;
  'aria-label'?: string;
}

export function OpsToolbar({
  left,
  center,
  right,
  bottom,
  className = '',
  'aria-label': ariaLabel,
}: OpsToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel ?? 'View toolbar'}
      className={`shrink-0 ${className}`}
    >
      {/* Primary row */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/50 bg-base/60 min-h-[44px]">
        {left && <div className="flex items-center gap-2 flex-1 min-w-0">{left}</div>}
        {center && (
          <div className="flex items-center gap-2 shrink-0">{center}</div>
        )}
        {right && (
          <div className="flex items-center gap-2 ml-auto shrink-0">{right}</div>
        )}
      </div>

      {/* Optional filter bar row */}
      {bottom && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-base/30 min-h-[40px] overflow-x-auto">
          {bottom}
        </div>
      )}
    </div>
  );
}
