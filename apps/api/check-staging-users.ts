import { Pool } from 'pg';
import fs from 'node:fs';
import {
  assertStagingReadOnlyAuditTarget,
  setStagingReadOnlyAuditActorContext,
} from './scripts/staging-read-only-audit-safety';

const AUDIT_NAME = 'check-staging-users';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  const caFile = process.env['PGSSLROOTCERT'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; the value is never printed.');
  }
  if (!caFile) {
    throw new Error('PGSSLROOTCERT is not set; verified TLS is required.');
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: 'scs-staging-users-audit',
    ssl: {
      ca: fs.readFileSync(caFile, 'utf8'),
      rejectUnauthorized: true,
    },
  });
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await assertStagingReadOnlyAuditTarget(client, AUDIT_NAME);
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;
    await setStagingReadOnlyAuditActorContext(client, AUDIT_NAME);

    const userCounts = await client.query(`
      SELECT COALESCE(status, 'UNKNOWN') AS status,
             count(*)::int AS user_count
      FROM users
      GROUP BY status
      ORDER BY status;
    `);

    const membershipCounts = await client.query(`
      SELECT COALESCE(r.key, 'NO_ROLE') AS role,
             count(DISTINCT om.user_id)::int AS user_count
      FROM organization_members om
      LEFT JOIN roles r ON r.id = om.role_id
      GROUP BY r.key
      ORDER BY role;
    `);

    console.log('STAGING USER COUNTS BY STATUS (NO PERSONAL DATA)');
    console.table(userCounts.rows);
    console.log('STAGING USER COUNTS BY ORGANIZATION ROLE (NO PERSONAL DATA)');
    console.table(membershipCounts.rows);

    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original diagnostic failure.
      }
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown staging user audit failure';
  console.error(`Read-only staging user audit failed: ${message}`);
  process.exitCode = 1;
});
