/**
 * Production configuration gate (API-B7).
 *
 * The JWT access-token signing secret must never fall back to the shared
 * development default outside local development. Booting staging/production
 * with the well-known `dev-secret-change-me-...` string would let anyone
 * forge access tokens, so we validate at startup and fail fast instead of
 * silently degrading to an insecure secret.
 *
 * The helpers here are pure (no `process.env` reads) so they can be unit
 * tested directly; callers pass the raw environment values in.
 */

/** The insecure fallback used only for local development / tests. */
export const INSECURE_DEV_SECRET = 'dev-secret-change-me-min-16-chars!!';

/** Minimum acceptable length for a signing secret. */
export const MIN_SECRET_LENGTH = 16;

export interface JwtSecretGateInput {
  /** Value of NODE_ENV; defaults to 'development' when unset. */
  nodeEnv?: string;
  /** Value of JWT_ACCESS_SECRET. */
  accessSecret?: string;
}

/**
 * Whether the given NODE_ENV should enforce production-grade configuration.
 * `development` and `test` are exempt so local tooling and the test suite keep
 * working without secrets configured.
 */
export function isProductionLikeEnv(nodeEnv?: string): boolean {
  const env = (nodeEnv ?? 'development').trim().toLowerCase();
  return env !== 'development' && env !== 'test';
}

/**
 * Resolve the JWT access-token signing secret, enforcing production rules.
 *
 * - In production-like environments (`staging`, `production`, or any value
 *   other than `development`/`test`): the secret MUST be present, must not be
 *   the well-known dev default, and must be at least {@link MIN_SECRET_LENGTH}
 *   characters. Otherwise this throws and the process refuses to boot.
 * - In development/test: returns the provided secret when it is strong enough,
 *   otherwise the insecure dev default (preserving the existing local DX).
 *
 * @throws Error when the secret is missing/weak/dev-default outside dev.
 */
export function resolveJwtAccessSecret(input: JwtSecretGateInput = {}): string {
  const { nodeEnv, accessSecret } = input;
  const secret = accessSecret?.trim();

  if (isProductionLikeEnv(nodeEnv)) {
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET must be set outside development. ' +
          'Refusing to boot with the insecure dev default — configure a unique secret of at least ' +
          `${MIN_SECRET_LENGTH} characters.`,
      );
    }
    if (secret === INSECURE_DEV_SECRET) {
      throw new Error(
        'JWT_ACCESS_SECRET is set to the well-known development default. ' +
          'Set a unique, strong secret outside development.',
      );
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters outside development ` +
          `(got ${secret.length}).`,
      );
    }
    return secret;
  }

  // Development / test: allow the dev default fallback for convenience.
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : INSECURE_DEV_SECRET;
}

/**
 * Validate JWT configuration from the ambient environment and fail fast on
 * misconfiguration. Intended to be called at the very start of bootstrap so
 * the process exits before binding a port or opening connections.
 *
 * @returns the resolved access secret to hand to JwtModule.
 */
export function assertJwtConfig(env: NodeJS.ProcessEnv = process.env): string {
  return resolveJwtAccessSecret({
    nodeEnv: env['NODE_ENV'],
    accessSecret: env['JWT_ACCESS_SECRET'],
  });
}
