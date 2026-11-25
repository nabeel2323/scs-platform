/**
 * Narrow, typed access to node-postgres rows returned by Drizzle execute().
 * Malformed driver results intentionally resolve to an empty collection.
 */
export function readRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: T[] } | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
}
