'use client';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import {
  Users, CheckSquare, CheckCircle, TrendingUp, MessageSquare,
  BarChart3, Settings2, Settings, LogOut, Target, FileText, X
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ManagerSidebar() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { showToast, setSidebarOpen } = useUI();
  const { user, logout } = useAuth();
  const currentTab = searchParams?.get('tab') || 'team';

  const managerNavItems = [
    { name: 'Team Overview',         href: '/manager?tab=team',          icon: Users,         isActive: pathname === '/manager' && (currentTab === 'team' || !searchParams?.get('tab')) },
    { name: 'Strategic Allocations', href: '/tasks',                     icon: CheckSquare,   isActive: pathname.startsWith('/tasks') },
    { name: 'Decision Protocols',    href: '/manager?tab=approvals',     icon: CheckCircle,   isActive: pathname === '/manager' && currentTab === 'approvals' },
    { name: 'Performance Velocity',  href: '/manager?tab=progress',      icon: TrendingUp,    isActive: pathname === '/manager' && currentTab === 'progress' },
    { name: 'CRM Activity',          href: '/crm',                       icon: Target,        isActive: pathname.startsWith('/crm') },
    { name: 'Invoices & Billing',    href: '/invoices',                  icon: FileText,      isActive: pathname.startsWith('/invoices') },
    { name: 'Department Hub',        href: '/employee?tab=chat',         icon: MessageSquare, isActive: pathname.startsWith('/employee') && currentTab === 'chat' },
    { name: 'Intelligence Reports',  href: '/manager?tab=reports',       icon: BarChart3,     isActive: pathname === '/manager' && currentTab === 'reports' },
    { name: 'Settings',              href: '/manager?tab=settings',      icon: Settings,      isActive: pathname === '/manager' && currentTab === 'settings' },
  ];

  const handleLogout = async () => {
    setSidebarOpen(false);
    showToast('Security session ended', 'info');
    await logout();
  };

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-64 bg-base border-r border-border h-screen flex flex-col shrink-0 transition-all duration-300"
    >
      {/* Logo */}
      <div className="h-20 flex items-center justify-between px-6 border-b border-border bg-base/50 backdrop-blur-md">
        <div className="flex items-center gap-3 font-black text-lg tracking-tight text-primary">
          <motion.div whileHover={{ scale: 1.05, rotate: 5 }} className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Settings2 size={20} className="text-white" />
          </motion.div>
          <div className="flex flex-col">
            <span className="leading-none text-primary uppercase tracking-tighter">Ops Platform</span>
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em] mt-1">Manager</span>
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

      {/* Nav */}
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-8">
        <div>
          <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Management Panel</div>
          <nav className="space-y-1.5">
            {managerNavItems.map((item, i) => {
              const isActive = item.isActive;
              return (
                <motion.div key={item.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + (i * 0.03) }}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200 group relative ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border'}`}
                  >
                    <item.icon size={18} className={`${isActive ? 'text-white' : 'text-secondary group-hover:text-accent'} transition-colors`} />
                    {item.name}
                    {isActive && <motion.span layoutId="activeNavManager" className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-surface/30">
        <motion.div whileHover={{ y: -2 }} className="flex items-center gap-3 p-3 bg-base border border-border rounded-2xl mb-4 shadow-sm group hover:border-accent/40 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-xs border border-indigo-500/20">
            {user ? getInitials(user.name) : 'MG'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-primary truncate">{user?.name ?? 'Manager'}</div>
            <div className="text-[10px] font-bold text-tertiary truncate uppercase tracking-widest font-mono">{user?.displayRole ?? 'Manager'}</div>
          </div>
        </motion.div>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-transparent hover:border-red-500/20">
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    </motion.div>
  );
}
