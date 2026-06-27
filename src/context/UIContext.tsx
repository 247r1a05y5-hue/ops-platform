'use client';
import { createContext, useState, useEffect, useContext } from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export const UIContext = createContext({
  isLoading: false,
  setLoading: (_state: boolean) => {},
  showToast: (message: string, _type: ToastType = 'info') => {},
  sidebarOpen: false,
  setSidebarOpen: (_state: boolean) => {},
  sidebarCollapsed: false,
  setSidebarCollapsed: (_state: boolean) => {},
});

export const UIProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: ToastType, id: number} | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem('sidebarCollapsed');
    if (cached) {
      setSidebarCollapsedState(cached === 'true');
    }
  }, []);

  const setSidebarCollapsed = (state: boolean) => {
    setSidebarCollapsedState(state);
    localStorage.setItem('sidebarCollapsed', String(state));
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => {
      setToast(current => current?.id === id ? null : current);
    }, 3000);
  };

  return (
    <UIContext.Provider value={{ isLoading, setLoading, showToast, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed }}>
      {children}
      {toast && (
        <div 
          style={{ position: 'fixed', bottom: '28px', right: '28px', zIndex: 9999, animation: 'slideUpToast 0.28s cubic-bezier(0.16, 1, 0.3, 1)' }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md text-xs font-bold uppercase tracking-wider ${
            toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 shadow-emerald-500/5' :
            toast.type === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25 shadow-red-500/5' :
            toast.type === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 shadow-amber-500/5' :
            'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25 shadow-indigo-500/5'
          }`}
        >
          <span className="shrink-0 flex items-center justify-center">
            {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-500" />}
            {toast.type === 'error' && <AlertOctagon size={16} className="text-red-500" />}
            {toast.type === 'warning' && <AlertTriangle size={16} className="text-amber-500" />}
            {toast.type === 'info' && <Info size={16} className="text-indigo-500" />}
          </span>
          <span className="text-[11px] leading-snug font-semibold normal-case text-primary">{toast.message}</span>
        </div>
      )}
      <style>{`
        @keyframes slideUpToast { 
          from { transform: translateY(16px); opacity: 0; } 
          to { transform: translateY(0); opacity: 1; } 
        }
      `}</style>
    </UIContext.Provider>
  );
};

export const useUI = () => useContext(UIContext);
