/**
 * Canonical RBAC seed data — permissions and roles.
 *
 * This file is the single source of truth imported by both:
 * - The dev auto-seed in DatabaseService (runs on every debug start)
 * - The CLI seed script at infra/drizzle/seed-pg.ts
 *
 * Keep this in sync when adding new permissions or roles.
 */

// ─── Platform permissions ────────────────────────────────────────────────────

export const PERMISSIONS: string[] = [
  // Identity
  'identity:users:read',
  'identity:users:write',
  'identity:users:delete',
  'identity:roles:read',
  'identity:roles:write',
  // Merchant
  'merchant:stores:read',
  'merchant:stores:write',
  'merchant:stores:verify',
  'merchant:stores:reject',
  'merchant:verification:review',
  'merchant:products:write',
  'merchant:orders:write',
  'merchant:promotions:write',
  // Inventory & Pricing
  'merchant:inventory:read',
  'merchant:inventory:write',
  'merchant:pricing:read',
  'merchant:pricing:write',
  // Catalog
  'catalog:products:read',
  'catalog:products:write',
  'catalog:products:delete',
  'catalog:categories:read',
  'catalog:categories:write',
  'catalog:brands:manage',
  // Catalog governance — attributes & product types
  'catalog:attributes:manage',
  'catalog:product-types:manage',
  // Catalog governance — merchant offers
  'catalog:offers:write',
  'catalog:offers:govern',
  // Catalog governance — merchant catalog requests
  'catalog:requests:manage',
  // Catalog import center
  'catalog:imports:manage',
  // Orders
  'orders:read',
  'orders:write',
  'orders:cancel',
  'orders:refund',
  // Payments
  'payments:read',
  'payments:refund',
  // Analytics
  'analytics:read',
  'analytics:track',
  // Audit
  'audit:read',
  // Support
  'support:tickets:read',
  'support:tickets:write',
  'support:tickets:escalate',
  'support:disputes:resolve',
  'support:disputes:write',
  // Identity — org management
  'identity:organizations:write',
  // Ads
  'ads:campaigns:read',
  'ads:campaigns:write',
  'ads:campaigns:approve',
  // Admin (platform operations)
  'admin:orders:read',
  'admin:merchants:read',
  'admin:kpis:read',
  'admin:audit:read',
  'admin:users:read',
  'admin:users:write',
  // Fulfillment / Shipments
  'fulfillment:shipments:read',
  'fulfillment:shipments:assign',
  'fulfillment:shipments:pickup',
  'fulfillment:shipments:deliver',
  'fulfillment:shipments:write',
  // Inventory return-to-stock
  'fulfillment:shipments:return',
  // Shipping & Delivery
  'merchant:shipping:read',
  'merchant:shipping:write',
  'fulfillment:labels:read',
  'fulfillment:labels:write',
  'fulfillment:proof:read',
  'fulfillment:proof:write',
  'fulfillment:drivers:read',
  'fulfillment:drivers:write',
  // Carrier integration
  'admin:carrier:read',
  'admin:carrier:write',
  // Carrier recovery
  'admin:shipping:recovery',
  // Payments (admin)
  'admin:payments:verify',
  'admin:payments:read',
  'admin:refunds:approve',
  'admin:settlements:write',
  'admin:settlements:read',
  // Returns oversight
  'admin:returns:read',
  'admin:returns:write',
  // Financial correctness
  'admin:commission:read',
  'admin:commission:write',
  'admin:adjustments:approve',
  'admin:adjustments:read',
  'admin:adjustments:write',
  'admin:reconciliation:read',
  'admin:reconciliation:write',
  'finance:approvals:read',
  'finance:approvals:write',
  'merchant:orders:read',
];

// ─── Platform roles ──────────────────────────────────────────────────────────

export interface RoleDef {
  key: string;
  name: string;
  permissions: string[];
}

