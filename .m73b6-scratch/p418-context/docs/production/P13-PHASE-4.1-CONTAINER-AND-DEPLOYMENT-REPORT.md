# P13 Phase 4.1 — Container and Deployment Artifacts Report

**Stage C** · Status: **IMPLEMENTED, PARTIALLY VERIFIED**  
Date: 2026-10-14  
Build verification: **IN PROGRESS** (network-constrained)

---

## 1. Mission

Close the deployment-foundation gap identified in Phase 4: the repository had no production container image for any application, no production-like Compose topology, no environment template, and no verified release procedure. Alert delivery was log-only, and the worker's behavior had not been rehearsed across the actual deployment topology.

This stage delivers the artifacts that make the deployment topology reproducible and verifiable, without activating the P13 pilot or enabling the protected worker.

---

## 2. Absolute safety boundaries (preserved)

All Stage C work respects the Phase 4.1 mandate §2:

- No deployment to production or changes to production infrastructure.
- No activation of the P13 pilot or addition of production allowlist entries.
- `P13_WORKER_ENABLED` remains disabled in every default configuration.
- No modification of production financial records.
- No invention of FX providers, rates, or financial business rules.
- Financial invariants, tenant isolation, authorization, idempotency, approval requirements, and audit trails are preserved.
- `pnpm-lock.yaml` and package manifests are not modified to work around the documented Windows pnpm-store problem.
- No deletion, regeneration, or silent stashing of existing Phase 4 changes.
- No commits or pushes unless explicitly authorized.
- No start of the 30-day production observation period.

All operational verification uses development, testcontainers, or a dedicated disposable environment.

---

## 3. Artifacts delivered

### 3.1 Dockerfiles (3)

| File | Purpose | Base image | Runtime user |
|---|---|---|---|
| `infra/deploy/api.Dockerfile` | NestJS API (also runs P13 worker and migration step) | `node:22-slim` | `node` (non-root, added in this stage) |
| `infra/deploy/web.Dockerfile` | Next.js storefront (`output: 'standalone'`) | `node:22-slim` | `node` |
| `infra/deploy/admin.Dockerfile` | Next.js admin console (`output: 'standalone'`) | `node:22-slim` | `node` |

**Reproducibility:** All three images install dependencies from `pnpm-lock.yaml` on Linux (`node:22-slim` + pnpm 9.15.9 via corepack), matching the CI build job exactly. The build context is the repository root (monorepo workspace resolution), and `.dockerignore` excludes credentials, host `node_modules`, build output, and mobile Flutter build artifacts (~3 GB).

**Security posture:**
- No secret is baked into any image. The Dockerfiles contain no `ARG` or `ENV` holding a credential.
- `.dockerignore` excludes `.env*`, `*.pem`, `*.key`, `*.dump`, and the duplicate worktree `apps/scs-platform-b2-test/`.
- The API image runs as non-root `node` (added in this stage; web/admin already did). The API writes nothing to the container filesystem at runtime (object storage → S3/MinIO, logs → stdout, no `fs.write*`/`mkdir` call exists under `apps/api/src`), so it needs no writable path and never binds a privileged port (`PORT` is 3000).
- All Dockerfiles use exec-form `CMD` (not shell form) so Node is PID 1 and receives SIGTERM directly, enabling `app.enableShutdownHooks()` to release the P13 worker lease before exit.
- Migrations travel inside the API image so that "the release artifact contains exactly the schema this code expects" is verifiable rather than assumed. `migrate-pg.ts` resolves them at `../../../../infra/drizzle/migrations` from `apps/api/infra/drizzle`.

**Health checks:**
- API: `HEALTHCHECK` on `/v1/healthz` (liveness only, no dependency checks, so a database blip cannot make a healthy process look dead and get it killed). Readiness is checked at the orchestrator level against `/v1/readyz`.
- Web/admin: `HEALTHCHECK` on `/` (served by Next without any backend dependency).

**Network resilience:** The build stage uses a BuildKit cache mount for the pnpm content-addressable store and raises pnpm's retry/backoff parameters (`fetch-retries 5`, `fetch-retry-mintimeout 20000`, `fetch-retry-maxtimeout 300000`, `--network-concurrency=4`). This is not a workaround for a repository problem; it is what stops a flaky link from resetting sockets under load. The cache mount is not copied into the image, so the final artifact stays reproducible.

