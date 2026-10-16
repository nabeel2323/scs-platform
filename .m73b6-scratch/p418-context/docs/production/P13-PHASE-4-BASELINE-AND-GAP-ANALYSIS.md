# P13 Phase 4 — Baseline and Gap Analysis

**Phase:** P13 Phase 4 — Pilot Operational Readiness, Observability, and Recovery
**Nature of this document:** §2 baseline. Everything below was read or executed against the
actual repository and development database during Phase 4 execution. No statement here is
inferred from an earlier phase's report.

**Scope boundary:** Phase 4 is *preparation* for a future allowlisted production pilot. This
baseline records the starting state; it does not deploy anything, activate a pilot, enable a
production worker, or change production flags or financial data.

---

## 1. Repository baseline (executed)

### 1.1 Branch, HEAD, working tree

```powershell
git rev-parse --abbrev-ref HEAD
git log -1 --format="%h %ad %s" --date=short
git status --porcelain
```

```text
develop
ed6c30f 2026-10-14 test(migrations): verify existence of migration 0062
```

Phase 4 started from `develop` at `ed6c30f`. At the start of the phase the working tree was
clean of P13 Phase 4 code; by close-out it contains the change set listed in
`P13-PHASE-4-FINAL-READINESS-REPORT.md` §5.

### 1.2 Migrations on disk and in the database

```powershell
(Get-ChildItem infra\drizzle\migrations -Filter *.sql -File).Count
Get-ChildItem infra\drizzle\migrations -Filter *.sql -File | Select-Object -Last 4 -ExpandProperty Name
```

```text
63
0060_escalated_and_business_calendar.sql
0061_phase3_financial_correctness.sql
0062_phase3_1_hardening.sql
0063_phase4_operational_readiness.sql
```

`0063_phase4_operational_readiness.sql` is the Phase 4 migration (created in this phase); it
did not exist at `ed6c30f`.

```powershell
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select current_setting('server_version')"
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select count(*) from _migration_log"
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select name from _migration_log order by applied_at desc limit 3"
```

```text
16.4 (Debian 16.4-1.pgdg110+2)
63
0063_phase4_operational_readiness.sql
0062_phase3_1_hardening.sql
0061_phase3_financial_correctness.sql
```

Conclusion: 63 migration files and 63 `_migration_log` rows agree, and the newest applied
migration is the Phase 4 one. `_migration_log` columns used for this check are `name` and
`applied_at`.

### 1.3 Toolchain

```powershell
node -v ; pnpm -v
```

```text
v26.4.0
9.15.9
```

### 1.4 Development environment configuration actually in effect

```powershell
Select-String -Path apps\api\.env -Pattern "DATABASE_URL|REDIS_URL|P13_"
```

```text
DATABASE_URL=postgresql://scs:‹dev-password›@localhost:25433/scs_platform
REDIS_URL=redis://localhost:6379
```

> The password value was redacted during Phase 4.1; the original transcript showed
> the development default published in `infra/docker-compose.dev.yml`
> (`POSTGRES_PASSWORD`). That file also sets `POSTGRES_HOST_AUTH_METHOD: trust`, so
> the credential is not an access control in this environment — but readiness
> reports should not become an extra copy of it.

**No `P13_*` variable is present in the development `.env`.** Combined with the resolver
defaults (`apps/api/src/modules/operations/p13-ops.config.ts`), the effective state of the
development host at baseline and at close-out is:

| Setting | Effective value | Source |
|---|---|---|
| `P13_WORKER_ENABLED` | unset → **worker disabled** | `boolFalseDefault()` defaults to `false` |
| `P13_PILOT_MODE` | unset → **`legacy`** (pilot gate not enforced) | `resolveP13OpsConfig()` |
| `P13_OPS_ALERT_WEBHOOK_URL` | unset → **log-only** delivery channel | `channelName` getter |
| `p13.pilot.enabled` feature flag | **row absent** from `feature_flags` | queried directly (see below) |

