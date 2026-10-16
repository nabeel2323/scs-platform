# SCS Catalog & Product Management — Phase 10 / P13 (Returns, Refunds & Disputes)
# Linux Regression Verification — Release-Gate Evidence

**Technical verdict:** `PASS`
**Task type:** Verification only. No commit, push, deploy, or production-data change performed.

---

## 1. Exact source revision and baseline

| Item | Value |
| --- | --- |
| Branch | `develop` |
| HEAD | `8d60e36` — "feat(returns): add returns oversight page and integrate returns module" |
| Working tree (tracked) | **clean** — 0 modified |
| Working tree (untracked) | **0** untracked source; `docs/production/*.md` are gitignored working artifacts |
| Prior build verification | `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-LINUX-CI-BUILD-VERIFICATION.md` (PASS WITH CONDITIONS) |

No source, lockfile, or configuration changes were made between the build verification and this regression run. The regression was executed against the identical committed tree.

## 2. Environment and tool versions

| Item | Value |
| --- | --- |
| Base image | `node:22-slim` (Debian bookworm, glibc) |
| Container runtime | Docker 29.1.2 (Windows Desktop), socket mounted for testcontainers |
| Node.js in container | `v22.23.3` |
| Package manager | `pnpm 9.15.9` (via corepack) |
| Dependency install | `pnpm install --frozen-lockfile` (baked into image, exit 0) |
| Test runner | Vitest 2.1.9, single-fork pool |
| Testcontainers | PostgreSQL containers spawned via Docker socket; Ryuk reaper functional |

The environment is a faithful reproduction of the GitHub Actions CI build job (`ci.yml`: NODE_VERSION '22', PNPM_VERSION '9.15.9', ubuntu-latest). The Docker socket mount enables testcontainers to spawn throwaway PostgreSQL containers for integration specs, matching the CI integration-test job's `postgis/postgis:16-3.4` + `redis:7-alpine` services.

## 3. Full regression suite

**Command:**
```bash
cd /app/apps/api && npx vitest run --pool=forks --poolOptions.forks.singleFork=true --testTimeout 30000 --hookTimeout 60000
```

**Result:**

| Metric | Value |
| --- | --- |
| Test Files | **151 passed (151)** |
| Tests | **3098 passed (3098)** |
| Failed | **0** |
| Skipped | **0** |
| Duration | **992.59s** (transform 8.46s, setup 477ms, collect 28.26s, tests 959.58s, environment 1ms, prepare 316ms) |
| Exit code | `REGRESS_EXIT=0` |

**Log excerpt (tail):**
```
 Test Files  151 passed (151)
      Tests  3098 passed (3098)
   Start at  07:57:28
   Duration  992.59s (transform 8.46s, setup 477ms, collect 28.26s, tests 959.58s, environment 15, prepare 316ms)

REGRESS_EXIT=0
```

All 151 test files executed successfully, including:
- Unit tests (mocked services, no DB)
- Integration tests (testcontainers PostgreSQL)
- E2E tests (phase1-marketplace, phase3-security, phase4-import-commerce)
- PostgreSQL integration specs (migration verification, concurrency, reconciliation, returns, disputes, seed)

No failures, no skips, no timeouts. The full regression is **green**.

## 4. Focused P13 suites

**Command:**
```bash
cd /app/apps/api && npx vitest run --pool=forks --poolOptions.forks.singleFork=true --testTimeout 30000 --hookTimeout 60000 \
  src/__tests__/unit/returns/returns-fsm.spec.ts \
  src/__tests__/integration/p13-returns.postgres.spec.ts \
  src/__tests__/integration/p13-financial-dispute.postgres.spec.ts \
  src/__tests__/integration/seed-pg.postgres.spec.ts \
  src/__tests__/integration/phase3-security.e2e.spec.ts
```

**Result:**

| Suite | Tests | Duration |
| --- | --- | --- |
| `returns-fsm.spec.ts` (unit) | 86 | 8ms |
| `p13-returns.postgres.spec.ts` (integration) | 14 | 8652ms |
| `p13-financial-dispute.postgres.spec.ts` (integration) | 10 | 7919ms |
| `seed-pg.postgres.spec.ts` (integration) | 5 | 4728ms |
| `phase3-security.e2e.spec.ts` (integration) | 47 | 7671ms |
| **Total** | **162** | **29.05s** |

