import { Pool } from 'pg';
import fs from 'node:fs';
import {
  assertStagingBootstrapTarget,
  setStagingBootstrapActorContext,
} from './scripts/staging-bootstrap-safety';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  const caFile = process.env['PGSSLROOTCERT'];

  if (!connectionString || !caFile) {
    throw new Error('DATABASE_URL or PGSSLROOTCERT is not set');
  }

  const pool = new Pool({
    connectionString,
    ssl: {
      ca: fs.readFileSync(caFile, 'utf8'),
      rejectUnauthorized: true,
    },
  });
  const client = await pool.connect();

  try {
    await assertStagingBootstrapTarget(client, 'check-staging-merchant-bootstrap');
    await client.query('BEGIN READ ONLY');
    await setStagingBootstrapActorContext(client, 'check-staging-merchant-bootstrap');

    const user = await client.query(`
      SELECT id, phone, email, full_name, status
      FROM users
      WHERE phone = '+966500000010';
    `);
    console.log('TEST USER');
    console.table(user.rows);

    const role = await client.query(`
      SELECT id, key, name
      FROM roles
      WHERE key = 'MERCHANT_OWNER';
    `);
    console.log('MERCHANT OWNER ROLE');
    console.table(role.rows);

    const org = await client.query(`
      SELECT id, name, type, country, verification_status, invite_code
      FROM organizations
      WHERE name = 'TAIF B2 Test Merchant';
    `);
    console.log('TEST ORGANIZATION');
    console.table(org.rows);

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original diagnostic failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
