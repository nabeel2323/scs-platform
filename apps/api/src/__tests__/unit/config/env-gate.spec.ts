import { describe, it, expect } from 'vitest';
import {
  INSECURE_DEV_SECRET,
  MIN_SECRET_LENGTH,
  isProductionLikeEnv,
  resolveJwtAccessSecret,
  assertJwtConfig,
  INSECURE_DEV_OTP_HMAC_SECRET,
  MIN_OTP_HMAC_SECRET_LENGTH,
  resolveOtpHmacSecret,
  assertOtpHmacConfig,
  resolveTrustProxy,
} from '../../../config/env-gate';

/**
 * Production config gate unit tests (API-B7).
 *
 * The gate must fail fast when JWT_ACCESS_SECRET is missing, too weak, or still
 * the well-known dev default in any production-like environment, while keeping
 * local development/test working with the dev fallback.
 */

const STRONG = 'a-genuinely-strong-secret-value-0123456789';

describe('env-gate — isProductionLikeEnv', () => {
  it('treats development and test as non-production', () => {
    expect(isProductionLikeEnv('development')).toBe(false);
    expect(isProductionLikeEnv('test')).toBe(false);
    expect(isProductionLikeEnv('DEVELOPMENT')).toBe(false);
    expect(isProductionLikeEnv(undefined)).toBe(false); // defaults to development
  });

  it('treats staging/production (and unknown values) as production-like', () => {
    expect(isProductionLikeEnv('staging')).toBe(true);
    expect(isProductionLikeEnv('production')).toBe(true);
    expect(isProductionLikeEnv('prod')).toBe(true);
    expect(isProductionLikeEnv('qa')).toBe(true);
  });
});

describe('env-gate — resolveJwtAccessSecret', () => {
  it('throws in production when the secret is unset', () => {
    expect(() => resolveJwtAccessSecret({ nodeEnv: 'production' })).toThrow(
      /JWT_ACCESS_SECRET must be set/,
    );
    expect(() => resolveJwtAccessSecret({ nodeEnv: 'production', accessSecret: '' })).toThrow(
      /JWT_ACCESS_SECRET must be set/,
    );
    expect(() => resolveJwtAccessSecret({ nodeEnv: 'staging', accessSecret: '   ' })).toThrow(
      /JWT_ACCESS_SECRET must be set/,
    );
  });

  it('throws in production when the secret is the well-known dev default', () => {
    expect(() =>
      resolveJwtAccessSecret({ nodeEnv: 'production', accessSecret: INSECURE_DEV_SECRET }),
    ).toThrow(/well-known development default/);
  });

  it('throws in production when the secret is shorter than the minimum', () => {
    const short = 'x'.repeat(MIN_SECRET_LENGTH - 1);
    expect(() => resolveJwtAccessSecret({ nodeEnv: 'production', accessSecret: short })).toThrow(
      /at least 16 characters/,
    );
  });

  it('returns the provided secret in production when it is strong', () => {
    expect(resolveJwtAccessSecret({ nodeEnv: 'production', accessSecret: STRONG })).toBe(STRONG);
    expect(resolveJwtAccessSecret({ nodeEnv: 'staging', accessSecret: STRONG })).toBe(STRONG);
  });

  it('trims surrounding whitespace from the production secret', () => {
    expect(resolveJwtAccessSecret({ nodeEnv: 'production', accessSecret: `  ${STRONG}  ` })).toBe(
      STRONG,
    );
  });

  it('falls back to the dev default in development/test when unset or weak', () => {
    expect(resolveJwtAccessSecret({ nodeEnv: 'development' })).toBe(INSECURE_DEV_SECRET);
    expect(resolveJwtAccessSecret({ nodeEnv: 'test', accessSecret: 'short' })).toBe(
      INSECURE_DEV_SECRET,
    );
    expect(resolveJwtAccessSecret({})).toBe(INSECURE_DEV_SECRET);
  });

  it('honours a strong secret in development when provided', () => {
    expect(resolveJwtAccessSecret({ nodeEnv: 'development', accessSecret: STRONG })).toBe(STRONG);
  });
});

