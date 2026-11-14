/**
 * S1.12 — Run-scoped throttling-key cleanup (Remediation B).
 *
 * PROBLEM
 * The throttling integration suites cleaned up with
 * `SCAN MATCH scs:throttle:* -> DEL <everything found>`. That deletes keys created
 * by OTHER test runs, other spec files executing in parallel, and any live
 * development process sharing the instance. `cross-instance-throttling.spec.ts`
 * went further and issued a blocking `KEYS scs:throttle:*` followed by a per-key
 * `DEL` inside a test body. Its `${NS}:*` teardown never matched those keys at all,
 * because the storage prefixes a *hashed* key (see below) — so the "namespace
 * isolation" claimed in its comments was not real.
 *
 * KEY CONSTRUCTION (verified by reading the production source)
 * `RedisThrottlerStorageService.increment()` builds
 *     `scs:throttle:<key>` and `scs:throttle:<key>:blocked`
 * where `<key>` is supplied by the caller. `@nestjs/throttler` hashes
 * `Controller-method-profile-tracker` before calling it, so **the client IP does
 * not appear in the key name**. Pattern-matching on tracker names is therefore
 * useless as an isolation proof, and per-run prefixes cannot be assumed.
 *
 * APPROACH — two mechanisms, strongest available chosen per suite:
 *   1. `deleteExactKeys()` — when a suite constructs the keys itself it knows the
 *      full key name and deletes precisely those, with no scanning at all.
 *   2. `createThrottleKeyLedger()` — for suites where the framework builds the key
 *      internally. `captureBaseline()` records every throttling key that already
 *      exists BEFORE this run writes anything; cleanup then deletes only keys that
 *      are new since that baseline. Anything pre-existing — a sentinel, another
 *      run's counters, a development process's state — is preserved by definition.
 *
 * RESIDUAL LIMITATION (documented, mitigated but not eliminated)
 * Mechanism 2 classifies "new since baseline" as "mine". If two suites run in
 * parallel against one Redis, each sees the other's new keys and may delete them.
 * That is why Remediation C serialises integration files
 * (`--no-file-parallelism`). Do not remove the serialisation while any suite uses
 * the ledger.
 *
 * All listing here uses non-blocking `SCAN` (never `KEYS`), and no destructive
 * command is ever issued against a whole database.
 */

import { createHash } from 'node:crypto';
import type Redis from 'ioredis';

/** Production throttling namespace prefix — must mirror redis-throttler-storage.service.ts. */
export const THROTTLE_KEY_PREFIX = 'scs:throttle:';

/** Cursor batch size for SCAN; keeps each round-trip cheap and non-blocking. */
const SCAN_COUNT = 200;

/** DEL accepts many keys, but chunk to keep command size bounded. */
const DEL_CHUNK = 500;

/**
 * Enumerate every key under the throttling prefix using SCAN.
 * Read-only: never mutates, so it is safe against any instance.
 */
export async function listThrottleKeys(client: Redis): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', `${THROTTLE_KEY_PREFIX}*`, 'COUNT', SCAN_COUNT);
    cursor = next;
    for (const key of batch) if (!found.includes(key)) found.push(key);
  } while (cursor !== '0');
  return found;
}

/** Delete a specific, caller-enumerated key set. Empty sets are a no-op. */
export async function deleteExactKeys(client: Redis, keys: readonly string[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += DEL_CHUNK) {
    const chunk = keys.slice(i, i + DEL_CHUNK);
    if (chunk.length > 0) deleted += await client.del(...chunk);
  }
  return deleted;
}

export interface ThrottleKeyLedger {
  /** Record the pre-existing keyspace. Call BEFORE the suite creates any key. */
  captureBaseline(): Promise<{ baselineCount: number }>;
  /**
   * Delete only keys that appeared after the baseline.
   * Returns what was removed and, for auditing, what was deliberately preserved.
   */
  cleanupRunKeys(): Promise<{ deleted: string[]; preservedPreexisting: number }>;
  /** Keys created since the baseline that still exist (diagnostics / assertions). */
  runKeysOutstanding(): Promise<string[]>;
  /** Snapshot of all throttling keys right now. */
  snapshot(): Promise<string[]>;
}

/**
 * Baseline-diff ledger for suites whose key names are produced by the framework.
 * See the file header for the parallel-execution caveat.
 */
export function createThrottleKeyLedger(client: Redis): ThrottleKeyLedger {
  let baseline = new Set<string>();
  let baselineCaptured = false;

  return {
    async captureBaseline() {
      const keys = await listThrottleKeys(client);
      baseline = new Set(keys);
      baselineCaptured = true;
      return { baselineCount: baseline.size };
    },

    async cleanupRunKeys() {
      if (!baselineCaptured) {
        throw new Error(
          '[throttle-key-scope] cleanupRunKeys() called before captureBaseline(); ' +
            'without a baseline the suite cannot distinguish its own keys from foreign ones.',
        );
      }
      const current = await listThrottleKeys(client);
      const mine = current.filter((key) => !baseline.has(key));
      await deleteExactKeys(client, mine);
      // Re-baseline so a later cleanup does not treat another run's keys as ours.
      baseline = new Set(await listThrottleKeys(client));
      return { deleted: mine, preservedPreexisting: current.length - mine.length };
    },

    async runKeysOutstanding() {
      const current = await listThrottleKeys(client);
      return current.filter((key) => !baseline.has(key));
    },

    async snapshot() {
      return listThrottleKeys(client);
    },
  };
}

/**
 * Build the full storage key names for a caller-supplied logical key.
 * Mirrors RedisThrottlerStorageService so exact-key cleanup stays honest.
 */
export function throttleStorageKeys(logicalKey: string): string[] {
  return [`${THROTTLE_KEY_PREFIX}${logicalKey}`, `${THROTTLE_KEY_PREFIX}${logicalKey}:blocked`];
}

/**
 * Derive `count` deterministic, run-unique synthetic client IPs from a seed.
 *
 * Suites that drive the real HTTP stack need distinct per-run tracker values so
 * two runs can never share a counter bucket. Values come from 10.0.0.0/8 — an
 * RFC1918 range used here purely as a synthetic tracker string; nothing is ever
 * connected to. The address can never collide with the trusted loopback peer the
 * test app relies on.
 */
export function deriveTrackerIps(seed: string, count: number): string[] {
  const out: string[] = [];
  let counter = 0;
  while (out.length < count) {
    const digest = createHash('sha256').update(`${seed}:${counter}`).digest();
    const a = digest[0]!;
    const b = digest[1]!;
    // Last octet spread across 2..254; 10.x.x.x is never the loopback peer.
    const c = 2 + (digest[2]! % 253);
    const ip = `10.${a}.${b}.${c}`;
    if (!out.includes(ip)) out.push(ip);
    counter += 1;
    if (counter > count * 50) {
      throw new Error('[throttle-key-scope] could not derive enough unique tracker IPs');
    }
  }
  return out;
}
