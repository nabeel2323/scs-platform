/**
 * UUID helpers.
 *
 * Postgres rejects malformed UUID literals at the driver level, so any
 * user-supplied value compared against a `uuid` column must be validated
 * first — otherwise the query throws and surfaces as an unhandled 500.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leading fragment of a UUID — hex only, up to full length minus dashes. */
const UUID_PREFIX_PATTERN = /^[0-9a-f]{1,36}$/i;

/** True for a canonical 8-4-4-4-12 hex UUID. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * True for a hex prefix of a UUID. The admin console lists truncated IDs
 * (first 8 chars), so its filters accept a prefix and match with ILIKE.
 */
export function isUuidPrefix(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PREFIX_PATTERN.test(value);
}
