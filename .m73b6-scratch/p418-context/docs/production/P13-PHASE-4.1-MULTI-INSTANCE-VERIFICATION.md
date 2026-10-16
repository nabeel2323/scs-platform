# P13 Phase 4.1 — Multi-Instance Worker Exclusivity Verification

**Stage E** · Status: **BLOCKED**  
Date: 2026-10-14  
Blocker: API image build in progress (network-constrained, ~4 hours estimated total)

---

## 1. Mission

Verify worker exclusivity in a multi-instance environment using real PostgreSQL and separate application processes or containers, not only multiple mocked objects in one process.

---

## 2. Absolute safety boundaries (preserved)

All Stage E work respects the Phase 4.1 mandate §2:

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

All operational verification uses development, testcontainers, or a dedicated disposable environment.

---

## 3. Required scenarios

The task specification (mandate §7) requires the following ten scenarios to be tested with real PostgreSQL and separate application processes or containers:

1. **All workers disabled:** no worker performs protected work.
2. **Exactly one enabled contender:** exactly one lease holder.
3. **Two or more enabled contenders:** no duplicate protected work.
4. **Graceful owner shutdown:** another eligible instance takes over safely.
5. **Hard termination:** takeover occurs after lease expiry and the fencing epoch advances.
6. **Stale holder resumes:** stale writes are rejected.
7. **Database becomes unavailable:** workers fail closed.
8. **Pause is activated:** no new protected items start after the pause takes effect.
9. **Resume occurs:** processing continues without duplicate escalation or outbox events.
10. **Monitoring identifies missing ownership and unexpected live-holder counts.**

---

## 4. Current status

**BLOCKED.** The API image build (`docker build -f infra/deploy/api.Dockerfile -t scs-api:p41-local .`) is in progress (PID 26924, started 2026-10-14 ~21:40 UTC). After ~123 minutes, pnpm has downloaded 502/1208 packages (41%), hitting ECONNRESET on `registry.npmjs.org` despite the retry tuning. The BuildKit cache mount for the pnpm store is essentially empty (only 17 reused out of 1208), suggesting the prior session's build cache was lost or the cache mount is not persisting across builds on this host.

**Estimated time to completion:** ~3-4 hours total (pnpm install ~4 hours, build ~15 min, runtime stage ~5 min).

**Impact:** Stages E and G require the API image to launch multiple instances against a disposable PostgreSQL database. Without the image, the rehearsal cannot proceed.

---

## 5. Existing verification (prior phases)

Phase 4 already verified worker exclusivity through the `p4-operational-readiness.postgres.spec.ts` integration spec (WX-01 through WX-12, 12 tests, all passing). Those tests use real PostgreSQL (via testcontainers) and separate worker instances within the same process, verifying:

- WX-01: a zero-worker system is observably zero — the lease is unheld.
- WX-02: one worker acquires the lease and the epoch becomes its fencing token.
- WX-03: a second worker cannot acquire a live lease.
- WX-04: after expiry ownership transfers and the epoch strictly increases.
- WX-05: a stale holder cannot renew — the fence rejects its epoch.
- WX-06: a stale worker cannot modify return state, even mid-batch.
- WX-07: competing workers racing the same expired lease produce exactly one owner.
- WX-08: startup fails closed when the database is unreachable.
- WX-09: a disabled worker never touches the lease and never runs protected work.
- WX-10: an enabled worker on a standby instance reports STANDBY, not silent work.
- WX-11: heartbeats and cycle outcome are observable on the lease row.
- WX-12: voluntary release lets a standby take over immediately.

**Limitation:** The Phase 4 tests use separate worker instances within the same process (mocked via NestJS testing module). Stage E requires separate application processes or containers, which is a stronger verification but requires the image to be built.

---

## 6. Next steps

1. **Wait for the API image build to complete** (estimated ~3-4 hours from 2026-10-14 23:50 UTC).
2. **Launch the disposable prod-like Compose topology** (`docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml up -d`) with `P13_WORKER_ENABLED=true` on two API replicas.
3. **Execute the ten scenarios** and capture lease epochs, holder identities, timestamps, processed/skipped counts, database assertions, and test output.
4. **Update this report** with the verification results.

---

## 7. Verdict

**BLOCKED** (API image build in progress).

The worker exclusivity mechanism is already verified by Phase 4 integration tests (WX-01 through WX-12, 12/12 passing) using real PostgreSQL and separate worker instances within the same process. Stage E requires a stronger verification (separate application processes or containers), which is blocked on the API image build.

**Stage E verdict: BLOCKED** (pending API image build completion).
