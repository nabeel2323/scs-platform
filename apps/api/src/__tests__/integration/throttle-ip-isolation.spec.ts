/**
 * S1.9 Owner-Clarification — Rate-limit IP isolation across distinct client IPs.
 *
 * The S1.8 cross-instance test (http-cross-instance-throttling.spec.ts) proves
 * two API replicas share a counter for the SAME client IP. It does not prove
 * that two DIFFERENT client IPs get INDEPENDENT budgets, because in that file
 * every test connection originates from 127.0.0.1.
 *
 * This file complements it by:
 *   (a) Enabling `trust proxy = ['127.0.0.1']` on the test NestJS app so the
 *       X-Forwarded-For header is honoured (this simulates Nginx forwarding).
 *   (b) Sending requests with DIFFERENT XFF client values through two
 *       independent NestJS instances sharing one disposable Redis.
 *   (c) Asserting that exhausting IP-A's budget does NOT exhaust IP-B's.
 *   (d) Asserting that the same IP-A budget IS shared across both instances
 *       (regression of the S1.8 result under this different setup).
 *
 * Safety (S1.12 Remediation A/B):
 * - Target selection is delegated to `redisIntegrationGate()`: `REDIS_IT=1` requires
 *  an explicit `REDIS_URL` plus `REDIS_DISPOSABLE_ACK=1`, and refuses the ambient
 *  loopback developer Redis unless running in CI (where the same address is an
 *  ephemeral service container). There is no implicit default-port loopback fallback.
 * - Skipped (describe.skip) only when the gate is off. A skip is not a pass.
 * - Cleanup is baseline-scoped: only throttling keys created by THIS run are
 *  deleted. Pre-existing keys belong to other runs or to live processes and are
 *  preserved. No FLUSHDB, no unscoped DEL, no KEYS.
 * - Synthetic client IPs are derived per run, so two runs cannot share a bucket.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Post,
  UseGuards,
  Module,
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { RedisThrottlerStorageService } from '../../common/throttler/redis-throttler-storage.service';
import { RedisService } from '../../common/redis/redis.service';
import { redisIntegrationGate } from '../helpers/redis-integration-env';
import {
  createThrottleKeyLedger,
  deriveTrackerIps,
  type ThrottleKeyLedger,
} from '../helpers/throttle-key-scope';

const gate = redisIntegrationGate();
const REDIS_URL = gate.url;
const INTEGRATION_ENABLED = gate.enabled;

const RUN_ID = crypto.randomUUID();

/**
 * S1.12 — run-unique synthetic client identifiers. Previously these were fixed
 * literals (203.0.113.10/.20/.30), so two concurrent or sequential runs inside the
 * 60s window shared the same counters and inherited each other's state.
 */
const ISO_TRACKERS = deriveTrackerIps(RUN_ID, 5);
const IP_A = ISO_TRACKERS[0]!;
const IP_B = ISO_TRACKERS[1]!;
const IP_SHARED = ISO_TRACKERS[2]!;
const IP_MULTI_RIGHT = ISO_TRACKERS[3]!;
const IP_MULTI_LEFT = ISO_TRACKERS[4]!;

@Controller('isol')
@UseGuards(ThrottlerGuard)
class IsolationController {
  @Post('hit')
  async hit() {
    return { ok: true };
  }
}

@Module({ controllers: [IsolationController] })
class IsolationModule {}

function makeRequest(
  port: number,
  xff?: string,
): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (xff) headers['X-Forwarded-For'] = xff;
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/v1/isol/hit', method: 'POST', headers },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ statusCode: res.statusCode! }));
      },
    );
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

function createRedisService(url: string): RedisService {
  const svc = new RedisService();
  (svc as any).client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 2,
  });
  return svc;
}

async function createApp(
  redisService: RedisService,
  limit: number,
  trustProxyValue: unknown,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl: 60_000, limit }],
        storage: new RedisThrottlerStorageService(redisService),
      }),
      IsolationModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Set trust proxy BEFORE listen — this is the exact ordering used in main.ts.
  (app.getHttpAdapter() as any).getInstance().set('trust proxy', trustProxyValue);
  await app.init();
  await app.listen(0, '127.0.0.1');
  return app;
}

const suite = INTEGRATION_ENABLED ? describe : describe.skip;

