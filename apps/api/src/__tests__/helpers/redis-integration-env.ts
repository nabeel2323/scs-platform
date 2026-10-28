/**
 * S1.12 — Redis integration-test environment contract (Remediation A).
 *
 * PURPOSE
 * These helpers replace the per-spec `process.env.REDIS_URL ?? 'redis://localhost:6379'`
 * fallback that let real-Redis integration suites silently connect to the ambient,
 * persistent developer Redis (`scs-redis`). See D-SAFE-1 in
 * docs/production/SCS-OTP-S1.11-PREPARATION-AND-OWNER-INPUT-REPORT.md.
 *
 * THE CONTRACT (evaluated at collection time, so a misconfiguration cannot be
 * mistaken for a pass):
 *
 *   1. `REDIS_IT` !== '1'                -> SKIP. Unit runs and any job that does
 *      not provision Redis stay green, exactly as before. A SKIP IS NOT A PASS.
 *   2. `REDIS_IT` === '1', no `REDIS_URL` -> FAIL FAST, actionable message.
 *      Opting in to real-Redis tests is an explicit intent to run them, so a
 *      missing target is a configuration error, not a reason to skip silently.
 *   3. `REDIS_URL` unparseable            -> FAIL FAST.
 *   4. `REDIS_DISPOSABLE_ACK` !== '1'     -> FAIL FAST. An explicitly supplied URL
 *      is NOT by itself proof that the target is disposable; the operator or CI job
 *      must affirmatively attest it. This is the safeguard that port numbers alone
 *      could never provide.
 *   5. loopback + effective port 6379, not in CI -> FAIL FAST. This is the ambient
 *      persistent developer instance. Note the port is only ONE of three conditions
 *      (loopback AND 6379 AND not CI) — port number alone never decides safety:
 *        * GitHub Actions provisions an EPHEMERAL `redis:7-alpine` service
 *          container at `redis://localhost:6379` (ci.yml `test-integration`), which
 *          is safe and must keep running, because `CI=true` is set by the runner.
 *        * A disposable instance reached over a non-loopback host on port 6379 is
 *          accepted once the disposability attestation is given.
 *
 * LOCAL USAGE
 *   docker run -d --name <unique-name> -p <unused-host-port>:6379 redis:7-alpine
 *   $env:REDIS_IT='1'
 *   $env:REDIS_URL='redis://localhost:<unused-host-port>'   # never 6379 locally
 *   $env:REDIS_DISPOSABLE_ACK='1'
 *   pnpm --filter @scs/api test:integration
 *
 * CREDENTIAL SAFETY
 * Never log or embed a raw `REDIS_URL`: userinfo passwords must pass through
 * {@link redactRedisUrl} first.
 */
export type RedisTargetDecision =
  | { mode: 'skip'; reason: string }
  | { mode: 'fail'; reason: string }
  | { mode: 'run'; url: string; redactedUrl: string };

/** Result handed to an integration spec by {@link redisIntegrationGate}. */
export interface RedisIntegrationGate {
  /** True only when real-Redis suites may execute against `url`. */
  enabled: boolean;
  /** Raw target URL — never log this directly; use {@link redactedUrl}. */
  url: string;
  /** Credential-safe form, safe for console output and report files. */
  redactedUrl: string;
  /** Why the suite is disabled; empty when enabled. */
  reason: string;
}

/** Default port Redis listens on when a URL omits one — also the dev instance's port. */
const DEFAULT_REDIS_PORT = 6379;

/** Hostnames that denote "this machine", i.e. where the persistent dev Redis lives. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.1', '::1', '[::1]']);

/**
 * Mask userinfo passwords so a Redis URL can be logged safely.
 * `redis://user:secret@h:1` -> `redis://user:***@h:1`; leaves credential-free URLs intact.
 */
export function redactRedisUrl(url: string): string {
  return url.replace(/(:)([^:@/]+)(@)/, '$1***$3');
}

