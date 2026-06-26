import './globals.css';
import { Inter } from 'next/font/google';
import AppShell from '@/components/AppShell';
import { UIProvider } from '@/context/UIContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'OPS Platform — Enterprise Operations Management',
  description: 'Manage tasks, CRM pipelines, invoicing, and team operations in one unified workspace.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'OPS Platform — Enterprise Operations Management',
    description: 'Manage tasks, CRM pipelines, invoicing, and team operations in one unified workspace.',
    type: 'website',
    url: 'https://ops-platform.app',
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased font-sans`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <UIProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </UIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
