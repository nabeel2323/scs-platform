# P13 Phase 4.1 — Stage B: Deployment Architecture Discovery

**Purpose:** determine, from repository evidence only, how each application actually runs today, and
what production topology the Phase 4.1 artifacts should target.
**Rule followed:** *if a target is clearly established in existing repository evidence, use that
architecture; if none is established, prepare provider-neutral artifacts and document the open
choices.* The conclusion is in §3 — the evidence points to **one shape (a single Linux host running
containers) and no named provider**, so the artifacts are provider-neutral but not topology-neutral.

---

## 1. How each component actually runs (verified)

| Component | Current runtime | Verified evidence |
| --- | --- | --- |
| **API** | Host process, `nest start --watch` (dev) or `node dist/main` (`start:prod`), binds `PORT‖API_PORT‖3000` on `API_HOST‖0.0.0.0` | `apps/api/package.json`, `main.ts:97-99` |
| **Admin app** | Host process, `next dev -p 3200` / `next start -p 3200` | `apps/admin/package.json` |
| **Web storefront** | Host process, `next dev -p 3100` / `next start -p 3100` | `apps/web/package.json` |
| **PostgreSQL** | Container `scs-postgres`, image `postgis/postgis:16-3.4`, published host port **25433** | `docker ps`, `apps/api/.env` |
| **Redis** | Container `scs-redis`, `redis:7-alpine`, 6379 | `docker ps` |
| **Object storage** | Container `scs-minio`, `minio/minio`, 9000/9001 | `docker ps`, `S3_ENDPOINT` |
| **SMTP capture** | Container `scs-mailhog`, 1025/8025 | `docker ps`, `SMTP_HOST/PORT` |
| **Background workers** | **In-process with the API.** No queue, no cron, no systemd timer, no separate worker deployment | `@Module` providers in `ReturnsModule`/`OrdersModule`/`ShippingModule`; `setInterval` in each worker; see §4 |
| **Migrations** | Host-run script `tsx infra/drizzle/migrate-pg.ts` (`pnpm db:migrate`, `db:migrate:ci`) | §7 |
| **CI** | One workflow, `.github/workflows/ci.yml`, 309 lines, 8 jobs, `ubuntu-latest`, Node 22, pnpm 9.15.9 | read in full |
| **Release/deploy workflow** | **None exists.** No `deploy` job, no environment, no image publish step | `Select-String ci.yml -Pattern "deploy|registry|push"` → nothing |

### 1.1 The orchestration surface is infra-only

`infra/` contains `backup/`, `ci/`, `drizzle/`, `k8s/`, `load/` and one compose file:

```text
infra\docker-compose.dev.yml     3557 B
infra\k8s                        child_count = 0, git ls-files → 0 entries
```

- `docker-compose.dev.yml` defines **postgres, redis, minio, mailhog, minio-init only** — no API, no
  admin, no web, no replicas. It is a dependency launcher, not an application topology.
- **`infra/k8s/` is empty and untracked.** Git cannot track empty directories, so the directory is a
  local placeholder. A prior audit recorded the same conclusion:
  > Deployment topology (evidence): Glob for `Dockerfile` / `docker-compose.prod*` / PM2 `ecosystem.config`
  > / k8s / ECS / `Procfile` returns **none** … There is currently **no multi-instance orchestration** to run.
  > (`SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-RELEASE-CLOSURE-READINESS-REPORT.md`)
- `apps/scs-platform-b2-test/` (a second copy of the tree, including its own compose file) is a
  **separate CI worktree**, explicitly ignored in `.gitignore` and excluded in `pnpm-workspace.yaml`.
  It is not an architecture input.

### 1.2 There is no container image for any application

No `Dockerfile` exists anywhere in the repository (verified by recursive file search excluding
`node_modules`/`.next`/store). Consequently the Phase 4 limitation *"no deployment configuration exists"*
was accurate, and Stage C is not *correcting* a file — it is creating the first one.

