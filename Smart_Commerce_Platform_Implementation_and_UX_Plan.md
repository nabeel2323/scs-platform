# Smart Commerce & Supply Platform
## Technical & Operational Implementation Plan + Advanced UI/UX Design Strategy

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Status** | Execution-ready planning document |
| **Source** | `Smart_Commerce_Supply_Platform_Final_Plan.html` (referenced throughout as *Source §n*) |
| **Prepared by** | Lead Product Architect & Senior UI/UX Designer |
| **Audience** | Engineering, Product, Design, Data, Operations, Founding team |
| **Companion artifact** | `Smart_Commerce_Platform_Implementation_and_UX_Plan.html` (presentation-ready rendering) |

**How to read this document.** Part I translates the strategic plan into an executable engineering program: architecture baseline, cross-cutting foundations, the canonical data model and order state machine, and a phase-by-phase breakdown (Phase 0–7) with modules, schema deltas, API surfaces, scope fences, gates, and critical-path notes. Part II is the design strategy: the TAIF Commerce Design System, per-role interaction models, detailed screen flows, accessibility, RTL/localization, responsiveness, and advanced interfaces (Smart Reorder, analytics dashboards). Every deviation or addition beyond the Source is explicitly marked **[Improvement]** with rationale.

---

# PART I — TECHNICAL & OPERATIONAL IMPLEMENTATION PLAN

## 1. Scope and Deliverable Map

| Deliverable | Contents | Primary owner |
|---|---|---|
| Architecture baseline | Locked decisions, module boundaries, repo topology, conventions | Backend lead / Architect |
| Cross-cutting foundations | Identity/RBAC, data conventions, search, media, notifications, realtime, observability, security, analytics taxonomy | Platform engineering |
| Core data model | Phase 1 entity spine + forward-compatible extensions per phase | Backend + Data |
| Order state machine | Canonical statuses, transitions, guards, policies | Backend + Product |
| Phase plans 0–7 | Tasks, modules, schema deltas, API deltas, out-of-scope fences, exit gates | All leads |
| Critical path & dependencies | Sequencing, parallelization, "expensive-to-retrofit" decisions | PM / Architect |
| Risk register | Source risks + technical risks with mitigations | PM / Architect |
| UI/UX strategy | Design system, interaction models, journeys, a11y, RTL, advanced UI | Design lead |

## 2. Architecture Baseline

### 2.1 Locked decisions (Source §16, §38.1)

| Decision area | Choice | Status |
|---|---|---|
| Delivery model | B2B-first, phase-gated expansion (delivery → payments → B2C → ads → AI) | Locked |
| Architecture | **Modular Monolith** with strict domain boundaries; extract services only on proven need | Locked |
| Backend | NestJS + TypeScript (single deployable, modular) | Locked |
| Database | PostgreSQL 16 + PostGIS 3.4 | Locked |
| Cache / ephemeral state | Redis 7 | Locked |
| Mobile | Flutter — **one codebase, four flavors** (Wholesale / Retail / Driver / Consumer) **[Improvement]** | Locked (flavor strategy recommended) |
| Web | Next.js (App Router) — retailer/merchant web + marketing; Admin console | Locked |
| Realtime | WebSockets via NestJS Gateway (Socket.IO) | Locked |
| Push | Firebase Cloud Messaging | Locked |
| Search | PostgreSQL FTS + trigram at MVP → OpenSearch when scale/relevance demands | Staged |
| Maps | Provider-agnostic adapter; Mapbox as reference implementation | Locked as adapter |
| Object storage | S3-compatible + CDN | Locked |
| Observability | OpenTelemetry + structured logs + metrics | Locked |
| Deployment | Docker, CI/CD, repeatable environments | Locked |

### 2.2 Module map and boundary rules

Backend modules (single NestJS app, one module per bounded context — Source §16.4):

| Module | Responsibility | First built |
|---|---|---|
| Identity & Access | Users, organizations, roles, permissions, sessions, OTP | Phase 1 |
| Merchant | Stores, branches, verification (KYC), business hours | Phase 1 |
| Catalog | Categories, brands, products, variants, media, bulk import | Phase 1 |
| Inventory | Stock, warehouses (single-location MVP), reservations, movements | Phase 1 |
| Pricing | Price lists, quantity tiers, segment/channel resolution | Phase 1 |
| Promotions | Campaigns, rules, redemptions | Phase 1 (basic) |
| Orders | Cart, master/sub orders, state machine, acceptance, history | Phase 1 |
| Reviews & Trust | Ratings, badges, trust score inputs | Phase 1 (ratings); score later |
| Notifications | Push/SMS/email/in-app dispatch, templates, preferences | Phase 1 |
| Analytics | Event ingestion, funnels, KPI reports | Phase 1 (baseline) |
| Support | Tickets, disputes, evidence | Phase 1 (basic) |
| Delivery | Drivers, jobs, tracking, POD, dispatch | Phase 2 |
| Payments | Transactions, webhooks, ledger, settlement, refunds | Phase 3 (ledger shadow P1) |
| Advertising | Campaigns, budgets, placements, measurement | Phase 5 |
| AI Services | Gateway, reorder, forecasting, assistants | Phase 6 |

**Boundary rules (enforced by lint/review):**

1. Modules interact only through exported **application services** (in-process). No module reads another module's tables directly.
2. Cross-module side effects occur via **domain events** written to a transactional **outbox** (`outbox_events`) and dispatched asynchronously — never fire-and-forget inside a request.
3. Read models that span modules (e.g., search results, order lists with product names) are built by **query/projection services** owned by the consuming module, or denormalized at write time via events.
4. Public HTTP/WS contracts are versioned (`/v1/...`) and defined in `packages/contracts` (OpenAPI + generated TS types), shared with web/mobile.
5. Extraction to a separate service is permitted only when a module shows (a) scale divergence, (b) team-ownership boundary, or (c) fault-isolation need (Source §16.1). First likely candidates: delivery-location ingestion and the ads/analytics event pipeline.

### 2.3 Repository and app topology

```
scs-platform/
├── apps/
│   ├── api/              # NestJS modular monolith
│   ├── web/              # Next.js: marketing + retailer/merchant web app
│   └── admin/            # Next.js: platform admin console
├── mobile/               # Flutter single codebase
│   └── flavors: wholesale | retail | driver | consumer
├── packages/
│   ├── contracts/        # OpenAPI specs, DTOs, generated clients
│   ├── ui-kit/           # web design-system components (Part II)
│   ├── event-types/      # domain + analytics event schemas
│   └── mobile-core/      # shared Flutter packages: design system, api client, auth
└── infra/                # docker-compose, IaC, CI/CD pipelines
```

**[Improvement] One Flutter codebase, four flavors.** Four separate apps triple the maintenance surface and fragment the design system. A single codebase with product flavors shares the design system, API client, auth, and offline layer (~60–70% code reuse) while producing four independently branded, store-listed apps with per-role release cadence. This directly supports the Source's lean MVP team (§33.1).

### 2.4 Environments

| Env | Purpose | Data | Notes |
|---|---|---|---|
| dev | Local + shared dev | Seeded fixtures | docker-compose parity with prod images |
| preview | Per-PR ephemeral | Anonymized subset | Auto-provisioned by CI; smoke-tested |
| staging | Pre-prod, integration, load tests | Prod-like, anonymized | Payment sandbox, FCM test project |
| prod | Live | Real | Migration-gated deploys, blue-green rollout |

### 2.5 API conventions

- REST over HTTPS, `/v1` major-versioned paths, JSON, camelCase fields.
- **Auth:** `Authorization: Bearer <JWT>` — 15-minute access tokens, rotating refresh tokens with reuse detection.
- **Idempotency:** `Idempotency-Key` header required on `POST /checkout`, payment initiations, and state-transition endpoints (Source §30.3). Redis-backed 24h key store.
- **Pagination:** cursor-based (`?limit=50&cursor=`); filters/sorts whitelisted per endpoint.
- **Errors:** RFC 7807 `application/problem+json`:

```json
{
  "type": "https://api.example.com/errors/order/invalid-transition",
  "title": "Invalid order transition",
  "status": 409,
  "detail": "Order cannot move from DELIVERED to PREPARING.",
  "instance": "/v1/orders/ord_9f3c/status"
}
```

- **Concurrency:** optimistic version field (`If-Match` ETag) on mutable catalog/admin resources to prevent lost updates during merchant bulk edits.
- **Rate limiting:** Redis token bucket per user/IP/role; `X-RateLimit-*` headers; stricter buckets on OTP and auth endpoints.
- **Outbound webhooks (Phase 3+):** HMAC-SHA256 signed, timestamp + nonce replay protection, at-least-once with retry/backoff.

### 2.6 Domain events and the outbox pattern

- Naming: `<module>.<entity>.<action>` — e.g., `order.status.changed`, `delivery.job.assigned`, `payment.captured`.
- Every state-changing service method writes business rows **and** outbox rows in one DB transaction; a dispatcher publishes to the in-process bus (and, later, to a broker) with at-least-once delivery; consumers dedupe on event id.
- This guarantees: notifications, analytics, search indexing, and (later) ledger writes never silently miss an order event — the #1 reliability risk in marketplaces. **[Improvement — implicit in Source §30.3, made explicit]**
- Full taxonomy in Appendix A.

## 3. Cross-Cutting Foundations

### 3.1 Identity, organizations, RBAC (Source §5.2)

- Phone-first identity (OTP), email optional. A **User** may belong to multiple **Organizations** via `OrganizationMember` with a role; a person can own a wholesale company and manage a retail store without data-model changes.
- Permission keys follow `module:resource:action` (e.g., `catalog:product:publish`, `orders:accept`, `finance:refund`). Roles are named permission sets; guards check org scope + permission on **every** protected route and object.
- JWT carries `sub`, active-org claim, role, permission digest; switching active organization issues a scoped token.
- Session management: device list, remote revoke, refresh rotation with theft detection.

### 3.2 Database conventions

