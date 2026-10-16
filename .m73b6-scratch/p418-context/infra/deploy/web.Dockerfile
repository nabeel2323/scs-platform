# syntax=docker/dockerfile:1
# ============================================================
# Smart Commerce & Supply Platform — Web storefront production image
# ============================================================
# Build context is the repository root:
#   docker build -f infra/deploy/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t scs-web:local .
#
# NEXT_PUBLIC_API_URL is the *only* build-time value the apps read: every reference in
# apps/web and apps/admin is `process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'`
# (12 sites). No NEXT_PUBLIC_WS_URL / NEXT_PUBLIC_CDN_URL is consumed anywhere, so none is
# declared here — an ARG the code ignores would only create the illusion of configurability.
#
# This image depends on `output: 'standalone'`, which `apps/web/next.config.js`
# already sets in the repository — the artifact is following an existing decision,
# not introducing one. Standalone emits a self-contained server at
# `.next/standalone/apps/web/server.js` with a pruned node_modules.
#
# ── Environment-specificity, stated plainly ──────────────────
# `NEXT_PUBLIC_*` values are inlined into the client bundle **at build time**, so a
# web image is bound to the API origin it was built against. That is why
# NEXT_PUBLIC_API_URL is a build ARG here. It is not a secret — anything a browser
# can fetch is public — but it does mean one promoted artifact per environment, and
# the alternative (runtime config injection) would require changing how the app reads
# its API base URL. Recorded as an open target decision rather than silently chosen.

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

# Declared as a build ARG with an empty default rather than a hard-coded host, so a
# build that forgets to pass it produces an image pointing at '' and fails loudly in
# smoke testing instead of quietly targeting localhost in production.
# (The source fallbacks say `http://localhost:3000`, and one component — 
# StepMedia.tsx — falls back to port 3001, which is drift; passing the ARG is what
# keeps the built artifact independent of those fallbacks.)
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY . .

# Store cache + pnpm retry tuning: the rehearsal host's first build hit ECONNRESET while
# fetching registry tarballs. No manifest or lockfile is modified to work around it.
RUN --mount=type=cache,id=scs-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 300000 && \
    pnpm install --frozen-lockfile --network-concurrency=4
RUN pnpm --filter "@scs/web..." build

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Standalone server + its pruned dependencies.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
# Compiled and immutable client assets: standalone does not include these.
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# NOTE: `apps/web/public` does not exist in this repository today. If it is added, it
# must be copied here as well, or public files 404 in production while working in dev.

USER node
EXPOSE 3100

# The Next server has no application health route, so liveness is the HTTP response of
# the page itself. `/` is used because it is served without any backend dependency.
HEALTHCHECK --interval=20s --timeout=8s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3100}/" >/dev/null || exit 1

CMD ["node", "apps/web/server.js"]
