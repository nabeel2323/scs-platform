# P13 Phase 4.1 — Stage A: Baseline and Diff Audit

**Date:** 2026-10-14 (local, Asia/Riyadh UTC+03:00)
**Scope:** establish the *actual* repository baseline before any Phase 4.1 implementation, audit the
uncommitted Phase 4 change set, and remediate any Phase 4 regression found.
**Posture:** inspection and preparation only. No deployment, no pilot activation, no production
worker enablement, no commit, no push.

---

## 1. Why this stage exists

Phase 4 closed with `P13-PHASE-4-FINAL-READINESS-REPORT.md` (verdict
`PASS WITH DOCUMENTED LIMITATIONS`). The Phase 4.1 mandate explicitly forbids assuming that report
describes the current tree:

> Do not assume the previous reports describe the current working tree; establish the current state
> from actual commands.

That instruction earned its place. Three things in the Phase 4 reports turned out **not** to describe
the tree at the start of this stage (§4 and §5), and one real defect that Phase 4 believed it had
fixed was still live in the code (§5, F-1).

---

## 2. Repository state (executed)

| Item | Command | Result |
| --- | --- | --- |
| Branch | `git rev-parse --abbrev-ref HEAD` | `develop` |
| HEAD | `git log -3` | `ed6c30f` → `e778d54` → `0187c26` (all 2026-10-14) |
| Remote sync | `git status -sb \| Select -First 1` | `## develop...origin/develop` (no ahead/behind markers) |
| Stash | `git stash list` | empty |
| Modified | `git diff --name-only \| Measure` | **17** files |
| Untracked | `git ls-files --others --exclude-standard \| Measure` | **22** files |
| Diff size | `git diff --stat` | `17 files changed, 609 insertions(+), 108 deletions(-)` |

The three commits newest at HEAD are Phase 3.1.1-era work, not Phase 4 work:

```text
0187c26 feat(admin): add business calendar, commission, reconciliation, return escalation pages
e778d54 feat(api): add financial-correctness permissions and finance approver role
ed6c30f test(migrations): verify existence of migration 0062
```

`0187c26` is the commit that created `apps/admin/src/app/settlement-adjustments/page.tsx` (174 lines).
Phase 4's changes to that page now appear as a 21-line diff against that committed base, which is the
expected relationship.

Everything Phase 4 built is **uncommitted** — verified directly:

```powershell
git ls-tree -r HEAD --name-only | Select-String "p4-operational|p4-http|modules/operations|0063_"
# (no output)
```

Consequence for the rest of this phase: any `git restore`, `git checkout --`, or reset of a tracked
file silently reverts Phase 4 work, and there is no commit to recover from. This is how finding F-2
happened.

### 2.1 Untracked files (22)

| Group | Count | Paths |
| --- | --- | --- |
| Operations module | 11 | `apps/api/src/modules/operations/*.ts` |
| Phase 4 specs | 2 | `p4-operational-readiness.postgres.spec.ts`, `p4-http-authorization.postgres.spec.ts` |
| Migration | 1 | `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` |
| Reports | 8 | `docs/production/P13-PHASE-4-*.md` |

No other untracked path exists in the repository besides these 22, so there is no stray scratch file,
build artifact, or database dump inside the change set.

### 2.2 Modified files (17)

```text
apps/admin/src/app/settlement-adjustments/page.tsx               21 +-
apps/api/src/__tests__/integration/p13-financial-dispute…spec.ts 10 +-
apps/api/src/__tests__/integration/p13-returns…spec.ts           10 +-
apps/api/src/__tests__/integration/p311-concurrency…spec.ts      10 +-
apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts 63 ++-
apps/api/src/app.module.ts                                        4 +
apps/api/src/common/tenant-scope.ts                              31 ++
apps/api/src/drizzle/schema.ts                                    1 +
apps/api/src/main.ts                                              7 +   ← added during Stage A
apps/api/src/modules/audit/audit.schema.ts                        3 +
apps/api/src/modules/audit/audit.service.ts                      13 +
apps/api/src/modules/returns/commission-reversal.service.ts      32 +-
apps/api/src/modules/returns/return-expiration.worker.ts        401 ++-  ← +13 in Stage A
apps/api/src/modules/returns/returns.controller.ts              34 +-
apps/api/src/modules/returns/returns.module.ts                   5 +
apps/api/src/modules/returns/returns.service.ts                 34 +
apps/api/src/modules/returns/settlement-adjustment.service.ts   38 +-
```

