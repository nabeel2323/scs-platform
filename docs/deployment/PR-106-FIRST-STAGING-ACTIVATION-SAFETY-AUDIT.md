# PR #106 — First Staging Activation Safety Audit

**Report version:** v1.1 (v1.0 = the audit; v1.1 adds the remediation status of F-1/F-2/F-4 and R-1/R-3/R-4 — see §15. No v1.0 finding, citation or evidence tag has been altered.)
**Date:** 2026-11-04 (audit) · 2026-11-05 (remediation addendum, §15)
**Repository:** `nabeel2323/scs-platform`
**PR:** https://github.com/nabeel2323/scs-platform/pull/106
**Branch:** `feature/automated-release-pipeline-v2.1`
**Base:** `develop`
**Workflow code audited at SHA:** `303ff064b506d365082eccc3d11a4f80914239f7`
**This report committed & verified at SHA:** `eed728dafd2dfcd3e6f6c8bafdc05792f6236d98` (hosted CI run #427, §7.1)
**Remediation commit (code, §15):** `d05b29e12443a20572d48f95c66c279080ca0264` — R-1, F-1, F-4
**Scope:** First controlled staging activation safety. Analysis and documentation only — nothing in this session merged, deployed, configured an environment, or touched staging data.

---

## 0. Method and evidence classes

Every statement below is tagged with how it was established:

| Tag | Meaning |
|-----|---------|
| **[CODE]** | Read directly from the workflow file at the audited SHA, cited as `file:line`. |
| **[API]** | Retrieved in this session from the public GitHub REST API (read-only, unauthenticated — the repository is public, `private: false`). |
| **[RUN]** | Observed from a real hosted Actions run in this repository. |
| **[DOC]** | GitHub's own published documentation. |
| **[INFER]** | Reasoned from the above, not directly observed. Flagged wherever used. |
| **[NOT VERIFIED]** | Could not be established with the access available in this session. |

This audit deliberately did **not** trust the preceding reports (`PR-106-FINAL-REVIEW-AND-RELEASE-READINESS-REPORT.md`, `PR-106-B1-REMEDIATION-AND-VERIFICATION-REPORT.md`, `PR-106-CI-VERIFICATION-AND-BRANCH-SYNCHRONIZATION-REPORT.md`) as descriptions of current workflow behavior. All trigger and gate logic was re-derived from the workflow files themselves. Where a prior report's claim differs from the code or from the hosted data, the divergence is recorded in §9.

---

## 1. Headline answer

**Merging PR #106 into `develop` does automatically start a staging release attempt.** There is no human approval gate in the workflow code on that path. **[CODE]**

The attempt is currently **guaranteed to stop before touching the staging database or Render**, for exactly one reason: the `staging` GitHub environment does not exist, so all four required configuration values resolve to empty and `validate` exits non-zero at `release.yml:296-304`. **[CODE] + [API]**

That is a *fail-safe*, not a *feature gate*. The moment the owner configures `staging` with the three secrets and one variable, **every future push to `develop` — including any merge commit — becomes a live staging release with migrations, seed, and a Render deploy, with no approval step.** The merge is therefore only inert while blocker B-2 remains open, or once the owner adds environment protection rules.

---

## 2. Exact workflow trigger analysis

### 2.1 What can start `release.yml`

`release.yml:34-70` declares exactly two triggers. **[CODE]**

| Trigger | Lines | Condition to proceed |
|---|---|---|
| `workflow_call` | `release.yml:44-57` | Must be invoked by another workflow. Required string inputs: `commit_sha`, `ci_run_id`, `ci_run_url`. |
| `workflow_dispatch` | `release.yml:60-70` | Manual run. Required input: `commit_sha`. Optional input: `skip_confirmation` (see §8, finding F-1 — it is never read). **[REMEDIATED `d05b29e`: `skip_confirmation` deleted; `commit_sha`'s description now states the dispatch is a real release — §15.2]** |

There is **no `push`, no `pull_request`, no `workflow_run`, no `repository_dispatch`, and no `schedule`** trigger anywhere in `release.yml`. Verified by reading the whole `on:` block and by grepping every workflow file for trigger keys — the only matches for `workflow_run`, `repository_dispatch`, and `schedule:` are inside prose comments (`release.yml:9`, `:10`, `:36`). **[CODE]**

The only caller is `ci.yml:535` (`uses: ./.github/workflows/release.yml`). Grepping `.github/` for `release.yml` returns only that call site plus comments (`ci.yml:26`, `ci.yml:508`) — no other workflow invokes or triggers it. **[CODE]**

Two paths exist, therefore:

```
Path A (automated):  push to develop → ci.yml → [8 gates] → trigger-staging-release
                     (ci.yml:518-540, if: event=='push' && ref=='refs/heads/develop'
                      && repo=='nabeel2323/scs-platform')
                     → uses: release.yml (workflow_call)

Path B (manual):     Actions UI → "Staging Release" → workflow_dispatch
                     (release.yml:60-70) → validate → …
```

### 2.2 Which `ci.yml` event conditions matter

`ci.yml:12-16` triggers on `push` to `[main, develop]` and `pull_request` to `[main, develop]`. **[CODE]**

`ci.yml:522-525` gates the release call to a push to `develop` in this repository only. Consequently: **[CODE]**

- A `pull_request` run **never** reaches the release path. This is directly observable in the hosted data: run #425 lists `Trigger Staging Release` as `skipped` on a `pull_request` event. **[RUN]**
- A `push` to `main` **never** reaches the release path (the `if` requires `refs/heads/develop`). Promotion to `main` cannot trigger a staging release. **[CODE]**
- A fork PR cannot trigger it either (`github.repository` equality check). **[CODE]**

### 2.3 The state of `develop` right now

Queried in this session against the `develop` ref: **[API]**

| Path on `develop` | HTTP | Meaning |
|---|---|---|
| `.github/workflows/ci.yml` | 200 | Present; contains **no** `trigger-staging-release` job and **no** `uses: ./.github/workflows/release.yml`. |
| `.github/workflows/release.yml` | **404 Not Found** | The release workflow does not exist on `develop` at all today. |

This is the single most important structural fact for the merge question: PR #106 is the commit that introduces *both* the release workflow and the wiring into `develop`'s CI. GitHub Actions resolves the workflow file — and a path-referenced reusable workflow — from the commit that produced the event. So the **merge commit itself** is the first commit whose `develop` CI run contains `trigger-staging-release`, and it is the run that will invoke the release. **[CODE] + [INFER]** (the [INFER] part is the standard "workflow file comes from the event's commit" resolution rule; it has never been exercised on `develop` in this repo, so there is no in-repo runtime evidence for it yet.)

---

## 3. Merge-trigger behavior — what actually happens when PR #106 is merged

Predicted sequence, step by step, from the code at `303ff06`:

1. Merge creates a commit on `develop` → `ci.yml` runs with `event_name == 'push'`, `ref == 'refs/heads/develop'`. **[CODE]**
2. All CI jobs execute except `k6-smoke`, which is `if: github.ref == 'refs/heads/main'` (`ci.yml:365`) and is skipped on `develop`. `boundary-lint` runs but is advisory (`continue-on-error` on its lint step, `ci.yml:92-93`) and is **not** in the release `needs` list. **[CODE]**
3. If — and only if — all eight mandatory gates succeed, `trigger-staging-release` runs (`ci.yml:526-535`). If any gate fails **or is cancelled**, it is skipped without an `if: always()`, so no release happens. Observed live on run #424: `Container Build & Smoke Test` was `cancelled` → `Trigger Staging Release` recorded `skipped` at the same timestamp. **[RUN]**
4. `release.yml` executes as a called workflow inside that same run, starting with `validate` (the only root job). **[CODE]**
5. `validate` declares `environment: staging` (`release.yml:121`). Because that environment does not exist today, GitHub creates it implicitly on first use — *"Running a workflow that references an environment that does not exist will create an environment with the referenced name… the newly created environment will not have any protection rules or secrets configured."* **[DOC]** So the merge will silently create a `staging` environment with no protection rules. **[INFER]**
6. The event/ref/repo/SHA assertions pass trivially on a develop push (`release.yml:215-241`).
7. The secret and variable presence check then fails: `RENDER_API_KEY`, `STAGING_DATABASE_URL`, `STAGING_PGSSLROOTCERT_PEM` all resolve empty and `RENDER_SERVICE_ID` is unset → `exit 1` at `release.yml:296-304` (secrets) or `release.yml:314-318` (variable). **[CODE]**
8. `database-release` (`needs: validate`, `release.yml:328`, no `if`) is **skipped**. No migration, no seed, no ledger write. `deploy` (`needs: [validate, database-release]`, `release.yml:526`) is skipped. No Render API call. `health-check` (`release.yml:737`) is skipped. **[CODE]**
9. `summary` (`needs:` all four, `if: always()`, `release.yml:776-777`) runs and writes "❌ Release Failed" with the per-job results. **[CODE]**

**Net effect of merging today:** one failing `Validate Release Trigger` job appended to the `develop` CI run, an implicitly created unconfigured `staging` environment, and zero staging data or deployment impact.

**Net effect of merging after B-2 is configured:** a real staging release — migrations applied, RBAC seed run, Render deployed — automatically, with no human in the loop.

---

## 4. Job execution conditions (per-job gate matrix)

| Job | Declaration | Runs when | Can mutate staging DB? | Can deploy? |
|---|---|---|---|---|
| `validate` | `release.yml:116-121`; `environment: staging`; job env `RENDER_SERVICE_ID: ${{ vars.RENDER_SERVICE_ID }}` (`:125-126`) | First and only root job; runs for both Path A and Path B. No `if:`. Guarded by any `staging` protection rules. | No — read-only checks and `gh run list` only. | No |
| `database-release` | `release.yml:325-329`; `needs: validate`; `environment: staging`; no `if:` | **Only** if `validate` succeeded **and** the environment's protection rules (if any) are approved. | **Yes** — migrate (`:481`), seed (`:493`), ledger verify (`:510`). | No |
| `deploy` | `release.yml:523-532`; `needs: [validate, database-release]`; `environment: staging`; no `if:` | Only if both `validate` and `database-release` succeeded. | No | **Yes** — Render `POST /deploys` (`:560-567`), poll, SHA verify. |
| `health-check` | `release.yml:734-737`; `needs: [validate, deploy]`; `environment: staging` | Only if `deploy` succeeded. | No | No — GET `https://scs-api-staging.onrender.com/v1/readyz` (`:743`). |
| `summary` | `release.yml:773-777`; `needs:` all; `if: always()` | Always, after the rest reach terminal state. | No | No |

The chain `validate → database-release → deploy → health-check` is enforced purely by `needs:` edges combined with GitHub's default skip-on-unmet-needs rule. Nothing in the DB or deploy jobs re-validates the CI gate; they trust `validate`'s outputs (`release.yml:338`, `:396`, `:546`, `:682`). **[CODE]**

---

## 5. Database and deployment safety gates

### 5.1 Gates that genuinely work

**G1 — `validate` precedes every mutation.** `database-release` has `needs: validate` and no `if: always()` (`release.yml:328`). A failed `validate` cannot be routed around. This is also structurally enforced by the repo's own validator check `validate-guard-precedes-database-release`. **[CODE]** (`apps/api/scripts/validate-workflow-structure.mjs`, PASS in §7.)

**G2 — Missing-configuration fail-fast inside `validate`.** `release.yml:275-320` builds a `MISSING` array and exits 1 listing the names only (`:296-304`), then separately checks `RENDER_SERVICE_ID` from the shell environment (`:314-318`). It prints `[PRESENT]`/`[REDACTED]`, never values (`:321-322`). **[CODE]**

**G3 — SHA binding.** Path A requires `inputs.commit_sha == github.sha` (`release.yml:236-241`) plus develop-reachability via `git merge-base --is-ancestor` (`:245-250`). Path B additionally requires a *successful* `ci.yml` run on `develop` for that exact SHA (`:190-204`). `database-release` then checks out the validated SHA explicitly (`ref: needs.validate.outputs.release_sha`, `:393-396`), and `deploy` passes that same SHA to Render as `commitId` (`:564-567`). **[CODE]**

**G4 — Deployed-code-equals-migrated-code assertion.** `release.yml:675-731` re-reads the Render deploy and compares `.commit.id` (not `.commitId`) to the expected SHA, failing the job on mismatch (`:724-731`). **[CODE]**

**G5 — Event/ref/repository fencing on the automated path.** `release.yml:215-226` rejects any non-`push` event, any ref other than `refs/heads/develop`, and any repository other than `nabeel2323/scs-platform`. Note `github.event_name` inside a called workflow is the **caller's** event, never the literal `workflow_call` — the file documents this correctly (`:128-131`) and the checks are consistent with it. **[CODE]**

**G6 — Terminal-state polling with explicit failure set.** `release.yml:651-661` treats `live` as success and `failed|build_failed|update_failed|pre_deploy_failed|canceled|deactivated` as failure, with a 600 s ceiling (`:608`) that exits 1 on timeout (`:671-673`). **[CODE]**

**G7 — Least privilege.** `release.yml:110-112` requests only `contents: read, actions: read`; `ci.yml:35-38` mirrors that plus `packages: read`. No job writes to the repository, and no `deployment: write` exists anywhere. **[CODE]**

### 5.2 Gates that are weaker than they appear

**W1 — No human approval anywhere in the code.** The only manual-confirmation control is the `skip_confirmation` dispatch input (`release.yml:66-70`), which is declared and never read (§8 F-1). The real approval surface is GitHub environment protection rules, which do not exist yet. **[CODE] + [API]** **[UPDATED by `d05b29e`: the dead input is gone, so the workflow no longer implies a code-level confirmation exists. Environment protection rules remain the only approval mechanism and remain an owner action — §15.2, §15.4.]**

**W2 — Stale-release detection is advisory by design.** `release.yml:332-391` never aborts; the policy is stated at `:80-83` and repeated at `:365-366` and `:384-387`, and a `gh` failure is swallowed by `|| QUEUED_RUNS=''` (`:361`) into a warning path (`:363-366`). It cannot prevent overlapping schema mutations; it only records that they are possible. **[CODE]** **[POLICY UNCHANGED by `d05b29e` — still advisory, still never blocks; what changed is which identifiers it compares and what it reports (§15.3). The hard serializer remains the PostgreSQL advisory lock in `migrate-pg.ts`.]**

**W3 — The `staging-release` concurrency group does not shield the release from its caller.** `release.yml:84-86` uses `group: staging-release`, `cancel-in-progress: false`. But `ci.yml:18-20` uses `group: ${{ github.workflow }}-${{ github.ref }}` with **`cancel-in-progress: true`**, and the release jobs execute *inside* the caller's run. A second push to `develop` therefore cancels the run that is hosting the in-flight release. See §8 F-2 and the live demonstration in §5.3. **[CODE] + [RUN] + [DOC]** **[FIXED IN CODE `d05b29e`: `ci.yml` now evaluates `cancel-in-progress` as `github.ref != 'refs/heads/develop'`, so a `develop` run — the only run that can host a release — is never superseded; `release.yml`'s group is a literal `staging-release` with `cancel-in-progress: false` + `queue: max`. §15.1.]**

**W4 — Repo-level secrets can satisfy the environment check.** GitHub documents that when a reusable-workflow job declares an environment, *"the caller workflow must still pass the secret"* via `secrets: inherit` (present at `ci.yml:540`), that *"if an environment secret shares a name with a repo/org secret, the environment secret takes precedence"*, and — critically — that a secret the caller never passed simply *"resolves to an empty string"* with no error. **[DOC]** `release.yml:39-43` relies on exactly this. The consequence: **repository-level** secrets with the same four names would let `validate` pass even with the `staging` environment unconfigured and unprotected. Whether any exist is `[NOT VERIFIED]` here — `GET /repos/…/actions/secrets` and `…/actions/variables` both returned **401 Requires authentication** (see §6.3). **[CODE] + [DOC] + [API]** **[NOT A CODE DEFECT — unchanged and unchangeable from the repository: this is GitHub's documented resolution order. Owner verification action, §15.4.]**

### 5.3 Live evidence for the cancellation mechanism

Run **#424**, `pull_request` on this branch, SHA `c4cf56e2` (jobs URL: `…/actions/runs/41826344794/jobs`). **[RUN]**

| Job | Conclusion | Started | Ended |
|---|---|---|---|
| Build | success | 12:16:21Z | 12:17:37Z |
| Contract Spec & Codegen | success | 12:16:21Z | 12:16:53Z |
| **Container Build & Smoke Test** | **cancelled** | 12:16:21Z | **12:26:52Z** |
| k6 Smoke Test | skipped | 12:17:37Z | 12:17:37Z |
| **Trigger Staging Release** | **skipped** | — | **12:26:52Z** |

Run #425 (same branch, group `CI-feature/automated-release-pipeline-v2.1`) was created at 12:25:29Z. Roughly 90 seconds later the older run's in-flight job terminated `cancelled` at 12:26:52Z, and `Trigger Staging Release` was recorded `skipped` at that identical timestamp. This is GitHub's documented behavior — *"To also cancel any currently running job or workflow in the same concurrency group, specify `cancel-in-progress: true`"* **[DOC]** — demonstrated in this repository.

Read two ways, both true and both important:

- **Reassurance:** an interrupted or failed gate cannot release. The `needs` graph skips the release.
- **Risk:** on `develop` the same mechanism can abort a release *while `database-release` is mid-migration*, because that job is not a separate run — it is a job of the `develop` CI run. The migration runner then leaves schema state that the next run must reconcile; the ledger verification at `release.yml:504-512` is the compensating control, not the concurrency config.

---

## 6. Part C — B-2 configuration readiness checklist

### 6.1 Names the workflow actually requires

| Kind | Exact name | Where consumed | Checked for presence |
|---|---|---|---|
| GitHub **environment** | `staging` | `release.yml:121`, `:329`, `:527`, `:738` (four `environment: staging` jobs) | Implicit — if absent, GitHub creates it unprotected **[DOC]** |
| **secret** | `RENDER_API_KEY` | `release.yml:277` (validate), `:542`, `:603`, `:677` (deploy) | `release.yml:284-286` |
| **secret** | `STAGING_DATABASE_URL` | `release.yml:278`, and bound as `DATABASE_URL` at `:428` for the migrate/seed/ledger calls | `release.yml:288-290` |
| **secret** | `STAGING_PGSSLROOTCERT_PEM` | `release.yml:279`, `:426` → written to a `600`-permission temp file (`:457-470`) | `release.yml:292-294` |
| **variable** | `RENDER_SERVICE_ID` | job-scoped at `release.yml:126` (validate) and `:532` (deploy); used in the Render URLs `:561`, `:624`, `:692` | `release.yml:314-318`, re-checked at `:550-553`, `:612-615`, `:684-687` |

No other secret or variable is referenced anywhere in `release.yml`. **[CODE]** (grep of the whole file: live `${{ secrets.* }}` interpolations occur only at `:277-279`, `:426-428`, `:542`, `:603`, `:677`; live `${{ vars.* }}` interpolations only at `:126` and `:532` — every other match for either string is inside a comment, e.g. `:43`, `:89`, `:93`, `:308-309`, `:529`.)

Note the deliberate design at `release.yml:88-93`: environment-scoped `vars` are bound at **job** scope, never workflow scope, because `${{ vars.* }}` for an environment is only reliably resolvable on a job that declares that environment. The validator enforces this (`no-workflow-scope-vars`, `has-job-scoped-vars-binding`). **[CODE]**

### 6.2 How the workflow detects missing configuration

`release.yml:275-320`, all inside the read-only `validate` job:

```
MISSING=()                                   # :282
if [ -z "$RENDER_API_KEY" ];            MISSING+=(…)   # :284-286
if [ -z "$STAGING_DATABASE_URL" ];      MISSING+=(…)   # :288-290
if [ -z "$STAGING_PGSSLROOTCERT_PEM" ]; MISSING+=(…)   # :292-294
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "✗ Missing required secrets:" ; … ; exit 1     # :296-304
fi
if [ -z "${RENDER_SERVICE_ID:-}" ]; then … exit 1     # :314-318
echo "✓ All required secrets and variables are configured"  # :320
```

Behavioral properties worth stating precisely:

- It tests for **emptiness**, not existence. A configured-but-blank secret fails; an absent one also fails (it interpolates to empty). **[CODE]**
- It reports **names only**, and prints `[REDACTED]` for the secret group (`:322`). No value is ever echoed. **[CODE]**
- It runs **before** any database mutation, which is what makes the fail-safe in §3 work. **[CODE]**
- `RENDER_SERVICE_ID` is checked in `validate` *and* re-checked in each `deploy` step, so a variable removed between jobs still fails loudly rather than calling `/services//deploys`. **[CODE]**
- The RBAC seed command is `db:seed` (`:493`) — the catalog/demo seeders (`db:seed:catalog`, `db:seed:catalog:demo`, `db:bootstrap:staging`) are **not** invoked by the pipeline. **[CODE] + [RUN]** (`apps/api/package.json`)

### 6.3 Presence verification — what this session could and could not confirm

| Query | HTTP | Result |
|---|---|---|
| `GET /repos/nabeel2323/scs-platform/environments` | 200 | 5 environments: `Preview – scs-platform-admin`, `Preview – scs-platform-web`, `Production`, `Production – scs-platform-admin`, `Production – scs-platform-web`. **None named `staging`.** |
| `GET /repos/nabeel2323/scs-platform/environments/staging` | **404** | **B-2 remains open.** |
| `GET …/actions/secrets` | 401 | Requires authentication — not verifiable in this session. |
| `GET …/actions/variables` | 401 | Requires authentication — not verifiable in this session. |
| `GET …/environments/staging/secrets` | 401 | Requires authentication (moot while the environment is 404). |
| `GET …/environments/staging/variables` | 401 | Requires authentication (moot). |

**[API]** — retrieved unauthenticated; the repository is public.

**Conclusion on configuration readiness:**

- `staging` environment: **ABSENT (verified 404).**
- The three staging secrets and `RENDER_SERVICE_ID`: **NOT VERIFIABLE here.** No token was available in this session (`gh` CLI absent from `PATH`; `GITHUB_TOKEN`/`GH_TOKEN` unset), and these endpoints require authentication. **No secret values were retrieved, printed, or modified at any point.**
- Logical inference: while `environments/staging` returns 404, **no environment-scoped** secrets or variables for `staging` can exist. So `validate` must fail today — *unless* repository-level namesakes exist (see W1/W4 in §5.2), which the owner should confirm with one authenticated click: **Settings → Secrets and variables → Actions → repository-level Secrets and Variables**, and verify that none of the four names is defined at repository level.
- Prior-report claim: `PR-106-CI-VERIFICATION-AND-BRANCH-SYNCHRONIZATION-REPORT.md:203-204` records `GET …/actions/secrets` → empty and `…/actions/variables` → `total_count: 0` from an earlier authenticated session. That is **inherited evidence, not re-verified in this session** — see §9 D-3.

### 6.4 Render auto-deploy prerequisite (tracked separately; NOT changed here)

This is an **independent activation path that lives entirely outside GitHub Actions** and therefore outside every safety gate analyzed above.

- There is **no `render.yaml`** or equivalent Render-as-code file in the repository (searched the repo root and `infra/`; `infra/deploy/` contains only `README.md`, `admin.Dockerfile`, `api.Dockerfile`, `ci-postgres.Dockerfile`, `nginx.conf.template`, `web.Dockerfile`). **[CODE/RUN]** Render's deploy behavior is configured in the Render dashboard and is **`[NOT VERIFIED]`** from here.
- The container image itself is safe by construction: `infra/deploy/api.Dockerfile:115` is `CMD ["node", "apps/api/dist/main.js"]` — the API does **not** self-migrate on boot. **[CODE]**
- But the older deployment doc records that a Render **pre-deploy command** of `pnpm --filter @scs/api db:migrate && pnpm --filter @scs/api db:seed` was the intended staging/production path, triggered by *"Render auto-deploy"* (`docs/deployment/API-STARTUP-MIGRATION-SEPARATION-VERIFICATION.md:160-172`), listed as **"TO BE ADDED"** (`:265`).
- The v2.1 architecture doc states the requirement in capitalised terms: *"CRITICAL: Render auto-deploy must be manually disabled before using the release workflow"* (`docs/deployment/AUTOMATED-RELEASE-PIPELINE-ARCHITECTURE-V2.1.md:1438`), with the rationale that auto-deploy *"triggers on every push to linked branch"*, can *"start before migration completes"* (`:1441-1444`), and otherwise *"will conflict with automatic deployments, causing race conditions and potential schema/code mismatches"* (`:1458`).

**Why this matters more than it looks.** If the staging Render service auto-deploys on `develop`:

1. The merge itself deploys staging **immediately and independently of B-2** — GitHub Actions never has to run.
2. If a Render pre-deploy command runs `db:migrate`, the merge also mutates the staging schema **without** the pipeline's ledger verification or SHA binding.
3. Two deploys can then race the pipeline's own, and `release.yml:724-731` will fail the release on SHA mismatch — the failure is loud rather than silent, but the mutation has already happened.

**Owner prerequisite (before any merge that is meant to be inert):** confirm in the Render dashboard that the staging service's auto-deploy for the linked branch is **disabled**, and record whether a pre-deploy command is configured. No Render setting was changed in this session.

---

## 7. Verification performed (Part E)

All commands run locally at `303ff06` on 2026-11-04. **[RUN]**

| Check | Command | Result |
|---|---|---|
| Workflow structural validator | `node apps/api/scripts/validate-workflow-structure.mjs` | **56/56 checks passed**, including `validate-guard-precedes-database-release`, `stale-detection-allows-complete`, `db-step-order-migrate-seed-ledger`, `no-workflow-scope-vars` |
| Release-pipeline unit tests | `npx vitest run src/__tests__/unit/release-pipeline` (in `apps/api`) | **7 files / 92 tests passed**, 0 failed, 6.47 s |
| Migration-ledger integration test (Testcontainers + Docker) | `npx vitest run --no-file-parallelism src/__tests__/integration/release-pipeline/verify-migration-ledger.spec.ts` | **1 file / 8 tests passed**, 0 failed, 24.15 s |
| YAML/trigger audit | read of both workflow files + grep for `workflow_run`, `repository_dispatch`, `schedule:`, `release.yml`, `skip_confirmation` | No hidden trigger path found |
| Hosted CI reconciliation | `GET …/actions/runs/41829149254[/jobs]`, `…/41826344794/jobs` | Run #425 = 11 jobs: 9 success, 2 skipped, 0 failures |
| Environment/secret presence | `GET …/environments`, `…/environments/staging`, `…/actions/secrets`, `…/actions/variables` | 404 for `staging`; 401 (auth required) for secrets/variables |

Unit suites executed: `workflow-structure` (14), `manual-sha-validation` (19), `render-api` (19), `ssl-certificate-handling` (19), `workflow-trust-boundary` (10), `stale-release-detection` (7), `stale-release-helper` (4).

**Limitation.** These tests assert *workflow structure* and *helper logic*; they parse the YAML and exercise mirrored `.mjs` helpers (`validate-workflow-structure.mjs`, `validate-release-sha.mjs`, `detect-stale-release.mjs`). They do not execute GitHub Actions semantics. No claim in this report about runtime behavior (environment auto-creation, `needs`-skip, caller cancellation, secret resolution) rests on them; each such claim cites **[CODE]**, **[RUN]**, or **[DOC]**.

### 7.1 Post-commit hosted CI verification (Part E, recorded after push)

The documentation changes in this audit were committed as **`eed728dafd2dfcd3e6f6c8bafdc05792f6236d98`** (`docs(release): add first staging activation safety audit and correct CI job counts`, 2 files, +455/−1) and pushed to `feature/automated-release-pipeline-v2.1`. PR #106 head moved from `303ff06` to `eed728d`; state `open`, `mergeable: true`, 15 commits. **[RUN] + [API]**

**Resulting PR-head run — exact record:**

| Field | Value |
|---|---|
| Run ID | **41866322375** |
| Run number | **#427** |
| URL | https://github.com/nabeel2323/scs-platform/actions/runs/41866322375 |
| Workflow | CI |
| Event | `pull_request` |
| Head SHA | `eed728dafd2dfcd3e6f6c8bafdc05792f6236d98` |
| Head branch | `feature/automated-release-pipeline-v2.1` |
| Status / conclusion | completed / **success** |
| Created | 2026-11-04T16:20:58Z |
| Last job completed | 2026-11-04T16:39:44Z (**18.7 min** job-span; 2 jobs started 16:21:01Z) |
| Jobs | **11 total — 9 success, 2 skipped, 0 failures** |

| Job | Conclusion |
|---|---|
| Lint & Typecheck | success |
| Mobile (flutter analyze · test) | success |
| Unit Tests + Coverage Gates | success |
| Migration Full Apply | success |
| Boundary Lint (E6) | success |
| Integration Tests | success |
| Contract Spec & Codegen | success |
| Build | success |
| Container Build & Smoke Test | success |
| k6 Smoke Test | skipped (main-only, `ci.yml:365`) |
| Trigger Staging Release | **skipped** (`if` at `ci.yml:522-525` requires a develop push) |

Two points from this run are directly relevant to the audit's conclusions:

1. **`Trigger Staging Release` = `skipped` on a `pull_request` event** reconfirms §2.2 on the current code — documentation-only pushes to this branch cannot reach the release path.
2. **The 11 / 9 / 2 shape reproduces on run #426 as well** (`41858810259`, SHA `303ff064`, completed success, same 9 success + 2 skipped), which independently corroborates the Part A correction: the "7 success" summary line was wrong, the table was right, and neither run ever executed a release job.

Note on API observation: the run-level `status` field reported `queued` for ~13 minutes while jobs were already executing (earliest job start `16:21:01Z`). Any CI watcher that polls only the run object may therefore misjudge timing; job-level timestamps are authoritative. This was checked, not assumed. **[RUN]**


---

## 8. Findings

**F-1 — `skip_confirmation` is dead input (medium, governance).** Declared at `release.yml:66-70` as "Skip manual confirmation (use with caution)", default `false`. Grepping all of `.github/` finds it **only** at its declaration — no step, expression, or `if:` reads `inputs.skip_confirmation`. Confirmed positively: the only `inputs.*` reads in the entire file are `commit_sha` (`:161`, `:228`), `ci_run_id` (`:253`, `:256`) and `ci_run_url` (`:254`, `:257`). There is therefore **no in-workflow confirmation step to skip**, and the input's presence implies a protection that does not exist. The structural validator has no guard for this (its only dispatch-related check is `release-has-workflow_dispatch`, `apps/api/scripts/validate-workflow-structure.mjs:118`, which merely asserts the trigger exists). Recommend: either implement the gate (require an explicit confirmation token in `validate`) or delete the input so the UI stops advertising a safety that isn't there.

**→ REMEDIATED IN CODE, `d05b29e` (deletion route): the input is deleted, `commit_sha`'s description states the dispatch is a real release, and two validator checks (`release-no-skip-confirmation-input`, `dispatch-inputs-all-consumed`) plus a negative control keep it dead. Environment protection rules are documented as the approval mechanism. Detail: §15.2.**

**F-2 — The release inherits `ci.yml`'s `cancel-in-progress: true` (high, but currently theoretical).** See §5.2 W3 and §5.3. A merge to `develop` followed quickly by a second `develop` push can cancel `database-release` mid-migration; `release.yml:84-86` cannot prevent it because the jobs live in the caller's run. Mitigations available to the owner: avoid stacking `develop` pushes during the first activations; or scope `cancel-in-progress` so it never applies to `refs/heads/develop` runs that have reached the release job (a workflow change, out of scope here); or rely on the advisory-lock + ledger-verification pair at `release.yml:479` and `:504-512` to make a resumed run converge.

**→ FIXED IN CODE, `d05b29e`: the second mitigation is now implemented — `ci.yml` evaluates `cancel-in-progress: ${{ github.ref != 'refs/heads/develop' }}`, so the run that can host a release is never superseded by a newer push, while feature/PR runs keep cancelling. The risk is no longer theoretical in the other direction either: the `develop` exemption is asserted by 8 validator checks and 3 negative controls. Residual limits (§15.1, §15.5): cancellation of the *callee* run on Path B, and the unresolved R-3. Detail: §15.1.**

**F-3 — Merging silently creates an unprotected `staging` environment (medium).** Per **[DOC]**, referencing a nonexistent environment auto-creates it with no protection rules and no secrets. The merge's own CI run will produce a `staging` environment that is *visible as configured* in Settings while offering no protection, and any later secrets added to it will be live immediately. Recommend: create and configure `staging` **with required reviewers** *before* the merge, so the environment is never auto-created unprotected.

**→ NOT A CODE DEFECT — owner action, unchanged by `d05b29e` (this session created and modified no environment). It remains a prerequisite of the merge; runbook step 2. Detail: §15.4.**

**F-4 — Stale-release check misbehaves on the dispatch path (low).** `release.yml:339-340` reads `github.run_number` of *this* run, and on a `workflow_dispatch` run of `release.yml` that is release.yml's own counter — while `:356-361` lists `ci.yml` run numbers (currently in the 420s). The comparison at `:372` is therefore apples-to-oranges on Path B and will usually print "NEWER RELEASE(S) QUEUED" spuriously. Harmless in effect (the policy never aborts, `:384-387`) but it produces misleading audit output during exactly the run where a human is watching. On Path A the comment at `:346-352` is correct: the identifiers belong to the caller.

**→ FIXED IN CODE, `d05b29e`: the step now branches on `$EVENT_NAME` and compares like with like — Path A keeps `runNumber` against caller `ci.yml` runs, Path B orders by repository-wide `databaseId` and reads both `release.yml` and `ci.yml:develop` runs. The advisory-only policy is untouched. Proven at runtime, not only structurally: on a fabricated run population the pre-fix expression reports 2 newer releases while Path B correctly reports none. Detail: §15.3.**

**F-5 — No in-repo runtime evidence exists for the release path at all (informational, but decisive for how confident we may be).** `develop` has never contained `release.yml` (**[API]** 404), and every PR run shows `Trigger Staging Release` = `skipped` (**[RUN]** #424, #425). So `validate`, `database-release`, `deploy`, `health-check` and `summary` have **never executed**. The merge commit will be the first real test of all four gates, on production-adjacent infrastructure. This is the core argument for the staged sequence in §10.

---

## 9. Divergences from prior reports

**D-1 (corrected in this session).** `PR-106-CI-VERIFICATION-AND-BRANCH-SYNCHRONIZATION-REPORT.md:112` stated "9 jobs completed, 7 success, 2 skipped" while its own table listed 11 jobs (9 success + 2 skipped). The hosted run confirms **11 jobs, 9 success, 2 skipped, 0 failed**. The table was right; the summary line was wrong. Corrected in place with the API evidence and run number **#425**; run ID, SHA, URL and all per-job rows preserved unchanged.

**D-2 (corrected in this session).** The same report (`:92`) attributed run #424's `cancelled` conclusion to "an infrastructure or timeout issue". The hosted job timestamps show it was the documented `cancel-in-progress` supersession by run #425 (see §5.3). A factual correction was added rather than the original narrative.

**D-3 (flagged, not corrected).** `:203-204` reports empty repository-level secrets and `total_count: 0` variables from an earlier authenticated session. Not reproducible here (401). Owner should re-confirm before merge — it is the difference between "the release cannot start" and "the release could start with an unconfigured environment" (§6.3, W4).

**D-4 (agreement).** The prior report's merge verdict "CONDITIONAL; ready to merge after B-2 resolution" (`:245`) understates the mechanism: merging *before* B-2 is the inert option, not merely the misleading one, because `validate` fails closed. It also omits F-1 through F-5 entirely. §10 supersedes that recommendation.

---

## 10. Answers to the audit questions

**1. Does merging PR #106 automatically start a staging release?**
**Yes** — an attempt starts automatically, unconditionally, on the merge commit's own `develop` CI run, once the eight mandatory gates pass (`ci.yml:518-540`). It **cannot complete** today because `staging` configuration is absent and `validate` fails closed (`release.yml:296-304`, `:314-318`). It **will complete** the moment B-2 is configured, with no approval step. **[CODE] + [API]**

**2. Which jobs execute on the resulting `push` event?**
In `ci.yml`: `lint`, `boundary-lint` (advisory), `test-unit`, `test-integration`, `migration-gate`, `test-contract`, `build`, `mobile`, `container-build`, then `trigger-staging-release`; `k6-smoke` is **skipped** (`ci.yml:365`, main-only). If all eight `needs` gates succeed, the nested `release.yml` jobs run in the same attempt: `validate` → `database-release` → `deploy` → `health-check`, plus `summary` (`if: always()`). If any gate fails, is cancelled, or `validate` fails, all four staging-mutating jobs are **skipped**. **[CODE] + [RUN]**

**3. Does `validate` execute before any database operation?**
**Yes.** `database-release` declares `needs: validate` with no `if:` (`release.yml:328`), so it is skipped unless `validate` succeeds, and every DB call lives inside `database-release` (`:481`, `:493`, `:510`). Enforced as structure by the `validate-guard-precedes-database-release` validator check. **[CODE]**

**4. Under what exact conditions can `database-release` execute?**
All of: (a) `release.yml` was started at all — Path A (`push` + `refs/heads/develop` + `nabeel2323/scs-platform` + all eight CI gates green) or Path B (manual `workflow_dispatch`); (b) `validate` **succeeded**, which requires the SHA to be 40-hex, to exist, to be develop-reachable, on Path B to have a *successful* `ci.yml` run on `develop` for that exact SHA (`:190-204`), on Path A to equal `github.sha` and be a `push` to `develop` in this repo (`:215-241`), and that **all three secrets and `RENDER_SERVICE_ID` are non-empty** (`:296-318`); (c) any `staging` environment protection rules are satisfied — today there are none because the environment doesn't exist; (d) it is not cancelled before starting. **[CODE]**

**5. Under what exact conditions can the Render deployment job execute?**
Only if **both** `validate` and `database-release` reached `success` (`needs: [validate, database-release]`, `release.yml:526`, no `if:`), plus environment protection rules satisfied, plus `RENDER_SERVICE_ID` resolvable in the job (checked at `:550-553` before the API call, again at `:612-615` and `:684-687`), and `RENDER_API_KEY` present at `:542`. It then `POST`s `/services/{id}/deploys` with the release `commitId` (`:560-567`) and fails the job if the deployed `.commit.id` ≠ expected SHA (`:724-731`). Note: **no CI verification of its own** — it trusts the upstream chain. **[CODE]**

**6. Can a `workflow_dispatch` run be performed safely without triggering unintended deployment?**
**Not as a dry run.** On Path B, a dispatch whose SHA is develop-reachable and has a green develop CI run satisfies `validate` entirely; once B-2 is configured, that single dispatch is a **full live release** — migration, seed, Render deploy, health check. Today it fails closed only because configuration is missing. And because `skip_confirmation` is dead (F-1), there is no code-level confirmation to lean on.
**Safe dispatch is achievable only via environment protection rules:** add a required reviewer to `staging`. Because **all four** staging jobs declare `environment: staging` (`:121`, `:329`, `:527`, `:738`), each one pauses for approval independently — so approving `validate` lets you inspect the SHA/secret verdicts and then decide whether to approve `database-release`, then `deploy`. That is the only true per-stage human gate available without a code change. **[CODE] + [DOC]**

**7. Is there a safe way to merge the code without immediately activating the release?**
**Yes — two controls, either sufficient, both owner-side, no code change required:**
- **Merge while B-2 stays open.** The release attempt fails inside `validate` before any mutation (§3). Caveat F-3: the merge then auto-creates an unprotected `staging` environment, and the run shows a red `Validate Release Trigger` job on `develop` that everyone must learn to interpret as expected-not-broken.
- **Stronger, recommended:** first create `staging` **with a required reviewer and no secrets**, then merge. Nothing runs unattended; the run pauses at `validate` awaiting a human; and no mutation is reachable without an explicit approval you control.
- **Do not** add the four secrets to `staging` before the merge if you want the merge to stay inert. **Do not** add them at **repository** level at all (W4) — that defeats the environment-based gate and the protection rules.
- Independent of both: **Render auto-deploy must be confirmed disabled first** (§6.4), otherwise the merge activates staging through Render no matter what GitHub Actions does.

**8. Any concurrency, duplicate-deployment, or auto-deploy race conditions?**
Yes, four, ranked:
- **R-1 (high):** `ci.yml` `cancel-in-progress: true` on `CI-<ref>` can cancel the `develop` run mid-`database-release`, since the release jobs are part of that run (`ci.yml:18-20` vs `release.yml:84-86`). Demonstrated mid-flight on run #424 (§5.3). **[CODE] + [RUN] + [DOC]** → **fixed in code, `d05b29e` (§15.1).**
- **R-2 (high, external):** Render auto-deploy on the linked branch is a second, ungated deploy trigger; if a Render pre-deploy `db:migrate` is also configured, it is a second, ungated schema mutation. Both race the pipeline's SHA-pinned deploy. **[NOT VERIFIED]** — must be confirmed in the Render dashboard (§6.4). → **owner action; no code change can reach it (§15.4). Still the highest unresolved risk.**
- **R-3 (medium):** No anti-overlap control actually stops. The stale-release detector is advisory-only by policy and swallows `gh` failures into a warning (`release.yml:361`, `:363-366`, `:384-387`). And whether the called workflow's top-level `concurrency` even applies when invoked via `workflow_call` is **not covered by GitHub's concurrency or reuse documentation** — I could not establish it either way from a primary source, so R-1's protection must not be assumed to exist. **[DOC gap] + [INFER]** → **partially addressed (§15.1: R-1 no longer *depends* on callee concurrency, and the group is now a literal so both paths share it; the `workflow_call` semantics question itself remains an architectural unknown, §15.5).**
- **R-4 (low):** Two develop pushes in one minute also interact with the "one running + one pending, older *pending* replaced" documented group behavior **[DOC]** — a queued release can be dropped silently. Its audit trail is the run listing, not a failure. → **mitigated in code, `d05b29e`: `release.yml` now declares `queue: max` with `cancel-in-progress: false`, raising the pending ceiling from 1 to 100 so a queued release is not replaced (§15.1). Not eliminated: `ci.yml`'s group deliberately keeps default queueing, and GitHub does not document FIFO ordering.**
- Positive control worth noting: `summary` uses `if: always()` (`:777`), so an interrupted or failed release is *reported* rather than vanishing. **[CODE]**

**9. Safest first-activation sequence** — see §11, stated as an ordered runbook with owners.

---

## 11. Recommended first-activation sequence (runbook)

Each step names who performs it. **None of these steps were performed in this session.**

1. **Owner, Render:** confirm **auto-deploy disabled** for the staging service on the linked branch, and record whether a pre-deploy command exists. Gate: do not proceed until this is written down. *(R-2; closes the ungated trigger.)*
2. **Owner, GitHub:** create the `staging` environment **with a required reviewer configured and no secrets or variables yet** — deliberately, before the merge, so it is never auto-created unprotected. *(F-3; also gives you the per-stage human gate for Q6/Q7.)*
3. **Owner, GitHub:** confirm **no repository-level** secret or variable named `RENDER_API_KEY`, `STAGING_DATABASE_URL`, `STAGING_PGSSLROOTCERT_PEM`, `RENDER_SERVICE_ID` exists. *(W4 / D-3 — this is what makes the environment gate the real gate.)*
4. **Merge PR #106** with `staging` still secret-free. Expected result: `develop` CI green, `Trigger Staging Release` pauses for reviewer approval (or fails `validate` if approval is granted with no secrets) — and **zero** staging impact. *(Q7.)*
5. **Do not stack pushes to `develop`** while any release attempt is in flight; treat the merge and each activation as single-file events. *(R-1, R-4.)*
6. **Owner, GitHub:** add the three environment **secrets** and the **environment variable** to `staging` only when you are ready to activate — and keep the required reviewer in place.
7. **Owner, first activation:** run one **authorized `workflow_dispatch`** against the exact develop SHA, approving job by job: read `validate`'s printed SHA/CI-run audit (`release.yml:260-267`) and its `[PRESENT]`/`[REDACTED]` config verdict before approving; then approve `database-release` and watch migrate → seed → ledger (`:481-512`); only then approve `deploy`; then `health-check`. *(Q6, Q9.)*
8. **Owner, evidence:** capture run ID, URL, `validate` outputs, the three DB operation logs, Render deploy id/status, `.commit.id` equality result, `/v1/readyz` HTTP code, and the `summary` verdict. ~~Expect R-3's spurious "NEWER RELEASE(S) QUEUED" warning on this path and discount it (F-4).~~ **Updated by `d05b29e`: on this path the check now orders by `databaseId`, so "NEWER RELEASE(S) QUEUED" is a *real* signal — treat it as a stop-and-investigate indicator, not noise (§15.3).**
9. **Then, and only then,** treat a merge-to-`develop` push as a normal automated release — ~~ideally after deciding explicitly whether F-1 (dead confirmation input) and F-2 (caller-side cancellation) get code fixes first.~~ **F-1 and F-2 are fixed in `d05b29e`, so this step no longer waits on that decision; it still waits on steps 1–6 and on a green hosted run for the hardening head.**

---

## 12. Explicitly owner-controlled actions remaining

- Confirming and, if needed, **disabling Render auto-deploy** on the staging service, and recording the pre-deploy command state. *(§6.4, R-2)*
- **Creating** the `staging` environment and **configuring its protection rules** (required reviewer). *(F-3, step 2)*
- **Adding** the three environment secrets and `RENDER_SERVICE_ID` environment variable. *(B-2)*
- **Verifying the absence of repository-level** namesakes for those four names. *(W4, D-3)*
- **Deciding to merge** PR #106, and choosing inert-vs-paused merge posture. *(Q7)*
- **Performing the first `workflow_dispatch`** and approving each environment job. *(Q6)*
- **Scheduling develop pushes** so no release is cancelled mid-migration — **reduced by `d05b29e`, not removed**: a newer `develop` push no longer cancels the in-flight run, but overlapping *queued* releases are still possible, so the "one release at a time" discipline still applies while R-3 is unresolved. *(R-1, §15.1, §15.5)*
- ~~**Authorizing fixes** for the dead `skip_confirmation` input and the dispatch-path stale check.~~ **Done in code as `d05b29e` (F-1, F-4) — nothing left to authorize; what remains is reviewing the diff and the hosted CI evidence for it.** *(§15.2, §15.3)*

## 13. Authorization boundary confirmation

Performed (all read-only or documentation/local-test only): **[RUN] + [API]**

- Read `release.yml`, `ci.yml`, validators, helpers, `api.Dockerfile`, deployment docs; grepped for every trigger keyword.
- Unauthenticated read-only GitHub API: repository visibility, PR #106 metadata, run #425 + #424 job records, run listing on `develop`, `develop` workflow file contents, `environments` list, `environments/staging`, `actions/secrets`, `actions/variables` (the last four returned 401/404 as recorded).
- Local structural validator, release-pipeline unit tests, migration-ledger integration test against disposable Testcontainers Postgres.
- Edited `docs/deployment/PR-106-CI-VERIFICATION-AND-BRANCH-SYNCHRONIZATION-REPORT.md` (Part A) and added this report; committed as `eed728d` and pushed **only** those two files to `feature/automated-release-pipeline-v2.1`. The follow-up recording of run #427 (§7.1) touches this report alone. No other file was staged; the pre-existing unrelated working-tree modifications remain untouched.

Not performed:

- Did **not** merge PR #106. Did **not** push to `develop` or `main`. Did **not** force-push.
- Did **not** create or modify any GitHub environment, secret, or variable — including deliberately not triggering a run that would auto-create `staging`.
- Did **not** trigger `workflow_dispatch`, any staging release, or any deployment. Made **zero** Render API calls.
- Did **not** run staging migrations, seeds, or database writes. The integration test used an ephemeral container database only.
- Did **not** retrieve, print, or handle any secret value. Secret/variable endpoints returned 401 and were recorded as such.
- Did **not** modify Render settings or auto-deploy state.
- Did **not** touch unrelated working-tree changes (`apps/api/src/modules/returns/*` and the `docs/production/P13-*` set are pre-existing modifications from other work, left uncommitted and unstaged).

---

## 14. Recommendation

**PR #106 can be merged without automatically initiating a staging release — but only under a specific, owner-controlled condition, and the margin is thinner than prior reports imply.**

Merging today is safe in the operational sense: `release.yml` has no `push`/`pull_request` trigger of its own, `ci.yml` only calls it on a green develop push, and `validate` fails closed on absent configuration before any migration or Render call. That has now been verified against the code and against live hosted data, not inferred from earlier reports.

The honest caveat is that this safety comes entirely from B-2 being **unresolved**, not from any approval gate in the pipeline — there is none, since `skip_confirmation` is dead code (F-1). The instant `staging` gains its four configuration values, every push to `develop`, merge commits included, becomes an unattended live staging release. So the required owner authorization before merge is narrow and specific: **confirm Render auto-deploy is disabled** (the one trigger that bypasses GitHub Actions completely) and **add a required reviewer to `staging` before merging rather than letting the merge auto-create it unprotected**. With those two in place, the merge is inert and the first activation is a deliberate, per-job, human-approved event.

**v1.1 update to this recommendation.** The diagnosis still holds; two of its supporting facts moved. (a) The dead `skip_confirmation` input is now deleted, so the pipeline no longer even *implies* a code-level confirmation — the sentence "there is none" is now literally true of the workflow's UI as well as its logic (F-1 → §15.2). (b) "Unattended" is now slightly less unattended: a second `develop` push can no longer cancel the release run mid-migration (R-1 → §15.1), which was the failure mode that made an unattended release dangerous even when it was supposed to be the only one. **Neither merge prerequisite changed**: both remain owner-side, both remain unperformed, and this audit's verdict on merging — safe *only* with those two in place — is unchanged by `d05b29e`.

## 15. Remediation addendum (v1.1) — R-1, F-1 and F-4 fixed in code

Added 2026-11-05. **Everything in §1–§14 above is left exactly as audited**; this section records what changed afterwards, so the audit's evidence trail stays intact and citable.

**Remediation commit (code):** `d05b29e12443a20572d48f95c66c279080ca0264` — *fix(release): harden staging release safety (R-1, F-1, F-4)*, 7 files, +1042/−157: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `apps/api/scripts/validate-workflow-structure.mjs`, `apps/api/scripts/detect-stale-release.mjs` and the three release-pipeline specs that assert them.

All `file:line` citations below are against that commit, not against `303ff06`. Where a §1–§14 line reference has moved, the old reference is not rewritten — it is superseded in the note that annotates it.

### 15.1 R-1 / F-2 — a newer push can no longer cancel the run that hosts a release **[CODE] + [DOC]**

The audited defect was that `ci.yml` cancelled every in-progress run of `CI-<ref>`, and the release's migrating jobs live *inside* that run. F-2's second mitigation option ("scope `cancel-in-progress` so it never applies to `refs/heads/develop`") is now implemented:

`.github/workflows/ci.yml:57-59`

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/develop' }}
```

| Ref | Old | New | Why |
|---|---|---|---|
| `refs/heads/develop` | cancelled by a newer push | **never cancelled** | the only ref whose run can reach `database-release` |
| feature branches, `main`, PRs | cancelled | **still cancelled** | preserves the useful behaviour R-1's fix must not sacrifice |

`cancel-in-progress` accepts an expression, and the permitted contexts for it are `github`, `inputs` and `vars` — `github.ref` is therefore legal here **[DOC]**; `ci.yml:22-56` records that constraint so nobody "simplifies" it into an unsupported context. The group is unchanged (`github.workflow`-scoped), which matters: the fix does **not** move the cancellation risk into another workflow, because `release.yml` is not a group member on Path A — the caller's run is, and that run is now the one that cannot be superseded.

`.github/workflows/release.yml:114-117`

```yaml
concurrency:
  group: staging-release
  cancel-in-progress: false
  queue: max
```

Three deliberate properties, each now enforced by a validator check:

1. **Literal group.** `${{ github.workflow }}-${{ github.ref }}` inside a *called* workflow resolves to the caller's values (community discussion #30708 reports `github.workflow` resolving to the caller's name **[DOC, non-staff]**), so an expression group here could collapse onto `CI-…` and inherit the caller's cancellation. A literal `staging-release` cannot collide with anything and is shared by both execution paths. → `release-concurrency-group-is-literal`.
2. **Never cancels.** `cancel-in-progress` is the literal boolean `false`, not an expression. → `release-concurrency-never-cancels-in-progress`.
3. **Queues instead of replacing (R-4).** GitHub's documented default group holds one running + one pending member and *replaces the older pending one*; `queue: max` raises the pending ceiling to 100. It is legal only alongside literal `cancel-in-progress: false` — `queue: max` with `cancel-in-progress: true` is a workflow validation error **[DOC]**, which is exactly why property 2 is a literal. → `release-concurrency-queues-instead-of-replacing`, `queue-max-requires-literal-false-cancellation`.

`ci.yml` deliberately does **not** gain `queue: max`: it would be invalid against an expression that can evaluate to `true`, and default queueing is the right behaviour for feature branches. That asymmetry is asserted by `ci-develop-run-is-not-cancelled-by-a-newer-push` and `ci-non-develop-refs-still-cancel`, both of which *evaluate* the expression for `refs/heads/develop`, `refs/heads/main` and a feature/PR ref rather than string-matching it.

**What this does not claim.** It removes the demonstrated cancellation path (run #424, §5.3). It does not make two overlapping releases impossible — see §15.5.

### 15.2 F-1 — `skip_confirmation` removed (deletion route) **[CODE]**

`.github/workflows/release.yml:78-83` now declares exactly one dispatch input:

```yaml
  workflow_dispatch:
    inputs:
      commit_sha:
        description: 'Commit SHA to release (must be on develop) — a real staging release: migrates, seeds, deploys'
        required: true
        type: string
```

The audit's two options were "implement the gate" or "delete the input". **Deletion was chosen**, because an in-workflow confirmation token would be a second, weaker copy of the approval surface GitHub already provides: a workflow that can read its own `inputs` can read them as "confirmed", so the token would gate nothing that `validate` does not already gate, while *appearing* to add a human step. Real approval lives in `staging` environment protection rules — required reviewers (and optionally a wait timer and deployment-branch policy) — which pause each of the four `environment: staging` jobs independently and cannot be satisfied by anything in the repository. That is documented in the architecture doc ("Approval and human-in-the-loop") and in `release.yml:60-77`.

The dead input cannot silently come back: `release-no-skip-confirmation-input` forbids the name, and `dispatch-inputs-all-consumed` fails if any declared dispatch input is never read — which is the general form of F-1. `dispatch-input-commit-sha-required` keeps the SHA mandatory. `workflow-structure.spec.ts` reproduces the defect (re-adding the input) and proves the guard fires.

**A dispatch is not a dry run, and now says so in the UI.** §10 Q6's answer stands unchanged: with B-2 configured, one valid dispatch is a full live release (migrate → seed → ledger → Render deploy → health check). The `commit_sha` description is the first thing the person typing the SHA reads, and it now states that.

### 15.3 F-4 — stale-release detection compares like with like **[CODE] + [RUN]**

The defect was a cross-workflow `runNumber` comparison on Path B. The step (`.github/workflows/release.yml:363-476`) now branches on the event:

`.github/workflows/release.yml:402-410`

```bash
if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  ORDER_FIELD='databaseId'
  COMPARISON_BASIS="$CURRENT_RUN_ID"
  WORKFLOW_SPECS=('release.yml:' 'ci.yml:develop')
else
  ORDER_FIELD='runNumber'
  COMPARISON_BASIS="$CURRENT_RUN_NUMBER"
  WORKFLOW_SPECS=('ci.yml:develop')
fi
```

- **Path A (automated) is unchanged in substance** — still caller `ci.yml` runs on `develop`, still `runNumber`, which is monotonic *within* one workflow file and therefore valid only for same-file comparisons. The fix does not weaken it: `stale-detection-automated-path-caller-only` asserts Path A reads nothing but `ci.yml:develop`.
- **Path B orders by `databaseId`**, which is monotonic per **repository**, so it is the only identifier sound across `release.yml` and `ci.yml` runs. Path B reads its own workflow's queued runs *and* the caller's, merged and deduplicated with `unique_by(.databaseId)`.
- Both paths exclude the current run by `databaseId != $self` (never by position in a list) and neither reads `createdAt`, which is not monotonic under retries and clock skew → `stale-detection-excludes-current-run`, `stale-detection-never-reads-createdAt`.
- The comparator is one expression parameterised by `$field`, so the two paths cannot drift into different arithmetic → `stale-detection-no-mixed-identifier-comparison`.
- **Advisory policy preserved** (§5.2 W2): no `exit 1`, `gh` failures increment `QUERY_FAILURES` and downgrade to a warning, and the step still says the current migration should finish → `stale-detection-allows-complete`, `stale-detection-survives-query-failure`.

**Runtime evidence, not only structural.** `detect-stale-release.mjs` mirrors the step and is executed in real Node processes against a fabricated run population (`MIXED_POPULATION`: `databaseId` 490/500/510 against `runNumber` 3/430/431 — deliberately contradictory orderings):
- Path A flags the 2 runs newer by `runNumber`; Path B, on the *same* state, correctly reports none of them newer by `databaseId`. The two paths disagree by construction, which is the point.
- Replaying the **pre-fix** expression (`select(.runNumber > $current)` with `current` = release.yml's own counter, i.e. 3) on that state returns **2** — the exact false positive F-4 described, reproduced rather than asserted.
- A genuinely newer dispatch run *is* still detected on Path B (detection not weakened), a clean dispatch reports nothing, `gh` failure and partial failure both warn with exit code 0.

`stale-release-detection.spec.ts` (13) asserts both branches inside the real YAML; `stale-release-helper.spec.ts` (9) executes the helper; `workflow-structure.spec.ts` carries three negative controls — un-branching the step, ordering Path B by `runNumber`, and reintroducing the mixed comparison — each of which must make the validator fail.

### 15.4 Reassessment of the non-code risks: unchanged, and why

- **R-2 (Render auto-deploy) — owner action, unchanged, still the top risk.** Nothing in this repository can read or disable it; no Render endpoint was called in this session. Its severity is *higher* than §10 stated relative to R-1, now that R-1 is closed: it is the only remaining trigger that bypasses GitHub's gates entirely. Gate 1 of §11 is unchanged. **[NOT VERIFIED]**
- **R-3 (does called-workflow `concurrency` apply?) — still an architectural unknown.** §10's honesty is retained: GitHub's concurrency and reuse documentation does not state whether a called workflow's top-level `concurrency` participates in grouping, and no primary source was found either way. What changed is *dependency*: R-1 no longer relies on that unknown, because the protection now sits in the caller's own `cancel-in-progress`. The literal group from §15.1 additionally means that *if* callee concurrency does apply, it behaves as intended on both paths; if it does not, the caller-side fix still holds. The advisory stale check remains advisory. **[DOC gap]**
- **R-4 (pending replacement) — mitigated in code, not removed.** `queue: max` + literal `cancel-in-progress: false` on `staging-release` removes the "older pending run is replaced" behaviour for releases queued into that group. Two caveats: runs beyond the 100-pending ceiling are cancelled, and GitHub does not document FIFO ordering within a queue, so "queued" is not "in the order you pushed". `ci.yml`'s group keeps default behaviour by design. **[CODE] + [DOC]**
- **W4 (repo-level namesakes bypass the environment gate) — not a code defect, owner verification.** GitHub's documented resolution order is what it is; `d05b29e` changes no secret or variable and reads none. §6.3's 401s still stand; D-3 still needs the owner to look. **[DOC] + [NOT VERIFIED]**
- **F-3 (merge auto-creates an unprotected `staging`) — unchanged owner action.** No environment was created or modified in this session, so the merge is still capable of auto-creating it. §11 step 2 is still the correct order of operations. **[DOC]**
- **F-5 (no runtime evidence for the release jobs) — still true.** `validate`, `database-release`, `deploy`, `health-check` and `summary` have still never executed, and this remediation did not and could not change that without authorization. Consequence: R-1's fix is proven at the *workflow-configuration* level and by the #424 demonstration of the mechanism it removes — it is **not** proven by an in-flight staging release, because none exists. **[RUN] + [CODE]**

### 15.5 Residual limitations, stated plainly

1. Two releases can still overlap if the second is *manually dispatched* while a develop-hosted release runs: the caller-side protection applies to Path A's run, and whether `staging-release` serialises a `workflow_dispatch` run against a called run depends on the §15.4 R-3 unknown.
2. Cancellation of Path B's own run (a human pressing "Cancel workflow" on a dispatch run, or a required-reviewer timeout) is outside any `concurrency` setting. The mitigation is the one the audit already recommended: the PostgreSQL session advisory lock in `apps/api/infra/drizzle/migration-lock.ts`, held for the whole ledger-check/apply sequence in `migrate-pg.ts:54` and released at `:122`, plus per-migration `BEGIN`/`COMMIT` with the `_migration_log` insert in the same transaction (`migrate-pg.ts:97-100`). That lock — not Actions concurrency — is what makes a cancelled-and-resumed migration converge, and it is the reason the stale check stayed advisory.
3. Nothing here has hosted runtime proof, because proof would require the staging activation this session is not authorized to perform. §15.6 lists what *is* proven; the merge and the first dispatch remain the first real test.

### 15.6 Verification at `d05b29e` (local; supersedes §7 for this tree only)

| Check | Command | Result |
|---|---|---|
| Structural validator | `node apps/api/scripts/validate-workflow-structure.mjs` | **78/78 checks passed** (was 56/56 at `303ff06`; +22 for R-1/F-1/F-4 and `needs`-gating) |
| Release-pipeline unit | `npx vitest run src/__tests__/unit/release-pipeline` | **7 files / 112 tests passed**, exit 0 |
| Stale-detection runtime | real Node processes + real `jq` against fabricated run state | both paths correct; pre-fix expression reproduces the F-4 false positive; §15.3 |
| Migration-ledger integration | Testcontainers PostgreSQL | **NOT RE-RUN at this head.** The Docker Desktop daemon went down mid-run (`failed to connect to the docker API at npipe:…`), so no local integration evidence exists for `d05b29e`; the ledger code path is untouched by the commit and the same 8 tests passed at `303ff06` (§7). Hosted `Integration Tests` result: §15.7 |
| Typecheck / lint / build | `tsc --noEmit` · ESLint on the changed scripts and specs · `nest build` | **0 errors** · **0 errors, 0 warnings** · build success (432 files) |
| Hosted CI | see §15.7 | recorded after the push |

### 15.7 Post-commit hosted CI verification of the hardening head

_RECORD PENDING — to be completed from the Actions run for the PR head carrying `d05b29e`, and committed in the follow-up documentation commit. Full job-by-job results are recorded in `PR-106-WORKFLOW-SAFETY-HARDENING-REPORT.md` §9._

---

## Appendix: evidence index

| Evidence | Locator |
|---|---|
| Release triggers (`workflow_call`, `workflow_dispatch`, no push/PR) | `.github/workflows/release.yml:34-70` |
| Dead `skip_confirmation` input | `.github/workflows/release.yml:66-70` (no reader anywhere in `.github/`) |
| Release concurrency group | `.github/workflows/release.yml:84-86` |
| Least-privilege scopes | `.github/workflows/release.yml:110-112`, `.github/workflows/ci.yml:35-38` |
| `validate` job + environment + job-scoped var | `.github/workflows/release.yml:116-126` |
| Dispatch SHA validation (format/exists/reachable/CI-green) | `.github/workflows/release.yml:159-209` |
| Automated-path event/ref/repo/SHA fencing | `.github/workflows/release.yml:210-258` |
| Secrets + variable fail-fast | `.github/workflows/release.yml:275-320` |
| `database-release` `needs: validate`, environment, no `if` | `.github/workflows/release.yml:325-329` |
| Advisory-only stale-release detection | `.github/workflows/release.yml:332-391` (policy `:80-83`) |
| migrate / seed / ledger calls | `.github/workflows/release.yml:481`, `:493`, `:510` (env `:426-429`) |
| `deploy` needs + Render trigger / poll / SHA verify | `.github/workflows/release.yml:523-532`, `:539-598`, `:600-673`, `:675-731` |
| Health check URL | `.github/workflows/release.yml:743` |
| `summary` `if: always()` | `.github/workflows/release.yml:773-777` |
| CI triggers | `.github/workflows/ci.yml:12-16` |
| CI `cancel-in-progress: true` | `.github/workflows/ci.yml:18-20` |
| k6 main-only gate | `.github/workflows/ci.yml:362-366` |
| Release call site + eight mandatory needs | `.github/workflows/ci.yml:518-540` |
| Container start command (no self-migration) | `infra/deploy/api.Dockerfile:115` |
| Render pre-deploy/auto-deploy path | `docs/deployment/API-STARTUP-MIGRATION-SEPARATION-VERIFICATION.md:160-172`, `:265` |
| Auto-deploy must be disabled (project's own words) | `docs/deployment/AUTOMATED-RELEASE-PIPELINE-ARCHITECTURE-V2.1.md:1438-1444`, `:1458` |
| Run #425 — 11 jobs, 9 success / 2 skipped | https://github.com/nabeel2323/scs-platform/actions/runs/41829149254 |
| Run #424 — mid-flight cancellation | https://github.com/nabeel2323/scs-platform/actions/runs/41826344794 |
| B-2 absent (`environments/staging` → 404; 5 envs, none `staging`) | `GET /repos/nabeel2323/scs-platform/environments` (2026-11-04) |
| Secrets/variables not verifiable (401) | `GET /repos/nabeel2323/scs-platform/actions/secrets`, `…/actions/variables` |
| `release.yml` absent on develop (404); `ci.yml` there lacks the wiring | `GET /repos/…/contents/.github/workflows/{release,ci}.yml?ref=develop` |
| Validator 56/56 | `node apps/api/scripts/validate-workflow-structure.mjs` |
| 92 unit / 8 integration passed | `vitest run src/__tests__/unit/release-pipeline`, `…/integration/release-pipeline/verify-migration-ledger.spec.ts` |
| Post-push CI verification — run #427, SHA `eed728d`, 11 jobs / 9 success / 2 skipped | https://github.com/nabeel2323/scs-platform/actions/runs/41866322375 |
| Corroborating prior docs run #426, SHA `303ff06`, identical 11 / 9 / 2 | https://github.com/nabeel2323/scs-platform/actions/runs/41858810259 |

Sources (GitHub documentation used to establish runtime behavior):
- [Environments — GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) — auto-creation of referenced-but-missing environments; protection rules gate both running and secret access; environment-secret scoping.
- [Control the concurrency of workflows and jobs — GitHub Actions](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) — `cancel-in-progress: true` cancels currently running members of the group; at most one running member; older pending member replaced.
- [Reuse workflows — GitHub Actions](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — `secrets: inherit`, environment secrets in a called workflow, environment-over-repo name precedence, and empty-string resolution when a secret was never passed.

---

*Prepared as the PR #106 first-activation safety deliverable, 2026-11-04. Analysis of workflow code at `303ff06`, reconciled against live hosted Actions data and GitHub's published runtime semantics. No staging environment, secret, variable, database, or Render state was read beyond endpoint status, and no configuration or deployment action was taken.*
