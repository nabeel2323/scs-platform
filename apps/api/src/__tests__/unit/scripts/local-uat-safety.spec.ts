import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertLocalUatExecution } from '../../../../scripts/local-uat-safety';

describe('local UAT safety guard', () => {
  beforeEach(() => {
    vi.stubEnv('SCS_ENVIRONMENT', 'development');
    vi.stubEnv('SCS_UAT_CONFIRM', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts explicitly confirmed local database, API and Redis targets', () => {
    expect(() =>
      assertLocalUatExecution('test-script', {
        databaseUrl: 'postgresql://scs:secret@localhost:5432/scs_platform',
        apiUrl: 'http://127.0.0.1:3000/v1',
        redisUrl: 'redis://localhost:6379',
      }),
    ).not.toThrow();
  });

  it('rejects staging or production environment labels', () => {
    vi.stubEnv('SCS_ENVIRONMENT', 'staging');
    expect(() => assertLocalUatExecution('test-script')).toThrow(/development or test/);
  });

  it('requires explicit UAT confirmation', () => {
    vi.stubEnv('SCS_UAT_CONFIRM', 'false');
    expect(() => assertLocalUatExecution('test-script')).toThrow(/SCS_UAT_CONFIRM/);
  });

  it('rejects a remote database URL', () => {
    expect(() =>
      assertLocalUatExecution('test-script', {
        databaseUrl: 'postgresql://scs:secret@staging.example.com:5432/scs_platform',
      }),
    ).toThrow(/local host/);
  });

  it('rejects remote API or Redis targets', () => {
    expect(() =>
      assertLocalUatExecution('test-script', { apiUrl: 'https://staging.example.com' }),
    ).toThrow(/local host/);
    expect(() =>
      assertLocalUatExecution('test-script', { redisUrl: 'redis://redis.example.com:6379' }),
    ).toThrow(/local host/);
  });
});
