'use client';
import React from 'react';

export interface OpsTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface OpsTabsProps {
  tabs: OpsTab[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

export function OpsTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}: OpsTabsProps) {
  const sizeClasses = size === 'sm' ? 'text-[11px] gap-1.5' : 'text-xs gap-2';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? 'Navigation tabs'}
      className={`flex items-end ${
        variant === 'underline'
          ? 'border-b border-border/50 gap-0'
          : 'gap-1.5 bg-base/50 p-1 rounded-lg border border-border/40'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        if (variant === 'underline') {
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={`relative flex items-center font-semibold px-4 py-2.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-t ${sizeClasses} ${
                tab.disabled
                  ? 'opacity-40 cursor-not-allowed text-secondary'
                  : isActive
                  ? 'text-primary'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              {tab.icon && (
                <span className="shrink-0" aria-hidden="true">
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold border transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent border-accent/20'
                      : 'bg-border/40 text-secondary border-border/20'
                  }`}
                  aria-label={`${tab.count} items`}
                >
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}

              {/* Active underline */}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-t"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        }

        // Pill variant
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`flex items-center rounded-md px-3 py-1.5 font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${sizeClasses} ${
              tab.disabled
                ? 'opacity-40 cursor-not-allowed text-secondary'
                : isActive
                ? 'bg-surface text-primary shadow-sm border border-border/60'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {tab.icon && (
              <span className="shrink-0" aria-hidden="true">
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${
                  isActive ? 'bg-accent/10 text-accent' : 'bg-border/30 text-secondary'
                }`}
              >
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