- PostgreSQL 16, PostGIS 3.4; all timestamps `timestamptz` (UTC).
- Primary keys: **UUIDv7** (time-ordered — index- and cursor-friendly).
- Every table: `created_at`, `updated_at`. Soft delete only where restore is a product need (products, categories).
- **Money:** integer minor units + ISO currency code. No floats, ever. Single active currency per market at MVP (column present, one value) — **[Improvement]** to avoid multi-currency ambiguity.
- Statuses: `varchar` + CHECK constraints (cheaper to evolve than native enums).
- JSONB for rule payloads only (promotion conditions, targeting); never for queryable core fields.
- Indexing: FK indexes by default; partial indexes on hot queues (e.g., `orders WHERE status IN ('PENDING_CONFIRMATION','PREPARING')`); GIN on `tsvector`; GiST on `geography`.
- Partitioning (monthly RANGE): `driver_locations` (P2), `analytics_events` (P1), `ad_events` (P5); archived to object storage as Parquet.
- Migrations: forward-only, CI-gated, reviewed for lock impact; never auto-applied in prod.

### 3.3 Redis usage

| Use | Key pattern | TTL |
|---|---|---|
| Refresh tokens / sessions | `sess:{userId}:{sessionId}` | 30d rotate |
| OTP codes + attempt counters | `otp:{phone}` / `otp:att:{phone}` | 90s / 15m |
| Rate limits | `rl:{role}:{userId}:{bucket}` | sliding window |
| Idempotency keys | `idem:{key}` | 24h |
| Catalog read caches (product card, category tree) | `cache:prod:{id}` etc. | 60s–5m |
| Price resolution cache | `price:{variant}:{list}` | 60s |
| WS presence | `presence:{userId}` | heartbeat |
| Dispatch locks / settlement batches | `lock:{jobId}` | bounded |

Cart lives in PostgreSQL (auditability, cross-device resume); Redis caches hot reads only.

### 3.4 Search strategy (staged)

- **Phase 1:** PostgreSQL `tsvector` + `pg_trgm` fuzzy matching behind a `SearchIndexer` port. Arabic normalization layer: diacritics stripping, alef/hamza/taa-marbuta folding, so `بريد` ≈ `بريد`. Exact-match fast path for SKU/barcode.
- **Trigger to OpenSearch:** p95 search latency > 300 ms, active catalog > ~150k SKUs, or measurable relevance failure. The port abstraction means backfill is one adapter + a reindex job, not a rewrite.

### 3.5 Media pipeline

- Presigned S3 PUT direct from clients (large files never traverse the API); async post-processing queue: thumbnails, WebP/AVIF variants, blurhash placeholders, EXIF strip, mimetype sniffing; CDN in front; `alt_text` captured in schema for accessibility/SEO (Part II §16).

### 3.6 Notifications

- Channel-agnostic dispatch: `NotificationService.dispatch(userId, templateKey, params, channels)`.
- Routing rules: OTP → SMS + push; order events → push + in-app; promotions → push only with consent (Source §15.4: Transactional / Promotional / Behavioral separation).
- FCM adapter first; SMS adapter with **multi-provider failover** (Source risk: single-provider dependency) and WhatsApp fallback where dominant; email from Phase 3 (invoices, statements).
- Quiet hours + per-category preference center; promo sends throttled per user.

### 3.7 Realtime (WebSockets)

- Socket.IO gateway at `/realtime`, JWT-authenticated; rooms: `user:{id}`, `org:{id}`, `order:{id}`, `job:{id}`.
- Server → client: `order.status`, `delivery.location` (batched 3–5 s), `delivery.eta`, `notification.new`.
- Client → server: `location.batch` (driver app), `subscribe`.
- Resilience: on reconnect, clients REST-resync state (last-event-id for missed order events) — WebSocket is an optimization, never the source of truth (Source §30.2: "WebSocket interruption").

### 3.8 Observability

- OpenTelemetry auto-instrumentation (HTTP, PG, Redis) with spans per module service; `pino` structured logs with `requestId` correlation; RED metrics per endpoint + business counters (`orders_submitted`, `orders_accepted`, `webhook_failures`, `dispatch_lag_seconds`).
- SLOs per phase (e.g., Phase 1: 99.5% API availability; checkout p95 < 800 ms). Alert routing into ops on-call from day one of pilot.

### 3.9 Security baseline (Source §18.1, operationalized)

- TLS everywhere, HSTS; secrets in a secret manager — never in repo; config via environment.
- Short-lived JWTs + rotation; org-scoped RBAC guard + **object-level authorization on every resource** (the most common vulnerability class in multi-tenant SaaS — verify row ownership, not just role).
- OTP throttling + device lockout; Phase 1 fraud rules: signup velocity, duplicate accounts by device fingerprint, order-value outliers.
- Audit log (append-only: actor, action, resource, before/after, IP) mandatory for verification decisions, refunds, price overrides, admin impersonation.
- Backups: PITR + daily snapshots; **quarterly restore drills** (a backup is only real if it restores).
- CI: dependency scanning, SAST, secret scanning; external penetration test before Phase 3 payments go live.
- Data classification tiers (PII / financial / location) with role-gated access and location-specific retention (Source §18.2).

### 3.10 Analytics taxonomy

- Client `track()` SDK → collector → `analytics_events` (partitioned monthly) on the same event bus as domain events.
- Canonical activation funnels (Source §15.2–15.3), instrumented from day one:
  - **Wholesaler:** `registered → verified → catalog_published(≥20 SKUs) → first_order_received → repeat_orders(≥3)`
  - **Retailer:** `registered → area_set → first_search → first_order_placed → first_order_completed → repeat_order`
- Naming `object_action` snake_case; property schemas versioned in `packages/event-types`; breaking property changes require a new version — no silent redefinitions.

## 4. Core Data Model

### 4.1 Identity & Access

| Entity | Key fields | Notes |
|---|---|---|
| `users` | id, phone (unique), email, full_name, locale, status | Phone-first; email optional |
| `organizations` | id, type (WHOLESALER/RETAILER/LOGISTICS/PLATFORM), name, legal_name, tax_id, country, verification_status | Source §5.2 — org ≠ user |
| `organization_members` | user_id, org_id, role_id, member_status | Many-to-many |
| `roles`, `permissions`, `role_permissions` | permission key `module:resource:action` | Seeded per phase |
| `sessions` / `refresh_tokens` | token_hash, device, expires_at, revoked_at | Rotation + reuse detection |
| `verification_requests` | org_id, store_id, doc_type, doc_url, status, reviewer_id, decision, reason | Configurable doc sets per market (Source §9.1) |

### 4.2 Merchant & Stores

| Entity | Key fields | Notes |
|---|---|---|
| `stores` | id, org_id, name, kind, address, `location geography(Point,4326)`, service_radius, hours jsonb, status | PostGIS point + optional zone |
| `warehouses` | id, store_id, name, location | Single default warehouse in MVP |
| `business_documents` | store_id, type, url, expires_at | KYC evidence |

### 4.3 Catalog

| Entity | Key fields | Notes |
|---|---|---|
| `categories` | id, parent_id, path, name, slug, sort, is_active | Materialized path for cheap subtree reads |
| `brands` | id, name, slug | |
| `products` | id, store_id, category_id, brand_id, name, slug, description, status (DRAFT/ACTIVE/ARCHIVED/REJECTED), search_vector | Moderation status per Source §21.4 |
| `product_variants` | id, product_id, sku, barcode, unit, package_size, attributes jsonb, is_default | Unit/packaging model per Source §6.1 |
| `product_media` | id, product_id, url, thumb_url, blurhash, sort, alt_text | S3 pipeline output |
| `import_jobs` | id, store_id, file_url, mapping jsonb, status, errors jsonb, stats | Bulk import (Source §6.4) |

### 4.4 Inventory

| Entity | Key fields | Notes |
|---|---|---|
| `inventory_items` | variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point | `available = on_hand − reserved` |
| `stock_movements` | item_id, delta, reason (ADJUST/RESERVE/RELEASE/SALE/CANCEL), ref_id, actor, at | **Immutable ledger** — reconstructable (Source §30.3) |

**Policy:** stock is reserved **at merchant acceptance**, not at cart — carts are advisory in B2B (long-lived, multi-supplier). This resolves the Source's test scenario "merchant accepts an order, then inventory changes" (§30.2). **[Improvement — explicit policy]**

### 4.5 Pricing

| Entity | Key fields | Notes |
|---|---|---|
| `price_lists` | id, store_id, name, **channel (B2B/B2C)**, audience (PUBLIC/SEGMENT/CONTRACT), currency, valid_from, valid_to, status | `channel` added in Phase 1 though only B2B is active — **avoids a Phase 4 migration [Improvement]** |
| `price_tiers` | price_list_id, variant_id, min_qty, max_qty (null = ∞), unit_price_minor | Quantity ladder per Source §6.2 |

**Policy:** resolved price is computed at checkout and **snapshotted onto the order item** — the order is the audit record of what was agreed (Source §6.2: "the actual agreed price at order completion must also be preserved").

### 4.6 Promotions

| Entity | Key fields | Notes |
|---|---|---|
| `promotions` | id, store_id (null = platform), type, conditions jsonb, value, starts_at, ends_at, budget, usage_limit, status | Types per Source §6.3 |
| `promotion_redemptions` | promotion_id, order_id, discount_minor, at | Budget/limit enforcement + audit |

Phase 1 promotion types: percentage, fixed amount, quantity discount, time-limited. Buy-X-Get-Y, bundles, geo/segment offers land in Phase 1 fast-follow / Phase 2.

### 4.7 Cart & Orders (Source §7.1–7.2)