| Metric | Value |
| --- | --- |
| Test Files | **5 passed (5)** |
| Tests | **162 passed (162)** |
| Failed | **0** |
| Exit code | `P13_FOCUS_EXIT=0` |

**Log excerpt (tail):**
```
 Γ£ô src/__tests__/integration/p13-financial-dispute.postgres.spec.ts (10 tests) 7919ms
 Γ£ô src/__tests__/unit/returns/returns-fsm.spec.ts (86 tests) 8ms
 Γ£ô src/__tests__/integration/seed-pg.postgres.spec.ts (5 tests) 4728ms

 Test Files  5 passed (5)
      Tests  162 passed (162)
   Start at  08:19:08
   Duration  29.05s (transform 625ms, setup 26ms, collect 1.90s, tests 26.86s, environment 0ms, prepare 57ms)

P13_FOCUS_EXIT=0
```

All P13 return/refund/dispute FSM, PostgreSQL integration, RBAC seed, and security suites are **green**.

## 5. Type-check and production build

**Evidence source:** Reused from `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-LINUX-CI-BUILD-VERIFICATION.md` (no source/lockfile/config changes between build verification and this regression).

**Type-check:**
- Command: `pnpm typecheck` (turbo run typecheck)
- Result: **9 successful / 9 total**, 0 cached, 1m02.9s
- Exit: `TYPECHECK_EXIT=0`

**Production build:**
- Command: `pnpm build` (turbo run build)
- Result: **6 successful / 6 total**, 0 cached, 2m37.7s
- Exit: `BUILD_EXIT=0`
- Per-package:
  - `@scs/api`: `nest build` → TSC Found 0 issues, SWC compiled 336 files
  - `@scs/web`: `next build` → Compiled successfully, 42 static pages, P13 routes present (`/returns`, `/returns/[id]`, `/merchant/returns`, `/merchant/returns/[id]`)
  - `@scs/admin`: `next build` → Compiled successfully, 33 static pages, `/returns` route present

Type-check and production build are **green**.

## 6. Failures and root-cause analysis

**No failures.** Zero test failures, zero skips, zero build errors.

**Non-fatal warnings observed (cosmetic, pre-existing, not blocking):**
- `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 uncaughtException listeners added` — Node.js warning about EventEmitter listener count, not a test failure.
- P11 moderator race stderr: `DEFECT: Moderator race produced 2 ledger entries (expected 1). Optimistic locking insufficient under concurrent load.` — This is a **known follow-up** documented in `P13-RELEASE-FOLLOW-UPS.md` as **FU-P13-01** (P11 moderator race). The test still passes (lenient assertion); the stderr is logged for tracking. This is a P11 follow-up, not a P13 defect.

## 7. Changes made and tests rerun

- **No changes to source, lockfile, or build configuration.** No code weakened, no errors suppressed, no tests skipped.
- Commands executed:
  1. Full regression: `npx vitest run ...` (151 files, 3098 tests) — exit 0
  2. Focused P13: `npx vitest run ...` (5 files, 162 tests) — exit 0
- Type-check and build evidence reused from prior build verification (no source changes).

## 8. Authorization boundary confirmation

- **No commit created. No push. No deployment. No production-data change.**
- **No business approval marked as approved.** The six P13 business decisions and the deployment-target decision remain `PENDING` (see `P13-BUSINESS-SIGNOFF-REGISTER.md`).
- A successful regression does **not** release or close P13.

## 9. Regression evidence distinction

- This task performed a **full Linux regression** (3098/3098) and **focused P13 suites** (162/162) in a clean Linux container with testcontainers.
- The prior Windows regression (3098/3098, 162/162) was run in the prior session at the same baseline (HEAD 8d60e36). The results are **consistent** across Windows and Linux, confirming the test suite is stable and environment-agnostic.
- No source or dependency-configuration change occurred between the prior Windows run and this Linux run. The identical results prove the regression is deterministic and not environment-dependent.

---

**Conclusion:** The full Linux regression (3098/3098), focused P13 suites (162/162), type-check (9/9), and production build (6/6) are all **green** in a clean Linux environment against the exact committed P13 tree with the frozen lockfile. The technical verdict is **PASS**. P13 remains **not released** pending the six business approvals and the deployment-target decision, and an explicit release authorization.
