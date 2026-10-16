/**
 * JWT access-token denylist helpers (API-B9).
 *
 * Access tokens are stateless: once issued they verify successfully until they
 * expire (15 min). To revoke a specific token *early* — e.g. the prior token
 * when a user switches organizations, closing the stale-permission window — we
 * record its `jti` in Redis with a TTL equal to the token's remaining lifetime.
 *
 * `JwtAuthGuard` checks this denylist on every authenticated request, so a
 * revoked token is rejected immediately even though its signature is still
 * cryptographically valid. Entries expire on their own once the token would
 * have expired anyway, so the denylist stays bounded.
 *
 * These helpers are pure (no I/O) so the key format and TTL math are shared and
 * unit-testable across the guard and the identity service.
 */

/** Redis key prefix for revoked access-token JTIs. */
export const DENYLIST_KEY_PREFIX = 'jwt:deny:';

/** Build the Redis denylist key for a given JTI. */
export function denylistKey(jti: string): string {
  return `${DENYLIST_KEY_PREFIX}${jti}`;
}

/**
 * Whole seconds from now until the given JWT `exp` claim (epoch seconds).
 * Returns 0 when `exp` is missing or already in the past — an expired token
 * needs no denylist entry because verification already rejects it.
 */
export function secondsUntilExp(
  exp: number | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): number {
  if (!exp || !Number.isFinite(exp)) return 0;
  return Math.max(0, Math.ceil(exp - nowSec));
}
