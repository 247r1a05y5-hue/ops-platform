'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, CheckSquare, Target, FileText, BarChart3, 
  Settings as SettingsIcon, Settings2, LogOut, Plug, BookOpen,
  Shield, MessageSquare, X
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { motion } from 'framer-motion';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { showToast, setSidebarOpen } = useUI();
  const { user, logout } = useAuth();
  const unread = useUnreadCount();

  if (pathname === '/landing' || pathname === '/login' || pathname === '/') return null;

  const adminNavItems = [
    { name: 'Dashboard',    href: '/dashboard',   icon: LayoutDashboard },
    { name: 'Tasks',        href: '/tasks',        icon: CheckSquare },
    { name: 'CRM',          href: '/crm',          icon: Target },
    { name: 'Invoices',     href: '/invoices',     icon: FileText },
    { name: 'Catalog',      href: '/catalog',      icon: BookOpen },
    { name: 'Analytics',    href: '/analytics',    icon: BarChart3 },
    { name: 'Team Chat',    href: '/employee?tab=chat', icon: MessageSquare, badge: unread },
    { name: 'Integrations', href: '/integrations', icon: Plug },
    { name: 'Admin',        href: '/admin',        icon: Settings2 },
    { name: 'Audit Log',    href: '/admin/audit',  icon: Shield },
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
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-10 h-10 bg-gradient-to-br from-accent to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20"
          >
            <Settings2 size={20} className="text-white" />
          </motion.div>
          <div className="flex flex-col">
            <span className="leading-none text-primary uppercase tracking-tighter">Ops Platform</span>
            <span className="text-[9px] font-black text-accent uppercase tracking-[0.3em] mt-1">Enterprise</span>
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
          <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Primary Navigation</div>
          <nav className="space-y-1.5">
            {adminNavItems.map((item, i) => {
              const isActive = pathname === item.href || (item.href.includes('?') && pathname + '?tab=chat' === item.href);
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
                    {isActive && !badge && <motion.span layoutId="activeNav" className="absolute left-0 w-1 h-6 bg-white rounded-r-full" />}
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </div>
        <div>
          <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Support</div>
          <nav className="space-y-1.5">
            <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border transition-all">
              <SettingsIcon size={18} /> Settings
            </Link>
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-surface/30">
        <motion.div whileHover={{ y: -2 }} className="flex items-center gap-3 p-3 bg-base border border-border rounded-2xl mb-4 shadow-sm group hover:border-accent/40 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-black text-xs border border-accent/20">
            {user ? getInitials(user.name) : 'AD'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-primary truncate">{user?.name ?? 'Admin'}</div>
            <div className="text-[10px] font-bold text-tertiary truncate uppercase tracking-widest">{user?.displayRole ?? 'Admin'}</div>
          </div>
        </motion.div>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-transparent hover:border-red-500/20">
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    </motion.div>
  );
}
