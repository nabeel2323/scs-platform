import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminSidebar } from '../components/AdminSidebar';
import { AuthGuard } from '../components/AuthGuard';
import { ToastProvider } from '@scs/ui-kit';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SCS Admin',
  description: 'Platform operations & merchant management',
  icons: { icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏢</text></svg>' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body style={{ margin: 0, background: '#f2f5f6' }}>
        <a href="#main-content" style={{
          position: 'absolute', left: -9999, top: 'auto',
          width: 1, height: 1, overflow: 'hidden', zIndex: 10001,
        }}>Skip to main content</a>
        <ToastProvider>
          <AuthGuard>
            <AdminSidebar />
            <div id="main-content" className="admin-content">
              {children}
            </div>
          </AuthGuard>
        </ToastProvider>
      </body>
    </html>
  );
}
