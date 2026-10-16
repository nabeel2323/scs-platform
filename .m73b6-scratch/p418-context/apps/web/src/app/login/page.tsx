'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /login route. The canonical dual-mode (Email/Password + Phone OTP)
 * login lives at /auth/login — every nav link and auth redirect points there.
 * This thin redirect keeps old bookmarks working and prevents two divergent
 * login pages from drifting apart again.
 */
export default function LoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/auth/login');
  }, [router]);
  return null;
}