/** Resolve the effective host and port, applying the Redis default port when absent. */
export function parseRedisTarget(
  url: string,
): { host: string; port: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return null;
  const rawPort = parsed.port;
  if (rawPort && !/^\d{1,5}$/.test(rawPort)) return null;
  const port = rawPort ? Number(rawPort) : DEFAULT_REDIS_PORT;
  return { host, port };
}

/**
 * Decide whether real-Redis integration tests may run, and against which target.
 * Pure function of the environment so it is unit-testable without any Redis.
 */
export function resolveRedisIntegrationTarget(
  env: NodeJS.ProcessEnv = process.env,
): RedisTargetDecision {
  if (env['REDIS_IT'] !== '1') {
    return {
      mode: 'skip',
      reason:
        'real-Redis integration disabled: set REDIS_IT=1 (plus an explicit ' +
        'REDIS_URL and REDIS_DISPOSABLE_ACK=1) to run these suites. A skipped ' +
        'suite does not satisfy the real-Redis gate.',
    };
  }

  const raw = (env['REDIS_URL'] ?? '').trim();
  if (!raw) {
    return {
      mode: 'fail',
      reason:
        'REDIS_IT=1 opts in to real-Redis integration tests but REDIS_URL is not set. ' +
        'No implicit fallback is provided: point REDIS_URL at a DISPOSABLE instance ' +
        '(e.g. redis://localhost:<unused-host-port>) and set REDIS_DISPOSABLE_ACK=1. ' +
        'To run only unit tests, unset REDIS_IT.',
    };
  }

  if (env['REDIS_DISPOSABLE_ACK'] !== '1') {
    return {
      mode: 'fail',
      reason:
        'REDIS_DISPOSABLE_ACK=1 is required when REDIS_IT=1: an explicitly supplied ' +
        'REDIS_URL is not by itself proof that the target is disposable. Set it only ' +
        'for an instance that no other process relies on.',
    };
  }

  const target = parseRedisTarget(raw);
  if (!target) {
    return {
      mode: 'fail',
      reason:
        `REDIS_URL is not a parseable redis URL ("${redactRedisUrl(raw)}"). ` +
        'Expected redis://[user:pass@]host[:port] or rediss://host[:port].',
    };
  }

  const inCi = String(env['CI'] ?? '').trim().toLowerCase() === 'true';
  const ambientDevEndpoint = LOOPBACK_HOSTS.has(target.host) && target.port === DEFAULT_REDIS_PORT;
  if (ambientDevEndpoint && !inCi) {
    return {
      mode: 'fail',
      reason:
        `REDIS_URL targets the loopback default Redis port (${redactRedisUrl(raw)}), which on a ` +
        'developer machine is the persistent shared instance. Start a disposable Redis on an ' +
        'unused host port instead, e.g. ' +
        '"docker run -d --name <unique> -p <unused-port>:6379 redis:7-alpine" with ' +
        'REDIS_URL=redis://localhost:<unused-port>. In CI the same address is an ephemeral ' +
        'service container and is accepted (detected via CI=true).',
    };
  }

  return { mode: 'run', url: raw, redactedUrl: redactRedisUrl(raw) };
}

/**
 * Collection-time gate used by every real-Redis integration spec.
 * Returns the target when enabled; throws with an actionable message when the
 * configuration is unsafe, so a misconfigured run FAILS LOUDLY instead of
 * silently skipping or silently touching the wrong instance.
 */
export function redisIntegrationGate(
  env: NodeJS.ProcessEnv = process.env,
): RedisIntegrationGate {
  const decision = resolveRedisIntegrationTarget(env);
  if (decision.mode === 'fail') {
    throw new Error(`[redis-integration-env] unsafe or incomplete configuration: ${decision.reason}`);
  }
  if (decision.mode === 'skip') {
    return { enabled: false, url: '', redactedUrl: '', reason: decision.reason };
  }
  return { enabled: true, url: decision.url, redactedUrl: decision.redactedUrl, reason: '' };
}
