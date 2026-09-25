'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { hasMerchantAccess, isAuthenticated } from '../../lib/auth';
import { colors, typeScale, transitions } from '@scs/ui-kit';

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

/** Sub-navigation items for the merchant segment. */
const MERCHANT_NAV = [
  { href: '/merchant', label: 'Dashboard', exact: true },
  { href: '/merchant/catalog', label: 'Catalog' },
  { href: '/merchant/orders', label: 'Orders' },
  { href: '/merchant/inventory', label: 'Inventory' },
  { href: '/merchant/pricing', label: 'Pricing' },
  { href: '/merchant/offers', label: 'Offers' },
  { href: '/merchant/customers', label: 'Customers' },
  { href: '/merchant/store', label: 'Store' },
  { href: '/merchant/warehouses', label: 'Warehouses' },
  { href: '/merchant/import', label: 'Import' },
  { href: '/merchant/promotions', label: 'Promotions' },
  { href: '/merchant/organization', label: 'Organization' },
];

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

  // Hide sub-nav on open paths (register, onboard, success)
  const isOpenPath = OPEN_PATHS.some((p) => pathname.startsWith(p));

  return (
    <>
      {!isOpenPath && (
        <nav style={{
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          padding: '0 24px',
          overflowX: 'auto',
          display: 'flex',
          gap: 0,
        }}>
          {MERCHANT_NAV.map(item => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
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
    </>
  );
}
