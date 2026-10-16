# P13 Phase 4.1.13 — Updated Release Candidate Manifest

**Phase:** 4.1.13 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

> **STATUS: PROPOSAL ONLY.** Nothing has been staged or committed during Phase 4.1.13. No `git add`, `git commit`, or `git push` was executed. This manifest supersedes `P13-PHASE-4.1.12-RELEASE-CANDIDATE-MANIFEST.md` and reconciles the intended file count after the Phase 4.1.13 changes. The commands below are the exact future sequence, to be run only after explicit user authorization.

---

## 1. What Changed Since the 4.1.12 Manifest

Phase 4.1.13 made exactly two kinds of change to the release candidate:

1. **One existing RC file modified in place**: `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` (untracked; already listed in Inclusion B, "New integration tests"). It now contains the AL-17 verifying-sink fix — sender configured through the real env path (URL + 45-char test secret set on `process.env` before constructing a dedicated `OpsAlertService`) plus a disposable `127.0.0.1` receiver verifying byte fidelity, both protocol headers, HMAC-SHA256 over the `${timestamp}.${rawBody}` canonical input, and the 300 s timestamp freshness — and three new fail-closed tests (AL-17a short-secret config gate, AL-17b corrupted-secret unsigned-suppression, AL-17c forged/tampered/stale rejections). Verified status: `??` (untracked).
2. **Six new phase reports** under `docs/production/` (the Phase 4.1.13 deliverables), automatically covered by the same documentation globs.

Everything else is untouched:

- `.github/workflows/ci.yml` — **zero new edits** in Phase 4.1.13 (still the 4.1.12 version; tracked-modified ` M`).
- Modified tracked files: the same 25 (no additions, no removals).
- Untracked source/infra: the same 27 files, re-enumerated file-by-file this phase (identical to 4.1.12 §3).
- No migration or database-related source changed.

## 2. Composition Summary (supersedes 4.1.12 §1)

| Bucket | Files | Disposition |
|--------|-------|-------------|
| Modified tracked files | 25 (unchanged) | INCLUDE |
| Untracked source / CI / deployment / migration | 27 (unchanged) | INCLUDE |
| Untracked phase reports (`docs/production/`) | 92 on disk now → **94** at staging time (adds this manifest + the final report) | INCLUDE (glob-staged) |
| Scratch / probes / snapshot artifacts | 1,272 (1,267 scratch incl. the eight `p4113-*.log` evidence files + 5 probes) | EXCLUDE — marked for review, NOT deleted |
| **Expected staged total at execution time** | **146** | 25 + 27 + 94 |

Fresh measurement at manifest time: `git ls-files --others --exclude-standard` → 1,391 untracked files = 1,267 scratch + 124 non-scratch (92 docs + 27 source/infra + 5 probes). `git status --porcelain` → 133 lines (25 tracked changes + 108 untracked lines; untracked lines include 4 whole-directory entries for the directory-verified groups, 10 source/infra entries, 5 probes, 1 scratch dir — file-level counts above are authoritative). After the final two reports land, expect **135** porcelain lines. Verified: none of the phase reports is gitignored (`git check-ignore` exits 1 for representative reports).

## 3. Inclusion A — Modified Tracked Files (25, unchanged)

Exactly the 25 files tabled in `P13-PHASE-4.1.12-RELEASE-CANDIDATE-MANIFEST.md` §2 (`.github/workflows/ci.yml`, `.gitignore`, `.nvmrc`, admin settlement-adjustments page, two migration runners, API core files, audit module pair, six returns-module files, four modified tests). None gained new edits in Phase 4.1.13.

## 4. Inclusion B — Untracked Source / CI / Deployment (27, unchanged set)

| Group | Files |
|-------|-------|
| Operations module (12) | `apps/api/src/modules/operations/` — operations.controller.ts, operations.module.ts, operations.schema.ts, ops-alert-signing.ts, ops-alert.service.ts, ops-control.service.ts, ops-counters.ts, p13-monitor.service.ts, p13-ops.config.ts, pilot-control.service.ts, raw-result.ts, worker-lease.service.ts |
| New integration tests (3) | `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts`, `p4-operational-readiness.postgres.spec.ts` (carries the AL-17 fix), `p415-webhook-delivery.postgres.spec.ts` |
| New unit tests (3, in 2 new directories) | `apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts`, `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts`, `apps/api/src/__tests__/unit/operations/p418-signing-exception.spec.ts` |
| Migration (1) | `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` |
| Deployment (6) | `infra/deploy/` — .env.production.example, README.md, admin.Dockerfile, api.Dockerfile, ci-postgres.Dockerfile, web.Dockerfile |
| Compose (1) | `infra/docker-compose.prod.yml` |
| Docker gate (1) | `.dockerignore` |

