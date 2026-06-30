'use client';
import React, { forwardRef } from 'react';

export interface OpsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const OpsInput = forwardRef<HTMLInputElement, OpsInputProps>(function OpsInput(
  { label, error, hint, prefix, suffix, className = '', id, ...props },
  ref
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[10px] font-bold text-secondary uppercase tracking-widest"
        >
          {label}
        </label>
      )}
      <div
        className={`flex items-center bg-base border rounded-lg transition-all duration-150 ${
          error
            ? 'border-red-500/40 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500/20'
            : 'border-border/70 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/15'
        }`}
      >
        {prefix && (
          <span className="pl-3 shrink-0 flex items-center text-secondary">{prefix}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full bg-transparent px-3 py-2 text-[13px] font-medium text-primary placeholder:text-secondary/50 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
            prefix ? '!pl-2' : ''
          } ${suffix ? '!pr-2' : ''} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {suffix && (
          <span className="pr-3 shrink-0 flex items-center text-secondary">{suffix}</span>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-[11px] text-red-500 font-medium">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-[11px] text-secondary font-medium">
          {hint}
        </p>
      )}
    </div>
  );
});
