# syntax=docker/dockerfile:1
# ============================================================
# Smart Commerce & Supply Platform — Admin / platform-operations image
# ============================================================
# Build context is the repository root:
#   docker build -f infra/deploy/admin.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t scs-admin:local .
#
# Structurally identical to web.Dockerfile on purpose: `apps/admin/next.config.js`
# already sets `output: 'standalone'` and the same transpilePackages, and the admin
# app reads exactly one build-time value (`NEXT_PUBLIC_API_URL`, in src/lib/api.ts and
# src/lib/auth.ts). Keeping the two files parallel means a difference between them is
# always a real difference, not an accident of authoring.
#
# The distinction that DOES matter is exposure: this is the platform-operator console,
# so it is deliberately not published on the same path as the storefront. See
# infra/docker-compose.prod.yml and the Phase 4.1 deployment-architecture report.
#
# ── Environment-specificity ────────────────────────────────
# NEXT_PUBLIC_API_URL is inlined into the client bundle at build time, so this artifact
# is bound to the API origin it was built against — one promoted artifact per environment.

# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Native toolchain for node-gyp transitive deps (same set as the CI build job).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Store cache + pnpm retry tuning: the rehearsal host's first build hit ECONNRESET while
# fetching registry tarballs. No manifest or lockfile is modified to work around it.
RUN --mount=type=cache,id=scs-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 300000 && \
    pnpm install --frozen-lockfile --network-concurrency=4
RUN pnpm --filter "@scs/admin..." build

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=3200 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Standalone server + its pruned dependencies.
COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
# Compiled and immutable client assets: standalone does not include these.
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
# NOTE: `apps/admin/public` does not exist in this repository today. If it is added it
# must be copied here as well, or public files 404 in production while working in dev.

USER node
EXPOSE 3200

# Liveness is the HTTP response of the app shell. `/` is served by Next without any
# backend dependency, so a database or API blip cannot make a healthy server look dead.
# Authentication happens on navigation, not on this route, so an unauthenticated
# operator still gets a live (redirecting) response — which is what a liveness probe wants.
HEALTHCHECK --interval=20s --timeout=8s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3200}/" >/dev/null || exit 1

CMD ["node", "apps/admin/server.js"]
