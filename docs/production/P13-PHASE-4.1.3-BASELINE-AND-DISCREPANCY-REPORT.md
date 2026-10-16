# P13 Phase 4.1.3 — Baseline and Discrepancy Report

**Stage A** · Status: **COMPLETE**  
Date: 2026-10-15  
Branch: `develop`  
HEAD: `ed6c30f2bfcd21db883f2e5ec4a7a0cda65cd75c`

---

## 1. Container Image Identity

### 1.1 Actual Image State

**Image:** `scs-api:p41-local`  
**Image ID:** `e00a194fd4f6`  
**Size:** 1.76GB  
**Created:** 2026-10-15 (14 minutes before baseline inspection)  
**Runtime user:** `node` (uid=1000, gid=1000) — **VERIFIED NON-ROOT**

### 1.2 Build History

| Build | Size | User | Status |
|-------|------|------|--------|
| Initial (cached) | 349MB | root (uid=0) | ❌ Incorrect |
| Rebuilt (--no-cache) | 1.76GB | node (uid=1000) | ✅ Correct |

### 1.3 Verification Scenarios

**Smoke test (Phase 4.1.2):** Performed on rebuilt image (1.76GB, non-root user)
- Container started successfully
- Health endpoints responded correctly
- P13 configuration applied as expected

**Current status:** Image is the authoritative build for all Phase 4.1.2 and 4.1.3 verification.

---

## 2. Operations Endpoint Discrepancy

### 2.1 Discrepancy Identified

**Phase 4.1.2 smoke report claimed:**
- `GET /v1/p13/ops/status` returns 404
- Endpoint not implemented

**Actual implementation:**
- Controller: `OperationsController` at `admin/ops/p13`
- Status endpoint: `GET /status`
- Full path: **`GET /v1/admin/ops/p13/status`** (with `/v1` prefix from `enableVersioning()`)

### 2.2 Endpoint Verification

**File:** `apps/api/src/modules/operations/operations.controller.ts`

```typescript
@Controller('admin/ops/p13')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  @Get('status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async status() {
    // Returns worker lease, control, alerts, pilot state
  }
}
```

**Authentication:** ✅ REQUIRED (JwtAuthGuard)  
**Authorization:** ✅ REQUIRED (`admin:returns:read` permission)  
**Permission scope:** SUPER_ADMIN and ADMIN only (per seed-pg.ts)

### 2.3 Response Structure

The endpoint returns:
```json
{
  "worker": {
    "leaseKey": "p13.worker.lease",
    "holder": "<holder-id>",
    "holderHost": "<hostname>",
    "holderPid": <pid>,
    "epoch": <epoch>,
    "heartbeatAt": "<timestamp>",
    "expiresAt": "<timestamp>",
    "liveHolders": <count>,
    "pollFailures": <count>,
    "lastErrorCode": "<code>",
    "lastJobAt": "<timestamp>",
    "lastJobSummary": {...},
    "thisInstance": "<holder-id>"
  },
  "control": {
    "paused": false,
    "reason": null,
    "pausedAt": null,
    "resumedAt": "<timestamp>",
    "actorId": "<actor-id>"
  },
  "alerts": {
    "open": <count>,
    "resolved": <count>,
    "lastAlertAt": "<timestamp>",
    "lastConditionKey": "<key>",
    "lastSeverity": "<severity>"
  },
  "pilot": {
    "enabled": false,
    "mode": "legacy",
    "allowlistCount": 0
  }
}
```

### 2.4 Alert Channel Exposure

**Does it expose the configured alert channel without exposing secrets?**

✅ **YES** — The `alerts` section returns aggregate counts and metadata, not the webhook URL or secret. The `describeAlertSink()` function (in `env-gate.ts`) returns only the hostname, not the full URL.

### 2.5 Root Cause

**The smoke report used the wrong path.** The correct path is `/v1/admin/ops/p13/status`, not `/v1/p13/ops/status`.

**No code defect exists.** The endpoint is correctly implemented with proper authentication and authorization.

### 2.6 HTTP Test Coverage

**Existing test:** `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts`

**Test HA-06:** "every operations route requires its permission key"  
**Result:** ✅ PASS (verified in Phase 4.1.2, 34/34 tests passing)

