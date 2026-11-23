import type { Client } from 'pg';

export interface StagingBootstrapIdentity {
  current_database: string;
  current_user: string;
}

/** Fail-closed target check for manual staging bootstrap scripts. */
export async function assertStagingBootstrapTarget(
  client: Pick<Client, 'query'>,
  scriptName: string,
): Promise<StagingBootstrapIdentity> {
  if (process.env['SCS_ENVIRONMENT']?.trim().toLowerCase() !== 'staging') {
    throw new Error(scriptName + ': SCS_ENVIRONMENT must explicitly be staging.');
  }
  if (process.env['SCS_STAGING_BOOTSTRAP_CONFIRM'] !== 'true') {
    throw new Error(
      scriptName + ': set SCS_STAGING_BOOTSTRAP_CONFIRM=true to confirm staging bootstrap.',
    );
  }

  const expectedDatabase = process.env['SCS_STAGING_BOOTSTRAP_DATABASE']?.trim();
  if (!expectedDatabase) {
    throw new Error(
      scriptName + ': SCS_STAGING_BOOTSTRAP_DATABASE must name the exact target database.',
    );
  }
  if (
    process.env['SCS_STAGING_BOOTSTRAP_APPROVAL'] !==
    'I_APPROVE_STAGING_BOOTSTRAP:' + expectedDatabase
  ) {
    throw new Error(
      scriptName + ': SCS_STAGING_BOOTSTRAP_APPROVAL must match the exact target database.',
    );
  }

  const result = await client.query<StagingBootstrapIdentity>(`
    SELECT current_database() AS current_database,
           current_user AS current_user
  `);
  const identity = result.rows[0];
  if (!identity || identity.current_database !== expectedDatabase) {
    throw new Error(
      scriptName +
        ': connected database does not match SCS_STAGING_BOOTSTRAP_DATABASE; refusing writes.',
    );
  }
  return identity;
}
