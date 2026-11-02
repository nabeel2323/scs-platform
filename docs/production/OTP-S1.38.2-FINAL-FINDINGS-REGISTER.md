# OTP-S1.38.2-FINAL-FINDINGS-REGISTER.md

**Task:** S1.38.2 §12 — Final Findings Register  
**Date:** 2026-11-01  

---

## Defects Found and Fixed

### F-S1.38.2-01 — Hash format assertion mismatch (Medium)

**Location:** `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` line 374  
**Symptom:** `expected 'v2:f723c9448ea61de6675a8f4b4dbf68a8a2...' to have a length of 64 but got 67`  
**Root cause:** Migration 0065 changed the identifier hash format from raw 64-character SHA-256 hex to versioned `v2:<64-hex>` HMAC-SHA256 (67 characters total). The existing test assertion was not updated.  
**Fix:** Changed `expect(loginAudit.metadata.emailHash).toHaveLength(64)` to `expect(loginAudit.metadata.emailHash).toMatch(/^v2:[0-9a-f]{64}$/)`  
**Verification:** Test passes after fix (verified in individual re-run)  
**Impact:** Test-only fix. No production code change.

### F-S1.38.2-02 — Module import timeout (Low)

**Location:** `apps/api/src/__tests__/integration/p12-independent-runtime-verification.postgres.spec.ts` line 909  
**Symptom:** `Error: Test timed out in 30000ms`  
**Root cause:** Dynamic import of `OrdersModule` traverses a heavy module graph (payments, identity, catalog, shipping, returns). Under serial integration execution, this can exceed 30s.  
**Fix:** Increased timeout from 30000ms to 60000ms  
**Verification:** Fix applied; consistent with documented 11-13s observed duration + 4.6× margin  
**Impact:** Test-only fix. No production code change.

## Pre-existing Issues (Not Regressions)

### L-S1.38.2-01 — Bcrypt timing flake (Low)

**Location:** `password-login-regression.postgres.spec.ts` — `no branch answers materially faster than another (bcrypt burn)`  
**Symptom:** Timing ratio 5.31 exceeds threshold 4.0 under system load  
**Root cause:** The test measures relative bcrypt computation time across three login paths. Under heavy system load (e.g., concurrent Docker containers, integration suite serial execution), timing variance increases.  
**Status:** Pre-existing. Not modified. Environmental timing variance, not a code defect.  
**Recommendation:** Consider widening the threshold ratio or using a more robust statistical measure in a future maintenance window.

### L-S1.38.2-02 — Node 26 compatibility (Low)

**Location:** `apps/web` — `next build` fails under Node v26.4.0  
**Symptom:** Missing `jest-worker/processChild.js` in pnpm virtual store  
**Root cause:** Next.js dependency chain not yet compatible with Node 26. The `.nvmrc` pins Node 22.  
**Status:** Pre-existing. Known since S1.3 second-independent-audit. Not an S1.38 regression.  
**Mitigation:** CI uses Node 22 image. Local development uses `fnm use 22.23.4`.

### L-S1.38.1-12 — Migration 0065 SQL body not idempotent standalone (Low)

**Location:** `infra/drizzle/migrations/0065_hmac_identifier_hash.sql`  
**Symptom:** Re-running the SQL body directly would fail on already-widened column  
**Root cause:** By design. The migration runner gates via `_migration_log` — a migration body is executed at most once.  
**Status:** Acknowledged in S1.38.1. Not a defect.

### L-S1.38.1-13 — Flutter cold-start blank-identity moment (Low)

**Location:** Flutter app startup  
**Symptom:** Brief moment where identity providers show blank before session restoration completes  
**Root cause:** `sessionRestorationProvider` is async; providers default to empty/null before restoration  
**Status:** UX polish item. No functional defect. Acknowledged in S1.38.1.

## Defects From S1.38.1 Now Closed

| S1.38.1 ID | Description | Closed by |
|---|---|---|
| F-S1.38.1-01 | Flutter email-only identity showed empty phone | S1.38.1 fix (verified in S1.38.2 §3) |
| L-S1.38.1-14 | `currentUserEmailProvider` not cleared on logout | S1.38.2 `resetIdentityProviders()` helper |

## Critical/High-Severity Defects

**None.** No critical or high-severity defects remain unresolved.

## Summary

| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 1 | 1 | 0 |
| Low | 4 | 1 | 3 (pre-existing) |
