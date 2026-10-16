# Smart Commerce & Supply Platform
## Development & Implementation Plan — Developer-Ready Specification

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Status** | Engineering-ready specification |
| **Source** | `Smart_Commerce_Platform_Implementation_and_UX_Plan.md` — cited as **§n** |
| **Companion** | `Smart_Commerce_Development_Implementation_Plan.html` (presentation rendering) |
| **Audience** | Backend, frontend, mobile, DevOps, and QA engineers |

**How to read this document.** Citations in the form `§n` refer to sections of the source Implementation & UX Plan; its own references to the original strategy document appear as *Source §n* where inherited. Every engineering decision that the source leaves open and this document locks is marked **[Improvement]** with rationale. Part I (§1–§4) defines *what to build*: architecture, foundations, schema, and the order state machine. Part II (§5–§8) defines *how it ships*: phase-by-phase work orders, dependency sequencing, quality gates, and risk control. A developer joining the project reads §0, §1, then their phase's section in §5.

---

# PART I — FOUNDATIONS

## 0. Getting Started & Engineering Ground Rules

### 0.1 Prerequisites & local bootstrap

Toolchain: **Node 20 LTS + pnpm 9**, **Flutter 3.22+** (Android 8 / iOS 14 minimum targets), **Docker Desktop** with Compose, and a PostgreSQL 16 client. All services run locally via Compose; no cloud account is needed for development.

```bash
git clone <repo> && cd scs-platform
pnpm install                                   # workspace + turbo pipeline
docker compose -f infra/docker-compose.dev.yml up -d
#   → postgres:16-postgis, redis:7, minio (S3), mailhog
pnpm --filter @scs/api dev                     # NestJS on :3000, OpenAPI at /docs
pnpm --filter @scs/web dev                     # Next.js retailer/merchant web on :3100
pnpm --filter @scs/admin dev                   # Admin console on :3200
cd mobile && flutter run --flavor retail -t lib/main_retail.dart
pnpm db:migrate && pnpm db:seed                # Drizzle migrations + fixtures
```

### 0.2 Engineering decisions locked by this document

The source plan locks architecture, stack, and conventions (§2.1–§2.5) but leaves tooling-level choices open. This document locks them as follows:

