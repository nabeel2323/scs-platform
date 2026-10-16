# SCS-M7.3-B.3.3.2.2 — IMPLEMENTATION REPORT

**Retry-After Header Parsing**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.2.2 |
| Task type | Implementation + Testing |
| Date | 2026-10-01 |
| Branch | develop |
| Starting commit | ac000d0 |
| Ending commit | ac000d0 (uncommitted changes) |
| Predecessor | M7.3-B.3.3.2.1 — CLOSED / PASS |
| Business Lock | SCS-M7.3-B.3.3.2.2-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Architecture Audit | SCS-M7.3-B.3.3.2.2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS) |

---

## 1. Files Changed

### Production

| File | Change | Lines |
|---|---|---|
| `apps/api/src/modules/shipping/carrier-http-client.ts` | Modified | +42, -3 |

### Tests

| File | Change | Lines |
|---|---|---|
| `apps/api/src/__tests__/unit/shipping/m73b3322-retry-after-parsing.spec.ts` | Created | 608 |
| `apps/api/src/__tests__/integration/m73b3322-retry-after-header-parsing.postgres.spec.ts` | Created | 391 |

### Documentation

| File | Change |
|---|---|
| `docs/production/SCS-M7.3-B.3.3.2.2-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | Created (previous task) |
| `docs/production/SCS-M7.3-B.3.3.2.2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | Created (previous task) |

### NOT Changed (verified)

- `carrier-errors.ts` — No change needed
- `carrier-retry-policy.ts` — No change needed
- `carrier-circuit-breaker.ts` — No change needed
- `shipping-carrier.worker.ts` — No change needed
- `aramex.provider.ts` — No change needed
- No migration files created
- No schema files changed
- No dependency changes (package.json, pnpm-lock.yaml)

---

## 2. Implementation Summary

### What Was Done

A single production file (`carrier-http-client.ts`) was modified to close the Retry-After header parsing gap:

1. **Added `parseRetryAfterSeconds()` function** (exported, lines 87–120):
   - Accepts `string | null` (from `Headers.get()`)
   - Returns `number | undefined`
   - Strict validation: null/empty check → trim → regex `/^-?\d+$/` → `parseInt(trimmed, 10)` → `Number.isFinite()` → `parsed > 0` → `parsed <= 86400`
   - Never throws
   - HTTP-date NOT supported (deferred per BD-01, BD-11)

2. **Modified `classifyHttpStatus()` signature** (line 384):
   - Added optional `responseHeaders?: Headers` parameter
   - Backward compatible (optional parameter)

3. **Modified HTTP 429 handling** (lines 415–423):
   - Reads `responseHeaders.get('retry-after')` when headers available
   - Parses via `parseRetryAfterSeconds()`
   - Passes `retryAfterSeconds` to `RateLimitCarrierError` constructor

4. **Updated call site** (line 207):
   - Passes `response.headers` to `classifyHttpStatus()`

### What Was NOT Done (by design)

- No HTTP-date parsing (BD-01, BD-11)
- No changes to `carrier-errors.ts` (contract already sufficient)
- No changes to `carrier-retry-policy.ts` (already consumes `retryAfterSeconds`)
- No changes to `shipping-carrier.worker.ts` (error propagation preserves object by reference)
- No migration (BD-14)
- No new scheduler (BD-15)
- No provider-specific logic (BD-13)

---

## 3. Parser Behavior

### Validation Algorithm

```
parseRetryAfterSeconds(value: string | null): number | undefined
  1. null or '' → undefined
  2. trim whitespace
  3. trimmed === '' → undefined
  4. regex /^-?\d+$/ fails → undefined
  5. parseInt(trimmed, 10)
  6. !Number.isFinite(parsed) → undefined
  7. parsed <= 0 → undefined (zero and negative)
  8. parsed > 86400 → undefined (upper bound)
  9. return parsed
```

### Malformed Input Matrix

| Input | Result | Reason |
|---|---|---|
| `"30"` | `30` | Valid |
| `"120"` | `120` | Valid |
| `"3600"` | `3600` | Valid |
| `"7200"` | `7200` | Valid (policy caps at 3600) |
| `"86400"` | `86400` | Valid (policy caps at 3600) |
| `" 30 "` | `30` | Trimmed |
| `null` | `undefined` | Missing |
| `""` | `undefined` | Empty |
| `"   "` | `undefined` | Whitespace-only |
| `"abc"` | `undefined` | Non-numeric |
| `"NaN"` | `undefined` | Not digits |
| `"Infinity"` | `undefined` | Not digits |
| `"-1"` | `undefined` | Negative |
| `"0"` | `undefined` | Zero |
| `"1.5"` | `undefined` | Fractional |
| `"30abc"` | `undefined` | Suffix garbage |
| `'"30"'` | `undefined` | Quoted |
| `"30, 60"` | `undefined` | Duplicate headers |
| `"999999999999"` | `undefined` | Exceeds upper bound |
| `"Wed, 21 Oct 2015..."` | `undefined` | HTTP-date |

