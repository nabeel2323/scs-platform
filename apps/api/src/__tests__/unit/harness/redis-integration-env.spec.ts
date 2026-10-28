/**
 * S1.12 Remediation A — unit tests for the Redis integration-test environment guard.
 *
 * These are pure unit tests: they never open a Redis connection, so they run in
 * every job (including the plain `pnpm test` unit run with no Redis service).
 * They pin the safety contract that replaced the silent
 * `process.env.REDIS_URL ?? <default loopback>` fallback:
 *
 *   - missing target when opted in  -> FAIL FAST, never a silent fallback
 *   - unsafe/ambient target         -> FAIL FAST
 *   - not opted in                  -> SKIP (a skip is not a pass)
 *   - explicit CI service container -> RUN (port alone never decides safety)
 *   - credentials                   -> never appear in any emitted message
 */
import { describe, it, expect } from 'vitest';
import {
  parseRedisTarget,
  redactRedisUrl,
  redisIntegrationGate,
  resolveRedisIntegrationTarget,
} from '../../helpers/redis-integration-env';

/** Environment that opts in to real-Redis tests against an explicitly disposable target. */
const disposableEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  REDIS_IT: '1',
  REDIS_URL: 'redis://localhost:16399',
  REDIS_DISPOSABLE_ACK: '1',
  ...overrides,
});

describe('redactRedisUrl', () => {
  it('masks the userinfo password while keeping host and port', () => {
    expect(redactRedisUrl('redis://user:s3cr3t@cache.example:6380')).toBe(
      'redis://user:***@cache.example:6380',
    );
  });

  it('leaves credential-free URLs intact', () => {
    expect(redactRedisUrl('redis://localhost:16399')).toBe('redis://localhost:16399');
  });

  it('masks a password that contains URL-safe punctuation', () => {
    expect(redactRedisUrl('redis://user:p@ss-w.re#d@h:1')).toContain('***');
  });
});

describe('parseRedisTarget', () => {
  it('applies the Redis default port when the URL omits one', () => {
    expect(parseRedisTarget('redis://cache.example')).toEqual({
      host: 'cache.example',
      port: 6379,
    });
  });

  it('keeps an explicit port', () => {
    expect(parseRedisTarget('redis://localhost:16399')).toEqual({
      host: 'localhost',
      port: 16399,
    });
  });

  it('normalises bracketed IPv6 loopback and case', () => {
    expect(parseRedisTarget('redis://[::1]:16399')).toEqual({ host: '::1', port: 16399 });
    expect(parseRedisTarget('redis://LOCALHOST:16399')?.host).toBe('localhost');
  });

  it('returns null for unparseable input or a missing host', () => {
    expect(parseRedisTarget('not-a-url')).toBeNull();
    expect(parseRedisTarget('redis://')).toBeNull();
  });
});

describe('resolveRedisIntegrationTarget — opt-in gate', () => {
  it('skips when REDIS_IT is absent', () => {
    const d = resolveRedisIntegrationTarget({});
    expect(d.mode).toBe('skip');
  });

  it('skips when REDIS_IT is set to anything other than exactly "1"', () => {
    for (const value of ['0', 'true', '', ' 1 ']) {
      expect(resolveRedisIntegrationTarget({ REDIS_IT: value }).mode).toBe('skip');
    }
  });

  it('fails fast when opted in but no REDIS_URL is supplied (no silent fallback)', () => {
    const env = disposableEnv();
    delete env['REDIS_URL'];
    const d = resolveRedisIntegrationTarget(env);
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') {
      expect(d.reason).toContain('REDIS_URL is not set');
    }
  });

  it('does not fall back to the ambient default port when REDIS_URL is an empty string', () => {
    const d = resolveRedisIntegrationTarget(disposableEnv({ REDIS_URL: '   ' }));
    expect(d.mode).toBe('fail');
  });
});

describe('resolveRedisIntegrationTarget — disposability attestation', () => {
  it('fails fast when the attestation is missing, even for an explicit URL', () => {
    const env = disposableEnv();
    delete env['REDIS_DISPOSABLE_ACK'];
    const d = resolveRedisIntegrationTarget(env);
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') {
      expect(d.reason).toContain('REDIS_DISPOSABLE_ACK=1 is required');
    }
  });

  it('fails fast when the attestation is present but the URL is unparseable', () => {
    const d = resolveRedisIntegrationTarget(disposableEnv({ REDIS_URL: 'redis not a url' }));
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') {
      expect(d.reason).toContain('not a parseable redis URL');
    }
  });
});

