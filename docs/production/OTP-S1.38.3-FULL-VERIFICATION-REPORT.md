# OTP-S1.38.3-FULL-VERIFICATION-REPORT.md

**Task:** S1.38.3 §6–§10 — Authoritative Full Verification Report
**Date:** 2026-11-02
**Branch:** feat/auth-email-otp-phase1
**Baseline HEAD:** c3c0047e0c686525abb205ed3066c78a16765237 (all S1.38.x work in working tree, uncommitted — commit not authorized)
**Execution policy:** Every number below was measured in this S1.38.3 session. No count is copied from an earlier execution report.

---

## 1. Integration Gate (§6) — THE GATE THAT S1.38.2 FAILED

### Command (canonical, from `apps/api/package.json`)

```
pnpm --filter @scs/api test:integration
```

expands to:

```
vitest run src/__tests__/integration --no-file-parallelism
  --reporter=json --outputFile=.vitest-integration-results.json
  && node scripts/assert-redis-suite.mjs .vitest-integration-results.json
```

Environment: `REDIS_URL=redis://localhost:6380` `REDIS_IT=1` `REDIS_DISPOSABLE_ACK=1` `NODE_ENV=test`, disposable Docker Redis `s1383-redis-disposable` (redis:7-alpine 7.4.11), PostgreSQL via per-spec Testcontainers (postgis/postgis:16-3.4).

### Final Run Result (2026-11-02, log `.m73b6-scratch/s1383-integration-final.log`)

| Metric | Value | Source |
|---|---|---|
| Test files | **81** | `.vitest-integration-results.json` (`testResults.length`) |
| Tests collected | **1584** | JSON `numTotalTests` |
| Passed | **1584** | JSON `numPassedTests` |
| Failed | **0** | JSON `numFailedTests` |
| Skipped/Pending | **0** | per-status count `{passed: 1584}` only |
| Pending suites | **0** | JSON `numPendingTestSuites` |
| Command exit code | **0** | console `INTEGRATION_EXIT: 0` |
| assert-redis-suite.mjs | **PASS** (exit 0, chained in same script) | log tail |

JSON, console summary, and retained log agree exactly.

### Previously-Failing Tests — Disposed Individually and in Suite

| File | S1.38.2 status | S1.38.3 isolated | S1.38.3 full-run |
|---|---|---|---|
| `m73b4-delivery-exceptions.postgres.spec.ts` | B4-PG-03 timeout @5s | 18/18 (B4-PG-03 in 6,328ms) | ✓ within 1584/1584 |
| `p12-independent-runtime-verification.postgres.spec.ts` | OrdersModule import timeout @60s | 74/74 (import 10,583ms clean / 52,069ms loaded) | ✓ within 1584/1584 |
| `password-login-regression.postgres.spec.ts` | (latent bcrypt flake) | 17/17 | ✓ within 1584/1584 |

### Five Real-Redis Suites (§6 requirement)

| Suite | Tests | Result |
|---|---|---|
| `otp-redis-lua.real.spec.ts` | 12 | ✓ 12/12, 0 skipped |
| `cross-instance-throttling.spec.ts` | 8 | ✓ 8/8 |
| `http-cross-instance-throttling.spec.ts` | 5 | ✓ 5/5 |
| `throttle-cleanup-sentinel.real.spec.ts` | 5 | ✓ 5/5 |
| `throttle-ip-isolation.spec.ts` | 3 | ✓ 3/3 |
| **Total** | **33** | **33/33 executed — no silent skips** |

Disposable-Redis safeguards preserved: `REDIS_DISPOSABLE_ACK=1` attestation enforced by `redis-integration-env.ts` at collection time; run-scoped exact-key throttle cleanup with sentinel preservation; persistent Redis never contacted. Container removed after the run.

### Interim Attempt (for the record)

First full run (`.m73b6-scratch/s1383-full-integration.log`): 1583/1584, exit 1 — single failure was the bcrypt timing test (F3), root-caused and fixed before the final run. This attempt is retained evidence that the final pass was not obtained by lowering assertions.

## 2. API Unit Suite (§7)

| Metric | Value |
|---|---|
| Command | `pnpm --filter @scs/api test:coverage` (unit project; same 118-file/2326-test population as `test:unit`) |
| Files | **118** |
| Tests | **2326 passed / 2326** |
| Failed / Skipped | 0 / 0 |
| Exit code | **0** |
| Duration | 119.32s |
| Log | `.m73b6-scratch/s1383-full-unit.log` + `apps/api/.vitest-unit-results.json` |

**Reconciliation of §7 contradiction:** 2326 is confirmed as the *current* count by fresh execution; the S1.38.2 CI report's "pending" label and the execution report's unattached "2326" claim are both closed by this measured run (see OTP-S1.38.3-REPORT-RECONCILIATION.md §3). Unit (118 files) and integration (81 files) populations are disjoint by directory (`src/__tests__/unit` vs `src/__tests__/integration`).

## 3. Web (§8)

| Check | Command | Result | Exit |
|---|---|---|---|
| Full Web test suite | `pnpm --filter @scs/web test` | 5 files, **55/55** (includes email-OTP login + account-linking component tests — the S1.38.2 "29-test" targeted subset is contained in this run) | 0 |
| TypeScript check | `tsc --noEmit` (web) | 0 issues | 0 |
| Production build | `pnpm --filter @scs/web build` under **Node 22.23.4** (fnm) | Next.js build complete, full route table emitted | 0 |

Note: the web build initially failed due to an empty `next` entry in the pnpm virtual store (environment defect, documented project repair); fixed with `pnpm install --force`, then build exit 0. No source change.

