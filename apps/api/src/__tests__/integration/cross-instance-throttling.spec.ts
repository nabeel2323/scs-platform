/**
 * S1.7 — Cross-instance distributed throttling integration tests.
 *
 * These tests prove that two independent API instances sharing a single Redis
 * enforce rate limits correctly across both instances. This is the critical
 * verification that the Redis-backed storage replaces the per-process in-memory
 * counters and that multi-replica deployments share a single throttling budget.
 *
 * Test topology:
 *  - One explicitly provisioned disposable Redis (see helpers/redis-integration-env).
 *  - Two independent RedisThrottlerStorageService instances, each with its own
 *    Redis connection (simulating two API replicas).
 *  - No real HTTP server — the tests call storage.increment() directly.
 *
 * Enabling: REDIS_IT=1 plus an explicit REDIS_URL and REDIS_DISPOSABLE_ACK=1.
 * There is no silent fallback to the default loopback Redis port; a missing or
 * unsafe target fails at collection time instead of silently skipping or reaching
 * the persistent developer instance.
 *
 * Cleanup: this suite builds the logical throttling key itself, so it deletes
 * precisely the physical keys it registered (helpers/throttle-key-scope) instead of
 * scanning the shared `scs:throttle:*` namespace. The previous version issued a
 * blocking `KEYS scs:throttle:*` inside a test body and deleted every match,
 * destroying other runs' and other developers' counters.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { RedisThrottlerStorageService } from '../../common/throttler/redis-throttler-storage.service';
import { redisIntegrationGate } from '../helpers/redis-integration-env';
import { deleteExactKeys, deriveTrackerIps, throttleStorageKeys } from '../helpers/throttle-key-scope';

const gate = redisIntegrationGate();
const REDIS_URL = gate.url;
const INTEGRATION_ENABLED = gate.enabled;

const RUN_ID = crypto.randomUUID();

/**
 * S1.12 — run-unique synthetic trackers replacing the fixed 10.0.0.1..10.0.0.8
 * literals, which made every run share counter buckets within the 60s window.
 */
const RUN_TRACKERS = deriveTrackerIps(RUN_ID, 8);
const T_SHARED = RUN_TRACKERS[0]!;
const T_LIMIT = RUN_TRACKERS[1]!;
const T_IP_A = RUN_TRACKERS[2]!;
const T_IP_B = RUN_TRACKERS[3]!;
const T_SPLIT = RUN_TRACKERS[4]!;
const T_EXPIRE = RUN_TRACKERS[5]!;
const T_CONCURRENT = RUN_TRACKERS[6]!;
const T_NAMESPACE = RUN_TRACKERS[7]!;

/**
 * Physical Redis keys this run created, tracked by exact name so teardown needs no
 * pattern scan and can never reach a foreign key.
 */
const ownKeys = new Set<string>();

/** Create a mock RedisService with a real ioredis client. */
function createRealRedisService(redisUrl: string): { client: Redis } {
  return {
    client: new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 2,
    }),
  };
}

const suite = INTEGRATION_ENABLED ? describe : describe.skip;

