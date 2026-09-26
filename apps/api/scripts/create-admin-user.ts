/**
 * Quick script to create an admin user for local UAT.
 * Usage: DATABASE_URL=... pnpm tsx scripts/create-admin-user.ts
 */
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

async function main() {
  const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';
  const pool = new Pool({ connectionString });

  try {
    // 1. Find SUPER_ADMIN role
    const roleResult = await pool.query("SELECT id FROM roles WHERE key = 'SUPER_ADMIN' LIMIT 1");
    if (roleResult.rows.length === 0) throw new Error('SUPER_ADMIN role not found — run db:seed first');
    const superAdminRoleId = roleResult.rows[0].id;

    // 2. Create or find Platform organization
    let orgId: string;
    const existingOrg = await pool.query("SELECT id FROM organizations WHERE name = 'SCS Platform Ops' AND type = 'PLATFORM' LIMIT 1");
    if (existingOrg.rows.length > 0) {
      orgId = existingOrg.rows[0].id;
    } else {
      orgId = randomUUID();
      await pool.query(
        `INSERT INTO organizations (id, name, type, country, verification_status, created_at, updated_at)
         VALUES ($1, 'SCS Platform Ops', 'PLATFORM', 'SA', 'VERIFIED', NOW(), NOW())`,
        [orgId],
      );
    }

    // 3. Create admin user
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash('Admin@2026!', 12);
    await pool.query(
      `INSERT INTO users (id, phone, email, full_name, status, password_hash, password_set_at, email_verified_at, created_at, updated_at)
       VALUES ($1, '+10000000000', 'admin@scsp.dev', 'Platform Admin', 'ACTIVE', $2, NOW(), NOW(), NOW(), NOW())`,
      [userId, passwordHash],
    );

    // 4. Link user to org as SUPER_ADMIN
    await pool.query(
      `INSERT INTO organization_members (id, org_id, user_id, role_id, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
      [randomUUID(), orgId, userId, superAdminRoleId],
    );

    console.log(`Admin user created:`);
    console.log(`  User ID: ${userId}`);
    console.log(`  Email: admin@scsp.dev`);
    console.log(`  Password: Admin@2026!`);
    console.log(`  Org ID: ${orgId}`);
    console.log(`  Role: SUPER_ADMIN`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
