# P13 Phase 4.1.2 — Baseline and Verification Plan

**Stage A** · Status: **COMPLETE**  
Date: 2026-10-15  
Branch: `develop`  
HEAD: `ed6c30f2bfcd21db883f2e5ec4a7a0cda65cd75c`

---

## 1. Current State

### 1.1 Repository State

- **Branch:** `develop`
- **HEAD:** `ed6c30f` (commit: "test(migrations): verify existence of migration 0062")
- **Working tree:** Modified (uncommitted Phase 4 and Phase 4.1 changes)
- **Build status:** In progress (PID 26924, 82% complete after ~141 minutes)

### 1.2 Modified Files (Phase 4 + 4.1)

**Modified (22 files):**
- `.gitignore`
- `apps/admin/src/app/settlement-adjustments/page.tsx`
- `apps/api/infra/drizzle/migrate.ts`
- `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts`
- `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts`
- `apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts`
- `apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/common/database/database.service.ts`
- `apps/api/src/common/redis/redis.service.ts`
- `apps/api/src/common/tenant-scope.ts`
- `apps/api/src/config/env-gate.ts` (Phase 4.1: F-4 fix)
- `apps/api/src/drizzle/schema.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/audit/audit.schema.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/returns/commission-reversal.service.ts`
- `apps/api/src/modules/returns/return-expiration.worker.ts`
- `apps/api/src/modules/returns/returns.controller.ts`
- `apps/api/src/modules/returns/returns.module.ts`
- `apps/api/src/modules/returns/returns.service.ts`
- `apps/api/src/modules/returns/settlement-adjustment.service.ts`

**Untracked (Phase 4.1 artifacts):**
- `.dockerignore`
- `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts`
- `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts`
- `apps/api/src/__tests__/unit/deployment/` (invariants spec)
- `apps/api/src/modules/operations/` (ops-alert service, etc.)
- `docs/production/P13-PHASE-4*.md` (8 Phase 4 reports)
- `docs/production/P13-PHASE-4.1*.md` (8 Phase 4.1 reports)
- `infra/deploy/` (3 Dockerfiles, README, env template)
- `infra/docker-compose.prod.yml`
- `infra/drizzle/migrations/0063_phase4_operational_readiness.sql`

### 1.3 Build Status

**API image build (PID 26924):**
- Started: 2026-10-14 ~21:40 UTC
- Current progress: 996/1208 packages (82%)
- Elapsed: ~141 minutes
- Cache reuse: 17/1208 (minimal, BuildKit cache mount not persisting)
- Network: Hitting ECONNRESET on registry.npmjs.org, retry tuning applied
- Estimated completion: ~30-45 minutes remaining

**No scs-api image exists yet** (build not complete).

### 1.4 Phase 4.1 Reports (Already Delivered)

All eight Phase 4.1 reports exist under `docs/production/`:

1. `P13-PHASE-4.1-BASELINE-AND-DIFF-AUDIT.md` — Stage A, **PASS**
2. `P13-PHASE-4.1-DEPLOYMENT-ARCHITECTURE.md` — Stage B, **PASS**
3. `P13-PHASE-4.1-CONTAINER-AND-DEPLOYMENT-REPORT.md` — Stage C, **PASS WITH DOCUMENTED LIMITATIONS**
4. `P13-PHASE-4.1-CI-AND-MIGRATION-GATES-REPORT.md` — Stage D, **PASS WITH DOCUMENTED LIMITATIONS**
5. `P13-PHASE-4.1-MULTI-INSTANCE-VERIFICATION.md` — Stage E, **BLOCKED**
6. `P13-PHASE-4.1-ALERT-DELIVERY-READINESS.md` — Stage F, **PASS WITH DOCUMENTED LIMITATIONS**
7. `P13-PHASE-4.1-RECOVERY-AND-ROLLBACK-REPORT.md` — Stage G, **BLOCKED**
8. `P13-PHASE-4.1-FINAL-READINESS-REPORT.md` — Final, **PASS WITH DOCUMENTED LIMITATIONS**

**Phase 4.1 verdict:** PASS WITH DOCUMENTED LIMITATIONS

**Limitations:**
1. Runtime verification pending (API image build in progress)
2. Container-build CI job designed, not committed (encoding issues)
3. Real webhook delivery not tested (requires operator configuration)

---

## 2. Phase 4.1.2 Mission

Close the Phase 4.1 verification gaps:

1. **Complete container build and smoke verification** (Stage B)
2. **Implement and verify the container-build CI gate** (Stage C)
3. **Multi-process/container worker exclusivity** (Stage D)
4. **Recovery and rollback rehearsal** (Stage E)
5. **Alert-delivery integration readiness** (Stage F)
6. **Regression and safety review** (Stage G)

---

## 3. Verification Plan

### 3.1 Stage B — Container Build and Smoke Verification

**Prerequisite:** Wait for API image build to complete (estimated ~30-45 minutes).

**Steps:**
1. Verify API image build completes successfully
2. Build web and admin images (fast, pnpm install layer cached)
3. Start API container with safe defaults
4. Verify `/v1/healthz` and `/v1/readyz` respond
5. Verify `P13_WORKER_ENABLED=false` and `P13_PILOT_MODE=legacy`
6. Verify graceful shutdown (SIGTERM → lease release)
7. Verify non-root user (`node`)
8. Verify no secrets baked into layers

**Deliver:** `P13-PHASE-4.1.2-CONTAINER-SMOKE-REPORT.md`

### 3.2 Stage C — Container-Build CI Gate

**Steps:**
1. Add `container-build` job to `.github/workflows/ci.yml` using encoding-safe method
2. Job must:
   - Run deployment invariants spec
   - Build API image
   - Start container with safe defaults
   - Verify health and P13 posture
   - Fail on required checks (not advisory)
