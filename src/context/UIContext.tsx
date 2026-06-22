'use client';
import { createContext, useState, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export const UIContext = createContext({
  isLoading: false,
  setLoading: (_state: boolean) => {},
  showToast: (message: string, _type: ToastType = 'info') => {},
  sidebarOpen: false,
  setSidebarOpen: (_state: boolean) => {},
});

export const UIProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: ToastType, id: number} | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => {
      setToast(current => current?.id === id ? null : current);
    }, 3000);
  };

  return (
    <UIContext.Provider value={{ isLoading, setLoading, showToast, sidebarOpen, setSidebarOpen }}>
      {children}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? 'var(--accent-primary)' : toast.type === 'warning' ? '#f59e0b' : 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: toast.type === 'info' ? 'var(--text-primary)' : 'white', padding: '12px 20px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             {toast.type === 'success' && <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>}
             {toast.type === 'error' && <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
             {toast.type === 'warning' && <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>}
             <span style={{ fontSize: '14px', fontWeight: 500 }}>{toast.message}</span>
          </div>
        </div>
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </UIContext.Provider>
  );
};

export const useUI = () => useContext(UIContext);