```powershell
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select key, enabled from feature_flags where key='p13.pilot.enabled'"
```

```text
(no rows returned)
```

This matters for §1 of the Phase 4 mandate: pilot enforcement is off in the actual
environment, not merely off by code default, and the absence of the flag row is itself the
fail-closed condition the pilot service treats as "not enabled".

---

## 2. Prior-phase state carried forward

`P13-PHASE-3.1.1-FINAL-READINESS-REPORT.md` recorded verdict **PASS WITH DOCUMENTED
LIMITATIONS** with two open limitations relevant to Phase 4:

1. **Windows admin production build failure** (Next.js `jest-worker` / virtual-store symptom).
2. **No authoritative FX rate source**, so adjustments must remain blocked from posting.

Both were re-tested in Phase 4 rather than assumed; see `P13-PHASE-4-HTTP-AUTHORIZATION-AND-SECURITY-REPORT.md`
§7 for the build re-verification result and
`P13-PHASE-4-FINAL-READINESS-REPORT.md` §3 for the FX limitation, which Phase 4 preserves
and additionally pins with an allow-listed posting guard plus an alert.

---

## 3. Operational surface inventory (read from actual code)

### 3.1 Periodic / background jobs

Discovered by searching `apps/api/src` for `@Interval(`, `setInterval(`, `onModuleInit`:

| Job | File | Cadence | Protected P13 financial work? |
|---|---|---|---|
| `ReturnExpirationWorker` | `modules/returns/return-expiration.worker.ts` | `P13_WORKER_POLL_INTERVAL_MS` (legacy `RETURN_EXPIRATION_POLL_INTERVAL_MS` still honoured) | **Yes** — merchant-SLA escalation of `REQUESTED` returns |
| `OutboxDispatcher` | `common/outbox/outbox-dispatcher.service.ts` | `setInterval(..., 1000)` | No (transport, idempotent by event id) |
| `AutoCompleteWorker` | `modules/orders/auto-complete.worker.ts` | interval | No (orders context) |
| `ShippingCarrierWorker` | `modules/shipping/shipping-carrier.worker.ts` | static poll interval | No (shipping context) |
| `CarrierTrackingPoller` | `modules/shipping/carrier-tracking-poller.ts` | `pollIntervalMs` | No |
| `CarrierReconciliationService` | `modules/shipping/carrier-reconciliation.service.ts` | two timers (reconcile + cancel) | No |
| `CarrierObservability` | `modules/shipping/carrier-observability.ts` | 30 000 ms counter flush | No |
| `P13MonitorService` | `modules/operations/p13-monitor.service.ts` | `P13_MONITOR_INTERVAL_MS` | **New in Phase 4**; intentionally runs on every instance (DB-enforced dedup makes N monitors safe) |

**Baseline defect (the core §3 gap):** at `ed6c30f` the return-expiration worker was
unconditional. The HEAD version of the file contains:

```text
onModuleInit() {
  this.timer = setInterval(() => this.poll(), this.intervalMs);
```

with `intervalMs` from `process.env['RETURN_EXPIRATION_POLL_INTERVAL_MS'] || '120000'`. There
was no enable gate, no lease, no fencing epoch, no heartbeat, and no pause check — so **every
API replica ran the escalation batch on its own timer**, and the number of running workers was
an accidental consequence of replica count.

### 3.2 Transactional outbox

`OutboxDispatcher` polls `outbox_events` every second; P13 writers publish through it inside
the same transaction (`publish(..., tx)`). Phase 4 added a P13-prefix-scoped failure/dead-letter
check to the monitor rather than a new transport, so outbox behaviour is unchanged.

### 3.3 Feature flags / configuration surface

`feature_flags` (migration 0002) is the runtime toggle store. Phase 4 uses exactly one key,
`p13.pilot.enabled`, and extended the table with provenance columns in 0063. Environment
variables are parsed only in `p13-ops.config.ts` — there is no second place where a P13
operational default is chosen.