suite(
  'S1.9 owner-clarification — throttle IP isolation across distinct client IPs (REAL NestJS + REAL Redis)',
  () => {
    let probe: Redis;
    let ledger: ThrottleKeyLedger;
    let svcA: RedisService;
    let svcB: RedisService;
    let appA: INestApplication;
    let appB: INestApplication;
    let portA: number;
    let portB: number;

    beforeAll(async () => {
      // S1.12: target safety is enforced at collection time by redisIntegrationGate();
      // the old `:6379` regex was removed because it rejected CI's ephemeral service
      // container. See helpers/redis-integration-env.ts for the contract.
      probe = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
      await probe.connect();
      expect(await probe.ping()).toBe('PONG');
      console.log(
        `[s19-iso] connected to Redis at ${gate.redactedUrl} (run ${RUN_ID})`,
      );

      // Record the pre-existing throttling keyspace BEFORE this run creates any key,
      // so cleanup can distinguish ours from foreign keys (sentinel preservation).
      ledger = createThrottleKeyLedger(probe);
      const { baselineCount } = await ledger.captureBaseline();
      console.log(`[s19-iso] baseline throttling keys preserved: ${baselineCount}`);

      svcA = createRedisService(REDIS_URL);
      svcB = createRedisService(REDIS_URL);
      await (svcA as any).client.connect();
      await (svcB as any).client.connect();

      // 127.0.0.1 is trusted so that the XFF header we send is honoured,
      // emulating "Nginx on the same host forwards with XFF preserved".
      appA = await createApp(svcA, 3, ['127.0.0.1']);
      appB = await createApp(svcB, 3, ['127.0.0.1']);

      portA = (appA.getHttpServer().address() as AddressInfo).port;
      portB = (appB.getHttpServer().address() as AddressInfo).port;
    }, 30000);

    afterAll(async () => {
      try {
        // S1.12: delete only keys this run created; anything that pre-existed is
        // another run's or a live process's state and must survive.
        await ledger?.cleanupRunKeys();
      } finally {
        await appA?.close();
        await appB?.close();
        await (svcA as any)?.client?.quit().catch(() => {});
        await (svcB as any)?.client?.quit().catch(() => {});
        await probe?.quit().catch(() => {});
      }
    });

    beforeEach(async () => {
      // Reset only this run's counters between tests, never a foreign key.
      await ledger.cleanupRunKeys();
    });

    it('different XFF client IPs receive independent budgets', async () => {
      // Exhaust A (limit=3): 3 hits succeed, 4th gets 429.
      for (let i = 0; i < 3; i++) {
        const r = await makeRequest(portA, IP_A);
        expect(r.statusCode).toBe(201);
      }
      const aBlocked = await makeRequest(portA, IP_A);
      expect(aBlocked.statusCode).toBe(429);

      // B is a different client IP; its budget must be unaffected.
      const bHit = await makeRequest(portA, IP_B);
      expect(bHit.statusCode).toBe(201);
    });

    it('same XFF client IP shares its budget across two NestJS instances', async () => {
      const IP = IP_SHARED;
      // Two hits on A.
      expect((await makeRequest(portA, IP)).statusCode).toBe(201);
      expect((await makeRequest(portA, IP)).statusCode).toBe(201);
      // One hit on B counts toward the same 3/60s bucket.
      expect((await makeRequest(portB, IP)).statusCode).toBe(201);
      // Fourth hit on A is over the shared limit.
      expect((await makeRequest(portA, IP)).statusCode).toBe(429);
      // B sees the same throttle because the counter lives in shared Redis.
      expect((await makeRequest(portB, IP)).statusCode).toBe(429);
    });

    it('multi-hop XFF under explicit-list trust keys the counter on the rightmost untrusted entry', async () => {
      // Trust list is ['127.0.0.1'], i.e. only the direct peer is trusted. Express
      // therefore moves to X-Forwarded-For and takes the first entry that is NOT
      // trusted, scanning right-to-left: `IP_MULTI_RIGHT` becomes req.ip, and
      // `IP_MULTI_LEFT` is only a further-hop value. (The previous version of this
      // test asserted nothing about which address was resolved, so it could not
      // detect the key being derived from the wrong hop.)
      expect((await makeRequest(portA, `${IP_MULTI_LEFT}, ${IP_MULTI_RIGHT}`)).statusCode).toBe(201);
      // Two more as the resolved client exhausts its 3/60s budget.
      expect((await makeRequest(portA, IP_MULTI_RIGHT)).statusCode).toBe(201);
      expect((await makeRequest(portA, IP_MULTI_RIGHT)).statusCode).toBe(201);
      // The leftmost hop is a DIFFERENT client and must still have budget free.
      expect((await makeRequest(portA, IP_MULTI_LEFT)).statusCode).toBe(201);
      // One further multi-hop request is blocked, proving the counter is keyed on
      // IP_MULTI_RIGHT rather than IP_MULTI_LEFT or the socket peer.
      expect((await makeRequest(portA, `${IP_MULTI_LEFT}, ${IP_MULTI_RIGHT}`)).statusCode).toBe(429);
    });
  },
);