Phase 4.1's own edits during Stage A are `main.ts` (+7) and `return-expiration.worker.ts` (+13/−2)
plus two spec refinements; everything else is Phase 4 work.

### 2.3 New-file volume (single measurement method: `split(/\r?\n/).length`)

| Path | Lines |
| --- | --- |
| `operations/ops-alert.service.ts` | 421 |
| `operations/p13-monitor.service.ts` | 590 |
| `operations/worker-lease.service.ts` | 322 |
| `operations/pilot-control.service.ts` | 300 |
| `operations/operations.controller.ts` | 201 |
| `operations/ops-control.service.ts` | 182 |
| `operations/p13-ops.config.ts` | 139 |
| `operations/operations.schema.ts` | 107 |
| `operations/ops-counters.ts` | 89 |
| `operations/raw-result.ts` | 72 |
| `operations/operations.module.ts` | 37 |
| **operations module total (11 files)** | **2,460** |
| `p4-operational-readiness.postgres.spec.ts` | 1,113 |
| `p4-http-authorization.postgres.spec.ts` | 1,206 |
| `0063_phase4_operational_readiness.sql` | 177 |
| Phase 4 reports (8 files) | 2,229 |

> Phase 4's reports quote 2,449 lines for the module and 176 for the migration. Those came from a
> byte-oriented count; the numbers above are line counts of the same files measured one way. The
> difference is a counting method, not a content change.

---

## 3. Migration baseline (executed)

```powershell
docker exec scs-postgres psql -U scs -d scs_platform -c "select count(*) as migrations, max(name) as tip from _migration_log;"
```

```text
 migrations |                  tip
------------+---------------------------------------
         63 | 0063_phase4_operational_readiness.sql
```

`infra/drizzle/migrations/` contains `0001_identity.sql` … `0063_phase4_operational_readiness.sql`, and
the log confirms all 63 are applied to the development database. How the repository applies them
(needed again in Stages D and G):

| Runner | Invoked by | Behaviour |
| --- | --- | --- |
| `apps/api/infra/drizzle/migrate-pg.ts` | `pnpm db:migrate` **and** `pnpm --filter @scs/api db:migrate:ci` (CI) | Connects via `DATABASE_URL`, creates `_migration_log` itself, applies each unapplied `.sql` in sorted order in its own transaction, inserts the log row, `ROLLBACK` + `exit 1` on failure. Supports `--dry-run`. |
| `apps/api/infra/drizzle/migrate.ts` | nothing (no package.json script) | Shells out to `docker exec scs-postgres psql`. |

Both exclude `0013_analytics.sql` and `0018_analytics_retention.sql` because `pg_partman` is not in
`postgis/postgis:16-3.4`. The Phase 4 specs repeat the same exclusion list, so the three paths stay in
step — a change to one must be mirrored, which is why Stage D adds an enforcing check.

## 4. Phase 4 claims versus the tree

The Phase 4 reports describe release-gate wiring that **does not exist** in the working tree:

| Phase 4 claim | Current tree | Evidence |
| --- | --- | --- |
| CI `test-integration` job runs the two Phase 4 specs | **absent** | `Select-String ci.yml -Pattern "p4-"` → no matches |
| CI pins the migration tip (`MIG-B: 0063 is the tip`) | **absent** | `Select-String ci.yml -Pattern "0063|MIG-B"` → no matches |
| `pnpm --filter @scs/api test:p4-coverage` documented command | **script does not exist** | `apps/api/package.json` has no `test:p4-coverage` |

`git log --oneline -6 -- .github/workflows/ci.yml` shows the workflow was last touched at `16982f9`
(M6.1 era), and `git diff -- .github/workflows/ci.yml` is empty — so these edits were neither
committed nor preserved in the tree; they were discarded when HEAD moved.

**Disposition.** This is not a financial or security-control failure, so it is not a stop-ship defect,
but it *is* a missing release gate, and the Phase 4 reports overstate what is in place. Stage D
re-implements the gates properly (and Stage A adds a regression test so that losing them again becomes
a test failure rather than a documentation lie). The Phase 4 reports are historical records and are not
rewritten; the discrepancy is recorded here instead.