Directory-scoped adds below (`apps/api/src/modules/operations`, `apps/api/src/__tests__/unit/deployment`, `apps/api/src/__tests__/unit/operations`, `infra/deploy`) cover directories whose complete contents were re-verified this session — each contains exactly the files listed above. This is not `git add -A`; scope is directory-verified.

## 5. Inclusion C — Documentation (glob, 94 at execution time)

Same three disjoint globs as 4.1.12: `docs/production/P13-PHASE-4-*.md`, `P13-PHASE-4.1-*.md`, `P13-PHASE-4.1.*.md` (Phases 4 → 4.1.13). Count reconciliation: 88 at 4.1.12 + 6 Phase 4.1.13 reports = 94. The globs match nothing else; the repo already tracks 272 files under `docs/production/`, so committing phase reports follows the established convention.

## 6. Exclusion List (1,272) — Marked for Review, NOT Deleted

| Group | Count | Notes |
|-------|-------|-------|
| `.m73b6-scratch/` | 1,267 | Includes the full Phase 4.1.8 repository snapshot (contains `test-token.txt` — expired JWT, must never be committed), historical phase artifacts, and the eight `p4113-*.log` raw evidence files of this phase (AL-17 filtered run, op-readiness full suite, remaining five suites, P13 unit, typecheck, lint, build attempt 1, build attempt 2). Preserved untracked for reviewer inspection. |
| Root probes (2) | 2 | `.p41-net-probe.mjs`, `p41-p4suites.json` |
| `apps/api/` probes (3) | 3 | `.p41-counts.cjs`, `.p41-runbook-check.ps1`, `.p41-secretscan.cjs` |

No scratch file was deleted in Phase 4.1.13. The recommended future `.gitignore` housekeeping for this bucket remains deliberately out of this RC.

## 7. Secret Scan — Re-Run for the Phase Delta

The only RC content changed since the 4.1.12 scan is the operational-readiness spec. Rescanned (patterns: AWS keys, `sk-`/`ghp_` tokens, private-key blocks, `password=`, credentialed postgres/redis URLs, non-loopback URLs): **0 hits**. The one secret-like literal, `P4_TEST_SINK_SECRET = 'p4-integration-sink-secret-0123456789abcdef!!'`, is an explicitly labelled 45-char CI/test fixture bound to the in-process loopback receiver — not a credential, never logged, never placed in a payload, never referenced outside the spec. All other results from 4.1.12 §8 stand unchanged (no other RC bytes changed since that scan).

**CLEAN** — no accidental credentials, production URLs, or secrets in the proposed inclusion set.

## 8. Resolved and Remaining Ambiguities

1. **RESOLVED — AL-17 known-red (was 4.1.12 §9.2).** The Phase 4.1.13 in-process receiver gives the hosted integration job a full signed round trip with no workflow change and no external service: local six-suite total is 154 passed / 0 failed / 0 skipped, and a green `test-integration` lets `test-contract`, `build`, and `container-build` execute normally. Hosted confirmation remains pending (NOT RUN).
2. **Remaining — docs commit granularity.** Commit the 94 phase reports with the code (single RC commit, default proposal) or as a separate docs-only commit (run group L separately at staging time). Reviewer choice.
3. **Remaining — scratch housekeeping.** Future `.gitignore` addition for the 1,272-file exclusion bucket; not bundled into this RC.

## 9. Proposed Commit Message (updated)

Subject ≤ 72 chars; body as exact text below. Recommended delivery: write to `.m73b6-scratch/p4113-commit-msg.txt` and commit with `git commit -F`.

```
feat(p13): operational readiness, financial isolation, CI gates

Phase 4 operational readiness for P13 production hardening.

- Operations module (12 files): worker lease service with epoch
  fencing, HMAC-SHA256 signed ops alerts (fail-closed on short
  secrets), ops controls with audit trail, P13 monitor, pilot
  controls, ops counters
- Expiration worker: opt-in via P13_WORKER_ENABLED, lease fencing
  with per-item re-check, pause control, graceful lease release on
  SIGTERM; escalates REQUESTED->ESCALATED only
- Financial isolation: financialOrgScope() fail-closed tenant scoping
  across all 11 financial endpoints; audit-loss and reversal-failure
  counters
- Settlement adjustments: fx_status 'BLOCKED_FX' -> 'BLOCKED' (was an
  illegal value violating CHECK 0061), allow-listed posting, missing
  transaction awaits fixed; admin canPostFx() aligned
- Config: env-gate resolvers (fail-fast outside dev), production boot
  gate, Redis fail-fast, graceful shutdown hooks
- Migration 0063 (ops tables, feature_flags columns); migration
  runners hardened (ON_ERROR_STOP, transactional logging, CI applies
  all 63 with pg_partman)
- CI: enforcing migration gate, container-build job (safe defaults:
  worker disabled, pilot legacy; non-root check)
- Deployment: infra/deploy Dockerfiles + compose + placeholder-only
  env example; .dockerignore; .nvmrc 22; .gitignore .env.* hardening
- Tests: 3 new integration suites, 3 new unit suites (incl.
  deployment invariants), settlement spec strengthened; AL-17 proves
  the full signed ops-alert round trip against a disposable
  in-process loopback receiver (HMAC-SHA256 over the timestamp.body
  canonical input, timestamp freshness, byte fidelity) with
  fail-closed coverage: short secret nulled at config init,
  corrupted secret suppressed before send, forged/tampered/stale
  deliveries rejected 401
- Docs: P13 phase reports 4 through 4.1.13 in docs/production

Local verification: typecheck 9/9, lint 0 errors, P13 unit subset
289/289 (10 specs), integration 154/154 across the six P13 suites
(zero failures, zero skips), migrations 63/63 fresh + idempotent
(4.1.12 evidence; no DB source changed since), Turbo build 6/6.
Hosted CI run pending authorization.
```

