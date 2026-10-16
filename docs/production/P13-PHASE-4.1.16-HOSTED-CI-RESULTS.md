# P13 PHASE 4.1.16 - HOSTED CI RESULTS

Date: 2026-10-16
Run: https://github.com/nabeel2323/scs-platform/actions/runs/38889251079
Run id 38889251079 - workflow CI - event push - branch develop - commit c01267cfd9be8cac72edb9333f7c7f036647fc1a - attempt 1 (no retry needed)
Overall conclusion: **success** (run wall time ~13m41s, 10:44:52Z -> 10:58:33Z)
Evidence source: unauthenticated GitHub REST (runs, run detail, jobs incl. step-level results); gh CLI not installed

## 1. Per-Job Results

| Job | Conclusion | Duration (UTC) | Notes |
|---|---|---|---|
| Lint & Typecheck | success | 10:44:53 -> 10:46:19 (86s) | incl. format:check advisory |
| Boundary Lint (E6) | success | 10:46:21 -> 10:46:44 (23s) | |
| Unit Tests + Coverage Gates | success | 10:46:21 -> 10:51:38 (5m17s) | coverage gates enforced |
| Integration Tests | success | 10:46:22 -> 10:51:26 (5m04s) | postgres+redis services |
| Migration Full Apply | success | 10:46:21 -> 10:47:19 (58s) | enforcing, all 63 files, pg_partman verified |
| Contract Spec & Codegen | success | 10:51:40 -> 10:52:10 (30s) | OpenAPI structural gate + TS client |
| Build | success | 10:51:40 -> 10:53:26 (1m46s) | |
| Mobile (flutter analyze / test) | success | 10:44:52 -> 10:45:49 (57s) | |
| Container Build & Smoke Test | **success** | 10:51:40 -> 10:58:33 (6m53s) | all steps green - see section 2 |
| k6 Smoke Test | skipped | - | by design (main branch only) |

No job failed; no retry was performed (none permitted - no evidence of an infrastructure flake,
and none was needed).

## 2. Container Build & Smoke Test - Step-Level Results Mapped to the Required Gates

| Required gate | Workflow step (number) | Step result |
|---|---|---|
| (setup, not a gate) | Run pnpm/action-setup@v4 (3) - NEW | success |
| (setup, not a gate) | Run actions/setup-node@v4 (4) - NEW | success |
| 1. API Docker image build | Set up Docker Buildx (5) + Build API image (6) | success |
| 2. Deployment-invariants spec (corrected pnpm command) | Run deployment invariants spec (7) | success |
| 3. Disposable services start | Start disposable services (8) | success |
| 4. API health and readiness | Start API container with safe defaults (9) + Verify health endpoints (10) | success |
| 5. Configuration proves safe defaults | Verify P13 configuration (11) | success |
| 6. Non-root execution | Verify non-root user (12) | success |
| 7. Cleanup | Cleanup (13) | success |

All post-steps (Post Build API image, Post Buildx, Post setup-node, Post pnpm/action-setup, Post
checkout, Complete job) also succeeded. This is the full seven-gate pass; the image build alone
was never treated as sufficient.

## 3. Interpretation

- The Phase 4.1.14 blocker (container-build exit 127 at the invariants step) is resolved on the
  hosted runner: the new toolchain setup steps executed first and the corrected
  `pnpm --filter @scs/api run test -- --run <spec>` command ran the 36-assertion spec to success.
- The job-level context note recorded for this run: the invariants spec executes against the
  checked-out source tree (where infra/deploy/.env.production.example exists), not inside the
  production image - consistent with the 4.1.7 baked-image limitation and not a contradiction.
- Every other previously-green job remained green; no regression was introduced by the change.

## 4. Not Run / Out of Scope

- k6-smoke skipped by workflow design (main only) - not a failure.
- Deployment, production webhook activation, worker enablement, pilot activation, and
  business-policy approvals were not performed and are not authorized by this green run.
