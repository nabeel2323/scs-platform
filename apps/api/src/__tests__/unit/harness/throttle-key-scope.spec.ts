/**
 * S1.12 Remediation B — unit tests for run-scoped throttling-key cleanup.
 *
 * These run against an in-memory fake, so they execute in every job with no Redis
 * present. They pin three things the real-Redis sentinel suite can only demonstrate
 * existentially:
 *   1. `THROTTLE_KEY_PREFIX` still mirrors the production storage service (drift guard).
 *   2. Cleanup never enumerates the keyspace with the blocking `KEYS` command.
 *   3. A key that existed before this run's baseline survives every cleanup path.
 */
import { describe, it, expect } from 'vitest';
import type Redis from 'ioredis';
import {
  createThrottleKeyLedger,
  deriveTrackerIps,
  deleteExactKeys,
  listThrottleKeys,
  throttleStorageKeys,
  THROTTLE_KEY_PREFIX,
} from '../../helpers/throttle-key-scope';
import { RedisThrottlerStorageService } from '../../../common/throttler/redis-throttler-storage.service';
import type { RedisService } from '../../../common/redis/redis.service';

interface FakeRedisHandle {
  /** Direct keyspace access for seeding and assertions. */
  store: Map<string, string>;
  /** Command names the helper actually invoked, in order. */
  calls: string[];
  /** The same object, typed for the helper signatures. */
  client: Redis;
}

/**
 * Minimal keyspace fake implementing exactly the commands the helper uses: cursor
 * `SCAN` and variadic `DEL`. `KEYS` and `FLUSHDB` are deliberate traps — calling
 * them fails the test that triggered it, proving the helper never reaches for a
 * blocking or whole-database command. `eval` is the Redis EVAL command name
 * (server-side Lua execution), not JavaScript eval.
 */
function createFakeRedis(seed: Record<string, string> = {}): FakeRedisHandle {
  const store = new Map<string, string>(Object.entries(seed));
  const calls: string[] = [];

  const raw = {
    async scan(
      cursor: string,
      _matchKeyword: string,
      pattern: string,
      _countKeyword: string,
      _count: number,
    ): Promise<[string, string[]]> {
      calls.push('scan');
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : null;
      const matched = [...store.keys()].filter((k) =>
        prefix ? k.startsWith(prefix) : k === pattern,
      );
      // Deliberately emulate a multi-pass cursor: the first pass reports a
      // non-zero cursor so the helper must keep iterating.
      const isFirstPass = calls.filter((c) => c === 'scan').length === 1;
      return isFirstPass ? [String(matched.length + 1), matched] : ['0', matched];
    },
    async del(...keys: string[]): Promise<number> {
      calls.push('del');
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return n;
    },
    async keys(): Promise<string[]> {
      calls.push('keys');
      throw new Error('regression: helper used the blocking KEYS command');
    },
    async flushdb(): Promise<string> {
      calls.push('flushdb');
      throw new Error('regression: helper used FLUSHDB');
    },
    async eval(): Promise<undefined> {
      return undefined;
    },
  };

  return { store, calls, client: raw as unknown as Redis };
}

describe('THROTTLE_KEY_PREFIX drift guard', () => {
  it('matches the physical keys the production storage service actually writes', async () => {
    const captured: unknown[] = [];
    const client = {
      // Redis EVAL command: the storage service submits its Lua script here.
      eval: async (...args: unknown[]) => {
        captured.push(...args);
        return undefined;
      },
    };
    const storage = new RedisThrottlerStorageService({ client } as unknown as RedisService);

    await storage.increment('probe-logical-key', 60_000, 5, 60_000, 'default');

    // The service passes both physical key names to the script; the helper must
    // predict them exactly, otherwise exact-key cleanup would silently leak keys.
    expect(captured).toContain(`${THROTTLE_KEY_PREFIX}probe-logical-key`);
    expect(captured).toContain(`${THROTTLE_KEY_PREFIX}probe-logical-key:blocked`);
    expect(throttleStorageKeys('probe-logical-key')).toEqual([
      `${THROTTLE_KEY_PREFIX}probe-logical-key`,
      `${THROTTLE_KEY_PREFIX}probe-logical-key:blocked`,
    ]);
  });
});

describe('listThrottleKeys', () => {
  it('enumerates via SCAN and never touches KEYS or FLUSHDB', async () => {
    const { calls, client } = createFakeRedis({
      'scs:throttle:a': '1',
      'scs:throttle:a:blocked': '1',
      'scs:other:b': '1',
    });
    const found = await listThrottleKeys(client);
    expect(found.slice().sort()).toEqual(['scs:throttle:a', 'scs:throttle:a:blocked']);
    expect(calls).toContain('scan');
    expect(calls).not.toContain('keys');
    expect(calls).not.toContain('flushdb');
  });

  it('follows the cursor to completion and deduplicates across passes', async () => {
    const { calls, client } = createFakeRedis({ 'scs:throttle:y': '1' });
    const found = await listThrottleKeys(client);
    expect(calls.filter((c) => c === 'scan').length).toBeGreaterThanOrEqual(2);
    expect(new Set(found).size).toBe(found.length);
    expect(found).toEqual(['scs:throttle:y']);
  });

  it('returns an empty list when the namespace is empty', async () => {
    const { client } = createFakeRedis({ 'deny:hash': '1' });
    expect(await listThrottleKeys(client)).toEqual([]);
  });
});

