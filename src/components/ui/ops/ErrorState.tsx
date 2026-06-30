'use client';
import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, ShieldOff } from 'lucide-react';
import { OpsButton } from './Button';

export type OpsErrorKind = 'generic' | 'network' | 'permission' | 'not-found';

export interface OpsErrorStateProps {
  kind?: OpsErrorKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

const DEFAULTS: Record<OpsErrorKind, { title: string; description: string; Icon: React.ElementType }> = {
  generic: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again.',
    Icon: AlertTriangle,
  },
  network: {
    title: 'Connection failed',
    description: 'Could not reach the server. Check your connection and retry.',
    Icon: WifiOff,
  },
  permission: {
    title: 'Access denied',
    description: "You don't have permission to view this content.",
    Icon: ShieldOff,
  },
  'not-found': {
    title: 'Not found',
    description: 'The requested resource could not be found.',
    Icon: AlertTriangle,
  },
};

export function OpsErrorState({
  kind = 'generic',
  title,
  description,
  onRetry,
  retryLabel = 'Retry',
  className = '',
  compact = false,
}: OpsErrorStateProps) {
  const defaults = DEFAULTS[kind];
  const { Icon } = defaults;

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4 gap-3' : 'py-16 px-6 gap-4'
      } ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-red-500/8 border border-red-500/15 text-red-500 ${
          compact ? 'w-10 h-10' : 'w-12 h-12'
        }`}
        aria-hidden="true"
      >
        <Icon size={compact ? 16 : 20} />
      </div>

      <div className="space-y-1.5 max-w-xs">
        <p className={`font-bold text-primary ${compact ? 'text-sm' : 'text-base'}`}>
          {title ?? defaults.title}
        </p>
        <p className="text-xs text-secondary leading-relaxed font-medium">
          {description ?? defaults.description}
        </p>
      </div>

      {onRetry && (
        <OpsButton
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={12} />}
          onClick={onRetry}
        >
          {retryLabel}
        </OpsButton>
      )}
    </div>
  );
}
