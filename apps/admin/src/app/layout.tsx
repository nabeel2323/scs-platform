import type { Metadata } from 'next';
import { AdminSidebar } from '../components/AdminSidebar';
import { AuthGuard } from '../components/AuthGuard';

export const metadata: Metadata = {
  title: 'SCS Admin',
  description: 'Platform operations & merchant management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', background: '#f0f4f7' }}>
        <AuthGuard>
          <AdminSidebar />
          <div style={{ marginLeft: 220, minHeight: '100vh' }}>
            {children}
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}
