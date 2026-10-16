# P13 Phase 4.1.14 — Hosted CI Results

**Phase:** 4.1.14 | **Date:** 2026-10-16 | **Commit:** `13f2634` (`13f26340a1ea6ee40a310a239c2cb42d248c258a`)

- **Workflow run:** CI run #386 — https://github.com/nabeel2323/scs-platform/actions/runs/38881220631
- **Trigger:** `push` to `develop` @ `13f2634` (the authorized release-candidate commit), `ubuntu-latest`
- **Run conclusion:** **failure** — 8 of 9 applicable jobs succeeded; `k6-smoke` skipped by design (main-only); **`container-build` failed**

---

## 1. Per-Job Outcomes (actual, from the GitHub API — not inferred from local tests)

| Job | Outcome | Duration (UTC start → end) |
|-----|---------|----------------------------|
| Lint & Typecheck | **SUCCESS** | 09:33:05 → 09:34:22 (77 s) |
| Boundary Lint (E6) | **SUCCESS** | 09:34:24 → 09:34:45 (21 s) |
| Unit Tests + Coverage Gates | **SUCCESS** | 09:34:24 → 09:40:15 (5 m 51 s) |
| Integration Tests | **SUCCESS** | 09:34:24 → 09:41:02 (6 m 38 s) |
| Migration Full Apply | **SUCCESS** | 09:34:24 → 09:35:09 (45 s) |
| Contract Spec & Codegen | **SUCCESS** | 09:41:04 → 09:41:33 (29 s) |
| Build | **SUCCESS** | 09:41:03 → 09:42:53 (1 m 50 s) |
| Container Build & Smoke Test | **FAILURE** | 09:41:04 → 09:45:53 (4 m 49 s) |
| Mobile (flutter analyze · test) | **SUCCESS** | 09:33:06 → 09:34:07 (61 s) |
| k6 Smoke Test | SKIPPED (main-branch only, by design) | — |

What the green jobs arbitrated on the hosted Linux runner — all previously local-only claims:

- **Integration Tests GREEN** — AL-17 and the full P13 integration set passed hosted, including the Phase 4.1.13 disposable in-process signed round trip (no workflow webhook URL exists; the fix worked exactly as designed).
- **Build GREEN** — the authoritative Linux full Turbo build; conclusively arbitrates the documented Windows pnpm virtual-store defect as host-environmental.
- **Migration Full Apply GREEN** — the enforcing gate (pg_partman CI image) applied the full 63-migration chain.
- **Contract / Unit+coverage / Boundary lint / Mobile GREEN.**
- **Contract, Build previously expected to be SKIPPED** (4.1.12 known-red) — they **executed and passed**, confirming the Phase 4.1.13 job-dependency resolution.

## 2. The `container-build` Failure — Facts

Step sequence (from the run's public annotation + the committed workflow source):

| Step | Outcome |
|------|---------|
| Set up job / checkout / Set up Docker Buildx | success |
| **Build API image** (`docker/build-push-action@v5`, `infra/deploy/api.Dockerfile`, tag `scs-api:ci-test`) | **success** |
| **Run deployment invariants spec** | **FAILURE — "Process completed with exit code 127"** |
| Start disposable services → Verify non-root user (5 steps) | skipped (dependent on the failed step) |
| Cleanup / post-steps | success |

Evidence access limitation: full job logs require authenticated access (REST logs endpoint returns 403 unauthenticated; the web log view requires sign-in). The exit code comes from the run's public annotation; the exact shell stderr line was therefore not captured. The failing command block (committed `ci.yml` L342–345) is:

```yaml
- name: Run deployment invariants spec
  run: |
    pnpm install --frozen-lockfile
    pnpm --filter @scs/api test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
```

## 3. Root Cause and Classification (spec §5.2)

**Classification: workflow configuration defect (latent) — not a source regression, not an infrastructure flake.**

- The `container-build` job is the **only pnpm-consuming job in `ci.yml` without `pnpm/action-setup`** (+ `actions/setup-node` with `cache: pnpm`). Every other job carries the pair (verified: L33/36, 62/65, 86/89, 134/137, 156/159, …); `container-build` steps are checkout → buildx → docker build → the failing step, with no toolchain setup.
- `ubuntu-latest` does not put `pnpm` on PATH → `pnpm install --frozen-lockfile` fails as **command not found (127)** within seconds — consistent with the observed fast failure (job total 4 m 49 s, almost entirely the successful Docker build) versus a multi-minute dependency install.
- Why it surfaced now: this was the **first hosted execution ever** of `container-build` (introduced in this RC; hosted CI had never run before Phase 4.1.14). Local verification cannot execute hosted-only steps.
- Not a source regression: the API image **built successfully**, and `p41-deployment-invariants.spec.ts` passes locally (36/36 inside the 289/289 P13 unit subset) on the exact committed bytes.
- Not an infra flake: command-not-found is deterministic.

## 4. Retry Decision (spec §5.3)

**No retry performed.** The spec permits at most one retry and only for a suspected infrastructure flake; a deterministic `127` is not a flake. (No re-run was triggered by this phase.)

## 5. Stop Per Spec §5.4

Execution stopped at verification: **no workflow or source change was made in this phase** in response to the failure. The required fix — add `pnpm/action-setup@v4` + `actions/setup-node@v4` (with `cache: pnpm`, mirroring the other jobs) to `container-build` before the invariants step — is a workflow-only change and a **new authorized work item** requiring a new commit + push authorization to re-arbitrate the container gate.

## 6. Unverified Within the Failed Job (recorded honestly)

The container smoke assertions did **not** execute hosted: health-endpoint liveness/readiness, P13 configuration echo (`P13_WORKER_ENABLED=false`, `P13_PILOT_MODE=legacy`), and the non-root check are **NOT RUN** for this commit. The safe defaults remain verified at the source/config level (committed ci.yml smoke env + config defaults + prior-phase verification), but the hosted container-level proof is pending the fix above.

## 7. Benign Annotations (informational only)

- "Node.js 20 is deprecated… actions/checkout@v4, docker/build-push-action@v5, docker/setup-buildx-action@v3 … forced to run on Node.js 24" — runner-platform deprecation notice; no action required this phase.
- "ubuntu-latest will migrate to Ubuntu 26 beginning October 19, 2026" — informational.
