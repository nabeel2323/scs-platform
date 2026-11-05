# PR #106 — Release Workflow Safety Hardening (R-1, F-1, F-4)

**Report version:** v1.0
**Date:** 2026-11-05
**Repository:** [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)
**Pull request:** [#106](https://github.com/nabeel2323/scs-platform/pull/106) → `develop`
**Branch:** `feature/automated-release-pipeline-v2.1`
**Findings remediated:** R-1 (with its §8 alias F-2), F-1 (register alias SEC-12), F-4 — from `PR-106-FIRST-STAGING-ACTIVATION-SAFETY-AUDIT.md`
**Code commit:** `d05b29e12443a20572d48f95c66c279080ca0264` — *fix(release): harden staging release safety (R-1, F-1, F-4)*
**Prior state of the same files:** `6a90126` (docs) / workflow code as audited at `303ff064b506d365082eccc3d11a4f80914239f7`
**Authorization basis:** unchanged from the audit — analysis, code, tests and documentation only. No merge, no push to `develop`/`main`, no environment/secret/variable change, no Render change, no `workflow_dispatch`, no staging migration/seed/deploy, no force-push.

---

## 1. Result in one paragraph

All three findings are closed in code. R-1 is closed by scoping `ci.yml`'s `cancel-in-progress` so it is false exactly on `refs/heads/develop` — the only ref whose run can host a staging mutation — while feature-branch, PR and `main` runs keep superseding; `release.yml`'s own `staging-release` group became a literal group with `cancel-in-progress: false` and `queue: max`, which additionally mitigates R-4. F-1 is closed by deleting the dead `skip_confirmation` input and documenting that a dispatch is a live release whose only human gate is environment protection rules. F-4 is closed by splitting the stale-release step per execution path so each path compares identifiers from the same numbering domain, with the advisory-only policy deliberately preserved. 22 new executable structural checks (56 → **78**, all passing) and 7 new negative controls keep all three from regressing. Hosted CI verification for the PR head carrying this work is in §9.

---

## 2. Original findings, as audited

Quoted from `PR-106-FIRST-STAGING-ACTIVATION-SAFETY-AUDIT.md` §8/§10, which audited the workflow code at `303ff06`.

| ID | Severity | Finding, as audited |
| --- | --- | --- |
| **R-1 / F-2** | high | "`ci.yml` `cancel-in-progress: true` on `CI-<ref>` can cancel the `develop` run mid-`database-release`, since the release jobs are part of that run (`ci.yml:18-20` vs `release.yml:84-86`). Demonstrated mid-flight on run #424." F-2 adds: "`release.yml:84-86` cannot prevent it because the jobs live in the caller's run," and lists three owner-side mitigations, the second being "scope `cancel-in-progress` so it never applies to `refs/heads/develop` runs that have reached the release job (a workflow change, out of scope here)". |
| **F-1 / SEC-12** | medium (governance) | "`skip_confirmation` is dead input … Declared at `release.yml:66-70` as 'Skip manual confirmation (use with caution)', default `false`. Grepping all of `.github/` finds it **only** at its declaration … There is therefore **no in-workflow confirmation step to skip**, and the input's presence implies a protection that does not exist." |
| **F-4** | low | "Stale-release check misbehaves on the dispatch path … `release.yml:339-340` reads `github.run_number` of *this* run, and on a `workflow_dispatch` run of `release.yml` that is release.yml's own counter — while `:356-361` lists `ci.yml` run numbers (currently in the 420s). The comparison at `:372` is therefore apples-to-oranges on Path B and will usually print 'NEWER RELEASE(S) QUEUED' spuriously." |

Related findings deliberately **not** treated as code defects: F-3 (merge auto-creates an unprotected `staging` environment), W4 (repository-level namesake secrets bypass the environment gate), R-2 (Render auto-deploy), R-3 (undocumented called-workflow concurrency semantics), R-4 (pending-run replacement), F-5 (no runtime evidence for the release jobs). See §7.

---

## 3. Root cause analysis

**R-1 — a topology misunderstanding, not a typo.** The pipeline invokes `release.yml` as a **reusable workflow** through a job-level `uses:` in `ci.yml`. Reusable workflows do not create their own run: `validate`, `database-release`, `deploy`, `health-check` and `summary` are **jobs of the caller's run**, in the caller's concurrency group `CI-<ref>`, under the caller's `cancel-in-progress`. So the release's protection could never live in `release.yml`'s own `concurrency` block — a block governing a group the release does not occupy on the automated path. The literal `cancel-in-progress: true` was correct for CI hygiene (a new push should supersede an obsolete test run) and wrong for exactly one ref: `develop`, the only ref whose run can reach the mutating jobs. Run #424 is the live demonstration of the mechanism: a newer run in the same group terminated the in-flight job `cancelled`, and `Trigger Staging Release` was recorded `skipped` at the same timestamp.

**F-1 — an input declared without a consumer.** `workflow_dispatch.inputs` only *delivers* values; nothing reads them unless a step references `inputs.*`. Grep across `.github/` found no reader for `inputs.skip_confirmation`, so the field was pure UI. The root cause is a design that anticipated a `validate`-time confirmation branch which was never written, combined with no structural check asserting "every declared input is consumed" — the general invariant F-1 violated.

**F-4 — comparing two different identifier domains.** `github.run_number` is monotonic **per workflow file**; `databaseId` (the run id) is monotonic **across the repository**. On the automated path the step's basis and its population both come from `ci.yml`, so `runNumber` was sound. On the dispatch path the basis came from `release.yml` (single digits) while the population was `ci.yml` runs (hundreds), so `runNumber > basis` was true for essentially every queued run. The root cause is one code path written for the caller's topology and reused for a topology where the caller/callee roles invert.

---

## 4. Exact code changes

`git show --numstat d05b29e` — 7 files, **+1042 / −157** exactly:

| File | + / − | Content |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 40 / 1 | concurrency predicate + 37-line rationale block |
| `.github/workflows/release.yml` | 146 / 62 | dispatch inputs (`:59-83`), concurrency (`:85-117`), stale-release step rewrite (`:363-476`) |
| `apps/api/scripts/detect-stale-release.mjs` | 153 / 33 | rewritten path-aware mirror (§4.5) |
| `apps/api/scripts/validate-workflow-structure.mjs` | 202 / 5 | 22 new checks + `concurrencyOf` / `evalCancelInProgress` / `splitDispatchBranch` |
| `…/stale-release-detection.spec.ts` | 119 / 32 | 7 → 13 tests, per-path assertions |
| `…/stale-release-helper.spec.ts` | 177 / 21 | 4 → 9 tests, real-process execution |
| `…/workflow-structure.spec.ts` | 205 / 3 | 14 → 23 tests, 7 new negative controls (11 total) |

### 4.1 R-1 — `.github/workflows/ci.yml:57-59`

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/develop' }}
```

The group is **unchanged**; only the cancellation predicate changed. `ci.yml:18-56` carries the rationale: why develop is excluded (release jobs are jobs of this run), the run #424 citation, the per-ref behaviour table, the expression-context rule (`concurrency` expressions may reference `github`, `inputs`, `vars` — `github.ref` qualifies), and why `queue: max` is deliberately *not* set here (GitHub rejects `queue: max` with `cancel-in-progress: true`, and this expression evaluates `true` for most refs).

| Event / ref | Group | `cancel-in-progress` evaluates | Effect |
| --- | --- | --- | --- |
| `push` to `develop` | `CI-develop` | **false** | a second develop push **queues**; the in-flight release is never interrupted |
| `push` to `main` | `CI-main` | true | unchanged supersession (main cannot start a staging release; the caller `if` requires develop) |
| `push` to a feature branch | `CI-<branch>` | true | unchanged |
| `pull_request` | `CI-refs/pull/N/merge` | true | unchanged |

### 4.2 R-1 / R-4 — `.github/workflows/release.yml:114-117`

```yaml
concurrency:
  group: staging-release
  cancel-in-progress: false
  queue: max
```

`release.yml:85-113` documents the three deliberate properties (literal group, literal `false`, `queue: max`) and states plainly which path it actually protects: Path B (dispatch runs *are* `release.yml` runs) and **not** Path A, whose group is the caller's. The literal group also removes a collision hazard: inside a called workflow `github.workflow` resolves to the **caller's** name (community discussion #30708 reports exactly this; GitHub does not document it), so an expression group here could have collapsed onto `CI-develop` and inherited the very cancellation this change removes.

### 4.3 F-1 — `.github/workflows/release.yml:59-83`

`skip_confirmation` deleted; `commit_sha` is now the only dispatch input, and its description carries the semantics:

```yaml
  workflow_dispatch:
    inputs:
      commit_sha:
        description: 'Commit SHA to release (must be on develop) — a real staging release: migrates, seeds, deploys'
        required: true
        type: string
```

The comment block above it (`:59-77`) states that a dispatch performs the same real mutating sequence as the automated path, why the input was removed rather than implemented, and that environment protection rules are the approval surface.

### 4.4 F-4 — `.github/workflows/release.yml:363-476`

Path split (`:402-410`), per-source querying with failure accounting (`:417-441`), deduplicated union (`:444`), single parameterised comparator (`:448-452`):

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

```bash
QUEUED_RUNS=$(printf '%s' "$QUEUED_JSON" | jq -s 'add // [] | unique_by(.databaseId)')
NEWER_JSON=$(echo "$QUEUED_RUNS" | jq -c \
  --arg field "$ORDER_FIELD" --argjson basis "$COMPARISON_BASIS" --argjson self "$CURRENT_RUN_ID" '
  [.[] | select(.databaseId != $self) | select(.[ $field ] > $basis)]')
```

| Aspect | Path A — automated `workflow_call` | Path B — `workflow_dispatch` |
| --- | --- | --- |
| Basis | caller's `run_number` (`github.*` mirror the caller inside a called workflow) | this run's `databaseId` |
| Ordering field | `runNumber` (same file ⇒ valid) | `databaseId` (repository-global ⇒ valid across files) |
| Sources scanned | `ci.yml` runs on `develop` only | `release.yml` queued runs **unfiltered by branch** + `ci.yml` runs on `develop` |
| Self-exclusion | `databaseId != $self` | same |
| On failure | warn, `QUERY_FAILURES++`, never `exit 1` | same |

Path B does not branch-filter `release.yml` because `validate` accepts any develop-reachable SHA regardless of the ref the dispatch was started from — filtering by branch would hide a queued dispatch. Path A deliberately does **not** query `release.yml`, because no `release.yml` run exists on that path and an empty result would silently turn the check into a no-op.

### 4.5 Supporting helper rewrite — `apps/api/scripts/detect-stale-release.mjs`

Now path-aware and exported for execution: `CALLER_WORKFLOW_FILE`, `CALLER_BRANCH`, `SELF_WORKFLOW_FILE`, `ORDER_FIELD_AUTOMATED`, `ORDER_FIELD_DISPATCH`, `orderFieldForEvent()`, `comparisonBasisForEvent()`, `queuedRunSources()`, `mergeQueuedRuns()` (dedupes by `databaseId`), `findNewerRuns(…, currentRunId, field)`, `getQueuedRuns(workflowFile, ghToken, branch)` returning **`null`** on failure so callers can count partial reads, and `detectStaleRelease(currentRunId, currentRunNumber, ghToken, queuedRuns, eventName)` returning `{ isStale: false, policy: 'allow-complete', orderField, comparisonBasis, sourcesRead, sourcesFailed, message, newerRuns }`. The CLI accepts an optional `[event-name]` argument. This file remains a **test-visible mirror** (register item SEC-11); the YAML step is the runtime authority, and `stale-release-detection.spec.ts` asserts the YAML while `stale-release-helper.spec.ts` executes the mirror.

### 4.6 Correction to the commit message

`d05b29e`'s message says "47 new executable structural checks (78 total)". That count is wrong: the validator executed **56** checks immediately before the commit and **78** after, so **22 checks were added** (the families are enumerated in §8.1; `stale-detection-uses-run-number` was replaced by two path-specific checks). The total and the passing state are correct; only the delta in the message is overstated. Corrected here rather than by rewriting history, and enforced going forward by `workflow-structure.spec.ts`, which asserts the full check-name set.

---

## 5. Concurrency design — what it now guarantees, and what it does not

**Guaranteed by configuration (verified statically, plus one live demonstration of the removed mechanism):**

1. A `develop` CI run — the only run that can host `database-release` — is never cancelled by a subsequent `develop` push. (§4.1)
2. A queued `release.yml` dispatch is not silently replaced by a newer dispatch: `staging-release` holds one running + up to 100 pending with cancellation off. (§4.2, closes R-4 for that group)
3. Neither guarantee depends on the undocumented behaviour of a called workflow's `concurrency` block, because #1 lives in the caller and #2 is a property of the callee group *when the callee is its own run*. (§4.2, addresses R-3 dependency)
4. A failed or cancelled CI prerequisite cannot invoke the release: the caller declares `needs:` on the eight mandatory gates with **no `if: always()`**, and four new checks (`caller-prerequisites-can-block-release`, `release-job-{database-release,deploy,health-check}-gated-by-needs`) assert the gating survives — including the negative control that re-adds `&& always()` / `if: always()` and expects failure.
5. SHA validation and migration-ledger verification are untouched by this change: `validate` still fails closed on the ordered SHA gates and the three secrets plus `RENDER_SERVICE_ID`, and `database-release` still runs migrate → seed → `verify-migration-ledger.mjs` in one step in that order (`db-step-order-migrate-seed-ledger`).

**Deliberately NOT claimed:**

- **"Overlapping staging mutations are impossible."** They are not. Concurrency in GitHub Actions is a *run-scheduling* mechanism, not a distributed lock, and §5.3 lists the paths that can still interleave.
- **"Cancellation is gone."** It is scoped away from `develop` pushes only. A human cancelling a run, a reviewer-decision timeout, or a `workflow_dispatch` cancelled manually can still interrupt a job.
- **"Queueing is unlimited."** GitHub's documented default group holds **one running + one pending** member and *replaces the older pending one*; `queue: max` raises the pending ceiling to **100**, and runs beyond the ceiling are cancelled. `ci.yml` keeps the default, so a *third* develop push while one run is executing and one is pending replaces the older **pending** run. That is acceptable — a replaced run has not started, so nothing can be mid-migration — but it is a real limit, and it is why §6.2's runbook still says one release at a time.
- **"FIFO."** GitHub does not document ordering within a queue; "queued" is not "the order you pushed".
- **"Runtime-proven."** See §8.4 and §9: the release jobs have never executed anywhere, so R-1's fix is proven at configuration level and by the #424 demonstration of the mechanism it removes, not by an in-flight release.

### 5.3 Residual interleaving paths (documented, not eliminated)

| # | Path | Why concurrency config cannot close it | Actual mitigation |
| --- | --- | --- | --- |
| L1 | Manual dispatch during an automated develop release | The automated release occupies `CI-develop`, not `staging-release`; whether both occupy one group depends on the R-3 unknown | PostgreSQL advisory lock (§5.4), per-migration transactions + ledger verification |
| L2 | Two develop pushes with an intermediate pending run | documented pending-replacement behaviour of `ci.yml`'s default group | the replaced run never started; run-listing audit trail |
| L3 | Human cancels the run mid-migration | outside every `concurrency` setting | advisory lock releases with the session; per-migration `BEGIN/COMMIT` keeps the schema at a migration boundary; ledger verification fails the next run loudly |
| L4 | Render auto-deploy fires concurrently | not a GitHub run at all | **owner action** — confirm auto-deploy disabled (§7) |
| L5 | >100 queued dispatches | `queue: max` ceiling | beyond the ceiling GitHub cancels the excess; loud, not silent |

### 5.4 The hard serializer is the database, not Actions

`apps/api/infra/drizzle/migrate-pg.ts:54` acquires a **session-scoped two-key advisory lock** (`pg_advisory_lock(0x534353, 1)` in `migration-lock.ts`) before reading the ledger and holds it across the whole apply sequence; `:122` releases it, and PostgreSQL releases it automatically if the connection or process dies. Each pending migration is applied inside its own `BEGIN … COMMIT` together with its `_migration_log` insert (`:97-100`), so an interrupted runner leaves the schema at a migration boundary with every committed migration logged. That is why the stale-release check stays advisory: aborting mid-migration would be strictly worse than finishing, and the lock is what makes a resumed run converge. This design was already in place before this change and is unchanged by it.

---

## 6. Decisions taken

### 6.1 F-1: delete the input rather than implement the gate

The audit offered two routes. Implementing a "confirmation token" input would have created a **second, weaker copy of a control GitHub already enforces**: a workflow that can read its own `inputs` can read them as confirmed, so the token cannot gate anything `validate` does not already gate, while *appearing* to add a human step. Environment protection rules on `staging` are enforced by GitHub **before the job starts**, are independent of repository code, and pause each of the four `environment: staging` jobs separately — so `validate` can run, be read, and then a human decides whether `database-release` proceeds. Deleting the dead input removes a false affordance; adding a fake gate would have added one.

Cost of the decision: the dispatch UI now offers no knob at all, so safety depends entirely on the owner configuring protection rules. That is stated in the workflow comment, in the architecture doc ("Approval and human-in-the-loop"), and in §7's owner list. Two validator checks make the decision durable: `release-no-skip-confirmation-input` (the name may not return without a real gate for **both** paths) and `dispatch-inputs-all-consumed` (the general invariant — every declared dispatch input must be read by some step).

### 6.2 "A dispatch is not a dry run" is now stated where it cannot be missed

The task asked for this to be documented, not implied. It is now in three places: the `commit_sha` **description** (visible while typing the SHA), the `release.yml:59-77` comment block, and the architecture doc's dispatch section ("**A dispatch is a real release, not a dry run.**"). No fake `--dry-run` mode was introduced: a dry run that skips migration would give false confidence about the exact thing the operator needs to know (whether the ledger converges).

### 6.3 Advisory-only stale-detection policy preserved

F-4's correction changes *what is compared*, not *what happens*. The step still never `exit 1`s, still treats `gh`/API failure as a warning, and still prints the allow-complete rationale. Making it blocking would abort a migration for an informational signal computed from a possibly-incomplete run listing.

### 6.4 Concurrency risk was not moved between workflows

The instruction "do not introduce a concurrency design that merely moves the cancellation risk to another workflow" is honoured structurally: the cancellation predicate was **narrowed inside the existing `CI-<ref>` group**, not replaced by a new global group. Feature-branch, PR and `main` cancellation behaviour is bit-for-bit unchanged; only `develop` is exempted, and `develop` is precisely the ref where supersession could interrupt a migration. The `release.yml` group is not a new risk carrier either — it changes from "expression-free, cancel-in-progress false" to the same semantics plus a queue ceiling, and it is documented as protecting Path B only.

---

## 7. Reassessment of the other risks (Part 4)

| Risk | Classification after `d05b29e` | Evidence | Basis |
| --- | --- | --- | --- |
| **R-1** | **Fixed in code** | `ci.yml:57-59`; 8 validator checks; 3 negative controls; run #424 demonstrates the removed mechanism; run #429 shows GitHub accepts and schedules the expression form (§9.2) | **[CODE] + [RUN] + [DOC]** |
| **R-4** | **Mitigated in code**, not eliminated | `release.yml:114-117` `queue: max`; `ci.yml` default group documented | **[CODE] + [DOC]** |
| **R-3** | **Architectural limitation — no longer depended upon** | GitHub does not document whether a called workflow's top-level `concurrency` participates in grouping; the only direct signal is community discussion #30708 (non-staff) reporting `github.workflow` resolving to the caller's name. The literal group is correct under either interpretation. | **[DOC gap] + [INFER]** |
| **R-2** | **Owner action — now the highest unresolved risk.** No code change can reach it; no Render endpoint was called in this session. | audit §6.4; `api.Dockerfile` has no ENTRYPOINT/CMD, so a Render pre-deploy command would have to be dashboard-configured and is unverifiable from the repository | **[NOT VERIFIED]** |
| **W4** | **Owner verification action**, not a defect. GitHub's documented resolution order (environment secret wins over repo/org namesake; an unset secret is an empty string) is what `validate` relies on; the repository cannot change it. | audit §5.2 W4, §6.3 (401s on `actions/secrets` and `actions/variables`) | **[DOC] + [CODE]** |
| **F-3** | **Owner action, unchanged.** This session created and modified no environment, so merging still auto-creates `staging` unprotected if it does not exist first. | **[DOC]** |
| **F-5** | **Unchanged by design, and unchanged by run #429.** `validate`, `database-release`, `deploy`, `health-check`, `summary` have still never executed — #429 skipped `trigger-staging-release` on `pull_request`, exactly as designed (§9.1). Closing this requires the merge and an authorized activation. | **[RUN] + [API]** |
| **SEC-11** (mirror helpers) | **Unchanged, acknowledged.** `detect-stale-release.mjs` and `validate-release-sha.mjs` remain test-visible mirrors; the YAML remains the runtime authority. The mirror is now *differential-tested* against the YAML rather than only described. | **[CODE]** |
| **SEC-18 / SEC-16** (floating `@v4` tags, no job `timeout-minutes`) | **Out of scope, untouched.** Not part of R-1/F-1/F-4; deliberately not mixed into this diff. | **[CODE]** |

**Owner prerequisites before PR #106 is merged or activated** (none performed here): confirm Render auto-deploy disabled and record any pre-deploy command → create `staging` **with a required reviewer and no secrets** → confirm no repository-level namesakes for `RENDER_API_KEY`, `STAGING_DATABASE_URL`, `STAGING_PGSSLROOTCERT_PEM`, `RENDER_SERVICE_ID` → merge (inert) → add the three secrets plus `RENDER_SERVICE_ID` when ready → one authorized `workflow_dispatch`, approved job by job.

---

## 8. Tests and verification (Part 5)

### 8.1 Structural validator — `apps/api/scripts/validate-workflow-structure.mjs`

`node apps/api/scripts/validate-workflow-structure.mjs` → **78/78 checks passed** (56 before this change). Families added or extended here:

- **Concurrency (8):** `ci-concurrency-declared`, `ci-concurrency-scoped-to-workflow-and-ref`, `ci-develop-run-is-not-cancelled-by-a-newer-push`, `ci-non-develop-refs-still-cancel`, `release-concurrency-group-is-literal`, `release-concurrency-never-cancels-in-progress`, `release-concurrency-queues-instead-of-replacing`, `queue-max-requires-literal-false-cancellation`. The two develop/non-develop checks **evaluate** the expression against `refs/heads/develop`, `refs/heads/main`, a feature ref and a PR ref — they do not string-match the YAML.
- **Dispatch inputs (3):** `dispatch-inputs-all-consumed`, `release-no-skip-confirmation-input`, `dispatch-input-commit-sha-required`.
- **Stale detection (11 total, incl. 9 new):** `stale-detection-splits-execution-paths`, `-targets-caller`, `-automated-path-caller-only`, `-dispatch-path-includes-own-runs`, `-automated-orders-by-run-number`, `-dispatch-orders-by-database-id`, `-no-mixed-identifier-comparison`, `-excludes-current-run`, `-never-reads-createdAt`, `-allows-complete`, `-survives-query-failure`.
- **`needs`-gating (4):** `caller-prerequisites-can-block-release`, `release-job-database-release-gated-by-needs`, `release-job-deploy-gated-by-needs`, `release-job-health-check-gated-by-needs`.

New shared helpers: `concurrencyOf`, `evalCancelInProgress` (models GitHub's expression evaluation for the permitted form), `splitDispatchBranch` (splits the step body on the literal `else`/`fi` so per-path assertions are structural, not textual).

### 8.2 Unit tests

`npx vitest run src/__tests__/unit/release-pipeline` → **7 files / 112 tests passed**, exit 0 (was 92).

| File | Before | After | What the new tests do |
| --- | --- | --- | --- |
| `workflow-structure.spec.ts` | 10→14 | **23** | positive assertions for R-1/F-1/F-4 check names; `withConcurrency` rewriter; **11 negative controls** in total |
| `stale-release-detection.spec.ts` | 7 | **13** | extracts the real step, splits it by path, asserts per-path `ORDER_FIELD`/basis/sources, `--workflow="$WF"`, `unique_by(.databaseId)`, no `createdAt`, no `exit 1`, pre-mutation ordering |
| `stale-release-helper.spec.ts` | 4 | **9** | executes the real helper in child Node processes over a deliberately contradictory population (`databaseId` 490/500/510 vs `runNumber` 3/430/431) |
| `workflow-trust-boundary` 10, `manual-sha-validation` 19, `render-api` 19, `ssl-certificate-handling` 19 | — | unchanged | trust boundary, real SHA-validation helper exports, Render mock server, SSL lifecycle |

**Negative controls added** (each mutates a throwaway copy and asserts the validator *fails*): unconditional `cancel-in-progress: true` in `ci.yml` (R-1); the inverted `==` form, which fails both ways; `cancel-in-progress: true` combined with `queue: max` (the workflow-validation-error combination); a missing `queue: max`; an expression-based release group; re-adding `skip_confirmation`; a dispatch path ordered by `runNumber`; the path split collapsed entirely; and `&& always()` on the caller / `if: always()` on `database-release`. Three more controls in `stale-release-detection.spec.ts` prove the per-path extractor itself cannot be silently defeated (removing the branch, renaming the step, reintroducing a mixed comparison).

### 8.3 F-4 runtime evidence (executed, not asserted)

The mirrored detector was run in real Node processes with real `jq` against fabricated run state, using a stubbed `gh`:

| Scenario | Result |
| --- | --- |
| Path A over the mixed population | flags 2 runs newer by `runNumber` (correct for that file) |
| **Path B over the identical state** | reports **none** newer by `databaseId` — the false positive is gone |
| **Pre-fix expression replayed on the same state** | returns **2** — reproduces the audited F-4 behaviour rather than describing it |
| Genuinely newer dispatch run | detected on Path B — automated-path detection not weakened |
| Clean dispatch | "No newer release queued" |
| `gh` failure / one of two sources failing | warns, reports `sourcesRead`/`sourcesFailed`, **exit 0**, `policy: allow-complete` |

### 8.4 Typecheck, lint, build, YAML

`tsc --noEmit -p tsconfig.json` → **exit 0** (re-run on this tree). ESLint over `validate-workflow-structure.mjs`, `detect-stale-release.mjs` and all seven release-pipeline specs → **exit 0, no warnings**. `nest build` → **exit 0**, 432 files emitted, 0 TSC issues. Both workflow files are parsed by `js-yaml` in §8.1, which is the syntax check, and the trigger/job structure they encode is what the 78 checks assert.

Re-run at the final tree (`87f5589`, working tree = pushed head) with the same commands CI uses: `pnpm lint` (`turbo run lint`, 5 package tasks) → **exit 0, 0 errors / 313 warnings** — the warnings are the repo's pre-existing `no-unused-vars` debt in files this change does not touch; `pnpm typecheck` (`turbo run typecheck`, 9 tasks) → **exit 0**, with `@scs/api:tsc --noEmit` executing uncached. `pnpm format:check` remains failing on CRLF debt and is advisory in CI (`ci.yml:109-110`), which is why it does not appear as a defect anywhere in this report.

### 8.5 Integration and the local-suite caveat — stated honestly

- The **release-pipeline integration spec** (`verify-migration-ledger.spec.ts`, 8 tests, Testcontainers PostgreSQL 16 + PostGIS) **could not be re-run to completion in this session**: the Docker Desktop daemon went down partway through the run (`failed to connect to the docker API at npipe:…`, zero `node.exe` processes remaining, no results file written), and it was still down when this section was written (`docker info` → `failed to connect to the docker API at npipe:…`). Starting Docker Desktop is a machine-level change outside this task's scope, so it was not started. No integration pass is claimed for `d05b29e` **locally**. The migration/ledger code path itself is untouched by this commit — the diff is confined to two workflow files, two `scripts/*.mjs`, and three specs — and the same 8 tests passed against this unchanged ledger logic at `303ff06` (audit §7).
- The **full unit suite** was run locally and showed contention flakiness (6 failures on one pass, 1 on another, across `shipping/*`, `webhook-rate-limiting` and `render-api`); every one of those files passes when run individually (131/131), and all are tracked and unmodified by this commit. This workstation's whole-suite runs are therefore not the authoritative evidence; the hosted `Unit Tests + Coverage Gates` job is (§9).
- Consequently the integration claim in this report is limited to: **no local integration evidence at this head; the authoritative integration pass is the hosted `Integration Tests` job — success, 9m 10s, at run #429 (§9.1)** — which runs the entire `src/__tests__/integration` tree, release-pipeline specs included, against a disposable PostGIS service container rather than a developer machine.

---

## 9. Hosted CI verification of the hardening head

**One push carried both commits, so one run covers both.** `d05b29e…` (the code) and `87f5589…` (this report plus the three document updates) were pushed together as `6a90126..87f5589`; GitHub raised a single `synchronize` event for PR #106 whose head is the docs commit. There is therefore **no separate hosted run for `d05b29e`** — the run below executed a tree that contains the hardening, which is the evidence this section was written to produce.

| Field | Value |
| --- | --- |
| Run | **#429** — https://github.com/nabeel2323/scs-platform/actions/runs/41984518789 (numeric run id `41984518789`) |
| Workflow / event | `.github/workflows/ci.yml` · `pull_request` / `synchronize`, PR #106, branch `feature/automated-release-pipeline-v2.1` |
| PR head SHA | `87f558958e68ca50b2d4c5cae532a38f34b67f98` (parent — the hardening itself: `d05b29e12443a20572d48f95c66c279080ca0264`) |
| Conclusion | **success** · **11 jobs: 9 success, 2 skipped, 0 failures** · started `2026-11-05T07:03:14Z`, last job completed `07:22:33Z` (run `updated_at` `07:22:34Z`), total duration **19m 20s** · 1 artifact · no remediation commits were required |
| `trigger-staging-release` | **skipped** (API conclusion `skipped`, job id `127109278641`, started and completed at `07:22:33Z` — i.e. the instant the last mandatory job finished). Its five inner `release.yml` jobs (`validate`, `database-release`, `deploy`, `health-check`, `summary`) appear in the graph only as not-run placeholders and are absent from the run's job list, because the reusable workflow never started. See §9.2 — this is **not** release evidence. |
| Previous head | run **#428** (id `41870206868`, 17m 49s) covered `6a90126`, i.e. the branch *before* the hardening. It is the control, not the verification. |

### 9.1 Job-by-job results at head `87f5589`

Conclusions, durations and job ids below were read from the rendered run page and then cross-checked against `GET /repos/nabeel2323/scs-platform/actions/runs/41984518789/jobs` (2026-11-05, 11 jobs, matching exactly). Timestamps are the API's `started_at` → `completed_at` in UTC.

| `ci.yml` job | Conclusion | Duration | Window (UTC) | Job id |
| --- | --- | --- | --- | --- |
| Lint & Typecheck | **success** | 2m 19s | 07:03:16 → 07:05:35 | [127102032595](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102032595) |
| Mobile (flutter analyze · test) | **success** | 53s | 07:03:16 → 07:04:09 | [127102032379](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102032379) |
| Unit Tests + Coverage Gates | **success** | 6m 14s | 07:05:37 → 07:11:51 | [127102902618](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102902618) |
| Integration Tests | **success** | 9m 10s | 07:05:37 → 07:14:47 | [127102901882](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102901882) |
| Migration Full Apply | **success** | 50s | 07:05:37 → 07:06:27 | [127102901937](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102901937) |
| Boundary Lint (E6) | **success** | 20s | 07:05:37 → 07:05:57 | [127102901910](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127102901910) |
| Build | **success** | 1m 7s | 07:14:49 → 07:15:56 | [127106323980](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127106323980) |
| Contract Spec & Codegen | **success** | 35s | 07:14:49 → 07:15:24 | [127106323910](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127106323910) |
| Container Build & Smoke Test | **success** | 7m 43s | 07:14:50 → 07:22:33 | [127106323996](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127106323996) |
| k6 Smoke Test | **skipped** (main-only, `ci.yml:401-404`) | 0s | 07:15:57 → 07:15:57 | [127106758853](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127106758853) |
| Trigger Staging Release (`uses: ./.github/workflows/release.yml`, `if:` at `ci.yml:561-564`) | **skipped** | 0s | 07:22:33 → 07:22:33 | [127109278641](https://github.com/nabeel2323/scs-platform/actions/runs/41984518789/job/127109278641) |

Two readings that a passing run can hide:

- **The single "error" annotation on this run is not a failure.** The run page reports "1 error, 24 warnings, and 4 notices"; the error is `Process completed with exit code 1` at `Lint & Typecheck` **step 8**, which is `pnpm format:check` — declared `continue-on-error: true` at `.github/workflows/ci.yml:109-110` precisely because of the repo's pre-existing CRLF/Prettier debt. The blocking steps (`pnpm lint`, `pnpm typecheck`) are what make the job green, and the job is green. The warnings are `no-unused-vars` in untouched files such as `apps/api/src/__tests__/integration/catalog-lifecycle.e2e.spec.ts`; §8.4 records the same local picture (0 errors, 313 warnings).
- **`Integration Tests` and `Unit Tests + Coverage Gates` passing here is what closes §8.5.** The local Docker daemon was unavailable, so the integration evidence for this head is hosted, not local — and the hosted job runs the whole `src/__tests__/integration` tree (`.github/workflows/ci.yml:235`, `pnpm --filter @scs/api test:integration`) against a `postgis/postgis:16-3.4` service container, which includes `integration/release-pipeline/verify-migration-ledger.spec.ts`. The unit job runs the coverage-gated `src/__tests__/unit` tree, which includes all eight release-pipeline specs and therefore the 112 tests of §8.2. The `trigger-staging-release` caller job sits at `.github/workflows/ci.yml:557` with its `if:` at `:561-564` (`push` + `refs/heads/develop` + this repository), eight mandatory `needs` at `:565-573` and its `uses:` at `:574`. That `if:` is false on a `pull_request`, which is why the job is skipped here and why it would run on a develop push.

### 9.2 What run #429 proves, and what it does not

**Proves:** GitHub parses and schedules both rewritten workflow files — `ci.yml:57-59` (expression `cancel-in-progress`) and `release.yml:114-117` (`staging-release`, `cancel-in-progress: false`, `queue: max`) are accepted, so neither is a workflow-validation error, which is the failure class that stopped run #418 at `startup_failure` with zero jobs. The caller/callee `permissions:` intersection still holds around the rewritten `release.yml`. The mandatory CI surface — lint, typecheck, unit + coverage, integration, migration apply, build, container smoke, contract — is green on top of the hardening, so nothing in §4 broke the repository.

**Does not prove:** that any release job ran. `validate`, `database-release`, `deploy`, `health-check` and `summary` have still never executed anywhere (finding F-5 is unchanged by this run), and the stale-release step in particular did **not** execute here — it lives inside the skipped `trigger-staging-release` job — so its per-path Bash is verified by the mirrored-helper runs of §8.3 and the per-path structural checks of §8.1, not by a runner. The R-1 cancellation behaviour has still only been demonstrated in the *negative* direction (run #424 cancelled a develop-bound release; this change removes the cancellation from that ref). Reading #429 as staging verification would be exactly the conflation this report exists to prevent.

### 9.3 The record commit's own run (#430), and where the recording stops

This section is itself a commit, so the head it lands on is no longer `87f5589`. That new head was verified too, and the fact is recorded here rather than left implied:

| Field | Value |
| --- | --- |
| Run | **#430** — https://github.com/nabeel2323/scs-platform/actions/runs/41990496036 (id `41990496036`) |
| Head SHA | `da89aaf03def6d88f25f84c549c8011183bbd188` — *docs(release): close the hosted-CI record for the safety hardening (run #429)*: 4 markdown files, +96/−22, no workflow, script, test or configuration file touched |
| Conclusion | **success** · 11 jobs: 9 success, 2 skipped, 0 failures · `07:54:16Z` → `08:11:40Z` (17m 24s) |
| Jobs | `Lint & Typecheck` 127121307713 · `Mobile` 127121306986 · `Unit Tests + Coverage Gates` 127122156065 · `Integration Tests` 127122155721 · `Migration Full Apply` 127122155853 · `Boundary Lint (E6)` 127122155755 · `Build` 127125292333 · `Contract Spec & Codegen` 127125292412 · `Container Build & Smoke Test` 127125292411 — all success; `k6 Smoke Test` 127125868709 and `Trigger Staging Release` 127128094812 — both skipped |
| PR state at the same API read | `open`, `merged: false`, `mergeable: true`, `mergeable_state: clean`, base `develop` at `b11638b`, 19 commits |

Two things worth naming rather than glossing. First, #430 re-verifies the *same* workflow files as #429 — the only difference is prose — so it adds nothing to what the hardening proves; it is the evidence that recording the evidence broke nothing. Second, **this is where the recording stops.** The commit carrying §9.3 will itself start a run, and that run is deliberately not written into this document: doing so would require another commit, which would require another run. The convention adopted here is that §9 is authoritative for the head carrying the code (`87f5589`, run #429) and for the head carrying this record (`da89aaf`, run #430), and the CI status of any later **markdown-only** commit is reported to the reviewer in the handoff message rather than chased into the file. A later commit that touches `ci.yml`, `release.yml`, the validator or any spec must restart the chain and get its own recorded run.

---

## 10. Authorization boundary for this task

Performed: read-only inspection of the workflows, helpers, `apps/api` docs; local edits to the 7 code/test files in `d05b29e`; local validator/unit/typecheck/lint/build runs; the fabricated-state helper executions in §8.3 (stubbed `gh`, no network writes); documentation edits and commits on `feature/automated-release-pipeline-v2.1`; push to that branch only.

Not performed: PR #106 was **not** merged; nothing was pushed to `develop` or `main`; no force-push; no GitHub environment, secret or variable was created, modified or read; no `workflow_dispatch` and no staging release was triggered; **zero** Render API calls; no staging migration, seed or database write (container and CI databases only); no Render setting was read or changed; unrelated working-tree changes (`apps/api/src/modules/returns/*`, `docs/production/P13-*`) remain unstaged and untouched.
