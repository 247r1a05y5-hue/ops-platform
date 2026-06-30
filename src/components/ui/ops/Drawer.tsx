'use client';
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface OpsDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
  /** Side from which it slides in */
  side?: 'right' | 'left';
}

export function OpsDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = '420px',
  footer,
  side = 'right',
}: OpsDrawerProps) {
  // Trap focus inside the drawer when open
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus inside
    const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const xInitial = side === 'right' ? '100%' : '-100%';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={drawerRef}
            initial={{ x: xInitial }}
            animate={{ x: 0 }}
            exit={{ x: xInitial }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} bottom-0 z-[201] bg-surface border-${side === 'right' ? 'l' : 'r'} border-border/60 flex flex-col shadow-2xl`}
            style={{ width }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Header */}
            {(title || subtitle) && (
              <div className="flex items-start justify-between px-5 py-4 border-b border-border/50 bg-base/40 shrink-0">
                <div className="flex-1 min-w-0 pr-4">
                  {title && (
                    <h2 className="text-sm font-bold text-primary truncate">{title}</h2>
                  )}
                  {subtitle && (
                    <p className="text-[11px] text-secondary mt-0.5 truncate">{subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="p-1.5 text-secondary hover:text-primary hover:bg-base rounded-lg transition-colors shrink-0"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="px-5 py-4 border-t border-border/50 bg-base/20 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