### 1.3 Environment loading: nothing reads `.env`

Verified by exhaustive scan of `apps/api` (excluding `node_modules`/`dist`): **no `dotenv`, no
`@nestjs/config`, no `--env-file`, no `envFilePath`**. Services read `process.env` directly. The
`apps/api/.env` file is therefore inert for the running process — the reason every Phase 4 verification
command exported `DATABASE_URL` in the shell first.

Two further facts about configuration:

- `@scs/env` **exists** and is a well-formed Zod schema package — `ApiEnvSchema` requires
  `DATABASE_URL: z.string().url()`, `JWT_ACCESS_SECRET: z.string().min(16)`, `S3_*`, and exposes
  `validateEnv()` which logs the offending keys and throws. Its header claims *"Each app validates its
  environment at boot and fails fast. 12-factor."*
- **Nothing imports it.** A scan for `@scs/env` across `apps/` and `packages/` matched only its own
  source file. `apps/api/package.json` does not list it as a dependency at all; `web` and `admin` list
  it but never use it. So the intended fail-fast gate is unwired.
- The one configuration gate that **is** wired is `apps/api/src/config/env-gate.ts` (`API-B7`), called
  as the first statement of `bootstrap()` via `assertJwtConfig()`. It is production-conditional:
  `isProductionLikeEnv()` treats any `NODE_ENV` other than `development`/`test` as production-like, and
  in that case refuses to boot if `JWT_ACCESS_SECRET` is missing, is the known dev default, or is
  shorter than 16 characters. Its helpers are pure (they take the env object as a parameter) precisely
  so they can be unit-tested — `env-gate.spec.ts` exists.

**Design decision carried forward to Stage C/F:** extend `env-gate.ts` rather than switch on
`@scs/env`. Turning on the full Zod schema would require `DATABASE_URL`, `S3_*` and both JWT secrets in
every developer shell and in ~100 test files that currently supply only what they need, and it would
convert a P13 readiness task into a platform-wide configuration break. `env-gate.ts` is already the
repository's real fail-fast mechanism, already runs at the right moment, and is already production-
conditional, so new checks can be strict in `staging`/`production` and permissive in `development`/`test`.

### 1.4 Known configuration drift

| Observation | Values found | Consequence |
| --- | --- | --- |
| Postgres host port | `5432` (compose), `25433` (live container, `.env`), `15432` (code fallback) | The running DB was not started from the committed compose; a fresh `infra:up` would produce a DB the app cannot reach without editing `DATABASE_URL`. |
| API fallback DSN | `database.service.ts:15` → `postgresql://scs:‹dev-password›@127.0.0.1:15432/scs_platform` | A container missing `DATABASE_URL` silently targets a dev URL instead of refusing to boot (Stage C gate). |
| Frontend API URL | `NEXT_PUBLIC_API_URL` with `http://localhost:3000` fallback in 10 files, but `http://localhost:3001` in `apps/web/src/app/.../StepMedia.tsx:110` | One component points at a port nothing binds; harmless in dev, wrong in any proxy setup. Not corrected here (frontend scope, not deployment). |
| Ports in CI vs dev | CI service containers publish 5432/6379 | Integration tests are environment-portable; the dev host setup is the odd one out. |

## 2. Runtime dependencies that constrain the topology

### 2.1 PostgreSQL is authoritative for coordination

The Phase 4 controls are all database-backed: `worker_leases` (lease + fencing epoch), `ops_controls`
(durable pause), `ops_control_audit` (append-only), `ops_alerts` (`dedup_key` unique index),
`p13_pilot_allowlist`, `feature_flags`. This is what makes worker exclusivity work without a queue, and
it means **every API replica must share one database** — a per-replica database would silently allow
two lease holders.

### 2.2 Redis is on the authentication path, not merely a cache

`RedisService.onModuleInit()` does `new Redis(url, {lazyConnect: true}); await this.client.connect()`, so
**the API cannot start if Redis is unreachable**. Beyond the boot dependency, live request paths use it:

