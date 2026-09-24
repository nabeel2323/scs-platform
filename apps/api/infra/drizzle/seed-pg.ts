/**
 * Platform RBAC seed — deployment-safe, idempotent.
 *
 * Ensures the system-level RBAC configuration (permissions, roles, and their
 * mappings) exists in the database.  Safe to run on every deployment: existing
 * rows are preserved, no duplicates are created, and no business/staging data
 * is touched.
 *
 * Connection strategy mirrors migrate-pg.ts:
 *   DATABASE_URL          — required
 *   PGSSLROOTCERT         — optional CA bundle for SSL (Supabase staging)
 *
 * Usage:
 *   pnpm --filter @scs/api db:seed
 *
 * Requires: DATABASE_URL
 */

import * as fs from 'node:fs';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

// ─── Platform permissions ────────────────────────────────────────────────────
// The canonical list.  Controller @RequirePermission() decorators must match
// these keys exactly; mismatches cause 403 even for SUPER_ADMIN.

const PERMISSIONS: string[] = [
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
  // Catalog governance — attributes & product types (Phase 2)
  'catalog:attributes:manage',
  'catalog:product-types:manage',
  // Catalog governance — merchant offers (Phase 4)
  'catalog:offers:write',
  'catalog:offers:govern',
  // Catalog governance — merchant catalog requests (P1 remediation)
  'catalog:requests:manage',
  // Catalog import center (admin Excel imports)
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

// ─── Platform roles ──────────────────────────────────────────────────────────

interface RoleDef {
  key: string;
  name: string;
  permissions: string[];
}

const ROLES: RoleDef[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    permissions: PERMISSIONS, // all 52
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
      // Catalog import center
      'catalog:imports:manage',
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
      // (both gated on admin:merchants:read).
      'admin:merchants:read',
      'support:tickets:read',
      'support:tickets:write',
      'support:tickets:escalate',
      'orders:read',
      'merchant:verification:review',
      // RBAC audit: moderator read-oversight for inventory/pricing + disputes
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
      // Merchant-scoped write permissions (API-B6).
      'merchant:products:write',
      'merchant:orders:write',
      'merchant:promotions:write',
      // Catalog requests — merchants submit new categories/brands/attributes.
      'catalog:offers:write',
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
      // Catalog requests — staff submit new categories/brands/attributes.
      'catalog:offers:write',
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
    permissions: [
      'catalog:products:read',
      'orders:read',
      'orders:write',
      'orders:cancel',
      'merchant:stores:read',
      'analytics:track',
    ],
  },
];

// ─── Core seed logic (exported for testing) ──────────────────────────────────

export interface SeedResult {
  permissionsTotal: number;
  newPermissions: number;
  rolesTotal: number;
  newRoles: number;
  mappingsTotal: number;
  newMappings: number;
}

/**
 * Ensure platform RBAC seed data exists.  Runs inside a single transaction so
 * partial seeds are rolled back on failure.  Idempotent — safe to call
 * repeatedly; existing rows are never duplicated or deleted.
 */
export async function seedPlatformRbac(client: PoolClient): Promise<SeedResult> {
  await client.query('BEGIN');
  try {
    // 1. Permissions ───────────────────────────────────────────────────────
    let newPerms = 0;
    for (const key of PERMISSIONS) {
      const res = await client.query(
        `INSERT INTO permissions (id, key) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [randomUUID(), key],
      );
      if (res.rowCount && res.rowCount > 0) newPerms++;
    }

    // 2. Roles ─────────────────────────────────────────────────────────────
    let newRoles = 0;
    for (const role of ROLES) {
      const res = await client.query(
        `INSERT INTO roles (id, key, name) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [randomUUID(), role.key, role.name],
      );
      if (res.rowCount && res.rowCount > 0) newRoles++;
    }

    // 3. Resolve IDs for role-permission mappings ──────────────────────────
    const rolesRes = await client.query(`SELECT id, key FROM roles`);
    const roleById = new Map<string, string>();
    for (const row of rolesRes.rows) roleById.set(row.key, row.id);

    const permsRes = await client.query(`SELECT id, key FROM permissions`);
    const permById = new Map<string, string>();
    for (const row of permsRes.rows) permById.set(row.key, row.id);

    // 4. Role-permission mappings ──────────────────────────────────────────
    let newMappings = 0;
    for (const role of ROLES) {
      const roleId = roleById.get(role.key);
      if (!roleId) throw new Error(`Role ${role.key} not found after insert`);

      for (const permKey of role.permissions) {
        const permId = permById.get(permKey);
        if (!permId) throw new Error(`Permission ${permKey} not found after insert`);

        const res = await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permId],
        );
        if (res.rowCount && res.rowCount > 0) newMappings++;
      }
    }

    await client.query('COMMIT');

    return {
      permissionsTotal: PERMISSIONS.length,
      newPermissions: newPerms,
      rolesTotal: ROLES.length,
      newRoles: newRoles,
      mappingsTotal: newMappings + (await countExistingMappings(client)),
      newMappings: newMappings,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

async function countExistingMappings(client: PoolClient): Promise<number> {
  const res = await client.query(`SELECT COUNT(*)::int AS cnt FROM role_permissions`);
  return res.rows[0]?.cnt ?? 0;
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

async function cli(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('❌ DATABASE_URL is required for the platform seed.');
    console.error('   Set it to your PostgreSQL connection string before running db:seed.');
    process.exit(1);
  }

  const sslCaFile = process.env['PGSSLROOTCERT'];

  console.log('🌱 Platform database seed starting...\n');

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ...(sslCaFile && {
      ssl: {
        ca: fs.readFileSync(sslCaFile, 'utf8'),
        rejectUnauthorized: true,
      },
    }),
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('✓ Database connection established\n');

    const result = await seedPlatformRbac(client);

    if (result.newPermissions > 0) {
      console.log(`✓ Permissions ensured: ${result.permissionsTotal} (${result.newPermissions} new)`);
    } else {
      console.log(`✓ Existing permissions preserved (${result.permissionsTotal})`);
    }

    if (result.newRoles > 0) {
      console.log(`✓ Roles ensured: ${result.rolesTotal} (${result.newRoles} new)`);
    } else {
      console.log(`✓ Existing roles preserved (${result.rolesTotal})`);
    }

    if (result.newMappings > 0) {
      console.log(`✓ Role permissions ensured (${result.newMappings} new mappings)`);
    } else {
      console.log(`✓ Existing role permissions preserved`);
    }

    console.log('\n🌱 Platform database seed complete.\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Platform seed FAILED: ${message}\n`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run CLI when executed directly (not imported for testing).
const isDirectRun =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.endsWith('seed-pg.ts') || process.argv[1]?.endsWith('seed-pg');

if (isDirectRun) {
  cli().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
