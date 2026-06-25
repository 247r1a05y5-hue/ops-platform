'use client';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ManagerSidebar from './ManagerSidebar';
import EmployeeSidebar from './EmployeeSidebar';
import MRSidebar from './MRSidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import { useTheme } from '@/context/ThemeContext';
import { useUI } from '@/context/UIContext';

import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';

// Pages that should NOT have the dashboard shell
const PUBLIC_PATHS = ['/landing', '/login', '/', '/reset-password'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, mounted } = useTheme();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed } = useUI();
  const { user } = useAuth();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Maintain live presence for any authenticated user on private pages
  useSocket(!!user && !isPublic);

  const getSidebar = () => {
    if (!user) {
      if (pathname.startsWith('/manager')) return <ManagerSidebar />;
      if (pathname.startsWith('/employee')) return <EmployeeSidebar />;
      if (pathname.startsWith('/mr') || pathname.startsWith('/marketing')) return <MRSidebar />;
      return <Sidebar />;
    }
    const role = user.role;
    if (role === 'Admin') return <Sidebar />;
    if (role === 'Manager') return <ManagerSidebar />;
    if (role === 'Staff' || role === 'Employee') return <EmployeeSidebar />;
    if (role === 'User' || role === 'MR') return <MRSidebar />;
    return <Sidebar />;
  };

  if (isPublic) {
    // Public pages: no sidebar, no topbar
    return <>{children}</>;
  }

  const activeTheme = mounted ? theme : 'dark';

  // Dashboard pages: full shell with theme from context
  return (
    <div
      data-theme={activeTheme}
      className={`flex h-screen overflow-hidden selection:bg-accent/30 text-primary bg-base font-sans leading-relaxed ${activeTheme === 'dark' ? 'dark' : ''}`}
    >
      {/* Mobile Sidebar Overlay Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden cursor-pointer"
        />
      )}

      {/* Responsive Sidebar Wrapper */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0 transition-all duration-300 ease-in-out shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:block'
        } ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        }`}
      >
        <Suspense fallback={<div className="w-64 bg-base border-r border-border h-screen" />}>
          {getSidebar()}
        </Suspense>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar />
        <CommandPalette />
        <main className="flex-1 overflow-x-hidden overflow-y-auto relative bg-base">
          {children}
        </main>
      </div>
    </div>
  );
}
