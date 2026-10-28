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

// ── OTP HMAC secret gate (S1.3, audit finding M-02) ─────────────

/**
 * The insecure development fallback for the OTP challenge-storage secret. It is
 * the same value shipped in `.env.example`, so an operator who copies the example
 * straight into a deployment is using this exact string — which is why it is
 * refused outside development/test.
 */
export const INSECURE_DEV_OTP_HMAC_SECRET =
  'dev-hmac-secret-change-me-in-production-64chars-minimum!!';

/** Minimum acceptable length for the OTP HMAC secret (HMAC-SHA256 key material). */
export const MIN_OTP_HMAC_SECRET_LENGTH = 32;

export interface OtpHmacSecretGateInput {
  /** Value of NODE_ENV; defaults to 'development' when unset. */
  nodeEnv?: string;
  /** Value of OTP_HMAC_SECRET. */
  secret?: string;
}

/**
 * Resolve the OTP HMAC storage secret, enforcing production rules.
 *
 * OTP values are stored as `HMAC-SHA256(secret, otp + salt)`. If the secret is a
 * known public value, a Redis read alone is enough to precompute every code and
 * reverse the protection, so outside development/test the secret MUST be present,
 * must not be the committed `.env.example` placeholder, and must be at least
 * {@link MIN_OTP_HMAC_SECRET_LENGTH} characters. Errors never echo the secret.
 *
 * - Development/test: returns the provided secret when strong enough, otherwise
 *   the documented dev default so local tooling and the test suite keep working.
 * - Production-like: throws on missing/placeholder/short values.
 *
 * @throws Error when the secret is missing, a known default, or too short outside dev.
 */
export function resolveOtpHmacSecret(input: OtpHmacSecretGateInput = {}): string {
  const { nodeEnv, secret: raw } = input;
  const secret = raw?.trim();

  if (isProductionLikeEnv(nodeEnv)) {
    if (!secret) {
      throw new Error(
        'OTP_HMAC_SECRET must be set outside development. ' +
          'Refusing to boot with the insecure development default — generate a unique secret of at ' +
          `least ${MIN_OTP_HMAC_SECRET_LENGTH} characters with: ` +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))".`,
      );
    }
    if (secret === INSECURE_DEV_OTP_HMAC_SECRET) {
      throw new Error(
        'OTP_HMAC_SECRET is set to the well-known development/example default. ' +
          'It is committed in .env.example and must be replaced with a unique, strong secret ' +
          'outside development.',
      );
    }
    if (secret.length < MIN_OTP_HMAC_SECRET_LENGTH) {
      throw new Error(
        `OTP_HMAC_SECRET must be at least ${MIN_OTP_HMAC_SECRET_LENGTH} characters outside ` +
          `development (got ${secret.length}).`,
      );
    }
    return secret;
  }

  // Development / test: allow the documented dev fallback for a working local flow.
  return secret &&
    secret.length >= MIN_OTP_HMAC_SECRET_LENGTH &&
    secret !== INSECURE_DEV_OTP_HMAC_SECRET
    ? secret
    : INSECURE_DEV_OTP_HMAC_SECRET;
}

/**
 * Validate OTP HMAC configuration from the ambient environment and fail fast on
 * misconfiguration. Never prints the secret value.
 */
export function assertOtpHmacConfig(env: NodeJS.ProcessEnv = process.env): string {
  return resolveOtpHmacSecret({
    nodeEnv: env['NODE_ENV'],
    secret: env['OTP_HMAC_SECRET'],
  });
}

/**
 * The development-only database DSN. Kept as a named constant instead of an inline
 * literal so the place that decides "this is a local dev credential" is one place.
 */
export const DEV_DATABASE_URL =
  'postgresql://scs:scs_dev_2026@127.0.0.1:25433/scs_platform';

/** The development-only Redis endpoint. */
export const DEV_REDIS_URL = 'redis://localhost:6379';

/**
 * Resolve the PostgreSQL connection string (P13 Phase 4.1, finding F-4).
 *
 * `DatabaseService` used to fall back to {@link DEV_DATABASE_URL} unconditionally.
 * In development that is convenient; in a production-like environment it is a
 * silent misroute — the process would boot, bind a port, and then either fail
 * against an unreachable host or, worse, connect to whatever local database happened
 * to be listening. So outside development/test the variable is required.
 *
 * @throws Error when DATABASE_URL is absent outside development/test.
 */
export function resolveDatabaseUrl(input: {
  nodeEnv?: string;
  url?: string;
} = {}): string {
  const url = input.url?.trim();
  if (url) return url;
  if (isProductionLikeEnv(input.nodeEnv)) {
    throw new Error(
      'DATABASE_URL must be set outside development. Refusing to fall back to the ' +
        'local development database — that DSN is a dev credential and points at a host ' +
        'that should not exist in a deployed environment.',
    );
  }
  return DEV_DATABASE_URL;
}

/**
 * Resolve the Redis endpoint (same reasoning as {@link resolveDatabaseUrl}).
 * Redis is on the authentication path — it holds the access-token denylist that
 * `JwtAuthGuard` consults on every request — so connecting to an unintended Redis
 * is an auth-control failure, not a cache miss.
 *
 * @throws Error when REDIS_URL is absent outside development/test.
 */
export function resolveRedisUrl(input: {
  nodeEnv?: string;
  url?: string;
} = {}): string {
  const url = input.url?.trim();
  if (url) return url;
  if (isProductionLikeEnv(input.nodeEnv)) {
    throw new Error(
      'REDIS_URL must be set outside development. Redis carries the token denylist, ' +
        'so defaulting to localhost would silently change authentication behaviour.',
    );
  }
  return DEV_REDIS_URL;
}