---

## 4. Retry-After Propagation

The full propagation path after implementation:

```
Carrier HTTP 429 + Retry-After: 120
        ↓
native fetch() response
        ↓
response.headers.get('retry-after') → "120"
        ↓
parseRetryAfterSeconds("120") → 120
        ↓
RateLimitCarrierError { retryAfterSeconds: 120 }
        ↓
throw classified (line 217)
        ↓
handleCancel() catch → classifyCarrierError(err) → decision='backoff'
        ↓
carrierCancelStatus = PENDING, carrierCancelRetries++, throw err
        ↓
processEvent() catch → handleFailure(eventId, event, err)
        ↓
retryPolicy.classify(err, attempts)
        ↓
calculateDelay(): err instanceof RateLimitCarrierError && err.retryAfterSeconds
        ↓
Math.min(120 * 1000, 3_600_000) = 120_000ms
        ↓
outbox: PENDING, nextAttemptAt = now + 120s
```

### Boundaries Verified

| Boundary | retryAfterSeconds preserved? |
|---|---|
| HTTP client → error object | **YES** (now set from header) |
| Error throw → handleCancel catch | YES (same object reference) |
| handleCancel re-throw → processEvent catch | YES (same object reference) |
| processEvent → handleFailure | YES (same object passed as `err`) |
| handleFailure → retryPolicy.classify | YES (`instanceof` preserves type) |
| classify → calculateDelay | YES (`err.retryAfterSeconds` accessed) |

---

## 5. Error Propagation Verification

The error object flows by reference through all boundaries. No boundary serializes or reconstructs the error. The `retryAfterSeconds` field is set once at the HTTP client boundary and read once at the retry policy boundary. No intermediate code accesses or modifies it.

---

## 6. Unit Test Results

**File:** `m73b3322-retry-after-parsing.spec.ts`

| Suite | Tests | Result |
|---|---|---|
| B3322-U-01: Valid integer values | 6 | PASS |
| B3322-U-02: Missing / null / empty | 3 | PASS |
| B3322-U-03: Malformed inputs rejected | 6 | PASS |
| B3322-U-04: Zero rejected | 1 | PASS |
| B3322-U-05: Negative rejected | 2 | PASS |
| B3322-U-06: Fractional rejected | 3 | PASS |
| B3322-U-07: Upper bound rejected | 3 | PASS |
| B3322-U-08: Whitespace trimming | 3 | PASS |
| B3322-U-09: Duplicate headers rejected | 1 | PASS |
| B3322-U-10: HTTP-date rejected | 1 | PASS |
| B3322-U-11..17: HTTP client 429 integration | 15 | PASS |
| B3322-U-16: Existing 500/502/503/504 unchanged | 6 | PASS |
| B3322-U-17: No credential leakage | 3 | PASS |
| B3322-U-18: Zero rejected (explicit) | 1 | PASS |
| B3322-U-19: Quoted value rejected | 1 | PASS |
| B3322-U-20: Suffix garbage rejected | 2 | PASS |
| **Total** | **57** | **ALL PASS** |

Duration: 7.69s

---

## 7. PostgreSQL Results

**File:** `m73b3322-retry-after-header-parsing.postgres.spec.ts`

| Test | Result | Duration |
|---|---|---|
| B3322-PG-01: Valid Retry-After: 120 → nextAttemptAt ≈ now + 120s | PASS | ~2s |
| B3322-PG-02: Retry-After: 7200 → nextAttemptAt capped at 1h | PASS | ~2s |
| B3322-PG-03: Missing Retry-After → 2× backoff (60s ±25% jitter) | PASS | ~2s |
| B3322-PG-04: retryAfterSeconds=0 (malformed sim) → 2× backoff | PASS | ~2s |
| B3322-PG-05: Retry-After does not bypass FOR UPDATE SKIP LOCKED | PASS | <1s |
| **Total** | **5/5 PASS** | **8.46s** |

Used real PostgreSQL via testcontainers (postgres:16-alpine).

---

## 8. Concurrency Results

B3322-PG-05 verifies that Retry-After scheduling does not bypass `FOR UPDATE SKIP LOCKED`:
- 100 concurrent claim attempts on a single PENDING outbox event
- Exactly 1 worker claims the event
- No duplicate processing

This reuses the same concurrency infrastructure as B.3.3.2.1 PG-09.

---

## 9. Regression Results

### B.3.3.2.1 Unit Regression

| File | Tests | Result |
|---|---|---|
| `m73b3321-retry-state-foundation.spec.ts` | 26 | **26/26 PASS** |

