'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, Clock, MessageSquare,
  Settings, LogOut, Settings2, BarChart3, X
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { motion } from 'framer-motion';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function EmployeeSidebar() {
  const searchParams = useSearchParams();
  const { showToast, setSidebarOpen } = useUI();
  const { user, logout } = useAuth();
  const currentTab = searchParams?.get('tab') || 'workspace';
  const unread = useUnreadCount();

  const navItems = [
    { name: 'My Workspace', href: '/employee',               icon: LayoutDashboard, tabId: 'workspace' },
    { name: 'Assignments',  href: '/employee?tab=tasks',     icon: CheckSquare,     tabId: 'tasks' },
    { name: 'Time Tracking',href: '/employee?tab=time',      icon: Clock,           tabId: 'time' },
    { name: 'Team Chat',    href: '/employee?tab=chat',      icon: MessageSquare,   tabId: 'chat', badge: unread },
    { name: 'Performance',  href: '/employee?tab=performance',icon: BarChart3,      tabId: 'performance' },
    { name: 'My Settings',  href: '/employee?tab=settings',  icon: Settings,        tabId: 'settings' },
  ];

  const handleLogout = async () => {
    setSidebarOpen(false);
    showToast('Security session ended', 'info');
    await logout();
  };

  return (
    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-64 bg-base border-r border-border h-screen flex flex-col shrink-0 transition-all duration-300">
      <div className="h-20 flex items-center justify-between px-6 border-b border-border bg-base/50 backdrop-blur-md">
        <div className="flex items-center gap-3 font-black text-lg tracking-tight text-primary">
          <div className="w-10 h-10 bg-gradient-to-br from-accent to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20">
            <Settings2 size={20} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="leading-none text-primary uppercase tracking-tighter">Ops Platform</span>
            <span className="text-[9px] font-black text-accent uppercase tracking-[0.3em] mt-1">Staff</span>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface transition-colors"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-8">
        <div>
          <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Daily Operations</div>
          <nav className="space-y-1.5">
            {navItems.map((item, i) => {
              const isActive = item.tabId === currentTab;
              const badge = (item as any).badge;
              return (
                <motion.div key={item.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + (i * 0.05) }}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 group relative ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border'}`}
                  >
                    <item.icon size={18} className={`${isActive ? 'text-white' : 'text-secondary group-hover:text-accent'} transition-colors`} />
                    <span className="flex-1">{item.name}</span>
                    {badge > 0 && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${isActive ? 'bg-white text-accent' : 'bg-accent text-white'}`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    {isActive && !badge && <motion.span layoutId="activeNavEmployee" className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="p-4 border-t border-border bg-surface/30">
        <div className="flex items-center gap-3 p-3 bg-base border border-border rounded-2xl mb-4 shadow-sm hover:border-accent/40 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-black text-xs border border-accent/20">
            {user ? getInitials(user.name) : 'ST'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-primary truncate">{user?.name ?? 'Staff'}</div>
            <div className="text-[10px] font-bold text-tertiary truncate uppercase tracking-widest">{user?.displayRole ?? 'Employee'}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-transparent hover:border-red-500/20">
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    </motion.div>
  );
}
