import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminSidebar } from '../components/AdminSidebar';
import { AuthGuard } from '../components/AuthGuard';
import { ToastProvider } from '@scs/ui-kit';

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
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
          body { margin: 0; font-family: var(--font-inter), 'Segoe UI', system-ui, -apple-system, sans-serif; }
          :focus-visible { outline: 3px solid rgba(30,97,120,0.35); outline-offset: 2px; }
          @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
          .admin-content { margin-left: var(--admin-sidebar-width, 220px); min-height: 100vh; transition: margin-left 0.2s ease; }
          @media (max-width: 1079px) { .admin-content { margin-left: 0; } }
        `}</style>
      </head>
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