### 3.2 `.dockerignore`

Located at repository root. Excludes:
- Dependencies and build output: `node_modules/`, `**/node_modules/`, `.next/`, `**/.next/`, `out/`, `**/out/`, `dist/`, `**/dist/`, `build/`, `coverage/`, `**/coverage/`, `.turbo/`, `**/.turbo/`, `*.tsbuildinfo`, `.cache/`, `**/.cache/`.
- Secrets and local configuration: `.env`, `.env.*`, `**/.env`, `**/.env.*`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`, `*.kdbx`, `id_rsa`, `id_ed25519`, `.secrets/`, `kubectl-config*`.
- Data dumps and local database state: `*.dump`, `*.sql.gz`, `*.bak`, `pgdata/`, `postgres_data/`.
- Logs, scratch and evidence files: `*.log`, `logs/`, `**/*.log`, `b1-*.txt`, `b2-*.json`, `p4-*.json`, `p4-*.log`, `p4-*.txt`, `p41-*.json`, `p41-*.log`, `p41-*.mjs`, `.p4-*`, `**/.p4-*`, `test-token.txt`.
- Binary office/spreadsheet test fixtures: `*.xlsx`, `*.xls`, `*.zip`, `*.tgz`.
- Duplicate worktree and version control internals: `apps/scs-platform-b2-test/`, `.git/`, `.github/`, `.vscode/`, `.idea/`, `.DS_Store`, `Thumbs.db`.
- Mobile toolchain (not part of a web/API image): `mobile/build/`, `mobile/.dart_tool/`, `mobile/.pub-cache/`, `mobile/.pub/`. Only the Flutter *build output* is dropped, never the `mobile/packages/` tree: `pnpm-workspace.yaml` lists `mobile/packages/*` as importers, so excluding the whole `mobile/` directory would make `pnpm install --frozen-lockfile` fail on an importer mismatch. `mobile/build` and `mobile/.dart_tool` alone account for ~3 GB of the host working tree (APKs, native libs, dill caches), which is why they are excluded explicitly rather than left to the general `build/` pattern (which is root-anchored).
- Docs are excluded from images but kept available to operators through the repository.
- Tests are not needed in a production image. Kept in the build stage (the build graph may reference them), removed from the runtime stage by copying only dist output.

### 3.3 Production-like Compose topology

`infra/docker-compose.prod.yml` (287 lines).

**Topology:**
- `migrate`: one-shot migration service, runs before any application container. `restart: "no"` plus `service_completed_successfully` makes it a gate: if a migration fails, the API tier never starts, so a bad schema cannot serve traffic.
- `api`: API tier, 2 replicas by default (`API_REPLICAS`), no published host port (replicas are reached through `web` and `admin`, or directly per container via `docker compose exec --index=N api`). `init: true`, `stop_grace_period: 30s` (the worker's lease release is awaited with a 5 s guard; Docker's 10 s default would leave no margin).
- `worker`: P13 worker, behind the `p13-worker` Compose profile. A plain `up` never starts it; it requires an explicit `--profile p13-worker`. Exactly one replica.
- `web`: Next.js storefront, published on `127.0.0.1:${WEB_HOST_PORT:-3100}:3100`.
- `admin`: Next.js admin console, published on `127.0.0.1:${ADMIN_HOST_PORT:-3200}:3200`.
- `postgres`: `postgis/postgis:16-3.4`, authenticated, health-checked.
- `redis`: `redis:7-alpine`, authenticated (`--requirepass`), health-checked. Redis holds the JWT denylist, so an unauthenticated Redis is an auth-control weakness.
- `minio`: `minio/minio:latest`, health-checked.
- `minio-init`: one-shot bucket creation.

**P13 safety posture:**
- `P13_WORKER_ENABLED` is hard-coded `false` on every `api` replica. The protected return-expiration job therefore does not run here, even though the monitor does.
- The worker runs only as the separate `worker` service, which is behind the `p13-worker` Compose profile. This is the deliberate answer to "a Compose configuration that accidentally enables the worker in every API instance".
- `P13_PILOT_MODE` defaults to `legacy`, so pilot allowlist enforcement stays off. The allowlist table is empty in a fresh database anyway, and in `allowlist` mode an empty list denies everything — which is fail-closed, not fail-open, but is still not a state to enter by accident.
- Migrations run exactly once, in the one-shot `migrate` service, and `api` waits for `service_completed_successfully`. `migrate-pg.ts` takes no advisory lock, so letting N replicas migrate concurrently would be unsafe.
- No secret has a default value in this file. `${VAR:?message}` fails the `docker compose` command when VAR is unset.

**Configuration injection:** The applications read `process.env` directly (there is no dotenv/@nestjs/config loader in this repository), so Compose variable expansion via `--env-file` is the only injection point. `--env-file` keeps the credentials out of the shell history and out of the repository; `.dockerignore` and `.gitignore` both exclude `.env*`.

### 3.4 Environment template

`infra/deploy/.env.production.example` (133 lines).

Contains NO secrets. Documents every boot-blocking variable with a placeholder value:
- `JWT_ACCESS_SECRET=__REPLACE_ME_generate_with_openssl_rand_base64_32__`
- `POSTGRES_PASSWORD=__REPLACE_ME_url_safe__` (must be URL-safe: no `@`, `:`, `/`, `#`, `%`)
- `REDIS_PASSWORD=__REPLACE_ME__`
- `S3_ACCESS_KEY=__REPLACE_ME__`, `S3_SECRET_KEY=__REPLACE_ME_min_8_chars_for_minio__`
- `API_CORS_ORIGINS=https://shop.example.com,https://admin.example.com`
- `PUBLIC_API_URL=https://api.example.com`

P13 posture defaults:
- `P13_PILOT_MODE=legacy`
- `P13_EXPECTED_WORKER_COUNT=0` (disables monitor check #3 via the `expectedWorkerCount > 0` guard)
- `P13_OPS_ALERT_WEBHOOK_URL=` (empty = log-only, the documented Phase 4 limitation)

Documents variables present in the dev `.env` but NOT read by the API (`JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTEL_*`, `FCM_*`, `MAPBOX_ACCESS_TOKEN`, `SMS_*`, `SMTP_*`), so nobody assumes they work.

### 3.5 README

`infra/deploy/README.md` (197 lines). Documents:
1. How to configure (copy template, fill in REQUIRED values, prove that missing values stop the command).
2. How to build (context is the repository root for all three images).
3. Release procedure (backup, dry-run migration, apply migrations as one-shot service, start API tier then front ends).
4. Post-release verification (liveness, readiness, P13 posture queries).
5. Graceful shutdown (exec-form CMD, `init: true`, `stop_grace_period: 30s`, lease release).
6. Rollback (image-only, schema state travels forward, never roll the database back).
7. Enabling the P13 worker deliberately (`--profile p13-worker`, keep exactly one such service).
8. What these artifacts do *not* prove (a successfully built image is not evidence of production readiness; this Compose file is a rehearsal topology, provider-neutral; TLS termination, DNS, WAF, managed-Postgres failover, and off-host backup targets are infrastructure decisions still open).

### 3.6 Environment-gate F-4 fix

`apps/api/src/config/env-gate.ts`: added `resolveDatabaseUrl()` and `resolveRedisUrl()` functions that refuse to fall back to the local development database/Redis endpoint outside development/test. The development-only DSNs are kept as named constants (`DEV_DATABASE_URL`, `DEV_REDIS_URL`) instead of inline literals.

**Rationale:** `DatabaseService` used to fall back to `DEV_DATABASE_URL` unconditionally. In development that is convenient; in a production-like environment it is a silent misroute — the process would boot, bind a port, and then either fail against an unreachable host or, worse, connect to whatever local database happened to be listening. So outside development/test the variable is required. Redis is on the authentication path (it holds the JWT denylist that `JwtAuthGuard` consults on every request), so connecting to an unintended Redis is an auth-control failure, not a cache miss.

Also added `describeAlertSink()` to classify the alert sink configuration without exposing it (Phase 4.1 Stage F). Deliberately carries no URL, no host, and no path: a webhook URL is an operator secret (the host alone identifies the monitoring provider, and many schemes embed a token in the path or query). This shape is safe to return from a status endpoint and safe to log.

### 3.7 Deployment invariants spec

`apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts` (36 tests, all passing).

Asserts:
- **Graceful shutdown wiring:** `main.ts` enables Nest shutdown hooks before the process starts listening; the lease is released from an awaited `onModuleDestroy` with a bounded wait; every application image uses exec-form CMD so Node receives SIGTERM as PID 1.
- **Production configuration gate:** only development and test are exempt from production rules; `DATABASE_URL` is required outside development instead of using the dev DSN; `REDIS_URL` is required outside development; the alert sink is classified without ever exposing the URL; the app boots cleanly with a valid production configuration and returns only a channel; it refuses to start when the alert sink is configured but undeliverable; it is inert in development so local tooling and existing specs do not need secrets; it still rejects the insecure JWT default through the same gate.
- **Default configuration cannot activate P13:** the worker and legacy pilot mode are disabled with an empty environment; stays disabled under a production `NODE_ENV` with no `P13_*` variables at all; the worker only enables on an explicit truthy value; allowlist mode only activates on that exact value; the heartbeat is clamped below half the lease TTL no matter what is configured.
- **Container build hygiene:** the API is healthchecked on the versioned liveness route, not readiness; the migration directory ships inside the API image so schema and code travel together; credentials, host dependencies, and dumps are excluded from every build context.
- **Production Compose safety posture:** contains none of the development credentials; requires every credential through interpolation rather than defaulting it; hard-codes the worker off on the shared API environment block; keeps the worker behind a Compose profile so a plain `up` cannot start it; defaults pilot enforcement to legacy; runs migrations as a one-shot gate the API tier waits on; gives the API tier more stop time than the lease-release guard needs; scales the API tier instead of assuming a single process; authenticates Redis, which carries the token denylist.
- **Environment template carries no secrets:** documents every boot-blocking variable with a placeholder value; contains no real credential and no working default for one; leaves the alert webhook unset rather than pointing at a repository host; is reachable by the documented copy command.
- **The dev-only stack is not silently reused:** keeps `docker-compose.dev.yml` as infrastructure only.

---

## 4. Verification status

### 4.1 Implemented and locally verified

- **Invariants spec:** 36/36 tests passing (verified 2026-10-14 23:33 UTC).
- **Compose config validation:** `docker compose --env-file .env.prod-like -f infra/docker-compose.prod.yml config --quiet` exits 0 with a test environment file containing placeholders (verified 2026-10-14).
- **Artifact authoring:** all files exist, are syntactically valid, and reference each other correctly.
- **Env-gate F-4 fix:** `resolveDatabaseUrl()` and `resolveRedisUrl()` throw outside development/test when the variable is absent; `describeAlertSink()` classifies the sink without exposing the URL.

### 4.2 In progress (network-constrained)

- **Real image build:** `docker build -f infra/deploy/api.Dockerfile -t scs-api:p41-local .` is running (PID 26924, started 2026-10-14 ~21:40 UTC). After ~114 minutes, pnpm has downloaded 212/1208 packages, hitting ECONNRESET on `registry.npmjs.org` despite the retry tuning. The BuildKit cache mount for the pnpm store is essentially empty (only 17 reused out of 1208), suggesting the prior session's build cache was lost or the cache mount is not persisting across builds on this host.

  **Impact:** The build will take ~6 hours total at the current rate. This is a network-constrained environment issue, not a code defect. The Dockerfile's retry tuning is already applied; the issue is that the pnpm store cache is not providing reuse, so every build downloads every tarball from scratch.

  **Mitigation:** The artifacts are verified by static checks (invariants spec, compose config). Runtime verification (container starts, health endpoints respond, P13 defaults are safe) is pending build completion. The CI job (Stage D) will provide this verification on GitHub-hosted runners, where the network is fast and the pnpm store cache is ephemeral per build but the download time is ~15-20 min.

### 4.3 Not yet verified

- **Container smoke test:** requires the image to finish building.
- **Web/admin image builds:** not yet attempted; depend on the same pnpm install, so they will be equally slow on this host.
- **Multi-instance worker exclusivity rehearsal (Stage E):** requires the API image.
- **Disposable prod-like deploy/pause/recovery/rollback rehearsal (Stage G):** requires the API image.

---

## 5. Findings and open decisions

### 5.1 Findings

1. **The repository had no container image for any application before this stage.** `infra/k8s/` was empty, there was no Dockerfile, and CI never produced a deployable artifact. "Deploy" meant running `pnpm dev` against a dev-only Compose stack.

2. **The dev-only Compose stack (`docker-compose.dev.yml`) provides infrastructure only** (Postgres/Redis/MinIO/Mailhog) and the applications run on the host with pnpm. The production-like Compose file (`docker-compose.prod.yml`) is a separate topology where the applications run as containers.

3. **The API image now runs as non-root `node`** (added in this stage). Web/admin already did. The API writes nothing to the container filesystem at runtime, so it needs no writable path.

4. **The `.dockerignore` excludes ~3 GB of mobile Flutter build artifacts** (APKs, native libs, dill caches) but keeps `mobile/packages/` because `pnpm-workspace.yaml` lists `mobile/packages/*` as importers.

5. **The env-gate F-4 fix prevents silent misrouting** to dev credentials outside development/test. This is a real safety improvement: a production container that forgets to set `DATABASE_URL` would previously have connected to `postgresql://scs:scs_dev_2026@127.0.0.1:15432/scs_platform` (the dev DSN), which is a host that should not exist in a deployed environment.

6. **The pnpm store cache mount is not providing reuse on this host.** The first build attempt (prior session) failed during install with ECONNRESET; the cache mount may have been partially populated but pnpm's content-addressable store was mostly empty because the first failure was early. The second build (this session) is downloading every tarball from scratch. This is a network-constrained environment issue, not a code defect.

### 5.2 Open decisions (from Phase 4.1 deployment-architecture report)

- **D-1: Hosting provider.** No provider is established anywhere in the repository. The Compose file is provider-neutral.
- **D-2: Reverse proxy / load balancer.** No reverse proxy is in the Compose file on purpose — publishing `api` on a host port would have prevented running two replicas at all.
- **D-3: TLS termination.** Open.
- **D-4: DNS.** Open.
- **D-5: WAF.** Open.
- **D-6: Managed Postgres failover.** Open.
- **D-7: Off-host backup targets.** Open. The runbook prescribes "the pilot VPS must not hold its own only copy".
- **D-8: Alert destination.** No actual notification destination has been configured. Alert delivery is log-only unless `P13_OPS_ALERT_WEBHOOK_URL` is set. Stage F will address this.
- **D-9: Worker topology.** The lease makes multiple workers safe, not useful. The pilot wants one owner and an expected count of 1.

---

## 6. What these artifacts do *not* prove

- A successfully built image is not evidence of production readiness. It proves the dependency graph installs and the TypeScript compiles on Linux.
- This Compose file is a **rehearsal topology**, provider-neutral. No hosting provider is established anywhere in the repository, so nothing here has been run against a real target environment.
- TLS termination, DNS, WAF, managed-Postgres failover, and off-host backup targets are infrastructure decisions still open (D-1…D-9 in the deployment-architecture report). There is no reverse proxy in this file on purpose — publishing `api` on a host port would have prevented running two replicas at all.
- The web/admin `NEXT_PUBLIC_API_URL` is baked into the client bundle at build time, so those artifacts are environment-specific. Tag them per environment; do not promote one image from staging to production.

---

## 7. Next steps

1. **Wait for the API image build to complete** (or fail). If it succeeds, run the container smoke test (health endpoints, P13 defaults).
2. **Build web/admin images** (fast, since the pnpm install layer will be cached after the API build).
3. **Proceed to Stage D** (CI gates): add the `container-build` job to `.github/workflows/ci.yml` that builds the API image, runs the invariants spec, starts the container with safe defaults, and verifies health + P13 posture.
4. **Proceed to Stage E** (multi-instance worker exclusivity rehearsal) once the image is available.
5. **Proceed to Stage F** (alert delivery verification) — can proceed without the image.
6. **Proceed to Stage G** (recovery and rollback rehearsal) once the image is available.

---

## 8. Verdict

**IMPLEMENTED, PARTIALLY VERIFIED.**

All Stage C artifacts are authored, syntactically valid, and pass static checks (invariants spec 36/36, compose config validates). The env-gate F-4 fix is a real safety improvement. The API image now runs as non-root `node`, consistent with web/admin.

Runtime verification (container starts, health endpoints respond, P13 defaults are safe) is pending build completion. The build is network-constrained on this host (~6 hours estimated); the CI job will provide this verification on GitHub-hosted runners.

No critical security or financial-control failure exists. No mandatory blocker for the stated scope. The remaining limitation is that the image has not been run yet, which is a verification gap, not a design defect.

**Stage C verdict: PASS WITH DOCUMENTED LIMITATIONS** (runtime verification pending build completion).
