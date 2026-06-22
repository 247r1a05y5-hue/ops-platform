'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Search, Bell, Sun, Moon, Settings as SettingsIcon, LogOut, Check, Menu } from 'lucide-react';
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
  const { showToast, setSidebarOpen } = useUI();
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  return (
    <div className="h-16 border-b border-border bg-base/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 z-50 sticky top-0 w-full shrink-0 transition-colors gap-4">

      <div className="flex items-center gap-2 flex-1 max-w-xl">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface transition-colors"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="relative group flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary group-focus-within:text-accent transition-colors" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspace..."
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-primary placeholder-secondary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-medium"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                showToast(`Searching for: ${searchQuery}`, 'info');
                setSearchQuery('');
              }
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
            <kbd className="hidden sm:inline px-1.5 py-0.5 text-[10px] bg-border text-secondary rounded font-mono">⌘K</kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-4">
        <button
          className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface transition-colors"
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
            className={`relative p-2 rounded-lg transition-colors ${notifOpen ? 'bg-surface text-primary' : 'text-secondary hover:text-primary hover:bg-surface'}`}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-base animate-pulse"></span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 mt-2 w-96 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
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
            className={`w-8 h-8 rounded-full border border-border flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-accent/50 transition-all ${avatarColor}`}
          >
            {initials}
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-xl shadow-2xl py-2 z-50">
                <div className="px-4 py-3 border-b border-border mb-2">
                  <p className="font-bold text-sm">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-secondary">{user?.email ?? ''}</p>
                  {user && (
                    <p className="text-xs text-accent font-semibold mt-0.5">{user.displayRole}</p>
                  )}
                </div>

                <div className="px-2 space-y-1">
                  <Link href={`${homeRoute}?tab=settings`} onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-base rounded-lg transition-colors">
                    <SettingsIcon size={14} /> Settings
                  </Link>
                  <div className="h-px bg-border my-1"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
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
