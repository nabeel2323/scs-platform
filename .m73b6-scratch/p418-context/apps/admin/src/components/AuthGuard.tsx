'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

/**
 * AuthGuard — redirects to /auth/login if not authenticated.
 * Exempts the login page itself.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Login page is always accessible
    if (pathname.startsWith('/auth')) {
      setChecked(true);
      return;
    }

    if (!isAuthenticated()) {
      router.push('/auth/login');
    } else {
      setChecked(true);
    }
  }, [pathname, router]);

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#5b6b74', fontSize: 14 }}>
        Checking authentication...
      </div>
    );
  }

  return <>{children}</>;
}
