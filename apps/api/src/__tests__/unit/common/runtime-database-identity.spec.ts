import { describe, expect, it, vi } from 'vitest';
import {
  logRuntimeDatabaseIdentity,
  type RuntimeDatabaseIdentity,
} from '../../../../common/database/runtime-database-identity';

const identity: RuntimeDatabaseIdentity = {
  session_user: 'api_login',
  current_user: 'api_runtime',
  database_name: 'scs_staging',
  session_role_superuser: false,
  session_role_bypassrls: false,
  session_role_createrole: false,
  session_role_createdb: false,
  effective_role_superuser: false,
  effective_role_bypassrls: false,
  effective_role_createrole: false,
  effective_role_createdb: false,
  ssl: true,
};

describe('logRuntimeDatabaseIdentity', () => {
  it('logs the non-secret identity returned by the API pool query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [identity] });
    const logger = { log: vi.fn(), warn: vi.fn() };

    await logRuntimeDatabaseIdentity(query, logger);

    expect(query).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      `Runtime database identity: ${JSON.stringify(identity)}`,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the identity unverified when PostgreSQL returns no role metadata', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const logger = { log: vi.fn(), warn: vi.fn() };

    await logRuntimeDatabaseIdentity(query, logger);

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Runtime database identity query returned no role metadata; identity remains unverified.',
    );
  });

  it('does not fail API startup or leak connection errors when diagnostics fail', async () => {
    const query = vi.fn().mockRejectedValue(new Error('postgres://secret-user:secret-pass@host/db'));
    const logger = { log: vi.fn(), warn: vi.fn() };

    await expect(logRuntimeDatabaseIdentity(query, logger)).resolves.toBeUndefined();

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toBe(
      'Runtime database identity diagnostics failed; identity remains unverified.',
    );
    expect(logger.warn.mock.calls[0][0]).not.toContain('secret-pass');
  });
});
