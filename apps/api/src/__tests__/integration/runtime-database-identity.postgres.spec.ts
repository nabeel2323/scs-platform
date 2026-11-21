import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  logRuntimeDatabaseIdentity,
  RUNTIME_DATABASE_IDENTITY_SQL,
  type RuntimeDatabaseIdentity,
} from '../../common/database/runtime-database-identity';

const LOGIN_ROLE = 'scs_api_identity_login';
const EFFECTIVE_ROLE = 'scs_api_identity_runtime';
const LOGIN_PASSWORD = 'test-only-identity-password';

describe('runtime database identity SQL — PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    adminPool = new Pool({ connectionString: container.getConnectionUri() });

    await adminPool.query(
      `CREATE ROLE ${LOGIN_ROLE} LOGIN PASSWORD '${LOGIN_PASSWORD}'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await adminPool.query(
      `CREATE ROLE ${EFFECTIVE_ROLE}
       NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await adminPool.query(`GRANT ${EFFECTIVE_ROLE} TO ${LOGIN_ROLE}`);

    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = LOGIN_ROLE;
    runtimeUrl.password = LOGIN_PASSWORD;
    runtimePool = new Pool({ connectionString: runtimeUrl.toString(), max: 1 });
  }, 180_000);

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    await container?.stop();
  });

  it('reports distinct login and effective roles from the real API-style connection', async () => {
    const client = await runtimePool.connect();
    const logger = { log: vi.fn(), warn: vi.fn() };

    try {
      await client.query(`SET ROLE ${EFFECTIVE_ROLE}`);

      await logRuntimeDatabaseIdentity(
        () => client.query<RuntimeDatabaseIdentity>(RUNTIME_DATABASE_IDENTITY_SQL),
        logger,
      );

      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledOnce();

      const message = logger.log.mock.calls[0]?.[0];
      expect(message).toBeDefined();
      const identity = JSON.parse(message!.replace('Runtime database identity: ', '')) as
        RuntimeDatabaseIdentity;

      expect(identity.session_user).toBe(LOGIN_ROLE);
      expect(identity.current_user).toBe(EFFECTIVE_ROLE);
      expect(identity.database_name).toBe('test');
      expect(identity.session_role_superuser).toBe(false);
      expect(identity.session_role_bypassrls).toBe(false);
      expect(identity.session_role_createrole).toBe(false);
      expect(identity.session_role_createdb).toBe(false);
      expect(identity.effective_role_superuser).toBe(false);
      expect(identity.effective_role_bypassrls).toBe(false);
      expect(identity.effective_role_createrole).toBe(false);
      expect(identity.effective_role_createdb).toBe(false);
      expect(message).not.toContain(LOGIN_PASSWORD);
    } finally {
      client.release();
    }
  });
});