describe('deleteExactKeys', () => {
  it('is a no-op for an empty key set', async () => {
    const { calls, client, store } = createFakeRedis({ 'scs:throttle:keepme': '1' });
    expect(await deleteExactKeys(client, [])).toBe(0);
    expect(store.size).toBe(1);
    expect(calls).not.toContain('del');
  });

  it('removes only the enumerated keys and reports what actually existed', async () => {
    const { client, store } = createFakeRedis({
      'scs:throttle:mine': '1',
      'scs:throttle:foreign': '1',
      'scs:throttle:foreign:blocked': '1',
    });
    const removed = await deleteExactKeys(client, ['scs:throttle:mine', 'scs:throttle:missing']);
    expect(removed).toBe(1);
    expect([...store.keys()].sort()).toEqual([
      'scs:throttle:foreign',
      'scs:throttle:foreign:blocked',
    ]);
  });
});

describe('createThrottleKeyLedger', () => {
  it('refuses to clean up without a baseline', async () => {
    const { client, store } = createFakeRedis({ 'scs:throttle:sentinel': '1' });
    const ledger = createThrottleKeyLedger(client);
    await expect(ledger.cleanupRunKeys()).rejects.toThrow(/before captureBaseline/);
    expect(store.size).toBe(1);
  });

  it('deletes keys created after the baseline and preserves pre-existing ones', async () => {
    const { client, store } = createFakeRedis({
      'scs:throttle:sentinel-other-run': '1',
      'scs:throttle:sentinel-other-run:blocked': '1',
    });
    const ledger = createThrottleKeyLedger(client);

    const { baselineCount } = await ledger.captureBaseline();
    expect(baselineCount).toBe(2);

    // This run now writes its own counters.
    store.set('scs:throttle:runkey', '1');
    store.set('scs:throttle:runkey:blocked', '1');

    expect(await ledger.runKeysOutstanding()).toEqual([
      'scs:throttle:runkey',
      'scs:throttle:runkey:blocked',
    ]);

    const result = await ledger.cleanupRunKeys();
    expect(result.deleted.slice().sort()).toEqual([
      'scs:throttle:runkey',
      'scs:throttle:runkey:blocked',
    ]);
    expect(result.preservedPreexisting).toBe(2);
    expect([...store.keys()].sort()).toEqual([
      'scs:throttle:sentinel-other-run',
      'scs:throttle:sentinel-other-run:blocked',
    ]);
  });

  it('re-baselines after cleanup so a second pass cannot delete preserved keys', async () => {
    const { client, store } = createFakeRedis({ 'scs:throttle:sentinel': '1' });
    const ledger = createThrottleKeyLedger(client);
    await ledger.captureBaseline();
    store.set('scs:throttle:mine', '1');
    await ledger.cleanupRunKeys();
    // Nothing new written; a second cleanup must delete zero keys, not the sentinel.
    const second = await ledger.cleanupRunKeys();
    expect(second.deleted).toEqual([]);
    expect(store.has('scs:throttle:sentinel')).toBe(true);
  });

  it('never reaches outside the throttling namespace', async () => {
    const { client, store } = createFakeRedis({
      'otp-it:{other}:challenge': 'x',
      'deny:hash': 'y',
    });
    const ledger = createThrottleKeyLedger(client);
    await ledger.captureBaseline();
    store.set('scs:throttle:mine', '1');
    await ledger.cleanupRunKeys();
    expect(store.has('otp-it:{other}:challenge')).toBe(true);
    expect(store.has('deny:hash')).toBe(true);
  });

  it('reports an outstanding set that excludes preserved keys', async () => {
    const { client, store } = createFakeRedis({ 'scs:throttle:sentinel': '1' });
    const ledger = createThrottleKeyLedger(client);
    await ledger.captureBaseline();
    store.set('scs:throttle:mine', '1');
    const outstanding = await ledger.runKeysOutstanding();
    expect(outstanding).toEqual(['scs:throttle:mine']);
    expect(store.size).toBe(2); // diagnostics must not mutate
  });
});

describe('deriveTrackerIps', () => {
  it('returns the requested number of unique synthetic trackers', () => {
    const ips = deriveTrackerIps('seed-a', 8);
    expect(ips).toHaveLength(8);
    expect(new Set(ips).size).toBe(8);
  });

  it('is deterministic for one seed and differs across seeds', () => {
    expect(deriveTrackerIps('seed-b', 4)).toEqual(deriveTrackerIps('seed-b', 4));
    expect(deriveTrackerIps('s112-seed-x', 6)).not.toEqual(deriveTrackerIps('s112-seed-y', 6));
  });

  it('stays in the synthetic 10.0.0.0/8 space and never yields a loopback peer', () => {
    for (const ip of deriveTrackerIps('seed-e', 20)) {
      expect(ip).toMatch(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(ip.startsWith('127.')).toBe(false);
    }
  });

  it('varies beyond the last octet, unlike the legacy fixed 10.0.0.N literals', () => {
    // The pre-S1.12 suites hard-coded 10.0.0.1..10.0.0.8, so every run shared the
    // same counter buckets inside the 60s window. Deriving from a per-run seed
    // spreads the middle octets, which is what actually separates two runs.
    const derived = deriveTrackerIps('s112-representative-seed', 8);
    const middles = derived.map((ip) => ip.split('.')[1]);
    expect(new Set(middles).size).toBeGreaterThan(1);
  });

  it('produces disjoint tracker sets for different run seeds', () => {
    const runOne = new Set(deriveTrackerIps('s112-run-one', 8));
    const runTwo = new Set(deriveTrackerIps('s112-run-two', 8));
    expect([...runOne].filter((ip) => runTwo.has(ip))).toEqual([]);
  });
});