## 4. Flutter (§8)

| Check | Command | Result | Exit |
|---|---|---|---|
| Complete suite | `flutter test` | **137/137** "All tests passed!" (email-OTP login widget, profile linking, logout identity cleanup, existing auth flows) | 0 |
| Dart analysis (app + test) | `flutter analyze --no-fatal-infos lib` | 0 errors, 0 warnings, 15 pre-existing **info**-level style issues | 0 |

Existing password login, phone-OTP login, session establishment, logout, and session replacement are covered by the 137-test suite and all pass. No production auth behavior was modified in S1.38.3.

## 5. Migration + HMAC Regression (§9)

| Item | Evidence | Result |
|---|---|---|
| Migration 0064 coverage | `migration-0064-email-identity.postgres.spec.ts` (32 tests) within fresh integration run | ✓ |
| Migration 0065 coverage | `migration-0065-hmac-hash.postgres.spec.ts` (13 tests) within fresh integration run | ✓ |
| Both-spec direct run | `pnpm exec vitest run` on the two files | 45/45, exit 0 |
| Historical SHA-256 rows stay v1 | 0065 spec forward-only assertions + `hashIdentifier` version prefix | ✓ |
| New records use HMAC v2 | `v2:<64-hex>` format asserted in password-login and linking specs | ✓ |
| Domain separation | `hashIdentifier` (email-normalization.ts): HMAC over `"${type}:${identifier}"` — `email:` vs `phone:` prefixes, no cross-type equality | ✓ (source-verified) |
| `OTP_HMAC_SECRET` fail-closed | `resolveOtpHmacSecret` (env-gate.ts): throws on missing/placeholder/<32-char secret in production-like envs; **no fallback** | ✓ (source-verified) |
| Audit rows carry no raw identifiers | `hashIdentifier(email/phone, secret, type)` at all audit call sites in identity.service.ts; OTP-redaction + account-linking specs assert masked/hashed only | ✓ |
| Existing audit data preserved | 0064/0065 specs assert pre-existing rows untouched (data-preservation cases) | ✓ |
| No staging/production migration run | Local Testcontainers/disposable DB only | ✓ compliant |

## 6. CI Configuration Verification (§10)

Source-level inspection of `.github/workflows/ci.yml` (475 lines) and package scripts. All required elements present:

| Requirement | CI Location | Status |
|---|---|---|
| Node 22 | `NODE_VERSION: '22'` | ✓ |
| Full API unit suite | `test-unit` job → `test:coverage` | ✓ |
| PostgreSQL integration | `test-integration` job, postgis service container | ✓ |
| Redis integration `REDIS_IT=1` | job env | ✓ |
| `REDIS_DISPOSABLE_ACK=1` | job env | ✓ |
| Redis suite assertion gate | `test:integration` script chain → `assert-redis-suite.mjs` | ✓ |
| Web tests + production build | `test-web-unit` + build jobs | ✓ |
| Contracts typecheck | `contracts` job | ✓ |
| Flutter tests + analysis | `mobile` job (Flutter 3.47.1) | ✓ |
| Migration gate | `migration-gate` job (ci-postgres + pg_partman) | ✓ |

**Reported separately from execution:** No push/PR was authorized, therefore **no GitHub Actions run was performed and none is claimed as passing**. Configuration-verified ≠ execution-verified.

## 7. Static / Build Gates

| Gate | Result | Exit |
|---|---|---|
| API typecheck (`tsc --noEmit`) | 0 issues (after F3 median type fix) | 0 |
| API build (SWC `nest build`) | 422 files compiled | 0 |
| Lint (`pnpm lint`, turbo) | 5 tasks successful, 0 errors | 0 |
| Contracts typecheck | 0 issues | 0 |

## 8. Aggregate Verification Table (Authoritative)

| # | Gate | Files | Tests | Pass | Fail | Skip | Exit | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | API integration (with real Redis) | 81 | 1584 | 1584 | 0 | 0 | **0** | ✓ PASS |
| 2 | Redis assertion gate | 5 suites | 33 | 33 | 0 | 0 | 0 | ✓ PASS |
| 3 | API unit | 118 | 2326 | 2326 | 0 | 0 | 0 | ✓ PASS |
| 4 | Web tests | 5 | 55 | 55 | 0 | 0 | 0 | ✓ PASS |
| 5 | Web Node-22 build | — | — | — | — | — | 0 | ✓ PASS |
| 6 | Flutter full suite | 9 | 137 | 137 | 0 | 0 | 0 | ✓ PASS |
| 7 | Dart analyze | — | — | 0 err | 0 warn | 15 info | 0 | ✓ PASS |
| 8 | Migration 0064+0065 | 2 | 45 | 45 | 0 | 0 | 0 | ✓ PASS |
| 9 | API typecheck / build / lint / contracts | — | — | — | 0 | — | 0 | ✓ PASS |

## 9. Retained Evidence

- `.m73b6-scratch/s1383-integration-final.log` — final integration run, ends `Redis integration gate: PASS`, `INTEGRATION_EXIT: 0`
- `.m73b6-scratch/s1383-full-integration.log` — first attempt (1583/1584, bcrypt F3 failure)
- `.m73b6-scratch/s1383-f1-isolated.log`, `s1383-f2-isolated.log` — timeout measurements
- `.m73b6-scratch/s1383-full-unit.log`, `s1383-web-test.log`, `s1383-flutter-full.log`
- `apps/api/.vitest-integration-results.json` — 81 files / 1584 passed
- `apps/api/.vitest-unit-results.json` — 118 files / 2326 passed
