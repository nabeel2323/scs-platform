/**
 * Seed script — creates default roles, permissions, and a SUPER_ADMIN user.
 *
 * Usage: pnpm --filter @scs/api seed
 * Requires: DATABASE_URL set in environment.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../modules/identity/identity.schema';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

const DATABASE_URL = process.env['DATABASE_URL'] || 'postgresql://scs:scs_dev@localhost:5432/scs_dev';

const PERMISSIONS = [
  // Identity
  'identity:users:read', 'identity:users:write', 'identity:users:delete',
  'identity:roles:read', 'identity:roles:write',
  // Merchant
  'merchant:stores:read', 'merchant:stores:write', 'merchant:stores:verify',
  'merchant:stores:reject',
  // Catalog
  'catalog:products:read', 'catalog:products:write', 'catalog:products:delete',
  'catalog:categories:read', 'catalog:categories:write',
  // Orders
  'orders:read', 'orders:write', 'orders:cancel', 'orders:refund',
  // Payments
  'payments:read', 'payments:refund',
  // Analytics
  'analytics:read',
  // Audit
  'audit:read',
  // Support
  'support:tickets:read', 'support:tickets:write', 'support:tickets:escalate',
  // Ads
  'ads:campaigns:read', 'ads:campaigns:write', 'ads:campaigns:approve',
];

const ROLES = [
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
      'catalog:products:read',
      'orders:read', 'orders:cancel', 'orders:refund',
      'payments:read', 'payments:refund',
      'analytics:read', 'audit:read',
      'support:tickets:read', 'support:tickets:write', 'support:tickets:escalate',
    ],
  },
  {
    key: 'MODERATOR',
    name: 'Moderator',
    permissions: [
      'catalog:products:read', 'catalog:products:write', 'catalog:products:delete',
      'catalog:categories:read', 'catalog:categories:write',
      'support:tickets:read', 'support:tickets:write', 'support:tickets:escalate',
      'orders:read',
    ],
  },
  {
    key: 'MERCHANT_OWNER',
    name: 'Merchant Owner',
    permissions: [
      'catalog:products:read', 'catalog:products:write', 'catalog:products:delete',
      'catalog:categories:read',
      'orders:read', 'orders:write',
      'merchant:stores:read',
    ],
  },
  {
    key: 'MERCHANT_STAFF',
    name: 'Merchant Staff',
    permissions: [
      'catalog:products:read', 'catalog:products:write',
      'orders:read', 'orders:write',
    ],
  },
  {
    key: 'BUYER',
    name: 'Buyer',
    permissions: [
      'catalog:products:read',
      'orders:read', 'orders:write',
      'merchant:stores:read',
    ],
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  const client = postgres(DATABASE_URL);
  const db = drizzle(client, { schema });

  // 1. Create permissions
  console.log(`  Creating ${PERMISSIONS.length} permissions...`);
  for (const permKey of PERMISSIONS) {
    await db
      .insert(schema.permissions)
      .values({ id: crypto.randomUUID(), key: permKey })
      .onConflictDoNothing();
  }

  // 2. Create roles and assign permissions
  for (const role of ROLES) {
    console.log(`  Creating role: ${role.key}`);
    const roleId = crypto.randomUUID();

    await db
      .insert(schema.roles)
      .values({ id: roleId, key: role.key, name: role.name })
      .onConflictDoNothing();

    // Fetch role to get actual ID (in case it already existed)
    const existingRole = await db.query.roles.findFirst({
      where: eq(schema.roles.key, role.key),
    });
    const actualRoleId = existingRole?.id || roleId;

    // Fetch permission IDs
    const permRecords = await db.query.permissions.findMany({
      where: (perms, { inArray }) => inArray(perms.key, role.permissions),
    });

    for (const perm of permRecords) {
      await db
        .insert(schema.rolePermissions)
        .values({ roleId: actualRoleId, permissionId: perm.id })
        .onConflictDoNothing();
    }
  }

  console.log('✅ Seed complete!');
  console.log(`   ${PERMISSIONS.length} permissions, ${ROLES.length} roles created`);

  await client.end();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
