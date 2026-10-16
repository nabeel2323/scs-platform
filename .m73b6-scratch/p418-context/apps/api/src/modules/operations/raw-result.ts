/**
 * Typed accessor for raw SQL results produced by `db.execute(sql\`...\`)`.
 *
 * Drizzle types the return of `execute()` as an unknown-shaped result, while
 * node-postgres actually resolves to a `QueryResult` carrying `rows` (and
 * `rowCount`). Every raw read in the operations module goes through here so the
 * cast happens in one reviewed place and callers get a real array even when the
 * driver hands back something unexpected.
 */

/** Rows from a pg QueryResult-shaped object, or [] when absent/malformed. */
export function readRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: T[] } | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
}

/** First row, or undefined — used instead of `rows[0]` under noUncheckedIndexedAccess. */
export function firstRow<T>(result: unknown): T | undefined {
  return readRows<T>(result)[0];
}

/** `rowCount` for UPDATE/INSERT statements that did not use RETURNING. */
export function affectedRows(result: unknown): number {
  const count = (result as { rowCount?: number | string } | undefined)?.rowCount;
  const parsed = typeof count === 'string' ? Number.parseInt(count, 10) : count;
  return Number.isFinite(parsed as number) ? Number(parsed) : 0;
}

/**
 * Coerce a timestamp column read through `execute()`.
 *
 * Verified against the live driver: raw `execute()` returns booleans and
 * `int4` as real JS values, but `timestamptz`, `date`, `numeric` and `bigint`
 * come back as STRINGS. Any code that calls `getTime()`/`toISOString()` on such
 * a value throws at runtime, so every timestamp read in this module is funnelled
 * through here instead of trusting the compile-time `Date` annotation.
 *
 * Returns null for absent/unparsable input, which callers must treat as "no
 * observation" rather than as epoch 0.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const fromMillis = new Date(value);
    return Number.isNaN(fromMillis.getTime()) ? null : fromMillis;
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text) return null;

  // Postgres prints timestamptz as `YYYY-MM-DD HH:MM:SS[.ffffff]+HH` (or +HHMM /
  // +HH:MM). JS rejects the bare two-digit offset, so normalise it to a full
  // ISO-8601 offset before parsing.
  const match = PG_TIMESTAMP.exec(text);
  const iso = match
    ? `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5] ?? '00'}`
    : text;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const PG_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-])(\d{2})(?::?(\d{2}))?$/;

/** Numeric coercion for `bigint`/`numeric` string results. */
export function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}

