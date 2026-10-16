# SCS Platform — M7.2.3 Pre-Implementation Architecture Audit
## Carrier Abstraction & External Carrier Integration

**Version:** 1.0.0  
**Date:** 2026-09-28  
**Status:** AUDIT COMPLETE — IMPLEMENTATION SPECIFICATION READY  
**Baseline:** M7.2.2 — Shipping Methods, Delivery Zones, Zone Enforcement (ALL PASS)  
**Scope:** READ-ONLY — No production code modified

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Provider Abstraction Audit](#3-provider-abstraction-audit)
4. [Data Model Audit](#4-data-model-audit)
5. [Credential Architecture](#5-credential-architecture)
6. [Multi-Tenant Model](#6-multi-tenant-model)
7. [Shipment Creation Architecture](#7-shipment-creation-architecture)
8. [Outbox/Worker Integration](#8-outboxworker-integration)
9. [Tracking Architecture](#9-tracking-architecture)
10. [Webhook Architecture](#10-webhook-architecture)
11. [Idempotency Design](#11-idempotency-design)
12. [Retry/Failure Model](#12-retryfailure-model)
13. [Label Architecture](#13-label-architecture)
14. [Address Validation](#14-address-validation)
15. [Shipping Method/Provider Mapping](#15-shipping-methodprovider-mapping)
16. [Manual Provider Compatibility](#16-manual-provider-compatibility)
17. [Module Dependency Analysis](#17-module-dependency-analysis)
18. [API Proposal](#18-api-proposal)
19. [Web/Mobile Scope](#19-webmobile-scope)
20. [Migration Proposal](#20-migration-proposal)
21. [Security Model](#21-security-model)
22. [Test Strategy](#22-test-strategy)
23. [Identified Gaps](#23-identified-gaps)
24. [Required Architecture Decisions](#24-required-architecture-decisions)
25. [Recommended Implementation Sequence](#25-recommended-implementation-sequence)

---

## 1. Executive Summary

### 1.1 Purpose

This audit determines whether the existing M7.2 shipping architecture can safely support external carriers (Aramex, SMSA, or similar providers) without breaking the manual driver delivery workflow established in M7.2.1 and hardened in M7.2.2.

### 1.2 Overall Assessment

| Area | Verdict |
|------|---------|
| Provider abstraction (interface/registry) | **PASS WITH GAPS** — Extension points exist but need enrichment |
| Data model (shipments) | **GAP** — Missing carrier shipment ID, idempotency key, retry/cancel state |
| Data model (shipping_methods) | **GAP** — No `shipping_provider_key` column to bind methods to carriers |
| Credential storage | **GAP** — No secure secret storage infrastructure exists |
| Multi-tenant carrier config | **DECISION REQUIRED** — Org-level vs store-level ownership |
| Transactional outbox | **PASS WITH CHANGE** — Outbox exists but dispatcher is log-only; needs a consumer |
| Storage (labels) | **PASS** — S3-compatible StorageService can store carrier labels |
| Tracking / events | **PASS WITH GAPS** — shipment_events append-only trail is sufficient; needs carrier metadata |
| Webhook dedup | **PASS WITH GAPS** — `carrier_webhook_events` table exists with correct UNIQUE constraint; needs security infrastructure |
| Shipment state machine | **PASS** — Existing lifecycle accommodates carrier statuses with mapping |
| Manual provider compatibility | **PASS** — ManualDeliveryProvider is isolated and side-effect-free |
| Module dependencies | **PASS** — Unidirectional: OrdersModule → ShippingModule, no cycles |
| Realtime notifications | **PASS** — RealtimeGateway has order-room emits; extensible for carrier tracking |
| Rate limiting | **GAP** — ThrottlerModule registered but ThrottlerGuard not globally applied |

### 1.3 Key Findings

- **6 critical gaps** must be resolved before external carrier integration
- **4 architecture decisions** are required from the project owner
- **0 blocking issues** — the existing foundation is sound
- **1 new migration** (0043) will be needed
- The manual driver workflow (M7.1/M7.2.1/M7.2.2) is fully isolated and will not be disrupted

### 1.4 Classification Legend

| Tag | Meaning |
|-----|---------|
| **PASS** | Existing infrastructure supports the requirement |
| **GAP** | Missing infrastructure — must be built |
| **NEEDS CHANGE** | Exists but requires modification |
| **DECISION REQUIRED** | Architecture choice needed before implementation |
| **DEFERRED** | Acknowledged but postponed to a later milestone |

---

## 2. Current Architecture

### 2.1 Module Topology

```
ShippingModule (standalone)
├── ShippingProviderRegistry        — Map<string, ShippingProvider>
├── ShippingService                 — CRUD, estimates, checkout validation, provider delegation
├── ShippingController              — 17 REST endpoints (methods, zones, associations, providers)
├── ManualDeliveryProvider          — Default provider (type=MANUAL, key=manual-driver)
└── shipping-cost.resolver.ts       — Pure fee calculation + zone matching

OrdersModule → imports ShippingModule
├── OrdersService.createShipment()  — Creates shipment record on order acceptance
├── OrdersService.fulfillmentTransition() — Shipment status updates
└── 9 outbox.publish() calls        — Various order lifecycle events

Global Infrastructure (available to all modules):
├── DatabaseService                 — Drizzle ORM on PostgreSQL
├── OutboxDispatcher                — Transactional outbox (polls every 1s, 5 retry max)
├── StorageService                  — S3-compatible (putObject, presigned URLs, bucket allowlist)
├── RealtimeGateway                 — Socket.IO at /realtime (rooms: user, org, order)
└── RedisService                    — Caching, token denylist
```

### 2.2 Shipment Lifecycle (Current)

```
PREPARING → READY → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
                                                                              ↘ DISPUTED (≤72h)
Any of PREPARING..READY → CANCELLED
```

State transitions are enforced by `OrdersService.TRANSITIONS` map with optimistic locking (`UPDATE WHERE status = X RETURNING`).

### 2.3 Existing Provider Abstraction

```typescript
// shipping-provider.ts — Abstract base class
abstract class ShippingProvider {
  abstract type: 'MANUAL' | 'CARRIER';
  abstract key: string;
  abstract name: string;
  abstract capabilities: ProviderCapabilities;
  abstract createShipment(req: CreateShipmentRequest): Promise<CreateShipmentResult>;
  async cancelShipment(shipmentId: string): Promise<void> { /* no-op default */ }
  async generateLabel(shipmentId: string): Promise<string | null> { return null; }
  async getTrackingInfo(trackingId: string): Promise<Record<string, unknown> | null> { return null; }
  async validateAddress(address: ShippingAddress): Promise<boolean> { return true; }
  mapCarrierStatus(carrierStatus: string): CarrierStatusMapping | null { return null; }
}
```

---

## 3. Provider Abstraction Audit

### 3.1 ShippingProvider Interface

| Capability | Method | Current State | Verdict |
|------------|--------|---------------|---------|
| Create shipment | `createShipment()` | Abstract — must implement | **PASS** |
| Cancel shipment | `cancelShipment()` | No-op default | **NEEDS CHANGE** — Must throw if not supported |
| Generate label | `generateLabel()` | Returns `null` default | **PASS** — External providers override |
| Tracking | `getTrackingInfo()` | Returns `null` default | **NEEDS CHANGE** — Return type too loose |
| Address validation | `validateAddress()` | Returns `true` default | **PASS** — External providers override |
| Carrier status mapping | `mapCarrierStatus()` | Returns `null` default | **NEEDS CHANGE** — Must be stricter |
| Receive webhooks | `capabilities.canReceiveWebhooks` | Boolean flag exists | **PASS** |

### 3.2 CreateShipmentRequest — GAP ANALYSIS

**Current fields:**
```typescript
interface CreateShipmentRequest {
  shipmentId: string;
  orderId: string;
  storeId: string;
  deliveryAddress: ShippingAddress;
  shippingMethodType?: ShippingMethodType;
  metadata?: Record<string, unknown>;
}
```

**Missing for external carriers:**

| Field | Required By | Verdict |
|-------|-------------|---------|
| `senderAddress` | Aramex, SMSA — require origin address | **GAP** |
| `weightGrams` | All carriers — rate calculation | **GAP** |
| `dimensionsCm` | Most carriers — volumetric weight | **GAP** |
| `packageCount` | Most carriers — multi-parcel | **GAP** |
| `codAmountMinor` | COD orders — cash on delivery | **GAP** |
| `currency` | International carriers | **GAP** |
| `idempotencyKey` | All carriers — duplicate prevention | **GAP** |
| `serviceType` | Carrier-specific service level | **GAP** |
| `declaredValueMinor` | Insurance/customs | **GAP** |

**Verdict:** `CreateShipmentRequest` is **INSUFFICIENT** for external carriers. Must be extended.

### 3.3 CreateShipmentResult — GAP ANALYSIS

**Current fields:**
```typescript
interface CreateShipmentResult {
  providerKey: string;
  trackingId?: string;
  labelUrl?: string;
  metadata?: Record<string, unknown>;
}
```

**Missing:**

| Field | Purpose | Verdict |
|-------|---------|---------|
| `carrierShipmentId` | External carrier's shipment reference | **GAP** |
| `carrierStatus` | Initial carrier status | **GAP** |
| `estimatedDeliveryDate` | Carrier-provided ETA | **GAP** |
| `labelData` | Base64 label binary (if not URL) | **GAP** |
| `labelFormat` | PDF/ZPL/PNG format identifier | **GAP** |
| `rateQuote` | Carrier's quoted cost | **GAP** |

### 3.4 ShippingProviderRegistry

**Current state:**
- `Map<string, ShippingProvider>` — in-memory, static registration
- `register(provider, asDefault)` — called during `onModuleInit`
- `getProvider(key)` — throws on unknown key
- `getDefaultProvider()` — returns manual-driver

**Assessment for M7.2.3:**

| Concern | Verdict |
|---------|---------|
| Static registration sufficient? | **PASS** — Providers are known at boot, not dynamic |
| Credential injection | **GAP** — Registry has no concept of credentials; providers need them |
| Provider health/status | **DEFERRED** — No health monitoring; acceptable for initial carrier support |
| Multiple providers simultaneously | **PASS** — Map supports N providers |
| Provider selection per shipment | **PASS** — `createShipment(request, providerKey)` already supports explicit selection |

### 3.5 ManualDeliveryProvider

**Verdict: PASS** — Fully isolated, deterministic, no external calls. Will continue working unchanged.

```typescript
type = 'MANUAL'
key = 'manual-driver'
capabilities = { canCreateShipment: true, everything_else: false }
createShipment() → { providerKey, metadata: { shipmentId, orderId, storeId } }
```

---

## 4. Data Model Audit

### 4.1 shipments Table

**Current columns (relevant to carrier integration):**

| Column | Type | Status | Verdict |
|--------|------|--------|---------|
| `id` | UUID PK | Exists | **PASS** |
| `order_id` | UUID FK → orders | Exists, UNIQUE | **PASS** |
| `store_id` | UUID FK → stores | Exists | **PASS** |
| `status` | VARCHAR(24) | Exists, default 'PREPARING' | **PASS** |
| `delivery_address` | JSONB | Exists | **PASS** — Address snapshot |
| `carrier_tracking_id` | VARCHAR(120) | Exists | **PASS** |
| `shipping_method_id` | UUID | Exists, nullable | **PASS** |
| `shipping_provider_key` | VARCHAR(40) | Exists | **PASS** |
| `metadata` | JSONB | Exists | **PASS** — Can store carrier response temporarily |

**Missing columns:**

| Column | Purpose | Verdict |
|--------|---------|---------|
| `carrier_shipment_id` | External carrier's shipment reference (e.g., Aramex AWB) | **GAP** |
| `idempotency_key` | Prevents duplicate carrier create requests | **GAP** |
| `carrier_status_raw` | Last raw carrier status (before mapping) | **GAP** |
| `carrier_status_mapped` | Last mapped SCS status from carrier | **GAP** |
| `last_carrier_sync_at` | When the last carrier status was received | **GAP** |
| `carrier_create_attempted_at` | When carrier API was last called | **GAP** |
| `carrier_create_status` | PENDING/SUCCESS/FAILED — tracks API call outcome | **GAP** |
| `carrier_create_error` | Last error from carrier API | **GAP** |
| `carrier_create_retries` | Number of retry attempts | **GAP** |
| `cancelled_at` | When shipment was cancelled (carrier-side) | **GAP** |
| `cancellation_reason` | Why cancelled | **GAP** |

### 4.2 shipment_events Table

**Current structure:**
```
id, shipmentId, eventType, actorUserId, actorType, locationText, notes, metadata (JSONB), sequence (SERIAL), createdAt
```

**Verdict: PASS WITH GAPS**

- Append-only design is correct for carrier tracking events
- SERIAL sequence provides deterministic ordering (learned from M7.1 bug)
- `metadata` JSONB can carry raw carrier event data
- `actorType` should support 'CARRIER' or 'SYSTEM' for webhook-driven events
- `locationText` can carry carrier-provided location

**Missing:**

| Field | Purpose | Verdict |
|-------|---------|---------|
| `externalEventId` | Carrier's event ID for deduplication | **GAP** — prevent duplicate webhook processing |
| `carrierEventCode` | Raw carrier event code (e.g., 'SH004') | **GAP** — audit trail |

### 4.3 shipping_methods Table

**Verdict: GAP**

| Concern | Current | Needed | Verdict |
|---------|---------|--------|---------|
| Provider binding | `carrier_type` = MERCHANT/EXTERNAL | `shipping_provider_key` column | **GAP** |
| Carrier service code | Not present | `carrier_service_code` for carrier API | **GAP** |

**Current `carrier_type` values:** 'MERCHANT' (default), presumably 'EXTERNAL' for carriers.  
**Problem:** No way to know *which* external carrier handles a method. A shipping method with `carrier_type = 'EXTERNAL'` has no link to a registered provider.

### 4.4 carrier_webhook_events Table

**Current structure:**
```
id, providerKey, eventType, externalDeliveryId, shipmentId, payload (JSONB), processed, receivedAt
UNIQUE(provider_key, external_delivery_id)
```

**Verdict: PASS WITH GAPS**

- UNIQUE constraint on (provider_key, external_delivery_id) is correct for dedup
- `payload` JSONB stores raw carrier data
- `processed` boolean tracks whether the event was handled

**Missing:**

| Field | Purpose | Verdict |
|-------|---------|---------|
| `signatureValid` | Whether HMAC signature was verified | **GAP** |
| `rawBody` | Raw HTTP body for audit (before JSON parse) | **GAP** |
| `httpStatusCode` | Response code returned to carrier | **GAP** |
| `processedAt` | When the event was processed | **GAP** |
| `processingError` | Error if processing failed | **GAP** |
| `replayDetected` | Whether this was a duplicate replay attempt | **GAP** |

### 4.5 shipment_labels Table

**Verdict: PASS**

Current structure supports carrier-generated labels:
- `storageKey` — S3 object key for the label file
- `mimeType` — PDF/image content type
- `sizeBytes` — file size
- `trackingUrl` — carrier tracking URL
- `labelNumber` — can store carrier label reference

**Minor gap:** No `providerKey` column to identify which provider generated the label. The spec mentions this field but it's absent from the current schema. **DEFERRED** — can be added in migration 0043.

---

## 5. Credential Architecture

### 5.1 Current State

**No secure secret storage infrastructure exists.** The codebase stores:
- Database credentials via environment variables
- S3 credentials via environment variables
- JWT secrets via environment variables
- SMS provider credentials via environment variables (stubbed)

There is **no** encrypted-at-rest secret store, no vault integration, no per-tenant credential management.

### 5.2 What Must NOT Store Credentials

| Location | Why Not |
|----------|---------|
| `shipping_methods.metadata` | Accessible to merchants via API — credential leak |
| `shipments.metadata` | Accessible to buyers via tracking endpoints |
| Source code / env files | Platform-wide — not per-tenant |
| Frontend configuration | Exposed to browser |
| Ordinary JSONB fields | No encryption, no access control differentiation |

### 5.3 Recommended Design: `carrier_credentials` Table

```sql
CREATE TABLE carrier_credentials (
  id              UUID PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),  -- tenant boundary
  provider_key    VARCHAR(40) NOT NULL,                         -- 'aramex', 'smsa', etc.
  environment     VARCHAR(16) NOT NULL DEFAULT 'sandbox',       -- sandbox | production
  label           VARCHAR(120) NOT NULL,                        -- "Aramex Production"
  -- Encrypted fields (application-level AES-256-GCM):
  credentials_encrypted BYTEA NOT NULL,                         -- JSON blob: { apiKey, accountNumber, ... }
  -- Configuration:
  endpoint_url    VARCHAR(500),                                 -- carrier API base URL
  webhook_secret_encrypted BYTEA,                               -- HMAC verification secret
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An org can have at most one credential set per provider per environment
CREATE UNIQUE INDEX uq_carrier_creds_org_provider_env
  ON carrier_credentials(org_id, provider_key, environment)
  WHERE is_active = true;

-- Never expose this table to merchant read endpoints
```

### 5.4 Encryption Strategy

**Verdict: GAP — Must be built**

- Use Node.js `crypto.createCipheriv('aes-256-gcm', ...)` with a master key from environment
- Master key: `CARRIER_CREDENTIALS_MASTER_KEY` env var (32 bytes, hex-encoded)
- Encrypt before INSERT, decrypt after SELECT — application-level encryption
- The encrypted blob contains provider-specific fields:
  - Aramex: `{ apiKey, accountNumber, country, entity }`
  - SMSA: `{ clientId, clientSecret, apiKey }`
  - Generic: `{ username, password, apiKey }`

### 5.5 Credential Access Pattern

```
ShippingProvider.createShipment()
  ↓
ShippingService.getCredentials(orgId, providerKey, environment)
  ↓
Decrypt credentials_encrypted
  ↓
Pass to provider instance (in-memory only, never persisted elsewhere)
```

### 5.6 Summary

| Aspect | Verdict |
|--------|---------|
| Secure credential storage | **GAP** — Must build `carrier_credentials` table + encryption |
| Per-tenant isolation | **GAP** — Must enforce org-level access control |
| Environment separation | **GAP** — sandbox vs production |
| Credential rotation | **DEFERRED** — Manual for initial implementation |
| Audit trail | **PASS** — Existing `audit_logs` can log credential CRUD (without values) |

---

## 6. Multi-Tenant Model

### 6.1 Tenant Hierarchy Analysis

The SCS marketplace has three tenant levels:
- **Platform** — operates the infrastructure
- **Organization** — merchant company (WHOLESALEr, RETAILER, etc.)
- **Store** — belongs to an organization, sells products

### 6.2 Carrier Configuration Ownership

**DECISION REQUIRED:** At which level should carrier integrations be configured?

| Option | Pros | Cons |
|--------|------|------|
| **Platform-level** | Simplest — one Aramex account for all | All merchants share same carrier account; no merchant-specific rates |
| **Organization-level** (RECOMMENDED) | Each org has own carrier contract; natural credential boundary | Org with multiple stores must configure per-store separately or share org-level config |
| **Store-level** | Most flexible | Credential proliferation; harder to manage; merchant could misconfigure |

### 6.3 Recommendation: Organization-Level with Store Override

```
carrier_credentials (org_id, provider_key, environment)
  ↓
carrier_configurations (org_id, provider_key, store_id NULLABLE)
  ├── store_id = NULL → org-wide default config
  └── store_id = 'xxx' → store-specific override
```

- **Credentials** are always org-level (one Aramex account per org)
- **Configuration** (default service type, pickup location, etc.) can be org-wide or store-specific
- **Tenant boundary:** `assertStoreInOrg()` already enforces store → org; credential access must add `assertOrgForCredentials()` check

### 6.4 Tenant Isolation Rules

| Rule | Enforcement |
|------|-------------|
| Merchant A cannot read Merchant B's carrier credentials | `assertOrgForCredentials(orgId, caller)` |
| Merchant cannot access platform-level credentials | No platform-level credentials exist |
| Carrier webhook cannot spoof tenant | Resolve tenant from `shipment → store → org`, not from webhook payload |
| Admin can manage all credentials | `isTenantPrivileged()` bypass for SUPER_ADMIN/ADMIN |

### 6.5 Summary

| Aspect | Verdict |
|--------|---------|
| Tenant model clarity | **DECISION REQUIRED** — Org-level recommended |
| Existing tenant infrastructure | **PASS** — `assertStoreInOrg()`, `CallerContext`, BYPASS_ROLES |
| Credential tenant isolation | **GAP** — Must build `assertOrgForCredentials()` |
| Cross-tenant webhook safety | **GAP** — Must resolve tenant from shipment, not webhook data |

---

## 7. Shipment Creation Architecture

### 7.1 Current Flow

```
OrdersService.acceptOrder()
  ↓
  createShipment(orderId, storeId, actorUserId)
    ↓
    INSERT shipments (status=PREPARING, deliveryAddress, shippingMethodId)
    INSERT shipment_events (eventType=PREPARING)
    ↓
    return shipmentId
```

**Key observation:** `createShipment()` currently creates a **database record only**. It does NOT call any provider. The `shippingProviderKey` column is never set during creation.

### 7.2 Required Flow for External Carriers

```
OrdersService.acceptOrder()
  ↓
  [DB Transaction]
    INSERT shipments (status=PREPARING, providerKey from shipping method)
    INSERT shipment_events (eventType=PREPARING)
    INSERT outbox_events (eventType='shipping.carrier.create', status=PENDING)
  [COMMIT]
  
  ↓ (asynchronous — OutboxDispatcher polls)
  
  ShippingCarrierWorker.processEvent()
    ↓
    Load shipment + resolve provider
    ↓
    Load carrier credentials (decrypt)
    ↓
    Build carrier API request (normalize address, weight, etc.)
    ↓
    HTTP POST to carrier API (with idempotency key)
    ↓
    [Success]:
      UPDATE shipments SET carrier_shipment_id, carrier_tracking_id, carrier_status_raw='CREATED'
      INSERT shipment_events (eventType='LABEL_CREATED', metadata={carrierResponse})
      UPDATE outbox_events SET status='DISPATCHED'
    ↓
    [Failure — retryable]:
      UPDATE outbox_events SET attempts=attempts+1 (stays PENDING)
    ↓
    [Failure — non-retryable]:
      UPDATE shipments SET carrier_create_status='FAILED', carrier_create_error=...
      UPDATE outbox_events SET status='FAILED'
```

### 7.3 Critical Constraint: No External HTTP in DB Transaction

**Verdict: PASS** — The proposed architecture correctly separates:
1. **Synchronous DB transaction** — creates shipment record + outbox event
2. **Asynchronous worker** — calls carrier API after commit

This prevents carrier API latency/timeout from holding a PostgreSQL connection open.

### 7.4 Provider Selection at Shipment Creation

The provider must be determined at shipment creation time, not at carrier-API-call time:

```
shipping_methods.shipping_provider_key → determines which provider handles this method
shipments.shipping_provider_key ← copied from shipping method at creation
```

**Verdict: GAP** — `shipping_methods` currently lacks `shipping_provider_key`.

---

## 8. Outbox/Worker Integration

### 8.1 Current Outbox Infrastructure

**OutboxDispatcher** (`common/outbox/outbox-dispatcher.service.ts`):
- Polls `outbox_events` every 1 second
- Fetches up to 10 PENDING events (oldest first)
- `dispatch()` currently **only logs** — "In production, this would publish to an event bus"
- Marks DISPATCHED on success, FAILED after 5 attempts
- `publish(eventType, aggregateId, payload, metadata)` — called from domain services

**outbox_events table:**
```
id, eventType, aggregateId, payload (JSONB), metadata (JSONB),
status (PENDING/DISPATCHED/FAILED), attempts, lastError, dispatchedAt, createdAt
```

### 8.2 Assessment for M7.2.3

| Aspect | Current | Needed | Verdict |
|--------|---------|--------|---------|
| Outbox write from domain service | `publish()` exists | Same | **PASS** |
| Event polling | 1s interval | Same | **PASS** |
| Retry with backoff | 5 attempts, no backoff | Exponential backoff | **NEEDS CHANGE** |
| Event-type routing | Single dispatcher, logs only | Type-specific consumers | **GAP** |
| Idempotent processing | Not needed (log only) | Must be idempotent for carrier calls | **GAP** |

### 8.3 Required Changes

**Option A (Recommended): Event-type consumer pattern**

Add a `ShippingCarrierWorker` service that:
1. Polls `outbox_events` for `eventType LIKE 'shipping.carrier.%'` AND `status = 'PENDING'`
2. Processes carrier-specific logic
3. Marks DISPATCHED/FAILED

This runs alongside the existing OutboxDispatcher (which continues to handle other event types).

**Option B: Extend OutboxDispatcher with handlers map**

```typescript
private handlers: Map<string, (event) => Promise<void>> = new Map();
registerHandler(eventTypePattern: string, handler: Function) { ... }
```

**Recommendation:** Option A — separate worker. Avoids coupling carrier logic to the generic dispatcher. Follows the existing pattern where each concern has its own service.

### 8.4 New Event Types

| Event Type | When Published | Consumer |
|------------|---------------|----------|
| `shipping.carrier.create` | Shipment created with external provider | ShippingCarrierWorker |
| `shipping.carrier.cancel` | Shipment cancellation requested | ShippingCarrierWorker |
| `shipping.carrier.label` | Label generation requested | ShippingCarrierWorker |
| `shipping.carrier.track` | Tracking refresh requested | ShippingCarrierWorker |

### 8.5 Summary

| Aspect | Verdict |
|--------|---------|
| Outbox write infrastructure | **PASS** |
| Outbox polling infrastructure | **PASS** |
| Event-type-specific consumer | **GAP** — Must build ShippingCarrierWorker |
| Exponential backoff | **GAP** — Current retry has no delay |
| Idempotent carrier call | **GAP** — Must use idempotency keys |

---

## 9. Tracking Architecture

### 9.1 Current Tracking Flow

```
OrdersService.getTracking(masterOrderId, buyerId)
  ↓
  For each sub-order:
    Get shipment
    Get shipment_events (ordered by sequence)
    Return { orderId, status, shipment: { events: [...] } }
```

### 9.2 Carrier Tracking Requirements

| Requirement | Current Support | Verdict |
|-------------|----------------|---------|
| Carrier tracking number | `shipments.carrier_tracking_id` exists | **PASS** |
| Provider shipment ID | Not stored | **GAP** — Need `carrier_shipment_id` |
| Normalized status | `shipments.status` (SCS lifecycle) | **PASS** |
| Raw carrier status | Not stored separately | **GAP** — Need `carrier_status_raw` |
| Tracking events | `shipment_events` (append-only, SERIAL order) | **PASS** |
| Event timestamps | `shipment_events.createdAt` | **PASS** |
| Event location | `shipment_events.locationText` | **PASS** |
| Raw carrier event data | `shipment_events.metadata` JSONB | **PASS** |
| External event dedup | Not tracked | **GAP** — Need `externalEventId` on events |
| Carrier event code | Not tracked | **GAP** — Need `carrierEventCode` on events |

### 9.3 Tracking Event Ingestion (Webhook → shipment_events)

```
Carrier webhook POST /v1/webhooks/carrier/:providerKey
  ↓
  Verify HMAC signature
  ↓
  Extract externalDeliveryId
  ↓
  Check carrier_webhook_events UNIQUE(provider_key, external_delivery_id)
    → Duplicate? Return 200 (idempotent)
  ↓
  Resolve shipment: external_delivery_id → carrier_shipment_id → shipment
  ↓
  Map carrier status → SCS status via provider.mapCarrierStatus()
  ↓
  Validate SCS state transition (assertTransition equivalent)
  ↓
  [DB Transaction]
    INSERT shipment_events (eventType=mapped, metadata={rawCarrierEvent}, actorType='CARRIER')
    UPDATE shipments SET status=mapped, carrier_status_raw=raw, last_carrier_sync_at=now()
    INSERT carrier_webhook_events (dedup record)
  [COMMIT]
  ↓
  Emit realtime event: order:updated
```

### 9.4 Append-Only Guarantee

Carrier events MUST be append-only. The `shipment_events` table already supports this:
- No UPDATE/DELETE operations on this table in current code
- SERIAL sequence ensures deterministic ordering
- Each carrier webhook creates a new event row

**Verdict: PASS** — Existing design is correct for carrier tracking.

---

## 10. Webhook Architecture

### 10.1 Current State

**`carrier_webhook_events` table exists** (migration 0041):
```sql
CREATE TABLE carrier_webhook_events (
  id UUID PRIMARY KEY,
  provider_key VARCHAR(40) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  external_delivery_id VARCHAR(200) NOT NULL,
  shipment_id UUID REFERENCES shipments(id),
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_carrier_webhook_dedup
  ON carrier_webhook_events(provider_key, external_delivery_id);
```

**No webhook endpoint exists** in `ShippingController` — the table was created in anticipation of M7.2.3.

### 10.2 Required Endpoint

```
POST /v1/webhooks/carrier/:providerKey
```

This endpoint must:
1. **NOT** require JWT authentication (carriers don't have SCS tokens)
2. Verify HMAC signature instead
3. Parse carrier-specific payload
4. Resolve tenant from `shipment → store → org` (not from request body)

### 10.3 Webhook Processing Pipeline

```
HTTP POST → Rate limit (per provider_key)
  ↓
Signature verification (HMAC-SHA256 with provider's webhook secret)
  ↓
Timestamp validation (reject if X-Timestamp > 5 minutes old)
  ↓
Parse payload → extract externalDeliveryId, eventType, status
  ↓
Idempotency check: INSERT INTO carrier_webhook_events ... ON CONFLICT DO NOTHING
  → If conflict: return 200 (already processed)
  ↓
Resolve shipment: lookup by carrier_shipment_id + provider_key
  → Not found? Log + return 200 (don't crash carrier retry)
  ↓
Map carrier status → SCS status via provider.mapCarrierStatus()
  → Unknown mapping? Log warning + return 200
  ↓
Validate SCS state transition
  → Invalid transition? Log + return 200 (don't mutate to invalid state)
  ↓
Process: INSERT shipment_event, UPDATE shipment status
  ↓
Mark carrier_webhook_event as processed
  ↓
Emit realtime notification
  ↓
Return 200 OK
```

### 10.4 Assessment

| Aspect | Current | Verdict |
|--------|---------|---------|
| Dedup table | `carrier_webhook_events` with UNIQUE | **PASS** |
| Endpoint | Not implemented | **GAP** |
| HMAC verification | Not implemented | **GAP** |
| Timestamp/replay protection | Not implemented | **GAP** |
| Tenant resolution from shipment | Not implemented | **GAP** |
| Raw payload storage | `payload JSONB` column exists | **PASS** |
| Processing status | `processed BOOLEAN` exists | **PASS** |
| Error tracking | Not tracked | **GAP** |

---

## 11. Idempotency Design

### 11.1 The Duplicate Shipment Problem

```
Same SCS shipment
     ↓
Carrier create request #1 (idempotency_key = SCS shipment ID)
     ↓
Carrier accepts, starts processing
     ↓
Network timeout — SCS doesn't receive response
     ↓
Outbox retry → Carrier create request #2 (same idempotency_key)
     ↓
Carrier must return the SAME shipment, not create a duplicate
```

### 11.2 SCS-Side Idempotency Strategy

**Idempotency key = SCS shipment ID**

Every carrier create request includes:
```
Idempotency-Key: {shipments.id}
```

This is stable, unique, and deterministic. If the carrier supports idempotency keys (most do via a reference field), this prevents duplicates at the carrier level.

### 11.3 SCS-Side Duplicate Detection

| Check | Mechanism |
|-------|-----------|
| Prevent double-create from outbox | `shipments.carrier_create_status` = 'SUCCESS' → skip |
| Prevent concurrent create | `SELECT ... FOR UPDATE` on shipment row |
| Carrier returns existing shipment | Match `carrier_shipment_id` → already linked |

### 11.4 For Carriers WITHOUT Idempotency Support

**DECISION REQUIRED:** Some carriers may not support idempotency keys.

**Strategy:**
1. Set `carrier_create_status = 'IN_PROGRESS'` before calling carrier API
2. If timeout: do NOT retry immediately. Instead, call carrier's tracking/lookup API with the SCS reference
3. If carrier has a matching shipment → link it (don't create new)
4. If no match → safe to retry create

### 11.5 Webhook Idempotency

Already covered by `carrier_webhook_events` UNIQUE constraint:
```sql
UNIQUE(provider_key, external_delivery_id)
```

Duplicate webhook → INSERT conflict → return 200 → carrier stops retrying.

### 11.6 Summary

| Aspect | Verdict |
|--------|---------|
| SCS idempotency key strategy | **PASS** — Shipment ID is stable and unique |
| Carrier-side idempotency | **DECISION REQUIRED** — Varies by carrier |
| Outbox double-processing prevention | **GAP** — Need `carrier_create_status` state machine |
| Webhook dedup | **PASS** — UNIQUE constraint exists |
| Concurrent create prevention | **GAP** — Need optimistic locking on shipment |

---

## 12. Retry/Failure Model

### 12.1 Error Classification

| Error Type | HTTP Code | Retryable? | Action |
|------------|-----------|------------|--------|
| Network timeout | N/A | **YES** | Exponential backoff |
| DNS resolution failure | N/A | **YES** | Exponential backoff |
| TLS handshake failure | N/A | **YES** (brief) | Retry 3x, then alert |
| Bad request | 400 | **NO** | Log + mark FAILED |
| Unauthorized | 401/403 | **NO** | Credential issue — alert admin |
| Conflict (duplicate) | 409 | **MAYBE** | Lookup existing shipment |
| Rate limited | 429 | **YES** | Respect `Retry-After` header |
| Server error | 500 | **YES** | Exponential backoff |
| Service unavailable | 503 | **YES** | Exponential backoff |
| Gateway timeout | 504 | **YES** | Exponential backoff |
| Malformed response | N/A | **NO** | Log raw response + FAILED |
| Carrier unavailable | N/A | **YES** | Circuit breaker pattern |
| Response lost (accept but no response) | N/A | **MAYBE** | Lookup by idempotency key |

### 12.2 Backoff Strategy

```
Attempt 1: immediate
Attempt 2: 30 seconds
Attempt 3: 2 minutes
Attempt 4: 10 minutes
Attempt 5: 1 hour (max — then FAILED)
```

Formula: `min(baseDelay * 2^(attempt-1), maxDelay)` with jitter.

### 12.3 Integration with Outbox

The existing outbox has `attempts` (integer) and `lastError` (text) columns.

**Needed changes:**
- Add `nextAttemptAt TIMESTAMPTZ` column to `outbox_events` for delayed retry
- Current poll: `WHERE status = 'PENDING'` → must add `AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())`
- Current max 5 attempts → configurable per event type

### 12.4 Dead-Letter / Failure Handling

After 5 failed attempts:
1. `outbox_events.status = 'FAILED'`
2. `shipments.carrier_create_status = 'FAILED'`
3. `shipments.carrier_create_error = lastError`
4. Emit notification to merchant: "Carrier shipment creation failed for order #xxx"
5. Merchant can manually retry via `POST /v1/shipments/:id/create`

### 12.5 Summary

| Aspect | Verdict |
|--------|---------|
| Error classification | **DEFERRED** — Design complete, implementation later |
| Exponential backoff | **GAP** — Outbox has no delay mechanism |
| Max retry count | **PASS** — 5 attempts exists |
| Dead-letter handling | **GAP** — Must notify merchant on failure |
| Circuit breaker | **DEFERRED** — Not needed for initial implementation |

---

## 13. Label Architecture

### 13.1 Current Infrastructure

**StorageService** (`common/storage/storage.service.ts`):
- S3-compatible (Backblaze B2 / MinIO)
- `putObject(bucket, key, body, contentType)` — upload
- `createPresignedGetUrl(bucket, key, expiry)` — download (15-min max)
- `createPresignedPutUrl(bucket, key, contentType, expiry)` — direct upload
- Bucket allowlist: `scs-media`, `scs-uploads`

**shipment_labels table:**
```
id, shipmentId (unique), labelNumber, storageKey, mimeType, sizeBytes, trackingUrl, createdAt
```

### 13.2 Carrier Label Flow

```
ShippingCarrierWorker (after successful carrier create)
  ↓
  Carrier returns label as base64 PDF/PNG
  ↓
  StorageService.putObject({
    bucket: 'scs-uploads',
    key: 'labels/{shipmentId}/{labelId}/label.pdf',
    body: Buffer.from(labelBase64, 'base64'),
    contentType: 'application/pdf',
  })
  ↓
  INSERT shipment_labels ({
    shipmentId, storageKey, mimeType, sizeBytes, labelNumber, trackingUrl
  })
  ↓
  Merchant requests download:
    POST /v1/shipments/:id/labels/:labelId/presign
    → createPresignedGetUrl('scs-uploads', storageKey, 900)
    → Return 15-min presigned URL
```

### 13.3 Assessment

| Aspect | Current | Verdict |
|--------|---------|---------|
| S3 storage for labels | StorageService exists | **PASS** |
| Presigned download URLs | `createPresignedGetUrl` exists | **PASS** |
| Label metadata table | `shipment_labels` exists | **PASS** |
| Bucket for labels | `scs-uploads` is allowed | **PASS** |
| Key pattern | Not enforced | **DEFERRED** — Convention, not enforcement |
| Label voiding | Not implemented | **GAP** — Need `is_void` column |
| Multiple labels per shipment | `shipmentId` is UNIQUE | **NEEDS CHANGE** — Should allow multiple labels |

### 13.4 Critical Issue: shipment_labels.shipmentId is UNIQUE

The current schema has `shipmentId: uuid().notNull().references(() => shipments.id)` with a **unique** constraint implied by the 1:1 design.

For external carriers, a shipment may have **multiple labels** (reprint, different formats, return label). This must change to allow N labels per shipment.

**Migration 0043 must:** Drop the UNIQUE constraint on `shipment_labels.shipment_id` (if it exists) and add `is_void BOOLEAN DEFAULT false`.

### 13.5 Security

| Rule | Enforcement |
|------|-------------|
| Credentials not in URL | Presigned URLs use S3 signing, not SCS credentials |
| Tenant isolation | Label access via `shipment → store → org` chain |
| URL expiry | 15-minute hard cap (`MAX_PRESIGN_EXPIRY = 900`) |

### 13.6 Summary

| Aspect | Verdict |
|--------|---------|
| Label storage | **PASS** |
| Label download | **PASS** |
| Multiple labels | **NEEDS CHANGE** — Drop UNIQUE on shipmentId |
| Label voiding | **GAP** — Add `is_void` column |

---

## 14. Address Validation

### 14.1 Current State

- `ShippingProvider.validateAddress()` returns `true` by default
- `matchDeliveryZone()` performs city/postal/region matching against store zones
- Checkout validation (`validateCheckoutSelection()`) checks zone availability

### 14.2 Carrier Address Validation

| Timing | Should Validate? | Reason |
|--------|-----------------|--------|
| Before checkout | **NO** — Too early, carrier may be unavailable | Buyer shouldn't be blocked by carrier API |
| During shipping estimate | **OPTIONAL** — If provider supports it | Can show "address not serviceable" early |
| During carrier shipment creation | **YES** — Carrier validates before accepting | Natural point for validation |
| As provider capability | **YES** — `capabilities.canValidateAddress` | Only if provider supports it |

### 14.3 Design Principle

**Carrier unavailability must NOT corrupt or partially create an SCS order.**

If the carrier's address validation fails during shipment creation:
1. The outbox event is marked FAILED
2. The shipment remains in PREPARING status
3. The merchant is notified
4. The order is NOT affected

### 14.4 Summary

| Aspect | Verdict |
|--------|---------|
| Existing zone matching | **PASS** — Works independently of carrier |
| Provider capability flag | **PASS** — `canValidateAddress` exists |
| Carrier validation at creation | **DEFERRED** — Implementation detail |
| Checkout dependency | **PASS** — Carrier validation is NOT a checkout dependency |

---

## 15. Shipping Method/Provider Mapping

### 15.1 Current State

`shipping_methods` has:
- `carrier_type` VARCHAR(24) DEFAULT 'MERCHANT' — distinguishes manual vs external
- `fulfillment_method` VARCHAR(24) — DELIVERY, PICKUP, etc.
- `type` VARCHAR(24) DEFAULT 'STANDARD' — STANDARD, EXPRESS, etc.
- `key` VARCHAR(60) — store-level unique method identifier

**Missing:** No `shipping_provider_key` column to bind a method to a specific carrier provider.

### 15.2 The Ambiguity Problem

Without `shipping_provider_key`:
```
shipping_method: { carrier_type: 'EXTERNAL', type: 'EXPRESS' }
```
Which carrier handles this? Aramex? SMSA? There's no way to know.

### 15.3 Required Change

**Add `shipping_provider_key VARCHAR(40)` to `shipping_methods`.**

```
STANDARD + carrier_type=MERCHANT  → provider_key = 'manual-driver' (implicit)
EXPRESS  + carrier_type=EXTERNAL → provider_key = 'aramex'
SAME_DAY + carrier_type=EXTERNAL → provider_key = 'smsa'
```

**Resolution order:**
1. `shipping_methods.shipping_provider_key` — explicit binding
2. If NULL and `carrier_type = 'MERCHANT'` → use 'manual-driver'
3. If NULL and `carrier_type = 'EXTERNAL'` → error (ambiguous)

### 15.4 Summary

| Aspect | Verdict |
|--------|---------|
| Method → provider binding | **GAP** — Must add `shipping_provider_key` to `shipping_methods` |
| Default provider fallback | **PASS** — Registry has `getDefaultProvider()` |
| Ambiguity prevention | **GAP** — External methods must specify provider |

---

## 16. Manual Provider Compatibility

### 16.1 Current ManualDeliveryProvider

```typescript
@Injectable()
export class ManualDeliveryProvider extends ShippingProvider {
  readonly type = 'MANUAL';
  readonly key = 'manual-driver';
  readonly capabilities = {
    canCreateShipment: true,
    canCancel: false,
    canGenerateLabel: false,
    canTrack: false,
    canValidateAddress: false,
    canReceiveWebhooks: false,
  };

  async createShipment(request) {
    return {
      providerKey: this.key,
      metadata: { shipmentId, orderId, storeId },
    };
  }
}
```

### 16.2 Compatibility Matrix

| Behavior | M7.2.2 | After M7.2.3 | Verdict |
|----------|--------|-------------|---------|
| Manual shipment creation | `createShipment()` returns provider key | Unchanged | **PASS** |
| Driver assignment | `assignDriver()` on OrdersService | Unchanged — doesn't touch provider | **PASS** |
| Driver pickup/delivery | `pickupOrder()`, `deliverOrder()` | Unchanged — driver FSM | **PASS** |
| No carrier credentials needed | Manual has no external calls | Unchanged | **PASS** |
| No labels | `canGenerateLabel: false` | Unchanged | **PASS** |
| No webhooks | `canReceiveWebhooks: false` | Unchanged | **PASS** |
| Registered as default | `registry.register(manual, true)` | Must REMAIN default | **PASS** |

### 16.3 Risk Assessment

**Risk:** Adding external carriers could accidentally change the default provider.

**Mitigation:** `ManualDeliveryProvider` is registered with `asDefault = true` in `ShippingService.onModuleInit()`. External carriers are registered without `asDefault`. The default only changes if explicitly overridden.

### 16.4 Summary

| Aspect | Verdict |
|--------|---------|
| Manual provider isolation | **PASS** |
| M7.1 behavior preserved | **PASS** |
| M7.2.2 behavior preserved | **PASS** |
| No credential requirement | **PASS** |
| Default provider stability | **PASS** |

---

## 17. Module Dependency Analysis

### 17.1 Current Dependency Graph

```
┌──────────────────────────────────────────────────────────────────┐
│ Global Modules (available everywhere)                            │
│  DatabaseModule, OutboxModule, StorageModule,                    │
│  RealtimeModule, RedisModule                                     │
└──────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────┐
│ ShippingModule│  │OrdersModule│  │Notifications│  │InventoryModule│
│              │  │           │  │Module       │  │              │
│ Exports:     │  │ Imports:  │  │            │  │ No shipping  │
│ ShippingSvc  │◄─│ Shipping  │  │ Exports:   │  │ dependency   │
│ Registry     │  │ Promotions│  │ NotifSvc   │  │              │
│              │  │ Notif.    │  │            │  │              │
└─────────────┘  └───────────┘  └────────────┘  └──────────────┘
```

### 17.2 Dependency Direction

| From | To | Type | Verdict |
|------|----|------|---------|
| OrdersModule | ShippingModule | Explicit import | **PASS** — Correct direction |
| OrdersModule | NotificationsModule | Explicit import | **PASS** |
| OrdersModule | PromotionsModule | Explicit import | **PASS** |
| ShippingModule | OrdersModule | **NOT imported** | **PASS** — No circular dependency |
| ShippingModule | OutboxDispatcher | Global | **PASS** |
| ShippingModule | StorageService | Global | **PASS** |
| ShippingModule | RealtimeGateway | Global | **PASS** |

### 17.3 M7.2.3 Impact

Adding external carrier support requires:

| New Dependency | From | To | Risk |
|----------------|------|----|------|
| ShippingCarrierWorker | ShippingModule | OutboxDispatcher (global) | **NONE** — Already global |
| ShippingCarrierWorker | ShippingModule | StorageService (global) | **NONE** — Already global |
| ShippingCarrierWorker | ShippingModule | NotificationsModule | **GAP** — Must notify merchant on failure |
| ShippingCarrierWorker | ShippingModule | RealtimeGateway (global) | **NONE** — Already global |
| WebhookController | ShippingModule | None new | **NONE** — Uses existing infrastructure |

### 17.4 Critical Rule: No HTTP in OrdersService

**OrdersService must NOT make direct HTTP calls to carrier APIs.**

The correct flow:
```
OrdersService → outbox.publish('shipping.carrier.create') → COMMIT
ShippingCarrierWorker (async) → carrier API call
```

This maintains the transactional outbox pattern and prevents carrier API latency from affecting order processing.

### 17.5 Summary

| Aspect | Verdict |
|--------|---------|
| Circular dependencies | **PASS** — None exist |
| Dependency direction | **PASS** — Orders → Shipping (unidirectional) |
| New worker coupling | **PASS** — Worker is inside ShippingModule |
| Notification on failure | **GAP** — ShippingModule must import NotificationsModule or use outbox |
| HTTP in OrdersService | **PASS** — Not present, must stay that way |

---

## 18. API Proposal

### 18.1 New Endpoints for M7.2.3

| Method | Path | Auth | Permission | Description |
|--------|------|------|-----------|-------------|
| POST | `/v1/shipments/:id/create` | JWT | `fulfillment:shipments:write` | Trigger carrier shipment creation |
| POST | `/v1/shipments/:id/cancel` | JWT | `fulfillment:shipments:write` | Cancel carrier shipment |
| GET | `/v1/shipments/:id/tracking` | JWT | `fulfillment:shipments:read` | Get carrier tracking info |
| GET | `/v1/shipments/:id/labels` | JWT | `fulfillment:labels:read` | List shipment labels |
| POST | `/v1/shipment-labels/:id/presign` | JWT | `fulfillment:labels:read` | Presigned label download |
| POST | `/v1/webhooks/carrier/:providerKey` | HMAC | Public (signature verified) | Carrier inbound webhook |

### 18.2 Endpoint Access Matrix

| Endpoint | Buyer | Merchant | Driver | Admin | Internal |
|----------|-------|----------|--------|-------|----------|
| POST /shipments/:id/create | ✗ | ✓ | ✗ | ✓ | ✓ |
| POST /shipments/:id/cancel | ✗ | ✓ | ✗ | ✓ | ✓ |
| GET /shipments/:id/tracking | ✓ (own) | ✓ | ✓ (assigned) | ✓ | ✓ |
| GET /shipments/:id/labels | ✗ | ✓ | ✓ (assigned) | ✓ | ✓ |
| POST /webhooks/carrier/:key | ✗ | ✗ | ✗ | ✗ | Carrier only |

### 18.3 Webhook Endpoint Design

```
POST /v1/webhooks/carrier/:providerKey
Headers:
  X-Signature: hmac-sha256=...
  X-Timestamp: 2026-09-28T12:00:00Z
  X-Delivery-ID: carrier-unique-delivery-id
  Content-Type: application/json

Body: carrier-specific payload

Response:
  200 OK — always (even on internal errors — don't crash carrier retry)
  401 — invalid signature
  400 — malformed payload
```

### 18.4 Carrier Configuration Endpoints (Admin/Merchant Owner)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/v1/carrier/credentials` | `admin:carrier:read` | List org's carrier credentials (no secrets) |
| POST | `/v1/carrier/credentials` | `admin:carrier:write` | Add carrier credentials |
| PATCH | `/v1/carrier/credentials/:id` | `admin:carrier:write` | Update carrier credentials |
| POST | `/v1/carrier/credentials/:id/deactivate` | `admin:carrier:write` | Deactivate credentials |
| POST | `/v1/carrier/credentials/:id/test` | `admin:carrier:write` | Test carrier connection |

---

## 19. Web/Mobile Scope

### 19.1 Minimum Required UI Changes

#### Merchant Web (Next.js)

| Page | Change | Priority |
|------|--------|----------|
| `/merchant/shipping` | Add carrier selection when creating/editing shipping method | **REQUIRED** |
| `/merchant/shipping` | Add "Carrier Configuration" section (credential management) | **REQUIRED** |
| `/merchant/orders` | Show carrier tracking number on order card | **REQUIRED** |
| `/merchant/orders` | "Create Carrier Shipment" button for READY shipments | **REQUIRED** |
| `/merchant/orders` | "Download Label" button when label exists | **REQUIRED** |
| `/merchant/orders` | "Cancel Shipment" button for carrier shipments | **NICE-TO-HAVE** |

#### Buyer Web (Next.js)

| Page | Change | Priority |
|------|--------|----------|
| `/orders/[id]` | Show carrier name + tracking number | **REQUIRED** |
| `/orders/[id]` | Show normalized tracking events timeline | **REQUIRED** |
| `/orders/[id]` | Link to carrier tracking page (if URL available) | **NICE-TO-HAVE** |

#### Driver Mobile (Flutter)

| Screen | Change | Priority |
|--------|--------|----------|
| Driver shipments | **NO CHANGE** — Carrier shipments bypass driver workflow | **N/A** |
| Driver shipments | Show "Carrier-handled" badge for carrier shipments | **NICE-TO-HAVE** |

#### Merchant Mobile (Flutter)

| Screen | Change | Priority |
|--------|--------|----------|
| Merchant orders | Show carrier tracking number | **REQUIRED** |
| Merchant orders | "Create Carrier Shipment" action | **REQUIRED** |
| Merchant orders | "Download Label" action | **REQUIRED** |

### 19.2 UI Scope Summary

| Platform | Required Changes | Estimated Effort |
|----------|-----------------|-----------------|
| Merchant Web | Carrier config + shipment actions | Medium |
| Buyer Web | Tracking display | Small |
| Driver Mobile | None (carrier bypasses driver) | None |
| Merchant Mobile | Shipment actions | Small |

---

## 20. Migration Proposal

### 20.1 Migration Number: `0043_carrier_integration.sql`

**NOT CREATED YET — PROPOSED CONTENT ONLY**

### 20.2 New Tables

#### `carrier_credentials`

```sql
CREATE TABLE IF NOT EXISTS carrier_credentials (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  provider_key VARCHAR(40) NOT NULL,
  environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
  label VARCHAR(120) NOT NULL,
  credentials_encrypted BYTEA NOT NULL,
  endpoint_url VARCHAR(500),
  webhook_secret_encrypted BYTEA,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_carrier_creds_org_provider_env
  ON carrier_credentials(org_id, provider_key, environment)
  WHERE is_active = true;
```

#### `carrier_configurations`

```sql
CREATE TABLE IF NOT EXISTS carrier_configurations (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  credential_id UUID NOT NULL REFERENCES carrier_credentials(id),
  store_id UUID REFERENCES stores(id),          -- NULL = org-wide
  provider_key VARCHAR(40) NOT NULL,
  default_service_code VARCHAR(40),
  default_package_type VARCHAR(40),
  pickup_address JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_config_org ON carrier_configurations(org_id);
```

### 20.3 New Columns on Existing Tables

#### `shipments`

```sql
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_shipment_id VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_status_raw VARCHAR(80);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_status_mapped VARCHAR(24);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_carrier_sync_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_status VARCHAR(16) DEFAULT 'PENDING';
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_error TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_attempted_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(300);
```

#### `shipping_methods`

```sql
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS shipping_provider_key VARCHAR(40);
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS carrier_service_code VARCHAR(40);
```

#### `shipment_events`

```sql
ALTER TABLE shipment_events ADD COLUMN IF NOT EXISTS external_event_id VARCHAR(200);
ALTER TABLE shipment_events ADD COLUMN IF NOT EXISTS carrier_event_code VARCHAR(40);
```

#### `carrier_webhook_events`

```sql
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS raw_body TEXT;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS processing_error TEXT;
```

#### `outbox_events`

```sql
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
```

### 20.4 New Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_sid ON shipments(carrier_shipment_id)
  WHERE carrier_shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_create_status ON shipments(carrier_create_status)
  WHERE carrier_create_status IN ('PENDING', 'IN_PROGRESS', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt ON outbox_events(next_attempt_at)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_shipment_events_ext ON shipment_events(external_event_id)
  WHERE external_event_id IS NOT NULL;
```

### 20.5 Rollback Considerations

- All changes are additive (new tables, new nullable columns)
- No destructive changes to existing columns
- Rollback = drop new tables + drop new columns (safe, no data loss in existing columns)
- New indexes can be dropped independently

### 20.6 Summary

| Category | Count |
|----------|-------|
| New tables | 2 (carrier_credentials, carrier_configurations) |
| New columns on shipments | 11 |
| New columns on shipping_methods | 2 |
| New columns on shipment_events | 2 |
| New columns on carrier_webhook_events | 4 |
| New columns on outbox_events | 1 |
| New indexes | 7 |
| Unique constraints | 1 (carrier_credentials) |
| Foreign keys | 4 |

---

## 21. Security Model

### 21.1 Webhook Security

| Requirement | Design | Verdict |
|-------------|--------|---------|
| HMAC signature | `X-Signature` header, HMAC-SHA256 | **GAP** — Must implement |
| Timestamp validation | `X-Timestamp`, reject if > 5 min old | **GAP** — Must implement |
| Replay protection | UNIQUE(provider_key, external_delivery_id) | **PASS** — Table exists |
| Provider-specific secrets | `webhook_secret_encrypted` in carrier_credentials | **GAP** — Must implement |
| Request size limits | NestJS body parser limit + explicit check | **GAP** — Must configure |
| Payload validation | Zod schema per provider | **GAP** — Must implement |
| Deduplication | INSERT ON CONFLICT DO NOTHING | **PASS** — UNIQUE constraint |
| Rate limiting | ThrottlerModule (registered, not guarded) | **GAP** — Must apply guard |
| Audit logging | `audit_logs` table | **PASS** — Exists |

### 21.2 Credential Security

| Requirement | Design | Verdict |
|-------------|--------|---------|
| Encryption at rest | AES-256-GCM with master key | **GAP** — Must implement |
| Access control | Org-level + admin only | **GAP** — Must implement |
| Never in API responses | Strip from all responses | **GAP** — Must enforce |
| Never in logs | Redact from log output | **GAP** — Must enforce |
| Never in frontend | No endpoint exposes raw secrets | **GAP** — Must enforce |

### 21.3 Tenant Isolation for Webhooks

**Critical rule:** Do NOT trust carrier-provided storeId/orderId.

```
Carrier webhook → extract externalDeliveryId
  ↓
Lookup shipment by carrier_shipment_id (NOT by any carrier-provided tenant field)
  ↓
shipment.storeId → store → org → verify credentials match provider
  ↓
Only then process the webhook in the resolved tenant context
```

### 21.4 New Permission Keys

| Permission Key | Description | Roles |
|---------------|-------------|-------|
| `fulfillment:shipments:read` | View shipment details | MERCHANT_OWNER, MERCHANT_STAFF, DRIVER, BUYER (own) |
| `fulfillment:shipments:write` | Create/cancel carrier shipments | MERCHANT_OWNER, MERCHANT_STAFF |
| `admin:carrier:read` | View carrier credentials (masked) | ADMIN, SUPER_ADMIN |
| `admin:carrier:write` | Manage carrier credentials | SUPER_ADMIN only |

### 21.5 Summary

| Aspect | Verdict |
|--------|---------|
| Webhook signature verification | **GAP** |
| Replay protection | **PASS** (table) + **GAP** (timestamp check) |
| Credential encryption | **GAP** |
| Tenant resolution from shipment | **GAP** |
| Rate limiting | **GAP** — ThrottlerModule registered but ThrottlerGuard not applied |
| Permission keys | **GAP** — New keys needed |

---

## 22. Test Strategy

### 22.1 Unit Tests

| Component | Test Cases | Priority |
|-----------|-----------|----------|
| Provider registry | Register, get, find, default, unknown key | HIGH |
| Provider selection | Resolve from shipping method, fallback to default | HIGH |
| Status mapping | Aramex map, SMSA map, unknown status, null mapping | HIGH |
| Request normalization | Address formatting, weight conversion, currency | HIGH |
| Idempotency key generation | Stable for same shipment, unique across shipments | HIGH |
| Credential encryption | Encrypt/decrypt round-trip, wrong key fails | HIGH |
| Error classification | Retryable vs non-retryable categorization | MEDIUM |
| Backoff calculation | Exponential with jitter, max cap | MEDIUM |

### 22.2 Integration Tests (PostgreSQL)

| Component | Test Cases | Priority |
|-----------|-----------|----------|
| Carrier shipment creation | Outbox → worker → carrier call → persist result | HIGH |
| Tracking persistence | Webhook → shipment_event → shipment status update | HIGH |
| Label storage | Carrier label → S3 → shipment_labels → presigned URL | HIGH |
| Cancellation | Cancel request → carrier API → shipment status update | HIGH |
| Webhook dedup | Same webhook twice → only one shipment_event | HIGH |
| Migration 0043 | All new tables, columns, indexes, constraints | HIGH |
| Credential CRUD | Insert, read (masked), update, deactivate | HIGH |
| Outbox retry | Failed carrier call → retry with backoff | MEDIUM |

### 22.3 Security Tests

| Test Case | Description | Priority |
|-----------|-------------|----------|
| Cross-tenant credential access | Org A cannot read Org B's credentials | CRITICAL |
| Webhook spoofing | Invalid HMAC signature → rejected | CRITICAL |
| Webhook replay | Same webhook twice → idempotent 200 | CRITICAL |
| Wrong provider webhook | Aramex webhook for SMSA shipment → rejected | HIGH |
| Wrong shipment webhook | Webhook for non-existent carrier_shipment_id → logged + 200 | HIGH |
| Credential leak | API response never contains raw secrets | CRITICAL |
| Timestamp replay | Webhook with old timestamp → rejected | HIGH |
| Oversized payload | Webhook > 1MB → rejected | MEDIUM |

### 22.4 Concurrency Tests

| Test Case | Description | Priority |
|-----------|-------------|----------|
| Duplicate shipment creation | Two concurrent create requests → only one carrier call | CRITICAL |
| Duplicate webhook | Two concurrent same webhooks → one event | HIGH |
| Out-of-order events | Event B arrives before Event A → handled correctly | HIGH |
| Concurrent status updates | Two webhooks updating same shipment → optimistic lock | HIGH |
| Retry after timeout | First call timed out, retry finds existing carrier shipment | HIGH |

### 22.5 Regression Tests

| Suite | Must Pass | Priority |
|-------|-----------|----------|
| M7.2.2 | Zone enforcement, fulfillment compatibility, checkout validation | CRITICAL |
| M7.2.1 | Provider registry, manual delivery provider | CRITICAL |
| M7.1 | Full order lifecycle, fulfillment transitions | CRITICAL |
| Checkout | Multi-merchant checkout, shipping selection, fee resolution | CRITICAL |
| Inventory | Stock settlement, reservation | HIGH |
| Orders | Accept, reject, prepare, assign, pickup, deliver | CRITICAL |
| RBAC | All 40+ permissions, tenant isolation | HIGH |

---

## 23. Identified Gaps

### 23.1 Critical Gaps (Must Fix Before Implementation)

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G1 | No `shipping_provider_key` on `shipping_methods` | Schema | Cannot resolve which carrier handles a method |
| G2 | No `carrier_shipment_id` on `shipments` | Schema | Cannot link shipment to external carrier reference |
| G3 | No `carrier_credentials` table | Schema | No secure credential storage |
| G4 | No credential encryption service | Infrastructure | Cannot safely store API keys |
| G5 | `CreateShipmentRequest` missing fields | Types | Cannot build carrier API request |
| G6 | OutboxDispatcher has no event-type consumer | Infrastructure | No async carrier API calls |

### 23.2 Significant Gaps (Must Fix During Implementation)

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G7 | No webhook endpoint | Controller | Cannot receive carrier callbacks |
| G8 | No HMAC signature verification | Infrastructure | Webhook spoofing possible |
| G9 | No `carrier_create_status` state on shipments | Schema | Cannot track carrier API call outcome |
| G10 | No exponential backoff on outbox retry | Infrastructure | Aggressive retry on carrier failure |
| G11 | `shipment_labels.shipmentId` is UNIQUE | Schema | Cannot store multiple labels per shipment |
| G12 | No `next_attempt_at` on `outbox_events` | Schema | Cannot delay retry |
| G13 | ThrottlerGuard not applied | Infrastructure | Webhook endpoint unprotected from flood |

### 23.3 Minor Gaps (Can Defer)

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| G14 | No `is_void` on `shipment_labels` | Schema | Cannot void labels |
| G15 | No `external_event_id` on `shipment_events` | Schema | Cannot deduplicate carrier events at event level |
| G16 | No `provider_key` on `shipment_labels` | Schema | Cannot identify which provider generated label |
| G17 | No health monitoring for providers | Registry | Cannot detect carrier API degradation |

---

## 24. Required Architecture Decisions

### 24.1 Decision: Carrier Configuration Ownership

**Question:** Should carrier integrations be configured at org level or store level?

**Recommendation:** **Organization-level** credentials with optional store-level configuration overrides.

**Rationale:** Carrier contracts are typically per-company (org), not per-store. A merchant with 5 stores uses one Aramex account.

**Status:** DECISION REQUIRED

### 24.2 Decision: Outbox Consumer Pattern

**Question:** Should carrier API calls use a dedicated `ShippingCarrierWorker` or extend the existing `OutboxDispatcher`?

**Recommendation:** **Dedicated worker** — `ShippingCarrierWorker` polls for `shipping.carrier.*` events.

**Rationale:** Avoids coupling carrier-specific logic to the generic dispatcher. Follows single-responsibility principle.

**Status:** DECISION REQUIRED

### 24.3 Decision: Carrier Without Idempotency Support

**Question:** How to handle carriers that don't support idempotency keys?

**Recommendation:** Lookup-by-reference pattern — call carrier's tracking/lookup API before creating a new shipment.

**Status:** DECISION REQUIRED (deferred until first carrier implementation)

### 24.4 Decision: Label Storage Constraint

**Question:** Should `shipment_labels.shipment_id` remain UNIQUE or allow multiple labels?

**Recommendation:** **Allow multiple labels** — drop UNIQUE constraint. A shipment may have reprinted labels, return labels, etc.

**Status:** DECISION REQUIRED

---

## 25. Recommended Implementation Sequence

### Phase 1: Foundation (Migration + Types)

1. **Migration 0043** — All new tables, columns, indexes
2. **Type enrichment** — Extend `CreateShipmentRequest`, `CreateShipmentResult`, `CarrierStatusMapping`
3. **Schema updates** — Drizzle schema files to match migration

### Phase 2: Credential Infrastructure

4. **Credential encryption service** — AES-256-GCM encrypt/decrypt
5. **`carrier_credentials` CRUD** — Service + controller with admin-only access
6. **Credential tenant isolation** — `assertOrgForCredentials()` helper

### Phase 3: Provider Enrichment

7. **Abstract provider enhancements** — Stricter return types, credential injection
8. **`shipping_methods.shipping_provider_key`** — Bind methods to providers
9. **Carrier configuration service** — Org-level config with store overrides

### Phase 4: Outbox Worker

10. **`ShippingCarrierWorker`** — Polls for `shipping.carrier.*` events
11. **Exponential backoff** — Add `next_attempt_at` to outbox polling
12. **Carrier API client base** — HTTP client with retry, timeout, error classification

### Phase 5: Webhook Infrastructure

13. **Webhook endpoint** — `POST /v1/webhooks/carrier/:providerKey`
14. **HMAC verification** — Signature validation middleware
15. **Tenant resolution** — Shipment-based tenant lookup
16. **Status mapping + transition validation** — Safe webhook processing

### Phase 6: Shipment Operations

17. **Carrier shipment creation** — `POST /v1/shipments/:id/create`
18. **Carrier shipment cancellation** — `POST /v1/shipments/:id/cancel`
19. **Tracking endpoint** — `GET /v1/shipments/:id/tracking`
20. **Label generation + storage** — Carrier label → S3 → presigned URL

### Phase 7: UI + Notifications

21. **Merchant shipping UI** — Carrier selection, credential config
22. **Buyer tracking UI** — Carrier name, tracking number, events timeline
23. **Notification templates** — Carrier shipment created, delivered, failed

### Phase 8: Testing + Hardening

24. **Unit tests** — Provider registry, status mapping, encryption
25. **Integration tests** — Full carrier flow with mocked HTTP
26. **Security tests** — Cross-tenant, spoofing, replay
27. **Concurrency tests** — Duplicate creation, duplicate webhook
28. **Regression** — M7.1, M7.2.1, M7.2.2 all green

---

## Appendix A: File Reference

| File | Lines | Role |
|------|-------|------|
| `modules/shipping/shipping-provider.ts` | 79 | Abstract provider base class |
| `modules/shipping/shipping-registry.ts` | 78 | Provider registry (Map-based) |
| `modules/shipping/shipping.types.ts` | 60 | Domain types |
| `modules/shipping/shipping.service.ts` | 629 | CRUD, estimates, validation, provider delegation |
| `modules/shipping/shipping.controller.ts` | 254 | 17 REST endpoints |
| `modules/shipping/shipping.schema.ts` | 145 | 8 tables |
| `modules/shipping/shipping.module.ts` | 41 | Module wiring |
| `modules/shipping/shipping-cost.resolver.ts` | 144 | Pure fee calculation + zone matching |
| `modules/shipping/providers/manual-delivery.provider.ts` | 57 | Default manual provider |
| `modules/orders/shipment.schema.ts` | 56 | shipments + shipment_events |
| `modules/orders/orders.service.ts` | 1979 | Order lifecycle, createShipment, fulfillment |
| `common/outbox/outbox-dispatcher.service.ts` | 115 | Transactional outbox polling |
| `common/storage/storage.service.ts` | 186 | S3-compatible object storage |
| `modules/realtime/realtime.gateway.ts` | 226 | WebSocket gateway |
| `modules/notifications/notifications.service.ts` | 486 | Multi-channel notifications |
| `modules/audit/audit.schema.ts` | 66 | outbox_events, audit_logs |
| `common/tenant-scope.ts` | 163 | CallerContext, tenant checks |

---

## Appendix B: Comparison — Current vs Required

| Capability | Current (M7.2.2) | Required (M7.2.3) |
|------------|------------------|-------------------|
| Provider types | MANUAL only | MANUAL + CARRIER |
| Provider count | 1 (manual-driver) | N (manual + external carriers) |
| Shipment creation | DB insert only | DB insert + outbox → carrier API |
| Tracking | Manual events only | Manual + carrier webhook events |
| Labels | Not implemented | Carrier-generated → S3 → presigned |
| Credentials | Not needed | Encrypted per-org storage |
| Webhooks | Table exists, no endpoint | Full endpoint + HMAC + dedup |
| Address validation | Zone matching only | Zone matching + optional carrier API |
| Error handling | N/A (no external calls) | Retry, backoff, dead-letter |
| Idempotency | Outbox event ID | Carrier API idempotency key |

---

**END OF AUDIT**

*This document is READ-ONLY. No production code was modified during its creation.*
*All findings are based on repository inspection as of 2026-09-28.*
