import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Commerce Platform',
  description: 'B2B-first marketplace — retailer & merchant portal',
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
