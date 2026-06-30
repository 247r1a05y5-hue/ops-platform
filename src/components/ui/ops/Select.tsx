'use client';
import React, { forwardRef } from 'react';

export interface OpsSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface OpsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: OpsSelectOption[];
  placeholder?: string;
}

export const OpsSelect = forwardRef<HTMLSelectElement, OpsSelectProps>(function OpsSelect(
  { label, error, hint, options, placeholder, className = '', id, ...props },
  ref
) {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="text-[10px] font-bold text-secondary uppercase tracking-widest"
        >
          {label}
        </label>
      )}
      <div
        className={`relative flex items-center bg-base border rounded-lg transition-all duration-150 ${
          error
            ? 'border-red-500/40 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/20'
            : 'border-border/70 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/15'
        }`}
      >
        <select
          ref={ref}
          id={selectId}
          className={`w-full bg-transparent pl-3 pr-8 py-2 text-[13px] font-medium text-primary appearance-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Custom chevron */}
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="text-[11px] text-red-500 font-medium">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-[11px] text-secondary font-medium">
          {hint}
        </p>
      )}
    </div>
  );
});