/**
 * Non-sensitive description of the configured P13 alert sink.
 *
 * Deliberately carries no URL, no host, and no path: a webhook URL is an operator
 * secret (the host alone identifies the monitoring provider, and many schemes embed
 * a token in the path or query). This shape is safe to return from a status endpoint
 * and safe to log.
 */
export interface AlertSinkStatus {
  /** Whether any sink is configured at all. */
  configured: boolean;
  /** `'webhook'` or `'log-only'` — the same vocabulary OpsAlertService uses. */
  channel: 'webhook' | 'log-only';
  /** Present only when the URL is set but unusable. Never echoes the value. */
  invalidReason?: 'not_absolute_url' | 'unsupported_protocol';
}

/** Allowed protocols for an alert webhook. Anything else is a configuration error. */
const ALLOWED_ALERT_PROTOCOLS = new Set(['https:', 'http:']);

/**
 * Classify the alert sink configuration without exposing it (P13 Phase 4.1 Stage F).
 *
 * An unset value is valid and means log-only — the documented Phase 4 limitation, not
 * a misconfiguration. A *set but malformed* value is the dangerous case: the operator
 * believes alerts are going somewhere while they are not, so it is reported.
 */
export function describeAlertSink(webhookUrl?: string): AlertSinkStatus {
  const raw = webhookUrl?.trim();
  if (!raw) return { configured: false, channel: 'log-only' };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      configured: true,
      channel: 'webhook',
      invalidReason: 'not_absolute_url',
    };
  }

  if (!ALLOWED_ALERT_PROTOCOLS.has(parsed.protocol)) {
    return {
      configured: true,
      channel: 'webhook',
      invalidReason: 'unsupported_protocol',
    };
  }

  // Credentials embedded in the URL would be a plaintext secret in transit; the
  // presence check is reported without ever including the value itself.
  if (parsed.username || parsed.password) {
    return {
      configured: true,
      channel: 'webhook',
      invalidReason: 'unsupported_protocol',
    };
  }

  return { configured: true, channel: 'webhook' };
}

/**
 * Full production configuration gate. Called from `main.ts` immediately after
 * {@link assertJwtConfig}, before the app is created.
 *
 * No-op in development/test so local tooling and the ~100 existing specs keep
 * working without secrets. Outside them it fails fast on the fallbacks that are
 * unsafe in a deployed environment, and on an alert sink that is configured but
 * could never deliver.
 */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): AlertSinkStatus {
  if (!isProductionLikeEnv(env['NODE_ENV'])) {
    return describeAlertSink(env['P13_OPS_ALERT_WEBHOOK_URL']);
  }

  resolveDatabaseUrl({ nodeEnv: env['NODE_ENV'], url: env['DATABASE_URL'] });
  resolveRedisUrl({ nodeEnv: env['NODE_ENV'], url: env['REDIS_URL'] });

  const sink = describeAlertSink(env['P13_OPS_ALERT_WEBHOOK_URL']);
  if (sink.invalidReason) {
    throw new Error(
      'P13_OPS_ALERT_WEBHOOK_URL is set but unusable (' +
        `${sink.invalidReason}). ` +
        'An operator who believes alerts are being delivered would be wrong, so the ' +
        'process refuses to start. Set an absolute https:// URL, or clear the variable ' +
        'to choose log-only explicitly.',
    );
  }
  return sink;
}

// ── S1.7: Proxy trust configuration ─────────────────────────────

/**
 * Valid shapes for the Express `trust proxy` setting.
 *
 * - `false`: do not trust any proxy (direct connections only — the safe default).
 * - `true`: trust all proxies (NOT recommended — allows header spoofing).
 * - `number`: trust the Nth hop from the right (e.g. 1 = the immediate connection).
 * - `string[]`: explicit trusted proxy addresses (IPs, CIDRs, or hostnames).
 */
export type TrustProxyValue = false | true | number | string[];

/**
 * Resolve the `TRUST_PROXY` environment variable into a value suitable for
 * `app.set('trust proxy', ...)`.
 *
 * Supported formats:
 * - unset / `false` / `0` → `false` (default — no proxy trust)
 * - `true` → `true` (trust all — logged as a warning; not for production)
 * - a positive integer → hop count (e.g. `1` = trust the first proxy)
 * - comma-separated IPs/CIDRs → string array (e.g. `10.0.0.1,172.16.0.0/12`)
 *
 * Invalid values throw at startup so misconfiguration is caught immediately.
 */
export function resolveTrustProxy(raw?: string): TrustProxyValue {
  const value = raw?.trim();
  if (!value || value.toLowerCase() === 'false' || value === '0') {
    return false;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  // Numeric hop count.
  const asNumber = Number(value);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    return asNumber;
  }
  // Comma-separated addresses/CIDRs.
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    // Reject obviously invalid entries (wildcards, empty after trim).
    for (const part of parts) {
      if (part === '*' || part === '0.0.0.0/0') {
        throw new Error(
          `TRUST_PROXY contains an unrestricted entry ("${part}"). ` +
            'Use explicit proxy IPs or CIDRs instead.',
        );
      }
    }
    return parts;
  }
  throw new Error(
    `TRUST_PROXY has an unrecognised value ("${raw}"). ` +
      'Expected: false, true, a positive integer hop count, or comma-separated IPs/CIDRs.',
  );
}
