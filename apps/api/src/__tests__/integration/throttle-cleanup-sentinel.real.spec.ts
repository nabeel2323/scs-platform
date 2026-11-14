/**
 * S1.12 Remediation B — sentinel-preservation regression test (REAL Redis).
 *
 * PURPOSE
 * The pre-S1.12 throttling suites cleaned up with a broad `scs:throttle:*` scan
 * (and in one case a blocking `KEYS scs:throttle:*` followed by a per-key `DEL`
 * inside a test body). Against a shared instance that destroys counters belonging
 * to a concurrent test run or a live development process. This file proves the
 * remediated cleanup mechanisms remove only what the current run created.
 *
 * METHOD
 * Before the suite takes its baseline it writes UNRELATED SENTINEL keys that
 * simulate other owners of the same instance:
 *   - two sentinels INSIDE the production `scs:throttle:` namespace, which is the
 *     namespace the old cleanup matched — so a regression to pattern cleanup is
 *     detected immediately, not merely theoretically;
 *   - one sentinel in another suite's OTP namespace.
 * Every assertion then checks that the sentinels survive while this run's own
 * throttling counters are removed.
 *
 * COUNTERFACTUAL GUARD
 * One test asserts the old broad pattern WOULD have matched the sentinels. Without
 * it the suite could pass vacuously (e.g. if sentinels were never written).
 *
 * Enabling: REDIS_IT=1 plus an explicit REDIS_URL and REDIS_DISPOSABLE_ACK=1,
 * resolved through `helpers/redis-integration-env`. No implicit default-port
 * loopback fallback. A skipped suite is not a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { RedisThrottlerStorageService } from '../../common/throttler/redis-throttler-storage.service';
import { redisIntegrationGate } from '../helpers/redis-integration-env';
import {
  createThrottleKeyLedger,
  deleteExactKeys,
  deriveTrackerIps,
  listThrottleKeys,
  throttleStorageKeys,
  THROTTLE_KEY_PREFIX,
  type ThrottleKeyLedger,
} from '../helpers/throttle-key-scope';

const gate = redisIntegrationGate();
const INTEGRATION_ENABLED = gate.enabled;

const RUN_ID = crypto.randomUUID();
const RUN_TRACKERS = deriveTrackerIps(RUN_ID, 2);
const TRACKER_A = RUN_TRACKERS[0]!;
const TRACKER_B = RUN_TRACKERS[1]!;

/** Keys belonging to other owners that must survive this suite's cleanup. */
const SENTINEL_THROTTLE = `${THROTTLE_KEY_PREFIX}s112-sentinel-other-owner`;
const SENTINEL_THROTTLE_BLOCKED = `${SENTINEL_THROTTLE}:blocked`;
const SENTINEL_OTP_NAMESPACE = `otp-it:{another-run-${crypto.randomUUID()}}:challenge`;

/** Physical keys this suite creates, tracked by exact name. */
const ownKeys = new Set<string>();

function makeKey(tracker: string, profile: string): string {
  const prefix = `SentinelController-sentinelMethod-${profile}`;
  const logical = crypto.createHash('sha256').update(`${prefix}-${tracker}`).digest('hex');
  for (const physical of throttleStorageKeys(logical)) ownKeys.add(physical);
  return logical;
}

const suite = INTEGRATION_ENABLED ? describe : describe.skip;

