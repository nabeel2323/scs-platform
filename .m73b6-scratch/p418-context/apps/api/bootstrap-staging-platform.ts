import { Client } from 'pg';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';

async function main() {
  const connectionString = process.env['DATABASE_URL'];
  const sslCaFile = process.env['PGSSLROOTCERT'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  if (!sslCaFile) {
    throw new Error('PGSSLROOTCERT is required');
  }

  const ca = fs.readFileSync(sslCaFile, 'utf8');

  const client = new Client({
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  });

  await client.connect();

  try {
    const identity = await client.query(`
      SELECT current_database(), current_user, version()
    `);

    console.log('\n=== TAIF Staging Platform Bootstrap ===');
    console.log(`Database: ${identity.rows[0].current_database}`);
    console.log(`User:     ${identity.rows[0].current_user}`);

    await client.query('BEGIN');

    /*
     * ------------------------------------------------------------
     * 1. Resolve SUPER_ADMIN role
     * ------------------------------------------------------------
     */

    const roleResult = await client.query(
      `
      SELECT id, key, name
      FROM roles
      WHERE key = 'SUPER_ADMIN'
      LIMIT 1
      `
    );

    if (roleResult.rows.length !== 1) {
      throw new Error(
        'SUPER_ADMIN role was not found. Run bootstrap-staging-rbac.ts first.'
      );
    }

    const superAdminRoleId = roleResult.rows[0].id;

    console.log(`SUPER_ADMIN role: ${superAdminRoleId}`);

    /*
     * ------------------------------------------------------------
     * 2. Create Platform organization
     * ------------------------------------------------------------
     */

    const existingOrg = await client.query(
      `
      SELECT id, name, type, verification_status
      FROM organizations
      WHERE name = 'SCS Platform Ops'
        AND type = 'PLATFORM'
      LIMIT 1
      `
    );

    let orgId: string;

    if (existingOrg.rows.length > 0) {
      orgId = existingOrg.rows[0].id;

      console.log(`Platform organization already exists: ${orgId}`);
    } else {
      orgId = randomUUID();

      await client.query(
        `
        INSERT INTO organizations (
          id,
          type,
          name,
          legal_name,
          country,
          verification_status
        )
        VALUES (
          $1,
          'PLATFORM',
          'SCS Platform Ops',
          'SCS Platform Ops',
          'SA',
          'VERIFIED'
        )
        `,
        [orgId]
      );

      console.log(`Created Platform organization: ${orgId}`);
    }

    /*
     * ------------------------------------------------------------
     * 3. Create SUPER_ADMIN user
     * ------------------------------------------------------------
     */

    const existingUser = await client.query(
      `
      SELECT id, phone, full_name, status
      FROM users
      WHERE phone = '+966500000001'
      LIMIT 1
      `
    );

    let userId: string;

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;

      console.log(`SUPER_ADMIN user already exists: ${userId}`);
    } else {
      userId = randomUUID();

      await client.query(
        `
        INSERT INTO users (
          id,
          phone,
          full_name,
          locale,
          status
        )
        VALUES (
          $1,
          '+966500000001',
          'Fahad Al-Rashid',
          'en',
          'ACTIVE'
        )
        `,
        [userId]
      );

      console.log(`Created SUPER_ADMIN user: ${userId}`);
    }

    /*
     * ------------------------------------------------------------
     * 4. Create organization membership
     * ------------------------------------------------------------
     */

    const existingMembership = await client.query(
      `
      SELECT
        om.id,
        om.org_id,
        om.user_id,
        om.role_id,
        om.status,
        r.key AS role_key
      FROM organization_members om
      JOIN roles r ON r.id = om.role_id
      WHERE om.org_id = $1
        AND om.user_id = $2
      LIMIT 1
      `,
      [orgId, userId]
    );

    if (existingMembership.rows.length > 0) {
      const membership = existingMembership.rows[0];

      if (membership.role_key !== 'SUPER_ADMIN') {
        throw new Error(
          `Existing membership ${membership.id} has role ${membership.role_key}, not SUPER_ADMIN.`
        );
      }

      if (membership.status !== 'ACTIVE') {
        await client.query(
          `
          UPDATE organization_members
          SET status = 'ACTIVE'
          WHERE id = $1
          `,
          [membership.id]
        );

        console.log(`Reactivated SUPER_ADMIN membership: ${membership.id}`);
      } else {
        console.log(
          `SUPER_ADMIN membership already exists: ${membership.id}`
        );
      }
    } else {
      const membershipId = randomUUID();

      await client.query(
        `
        INSERT INTO organization_members (
          id,
          org_id,
          user_id,
          role_id,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'ACTIVE'
        )
        `,
        [membershipId, orgId, userId, superAdminRoleId]
      );

      console.log(`Created SUPER_ADMIN membership: ${membershipId}`);
    }

    /*
     * ------------------------------------------------------------
     * 5. Verify the complete relationship
     * ------------------------------------------------------------
     */

    const verification = await client.query(
      `
      SELECT
        u.id AS user_id,
        u.phone,
        u.full_name,
        u.status AS user_status,
        o.id AS org_id,
        o.name AS organization_name,
        o.type AS organization_type,
        o.verification_status,
        r.id AS role_id,
        r.key AS role_key,
        r.name AS role_name,
        om.status AS membership_status
      FROM users u
      JOIN organization_members om
        ON om.user_id = u.id
      JOIN organizations o
        ON o.id = om.org_id
      JOIN roles r
        ON r.id = om.role_id
      WHERE u.phone = '+966500000001'
        AND o.type = 'PLATFORM'
        AND r.key = 'SUPER_ADMIN'
      `
    );

    if (verification.rows.length !== 1) {
      throw new Error(
        `Expected exactly one Platform SUPER_ADMIN relationship, found ${verification.rows.length}.`
      );
    }

    const row = verification.rows[0];

    if (row.user_status !== 'ACTIVE') {
      throw new Error(`SUPER_ADMIN user status is ${row.user_status}`);
    }

    if (row.organization_type !== 'PLATFORM') {
      throw new Error(
        `Organization type is ${row.organization_type}, expected PLATFORM`
      );
    }

    if (row.verification_status !== 'VERIFIED') {
      throw new Error(
        `Platform organization verification status is ${row.verification_status}`
      );
    }

    if (row.membership_status !== 'ACTIVE') {
      throw new Error(
        `SUPER_ADMIN membership status is ${row.membership_status}`
      );
    }

    const permissionCount = await client.query(
      `
      SELECT COUNT(*)::int AS permission_count
      FROM role_permissions
      WHERE role_id = $1
      `,
      [superAdminRoleId]
    );

    if (permissionCount.rows[0].permission_count !== 46) {
      throw new Error(
        `SUPER_ADMIN has ${permissionCount.rows[0].permission_count} permissions; expected 46.`
      );
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('STAGING PLATFORM BOOTSTRAP COMPLETE');
    console.log('========================================');

    console.table([
      {
        user_id: row.user_id,
        phone: row.phone,
        name: row.full_name,
        organization: row.organization_name,
        organization_type: row.organization_type,
        role: row.role_key,
        membership: row.membership_status,
        permissions: permissionCount.rows[0].permission_count,
      },
    ]);

    console.log('\nSUPER_ADMIN login phone: +966500000001');
    console.log('Organization: SCS Platform Ops');
    console.log('Role: SUPER_ADMIN');
    console.log('Permissions: 46\n');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure.
    }

    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nPLATFORM BOOTSTRAP FAILED:', err);
  process.exit(1);
});