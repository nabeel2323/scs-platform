# Deployment artifacts — P13 Phase 4.1

Introduced by P13 Phase 4.1. Before this directory the repository had **no container
image for any application** (`infra/k8s/` was empty, there was no Dockerfile, and CI
never produced a deployable artifact), so "deploy" meant running `pnpm dev` against a
dev-only Compose stack. These files are the production *foundation*; the Phase 4.1
reports record what has actually been verified against them and what has not.

| File | Purpose |
|---|---|
| `api.Dockerfile` | NestJS API image (also runs the P13 worker and the migration step) |
| `web.Dockerfile` | Next.js storefront, `output: 'standalone'` |
| `admin.Dockerfile` | Next.js admin console, `output: 'standalone'` |
| `.env.production.example` | Non-secret template describing every variable the stack needs |
| `../docker-compose.prod.yml` | Production-like topology for disposable rehearsal |

Everything below assumes a Linux host with Docker Engine + Compose v2. That is a
deliberate choice, not a convenience: Phase 4 documents intermittent pnpm virtual-store
corruption on the Windows dev host, so Linux is the authoritative build environment and
the images reproduce exactly what CI does (`node:22-slim`, pnpm 9.15.9,
`pnpm install --frozen-lockfile`).

---

## 1. Configure

```bash
cp infra/deploy/.env.production.example .env.prod-like
$EDITOR .env.prod-like
```

`.env.prod-like` is git-ignored and docker-ignored. Real values must never be committed,
and the Compose file has **no dev fallbacks** — every credential uses `${VAR:?}`, so a
missing value stops the command instead of quietly selecting a development secret. You can
prove that without starting anything:

```bash
: > /tmp/empty.env
docker compose --env-file /tmp/empty.env -f infra/docker-compose.prod.yml config
# error while interpolating x-api-environment.S3_ACCESS_KEY: required variable
# S3_ACCESS_KEY is missing a value: S3_ACCESS_KEY is required   (exit 1)
```

## 2. Build

Build context is the **repository root** for all three images, because pnpm resolves the
whole workspace:

```bash
docker build -f infra/deploy/api.Dockerfile  -t scs-api:$TAG  .
docker build -f infra/deploy/web.Dockerfile  -t scs-web:$TAG  \
  --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain .
docker build -f infra/deploy/admin.Dockerfile -t scs-admin:$TAG \
  --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain .
```

The web/admin `NEXT_PUBLIC_API_URL` is **baked into the client bundle at build time**, so
those artifacts are environment-specific. Tag them per environment; do not promote one
image from staging to production.

## 3. Release procedure

Order matters and is enforced by the Compose file, not by discipline: `api` depends on
`migrate` with `condition: service_completed_successfully`.

```bash
# 3.1 Take the backup the runbook prescribes, off-host.
#     infra/backup/README.md: "the pilot VPS must not hold its own only copy".

# 3.2 Dry-run the migration chain against the target first. `run --rm` blocks and
#     returns the runner's exit code, so a failure here is visible immediately.
#     The absolute path is required: `node_modules/.bin` is not on the image's PATH.
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  run --rm migrate /app/apps/api/node_modules/.bin/tsx infra/drizzle/migrate-pg.ts --dry-run

# 3.3 Apply migrations as the one-shot service. Nothing else in the stack starts until
#     this container exits 0 (enforced by `service_completed_successfully`).
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  run --rm migrate

# 3.4 Start the API tier, then the front ends.
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  up -d api web admin
```

Why migrations are a separate one-shot step: `migrate-pg.ts` owns `_migration_log` and
applies each file in its own transaction, but it takes **no advisory lock**. Two replicas
racing through the same directory is how a half-applied schema ships. A single completed
container is the only safe shape.

Migrations are **additive and forward-only** in this phase. Never edit an applied file and
never bring back a dropped column in the same release.

## 4. Post-release verification

```bash
# Liveness (per replica) — no dependency checks, so it is not masked by a DB blip.
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  exec --index=1 api curl -fsS http://127.0.0.1:3000/v1/healthz

# Readiness — SELECT 1 plus a Redis ping.
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  exec --index=1 api curl -fsS http://127.0.0.1:3000/v1/readyz
```