suite('S1.12 — throttling cleanup preserves unrelated sentinel keys (REAL Redis)', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorageService;
  let ledger: ThrottleKeyLedger;

  beforeAll(async () => {
    redis = new Redis(gate.url, { lazyConnect: true, connectTimeout: 3000 });
    await redis.connect();
    expect(await redis.ping()).toBe('PONG');

    // Prove we are connected to the instance the operator declared disposable,
    // and record its identity for the report. Never log the raw URL.
    const info = await redis.info('server');
    const runId = /run_id:([a-f0-9]+)/.exec(info)?.[1] ?? '?';
    const version = /redis_version:([0-9.]+)/.exec(info)?.[1] ?? 'unknown';
    console.log(
      `[s112-sentinel] target=${gate.redactedUrl} redis=${version} run_id=${runId} ` +
        `suite_run=${RUN_ID}`,
    );

    // 1. Simulate other owners writing state BEFORE this suite does anything.
    await redis.set(SENTINEL_THROTTLE, '42', 'EX', 3600);
    await redis.set(SENTINEL_THROTTLE_BLOCKED, '1', 'EX', 3600);
    await redis.set(SENTINEL_OTP_NAMESPACE, '{"ch":"foreign"}', 'EX', 3600);

    // 2. Only now take the baseline, so the sentinels count as pre-existing.
    ledger = createThrottleKeyLedger(redis);
    const { baselineCount } = await ledger.captureBaseline();
    console.log(`[s112-sentinel] baseline captured with ${baselineCount} pre-existing key(s)`);

    storage = new RedisThrottlerStorageService({ client: redis } as any);
  });

  afterAll(async () => {
    try {
      // Remove this run's counters, then the sentinels we ourselves created.
      await ledger.cleanupRunKeys();
      await deleteExactKeys(redis, [...ownKeys]);
      ownKeys.clear();
      await deleteExactKeys(redis, [
        SENTINEL_THROTTLE,
        SENTINEL_THROTTLE_BLOCKED,
        SENTINEL_OTP_NAMESPACE,
      ]);
    } finally {
      await redis.quit();
    }
  });

  it('confirms the sentinel actually sits inside the namespace the old cleanup deleted', async () => {
    // Counterfactual guard: the legacy `scs:throttle:*` scan would have matched it.
    expect(SENTINEL_THROTTLE.startsWith(THROTTLE_KEY_PREFIX)).toBe(true);
    const listed = await listThrottleKeys(redis);
    expect(listed).toContain(SENTINEL_THROTTLE);
    expect(listed).toContain(SENTINEL_THROTTLE_BLOCKED);
  });

  it('removes this run throttling counters while the sentinel counters survive', async () => {
    const key = makeKey(TRACKER_A, 'otp-request');
    for (let i = 0; i < 3; i++) {
      await storage.increment(key, 60_000, 20, 60_000, 'otp-request');
    }
    const physical = throttleStorageKeys(key);
    expect(await redis.exists(physical[0]!)).toBe(1);

    const result = await ledger.cleanupRunKeys();

    // Our key is gone…
    expect(await redis.exists(physical[0]!)).toBe(0);
    // …and nothing that pre-existed was touched.
    expect(await redis.exists(SENTINEL_THROTTLE)).toBe(1);
    expect(await redis.exists(SENTINEL_THROTTLE_BLOCKED)).toBe(1);
    expect(result.preservedPreexisting).toBeGreaterThanOrEqual(2);
    expect(result.deleted.every((k) => !k.startsWith(SENTINEL_THROTTLE))).toBe(true);
    // The sentinel still holds its original value, not just its name.
    expect(await redis.get(SENTINEL_THROTTLE)).toBe('42');
  });

  it('leaves another suite namespaced keys untouched', async () => {
    expect(await redis.exists(SENTINEL_OTP_NAMESPACE)).toBe(1);
    expect(await redis.get(SENTINEL_OTP_NAMESPACE)).toBe('{"ch":"foreign"}');
  });

  it('exact-key cleanup removes only the enumerated keys', async () => {
    const key = makeKey(TRACKER_B, 'otp-verify');
    await storage.increment(key, 60_000, 40, 60_000, 'otp-verify');
    const physical = throttleStorageKeys(key);

    const removed = await deleteExactKeys(redis, physical);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await redis.exists(physical[0]!)).toBe(0);
    expect(await redis.exists(SENTINEL_THROTTLE)).toBe(1);
    expect(await redis.exists(SENTINEL_THROTTLE_BLOCKED)).toBe(1);
  });

  it('reports zero outstanding run keys after cleanup, without deleting preserved ones', async () => {
    await ledger.cleanupRunKeys();
    expect(await ledger.runKeysOutstanding()).toEqual([]);
    const remaining = await listThrottleKeys(redis);
    expect(remaining.sort()).toEqual([SENTINEL_THROTTLE, SENTINEL_THROTTLE_BLOCKED].sort());
  });
});
