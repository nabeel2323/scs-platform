import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function makeHarness() {
  const directory = mkdtempSync(resolve(tmpdir(), 'scs-verification-target-'));
  temporaryDirectories.push(directory);
  const bin = resolve(directory, 'bin');
  const marker = resolve(directory, 'psql-called');
  const helperCandidates = [
    resolve(process.cwd(), 'infra/drizzle/migrations/assert-verification-target.sh'),
    resolve(process.cwd(), 'apps/api/infra/drizzle/migrations/assert-verification-target.sh'),
  ];
  const helper = helperCandidates.find(existsSync);
  if (!helper) throw new Error('Could not locate assert-verification-target.sh from the API test working directory');

  mkdirSync(bin, { recursive: true });
  const fakePsql = resolve(bin, 'psql');
  writeFileSync(fakePsql, '#!/bin/sh\nprintf "called\\n" >> "$PSQL_MARKER"\ncase "$*" in\n  *"current_database()"*) printf "%s" "${FAKE_DATABASE:-m73a_verify}" ;;\n  *"current_user"*) printf "%s" "${FAKE_USER:-postgres}" ;;\n  *"inet_server_addr()"*) printf "%s" "${FAKE_SERVER_ADDR:-127.0.0.1}" ;;\n  *) exit 2 ;;\nesac\n');
  chmodSync(fakePsql, 0o755);
  return { helper, marker, env: {
    ...process.env,
    PATH: bin + delimiter + (process.env['PATH'] ?? ''),
    PSQL_MARKER: marker,
    PGSERVICE: '',
  } };
}

function invoke(helper: string, env: NodeJS.ProcessEnv) {
  return spawnSync(
    'sh',
    ['-c', '. "$1"; assert_verification_target m73a_verify postgres', 'verification-target-test', helper],
    { env, encoding: 'utf8' },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('manual migration verification target guard', () => {
  it('refuses before invoking psql unless the environment is explicitly test', () => {
    const harness = makeHarness();
    const result = invoke(harness.helper, {
      ...harness.env,
      SCS_ENVIRONMENT: 'staging',
      SCS_MIGRATION_VERIFY_CONFIRM: 'm73a_verify',
      PGHOST: '127.0.0.1',
      PGHOSTADDR: '127.0.0.1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SCS_ENVIRONMENT must be test');
    expect(existsSync(harness.marker)).toBe(false);
  });

  it('requires exact target confirmation before invoking psql', () => {
    const harness = makeHarness();
    const result = invoke(harness.helper, {
      ...harness.env,
      SCS_ENVIRONMENT: 'test',
      SCS_MIGRATION_VERIFY_CONFIRM: 'another_database',
      PGHOST: '127.0.0.1',
      PGHOSTADDR: '127.0.0.1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SCS_MIGRATION_VERIFY_CONFIRM');
    expect(existsSync(harness.marker)).toBe(false);
  });

  it('rejects non-local host routing before invoking psql', () => {
    const harness = makeHarness();
    const result = invoke(harness.helper, {
      ...harness.env,
      SCS_ENVIRONMENT: 'test',
      SCS_MIGRATION_VERIFY_CONFIRM: 'm73a_verify',
      PGHOST: 'db.example.invalid',
      PGHOSTADDR: '203.0.113.10',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PGHOST must be local');
    expect(existsSync(harness.marker)).toBe(false);
  });

  it('rejects an unexpected connected database, user, or server address', () => {
    const harness = makeHarness();
    const base = {
      ...harness.env,
      SCS_ENVIRONMENT: 'test',
      SCS_MIGRATION_VERIFY_CONFIRM: 'm73a_verify',
      PGHOST: '127.0.0.1',
      PGHOSTADDR: '127.0.0.1',
    };

    const wrongDatabase = invoke(harness.helper, { ...base, FAKE_DATABASE: 'production' });
    expect(wrongDatabase.status).not.toBe(0);
    expect(wrongDatabase.stderr).toContain('connected to production');

    const wrongUser = invoke(harness.helper, { ...base, FAKE_USER: 'service_role' });
    expect(wrongUser.status).not.toBe(0);
    expect(wrongUser.stderr).toContain('as service_role');

    const remoteServer = invoke(harness.helper, { ...base, FAKE_SERVER_ADDR: '198.51.100.7' });
    expect(remoteServer.status).not.toBe(0);
    expect(remoteServer.stderr).toContain('server address is not local');
  });

  it('accepts only the confirmed local disposable database and role', () => {
    const harness = makeHarness();
    const result = invoke(harness.helper, {
      ...harness.env,
      SCS_ENVIRONMENT: 'test',
      SCS_MIGRATION_VERIFY_CONFIRM: 'm73a_verify',
      PGHOST: '127.0.0.1',
      PGHOSTADDR: '127.0.0.1',
      PGSERVICE: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('confirmed local m73a_verify as postgres');
  });
});
