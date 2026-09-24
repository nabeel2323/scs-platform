/**
 * Seed script — creates default roles, permissions, and a SUPER_ADMIN user.
 *
 * Uses `docker exec psql` to avoid Docker Desktop Windows networking issues.
 *
 * Usage: pnpm --filter @scs/api db:seed
 * Requires: docker compose -f infra/docker-compose.dev.yml up -d && pnpm db:migrate
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const CONTAINER = 'scs-postgres';
const DB_USER = 'scs';
const DB_NAME = 'scs_platform';

function psql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query],
    { encoding: 'utf-8' },
  ).trim();
}

const PERMISSIONS = [
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
  // Inventory & Pricing (RBAC audit GAP-1, GAP-2)
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
  // Catalog governance (PHASE 2 — attributes & product types)
  'catalog:attributes:manage',
  'catalog:product-types:manage',
  // Catalog governance (PHASE 4 — merchant offers)
  'catalog:offers:write',
  'catalog:offers:govern',
  // Catalog governance (P1 remediation — merchant requests)
  'catalog:requests:manage',
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
  // Identity — org management (RBAC audit GAP-8)
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
];

const ROLES: { key: string; name: string; permissions: string[] }[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    permissions: PERMISSIONS, // all permissions
  },
  {
    key: 'ADMIN',
    name: 'Platform Admin',
    permissions: [
      'identity:users:read',
      'identity:roles:read',
      'merchant:stores:read',
      'merchant:stores:write',
      'merchant:stores:verify',
      'merchant:stores:reject',
      'merchant:verification:review',
      'catalog:products:read',
      'orders:read',
      'orders:cancel',
      'orders:refund',
      'payments:read',
      'payments:refund',
      'analytics:read',
      'analytics:track',
      'audit:read',
      'support:tickets:read',
      'support:tickets:write',
      'support:tickets:escalate',
      'support:disputes:resolve',
      'support:disputes:write',
      // RBAC audit: inventory + pricing oversight
      'merchant:inventory:read',
      'merchant:inventory:write',
      'merchant:pricing:read',
      'merchant:pricing:write',
      'identity:organizations:write',
      // Catalog governance (attributes & product types)
      'catalog:attributes:manage',
      'catalog:product-types:manage',
      // Catalog governance (merchant offers)
      'catalog:offers:write',
      'catalog:offers:govern',
      // Catalog governance (merchant requests)
      'catalog:requests:manage',
      // Admin platform operations
      'admin:orders:read',
      'admin:merchants:read',
      'admin:kpis:read',
      'admin:audit:read',
      'admin:users:read',
      'admin:users:write',
    ],
  },
  {
    key: 'MODERATOR',
    name: 'Moderator',
    permissions: [
      'catalog:products:read',
      'catalog:products:write',
      'catalog:products:delete',
      'catalog:categories:read',
      'catalog:categories:write',
      // Moderators curate the platform catalog taxonomy (attributes & types).
      'catalog:attributes:manage',
      'catalog:product-types:manage',
      // Moderators curate merchant offers on canonical products.
      'catalog:offers:write',
      'catalog:offers:govern',
      // Moderators manage merchant catalog requests.
      'catalog:requests:manage',
      // Moderators curate the platform catalog, so they retain product writes
      // now that product endpoints require merchant:products:write (API-B6).
      'merchant:products:write',
      // GAP-4: allow moderators to view the Admin Products/Merchants pages
      // (both gated on admin:merchants:read). View-only; write actions still
      // require keys the moderator does not hold.
      'admin:merchants:read',
      'support:tickets:read',
      'support:tickets:write',
      'support:tickets:escalate',
      'orders:read',
      'merchant:verification:review',
      // RBAC audit: moderator read-oversight for inventory/pricing + dispute responses
      'merchant:inventory:read',
      'merchant:pricing:read',
      'support:disputes:write',
      'analytics:track',
    ],
  },
  {
    key: 'MERCHANT_OWNER',
    name: 'Merchant Owner',
    permissions: [
      'catalog:products:read',
      'catalog:products:write',
      'catalog:products:delete',
      'catalog:categories:read',
      'catalog:categories:write',
      'orders:read',
      'orders:write',
      'merchant:stores:read',
      'merchant:stores:write',
      // Merchant-scoped write permissions gating the merchant/catalog/order/
      // promotion write endpoints (API-B6). Owners manage the whole store.
      'merchant:products:write',
      'merchant:orders:write',
      'merchant:promotions:write',
      // RBAC audit: inventory + pricing management
      'merchant:inventory:read',
      'merchant:inventory:write',
      'merchant:pricing:read',
      'merchant:pricing:write',
      'identity:organizations:write',
      'analytics:track',
    ],
  },
  {
    key: 'MERCHANT_STAFF',
    name: 'Merchant Staff',
    permissions: [
      'catalog:products:read',
      'catalog:products:write',
      'catalog:categories:read',
      'catalog:categories:write',
      'orders:read',
      'orders:write',
      // Staff manage day-to-day catalog, orders and promotions, but not store
      // settings/creation (merchant:stores:write is owner-only).
      'merchant:products:write',
      'merchant:orders:write',
      'merchant:promotions:write',
      // RBAC audit: inventory + pricing management
      'merchant:inventory:read',
      'merchant:inventory:write',
      'merchant:pricing:read',
      'merchant:pricing:write',
      'analytics:track',
    ],
  },
  {
    key: 'BUYER',
    name: 'Buyer',
    permissions: ['catalog:products:read', 'orders:read', 'orders:write', 'orders:cancel', 'merchant:stores:read', 'analytics:track'],
  },
];

function sqlValue(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Create permissions (idempotent via ON CONFLICT DO NOTHING)
  console.log(`  Creating ${PERMISSIONS.length} permissions...`);
  const permValues = PERMISSIONS.map(
    (p) => `(${sqlValue(crypto.randomUUID())}, ${sqlValue(p)})`,
  ).join(',\n    ');
  psql(`INSERT INTO permissions (id, key) VALUES ${permValues} ON CONFLICT (key) DO NOTHING;`);

  // 2. Create roles and assign permissions
  for (const role of ROLES) {
    console.log(`  Creating role: ${role.key}`);
    const roleId = crypto.randomUUID();

    // Insert role (idempotent)
    psql(
      `INSERT INTO roles (id, key, name) VALUES (${sqlValue(roleId)}, ${sqlValue(role.key)}, ${sqlValue(role.name)}) ON CONFLICT (key) DO NOTHING;`,
    );

    // Get the actual role ID (might have existed already)
    const actualRoleId = psql(`SELECT id FROM roles WHERE key = ${sqlValue(role.key)};`);

    // Get permission IDs for this role's permissions
    const permKeys = role.permissions.map((p) => sqlValue(p)).join(', ');
    const permIdsRaw = psql(`SELECT id FROM permissions WHERE key IN (${permKeys});`);
    const permIds = permIdsRaw.split('\n').filter(Boolean);

    // Insert role-permission mappings
    if (permIds.length > 0) {
      const rpValues = permIds
        .map((pid) => `(${sqlValue(actualRoleId)}, ${sqlValue(pid)})`)
        .join(',\n      ');
      psql(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${rpValues} ON CONFLICT DO NOTHING;`,
      );
    }
  }

  console.log('\n✅ Seed complete!');
  console.log(`   ${PERMISSIONS.length} permissions, ${ROLES.length} roles created\n`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
