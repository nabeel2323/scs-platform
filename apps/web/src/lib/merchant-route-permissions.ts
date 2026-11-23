export interface MerchantNavigationItem {
  href: string;
  label: string;
  exact?: boolean;
  permission: string | null;
}

export const MERCHANT_OPEN_PATHS = [
  '/merchant/register',
  '/merchant/onboard',
  '/merchant/success',
] as const;

export const MERCHANT_NAV_ITEMS: readonly MerchantNavigationItem[] = [
  { href: '/merchant', label: 'Dashboard', exact: true, permission: 'merchant:stores:read' },
  { href: '/merchant/catalog', label: 'Catalog', permission: 'catalog:products:read' },
  { href: '/merchant/orders', label: 'Orders', permission: 'merchant:orders:read' },
  { href: '/merchant/settlements', label: 'Settlements', permission: 'merchant:orders:read' },
  { href: '/merchant/deliveries', label: 'Deliveries', permission: 'fulfillment:shipments:read' },
  { href: '/merchant/inventory', label: 'Inventory', permission: 'merchant:inventory:read' },
  { href: '/merchant/pricing', label: 'Pricing', permission: 'merchant:pricing:read' },
  // Merchant offer reads are authenticated, role- and store-membership-scoped;
  // the write permission is checked by the offer mutation controls/API.
  { href: '/merchant/offers', label: 'Offers', permission: 'merchant:stores:read' },
  { href: '/merchant/customers', label: 'Customers', permission: 'merchant:orders:read' },
  { href: '/merchant/store', label: 'Store', permission: 'merchant:stores:read' },
  { href: '/merchant/warehouses', label: 'Warehouses', permission: 'merchant:stores:read' },
  { href: '/merchant/import', label: 'Import', permission: 'merchant:products:write' },
  { href: '/merchant/promotions', label: 'Promotions', permission: 'merchant:promotions:write' },
  { href: '/merchant/returns', label: 'Returns', permission: 'merchant:orders:read' },
  { href: '/merchant/organization', label: 'Organization', permission: 'merchant:stores:read' },
];

const MERCHANT_ROUTE_RULES: ReadonlyArray<readonly [string, string]> = [
  ['/merchant/catalog', 'catalog:products:read'],
  ['/merchant/orders', 'merchant:orders:read'],
  ['/merchant/settlements', 'merchant:orders:read'],
  ['/merchant/deliveries', 'fulfillment:shipments:read'],
  ['/merchant/inventory', 'merchant:inventory:read'],
  ['/merchant/pricing', 'merchant:pricing:read'],
  ['/merchant/offers/new', 'catalog:offers:write'],
  ['/merchant/offers', 'merchant:stores:read'],
  ['/merchant/customers', 'merchant:orders:read'],
  ['/merchant/store', 'merchant:stores:read'],
  ['/merchant/warehouses', 'merchant:stores:read'],
  ['/merchant/import', 'merchant:products:write'],
  ['/merchant/product-studio', 'merchant:products:write'],
  ['/merchant/promotions', 'merchant:promotions:write'],
  ['/merchant/returns', 'merchant:orders:read'],
  ['/merchant/organization', 'merchant:stores:read'],
  // CatalogRequestsController currently uses catalog:offers:write for the
  // merchant request list/create endpoints (not catalog:requests:manage).
  ['/merchant/requests', 'catalog:offers:write'],
];

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Resolve the permission required to view a merchant route. Null means the
 * authenticated merchant role is sufficient or the route is onboarding. */
export function merchantRoutePermission(pathname: string): string | null {
  if (MERCHANT_OPEN_PATHS.some((path) => matchesRoute(pathname, path))) return null;
  if (pathname === '/merchant') return 'merchant:stores:read';
  return MERCHANT_ROUTE_RULES.find(([prefix]) => matchesRoute(pathname, prefix))?.[1] ?? null;
}

export function canAccessMerchantRoute(pathname: string, permissions: readonly string[]): boolean {
  const required = merchantRoutePermission(pathname);
  return required === null || permissions.includes(required);
}

export function filterMerchantNavigation(permissions: readonly string[]): MerchantNavigationItem[] {
  return MERCHANT_NAV_ITEMS.filter(
    (item) => item.permission === null || permissions.includes(item.permission),
  );
}