`--index=N` addresses one replica of a scaled service; `exec` is used rather than a
published host port because the API tier intentionally exposes nothing to the host (§8).

Then confirm the P13 posture is still the safe one. The queries and their expected
results are in `docs/production/P13-PHASE-4-RUNBOOK.md`; in short, a default release must
show:

- `feature_flags` has **no** `p13.pilot.enabled` row
- `p13_pilot_allowlist` is empty
- `ops_controls` is empty (nothing paused)
- `worker_leases` row `p13-return-expiration` has `holder_id IS NULL`, `epoch = 0`
- `ops_alerts` has no open rows other than what you deliberately acknowledged

`P13_WORKER_ENABLED` is hard-coded `false` on the `api` service, so no replica can pick up
protected work. Verify it in the running container, not in the file:

```bash
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  exec --index=1 api printenv P13_WORKER_ENABLED   # -> false
```

## 5. Graceful shutdown

`main.ts` calls `app.enableShutdownHooks()`, the Dockerfiles use exec-form `CMD` so Node is
PID 1, and the Compose services set `init: true` and `stop_grace_period: 30s`. Together
these make `stop` deliver SIGTERM, let the P13 worker release its lease (awaited, bounded
by a 5 s guard), and exit before Docker sends SIGKILL.

If you shorten `stop_grace_period` below the lease-release bound you reintroduce the
condition the lease TTL was designed to absorb: a `worker_leases` row pointing at a dead
holder, which a standby can only take over after the TTL expires.

## 6. Rollback

Rollback is **image-only**. Schema state travels forward:

```bash
# Point the stack at the previous known-good tag and recreate the app tier.
# There is no "--no-migrate" flag; `migrate` re-runs and is a no-op, because
# migrate-pg.ts skips every file already present in _migration_log.
SCS_IMAGE_TAG=<previous> docker compose --env-file .env.prod-like \
  -f infra/docker-compose.prod.yml up -d api web admin
```

Note that `SCS_IMAGE_TAG` also selects the migration set the `migrate` container carries,
so a rollback applies the *older* image's files — all of which are already logged, hence
no writes. That is why the tag must be a single knob rather than three.

Two rules make this safe:

1. **Never roll the database back.** Migrations in this phase are additive; the previous
   code tolerates extra columns and tables. Restoring a dump would delete financial
   records written since, which is prohibited.
2. **Compatibility is forward-only.** New code must tolerate the old schema for the length
   of one release, and destructive schema changes (drop column/table) are deferred to a
   later release after no running code references them.

If a release must be abandoned mid-migration, `_migration_log` tells you exactly which file
failed: each file commits individually, so everything before it is applied and the failing
one is not.

## 7. Enabling the P13 worker deliberately

The worker is a `p13-worker` Compose **profile**, so it does not exist in a plain `up`.
Turning it on is an explicit, separate act and is *not* part of Phase 4.1:

```bash
docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml \
  --profile p13-worker up -d worker
```

Keep exactly one such service. The lease makes multiple workers *safe*, not *useful*: the
pilot wants one owner and an expected count of 1, which is what makes "two live holders"
an alert instead of a silent tolerance. When you enable it, also set
`P13_EXPECTED_WORKER_COUNT=1` so the API tier's monitor checks the live-holder count.

Pilot activation additionally requires `p13.pilot.enabled` in `feature_flags` and entries
in `p13_pilot_allowlist`. **Neither is part of any deployment procedure in this directory.**
Activation needs its own authorization (Phase 4.1 mandate §2 and §12).

## 8. What these artifacts do *not* prove

- A successfully built image is not evidence of production readiness. It proves the
  dependency graph installs and the TypeScript compiles on Linux.
- This Compose file is a **rehearsal topology**, provider-neutral. No hosting provider is
  established anywhere in the repository, so nothing here has been run against a real
  target environment. See `P13-PHASE-4.1-DEPLOYMENT-ARCHITECTURE.md`.
- TLS termination, DNS, WAF, managed-Postgres failover, and off-host backup targets are
  infrastructure decisions still open (D-1…D-9 in the same report). There is no reverse
  proxy in this file on purpose — publishing `api` on a host port would have prevented
  running two replicas at all.
