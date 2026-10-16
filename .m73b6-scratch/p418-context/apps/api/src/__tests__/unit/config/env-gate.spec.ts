import { describe, it, expect } from 'vitest';
import {
  INSECURE_DEV_SECRET,
  MIN_SECRET_LENGTH,
  isProductionLikeEnv,
  resolveJwtAccessSecret,
  assertJwtConfig,
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
