/**
 * Create a local UAT Super Admin.
 *
 * Required environment:
 *   SCS_ENVIRONMENT=development|test
 *   SCS_ADMIN_BOOTSTRAP_CONFIRM=true
 *   DATABASE_URL=<local PostgreSQL URL>
 *   SCS_ADMIN_EMAIL, SCS_ADMIN_PHONE, SCS_ADMIN_NAME, SCS_ADMIN_PASSWORD
 *
 * This utility deliberately refuses staging/production and never prints passwords.
 */
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
  'scs-postgres',
]);

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required');
  return value;
}

function readLocalUatConfig() {
  const environment = requiredEnvironmentValue('SCS_ENVIRONMENT').toLowerCase();
  if (environment !== 'development' && environment !== 'test') {
    throw new Error('This utility is restricted to development/test databases.');
  }
  if (process.env['SCS_ADMIN_BOOTSTRAP_CONFIRM'] !== 'true') {
    throw new Error('Set SCS_ADMIN_BOOTSTRAP_CONFIRM=true to confirm local admin creation.');
  }

  const connectionString = requiredEnvironmentValue('DATABASE_URL');
  const databaseUrl = new URL(connectionString);
  if (!LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
    throw new Error('Refusing to create a local UAT admin against a non-local database host.');
  }

  const password = requiredEnvironmentValue('SCS_ADMIN_PASSWORD');
  if (password.length < 12) {
    throw new Error('SCS_ADMIN_PASSWORD must contain at least 12 characters.');
  }

  return {
    connectionString,
    email: requiredEnvironmentValue('SCS_ADMIN_EMAIL').toLowerCase(),
    phone: requiredEnvironmentValue('SCS_ADMIN_PHONE'),
    fullName: requiredEnvironmentValue('SCS_ADMIN_NAME'),
    password,
  };
}

async function main(): Promise<void> {
  const config = readLocalUatConfig();
  const pool = new Pool({ connectionString: config.connectionString });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roleResult = await client.query("SELECT id FROM roles WHERE key = 'SUPER_ADMIN' LIMIT 1");
    if (roleResult.rows.length !== 1) {
      throw new Error('SUPER_ADMIN role not found; run the local RBAC seed first.');
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1',
      [config.email, config.phone],
    );
    if (existingUser.rows.length > 0) {
      throw new Error('A user with the supplied email or phone already exists.');
    }

    const existingOrg = await client.query(
      "SELECT id FROM organizations WHERE name = 'SCS Platform Ops' AND type = 'PLATFORM' LIMIT 1",
    );

    const orgId = existingOrg.rows[0]?.id ?? randomUUID();

    if (existingOrg.rows.length === 0) {
      await client.query(
        `INSERT INTO organizations
          (id, name, type, country, verification_status, created_at, updated_at)
         VALUES ($1, 'SCS Platform Ops', 'PLATFORM', 'SA', 'VERIFIED', NOW(), NOW())`,
        [orgId],
      );
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(config.password, 12);

    await client.query(
      `INSERT INTO users
        (id, phone, email, full_name, status, password_hash, password_set_at,
         email_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW(), NOW(), NOW(), NOW())`,
      [userId, config.phone, config.email, config.fullName, passwordHash],
    );

    await client.query(
      `INSERT INTO organization_members
        (id, org_id, user_id, role_id, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
      [randomUUID(), orgId, userId, roleResult.rows[0].id],
    );

    await client.query('COMMIT');
    console.log('Local UAT SUPER_ADMIN account created.');
    console.log('Email: ' + config.email);
    console.log('Password: supplied securely through SCS_ADMIN_PASSWORD; not logged.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Local UAT admin creation failed: ' + message);
  process.exitCode = 1;
});
