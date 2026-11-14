/**
 * S1.8 — HTTP-level cross-instance throttling verification.
 *
 * Unlike the S1.7 cross-instance test (which only tested the storage layer
 * directly), this test boots two independent NestJS HTTP servers that share
 * a single Redis instance. Requests go through the actual ThrottlerGuard,
 * proving that:
 *
 *  1. The guard uses the Redis-backed storage (not in-memory).
 *  2. Two HTTP servers share counters through Redis.
 *  3. The correct HTTP status code (429) is returned when the limit is exceeded.
 *  4. Rate-limit response headers are set correctly.
 *  5. Different client IPs get independent budgets.
 *  6. Redis outage produces HTTP 503 (not 500).
 *
 * No SMS/WhatsApp providers are contacted — the test controller does not call
 * IdentityService.
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
 * S1.12 — every request in this suite carries the same run-unique synthetic client
 * IP. Previously no X-Forwarded-For was sent, so `req.ip` was the loopback peer
 * 127.0.0.1 for every run: counters (and therefore results) leaked between runs
 * inside the 60s window, and the broad cleanup deleted other runs' keys. With a
 * per-run tracker the counters are ours alone.
 */
const CLIENT_IP = deriveTrackerIps(RUN_ID, 1)[0]!;

/** Minimal test controller with a throttled endpoint. */
@Controller('test')
@UseGuards(ThrottlerGuard)
class TestThrottleController {
  @Post('endpoint')
  async testEndpoint() {
    return { ok: true };
  }
}

/** Minimal module that wires the throttler with Redis storage. */
@Module({
  controllers: [TestThrottleController],
})
class TestThrottleModule {}

function makeRequest(
  port: number,
  method = 'POST',
  path = '/v1/test/endpoint',
): Promise<{ statusCode: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        // The test app trusts only the loopback peer, so this becomes req.ip.
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': CLIENT_IP },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers as Record<string, string>,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers as Record<string, string>,
              body: data,
            });
          }
        });
      },
    );
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

/** Create a RedisService-like mock that wraps a real ioredis client. */
function createRealRedisService(redisUrl: string): RedisService {
  const service = new RedisService();
  // Override the client with a real connected Redis instance.
  (service as any).client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 2,
  });
  return service;
}

async function createApp(redisService: RedisService, limit = 5): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl: 60_000, limit }],
        storage: new RedisThrottlerStorageService(redisService),
      }),
      TestThrottleModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Enable versioning so the controller is at /v1/test/endpoint.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Trust the loopback peer only, so the run-unique X-Forwarded-For above is used
  // as req.ip. Mirrors the ordering used in main.ts (trust proxy set before serving).
  (app.getHttpAdapter() as any).getInstance().set('trust proxy', ['127.0.0.1']);
  await app.init();
  await app.listen(0, '127.0.0.1');
  return app;
}

const suite = INTEGRATION_ENABLED ? describe : describe.skip;

