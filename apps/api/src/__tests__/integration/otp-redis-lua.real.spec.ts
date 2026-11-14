/**
 * S1.3 P0 — REAL Redis integration tests for the OTP Lua scripts.
 *
 * These execute the ACTUAL scripts from `common/redis/otp-lua.ts` against a
 * real Redis server via ioredis — NOT the JavaScript mock used in the unit
 * suite. The mock cannot prove atomicity; only a real single-threaded Redis
 * can, so these tests are what satisfy the M-03 release gate.
 *
 * Coverage:
 *  - ACQUIRE_RATE_LIMIT: atomic counters, configured limits, TTL creation + real expiry.
 *  - CREATE_CHALLENGE: creation and single-active-challenge supersession.
 *  - CLEANUP_CHALLENGE: owner-only deletion + stale-cleanup rejection.
 *  - VERIFY_AND_CONSUME: correct/incorrect OTP, replay prevention, atomic consume.
 *  - Malformed challenge data → error surfaces (fail-closed evidence).
 *  - Genuine concurrency: many simultaneous eval() invocations via Promise.all.
 *  - Real time-based TTL expiry in an isolated, namespaced keyspace.
 *
 * Isolation: every key is namespaced under a per-run prefix and only those keys
 * are deleted in teardown — never a global FLUSH. Safe to run against a shared
 * test Redis instance. No real SMS/WhatsApp messages are ever sent.
 *
 * Enabling: REDIS_IT=1 plus an explicit REDIS_URL and REDIS_DISPOSABLE_ACK=1, all
 * resolved through `helpers/redis-integration-env`. There is NO silent fallback to
 * the default loopback Redis port: a missing or unsafe target fails at collection
 * time with an actionable message rather than reaching the ambient
 * persistent developer instance. CI sets the same three variables alongside its
 * ephemeral `redis:7-alpine` service in the `test-integration` job. When `REDIS_IT`
 * is not set the whole suite is skipped at collection time. A SKIPPED suite is NOT a
 * pass — the report marks the real-Redis gate NOT VERIFIED unless these tests
 * actually executed. The assertion script (`scripts/assert-redis-suite.mjs`)
 * enforces that the integration job fails if the suite is skipped or under-counted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import {
  ACQUIRE_RATE_LIMIT,
  CREATE_CHALLENGE,
  CLEANUP_CHALLENGE,
  VERIFY_AND_CONSUME,
} from '../../common/redis/otp-lua';

import { redisIntegrationGate } from '../helpers/redis-integration-env';

const gate = redisIntegrationGate();
const REDIS_URL = gate.url;
const INTEGRATION_ENABLED = gate.enabled;

/**
 * Per-run namespace. Unlike the throttling suite, this one is a genuine isolation
 * mechanism: every key is written through `key()` below, so the namespace is part
 * of the physical key name and `SCAN MATCH ${NS}:*` can only ever find this run's
 * keys. The throttling storage hashes its key, which is why that pattern does NOT
 * work there — see helpers/throttle-key-scope.ts.
 */