### 3.4 Observability already present

| Surface | State at baseline |
|---|---|
| Request logging | pino/`Logger` throughout the API |
| Liveness/readiness | `apps/api/src/health.controller.ts`: `GET /healthz` (no checks) and `GET /readyz` (Postgres `SELECT 1` + Redis `ping`) |
| Metrics endpoint | **None** — no Prometheus/metrics scrape surface exists |
| Domain counters | **None** at baseline; Phase 4 added the in-process registry in `modules/operations/ops-counters.ts` |
| Alerting | **None** at baseline; the repository had no alert record, dedup, or delivery confirmation anywhere |

### 3.5 Deployment / scheduling configuration

```powershell
Get-ChildItem infra -Recurse -Depth 1 -File | Where-Object { $_.Name -like "*.yml" -or $_.Name -like "Dockerfile*" }
Get-ChildItem -Recurse -Depth 3 -Filter "Dockerfile*" -File | Where-Object { $_.FullName -notlike "*node_modules*" }
```

```text
infra\docker-compose.dev.yml
infra\backup\backup-db.sh
(no Dockerfiles anywhere in the repository)
```

Findings with direct bearing on §5–§6 of the mandate:

- There is **no container image definition and no production compose/manifest** in this
  repository. Worker replica count and worker enablement therefore cannot be a reviewable
  deploy artifact yet — the kill switch and lease had to be made database-durable so they do
  not depend on config that does not exist.
- `infra/docker-compose.dev.yml` provides Postgres only (dev), plus `infra/backup/backup-db.sh`
  for dumps. No cron/systemd timer schedules the worker; it runs in-process with the API.
- CI (`.github/workflows/ci.yml`) is the only orchestrated pipeline; its jobs are
  `Lint & Typecheck` (L29-42), boundary-lint, unit+coverage, integration, migration dry-run,
  contract, `build` (L251-265, `runs-on: ubuntu-latest`, `pnpm build`), mobile, smoke.

---

## 4. Gap analysis against the Phase 4 mandate

| Mandate | Baseline state | Phase 4 disposition |
|---|---|---|
| §3 worker exclusivity | Timer in every replica; no lease, no fencing, no heartbeat; env var only set cadence | **Implemented and runtime-tested** — `worker_leases` + epoch fencing in `WorkerLeaseService`; gate, renew, fence-per-item in the worker. 12 assertions (WX-01…WX-12). See the worker-exclusivity report |
| §4 ten alert classes | No alerting at all | **Implemented and runtime-tested** — `ops_alerts` + `OpsAlertService` + 10-condition `P13MonitorService`; 24 assertions (AL-01…AL-24). See the monitoring report |
| §5 pause / kill switch / idempotent resume | No control surface | **Implemented and runtime-tested** — `ops_controls` + append-only `ops_control_audit`; 10 assertions (KS-01…KS-10) |
| §6 allowlisted pilot | No pilot concept; Phase 3 behaviour open to all orgs | **Implemented, default-disabled, runtime-tested** — `p13_pilot_allowlist` + `PilotControlService` gate inside `createReturnRequest`; 13 service-level (PL-01…PL-13) + 5 HTTP-edge (HA-29…HA-33) assertions |
| §7 financial safeguards | Present from Phase 3, but posting was deny-listed against a value the schema cannot store, and adjustment creation could not persist at all | **Verified and repaired** — allow-listed FX posting guard, `fx_status` CHECK violation fixed, dual-approval/self-approval pinned over HTTP (HA-26…HA-34) |
| §8 HTTP authorization + tenant isolation tests | Phase 3.1.1 had service-level isolation specs only; no HTTP-level suite | **Implemented** — 34-assertion HTTP suite booting the real Nest application (§8.1–§8.6). Three production defects found by it |
| §8 admin production build | Documented failing | **Re-verified**: builds green immediately after a store relink (`ADMIN_EXIT=0`, `BUILD_ID=WDJLNRiLYNBj7fZ98TrQt`, store still clean afterwards); the failure is a host defect, not repo code (see §5 below and the security report §7) |
| §8 settlement-adjustment creation form | Not assessed | **Assessed**: no create form exists; the UI's FX vocabulary was inverted and has been corrected |