**Test HA-08:** "an authorized ADMIN can reach every operations route"  
**Result:** ✅ PASS

---

## 3. Repository State

### 3.1 Working Tree

**Modified files:** 22 (Phase 4 + 4.1 + 4.1.2 changes)  
**Untracked files:** 30+ (Phase 4 + 4.1 + 4.1.2 artifacts)

**Key artifacts:**
- `.github/workflows/ci.yml` — Modified (container-build job added)
- `infra/deploy/api.Dockerfile` — Untracked (Phase 4.1)
- `infra/docker-compose.prod.yml` — Untracked (Phase 4.1)
- `apps/api/src/modules/operations/` — Untracked (Phase 4)
- `docs/production/P13-PHASE-4.1.2-*.md` — Untracked (7 reports)

### 3.2 Docker Environment

**Images:**
- `scs-api:p41-local` (e00a194fd4f6, 1.76GB) — API image (rebuilt with USER node)

**Containers:** None running (cleaned up after smoke test)

**Networks:** None (cleaned up after smoke test)

### 3.3 CI Workflow

**File:** `.github/workflows/ci.yml` (394 lines)  
**Jobs:** 10 (including new `container-build` job)  
**Validation:** ✅ YAML valid locally

---

## 4. Existing Test Evidence

### 4.1 Test Suites (Phase 4.1.2)

| Suite | Tests | Result | Duration |
|-------|-------|--------|----------|
| Deployment invariants | 36 | ✅ 36/36 | 1.95s |
| Operational readiness | 59 | ✅ 59/59 | 71.88s |
| Returns/refunds/disputes | 24 | ✅ 24/24 | 36.61s |
| Financial dispute integration | 10 | ✅ 10/10 | 34.02s |
| Concurrency | 6 | ✅ 6/6 | 25.60s |
| HTTP authorization | 34 | ✅ 34/34 | 95.15s |

**Total:** 169 tests passing

### 4.2 Operations Endpoint Tests

**File:** `p4-http-authorization.postgres.spec.ts`

**Relevant tests:**
- HA-06: Every operations route requires its permission key ✅
- HA-08: An authorized ADMIN can reach every operations route ✅

**Coverage:** The operations endpoint (`/v1/admin/ops/p13/status`) is verified through the HTTP authorization suite.

---

## 5. Discrepancy Resolution

### 5.1 Container Image Identity

**Resolution:** ✅ RESOLVED
- Rebuilt image (1.76GB) is the authoritative build
- Runs as non-root user `node` (uid=1000)
- All Phase 4.1.2 verification used this image

### 5.2 Operations Endpoint

**Resolution:** ✅ RESOLVED
- Correct path: `/v1/admin/ops/p13/status`
- Authenticated (JwtAuthGuard)
- Authorized (`admin:returns:read` permission)
- Does not expose secrets (only aggregate counts and metadata)
- Smoke report used wrong path; no code defect exists

---

## 6. Conclusion

**Overall verdict: PASS**

Both discrepancies identified in the Phase 4.1.3 task specification have been resolved:

1. ✅ Container image identity clarified (rebuilt image is authoritative)
2. ✅ Operations endpoint discrepancy resolved (correct path identified, no defect)

**Key findings:**
1. Rebuilt image (1.76GB) runs as non-root user `node`
2. Operations endpoint at `/v1/admin/ops/p13/status` is correctly implemented
3. Endpoint requires authentication and `admin:returns:read` permission
4. Endpoint does not expose secrets (only aggregate data)
5. HTTP authorization tests verify the endpoint (34/34 passing)
6. All 169 tests from Phase 4.1.2 remain valid

**Recommendation:** Proceed with remaining Phase 4.1.3 stages, reusing existing test evidence where appropriate.

---

**Report prepared:** 2026-10-15 01:45 UTC  
**Branch:** develop  
**HEAD:** ed6c30f  
**Image:** scs-api:p41-local (e00a194fd4f6, 1.76GB, non-root user verified)  
**Operations endpoint:** `/v1/admin/ops/p13/status` (authenticated, authorized)  
**Discrepancies:** ✅ RESOLVED