## 5. Findings register

Severity is judged against the stated Phase 4.1 scope (deployment foundation and release gates), not
against general security theory.

| ID | Finding | Severity | Action |
| --- | --- | --- | --- |
| **F-1** | `app.enableShutdownHooks()` was **never wired**. `grep` over `apps/api/src` → 0 occurrences. The worker implements `onModuleDestroy()` and releases its lease there (KS-10 tested it), but Nest only invokes lifecycle hooks on `SIGTERM`/`SIGINT` when this call is present. In a container, `docker stop` would therefore leave `worker_leases` pointing at a dead holder and force every takeover to wait out the TTL. | **High — worker exclusivity** | **Fixed in Stage A** (§6): `main.ts` now calls it; `onModuleDestroy()` is `async` and awaited. |
| **F-2** | Phase 4 CI gates and `test:p4-coverage` absent (§4). | Medium — release gate | Restore in Stage D; guard with a regression test in Stage C/D. |
| **F-3** | Development database credential **value** embedded in a Phase 4 report (`P13-PHASE-4-BASELINE-AND-GAP-ANALYSIS.md:87`). | Low — hygiene (dev-only credential) | Redacted in place (§6). |
| **F-4** | `DatabaseService` falls back to a **hard-coded dev DSN with an embedded password** when `DATABASE_URL` is unset (`database.service.ts:15` → `postgresql://scs:…@127.0.0.1:15432/scs_platform`). In a misconfigured production container this boots and fails a connection attempt instead of refusing to start. | Medium — startup safety | Stage C: extend the existing `env-gate.ts` production gate to require `DATABASE_URL` outside development/test. |
| **F-5** | **Nothing loads `.env`.** No `dotenv`, no `@nestjs/config`, no `--env-file` anywhere in `apps/api` (verified by scan). `apps/api/.env` exists and is read by *humans* only; every process must be handed real environment variables. | Medium — deployment | Documented; containers must inject env explicitly. Stage C templates + compose do this rather than mounting files. |
| **F-6** | Three different Postgres host ports coexist in the repo: `5432` (compose), `15432` (code fallback), `25433` (live container and `.env`). `docker ps` shows the running container published at **25433**, so it was **not** started from the committed compose file. | Low — config drift | Documented; Stage C fixes explicit ports in the new artifacts and leaves dev alone. |
| **F-7** | `infra/k8s/` exists but is **empty and untracked** (`child_count=0`, `git ls_files` → none). The implementation plan (§ line 111) promises "Migration-gated deploys, blue-green rollout" and earlier audits describe `infra/k8s` as containing manifests — the directory is a placeholder. | High — **no deployment definition exists** | Stage B conclusion: no target is established ⇒ Stage C produces **provider-neutral** artifacts and documents the open choices. |
| **F-8** | Swagger UI is mounted unconditionally (`main.ts:91 SwaggerModule.setup('docs', …)`), independent of `NODE_ENV`. | Low–Medium — production exposure | Documented as an explicit production decision for Stage C. |
| **F-9** | **Every Phase 4 deliverable is uncommitted** while the working tree contains 17 modified tracked files. | Medium — durability | Reported; committing requires the user's authorization (safety boundary 9). |
| **F-10** | Pre-existing, outside the change set: `test-token.txt` is a **tracked** file containing a real signed JWT (`role=MERCHANT_OWNER`, `exp=2026-10-07 15:33 UTC` — already expired), committed by `e3dcc66` "test(data): add sample product data files for testing". Also tracked: `b1-*.txt` build/test logs, `test-errors.xlsx`, `Phase_1_Gap_Analysis.html`. | Low — hygiene (expired token), but a bad pattern | **Not modified** — untracking files is a repository-history decision for the owner. Recorded here with the recommended follow-up. |
| **F-11** | The dev password `scs_dev_2026` also appears in five *committed* Phase-3/M-docs (`SCS-CATALOG-M4-HUMAN-UAT.md:19`, `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-4-P5-INFRASTRUCTURE-REPAIR-REPORT.md:277`, `SCS-M7.2.4-A.1-RUNTIME-VERIFICATION.md:47`, `SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION-RERUN.md:475,558`) and in ~15 test specs as an env-var fallback. | Low — pre-existing repo-wide pattern | Out of Phase 4.1 scope; recorded so the redaction in F-3 is understood as a convention change, not a one-off fix. |