### B.3.3.2.1 PostgreSQL Regression

| File | Tests | Result |
|---|---|---|
| `m73b3321-retry-state-foundation.postgres.spec.ts` | 11 | **11/11 PASS** (8.88s) |

### Retry Policy Regression

| File | Tests | Result |
|---|---|---|
| `carrier-retry-policy.spec.ts` | 16 | **16/16 PASS** |

### Full Non-PG Suite

| Metric | Value |
|---|---|
| Test files | 83 passed, 1 failed (84 total) |
| Tests | 1562 passed, 1 failed (1563 total) |
| Duration | 79.90s |

**The 1 failure is pre-existing:**
- `webhook-rate-limiting.spec.ts` > `CarrierWebhookController imports ThrottlerGuard` — timeout at 5000ms under suite contention
- This is a pre-existing infrastructure flake documented in previous milestones
- NOT a code failure from B.3.3.2.2

---

## 10. TypeScript Result

```
tsc --noEmit: 0 errors
```

---

## 11. Build Result

```
nest build: 266 files compiled with swc, 0 issues
```

---

## 12. Security Result

| Check | Result |
|---|---|
| Raw header NOT persisted | PASS — only validated integer reaches error object |
| Raw header NOT logged | PASS — `toSafeMessage()` includes only the integer |
| Raw header NOT in SQL | PASS — `nextAttemptAt` is a computed Date |
| No header injection | PASS — regex rejects all non-digit characters |
| No prototype pollution | PASS — pure function, no object key assignment |
| No NaN propagation | PASS — `Number.isFinite()` check |
| No negative delay | PASS — `parsed > 0` check |
| No integer overflow | PASS — `parsed <= 86400` upper bound |
| No credential leakage | PASS — unit test B3322-U-17 verifies |

---

## 13. Scope Verification

### Expected vs. Actual

| Expected | Actual | Match |
|---|---|---|
| Only `carrier-http-client.ts` modified | Only `carrier-http-client.ts` modified | YES |
| ~20-30 lines added | +42 lines (includes JSDoc comments) | YES |
| No changes to `carrier-errors.ts` | No changes | YES |
| No changes to `carrier-retry-policy.ts` | No changes | YES |
| No changes to `shipping-carrier.worker.ts` | No changes | YES |
| No migration | No migration | YES |
| No new scheduler | No new scheduler | YES |
| No HTTP-date | No HTTP-date | YES |
| No provider-specific logic | No provider-specific logic | YES |

### Git Diff Summary

```
 M apps/api/src/modules/shipping/carrier-http-client.ts    (+42, -3)
?? apps/api/src/__tests__/unit/shipping/m73b3322-retry-after-parsing.spec.ts
?? apps/api/src/__tests__/integration/m73b3322-retry-after-header-parsing.postgres.spec.ts
?? docs/production/SCS-M7.3-B.3.3.2.2-BUSINESS-RULES-ARCHITECTURE-LOCK.md
?? docs/production/SCS-M7.3-B.3.3.2.2-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md
```

---

## 14. Infrastructure Limitations

None encountered. Docker was available, testcontainers worked correctly, all PostgreSQL tests ran against real PostgreSQL.

---

## 15. Pre-Existing Failures

| Test | Failure | Classification |
|---|---|---|
| `webhook-rate-limiting.spec.ts` > `CarrierWebhookController imports ThrottlerGuard` | Timeout at 5000ms | Pre-existing infrastructure flake (documented in B.3.3.1, B.3.3.2.1) |

---

## 16. Confirmations

| Confirmation | Status |
|---|---|
| No migration was created | CONFIRMED |
| No scheduler was introduced | CONFIRMED |
| HTTP-date remains deferred | CONFIRMED |
| No production code changed except `carrier-http-client.ts` | CONFIRMED |
| No test files modified (only new files created) | CONFIRMED |
| No dependency changes | CONFIRMED |
| All 16 locked decisions (BD-01 through BD-16) honored | CONFIRMED |

---

## 17. Final Implementation Verdict

**IMPLEMENTATION COMPLETE.**

- 1 production file modified (`carrier-http-client.ts`, +42/-3)
- 57 unit tests: ALL PASS
- 5 PostgreSQL tests: ALL PASS
- B.3.3.2.1 regression: 26/26 unit + 11/11 PG — ALL PASS
- Retry policy regression: 16/16 — ALL PASS
- Full non-PG suite: 1562 passed, 1 pre-existing flake (0 code failures)
- TypeScript: 0 errors
- Nest build: 266 files, 0 issues
- Scope: exactly as locked, no expansion

**Next phase: M7.3-B.3.3.2.2 — Independent Runtime Verification**

*The milestone is NOT yet closed. Release closure follows independent runtime verification.*