| Use | Site |
| --- | --- |
| Access-token denylist check on **every** authenticated request | `jwt-auth.guard.ts:51` |
| Same check in the WebSocket handshake | `realtime.gateway.ts:82` |
| Rate limiting (token bucket per user/IP/role) | `rate-limit.service.ts:21,42` |
| OTP storage/attempts | `identity.service.ts:70,83` |
| Catalog and search cache | `catalog.service.ts:1056`, `search.service.ts:438` |

So Redis failure is an availability *and* a security-lifecycle event: a Redis outage makes token
revocation checks throw rather than silently pass. Any production topology must treat Redis as a
first-class dependency with persistence/HA decisions attached, not as a disposable cache.

### 2.3 In-process timers are the current scheduling model

Workers are Nest providers with `setInterval`, all started by `onModuleInit()` in the same process that
serves HTTP: `ReturnExpirationWorker` (P13, protected), `AutoCompleteWorker`, `ShippingCarrierWorker`,
`CarrierTrackingPoller`, `CarrierReconciliationService`, `P13MonitorService`. There is no way to run the
API without constructing these services; what Phase 4 added is the ability for the P13 worker to be
*enabled* or *disabled* (`P13_WORKER_ENABLED`) and, when enabled, to be gated by the lease.

This matters for §3: the repository's design does not currently support "a separate worker deployment"
as a first-class thing, and the mandate explicitly says not to introduce an unsafe second implementation.

## 3. Target determination

**No provider is established in repository evidence.** There is no image registry configuration, no
`Procfile`, no Terraform, no Helm chart, no deployment action, no named host, and `infra/k8s/` is empty.
Nothing in CI deploys anything. Choosing a paid provider would be inventing infrastructure, which §2 of
the mandate forbids.

**One topology *is* established**, by consistent implication across the artifacts that do exist:

| Evidence | Implication |
| --- | --- |
| `infra/backup/backup-db.sh` runs `docker exec scs-postgres pg_dump …` and `docker cp` | PostgreSQL runs as a **container named `scs-postgres` on the same host** as the backup script |
| Cron example: `0 3 * * * /opt/scs/infra/backup/backup-db.sh /var/backups/scs 14` | Application code is deployed at **`/opt/scs`** on a **Linux** host |
| `infra/backup/README.md`: *"the pilot VPS must not hold its own only copy"*, *"30-day (pilot)"* | The pilot target is explicitly described as a **VPS** |
| `SCS-CATALOG-…-RELEASE-CLOSURE-READINESS-REPORT.md`: *"sufficient for the approved single-process pilot"*, *"production should use Bull/external scheduler"* | The sanctioned scope is a **single-process pilot**, and multi-instance was deferred *with* the leader-lease alternative |
| `Smart_Commerce_Platform_Implementation_and_UX_Plan.md:111`: prod row — *"Migration-gated deploys, blue-green rollout"* | Release **strategy** is specified (migrations first, then compatible code) even though no platform is |
| Capacity model in the plan (`2 NestJS pods`, PgBouncer thresholds at 400–600 concurrent) | The long-horizon design assumes Kubernetes, but **at pilot volume (150–250 concurrent) one host is within budget** |

**Determination:** produce **provider-neutral container artifacts** (Dockerfiles, `.dockerignore`, env
templates) plus a **production-like Compose file used only for disposable local verification**, and
document the provider, TLS, secrets-backend and HA decisions as still open. Compose on a single Linux
host is the shape the repository already assumes; the artifacts must not require a specific vendor's
features to work.

This does **not** amount to production-architecture approval. The Phase 4 stop conditions stand: a
successful local multi-container rehearsal is evidence about the *code*, not about the *target*.

## 4. Proposed production topology