| # | Decision | Choice | Rationale |
|---|---|---|---|
| E1 | Monorepo tooling | pnpm workspaces + Turborepo | Affected-only pipelines keep CI fast as the repo grows; single lockfile across `apps/`, `packages/` **[Improvement]** |
| E2 | ORM & migrations | **Drizzle ORM + drizzle-kit** | Per-module schema files preserve the §2.2 module boundaries (Prisma's single `schema.prisma` would dissolve them); SQL-first, forward-only migrations; typed results without decorators **[Improvement]** |
| E3 | Validation & contracts | zod schemas in `packages/contracts` → OpenAPI 3.1 generation → `openapi-typescript` clients (web) + OpenAPI generator (Flutter/Dart) | Contracts are the single source of truth for §2.5's versioned API; zero hand-written DTO drift **[Improvement]** |
| E4 | Feature flags | `flags` table + typed client (`flags.prepayEnabled`, `flags.b2cEnabled`, `flags.adsEnabled`) | Phase-gated code (e.g., Phase 3 payment states) can ship dark behind a flag; flags are per-market and audit-logged on change **[Improvement]** |
| E5 | Partition automation | pg_partman for `analytics_events`, `driver_locations`, `ad_events` | §3.2 partitioning without hand-rolled cron **[Improvement]** |
| E6 | Architecture lint | `eslint-plugin-boundaries` in CI enforcing §2.2 import rules | Boundary rules that are not machine-checked decay within one sprint **[Improvement]** |
| E7 | Load testing | k6 scripts in `infra/load/`, one per critical flow | §9.1 requires load gates before each phase exit **[Improvement]** |

### 0.3 Definition of Done (applies to every story)

1. OpenAPI contract updated in `packages/contracts`; generated clients compile.
2. Unit tests for domain logic + integration tests against real Postgres/Redis (Testcontainers); domain-module coverage ≥ 85% (§9.1).
3. Migration reviewed for lock impact; forward-only; tested on staging.
4. Object-level authorization check present on every new protected route (§3.9).
5. Telemetry: at least one metric or structured log added for the new path (§3.8).
6. User-facing changes emit the analytics events defined in §3.10.
7. Phase-gated behavior is behind a feature flag (E4).
8. Module README updated; ADR written for any decision that deviates from this spec.
9. CI green including contract tests; E2E updated if a critical flow changed.

### 0.4 Sprint 0 — bootstrap tasks (Week 1, before M1 scope in §5)

1. Monorepo scaffold (E1), shared tsconfig, ESLint + Prettier + boundary lint (E6), CI skeleton.
2. `infra/docker-compose.dev.yml` (Postgres+PostGIS, Redis, MinIO, Mailhog) with healthchecks.
3. NestJS bootstrap: Helmet, CORS allowlist, pino logger with `requestId` correlation, global RFC 7807 exception filter, OTel SDK, `/healthz` + `/readyz`.
4. Drizzle setup (E2) + migration `0001_identity` (§3 DDL) + seed script for roles/permissions (§2.1).
5. Auth OTP end-to-end: request → verify → JWT pair → refresh rotation → logout (M1 scope, proves the whole stack).
6. `packages/contracts` pipeline: zod → OpenAPI → TS/Dart clients; Schemathesis wired into CI (§7).
7. Flutter flavor scaffold (`retail`, `wholesale` first) with `mobile-core` design tokens and API client.
8. Next.js `web` + `admin` scaffolds on `ui-kit` with auth session handling.
9. Audit log middleware + outbox dispatcher skeleton (§2.6, §3.2 of source).
10. k6 smoke script against `/healthz` + auth flow (E7).

---

## 1. Architecture Overview (§2)

### 1.1 Topology & locked decisions

One deployable NestJS application (Modular Monolith) behind an API gateway/LB; PostgreSQL 16 + PostGIS 3.4 as the data core; Redis 7 for cache/ephemeral state; S3-compatible object storage + CDN; Flutter (four flavors) and Next.js as clients; FCM/SMS/Maps as SaaS integrations behind adapters (§2.1, Source §16).

```
Flutter (wholesale│retail│driver│consumer flavors) ─┐
Next.js web (retailer/merchant) · admin console ────┼─▶ LB / API Gateway ─▶ NestJS modular monolith
                                                    │      modules: identity · merchant · catalog · inventory ·
                                                    │      pricing · promotions · orders · reviews · support ·
                                                    │      notifications · analytics · audit
                                                    │      (+ delivery P2 · payments P3 · ads P5 · ai P6)
                                                    ▼
                              PostgreSQL 16 + PostGIS · Redis 7 · S3 + CDN
                                                    │
                              FCM · SMS (×2 providers) · Mapbox · payments (P3) · LLM (P6)
```

Non-negotiable constraints inherited from the source: **no module reads another module's tables**; **no service extraction before a §2.6-trigger is met**; **one database, one deployable** until Phase 4+ triggers (§2.2, §6 of source).

### 1.2 Module boundaries & ownership matrix (§2.2)

Each bounded context is a NestJS module owning its tables, events, and public service surface. **[Improvement]** The ownership matrix below is the authoritative reference for where new code goes:

| Module | Code path (`apps/api/src/modules/`) | Owns tables | Publishes | Consumes |
|---|---|---|---|---|
| identity | `identity/` | users, organizations, organization_members, roles, permissions, sessions | `identity.user.registered` | — |
| merchant | `merchant/` | stores, warehouses, business_documents, verification_requests | `merchant.verification.approved` | `identity.user.registered` |
| catalog | `catalog/` | categories, brands, products, product_variants, product_media, import_jobs | `catalog.product.published`, `catalog.import.completed` | `merchant.verification.approved` |
| inventory | `inventory/` | inventory_items, stock_movements | `inventory.stock.reserved/released` | `order.accepted`, `order.cancelled` |
| pricing | `pricing/` | price_lists, price_tiers | `pricing.price_list.updated` | `catalog.product.published` |
| promotions | `promotions/` | promotions, promotion_redemptions | — | `order.submitted` |
| orders | `orders/` | carts, cart_items, master_orders, orders, order_items, order_financial_breakdown, order_status_history | `order.*` (§App. A) | `inventory.stock.reserved`, `merchant.verification.approved` |
| reviews | `reviews/` | reviews, trust_snapshots | `review.created` | `order.completed` |
| support | `support/` | disputes, dispute_events, conversations, messages | `dispute.*` | `order.status.changed` |
| notifications | `notifications/` | notifications, notification_preferences, device_tokens | `notification.dispatched` | all domain events (template-mapped, §2.6) |
| analytics | `analytics/` | analytics_events | — | all domain events + client `track()` |
| audit | `audit/` | audit_logs, outbox_events | — | all domain events (outbox infrastructure) |
| delivery *(P2)* | `delivery/` | drivers, driver_vehicles, service_zones, delivery_jobs, delivery_job_events, driver_locations, proofs_of_delivery | `delivery.*` | `order.status.changed` |
| payments *(P3)* | `payments/` | payments, ledger_accounts, ledger_entries, settlements, settlement_lines, refunds, subscription_plans, merchant_subscriptions | `payment.*`, `settlement.completed` | `order.submitted`, `order.status.changed` |
| ads *(P5)* | `ads/` | campaigns, ad_items, ad_events | `ad.*` | — |
| ai *(P6)* | `ai/` | reorder_suggestions, ai_requests | — | `order.completed`, analytics events |

Module folder layout (uniform across modules):

```
modules/orders/
├── orders.module.ts        # wires controllers, service, repo, event handlers
├── orders.controller.ts    # HTTP /v1/orders* — thin, delegates to service
├── orders.service.ts       # application service — the ONLY public surface other modules may call
├── orders.repo.ts          # Drizzle queries, private to module
├── dto/                    # zod schemas re-exported from packages/contracts
├── events/                 # event payloads + outbox writers
├── guards/                 # org-scope + permission guards
└── __tests__/              # unit + integration (Testcontainers)
```

**Boundary rules (enforced, §2.2):** (1) cross-module calls only via exported application services; (2) side effects via `outbox_events` written in the same transaction — never fire-and-forget; (3) cross-module read models built by the consuming module from events; (4) public contracts versioned in `packages/contracts`; (5) extraction only on scale divergence, team boundary, or fault isolation (§2.6 rule 5). CI runs the boundary lint (E6) and fails on violations; each module path has a CODEOWNER.

### 1.3 Repository structure (§2.3)

```
scs-platform/
├── apps/
│   ├── api/                    # NestJS modular monolith (src/modules/* per §1.2)
│   ├── web/                    # Next.js: marketing + retailer/merchant app
│   └── admin/                  # Next.js: platform admin console
├── mobile/
│   ├── lib/                    # shared: router, state (Riverpod), offline queue
│   ├── flavors/                # wholesale | retail | driver | consumer entry points
│   └── packages/mobile-core/   # design tokens, api client, auth, i18n (ARB)
├── packages/
│   ├── contracts/              # zod schemas → OpenAPI 3.1 → generated TS/Dart clients
│   ├── ui-kit/                 # web design system (TAIF tokens, Part II §12)
│   ├── event-types/            # domain + analytics event schemas (versioned)
│   └── env/                    # zod-validated environment schemas per app
├── infra/
│   ├── docker-compose.dev.yml
│   ├── k8s/                    # manifests/Helm per environment (§1.4)
│   ├── load/                   # k6 scenarios (E7)
│   └── ci/                     # pipeline definitions (§7.4)
└── docs/                       # ADRs, module READMEs, runbooks
```

### 1.4 Environments (§2.4)

| Env | Purpose | Data | Rules |
|---|---|---|---|
| dev | Local + shared dev | Seeded fixtures | Compose parity with prod images; schema resets via `db:reset` |
| preview | Per-PR ephemeral | Anonymized subset | Auto-provisioned by CI; smoke + contract tests; torn down on merge |
| staging | Pre-prod integration, load tests | Prod-like, anonymized | Payment sandbox, FCM test project; k6 gates run here |
| prod | Live | Real | Migration-gated deploys, blue-green rollout, PITR backups (§3.9) |

Configuration is 12-factor: every app validates its environment through `packages/env` zod schemas at boot and fails fast. Secrets live in the platform secret manager (never in repo); local dev uses `.env.local` files listed in `.gitignore`.

### 1.5 API & engineering conventions (§2.5)

- REST over HTTPS at `/v1`, JSON, camelCase. Errors are RFC 7807 `application/problem+json` with a stable `type` URI per error family.
- `Idempotency-Key` header **required** on `POST /v1/checkout`, all order state transitions, and (P3) payment intents — Redis-backed 24 h store, identical replay returns the original result (§2.5).
- Cursor pagination (`?limit=50&cursor=`); filters/sorts whitelisted per endpoint; optimistic concurrency via `If-Match` ETag on catalog/admin mutations.
- Rate limits: Redis token bucket per user/IP/role with `X-RateLimit-*` headers; OTP endpoints additionally throttle by phone number (§3.9).
- Branching: trunk-based; short-lived PRs (< 400 lines reviewed within 24 h); Conventional Commits; release branches per Flutter flavor. `main` is always deployable.

**Error example (canonical shape):**

```json
{
  "type": "https://api.scsp.dev/errors/order/invalid-transition",
  "title": "Invalid order transition",
  "status": 409,
  "detail": "Order cannot move from DELIVERED to PREPARING.",
  "instance": "/v1/orders/ord_9f3c/status"
}
```

---

## 2. Cross-Cutting Foundations (§3)

### 2.1 Identity & RBAC (§3.1)

Phone-first identity. A **User** may belong to multiple **Organizations** via `organization_members` with a role; roles are named permission sets; permission keys are `module:resource:action`. JWT access tokens (15 min) carry `sub`, `activeOrg`, `role`, and a permission digest; refresh tokens (30 d) rotate with reuse detection (a replayed token revokes the whole chain).

**Access-token claims:**

```json
{
  "sub": "usr_7k2...",
  "activeOrg": "org_9ab...",
  "orgType": "WHOLESALER",
  "role": "OWNER",
  "perms": "o(AKdm9vLPjxWqtzUZ79vzw==)",   // salted digest; guards verify against server-side set
  "iat": 1756845600, "exp": 1756846500, "jti": "s_5Hk9..."
}
```

**Seeded permission catalog** (roles compose these; `PLATFORM_ADMIN` holds all):

| Module | Keys |
|---|---|
| identity | `identity:user:manage` |
| merchant | `merchant:store:write`, `merchant:document:upload` |
| catalog | `catalog:product:write`, `catalog:product:publish`, `catalog:import:run` |
| inventory | `inventory:stock:read`, `inventory:stock:adjust` |
| pricing | `pricing:price-list:write` |
| promotions | `promotions:write` |
| orders | `orders:read`, `orders:accept`, `orders:reject`, `orders:fulfill`, `orders:cancel` |
| reviews | `reviews:write` |
| support | `support:dispute:handle` |
| analytics | `analytics:own:read` |
| admin | `admin:verification:decide`, `admin:moderation:decide`, `admin:orders:read`, `admin:kpi:read`, `admin:audit:read` |
| *(P2)* delivery | `delivery:job:assign`, `delivery:job:fulfill` |
| *(P3)* finance | `finance:refund:approve`, `finance:settlement:run`, `subscriptions:manage` |
| *(P5)* ads | `ads:campaign:write` |

**Guard usage pattern:**

```ts
@UseGuards(JwtAuthGuard, OrgScopeGuard, PermissionsGuard)   // OrgScopeGuard asserts the resource's org_id === token.activeOrg
@RequirePermissions('orders:accept')
@Post(':id/accept')
async accept(@Param('id') id: string, @Body() dto: AcceptOrderDto, @Req() req: AuthedRequest) {
  return this.orders.acceptAll(id, req.auth, dto.idempotencyKey);
}
```

Organization switching: `POST /v1/auth/switch-org { orgId }` issues a new scoped token after membership check **[Improvement]**. Device sessions are listable and remotely revocable.

### 2.2 Database conventions (§3.2)

**Canonical table header** (every table):

```sql
id          uuid primary key,          -- UUIDv7 generated in the application layer (E2/§3.2)
created_at  timestamptz not null default now(),
updated_at  timestamptz not null default now()
```

- PostgreSQL 16 + PostGIS 3.4. All timestamps `timestamptz` stored in UTC.
- **Money:** `bigint` minor units + ISO `char(3)` currency. No floats, no `numeric` for money. One active currency per market at MVP (column present, single value).
- **Statuses:** `varchar` + `CHECK` constraint (cheaper to evolve than native enums).
- **JSONB** only for rule payloads (promotion conditions, media attributes, event props) — never for queryable core fields.
- Soft delete (`deleted_at`) only where restore is a product need (products, categories).
- UUIDv7 is generated in the app layer because PG16 lacks it natively; time-ordered keys keep B-tree locality and cursor pagination cheap (§7.2 #6).

**Migration workflow:** `drizzle-kit generate` → hand-review the SQL → CI check for `lock_timeout`, `statement_timeout`, and no implicit table rewrites → apply to staging → prod during the deploy window, forward-only, never auto-applied. Migration files are immutable once merged.

**Index policy:** FK indexes by default; partial indexes on hot queues (e.g., `orders WHERE status IN ('PENDING_CONFIRMATION','PREPARING')`); GIN on `tsvector`; GiST on `geography`. Monthly RANGE partitions for `analytics_events` (P1), `driver_locations` (P2), `ad_events` (P5) — created by pg_partman (E5), cold data archived to Parquet on S3.

### 2.3 Redis usage patterns (§3.3)

| Use | Key pattern | TTL | Pattern |
|---|---|---|---|
| Sessions / refresh chain | `sess:{userId}:{sessionId}` | 30 d, rotate | Write-through on rotation; revoke = delete |
| OTP codes + attempts | `otp:{phone}` / `otp:att:{phone}` | 90 s / 15 m | INCR attempts, lock after 5 |
| Rate limits | `rl:{scope}:{id}:{bucket}` | sliding window | Token bucket, returns `X-RateLimit-*` |
| Idempotency keys | `idem:{key}` | 24 h | Store first response hash; replay returns it |
| Product / price caches | `cache:prod:{id}`, `price:{variant}:{list}` | 60 s–5 m | Cache-aside; invalidate on `catalog.product.published`, `pricing.price_list.updated` |
| WS presence | `presence:{userId}` | heartbeat 30 s | Gateway reads on fan-out |
| Dispatch / settlement locks | `lock:{jobId}` | bounded | `SET NX PX` with fencing token |

Carts live in PostgreSQL (auditability, cross-device resume); Redis caches hot reads only. Never store the only copy of business data in Redis.

### 2.4 Search strategy (§3.4)

Phase 1 runs PostgreSQL FTS behind a port so the OpenSearch swap is an adapter change, not a rewrite:

```ts
// packages/contracts/src/ports/search.ts
export interface SearchIndexer {
  upsertProduct(doc: ProductSearchDoc): Promise<void>;   // called from catalog.event handlers
  removeProduct(productId: string): Promise<void>;
  query(q: SearchQuery): Promise<{ items: SearchHit[]; cursor?: string }>;
}
export interface ProductSearchDoc {
  productId: string; storeId: string; name: string; nameAr?: string;
  brand?: string; categoryPath: string; sku?: string; barcode?: string;
  priceMinor?: number; moq?: number; rating?: number; storeBadges: string[];
}
```

- Arabic normalization applied **before** indexing and to query strings: strip diacritics, fold alef variants (أإآ→ا), taa-marbuta→haa (ة→ه), unify ya (ى→ي). **[Improvement: concrete folding rules for §3.4]**
- SKU/barcode exact-match takes a fast path (`=§ query`, no trigram).
- **OpenSearch trigger (§3.4):** search p95 > 300 ms sustained one week, active catalog > 150k SKUs, or measurable relevance failure → deploy cluster, backfill via `SearchIndexer` replay, flip adapter.

### 2.5 Media pipeline (§3.5)

1. Client requests `POST /v1/media/presign { filename, contentType, sizeBytes }`.
2. API validates type/size whitelist (images ≤ 10 MB, video P5+) and returns presigned S3 PUT URL + object key.
3. Client uploads **directly to S3** — media never traverses the API.
4. Client commits the object key on the product/store; API enqueues a post-processing job (Redis stream).
5. Worker produces renditions: 200 px & 600 px thumbs, WebP + AVIF, blurhash placeholder; strips EXIF; sniffs real mimetype.
6. Worker writes `product_media` rows (`url`, `thumb_url`, `blurhash`, `alt_text`).
7. CDN invalidates on update; media served with immutable long-lived cache headers.

### 2.6 Notification dispatch (§3.6)

```ts
notifications.dispatch({
  userId, templateKey: 'order.submitted',
  params: { orderNo, storeName, totalMinor, currency },
  channels: ['PUSH','IN_APP']            // routing rules below may override
});
```

**Template registry (seeded; i18n keys resolved per user locale):**

| Template key | Trigger event | Channels | Category |
|---|---|---|---|
| `otp.login` | `identity.otp.requested` | SMS + PUSH | Transactional |
| `order.submitted` | `order.submitted` | PUSH + IN_APP (merchant) | Transactional |
| `order.accepted` / `order.partially_accepted` / `order.rejected` | same-name events | PUSH + IN_APP (buyer) | Transactional |
| `order.ready` | `order.status.changed→READY` | PUSH + IN_APP | Transactional |
| `order.delivered` | `delivery.pod.submitted` (P2) | PUSH + IN_APP | Transactional |
| `order.sla.warning` | SLA timer at T-2 h | PUSH + SMS (merchant) | Transactional |
| `payment.receipt` (P3) | `payment.captured` | IN_APP + EMAIL | Transactional |
| `restock.suggestion` (P4+) | `reorder.suggestion.served` | IN_APP, PUSH digest | Behavioral |
| `promo.campaign` (P4+) | campaign scheduler | PUSH, consent-gated, ≤ 2/wk | Promotional |

Dispatch is triggered **only** by domain events via the outbox (§2.6 source) — handlers never call `dispatch` inline from business services. Quiet hours (22:00–07:00 local) apply to Behavioral/Promotional only. SMS adapter fails over between two providers and falls back to WhatsApp where dominant (§3.6, risk R7).

### 2.7 Realtime WebSocket protocol (§3.7)

Gateway at `/realtime` (Socket.IO, Redis adapter for multi-pod fan-out). **[Improvement: explicit message contracts for §3.7]**

| Message | Direction | Payload | Room / Notes |
|---|---|---|---|
| `hello` | C→S | `{ token }` | JWT handshake; server derives allowed rooms |
| `subscribe` | C→S | `{ rooms: ["order:ord_9f3c"] }` | Server enforces entitlement per room |
| `order.status` | S→C | `{ orderId, from, to, at }` | `order:{id}`, `org:{id}` |
| `delivery.location` | S→C | `{ jobId, lat, lng, accuracyM, at }` | `job:{id}` — batched 3–5 s (§3.7) |
| `delivery.eta` | S→C | `{ jobId, etaSeconds, rangeMin, rangeMax }` | ETA is a **range** until calibrated (I9) |
| `notification.new` | S→C | `{ id, templateKey, payload }` | `user:{id}` |
| `location.batch` | C→S | `{ jobId?, points: [{lat,lng,acc,at}] }` | driver flavor only; 5–15 s adaptive |
| `resync` | C→S | `{ lastEventId }` | Server replays missed order events or instructs REST resync |

Resilience contract: on reconnect the client sends `resync` with its last event id; the server replays missed `order.status` events or responds `{ action: "rest", resource: "/v1/orders?since=..." }`. **The WebSocket is an optimization — REST remains the source of truth** (§9.2 scenario 7).

### 2.8 Observability stack (§3.8)

OpenTelemetry auto-instrumentation (HTTP, PG, Redis) with one span per module service call; pino structured logs carrying `requestId`/`traceId`; RED metrics per endpoint. **[Improvement: canonical metric names]**

| Metric (Prometheus convention) | Type | Phase |
|---|---|---|
| `http_server_request_duration_seconds{route,method,status}` | histogram | 1 |
| `orders_submitted_total` / `orders_accepted_total` / `orders_completed_total` | counter | 1 |
| `order_sla_breach_total` | counter | 1 |
| `outbox_lag_seconds` / `outbox_dispatched_total` | gauge / counter | 1 |
| `otp_send_failures_total{provider}` | counter | 1 |
| `cache_hit_ratio{family}` | gauge | 1 |
| `db_pool_wait_ms` | histogram | 1 |
| `ws_active_sockets` | gauge | 1 |
| `delivery_dispatch_lag_seconds`, `delivery_eta_error_seconds` | gauge | 2 |
| `webhook_failures_total`, `webhook_duplicates_total`, `reconciliation_exceptions_total` | counter | 3 |

Log line shape: `{"ts","level","reqId","module","userId?","orgId?","msg","...context"}`. SLOs: Phase 1 → API 99.5% availability, checkout p95 < 800 ms; all budgets in §7.3. Alerts page ops on-call from day one of pilot.

### 2.9 Security baseline (§3.9, operationalized)

| Control | Implementation | Phase |
|---|---|---|
| Transport | TLS 1.2+, HSTS, Helmet defaults | 1 |
| AuthN | Short JWT + rotating refresh with reuse detection | 1 |
| AuthZ | Org-scope guard + **object-level check on every protected resource** (`assertOrgScope(resource.orgId, token.activeOrg)`) | 1 |
| OTP abuse | Per-phone throttle, device lockout, velocity rules on signup (device fingerprint) | 1 |
| Rate limiting | Redis token buckets per route class (§2.5) | 1 |
| Audit trail | Append-only `audit_logs` written by middleware for: verification decisions, refunds, price overrides, admin impersonation, flag changes | 1 |
| Secrets | Secret manager only; CI secret scanning; no secrets in repo or images | 1 |
| Backups | PITR + daily snapshots; **quarterly restore drills** (a backup is only real if it restores) | 1 |
| Supply chain | Dependency scanning + SAST in CI; lockfile-only installs | 1 |
| Pen test | External test before Phase 3 payments go live | 3 |
| Data classification | PII / financial / location tiers with role-gated access; location retention per §4.11 | 2+ |

### 2.10 Analytics event taxonomy (§3.10)

Client SDK `track()` and server domain events both land in `analytics_events` (partitioned monthly). Property schemas are versioned in `packages/event-types`; breaking changes require a new event version. **[Improvement: property contracts for core events]**

| Event | Key properties | Emitted by |
|---|---|---|
| `search_performed` | `query, filters, resultsCount` | web/mobile |
| `product_viewed` | `productId, storeId, source` | web/mobile |
| `cart_item_added` / `cart_item_removed` | `variantId, qty, storeId` | web/mobile |
| `checkout_started` | `masterCartId, storeCount, valueMinor` | web/mobile |
| `order_submitted` | `masterOrderId, orderIds[], valueMinor` | server (order.submitted) |
| `order_accepted` / `order_completed` | `orderId, acceptLatencyMs` | server |
| `reorder_used` | `sourceOrderId, newOrderId` | web/mobile |
| `import_completed` | `rows, created, updated, failed` | server |
| `verification_submitted` / `verification_decided` | `orgId, decision, reviewLatencyMs` | server |

Activation funnels are defined over these events exactly as in §3.10 (wholesaler: registered → verified → `catalog ≥ 20` → first order → repeat ×3; retailer: registered → area set → first search → first order → completed → repeat). Dashboards in the admin console consume the same pipeline — one source of truth.

## 3. Canonical Data Model (§4)

All Phase 1 DDL follows §2.2 conventions: app-generated UUIDv7 primary keys, `timestamptz` UTC, money as `bigint` minor units with `char(3)` currency, statuses as `varchar` + CHECK. Migration files map to the numbering in §5.1. **[Improvement: §4's entity tables materialized as executable DDL]**

### 3.1 Identity & access (migration `0001_identity`)

```sql
create table users (
  id         uuid primary key,
  phone      varchar(20) not null unique,
  email      varchar(254) unique,
  full_name  varchar(160) not null,
  locale     varchar(10) not null default 'en',
  status     varchar(12) not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id                  uuid primary key,
  type                varchar(12) not null check (type in ('WHOLESALER','RETAILER','LOGISTICS','PLATFORM')),
  name                varchar(160) not null,
  legal_name          varchar(200),
  tax_id              varchar(64),
  country             char(2) not null,                    -- ISO 3166-1 alpha-2
  verification_status varchar(12) not null default 'PENDING'
                      check (verification_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_type_idx on organizations (type, verification_status);

create table roles (
  id    uuid primary key,
  key   varchar(40) not null unique,       -- OWNER, ADMIN, MANAGER, STAFF, DRIVER, PLATFORM_ADMIN
  name  varchar(80) not null
);

create table permissions (
  id  uuid primary key,
  key varchar(64) not null unique          -- module:resource:action (§2.1 catalog)
);

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table organization_members (
  id         uuid primary key,
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role_id    uuid not null references roles(id),
  status     varchar(12) not null default 'ACTIVE' check (status in ('ACTIVE','INVITED','REVOKED')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table sessions (                    -- refresh-token chain with rotation + reuse detection (§2.1)
  id          uuid primary key,
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  char(64) not null unique,    -- sha-256 of refresh token
  device      varchar(160),
  ip          inet,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  replaced_by uuid references sessions(id),
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id) where revoked_at is null;
```

### 3.2 Merchant & stores (migration `0002_merchant`)

```sql
create table stores (
  id               uuid primary key,
  org_id           uuid not null references organizations(id) on delete cascade,
  name             varchar(160) not null,
  kind             varchar(10) not null default 'WHOLESALE' check (kind in ('WHOLESALE','RETAIL','BOTH')),
  address          text,
  location         geography(point, 4326),
  service_radius_m integer,
  hours            jsonb,                                  -- {"sun":[["08:00","13:00"],...]}
  status           varchar(10) not null default 'PENDING' check (status in ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stores_location_idx on stores using gist (location);
create index stores_org_idx on stores (org_id, status);

create table warehouses (
  id         uuid primary key,
  store_id   uuid not null references stores(id) on delete cascade,
  name       varchar(120) not null,
  location   geography(point, 4326),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table business_documents (
  id         uuid primary key,
  store_id   uuid not null references stores(id) on delete cascade,
  type       varchar(40) not null,          -- configurable doc set per market (Source §9.1)
  url        text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table verification_requests (
  id          uuid primary key,
  org_id      uuid not null references organizations(id),
  store_id    uuid references stores(id),
  doc_type    varchar(40) not null,
  doc_url     text not null,
  status      varchar(12) not null default 'SUBMITTED'
              check (status in ('SUBMITTED','IN_REVIEW','APPROVED','REJECTED')),
  reviewer_id uuid references users(id),
  decision    varchar(400),                 -- mandatory on reject (§3.9 audit)
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index verification_requests_queue_idx on verification_requests (status, created_at)
  where status in ('SUBMITTED','IN_REVIEW');
```

### 3.3 Catalog & media (migration `0003_catalog`)

```sql
create table categories (
  id         uuid primary key,
  parent_id  uuid references categories(id),
  path       varchar(400) not null unique,  -- materialized path: 'food/breakfast/cereal'
  name       varchar(120) not null,
  slug       varchar(140) not null unique,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table brands (
  id   uuid primary key,
  name varchar(120) not null,
  slug varchar(140) not null unique
);

create table products (
  id              uuid primary key,
  store_id        uuid not null references stores(id),
  category_id     uuid references categories(id),
  brand_id        uuid references brands(id),
  name            varchar(200) not null,
  slug            varchar(220) not null,
  description     text,
  status          varchar(10) not null default 'DRAFT'
                  check (status in ('DRAFT','ACTIVE','ARCHIVED','REJECTED')),
  moderation_note varchar(400),
  search_vector   tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (store_id, slug)
);
create index products_store_status_idx on products (store_id, status) where deleted_at is null;
create index products_search_idx on products using gin (search_vector);
create index products_category_idx on products (category_id) where deleted_at is null;

create table product_variants (
  id           uuid primary key,
  product_id   uuid not null references products(id) on delete cascade,
  sku          varchar(64),
  barcode      varchar(64),
  unit         varchar(12) not null,        -- PIECE, BOX, CASE, KG, L
  package_size numeric(10,3),
  attributes   jsonb not null default '{}',
  is_default   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_variants_sku_idx on product_variants (sku) where sku is not null;
create index product_variants_barcode_idx on product_variants (barcode) where barcode is not null;

create table product_media (
  id         uuid primary key,
  product_id uuid not null references products(id) on delete cascade,
  url        text not null,
  thumb_url  text,
  blurhash   varchar(60),
  alt_text   varchar(300),                   -- mandatory for a11y/SEO (Part II §12.4)
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table import_jobs (
  id           uuid primary key,
  store_id     uuid not null references stores(id),
  file_url     text not null,
  mapping      jsonb,                        -- column → field map, auto-mapped then user-corrected
  status       varchar(10) not null default 'UPLOADED'
               check (status in ('UPLOADED','MAPPING','VALIDATED','IMPORTING','REVIEW','COMPLETED','FAILED')),
  errors       jsonb,                        -- [{row, field, message}]
  stats        jsonb,                        -- {rows, created, updated, failed}
  created_by   uuid not null references users(id),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
```

### 3.4 Inventory (migration `0004_inventory`)

```sql
create table inventory_items (
  id            uuid primary key,
  variant_id    uuid not null references product_variants(id) on delete cascade,
  warehouse_id  uuid not null references warehouses(id),
  qty_on_hand   integer not null default 0 check (qty_on_hand >= 0),
  qty_reserved  integer not null default 0 check (qty_reserved >= 0),
  reorder_point integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (variant_id, warehouse_id)
);
create index inventory_items_low_idx on inventory_items (warehouse_id)
  where (qty_on_hand - qty_reserved) <= reorder_point;

create table stock_movements (            -- append-only ledger; every change reconstructable (§4.4)
  id         uuid primary key,
  item_id    uuid not null references inventory_items(id),
  delta      integer not null,
  reason     varchar(8) not null check (reason in ('ADJUST','RESERVE','RELEASE','SALE','CANCEL')),
  ref_type   varchar(20),                 -- 'order' | 'import' | 'admin'
  ref_id     uuid,
  actor_id   uuid references users(id),
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on stock_movements (item_id, created_at desc);
```

**Reservation policy (I3):** stock is reserved at merchant **acceptance**, not at cart — `RESERVE` rows are written in the same transaction as the `order.accepted` event; `RELEASE` on partial-accept leftovers and cancellation.

### 3.5 Pricing & promotions (migrations `0005_pricing`, `0007_promotions`)

```sql
create table price_lists (
  id         uuid primary key,
  store_id   uuid not null references stores(id),
  name       varchar(120) not null,
  channel    varchar(4) not null default 'B2B' check (channel in ('B2B','B2C')),  -- B2C activates in P4 (§7.2 #4)
  audience   varchar(10) not null default 'PUBLIC' check (audience in ('PUBLIC','SEGMENT','CONTRACT')),
  currency   char(3) not null default 'SAR',
  valid_from timestamptz,
  valid_to   timestamptz,
  status     varchar(9) not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index price_lists_store_idx on price_lists (store_id, channel, status);

create table price_tiers (
  id              uuid primary key,
  price_list_id   uuid not null references price_lists(id) on delete cascade,
  variant_id      uuid not null references product_variants(id),
  min_qty         integer not null check (min_qty >= 1),
  max_qty         integer,                 -- null = unbounded
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  unique (price_list_id, variant_id, min_qty),
  check (max_qty is null or max_qty >= min_qty)
);
create index price_tiers_resolve_idx on price_tiers (variant_id, price_list_id, min_qty);

create table promotions (
  id           uuid primary key,
  store_id     uuid references stores(id),  -- null = platform-funded
  type         varchar(14) not null check (type in ('PERCENT','FIXED','QTY_DISCOUNT','TIME_LIMITED','BUY_X_GET_Y','BUNDLE','SEGMENT','GEO')),
  conditions   jsonb not null default '{}', -- e.g. {"minQty":24,"segment":"NEW","zone":"north"}
  value        numeric(12,4) not null,      -- percent or minor amount by type
  currency     char(3),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  budget_minor bigint,
  usage_limit  integer,
  status       varchar(8) not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','ENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table promotion_redemptions (
  id            uuid primary key,
  promotion_id  uuid not null references promotions(id),
  order_id      uuid not null,             -- FK added in 0006_orders (circular-safe: created after orders)
  discount_minor bigint not null check (discount_minor >= 0),
  created_at    timestamptz not null default now(),
  unique (promotion_id, order_id)
);
```

Phase 1 implements PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED; remaining types are data-gated, not code-gated (§6.3 source).

### 3.6 Cart & orders (migration `0006_orders`) — the transactional core

```sql
create table carts (
  id           uuid primary key,
  buyer_org_id uuid not null references organizations(id),
  buyer_user_id uuid not null references users(id),
  channel      varchar(4) not null default 'B2B' check (channel in ('B2B','B2C')),
  status       varchar(10) not null default 'ACTIVE' check (status in ('ACTIVE','CONVERTED','ABANDONED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id         uuid primary key,
  cart_id    uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  store_id   uuid not null references stores(id),      -- supplier grouping (§14.3 Part II)
  qty        integer not null check (qty >= 1),
  note       varchar(400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cart_items_cart_idx on cart_items (cart_id, store_id);

create table master_orders (                     -- buyer's purchase intent (Source §7.2)
  id            uuid primary key,
  buyer_org_id  uuid not null references organizations(id),
  buyer_user_id uuid not null references users(id),
  channel       varchar(4) not null default 'B2B' check (channel in ('B2B','B2C')),
  status        varchar(22) not null,            -- derived from sub-orders (§4 FSM)
  totals_minor  bigint not null default 0,
  currency      char(3) not null,
  placed_at     timestamptz not null default now(),
  completed_at  timestamptz
);
create index master_orders_buyer_idx on master_orders (buyer_org_id, placed_at desc);

create table orders (                            -- sub-order per supplier, from day one (§7.2 #2)
  id                 uuid primary key,
  master_order_id    uuid not null references master_orders(id),
  store_id           uuid not null references stores(id),
  status             varchar(22) not null default 'SUBMITTED',
  fulfillment_method varchar(18) not null default 'PICKUP'
                     check (fulfillment_method in ('PICKUP','MERCHANT_DELIVERY','PLATFORM_DELIVERY')),
  buyer_note         varchar(400),
  placed_at          timestamptz not null default now(),
  accepted_at        timestamptz,
  sla_at             timestamptz,                -- confirmation SLA deadline (§4 FSM)
  delivered_at       timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      varchar(400)
);
create index orders_store_active_idx on orders (store_id, status)
  where status in ('PENDING_CONFIRMATION','PARTIALLY_ACCEPTED','ACCEPTED','PREPARING','READY');
create index orders_master_idx on orders (master_order_id);
create index orders_buyer_history_idx on orders (store_id, placed_at desc);

create table order_items (
  id               uuid primary key,
  order_id         uuid not null references orders(id) on delete cascade,
  variant_id       uuid not null references product_variants(id),
  qty              integer not null check (qty >= 1),
  qty_confirmed    integer,                      -- set on accept/partial-accept
  unit_price_minor bigint not null,              -- SNAPSHOT at checkout — the audit record (§4.5)
  tier_min_qty     integer,                      -- quantity tier applied
  promo_snapshot   jsonb,                        -- promotion values applied
  line_total_minor bigint not null,
  created_at       timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);

create table order_financial_breakdown (        -- ledger shadow from P1; activates P3 (I5, §17.2 source)
  order_id           uuid primary key references orders(id) on delete cascade,
  products_minor     bigint not null default 0,
  discount_minor     bigint not null default 0,
  delivery_fee_minor bigint not null default 0,
  tax_minor          bigint not null default 0,
  commission_minor   bigint not null default 0,
  merchant_net_minor bigint not null default 0,
  currency           char(3) not null,
  finalized_at       timestamptz
);

create table order_status_history (             -- every transition, every actor (§4.7)
  id          uuid primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  from_status varchar(22),
  to_status   varchar(22) not null,
  actor_type  varchar(9) not null check (actor_type in ('BUYER','MERCHANT','DRIVER','ADMIN','SYSTEM')),
  actor_id    uuid,
  reason      varchar(400),
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on order_status_history (order_id, created_at);
```

### 3.7 Trust, support & communications (migrations `0008_trust`, `0009_comms`)

```sql
create table reviews (                          -- order-gated: one review per subject per order (§4.8)
  id           uuid primary key,
  order_id     uuid not null references orders(id),
  reviewer_id  uuid not null references users(id),
  subject_type varchar(7) not null check (subject_type in ('STORE','DRIVER','BUYER')),
  subject_id   uuid not null,
  rating       smallint not null check (rating between 1 and 5),
  content      varchar(1000),
  status       varchar(9) not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN','REMOVED')),
  created_at   timestamptz not null default now(),
  unique (order_id, reviewer_id, subject_type)
);
create index reviews_subject_idx on reviews (subject_type, subject_id) where status = 'PUBLISHED';

create table trust_snapshots (
  id          uuid primary key,
  store_id    uuid not null references stores(id),
  dimensions  jsonb not null,                    -- §9.2 source dimensions
  score       numeric(5,2),
  badges      jsonb not null default '[]',       -- VERIFIED | TRUSTED | FAST_FULFILLMENT (explainable)
  computed_at timestamptz not null default now()
);
create index trust_snapshots_store_idx on trust_snapshots (store_id, computed_at desc);

create table disputes (
  id         uuid primary key,
  order_id   uuid not null references orders(id),
  opened_by  uuid not null references users(id),
  reason     varchar(40) not null,
  state      varchar(9) not null default 'OPEN'
             check (state in ('OPEN','EVIDENCE','RESPONSE','REVIEW','RESOLVED','CLOSED')),
  resolution varchar(400),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table dispute_events (
  id         uuid primary key,
  dispute_id uuid not null references disputes(id) on delete cascade,
  actor_id   uuid references users(id),
  action     varchar(30) not null,
  note       varchar(600),
  attachment text,
  created_at timestamptz not null default now()
);

create table conversations (                     -- order-linked chat only (Source §9.4)
  id         uuid primary key,
  order_id   uuid not null references orders(id),
  created_at timestamptz not null default now(),
  unique (order_id)
);

create table messages (
  id              uuid primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references users(id),
  body            varchar(2000),
  attachments     jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);

create table device_tokens (
  id         uuid primary key,
  user_id    uuid not null references users(id) on delete cascade,
  platform   varchar(7) not null check (platform in ('IOS','ANDROID','WEB')),
  app_flavor varchar(10) not null check (app_flavor in ('WHOLESALE','RETAIL','DRIVER','CONSUMER')),
  token      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table notifications (
  id           uuid primary key,
  user_id      uuid not null references users(id) on delete cascade,
  template_key varchar(60) not null,
  category     varchar(14) not null check (category in ('TRANSACTIONAL','PROMOTIONAL','BEHAVIORAL')),
  payload      jsonb not null default '{}',
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_unread_idx on notifications (user_id, created_at desc) where read_at is null;

create table notification_preferences (
  user_id  uuid not null references users(id) on delete cascade,
  category varchar(14) not null,
  channel  varchar(6) not null check (channel in ('PUSH','SMS','EMAIL')),
  enabled  boolean not null default true,
  primary key (user_id, category, channel)
);
```

### 3.8 Platform tables (migration `0010_platform`)

```sql
create table audit_logs (                       -- append-only; written by middleware (§3.9)
  id         uuid primary key,
  actor_id   uuid references users(id),
  action     varchar(60) not null,               -- e.g. verification.decide, refund.create, flag.change
  resource   varchar(120) not null,              -- 'order:ord_9f3c'
  before     jsonb,
  after      jsonb,
  ip         inet,
  created_at timestamptz not null default now()
);
create index audit_logs_resource_idx on audit_logs (resource, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);

create table outbox_events (                    -- transactional outbox (§2.6)
  id             uuid primary key,
  aggregate_type varchar(30) not null,
  aggregate_id   uuid not null,
  event_type     varchar(60) not null,
  payload        jsonb not null,
  dispatched_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index outbox_pending_idx on outbox_events (created_at) where dispatched_at is null;

create table analytics_events (                 -- monthly RANGE partitions (pg_partman, E5)
  id          uuid not null default gen_random_uuid(),
  name        varchar(60) not null,
  user_id     uuid,
  org_id      uuid,
  session_id  varchar(64),
  app_flavor  varchar(10),
  props       jsonb not null default '{}',
  received_at timestamptz not null default now(),
  primary key (received_at, id)
) partition by range (received_at);
-- Example partition (pg_partman creates these on schedule):
-- create table analytics_events_2026_09 partition of analytics_events
--   for values from ('2026-09-01') to ('2026-10-01');

create table flags (                            -- feature flags (E4) [Improvement]
  key         varchar(60) primary key,
  value       jsonb not null,                    -- typed: boolean | rollout {pct} | per-market map
  description varchar(200),
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
```

### 3.9 Forward-compatible DDL — Phase 2 delivery (migrations `0013`–`0016`)

```sql
create table drivers (
  id         uuid primary key,
  user_id    uuid not null references users(id) unique,
  org_id     uuid references organizations(id),          -- null = independent network driver
  license_no varchar(60) not null,
  status     varchar(11) not null default 'PENDING'
             check (status in ('PENDING','ACTIVE','SUSPENDED','TERMINATED')),
  rating_avg numeric(3,2),
  created_at timestamptz not null default now()
);

create table driver_vehicles (
  id          uuid primary key,
  driver_id   uuid not null references drivers(id) on delete cascade,
  type        varchar(11) not null check (type in ('MOTORCYCLE','CAR','VAN','TRUCK')),
  capacity_kg integer,
  plate_no    varchar(20)
);

create table service_zones (
  id        uuid primary key,
  name      varchar(120) not null,
  geom      geography(polygon, 4326) not null,
  is_active boolean not null default true
);
create index service_zones_geom_idx on service_zones using gist (geom);

create table delivery_jobs (
  id          uuid primary key,
  order_id    uuid not null references orders(id) unique,
  driver_id   uuid references drivers(id),
  status      varchar(16) not null default 'UNASSIGNED'
              check (status in ('UNASSIGNED','OFFERED','ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','FAILED','CANCELLED')),
  assigned_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  fee_minor   bigint,
  eta_seconds integer,
  created_at  timestamptz not null default now()
);
create index delivery_jobs_driver_idx on delivery_jobs (driver_id, status);
create index delivery_jobs_unassigned_idx on delivery_jobs (created_at) where status = 'UNASSIGNED';

create table delivery_job_events (
  id         uuid primary key,
  job_id     uuid not null references delivery_jobs(id) on delete cascade,
  event      varchar(30) not null,
  data       jsonb,
  created_at timestamptz not null default now()
);

create table driver_locations (                 -- monthly partitions; raw points 90 days (§4.11, §18.2 source)
  driver_id   uuid not null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  real,
  recorded_at timestamptz not null,
  primary key (driver_id, recorded_at)
) partition by range (recorded_at);

create table proofs_of_delivery (
  id            uuid primary key,
  job_id        uuid not null references delivery_jobs(id) unique,
  method        varchar(9) not null check (method in ('OTP','PHOTO','SIGNATURE')),
  otp_verified  boolean,
  photo_url     text,
  signature_url text,
  recipient_name varchar(120),
  location      geography(point, 4326),
  delivered_at  timestamptz not null default now()
);
```

### 3.10 Forward-compatible DDL — Phase 3 payments & ledger (migrations `0017`–`0020`)

```sql
create table payments (
  id           uuid primary key,
  order_id     uuid not null references orders(id),
  provider     varchar(20) not null,           -- adapter key (§6.3)
  provider_ref varchar(120) unique,            -- correlation id from provider webhook (I10)
  amount_minor bigint not null check (amount_minor > 0),
  currency     char(3) not null,
  method       varchar(9) not null check (method in ('CARD','WALLET','COD','TRANSFER')),
  status       varchar(10) not null default 'INITIATED'
               check (status in ('INITIATED','AUTHORIZED','CAPTURED','FAILED','REFUNDED','CANCELLED')),
  created_at   timestamptz not null default now(),
  captured_at  timestamptz
);
create index payments_order_idx on payments (order_id);

create table ledger_accounts (
  id         uuid primary key,
  owner_type varchar(9) not null check (owner_type in ('MERCHANT','DRIVER','PLATFORM')),
  owner_id   uuid not null,
  currency   char(3) not null,
  unique (owner_type, owner_id, currency)
);

create table ledger_entries (                   -- append-only double-entry; sum(debits)=sum(credits) per tx_ref (§17.2 source)
  id           uuid primary key,
  tx_ref       uuid not null,                   -- groups entries of one transaction
  account_id   uuid not null references ledger_accounts(id),
  direction    varchar(6) not null check (direction in ('DEBIT','CREDIT')),
  amount_minor bigint not null check (amount_minor > 0),
  ref_type     varchar(11) not null check (ref_type in ('ORDER','PAYMENT','SETTLEMENT','REFUND','FEE')),
  ref_id       uuid not null,
  memo         varchar(200),
  created_at   timestamptz not null default now()
);
create index ledger_entries_tx_idx on ledger_entries (tx_ref);
create index ledger_entries_account_idx on ledger_entries (account_id, created_at desc);

create table settlements (
  id          uuid primary key,
  period_from timestamptz not null,
  period_to   timestamptz not null,
  status      varchar(11) not null default 'OPEN' check (status in ('OPEN','CALCULATED','APPROVED','PAID')),
  created_at  timestamptz not null default now()
);

create table settlement_lines (
  id            uuid primary key,
  settlement_id uuid not null references settlements(id) on delete cascade,
  account_id    uuid not null references ledger_accounts(id),
  net_minor     bigint not null,
  payout_id     uuid
);

create table refunds (
  id          uuid primary key,
  payment_id  uuid not null references payments(id),
  order_id    uuid not null references orders(id),
  amount_minor bigint not null check (amount_minor > 0),
  reason_code varchar(30) not null,
  status      varchar(9) not null default 'PENDING' check (status in ('PENDING','PROCESSED','REJECTED')),
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now()
);

create table subscription_plans (
  id          uuid primary key,
  key         varchar(6) not null unique,       -- FREE, PRO
  price_minor bigint not null,
  currency    char(3) not null,
  features    jsonb not null default '{}'
);

create table merchant_subscriptions (
  id           uuid primary key,
  org_id       uuid not null references organizations(id),
  plan_id      uuid not null references subscription_plans(id),
  status       varchar(9) not null default 'ACTIVE' check (status in ('ACTIVE','PAST_DUE','CANCELLED')),
  period_start timestamptz not null,
  period_end   timestamptz not null
);
```

### 3.11 Forward-compatible DDL — Phases 4–6 (migrations `0021`–`0025`)

```sql
-- Phase 4
create table consumer_profiles (
  user_id            uuid primary key references users(id),
  default_address_id uuid,
  marketing_consent  boolean not null default false
);

create table consumer_addresses (
  id         uuid primary key,
  user_id    uuid not null references users(id) on delete cascade,
  label      varchar(60),
  location   geography(point, 4326) not null,
  address    text not null,
  is_default boolean not null default false
);

create table store_service_areas (
  id       uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  geom     geography(polygon, 4326) not null,
  channel  varchar(4) not null default 'B2C'
);
create index store_service_areas_geom_idx on store_service_areas using gist (geom);

-- Phase 5
create table campaigns (
  id              uuid primary key,
  store_id        uuid not null references stores(id),
  objective       varchar(18) not null check (objective in ('SPONSORED_PRODUCT','SPONSORED_STORE','SPONSORED_OFFER','SEARCH','GEO')),
  budget_minor    bigint not null check (budget_minor > 0),
  daily_cap_minor bigint,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  status          varchar(8) not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','ENDED')),
  created_at      timestamptz not null default now()
);

create table ad_events (                        -- monthly partitions; impression/click/conversion unified
  id          uuid not null default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  kind        varchar(11) not null check (kind in ('IMPRESSION','CLICK','CONVERSION')),
  user_id     uuid,
  placement   varchar(20),
  cost_minor  bigint not null default 0,
  occurred_at timestamptz not null default now(),
  primary key (occurred_at, id)
) partition by range (occurred_at);

-- Phase 6
create table reorder_suggestions (
  id          uuid primary key,
  buyer_ref   uuid not null,                     -- user_id or org_id by channel
  variant_id  uuid not null references product_variants(id),
  expected_at timestamptz not null,
  qty         integer not null check (qty >= 1),
  confidence  numeric(4,3),
  served_at   timestamptz,
  acted_at    timestamptz
);
create index reorder_suggestions_buyer_idx on reorder_suggestions (buyer_ref, expected_at desc);

create table ai_requests (                      -- AI Gateway audit (Source §12.3)
  id            uuid primary key,
  capability    varchar(24) not null check (capability in ('GENERATE_DESCRIPTION','SUMMARIZE','EXTRACT','CLASSIFY','RECOMMEND','FORECAST')),
  provider      varchar(30) not null,
  model         varchar(60),
  user_id       uuid references users(id),
  input_tokens  integer,
  output_tokens integer,
  cost_minor    bigint,
  created_at    timestamptz not null default now()
);
```

### 3.12 Partitioning & retention strategy

| Table | Strategy | Hot window | Cold path | Rationale |
|---|---|---|---|---|
| `analytics_events` | RANGE monthly (pg_partman) | 60 days | Parquet on S3 → warehouse (I11) | Keeps OLTP PG lean; warehouse-ready (§3.2) |
| `driver_locations` | RANGE monthly | 90 days raw | Aggregated trip traces only (§18.2 source) | Location privacy + storage cost |
| `ad_events` | RANGE monthly | 90 days | Parquet on S3 | Event firehose volume (§6.5) |
| `outbox_events` | prune after 30 days dispatched | — | — | Outbox is transport, not history |
| `audit_logs`, `ledger_entries`, `stock_movements`, `order_status_history` | **never partition, never delete** | — | — | Append-only regulatory/history records (§30.3 source) |

## 4. Order State Machine (§5)

Statuses (§5.1): `DRAFT · SUBMITTED · PENDING_CONFIRMATION · ACCEPTED · PARTIALLY_ACCEPTED · PAYMENT_PENDING · PREPARING · READY · ASSIGNED · PICKED_UP · OUT_FOR_DELIVERY · DELIVERED · COMPLETED · CANCELLED · REJECTED · DISPUTED`. The delivery states and `PAYMENT_PENDING` exist in the Phase 1 machine but are unreachable until Phase 2/3 features ship — the FSM is complete from day one so later phases add behavior, not schema.

### 4.1 Transition matrix (guards & side effects)

| From | Trigger (actor) | To | Guards & side effects |
|---|---|---|---|
| DRAFT | Checkout (buyer) | SUBMITTED | Validate MOQ per line; resolve + snapshot prices onto items; write `order_financial_breakdown`; emit `order.submitted` |
| SUBMITTED | Auto | PENDING_CONFIRMATION | Notify merchant (push + in-app); start confirmation SLA timer (default 12 h → `sla_at`) |
| PENDING_CONFIRMATION | Merchant accept-all | ACCEPTED | Reserve inventory (same tx); re-validate prices → if price list changed, require line-level delta confirm (**re-price guard**, I2) |
| PENDING_CONFIRMATION | Merchant accept-partial | PARTIALLY_ACCEPTED | Reserve confirmed qty only; release the rest; buyer notified of per-line deltas |
| PENDING_CONFIRMATION | Merchant reject / SLA expiry | REJECTED / CANCELLED | Reason mandatory; notify buyer; nothing reserved |
| ACCEPTED / PARTIAL | Auto (prepay off — P1 default) | PREPARING | Payment on account; flag `prepayEnabled` flips this in P3 |
| ACCEPTED / PARTIAL | Auto (prepay on, P3) | PAYMENT_PENDING | Payment intent created; order proceeds only on webhook |
| PAYMENT_PENDING | Payment webhook (P3) | PREPARING | Idempotent handler; on failure → retry / CANCELLED per policy (I10) |
| PREPARING | Merchant | READY | Notify buyer; fulfillment branch: PICKUP → handover code; delivery → create `delivery_jobs` row → ASSIGNED (P2) |
| READY | Pickup code verified | DELIVERED | Handover OTP verified at pickup |
| ASSIGNED | Driver accepts + pickup verified (P2) | PICKED_UP | Job accepted; pickup verification |
| PICKED_UP | Driver departs (P2) | OUT_FOR_DELIVERY | Live tracking + ETA to buyer |
| OUT_FOR_DELIVERY | POD submitted (P2) | DELIVERED | OTP/photo/signature + geo + recipient name (`proofs_of_delivery`) |
| DELIVERED | Financial closure | COMPLETED | `order_financial_breakdown.finalized_at`; review window opens (§4.8) |
| DELIVERED / COMPLETED | Dispute opened (≤ 72 h) | DISPUTED | Evidence bundle attached; support workflow (§3.7) |
| any pre-DELIVERED | Cancellation policy | CANCELLED | Free until ACCEPTED; policy fee after; release reservations; sub-order scope only |

### 4.2 Implementation pattern

Every transition is a single transactional unit: **guard → mutate → history row → outbox row → idempotency record**.

```ts
// orders.service.ts — canonical transition method
async transition(orderId: string, to: OrderStatus, actor: Actor, reason?: string, idemKey?: string) {
  return this.db.transaction(async (tx) => {
    await this.idem.seenOrReplay(idemKey, tx);              // 1. idempotency (§4.3)
    const order = await tx.repo.orders.lockForUpdate(orderId); // 2. row lock — no lost transitions
    const guard = this.fsm.guard(order.status, to);          // 3. FSM guard — the ONLY transition source of truth
    if (!guard.allowed) throw new InvalidTransitionProblem(order.status, to);
    await guard.sideEffects(tx, order, actor);               // 4. reserve/release stock, re-price check, webhook create
    await tx.repo.orders.setStatus(orderId, to);
    await tx.repo.statusHistory.insert({ orderId, from: order.status, to, actor, reason });
    await tx.repo.outbox.insert({                             // 5. exactly one event
      aggregateType: 'order', aggregateId: orderId,
      eventType: 'order.status.changed',
      payload: { orderId, from: order.status, to, at: new Date() },
    });
  });
}
```

Rules encoded once, reused everywhere: no controller calls repo directly; no transition bypasses `transition()`; the FSM guard table lives in `orders/fsm.ts` as data, so the matrix above is executable documentation.

### 4.3 Policies

- **Re-price guard (I2):** if the merchant's price list changed between checkout and acceptance, the acceptance endpoint returns a `409 price_changed` problem with per-line deltas; the merchant explicitly confirms each changed line (`POST /orders/{id}/items/{itemId}/confirm`). Prevents silent margin erosion (§30.2 source).
- **Idempotency (§30.3 source):** all transition endpoints accept `Idempotency-Key`; replays return the original result, never a second transition.
- **SLA timers:** a delayed job (Redis streams) fires at `sla_at - 2h` (`order.sla.warning`) and at `sla_at` (auto-CANCELLED + reason `SLA_EXPIRED` + buyer notification).
- **Partial cancellation:** only the affected sub-order changes; `master_orders.status` is derived (worst-of, e.g., any DISPUTED → master DISPUTED).
- **Dispute window:** 72 h from DELIVERED; opening a dispute freezes `order_financial_breakdown.finalized_at` (P3: freezes settlement lines).

### 4.4 Status semantics (shared with design system)

Status color/icon mapping is owned by the design system (Part II §12.1) and consumed identically by StatusPill, OrderTimeline, and push notifications — icon + color + text, never color alone:

| State group | Semantic | Icon |
|---|---|---|
| DRAFT / SUBMITTED / PENDING_CONFIRMATION | info | clock |
| ACCEPTED / PARTIALLY_ACCEPTED / PREPARING / READY | brand | check-circle |
| ASSIGNED / PICKED_UP / OUT_FOR_DELIVERY | info | truck |
| DELIVERED / COMPLETED | success | check-badge |
| CANCELLED / REJECTED | neutral | x-circle |
| DISPUTED | error | alert |

---

# PART II — DELIVERY & GOVERNANCE

## 5. Phase-by-Phase Implementation Breakdown (§6)

Each phase ends with a deployable increment and a KPI go/no-go gate (§19 source, §6 intro). Scope fences are **binding** — items beyond them require a Product Council decision with a KPI hypothesis (§37 source, I13).

### 5.0 Phase 0 — Market Validation & Design (4–8 weeks, §6.0)

**Engineering scope (light — do not build product features):**

1. Execute Sprint 0 (§0.4) completely — the Phase 1 team must start M1 on a green pipeline.
2. Tech spikes with written ADRs: PostGIS distance/zone queries on realistic data volumes; SMS/OTP delivery benchmark across **two** providers (R12); FCM delivery latency; Mapbox vs. MapLibre cost model; payment provider availability in the target market.
3. **Catalog intake template** (Excel) built and used to collect anchor-supplier catalogs manually — it becomes the Phase 1 bulk-import contract (§6.0 improvement).
4. ERD review against §3 DDL; freeze migration plan `0001`–`0012`.
5. Prototype instrumentation: usability-test the Figma prototype; log task completion into the KPI baseline.

**Exit gate (§20.3 source):** merchants committed to catalogs; retailer group willing to buy; first procurement flow clear. **Fences:** no product code beyond Sprint 0; no cloud prod environment.

### 5.1 Phase 1 — Launchable B2B MVP (12–18 weeks, §6.1)

**Objective:** an operating B2B marketplace in one area — registration, verification, catalog, tiered pricing, search, cart, ordering, accept/reject, statuses, notifications, basic ratings (§21.1 source). Fulfillment = self-pickup or merchant-managed delivery.

#### 5.1.1 Milestones (from §6.1)

| Milestone | Weeks | Backend | Frontend / mobile |
|---|---|---|---|
| M1 Foundation | 1–3 | identity + audit + outbox + middleware (Sprint 0 output hardened) | auth screens both flavors; web/admin auth |
| M2 Merchant onboarding | 3–6 | merchant module: stores, documents, verification queue | Store wizard, DocUploader, admin verification console |
| M3 Catalog & pricing | 5–8 | catalog + inventory + pricing modules; media pipeline; moderation | Product editor, TierLadder editor, ImportWizard, admin moderation |
| M4 Discovery & cart | 7–10 | PG FTS + filters; favorites; multi-supplier cart | Search, store/product pages, cart (Part II §14.2–14.3) |
| M5 Ordering | 9–12 | orders module: checkout, FSM, accept/partial/reject, reorder, notifications | Order flows, OrderTimeline, notifications center |
| M6 Trust & admin | 12–14 | reviews module; disputes-lite; admin KPIs; analytics funnel | Ratings UI; admin order monitor + KPI dashboard |
| M7 Hardening & pilot | 14–16+ | load tests (k6), security review, fixes | Usability passes; pilot launch support |

#### 5.1.2 Migrations (in order)

```
0001_identity.sql        users, organizations, roles, permissions, organization_members, sessions
0002_merchant.sql        stores, warehouses, business_documents, verification_requests
0003_catalog.sql         categories, brands, products, product_variants, product_media, import_jobs
0004_inventory.sql       inventory_items, stock_movements
0005_pricing.sql         price_lists, price_tiers
0006_orders.sql          carts, cart_items, master_orders, orders, order_items,
                         order_financial_breakdown, order_status_history
0007_promotions.sql      promotions, promotion_redemptions (+ FK to orders)
0008_trust.sql           reviews, trust_snapshots, disputes, dispute_events
0009_comms.sql           conversations, messages, device_tokens, notifications, notification_preferences
0010_platform.sql        audit_logs, outbox_events, analytics_events (+first partitions), flags
0011_search.sql          pg_trgm extension, tsvector triggers, Arabic normalization function
0012_seed.sql            roles, permissions, categories, flags, FREE plan (idempotent)
```

#### 5.1.3 API endpoints (full index — Appendix B)

| Group | Endpoints |
|---|---|
| Auth | `POST /v1/auth/otp/request` · `POST /v1/auth/otp/verify` · `POST /v1/auth/refresh` · `POST /v1/auth/logout` · `POST /v1/auth/switch-org` **[Improvement]** |
| Users | `GET/PATCH /v1/me` · `GET /v1/me/organizations` · `POST /v1/me/devices` |
| Organizations | `POST /v1/organizations` · `GET /v1/organizations/{id}/members` · `POST /v1/organizations/{id}/members` |
| Merchant | `POST /v1/stores` · `PATCH /v1/stores/{id}` · `POST /v1/stores/{id}/documents` · `GET /v1/stores/{id}` (public) |
| Catalog | `POST /v1/products` · `PATCH /v1/products/{id}` · `POST /v1/products/{id}/variants` · `POST /v1/media/presign` · `POST /v1/catalog/imports` · `GET /v1/catalog/imports/{jobId}` |
| Inventory | `GET /v1/inventory` · `PATCH /v1/inventory/{itemId}` · `GET /v1/inventory/low-stock` |
| Pricing | `POST /v1/price-lists` · `POST /v1/price-lists/{id}/tiers` · `GET /v1/products/{id}/pricing` |
| Promotions | `POST /v1/promotions` · `GET /v1/promotions` · `GET /v1/offers/nearby` |
| Search | `GET /v1/search` · `GET /v1/categories` · `GET /v1/categories/{id}/products` |
| Cart | `GET /v1/cart` · `POST /v1/cart/items` · `PATCH /v1/cart/items/{id}` · `DELETE /v1/cart/items/{id}` |
| Orders | `POST /v1/checkout` · `GET /v1/orders` · `GET /v1/orders/{id}` · `POST /v1/orders/{id}/accept` · `POST /v1/orders/{id}/reject` · `POST /v1/orders/{id}/items/{itemId}/confirm` · `POST /v1/orders/{id}/status` · `POST /v1/orders/{id}/cancel` · `POST /v1/orders/{id}/reorder` |
| Reviews | `POST /v1/orders/{id}/review` · `GET /v1/stores/{id}/reviews` |
| Notifications | `GET /v1/notifications` · `PATCH /v1/notifications/{id}/read` · `GET/PATCH /v1/notification-preferences` |
| Admin | `GET /v1/admin/verifications` · `POST /v1/admin/verifications/{id}/decision` · `GET /v1/admin/orders` · `GET /v1/admin/merchants` · `GET /v1/admin/kpis` · `GET /v1/admin/audit-logs` |
| Realtime | `WS /v1/realtime` — rooms `user:{id}` · `org:{id}` · `order:{id}`; events per §2.7 |

All order-mutating endpoints require `Idempotency-Key` (§1.5). Contracts live in `packages/contracts` — if it is not in OpenAPI, it does not exist.

#### 5.1.4 Scope fences (§21.5 source + additions)

**Do NOT build:** independent delivery marketplace (`delivery_jobs` untouched) · B2C · advanced advertising · complex ML · ERP accounting · credit system · multi-party settlement · microservices · multi-warehouse/branch · real-time GPS · public API · multi-currency · chat (fast-follow after pilot — schema ships, UI deferred).

#### 5.1.5 Operational playbooks (ready before pilot)

Concierge catalog import (ops imports for the merchant, §14.3 source) · verification review SLA (48 h) · order-blocking incident (§10.2: < 30 min response) · drop-off reason logging (first 30 days, §35.2 source) · OTP/SMS provider failover drill.

**Exit gate (§28.4 source row 1 + §21.6):** activation rate · first-order conversion · completion rate · repeat-order rate · active merchants; merchant publishes without tech support; full order runs end-to-end; RBAC/backups/audit verified; funnel measurable; ops ownership assigned.

### 5.2 Phase 2 — Delivery & Tracking (8–12 weeks, §6.2)

**Backend:** `delivery/` module — driver onboarding (reuses verification_requests), zones, jobs + events, batched location ingestion (Redis stream → partitioned inserts), POD, geofence event engine (zones × driver_locations), earnings records. Dispatch maturity 2A→2B→2C: manual admin assignment → PostGIS KNN + Mapbox Matrix suggestions → live tracking + Mapbox Directions ETA.

**Migrations:** `0013_drivers.sql`, `0014_zones.sql`, `0015_delivery.sql`, `0016_locations_partitions.sql`.

**Endpoints:** `POST /v1/delivery/jobs` (internal) · `GET /v1/driver/jobs/available` · `POST /v1/driver/jobs/{id}/accept` · `POST /v1/driver/jobs/{id}/status` (idempotent) · `POST /v1/driver/locations:batch` · `POST /v1/driver/jobs/{id}/pod` · `GET /v1/orders/{id}/tracking` · `GET /v1/admin/dispatch` (console bootstrap). WS adds `delivery.location` / `delivery.eta` per §2.7.

**Mobile:** driver flavor — duty toggle, job offers with countdown, pickup verify, navigation deep-link, POD capture (OTP/photo/signature), offline queue with replay, earnings. **Admin:** dispatch console (live map + unassigned queue + suggestions).

**Playbooks:** driver recruitment/verification; late/failed delivery; dispatch backlog (trigger: > 10 unassigned > 15 min). **Fences:** no route optimization (2D), no fleet APIs, no multi-stop batching. **Exit gate (§22.3 source):** delivery cost/time/success/cancellation/assignment-time data reliable; volume justifies operating cost.

### 5.3 Phase 3 — Payments, Settlement & Monetization (8–12 weeks, §6.3)

**Backend:** `payments/` module — provider adapter port (`authorize/capture/refund/parseWebhook/reconcile`); activate double-entry ledger; settlement engine (weekly, merchant + driver payouts per §17.4 composition); commission engine (waivers → category rates); Free/Pro subscriptions; refunds; daily reconciliation job comparing provider report vs. ledger.

**Migrations:** `0017_payments.sql`, `0018_ledger.sql`, `0019_settlements.sql`, `0020_subscriptions.sql`.

**Endpoints:** `POST /v1/payments/intents` · `POST /v1/webhooks/{provider}` (signature-verified, idempotent) · `GET /v1/finance/settlements` · `POST /v1/admin/refunds` · `GET /v1/merchant/subscription` · `POST /v1/merchant/subscription/upgrade`.

**Frontend:** checkout with hosted provider SDK (card data never enters platform scope); COD two-step capture at POD; payment status in order timeline; admin finance console (payments monitor, settlement runs, refund approvals, reconciliation exceptions, revenue reports).

**Non-negotiables (I10):** payment state transitions **only** on provider webhook; correlation IDs + idempotency end-to-end; ledger writes only from confirmed payment state; `order_financial_breakdown` has been shadow-populated since P1 — this phase activates it, not retrofits it.

**Playbooks:** payment failure; chargeback; COD shortfall; reconciliation exception triage (< 0.5% target). **Fences:** no trade credit (P7, regulated partners only), no multi-currency, no split payments. **Exit gate (§23.3 source):** unit economics visible and improving; payment success rate; reconciliation accuracy; refunds/disputes support processes proven.

### 5.4 Phase 4 — B2C Marketplace (10–14 weeks, §6.4)

**Backend:** activate `price_lists.channel='B2C'` (zero migration — §7.2 #4); store serviceability areas; org-less consumer identity; consumer checkout (prepaid + COD); favorites; Smart Reorder v1 (rules: median replenishment interval × last qty; `reorder_suggestions` rows served via digest).

**Migrations:** `0021_consumer.sql`, `0022_service_areas.sql`. **Endpoints:** `GET /v1/consumer/stores/nearby` · `GET /v1/consumer/products` · `POST /v1/consumer/orders` · `GET /v1/reorder/suggestions`.

**Frontend:** consumer flavor (nearby stores, store/product pages, cart, checkout, live tracking reusing P2, ratings, favorites, reorder card); consumer web SEO surface. **GTM:** staged store onboarding by readiness score (§24.3 source). **Fences:** single-store consumer carts at launch; no consumer credit; no subscription commerce. **Exit gate (§28.4 row 4):** B2C MAU · conversion · repeat consumer order rate · AOV.

### 5.5 Phase 5 — Advertising & Merchant Analytics (12–16 weeks, §6.5)

**Backend:** `ads/` module — campaigns, ad items, placements (SEARCH_RESULT, CATEGORY, STORE_PAGE, HOME), budget pacing (daily caps, Redis counters), frequency capping, event pipeline into partitioned `ad_events`, ROAS reporting, ad policy moderation queue.

**Migrations:** `0023_campaigns.sql`, `0024_ad_events_partitions.sql`. **Endpoints:** `POST /v1/ads/campaigns` · `GET /v1/ads/campaigns/{id}/report` · `POST /v1/ads/events:batch` (beacon) · `GET /v1/analytics/merchant/*` (views, conversion, top-products, sales-trend, promo-ROI).

**Frontend:** campaign wizard (merchant), ads reporting, analytics dashboards (Part II §15.2); admin ad-ops console. **Guardrail (§11.2 source):** max 1–2 sponsored slots per page, labeled; organic quality dominant; organic conversion monitored as a release-blocking metric. **Fences:** no ML ranking — rules + quality score only. **Exit gate (§28.4 row 5):** ad revenue · ROAS · merchant ad retention · incremental orders, with no organic degradation.

### 5.6 Phase 6 — AI & Optimization (12–20 weeks, §6.6)

**Backend:** `ai/` module behind the AI Gateway port (`GENERATE_DESCRIPTION · SUMMARIZE · EXTRACT · CLASSIFY · RECOMMEND · FORECAST`) with routing, caching, cost metering, `ai_requests` audit. Features by KPI: Smart Reorder v2 (repeat-purchase lift) · AI Product Assistant incl. OCR from supplier invoices (time-to-publish) · recommendations Level 2→3 (CTR/conversion/attributed revenue) · demand forecasting (MAPE) · price anomaly detection (governed per §37.3 source).

**Migrations:** `0025_ai.sql`. **Platform:** offline evaluation harness, A/B framework, feature store (lite), batch scoring — delivered as a **thin separate AI service** consuming platform events (first sanctioned extraction, §2.6 rule 5).

**Fences:** every AI feature carries a KPI and kill criteria; no feature ships without an A/B plan (§26.2 source). **Exit gate (§28.4 row 6):** recommendation lift · forecast accuracy · reorder adoption · AI-assisted task completion.

### 5.7 Phase 7 — Commerce Infrastructure (continuous, §6.7)

**Backend:** multi-branch/warehouse; advanced employee roles; per-market configurable verification/tax/document rules; ERP/accounting adapters (QuickBooks/Xero/local) via outbound webhooks + exports; fleet APIs for delivery companies; regulated trade-credit partners; market intelligence (aggregated/anonymized); developer platform (OAuth2 client-credentials, public `/v1` surface, rate limits); delivery maturity 2D–2E (batching, Mapbox Optimization).

**Architecture evolution:** regional cells (API + PG + Redis + OpenSearch per city) with global control plane; extraction candidates per §2.6 triggers (location ingestion, event pipeline, AI service — likely already extracted by now). **Playbooks:** region-launch runbook with unit-economics checklist before/after (§28.3 source). **Fences:** no region launches without stable retention in the previous region (§35.4 source).

## 6. Critical Path & Dependencies (§7)

### 6.1 Cross-phase critical chain (§7.1)

```
Phase 0 gate (catalog commitments + retailer intent)
   └─▶ Phase 1 spine: auth → RBAC → catalog+pricing → search → cart → order FSM → notifications
          └─▶ Phase 2 delivery  (needs READY→ASSIGNED transitions + fulfillment stubs)
                 └─▶ Phase 3 payments  (needs order volume + ledger shadow data)
                        └─▶ Phase 4 B2C  (needs delivery + payments + channel-scoped pricing)
                               └─▶ Phase 5 ads/analytics  (needs audience + event volume)
                                      └─▶ Phase 6 AI  (needs behavioral + transaction data)
                                           └─▶ Phase 7 scale  (needs proven unit economics + ops maturity)
```

**Story-level sequencing rules [Improvement]:** the `orders` module cannot begin checkout until `pricing` exposes `resolvePrice(variantId, listId, qty)`; notifications module (dispatcher only) must land by M5 or order E2E fails; admin verification queue must be live before the first real merchant signs up (M2); `packages/contracts` v0 for a module freezes before its UI work starts.

### 6.2 Expensive-to-retrofit decisions — correct in Phase 1 or never (§7.2)

| # | Decision | Where enforced in this spec | Cost of getting it wrong |
|---|---|---|---|
| 1 | User/Org/Role/Permission separation | §2.1, `0001_identity` | Identity re-design breaks every table and token |
| 2 | Master order + sub-orders per supplier | §3.6, `0006_orders` | Settlement, returns, ratings corrupted at multi-supplier scale |
| 3 | Price/promotion snapshots + financial breakdown | §3.5–3.6 (`unit_price_minor`, `order_financial_breakdown`) | Audit and P3 ledger lose historical truth |
| 4 | `price_lists.channel` + `audience` | §3.5 DDL (present from day one) | P4 requires a pricing migration under live traffic |
| 5 | Event taxonomy + transactional outbox | §2.6, App. A, `outbox_events` | Analytics/notifications/search silently diverge |
| 6 | UUIDv7 + `organization_id` scoping | §2.2, §2.9 | Multi-tenancy retrofit = highest-severity security class |

### 6.3 Parallelization lanes (§7.3)

| Lane | Tracks | Constraint |
|---|---|---|
| A (core) | auth → catalog → orders → notifications | The critical path — never starved; 2 engineers minimum |
| B (surfaces) | web app, admin console, marketing site | Consumes Lane A contracts only (via `packages/contracts`) — no direct API assumptions |
| C (data) | event pipeline, funnels, KPI dashboards | Contracts frozen at M4 |
| D (ops) | onboarding playbooks, merchant recruiting, support tooling | Runs from Phase 0 |

## 7. Testing & Quality Gates (§9)

### 7.1 Test strategy (§9.1)

| Layer | Scope | Tooling | Gate |
|---|---|---|---|
| Unit | Pricing resolution, tier selection, FSM guards, ledger math | Vitest | ≥ 85% coverage on domain modules; CI-blocking |
| Integration | Module APIs + real PG/PostGIS/Redis via Testcontainers | Vitest + Testcontainers | CI-blocking |
| Contract | OpenAPI conformance; generated clients compile | Schemathesis vs. `packages/contracts` | CI-blocking |
| E2E | Critical flows on staging | Playwright (web) + API-driven suites | Pre-release |
| Load | Checkout, search, location ingestion, webhook storms | k6 (E7) | p95 budgets at every phase exit |
| Security | SAST, dependency + secrets scan; external pen test | CI + external | Pen test blocking for P3 |
| Mobile | Device matrix (low-end Android priority), offline sim, RTL screenshots | Firebase Test Lab | Pre-release |
| Usability | Merchant task flows with real users | Moderated sessions | Phase-exit criterion |

### 7.2 Automated critical-scenario suite (§9.2) — required E2E cases

| # | Scenario | Given / When / Then |
|---|---|---|
| 1 | Accept after stock change | Stock = 5; buyer orders 8; merchant partial-accepts 5 → **then** reserved = 5, released 0, buyer sees per-line delta, order PARTIALLY_ACCEPTED |
| 2 | Tier resolution + snapshot | 3 tiers; buyer qty lands in tier 2 → **then** `unit_price_minor` = tier-2 price on the item, not current list price |
| 3 | Re-price guard | Price list edited post-checkout; merchant accepts → **then** `409 price_changed` with per-line deltas; confirm endpoint completes with new price |
| 4 | Payment failure + duplicate webhook | Failed intent retried; provider sends the same webhook twice → **then** one transition, second ignored, idempotent 200 |
| 5 | Driver failure mid-delivery (P2) | Job ASSIGNED, driver goes offline → **then** reassignment flow returns job to UNASSIGNED with events intact |
| 6 | Weak connectivity replay | Driver posts 3 queued status updates after reconnect → **then** applied in order, final state correct |
| 7 | WebSocket interruption | Socket drops mid-order → **then** `resync` + REST produces the same final state as a never-disconnected client |
| 8 | Dispute after POD | Dispute opened with photo evidence → **then** evidence bundle immutable, `order_status_history` shows DISPUTED actor |
| 9 | Partial multi-supplier cancellation | 3-supplier master order; one sub-order cancelled → **then** other two sub-orders untouched; master status derived correctly |

### 7.3 Non-functional budgets (§9.3)

| Metric | Budget | Verified by |
|---|---|---|
| API read p95 / write p95 | < 400 ms / < 800 ms | k6 profile per phase exit |
| Search p95 | < 300 ms | k6 + OTel dashboards |
| Mobile cold start (mid-range Android) | < 2.5 s | Firebase Test Lab |
| Web first meaningful paint | < 1.8 s | Lighthouse CI |
| Checkout availability (SLO) | 99.9% | Alerting |
| Crash-free sessions | ≥ 99.5% | Crash reporting |

### 7.4 CI/CD pipeline (all PRs → staging → prod)

```
PR:      lint → typecheck → boundary-lint (E6) → unit → integration → contract (Schemathesis)
         → build (docker api/web/admin; flutter debug builds)
         → preview env deploy → smoke tests

main:    all of PR + E2E (staging) + k6 smoke + Lighthouse CI + axe-core (a11y)
         → staging deploy (auto) → migration gate (reviewed, forward-only)

release: prod blue-green deploy (manual approval) → migration window → post-deploy
         smoke + error-budget watch for 1 h → automatic rollback on SLO breach
```

Quality gates enforced by CI: coverage ≥ 85% on domain modules, zero boundary-lint violations, OpenAPI diff reviewed when `packages/contracts` changes, migration SQL diff reviewed when `drizzle/` changes, no new dependency without lockfile entry.

## 8. Risk Register & Mitigations (§8.1)

| ID | Risk | Impact | Mitigation (owner: engineering unless noted) | Phase |
|---|---|---|---|---|
| R1 | Weak supply at launch | Retailers find nothing; churn | Anchor suppliers signed in P0; concierge import; intake template (ops) | 0–1 |
| R2 | Weak demand | Merchants see no value | Small launch area, field sales, first-order incentives (GTM) | 1 |
| R3 | Poor product data quality | Weak search/conversion | ImportWizard row-level validation; moderation queue; AI assist later | 1–6 |
| R4 | Premature complexity | Delayed launch | Scope fences are CI/PR-enforceable; monolith only (§1.2) | All |
| R5 | Fraud / fake accounts | Financial + trust loss | Verification flow, device fingerprinting, velocity rules, rate limits | 1–3 |
| R6 | Negative unit economics | Growth amplifies losses | Contribution margin per order tracked in admin KPIs; phase gates (PM) | All |
| R7 | Single-provider dependency (SMS, maps, payments) | Operational outage | Adapter ports + benchmarked second provider per spike (P0) | 1–3 |
| R8 | Payment webhook loss/duplication | Money mismatch | Signed idempotent webhooks; ledger invariants tested; daily reconciliation | 3 |
| R9 | Delivery experience failure | Trust damage | Start manual dispatch (2A); ETA ranges; POD mandatory | 2 |
| R10 | Location-data privacy breach | Legal + trust | 90-day raw retention (§3.12); purpose-scoped access | 2 |
| R11 | Arabic search relevance | Discovery failure | Normalization layer (§2.4); search→order conversion monitored; OpenSearch trigger pre-agreed | 1 |
| R12 | SMS OTP delivery variance | Signup drop-off | Two providers from day one; WhatsApp fallback | 1 |
| R13 | Scope creep from merchants | Launch slip | Feature Addition Decision Framework (§41 source) via Product Council (PM) | All |
| R14 | Key-person dependency | Bus factor | Contracts as source of truth; pairing; runbooks in `docs/` | All |

The source plan's improvement register (I1–I14, §8.2) is **implemented by this specification**, not restated: I1→§4.1 matrix, I2→§4.3 re-price guard, I3→§3.4 reservation policy, I4→§3.5 `channel` column, I5→§3.6 breakdown table, I6→§2.6 outbox, I7→§1.3 flavors, I8→§2.4 normalization, I9→§2.7 contracts, I10→§5.3 non-negotiables, I11→§3.12 partitioning, I12→§5.1.5 provisional SLAs, I13→§5 fences, I14→Part II §17.

---

# Appendices

## Appendix A — Domain Event Taxonomy (§App. A)

Naming: `<module>.<entity>.<action>`. All events flow through `outbox_events` with at-least-once delivery; consumers dedupe on event id.

- **Identity / Merchant:** `identity.user.registered` · `merchant.store.created` · `merchant.verification.submitted` · `merchant.verification.approved`
- **Catalog / Inventory / Pricing:** `catalog.product.published` · `catalog.product.rejected` · `catalog.import.completed` · `inventory.stock.adjusted` · `inventory.stock.reserved` · `inventory.stock.released` · `pricing.price_list.updated`
- **Orders:** `order.submitted` · `order.accepted` · `order.partially_accepted` · `order.rejected` · `order.status.changed` · `order.cancelled` · `order.completed`
- **Trust / Support:** `review.created` · `dispute.opened` · `dispute.resolved` · `notification.dispatched`
- **Phase 2:** `delivery.job.created` · `delivery.job.assigned` · `delivery.job.accepted` · `delivery.job.status.changed` · `delivery.pod.submitted` · `delivery.eta.updated`
- **Phase 3:** `payment.initiated` · `payment.captured` · `payment.failed` · `payment.refunded` · `settlement.completed`
- **Phase 4–5:** `consumer.order.placed` · `reorder.suggestion.served` · `ad.campaign.launched` · `ad.impression` · `ad.click` · `ad.conversion`

## Appendix B — Phase 1 API Endpoint Index

Canonical index at `packages/contracts/openapi.json` (generated). Group summary with request verbs — identical to §5.1.3; in case of divergence **the OpenAPI file wins**. Adding an endpoint without a contract change fails CI.

| Module | Count | Methods/paths (abbreviated — see §5.1.3) |
|---|---|---|
| auth | 5 | otp/request, otp/verify, refresh, logout, switch-org |
| users | 4 | me (GET/PATCH), me/organizations, me/devices |
| organizations | 3 | create, members list/add |
| merchant | 4 | stores create/update, documents upload, public store get |
| catalog | 6 | products create/update, variants, media/presign, imports ×2 |
| inventory | 3 | list, adjust, low-stock |
| pricing | 3 | price-lists create, tiers, product pricing |
| promotions | 3 | create, list, offers/nearby |
| search | 3 | search, categories, category products |
| cart | 4 | get, add, update, remove |
| orders | 9 | checkout, list, get, accept, reject, item-confirm, status, cancel, reorder |
| reviews | 2 | create, store reviews |
| notifications | 4 | list, mark-read, preferences get/update |
| admin | 6 | verifications ×2, orders, merchants, kpis, audit-logs |
| realtime | 1 | WS /v1/realtime |

---

*End of document. Companion rendering: `Smart_Commerce_Development_Implementation_Plan.html`. Upstream: `Smart_Commerce_Platform_Implementation_and_UX_Plan.md`.*