## 6. Remediation performed inside Stage A

### 6.1 F-1 — graceful shutdown wiring

`apps/api/src/main.ts`, before `app.listen()`:

```ts
  // ── Graceful shutdown ──────────────────────────────────────────────
  // Nest does NOT run `onModuleDestroy`/`onApplicationShutdown` on SIGTERM/SIGINT
  // unless this is enabled. The P13 worker releases its lease in `onModuleDestroy`,
  // so without this a container stop would leave `worker_leases` pointing at a dead
  // holder and a standby could only take over after the TTL expired.
  app.enableShutdownHooks();
```

Enabling the hooks changes behaviour **application-wide**, which is the intended production
semantics: `DatabaseService`, `RedisService`, `OutboxDispatcher`, `P13MonitorService`,
`AutoCompleteWorker`, `ShippingCarrierWorker`, `CarrierTrackingPoller`, `CarrierReconciliationService`
and `CarrierObservabilityService` all implement destroy hooks that were previously never called on
signal. Their hooks are interval-clears and pool closes, so this removes a class of "worker kept
processing during shutdown" behaviour rather than adding any.

`return-expiration.worker.ts` — the floating promise became an awaited, bounded one:

```ts
  async onModuleDestroy(): Promise<void> {
    this.stopTicking();
    if (this.state === 'HELD' || this.state === 'HELD_PAUSED') {
      const release = this.leases.release(this.epoch, P13_LEASE_KEY).catch(() => undefined);
      let guardTimer: NodeJS.Timeout | undefined;
      const guard = new Promise<void>((resolve) => {
        guardTimer = setTimeout(resolve, 5_000);
        guardTimer.unref();
      });
      await Promise.race([release, guard]);
      clearTimeout(guardTimer);
    }
    this.state = 'STOPPED';
  }
```

The previous `void this.leases.release(...)` was fire-and-forget: during process exit the UPDATE could
be cut off before it reached the database, which strands the lease until its TTL expires — the exact
failure this finding is about. The 5-second guard exists so an unreachable database cannot hang
shutdown forever; the TTL still bounds takeover either way.

Two existing assertions were strengthened to match, rather than weakened:

- `KS-10` now `await`s the hook and asserts `holder_id IS NULL` **immediately**, with no 50 ms settle
  sleep — if the release were still floating, the assertion would fail instead of passing by luck.
- `WX-09` now awaits the hook so the promise is not floating in the spec either.

### 6.2 F-3 — credential redaction

`P13-PHASE-4-BASELINE-AND-GAP-ANALYSIS.md` line 87 now reads
`DATABASE_URL=postgresql://scs:‹dev-password›@localhost:25433/scs_platform`, with a note stating that
the original transcript showed the `POSTGRES_PASSWORD` default from
`infra/docker-compose.dev.yml`, that the compose also sets `POSTGRES_HOST_AUTH_METHOD: trust` (so the
value is not an access control in this environment), and that readiness reports should not become an
extra copy of it.

## 7. Verification of the Stage A changes

| Gate | Command | Result |
| --- | --- | --- |
| API typecheck | `pnpm typecheck` (apps/api) | `TSC_API_EXIT=0` |
| Monorepo typecheck | `pnpm typecheck` | `Tasks: 9 successful, 9 total`, `Cached: 8`, 10.794 s, `TYPECHECK_EXIT=0` |
| Phase 4 suites after the change | `pnpm vitest run p4-operational-readiness p4-http-authorization --no-file-parallelism` | `p4-http-authorization…passed=34 failed=0`, `p4-operational-readiness…passed=59 failed=0`, **`TOTAL passed=93 failed=0`**, `P4_SUITES_EXIT=0` |

Both specs run against a **testcontainer** `postgis/postgis:16-3.4` provisioned per file
(`p4-operational-readiness.postgres.spec.ts:93-97`), so this verification touched no shared database.

## 8. Safe P13 defaults re-confirmed from the live environment

Every statement below was executed in Stage A. Nothing is inferred from source.

