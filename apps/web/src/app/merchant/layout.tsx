'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hasMerchantAccess, isAuthenticated } from '../../lib/auth';

/**
 * Merchant route-group layout — enforces client-side role gating (GAP-4).
 *
 * Buyers and unauthenticated users are redirected to /search when they
 * navigate to merchant-only pages. The registration and onboarding flows
 * (/merchant/register, /merchant/onboard) remain open so any authenticated
 * user can become a merchant.
 */

/** Paths that any authenticated user may access without merchant role. */
const OPEN_PATHS = ['/merchant/register', '/merchant/onboard', '/merchant/success'];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Allow open paths (register, onboard, success) without role check
    const isOpen = OPEN_PATHS.some((p) => pathname.startsWith(p));
    if (isOpen) {
      setChecked(true);
      return;
    }

    // Require authentication
    if (!isAuthenticated()) {
      router.replace('/auth/login');
      return;
    }

    // Require merchant role
    if (!hasMerchantAccess()) {
      router.replace('/search');
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  // Show nothing while checking to avoid a flash of forbidden content
  if (!checked) return null;

  return <>{children}</>;
}
