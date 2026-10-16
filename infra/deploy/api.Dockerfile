# syntax=docker/dockerfile:1
# ============================================================
# Smart Commerce & Supply Platform — API production image
# ============================================================
# Introduced by P13 Phase 4.1. The repository had no container image for any
# application before this file, so there is no "previous image" to stay compatible with.
#
# Build context MUST be the repository root (monorepo workspace resolution):
#   docker build -f infra/deploy/api.Dockerfile -t scs-api:local .
#
# Reproducibility follows the CI build job exactly (`.github/workflows/ci.yml`):
# Node 22, pnpm 9.15.9, `pnpm install --frozen-lockfile`. Linux is the authoritative
# build host — Phase 4 documents intermittent pnpm virtual-store corruption on the
# Windows dev host, which is why the image does not reuse the host node_modules.
#
# No secret is baked: this file contains no `ARG` or `ENV` holding a credential, and
# `.dockerignore` excludes `.env*`, `*.pem`, `*.key` and `*.dump`.

# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS build

# pnpm is pinned to the version CI uses. corepack is bundled with Node 22, so no
# global npm install is needed and the version cannot drift.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Native dependency toolchain. Some transitive packages compile through node-gyp,
# which needs a C++ toolchain that `-slim` does not ship. This mirrors the verified
# Linux CI reproduction (python3 + make + g++ + ca-certificates).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Whole workspace is copied because pnpm resolves every importer in
# pnpm-workspace.yaml, and turbo's build graph crosses package boundaries.
# `.dockerignore` keeps credentials, host node_modules and build output out of
# this context, so the layer stays honest rather than convenient.
COPY . .

# Network resilience, not a workaround for a repository problem: the first build attempt
# on the rehearsal host failed with ECONNRESET / ERR_SOCKET_TIMEOUT while fetching
# tarballs from registry.npmjs.org, after ~15 minutes of apt transfers. Two things make
# that survivable, and neither touches pnpm-lock.yaml or any package manifest:
#   * a BuildKit cache mount for the content-addressable store, so a retried build
#     reuses what it already downloaded instead of starting from zero
#   * pnpm's own retry/backoff raised and its request concurrency lowered, which is
#     what stops a flaky link from resetting its own sockets under load
# The cache mount is not copied into the image, so the final artifact stays reproducible.
RUN --mount=type=cache,id=scs-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 300000 && \
    pnpm install --frozen-lockfile --network-concurrency=4

# Build the API and the workspace packages its build depends on (`...` = the
# dependency graph), not the whole monorepo — the web/admin images build their own.
RUN pnpm --filter "@scs/api..." build

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# curl is needed only by HEALTHCHECK; the application itself makes no shell calls.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies are copied from the build stage, including dev dependencies that the
# migration runner needs (`tsx`) — see the migrate note below. `--chown` matters: without
# it the whole tree stays root-owned, which is only harmless while the process is root,
# and it is not (see USER below).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

# Migrations travel *inside* the image so that "the release artifact contains exactly
# the schema this code expects" is verifiable rather than assumed. `migrate-pg.ts`
# resolves them at ../../../../infra/drizzle/migrations from apps/api/infra/drizzle.
COPY --from=build --chown=node:node /app/apps/api/infra ./apps/api/infra
COPY --from=build --chown=node:node /app/infra/drizzle/migrations ./infra/drizzle/migrations

# Run unprivileged, like the web/admin images. Nothing in the API writes to the
# container filesystem at runtime (object storage goes to S3/MinIO, logs go to stdout,
# no `fs.write*`/`mkdir` call exists under apps/api/src), so it needs no writable path
# and never binds a privileged port (`PORT` is 3000). Leaving the process as root would
# turn any future code-execution defect into container takeover.
# Note: `docker compose exec` / `run` inherit this user, so the one-shot `migrate`
# service also runs as `node` — which is why the copied tree is chowned above.
USER node

EXPOSE 3000

# Liveness only. `/v1/healthz` performs no dependency checks (see
# `apps/api/src/health.controller.ts`), so a database blip cannot make a healthy
# process look dead and get it killed. Readiness is checked at the orchestrator
# level against `/v1/readyz`. The `/v1` prefix comes from `enableVersioning()` in
# `main.ts`; there is no `setGlobalPrefix` call.
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/v1/healthz" || exit 1

# Exec form (not shell form) so Node is PID 1 and receives SIGTERM directly. That is
# what lets `app.enableShutdownHooks()` run the worker's lease release before exit.
# Docker's `--init`/compose `init: true` adds zombie reaping on top.
CMD ["node", "apps/api/dist/main.js"]
