'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, CheckSquare, Target, FileText, BarChart3, 
  Settings as SettingsIcon, Settings2, LogOut, Plug, BookOpen,
  Shield, MessageSquare, X, Star, Clock
} from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useFavoritesAndRecents } from '@/hooks/useFavoritesAndRecents';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { showToast, setSidebarOpen, sidebarCollapsed } = useUI();
  const { user, logout } = useAuth();
  const unread = useUnreadCount();
  const { favorites, recents, toggleFavorite, addRecent, isFavorite } = useFavoritesAndRecents();

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

  useEffect(() => {
    const currentItem = adminNavItems.find(item => 
      pathname === item.href || 
      (item.href.includes('?') && pathname + '?tab=chat' === item.href)
    );
    if (currentItem) {
      addRecent({ name: currentItem.name, href: currentItem.href });
    }
  }, [pathname]);

  const handleLogout = async () => {
    setSidebarOpen(false);
    showToast('Security session ended', 'info');
    await logout();
  };

  if (pathname === '/landing' || pathname === '/login' || pathname === '/') return null;

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`bg-base border-r border-border h-screen flex flex-col shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* Logo */}
      <div className={`h-20 flex items-center border-b border-border bg-base/50 backdrop-blur-md transition-all duration-300 ${sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
        <div className="flex items-center gap-3 font-black text-lg tracking-tight text-primary">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-10 h-10 bg-gradient-to-br from-accent to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20"
          >
            <Settings2 size={20} className="text-white" />
          </motion.div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="leading-none text-primary uppercase tracking-tighter">Ops Platform</span>
              <span className="text-[9px] font-black text-accent uppercase tracking-[0.3em] mt-1">Enterprise</span>
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
      <div className={`p-4 flex-1 overflow-y-auto custom-scrollbar transition-all duration-300 ${sidebarCollapsed ? 'space-y-4 px-2' : 'space-y-8 px-4'}`}>
        <div>
          {!sidebarCollapsed && <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Primary Navigation</div>}
          <nav className="space-y-1.5">
            {adminNavItems.map((item, i) => {
              const isActive = pathname === item.href || (item.href.includes('?') && pathname + '?tab=chat' === item.href);
              const badge = (item as any).badge;
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
                    {!sidebarCollapsed && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite({ name: item.name, href: item.href });
                        }}
                        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all z-20 ${
                          isFavorite(item.href) ? 'text-yellow-500' : 'text-tertiary hover:text-yellow-500 hover:bg-base/80'
                        }`}
                        title={isFavorite(item.href) ? "Remove from Favorites" : "Add to Favorites"}
                      >
                        <Star size={12} className={isFavorite(item.href) ? "fill-yellow-500 text-yellow-500" : ""} />
                      </button>
                    )}
                    {badge > 0 && (
                      sidebarCollapsed ? (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border border-base animate-pulse"></span>
                      ) : (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${isActive ? 'bg-white text-accent' : 'bg-accent text-white'}`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )
                    )}
                    {isActive && !badge && !sidebarCollapsed && <motion.span layoutId="activeNav" className="absolute left-0 w-1 h-6 bg-white rounded-r-full" />}
                  </Link>
                </motion.div>
              );
            })}
          </nav>
        </div>

        {favorites.length > 0 && !sidebarCollapsed && (
          <div className="space-y-3">
            <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-2 px-3 flex items-center gap-1.5">
              <Star size={10} className="text-yellow-500 fill-yellow-500" /> Favorites
            </div>
            <nav className="space-y-1">
              {favorites.map((fav) => {
                const match = adminNavItems.find(n => n.href === fav.href);
                const Icon = match ? match.icon : FileText;
                const isActive = pathname === fav.href;
                return (
                  <Link
                    key={fav.href}
                    href={fav.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border border-transparent ${
                      isActive ? 'bg-accent/10 text-accent border-accent/20' : 'text-secondary hover:text-primary hover:bg-surface'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-accent' : 'text-secondary'} />
                    <span className="truncate flex-1">{fav.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {recents.length > 0 && !sidebarCollapsed && (
          <div className="space-y-3">
            <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-2 px-3 flex items-center gap-1.5">
              <Clock size={10} className="text-accent" /> Recents
            </div>
            <nav className="space-y-1">
              {recents.map((rec) => {
                const match = adminNavItems.find(n => n.href === rec.href);
                const Icon = match ? match.icon : Clock;
                const isActive = pathname === rec.href;
                return (
                  <Link
                    key={rec.href}
                    href={rec.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border border-transparent ${
                      isActive ? 'bg-accent/10 text-accent border-accent/20' : 'text-secondary hover:text-primary hover:bg-surface'
                    }`}
                  >
                    <Icon size={14} className={isActive ? 'text-accent' : 'text-secondary'} />
                    <span className="truncate flex-1">{rec.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        <div>
          {!sidebarCollapsed && <div className="text-[10px] font-black text-tertiary uppercase tracking-[0.2em] mb-4 px-3">Support</div>}
          <nav className="space-y-1.5">
            <Link 
              href="/settings" 
              className={`flex items-center rounded-2xl text-sm font-bold text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border transition-all ${
                sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
              }`}
              title={sidebarCollapsed ? "Settings" : undefined}
            >
              <SettingsIcon size={18} className="shrink-0" />
              {!sidebarCollapsed && <span>Settings</span>}
            </Link>
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className={`p-4 border-t border-border bg-surface/30 transition-all duration-300 ${sidebarCollapsed ? 'flex flex-col items-center gap-3' : ''}`}>
        <motion.div whileHover={{ y: -2 }} className={`flex items-center bg-base border border-border rounded-2xl shadow-sm group hover:border-accent/40 transition-all cursor-pointer ${
          sidebarCollapsed ? 'justify-center p-3 w-12 h-12' : 'gap-3 p-3 mb-4 w-full'
        }`} title={sidebarCollapsed ? (user?.name ?? 'Admin') : undefined}>
          <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-black text-xs border border-accent/20 shrink-0">
            {user ? getInitials(user.name) : 'AD'}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-primary truncate">{user?.name ?? 'Admin'}</div>
              <div className="text-[10px] font-bold text-tertiary truncate uppercase tracking-widest">{user?.displayRole ?? 'Admin'}</div>
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
