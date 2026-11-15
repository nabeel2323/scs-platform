'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

/**
 * AuthGuard — redirects to /auth/login if not authenticated.
 * Public routes are limited to the authentication flow and first-run bootstrap.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Re-check on every route transition so protected content is never briefly
    // rendered using the previous route's successful check.
    setChecked(false);

    // These routes must be reachable before the first administrator exists.
    // In particular, /bootstrap must not redirect to login: login itself sends
    // uninitialized deployments back to /bootstrap.
    if (pathname.startsWith('/auth') || pathname === '/bootstrap' || pathname.startsWith('/bootstrap/')) {
      setChecked(true);
      return;
    }

    if (!isAuthenticated()) {
      router.replace('/auth/login');
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