const RUN_ID = crypto.randomUUID();
const NS = `otp-it:{${RUN_ID}}`;
const key = (logical: string) => `${NS}:${logical}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const hmac = (otp: string, salt: string) =>
  crypto.createHmac('sha256', 'it-run-scoped-secret').update(otp + salt).digest('hex');

const suite = INTEGRATION_ENABLED ? describe : describe.skip;

suite('OTP Lua scripts — REAL Redis (S1.3 P0 / M-03)', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    await redis.connect();
    if ((await redis.ping()) !== 'PONG') {
      throw new Error(`Redis at ${gate.redactedUrl} did not answer PING`);
    }
    const info = await redis.info('server');
    const version = /redis_version:([0-9.]+)/.exec(info)?.[1] ?? 'unknown';
    const runId = /run_id:([a-f0-9]+)/.exec(info)?.[1] ?? '?';
    console.log(
      `[otp-redis] connected to real Redis ${version} run_id=${runId} ` +
        `target=${gate.redactedUrl} (ns ${NS})`,
    );
  });

  afterAll(async () => {
    // Remove ONLY this run's namespaced keys — never a global flush and never a
    // broad production-namespace pattern. Report the count so evidence is auditable.
    try {
      let removed = 0;
      let cursor = '0';
      do {
        const [next, found] = await redis.scan(cursor, 'MATCH', `${NS}:*`, 'COUNT', 200);
        cursor = next;
        if (found.length > 0) removed += await redis.del(...found);
      } while (cursor !== '0');
      console.log(`[otp-redis] teardown deleted ${removed} key(s) under namespace ${NS}`);
    } finally {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    // Belt-and-suspenders: clear this run's keys between tests.
    let cursor = '0';
    do {
      const [next, found] = await redis.scan(cursor, 'MATCH', `${NS}:*`, 'COUNT', 200);
      cursor = next;
      if (found.length > 0) await redis.del(...found);
    } while (cursor !== '0');
  });

  // ── 1. ACQUIRE_RATE_LIMIT ───────────────────────────────────────
  describe('ACQUIRE_RATE_LIMIT', () => {
    it('allows exactly the configured number and rejects the rest under real concurrency', async () => {
      const rk = key('req:+966500000000');
      const MAX = 5;
      const WINDOW = 900;

      // Fire MORE simultaneous requests than the allowance, against real Redis.
      const attempts = Array.from({ length: 8 }, () =>
        redis.eval(ACQUIRE_RATE_LIMIT, 1, rk, MAX, WINDOW) as Promise<number[]>,
      );
      const results = await Promise.all(attempts);

      const allowed = results.filter((r) => r[0] === 1).length;
      const rejected = results.filter((r) => r[0] === 0).length;
      expect(allowed).toBe(MAX); // exactly the allowance — atomicity proof
      expect(rejected).toBe(8 - MAX);

      const stored = await redis.get(rk);
      expect(stored).toBe(String(MAX)); // never overshoots the limit

      const ttl = await redis.ttl(rk);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(WINDOW); // TTL was created
    });

    it('creates the TTL only for the window and expires for real (short TTL)', async () => {
      const rk = key('req-ttl:+966500000001');
      const [allowed] = (await redis.eval(ACQUIRE_RATE_LIMIT, 1, rk, 5, 1)) as number[];
      expect(allowed).toBe(1);
      expect(await redis.ttl(rk)).toBeGreaterThan(0);

      // Real time-based expiry inside an isolated namespaced key.
      await sleep(1300);
      expect(await redis.get(rk)).toBeNull();

      // After expiry the counter resets: a fresh request is allowed again.
      const [reAllowed] = (await redis.eval(ACQUIRE_RATE_LIMIT, 1, rk, 5, 1)) as number[];
      expect(reAllowed).toBe(1);
    });
  });

  // ── 2. CREATE_CHALLENGE ─────────────────────────────────────────
  describe('CREATE_CHALLENGE', () => {
    it('creates a challenge and enforces single-active supersession', async () => {
      const ck = key('otp:+966500000002');
      const salt = 'a'.repeat(32);
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'ch-1', hmac('123456', salt), salt, 90, '1');
      let stored = JSON.parse((await redis.get(ck))!);
      expect(stored.ch).toBe('ch-1');

      // Supersede with a newer challenge.
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'ch-2', hmac('654321', salt), salt, 90, '2');
      stored = JSON.parse((await redis.get(ck))!);
      expect(stored.ch).toBe('ch-2'); // only the newest survives
      expect(await redis.ttl(ck)).toBeGreaterThan(0);
    });

    it('concurrent creations leave exactly one active challenge (last-writer-wins)', async () => {
      const ck = key('otp:+966500000003');
      const ids = Array.from({ length: 6 }, (_, i) => `ch-${i}`);
      await Promise.all(
        ids.map((id, i) =>
          redis.eval(
            CREATE_CHALLENGE,
            1,
            ck,
            id,
            hmac(String(100000 + i), 'b'.repeat(32)),
            'b'.repeat(32),
            90,
            String(i),
          ),
        ),
      );
      const final = JSON.parse((await redis.get(ck))!);
      expect(ids).toContain(final.ch); // one valid challenge, no corruption
    });
  });

  // ── 3. CLEANUP_CHALLENGE ────────────────────────────────────────
  describe('CLEANUP_CHALLENGE', () => {
    it('deletes only when the caller owns the current challenge', async () => {
      const ck = key('otp:+966500000004');
      const salt = 'c'.repeat(32);
      await redis.eval(CLEANUP_CHALLENGE, 1, ck, 'ch-x'); // nothing there yet
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'ch-x', hmac('111111', salt), salt, 90, '1');
      const [deleted] = (await redis.eval(CLEANUP_CHALLENGE, 1, ck, 'ch-x')) as number[];
      expect(deleted).toBe(1);
      expect(await redis.get(ck)).toBeNull();
    });

    it('rejects stale cleanup so a newer challenge survives', async () => {
      const ck = key('otp:+966500000005');
      const salt = 'd'.repeat(32);
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'old', hmac('222222', salt), salt, 90, '1');
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'new', hmac('333333', salt), salt, 90, '2');

      // Stale cleanup keyed to the superseded id must NOT delete the newer one.
      const [deleted] = (await redis.eval(CLEANUP_CHALLENGE, 1, ck, 'old')) as number[];
      expect(deleted).toBe(0);
      const survived = JSON.parse((await redis.get(ck))!);
      expect(survived.ch).toBe('new');
    });

    it('a stale cleanup racing a newer creation never removes the newer challenge', async () => {
      const ck = key('otp:+966500000006');
      const salt = 'e'.repeat(32);
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'gen1', hmac('444444', salt), salt, 90, '1');

      // Race: attempt to clean up the *current* owner while a newer one is created.
      // Redis serializes each script atomically; whichever order, the final stored
      // challenge must be owned by a valid id and must not be left dangling.
      await Promise.all([
        redis.eval(CLEANUP_CHALLENGE, 1, ck, 'gen1'),
        redis.eval(CREATE_CHALLENGE, 1, ck, 'gen2', hmac('555555', salt), salt, 90, '2'),
      ]);

      const after = await redis.get(ck);
      if (after) {
        expect(JSON.parse(after).ch).toBe('gen2'); // if present, it is the newer owner
      } else {
        // If the newer creation had not yet applied when the cleanup ran, then a
        // subsequent verify of its code must be unauthorized.
        const [status] = (await redis.eval(VERIFY_AND_CONSUME, 1, ck, hmac('555555', salt))) as number[];
        expect(status).toBe(-1); // no challenge → cannot authenticate
      }
    });
  });

  // ── 4. VERIFY_AND_CONSUME ───────────────────────────────────────
  describe('VERIFY_AND_CONSUME', () => {
    const seed = async (ck: string, salt: string, otp: string) => {
      await redis.eval(CREATE_CHALLENGE, 1, ck, 'owner', hmac(otp, salt), salt, 90, '1');
    };

    it('consumes on the correct OTP and blocks replay', async () => {
      const ck = key('otp:+966500000007');
      const salt = 'f'.repeat(32);
      await seed(ck, salt, '135790');
      const [ok] = (await redis.eval(VERIFY_AND_CONSUME, 1, ck, hmac('135790', salt))) as number[];
      expect(ok).toBe(1);
      expect(await redis.get(ck)).toBeNull();

      const [replay] = (await redis.eval(VERIFY_AND_CONSUME, 1, ck, hmac('135790', salt))) as number[];
      expect(replay).toBe(-1); // consumed — cannot be reused
    });

    it('rejects an incorrect OTP without consuming the challenge', async () => {
      const ck = key('otp:+966500000008');
      const salt = 'a1'.repeat(16);
      await seed(ck, salt, '111111');
      const [bad] = (await redis.eval(VERIFY_AND_CONSUME, 1, ck, hmac('999999', salt))) as number[];
      expect(bad).toBe(0);
      expect(await redis.get(ck)).not.toBeNull(); // still usable by the real holder
    });

    it('allows at most ONE successful consume under 12-way real concurrency', async () => {
      const ck = key('otp:+966500000009');
      const salt = 'b2'.repeat(16);
      await seed(ck, salt, '246810');
      const goodHash = hmac('246810', salt);

      const results = (await Promise.all(
        Array.from({ length: 12 }, () => redis.eval(VERIFY_AND_CONSUME, 1, ck, goodHash)),
      )) as number[][];

      const consumed = results.filter((r) => r[0] === 1).length;
      expect(consumed).toBe(1); // genuine atomic single consume
      const notFound = results.filter((r) => r[0] === -1).length;
      expect(notFound).toBe(11);
    });
  });

  // ── 5. Malformed data + fail-closed ─────────────────────────────
  describe('failure modes', () => {
    it('surfaces a script error on malformed challenge data (fail-closed, not silent success)', async () => {
      const ck = key('otp:+966500000010');
      await redis.set(ck, 'not-json', 'EX', 90);
      await expect(redis.eval(VERIFY_AND_CONSUME, 1, ck, 'deadbeef')).rejects.toThrow();
      // The corrupt key was not consumed and cannot authenticate.
      expect(await redis.get(ck)).toBe('not-json');
    });

    it('concurrent create + verify never authorizes an incorrect OTP', async () => {
      const ck = key('otp:+966500000011');
      const salt = 'c3'.repeat(16);
      const wrong = hmac('000000', salt);

      const results = (await Promise.all([
        redis.eval(CREATE_CHALLENGE, 1, ck, 'gen', hmac('123456', salt), salt, 90, '1'),
        ...Array.from({ length: 5 }, () => redis.eval(VERIFY_AND_CONSUME, 1, ck, wrong)),
      ])) as number[][];

      // Index 0 is the CREATE result (always {1}); only the VERIFY outcomes count.
      const verifyResults = results.slice(1);
      const successes = verifyResults.filter((r) => r[0] === 1).length;
      expect(successes).toBe(0); // no unauthorized authentication
      // Each verify is either a mismatch (0) or ran before creation (-1) — never consumed.
      verifyResults.forEach((r) => expect([0, -1]).toContain(r[0]));
    });
  });
});