```text
                        ┌──────────────────────────────────────────────┐
   operators ──────────►│  reverse proxy (open choice: nginx/Caddy/     │
   buyers/admins        │  managed LB) — TLS termination, /docs off     │
                        └───────────┬──────────────────┬───────────────┘
                                    │                  │
                       ┌────────────▼───┐      ┌───────▼────────┐
                       │ api (N replicas)│      │ admin (1)      │
                       │ NODE_ENV=prod   │      │ next start 3200│
                       │ P13_WORKER_     │      └────────────────┘
                       │   ENABLED=false │      ┌────────────────┐
                       │  /healthz       │      │ web (1)        │
                       │  /readyz        │      │ next start 3100│
                       └────────┬────────┘      └────────────────┘
                                │
                    ┌───────────┴───────────────┐
                    │ worker (exactly 1 service) │  same image as api,
                    │ P13_WORKER_ENABLED=true    │  P13_LEASE_HEARTBEAT…
                    │ holds p13-return-expiration│  no HTTP listener needed
                    └───────────┬────────────────┘
                                │
                 ┌──────────────┴───────────────┐
                 │ postgres (scs-postgres)       │  single primary; lease,
                 │ redis (scs-redis)             │  alerts, controls live here
                 └───────────────────────────────┘
```

### 4.1 API and worker roles

Two options were on the table; the mandate's constraint (do not introduce an unsafe second
implementation) rules between them:

- **Option 1 — dedicated `worker` service reusing the API image.** Same build, same code, different
  environment (`P13_WORKER_ENABLED=true`, no inbound traffic expected). Ownership is still decided by the
  database lease, so the lease remains the authority and the env var only expresses *eligibility*.
- **Option 2 — worker inside the API replicas**, exactly as today, with the lease electing one holder.

**Recommendation: Option 2 for the pilot, with Option 1 available and expressed in the Compose file as a
profile.** The lease was designed and tested for competing holders, so Option 2 is safe; Option 1 gives
operator-visible separation without changing any ownership logic. What must **not** happen is an
undocumented combination — e.g. a Compose file that scales the API to 3 replicas with the worker enabled
in all of them, which is what §5 of the Phase 4.1 mandate explicitly warns against.

The single requirement that Option 2 imposes on the topology, and that Stage C must satisfy, is
`enableShutdownHooks()` — without it, a rolling restart strands the lease until the TTL expires. That is
finding F-1 in the Stage A audit, fixed before this stage's artifacts were written.

### 4.2 Instance counts and ownership expectations

| Service | Pilot count | Ownership expectation |
| --- | --- | --- |
| api | 1–2 | 0 or more may be worker-eligible; default **none** (`P13_WORKER_ENABLED=false`) |
| worker | 0 or 1 explicitly enabled | Exactly one holder of `p13-return-expiration` while the pilot is active |
| admin | 1 | No protected jobs |
| web | 1 | No protected jobs |
| postgres | 1 primary | Lease/alert/control authority; no read replica for these tables |
| redis | 1 | Auth-path dependency; must be reachable at boot |

The monitor's live-holder scan (`p13.monitor`) already asserts the invariant *"exactly one enabled
instance holds the job"* and raises `p13.worker.count_anomaly` at 0 or ≥2, so an operator who violates
this table gets an alert rather than silent duplication. Stage E measures that behaviour across real
processes; the target-environment rehearsal remains open.

## 5. Secrets management

Current state: `apps/api/.env` (git-ignored) holds real dev values; `.env.example` documents 32 keys;
`POSTGRES_HOST_AUTH_METHOD: trust` in dev compose means the DB password is not an access control locally.

Production requirements the artifacts must satisfy, and how Stage C meets each:

| Requirement | How the Phase 4.1 artifact handles it |
| --- | --- |
| No secret baked into an image | Dockerfiles take config only through `ENV`/runtime env; no `COPY .env`, no `ARG` for secrets; `pnpm build` output contains no credentials |
| No dev credentials copied into prod config | Prod-like compose uses `${…:?}` placeholders with no default values, so a missing variable aborts rather than silently using a dev password |
| No secret in repository history | `.dockerignore` excludes `.env*`, `*.pem`, `*.key`, `*.dump`, `**/node_modules`, `.next`, `dist`, `coverage`, `logs`; existing tracked junk (`test-token.txt`, `b1-*.txt`) is reported, not silently rewritten |
| Runtime injection | Environment variables per service in the compose file; the documented production path is a secrets manager or platform secret store rendering that env — the choice is open (§8) |
| Alert webhook URL is a secret | Stage F exposes only *presence* and a host/protocol summary, never the URL, and validates it without echoing it |

## 6. Health checks and shutdown behaviour

| Endpoint | Checks | Intended use |
| --- | --- | --- |
| `GET /v1/healthz` | `HealthCheckService.check([])` — process alive, no dependencies | **liveness** |
| `GET /v1/readyz` | `SELECT 1` via Drizzle **and** `redis.client.ping()` | **readiness** |

Both live on `apps/api/src/health.controller.ts`, a `@Controller()` with no prefix, and the app calls
`enableVersioning({type: URI, defaultVersion: '1'})` with **no global prefix** — so the actual paths are
`/v1/healthz` and `/v1/readyz`. Stage C must not write a healthcheck against `/healthz`, and Stage G
probes both forms to prove it rather than reasoning about it.

Shutdown: after the F-1 fix, `SIGTERM` → Nest lifecycle → `onModuleDestroy()` in order across
`ReturnExpirationWorker` (stop ticking, **awaited** lease release bounded at 5 s), `P13MonitorService`
(stop intervals), `OutboxDispatcher`, `AutoCompleteWorker`, carrier services, then `RedisService.quit()`
and `pool.end()`. Containers need a stop grace period longer than that 5 s bound; Stage C sets
`stop_grace_period` explicitly rather than relying on Docker's 10 s default.

Frontends have no health endpoint; the compose healthcheck uses the HTTP response of the Next server.

## 7. Migration execution strategy

Contract verified by reading `migrate-pg.ts` in full:

1. Requires `DATABASE_URL`; connects with an optional `PGSSLROOTCERT` CA file and `rejectUnauthorized: true`.
2. `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at)` — **the runner owns
   the log**, which is why migration files must never insert into it themselves.
3. Enumerates `infra/drizzle/migrations/*.sql`, sorted by filename, minus `EXCLUDED = {0013_analytics.sql,
   0018_analytics_retention.sql}` (no `pg_partman` in `postgis/postgis:16-3.4`).
4. For each unapplied file: `BEGIN` → execute → `INSERT` log row → `COMMIT`; on error `ROLLBACK`, print
   `Migration <file> FAILED`, `exit 1`.
5. `--dry-run` validates presence/non-emptiness and applies nothing.

Release implications, to be enforced in Stage D:

- **Migrations must run once, before compatible code is activated** — the runner has no advisory lock, so
  two replicas booting simultaneously can both apply the same pending file and one will hit a
  `duplicate key` on `_migration_log`. The topology therefore makes migration a **separate one-shot step**
  (`run_once`/`depends_on`), never a per-replica entrypoint.
- The `EXCLUDED` pair means a database built by this runner has **no analytics tables**; that is a real
  schema difference between the CI/dev DB and any target that installs `pg_partman`. It must be stated,
  not glossed.