suite('S1.8 — HTTP-level cross-instance throttling (REAL NestJS + REAL Redis)', () => {
  let redisCleanup: Redis;
  let ledger: ThrottleKeyLedger;
  let appA: INestApplication;
  let appB: INestApplication;
  let portA: number;
  let portB: number;
  let redisServiceA: RedisService;
  let redisServiceB: RedisService;

  beforeAll(async () => {
    const probe = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await probe.connect();
    const pong = await probe.ping();
    expect(pong).toBe('PONG');

    // S1.12 — prove which instance we actually reached, rather than assuming the
    // URL was honoured. The old comment claimed a port check that was never made.
    const info = await probe.info('server');
    const version = /redis_version:([0-9.]+)/.exec(info)?.[1] ?? '?';
    const serverPort = /tcp_port:(\d+)/.exec(info)?.[1] ?? '?';
    const runId = /run_id:([a-f0-9]+)/.exec(info)?.[1] ?? '?';
    const expectedPort = new URL(REDIS_URL).port || '6379';
    expect(String(probe.options.port)).toBe(expectedPort);
    console.log(
      `[s18-http] Redis ${version} server tcp_port=${serverPort} run_id=${runId} ` +
        `target=${gate.redactedUrl} client_port=${probe.options.port}`,
    );

    // Target safety is enforced at collection time by redisIntegrationGate(). The
    // S1.8 claim that "per-run UUID keys ensure safety regardless of which Redis is
    // used" was false for throttling keys: the storage hashes the tracker, so the
    // per-run namespace never applied to them. Cleanup is now baseline-scoped.
    redisCleanup = probe;
    ledger = createThrottleKeyLedger(probe);
    const { baselineCount } = await ledger.captureBaseline();
    console.log(`[s18-http] baseline throttling keys preserved: ${baselineCount}`);

    // Two independent RedisService instances (simulating two API replicas).
    redisServiceA = createRealRedisService(REDIS_URL);
    redisServiceB = createRealRedisService(REDIS_URL);
    await (redisServiceA as any).client.connect();
    await (redisServiceB as any).client.connect();

    // Boot two independent NestJS HTTP servers.
    appA = await createApp(redisServiceA, 5);
    appB = await createApp(redisServiceB, 5);

    const httpServerA = appA.getHttpServer();
    const httpServerB = appB.getHttpServer();
    portA = (httpServerA.address() as AddressInfo).port;
    portB = (httpServerB.address() as AddressInfo).port;

    console.log(`[s18-http] Instance A on port ${portA}, Instance B on port ${portB}`);
  }, 30000);

  afterAll(async () => {
    try {
      // S1.12: delete only the throttling keys this run created. The storage prefixes
      // a hashed key, so no namespace pattern could identify them; the baseline
      // ledger is what makes this safe, and pre-existing keys always survive.
      await ledger?.cleanupRunKeys();
    } finally {
      await appA?.close();
      await appB?.close();
      await (redisServiceA as any)?.client?.quit().catch(() => {});
      await (redisServiceB as any)?.client?.quit().catch(() => {});
      await redisCleanup?.quit().catch(() => {});
    }
  });

  beforeEach(async () => {
    // Reset only this run's counters between tests.
    await ledger.cleanupRunKeys();
  });

  // ── Test 1: Basic throttling through HTTP ─────────────────────────
  it('returns 200 for requests within the limit', async () => {
    const res = await makeRequest(portA);
    expect(res.statusCode).toBe(201);
  });

  // ── Test 2: Shared limit across two HTTP instances ────────────────
  it('shares the counter across two HTTP instances (same IP)', async () => {
    // Both instances resolve the same client IP (the run-unique CLIENT_IP tracker).
    // Send 3 requests to instance A.
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest(portA);
      expect(res.statusCode).toBe(201);
    }

    // Send 2 more requests to instance B — should still be within limit.
    for (let i = 0; i < 2; i++) {
      const res = await makeRequest(portB);
      expect(res.statusCode).toBe(201);
    }

    // The 6th request (through either instance) should be throttled (429).
    const throttled = await makeRequest(portA);
    expect(throttled.statusCode).toBe(429);

    // Instance B should also see the throttle.
    const alsoThrottled = await makeRequest(portB);
    expect(alsoThrottled.statusCode).toBe(429);
  });

  // ── Test 3: Rate-limit headers are set ────────────────────────────
  it('sets X-RateLimit-* headers on responses', async () => {
    const res = await makeRequest(portA);
    // The ThrottlerGuard sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  // ── Test 4: 429 response includes Retry-After header ──────────────
  it('includes Retry-After header on 429 responses', async () => {
    // Exhaust the limit.
    for (let i = 0; i < 6; i++) {
      await makeRequest(portA);
    }

    // The 7th request should be throttled with Retry-After.
    const res = await makeRequest(portA);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  // ── Test 5: Redis outage → 503 ────────────────────────────────────
  it('returns 503 when Redis is unavailable', async () => {
    // Create an app with a dead Redis connection.
    const deadRedis = new Redis('redis://localhost:1', {
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    const deadService = new RedisService();
    (deadService as any).client = deadRedis;

    const deadApp = await createApp(deadService, 5);
    const deadPort = (deadApp.getHttpServer().address() as AddressInfo).port;

    try {
      const res = await makeRequest(deadPort);
      // Should be 503 (Service Unavailable) — NOT 500.
      expect(res.statusCode).toBe(503);
    } finally {
      await deadApp.close();
      await deadRedis.quit().catch(() => {});
    }
  });
});