describe('resolveRedisIntegrationTarget — ambient vs CI service container', () => {
  it('fails fast on the ambient loopback default port outside CI', () => {
    const d = resolveRedisIntegrationTarget(
      disposableEnv({ REDIS_URL: 'redis://localhost:6379' }),
    );
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') {
      expect(d.reason).toContain('persistent shared instance');
    }
  });

  it('also fails fast for 127.0.0.1 on the default port outside CI', () => {
    expect(resolveRedisIntegrationTarget(disposableEnv({ REDIS_URL: 'redis://127.0.0.1:6379' })).mode).toBe('fail');
  });

  it('runs against the same address inside CI, where it is an ephemeral service container', () => {
    const d = resolveRedisIntegrationTarget(
      disposableEnv({ REDIS_URL: 'redis://localhost:6379', CI: 'true' }),
    );
    expect(d.mode).toBe('run');
    if (d.mode === 'run') expect(d.url).toBe('redis://localhost:6379');
  });

  it('treats CI=true case-insensitively', () => {
    expect(resolveRedisIntegrationTarget(disposableEnv({ REDIS_URL: 'redis://localhost:6379', CI: 'True' })).mode).toBe('run');
  });

  it('does not treat CI=true alone as blanket permission for a non-disposable host', () => {
    // In CI an explicit non-loopback URL is still accepted only with the attestation.
    const env: NodeJS.ProcessEnv = { REDIS_IT: '1', REDIS_URL: 'redis://redis:6379', CI: 'true' };
    expect(resolveRedisIntegrationTarget(env).mode).toBe('fail');
    expect(resolveRedisIntegrationTarget({ ...env, REDIS_DISPOSABLE_ACK: '1' }).mode).toBe('run');
  });

  it('accepts a non-loopback host on the default port once attested — port alone is not the decision', () => {
    const d = resolveRedisIntegrationTarget(disposableEnv({ REDIS_URL: 'redis://ci-redis.internal:6379' }));
    expect(d.mode).toBe('run');
  });

  it('accepts a loopback disposable instance on a non-default port', () => {
    expect(resolveRedisIntegrationTarget(disposableEnv()).mode).toBe('run');
  });
});

describe('resolveRedisIntegrationTarget — credential safety', () => {
  it('never echoes a password in the parse-failure reason', () => {
    const d = resolveRedisIntegrationTarget(
      disposableEnv({ REDIS_URL: 'redis://user:hunter2@' }),
    );
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') {
      expect(d.reason).not.toContain('hunter2');
      expect(d.reason).toContain('***');
    }
  });

  it('never echoes a password in the ambient-port rejection reason', () => {
    const d = resolveRedisIntegrationTarget(
      disposableEnv({ REDIS_URL: 'redis://user:hunter2@localhost:6379' }),
    );
    expect(d.mode).toBe('fail');
    if (d.mode === 'fail') expect(d.reason).not.toContain('hunter2');
  });

  it('exposes a redacted form for logging while keeping the raw form for connection', () => {
    const d = resolveRedisIntegrationTarget(
      disposableEnv({ REDIS_URL: 'redis://user:hunter2@ci-redis.internal:6379' }),
    );
    expect(d.mode).toBe('run');
    if (d.mode === 'run') {
      expect(d.url).toContain('hunter2'); // used only to connect
      expect(d.redactedUrl).not.toContain('hunter2'); // safe to log
    }
  });
});

describe('redisIntegrationGate', () => {
  it('throws with an actionable message on unsafe configuration', () => {
    const env = disposableEnv();
    delete env['REDIS_URL'];
    expect(() => redisIntegrationGate(env)).toThrow(/unsafe or incomplete configuration/);
  });

  it('returns a disabled gate with a reason when not opted in', () => {
    const gate = redisIntegrationGate({});
    expect(gate.enabled).toBe(false);
    expect(gate.url).toBe('');
    expect(gate.reason).toContain('REDIS_IT=1');
  });

  it('returns an enabled gate with both raw and redacted URLs when the target is safe', () => {
    const gate = redisIntegrationGate(disposableEnv());
    expect(gate.enabled).toBe(true);
    expect(gate.url).toBe('redis://localhost:16399');
    expect(gate.redactedUrl).toBe('redis://localhost:16399');
    expect(gate.reason).toBe('');
  });
});
