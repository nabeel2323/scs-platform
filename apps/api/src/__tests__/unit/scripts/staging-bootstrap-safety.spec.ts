import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertStagingBootstrapTarget } from '../../../../scripts/staging-bootstrap-safety';

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

  it('accepts only the explicitly approved target database', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ current_database: 'scs_staging', current_user: 'bootstrap_operator' }],
      }),
    };
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).resolves.toEqual({
      current_database: 'scs_staging',
      current_user: 'bootstrap_operator',
    });
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
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ current_database: 'scs_production', current_user: 'bootstrap_operator' }],
      }),
    };
    await expect(assertStagingBootstrapTarget(client as any, 'test-bootstrap')).rejects.toThrow(
      /does not match/,
    );
  });
});
