# P13 Phase 4.1 — Recovery and Rollback Report

**Stage G** · Status: **BLOCKED**  
Date: 2026-10-14  
Blocker: API image build in progress (network-constrained, ~4 hours estimated total)

---

## 1. Mission

Rehearse deployment, pause, recovery, and rollback against a disposable production-like environment.

---

## 2. Absolute safety boundaries (preserved)

All Stage G work respects the Phase 4.1 mandate §2:

- No deployment to production or changes to production infrastructure.
- No activation of the P13 pilot or addition of production allowlist entries.
- `P13_WORKER_ENABLED` remains disabled in every default configuration.
- No modification of production financial records.
- No invention of FX providers, rates, or financial business rules.
- Financial invariants, tenant isolation, authorization, idempotency, approval requirements, and audit trails are preserved.
- `pnpm-lock.yaml` and package manifests are not modified.
- No deletion, regeneration, or silent stashing of existing Phase 4 changes.
- No commits or pushes unless explicitly authorized.
- No start of the 30-day production observation period.

All rollback rehearsals use disposable data. No production data is affected.

---

## 3. Required scenarios

The task specification (mandate §9) requires the following scenarios to be rehearsed against a disposable production-like environment:

1. **Apply the migration chain from a clean database.** Verify the migration runner handles repeat execution according to its actual contract.
2. **Start the application with safe defaults and confirm that the P13 worker and pilot are inactive.**
3. **Verify `/healthz`, `/readyz`, and the authenticated P13 operations status endpoint.**
4. **Exercise pause and resume using authorized requests.** Confirm both actions produce the expected durable audit evidence.
5. **Terminate and restart the worker owner.** Verify takeover, fencing, and absence of duplicate processing.
6. **Simulate a failed deployment or incompatible application startup.** Demonstrate the documented recovery procedure without deleting financial records or undoing additive migrations.
7. **Verify that unrelated API functionality continues to work.**
8. **Capture database migration state and application health before and after each scenario.**

---

## 4. Current status

**BLOCKED.** The API image build (`docker build -f infra/deploy/api.Dockerfile -t scs-api:p41-local .`) is in progress (PID 26924, started 2026-10-14 ~21:40 UTC). After ~123 minutes, pnpm has downloaded 502/1208 packages (41%), hitting ECONNRESET on `registry.npmjs.org` despite the retry tuning. The BuildKit cache mount for the pnpm store is essentially empty (only 17 reused out of 1208), suggesting the prior session's build cache was lost or the cache mount is not persisting across builds on this host.

**Estimated time to completion:** ~3-4 hours total (pnpm install ~4 hours, build ~15 min, runtime stage ~5 min).

**Impact:** Stage G requires the API image to launch the disposable prod-like Compose topology and exercise the migration, pause/resume, and recovery procedures. Without the image, the rehearsal cannot proceed.

---

## 5. Existing verification (prior phases)

Phase 4 already verified pause/resume and recovery through the `p4-operational-readiness.postgres.spec.ts` integration spec and the `P13-PHASE-4-KILL-SWITCH-AND-RECOVERY-REPORT.md`. The kill-switch report documents:

- **Pause/resume mechanism:** The `ops_controls` table carries a `p13.worker.paused` row that the worker checks before each poll cycle. Setting the row pauses the worker; deleting it resumes. The pause is durable (survives restarts) and produces an audit trail in the `audit_logs` table.
- **Recovery procedure:** If the worker owner terminates unexpectedly, the lease expires after `P13_WORKER_LEASE_TTL_SECONDS` (default 90s), and a standby can acquire it. The fencing epoch strictly increases, so stale writes are rejected.
- **Rollback procedure:** Rollback is image-only. Schema state travels forward: migrations are additive and forward-only. The `migrate` service re-runs and is a no-op because `migrate-pg.ts` skips every file already present in `_migration_log`.

**Limitation:** The Phase 4 verification used the dev-only Compose stack (applications running on the host with pnpm). Stage G requires the production-like Compose topology (applications running as containers), which requires the image to be built.

---

## 6. Next steps

1. **Wait for the API image build to complete** (estimated ~3-4 hours from 2026-10-14 23:50 UTC).
2. **Launch the disposable prod-like Compose topology** (`docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml up -d`) with safe defaults.
3. **Execute the eight scenarios** and capture database migration state, application health, pause/resume audit evidence, and recovery outcomes.
4. **Update this report** with the verification results.

---

## 7. Verdict

**BLOCKED** (API image build in progress).

The pause/resume and recovery mechanisms are already verified by Phase 4 integration tests and the kill-switch report. Stage G requires a stronger verification (production-like Compose topology with containers), which is blocked on the API image build.

**Stage G verdict: BLOCKED** (pending API image build completion).
