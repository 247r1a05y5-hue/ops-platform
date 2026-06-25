'use client';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import {
  Target, Mail, CreditCard, Folder,
  Settings2, LogOut, Megaphone,
  BarChart3, CheckCircle, Settings, X, CheckSquare
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function MRSidebar() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { showToast, setSidebarOpen, sidebarCollapsed } = useUI();
  const { user, logout } = useAuth();

  const isMarketing = pathname?.includes('/marketing');
  const currentTab = searchParams?.get('tab') || (isMarketing ? 'campaigns' : 'leads');

  const campaignItems = [
    { name: 'Campaign Desk',       href: '/marketing?tab=campaigns', icon: Megaphone,   tabId: 'campaigns' },
    { name: 'Analytics & ROI',     href: '/marketing?tab=analytics', icon: BarChart3,   tabId: 'analytics' },
    { name: 'Strategy Alignment',  href: '/marketing?tab=approvals', icon: CheckCircle, tabId: 'approvals' },
  ];
  const operationsItems = [
    { name: 'Media Pipeline', href: '/mr?tab=leads',     icon: Target,    tabId: 'leads' },
    { name: 'Outreach Hub',   href: '/mr?tab=email',     icon: Mail,      tabId: 'email' },
    { name: 'Financials',     href: '/mr?tab=finance',   icon: CreditCard,tabId: 'finance' },
    { name: 'Media Desk',     href: '/mr?tab=resources', icon: Folder,    tabId: 'resources' },
    { name: 'Tasks & Alerts', href: '/mr?tab=tasks',     icon: CheckSquare,tabId: 'tasks' },
  ];
  const accountItems = [
    { name: 'Settings', href: '/mr?tab=settings', icon: Settings, tabId: 'settings' },
  ];

  const handleLogout = async () => {
    setSidebarOpen(false);
    showToast('Security session ended', 'info');
    await logout();
  };

  const renderNavItem = (item: { name: string; href: string; icon: any; tabId: string }, i: number, sectionName: string) => {
    const itemPath = item.href.split('?')[0];
    const isActive = item.tabId === currentTab && pathname === itemPath;
    return (
      <motion.div key={item.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + (i * 0.05) }}>
        <Link
          href={item.href}
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center rounded-2xl text-sm font-bold transition-all duration-200 group relative ${
            sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
          } ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border'}`}
          title={sidebarCollapsed ? item.name : undefined}
        >
          <item.icon size={18} className={`${isActive ? 'text-white' : 'text-secondary group-hover:text-accent'} transition-colors shrink-0`} />
          {!sidebarCollapsed && <span className="flex-1 truncate">{item.name}</span>}
          {isActive && !sidebarCollapsed && <motion.span layoutId={`activeNavMR_${sectionName}`} className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
        </Link>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`bg-base border-r border-border h-screen flex flex-col shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* Logo */}
      <div className={`h-20 flex items-center border-b border-border bg-base/50 backdrop-blur-md transition-all duration-300 ${sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
        <div className="flex items-center gap-3 font-black text-lg tracking-tight text-primary">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-accent rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20 shrink-0">
            <Settings2 size={20} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="leading-none text-primary uppercase tracking-tighter">Ops Platform</span>
              <span className="text-[9px] font-black text-accent uppercase tracking-[0.3em] mt-1">Marketing Rep</span>
            </div>
          )}
        </div>

        {/* Mobile Close Button */}
        {!sidebarCollapsed && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface transition-colors"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <div className={`p-4 flex-1 overflow-y-auto custom-scrollbar transition-all duration-300 ${sidebarCollapsed ? 'space-y-4 px-2' : 'space-y-6 px-4'}`}>
        <div>
          {!sidebarCollapsed && <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-3 px-3">Campaign Operations</div>}
          <nav className="space-y-1">{campaignItems.map((item, i) => renderNavItem(item, i, 'campaign'))}</nav>
        </div>
        <div>
          {!sidebarCollapsed && <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-3 px-3">Media & Pipeline</div>}
          <nav className="space-y-1">{operationsItems.map((item, i) => renderNavItem(item, i + 3, 'ops'))}</nav>
        </div>
        <div>
          {!sidebarCollapsed && <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-3 px-3">Account</div>}
          <nav className="space-y-1">{accountItems.map((item, i) => renderNavItem(item, i + 8, 'account'))}</nav>
        </div>
      </div>

      {/* Footer */}
      <div className={`p-4 border-t border-border bg-surface/30 transition-all duration-300 ${sidebarCollapsed ? 'flex flex-col items-center gap-3' : ''}`}>
        <motion.div whileHover={{ y: -2 }} className={`flex items-center bg-base border border-border rounded-2xl shadow-sm group hover:border-accent/40 transition-all cursor-pointer ${
          sidebarCollapsed ? 'justify-center p-3 w-12 h-12' : 'gap-3 p-3 mb-4 w-full'
        }`} title={sidebarCollapsed ? (user?.name ?? 'Marketing Rep') : undefined}>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-xs border border-indigo-500/20 shrink-0">
            {user ? getInitials(user.name) : 'MR'}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-primary truncate">{user?.name ?? 'Marketing Rep'}</div>
              <div className="text-[10px] font-bold text-tertiary truncate uppercase tracking-widest">{user?.displayRole ?? 'Marketing Rep'}</div>
            </div>
          )}
        </motion.div>
        <button onClick={handleLogout} className={`flex items-center rounded-2xl text-sm font-black text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-transparent hover:border-red-500/20 ${
          sidebarCollapsed ? 'justify-center p-3 w-12 h-12' : 'w-full gap-3 px-4 py-3'
        }`} title={sidebarCollapsed ? "Sign Out" : undefined}>
          <LogOut size={18} className="shrink-0" /> {!sidebarCollapsed && "Sign Out"}
        </button>
      </div>
    </motion.div>
  );
}
