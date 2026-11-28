import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertStagingBootstrapTarget,
  setStagingBootstrapActorContext,
  type StagingBootstrapIdentity,
} from '../../../../scripts/staging-bootstrap-safety';

const safeIdentity: StagingBootstrapIdentity = {
  session_user: 'scs_bootstrap',
  current_user: 'scs_bootstrap',
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

function clientWithIdentity(identity: StagingBootstrapIdentity | null) {
  return {
    query: vi.fn().mockResolvedValue({ rows: identity ? [identity] : [] }),
  };
}

describe('staging bootstrap target guard', () => {
  beforeEach(() => {
    vi.stubEnv('SCS_ENVIRONMENT', 'staging');
    vi.stubEnv('SCS_STAGING_BOOTSTRAP_CONFIRM', 'true');
    vi.stubEnv('SCS_STAGING_BOOTSTRAP_DATABASE', 'scs_staging');
    vi.stubEnv('SCS_STAGING_BOOTSTRAP_APPROVAL', 'I_APPROVE_STAGING_BOOTSTRAP:scs_staging');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets a transaction-local bootstrap principal for staging CLI work', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await setStagingBootstrapActorContext(client as any, 'test-bootstrap');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.actor_kind', $2, true)"),
      ['bootstrap-cli:test-bootstrap', 'bootstrap'],
    );
  });

  it('rejects an empty bootstrap script identity', async () => {
    const client = { query: vi.fn() };
    await expect(setStagingBootstrapActorContext(client as any, '  ')).rejects.toThrow(
      /script name is required/,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it('accepts a non-privileged, non-owning connection to the explicitly approved target over TLS', async () => {
    const client = clientWithIdentity(safeIdentity);
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).resolves.toEqual(
      safeIdentity,
    );
    expect(client.query).toHaveBeenCalledOnce();
    expect(client.query.mock.calls[0]?.[0]).toContain('pg_stat_ssl');
    expect(client.query.mock.calls[0]?.[0]).toContain('pg_roles');
  });

  it('rejects a non-staging environment before querying', async () => {
    vi.stubEnv('SCS_ENVIRONMENT', 'production');
    const client = { query: vi.fn() };
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).rejects.toThrow(
      /must explicitly be staging/,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it('requires the second explicit approval value', async () => {
    vi.stubEnv('SCS_STAGING_BOOTSTRAP_APPROVAL', 'wrong-target');
    const client = { query: vi.fn() };
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).rejects.toThrow(
      /APPROVAL/,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects a connection to a database other than the approved name', async () => {
    const client = clientWithIdentity({ ...safeIdentity, current_database: 'scs_production' });
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).rejects.toThrow(
      /does not match/,
    );
  });

  it('rejects an unavailable database identity', async () => {
    await expect(
      assertStagingBootstrapTarget(clientWithIdentity(null) as any, 'test-bootstrap'),
    ).rejects.toThrow(/does not match/);
  });

  const unsafeIdentities: Array<[string, Partial<StagingBootstrapIdentity>]> = [
    ['session/effective role mismatch', { current_user: 'other_role' }],
    ['superuser', { session_role_superuser: true }],
    ['BYPASSRLS', { effective_role_bypassrls: true }],
    ['CREATEROLE', { session_role_createrole: true }],
    ['CREATEDB', { effective_role_createdb: true }],
    ['public table ownership', { owns_public_tables: true }],
    ['public schema ownership', { owns_public_schema: true }],
    ['disabled TLS', { ssl: false }],
    ['unverified TLS', { ssl: null }],
  ];

  it.each(unsafeIdentities)('rejects an unsafe connection: %s', async (_label, override) => {
    const client = clientWithIdentity({ ...safeIdentity, ...override });
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).rejects.toThrow(
      /requires a non-privileged, non-owning role over verified TLS/,
    );
  });
});