- Migration files stay additive (Phase 4's 0063 is `CREATE TABLE/INDEX IF NOT EXISTS` + one
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`), which is what makes the rollback rule in §9 safe.

## 8. Outstanding target-specific decisions

Each of these is an infrastructure choice the repository does **not** make, and each is a reason a local
rehearsal cannot be reported as production verification:

| # | Open choice | Why it is open | Blocks |
| --- | --- | --- | --- |
| D-1 | Host/provider for the pilot (VPS vs managed container platform vs k8s) | Only `/opt/scs` + "pilot VPS" wording exists; no manifests, no IaC | Final target-environment verification, stop conditions on topology |
| D-2 | TLS termination and public ingress | Nothing in the repo terminates TLS; `prod-ca-2021.crt` exists at `c:\TAIF` (outside the repo) but no server config references it | Public endpoint exposure, `/docs` policy |
| D-3 | Secrets backend (env file vs platform secret store vs mounted secret) | No evidence of either; app reads `process.env` only | Production configuration, rotation story |
| D-4 | Postgres HA, PITR, and whether `pg_dump` logical backups are sufficient | Backup runbook assumes a single container on one host | Recovery rehearsal on a real target |
| D-5 | `pg_partman` availability for migrations 0013/0018 | Excluded everywhere the runner is used | Schema parity between test DB and target |
| D-6 | Whether Swagger `/docs` is exposed in production | Currently mounted unconditionally | Production hardening decision |
| D-7 | Alert destination (which channel, who is paged, escalation) | `P13_OPS_ALERT_WEBHOOK_URL` unset ⇒ log-only; no on-call artifact in repo | Stop condition: no confirmed alert destination |
| D-8 | Worker separation policy (Option 1 vs Option 2 as standing practice) | Both are technically safe under the lease; this is an operational choice | Final topology sign-off |
| D-9 | Release orchestration (how a build becomes a running container) | CI builds but never deploys; no environment protection rules in evidence | Rollback rehearsal on target |

## 9. Deployment and rollback sequence (to be rehearsed in Stage G)

**Forward deploy**

1. Freeze writes at the release boundary only if the migration is not backward compatible (Phase 4
   migrations are additive, so this is normally "no freeze").
2. Run migrations as a **one-shot** step against the target database (`db:migrate:ci`), from the image
   that contains the new migration files. Capture `_migration_log` count and tip before and after.
3. Start the new API replicas with `P13_WORKER_ENABLED=false` and pilot enforcement off.
4. Confirm `/v1/readyz` green on each replica; confirm `GET /v1/admin/ops/p13/status` shows a sane
   `liveHolders` count for the intended posture.
5. Enable the worker on exactly one eligible service once the API tier is healthy.
6. Re-check lease epoch/heartbeat and alert state after the first full poll cycle.

**Rollback**

1. Pause first if the failure is financial (`POST /v1/admin/ops/p13/worker/pause` with a reason) — this
   stops new protected jobs without touching committed state.
2. Point the API tier at the previous image. **Do not reverse migrations**: keep the additive schema
   (0063 columns/tables are additive, and older code simply does not use them).
3. Verify the old build starts against the newer schema — the rehearsal in Stage G exercises this
   explicitly, because "additive ⇒ compatible" is an assumption until demonstrated.
4. Resume the worker only after `liveHolders`, `poll_failures` and open alerts are re-read.
5. Never auto-reverse a financial transaction as part of a rollback (Phase 4 rule; unchanged).

## 10. Evidence classification for this stage

| Claim | Level |
| --- | --- |
| Component runtimes, ports, scripts, env surface | **Verified by execution** (`docker ps`, package.json inspection, source scans) |
| No Dockerfile / no manifests / `infra/k8s` empty | **Verified** (recursive file search + `git ls-files`); absence is proven, not assumed |
| Redis is a hard boot dependency | **Verified by reading** `redis.service.ts` (`await connect()` with `lazyConnect`); not yet demonstrated by killing Redis — Stage G does that |
| `/v1/healthz`, `/v1/readyz` path shape | **Implemented/inspected**; the *actual* live paths are **not yet probed** — Stage G must curl them |
| Migration runner contract | **Verified by reading the executed runner** (`migrate-pg.ts`); CI behaviour is **not verified in CI here** — Stage D |
| "pilot VPS / `/opt/scs`" topology inference | **Documented interpretation of repository evidence**, not a confirmed target |
| §4 proposed topology | **Proposed** — nothing in §4 is deployed or provisioned |