## 10. Exact Staging Commands (Approved List Only — No `git add -A`)

Identical to the 4.1.12 sequence; group L's globs now pick up 94 reports.

```powershell
cd C:\TAIF\scs-platform

# A. Root config, CI, Docker gate
git add -- .gitignore .nvmrc .dockerignore .github/workflows/ci.yml

# B. Admin UI fix
git add -- apps/admin/src/app/settlement-adjustments/page.tsx

# C. Migration runners
git add -- apps/api/infra/drizzle/migrate.ts apps/api/infra/drizzle/migrate-pg.ts

# D. API core
git add -- apps/api/src/app.module.ts apps/api/src/main.ts apps/api/src/drizzle/schema.ts
git add -- apps/api/src/common/database/database.service.ts apps/api/src/common/redis/redis.service.ts apps/api/src/common/tenant-scope.ts
git add -- apps/api/src/config/env-gate.ts

# E. Audit module
git add -- apps/api/src/modules/audit/audit.schema.ts apps/api/src/modules/audit/audit.service.ts

# F. Returns module (6 modified)
git add -- apps/api/src/modules/returns/commission-reversal.service.ts apps/api/src/modules/returns/return-expiration.worker.ts apps/api/src/modules/returns/returns.controller.ts apps/api/src/modules/returns/returns.module.ts apps/api/src/modules/returns/returns.service.ts apps/api/src/modules/returns/settlement-adjustment.service.ts

# G. Operations module (directory verified: exactly 12 files)
git add -- apps/api/src/modules/operations

# H. Tests — modified (4)
git add -- apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts

# I. Tests — new (3 files + 2 verified directories)
git add -- apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts
git add -- apps/api/src/__tests__/unit/deployment apps/api/src/__tests__/unit/operations

# J. Migration 0063
git add -- infra/drizzle/migrations/0063_phase4_operational_readiness.sql

# K. Deployment (directory verified: exactly 6 files) + compose
git add -- infra/deploy infra/docker-compose.prod.yml

# L. Phase reports (94 at execution time)
git add -- "docs/production/P13-PHASE-4-*.md" "docs/production/P13-PHASE-4.1-*.md" "docs/production/P13-PHASE-4.1.*.md"
```

## 11. Reviewing the Staged Diff Before Committing

```powershell
# Exact staged list and count — expect 146
git diff --cached --name-only
(git diff --cached --name-only | Measure-Object -Line).Lines

# Guard: nothing from scratch/probes may be staged — expect NO output.
# NOTE (4.1.13): the bare 'p41-' term used in the 4.1.12 guard is FORBIDDEN
# here — it false-positives on p41-deployment-invariants.spec.ts, which IS
# part of Inclusion B. The refined pattern matches only the five real probes
# (.p41-* files and p41-p4suites.json) plus scratch and the token artifact.
git diff --cached --name-only | Select-String -Pattern 'm73b6-scratch|test-token|\.p41-|p41-p4suites'

# Unstaged remainder — expect only ?? scratch + probes
git status --short

# Stats and sanity
git diff --cached --stat
git diff --cached --check        # expect no output (no whitespace errors / conflict markers)

# Final full read of everything about to be committed
git diff --cached
```

If the staged count differs from **146**, STOP and reconcile against §3–§5 before committing.

## 12. Phase Boundary

Phase 4.1.13 performed zero staging, zero commits, zero pushes, zero deletions. Every command in §10–§11 is part of the future authorized sequence documented in the Phase 4.1.12 Hosted-CI Authorization Gate (see its Phase 4.1.13 addendum) and confirmed by `P13-PHASE-4.1.13-FINAL-REPORT.md`.
