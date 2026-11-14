# OTP-S1.38.2-REAL-REDIS-VERIFICATION.md

**Task:** S1.38.2 §6 — Real-Redis Integration Test Verification  
**Date:** 2026-11-01  

---

## Redis Environment

| Parameter | Value |
|---|---|
| Provider | Docker `redis:7-alpine` |
| Container name | `s1382-redis-disposable` |
| Port mapping | 6380:6379 |
| Redis version | 7.4.11 |
| REDIS_URL | `redis://localhost:6380` |
| REDIS_IT | `1` |
| REDIS_DISPOSABLE_ACK | `1` |
| Persistence | None (ephemeral container) |

## Connectivity Verification

```
$ docker exec s1382-redis-disposable redis-cli ping
PONG
```

## Command

```
REDIS_URL=redis://localhost:6380 REDIS_IT=1 REDIS_DISPOSABLE_ACK=1 \
  npx vitest run src/__tests__/integration/otp-redis-lua.real.spec.ts \
  src/__tests__/integration/cross-instance-throttling.spec.ts \
  src/__tests__/integration/http-cross-instance-throttling.spec.ts \
  src/__tests__/integration/throttle-cleanup-sentinel.real.spec.ts \
  src/__tests__/integration/throttle-ip-isolation.spec.ts \
  --no-file-parallelism --reporter=verbose
```

## Results

### Summary

| Metric | Value |
|---|---|
| Test files | 5 |
| Tests collected | 33 |
| Passed | 33 |
| Failed | 0 |
| Skipped | 0 |
| Exit code | 0 |
| Duration | 29.32s |

### Per-Suite Breakdown

#### 1. `otp-redis-lua.real.spec.ts` — 12 tests ✓

Tests the actual Lua-based atomic OTP consume path against real Redis:

| # | Test | What It Proves |
|---|---|---|
| 1-2 | OTP challenge creation and retrieval | Redis key structure, TTL |
| 3-4 | Atomic verify-and-consume (success) | Lua script atomicity |
| 5 | Replay prevention (second consume fails) | Idempotent consume |
| 6 | Expired challenge returns -1 | TTL enforcement |
| 7 | Already-used challenge returns -2 | Consume flag persistence |
| 8-9 | Concurrent verification (exactly one winner) | Race condition prevention |
| 10 | Challenge supersession (new request invalidates previous) | CREATE_CHALLENGE Lua |
| 11 | Rate-limit enforcement via real Redis | ACQUIRE_RATE_LIMIT Lua |
| 12 | Rate-limit cleanup on success | Key cleanup verification |

#### 2. `cross-instance-throttling.spec.ts` — 8 tests ✓

Tests per-email and per-IP rate limiting across simulated multiple application instances sharing Redis:

- Independent rate-limit budgets per instance
- Shared counters via Redis keys
- Per-email limit (5/15min) enforcement
- Per-IP limit (20/1min) enforcement
- Rate-limit recovery after window expiry

#### 3. `http-cross-instance-throttling.spec.ts` — 5 tests ✓

HTTP-level cross-instance throttling with real NestJS + real Redis:

- Returns 429 when rate limit exceeded
- Returns 503 when Redis is unavailable
- Cross-instance counter sharing
- Rate-limit headers propagation

#### 4. `throttle-ip-isolation.spec.ts` — 3 tests ✓

IP-based throttle isolation:

- Different XFF client IPs receive independent budgets
- Same XFF client IP shares budget across instances
- Multi-hop XFF under explicit-list trust

#### 5. `throttle-cleanup-sentinel.real.spec.ts` — 5 tests ✓

Cleanup preserves unrelated sentinel keys:

- Sentinel keys inside namespace confirmed
- Run-specific counters removed, sentinel counters preserved
- Other suite namespaced keys untouched
- Exact-key cleanup removes only enumerated keys
- Zero outstanding run keys after cleanup

## assert-redis-suite.mjs Gate

```
$ node scripts/assert-redis-suite.mjs .vitest-redis-results.json
✓ otp-redis-lua.real.spec.ts discovered and executed
  Status: passed
  Tests: 12 passed, 0 failed, 0 skipped
✓ All 12 tests passed
✓ cross-instance-throttling.spec.ts executed (8 passed)
✓ http-cross-instance-throttling.spec.ts executed (5 passed)
✓ throttle-ip-isolation.spec.ts executed (3 passed)
✓ throttle-cleanup-sentinel.real.spec.ts executed (5 passed)
Redis integration gate: PASS
```

## CI Workflow Verification

`.github/workflows/ci.yml` lines 166-171:

```yaml
- run: pnpm --filter @scs/api test:integration
  env:
    DATABASE_URL: postgresql://scs:scs_test@localhost:5432/scs_test
    REDIS_URL: redis://localhost:6379
    REDIS_IT: '1'
    REDIS_DISPOSABLE_ACK: '1'
```

The CI workflow:
- Declares `redis:7-alpine` service on port 6379 with `redis-cli ping` healthcheck
- Sets `REDIS_IT=1` explicitly (closes S1.38.1 Condition 3)
- Sets `REDIS_DISPOSABLE_ACK=1` (attests disposability)
- The `test:integration` script runs `assert-redis-suite.mjs` which fails the job if:
  - `otp-redis-lua.real.spec.ts` is not discovered, not passed, or not exactly 12 tests
  - Any of the 4 throttling suites are skipped

## Security Properties Verified Against Real Redis

| Property | Test Evidence | Redis Type |
|---|---|---|
| Atomic OTP consume (Lua) | otp-redis-lua tests 3-5 | Real |
| Replay prevention | otp-redis-lua test 5 | Real |
| Concurrent verification → one winner | otp-redis-lua tests 8-9 | Real |
| Challenge supersession | otp-redis-lua test 10 | Real |
| Per-email rate limit (real Redis) | cross-instance-throttling | Real |
| Per-IP rate limit (real Redis) | throttle-ip-isolation | Real |
| Cross-instance counter sharing | cross-instance + http-cross-instance | Real |
| Cleanup sentinel preservation | throttle-cleanup-sentinel | Real |

## What Is NOT Claimed

- **Distributed multi-instance rate limiting** is verified only in the sense that multiple test clients share the same Redis instance and observe shared counters. This is not the same as running multiple application server processes behind a load balancer.
- **Redis Cluster / Sentinel** is not tested. The disposable instance is standalone Redis 7.4.
- **Production Redis** was never touched. All operations were against the disposable Docker container.

## Retained Evidence

- `.m73b6-scratch/s1382-redis-suites.log` — full verbose output
- `apps/api/.vitest-redis-results.json` — JSON reporter output
- Docker container `s1382-redis-disposable` — can be inspected or removed
