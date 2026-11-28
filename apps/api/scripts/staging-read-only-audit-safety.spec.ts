import type { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertStagingReadOnlyAuditTarget,
  setStagingReadOnlyAuditActorContext,
  type StagingReadOnlyAuditIdentity,
} from './staging-read-only-audit-safety';

const safeIdentity: StagingReadOnlyAuditIdentity = {
  session_user: 'scs_audit',
  current_user: 'scs_audit',
  current_database: 'scs_staging',
  session_role_superuser: false,
  session_role_bypassrls: false,
  session_role_createrole: false,
  session_role_createdb: false,
  effective_role_superuser: false,
  effective_role_bypassrls: false,
  effective_role_createrole: false,
  effective_role_createdb: false,
  owns_public_tables: false,
  owns_public_schema: false,
  ssl: true,
};

function makeClient(identity: StagingReadOnlyAuditIdentity = safeIdentity) {
  const query = vi.fn().mockResolvedValue({ rows: [identity] });
  return { client: { query } as unknown as Pick<Client, 'query'>, query };
}

describe('staging read-only audit safety', () => {
  beforeEach(() => {
    process.env['SCS_ENVIRONMENT'] = 'staging';
    process.env['SCS_STAGING_READ_ONLY_AUDIT_DATABASE'] = 'scs_staging';
    process.env['SCS_STAGING_READ_ONLY_AUDIT_APPROVAL'] =
      'I_APPROVE_STAGING_READ_ONLY_AUDIT:scs_staging';
  });

  afterEach(() => {
    delete process.env['SCS_ENVIRONMENT'];
    delete process.env['SCS_STAGING_READ_ONLY_AUDIT_DATABASE'];
    delete process.env['SCS_STAGING_READ_ONLY_AUDIT_APPROVAL'];
    vi.restoreAllMocks();
  });

  it('rejects a non-staging environment before querying', async () => {
    process.env['SCS_ENVIRONMENT'] = 'production';
    const { client, query } = makeClient();
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).rejects.toThrow(
      'SCS_ENVIRONMENT must explicitly be staging',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('requires an exact database and matching explicit approval', async () => {
    delete process.env['SCS_STAGING_READ_ONLY_AUDIT_DATABASE'];
    const { client, query } = makeClient();
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).rejects.toThrow(
      'must name the exact target database',
    );
    expect(query).not.toHaveBeenCalled();

    process.env['SCS_STAGING_READ_ONLY_AUDIT_DATABASE'] = 'scs_staging';
    process.env['SCS_STAGING_READ_ONLY_AUDIT_APPROVAL'] = 'I_APPROVE_STAGING_READ_ONLY_AUDIT:other';
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).rejects.toThrow(
      'must match the exact target database',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a connection to a different database', async () => {
    const { client } = makeClient({ ...safeIdentity, current_database: 'production' });
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).rejects.toThrow(
      'does not match SCS_STAGING_READ_ONLY_AUDIT_DATABASE',
    );
  });

  it.each([
    ['session/effective role mismatch', { current_user: 'other_role' }],
    ['superuser', { effective_role_superuser: true }],
    ['BYPASSRLS', { session_role_bypassrls: true }],
    ['CREATEROLE', { effective_role_createrole: true }],
    ['CREATEDB', { session_role_createdb: true }],
    ['owns public tables/schema', { owns_public_tables: true }],
    ['TLS disabled or unverified', { ssl: false }],
  ])('rejects unsafe identity: %s', async (reason, overrides) => {
    const { client } = makeClient({ ...safeIdentity, ...overrides });
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).rejects.toThrow(reason);
  });

  it('accepts only the exact staging database over verified TLS with a restricted role', async () => {
    const { client, query } = makeClient();
    await expect(assertStagingReadOnlyAuditTarget(client, 'users-check')).resolves.toEqual(
      safeIdentity,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('sets a transaction-local audit actor principal', async () => {
    const { client, query } = makeClient();
    await setStagingReadOnlyAuditActorContext(client, 'users-check');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.actor_kind', $2, true)"),
      ['audit-cli:users-check', 'audit'],
    );
  });
});
