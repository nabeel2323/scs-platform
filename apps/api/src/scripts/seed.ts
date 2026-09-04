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
  return execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query,
  ], { encoding: 'utf-8' }).trim();
}

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

const ROLES: { key: string; name: string; permissions: string[] }[] = [
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

function sqlValue(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Create permissions (idempotent via ON CONFLICT DO NOTHING)
  console.log(`  Creating ${PERMISSIONS.length} permissions...`);
  const permValues = PERMISSIONS
    .map((p) => `(${sqlValue(crypto.randomUUID())}, ${sqlValue(p)})`)
    .join(',\n    ');
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
      psql(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${rpValues} ON CONFLICT DO NOTHING;`);
    }
  }

  console.log('\n✅ Seed complete!');
  console.log(`   ${PERMISSIONS.length} permissions, ${ROLES.length} roles created\n`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
