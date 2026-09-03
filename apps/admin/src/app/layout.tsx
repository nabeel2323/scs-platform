import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SCS Admin',
  description: 'Platform operations & merchant management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