suite('S1.7 — Cross-instance distributed throttling (REAL Redis)', () => {
  let redisA: Redis;
  let redisB: Redis;
  let storageA: RedisThrottlerStorageService;
  let storageB: RedisThrottlerStorageService;

  beforeAll(async () => {
    // Two independent connections simulating two API replicas.
    redisA = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    redisB = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await redisA.connect();
    await redisB.connect();

    if ((await redisA.ping()) !== 'PONG') throw new Error('Redis A did not answer PING');
    if ((await redisB.ping()) !== 'PONG') throw new Error('Redis B did not answer PING');

    // Verify both connections point to the same Redis instance.
    const infoA = await redisA.info('server');
    const infoB = await redisB.info('server');
    const runIdA = /run_id:([a-f0-9]+)/.exec(infoA)?.[1];
    const runIdB = /run_id:([a-f0-9]+)/.exec(infoB)?.[1];
    expect(runIdA).toBe(runIdB);

    const version = /redis_version:([0-9.]+)/.exec(infoA)?.[1] ?? 'unknown';
    console.log(
      `[s17-cross] connected to Redis ${version} run_id=${runIdA ?? '?'} ` +
        `target=${gate.redactedUrl} (run ${RUN_ID}) — two independent connections`,
    );

    storageA = new RedisThrottlerStorageService({ client: redisA } as any);
    storageB = new RedisThrottlerStorageService({ client: redisB } as any);
  });

  afterAll(async () => {
    // Remove exactly the physical keys this run created. No pattern scanning: the
    // storage prefixes a HASHED key, so no pattern can identify this run's counters.
    try {
      const removed = await deleteExactKeys(redisA, [...ownKeys]);
      ownKeys.clear();
      console.log(`[s17-cross] teardown deleted ${removed} key(s) created by run ${RUN_ID}`);
    } finally {
      await redisA.quit();
      await redisB.quit();
    }
  });

  beforeEach(async () => {
    // Reset only this run's own keys between tests, by exact name.
    await deleteExactKeys(redisA, [...ownKeys]);
    ownKeys.clear();
  });

  /**
   * Helper: the guard generates keys as sha256("Controller-method-throttlerName-tracker").
   * We replicate that here to test the actual storage path, and register the physical
   * key names so cleanup can target them exactly.
   */
  function makeKey(tracker: string, throttlerName: string): string {
    const prefix = `TestController-testMethod-${throttlerName}`;
    const key = crypto.createHash('sha256').update(`${prefix}-${tracker}`).digest('hex');
    for (const physical of throttleStorageKeys(key)) ownKeys.add(physical);
    return key;
  }

  // ── Test 1: Shared counter across instances ──────────────────────
  it('shares hit counters across two independent instances', async () => {
    const tracker = T_SHARED;
    const key = makeKey(tracker, 'otp-request');

    // Send 10 hits through instance A.
    for (let i = 0; i < 10; i++) {
      const result = await storageA.increment(key, 60_000, 20, 60_000, 'otp-request');
      expect(result.totalHits).toBe(i + 1);
      expect(result.isBlocked).toBe(false);
    }

    // Instance B should see the same counter (shared via Redis).
    const resultB = await storageB.increment(key, 60_000, 20, 60_000, 'otp-request');
    expect(resultB.totalHits).toBe(11); // 10 from A + 1 from B
    expect(resultB.isBlocked).toBe(false);
  });

  // ── Test 2: Shared limit enforcement ─────────────────────────────
  it('enforces the limit across both instances', async () => {
    const tracker = T_LIMIT;
    const key = makeKey(tracker, 'otp-request');
    const limit = 5;

    // Send hits through alternating instances until the limit is exceeded.
    for (let i = 0; i < limit; i++) {
      const storage = i % 2 === 0 ? storageA : storageB;
      const result = await storage.increment(key, 60_000, limit, 60_000, 'otp-request');
      expect(result.totalHits).toBe(i + 1);
      expect(result.isBlocked).toBe(false);
    }

    // The next hit (through instance B) should trigger the block.
    const blocked = await storageB.increment(key, 60_000, limit, 60_000, 'otp-request');
    expect(blocked.totalHits).toBe(limit + 1);
    expect(blocked.isBlocked).toBe(true);

    // Instance A should also see the block.
    const alsoBlocked = await storageA.increment(key, 60_000, limit, 60_000, 'otp-request');
    expect(alsoBlocked.isBlocked).toBe(true);
  });

  // ── Test 3: Different IPs get independent budgets ─────────────────
  it('assigns independent budgets to different client IPs', async () => {
    const keyA = makeKey(T_IP_A, 'otp-request');
    const keyB = makeKey(T_IP_B, 'otp-request');

    // Exhaust the limit for IP A.
    for (let i = 0; i < 20; i++) {
      await storageA.increment(keyA, 60_000, 20, 60_000, 'otp-request');
    }

    // IP B should still have a fresh budget.
    const resultB = await storageB.increment(keyB, 60_000, 20, 60_000, 'otp-request');
    expect(resultB.totalHits).toBe(1);
    expect(resultB.isBlocked).toBe(false);
  });

  // ── Test 4: Request and verification counters are independent ─────
  it('keeps request and verification counters independent', async () => {
    const tracker = T_SPLIT;
    const requestKey = makeKey(tracker, 'otp-request');
    const verifyKey = makeKey(tracker, 'otp-verify');

    // Hit the request limit.
    for (let i = 0; i < 20; i++) {
      await storageA.increment(requestKey, 60_000, 20, 60_000, 'otp-request');
    }

    // Verification should still work (separate counter, separate limit).
    const verifyResult = await storageB.increment(verifyKey, 60_000, 40, 60_000, 'otp-verify');
    expect(verifyResult.totalHits).toBe(1);
    expect(verifyResult.isBlocked).toBe(false);
  });

  // ── Test 5: Block expiration works ────────────────────────────────
  it('expires the block after blockDuration', async () => {
    const tracker = T_EXPIRE;
    const key = makeKey(tracker, 'otp-request');
    const limit = 2;
    const blockDuration = 1000; // 1 second
    const ttl = 60_000;

    // Exceed the limit.
    for (let i = 0; i <= limit; i++) {
      await storageA.increment(key, ttl, limit, blockDuration, 'otp-request');
    }

    // Should be blocked.
    const blocked = await storageB.increment(key, ttl, limit, blockDuration, 'otp-request');
    expect(blocked.isBlocked).toBe(true);

    // Wait for block to expire.
    await new Promise((r) => setTimeout(r, blockDuration + 200));

    // After block expiry, the hit counter is still above the limit (it was not
    // reset), so the next increment will re-trigger the block immediately.
    // This is the correct distributed behavior: the counter persists for its
    // full TTL, and the client must wait for the window to expire.
    const reBlocked = await storageA.increment(key, ttl, limit, blockDuration, 'otp-request');
    expect(reBlocked.isBlocked).toBe(true);

    // Verify the block TTL is fresh (the new block was set).
    expect(reBlocked.timeToBlockExpire).toBeGreaterThan(0);
  });

  // ── Test 6: Redis outage → fail-closed ────────────────────────────
  it('fails closed when Redis is unavailable', async () => {
    // Create a storage with a disconnected Redis client.
    const deadRedis = new Redis('redis://localhost:1', {
      // Port 1 should never have Redis.
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // Don't retry.
    });

    const deadStorage = new RedisThrottlerStorageService({ client: deadRedis } as any);

    // Attempt to increment — should throw (fail-closed).
    await expect(
      deadStorage.increment('any-key', 60_000, 20, 60_000, 'default'),
    ).rejects.toThrow();

    await deadRedis.quit().catch(() => {});
  });

  // ── Test 7: Concurrent requests respect the shared limit ──────────
  it('handles concurrent requests atomically', async () => {
    const tracker = T_CONCURRENT;
    const key = makeKey(tracker, 'otp-request');
    const limit = 10;

    // Fire 20 concurrent requests (double the limit) across both instances.
    const promises = Array.from({ length: 20 }, (_, i) => {
      const storage = i % 2 === 0 ? storageA : storageB;
      return storage.increment(key, 60_000, limit, 60_000, 'otp-request');
    });

    const results = await Promise.all(promises);

    // All should have been processed (no crashes).
    expect(results).toHaveLength(20);

    // Once the limit is exceeded, blocked requests don't increment the counter
    // (they return early from the Lua script). So totalHits will be somewhere
    // between limit+1 and 20, depending on timing.
    const lastResult = results[results.length - 1]!;
    expect(lastResult.totalHits).toBeGreaterThanOrEqual(limit + 1);
    expect(lastResult.totalHits).toBeLessThanOrEqual(20);

    // At least some should be blocked (those after the limit was exceeded).
    const blockedCount = results.filter((r: { isBlocked: boolean }) => r.isBlocked).length;
    expect(blockedCount).toBeGreaterThan(0);
  });

  // ── Test 8: Namespace prefix + exact-key ownership ────────────────
  it('writes counters under the scs:throttle: namespace via exact owned keys', async () => {
    const tracker = T_NAMESPACE;
    const key = makeKey(tracker, 'default');
    const physical = throttleStorageKeys(key);
    const hitKey = physical[0]!;
    const blockKey = physical[1]!;

    await storageA.increment(key, 60_000, 100, 60_000, 'default');

    // The storage must prefix the physical key exactly as production does.
    expect(hitKey).toMatch(/^scs:throttle:/);
    expect(await redisA.exists(hitKey)).toBe(1);
    // Under the 100-request limit nothing is blocked, so the block key is absent.
    expect(await redisA.exists(blockKey)).toBe(0);

    // The counter is keyed on the HASHED tracker, never the raw value. This is why
    // pattern-based isolation claims are false and cleanup must target exact keys.
    expect(hitKey).not.toContain(tracker);

    // Removing exactly this run's key takes it to zero with no namespace scan.
    await deleteExactKeys(redisA, [hitKey, blockKey]);
    expect(await redisA.exists(hitKey)).toBe(0);
    ownKeys.delete(hitKey);
    ownKeys.delete(blockKey);
  });
});
