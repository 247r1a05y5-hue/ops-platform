'use client';
import React, { forwardRef, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

export interface OpsSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export const OpsSearch = forwardRef<HTMLInputElement, OpsSearchProps>(function OpsSearch(
  {
    value,
    onChange,
    placeholder = 'Search…',
    onClear,
    autoFocus,
    className = '',
    id,
    'aria-label': ariaLabel,
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <div
      className={`relative flex items-center bg-base border border-border/70 rounded-lg transition-all duration-150 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/15 ${className}`}
    >
      <Search
        size={13}
        className="absolute left-3 text-secondary pointer-events-none shrink-0"
        aria-hidden="true"
      />
      <input
        ref={setRef}
        id={id}
        type="search"
        role="searchbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full bg-transparent pl-9 pr-8 py-2 text-[13px] font-medium text-primary placeholder:text-secondary/50 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            onClear?.();
          }
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); onClear?.(); }}
          aria-label="Clear search"
          className="absolute right-3 text-secondary hover:text-primary transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
});