```text
=== P13 safety posture (runbook section 2 checklist, executed) ===
FEATURE_FLAGS_EXIT=0 (no output above = absent row = pilot off)
0
ALLOWLIST_COUNT_EXIT=0
OPS_CONTROLS_EXIT=0 (no output above = no control row = not paused)
0
OPEN_ALERTS_EXIT=0
=== evidence collection SQL (runbook section 9.1), all statements ===
       lease_key       | holder_id | epoch | poll_failures | last_error_code
-----------------------+-----------+-------+---------------+-----------------
 p13-return-expiration |           |     0 |             0 |
(1 row)
SQL_LEASE_EXIT=0
(0 rows) SQL_ALERTS_EXIT=0
(0 rows) SQL_CONTROLS_EXIT=0
(0 rows) SQL_AUDIT_EXIT=0
(0 rows) SQL_FLAG_EXIT=0
(0 rows) SQL_ALLOW_EXIT=0
(0 rows) SQL_ADJ_EXIT=0
```

Also confirmed for the environment: `Select-String apps\api\.env -Pattern "^P13_|^OPS_|^ALERT_"` returns
**nothing**, so `P13_WORKER_ENABLED` is unset (worker off) and `P13_PILOT_MODE` is unset (legacy) — the
resolver defaults in `p13-ops.config.ts` are what actually run.

Side effect worth noting: this run was the first *execution* of the whole §9.1 evidence block. The
Phase 4 runbook had been validated for four statements only; running the remaining ones found no
defect — all seven parse against the real schema (`ops_controls.control_key/paused`,
`feature_flags.key/enabled/updated_by`). The Phase 4 runbook's SQL is therefore correct as published.

## 9. No financial or product scope drift

Checked against the Phase 4.1 boundaries (§2 and §10 of the mandate):

- The 17-file diff contains no change to SLA durations, refund execution, reversal math, approval
  requirements, or FX vocabulary. The `settlement-adjustment.service.ts` diff remains the three
  Phase 4 defects (fx_status value, allow-listed posting guard, awaited transactions).
- No FX provider, rate source, or payment capability was introduced. `apps/api` contains no new
  outbound exchange-rate call.
- No historical backfill, no automatic clawback, no production financial mutation: the only database
  touched in Stage A was read-only `SELECT`s against the development container, plus testcontainers.
- `pnpm-lock.yaml` and every `package.json` are untouched (`git diff` clean for all of them).

## 10. Evidence classification for this stage

| Claim | Level |
| --- | --- |
| Branch/HEAD/diff/untracked inventory | **Verified by execution** (git) |
| Migration count and tip | **Verified against disposable-equivalent PostgreSQL** (dev container, read-only) |
| P13 resting state (flag/allowlist/controls/alerts/lease) | **Verified against real PostgreSQL**, all seven statements executed |
| F-1 defect (hooks never wired) | **Verified by exhaustive source scan** (0 occurrences repo-wide) and by reading `main.ts` |
| F-1 fix | **Implemented** + **tested locally** (93/93) + typechecks — *not* yet proven across real processes; that is Stage E scenario 4 |
| F-2, F-7 | **Verified** (absence proven by command output) |
| F-4, F-5, F-6, F-8, F-10, F-11 | **Verified by inspection** of the named files/lines; consequences are reasoned, not yet exercised |
| Production topology | **Not verified — does not exist** (no manifests, no container images, no provider configuration) |

## 11. What Stage A changes for the rest of Phase 4.1

1. Stage B can skip provider archaeology: **no target exists**, so artifacts must be
   provider-neutral, and the infrastructure choices get documented rather than decided.
2. Stage C inherits two concrete requirements from F-4/F-5: an explicit startup configuration gate
   (missing `DATABASE_URL` outside development must abort) and environment injection through the
   container interface rather than mounted `.env` files.
3. Stage D must restore the lost CI gates **and** add the guard that would have caught their loss.
4. Stage E scenario 4 ("graceful owner shutdown ⇒ safe takeover") is now the first real proof of the
   F-1 fix across separate processes; the unit-level pass in §7 is necessary but not sufficient.
5. Nothing in the Phase 4 verdict is revised downward: the worker, monitoring, pause, pilot, and HTTP
   security surfaces are all present and their 93 assertions still pass.