| Entity | Key fields | Notes |
|---|---|---|
| `carts` / `cart_items` | buyer org/user, variant, qty, note, per-supplier grouping | Cross-device resume |
| `master_orders` | id, buyer_org, buyer_user, channel (B2B/B2C), status, totals | Buyer's purchase intent |
| `orders` (sub-orders) | id, master_order_id, store_id, status, fulfillment_method (PICKUP/MERCHANT_DELIVERY/PLATFORM_DELIVERY), placed_at, sla_at | One per supplier, from day one |
| `order_items` | order_id, variant_id, qty, qty_confirmed, **unit_price_snapshot, tier_applied, promotion_snapshot jsonb, line_total_minor** | Immutable financial snapshot |
| `order_financial_breakdown` | order_id, products_minor, discount_minor, delivery_fee_minor, tax_minor, commission_minor, merchant_net_minor | **Ledger shadow from Phase 1** (Source §38.1 #6); becomes double-entry in Phase 3 |
| `order_status_history` | order_id, from_status, to_status, actor, reason, at | Every transition, every actor |

### 4.8 Trust, Reviews, Support

| Entity | Key fields | Notes |
|---|---|---|
| `reviews` | order_id, reviewer, subject_type (STORE/DRIVER/BUYER), rating 1–5, content, status | Moderated; gated to completed orders |
| `trust_snapshots` | store_id, dimensions jsonb, score, badges, computed_at | Dimensions per Source §9.2; explainable badges (Verified/Trusted/Fast Fulfillment) |
| `disputes` | order_id, opened_by, reason, state, evidence[], resolution | Evidence = POD, chat, photos (Source §9.3) |
| `dispute_events` | dispute_id, actor, action, note, at | Full timeline |

### 4.9 Communications & Notifications

| Entity | Key fields | Notes |
|---|---|---|
| `device_tokens` | user_id, platform, token, app_flavor | FCM |
| `notifications` | user_id, template_key, category (TRANSACTIONAL/PROMOTIONAL/BEHAVIORAL), payload, read_at | Preference-gated (Source §15.4) |
| `notification_preferences` | user_id, category, channel, enabled | |
| `conversations` / `messages` | order_id, participants, body, attachments | **Order-linked chat only** (Source §9.4) — Phase 1 fast-follow |

### 4.10 Audit & Analytics

| Entity | Key fields | Notes |
|---|---|---|
| `audit_logs` | actor, action, resource, before/after jsonb, ip, at | Append-only |
| `analytics_events` | id, name, user_id, org_id, session_id, props jsonb, received_at | Monthly partitions; Parquet archive |
| `outbox_events` | id, aggregate_type, aggregate_id, event_type, payload jsonb, dispatched_at | Transactional outbox |

### 4.11 Later-phase entities — designed now, built later

| Phase | Entities (designed, deferred) |
|---|---|
| 2 | `drivers`, `driver_vehicles`, `service_zones` (PostGIS polygons), `delivery_jobs`, `delivery_job_events`, `driver_locations` (partitioned), `proofs_of_delivery` |
| 3 | `payments`, `payment_attempts`, `ledger_accounts`, `ledger_entries`, `settlements`, `settlement_lines`, `payouts`, `refunds`, `subscription_plans`, `merchant_subscriptions` |
| 4 | `consumer_profiles`, `consumer_addresses`, `store_service_areas` (channel-aware pricing activates on `price_lists.channel`) |
| 5 | `campaigns`, `ad_items`, `ad_events` (partitioned), `placement_configs` |
| 6 | `reorder_suggestions`, `forecast_snapshots`, `ai_requests` (gateway audit) |

## 5. Canonical Order State Machine

Statuses (Source §7.1): `DRAFT, SUBMITTED, PENDING_CONFIRMATION, ACCEPTED, PARTIALLY_ACCEPTED, PAYMENT_PENDING, PREPARING, READY, ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED, REJECTED, DISPUTED`.

### 5.1 Transition matrix

| From | Trigger (actor) | To | Guards & side effects |
|---|---|---|---|
| DRAFT | Checkout (buyer) | SUBMITTED | Validate MOQ per line; resolve + snapshot prices; emit `order.submitted` |
| SUBMITTED | Auto | PENDING_CONFIRMATION | Notify merchant (push + in-app); start confirmation SLA timer (default 12 h) |
| PENDING_CONFIRMATION | Merchant accept-all | ACCEPTED | Reserve inventory; re-validate prices → if price list changed, show delta and require line-level confirm (re-price guard) |
| PENDING_CONFIRMATION | Merchant accept-partial | PARTIALLY_ACCEPTED | Reserve confirmed qty only; release rest; buyer notified of deltas |
| PENDING_CONFIRMATION | Merchant reject / SLA expiry | REJECTED / CANCELLED | Release nothing; reason mandatory; buyer notified |
| ACCEPTED / PARTIALLY_ACCEPTED | Auto (prepay off) | PREPARING | Phase 1 default: payment on account |
| ACCEPTED / PARTIALLY_ACCEPTED | Auto (prepay on, P3) | PAYMENT_PENDING | Payment link/checkout created |
| PAYMENT_PENDING | Payment webhook (P3) | PREPARING | Idempotent handler; on failure → retry / CANCELLED per policy |
| PREPARING | Merchant | READY | Buyer notified; fulfillment branch: PICKUP → handover; delivery → create `delivery_job` (P2) → ASSIGNED |
| READY | Pickup confirmed (code) | DELIVERED | Pickup OTP verified |
| ASSIGNED | Driver confirms pickup (P2) | PICKED_UP | Job accepted + pickup verification |
| PICKED_UP | Driver departs (P2) | OUT_FOR_DELIVERY | Tracking live for buyer |
| OUT_FOR_DELIVERY | POD submitted (P2) | DELIVERED | OTP/signature/photo + geo + recipient name |
| DELIVERED | Financial closure | COMPLETED | `order_financial_breakdown` finalized; review window opens |
| DELIVERED / COMPLETED | Dispute opened (≤72 h) | DISPUTED | Evidence bundle attached; support workflow |
| any pre-DELIVERED | Cancellation policy | CANCELLED | Free until ACCEPTED; policy-driven after (configurable fee); release reservations |

### 5.2 Policies

- **Re-price guard [Improvement]:** if a merchant's price list changed between checkout and acceptance, the acceptance screen surfaces the delta per line; the merchant confirms explicitly. This prevents silent margin erosion and disputes — the Source flags pricing ambiguity as a critical test scenario (§30.2).
- **Every transition** writes `order_status_history`, emits `order.status.changed` (outbox), and triggers exactly one user-facing notification — no direct notification calls inside handlers.
- **Idempotency:** transition endpoints accept `Idempotency-Key`; repeated requests return the same result (Source §30.3).
- **Partial cancellation** in multi-supplier orders affects only the relevant sub-order; the master order status derives from sub-order states.

## 6. Phase Plans (Phase 0 → Phase 7)

> Each phase adds a **measurable commercial capability** and ends with a deployable increment plus a KPI-based go/no-go gate (Source §19, §28.3). Durations are planning windows, not commitments.

### 6.0 Phase 0 — Market Validation & Design (4–8 weeks)

**Objective:** Confirm the problem is real, pick the launch area + category, define the MVP, and remove the largest unknowns before committing engineering capacity (Source §20).

**Entry gate:** Program approved; founding team + budget allocated.

**Workstreams:**

- **Research / Ops:** market & supply mapping; select one city area + one commercial category; build a target list of 20–50 anchor wholesalers (Source §20.1); competitive map; initial pricing model hypothesis (launch-waiver per Source §4.3).
- **Design:** personas (wholesaler owner, retailer owner, driver, ops agent); journey maps; **clickable Figma prototype** of the retailer ordering flow and wholesaler order-acceptance flow; usability tests with ≥8 real merchants; iterate to ≥80% task completion.
- **Engineering (light):** monorepo scaffold, CI/CD skeleton, dev environment; tech spikes — PostGIS distance/zone queries, SMS/OTP provider delivery benchmark (2+ providers), FCM, Mapbox pricing model vs. MapLibre self-host, payment provider availability in the target market; ERD first cut (Section 4).
- **Data:** event taxonomy + KPI baseline definition (Source §20.2 "KPIs and baseline").
- **GTM:** pilot go-to-market plan (Source §14.2 stages: Pre-launch → Pilot).

**Key deliverables (Source §20.2):** stakeholder/role map, personas, per-segment value propositions, competitive map, prioritized MVP backlog (P0 list from Source §29.1), wireframes/prototype, pilot GTM plan, KPI baseline.

**Exit gate (Source §20.3):** practical evidence that (a) merchants will hand over catalogs and accept orders, (b) a retailer group is willing to buy through the platform, (c) the first procurement flow is clear end-to-end.

**[Improvement] Catalog intake template first.** Build the Excel intake template in Phase 0 and use it to collect anchor-supplier catalogs manually. It de-risks Phase 1's bulk import (the template *becomes* the import contract) and guarantees the pilot launches with real catalog depth — the #1 marketplace launch risk (Source §32 "Weak supply").

### 6.1 Phase 1 — Launchable B2B MVP (12–18 weeks)

**Objective:** An operating B2B marketplace in one area: registration, verification, catalog, tiered pricing, search, cart, ordering, accept/reject, statuses, notifications, basic ratings (Source §21.1).

**Entry gate:** Phase 0 exit criteria met; anchor suppliers signed; ops team hired/trained.

**Workstreams & milestone plan:**

| Milestone | Weeks | Scope |
|---|---|---|
| M1 — Foundation | 1–3 | Monorepo, CI/CD, envs; OTP auth, users/orgs/roles/permissions, audit log, outbox, error/rate-limit middleware |
| M2 — Merchant onboarding | 3–6 | Store profile + location pin, business docs upload, admin verification queue, merchant activation checklist UI |
| M3 — Catalog & pricing | 5–8 | Categories/brands, products + variants, media pipeline, manual inventory, price lists + quantity tiers, product moderation |
| M4 — Discovery & cart | 7–10 | PG full-text search + filters, store & product pages, favorites/saved suppliers, cart (multi-supplier grouping), MOQ guards |
| M5 — Ordering | 9–12 | Checkout, master/sub-orders, state machine, accept/partial-accept/reject, order history, reorder-from-order, notifications |
| M6 — Trust & admin | 12–14 | Ratings (order-gated), admin console completion (merchants, moderation, order monitor, disputes-lite, KPI dashboard), analytics funnel |
| M7 — Hardening & pilot | 14–16+ | Load tests, security review, bulk import (if not already in M3), pilot launch per Source §35: first-30-days manual order oversight, days 31–90 expansion |

**Backend modules:** Identity & Access, Merchant, Catalog, Inventory, Pricing, Promotions (basic), Orders, Reviews, Notifications, Analytics (baseline), Support (basic) — Section 2.2.

**Frontend deliverables:** Flutter *retail* + *wholesale* flavors; Next.js retailer/merchant web (dashboard parity for key flows); Next.js admin console; marketing site.

**Schema:** Section 4 in full (Phase 1 spine), including `channel` column on `price_lists` and `order_financial_breakdown` shadow.

**API surface (representative — full index in Appendix B):** auth/OTP; org/store management; catalog CRUD + presigned media + import job; inventory adjust; price lists/tiers; promotions; search; cart; checkout; order lifecycle; reviews; notifications; admin (verification queue, moderation, order monitor, KPIs).

**Explicitly out of scope (Source §21.5 + additions):**

- No independent delivery marketplace (fulfillment = self-pickup or merchant-managed delivery only; `delivery_jobs` not built).
- No B2C, no advanced advertising, no complex ML, no ERP accounting, no credit system, no complex multi-party settlement.
- No microservices estate — one deployable.
- **[Additions]** No multi-warehouse/multi-branch; no real-time GPS; no public API; single currency; chat deferred to fast-follow (P1 backlog per Source §29.2).

**Exit gate (Source §28.4 row 1 + §21.6 launch-readiness standard):** activation rate, first-order conversion, order completion rate, repeat-order rate, active merchant count; merchant can publish without tech support; a complete order runs end-to-end; RBAC/backups/audit in place; activation funnel measurable; ops ownership assigned.

**Critical-path chain:** auth → orgs/RBAC → catalog + pricing → search → cart → checkout → order FSM → notifications. Parallelizable: admin console (starts M4), bulk import (M3/M6), web app, marketing site.

**Risks & improvements:**

- Catalog quality is the launch killer → bulk import + "concierge import" (ops team uploads on the merchant's behalf, Source §14.3) + import validation UX with row-level errors.
- SMS OTP delivery variance → multi-provider failover from day one.
- Search relevance in Arabic → normalization layer in M4, monitored via search→order conversion.
- Merchant response latency → confirmation SLA timers + escalation notifications to merchant phone.

### 6.2 Phase 2 — Delivery & Tracking (8–12 weeks)

**Objective:** Operate a delivery network: driver registration/verification, job board, assignment (manual → suggested), GPS tracking, ETA, proof of delivery, geofencing, earnings history, logistics monitoring (Source §22.1).

**Entry gate (Source §22.3 precondition):** B2B order volume sufficient to justify delivery ops; fulfillment stubs (`PICKUP`/`MERCHANT_DELIVERY`) exercised in production.

**Workstreams:**

- **Backend:** Delivery module — drivers, vehicles, service zones (PostGIS), delivery jobs + events, location ingestion (batched), POD (OTP + photo; signature later), geofence event engine, driver earnings records; dispatch service with maturity levels **2A → 2B → 2C** (Source §22.2): manual admin assignment → distance/availability suggestions (PostGIS KNN + Mapbox Matrix) → live tracking + ETA (Mapbox Directions). 2D (batching/route optimization) and 2E (multi-sided network) are explicitly deferred to Phase 7 scale work.
- **Mobile:** *driver* flavor — duty toggle, job offers with accept countdown, pickup verification, navigation deep-link, POD capture (OTP keypad, photo, signature), offline-tolerant queue for status updates, earnings view.
- **Web/Admin:** dispatch console (manual assignment + live map), logistics monitoring dashboard (ETA accuracy, active jobs, exceptions).
- **Ops:** driver recruitment/verification playbook; zone design; incident playbook for late/failed deliveries (Source §31.3).

**Schema additions:** Section 4.11 Phase 2 row. `driver_locations` monthly partitions; **retention: raw points 90 days, then aggregated trip traces only** (Source §18.2 location privacy).

**API deltas (representative):**

| Endpoint | Purpose |
|---|---|
| `POST /v1/delivery/jobs` (internal from order FSM) | Create job when order READY |
| `GET /v1/driver/jobs/available` · `POST /v1/driver/jobs/{id}/accept` | Driver job board |
| `POST /v1/driver/jobs/{id}/status` | Pickup/depart/deliver transitions (idempotent) |
| `POST /v1/driver/locations:batch` | Batched GPS points (5–15 s adaptive) — not per-point HTTP |
| `POST /v1/driver/jobs/{id}/pod` | OTP verify / photo / signature + geo + recipient |
| `GET /v1/orders/{id}/tracking` · WS `job:{id}` | Buyer-facing status, driver position, ETA |

**Out of scope:** route optimization engine (2D), third-party fleet APIs (Phase 7), multi-stop batching.

**Exit gate (Source §22.3 + §28.4 row 2):** delivery volume justifies operating cost; reliable data on delivery cost, delivery time, success rate, cancellation rate, assignment time; ETA accuracy tracked from week one.

**Risks & improvements:**

- Location ingestion cost/battery → adaptive frequency (active trip: 5 s; stationary: 60 s+), batch upload, WebSocket where stable.
- Over-promising ETA → publish ETA ranges ("25–40 min") until accuracy data justifies point estimates.
- Driver churn → transparent earnings screen + fair-zone rules; ratings gated to completed jobs.

### 6.3 Phase 3 — Payments, Settlement & Monetization (8–12 weeks)

**Objective:** Payment abstraction, provider integration, COD, financial ledger, settlement cycles, commission engine, merchant subscriptions, refunds, reconciliation, financial reporting (Source §23.1).

**Entry gate (Source §23.3 precondition):** Phase 2 gate met — unit economics visible, repeat ordering meaningful.

**Workstreams:**

- **Backend:** Payments module — provider-agnostic adapter (`authorize/capture/refund/parseWebhook/reconcile`); **activate the double-entry ledger** (`ledger_accounts`, immutable `ledger_entries` with debit/credit + transaction references — Source §17.2); settlement engine (weekly cycles, merchant + driver payouts, platform share per Source §17.4 composition); commission engine (waivers → category rates per Source §23.2); subscription plans (Free/Pro); refunds with reason codes; daily **reconciliation job** comparing provider reports vs. ledger (Source §17.3).
- **Payments UX:** checkout with hosted provider page/SDK (keep card data out of platform scope); COD two-step capture confirmed at POD; payment status in order timeline.
- **Admin:** finance console — payments monitor, settlement runs, refund approvals, reconciliation exceptions, revenue reports.
- **Ops:** payment ops playbooks (failed payment, chargeback, COD shortfall), finance hiring.

**Schema additions:** Section 4.11 Phase 3 row. Ledger invariants enforced + tested: *sum(debits) = sum(credits) per transaction; entries are append-only; every money movement references an order/payment/settlement.*

**API deltas (representative):** `POST /v1/payments/intents`; provider webhook receiver (`/v1/webhooks/{provider}` — signature-verified, idempotent, duplicate-safe per Source §30.2); `GET /v1/finance/settlements`; `POST /v1/admin/refunds`; `GET /v1/merchant/subscription` + plan upgrade.

**Out of scope:** trade credit (Phase 7, regulated partners only), multi-currency, split payments.

**Exit gate (Source §23.3 + §28.4 row 3):** positive-or-improvable unit economics; transaction-cost visibility; payment success rate; reconciliation accuracy (target: 100% auto-reconciled, exceptions < 0.5%); support processes proven on refunds/disputes.

**Risks & improvements:**

- **Never trust the checkout page** (Source §17.3): payment state transitions only on provider webhook; correlation IDs + idempotency keys end-to-end; ledger writes originate from confirmed payment state only.
- Run the ledger in **shadow mode during Phase 1–2** (already storing `order_financial_breakdown`) so Phase 3 activates rather than retrofits — Source §38.1 #6 made concrete.
- Provider lock-in → the adapter is the contract; benchmark a second provider before scale.

### 6.4 Phase 4 — B2C Marketplace (10–14 weeks)

**Objective:** Turn proven retail stores into digital storefronts; acquire consumer traffic; add a demand channel; build weekly purchase loops (Source §24.1).

**Entry gate (Source §10, §24.3):** strong retailer base + recurring B2B orders; delivery + payments stable; *do not open B2C broadly* — start with the most ready stores.

**Workstreams:**

- **Backend:** activate `price_lists.channel = B2C` (no migration — designed in Phase 1); store serviceability areas; consumer identity (org-less users); consumer checkout (prepaid + COD where supported); consumer order channel on master orders; favorites; **Smart Reorder v1 (rules-based)** — median replenishment interval + last-order quantity per household product.
- **Mobile:** *consumer* flavor — location set, nearby stores, store pages, product pages, cart, checkout, live tracking (reuses Phase 2), ratings, favorites, reorder card.
- **Web:** consumer web (SEO surface per Source §16.2 Next.js rationale).
- **Ops/GTM:** staged store onboarding by readiness score (assortment clarity, fulfillment reliability, delivery coverage — Source §24.3); consumer acquisition pilots.

**API deltas:** `GET /v1/consumer/stores/nearby` (PostGIS radius + serviceability); `GET /v1/consumer/products`; `POST /v1/consumer/orders`; `GET /v1/reorder/suggestions`.

**Out of scope:** broad catalog breadth beyond ready stores; consumer credit; subscription commerce.

**Exit gate (Source §28.4 row 4):** B2C MAU, conversion, repeat consumer order rate, AOV; expansion of store count driven by conversion + completion rates.

### 6.5 Phase 5 — Advertising & Merchant Analytics (12–16 weeks)

**Objective:** Ad MVP (campaign create, product/store selection, budget, duration, geo-targeting, placements, impressions/clicks/orders reporting) + merchant analytics (views, conversion, top products, sales over time, customer behavior, repeat rate, promotion performance, internal price comparison where permitted) (Source §25.1–25.2).

**Entry gate (Source §25.3):** enough audience + interaction volume to create real advertiser value.

**Workstreams:**

- **Backend:** Advertising module — campaigns, ad items, placements (SEARCH_RESULT, CATEGORY, STORE_PAGE, HOME), budget pacing (daily caps), **ranking guardrails: max 1–2 sponsored slots per result page, labeled "Sponsored", organic quality score must remain dominant** (Source §11.2 "advertising must not destroy search quality"); event pipeline for impressions/clicks/conversions into partitioned `ad_events`; ROAS reporting; frequency capping; ad policy moderation.
- **Analytics:** merchant dashboards (Part II §15.2); event pipeline hardening (Parquet archive, warehouse-ready).
- **Frontend:** campaign manager wizard (merchant), ads reporting, analytics dashboards; admin ad-ops console.

**API deltas:** `POST /v1/ads/campaigns`; `GET /v1/ads/campaigns/{id}/report`; `GET /v1/analytics/merchant/*` (views, conversion, top-products, sales-trend); impression/click beacon endpoints (`POST /v1/ads/events:batch`).

**Exit gate (Source §28.4 row 5):** ad revenue, ROAS, merchant ad retention, incremental (lifted) orders; organic conversion rate must not degrade — monitored as a guardrail metric.

### 6.6 Phase 6 — AI & Optimization (12–20 weeks)

**Objective:** AI capabilities with measurable business outcomes only (Source §26.2: every AI feature has a KPI).

**Entry gate (Source §28.4 row 5 gate):** sufficient interaction volume; data governance sign-off (Source §12.4).

**Workstreams:**

- **AI Gateway (Source §12.3):** unified provider-agnostic interface (`generate_description`, `summarize`, `extract`, `classify`, `recommend`, `forecast`) with routing, caching, cost metering, and audit (`ai_requests`); models/providers swappable without product redesign.
- **Features, prioritized by KPI:**
  - **Smart Reorder v2** (merchant + consumer; interval learning + stock heuristic) — KPI: repeat-purchase lift.
  - **AI Product Assistant** (description/category suggestions during product entry, OCR from supplier invoices → draft products) — KPI: time-to-publish a correct product.
  - **Recommendations** maturity Level 2 → 3 (Source §12.2: collaborative/similarity → ranking model) — KPI: CTR, conversion, attributed revenue.
  - **Demand forecasting** (per product/zone) — KPI: forecast accuracy (MAPE), stock-out reduction.
  - **Price intelligence + anomaly detection** (internal, governed per Source §37.3) — KPI: detected anomalies, margin protection.
- **Platform:** offline evaluation harness, online A/B framework, feature store (lite), batch scoring pipelines — run as a **thin separate AI service** consuming platform events (first sanctioned extraction from the monolith if desired).

**Exit gate (Source §28.4 row 6):** recommendation lift, forecast accuracy, reorder adoption, AI-assisted task completion; every feature either improves its KPI in A/B or is killed (Source §37.2 lifecycle).

### 6.7 Phase 7 — Commerce Infrastructure (continuous)

**Objective:** Structured geographic expansion + integrations → "Commerce Operating System" (Source §27).

**Scope:**

- Multi-branch/multi-warehouse operations; advanced employee roles/permissions; per-market configurable verification/tax/document rules (Source §18.3).
- ERP/accounting integrations via adapter pattern (exports + webhooks out; QuickBooks/Xero/local ERP adapters); delivery-company fleet APIs; regulated trade-credit partnerships; market intelligence products (aggregated/anonymized per Source §13.4); developer platform (OAuth2 client-credentials, public API, outbound webhooks, rate limits).
- Delivery maturity 2D–2E: trip batching, route optimization (Mapbox Optimization), multi-sided delivery network.
- Service extraction candidates when justified: location ingestion, ads/event pipeline, AI service.
- Expansion playbook: one area at a time (Source §14.2 "Scale"), each with density-first metrics before the next.

**Gate discipline:** every expansion wave carries a unit-economics checklist (CAC, contribution margin, delivery cost per order) before and after (Source §28.3: usage, economics, operations).

## 7. Critical Path & Dependency Map

### 7.1 Cross-phase critical chain

```
Phase 0 gate (catalog commitments + retailer intent)
   └─▶ Phase 1 spine: auth → RBAC → catalog+pricing → search → cart → order FSM → notifications
          └─▶ Phase 2 delivery (needs READY→ASSIGNED transitions + fulfillment stubs)
                 └─▶ Phase 3 payments (needs order volume + ledger shadow data)
                        └─▶ Phase 4 B2C (needs delivery + payments + channel-scoped pricing)
                               └─▶ Phase 5 ads/analytics (needs audience + event volume)
                                      └─▶ Phase 6 AI (needs behavioral + transaction data)
                                           └─▶ Phase 7 scale (needs proven unit economics + ops maturity)
```

### 7.2 Expensive-to-retrofit decisions — must be correct in Phase 1

| # | Decision | Why it cannot wait | Source |
|---|---|---|---|
| 1 | User / Organization / Role / Permission separation | Re-designing identity mid-flight breaks every table and token | §5.2 |
| 2 | Master order + sub-orders per supplier | Retrofitting multi-supplier orders corrupts settlement, returns, ratings | §7.2 |
| 3 | Order-item price/promotion snapshots + `order_financial_breakdown` | Auditability and Phase 3 ledger depend on historical truth | §6.2, §17.2 |
| 4 | `price_lists.channel` + `audience` columns | Phase 4 B2C reuses the same pricing tables — no migration | §10.1 |
| 5 | Domain event taxonomy + transactional outbox | Analytics, notifications, search indexing, ledger all consume events | §30.3 |
| 6 | UUIDv7 keys + `organization_id` scoping on all merchant data | Multi-tenancy retrofit is the highest-severity security risk class | §18.1 |

### 7.3 Parallelization lanes

| Lane | Tracks | Constraint |
|---|---|---|
| Lane A (core) | Auth → catalog → orders → notifications | The critical path — never starved |
| Lane B (surfaces) | Web app, admin console, marketing site | Depends on Lane A contracts only (via `packages/contracts`) |
| Lane C (data) | Event pipeline, dashboards, funnels | Contracts frozen at M4 |
| Lane D (ops) | Onboarding playbooks, merchant recruiting, support tooling | Runs from Phase 0 |

## 8. Consolidated Risk Register & Improvement Register

### 8.1 Risk register (Source §32 + engineering additions)

| ID | Risk | Impact | Mitigation | Phase |
|---|---|---|---|---|
| R1 | Weak supply at launch | Retailers find nothing; churn | Anchor suppliers signed in P0; concierge catalog import; intake template | 0–1 |
| R2 | Weak demand | Merchants see no value | Small launch area, field sales, first-order incentives, referral tied to completed orders | 1 |
| R3 | Poor product data quality | Weak search/conversion | Import validation, moderation queue, AI-assisted entry later | 1–6 |
| R4 | Premature complexity | Delayed launch | Strict scope fences per phase; modular monolith (not microservices) | All |
| R5 | Fraud / fake accounts | Financial + trust loss | Verification, device fingerprinting, velocity rules, rate limits | 1–3 |
| R6 | Negative unit economics | Growth amplifies losses | Contribution margin per order; CAC/LTV gates per phase | All |
| R7 | Single-provider dependency (SMS, payments, maps) | Operational outage | Abstraction adapters + benchmarked second providers | 1–3 |
| R8 | Payment webhook loss/duplication | Money mismatches | Signed idempotent webhooks, ledger, daily reconciliation | 3 |
| R9 | Delivery experience failure | Trust damage | Start manual dispatch (2A); measure ETA/POD before automation | 2 |
| R10 | Location-data privacy breach | Legal + trust | Purpose-scoped collection, 90-day raw retention, access controls | 2 |
| R11 | Arabic search relevance | Discovery failure | Normalization layer; OpenSearch trigger criteria defined in advance | 1 |
| R12 | SMS OTP delivery variance | Signup drop-off | Multi-provider failover + retry + WhatsApp fallback | 1 |
| R13 | Scope creep from merchants | Launch slip | Feature Addition Decision Framework (Source §41) enforced by Product Council | All |
| R14 | Key-person dependency (small team) | Bus factor | `packages/contracts` as source of truth; pairing; runbooks | All |

### 8.2 Improvement register (deviations & additions beyond the Source)

| ID | Area | Ambiguity / risk in Source | Recommendation | Applies |
|---|---|---|---|---|
| I1 | Orders | SUBMITTED vs PENDING_CONFIRMATION unclear | Canonical transition matrix (Section 5.1): SUBMITTED is transient, auto-advances | P1 |
| I2 | Pricing | Cart-vs-acceptance price drift unaddressed | Re-price guard at merchant acceptance with per-line delta confirmation | P1 |
| I3 | Inventory | "Accept then stock changes" scenario unresolved | Reserve-at-acceptance policy + immutable stock movements | P1 |
| I4 | Data model | B2C pricing reuse not specified | `channel` + `audience` on price lists from day one | P1 → activates P4 |
| I5 | Finance | Ledger deferred to P3 risks retrofit | Ledger shadow from P1 (`order_financial_breakdown`), activate P3 | P1/P3 |
| I6 | Reliability | Notification/search/analytics consistency implicit | Transactional outbox + idempotent consumers from day one | P1 |
| I7 | Mobile | 4 apps implied, cost unclear | Single Flutter codebase, four flavors | P1+ |
| I8 | Search | Arabic quality unaddressed | Normalization (diacritics/hamza folding) + predefined OpenSearch trigger | P1 |
| I9 | Delivery | GPS cost/battery strategy mentioned but unspecified | Adaptive frequency + batched ingestion + WS; ETA ranges until calibrated | P2 |
| I10 | Payments | "Checkout page is not proof" stated, mechanism unspecified | Webhook-only state transitions; correlation IDs; daily reconciliation job | P3 |
| I11 | Analytics | Event volume on OLTP PG unaddressed | Monthly partitions + Parquet archival from P2; warehouse-ready | P1+ |
| I12 | Ops | SLA numbers deferred indefinitely | Set provisional SLAs at pilot (e.g., order issues < 2 h response), measure, revise monthly | P1 |
| I13 | Governance | Feature lifecycle stated, enforcement unclear | Product Council cadence + kill criteria per feature (Source §37) | All |
| I14 | Localization | RTL required but no technical strategy | Logical CSS properties, mirrored icon set, ARB/next-intl, pseudo-RTL CI checks | P1 |

## 9. Testing & Quality Gates

### 9.1 Test strategy mapped to Source §30.1

| Layer | Scope | Tooling (reference) | Gate |
|---|---|---|---|
| Unit | Domain logic: pricing resolution, tier selection, FSM guards, ledger math | Jest | ≥ 85% on domain modules |
| Integration | Module APIs + DB: orders, pricing, inventory reservation, notifications | Testcontainers (Postgres+PostGIS, Redis) | CI-blocking |
| Contract | `/v1` OpenAPI conformance; generated clients compile | Schemathesis / Dredd | CI-blocking |
| E2E | Critical flows (below) on staging | Playwright (web) + integration tests (API) | Pre-release |
| Load | Checkout, search, location ingestion, webhook storms | k6 | p95 budgets before each phase gate |
| Security | SAST, dependency scan, secrets scan; pen test before P3 | CI + external | P3 blocking |
| Mobile | Device matrix (low-end Android priority), offline simulation, RTL screenshots | Firebase Test Lab | Pre-release |
| Usability | Merchant task flows with real users each phase | moderated sessions | Phase exit criterion |

### 9.2 Automated critical-scenario suite (Source §30.2)

1. Merchant accepts order after inventory changed → reserve-at-acceptance + partial-accept path.
2. Multiple quantity price tiers resolve and snapshot correctly.
3. Order modification after acceptance per policy (re-price guard).
4. Payment failure + retry; **duplicate webhook** ignored idempotently (P3).
5. Driver failure mid-delivery → reassignment flow (P2).
6. Weak connectivity: queued status updates replay in order (P2).
7. WebSocket interruption → REST resync produces correct final state.
8. Dispute after POD → evidence bundle integrity (P1 basic / P2 full).
9. Partial cancellation in multi-supplier order → only affected sub-order changes.

### 9.3 Non-functional budgets

| Metric | Budget |
|---|---|
| API read p95 / write p95 | < 400 ms / < 800 ms |
| Search p95 | < 300 ms |
| Mobile cold start | < 2.5 s on mid-range Android |
| Checkout availability | 99.9% (SLO) |
| Crash-free sessions | ≥ 99.5% |

## 10. Operations Readiness

### 10.1 Operating functions (Source §31.1) — staffed before pilot

Merchant onboarding (incl. concierge catalog import) · verification · catalog assistance · order support · delivery operations (P2) · payment reconciliation (P3) · dispute handling · fraud review.

### 10.2 Provisional SLAs (set at pilot, revised monthly — Source §31.2)

| Issue type | First response | Resolution target |
|---|---|---|
| Order-blocking (buyer cannot order / merchant cannot accept) | < 30 min | < 4 h |
| Payment incident | < 30 min | same day |
| Delivery exception (P2) | < 15 min | < 2 h |
| Account/access | < 2 h | < 24 h |
| General inquiry | < 4 h | < 48 h |

### 10.3 Playbooks (Source §31.3)

Payment failure · missing order · missing item · late driver · unresponsive merchant · compromised account · dispute · promotion abuse · **additions**: OTP delivery outage (SMS failover), webhook provider outage, dispatch backlog, catalog import corruption rollback.

### 10.4 Launch operations plan (Source §35)

- **Before launch:** area selected, anchors signed, real catalog loaded, pilot retailer group chosen, ops team trained, every critical flow tested, marketing materials ready, analytics + support live.
- **First 30 days:** manual oversight of every order where needed; daily merchant communication; drop-off reason log; remove any step blocking first orders; collect success stories; small multi-channel acquisition tests.
- **Days 31–90:** grow merchant count from data; adjacent areas with commercial density; add Bulk Import + Reorder early; expand promotions + referral; start delivery pilot when volume justifies.
- **Discipline rules:** no geographic expansion before retention stabilizes; no broad ad spend before CAC is known; no feature without KPI/cost justification; no broad B2C before retailer readiness (Source §35.4).

---

# PART II — ADVANCED UI/UX DESIGN STRATEGY

## 11. Design Philosophy & Experience Principles

**Positioning:** the product must feel like a **trade tool first and a marketplace second**. Users are working — replenishing stock, accepting orders, driving — not browsing. Density, speed, and clarity outrank delight. Extending Source §15.1:

1. **Speed to value:** every screen answers "what do I do next?" within two seconds.
2. **Price & quantity truth:** unit price, pack size, and MOQ are always visible on cards and lists — never hidden behind a detail page.
3. **Status is a first-class citizen:** order state is persistent, resumable, and live-updating (Source §15.1: "order status persistent and easy to resume").
4. **Trust surfaces everywhere:** verification badges, ratings, and fulfillment signals appear at every decision point (Source §9.2).
5. **Thumb-first mobile, pointer-first web:** mobile = large targets, bottom-anchored actions; web/admin = keyboard speed, dense grids.
6. **Offline-tolerant:** the app degrades gracefully and never loses user work (queued actions with visible pending state).
7. **RTL is a first-class layout**, not a mirror hack (Source §15.1).
8. **One primary action per screen;** destructive actions are always confirmed with consequence text.
9. **Empty states teach:** "Import your catalog", "Add your first product" — never dead ends (activation focus per Source §15.2–15.3).
10. **Accessibility is a ship gate**, not a wishlist (§16).

## 12. TAIF Commerce Design System (TCDS)

One token-based system across Flutter (all four flavors), Next.js web, and the admin console — the design layer of the `packages/ui-kit` + `mobile-core` strategy in Part I §2.3.

### 12.1 Color tokens

| Token | Value | Role |
|---|---|---|
| `brand/600` | `#174A5B` | Primary actions, headers, active nav (extends Source accent) |
| `brand/500` | `#1E6178` | Pressed/hover states, links |
| `brand/100` | `#E7F0F3` | Selected rows, tinted surfaces |
| `commerce/600` | `#B45309` | Promotions, price-drop badges, savings callouts — used *only* for commercial attention |
| `success/600` | `#1B7A4B` | Accepted, delivered, in-stock |
| `warning/600` | `#B45309` | Low stock, SLA warnings, overdue reorders |
| `error/600` | `#B3372F` | Rejected, failed payment, validation |
| `info/600` | `#1D5FA8` | Informational states, tracking updates |
| `neutral/50–900` | slate ramp | Text (`900`), secondary text (`600`), borders (`300`), backgrounds (`50`) |

**Order-status semantic map** (shared by StatusPill, OrderTimeline, notifications):

| State group | Color | Icon |
|---|---|---|
| Draft/Submitted/Pending | `info` | clock |
| Accepted/Preparing/Ready | `brand` | check-circle |
| In delivery (Assigned→Out for delivery) | `info` | truck |
| Delivered/Completed | `success` | check-badge |
| Cancelled/Rejected | `neutral` | x-circle |
| Disputed | `error` | alert |

### 12.2 Typography

- **Latin:** Inter (variable). **Arabic:** IBM Plex Sans Arabic. Fallbacks: `system-ui, "Segoe UI"` — no webfont dependency required for the HTML deliverables of this project.
- **Tabular numerals everywhere numbers align** (prices, quantities, ledgers, tables): `font-variant-numeric: tabular-nums` / Flutter `fontFeatures: [FontFeature.tabularFigures()]`.
- Scale: display 28/34, h1 24/30, h2 20/26, h3 17/24, body 16/24 (mobile) 15/22 (desktop), small 13/18, caption 12/16. Minimum input font size 16 px to prevent iOS focus zoom.

### 12.3 Spacing, radius, elevation, motion

| Token set | Values |
|---|---|
| Spacing (4-pt grid) | 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | input 4 · card 8 · sheet 12 · pill full |
| Elevation | e1 rest cards · e2 dropdowns · e3 modals/toasts |
| Motion | micro 100 ms · standard 200 ms · sheet 300 ms; standard easing; **all animation gated by `prefers-reduced-motion`** |
| Touch target | ≥ 48×48 dp mobile / 44 px web |

### 12.4 Iconography & imagery

- **Material Symbols** (RTL-aware, auto-mirroring) + a custom trade icon set: pallet, carton, tier-ladder, MOQ badge, verified-shield, trusted-star, fast-truck.
- Product imagery: real merchant photos prioritized; pipeline supplies crops + blurhash placeholders (Part I §3.5); `alt_text` mandatory in the media model.
- Illustration: flat, single-accent, reserved for empty states and onboarding — never inside operational flows.

### 12.5 Core component inventory

| Component | Purpose | Notes |
|---|---|---|
| **QuantityStepper** | The B2B hero control | Large ± targets, direct entry, inline tier hint ("Buy 24+ → 4.75"), MOQ floor guard |
| **TierLadder** | Visual quantity-price ladder | Bars scale with discount; current quantity highlighted; used on PDP + pricing editor |
| **StatusPill** | Order/job state | Icon + color + text (never color-only); maps 1:1 to the FSM (Part I §5) |
| **OrderTimeline** | Status history + projected steps | Consumes `order_status_history`; live step pulses when active |
| **SupplierCard / ProductCard** | Discovery surfaces | Price, MOQ badge, rating, trust badge, distance, stock hint; sponsored variant labeled |
| **DataGrid** (web/admin) | Catalog, orders, queues | Sticky header, inline edit, bulk select, saved views, keyboard navigation |
| **ImportWizard** | Excel/CSV bulk import | Upload → column mapping (auto-map) → row-level validation report → publish review |
| **MapPinPicker / OTPInput / DocUploader / SignaturePad / PhotoCapture** | Operational inputs | DocUploader shows progress + retry; SignaturePad captures strokes + consent line |
| **KpiCard / Sparkline / ChartCard / RangeCompare** | Analytics | Tabular numerals; semantic colors; CSV export on every chart |
| **EmptyState / SkeletonBlock / OfflineBanner / QueuedActionChip** | System states | EmptyState always carries one CTA; queued chips show replay status |
| **ActivationChecklist** | Merchant activation tracker | "Verified ✓ · Products 4/20 · First order —" (Source §15.2) |
| **SponsoredSlot** | Ads (P5) | "Sponsored" label, tinted border, capped to 1–2 per result page |

### 12.6 Motion & feedback

- Motion only where it explains change: status transitions, cart fly-in, sheet slide. Haptics on mobile: success (order accepted), warning (validation error), light tick (selection).
- Loading: skeletons for lists (never spinners for >300 ms), optimistic add-to-cart with rollback, deterministic progress for uploads/imports.

## 13. Interaction Model by Role

| Dimension | Wholesaler | Retailer | Driver | Admin |
|---|---|---|---|---|
| Mental model | "Command center" — queues & SLAs | "Procurement companion" — a shopping list that fills itself | "Focus mode" — one job at a time | "Operations console" — queues & evidence |
| Primary surface | Web-first + mobile companion | Mobile-first + web | Mobile only (driver flavor) | Desktop web only |
| Hero action | Accept order in ≤3 taps from push | Reorder in ≤3 taps | Complete POD with zero retyping | Clear a verification queue |
| Density | High (tables) | Medium (cards) | Minimal (one task) | Very high (grids + split pane) |
| Top nav | Today · Orders · Catalog · Inventory · Pricing · Promotions · Customers · Analytics | Home · Search · Cart · Orders · Account | Duty · Jobs · Earnings | Overview · Verifications · Merchants · Products · Orders · Disputes · Finance · Analytics |

### 13.1 Wholesaler — Command Center

- **Home = Today:** new-orders queue with SLA countdown (amber → red), pending verification status, low-stock alerts (from `reorder_point`), activation checklist until first order.
- Order acceptance is the revenue-critical flow: push notification → order detail (stock check + price-delta guard) → Accept All / Partial / Reject → buyer auto-notified. Designed for ≤3 taps.
- Web carries catalog/pricing bulk work (DataGrid + ImportWizard); mobile carries alerts, quick accept, and scanning.

### 13.2 Retailer — Procurement Companion

- **Home:** Smart Reorder strip ("Restock Suggestions") → saved suppliers → offers nearby → categories.
- Search-first with barcode scan; long-press any product to compare across suppliers (price, MOQ, rating, distance, delivery option).
- Cart groups by supplier with per-supplier subtotals, MOQ progress bars ("12/24 to unlock 4.75"), and delivery method per supplier.

### 13.3 Driver — Focus Mode

- Full-screen single-task UI; 56 dp+ targets; high-contrast day/night themes (dark mode ships here first — cab/night driving);
- Status changes work offline and replay (QueuedActionChip); earnings and duty hours are one tap from any screen.
- Text is minimal; icons + large numerals carry meaning; voice-note attachment available for exception reporting.

### 13.4 Admin — Operations Console

- Queue-centric split pane: list left, evidence/detail right (verification documents, order audit trail, dispute evidence bundle).
- Live order board (status columns + filters) and dispatch map from Phase 2; every object exposes its `audit_logs` in a slide-over.
- Keyboard-first: j/k list navigation, `A` approve, `X` reject, `/` search — the console is an operator's cockpit.

## 14. Key User Journeys & Screen Flows

### 14.1 Wholesaler Onboarding & Activation

```
Role Select → Phone + OTP → Organization (name/type) → Store Wizard:
  ① Business info   ② Location pin + service radius   ③ Categories & brands
→ Document Upload (KYC) → Verification Review (status + ETA) → Activation Home
```

| # | Screen | Key UI elements | Design intent |
|---|---|---|---|
| 1 | Role Select | Two large cards (Sell wholesale / Buy for my store) | Sets flavor + onboarding track |
| 2 | Phone + OTP | OTPInput, resend w/ countdown, WhatsApp fallback link | OTP friction is the #1 drop-off |
| 3 | Organization | Name, type, optional tax ID ("add later" allowed) | Progressive disclosure — verify later |
| 4 | Store Wizard ①–③ | Autosaved steps, MapPinPicker, category chips | Exit & resume anytime; progress ring |
| 5 | Document Upload | DocUploader (progress/retry), configurable doc set per market | Clear "why we need this" microcopy |
| 6 | Verification Review | Status timeline (Submitted → In review → Decision), ETA, support CTA | Kills the "black hole" anxiety |
| 7 | **Activation Home** | ActivationChecklist (Verified ✓ · Products 4/20 · First order —) + primary CTA "Add products" with three paths: manual / Excel import / concierge import | Activation = the product goal (Source §15.2) |

### 14.2 Catalog Management & Bulk Import

```
Catalog Grid → [ New Product | Import | Scan Barcode ]
  New Product → Editor (Basics · Packaging & Pricing · Media) → Publish
  Import → Upload → Column Mapping → Validation Report → Import Progress → Publish Review
```

- **Catalog Grid (web):** DataGrid with status filters (Draft/Active/Low stock/Rejected), inline stock edit, bulk actions (activate, archive, duplicate).
- **Product Editor:** three tabs; autosave drafts; "duplicate product" and "copy pricing from…" accelerators (Source §6.4 UX principle); barcode scan prefills name/brand.
- **TierLadder editor:** add tiers as rows (min qty → unit price), live preview of the buyer-facing ladder; MOQ field with validation.
- **ImportWizard:** auto-mapped columns with manual override; validation report lists row-level errors (missing price, bad category, duplicate SKU) with a downloadable corrected template; import runs async with progress and a publish-review step — nothing goes live unreviewed.

### 14.3 Retailer Order Placement

```
Home → Search / Scan → Results → Product Page → QuantityStepper → Cart (per supplier)
→ Checkout → Confirmation → Tracking → Rate & Reorder
```

| Step | Screen & elements | Details |
|---|---|---|
| 1 | Home | Restock Suggestions strip (Smart Reorder §15.1), saved suppliers, offers, categories |
| 2 | Search | Query + barcode scan; filters: price, MOQ, delivery option, rating, distance; sponsored slots clearly labeled |
| 3 | Product Page | TierLadder, stock badge, supplier strip (rating, badges, distance), compare-across-suppliers panel |
| 4 | Add to Cart | QuantityStepper with tier auto-highlight; MOQ guard: under-min attempts offer "Add minimum (24)" fix-action |
| 5 | Cart | Supplier groups; per-supplier subtotal + delivery method (pickup / merchant delivery); MOQ progress bars; notes per supplier |
| 6 | Checkout | Buyer note, payment = on account in Phase 1 (Source §21.1: no payment gateway yet), order review |
| 7 | Tracking | OrderTimeline; live map + driver card from Phase 2 |
| 8 | After delivery | Rate store (order-gated), one-tap Reorder (§15.1) |

### 14.4 Wholesaler Order Acceptance (hero flow)

```
Push ("New order — 14 items · 2,340.00") → Order Detail → [Accept All | Partial | Reject(reason)]
→ Buyer auto-notified → PREPARING → READY
```

- Order Detail shows per line: qty, snapshot price, current stock, and **price-delta guard** flags if the price list changed since checkout (Part I §5.2).
- Partial Accept: item-level toggles + editable confirmed quantities; unconfirmed items release automatically; buyer sees exactly what changed.
- SLA countdown on the card (amber → red), escalation to phone/chat when breaching.

### 14.5 Driver Delivery Cycle (Phase 2)

```
Duty On (zone) → Job Offer (accept/decline · countdown) → Pickup Verify (order code/QR)
→ Navigate (deep link + status bar) → Arrive (geofence prompt) → POD Capture → Summary → Earnings
```

- POD Capture: OTP keypad (primary) / photo / signature + recipient name + auto geo-tag; all offline-capable with QueuedActionChip replay.
- Summary shows fee, duration, distance; suggests next nearby job. Earnings view: today/week totals, job list with POD receipts.

### 14.6 Consumer Journey (Phase 4)

```
Location Permission → Nearby Stores (list/map toggle) → Store Page → Product → Cart
→ Checkout (pay / COD) → Live Tracking → Rate · Favorite · Reorder card
```

- Reuses retailer patterns with consumer pricing (`channel = B2C`), simpler cart (single store per order recommended at launch), and Smart Reorder for household replenishment (Source §10.3).

### 14.7 Admin Operations Console

- **Verifications queue:** list left + document preview right; approve / reject with mandatory reason (audit-logged).
- **Order Monitor:** status board with filters + SLA colors; drill-down shows full `order_status_history` + audit trail slide-over.
- **Disputes (P2+):** split-pane evidence viewer — POD, photos, order-linked chat, financial breakdown side by side; decision templates with structured outcomes.
- **Dispatch console (P2):** live map + unassigned jobs + driver suggestions (2B) + manual assign.

## 15. Advanced Interfaces

### 15.1 Smart Reorder (Source §10.3, §13.3)

**Rules v1 (Phase 4; merchant-facing variant Phase 5):** median reorder interval per product × last-order quantity; confidence from interval variance and order count.

| UI state | Presentation |
|---|---|
| High confidence | Brand-colored card: "Usually ordered every 21 days — you're at day 19" + prefilled qty + price-change badge ("+5% since last order") |
| Low confidence | Neutral gray row, suggestion only, no nudge notification |
| Overdue | Amber "You may be running low" + est. stock-out date |
| No history | Hidden — never fabricate suggestions |

- **Retailer home:** "Restock Suggestions" strip → detail sheet with per-item qty steppers → **"Add all (est. 2,140.00)"** single CTA.
- **Merchant Restock Radar (P5):** list of buyers predicted to reorder this week, with "Send offer / Remind" actions — frequency-capped and consent-gated (never spam; Source §15.4).
- **KPI:** repeat-purchase lift (Source §26.2) — the card is measured, not assumed.

### 15.2 Data-Visualization Dashboards

**Merchant dashboard (Phase 5):**

```
┌ KPI row: Orders · Revenue · AOV · Repeat rate  (each with Δ vs previous period)
├ Sales trend (line, 30/90 days, compare ranges)
├ Top products (bar list + sparkline + Δ price)
├ Conversion funnel: views → cart → order → repeat
└ Promotion ROI table (spend, orders, incremental revenue, sparkline)
```

**Admin ops dashboard:** GMV trend, activation funnel (registration → verified → catalog ≥20 → first order), delivery heatmap (PostGIS), ETA-accuracy gauge, dispute aging.

**Design rules:** the 5-second insight test (a merchant must read any chart's takeaway in 5 s); tabular numerals; one semantic color language shared with StatusPill; every chart exports CSV; mobile stacks KPI row → trend → lists; empty states say "data starts flowing after your first order."

### 15.3 Notification & Nudge Model (Source §15.4)

| Category | Examples | Channel | Cadence |
|---|---|---|---|
| Transactional | Order placed/accepted/delivered, POD, payment receipt | Push + in-app, immediate | As events occur |
| Behavioral | Restock suggestion, price drop on favorite, in-cart price change | Push digest or in-app | Max 2/week per user, quiet hours |
| Promotional | Offers, campaigns | Push only with consent | Throttled, preference-gated |

## 16. Accessibility — WCAG 2.2 AA (ship gate)

| Criterion | Implementation |
|---|---|
| Contrast | ≥ 4.5:1 text, ≥ 3:1 UI components & status colors — token pairs pre-validated |
| Target size | ≥ 48×48 dp mobile (driver app ≥ 56 dp), ≥ 44 px web |
| Non-color status | StatusPill = icon + color + text; charts carry patterns/labels, not color alone |
| Live updates | `aria-live` regions for order status changes and driver ETA; Flutter `Semantics` announcements |
| Keyboard & focus | Full keyboard paths on web/admin; focus trap in wizards/modals; visible focus ring |
| Forms | Persistent labels (no placeholder-only), error text linked via `aria-describedby`, announced on submit |
| Motion | `prefers-reduced-motion` honored everywhere incl. map tracking |
| Screen readers | VO (ar + en) and TalkBack passes per release on critical flows |
| CI | axe-core on web pages; Flutter accessibility checks in test suite |

## 17. Localization & RTL

- **Stack:** Flutter `intl` ARB files per flavor; `next-intl` on web; ICU message syntax; English source strings with professional Arabic review before release.
- **RTL implementation:** logical CSS properties only (`margin-inline-start`, `inset-inline`); Flutter `Directionality`-driven layouts; mirrored icons (back, chevrons, progress, undo) via an `autoMirror` flag; **not** mirrored: media controls, clocks, phone numbers.
- **Numerals:** Western Arabic numerals (0–9) default for prices/quantities/IDs (B2B convention), toggleable per market config.
- **Bidi:** mixed-direction product names (Arabic name + Latin brand) wrapped with proper bidi isolation so punctuation never flips.
- **Formatting:** dates, times, currency, and units via ICU per locale; week start + Friday/weekend conventions per market.
- **QA:** pseudo-RTL localization in CI, LTR + RTL golden screenshot tests per screen family, Arabic UX review each release; layout tested at +40% string expansion.

## 18. Responsive & Adaptive Layout

| Breakpoint | Range | Navigation | Layout behavior |
|---|---|---|---|
| Compact | < 600 px | Bottom NavigationBar (5 max) | Single column; tables → key-column cards; primary actions bottom-anchored |
| Medium | 600–1024 px | NavigationRail | 2-column lists; grids 4-col; sheets become popovers |
| Expanded | > 1024 px | Permanent drawer / top nav | 12-col grid; DataGrid full columns; split panes (admin) |

- Flutter enforces the same three windows via `MediaQuery` breakpoints in `mobile-core`, so all flavors behave identically.
- Driver app additionally supports landscape map mode; all primary actions live in the bottom 40% thumb zone.
- Web dashboards collapse by priority: KPIs persist, charts restack, tables drop optional columns — never horizontal page scroll.

## 19. Performance UX Budgets & Instrumentation

| Metric | Budget |
|---|---|
| App cold start (mid-range Android) | < 2.5 s |
| Perceived list load (skeleton within) | < 300 ms |
| Image thumbnails on cards | ≤ 60 KB (WebP/AVIF) |
| Web first meaningful paint | < 1.8 s |
| Scroll jank / dropped frames | < 1% of frames |
| Order-status push → screen reflects | < 2 s |

**Funnel instrumentation** (events feed Part I §3.10 taxonomy): each journey step above maps 1:1 to an analytics event (`search_performed`, `product_viewed`, `cart_item_added`, `checkout_started`, `order_submitted`, `order_completed`, `reorder_used`, `import_completed`). Dashboards in §15.2 consume the same events — one pipeline, no parallel truth.

**Qualitative loop:** monthly merchant visit day (Source §14.3 onboarding team), consented session recordings on web, support-ticket reason coding feeding the design-debt register.

## 20. Design Operations

- **Figma structure:** Foundations (tokens) → Components (variants incl. RTL + dense) → Patterns → Flows; tokens exported via Style Dictionary into `packages/ui-kit` (CSS variables) and the Flutter theme — designers and engineers consume the same source.
- **Handoff:** contracts-first — OpenAPI + tokens, zero redline handoffs; Storybook documents ui-kit; component parity review each sprint.
- **Cadence:** weekly design–engineering pairing on the hero flows; phase-exit usability testing as a gate (Part I §9.1); design-debt register groomed like tech debt.

---

# Appendices

## Appendix A — Domain Event Taxonomy (v1)

`identity.user.registered` · `identity.user.otp_requested` · `merchant.store.created` · `merchant.verification.submitted` · `merchant.verification.approved` · `catalog.product.published` · `catalog.product.rejected` · `catalog.import.completed` · `inventory.stock.adjusted` · `inventory.stock.reserved` · `inventory.stock.released` · `pricing.price_list.updated` · `order.submitted` · `order.accepted` · `order.partially_accepted` · `order.rejected` · `order.status.changed` · `order.cancelled` · `order.completed` · `review.created` · `dispute.opened` · `dispute.resolved` · `notification.dispatched` · *(P2)* `delivery.job.created` · `delivery.job.assigned` · `delivery.job.accepted` · `delivery.job.status.changed` · `delivery.pod.submitted` · `delivery.eta.updated` · *(P3)* `payment.initiated` · `payment.captured` · `payment.failed` · `payment.refunded` · `settlement.completed` · *(P4)* `consumer.order.placed` · `reorder.suggestion.served` · *(P5)* `ad.campaign.launched` · `ad.impression` · `ad.click` · `ad.conversion`

## Appendix B — Phase 1 API Endpoint Index (representative)

| Module | Endpoints |
|---|---|
| Auth | `POST /v1/auth/otp/request` · `POST /v1/auth/otp/verify` · `POST /v1/auth/refresh` · `POST /v1/auth/logout` |
| Users | `GET/PATCH /v1/me` · `GET /v1/me/organizations` · `POST /v1/me/devices` |
| Organizations | `POST /v1/organizations` · `POST /v1/organizations/{id}/members` · `GET /v1/organizations/{id}/members` |
| Merchant | `POST /v1/stores` · `PATCH /v1/stores/{id}` · `POST /v1/stores/{id}/documents` · `GET /v1/stores/{id}` (public) |
| Catalog | `POST /v1/products` · `PATCH /v1/products/{id}` · `POST /v1/products/{id}/variants` · `POST /v1/media/presign` · `POST /v1/catalog/imports` · `GET /v1/catalog/imports/{jobId}` |
| Inventory | `GET /v1/inventory` · `PATCH /v1/inventory/{itemId}` · `GET /v1/inventory/low-stock` |
| Pricing | `POST /v1/price-lists` · `POST /v1/price-lists/{id}/tiers` · `GET /v1/products/{id}/pricing` |
| Promotions | `POST /v1/promotions` · `GET /v1/promotions` · `GET /v1/offers/nearby` |
| Search | `GET /v1/search?q=&filters` · `GET /v1/categories` · `GET /v1/categories/{id}/products` |
| Cart | `GET /v1/cart` · `POST /v1/cart/items` · `PATCH /v1/cart/items/{id}` · `DELETE /v1/cart/items/{id}` |
| Orders | `POST /v1/checkout` · `GET /v1/orders` · `GET /v1/orders/{id}` · `POST /v1/orders/{id}/accept` · `POST /v1/orders/{id}/reject` · `POST /v1/orders/{id}/items/{itemId}/confirm` · `POST /v1/orders/{id}/status` · `POST /v1/orders/{id}/cancel` |
| Reorder | `POST /v1/orders/{id}/reorder` · `GET /v1/reorder/suggestions` (P4) |
| Reviews | `POST /v1/orders/{id}/review` · `GET /v1/stores/{id}/reviews` |
| Notifications | `GET /v1/notifications` · `PATCH /v1/notifications/{id}/read` · `GET/PATCH /v1/notification-preferences` |
| Admin | `GET /v1/admin/verifications` · `POST /v1/admin/verifications/{id}/decision` · `GET /v1/admin/orders` · `GET /v1/admin/merchants` · `GET /v1/admin/kpis` · `GET /v1/admin/audit-logs` |
| Realtime (WS) | `GET /v1/realtime` — rooms `user:{id}` · `org:{id}` · `order:{id}`; events `order.status` · `notification.new` |

---

*End of document. Companion rendering: `Smart_Commerce_Platform_Implementation_and_UX_Plan.html`.*