3. Validate YAML syntax
4. Document the job (cannot run actual CI without push)

**Migration gate enhancement:**
- Current: dry-run enforcing, apply best-effort (pg_partman)
- Goal: complete migration chain test on Linux CI
- Approach: use `postgis/postgis:16-3.4` service container, skip 0013/0018 (pg_partman), verify all others apply
- If full chain cannot be tested, document blocker explicitly

**Deliver:** `P13-PHASE-4.1.2-CI-RELEASE-GATES-REPORT.md`

### 3.3 Stage D — Multi-Process Worker Exclusivity

**Prerequisite:** API image built and verified.

**Steps:**
1. Launch disposable PostgreSQL database
2. Start 2 API replicas with `P13_WORKER_ENABLED=false`
3. Start 1 worker container with `P13_WORKER_ENABLED=true`
4. Execute 10 scenarios:
   - All disabled: no work
   - One enabled: one lease holder
   - Two competing: no duplicate work
   - Graceful shutdown: takeover
   - Hard termination: fencing advances
   - Stale worker: writes rejected
   - DB unavailable: fail closed
   - Pause: no new work
   - Resume: no duplicates
   - Monitoring: detects missing ownership
5. Capture lease epochs, holder IDs, timestamps, DB assertions, logs

**Deliver:** `P13-PHASE-4.1.2-MULTI-INSTANCE-REPORT.md`

### 3.4 Stage E — Recovery and Rollback Rehearsal

**Prerequisite:** API image built and verified.

**Steps:**
1. Apply complete migration chain to clean DB
2. Re-run migration runner (verify idempotency)
3. Start stack with safe defaults
4. Verify health endpoints and ops status
5. Exercise pause/resume (capture audit evidence)
6. Terminate worker, verify takeover and fencing
7. Simulate failed deployment, revert to previous image
8. Verify additive migrations remain forward-only
9. Verify unrelated API functionality
10. Capture DB state, app health, worker state before/after

**Deliver:** `P13-PHASE-4.1.2-RECOVERY-AND-ROLLBACK-REPORT.md`

### 3.5 Stage F — Alert-Delivery Integration Readiness

**Steps:**
1. Verify existing synthetic alert tests (AL-17 through AL-21)
2. Test webhook delivery to disposable HTTP sink
3. Verify success, non-2xx, timeouts, retries, dedup, resolution
4. Verify no credentials/URLs in logs
5. Verify no financial amounts in payloads
6. Verify recursion guard
7. Verify delivery failures visible
8. Verify active channel reported accurately
9. Document operator configuration for real monitoring

**Deliver:** `P13-PHASE-4.1.2-ALERT-INTEGRATION-REPORT.md`

### 3.6 Stage G — Regression and Safety Review

**Steps:**
1. Run deployment invariants (36 tests)
2. Run P13 operational-readiness and HTTP authorization suites
3. Run returns, refund, commission, settlement, dispute, concurrency tests
4. Run tenant-isolation and authorization tests
5. Run typechecks and builds (API, web, admin)
6. Run migration chain verification
7. Run container smoke tests
8. Review diff for:
   - Accidental financial rule changes
   - Unsafe worker/pilot defaults
   - Weakened authorization/tenant isolation
   - Secrets in files/images
   - Destructive migration behavior
   - New suppressed CI failures
   - Unrelated changes

**Deliver:** Results included in final report

---

## 4. Deliverables

Seven reports required:

1. ✅ `P13-PHASE-4.1.2-BASELINE-AND-VERIFICATION-PLAN.md` (this report)
2. `P13-PHASE-4.1.2-CONTAINER-SMOKE-REPORT.md`
3. `P13-PHASE-4.1.2-CI-RELEASE-GATES-REPORT.md`
4. `P13-PHASE-4.1.2-MULTI-INSTANCE-REPORT.md`
5. `P13-PHASE-4.1.2-RECOVERY-AND-ROLLBACK-REPORT.md`
6. `P13-PHASE-4.1.2-ALERT-INTEGRATION-REPORT.md`
7. `P13-PHASE-4.1.2-FINAL-READINESS-REPORT.md`

---

## 5. Safety Boundaries (Preserved)

All Phase 4.1.2 work respects the mandate §2:

- No deployment to production or changes to production infrastructure
- No activation of P13 pilot or addition of production allowlist entries
- `P13_WORKER_ENABLED` remains disabled in every default configuration
- No modification of production financial records
- No invention of FX providers, rates, or financial business rules
- Financial invariants, tenant isolation, authorization, idempotency, approval requirements, and audit trails are preserved
- `pnpm-lock.yaml` and package manifests are not modified
- No deletion, regeneration, or silent stashing of existing changes
- No commits or pushes unless explicitly authorized
- No start of the 30-day production observation period
- All operational verification uses disposable databases and test data
- Never expose credentials, webhook URLs, JWTs, or financial data in reports or logs

---

## 6. Next Steps

1. **Wait for API image build to complete** (estimated ~30-45 minutes from 2026-10-15 00:15 UTC)
2. **Proceed to Stage B** (container smoke verification)
3. **Proceed to Stage C** (CI gate implementation)
4. **Proceed to Stages D-E** (multi-instance and recovery rehearsal)
5. **Proceed to Stage F** (alert integration)
6. **Proceed to Stage G** (regression and safety review)
7. **Deliver final report**

---

**Report prepared:** 2026-10-15 00:15 UTC  
**Branch:** `develop`  
**HEAD:** `ed6c30f`  
**Working tree:** modified (uncommitted Phase 4 + 4.1 changes)  
**Build status:** in progress (82% complete, ~30-45 min remaining)