describe('env-gate — assertJwtConfig', () => {
  it('reads NODE_ENV + JWT_ACCESS_SECRET from the supplied env bag', () => {
    expect(
      assertJwtConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).toBe(STRONG);
    expect(() => assertJwtConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /JWT_ACCESS_SECRET must be set/,
    );
    expect(assertJwtConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(
      INSECURE_DEV_SECRET,
    );
  });
});

/**
 * OTP HMAC secret gate (S1.3 M-02).
 *
 * The OTP challenge is stored as HMAC(secret, otp+salt). If the secret is the
 * committed `.env.example` placeholder or otherwise weak, a single Redis read is
 * enough to precompute every code, so it must be refused outside development/test.
 */
const STRONG_OTP = 'a-uniquely-strong-otp-hmac-secret-value-64hex';

describe('env-gate — resolveOtpHmacSecret', () => {
  it('throws outside development when the secret is unset', () => {
    expect(() => resolveOtpHmacSecret({ nodeEnv: 'production' })).toThrow(
      /OTP_HMAC_SECRET must be set/,
    );
    expect(() => resolveOtpHmacSecret({ nodeEnv: 'staging', secret: '   ' })).toThrow(
      /OTP_HMAC_SECRET must be set/,
    );
  });

  it('throws outside development when the secret is the committed example/dev default', () => {
    expect(() =>
      resolveOtpHmacSecret({ nodeEnv: 'production', secret: INSECURE_DEV_OTP_HMAC_SECRET }),
    ).toThrow(/well-known development\/example default/);
    expect(() =>
      resolveOtpHmacSecret({ nodeEnv: 'staging', secret: INSECURE_DEV_OTP_HMAC_SECRET }),
    ).toThrow(/well-known development\/example default/);
  });

  it('throws outside development when the secret is shorter than the minimum', () => {
    const short = 'x'.repeat(MIN_OTP_HMAC_SECRET_LENGTH - 1);
    expect(() => resolveOtpHmacSecret({ nodeEnv: 'production', secret: short })).toThrow(
      /at least 32 characters/,
    );
  });

  it('returns the provided secret outside development when it is strong', () => {
    expect(resolveOtpHmacSecret({ nodeEnv: 'production', secret: STRONG_OTP })).toBe(STRONG_OTP);
    expect(resolveOtpHmacSecret({ nodeEnv: 'staging', secret: STRONG_OTP })).toBe(STRONG_OTP);
  });

  it('trims surrounding whitespace from the production secret', () => {
    expect(resolveOtpHmacSecret({ nodeEnv: 'production', secret: `  ${STRONG_OTP}  ` })).toBe(
      STRONG_OTP,
    );
  });

  it('errors never echo the secret value', () => {
    const leaked = 'sup3r-s3cret-must-not-appear-in-errors-xx';
    let message = '';
    try {
      // Too short variant of a secret-looking value would still be rejected on length,
      // but the error must not print the value itself.
      resolveOtpHmacSecret({ nodeEnv: 'production', secret: 'short' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain('short');
    expect(message).not.toContain(leaked);
  });

  it('falls back to the dev default in development/test when unset or weak', () => {
    expect(resolveOtpHmacSecret({ nodeEnv: 'development' })).toBe(INSECURE_DEV_OTP_HMAC_SECRET);
    expect(resolveOtpHmacSecret({ nodeEnv: 'test', secret: 'short' })).toBe(
      INSECURE_DEV_OTP_HMAC_SECRET,
    );
    expect(resolveOtpHmacSecret({})).toBe(INSECURE_DEV_OTP_HMAC_SECRET);
  });

  it('honours a strong secret in development when provided', () => {
    expect(resolveOtpHmacSecret({ nodeEnv: 'development', secret: STRONG_OTP })).toBe(STRONG_OTP);
  });
});

describe('env-gate — assertOtpHmacConfig', () => {
  it('reads NODE_ENV + OTP_HMAC_SECRET from the supplied env bag', () => {
    expect(
      assertOtpHmacConfig({
        NODE_ENV: 'production',
        OTP_HMAC_SECRET: STRONG_OTP,
      } as NodeJS.ProcessEnv),
    ).toBe(STRONG_OTP);
    expect(() =>
      assertOtpHmacConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/OTP_HMAC_SECRET must be set/);
    expect(() =>
      assertOtpHmacConfig({
        NODE_ENV: 'production',
        OTP_HMAC_SECRET: INSECURE_DEV_OTP_HMAC_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/well-known development\/example default/);
    expect(
      assertOtpHmacConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toBe(INSECURE_DEV_OTP_HMAC_SECRET);
  });
});

// ── S1.7: Proxy trust configuration tests ─────────────────────────

describe('env-gate — resolveTrustProxy', () => {
  it('returns false for unset, empty, "false", and "0"', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('')).toBe(false);
    expect(resolveTrustProxy('  ')).toBe(false);
    expect(resolveTrustProxy('false')).toBe(false);
    expect(resolveTrustProxy('FALSE')).toBe(false);
    expect(resolveTrustProxy('0')).toBe(false);
  });

  it('returns true for "true"', () => {
    expect(resolveTrustProxy('true')).toBe(true);
    expect(resolveTrustProxy('TRUE')).toBe(true);
    expect(resolveTrustProxy('  true  ')).toBe(true);
  });

  it('returns a number for a positive integer hop count', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
    expect(resolveTrustProxy('5')).toBe(5);
  });

  it('returns a string array for comma-separated IPs/CIDRs', () => {
    expect(resolveTrustProxy('10.0.0.1')).toEqual(['10.0.0.1']);
    expect(resolveTrustProxy('10.0.0.1,172.16.0.0/12')).toEqual([
      '10.0.0.1',
      '172.16.0.0/12',
    ]);
    expect(resolveTrustProxy(' 10.0.0.1 , 192.168.1.1 ')).toEqual([
      '10.0.0.1',
      '192.168.1.1',
    ]);
  });

  it('rejects wildcard entries', () => {
    expect(() => resolveTrustProxy('*')).toThrow(/unrestricted entry/);
    expect(() => resolveTrustProxy('10.0.0.1,*')).toThrow(/unrestricted entry/);
    expect(() => resolveTrustProxy('0.0.0.0/0')).toThrow(/unrestricted entry/);
  });
});