export const ROLES: RoleDef[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    permissions: PERMISSIONS,
  },
  {
    key: 'ADMIN',
    name: 'Platform Admin',
    permissions: [
      'identity:users:read', 'identity:roles:read',
      'merchant:stores:read', 'merchant:stores:write', 'merchant:stores:verify', 'merchant:stores:reject',
      'merchant:verification:review',
      'catalog:products:read',
      'orders:read', 'orders:cancel', 'orders:refund',
      'payments:read', 'payments:refund',
      'analytics:read', 'analytics:track',
      'audit:read',
      'support:tickets:read', 'support:tickets:write', 'support:tickets:escalate',
      'support:disputes:resolve', 'support:disputes:write',
      'merchant:inventory:read', 'merchant:inventory:write',
      'merchant:pricing:read', 'merchant:pricing:write',
      'identity:organizations:write',
      'catalog:attributes:manage', 'catalog:product-types:manage',
      'catalog:offers:write', 'catalog:offers:govern',
      'catalog:requests:manage', 'catalog:imports:manage',
      'admin:orders:read', 'admin:merchants:read', 'admin:kpis:read', 'admin:audit:read',
      'admin:users:read', 'admin:users:write',
      'merchant:shipping:read',
      'fulfillment:labels:read', 'fulfillment:proof:read',
      'fulfillment:drivers:read',
      'admin:carrier:read',
      'fulfillment:shipments:write', 'fulfillment:shipments:read',
      'fulfillment:shipments:return',
      'admin:shipping:recovery',
      'admin:payments:verify', 'admin:payments:read',
      'admin:refunds:approve', 'admin:settlements:write', 'admin:settlements:read',
      'admin:returns:read', 'admin:returns:write',
      'admin:commission:read', 'admin:commission:write',
      'admin:adjustments:approve', 'admin:adjustments:read', 'admin:adjustments:write',
      'admin:reconciliation:read', 'admin:reconciliation:write',
    ],
  },
  {
    key: 'MODERATOR',
    name: 'Moderator',
    permissions: [
      'catalog:products:read', 'catalog:products:write', 'catalog:products:delete',
      'catalog:categories:read', 'catalog:categories:write',
      'catalog:attributes:manage', 'catalog:product-types:manage',
      'catalog:offers:write', 'catalog:offers:govern',
      'catalog:requests:manage',
      'merchant:products:write',
      'admin:merchants:read',
      'support:tickets:read', 'support:tickets:write', 'support:tickets:escalate',
      'orders:read',
      'merchant:verification:review',
      'merchant:inventory:read', 'merchant:inventory:write',
      'merchant:pricing:read',
      'support:disputes:write',
      'analytics:track',
      'fulfillment:shipments:read', 'fulfillment:shipments:return',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Finance Approver',
    permissions: [
      'finance:approvals:read', 'finance:approvals:write',
      'admin:adjustments:approve', 'admin:adjustments:read',
      'admin:commission:read', 'admin:settlements:read',
      'admin:refunds:approve', 'admin:reconciliation:read', 'admin:reconciliation:write',
      'admin:payments:read', 'admin:audit:read',
      'orders:read', 'payments:read',
    ],
  },
  {
    key: 'MERCHANT_OWNER',
    name: 'Merchant Owner',
    permissions: [
      'catalog:products:read', 'catalog:products:write', 'catalog:products:delete',
      'catalog:categories:read', 'catalog:categories:write',
      'orders:read', 'orders:write',
      'merchant:stores:read', 'merchant:stores:write',
      'merchant:products:write', 'merchant:orders:write', 'merchant:promotions:write',
      'catalog:offers:write',
      'merchant:inventory:read', 'merchant:inventory:write',
      'merchant:pricing:read', 'merchant:pricing:write',
      'identity:organizations:write',
      'fulfillment:shipments:read', 'fulfillment:shipments:assign',
      'merchant:shipping:read', 'merchant:shipping:write',
      'fulfillment:labels:read', 'fulfillment:labels:write',
      'fulfillment:proof:read', 'fulfillment:proof:write',
      'fulfillment:drivers:read', 'fulfillment:drivers:write',
      'fulfillment:shipments:write', 'fulfillment:shipments:return',
      'admin:carrier:read', 'analytics:track',
      'merchant:orders:read', 'admin:settlements:read',
    ],
  },
  {
    key: 'MERCHANT_STAFF',
    name: 'Merchant Staff',
    permissions: [
      'catalog:products:read', 'catalog:products:write',
      'catalog:categories:read', 'catalog:categories:write',
      'orders:read', 'orders:write',
      'merchant:products:write', 'merchant:orders:write', 'merchant:promotions:write',
      'catalog:offers:write',
      'merchant:inventory:read', 'merchant:inventory:write',
      'merchant:pricing:read', 'merchant:pricing:write',
      'fulfillment:shipments:read', 'fulfillment:shipments:assign',
      'merchant:shipping:read', 'merchant:shipping:write',
      'fulfillment:labels:read', 'fulfillment:labels:write',
      'fulfillment:proof:read', 'fulfillment:proof:write',
      'analytics:track',
      'fulfillment:shipments:write', 'fulfillment:shipments:return',
      'admin:carrier:read',
      'merchant:orders:read', 'admin:settlements:read',
    ],
  },
  {
    key: 'BUYER',
    name: 'Buyer',
    permissions: [
      'catalog:products:read', 'orders:read', 'orders:write', 'orders:cancel',
      'merchant:stores:read', 'analytics:track',
    ],
  },
  {
    key: 'DRIVER',
    name: 'Driver',
    permissions: [
      'orders:read',
      'fulfillment:shipments:read', 'fulfillment:shipments:pickup', 'fulfillment:shipments:deliver',
      'fulfillment:proof:read', 'fulfillment:proof:write',
    ],
  },
];
