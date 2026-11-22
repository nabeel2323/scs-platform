import { Client } from 'pg';
import * as fs from 'node:fs';
import { assertStagingBootstrapTarget } from './staging-bootstrap-safety';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  const sslCaFile = process.env['PGSSLROOTCERT'];
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (!sslCaFile) throw new Error('PGSSLROOTCERT is required');

  const client = new Client({
    connectionString,
    ssl: {
      ca: fs.readFileSync(sslCaFile, 'utf8'),
      rejectUnauthorized: true,
    },
  });

  await client.connect();
  try {
    const identity = await assertStagingBootstrapTarget(client, 'staging-bootstrap-preflight');
    console.log('Staging bootstrap target confirmed: ' + identity.current_database + ' (role ' + identity.current_user + ').');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Staging bootstrap preflight failed: ' + message);
  process.exitCode = 1;
});
