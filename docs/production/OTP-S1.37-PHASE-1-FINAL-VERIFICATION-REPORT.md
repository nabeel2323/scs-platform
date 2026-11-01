# OTP-S1.37 Phase 1 — Final Verification Report

- **Document ID:** OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT
- **Sprint:** S1.37 — Phase 1 Independent Audit, Corrections and Final Acceptance
- **Date:** opened 2026-10-31, closed 2026-11-01 (local time, UTC+03:00); the post-commit re-verification of §4.8 ran on 2026-11-01
- **Companion documents:** [`…-INDEPENDENT-AUDIT-REPORT.md`](./OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md)
  (findings F-01 … F-20), [`…-MIGRATION-AND-ROLLBACK-RUNBOOK.md`](./OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md)
- **Verdict:** see §9 — **NOT COMPLETE — BLOCKED**

---

## 1. Commit identity

| Item                                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                           | `c:\TAIF\scs-platform`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Branch                               | `feat/auth-email-otp-phase1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Baseline (starting) commit, audited  | `2abb53881c87724c338e2a2a94b8e9be78e70c23`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Baseline relationship to `develop`   | identical to `origin/develop` — the Phase 1 work was **uncommitted** at audit start (finding F-01)                                                                                                                                                                                                                                                                                                                                                                                          |
| **Audited final SHA (code)**         | `5581e6a46d4705c21a97cc941a696896f8f7973e` — Phase 1 source, migration, tests, contracts, CI, lockfile and the web client. 51 paths, each staged by explicit name (§4.7); `51 files changed, 9523 insertions(+), 176 deletions(-)`                                                                                                                                                                                                                                                          |
| Publication SHA (docs only)          | `00f59dedd1f54f75c76cb1cd0b24d9ccb6a0721f`, the documentation-only commit immediately following `5581e6a46d4705c21a97cc941a696896f8f7973e`: the three S1.37 reports, the corrected S1.35 runbook and the two S1.35 supersession banners. Further documentation-only commits append §4.7–§4.9 below. None of them contains any source, migration, test, contract or CI change, so the audited source tree is byte-identical at all of these SHAs                                             |
| Why the last docs SHA is not printed | a commit cannot contain its own hash, so the tip documentation commit is necessarily unnamed here; its predecessor can be and is named above. Verify the branch tip with `git rev-parse feat/auth-email-otp-phase1`, then confirm that everything above `5581e6a…` is documentation with `git diff --name-only 5581e6a46d4705c21a97cc941a696896f8f7973e..HEAD`, which must list only `docs/production/*`. That command was executed and returned exactly the six audit and report documents |
| Remotes touched                      | none. No push, no PR, no merge, no deploy                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Every test figure in this report was executed against the working tree that became
`5581e6a46d4705c21a97cc941a696896f8f7973e`. That tree was frozen before the long-running suites were started: the only source
edit made while they ran was a Prettier-format pass on the drift-guard spec, and typecheck, lint,
the full unit suite, the contract pipeline and the drift guard were all **re-executed after it**
(§3, §4.1, §4.5), so the published figures describe the committed tree exactly. This was
verified mechanically after the commit: `git diff HEAD --name-only` over the 51 committed paths
returned **no files**, and the commit's own tree was re-checked for self-containment
(`COMMIT_SELFCONTAIN=OK`, §4.7).

---

## 2. What Section 4 of the mandate asked, and the arithmetic error

The S1.35 verification report published this table:

| Category          | Suites         | Tests      |
| ----------------- | -------------- | ---------- |
| Unit tests (full) | 117 files      | 2 205      |
| New unit tests    | 8 files        | 97         |
| Integration tests | 5 files        | 55         |
| Security tests    | 1 file         | 17         |
| Migration tests   | 1 file         | 18         |
| **TOTAL**         | **124+ files** | **2 392+** |

**The 97 "new unit tests" are already inside the 2 205.** The full unit command
(`vitest run src/__tests__/unit`) discovers and executes every file under `src/__tests__/unit`,
which is where all eight new suites live. Adding them again double-counts 97 tests, and the
"2 392+" total is therefore wrong on its own terms: `2 205 + 97 + 55 + 17 + 18 = 2 392`.

Correct unique total **at that snapshot**: `2 205 + 55 + 17 + 18 = 2 295`.

Secondary inaccuracies in the same table, verified now:

1. _"Unit tests (full) … Duration ~45 s"_ — the deterministic serial run takes **175 s**; ~45 s is
   the wall clock of the parallel run, which is **not** a reliable measurement (see §4.2).
2. _"Integration tests 5 files / 55 tests"_ — the Phase 1 integration surface is **7 files**
   (`registration-flows` and `password-login-regression` were omitted from the count) and the
   repository-wide integration suite is 80 files.
3. _"Build — 420 files compiled"_ — the audited build compiles **421** files.
4. _"Lint — Warnings 331 (all pre-existing)"_ — measured 328 before the F-05 remediation and
   **322** after it; the direction of the claim ("all pre-existing") is right but the number was
   stale.
5. The total is presented as a pass count with **no exit codes and no command lines**, so it cannot
   be tied to a commit. Every figure below carries the command, the exit code and the duration.

---

## 3. Reconciled, non-double-counted totals (audited final code)

| #   | Category                                                                  | Command (as executed)                                                                                                      | Files   | Tests                          | Passed  | Failed | Skipped | Exit       | Duration    |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ------- | ------ | ------- | ---------- | ----------- |
| 1   | **Full API unit suite** (deterministic)                                   | `pnpm --filter @scs/api exec vitest run src/__tests__/unit --no-file-parallelism`                                          | 118     | **2 308**                      | 2 308   | 0      | 0       | **0**      | 158.6 s     |
| 2   | _— of which Phase 1 unit suites (subset, not additive)_                   | explicit 16-file list, `--no-file-parallelism`                                                                             | 16      | **335**                        | 335     | 0      | 0       | **0**      | 41.87 s     |
| 3   | _— of which the contract drift guard (subset)_                            | `vitest run src/__tests__/unit/contracts-phase1.openapi.spec.ts`                                                           | 1       | 58                             | 58      | 0      | 0       | **0**      | 1.02 s      |
| 4   | **Full API integration suite** (disposable PostgreSQL + disposable Redis) | `pnpm --filter @scs/api test:integration` with `REDIS_IT=1`, `REDIS_URL=redis://127.0.0.1:16479`, `REDIS_DISPOSABLE_ACK=1` | `80`    | `1 570`                        | `1 570` | `0`    | `0`     | `0`        | `1 493.9 s` |
| 5   | _— of which Phase 1 + real-Redis integration subset_                      | explicit 8-file list, `--no-file-parallelism`                                                                              | 8       | **131**                        | 131     | 0      | 0       | **0**      | 230.15 s    |
| 6   | Lint                                                                      | `pnpm --filter @scs/api lint`                                                                                              | —       | 0 errors / 322 warnings        | —       | —      | —       | **0**      | 13.6 s      |
| 7   | Typecheck (API)                                                           | `pnpm --filter @scs/api typecheck`                                                                                         | —       | 0 issues                       | —       | —      | —       | **0**      | 9.1 s       |
| 8   | Typecheck (workspace, turbo)                                              | `pnpm typecheck`                                                                                                           | 9 tasks | 9 successful                   | 0       | —      | —       | **0**      | 30.5 s      |
| 9   | Build (API)                                                               | `pnpm --filter @scs/api build`                                                                                             | —       | 421 files                      | —       | —      | —       | **0**      | 23.3 s      |
| 10  | Contract generation                                                       | `pnpm --filter @scs/contracts build` → `generate` → `generate:ts`                                                          | —       | 15 paths, 21 component schemas | —       | —      | —       | **0** (×3) | —           |

**Unique tests executed on the audited code = 2 308 (unit, already including the 335 Phase 1
tests) + 1 570 (integration, already including the 131-test Phase 1 subset)
= 3 878.**

Rows 2, 3 and 5 are _subsets_ and are never added. Rows 6–10 are not test counts and are not added.

### 3.1 What a clean CI checkout of the committed tree will report

The 3 878 above was measured on the **working tree**, which still contains untracked spec files from
other workstreams that this commit deliberately excludes. CI checks out only the commit, so its
numbers will be lower, and the difference is computed rather than guessed:

| Suite                | Local working tree | Excluded untracked specs                                                                                                   | Expected on the commit |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Full API unit        | 118 files / 2 308  | `common/proxy-topology-cloudflare-chain` (7), `common/proxy-trust-behavior` (8), `common/redis-throttler-storage` (7) = 22 | 115 files / **2 286**  |
| Full API integration | 80 files / 1 570   | `p13a-oq04-option-c-commission` (11), `p13a1` (6), `p13a2-workflow` (2), `p13a2-concurrency` (7), `p13a3` (12) = 38        | 75 files / **1 532**   |
| **Unique total**     | **3 878**          | 60                                                                                                                         | **3 818**              |
| Phase 1 unit subset  | 16 files / 335     | none — every Phase 1 spec is committed                                                                                     | 16 / **335**           |
| Phase 1 integration  | 8 files / 131      | none                                                                                                                       | 8 / **131**            |

Per-file counts were taken from the runs' own output: the Vitest summary table of the serial unit
run (transcribed in §4.1) and the `apps/api/.vitest-integration-results.json` artifact that the
canonical integration command writes, parsed over all 80 result records (which independently
re-confirms 80 files / 1 570 assertions). No Phase 1 test is lost in a clean checkout, which is the
point of recording this: the CI number will differ from 3 878 **only** by unrelated workstreams, and
a reviewer can predict it exactly. This is blocker B-2's quantified form.

---

## 4. Command-level evidence

**Retention note.** The raw console logs and JSON reports from these runs were written to
`.audit-scratch/` at the repository root. That directory belongs to **no** commit: the `*.log` files
inside it are covered by `.gitignore:37`, and the directory itself is the single untracked entry
`?? .audit-scratch/`. It was scanned across all 109 of its files for credential-shaped content
(JWT-prefixed strings, `redis://user:pass@`, `smtp://user:pass@`, long bearer tokens) and returned
zero matches. Deleting it is safe and is recorded as a one-command operator action
(`Remove-Item -Recurse .audit-scratch`) rather than claimed as done, because bulk directory removal is
outside the file operations this audit is permitted to perform. **No claim in these reports depends on
any file in it:** the decisive lines — exact command, counts, exit code, duration — are transcribed
below, and every command is given verbatim so that any figure can be reproduced from the committed
tree. The generated `apps/api/.vitest-integration-results.json` was deleted (§4.7).

### 4.1 Full unit suite, deterministic

```
> pnpm --filter @scs/api exec vitest run src/__tests__/unit --no-file-parallelism

 Test Files  118 passed (118)
      Tests  2308 passed (2308)
   Duration  158.60s
UNIT_EXIT=0
```

Exit code `0`. No failures, no skips. Re-measured on the exact final tree; the same command on the
tree immediately before the last Prettier-format pass on the drift-guard spec reported the identical
118 files / 2 308 tests in 175.45 s, so the duration difference is measurement noise, not a
behaviour change.

### 4.2 Why the unit suite had to be re-measured serially

The S1.35 report's ~45 s parallel figure came from `pnpm --filter @scs/api test:unit`, which runs
files in parallel. Executed under normal machine load that command produced:

```
Test Files  1 failed | 117 passed (118)
     Tests  1 failed | 2287 passed | 8 skipped (2296)
Exit code  1
```

— `webhook-rate-limiting.spec.ts` exceeded its 15 s per-test timeout, and
`m724a-concurrency.spec.ts` reported 8 skips. Both are **load-induced flakes in suites unrelated to
Phase 1**, not source defects: with `--no-file-parallelism` the same 118 files execute 2 308 tests
with zero failures and zero skips (§4.1). The audit therefore reports the serial number as the
authoritative one and records that **the parallel command is not an acceptance-grade measurement
on this machine**. This distinction was not present in the original evidence.

### 4.3 Phase 1 + real-Redis integration subset

```
> pnpm --filter @scs/api exec vitest run <8 explicit spec paths> --no-file-parallelism
  (env: REDIS_IT=1, REDIS_URL=redis://127.0.0.1:16479, REDIS_DISPOSABLE_ACK=1)

 Test Files  8 passed (8)
      Tests  131 passed (131)
   Duration  230.15s
EXIT=0
```

| Spec                                             | Tests | What it proves                                                                                                                                                                  |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migration-0064-email-identity.postgres.spec.ts` | 32    | fresh apply, data preservation, CHECK/blank-email rejection, whitespace-variant uniqueness, preflight normalization match, abort atomicity, forward-fix policy, rerun semantics |
| `email-otp-security.postgres.spec.ts`            | 18    | enumeration shape, per-email and per-IP limits, supersession, replay, concurrent-verify single winner, redaction, mock isolation                                                |
| `password-login-regression.postgres.spec.ts`     | 17    | phone-only / email-only / dual-identifier login, enumeration resistance, hashed audit records                                                                                   |
| `email-otp-e2e.postgres.spec.ts`                 | 16    | request → deliver → verify → JWT; flag 404; TTL                                                                                                                                 |
| `account-linking.postgres.spec.ts`               | 16    | proof of control on both identifiers, conflict detection, optimistic-lock race, 23505 → 409 translation, hashed audit                                                           |
| `phone-otp-regression.postgres.spec.ts`          | 11    | backward compatibility of the pre-Phase-1 phone path                                                                                                                            |
| `otp-redis-lua.real.spec.ts`                     | 12    | `ACQUIRE_RATE_LIMIT`, `CREATE_CHALLENGE`, `CLEANUP_CHALLENGE`, `VERIFY_AND_CONSUME` against a **real** Redis server                                                             |
| `registration-flows.postgres.spec.ts`            | 9     | email-only registration, dual-identifier linking, refusal without proof of control                                                                                              |

The `phone-otp-regression` count is **11 before and 11 after** the F-05 refactor of `verifyOtp`,
which is the backward-compatibility proof for that change.

### 4.4 Full API integration suite

Executed as `pnpm --filter @scs/api test:integration` (the canonical command, which is
`vitest run src/__tests__/integration --no-file-parallelism --reporter=json
--outputFile=.vitest-integration-results.json && node scripts/assert-redis-suite.mjs …`) against
disposable PostgreSQL (Testcontainers `postgres:16-alpine`) and the disposable Redis on
`127.0.0.1:16479`.

Parsed from the run's own `apps/api/.vitest-integration-results.json` ( Vitest JSON reporter
`success: true`), and from the `assert-redis-suite.mjs` gate that the same command chains:

```
numTotalTests  = 1570      numPassedTests  = 1570
numFailedTests = 0         numPendingTests = 0
test results file count = 80

PASS: otp-redis-lua.real.spec.ts discovered and executed
  Status: passed
  Tests: 12 passed, 0 failed, 0 skipped
PASS: cross-instance-throttling.spec.ts executed (8 passed)
PASS: http-cross-instance-throttling.spec.ts executed (5 passed)
PASS: throttle-ip-isolation.spec.ts executed (3 passed)
PASS: throttle-cleanup-sentinel.real.spec.ts executed (5 passed)
Redis integration gate: PASS

FULL_IT_EXIT=0 S=1493.9
```

Zero skipped assertions across all 80 files, so no suite self-excluded and the Redis gate was
satisfied by real execution against the disposable server.

The four Phase 1-relevant files beyond the eight in section 4.3 that also ran here are the
`identity/*` postgres regressions; the eight Phase 1-relevant integration files and their counts in
this run are identical to the isolated subset (migration-0064 32, email-otp-security 18,
password-login-regression 17, account-linking 16, email-otp-e2e 16, otp-redis-lua.real 12,
phone-otp-regression 11, registration-flows 9 = 131), which is the cross-check that the serial
subset result reproduces inside the full run.

For reference, the same command executed on the tree **before** the F-05 remediation produced
`80 files / 1 566 tests / 0 failed / EXIT=0 / 2 170.03 s` with
`assert-redis-suite.mjs` reporting the Redis gate **PASS** (the real-Redis suite executing, not
skipping — "a skip is not a pass"). That figure is _not_ the audited number and is not used in §3.

### 4.5 Contract pipeline and drift guard

```
> pnpm --filter @scs/contracts build          EXIT=0
> pnpm --filter @scs/contracts generate       EXIT=0   ("15 paths, 21 component schemas")
> pnpm --filter @scs/contracts generate:ts    EXIT=0
```

Verified inside the regenerated artifacts (not merely asserted):

- `packages/contracts/openapi/openapi.json` → `AccountLinkPhone.required == ["phone","otp"]`
- `packages/contracts/generated/api.d.ts` → `AccountLinkPhone: { phone: string; otp: string; }`
- all six Phase 1 routes present with their operation ids and 401/404 responses

The generated artifacts are **git-ignored** (`.gitignore:65-66`), so the drift guard spec is the
tracked evidence; it is regenerated and checked by CI inside the contract job. The whole pipeline
was re-executed after the final Prettier pass on that spec: build / generate / generate:ts all
`EXIT=0`, artifacts unchanged, drift guard `58 passed (58)`, `EXIT=0`, 1.02 s.

### 4.6 Migration behaviour probes

Probes R1a, R1b, R1c, R2, R2c, R3, R4, R4b and R5 recorded in runbook §11 were executed against a
throwaway `docker run --rm postgres:16-alpine` (`audit-pg-0064`, port 25599, removed at the end of
the audit) driven through the **actual** runner semantics (`BEGIN;` + file + `_migration_log` insert

- `COMMIT;`, `psql -v ON_ERROR_STOP=1`). Headline results:

| Probe                             | Observed                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| First apply                       | `EXIT=0`; statements `BEGIN / SET / DO / DO / ALTER TABLE / DO / DO / CREATE TABLE / CREATE INDEX / CREATE INDEX / INSERT 0 1 / INSERT 0 1 / COMMIT` |
| Blind rerun through the wrapper   | `EXIT=3`, `duplicate key value … "_migration_log_pkey"`, full rollback; afterwards 1 log row / 1 index / 1 constraint / 1 flag — no damage           |
| Bare rerun of the file            | `EXIT=0`, all statements no-ops                                                                                                                      |
| Duplicate or blank email present  | apply aborts; afterwards `phone` still `NOT NULL`, no constraint, no index, 0 `_migration_log` rows, users intact                                    |
| rev.1 end state upgraded by rev.2 | `EXIT=0`; **both** the CHECK and the index rebuilt to the rev.2 definitions                                                                          |

Lock semantics verified: `CREATE INDEX CONCURRENTLY` is rejected inside the runner transaction, so
the index is ordinary `CREATE UNIQUE INDEX` under `ACCESS EXCLUSIVE` on `users`, bounded by
`SET LOCAL lock_timeout = '5s'`.

### 4.7 Commit construction and clean-checkout self-containment

The mandate forbids blanket staging, so both commits were built from explicit path lists (51 code
paths, 6 documentation paths) and staged with explicit `git add` invocations — never `git add -A`,
never `git add .`.

Before committing, the staged set was checked for the failure class that makes a locally green suite
red in CI: a committed source file importing a helper that was never tracked. The checker resolves
every relative `from '…'`, `require('…')`, `import('…')` and relative `.sql`/`.json`/`.mjs`/`.cjs`
literal in all 57 batch files against the working tree, and accepts a target only if it is already in
the Git index **or** is itself in the batch:

```
batch size            = 57
tracked (index) size  = 2627
ignored in batch      = []
not dirty (already clean or unknown) = []
hard problems         = []
unstaged dependencies = []
SELFCONTAIN_EXIT=OK
```

Three facts that are easy to miss and would each have broken CI are recorded explicitly:

1. `apps/api/src/__tests__/unit/helpers/mock-redis.ts` is **untracked** yet imported by 12 Phase 1
   specs (6 under `unit/identity/`, 6 under `integration/*.postgres`), so it is committed even though
   it is not a feature file.
2. `IdentityService` gained a required `ProviderRegistryService` constructor parameter, so **six
   pre-existing specs** (`identity.sessions`, `identity.add-org-member`, `identity.deactivate-org`,
   `identity.n-plus-one`, `identity.org-update-request`, `auth/token-revocation`) each carry a
   `+ { getMockProvider: () => null } as any` argument. They are modified tracked files and belong to
   this commit for exactly that reason, not as unrelated drift.
3. `apps/api/scripts/assert-redis-suite.mjs`, which `test:integration` chains, **is** already
   tracked, so the real-Redis gate will run in CI; the unused probe `apps/api/scripts/check-redis.mjs`
   is untracked and referenced by nothing, so it was deliberately left out.

`git status --porcelain -- infra/` confirms `0064_email_identity.sql` is the only untracked file under
`infra/drizzle/`, so the migration-directory scan performed inside the postgres specs resolves
completely in a clean checkout. `infra/audit/` and `infra/deploy/nginx.conf.template` are untracked
but belong to unrelated work and are excluded.

**Housekeeping item found while constructing the commits (no finding number, LOW).** The canonical
`test:integration` command writes `apps/api/.vitest-integration-results.json`, and
`git check-ignore` returns exit 1 for it: the file is untracked **and not** `.gitignore`d. Anyone
staging with `git add -A` would therefore commit a machine-local test report. The exact action is to
add `.vitest-integration-results.json` to `.gitignore` in a housekeeping commit; it was deliberately
not done here, because that edit belongs to the code commit that had already been made and frozen,
and a `.gitignore` line is not evidence for any Phase 1 criterion. The audit deleted its own copy of
the file (`DeleteFile`, confirmed gone from the working tree) and left no trace in any commit.

### 4.8 Re-verification executed **after** the commit, on the committed tree

A first-run suite proves the working tree; it does not prove that the commit contains what was
tested. After `5581e6a…` and the documentation commit `00f59de…` existed, the authoritative checks
were re-executed from the repository in its committed state (`git diff HEAD --name-only` over the 51
committed paths returned no files, so the working tree _was_ the commit). Every figure published
above was reproduced:

| Check                                   | Command                                         | Result                                         | Exit | Duration |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ---- | -------- |
| API typecheck                           | `pnpm --filter @scs/api typecheck`              | `Found 0 issues`                               | `0`  | 21.3 s   |
| API lint                                | `pnpm --filter @scs/api lint`                   | `322 problems (0 errors, 322 warnings)`        | `0`  | 14.6 s   |
| Full unit suite                         | `pnpm --filter @scs/api test:unit`              | `118 passed (118)` files, `2308 passed (2308)` | `0`  | 62.6 s   |
| Contract build / generate / generate:ts | `pnpm --filter @scs/contracts build …`          | `15 paths, 21 component schemas`               | `0`  | each     |
| Contract drift guard                    | `vitest run …/contracts-phase1.openapi.spec.ts` | `58 passed (58)`                               | `0`  | 2.2 s    |
| API build                               | `pnpm --filter @scs/api build`                  | `Successfully compiled: 421 files`, 0 issues   | `0`  | 17.4 s   |
| Phase 1 + real-Redis integration subset | the 8 specs of §3 run serially                  | `8 passed (8)` files, `131 passed (131)`       | `0`  | 155.3 s  |

The unit re-run was executed without `--no-file-parallelism` and still produced exactly
2 308 tests in 118 files in 62.6 s, against the 158.6 s serial run of §4.1. Same counts, different
wall time: that is the cross-check that the serial figure was not an artifact of ordering.

**Persistent Redis, verified untouched.** The §6 claim that the shared `scs-redis` instance was never
used is now evidenced rather than merely asserted: `docker inspect scs-redis` reports
`running=false`, `FinishedAt=2026-10-30T13:06:36Z` and `RestartCount=0`, i.e. the container was
already stopped more than a day before this audit's test runs began and was never started or
contacted. Every real-Redis assertion ran against `scs-s137-disposable-redis`, re-verified at
removal time as `name=/scs-s137-disposable-redis`, `image=redis:7-alpine`, published to
`127.0.0.1:16479` only. The migration probes ran against `audit-pg-0064`
(`postgres:16-alpine`, host port 25599). Both were re-verified by `docker inspect` immediately before
removal — name, image and port binding all matching — and only then removed
(`docker rm -f scs-s137-disposable-redis` and `docker rm -f audit-pg-0064`, both exit 0). No other
container was stopped: `scs-redis`, `scs-postgres`, `scs-minio`, `scs-mailhog` and the two leftover
`postgis/postgis:16-3.4` test containers are in the same state they were found in.

### 4.9 Self-review of the audit's own deliverables

The mandate requires reviewing the changes just made, so the three reports were checked mechanically
rather than read persuasively. Five checks, each with a concrete defect or a clean result:

| Check on the deliverables                                                                                      | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table shape: every row of every table has as many cell separators as its header                                | **one real defect found and fixed.** The runbook's §3 prerequisites row for “0063 applied” had been split across two physical lines by an earlier in-place edit and named a file that does not exist (`0063_…_inventory_reserved.sql`). It now names `0063_phase4_operational_readiness.sql` and states that `_migration_log.name` holds the migration basename (`migrate.ts:71`, `migrate-pg.ts:124`). Runbook change log v2.4. The only remaining flagged row is the deliberate escaped pipe in `phone: string \| null` (finding F-16), which is correct markdown. |
| Stray empty trailing cells produced by fragment-style edits                                                    | two rows acquired an extra empty trailing cell (a doubled cell separator at the end of the row) after a partial-line replacement; both were collapsed and re-verified.                                                                                                                                                                                                                                                                                                                                                                                               |
| Encoding: lone `\r`, `\r\n`, double-encoded em-dashes, replacement characters across all six Phase 1 documents | `loneCR=0`, `crlf=0`, `a-acute=0`, `euro=0`, `replacement=0`, every em-dash present as the correct `E2 80 94` byte sequence. The apparently corrupted characters seen in the console are a CP1252 decoding artifact of the Windows terminal — U+2014 read as three separate latin-1 characters — not file corruption, and this report deliberately quotes no mojibake literal so that the byte-level check stays green on every document in the set.                                                                                                                 |
| Credential scan of the scratch tree (109 files) and of the staged diff                                         | zero matches for JWT-prefixed strings, `redis://user:pass@`, `smtp://user:pass@`, long bearer tokens, Twilio account identifiers or SMTP passwords. The committed `.env.example` change adds commented placeholders only.                                                                                                                                                                                                                                                                                                                                            |
| Formatting of the six documents                                                                                | `prettier --check` exit 0, “All matched files use Prettier code style!”. Repo-wide `pnpm format:check` remains red for unrelated pre-existing reasons (F-18, B-7).                                                                                                                                                                                                                                                                                                                                                                                                   |

Two self-corrections of the same class are worth naming because they were _my_ errors, not the
baseline's: a line count taken with `Measure-Object -Line` reported the withdrawn S1.35 runbook as
88 lines when it is 110 (`-Line` ignores blank lines), and an earlier sentence in this report
described the S1.35 runbook as carrying “a supersession banner, no content rewrite” when it had in
fact been rewritten as a withdrawal notice. Both were found by re-deriving the claim from the file
instead of from memory, and both are corrected above and in audit report §3.2. A third claim of the
same kind was corrected the same way: the audit report stated that exactly 151 unrelated
working-tree entries were preserved, but re-measuring `git status --porcelain` after the last
documentation commit returned a different number, because `.m73b6-scratch/` — the scratch directory of
another workstream — is being written concurrently and contributes untracked entries that move
between observations. A precise figure there is not a meaningful one, so it is now stated as
approximate with the reason. The documentation commit before this one carries the superseded `151`
claim in its message; it is left in history rather than amended away.

---

## 5. Gap tests added by this audit

Each test below was written **because a verified finding had no coverage**, not to inflate a count.

| Finding                          | Test added                                                                                                              | Suite                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| F-03 password-login enumeration  | uniform shape/status assertions for phone-only, email-only and dual-identifier accounts                                 | `password-login-regression.postgres.spec.ts`                                                         |
| F-04 email link proof of control | "refuses to attach an address that was never proven controlled"                                                         | `account-linking.spec.ts`, `account-linking.postgres.spec.ts`                                        |
| F-05 phone link proof of control | phone link describe rewritten 3 → 8 unit tests; integration 2 → 5; refusal-without-challenge case in registration flows | `account-linking.spec.ts`, `account-linking.postgres.spec.ts`, `registration-flows.postgres.spec.ts` |
| F-05 contract                    | DTO accepts `{phone,otp}`; rejects missing `otp`; rejects non-6-digit `otp`                                             | `auth-dto.spec.ts`                                                                                   |
| F-05 forwarding                  | controller forwards `('u8','+966500000001','654321')`                                                                   | `auth.controller.spec.ts`                                                                            |
| F-06 flag gating                 | kill-switch describe asserting 404 on all six routes                                                                    | `auth.controller.spec.ts`                                                                            |
| F-09 contract drift              | 58-assertion three-surface reconciliation, incl. `AccountLinkPhone` required fields and OTP-proof 401s                  | `contracts-phase1.openapi.spec.ts`                                                                   |
| F-11 concurrency                 | case-variant collision the pre-check misses surfaces 409, not 500                                                       | `account-linking.postgres.spec.ts`                                                                   |
| F-13 redaction                   | audit row stores `hashEmail(phone)`, never the digits                                                                   | `account-linking.postgres.spec.ts`, `password-login-regression.postgres.spec.ts`                     |
| F-14 timing                      | 250 ms floor asserted on both the success and the unknown-email branch                                                  | `auth.controller.spec.ts`                                                                            |

Measured evidence for the additions, so the word "gap" is not doing the work of a number:

- Full unit suite: **2 205** (the count S1.35 published) → **2 308** on the audited tree = **+103**.
  Of those, **58** are the brand-new `contracts-phase1.openapi.spec.ts` drift-guard file (untracked
  at audit start, i.e. it did not exist before this audit); the remaining +45 are the per-finding
  cases listed in the table above.
- Inside this audit's own measurement window the deterministic serial count moved **2 296 → 2 308**
  (+12: the F-05 phone-link unit cases and the registration-flow refusal case) and the full
  integration count moved **1 566 → 1 570** (+4: the F-05 integration cases).
- The 2 205 baseline is S1.35's own published figure. Because the whole Phase 1 tree was uncommitted
  at audit start (finding F-01), the +103 cannot be re-derived from `git diff`; it is a
  published-vs-measured delta, and that distinction is recorded here rather than hidden.

Dead code and stale suppressions produced by the remediation were also removed (two unused
`masked` locals, four unused `eslint-disable-next-line` directives, and one unused `hashEmail`
import converted into a real assertion), which is why lint warnings fell from 328 to 322.

---

## 6. Explicitly **not** executed and therefore not claimed

| Item                                                     | Status               | Why                                                                                                                       |
| -------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Real SMTP delivery (any provider)                        | **never executed**   | not authorized; no real credentials exist in this workspace                                                               |
| Real Twilio SMS / WhatsApp Business                      | **never executed**   | not authorized                                                                                                            |
| Staging or production database migration                 | **never executed**   | not authorized; every migration probe ran on disposable PostgreSQL                                                        |
| Persistent / shared Redis (`scs-redis`)                  | **never used**       | the real-Redis suite ran only against `scs-s137-disposable-redis` on `127.0.0.1:16479`; `docker inspect` evidence in §4.8 |
| Placeholder number `+966500000000` as a live destination | **never dialled**    | it appears only as a request body in a non-delivering health check expecting `401`                                        |
| Flutter/Dart client generation                           | **not executed**     | `java` absent; `generate:dart` cannot run here (F-17)                                                                     |
| `boundary-lint` job                                      | **not executable**   | `ts-node` not installed in this workspace (F-18)                                                                          |
| Root `pnpm build`                                        | **failed, `EXIT=1`** | `@scs/admin` / `@scs/web` cannot resolve `react` / `next` in this workspace's store (F-18); `@scs/api` builds clean       |
| `pnpm format:check`                                      | **failed, `EXIT=2`** | repo-wide pre-existing condition (F-18)                                                                                   |
| Production-scale migration timing                        | **not measured**     | lock and index timings were observed on a 2-row table only                                                                |
| CI pipeline on the audited commit                        | **has never run**    | no push is authorized; see §7                                                                                             |

---

## 7. Remaining limitations and blockers

| ID  | Severity                 | Blocker                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                              | Exact action required                                                                                                                                          | Owner               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| B-1 | **CRITICAL (process)**   | The audited code has never passed through CI, and cannot without a push, which this assignment forbids                                                                                                                                                                                                                                                                                                                                            | F-01; `HEAD` == `origin/develop` at audit start; `ci.yml` never executed this tree    | Human decision: push `feat/auth-email-otp-phase1`, let the ten CI jobs run, and reconcile any job that is red in a clean checkout (see B-2)                    | Repository owner    |
| B-2 | **HIGH (fidelity)**      | Local green ≠ checkout green, for two reasons. (a) Eight untracked spec files belonging to other workstreams contributed 60 of the 3 878 tests, so a clean CI checkout of this commit is predicted to report 3 818 (§3.1). (b) Three tracked spec files the suites consumed (`p8-import-hardening`, `p12-independent-runtime-verification`, `webhook-rate-limiting`) carry uncommitted timeout headroom and are deliberately _not_ in this commit | §3.1; audit report §3.3 note; S1.13/S1.15 timeout records                             | Land the 8 untracked specs and the timeout changes in whichever change set owns them, then re-baseline the CI totals. No Phase 1 test is affected either way   | Release engineering |
| B-3 | **MEDIUM (security)**    | F-10 mock-provider fail-open when `NODE_ENV` is unset                                                                                                                                                                                                                                                                                                                                                                                             | `provider-registry.service.ts:62`, `identity.service.ts:454-471`, `api.Dockerfile:68` | Fail closed on unset `NODE_ENV` (or explicit `OTP_MOCK_ENABLED` opt-in) + unit test + re-run notification suites                                               | Auth owner          |
| B-4 | **MEDIUM (design)**      | F-10b `purpose` gives no intent separation                                                                                                                                                                                                                                                                                                                                                                                                        | `purpose` absent from `identity.service.ts`; DTO/OpenAPI wording corrected only       | Decide: remove `purpose`, or implement purpose-scoped challenge keys with tests                                                                                | Architecture        |
| B-5 | **MEDIUM (product)**     | F-17 no client exercises any Phase 1 endpoint; the Dart leg was never generated                                                                                                                                                                                                                                                                                                                                                                   | grep over `apps/web`, `mobile`; no `java` in this environment                         | Build the web/mobile flows, or record "server-side capability only"; run `generate:dart` on a JDK host                                                         | Product + mobile    |
| B-6 | **LOW/MEDIUM (privacy)** | F-19 unsalted deterministic SHA-256 `identifier_hash` is dictionary-reversible                                                                                                                                                                                                                                                                                                                                                                    | `email-normalization.ts:92-97`; four audit write sites                                | Migration 0065 + keyed digest (HMAC with managed secret) + backfill + assertion updates                                                                        | Security            |
| B-7 | **LOW (hygiene)**        | F-18 repo-wide `format:check` red; workspace `pnpm build` red for admin/web                                                                                                                                                                                                                                                                                                                                                                       | `EXIT=2`, `EXIT=1`                                                                    | Dedicated formatting commit; repair the web/admin dependency store                                                                                             | Release engineering |
| B-8 | **ACCEPTANCE**           | No evidence exists for real-provider delivery, staging infrastructure or production-scale migration                                                                                                                                                                                                                                                                                                                                               | §6                                                                                    | Staging-gated canary with `auth.email_otp.enabled = false` first, per runbook §8, executed by authorized personnel — this report does **not** authorize it     | Deployment owner    |
| B-9 | **HIGH (process)**       | F-20: 46 `OTP-S1.*` sprint documents were untracked at audit start, so no earlier sprint's "gate passed at commit Y" claim is reproducible from Git; 6 of them are committed with this change set and ~40 are not                                                                                                                                                                                                                                 | `git status --porcelain -- docs/production` → 85 `??` entries, 46 matching `OTP-S1`   | Commit the remaining sprint documents in their own change sets, and add a check that fails a sprint whose report is still untracked when its code is committed | Repository owner    |

---

## 8. Criterion coverage summary

From audit report §9: of the 28 Phase 1 acceptance criteria —
**17 verified unchanged**, **7 corrected during this audit then verified**
(AC-10, AC-13, AC-19, AC-20, AC-21, AC-24, AC-26), **2 verified with documented caveats**
(AC-11 last-auth guard tests identifiers not factors; AC-12 audit hashing is unsalted),
**1 only partly met** (AC-14 mock isolation fails open on unset `NODE_ENV`) and **1 re-measured**
(AC-28 "full regression passes", whose published total was double-counted). Separately, AC-2, AC-3
and AC-26 are proven reachable through HTTP and the generated TypeScript client only: no shipped
web or mobile screen exercises them (finding F-17).

---

## 9. Final acceptance verdict

# NOT COMPLETE — BLOCKED

Phase 1 is materially stronger than the audited baseline: five HIGH defects (F-01 uncommitted code,
F-02 broken migration atomicity, F-04 and F-05 missing proof of control on account linking, F-06 an
incomplete feature-flag kill switch) were corrected, the migration's idempotency, locking and
normalization claims were re-derived from execution, the verification totals were reconciled without
double counting, the runbook was replaced claim-by-claim, and gap tests were added and executed for
every verified finding (+103 unit tests over the S1.35 published count, including a new 58-test
contract drift guard; §5). All authorized local verification that could be run was run: 2 308 unit
tests and the integration suite pass on the audited tree with exit code 0, lint reports 0 errors,
typecheck is clean, the API builds, and the contract surface now has a mechanical drift guard in CI.
All of those were re-executed **after** the code was committed and reproduced exactly (§4.8), so the
evidence belongs to the commit and not merely to a working tree that no longer exists.

It is nevertheless **not complete**, because acceptance requires findings to be closed and evidence
to exist, and both remain outstanding:

1. **B-1** the audited code has never been executed by CI in a clean checkout, and closing this
   requires a push, which is outside this assignment's authorization.
2. **B-3 (F-10)** a documented security boundary — mock provider isolation from production — fails
   open when `NODE_ENV` is unset, so AC-14 cannot be signed off as met.
3. **B-4 (F-10b)**, **B-5 (F-17)**, **B-6 (F-19)** are unresolved design/product/security decisions,
   each with the required action recorded above, and **B-9 (F-20)** is only partially remediated: the
   Phase 1 code and its six documents now share a commit identity, but ~40 earlier sprint reports are
   still untracked.
4. **B-8** no behaviour involving a real SMTP/SMS/WhatsApp provider, staging infrastructure, or a
   production-scale `users` table has ever been exercised. Local and disposable-infrastructure
   green does not establish that those paths work.
5. **B-2**, **B-7** are fidelity and hygiene gaps that will surface in CI even after B-1 is lifted.

**Nothing in this report should be read as certifying Phase 1 as production-ready or
staging-ready.** The corrected runbook is the authorized procedure for a staging attempt behind
`auth.email_otp.enabled = false`; executing it is a separate, human-approved decision. Phase 2
(TOTP, recovery codes, passkeys) is explicitly **not** started, and this audit produced no design
or code for it.
