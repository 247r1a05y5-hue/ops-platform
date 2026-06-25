'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, Sun, Moon, Star, Clock, FileText, CheckCircle, 
  Users, Target, BookOpen, BarChart3, Plug, Shield, 
  MessageSquare, Settings, Sparkles, Folder, Plus, Trash2, Command
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useUI } from '@/context/UIContext';
import { useFavoritesAndRecents } from '@/hooks/useFavoritesAndRecents';

type PaletteItem = {
  name: string;
  description: string;
  category: 'Navigation' | 'Actions' | 'Recent';
  icon: any;
  href?: string;
  action?: () => void;
};

export default function CommandPalette() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useUI();
  const { recents, clearRecents } = useFavoritesAndRecents();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Toggle Command Palette on Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setSearch('');
        setSelectedIndex(0);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const navItems: PaletteItem[] = [
    { name: 'Dashboard', description: 'Go to workspace overview', category: 'Navigation', icon: BarChart3, href: '/dashboard' },
    { name: 'Tasks & Projects', description: 'Go to sprint boards and backlog lists', category: 'Navigation', icon: CheckCircle, href: '/tasks' },
    { name: 'CRM Pipeline', description: 'Go to lead stages and funnel tracker', category: 'Navigation', icon: Target, href: '/crm' },
    { name: 'Billing & Invoices', description: 'Go to client billing ledger', category: 'Navigation', icon: FileText, href: '/invoices' },
    { name: 'Catalog', description: 'Go to services and packages database', category: 'Navigation', icon: BookOpen, href: '/catalog' },
    { name: 'Analytics', description: 'Go to system telemetry reports', category: 'Navigation', icon: Sparkles, href: '/analytics' },
    { name: 'Team Chat Hub', description: 'Go to online communication DMs', category: 'Navigation', icon: MessageSquare, href: '/employee?tab=chat' },
    { name: 'Integrations', description: 'Go to email and workspace integrations', category: 'Navigation', icon: Plug, href: '/integrations' },
    { name: 'Audit Logs', description: 'Go to administrator audit events', category: 'Navigation', icon: Shield, href: '/admin/audit' },
    { name: 'Admin Control Center', description: 'Go to administrator console', category: 'Navigation', icon: Settings, href: '/admin' },
  ];

  const actionItems: PaletteItem[] = [
    { 
      name: 'Toggle Theme', 
      description: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`, 
      category: 'Actions', 
      icon: theme === 'dark' ? Sun : Moon,
      action: () => {
        toggleTheme();
        showToast(`Switched to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`, 'success');
        setIsOpen(false);
      }
    },
    { 
      name: 'Create Task', 
      description: 'Open new task modal', 
      category: 'Actions', 
      icon: Plus,
      href: '/tasks?openModal=true'
    },
    { 
      name: 'Create Project', 
      description: 'Open new project modal', 
      category: 'Actions', 
      icon: Folder,
      href: '/tasks?openProjectModal=true'
    },
    { 
      name: 'Create Lead', 
      description: 'Open new lead modal', 
      category: 'Actions', 
      icon: Target,
      href: '/crm?openModal=true'
    },
    { 
      name: 'Create Invoice', 
      description: 'Open new invoice modal', 
      category: 'Actions', 
      icon: FileText,
      href: '/invoices?openModal=true'
    },
    {
      name: 'Clear History',
      description: 'Reset recently visited pages history',
      category: 'Actions',
      icon: Trash2,
      action: () => {
        clearRecents();
        showToast('Recently visited history cleared', 'info');
        setIsOpen(false);
      }
    }
  ];

  const recentItems: PaletteItem[] = recents.map(r => ({
    name: r.name,
    description: `Jump back to ${r.name}`,
    category: 'Recent',
    icon: Clock,
    href: r.href
  }));

  // Combine items and filter based on search
  const allItems = [...navItems, ...actionItems, ...recentItems];
  const filtered = allItems.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.description.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (item: PaletteItem) => {
    if (item.action) {
      item.action();
    } else if (item.href) {
      router.push(item.href);
      setIsOpen(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex]);

  // Adjust scroll if selected changes
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <>
      {/* Global Shortcut Help Trigger inside layouts */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              ref={paletteRef}
              initial={{ scale: 0.95, y: -20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: -20 }}
              className="bg-surface border border-border w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[480px]"
            >
              {/* Search Bar */}
              <div className="p-4 border-b border-border flex items-center gap-3 bg-base/50">
                <Search size={18} className="text-secondary" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
                  placeholder="Type a command or search workspace..."
                  className="bg-transparent border-0 outline-none text-primary text-sm font-medium flex-1 placeholder-secondary focus:ring-0 focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-1 items-center">
                  <span className="text-[10px] font-bold text-tertiary bg-base px-2 py-1 rounded border border-border flex items-center gap-1 shadow-sm uppercase font-sans">
                    ESC
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div ref={listRef} className="overflow-y-auto p-2 custom-scrollbar flex-1 divide-y divide-border/20">
                {filtered.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <div
                      key={`${item.name}-${idx}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3.5 p-3 rounded-xl cursor-pointer transition-all ${
                        isSelected ? 'bg-accent text-white shadow-md shadow-accent/15' : 'hover:bg-base text-primary'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-base border border-border text-secondary group-hover:text-primary'
                      }`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-primary'}`}>
                          {item.name}
                        </div>
                        <div className={`text-[10px] truncate font-medium ${isSelected ? 'text-white/80' : 'text-secondary'}`}>
                          {item.description}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        isSelected ? 'bg-white/30 text-white' : 'bg-base text-secondary border border-border'
                      }`}>
                        {item.category}
                      </span>
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="p-8 text-center text-secondary text-xs font-semibold">
                    No results found for &quot;{search}&quot;
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-base/50 border-t border-border flex items-center justify-between text-[9px] font-bold text-secondary uppercase tracking-wider">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1"><Command size={10} /> + K to toggle</span>
                  <span>↑↓ Navigate</span>
                  <span>↵ Select</span>
                </div>
                <div>
                  OPS PLATFORM
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
