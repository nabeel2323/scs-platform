'use client';

import { Fragment, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, isMerchantRole } from '../../lib/auth';
import { useAuth } from '../../components/AuthProvider';
import {
  canAccessMerchantRoute,
  filterMerchantNavigation,
  MERCHANT_OPEN_PATHS,
} from '../../lib/merchant-route-permissions';
import { colors, typeScale, transitions } from '@scs/ui-kit';

/**
 * Merchant route-group layout — enforces client-side role gating (GAP-4).
 *
 * Buyers and unauthenticated users are redirected to /search when they
 * navigate to merchant-only pages. The registration and onboarding flows
 * (/merchant/register, /merchant/onboard) remain open so any authenticated
 * user can become a merchant.
 */

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checked, setChecked] = useState(false);
  const visibleNav = filterMerchantNavigation(user?.perms ?? []);
  // A merchant page owns organization-scoped local state and in-flight work.
  // Remount the shell subtree whenever the active organization or effective
  // permission projection changes so stale data/forms cannot survive a switch.
  const accessScopeKey = `${user?.activeOrgId ?? 'none'}:${user?.role ?? 'none'}:${(user?.perms ?? []).slice().sort().join(',')}`;

  useEffect(() => {
    setChecked(false);
    if (authLoading) return;

    // Every merchant-group route, including registration/onboarding, requires
    // an authenticated session. Open paths bypass only the merchant-role gate.
    if (!isAuthenticated()) {
      router.replace('/auth/login');
      return;
    }

    const isOpen = MERCHANT_OPEN_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (isOpen) {
      setChecked(true);
      return;
    }

    if (!isMerchantRole(user?.role)) {
      router.replace('/search');
      return;
    }

    if (!canAccessMerchantRoute(pathname, user?.perms ?? [])) {
      const fallback = user?.perms?.includes('merchant:stores:read') ? '/merchant' : '/search';
      router.replace(fallback);
      return;
    }

    setChecked(true);
  }, [pathname, router, authLoading, user]);

  // Show nothing while checking to avoid a flash of forbidden content
  if (!checked) return null;

  // Hide sub-nav on open paths (register, onboard, success)
  const isOpenPath = MERCHANT_OPEN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  return (
    <Fragment key={accessScopeKey}>
      {!isOpenPath && (
        <nav
          style={{
            background: colors.surface,
            borderBottom: `1px solid ${colors.border}`,
            padding: '0 24px',
            overflowX: 'auto',
            display: 'flex',
            gap: 0,
          }}
        >
          {visibleNav.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '10px 14px',
                  ...typeScale.body,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? colors.brand[700] : colors.muted,
                  textDecoration: 'none',
                  borderBottom: `2px solid ${isActive ? colors.brand[700] : 'transparent'}`,
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                  transition: `color ${transitions.fast}, border-color ${transitions.fast}`,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </Fragment>
  );
}
