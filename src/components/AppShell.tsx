'use client';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ManagerSidebar from './ManagerSidebar';
import EmployeeSidebar from './EmployeeSidebar';
import MRSidebar from './MRSidebar';
import Topbar from './Topbar';
import { useTheme } from '@/context/ThemeContext';

// Pages that should NOT have the dashboard shell
const PUBLIC_PATHS = ['/landing', '/login', '/', '/reset-password'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, mounted } = useTheme();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  const getSidebar = () => {
    if (pathname.startsWith('/manager')) return <ManagerSidebar />;
    if (pathname.startsWith('/employee')) return <EmployeeSidebar />;
    if (pathname.startsWith('/mr') || pathname.startsWith('/marketing')) return <MRSidebar />;
    return <Sidebar />; // Default to Admin Sidebar
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
      <Suspense fallback={<div className="w-64 bg-base border-r border-border h-screen" />}>
        {getSidebar()}
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto relative bg-base">
          {children}
        </main>
      </div>
    </div>
  );
}