---

## 5. Environment defect discovered during baseline re-verification

While re-running builds and tests, the host's pnpm virtual store was repeatedly found
**stripped of files inside intact package directories**:

```text
### next@14.2.35_...
  pkg next: {"entries":5,"files":0,"dirs":5}
  package.json exists: false
  dist/build: {"entries":12,"files":0,"dirs":12}
### react@18.3.1
  pkg react: {"entries":1,"files":0,"dirs":1}
  package.json exists: false
### es-module-lexer@1.7.0
  pkg es-module-lexer: {"entries":2,"files":0,"dirs":2}
```

```powershell
pnpm store status
```

```text
ERR_PNPM_MODIFIED_DEPENDENCY Packages in the store have been mutated
```

and a plain install confirms the diagnosis in the repository's own runbook
(`SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md`, §1):

```powershell
pnpm install --frozen-lockfile   # → "Lockfile is up to date … Already up to date" (changes nothing)
```

Observed trigger on this host: a `next build` run (alone or under turbo) corrupted the store again
immediately after a successful relink in two earlier sequences; the store check flipped
`next/dist/build/webpack-config.js : true → false` in the same step. That is why the Phase 4
verification was serialized per app. Recovery used, per the runbook and without touching
`pnpm-lock.yaml` or any `package.json`:

```powershell
pnpm install --offline --force    # EXITCODE=0, "reused 1377, downloaded 0, added 1384"
```

The only install-script failure is the optional transitive `cpu-features` (SSH2), which the
runbook explicitly classifies as non-blocking.

**Consequence for Phase 4 evidence credibility:** all PostgreSQL and build results reported in
this phase were produced on a freshly relinked store, and each report records the exit code of
the command that produced it. Where a result could not be made stably reproducible on this
host (parallel `pnpm build`), that is stated as such rather than presented as passing. The
condition is intermittent rather than deterministic: the final admin build of this session
exited 0 and `pnpm store status` afterwards also exited 0, which is why the Phase 3.1.1
"Windows admin prod build fails" limitation is reported as **not reproducing** rather than as
fixed by a repository change — no build-related source was edited to make it pass.

---

## 6. Known limitations recorded at baseline

1. No production deployment artifact exists in-repository (no Dockerfile, no production
   compose/manifest), so worker replica count cannot be declared or reviewed as code.
2. No authoritative FX rate source; Phase 4 keeps such adjustments unpostable by design.
3. No external metrics scraper or paging sink in the development environment; alert delivery
   verification therefore runs against a locally captured sink, and the unconfigured default is
   log-only with a durable, non-silently-dropped alert row.
4. Windows host dependency-store instability (§5) — pre-existing, documented, and the reason the
   admin/web production builds are only reproducible one app at a time immediately after a relink.

---

## 7. Commands to reproduce this baseline

```powershell
cd c:\TAIF\scs-platform
git rev-parse --abbrev-ref HEAD ; git log -1 --format="%h %ad %s" --date=short
(Get-ChildItem infra\drizzle\migrations -Filter *.sql -File).Count
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select count(*) from _migration_log"
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select table_name from information_schema.tables where table_name in ('worker_leases','ops_alerts','ops_controls','p13_pilot_allowlist') order by 1"
Select-String -Path apps\api\.env -Pattern "P13_"
```

Expected on a healthy tree: 63 migration files, 63 log rows, and the four Phase 4 tables:

```text
ops_alerts
ops_controls
p13_pilot_allowlist
worker_leases
```
