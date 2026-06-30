'use client';
import React from 'react';

export interface OpsAvatarProps {
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

const SIZE_CLASSES: Record<NonNullable<OpsAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-8 h-8 text-[11px]',
  lg: 'w-10 h-10 text-sm',
};

/** Deterministic hue from name string — always the same color per name */
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function initials(name?: string): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function OpsAvatar({
  name,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}: OpsAvatarProps) {
  const hue = name ? nameToHue(name) : 0;
  const bg = `hsl(${hue}, 55%, 20%)`;
  const color = `hsl(${hue}, 75%, 75%)`;

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? (name ? `Avatar for ${name}` : 'Unknown user')}
      className={`inline-flex items-center justify-center rounded-full font-bold select-none shrink-0 border border-white/10 ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: bg, color }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/** Stacked avatar group with overflow count */
export function OpsAvatarGroup({
  names,
  max = 3,
  size = 'sm',
}: {
  names: string[];
  max?: number;
  size?: OpsAvatarProps['size'];
}) {
  const visible = names.slice(0, max);
  const overflow = names.length - max;

  return (
    <div className="flex items-center -space-x-1.5" role="group" aria-label="Team members">
      {visible.map((name, i) => (
        <OpsAvatar
          key={`${name}-${i}`}
          name={name}
          size={size}
          className="border-2 border-base"
        />
      ))}
      {overflow > 0 && (
        <span
          className={`inline-flex items-center justify-center rounded-full bg-surface border-2 border-base text-secondary font-bold select-none shrink-0 ${SIZE_CLASSES[size ?? 'sm']}`}
          aria-label={`and ${overflow} more`}
        >
          <span className="text-[8px]">+{overflow}</span>
        </span>
      )}
    </div>
  );
}
