'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Search, Bell, Sun, Moon, Settings as SettingsIcon, LogOut, Check, Menu, ChevronRight } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_COLORS: Record<string, string> = {
  Admin:   'bg-orange-500/10 text-orange-600',
  Manager: 'bg-accent/10 text-accent',
  Staff:   'bg-emerald-500/10 text-emerald-600',
  User:    'bg-indigo-500/10 text-indigo-500',
  MR:      'bg-indigo-500/10 text-indigo-500',
};

const ROLE_ROUTE: Record<string, string> = {
  Admin:   '/dashboard',
  Manager: '/manager',
  Staff:   '/employee',
  User:    '/mr',
  MR:      '/mr',
};

export default function Topbar() {
  const pathname = usePathname();
  const { showToast, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useUI();
  const { theme, toggleTheme, mounted } = useTheme();
  const { user, logout } = useAuth();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<any[]>([]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications.map((n: any) => ({
          id: n._id,
          text: n.message || n.title,
          time: new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: n.read
        })));
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Initial load
    fetchNotifications();

    // SSE for real-time push — replaces 10s polling
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/notifications/stream');

      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification') {
            setNotifications(prev => [{
              id:   data.id,
              text: data.message || data.title,
              time: new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              read: false,
            }, ...prev]);
          }
        } catch (_) {}
      });

      es.onerror = () => {
        // SSE reconnects automatically; suppress console noise
        es?.close();
      };
    } catch (_) {}

    return () => { es?.close(); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_all_read' })
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      showToast('All notifications marked as read', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id })
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (pathname === '/landing' || pathname === '/login' || pathname === '/') return null;

  const initials   = user ? getInitials(user.name) : '?';
  const avatarColor = user ? (ROLE_COLORS[user.role] ?? ROLE_COLORS['User']) : 'bg-gray-200 text-gray-500';
  const homeRoute  = user ? (ROLE_ROUTE[user.role] ?? '/dashboard') : '/login';

  const handleLogout = async () => {
    setProfileOpen(false);
    showToast('Signing out...', 'info');
    await logout();
  };

  // Breadcrumbs parsing
  const SEGMENT_NAMES: Record<string, string> = {
    admin: 'Admin',
    crm: 'CRM',
    mr: 'Media Desk',
    marketing: 'Marketing',
    employee: 'Workspace',
    invoices: 'Invoices',
    tasks: 'Tasks',
    analytics: 'Analytics',
    integrations: 'Integrations',
    settings: 'Settings',
    audit: 'Audit Log',
    chat: 'Chat Moderation',
    pay: 'Razorpay Checkout',
    proposals: 'Proposals',
  };

  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.map((seg, index) => {
    const name = SEGMENT_NAMES[seg.toLowerCase()] || seg.charAt(0).toUpperCase() + seg.slice(1);
    const href = '/' + segments.slice(0, index + 1).join('/');
    return { name, href, isLast: index === segments.length - 1 };
  });

  return (
    <div className="h-16 border-b border-border/50 bg-surface/85 backdrop-blur-md flex items-center justify-between px-6 z-50 sticky top-0 w-full shrink-0 transition-colors gap-4 select-none">

      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-base/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-base/60 border border-border/40 bg-surface/40 shadow-xs transition-all duration-150 active:scale-95 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <Menu size={16} />
        </button>

        {/* Dynamic Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-secondary/70 font-semibold px-2 shrink-0">
            <span className="h-4 w-px bg-border/50 mx-1.5" />
            {breadcrumbs.map((crumb, idx) => (
              <div key={crumb.href} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight size={10} className="text-tertiary/60" />}
                {crumb.isLast ? (
                  <span className="text-primary font-bold tracking-tight truncate max-w-[120px]">{crumb.name}</span>
                ) : (
                  <Link href={crumb.href} className="hover:text-primary transition-colors truncate max-w-[100px]">{crumb.name}</Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sleek Search Box */}
        <div className="relative group flex-1 min-w-[140px] max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-accent transition-colors" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspace..."
            className="w-full bg-base/55 border border-border/40 hover:border-border/80 rounded-xl pl-9 pr-4 py-1.5 text-xs text-primary placeholder-secondary/80 focus:outline-none focus:bg-surface focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-150 font-medium"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                showToast(`Searching for: ${searchQuery}`, 'info');
                setSearchQuery('');
              }
            }}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex gap-1">
            <kbd className="hidden sm:inline px-1 py-0.5 text-[9px] bg-border/60 text-secondary rounded font-mono font-bold">⌘K</kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-base/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          onClick={() => {
            toggleTheme();
            showToast(`Switched to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`, 'info');
          }}
        >
          {!mounted || theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className={`relative p-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${notifOpen ? 'bg-base text-primary' : 'text-secondary hover:text-primary hover:bg-base/60'}`}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface animate-pulse"></span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 8, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 8, scale: 0.95 }} 
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2.5 w-96 bg-surface border border-border/80 rounded-2xl shadow-xl z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-base/50">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">{unreadCount} new</span>
                    )}
                  </div>
                  <button
                    onClick={markAllRead}
                    className="text-xs text-accent hover:underline font-semibold flex items-center gap-1 transition-colors hover:text-indigo-400"
                  >
                    <Check size={12} /> Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markOneRead(n.id)}
                      className={`px-4 py-3 hover:bg-base transition-colors cursor-pointer border-b border-border/50 last:border-b-0 flex items-start gap-3 ${!n.read ? 'bg-accent/5' : ''}`}
                    >
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!n.read ? 'bg-accent' : 'bg-transparent'}`}></div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-primary' : 'font-medium text-secondary'}`}>{n.text}</p>
                        <p className="text-xs text-secondary mt-1">{n.time}</p>
                      </div>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="px-4 py-8 text-center text-secondary text-sm">No notifications</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative ml-2" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={`w-9 h-9 rounded-full border border-border/50 flex items-center justify-center font-semibold text-xs tracking-wide shadow-sm hover:border-accent/40 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none transition-all cursor-pointer ${avatarColor}`}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-label="User profile options"
          >
            {initials}
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 8, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }} 
                exit={{ opacity: 0, y: 8, scale: 0.95 }} 
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2.5 w-60 bg-surface/95 border border-border/80 rounded-2xl shadow-xl py-2.5 z-50 backdrop-blur-md"
              >
                <div className="px-4 py-3 border-b border-border/60 mb-2">
                  <p className="font-semibold text-sm text-primary">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-secondary truncate">{user?.email ?? ''}</p>
                  {user && (
                    <p className="text-[10px] font-bold tracking-widest text-accent uppercase mt-1">{user.displayRole}</p>
                  )}
                </div>

                <div className="px-2 space-y-0.5">
                  <Link href={user?.role === 'Admin' ? '/settings' : `${homeRoute}?tab=settings`} onClick={() => setProfileOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-secondary hover:text-primary hover:bg-base/60 rounded-xl transition-colors">
                    <SettingsIcon size={14} /> Settings
                  </Link>
                  <div className="h-px bg-border/50 my-1"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
