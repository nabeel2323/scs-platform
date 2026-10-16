import { Logger } from '@nestjs/common';

const logger = new Logger('QueryMetrics');

/** Threshold (ms) above which a query is logged as slow. */
const SLOW_QUERY_MS = Number(process.env['SLOW_QUERY_MS'] ?? 200);

/**
 * PHASE 8: Wrap an async operation with timing instrumentation.
 * Logs a warning when the operation exceeds SLOW_QUERY_MS.
 *
 * @param label  A human-readable identifier (e.g. 'getProductDetail:uuid')
 * @param fn     The async function to time
 */
export async function timeQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  if (elapsed >= SLOW_QUERY_MS) {
    logger.warn(`Slow query: ${label} took ${elapsed}ms (threshold: ${SLOW_QUERY_MS}ms)`);
  }
  return result;
}

/**
 * PHASE 8: Track cache hit/miss ratio for a given operation.
 * Lightweight wrapper with Redis or in-memory counters.
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
}

const metricsStore = new Map<string, CacheMetrics>();

export function getCacheMetrics(key: string): CacheMetrics {
  let m = metricsStore.get(key);
  if (!m) { m = { hits: 0, misses: 0, errors: 0 }; metricsStore.set(key, m); }
  return m;
}

export function recordCacheHit(key: string) { getCacheMetrics(key).hits++; }
export function recordCacheMiss(key: string) { getCacheMetrics(key).misses++; }
export function recordCacheError(key: string) { getCacheMetrics(key).errors++; }

/** Snapshot all metrics (for health/debug endpoint). */
export function snapshotCacheMetrics(): Record<string, CacheMetrics> {
  return Object.fromEntries(metricsStore);
}
