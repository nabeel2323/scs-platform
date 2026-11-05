# PR #106 — Final Review and Release Readiness Report

**Project:** Smart Commerce Platform (SCS)
**Subject:** Automated Staging Release Pipeline v2.1 (`workflow_call` orchestrator)
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)
**Pull request:** [#106](https://github.com/nabeel2323/scs-platform/pull/106) → `develop`
**Evidence head SHA:** `fc12499e251d016bfe8f46ba1c1e1a49874755d1` (v1.0 review basis)
**Report version:** v1.1 — v1.0 (2026-11-04) is the review; v1.1 (2026-11-05) records the outcome of the follow-on first-activation safety audit and the `d05b29e` hardening commit in §9.3 and the §10 notes. All v1.0 evidence, SHA citations and verdicts above it are preserved as written.
**Generated:** 2026-11-04 (v1.0) · 2026-11-05 (v1.1 addendum)
**Author:** Qoder review session (evidence collected read-only from the repository, the GitHub REST API and hosted Actions logs)

---

## 0. Scope, method and limitations

**What this report is.** An independent, evidence-based review of the release-pipeline implementation carried by PR #106, plus a release-readiness verdict. Every claim below is tied to one of three evidence classes:

| Class | Meaning | How it was produced in this review |
| --- | --- | --- |
| **CODE** | A statement about what the repository contains | Files read in full; evidence cited as `file:lines` |
| **EXEC** | A statement about something that actually ran | Local commands re-run during this review (validator, Vitest, `tsc`, ESLint, `nest build`) and hosted Actions logs |
| **API** | Hosted GitHub state | Read-only REST calls (`pulls`, `actions/runs`, `environments`, `actions/variables`, `actions/secrets`, `actions/permissions/workflow`) |

**What this report is not.** It is **not** evidence that a staging release has happened. No staging deployment, migration, seed, database write, Render change, secret/variable change, merge or push to `develop`/`main` was performed by this review (see §11).

**Limitations that constrain the verdict:**

1. `release.yml` has never executed on a GitHub-hosted runner. A reusable workflow is only invoked when its caller's `if` and `needs` are satisfied, which requires a `push` to `develop` ([`.github/workflows/ci.yml:518-540`](../../.github/workflows/ci.yml)). Pull-request CI therefore cannot produce any runtime evidence about the release jobs themselves; PR CI only proves the two workflow files are *accepted* and that the release job is *skipped*.
2. Two runtime-blocking defects were found in this review (§9.1) that PR CI structurally cannot catch, because both live in code paths that only execute against the staging database, Render, or the GitHub `staging` environment.
3. Repository-level GitHub state (environment protection rules, required reviewers) is only partially inspectable through the API; where it could not be read, the status is `NOT VERIFIED` rather than an assumption.
4. Design intent is never treated as runtime proof. Where a behaviour exists only as workflow *bash* that unit tests re-implement rather than execute, the finding is marked `PARTIAL` and named explicitly (§6.10–§6.12).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Repository and PR identity](#2-repository-and-pr-identity)
3. [Implementation inventory](#3-implementation-inventory)
4. [CI verification evidence (runs #417–#422)](#4-ci-verification-evidence-runs-417-422)
5. [Test evidence](#5-test-evidence)
6. [Security review](#6-security-review)
7. [Database migration safety](#7-database-migration-safety)
8. [CI failure and remediation history](#8-ci-failure-and-remediation-history)
9. [Outstanding prerequisites and risks](#9-outstanding-prerequisites-and-risks)
10. [Final recommendation](#10-final-recommendation)
11. [Prohibited-action confirmation](#11-prohibited-action-confirmation)
12. [Evidence index](#12-evidence-index)

---

## 1. Executive summary

**What was implemented.** PR #106 replaces the original `workflow_run` release trigger with a **reusable workflow**: `.github/workflows/release.yml` (816 lines, 5 jobs — `validate`, `database-release`, `deploy`, `health-check`, `summary`) is invoked by a new job in `.github/workflows/ci.yml` (`trigger-staging-release`) that only fires on `push` to `develop` in this repository after eight mandatory CI gates succeed. The release job enforces exact-SHA binding between the CI commit, the migrated database and the Render deployment, performs migrations plus the idempotent RBAC seed under a PostgreSQL advisory lock, verifies the migration ledger, polls Render to a terminal state, verifies the deployed commit, checks `/v1/readyz`, and publishes a step summary. Four helper scripts and eight release-pipeline test files (96 specs) support it, alongside ~3,000 lines of documentation.

**Verification status in one table.**

| Dimension | Status | Strongest evidence available today |
| --- | --- | --- |
| Implementation present in the branch | **VERIFIED** | CODE: 19 changed files, +7,479/−5 vs `develop` (§2) |
| Both workflow files accepted by GitHub Actions | **VERIFIED** | API: run #422 started 11 jobs at `fc12499`; `#418` proved that an invalid callee is rejected before any job starts, so acceptance is meaningful evidence (§4) |
| CI wiring (reusable call, permissions, guards) | **VERIFIED — structural** | EXEC: `48/48` validator checks; API: `Trigger Staging Release` = `skipped` on `pull_request` in #420 and #422 |
| General test suite at the head | **VERIFIED — hosted** | API + EXEC: run #422 `success`; `Unit Tests + Coverage Gates` log = `Test Files 199 passed / 6 skipped (205)`, `Tests 4045 passed / 91 skipped (4136)` |
| Release-pipeline specs | **VERIFIED** (88 unit + 8 integration) | EXEC local re-run this review + per-file counts identical in the hosted #422 log (§5) |
| `release.yml` jobs executing end to end | **NOT VERIFIED — never run** | No `push` to `develop` has invoked it; no staging release has been authorized |
| Ready for **code review** | **YES** | §10.1 |
| Ready for **merge** (after fixes) | **CONDITIONAL** — two runtime defects in §9.1 should be fixed before merge | §10.2 |
| Ready for **release activation** | **NO** | §10.3 — the `staging` environment, its secrets and `RENDER_SERVICE_ID` do not exist (API), and defect **B-1** breaks the first database call |
| Staging **end-to-end verified** | **NO — not attempted, not authorized** | §10.4 |
| **Production-ready** | **NO** | §10.5; the pipeline targets staging only and has no production path |

**Bottom line.** The PR is a genuine, well-guarded improvement over the previous design (the `workflow_run` default-branch trap, the SSL certificate deleted at a step boundary, the caller/callee permission intersection, and the silent no-op stale-release check are all fixed and guarded by executable checks). It is safe to review. It is **not** ready to be activated, and a successful PR run must not be read as evidence that a staging release works — for the reason in §4.4 plus the two concrete defects in §9.1.

---

## 2. Repository and PR identity

All values were read live during this review; none are copied from an earlier report.

| Field | Value | Class |
| --- | --- | --- |
| Repository | [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform) (`https://github.com/nabeel2323/scs-platform`) | API |
| Default branch | `main` | API |
| Pull request | [#106](https://github.com/nabeel2323/scs-platform/pull/106) | API |
| PR number | 106 | API |
| Title | `Fix: automated staging release pipeline v2.1 — CI wiring, token permissions, test isolation` | API |
| State | `open`, `draft: false` | API |
| Source branch | `feature/automated-release-pipeline-v2.1` | API |
| Target (base) branch | `develop` | API |
| Current PR head SHA | `fc12499e251d016bfe8f46ba1c1e1a49874755d1` | API |
| Base SHA (`develop` tip) | `b11638b22150c44e6287b89ef580374f83a8180e` — "Merge pull request #105 from nabeel2323/phase-4/staging-recovery-hardening" | API + CODE |
| Ahead / behind vs `develop` | **10 ahead, 0 behind** (`git rev-list --left-right --count origin/develop...HEAD` → `0 10`) | EXEC |
| Merge base | `b11638b22150c44e6287b89ef580374f83a8180e` | EXEC |
| Mergeability | `mergeable: true`, `merge_state: clean` | API |
| Changed files | **19** files, **+7,479 / −5** (`git diff --stat origin/develop...HEAD`) | EXEC |
| Created / updated | 2026-11-04T08:41:48Z / 2026-11-04T10:48:01Z | API |
| Local HEAD | `fc12499e251d016bfe8f46ba1c1e1a49874755d1` on `feature/automated-release-pipeline-v2.1` | EXEC |
| **Local HEAD agrees with remote PR head?** | **YES — byte-identical** (`git rev-parse HEAD` = remote branch tip = PR head) | EXEC |
| `refs/heads/main` locally | `90836d4f07e7ea2c9d4e0685d7fa3fe1e1f423e8` (untouched by this PR) | EXEC |

**Commit sequence `origin/develop..HEAD` (oldest → newest):** `7378683` → `44aa9a0` → `a792c86` → `d7857ab` → `365fb68` → `9fa9b8c` → `2079eab` → `3c8c24b` → `0e360f2` → `fc12499`. The last four are documentation-only; the release **code** head is `2079eab`.

**Changed files (CODE, from `git diff --stat origin/develop...HEAD`):**

| File | Lines | Kind |
| --- | --- | --- |
| `.github/workflows/release.yml` | +816 (new) | Workflow |
| `.github/workflows/ci.yml` | +55 / −… | Workflow (caller job + permissions) |
| `apps/api/scripts/validate-workflow-structure.mjs` | +384 (new) | Validator |
| `apps/api/scripts/validate-release-sha.mjs` | +178 (new) | Helper |
| `apps/api/scripts/verify-migration-ledger.mjs` | +178 (new) | Helper |
| `apps/api/scripts/detect-stale-release.mjs` | +114 (new) | Helper |
| `apps/api/src/__tests__/unit/release-pipeline/render-api.spec.ts` | +606 (new) | Test |
| `.../unit/release-pipeline/ssl-certificate-handling.spec.ts` | +325 (new) | Test |
| `.../unit/release-pipeline/manual-sha-validation.spec.ts` | +283 (new) | Test |
| `.../unit/release-pipeline/workflow-structure.spec.ts` | +229 (new) | Test |
| `.../integration/release-pipeline/verify-migration-ledger.spec.ts` | +265 (new) | Test |
| `.../unit/release-pipeline/stale-release-helper.spec.ts` | +115 (new) | Test |
| `.../unit/release-pipeline/stale-release-detection.spec.ts` | +101 (new) | Test |
| `.../unit/release-pipeline/workflow-trust-boundary.spec.ts` | +110 (new) | Test |
| `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | ±20 | Test (isolation fix) |
| `docs/deployment/AUTOMATED-RELEASE-PIPELINE-ARCHITECTURE-V2.1.md` | +1,737 (new) | Documentation |
| `docs/deployment/IMPLEMENTATION-REPORT-V2.1.md` | +822 (new) | Documentation |
| `docs/deployment/SECURITY-AUDIT-AND-REMEDIATION-REPORT.md` | +508 (new) | Documentation |
| `REMEDIATION-FINAL-REPORT.md` (repo root) | +636 (new) | Documentation |

> **Note on the report's own commit.** This file is documentation-only. It is committed on top of `fc12499`, so the PR head advances by one docs commit; that commit is validated by its own PR CI run, whose number and conclusion are recorded in PR #106 checks and in the delivery message accompanying this report. No release-code line is modified by this report.

---

## 3. Implementation inventory

### 3.1 `.github/workflows/ci.yml` — the caller

| Behavior | Evidence |
| --- | --- |
| Triggers only on `push`/`pull_request` to `main` or `develop` | `ci.yml:12-16` |
| `concurrency.group: ${{ github.workflow }}-${{ github.ref }}` with **`cancel-in-progress: true`** — explains why docs-only run #421 was cancelled | `ci.yml:18-20` |
| Workflow-level `GITHUB_TOKEN` scopes `contents: read`, `packages: read`, **`actions: read`**, and an explicit comment that GitHub *intersects* them with the callee's scopes (job-level permissions do not propagate); records the run #418 failure text | `ci.yml:22-39` |
| Non-environment constants `NODE_VERSION: '22'`, `PNPM_VERSION: '9.15.9'` | `ci.yml:41-43` |
| Eleven jobs incl. `lint`, `boundary-lint`, `test-unit`, `test-integration`, `migration-gate`, `test-contract`, `build`, `mobile`, `k6-smoke`, `container-build`, `trigger-staging-release` | `ci.yml` job keys; run #422 job list (§4.2) |
| Release caller: `name: Trigger Staging Release`, `if: github.event_name == 'push' && github.ref == 'refs/heads/develop' && github.repository == 'nabeel2323/scs-platform'`, `needs:` the **eight** mandatory develop gates, `uses: ./.github/workflows/release.yml`, `with: commit_sha/ci_run_id/ci_run_url`, `secrets: inherit` | `ci.yml:518-540` |
| `k6-smoke` deliberately **excluded** from `needs` because it is `main`-only and would cascade-skip the release | `ci.yml:514-517` + validator check `caller-needs-excludes-develop-skipped` (`validate-workflow-structure.mjs:156-158`, `DEVELOP_SKIPPED_JOBS` at `:81`) |
| Migration gate binds `DATABASE_URL` explicitly (`ci.yml:220`) and runs `db:migrate:ci -- --dry-run` then a full enforcing apply (`ci.yml:252`, `ci.yml:258`) | CODE |
| Failure triage aid: `scripts/summarize-vitest-failures.mjs` publishes failing spec names to the step summary (`if: failure()`) | `ci.yml:209-213` |

### 3.2 `.github/workflows/release.yml` — the reusable release workflow

| Region | What it actually does |
| --- | --- |
| `release.yml:1-31` | Header declaring Architecture v2.1 and the strict 12-step sequence (steps listed at `:17-29`); states the `workflow_run` default-branch problem it solves |
| `:34-57` | `on: workflow_call` with three **required string inputs**: `commit_sha`, `ci_run_id`, `ci_run_url` |
| `:39-43` | Deliberate design: staging secrets are **not** declared in the `workflow_call` secret schema, because an environment-less caller could pass empty values and shadow real environment secrets |
| `:60-70` | `on: workflow_dispatch` with `commit_sha` (required) and `skip_confirmation` (optional boolean, default `false`) — see finding SEC-12 (`skip_confirmation` is never consumed) |
| `:72-86` | `concurrency.group: staging-release`, `cancel-in-progress: false`, plus the allow-complete policy comment (queued runs belong to the caller `ci.yml`) |
| `:88-97` | Workflow `env` holds only non-environment constants (`NODE_VERSION` `:95`, `PNPM_VERSION` `:96`, `RENDER_API_BASE` `:97`) with an explicit prohibition on `${{ vars.* }}` here |
| `:99-112` | `permissions: contents: read / actions: read` — no write scope; documents the caller/callee intersection and why `deployments: write` was removed |
| `:116-136` | `validate` job: `environment: staging` (`:121`), job-scoped `RENDER_SERVICE_ID: ${{ vars.RENDER_SERVICE_ID }}` (`:125-126`), outputs `release_sha` / `ci_run_id` / `ci_run_url` (`:133-136`) |
| `:141-144` | `actions/checkout@v4` with **`fetch-depth: 0`** so merge-base checks are not shallow-clone false negatives |
| `:146-258` | `Determine and validate release SHA`. Dispatch path `:159-209`: 40-hex format `:165`, `git cat-file -e` existence `:173`, `git fetch --force --no-tags origin '+develop:refs/remotes/origin/develop'` + `git merge-base --is-ancestor` `:180-185`, `gh run list --workflow=ci.yml --branch=develop … --limit 50` then jq `select(.headSha == $sha and .conclusion == "success" and .headBranch == "develop")` `:190-197`. Automated path `:210-258`: rejects any caller event other than `push` `:215`, any ref other than `refs/heads/develop` `:219`, any repository other than `nabeel2323/scs-platform` `:223`, format `:232`, **exact binding `[ "$RELEASE_SHA" != "$THIS_SHA" ]`** `:236`, reachability `:245-249` |
| `:260-273` | Audit metadata echo (event, SHA, CI run id/url only) and target confirmation |
| `:275-322` | `Validate configuration and secrets`: presence of `RENDER_API_KEY`, `STAGING_DATABASE_URL`, `STAGING_PGSSLROOTCERT_PEM` `:278-304`; presence of `RENDER_SERVICE_ID` read from the **shell** (`-z "${RENDER_SERVICE_ID:-}"`) `:314-318`; prints only `[PRESENT]` / `[REDACTED]` `:321-322` |
| `:325-391` | `database-release` job (`needs: validate`, `environment: staging` `:328-329`). `Check for stale release (pre-mutation safety)` uses `gh run list --workflow=ci.yml --branch=develop --status=queued`, self-excludes by `databaseId` and keeps `runNumber > current` `:369-372`, and **never** calls `exit 1` — policy `allow-complete` `:363-391` |
| `:393-409` | Checkout at the **exact release SHA** (`ref: ${{ needs.validate.outputs.release_sha }}`), Node/pnpm setup, `pnpm install --frozen-lockfile` |
| `:411-519` | One consolidated step owns the whole SSL + database sequence: `mktemp -d` `:439-440`, `trap cleanup_ssl EXIT ERR INT TERM` `:453`, `umask 077` before writing the cert `:456-457`, non-empty check `:459-462`, **`stat` permission must equal `600`** `:464-468`, then `PGSSLROOTCERT="$SSL_FILE" pnpm --filter @scs/api db:migrate` `:480`, `db:seed` `:492`, and `node apps/api/scripts/verify-migration-ledger.mjs` `:503-509`. Step env: `STAGING_PGSSLROOTCERT_PEM`, **`STAGING_DATABASE_URL`**, `NODE_ENV: staging` `:425-428` — see blocker **B-1** |
| `:522-597` | `deploy` job (`environment: staging` `:526`, job-scoped `RENDER_SERVICE_ID` `:530-531`, outputs `deploy_id`/`deploy_status` `:533-535`). Trigger: re-checks the service id `:549-552`, `POST /services/${RENDER_SERVICE_ID}/deploys` with `{"commitId": "$RELEASE_SHA", "clearCache": "do_not_clear"}` `:559-566`, HTTP-status validation `:572-577`, malformed-JSON rejection `:580-584`, missing-id rejection `:586-592` |
| `:599-672` | Poll: `MAX_WAIT=600`, `POLL_INTERVAL=15` `:607-608`; non-2xx and malformed JSON are treated as *retryable* `:630-643`; `live` → `exit 0` `:651-655`; `failed|build_failed|update_failed|pre_deploy_failed|canceled|deactivated` → `exit 1` `:656-660`; `unknown` → keep polling `:661-663`; timeout → `deploy_status=timeout`, `exit 1` `:670-672` |
| `:674-730` | Verify deployed commit: reads **`.commit.id`** (explicit comment that Render does not return `commitId`) `:711-712`, fails on mismatch `:723-730` |
| `:733-769` | `health-check`: `https://scs-api-staging.onrender.com/v1/readyz`, 10 attempts × 10 s, passes only on HTTP `200` |
| `:772-816` | `summary`: `if: always()`, writes the SHA / CI run link / deploy id / deploy status / environment / service URL to `$GITHUB_STEP_SUMMARY`, and on failure prints each job's result `:798-812` |

### 3.3 `apps/api/scripts/validate-workflow-structure.mjs` (384 lines, 48 checks) *[v1.1 → `d05b29e`: 78 checks]*

An **executable** validator that parses the real `ci.yml` and `release.yml` with `js-yaml` and asserts wiring invariants (it does not hard-code constants). Coverage map: YAML parse `:104-113`; `workflow_call` present and `workflow_run` absent `:115-119`; required inputs `:121-125`; no secret schema `:127-132`; forbidden `'workflow_call'` event assumption `:134-136`; caller job-level `uses` `:138-140`; caller has no `steps`/`runs-on`/`environment` `:142-145`; no step-level reusable invocation `:147-149`; all eight mandatory gates in `needs` `:151-154` (`MANDATORY_DEVELOP_GATES` `:68-77`); develop-skipped jobs excluded `:156-158`; `needs` resolve to real jobs `:160-163`; `secrets: inherit` `:165-166`; caller `if` requires push/develop/repository `:168-172`; `with` keys `:174-178`; **caller/callee permission intersection** `:180-215`; every secret-touching release job declares `environment: staging` `:217-221`; `validate` has no invalid job-level `if` `:223-224`; environment `vars` bound at **job** scope only `:226-249`; consumed env names are bound in that job `:251-261`; every `${{ env.X }}` interpolation resolvable `:263-265`; missing `RENDER_SERVICE_ID` fails in the read-only job and `database-release` `needs` `validate` `:267-279`; stale-detection targets `ci.yml`, never `release.yml`, orders by `runNumber`, and cannot `exit 1` `:281-289`.

**EXEC (this review):** `node scripts/validate-workflow-structure.mjs` → **`48/48 checks passed`**. **[v1.1] At `d05b29e` the same command reports `78/78 checks passed` — 22 checks added for R-1 concurrency (both workflows), F-1 dispatch-input liveness, F-4 path-aware stale detection and `needs`-gating of the release job.**

### 3.4 `apps/api/scripts/validate-release-sha.mjs` (178 lines)

Exports `validateSHAFormat` (40-hex, `:26-36`), `validateSHAExists` (`git cat-file -e`, `:41-51`), `validateSHAReachable` (`git fetch origin develop` + `git merge-base --is-ancestor`, `:56-75`), `validateCIRunExists` (`gh run list … --json databaseId,headSha,headBranch,conclusion`, `:82-108`) and the ordered gate `validateReleaseSHA` (`:113-150`, stops at the first failed step). **Important:** `release.yml` does **not** call this script — the dispatch path inlines equivalent bash (`release.yml:159-209`). It is the executable specification behind `manual-sha-validation.spec.ts`, not a runtime component (finding SEC-11).

### 3.5 `apps/api/scripts/verify-migration-ledger.mjs` (178 lines)

The one helper the workflow **does** execute (`release.yml:503-509`). Requires `DATABASE_URL` (`:58-62`), optional `PGSSLROOTCERT` (`:64`), builds a `pg` pool with `max: 1`, 5 s idle and 10 s connect timeouts and **`rejectUnauthorized: true`** when SSL is used (`:67-78`); verifies connectivity `:81-88`; fails with exit 2 if `_migration_log` is absent (`:91-102`); reads `*.sql` from the migrations directory **defaulting to the same `infra/drizzle/migrations` the runner uses**, overridable by `MIGRATIONS_DIR` (`:29-50`, rationale comment `:36-41`); compares file list vs ledger, **exit 1 on any missing migration** with an explicit cause list (`:137-153`), **warns but exits 0 on orphaned ledger entries** (`:155-165`); unexpected errors → exit 2 (`:170-175`).

### 3.6 `apps/api/scripts/detect-stale-release.mjs` (114 lines)

### 3.6 `apps/api/scripts/detect-stale-release.mjs` (114 lines)

**[v1.1 — superseded by `d05b29e`; the description below is the `fc12499` state, kept for the audit trail.]** The helper is now path-aware: `orderFieldForEvent` / `comparisonBasisForEvent` select `runNumber` vs repository-wide `databaseId` per execution path, `queuedRunSources` returns `ci.yml:develop` on Path A and both `release.yml` + `ci.yml:develop` on Path B, `mergeQueuedRuns` deduplicates by `databaseId`, `getQueuedRuns` returns **`null`** on failure instead of an empty list so callers can count partial reads, and `detectStaleRelease` reports `orderField`, `comparisonBasis`, `sourcesRead` and `sourcesFailed` alongside the unchanged `isStale: false` / `policy: 'allow-complete'`. SEC-11's "mirror, not runtime authority" characterisation still applies.

Pure `findNewerRuns` (`:40-48`: numeric coercion, self-exclusion by `databaseId`, strict `runNumber >`, ascending sort), `getQueuedRuns` (`:53-68`, `gh run list --workflow=ci.yml --branch=develop --status=queued … --limit 10`, returns `[]` and logs to stderr on any failure), and `detectStaleRelease` (`:79-99`) which **always** returns `isStale: false` with `policy: 'allow-complete'`. Constants `CALLER_WORKFLOW_FILE = 'ci.yml'` `:30`, `CALLER_BRANCH = 'develop'` `:32`. Like §3.4, this is a test-visible mirror; the workflow's bash (`release.yml:356-391`) is the runtime authority (finding SEC-11).

### 3.7 Release-pipeline tests

| File | Specs | What it really executes |
| --- | --- | --- |
| `unit/release-pipeline/workflow-structure.spec.ts` | 10 | Runs the real validator against the real files, incl. **negative controls** reproducing CI #417 and CI #418 defect shapes |
| `unit/release-pipeline/workflow-trust-boundary.spec.ts` | 10 | Reads real `ci.yml`/`release.yml` text + parsed validator view; proves a PR can never reach the release path |
| `unit/release-pipeline/stale-release-detection.spec.ts` | 7 | Extracts the **real bash step** from `release.yml` and asserts its invariants (`runNumber` ordering, `ci.yml` target, no `exit 1`) |
| `unit/release-pipeline/stale-release-helper.spec.ts` | 4 | Executes `detect-stale-release.mjs` via `execFileSync` |
| `unit/release-pipeline/manual-sha-validation.spec.ts` | 19 | Executes/imports the real `validate-release-sha.mjs` helpers (git + ordered gate behavior) |
| `unit/release-pipeline/render-api.spec.ts` | 19 | A local `node:http` mock server against **spec-local re-implementations** of the trigger/poll/verify logic (no `release.yml` read) |
| `unit/release-pipeline/ssl-certificate-handling.spec.ts` | 19 | Node-level emulation (`process.umask(0o077)` `:39`, manual trap-style handler `:235`) of the SSL lifecycle — **not** bash execution |
| `integration/release-pipeline/verify-migration-ledger.spec.ts` | 8 | Spawns the **real script** against a **real PostgreSQL** (Testcontainers): exit 2 without `DATABASE_URL`, exit 2 without `_migration_log`, exit 0 consistent, exit 1 missing file, warn+0 for orphans, empty dir, missing dir, case-sensitive matching |

**[v1.1 — counts at `d05b29e`.]** `workflow-structure` **10 → 23** (adds R-1/F-1/F-4 positives and 7 further negative controls; 11 in total), `stale-release-detection` **7 → 13** (both execution paths asserted inside the real YAML step), `stale-release-helper` **4 → 9** (adds the automated-vs-dispatch disagreement case and the pre-fix false-positive replay); `workflow-trust-boundary` 10, `manual-sha-validation` 19, `render-api` 19, `ssl-certificate-handling` 19 and the integration file 8 are unchanged. Unit total **88 → 112** across the same 7 files (this table's per-file counts are the `fc12499` state; the `eed728d` audit already showed `workflow-structure` at 14 after the B-1 controls). SEC-11's characterisation of `render-api` and `ssl-certificate-handling` as specification tests rather than runtime execution still stands.

### 3.8 Documentation

- `docs/deployment/AUTOMATED-RELEASE-PIPELINE-ARCHITECTURE-V2.1.md` (1,737 lines) — authoritative architecture. §"Final CI Wiring (authoritative)" `:12`, Executive Summary `:196`, 12-step detail `:323-830`, Security Architecture `:833`, Failure Modes and Recovery `:961`, Migration Compatibility `:1122`, Operational Runbook `:1178`, Testing Strategy `:1299`, Prerequisites `:1428`, v1/v2/v2.1 comparison `:1506`, Deliverables `:1529`. **Verified inconsistency:** its Step 5/6/7 code blocks (`:499`, `:530`, `:560`) show three separate steps binding `DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}` and an `SSL_CERT_PATH`/`if: always()` cleanup split — the design that was superseded by the consolidated step at `release.yml:424-519`, and the binding the consolidated step no longer performs (see B-1 and §9.2).
- `docs/deployment/IMPLEMENTATION-REPORT-V2.1.md` (822 lines) — status line at `:6` ("Pull Request under review … NOT production-ready and NOT an activated pipeline"), 96-spec breakdown, run #420 evidence bullet, hosted-signal caveat replacing the old local whole-suite claim.
- `docs/deployment/SECURITY-AUDIT-AND-REMEDIATION-REPORT.md` (508 lines) — status at `:5`: "🟡 Defects remediated, locally verified and PR CI verified (run #420 success); PR under review. NOT an activated/production pipeline…".
- `REMEDIATION-FINAL-REPORT.md` (root, 636 lines) — "✅ Complete — locally verified and PR CI verified … Reviewable, **not** activated", an explicit "Still pending (cannot be produced by a pull request)" list, and the two retired limitations struck through (`~~Test File Typecheck Errors (34 errors)~~`, `~~No YAML Structural Validation~~`).

---

## 4. CI verification evidence (runs #417–#422)

Every run below was inspected read-only through the GitHub REST API (run object + job list). Run IDs are linked.

| # | Run (link) | Event | Commit | Conclusion | Jobs | Root cause | Correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #417 | [41783899294](https://github.com/nabeel2323/scs-platform/actions/runs/41783899294) | `push` (develop) | `44aa9a0` | **failure — before any job started** | 0 | `Invalid workflow file: ci.yml — Unexpected value 'secrets'`: the caller mixed `steps:`/`secrets:` with a reusable-workflow `uses:`, which GitHub forbids | `a792c86` — job-level `uses:` with `with:`/`secrets: inherit`, no `runs-on`/`steps`/`environment`; guarded by validator checks `caller-no-steps`, `caller-no-runs-on`, `caller-no-environment`, `no-step-level-reusable-invocation` + a #417 negative-control test |
| #418 | [41801495249](https://github.com/nabeel2323/scs-platform/actions/runs/41801495249) | `pull_request` | `365fb68` | **`startup_failure`, 0 jobs** | 0 | Caller/callee permission intersection: *"requesting 'actions: read, deployments: write', but is only allowed 'actions: none, deployments: none'"* | `9fa9b8c` — `permissions:` blocks on both files (`ci.yml:36-39`, `release.yml:110-112`), `deployments: write` removed; guarded by four permission checks (`validate-workflow-structure.mjs:180-215`) + a negative control that reproduces this exact shape |
| #419 | [41802705206](https://github.com/nabeel2323/scs-platform/actions/runs/41802705206) | `pull_request` | `9fa9b8c` | **failure in 1 of 11 jobs** | 11 started | `Unit Tests + Coverage Gates` failed on **three pre-existing test-isolation defects** (the p13-returns postgres spec contended with shared state; the migration-ledger spec renamed the real migrations directory; the manual-SHA spec asserted a local copy instead of the real helper). Release-pipeline logic did not fail — `Mobile`, `Lint & Typecheck`, `Migration Full Apply`, `Integration Tests`, `Boundary Lint (E6)` passed | `2079eab` — test isolation fixes (`MIGRATIONS_DIR` override in `verify-migration-ledger.mjs:36-50`, spec rewritten against the real helper); proven by #420 |
| #420 | [41806580906](https://github.com/nabeel2323/scs-platform/actions/runs/41806580906) | `pull_request` | `2079eab` | **success** | 9 executed + 2 skipped | — (first fully green release-code head) | — |
| #421 | [41812573276](https://github.com/nabeel2323/scs-platform/actions/runs/41812573276) | `pull_request` | `0e360f2` | **cancelled** | in-progress at cancellation | `ci.yml:18-20` `cancel-in-progress: true` — a newer docs commit (`fc12499`) superseded it. Expected behavior for a docs-only push, not a defect | Superseded by #422 |
| #422 | [41813462727](https://github.com/nabeel2323/scs-platform/actions/runs/41813462727) | `pull_request` | `fc12499` | **success** | 9 executed + 2 skipped | — (current PR head) | — |

### 4.2 Complete job-by-job table — latest successful run **#422** (head `fc12499`)

| Job ID | Job | Conclusion | Notes |
| --- | --- | --- | --- |
| 126518515865 | Lint & Typecheck | ✅ success | ESLint + `tsc --noEmit` |
| 126518516238 | Mobile (flutter analyze · test) | ✅ success | |
| 126519472875 | Integration Tests | ✅ success | Testcontainers PostgreSQL |
| 126519472898 | Unit Tests + Coverage Gates | ✅ success | `Test Files 199 passed / 6 skipped (205)`; `Tests 4045 passed / 91 skipped (4136)` — verbatim from the job log (job 126519472898) |
| 126519474575 | Boundary Lint (E6) | ✅ success | |
| 126519476778 | Migration Full Apply | ✅ success | Dry-run + full enforcing apply against `ci.yml:220` `DATABASE_URL` |
| 126522919020 | Contract Spec & Codegen | ✅ success | |
| 126522919022 | Build | ✅ success | |
| 126522922756 | Container Build & Smoke Test | ✅ success | `push: false` — no registry write |
| 126523631389 | k6 Smoke Test | ⏭ skipped | Guarded to `main` pushes (see §4.3) |
| 126526942157 | **Trigger Staging Release** | ⏭ skipped | `pull_request` event — the intentional security gate (see §4.3) |

Run conclusion: `success` — 9 executed jobs passed, 0 failed, 2 skipped by design. Head status checks additionally include Vercel `Preview Comments` (success); the repository has **no** branch-protection required-status-check list (`/repos/…/branches/develop/protection` → 404), so "mandatory" here means the `needs` graph in `ci.yml:527-534`, not a hosted required-check configuration.

### 4.3 Why `k6 Smoke Test` and `Trigger Staging Release` are skipped on a PR — by design

`k6-smoke` carries `if: github.ref == 'refs/heads/main'`, so it only runs on a `main` push; a `pull_request` into `develop` can never satisfy it, and it is *intentionally excluded* from the release caller's `needs` (`ci.yml:514-517`) because listing a job that is skipped on develop would cascade-skip `trigger-staging-release` and silently disable every release — validator check `caller-needs-excludes-develop-skipped` (`validate-workflow-structure.mjs:156-158`) locks that in.

`Trigger Staging Release` is skipped on pull requests because its `if` (`ci.yml:522-525`) demands all three of: event `push`, ref `refs/heads/develop`, and repository `nabeel2323/scs-platform`. This is the primary trust boundary: a PR is untrusted input and must never reach a job that holds staging database credentials and a Render API key. The called workflow re-enforces the same boundary independently (`release.yml:215-223`), and `workflow-trust-boundary.spec.ts` (10 specs) asserts both layers against the real files.

### 4.4 Why a successful PR run does not prove the release workflow has executed

Four independent reasons, each evidenced:

1. **The job never ran.** In #420 and #422 `Trigger Staging Release` concluded `skipped` (§4.2), so `release.yml`'s own jobs (`validate`, `database-release`, `deploy`, `health-check`, `summary`) were not started — not even the read-only `validate` job. CI here proves only that both YAML files are *syntactically and semantically accepted* (which #417/#418 proved is a real gate) and that the skip guard works.
2. **The code paths that would break are staging-only.** Migrations run against the staging DB inside `release.yml:424-519`, Render calls inside `:538-730`, readiness against `scs-api-staging.onrender.com` inside `:740-769`. CI's `Migration Full Apply` job uses a disposable container DB (`ci.yml:220`, `:461`) — a different database, a different connection string, and no Render call at all.
3. **A defect class that PR CI cannot see exists today.** Blocker **B-1** (§9.1) sits precisely in the release-only env binding, and the missing `staging` environment (B-2) is a repository setting that PR CI resolves *away* rather than exercising.
4. **Event semantics differ inside a called workflow.** `github.event_name` inside `release.yml` mirrors the *caller's* event (`push`), and `github.run_id`/`run_number` are the caller's (`release.yml:128-131`, `:347-352`). No PR run has ever exercised that substitution.

---

## 5. Test evidence

Each row states the environment and the exact command or log it comes from. Local results were re-produced during this review; hosted results are quoted from the #422 job log.

| Layer | Command / source | Result | Where |
| --- | --- | --- | --- |
| Structural workflow validation | `node scripts/validate-workflow-structure.mjs` | **48/48 checks passed** | Local, EXEC (this review) |
| Release-pipeline unit | `npx vitest run src/__tests__/unit/release-pipeline` | **7 files / 88 tests passed**, exit 0 | Local (`apps/api`), EXEC |
| ↳ per-file (local) | same run | `workflow-structure` 10, `render-api` 19, `manual-sha-validation` 19, `ssl-certificate-handling` 19, `workflow-trust-boundary` 10, `stale-release-detection` 7, `stale-release-helper` 4 | Local |
| Release-pipeline integration | `npx vitest run src/__tests__/integration/release-pipeline` (with `--basetemp`-free Testcontainers `postgres:16`) | **1 file / 8 tests passed**, exit 0 | Local, EXEC |
| **Total release-pipeline** | 88 unit + 8 integration | **96 specs** | Matches the documented claim |
| Migration-safety integration | `npx vitest run src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts migration-0065-hmac-hash.postgres.spec.ts migration-lock.postgres.spec.ts` | **4 files / 55 tests passed** (0064 = 32, 0065 = 13, lock = 2, ledger = 8), exit 0 | Local, EXEC |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | **0 errors**, exit 0 | Local, EXEC |
| Lint (release scope) | `npx eslint src/__tests__/unit/release-pipeline src/__tests__/integration/release-pipeline scripts/validate-workflow-structure.mjs` | **0 problems**, exit 0 | Local, EXEC |
| Build | `npx nest build` | `Successfully compiled: 432 files with swc`, `dist/main.js` present, exit 0 | Local, EXEC |
| **Hosted full suite** | job 126519472898 log, run #422 (`fc12499`) | `Test Files 199 passed / 6 skipped (205)` · `Tests 4045 passed / 91 skipped (4136)` · duration 261.87 s | API/EXEC (hosted) |
| ↳ 6 skipped files (hosted) | same log | `otp-redis-lua.real`, `cross-instance-throttling`, `contracts-phase1.openapi`, `http-cross-instance-throttling`, `throttle-ip-isolation`, `throttle-cleanup-sentinel.real` | Hosted — environment-gated specs, not failures |
| ↳ release-pipeline in the hosted run | same log | identical per-file counts: 19/19/19/10/10/7/4 unit + 8 integration (`verify-migration-ledger`, integration lane) | Hosted |
| Hosted integration lane | job 126519472875 `Integration Tests` = success; `Migration Full Apply` = success | API |
| Local whole-suite claim | *not* used | A local full-suite `vitest run` is contention-sensitive on this workstation (parallel stress specs have failed while other workstreams held files open). The authoritative whole-suite number is the hosted one above. This caveat is also recorded in the docs (`IMPLEMENTATION-REPORT-V2.1.md`, architecture doc verification section) | Policy |

**Claims verified against actual evidence, as required:** the "48/48 structural checks" claim is **accurate** (re-run this review); the "96 release-pipeline specs" claim is **accurate** (88 + 8 reproduced locally *and* per-file counts match the hosted #422 log); the "199 files / 4,045 tests" claim is **accurate but incomplete** — the hosted line is `4045 passed | 91 skipped (4136)` and `199 passed | 6 skipped (205)`; the "432 files built" and "tsc 0 errors" claims are **accurate**.

---

## 6. Security review

Statuses: `PASS` = implemented and evidenced; `PARTIAL` = implemented but with a named residual gap; `FAIL` = the code does not do what the design requires; `NOT VERIFIED` = cannot be determined from the available artifacts without running it.

| ID | Topic | Status | Evidence | Explanation and remaining risk |
| --- | --- | --- | --- | --- |
| SEC-1 | Caller/callee `GITHUB_TOKEN` permission intersection | **PASS** | `ci.yml:22-39`; `release.yml:99-112`; validator `:180-215`; API `actions/permissions/workflow` → `default_workflow_permissions: "read"` | The callee needs `actions: read` for `gh run list` (`release.yml:190`, `:356`); because GitHub *intersects* the caller's workflow-level grant with the callee's, `ci.yml` grants it explicitly. Run #418 is the empirical proof that the intersection is enforced (0 jobs, startup failure). Risk now: a future caller that omits the block fails at start-up — fail-safe, and covered by `caller-permissions-cover-called-workflow`. |
| SEC-2 | Least privilege — no unnecessary write scope | **PASS** | `release.yml:110-112` (`contents: read`, `actions: read`); `ci.yml:36-39`; validator `called-workflow-no-unneeded-write-scope` `:212-215`, `caller-permissions-read-only` `:205-211` | `deployments: write` was removed once it was confirmed no GitHub Deployment object is created (release goes to Render's own API). Every job is read-only from GitHub's perspective. Residual: `actions: read` is broader than needed (`gh run list` only) but is the minimum that satisfies the API. |
| SEC-3 | Secret values never logged | **PASS** | `release.yml:321-322` prints `[PRESENT]`/`[REDACTED]`; secret names only at `:288-300`; no `set -x` in any step (checked across `release.yml:146-816`); `Bearer $RENDER_API_KEY` used via env reference (`:561`, `:624`, `:692`) not interpolated literal | Only *names* of missing secrets are printed. Error paths echo Render **response bodies** (`:575`, `:582`, `:590`, `:700`, `:707`) — Render does not echo the API key, so exposure is limited to service metadata; low risk. The certificate is written to a file (`:457`) and never printed. |
| SEC-4 | Secrets reach the callee without being shadowable | **PASS** | `release.yml:39-43` (no `secrets:` schema in `workflow_call`); `ci.yml:540` `secrets: inherit`; validator `workflow_call-no-secret-schema` `:127-132` | Declaring secrets as `workflow_call` inputs would let an environment-less caller pass empty strings and shadow environment-scoped secrets. Design correctly avoids this; the trade-off is that secrets are inherited from the caller context, which is safe here only because the caller is gated (SEC-6). |
| SEC-5 | Environment-scoped `vars` handling | **PASS** | `release.yml:88-97` (workflow env = constants only, explicit prohibition), `:125-126` and `:530-531` (job-scope binding on `environment: staging` jobs), `:306-318` shell-side check; validator `no-workflow-scope-vars`, `has-job-scoped-vars-binding`, `var-*` job-scope/environment checks `:226-261` | Environment-scoped `vars` are only reliably resolvable for a job bound to that environment; inline `${{ vars.* }}` at workflow scope could silently become `""`. Three runtime re-checks (`:549-552`, `:611-614`, `:683-686`) fail loudly rather than calling `/services//deploys`. |
| SEC-6 | Pull-request / other-repo isolation (trust boundary) | **PASS** | `ci.yml:522-525`; `release.yml:210-223`; validator `caller-if-*` `:168-172`; `workflow-trust-boundary.spec.ts` (10 specs); API: #420/#422 `Trigger Staging Release` = `skipped` | Two independent layers (caller `if` + callee event/ref/repository checks). Evidenced live by the two skipped runs. Residual: fork PRs cannot set `secrets: inherit` values, and the repo check pins the context anyway. |
| SEC-7 | Exact commit-SHA validation | **PASS** | `release.yml:159-258`: 40-hex `:165`/`:232`, existence `:173`, develop reachability `:180-185`/`:245-249`, successful develop CI run for that SHA (dispatch) `:190-197`, exact equality with the CI run head (automated) `:236`; `fetch-depth: 0` checkout `:141-144`; DB checkout at the same SHA `:393-396`; Render `commitId` from the same value `:559-566` | The migrated SHA and the deployed SHA are the same string by construction (`needs.validate.outputs.release_sha` is the only source). `manual-sha-validation.spec.ts` (19 specs) executes the mirror helper. Residual: the automated path does not re-verify that `inputs.ci_run_id` corresponds to a *successful* run — it relies on the caller's `needs` graph; acceptable, but see SEC-13. |
| SEC-8 | Deployed-SHA verification | **PASS** | `release.yml:674-730`, `.commit.id` extraction `:711-712`, mismatch → `exit 1` `:723-730` | Fails the release if Render reports a commit other than the migrated one — the property that makes "migrated code == deployed code" auditable. Not exercised at runtime (see §4.4). |
| SEC-9 | Render service-id validation | **PASS** | `release.yml:314-318` (pre-mutation), `:549-552`, `:611-614`, `:683-686` | A missing id fails in the read-only job before any DB mutation, and is re-checked at each API call. |
| SEC-10 | SSL certificate file permissions and cleanup | **PASS (code) / NOT VERIFIED (runtime)** | `release.yml:439-470`: `mktemp -d` `:439`, `umask 077` **before** creation `:456-457`, non-empty check `:459-462`, `stat` must be `600` or fail `:464-468`, `trap cleanup_ssl EXIT ERR INT TERM` `:453`, `rm -rf "$SSL_DIR"` `:443-450`; single-step lifecycle comment `:411-423` | Consolidating the lifecycle into one script removes the original defect (a trap firing at a step boundary deleted the certificate before the migration ran). Remaining risk: the guarantee is textual — `ssl-certificate-handling.spec.ts` emulates `umask`/trap semantics in Node rather than executing this bash (SEC-11), and no runner has executed it. `rejectUnauthorized: true` is enforced by both consumers (`migrate-pg.ts:41-43`, `verify-migration-ledger.mjs:72-77`). |
| SEC-11 | Tests that execute real logic vs mirror it | **PARTIAL** | `render-api.spec.ts` (606 lines; imports only `node:http`, spec-local functions at `:32`) and `ssl-certificate-handling.spec.ts` (`:39`, `:235` Node emulation) vs `stale-release-detection.spec.ts` (reads the real step), `workflow-structure.spec.ts` (runs the real validator), `verify-migration-ledger.spec.ts` (spawns the real script), `stale-release-helper.spec.ts` (execs the real helper) | 38 of the 88 unit specs (Render API + SSL) verify **re-implementations** of the workflow's shell logic. They give real value as specification tests but are *not* proof that the bash in `release.yml` behaves that way — the only executable guard on the bash itself is the structural validator plus the 7 stale-release text specs. Remediation: extract the Render/SSL sequence into a tested script that `release.yml` invokes (as already done for the ledger), or add a shell-level test. |
| SEC-12 | Unused `workflow_dispatch` input | **PARTIAL** | `release.yml:66-70` declares `skip_confirmation` (default `false`); `grep skip_confirmation` over `.github/workflows/*` finds **only the declaration** | No step consumes it, so a manual dispatch has **no** confirmation gate — it releases as soon as the (strict) SHA validation passes. Not a doc inconsistency (no document claims a confirmation gate), but a false affordance that should either be implemented or removed before activation. Manual dispatch still cannot bypass SEC-7, so exploitability is limited to an authorized actor triggering an unintended release. |
| SEC-13 | Caller-supplied metadata echoed into the step summary | **PARTIAL** | `release.yml:781-790` writes `ci_run_id`/`ci_run_url` into `$GITHUB_STEP_SUMMARY` as markdown; the automated path copies `inputs.ci_run_id`/`ci_run_url` verbatim (`:252-254`) with no format check | A crafted caller could inject a markdown link into the run summary. Low severity: the caller is gated by SEC-6/SEC-7 and any other caller fails `validate` before `summary` runs. Fix: validate `ci_run_id` as digits and construct the URL from `github.server_url`/`github.repository` instead of trusting the input. |
| SEC-14 | Concurrency and in-flight migration protection | **PASS** | `release.yml:84-86` (`group: staging-release`, `cancel-in-progress: false`), policy comment `:72-83`; advisory lock `migrate-pg.ts:52-56` + `migration-lock.ts` (`pg_advisory_lock(0x534353, 1)`, two-key session lock, unlock verifies ownership); stale-detection step `release.yml:332-391` | GitHub gives one-running + one-pending (older pending replaced), *not* FIFO — correctly documented rather than over-claimed. The stale check is **informational by design** (`allow-complete`; validator `stale-detection-allows-complete` forbids `exit 1` in it), so the actual protection against two concurrent migrators is the workflow concurrency group plus the DB advisory lock, which survives a dead session automatically. |
| SEC-15 | Render terminal-state, timeout and malformed-response handling | **PASS** | `release.yml:572-592` (trigger HTTP + JSON + id), `:630-672` (poll), `:656-660` (6 terminal failure states + `live`), `:661-663` (`unknown` keeps polling), `:670-672` (timeout → `deploy_status=timeout`, `exit 1`) | 7 states total, matching the documented set; `created`/`queued`/`build_in_progress`/`update_in_progress` fall through the `case` and keep polling, which is correct. |
| SEC-16 | Poll loop treats every non-2xx as retryable | **PARTIAL** | `release.yml:630-635` (`HTTP_CODE` outside 2xx → sleep and continue) combined with `:670-672` | A permanent authorization failure (401/403 from a wrong or revoked `RENDER_API_KEY`, or a wrong service id) burns the full 600 s and then reports `deploy_status=timeout`, pointing the operator at the wrong root cause. Fail-fast on 4xx (401/403/404) would be more accurate. Also: `release.yml` declares **no `timeout-minutes`** on any job (only `ci.yml:409` sets one), so a hung non-Actions dependency can consume the runner default before failing. |
| SEC-17 | Health check quality | **PASS (thin)** | `release.yml:740-769`: `/v1/readyz`, 10 attempts × 10 s, accepts only HTTP `200` | Correctly fails on anything else. Residual: status code only — no body/DB assertion — and the URL is hardcoded (no environment indirection). A green `readyz` after a *failed* SHA check cannot happen (`needs: deploy` at `:736`), so the ordering is sound. |
| SEC-18 | Supply-chain hardening of the workflow itself | **PARTIAL** | `release.yml:142`, `:394`, `:399`, `:404` use mutable major tags (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`); no `.github/dependabot.yml` (`ls` → not found); API `actions/permissions/selected-actions` → 409 *"All actions and workflows are allowed on this repository"* | Nothing in this PR introduces the gap, but the release path now depends on third-party actions fetched by floating tag on a repository with no Actions allowlist. Recommend SHA-pinning the four `uses:` lines (or enabling a allowlist/dependabot) before activation. |
| SEC-19 | Secrets committed to the repository | **PASS** | `git ls-files` → only `.env.example` and `infra/deploy/.env.production.example` templates; no `.env`/credentials tracked | No secret material in the tree. This PR adds none. |
| SEC-20 | Staging environment / protection configuration | **FAIL (configuration)** — see B-2 | API: `GET /environments` → 5 environments, **none named `staging`**; `GET /environments/staging`, `…/secrets`, `…/variables` → **404**; `GET /actions/variables` → `total_count: 0`; `GET /actions/secrets` → empty | Without the environment, `environment: staging` jobs get no environment secrets/vars, so `validate` must fail at `release.yml:275-320` — *before* `database-release` (`needs: validate`, `:328`), i.e. the failure mode is safe but activation is impossible today. No protection rules/deployment reviewers were observed on the existing environments either (`protection_rules: []`), so "release requires approval" is currently **NOT VERIFIED / not configured**. |

---

## 7. Database migration safety

Sixty-five migration files exist in `infra/drizzle/migrations` (`ls *.sql | wc -l` → **65**). The release path applies them through `pnpm --filter @scs/api db:migrate` → `tsx infra/drizzle/migrate-pg.ts` (`apps/api/package.json`, `db:migrate`).

| Concern | Status | Evidence and behavior |
| --- | --- | --- |
| Migration discovery | **PASS** | `migrate-pg.ts:18-23` — `readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()`; directory constant `:12` resolves to repo-root `infra/drizzle/migrations`. Missing directory throws (`:19-21`). |
| Ordering | **PASS (lexicographic)** | Same `.sort()` in the runner (`:22`), in the ledger verifier (`verify-migration-ledger.mjs:112-115`) and in CI's dry-run (`ci.yml:252`, `migrate-pg.ts:71-84`). Ordering is *filename* order, so safety depends on the zero-padded `NNNN-name.sql` naming convention; a 4-digit overflow would reorder. Nothing in the pipeline validates numbering (CI `Migration Full Apply` enforces apply, not naming). |
| Ledger validation | **PASS** | Runner: `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at …)` `:59-62`, ledger read `:65-68`, `pending = files − applied` `:69`. Release step then re-verifies with the real script (`release.yml:503-509`) and fails on **any** file missing from `_migration_log` (`verify-migration-ledger.mjs:137-153`), orphans warn only (`:155-165`). Verified against a real Postgres by `verify-migration-ledger.spec.ts` (8 specs, exit-code assertions). |
| Already-applied handling / re-runs | **PASS** | Applied names are skipped (`:69`, `:87-90` "Database up-to-date — all N migration(s) already applied"), so re-running a release is a no-op; the RBAC seed is idempotent (`seed-pg.ts:1-18`: "Safe to run on every deployment", `ON CONFLICT DO NOTHING`). |
| Failure and retry semantics | **PASS — per-migration atomicity, no automatic rollback** | Each file runs inside an explicit `BEGIN` → apply → `INSERT INTO _migration_log` → `COMMIT` (`:96-101`); on error it `ROLLBACK`s and rethrows `Migration <file> FAILED: …` (`:103-111`), so a failed migration leaves neither schema change nor ledger row, and the workflow stops without touching Render (`database-release` is a `needs` of `deploy`, `release.yml:525`). Retry = re-invoke the release; previously applied migrations are skipped by the ledger. **No automatic database rollback exists anywhere in the pipeline** — intentional and consistent with the project constraint; recovery is manual per the architecture doc's Failure Modes section (`:961+`). |
| Locking and concurrent execution | **PASS** | `acquireMigrationLock(client)` (`:54`) holds a **session-scoped** two-key advisory lock `pg_advisory_lock(0x534353, 1)` (`migration-lock.ts:9-10`, `:13-18`); release verifies ownership and throws otherwise (`:20-29`), and if the session dies PostgreSQL drops the lock automatically (comment `:52-53`). `finally` releases the lock, the client and the pool (`:118-134`). Layered above: `concurrency.group: staging-release` with `cancel-in-progress: false` (`release.yml:84-86`) and the informational stale-release check (`:332-391`). Proven live by `migration-lock.postgres.spec.ts` (2 specs, re-run this review). |
| SSL connection handling | **PASS** | Both consumers read `PGSSLROOTCERT` and set `ssl: { ca: readFileSync(…), rejectUnauthorized: true }` (`migrate-pg.ts:37-44`, `verify-migration-ledger.mjs:64-78`); the workflow produces that file at 0600 in a `mktemp -d` and cleans it on `EXIT/ERR/INT/TERM` (`release.yml:439-470`, `:443-453`). CI never uses staging certificates — it uses disposable databases (`ci.yml:220`, `:461`), satisfying the "no staging credentials in CI" constraint. |
| Migration / seed separation | **PASS** | Two distinct calls, in order: `db:migrate` (`:480`) then `db:seed` (`:492`), never combined. `grep -E "db:(seed|migrate|reset|demo|bootstrap)|seed-catalog" release.yml` returns **only** `db:migrate` (`:480`) and `db:seed` (`:492`) — the catalog seed (`db:seed:catalog`), staging bootstrap (`db:bootstrap:staging`), demo data (`db:demo`) and reset (`db:reset`) exist in `apps/api/package.json` but are **not** referenced by the release workflow, matching the architecture doc's "What this does NOT execute" list (`:541-548`). |
| Staging vs development distinction | **PASS (code) / NOT VERIFIED (runtime)** | `NODE_ENV: staging` is bound at the DB step (`release.yml:428`); the database and service are staging-scoped secrets (`STAGING_DATABASE_URL`, `scs-api-staging.onrender.com`). But per B-1 the staging connection string is currently exported under a name the runners do not read, so this distinction has **never been proven at runtime**, and the `staging` GitHub environment does not exist (B-2). |
| Migrations succeed but deployment fails | **PARTIAL** | Design and audit trail exist: `deploy` requires `database-release` (`:525`), a failed poll or SHA mismatch exits non-zero (`:656-672`, `:723-730`), and `summary` runs `if: always()` and prints every job result (`:776`, `:798-812`), so an operator sees "database migrated, deploy failed". The *documented* state of the schema-vs-code split is described in the architecture doc's Failure Modes section, but no automatic remediation or rollback is attempted (by design). Residual risk: the schema is then ahead of the deployed code — acceptable for staging, and precisely why the pipeline is not a production path. |

---

## 8. CI failure and remediation history (classification)

| Run | Class of defect | Concrete cause | Fix commit | Now guarded by |
| --- | --- | --- | --- | --- |
| #417 (push `44aa9a0`) | **Release-implementation defect** (workflow syntax/semantics) | Reusable-workflow call written as a normal job: `uses:` together with `steps:`/`secrets:` → `Invalid workflow file … Unexpected value 'secrets'`; the run died before any job started | `a792c86` | Validator `caller-job-level-uses`, `caller-no-steps`, `caller-no-runs-on`, `caller-no-environment`, `no-step-level-reusable-invocation` (`:138-149`) + a negative-control spec reproducing the #417 shape (`workflow-structure.spec.ts`) |
| #418 (`365fb68`) | **Release-implementation defect** (token permissions) | Callee requested `actions: read` (+`deployments: write`) while the caller declared no `permissions:` block → intersection `actions: none` → `startup_failure`, 0 jobs | `9fa9b8c` | `ci.yml:36-39` + `release.yml:110-112`; validator `caller-workflow-permissions-declared`, `caller-permissions-cover-called-workflow`, `caller-permissions-read-only`, `called-workflow-no-unneeded-write-scope` (`:180-215`) + negative control |
| #419 (`9fa9b8c`) | **Pre-existing test defects** (3) + **test-infrastructure defect** (1) | `Unit Tests + Coverage Gates` failed on: the p13-returns postgres spec sharing state with other specs; the migration-ledger spec mutating the *real* migrations directory (cross-spec race); the manual-SHA spec asserting a local copy rather than the real helper. Release-pipeline logic itself passed (`Mobile`, `Lint & Typecheck`, `Migration Full Apply`, `Integration Tests`, `Boundary Lint` all green) | `2079eab` | `MIGRATIONS_DIR` override in `verify-migration-ledger.mjs:36-50`; `manual-sha-validation.spec.ts` rewritten to exercise `validate-release-sha.mjs`; `p13-returns.postgres.spec.ts` isolation. Proven by #420/#422, where the same specs pass inside the same parallel pool (`199 files / 4045 tests`) |
| #420 (`2079eab`) | — | First fully green release-code head; 9 jobs pass, `k6 Smoke Test` and `Trigger Staging Release` skipped | — | Baseline for the docs status wording (`3c8c24b`, `0e360f2`, `fc12499`) |
| #421 (`0e360f2`) | **Expected CI behavior, not a defect** | Docs-only commit superseded by `fc12499` under `cancel-in-progress: true` (`ci.yml:18-20`) | `fc12499` | Documented in the PR body; no code change needed |
| #422 (`fc12499`) | — | Current head, `success`; the three #419 specs confirmed passing in its `Unit Tests + Coverage Gates` log | — | — |

**Not found in any run:** a release-pipeline *logic* defect. The two defects that would break a real staging release (B-1, B-2 in §9.1) are invisible to all six runs, which is the empirical statement of §4.4.

---

## 9. Outstanding prerequisites and risks

### 9.1 Defects that block activation (found by this review)

**B-1 — `DATABASE_URL` is never exported to the database step. Status: FIXED (commit pending).**

| | |
| --- | --- |
| Implementation (before fix) | `release.yml:425-428` binds step env `STAGING_PGSSLROOTCERT_PEM`, **`STAGING_DATABASE_URL`**, `NODE_ENV`; `grep -n DATABASE_URL .github/workflows/release.yml` returns only the four `STAGING_DATABASE_URL` lines (`:278`, `:288`, `:289`, `:427`) — there is **no** `DATABASE_URL` binding anywhere, and no `echo "DATABASE_URL=…" >> $GITHUB_ENV`. |
| Implementation (after fix) | `release.yml:428` now exports `DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}` alongside `STAGING_DATABASE_URL`, satisfying all three consumers. The workflow structural validator (`apps/api/scripts/validate-workflow-structure.mjs` checks #21a–#21d) enforces this binding and fails the build if it is removed or remapped. |
| Consumers | `migrate-pg.ts:26-29` → `throw new Error('DATABASE_URL must be set for the migration runner.')`; `seed-pg.ts:504-506`; `verify-migration-ledger.mjs:58-61` → `process.exit(2)`. None of them reads `STAGING_DATABASE_URL`, and none auto-loads `.env` (imports at `migrate-pg.ts:7-10`; no committed `.env`, SEC-19). |
| Consequence (before fix) | The first statement of the consolidated step (`release.yml:480`) exits non-zero before any connection is made → `database-release` fails → `deploy` is skipped (`:525`) → `summary` reports the failure. **No mutation, no data risk** — a fail-safe, but the pipeline can never complete. |
| Consequence (after fix) | All three consumers now receive `DATABASE_URL` at runtime. The pipeline can complete the database-release job and proceed to deployment. |
| Why no test caught it | `verify-migration-ledger.spec.ts` injects `DATABASE_URL` itself (its 8 exit-code specs pass); `validate-workflow-structure.mjs` checks *scope* of `vars`/`env` interpolations (`:226-265`) but has no notion of "environment variables required by scripts this workflow executes"; PR CI never runs the job (§4.4). CI's own `Migration Full Apply` binds `DATABASE_URL` at `ci.yml:220` — the same command succeeds there, which is the confirmation. |
| Minimal remediation (completed) | In `release.yml:428` added `DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}` (keeping `NODE_ENV: staging`), restoring the mapping the architecture doc specifies at `:499`, `:530`, `:560`. Extended the validator with 8 new checks (#21a–#22d) asserting that the binding exists, maps to the correct secret, and runs migrate/seed/ledger in order. Added 4 negative-control tests proving the validator catches B-1 if re-introduced. |

**B-2 — No `staging` GitHub environment, secrets, or variables exist. Status: BLOCKED (owner configuration).**

API evidence: `GET /repos/nabeel2323/scs-platform/environments` → 5 environments (`Preview – scs-platform-admin`, `Preview – scs-platform-web`, `Production`, `Production – scs-platform-admin`, `Production – scs-platform-web`), all with `protection_rules: []`; `GET …/environments/staging` (and `/secrets`, `/variables`) → **404**; `GET …/actions/variables` → `total_count: 0`; `GET …/actions/secrets` → empty list. Consequence: `validate` fails at `release.yml:275-320` before any mutation — the safe outcome, and the reason `database-release` is gated behind it (validator `validate-guard-precedes-database-release`, `:271-279`). Creating these is explicitly outside this review's authorization.

### 9.2 Prerequisite and risk register

| Item | Status | Evidence / note |
| --- | --- | --- |
| GitHub staging secrets `RENDER_API_KEY`, `STAGING_DATABASE_URL`, `STAGING_PGSSLROOTCERT_PEM` (environment-scoped) | **BLOCKED / not attempted** | API 404 on `…/environments/staging/secrets`; repo-level secrets list empty. Authorization excludes configuring them. Validation logic: `release.yml:275-304` — **VERIFIED** in code, **NOT VERIFIED** at runtime |
| Environment-scoped `RENDER_SERVICE_ID` variable | **BLOCKED / not attempted** | API 404 (`…/environments/staging/variables`) and repo vars `total_count: 0`; consumption path VERIFIED in code (`:125-126`, `:314-318`, `:530-531`, `:549-552`) |
| Documentation-vs-implementation inconsistency in the architecture doc Steps 5–7 | **PENDING (corrected by this report's commit)** | Doc `:499`, `:530`, `:560` describe the pre-consolidation step layout and the `DATABASE_URL` mapping that B-1 removed; an implementation-status note has been added at §Step 7 of that document |
| Render: staging service exists and **auto-deploy disabled** so the pipeline owns deploys | **NOT VERIFIED / not attempted** | Requires Render access, which this review does not have and is not authorized to change. If auto-deploy is *enabled*, a second deployment could race the verified one — `release.yml:674-730` would then fail the release rather than hide it |
| Successful eligible `push` to `develop` running `ci.yml` | **PENDING** | Six runs exist; none is a `push` to `develop` after the fix (#417 was a develop push but predates the reusable-workflow design and failed at parse). Blocked by B-1/B-2 and by the "no push to develop" authorization |
| `release.yml` actually invoked as a reusable workflow | **NOT ATTEMPTED (not authorized)** | #420/#422 show `Trigger Staging Release` = `skipped` on `pull_request`; zero executions |
| Authorized staging release reaching Render + staging DB | **NOT ATTEMPTED (not authorized)** | No Render call has ever been made from CI |
| Render deployed-commit verification (`/deploys/{id}` → `.commit.id`) | **NOT VERIFIED** | Logic present and unit-tested against a **mock** server only (`render-api.spec.ts`, SEC-11) |
| `/v1/readyz` returns 200 after deploy | **NOT VERIFIED** | `release.yml:740-769` never executed |
| Migration ledger verified **against staging** | **NOT VERIFIED** | Script verified against disposable Testcontainers DBs (`verify-migration-ledger.spec.ts`); staging DB never touched. Today it would fail on B-1 before reaching the DB |
| `staging` environment protection rules / required reviewers | **NOT VERIFIED (not configured on any environment)** | API shows `protection_rules: []` for all 5 existing environments; `staging` absent |
| Actions allowlist / SHA-pinned third-party actions | **PARTIAL — repository-wide gap** | API 409 "All actions and workflows are allowed"; `release.yml:142/394/399/404` use `@v4` tags (SEC-18) |
| Job-level `timeout-minutes` on release jobs | **PARTIAL** | Absent from `release.yml` (present once in `ci.yml:409`) — SEC-16 |
| `skip_confirmation` affordance | **RESOLVED — removed in `d05b29e`** | Was: declared `release.yml:66-70`, never consumed (SEC-12). Now deleted; `release.yml:78-83` declares only `commit_sha`, whose description states the dispatch is a real release. `release-no-skip-confirmation-input` + `dispatch-inputs-all-consumed` prevent regression. See §9.3 |
| In-flight release cancellable by a newer `develop` push (R-1) | **RESOLVED in code — `d05b29e`** | `ci.yml:57-59` now evaluates `cancel-in-progress: ${{ github.ref != 'refs/heads/develop' }}`. See §9.3 |
| Stale-release detection compared unlike identifiers on the dispatch path (F-4) | **RESOLVED in code — `d05b29e`** | `release.yml:402-410` branches per execution path. See §9.3 |
| No automatic DB rollback (by design) | **VERIFIED — intended behavior preserved** | `migrate-pg.ts:103-111` (per-migration rollback only); nothing in `release.yml` issues a downgrade/reset |

### 9.3 Defects surfaced by the first-activation safety audit, and their status (v1.1)

`PR-106-FIRST-STAGING-ACTIVATION-SAFETY-AUDIT.md` re-derived the activation behaviour from the workflow files at `303ff06` and found three defects this review had either rated lower or expressed only as an affordance. All three are now closed in code by **`d05b29e12443a20572d48f95c66c279080ca0264`**; the audit's §15 addendum carries the full technical detail, so this table records only the readiness consequence.

| ID | Defect | Class | Status after `d05b29e` |
| --- | --- | --- | --- |
| **R-1 / F-2** | `ci.yml`'s unconditional `cancel-in-progress: true` could cancel the very run hosting `database-release` when a second push landed on `develop` — demonstrated live on run #424, where a job terminated `cancelled` mid-run. | Code defect | **Fixed.** Cancellation is now scoped by ref: `develop` runs (the only ones that can host a release) are never superseded; feature/PR/`main` runs keep cancelling. `release.yml` adds a literal `staging-release` group with `cancel-in-progress: false` + `queue: max`. Guarded by 8 validator checks and 3 negative controls. |
| **F-1 / SEC-12** | The `skip_confirmation` dispatch input was never read by any step, so the dispatch UI advertised a confirmation gate that did not exist. | Code defect (governance) | **Fixed by deletion.** The input is gone; approval is documented where it actually lives — `staging` environment protection rules with required reviewers. Two validator checks keep it dead. |
| **F-4** | On the dispatch path the stale-release check compared `release.yml`'s own `runNumber` against `ci.yml` run numbers, so it printed a false "NEWER RELEASE(S) QUEUED" during exactly the run a human is watching. | Code defect (diagnostic) | **Fixed.** Path A keeps caller `ci.yml` + `runNumber`; Path B orders by repository-wide `databaseId` over `release.yml` and `ci.yml:develop` runs. Advisory-only policy deliberately unchanged. Proven by executing the mirrored helper against fabricated run state, including a replay of the pre-fix expression that reproduces the false positive. |
| **R-2** | Render auto-deploy on the linked branch is a second, ungated deploy trigger. | Owner configuration | **Unchanged, and now the top remaining risk** — the only trigger that bypasses GitHub Actions entirely. Not verifiable or fixable from the repository. |
| **R-3** | Whether a *called* workflow's top-level `concurrency` participates in grouping is not covered by GitHub's documentation. | Architectural unknown | **Not resolved, and no longer depended upon.** R-1's protection moved to the caller, where the semantics are documented. The literal group means the release behaves correctly under either interpretation. |
| **R-4** | Default concurrency groups hold only one pending member and replace the older pending run, so a queued release can be dropped silently. | Code defect (low) | **Mitigated.** `queue: max` raises the ceiling to 100 pending on `staging-release`. Still not FIFO-documented; "one release at a time" discipline remains advisable. |
| **F-3 / W4** | Merging auto-creates an unprotected `staging` environment; repository-level secrets with the same names would satisfy `validate` and bypass the environment gate. | Owner configuration | **Unchanged.** No environment, secret or variable was created, read or modified in this session. |
| **F-5** | The release jobs have never executed anywhere. | Evidence gap | **Unchanged by design, and unchanged by run #429** (§10.6), where `trigger-staging-release` skipped on `pull_request` as designed. Closing it requires the merge and an authorized activation. |

Line-number note: `release.yml` citations in §3.2, §6, §7 and §9.1 of this report refer to the `fc12499` layout. In `d05b29e` the dispatch inputs moved to `:78-83`, the concurrency block to `:114-117`, and the stale-release step to `:363-476`; the additions are comment-and-YAML only, so no other logic shifted meaning. In `ci.yml`, the post-hardening positions are: concurrency `:57-59`, advisory `pnpm format:check` `:109-110`, integration run `:235`, k6 gate `:401-404`, `trigger-staging-release` `:557` with its `if:` at `:561-564`.

Hosted-CI note: the three "Fixed" rows above are carried by PR head `87f5589`, verified green by run #429 (§10.6). That run proves GitHub *accepts and schedules* both rewritten workflow files; it does not execute `release.yml`, so no row in this table acquires runtime evidence from it.

---

## 10. Final recommendation

These five verdicts are deliberately separate; a green mark in one does **not** transfer to another.

### 10.1 Code-review readiness — **READY**

The branch is coherent, self-documenting, and every security property listed in §6 is traceable to a file and line. Reviewers should focus on the three items that this review found but did not change: SEC-11 (two mirror-style test files), SEC-12 (dead `skip_confirmation` input), SEC-18/SEC-16 (floating action tags, missing job timeouts). B-1 (one-line env mapping) has been fixed and verified by 8 new validator checks and 4 negative-control tests. Nothing here requires re-architecture.

**[v1.1]** Two of those three items moved. **SEC-12 is closed** — `skip_confirmation` is deleted rather than retained as decoration (§9.3). The reviewer focus list is now: **SEC-11** (unchanged — `render-api` and `ssl-certificate-handling` still re-implement logic instead of executing `release.yml`), **SEC-18/SEC-16** (unchanged — floating `@v4` tags, no job timeouts), and the new **§9.3 diff itself**: the `ci.yml` cancellation scoping and the `release.yml` stale-release path split are the two places where a reviewer can most usefully try to break the reasoning, because both are guarded by validator checks *and* negative controls rather than by runtime evidence.

### 10.2 Merge readiness — **CONDITIONAL; do not merge as-is**

Technically mergeable (`mergeable: true`, `merge_state: clean`, 0 behind `develop`, PR CI `success` at `fc12499`). B-1 has been fixed and verified. But merging `release.yml` into `develop` **activates** the push-to-develop release trigger, and with B-2 (missing `staging` environment) still present, the first eligible develop push that reaches `validate` will fail at `release.yml:275-320`. Recommended sequence: (a) ~~fix B-1 and add the guard described in §9.1~~ **(done)**, (b) create the `staging` environment with its three secrets and `RENDER_SERVICE_ID` variable (B-2), (c) keep SEC-11's Render/SSL logic either extracted or explicitly labelled as specification tests, (d) then merge. If the team prefers to merge now, it must be paired with an explicit note that B-2 makes activation impossible — which is safe but misleading. **This review did not merge and will not merge the PR.**

**[v1.1] The verdict is unchanged, with two refinements.** (1) "PR CI `success`" was evidenced at `fc12499`; since then the branch has taken B-1's remediation, this report's own commits, the safety audit and now `d05b29e`, so merge readiness depends on a **green hosted run for the current PR head** — which is now a fact rather than an assumption: **run #429, head `87f5589`, conclusion `success`** (§10.6). (2) The activation hazard described here is narrower than it was: once merged, a second `develop` push can no longer cancel a release mid-migration (R-1, §9.3), and the dispatch UI no longer implies a confirmation step that does not exist (F-1). What still makes merging a *decision* rather than a formality is exactly what v1.0 said — B-2's four configuration values turn every develop push into a live staging release. The audit's ordering (Render auto-deploy confirmed disabled → `staging` created **with a required reviewer and no secrets** → then merge) supersedes step (b)+(d) sequencing in this paragraph.

### 10.3 Release-activation readiness — **NOT READY**

Two hard prerequisites remain open and both are outside this session's authorization: the `staging` environment with its three secrets and `RENDER_SERVICE_ID` must be created (B-2, API-verified absent); Render auto-deploy's state must be confirmed and disabled if it would race the pipeline (not verified). ~~B-1 must be fixed~~ **(done)**. Until B-2 is resolved, `workflow_dispatch` (the only path reachable without a develop push) cannot succeed either, because `validate` fails at `release.yml:275-320`.

**[v1.1] NOT READY — and the reasons are now better understood.** `d05b29e` changed no prerequisite; it removed two of the hazards that would have made the *first* activation unsafe once they are met, and it corrected a diagnostic that would have misled the person approving that run (F-4). Two additions to this verdict, both from the follow-on audit: (1) **environment protection rules are now the only human gate**, because the input that looked like one is gone — creating `staging` *with a required reviewer before merging* is the recommended posture so the merge cannot auto-create it unprotected; (2) a successful dispatch **is** a live release (migrate → seed → deploy → health check) with no dry-run mode, and the `commit_sha` description now says so.

### 10.4 Staging end-to-end verification — **NOT PERFORMED, NOT AUTHORIZED**

Required to close the loop, in order: (1) eligible `push` to `develop` after the B-1 fix, proving the `workflow_call` handoff and the permission intersection on a real runner; (2) one authorized `workflow_dispatch` release with an exact SHA; (3) observe `database-release` (migrate → seed → ledger) against staging; (4) observe Render trigger → poll → `.commit.id` equality; (5) observe `/v1/readyz` 200; (6) exercise a deliberate failure (e.g. an unreachable `readyz`) to confirm the summary reports "database migrated, deploy failed" and that no rollback is attempted. None of these steps has been run; no result from them may be inferred from PR CI.

### 10.5 Production readiness — **NOT READY AND OUT OF SCOPE**

This pipeline targets **staging only**: staging secrets (`:425-428`), a staging service URL (`:742`), no approval gate (§SEC-12, §9.2 "no protection rules"), no rollback, no canary or traffic shift, no monitoring hooks, and no production path in either workflow. A production release would need environment protection with required reviewers, a separate `production` workflow with its own concurrency group, SHA-pinned actions, an allowlist, and a tested migration-forward-only failure story. Claiming production readiness from run #422 would be unsupported, and no document in this PR makes that claim (they explicitly say otherwise — §3.8).

### 10.6 Hardening verification (v1.1)

The R-1 / F-1 / F-4 remediation is documented in full in `docs/deployment/PR-106-WORKFLOW-SAFETY-HARDENING-REPORT.md` — root causes, exact diffs with line references, the concurrency design and its limits, the F-1 decision, the F-4 correction with runtime evidence, the test results, and the remaining risk classification.

**Hosted CI for that work is now recorded, not assumed.** Because the code commit and the documentation commit went up in one push, GitHub raised a single run for the pair: **run #429**, `pull_request` / `synchronize`, head `87f558958e68ca50b2d4c5cae532a38f34b67f98` (parent `d05b29e…`, the hardening itself), **conclusion `success`**, 19m 20s — https://github.com/nabeel2323/scs-platform/actions/runs/41984518789. Nine mandatory jobs passed (`Lint & Typecheck`, `Mobile`, `Unit Tests + Coverage Gates`, **`Integration Tests`**, `Migration Full Apply`, `Boundary Lint (E6)`, `Build`, `Container Build & Smoke Test`, `Contract Spec & Codegen`); `k6 Smoke Test` and `Trigger Staging Release` skipped as designed. There is **no separate run for `d05b29e`**, and run #428 (`6a90126`, pre-hardening) is the control rather than the verification. Job-by-job results and the explicit statement of what #429 does *not* prove are in the hardening report, §9–§9.2.

Two effects on this report's verdicts. First, the local integration gap left open by the hardening session (Docker daemon down) is closed by the hosted `Integration Tests` pass at this head. Second, **F-5 is still open**: `Trigger Staging Release` skipped, so the five `release.yml` jobs — including the rewritten stale-release step — have still never executed anywhere, and #429 must not be read as staging verification.

Fresh PR state at the time of writing (same API read, 2026-11-05): `state: open`, `merged: false`, `mergeable: true`, `mergeable_state: clean`, base `develop` at `b11638b` (the unchanged v2.1 base commit), head `87f5589`, 18 commits / 24 files. So §10.2's "technically mergeable" clause still holds at the new head — the conditions on merging are the owner actions in §10.3, not anything in the diff.

---

## 11. Prohibited-action confirmation

Explicitly, for the record: during this review **no merge** of PR #106 was performed (state remains `open`, `merged: null`); **no push** to `develop` or `main` occurred (HEAD is still `fc12499…` on `feature/automated-release-pipeline-v2.1`); **no staging deployment** was triggered (zero `release.yml` executions — §4.2); **no database migration or seed** was executed against staging and **no staging database was modified** (the only databases used are disposable Testcontainers/CI containers, §7); **no GitHub secrets or variables were configured** (the `staging` environment still returns 404 — §9.1/B-2); **no Render setting was read or changed** and auto-deploy was not disabled; **no force-push and no history rewrite** was performed; unrelated working-tree changes belonging to another workstream (8 tracked files under `apps/api/src/modules/returns/` and `docs/production/`) were left **unstaged and untouched**.

---

## 12. Evidence index

| Claim | Reproduce with |
| --- | --- |
| 48/48 structural checks | `cd apps/api && node scripts/validate-workflow-structure.mjs` |
| 88 unit release-pipeline specs (7 files) | `cd apps/api && npx vitest run src/__tests__/unit/release-pipeline` |
| 8 integration ledger specs | `cd apps/api && npx vitest run src/__tests__/integration/release-pipeline` |
| 55 migration-safety specs | `cd apps/api && npx vitest run src/__tests__/integration/release-pipeline src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts src/__tests__/integration/migration-lock.postgres.spec.ts` |
| 0 type errors / clean lint / 432-file build | `npx tsc --noEmit -p tsconfig.json` · `npx eslint src/__tests__/{unit,integration}/release-pipeline scripts/validate-workflow-structure.mjs` · `npx nest build` |
| PR state, head, base, mergeability | `GET /repos/nabeel2323/scs-platform/pulls/106` |
| Run #422 job-by-job + totals | `GET /repos/…/actions/runs/41813462727/jobs` (log of job 126519472898 contains `Test Files 199 passed / 6 skipped (205)`, `Tests 4045 passed / 91 skipped (4136)`) |
| Absent `staging` environment / empty vars+secrets | `GET /repos/…/environments`, `GET /repos/…/environments/staging`, `GET /repos/…/actions/variables`, `GET /repos/…/actions/secrets` |
| B-1 env-name mismatch | `grep -n DATABASE_URL .github/workflows/release.yml` (only `STAGING_DATABASE_URL` hits) vs `apps/api/infra/drizzle/migrate-pg.ts:26-29` |
| Only `db:migrate` + `db:seed` executed | `grep -nE "db:(seed|migrate|reset|demo|bootstrap)" .github/workflows/release.yml` |
| 65 migration files | `ls infra/drizzle/migrations/*.sql \| wc -l` |

*Prepared as a mandatory PR #106 deliverable. Report version v1.0, 2026-11-04. Supersedes nothing; complements `IMPLEMENTATION-REPORT-V2.1.md` (what was built), `SECURITY-AUDIT-AND-REMEDIATION-REPORT.md` (the remediation log) and `REMEDIATION-FINAL-REPORT.md` (the closure record). This report adds the two activation blockers (B-1, B-2) and the five-segment readiness verdict, which none of them contained.*
