# OTP-S1.38.3-INTEGRATION-FAILURE-ANALYSIS.md

**Task:** S1.38.3 §4-§5 — Root cause analysis and remediation of integration failures  
**Date:** 2026-11-02

---

## Summary

Three test-harness defects prevented the canonical `pnpm --filter @scs/api test:integration` command from exiting 0. None were product defects or security regressions. All three are now resolved and verified in the full integration run (1584/1584 pass, exit 0).

---

## F1: m73b4-delivery-exceptions B4-PG-03 Timeout

**Symptom:** `Test timed out in 5000ms` on the default Vitest per-test timeout.

**Test:** `B4-PG-03: all eight exception types are accepted`

**Root Cause:** The test iterates 8 exception types, calling `createOrderOutForDelivery()` for each. This helper executes a complete order lifecycle per iteration: cart INSERT → checkout → acceptOrder → prepareOrder → readyOrder → assignDriver → pickupOrder → outForDeliveryOrder. That is 8 × 7 service calls plus 8 INSERT queries and 8 exception reports. Each order cycle averages ~800-1000ms. Total workload: ~6.3-8s, exceeding the default 5s.

**Evidence:**
- Isolated run: B4-PG-03 completed in **6,328ms** after the fix (18/18 pass)
- B4-PG-02 (1 order cycle + 2 queries): 893ms in the same file
- B4-PG-12 (1 order cycle + 100 concurrent calls): 2,367ms

**Fix:** Added explicit `}, 30_000)` per-test timeout. Justification: 6.3s measured × 3× safety margin = 30s. No production code, assertion, or coverage change.

---

## F2: p12 OrdersModule Dynamic Import Timeout

**Symptom:** `Test timed out in 60000ms` despite the S1.38.2 increase from 30s to 60s.

**Test:** `OrdersModule imports PaymentsModule (or exports PaymentsService) for checkout integration`

**Root Cause:** `await import('../../modules/orders/orders.module')` pulls the full NestJS module-graph transitive closure (orders → payments → identity → catalog → shipping → returns + all their dependencies). This triggers TypeScript/SWC compilation and module resolution for every transitive import.

**Evidence:**
- S1.13 measured: 11-13s (isolated, early session)
- S1.38.2: still failed at 60s in full suite
- S1.38.3 first isolated run: **52,069ms** (Docker resource contention from ~70 preceding Testcontainers)
- S1.38.3 second isolated run: **10,583ms** (clean environment, minimal contention)
- S1.38.3 full suite final: passed within 120s

**Analysis:** The 52s measurement is not an architecture defect — it's the same import completing on a resource-pressured host (multiple Testcontainers starting/stopping serially). The actual compilation path is finite and correct.

**Fix:** Increased timeout to `120_000` (2 minutes) with documented measurements. Justification: worst-case observed 52s × 2.3× margin = 120s. No assertion weakened, no mock introduced, the architectural relationship is still verified by actually loading the module.

---

## F3: password-login-regression Bcrypt Timing Flake

**Symptom:** `expected 4.671232876712328 to be less than 4` in the assertion `expect(ratio).toBeLessThan(4)`.

**Test:** `no branch answers materially faster than another (bcrypt burn)`

**Root Cause:** Cost-factor mismatch between the test seed and the production service.
- Test seeds user passwords with `bcrypt.hash(password, 10)` (cost 10 → ~60ms per compare)
- `getUnknownUserPasswordHash()` uses `bcrypt.hash(uuid, 12)` (cost 12 → ~250ms per compare)
- Ratio: 250ms / 60ms ≈ 4.2× — at or beyond the 4.0 threshold

The test is designed to verify that both paths (unknown email and wrong password) do equivalent bcrypt work, preventing enumeration. However, the different cost factors made the "unknown" path legitimately slower (it hits cost 12, the "wrong" path hits cost 10), violating the ratio assertion.

**Evidence:**
- Isolated single-sample: sometimes passes, sometimes ratio ≈ 4.2-4.7
- Full-suite: consistently fails due to resource contention amplifying timing variance
- After fix (cost 12 alignment + median-of-3): passes reliably

**Fix (two-part):**
1. **Cost alignment:** Changed test seed from `bcrypt.hash(password, 10)` to `bcrypt.hash(password, 12)` to match the production `getUnknownUserPasswordHash()`. Both paths now do equivalent bcrypt work (~250ms each).
2. **Statistical robustness:** Replaced single-sample with median-of-3 per path. This eliminates transient scheduler/Docker jitter without weakening the security assertion.
3. Added `}, 30_000)` per-test timeout for the additional measurement iterations.

**Security Invariant Preserved:** The test still verifies that no login path returns materially faster than another, preventing user enumeration via timing.

---

## Classification

| Failure | Category | Blocking Phase 1? |
|---|---|---|
| F1 | Test-harness timeout (insufficient budget for legitimate workload) | No — resolved |
| F2 | Test-harness timeout (environmental resource contention) | No — resolved |
| F3 | Test-harness defect (cost-factor mismatch between seed and production) | No — resolved |

None are product defects, security vulnerabilities, or Phase 1 regressions.
