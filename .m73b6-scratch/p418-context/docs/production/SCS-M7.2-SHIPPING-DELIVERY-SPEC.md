# SCS Platform — M7.2 Shipping & Delivery
## Architecture Audit & Implementation Specification

**Version:** 1.0.0  
**Date:** 2026-09-27  
**Status:** AUDIT COMPLETE — SPECIFICATION READY  
**Baseline:** M7.1 — Order Lifecycle & Fulfillment (PASS WITH CONDITIONS)

---

## Table of Contents

1. [Architecture Map](#1-architecture-map)
2. [M7.1 Baseline Audit](#2-m71-baseline-audit)
3. [Data Model Audit for Shipping](#3-data-model-audit-for-shipping)
4. [Shipping Methods Audit](#4-shipping-methods-audit)
5. [Carrier Abstraction Design](#5-carrier-abstraction-design)
6. [Shipping Cost Calculation Design](#6-shipping-cost-calculation-design)
7. [Delivery Zones Design](#7-delivery-zones-design)
8. [Shipping Labels Design](#8-shipping-labels-design)
9. [Delivery Proof Design](#9-delivery-proof-design)
10. [Driver Eligibility Design](#10-driver-eligibility-design)
11. [Shipping Status Synchronization](#11-shipping-status-synchronization)
12. [Database Migration Plan](#12-database-migration-plan)
13. [API Endpoint Specification](#13-api-endpoint-specification)
14. [Web UI Specification](#14-web-ui-specification)
15. [Mobile UI Specification](#15-mobile-ui-specification)
16. [Security Model](#16-security-model)
17. [Concurrency & Idempotency](#17-concurrency--idempotency)
18. [Test Specification](#18-test-specification)
19. [Production Release Gate](#19-production-release-gate)

---

## 1. Architecture Map

### 1.1 Repository Topology

```
scs-platform/
├── apps/
│   ├── api/                          # NestJS modular monolith
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── database/         # DatabaseService (Drizzle ORM)
│   │   │   │   ├── outbox/           # OutboxDispatcher (transactional outbox)
│   │   │   │   ├── redis/            # RedisService (caching, denylist)
│   │   │   │   ├── storage/          # StorageService (S3-compatible)
│   │   │   │   ├── guards/           # JwtAuthGuard, PermissionsGuard, RolesGuard
│   │   │   │   ├── auth/             # token-denylist
│   │   │   │   └── tenant-scope.ts   # CallerContext, object-level tenant checks
│   │   │   ├── modules/
│   │   │   │   ├── identity/         # users, orgs, roles, permissions, sessions
│   │   │   │   ├── merchant/         # stores, warehouses, documents, verification
│   │   │   │   ├── catalog/          # products, variants, offers, taxonomy, search
│   │   │   │   ├── inventory/        # inventory_items, stock_movements
│   │   │   │   ├── pricing/          # price_lists, price_tiers
│   │   │   │   ├── promotions/       # promotions, coupons
│   │   │   │   ├── orders/           # cart, orders, shipments, fulfillment
│   │   │   │   ├── notifications/    # notifications, preferences, device_tokens
│   │   │   │   ├── reviews/          # reviews, disputes, support
│   │   │   │   ├── realtime/         # WebSocket gateway (Socket.IO)
│   │   │   │   ├── analytics/        # analytics events
│   │   │   │   ├── audit/            # audit_logs, outbox_events, feature_flags
│   │   │   │   ├── admin/            # admin-only aggregation endpoints
│   │   │   │   ├── catalog-import/   # Excel import pipeline
│   │   │   │   └── support/          # support tickets
│   │   │   └── drizzle/schema.ts     # Barrel: all module schemas
│   │   └── infra/drizzle/seed-pg.ts  # RBAC seed (7 roles, 40+ permissions)
│   ├── web/                          # Next.js buyer + merchant web app
│   └── admin/                        # Next.js admin console
├── mobile/                           # Flutter app (Riverpod + go_router)
│   └── lib/
│       ├── models/models.dart        # All data models
│       ├── services/api_service.dart # Dio-based API client
│       ├── providers/providers.dart  # Riverpod providers
│       ├── router/router.dart        # go_router configuration
│       └── screens/                  # buyer, merchant, driver, auth, etc.
├── packages/
│   ├── contracts/                    # Shared Zod schemas + TypeScript types
│   ├── env/                          # Zod-validated environment schemas
│   ├── event-types/                  # Domain event schemas (outbox)
│   └── ui-kit/                       # Shared design tokens + primitives
└── infra/drizzle/migrations/         # 40 SQL migrations (0001–0040)
```

### 1.2 Key Infrastructure Components

| Component | Implementation | Location |
|-----------|---------------|----------|
| Database | PostgreSQL via Drizzle ORM | `common/database/` |
| Cache/Pubsub | Redis | `common/redis/` |
| Object Storage | S3-compatible (B2/MinIO) | `common/storage/` |
| Event Bus | Transactional Outbox (polling) | `common/outbox/` |
| Realtime | Socket.IO WebSocket gateway | `modules/realtime/` |
| Auth | JWT access+refresh, RBAC | `common/guards/` |
| Notifications | Multi-channel (SMS/PUSH/IN_APP/WHATSAPP) | `modules/notifications/` |

---

## 2. M7.1 Baseline Audit

### 2.1 Order FSM — VERIFIED ✓

**Source of truth:** `orders.status` column (VARCHAR(24))

**Transition map** (`OrdersService.TRANSITIONS`):
```
DRAFT → [SUBMITTED]
SUBMITTED → [PENDING_CONFIRMATION]  (auto-advance)
PENDING_CONFIRMATION → [ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED]
ACCEPTED → [PREPARING, CANCELLED]
PARTIALLY_ACCEPTED → [PREPARING, CANCELLED]
PREPARING → [READY, CANCELLED]
READY → [OUT_FOR_DELIVERY, ASSIGNED, DELIVERED, CANCELLED]
ASSIGNED → [PICKED_UP]
PICKED_UP → [OUT_FOR_DELIVERY]
OUT_FOR_DELIVERY → [DELIVERED]
DELIVERED → [COMPLETED, DISPUTED]
COMPLETED → [DISPUTED]
CANCELLED → [] (terminal)
REJECTED → [] (terminal)
DISPUTED → [] (terminal)
```

**Transition validation:** `assertTransition()` — static map lookup, throws `ConflictException` on invalid transition.

**Transaction boundaries:**
- Each fulfillment transition is a series of sequential DB operations (not wrapped in a single transaction).
- Optimistic locking via `UPDATE orders SET status = ? WHERE id = ? AND status = ?` (atomic CAS).
- If CAS returns 0 rows → `ConflictException` (concurrent change rejected).

**Optimistic locking:** ✓ Verified — all fulfillment transitions use atomic `UPDATE WHERE status = X RETURNING`.

**Status history:** `order_status_history` table — append-only, every transition logged with `fromStatus`, `toStatus`, `changedBy`, `actorType`, `reason`.

**Outbox events:** Each fulfillment transition publishes to `outbox_events` via `OutboxDispatcher.publish()`.

**Idempotency:** Checkout uses `idempotencyKey` + `requestFingerprint` (SHA-256 of items + address + method). Fulfillment transitions are naturally idempotent via optimistic locking.

### 2.2 Shipment Model — VERIFIED ✓

**Table:** `shipments` (migration 0040)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → orders(id) | UNIQUE constraint (1:1 per sub-order) |
| store_id | UUID FK → stores(id) | Merchant ownership |
| status | VARCHAR(24) | PREPARING → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED → COMPLETED |
| assigned_driver_id | UUID FK → users(id) | Nullable until assigned |
| assigned_at | TIMESTAMPTZ | |
| picked_up_at | TIMESTAMPTZ | |
| out_for_delivery_at | TIMESTAMPTZ | |
| delivered_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| metadata | JSONB | Extensible |
| created_at / updated_at | TIMESTAMPTZ | |

**Key finding:** Shipment is correctly associated with the **merchant sub-order** (not the master order). The `uq_shipments_order` UNIQUE constraint on `order_id` enforces exactly one shipment per sub-order. A multi-merchant master order produces multiple independent shipments.

**Shipment creation:** Created in `createShipment()` during `acceptOrder()`, initial status = `PREPARING`.

**Indexes:**
- `idx_shipments_store` on `store_id`
- `idx_shipments_driver` on `assigned_driver_id` (partial: WHERE NOT NULL)
- `idx_shipments_status` on `status` (partial: WHERE NOT IN ('DELIVERED', 'COMPLETED'))

### 2.3 Shipment Events — VERIFIED ✓

**Table:** `shipment_events` (migration 0040)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| shipment_id | UUID FK → shipments(id) | |
| event_type | VARCHAR(24) | PREPARING, ASSIGNED, PICKED_UP, etc. |
| actor_user_id | UUID FK → users(id) | Who performed the action |
| actor_type | VARCHAR(16) | MERCHANT, DRIVER, SYSTEM |
| location_text | VARCHAR(300) | Optional location description |
| notes | TEXT | Optional notes |
| metadata | JSONB | Extensible |
| sequence | SERIAL | Auto-incrementing order |
| created_at | TIMESTAMPTZ | |

**Append-only:** ✓ No UPDATE or DELETE operations exist in the codebase for this table. Events are INSERT-only.

**Event ordering:** By `sequence` (SERIAL), confirmed in `getTracking()` which orders by `shipmentEvents.sequence`.

**Immutability:** ✓ No code path modifies existing events.

**Duplicate possibility:** Theoretically possible (no unique constraint on (shipment_id, event_type, sequence)), but the FSM transition logic prevents duplicate status transitions in practice.

### 2.4 Inventory — VERIFIED ✓

**Reservation timing:** At merchant `acceptOrder()` — `reserveStock()` writes RESERVE movement, increments `qty_reserved`.

**Settlement timing:** At `DELIVERED` (SALE movement) or `CANCELLED`/`REJECTED` (RELEASE movement).

**Stock movement types:** ADJUST, RESERVE, RELEASE, SALE, CANCEL, IMPORT, RETURN (enforced by CHECK constraint in migration 0020).

**Concurrency protection:** `SELECT ... FOR UPDATE` on inventory row before mutation in `settleStockForStatus()`.

**Idempotency:** `settleStockForStatus()` nets existing movements per inventory item — replayed transitions are no-ops.

---

## 3. Data Model Audit for Shipping

### 3.1 Delivery Addresses — FINDING

**Current state:**
- `master_orders.delivery_address` — JSONB, free-form, unstructured
- Checkout collects `{ street, city }` from buyer
- No address validation
- No structured address fields (no postal code, country, phone, lat/lng)
- Address is a snapshot on the master order (immutable once written)

**Critical gap:** The delivery address is stored only on the `master_orders` table as unstructured JSONB. Individual shipments (which are per sub-order) have NO delivery address of their own. For shipping/label generation, each shipment needs its own delivery address.

### 3.2 Recommendation: Shipment Address Snapshot

**Architecture decision:** Each shipment must carry its own immutable delivery address snapshot.

**Rationale:**
1. A master order's delivery address is shared across all sub-orders, but each shipment may need a slightly different address (e.g., different floors, different contact persons for different merchants).
2. The buyer may edit their profile address later — the shipment must retain the original.
3. Labels and proof-of-delivery need the address on the shipment, not the master order.

**Proposed approach:**
- Add `delivery_address` JSONB column to `shipments` table (snapshot at shipment creation time).
- Copy from `master_orders.delivery_address` at shipment creation (in `createShipment()`).
- Once written, never updated (immutable snapshot).
- Future: structured address type with validation (postal code, city, country, phone, lat, lng).

### 3.3 Existing Address-Adjacent Models

| Model | Address Field | Structure |
|-------|--------------|-----------|
| `stores.address` | JSONB | Free-form store address |
| `warehouses.address` | JSONB | Free-form warehouse address |
| `organizations.country` | CHAR(2) | ISO 3166-1 alpha-2 |
| `master_orders.delivery_address` | JSONB | Free-form `{ street, city }` |

**No dedicated address entity exists.** All addresses are free-form JSONB.

---

## 4. Shipping Methods Audit

### 4.1 Current State

**Existing fulfillment methods** (defined in `order-pricing.ts`):
```typescript
type FulfillmentMethod = 'PLATFORM_DELIVERY' | 'MERCHANT_DELIVERY' | 'PICKUP';
```

**Delivery fee resolution:**
- `PLATFORM_DELIVERY` → configurable flat fee (currently 0 for pilot)
- `MERCHANT_DELIVERY` → 0 (merchant arranges)
- `PICKUP` → 0 (buyer collects)

### 4.2 Gap Analysis

The current model has only 3 fulfillment methods with no concept of:
- Shipping service levels (STANDARD, EXPRESS, SAME_DAY)
- External carrier integration
- Shipping method selection at checkout
- Per-method cost calculation
- Merchant-configured shipping options

### 4.3 M7.2 Shipping Method Design

**New table: `shipping_methods`**

```sql
CREATE TABLE shipping_methods (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id),
  key             VARCHAR(40) NOT NULL,        -- MERCHANT_STANDARD, MERCHANT_EXPRESS, etc.
  name            VARCHAR(200) NOT NULL,       -- "Standard Delivery"
  description     TEXT,
  carrier_type    VARCHAR(24) NOT NULL,        -- MERCHANT, PLATFORM, EXTERNAL
  base_fee_minor  BIGINT NOT NULL DEFAULT 0,
  currency        CHAR(3) NOT NULL DEFAULT 'SAR',
  min_order_minor BIGINT DEFAULT 0,            -- minimum order for this method
  free_above_minor BIGINT,                     -- free shipping threshold
  est_days_min    INTEGER,                     -- estimated delivery range
  est_days_max    INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shipping_methods_store_key UNIQUE (store_id, key)
);
```

**Carrier type enum:**
- `MERCHANT` — merchant's own delivery fleet (driver role)
- `PLATFORM` — platform-managed delivery
- `EXTERNAL` — third-party carrier integration

**Checkout integration:**
- Buyer selects shipping method per sub-order at checkout.
- `orders.fulfillment_method` already exists (VARCHAR(24)) — extend to accept shipping method keys.
- Shipping fee resolved from `shipping_methods.base_fee_minor` (or free above threshold).

---

## 5. Carrier Abstraction Design

### 5.1 Current State

**No carrier abstraction exists.** Driver assignment is manual: merchant provides a `driverId` (user ID), the system stores it on the shipment. There is no concept of a carrier entity, carrier account, or carrier API integration.

### 5.2 M7.2 Carrier Provider Interface

**Design principle:** Smallest useful abstraction — not over-engineered. The interface supports the current manual/driver model AND future external carriers through a single provider pattern.

```typescript
// apps/api/src/modules/shipping/shipping-provider.ts

export interface ShippingProvider {
  readonly type: 'MANUAL' | 'EXTERNAL';
  readonly key: string;  // e.g., 'manual-driver', 'aramex', 'smsa'

  /** Create a shipment record in the carrier's system. Returns carrier tracking ID if applicable. */
  createShipment(input: CreateCarrierShipmentInput): Promise<CreateCarrierShipmentOutput>;

  /** Cancel a previously created shipment. */
  cancelShipment?(trackingId: string): Promise<void>;

  /** Generate a shipping label. Returns storage key for the label file. */
  generateLabel?(trackingId: string): Promise<{ storageKey: string; mimeType: string }>;

  /** Get current tracking status from the carrier. */
  getTracking?(trackingId: string): Promise<CarrierTrackingResult | null>;

  /** Validate a delivery address against the carrier's service area. */
  validateAddress?(address: ShippingAddress): Promise<AddressValidationResult>;

  /** Map a carrier-specific status to SCS shipment status. */
  mapStatus?(carrierStatus: string): string | null;
}
```

**Input/Output types:**
```typescript
interface CreateCarrierShipmentInput {
  shipmentId: string;
  orderId: string;
  storeId: string;
  deliveryAddress: ShippingAddress;
  pickupAddress?: ShippingAddress;
  packageInfo?: { weightKg?: number; dimensionsCm?: { l: number; w: number; h: number } };
}

interface CreateCarrierShipmentOutput {
  trackingId?: string;       // carrier-assigned tracking number
  labelStorageKey?: string;  // if label generated inline
  metadata?: Record<string, unknown>;
}

interface ShippingAddress {
  name: string;
  phone?: string;
  street: string;
  city: string;
  postalCode?: string;
  country: string;  // ISO 3166-1 alpha-2
  latitude?: number;
  longitude?: number;
}

interface CarrierTrackingResult {
  status: string;
  location?: string;
  estimatedDelivery?: string;
  events: Array<{ status: string; location?: string; timestamp: string }>;
}

interface AddressValidationResult {
  valid: boolean;
  standardized?: ShippingAddress;
  issues: string[];
}
```

### 5.3 Initial Providers

**1. `ManualDeliveryProvider`** (default, always available)
- `type: 'MANUAL'`
- `key: 'manual-driver'`
- `createShipment()` → no-op (returns empty output, no tracking ID)
- No label generation, no external tracking, no address validation
- This is what the current M7.1 driver assignment effectively does

**2. Future external providers** (M7.2 stub, M7.3 implementation)
- `AramexProvider`, `SmsaProvider`, etc.
- Would implement `createShipment`, `generateLabel`, `getTracking`, `validateAddress`
- Registered via environment configuration

### 5.4 Provider Registry

```typescript
// apps/api/src/modules/shipping/shipping-registry.ts

@Injectable()
export class ShippingProviderRegistry {
  private readonly providers = new Map<string, ShippingProvider>();

  register(provider: ShippingProvider) {
    this.providers.set(provider.key, provider);
  }

  get(key: string): ShippingProvider {
    const provider = this.providers.get(key);
    if (!provider) throw new NotFoundException(`Shipping provider '${key}' not registered`);
    return provider;
  }

  getDefault(): ShippingProvider {
    return this.get('manual-driver');
  }
}
```

### 5.5 Capability Separation

| Capability | Required (M7.2) | Optional |
|------------|-----------------|----------|
| Create shipment | ✓ (all providers) | |
| Cancel shipment | | ✓ (external) |
| Generate label | ✓ (manual = placeholder) | ✓ (external = PDF) |
| Get tracking | | ✓ (external) |
| Estimate shipping | | ✓ (external) |
| Validate address | ✓ (basic local validation) | ✓ (external = carrier API) |
| Delivery confirmation | ✓ (driver manual) | ✓ (external = webhook) |
| Status synchronization | | ✓ (external = webhook) |

---

## 6. Shipping Cost Calculation Design

### 6.1 Current Pricing Architecture

**Existing financial model** (`order-pricing.ts`):
- `computeOrderFinancials()` — pure function, no side effects
- Money in integer minor units (halalas for SAR)
- VAT: 15% on (net goods + delivery fee)
- Commission: 5% on net goods only
- Delivery fee: flat, currently 0 (pilot)

**Current delivery fee resolution:**
```typescript
resolveDeliveryFeeMinor(fulfillmentMethod, platformFeeMinor)
// PLATFORM_DELIVERY → platformFeeMinor (currently 0)
// MERCHANT_DELIVERY → 0
// PICKUP → 0
```

**Financial breakdown per sub-order:**
- `orders.subtotal_minor`, `discount_minor`, `delivery_fee_minor`, `tax_minor`, `total_minor`
- `order_financial_breakdown` — detailed view with `products_minor`, `commission_minor`, `merchant_net_minor`

### 6.2 Where Shipping Cost Belongs

**Critical architectural decision:** Shipping cost belongs on the **shipment** (and mirrored on the sub-order).

**Rationale:**
1. Each merchant sub-order has an independent shipment → independent shipping cost.
2. The master order's total is the sum of sub-order totals (each already includes its own delivery fee).
3. `orders.delivery_fee_minor` already exists — it is the natural place for the shipping cost on the sub-order.
4. The shipment may have additional cost details (carrier fees, label costs) that don't affect the buyer's price but matter for merchant accounting.

**Cost flow:**
```
Master Order
 ├── Sub Order A → delivery_fee_minor = shipping cost A (charged to buyer)
 ├── Sub Order B → delivery_fee_minor = shipping cost B (charged to buyer)
 └── Sub Order C → delivery_fee_minor = shipping cost C (charged to buyer)
```

### 6.3 Shipping Cost Resolution

**New function** (extends `order-pricing.ts`):
```typescript
interface ShippingCostInput {
  shippingMethodId: string;
  subtotalMinor: number;
  deliveryAddress: ShippingAddress;
}

interface ShippingCostResult {
  shippingFeeMinor: number;
  isFreeShipping: boolean;
  shippingMethod: { id: string; key: string; name: string };
}
```

**Resolution logic:**
1. Look up `shipping_methods` by ID.
2. Check `min_order_minor` — if subtotal < minimum, reject this method.
3. Check `free_above_minor` — if subtotal >= threshold, shipping is free.
4. Otherwise, use `base_fee_minor`.
5. Future: distance-based, weight-based, or carrier-quoted pricing.

**Checkout integration:**
- Buyer selects shipping method per store group in cart.
- `computeOrderFinancials()` receives the resolved `deliveryFeeMinor` from the shipping method.
- The existing VAT and commission calculations apply (delivery fee is taxable).

---

## 7. Delivery Zones Design

### 7.1 Current State

**No delivery zones exist.** The only geographic data:
- `organizations.country` — CHAR(2) ISO code
- `stores.address` — free-form JSONB
- `warehouses.address` — free-form JSONB

### 7.2 M7.2 Delivery Zone Model

**Design principle:** Smallest useful zone model — city/postal-code based, no GPS polygons (M7.3).

**New table: `delivery_zones`**

```sql
CREATE TABLE delivery_zones (
  id                UUID PRIMARY KEY,
  store_id          UUID NOT NULL REFERENCES stores(id),
  name              VARCHAR(200) NOT NULL,         -- "Riyadh Metro"
  zone_type         VARCHAR(24) NOT NULL,          -- CITY, POSTAL_CODE, CUSTOM
  country           CHAR(2) NOT NULL DEFAULT 'SA',
  city              VARCHAR(100),
  postal_code       VARCHAR(20),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_zones_store ON delivery_zones(store_id);
CREATE INDEX idx_delivery_zones_lookup ON delivery_zones(country, city, postal_code);
```

**Zone-to-shipping-method linkage:**

```sql
CREATE TABLE delivery_zone_methods (
  id                 UUID PRIMARY KEY,
  zone_id            UUID NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
  shipping_method_id UUID NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
  fee_override_minor BIGINT,                        -- null = use method's base fee
  est_days_override  JSONB,                         -- { min, max } or null
  is_active          BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_zone_method UNIQUE (zone_id, shipping_method_id)
);
```

### 7.3 Merchant Zone Configuration

**Merchant capabilities:**
- Define zones per store (city, postal code).
- Assign shipping methods to zones with optional fee overrides.
- Enable/disable zones independently.
- Set minimum order values per zone+method.
- Set free-shipping thresholds per zone+method.

**Checkout validation:**
- When buyer enters delivery address, resolve matching zones for each store in cart.
- If no zone matches → that store cannot deliver to this address → show error.
- If zones match → show available shipping methods with costs.

---

## 8. Shipping Labels Design

### 8.1 Storage Infrastructure

**Existing storage** (`StorageService`):
- S3-compatible (Backblaze B2 in staging, MinIO for dev)
- Two buckets: `scs-media` (product images) and `scs-uploads` (documents, imports)
- Presigned PUT for upload (15-min expiry)
- Presigned GET for download (15-min expiry)
- Bucket allowlist validation
- Object key patterns: `docs/{orgId}/{docId}/{fileName}`, `imports/{storeId}/{id}/{fileName}`

### 8.2 Label Storage Design

**Bucket:** Use `scs-uploads` bucket (same as business documents).

**Key pattern:** `labels/{shipmentId}/{labelId}/{fileName}`

**Label entity:**

```sql
CREATE TABLE shipment_labels (
  id              UUID PRIMARY KEY,
  shipment_id     UUID NOT NULL REFERENCES shipments(id),
  storage_key     TEXT NOT NULL,                   -- S3 object key
  file_name       VARCHAR(260) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size       BIGINT NOT NULL DEFAULT 0,
  label_type      VARCHAR(24) NOT NULL DEFAULT 'SHIPPING',  -- SHIPPING, RETURN
  generated_by    UUID REFERENCES users(id),       -- who generated it
  provider_key    VARCHAR(40),                     -- which provider generated it
  is_void         BOOLEAN NOT NULL DEFAULT false,  -- voided labels are kept for audit
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipment_labels_shipment ON shipment_labels(shipment_id);
```

### 8.3 Label Lifecycle

- **One active label per shipment** (the latest non-void label).
- **Regeneration:** Merchant can regenerate a label (e.g., after address correction). Old label is voided (`is_void = true`), new label created.
- **Immutability:** Once generated, a label file is never modified. A new label = new row.
- **Access control:** Presigned GET URLs, scoped to the shipment's store org. Only merchant staff or platform admins can request label downloads.
- **Tenant isolation:** Label rows are accessed through shipment → store → org tenant checks.

---

## 9. Delivery Proof Design

### 9.1 Current State

**No delivery proof infrastructure exists.** The `deliverOrder()` method marks the shipment as DELIVERED with a timestamp and event, but captures no proof.

### 9.2 M7.2 Delivery Proof Model

**Single table with type discriminator:**

```sql
CREATE TABLE delivery_proofs (
  id              UUID PRIMARY KEY,
  shipment_id     UUID NOT NULL REFERENCES shipments(id),
  proof_type      VARCHAR(16) NOT NULL,            -- PHOTO, SIGNATURE
  storage_key     TEXT,                             -- S3 key for photo/signature image
  file_name       VARCHAR(260),
  mime_type       VARCHAR(100),
  file_size       BIGINT,
  signer_name     VARCHAR(200),                    -- for SIGNATURE type
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_by     UUID NOT NULL REFERENCES users(id),  -- driver who captured
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_proofs_shipment ON delivery_proofs(shipment_id);
```

### 9.3 Photo Proof

**Upload flow:**
1. Driver captures photo on mobile device.
2. Mobile app requests presigned PUT URL via `POST /v1/shipments/:id/proof/presign`.
3. API validates driver is assigned to this shipment.
4. API returns presigned URL + `storage_key`.
5. Mobile uploads photo directly to S3.
6. Mobile calls `POST /v1/shipments/:id/proof/photo` with `storage_key`, `file_name`, `mime_type`.
7. API creates `delivery_proofs` row with `proof_type = 'PHOTO'`.

**Storage:** `proofs/{shipmentId}/{proofId}/{fileName}` in `scs-uploads` bucket.

**Constraints:**
- MIME validation: `image/jpeg`, `image/png`, `image/heic` only.
- Max file size: 10 MB.
- Multiple photos per shipment allowed.
- Photo is associated with the shipment, not the order (1:1 shipment-sub-order mapping means it's effectively both).

### 9.4 Signature Capture

**Capture flow:**
1. Driver presents signature pad on mobile device.
2. Buyer signs on screen.
3. App renders signature to PNG/JPEG image.
4. Same upload flow as photo proof.
5. Additional field: `signer_name` (buyer's name, typed or pre-filled from order).

**Storage:** Same as photo proof, same `delivery_proofs` table with `proof_type = 'SIGNATURE'`.

### 9.5 Proof at Delivery Time

**Design decision:** Proof capture is optional at delivery time (configurable per merchant/store).

- `deliverOrder()` accepts optional `proof` parameter.
- If proof is provided, it is created atomically with the delivery transition.
- If proof is not provided, delivery proceeds normally (backward compatible with M7.1).
- Future: merchant can require proof before delivery is accepted.

---

## 10. Driver Eligibility Design

### 10.1 Current Driver Model

**How drivers are represented:**
- Drivers are regular `users` rows.
- Role = `DRIVER` (via `organization_members.role_id` → `roles.key = 'DRIVER'`).
- Drivers belong to an organization via `organization_members`.
- Drivers can be assigned to shipments via `shipments.assigned_driver_id`.

**What exists:**
- User status: `ACTIVE` (default), other values possible but not enumerated.
- Organization membership status: `ACTIVE`.
- Driver permissions: `orders:read`, `fulfillment:shipments:read`, `fulfillment:shipments:pickup`, `fulfillment:shipments:deliver`.

**What does NOT exist:**
- No dedicated driver profile/entity.
- No driver availability status.
- No driver documents (license, insurance).
- No driver ratings.
- No driver store assignment (driver belongs to org, not specific store).
- No driver suspension mechanism.

### 10.2 M7.2 Driver Eligibility Model

**Design principle:** Minimum viable eligibility — extend the existing user/role model without creating a separate driver entity.

**New table: `driver_profiles`** (supplements `users`, 1:1)

```sql
CREATE TABLE driver_profiles (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  eligibility     VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, SUSPENDED, INACTIVE
  vehicle_type    VARCHAR(40),                     -- CAR, MOTORCYCLE, BICYCLE, VAN
  vehicle_plate   VARCHAR(20),
  phone           VARCHAR(20),                     -- dedicated driver phone
  max_concurrent  INTEGER NOT NULL DEFAULT 3,      -- max simultaneous shipments
  store_ids       JSONB NOT NULL DEFAULT '[]',     -- stores this driver can serve (empty = all org stores)
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_profiles_org ON driver_profiles(org_id);
CREATE INDEX idx_driver_profiles_eligibility ON driver_profiles(eligibility)
  WHERE eligibility = 'ACTIVE';
```

### 10.3 Eligibility Rules

**Before assigning a driver to a shipment:**
1. Driver must have a `driver_profiles` row (or one is auto-created on first assignment).
2. `eligibility` must be `ACTIVE`.
3. Driver must belong to the same organization as the store.
4. Current active shipment count < `max_concurrent`.
5. If `store_ids` is non-empty, the shipment's store must be in the list.

**Eligibility states:**
- `ACTIVE` — available for assignment.
- `SUSPENDED` — temporarily ineligible (admin/merchant owner action).
- `INACTIVE` — permanently removed from service.

### 10.4 Driver Assignment Enhancement

**Enhanced `assignDriver()`:**
- Validate driver eligibility before assignment.
- Check concurrent shipment count.
- Check store access.
- Record assignment in `driver_profiles` activity tracking (metadata).

---

## 11. Shipping Status Synchronization

### 11.1 Current State

**No webhook infrastructure exists.** The outbox dispatcher polls `outbox_events` and logs (no external delivery). The realtime gateway pushes status changes to connected WebSocket clients.

### 11.2 M7.2 Webhook Infrastructure

**New table: `webhook_endpoints`**

```sql
CREATE TABLE webhook_endpoints (
  id              UUID PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  url             TEXT NOT NULL,
  secret          VARCHAR(128) NOT NULL,           -- HMAC signing secret
  events          JSONB NOT NULL DEFAULT '[]',     -- subscribed event types
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY,
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type      VARCHAR(80) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING, DELIVERED, FAILED
  response_code   INTEGER,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status)
  WHERE status = 'PENDING';
```

### 11.3 External Carrier Status Inbound

**Webhook receiver endpoint:** `POST /v1/webhooks/carrier/:providerKey`

**Flow:**
```
External Carrier
   ↓ HTTP POST (status update)
SCS API (webhook receiver)
   ↓ Verify signature / API key
   ↓ Map carrier status → SCS shipment status
   ↓ Validate shipment exists + is in compatible state
   ↓ Create shipment_event (append-only)
   ↓ Update shipment status (optimistic lock)
   ↓ Publish outbox event
   ↓ Return 200 OK
```

**Security requirements:**
- Each provider has a configured signing secret.
- Inbound webhooks verified via HMAC-SHA256 signature in `X-Signature` header.
- Replay protection: `X-Timestamp` header, reject if > 5 minutes old.
- Idempotency: `X-Delivery-ID` header, deduplicate on (provider, delivery_id).
- Unknown status mapping → log + return 200 (don't crash the carrier's retry loop).

### 11.4 Outbound Webhook Dispatch

**Integration with outbox:**
- When a shipment status changes, the outbox event includes the shipment event type.
- A new `WebhookDispatcher` polls `webhook_deliveries` for PENDING rows.
- Signs payload with endpoint secret (HMAC-SHA256).
- POSTs to endpoint URL with retry (exponential backoff, max 5 attempts).
- Marks as DELIVERED or FAILED.

### 11.5 Provider Status Mapping

```typescript
// Example: Aramex status mapping
const ARAMEX_STATUS_MAP: Record<string, string> = {
  'SH001': 'PREPARING',
  'SH002': 'READY',
  'SH003': 'ASSIGNED',
  'SH004': 'PICKED_UP',
  'SH005': 'OUT_FOR_DELIVERY',
  'SH006': 'DELIVERED',
  'SH007': 'CANCELLED',
};
```

Each external provider implements `mapStatus(carrierStatus)` from the `ShippingProvider` interface.

---

## 12. Database Migration Plan

### 12.1 Migration Number

**Next migration: `0041_shipping.sql`**

### 12.2 Migration Contents

The migration creates all M7.2 tables in a single atomic DDL script:

1. `shipping_methods` — merchant-configured shipping options
2. `delivery_zones` — geographic service areas per store
3. `delivery_zone_methods` — zone-to-method linkage with fee overrides
4. `shipment_labels` — generated shipping labels
5. `delivery_proofs` — photo/signature proof of delivery
6. `driver_profiles` — driver eligibility and configuration
7. `webhook_endpoints` — outbound webhook configuration
8. `webhook_deliveries` — webhook delivery tracking
9. Add `delivery_address` JSONB to `shipments` (address snapshot)
10. Add `carrier_tracking_id` VARCHAR(100) to `shipments`
11. Add `shipping_method_id` UUID FK to `shipments` (nullable for legacy)
12. Add `shipping_provider_key` VARCHAR(40) to `shipments` (default 'manual-driver')

### 12.3 Migration Safety

- All tables use `CREATE TABLE IF NOT EXISTS`.
- All indexes use `CREATE INDEX IF NOT EXISTS`.
- Foreign keys reference existing tables (stores, shipments, users, organizations).
- New columns on existing tables are nullable (no backfill required).
- No destructive changes to existing tables.
- Migration is idempotent (safe to re-run).

### 12.4 Discovery Mechanism

Migrations are discovered by filename sort order in `infra/drizzle/migrations/`. The test harness reads all `.sql` files, sorts them, and applies them sequentially. No migration registry table is needed for the test harness (each test creates a fresh database).

---

## 13. API Endpoint Specification

### 13.1 Shipping Methods (Merchant)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/v1/stores/:storeId/shipping-methods` | `merchant:shipping:read` | List store's shipping methods |
| POST | `/v1/stores/:storeId/shipping-methods` | `merchant:shipping:write` | Create shipping method |
| PATCH | `/v1/shipping-methods/:id` | `merchant:shipping:write` | Update shipping method |
| DELETE | `/v1/shipping-methods/:id` | `merchant:shipping:write` | Soft-delete (set is_active=false) |

### 13.2 Delivery Zones (Merchant)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/v1/stores/:storeId/delivery-zones` | `merchant:shipping:read` | List store's delivery zones |
| POST | `/v1/stores/:storeId/delivery-zones` | `merchant:shipping:write` | Create delivery zone |
| PATCH | `/v1/delivery-zones/:id` | `merchant:shipping:write` | Update zone |
| POST | `/v1/delivery-zones/:id/methods` | `merchant:shipping:write` | Assign shipping method to zone |

### 13.3 Shipping Cost (Buyer)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/v1/cart/shipping-estimate` | `orders:write` | Get shipping options for cart |
| GET | `/v1/stores/:storeId/shipping-options?city=X` | public | Get available methods for address |

### 13.4 Shipment Labels (Merchant/Driver)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/v1/shipments/:id/labels` | `fulfillment:labels:write` | Generate shipping label |
| GET | `/v1/shipments/:id/labels` | `fulfillment:labels:read` | List shipment labels |
| POST | `/v1/shipment-labels/:id/presign` | `fulfillment:labels:read` | Get presigned download URL |
| POST | `/v1/shipment-labels/:id/void` | `fulfillment:labels:write` | Void a label |

### 13.5 Delivery Proof (Driver)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/v1/shipments/:id/proof/presign` | `fulfillment:proof:write` | Get presigned upload URL for proof |
| POST | `/v1/shipments/:id/proof/photo` | `fulfillment:proof:write` | Register photo proof |
| POST | `/v1/shipments/:id/proof/signature` | `fulfillment:proof:write` | Register signature proof |
| GET | `/v1/shipments/:id/proofs` | `fulfillment:proof:read` | List shipment proofs |
| POST | `/v1/delivery-proofs/:id/presign` | `fulfillment:proof:read` | Get presigned download URL |

### 13.6 Driver Profiles (Merchant/Admin)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/v1/drivers` | `fulfillment:drivers:read` | List drivers in org |
| GET | `/v1/drivers/:id` | `fulfillment:drivers:read` | Get driver profile |
| POST | `/v1/drivers/:id/profile` | `fulfillment:drivers:write` | Create/update driver profile |
| PATCH | `/v1/drivers/:id/eligibility` | `fulfillment:drivers:write` | Change eligibility status |
| GET | `/v1/drivers/:id/shipments` | `fulfillment:drivers:read` | List driver's active shipments |

### 13.7 Webhooks (Admin/Merchant)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/v1/webhook-endpoints` | `admin:webhooks:read` | List configured endpoints |
| POST | `/v1/webhook-endpoints` | `admin:webhooks:write` | Register webhook endpoint |
| PATCH | `/v1/webhook-endpoints/:id` | `admin:webhooks:write` | Update endpoint |
| DELETE | `/v1/webhook-endpoints/:id` | `admin:webhooks:write` | Remove endpoint |
| POST | `/v1/webhooks/carrier/:providerKey` | public (signature verified) | Carrier inbound webhook |

### 13.8 Enhanced Fulfillment Endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/v1/orders/:id/deliver` | Accept optional proof payload |
| POST | `/v1/orders/:id/assign-driver` | Validate driver eligibility |
| GET | `/v1/orders/master/:id/tracking` | Include labels, proofs, carrier tracking |

---

## 14. Web UI Specification

### 14.1 Merchant Shipping Settings

**New page:** `/merchant/shipping` (under merchant layout)

**Sections:**
1. **Shipping Methods** — table with create/edit/activate/deactivate
2. **Delivery Zones** — map-less zone list (city, postal code) with method assignments
3. **Shipping Preview** — see what buyers would see for a test address

### 14.2 Merchant Order Fulfillment Enhancement

**Existing page:** `/merchant/orders`

**Enhancements:**
- Show shipping method on order card.
- "Generate Label" button for READY shipments.
- Show carrier tracking ID if external carrier.
- "Assign Driver" dropdown shows eligible drivers only (not raw user ID input).

### 14.3 Buyer Checkout Enhancement

**Existing page:** `/checkout`

**Enhancements:**
- After entering address, show available shipping methods per store.
- Each method shows: name, estimated days, cost (or "Free").
- Buyer selects shipping method per store group.
- Shipping cost included in order total.

### 14.4 Buyer Order Tracking Enhancement

**Existing page:** `/orders/[id]`

**Enhancements:**
- Show shipping method used.
- Show carrier tracking ID (clickable if external).
- Show delivery proof thumbnails (photo) after delivery.
- Show signature confirmation status.

---

## 15. Mobile UI Specification

### 15.1 Driver Shipments Enhancement

**Existing screen:** `driver_shipments_screen.dart`

**Enhancements:**
- Show delivery address on shipment card.
- "Navigate" button (opens device maps — M7.3 for in-app maps).
- Photo capture button at delivery time (camera → upload → attach as proof).
- Signature capture widget at delivery time (canvas → render → upload → attach).
- Delivery confirmation dialog with optional proof attachment.

### 15.2 Merchant Orders Enhancement

**Existing screen:** `merchant_orders_screen.dart`

**Enhancements:**
- "Generate Label" button for READY shipments.
- Driver assignment shows eligible driver list (fetched from API).
- Show shipping method and carrier tracking ID.

### 15.3 Buyer Tracking Enhancement

**Existing screen:** `order_detail_screen.dart`

**Enhancements:**
- Show shipping method in tracking section.
- Show delivery proof thumbnails after delivery.
- Show signature confirmation status.

---

## 16. Security Model

### 16.1 Permission Keys (New)

| Permission Key | Description | Roles |
|---------------|-------------|-------|
| `merchant:shipping:read` | View shipping methods/zones | MERCHANT_OWNER, MERCHANT_STAFF |
| `merchant:shipping:write` | Manage shipping methods/zones | MERCHANT_OWNER, MERCHANT_STAFF |
| `fulfillment:labels:read` | View shipment labels | MERCHANT_OWNER, MERCHANT_STAFF, DRIVER |
| `fulfillment:labels:write` | Generate/void labels | MERCHANT_OWNER, MERCHANT_STAFF |
| `fulfillment:proof:read` | View delivery proofs | MERCHANT_OWNER, MERCHANT_STAFF, BUYER (own) |
| `fulfillment:proof:write` | Create delivery proofs | DRIVER |
| `fulfillment:drivers:read` | View driver profiles | MERCHANT_OWNER, MERCHANT_STAFF |
| `fulfillment:drivers:write` | Manage driver eligibility | MERCHANT_OWNER |
| `admin:webhooks:read` | View webhook endpoints | ADMIN, SUPER_ADMIN |
| `admin:webhooks:write` | Manage webhook endpoints | ADMIN, SUPER_ADMIN |

### 16.2 Tenant Isolation

- Shipping methods, delivery zones, labels, proofs are all scoped through `store → org`.
- Driver profiles scoped through `org`.
- Webhook endpoints scoped through `org`.
- All new endpoints use `CallerContext` + `assertStoreInOrg()` or equivalent tenant checks.

### 16.3 Webhook Security

- **Outbound:** HMAC-SHA256 signature in `X-SCS-Signature` header, computed from payload + secret.
- **Inbound:** Per-provider signing secret, HMAC-SHA256 verification.
- **Replay protection:** Timestamp header, reject if > 5 minutes old.
- **Idempotency:** Dedup on (provider_key, delivery_id).

### 16.4 File Upload Security

- Presigned URLs: 15-min expiry (existing `StorageService.MAX_PRESIGN_EXPIRY`).
- MIME validation: enforced at API level (not just client-side).
- File size limits: 10 MB for proofs, 5 MB for labels.
- Bucket allowlist: existing `StorageService.assertBucketAllowed()`.

---

## 17. Concurrency & Idempotency

### 17.1 Shipment Status Transitions

- Same optimistic locking pattern as M7.1: `UPDATE WHERE status = X RETURNING`.
- Concurrent proof uploads: each proof is a separate INSERT (no conflict).
- Label generation: void + create is a two-step operation; use transaction for atomicity.

### 17.2 Shipping Cost Calculation

- Pure function (no side effects) — safe for concurrent calls.
- Shipping method lookup is read-only — no concurrency concern.

### 17.3 Webhook Idempotency

- Inbound webhooks: dedup on (provider_key, external_delivery_id) — store in `webhook_deliveries.metadata`.
- Outbound webhooks: `webhook_deliveries` row created atomically with the domain event; retry is safe.

### 17.4 Driver Assignment

- Check eligibility + concurrent count before assignment.
- Use `SELECT ... FOR UPDATE` on driver profile if concurrent assignment is a concern.
- Assignment is idempotent: re-assigning the same driver is a no-op.

---

## 18. Test Specification

### 18.1 Unit Tests

| Test File | Coverage |
|-----------|----------|
| `shipping-cost.spec.ts` | Cost calculation, free shipping thresholds, minimum order |
| `shipping-provider.spec.ts` | Provider registry, manual provider, status mapping |
| `driver-eligibility.spec.ts` | Eligibility checks, concurrent limits, store access |

### 18.2 Integration Tests (PostgreSQL + Testcontainers)

| Test File | Coverage |
|-----------|----------|
| `m72-shipping-methods.postgres.spec.ts` | CRUD, zone assignment, checkout integration |
| `m72-delivery-zones.postgres.spec.ts` | Zone CRUD, address matching, method availability |
| `m72-labels.postgres.spec.ts` | Label generation, voiding, presigned URLs |
| `m72-delivery-proof.postgres.spec.ts` | Photo/signature proof, delivery with proof |
| `m72-driver-eligibility.postgres.spec.ts` | Profile CRUD, eligibility enforcement |
| `m72-webhook.postgres.spec.ts` | Endpoint CRUD, outbound dispatch, inbound processing |

### 18.3 Security Tests

| Test | Description |
|------|-------------|
| Cross-tenant shipping method access | Merchant A cannot read Merchant B's shipping methods |
| Cross-tenant driver assignment | Cannot assign driver from different org |
| Webhook signature verification | Reject unsigned/tampered webhooks |
| Proof upload authorization | Driver can only upload proof for assigned shipment |
| Label access control | Buyer cannot access label presign URLs |

### 18.4 Concurrency Tests

| Test | Description |
|------|-------------|
| Concurrent label generation | Two simultaneous label requests → one succeeds, one retries |
| Concurrent driver assignment | Two simultaneous assignments → optimistic lock prevents double-assign |
| Webhook replay | Same webhook delivered twice → second is deduplicated |

### 18.5 Regression Tests

- Full existing test suite must continue to pass (1051+ tests).
- TypeScript compilation: `tsc --noEmit` (API + Web + Admin) — 0 errors.
- Flutter: `dart analyze lib test` — 0 errors, `flutter test` — all pass.

---

## 19. Production Release Gate

### 19.1 Criteria

| Criterion | Status |
|-----------|--------|
| All migrations apply cleanly | Required |
| All unit tests pass | Required |
| All integration tests pass | Required |
| All security tests pass | Required |
| All concurrency tests pass | Required |
| Full regression suite passes | Required |
| TypeScript 0 errors (API + Web + Admin) | Required |
| Flutter 0 errors + all tests pass | Required |
| Human UAT guide produced | Required |
| Live-device mobile UAT executed | Condition (may be post-release) |

### 19.2 Release Documents

| Document | Description |
|----------|-------------|
| `SCS-M7.2-HUMAN-UAT-GUIDE.md` | Manual test scenarios for all surfaces |
| `SCS-M7.2-UAT-RESULTS.md` | Automated test results |
| `SCS-M7.2-SECURITY-RESULTS.md` | Security test results |
| `SCS-M7.2-CONCURRENCY-RESULTS.md` | Concurrency test results |
| `SCS-M7.2-FINAL-RELEASE-GATE.md` | Final release verdict |

---

## Appendix A: Out of Scope for M7.2

The following are explicitly **NOT** part of M7.2:

- GPS tracking / live location (M7.3)
- ETA engine / delivery time predictions (M7.3)
- In-app maps integration (M7.3)
- Returns / disputes (M7.5)
- Push/SMS notification templates for shipping (M7.6)
- Multi-package shipments (one shipment = one package in M7.2)
- International shipping (M7.2 is KSA-domestic)
- Carrier rate shopping / cost optimization
- Warehouse-to-warehouse transfers

## Appendix B: Migration Dependency Order

```
0041_shipping.sql
  ├── shipping_methods (depends on: stores)
  ├── delivery_zones (depends on: stores)
  ├── delivery_zone_methods (depends on: delivery_zones, shipping_methods)
  ├── shipments ALTER (add delivery_address, carrier_tracking_id, shipping_method_id, shipping_provider_key)
  ├── shipment_labels (depends on: shipments, users)
  ├── delivery_proofs (depends on: shipments, users)
  ├── driver_profiles (depends on: users, organizations)
  ├── webhook_endpoints (depends on: organizations)
  └── webhook_deliveries (depends on: webhook_endpoints)
```

## Appendix C: Module Dependency Graph

```
ShippingModule (new)
  ├── imports: MerchantModule (stores), OrdersModule (shipments)
  ├── providers: ShippingService, ShippingProviderRegistry
  ├── controllers: ShippingController
  └── depends on: StorageService (labels, proofs), OutboxDispatcher (events)

OrdersModule (enhanced)
  ├── imports: ShippingModule (for shipping cost resolution at checkout)
  └── NOTE: circular dependency risk — resolve via forwardRef() or shared interface
```

**Circular dependency resolution:** DEFERRED — see Section 20.6 for the final decision.

---

## 20. Pre-Implementation Architecture Decisions

This section records every architecture decision resolved during the pre-implementation review. Each decision is verified against the actual repository code, not assumed from documentation.

### 20.1 Fulfillment Method vs Shipping Method

**Decision:** These are two orthogonal concepts. They must NOT be conflated.

**Verified existing model:**
- `orders.fulfillment_method` (VARCHAR(24)) — high-level fulfillment category:
  - `PLATFORM_DELIVERY` — platform manages delivery, fee may apply
  - `MERCHANT_DELIVERY` — merchant arranges own delivery
  - `PICKUP` — buyer collects from store
- This column drives pricing behavior via `resolveDeliveryFeeMinor()` in `order-pricing.ts`.
- It is set once at checkout and immutable on the sub-order.

**New concept — shipping method:**
- `shipping_methods` table — merchant-configured delivery options per store.
- Examples: "Standard Delivery" (STANDARD), "Express Delivery" (EXPRESS), "Same Day" (SAME_DAY).
- Each shipping method has a `fulfillment_method` column linking it to one of the three high-level categories.

**Entity relationship:**
```
stores 1──N shipping_methods N──1 fulfillment_method (enum)
```

**Schema addition to `shipping_methods`:**
```sql
fulfillment_method VARCHAR(24) NOT NULL DEFAULT 'MERCHANT_DELIVERY',
  CONSTRAINT chk_shipping_fulfillment CHECK (
    fulfillment_method IN ('PLATFORM_DELIVERY','MERCHANT_DELIVERY','PICKUP')
  )
```

**Checkout behavior:**
1. Buyer selects a `shipping_method_id` per store group in cart.
2. The shipping method's `fulfillment_method` is written to `orders.fulfillment_method` (the existing column).
3. The `shipping_method_id` is written to the new `shipments.shipping_method_id` column.
4. The shipping fee is resolved from `shipping_methods.base_fee_minor` (not the flat `PLATFORM_DELIVERY_FEE_MINOR`).

**Pricing behavior:**
- `resolveDeliveryFeeMinor()` is extended: if a `shipping_method_id` is provided, use its `base_fee_minor`; otherwise fall back to the existing platform fee logic.
- Free-shipping threshold (`free_above_minor`) is checked against the sub-order subtotal.
- The shipping fee is server-resolved, never client-supplied (prevents price tampering).

**Order snapshot behavior:**
- `orders.fulfillment_method` captures the high-level category at checkout (existing, immutable).
- `shipments.shipping_method_id` captures the specific method (new, immutable once set).
- Together they provide full traceability: what category of fulfillment AND which specific merchant-configured option.

**Shipment behavior:**
- Shipment inherits `fulfillment_method` from the sub-order (already on `orders`).
- Shipment records `shipping_method_id` for label generation, carrier routing, and tracking display.

### 20.2 Driver/Store Relational Assignment

**Decision:** Replace `driver_profiles.store_ids JSONB` with a proper relational table.

**New table:**
```sql
CREATE TABLE IF NOT EXISTS driver_store_assignments (
  id                 UUID PRIMARY KEY,
  driver_profile_id  UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  store_id           UUID NOT NULL REFERENCES stores(id),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_store UNIQUE (driver_profile_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_dsa_profile ON driver_store_assignments(driver_profile_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_dsa_store ON driver_store_assignments(store_id)
  WHERE is_active = true;
```

**Cross-organization enforcement:**
- `driver_profiles.org_id` is the driver's organization.
- `stores.org_id` is the store's organization.
- A CHECK constraint or application-level validation ensures `driver_profiles.org_id = stores.org_id` for every assignment.
- Application-level is preferred (Drizzle doesn't support cross-table CHECK); enforced in `DriverService.assignStore()` via `assertStoreInOrg()`.

**Historical auditability:**
- `is_active = false` rows remain in the table (soft-delete).
- `created_at` / `updated_at` track the assignment lifecycle.
- No `deleted_at` column needed — `is_active` + `updated_at` suffices.

**Assignment query:**
```sql
-- Eligible drivers for a store:
SELECT dp.* FROM driver_profiles dp
JOIN driver_store_assignments dsa ON dsa.driver_profile_id = dp.id
WHERE dsa.store_id = ? AND dsa.is_active = true
  AND dp.eligibility = 'ACTIVE'
  AND dp.org_id = ?;
```

### 20.3 Outbound Webhook Scope Decision

**Decision:** General-purpose outbound merchant webhooks are DEFERRED to a later platform milestone (M8.x — Platform Integrations).

**Rationale from repository audit:**
1. **No existing dependency.** No current module, test, or endpoint requires outbound webhooks. The existing notification infrastructure (NotificationsService + RealtimeGateway) covers buyer/merchant push, SMS, and in-app alerts.
2. **Outbox is sufficient for M7.2.** The `OutboxDispatcher` already publishes domain events (`order.fulfillment.*`, `shipment.*`). These events are available for any future consumer. Adding a webhook dispatcher now would be speculative infrastructure.
3. **M7.2 scope discipline.** M7.2 is about shipping/delivery operations — carrier integration, labels, proof, zones, costs. Merchant-facing webhook configuration is a platform-level integration concern, not a shipping concern.
4. **Realtime covers live updates.** The `RealtimeGateway` already pushes `order.status.changed` events to WebSocket rooms (`user:{id}`, `org:{id}`, `order:{id}`). Connected merchant dashboards and buyer tracking pages receive live updates without webhooks.

**What remains in M7.2:**
- Inbound carrier webhook receiver (`POST /v1/webhooks/carrier/:providerKey`).
- Outbox events for all shipment status changes (existing pattern extended).
- Realtime WebSocket broadcasts for shipment status changes (existing `emitOrderStatusChanged()`).
- Notification templates for shipment events (existing NotificationsService).

**What moves to M8.x:**
- `webhook_endpoints` table.
- `webhook_deliveries` table.
- `WebhookDispatcher` polling service.
- Merchant webhook configuration UI.
- HMAC-signed outbound POST to merchant URLs.

**Why this is safe:** The outbox events are already persisted. When M8.x adds webhook dispatch, it can replay from `outbox_events` — no data is lost by deferring.

### 20.4 Shipping Cost Model

**Verified against actual checkout implementation:**

**Current state (lines 217-221 of `orders.service.ts`):**
```typescript
const platformDeliveryFee = Number(
  process.env['PLATFORM_DELIVERY_FEE_MINOR'] ?? DEFAULT_PLATFORM_DELIVERY_FEE_MINOR,
);
const deliveryFee = resolveDeliveryFeeMinor(fulfillmentMethod, platformDeliveryFee);
```
A single `deliveryFee` value is computed ONCE and applied uniformly to ALL sub-orders (line 310). In a 3-merchant checkout, all three sub-orders get the same delivery fee.

**M7.2 change:**
- The single `deliveryFee` is replaced by per-store shipping cost resolution.
- For each store group in the cart, the checkout looks up the buyer-selected `shipping_method_id`, resolves the fee from `shipping_methods.base_fee_minor` (checking free-shipping threshold), and uses that as the `deliveryFeeMinor` for that sub-order.
- Each sub-order has an independent shipping cost based on its merchant's configured shipping method.

**Master totals verification:**
- `master_orders` has NO `totalMinor` column. The master total is computed on-the-fly by `totalsByCurrency()` which sums `subOrders[].totalMinor` grouped by currency.
- Since each sub-order's `totalMinor` includes its own `deliveryFeeMinor`, the master total automatically reflects per-merchant shipping costs.
- **Verdict: CORRECT.** No master-order schema change needed.

**VAT verification:**
- `computeOrderFinancials()` computes VAT on `taxable = netGoods + deliveryFeeMinor`.
- Each sub-order's VAT includes its own delivery fee in the taxable base.
- **Verdict: CORRECT.** VAT remains accurate per sub-order.

**Merchant net verification:**
- `merchantNetMinor = netGoods - commissionMinor`.
- Commission is taken on net goods only (not delivery fee, not VAT).
- Shipping cost does NOT affect merchant net (it's a buyer-paid fee passed through).
- **Verdict: CORRECT.** Merchant financial isolation maintained.

**Currency verification:**
- Each sub-order has its own `currency` (snapshot from `stores.currency` at checkout).
- Shipping method has its own `currency` (should match the store's currency).
- Validation: `shipping_methods.currency` must equal `stores.currency` for the owning store.
- **Verdict: CORRECT.** Currency isolation maintained.

**Client-tampering prevention:**
- `shipping_method_id` is resolved server-side from `shipping_methods` table.
- The fee is computed from the DB row, never from client input.
- The idempotency fingerprint (`computeCheckoutFingerprint`) must include `shipping_method_id` per store to prevent method substitution on retry.
- **Verdict: SECURE** provided the fingerprint is updated.

**Idempotency verification:**
- The `requestFingerprint` includes `fulfillmentMethod` and `deliveryAddress`.
- M7.2 must extend it to include the per-store `shipping_method_id` selections.
- **Required change:** `computeCheckoutFingerprint()` must incorporate shipping method selections.

### 20.5 Shipment Address Snapshot

**Verified against actual checkout implementation:**

**Current state:**
- `master_orders.delivery_address` is JSONB, written at checkout from `input.deliveryAddress` (line 296).
- Format: `{ street: string, city: string }` (from web checkout page line 51).
- This address is shared across ALL sub-orders of the master order.
- It is immutable once written (no UPDATE path exists for `master_orders.delivery_address`).

**M7.2 design — confirmed:**
- Add `delivery_address` JSONB column to `shipments` table.
- Snapshot occurs in `createShipment()` (called from `acceptOrder()`).
- The snapshot copies from `master_orders.delivery_address` through the sub-order's parent master order.
- Once written, the shipment address is never updated (immutable historical record).

**Snapshot timing verification:**
- `createShipment()` is called during `acceptOrder()`, NOT at checkout.
- Between checkout and accept, the buyer could theoretically change their profile address.
- The master_order address is the checkout-time snapshot (immutable), so the shipment gets the correct checkout-time address regardless of when the shipment is created.
- **Verdict: CORRECT.** The two-level snapshot (master_order at checkout → shipment at accept) preserves historical accuracy.

**Label generation:**
- Labels use `shipments.delivery_address` (the shipment snapshot), never `master_orders.delivery_address`.
- This ensures labels reflect what was agreed at checkout, not a later edit.

**Delivery proof:**
- Proof is associated with `shipments.id`, which has its own address snapshot.
- The proof implicitly references the correct delivery address through the shipment.

**Future structured address support:**
- JSONB allows gradual enrichment: `{ street, city, postalCode, country, phone, lat, lng }`.
- No schema migration needed for new fields (JSONB is self-describing).
- A future migration could add generated columns for indexed lookups if needed.

**Required enhancement:**
- The web checkout page must collect `postalCode` and `phone` in addition to `street` and `city`.
- The mobile checkout screen must collect the same fields.
- The `CheckoutInput.deliveryAddress` type should be documented (but remains JSONB for flexibility).

### 20.6 Carrier Abstraction & Module Dependency

**Verified against NestJS module architecture:**

**Current module dependencies:**
- `StorageModule` is `@Global()` — any module can inject `StorageService` without explicit import.
- `OutboxModule` is `@Global()` — any module can inject `OutboxDispatcher`.
- `DatabaseModule` is `@Global()` — `DatabaseService` available everywhere.
- `NotificationsModule` is explicitly imported by `OrdersModule`.
- `PromotionsModule` is explicitly imported by `OrdersModule`.

**Circular dependency analysis:**
- `OrdersModule` needs `ShippingService` for checkout cost resolution.
- `ShippingModule` needs to read/write shipments (currently in `OrdersModule`).

**Decision: Extract shipping domain into its own module, keep shipments in OrdersModule.**

```
ShippingModule (new)
  ├── providers: ShippingService, ShippingProviderRegistry
  ├── controllers: ShippingController
  ├── imports: MerchantModule (for store validation)
  └── injects: DatabaseService (global), StorageService (global), OutboxDispatcher (global)

OrdersModule (enhanced)
  ├── imports: ShippingModule (for ShippingService injection)
  └── No circular dependency: OrdersModule → ShippingModule, not vice versa
```

**Why no circular dependency:**
- `ShippingModule` does NOT import `OrdersModule`. It accesses shipment data through the shared `DatabaseService` (global) and the Drizzle schema barrel — not through `OrdersService`.
- `OrdersModule` imports `ShippingModule` to inject `ShippingService` for checkout cost resolution.
- The dependency is unidirectional: `OrdersModule → ShippingModule`.

**ShippingProviderRegistry:**
- Registered as a NestJS provider in `ShippingModule`.
- Providers are registered in `onModuleInit()` based on environment configuration.
- `ManualDeliveryProvider` is always registered (default).
- External providers are registered when their API keys are present in env.

**Shared contract:**
- `ShippingProvider` interface and `ShippingCostResolver` interface are defined in `apps/api/src/modules/shipping/shipping.types.ts`.
- These are NOT in `packages/contracts` (which is for cross-app Zod schemas). They are API-internal.

### 20.7 Delivery Zone Model

**Validated against actual address model:**

**Current address data:**
- Checkout collects: `{ street, city }` (web) / `{ street, city }` (mobile).
- Organizations have: `country` CHAR(2).
- Stores have: `address` JSONB (free-form).

**M7.2 zone matching rules:**
1. **City matching:** Case-insensitive, trimmed, diacritic-normalized.
   - `RIYADH` = `Riyadh` = `riyadh`.
   - Implementation: `LOWER(TRIM(city))` in both the zone table and the lookup query.
2. **Postal code matching:** Exact match after trimming and uppercasing.
   - `12345` = `12345`. No wildcard/glob support in M7.2 (deferred to M7.3 if needed).
   - Implementation: `UPPER(TRIM(postal_code))` in both the zone table and the lookup query.
3. **Country matching:** Exact CHAR(2) ISO code comparison.
4. **Normalization at write time:** Zones store pre-normalized values (city lowered+trimmed, postal uppered+trimmed).
5. **Normalization at read time:** Lookup queries normalize the input the same way.

**Deterministic matching:** Given the same input, the same zone set is returned. No ambiguity.

**No GPS/polygons:** Confirmed — M7.2 is city/postal/country only. Geofencing and GPS are M7.3.

### 20.8 Delivery Proof

**Validated against StorageService:**

**StorageService capabilities confirmed:**
- `createPresignedPutUrl(bucket, key, contentType, expiresInSeconds)` — for upload.
- `createPresignedGetUrl(bucket, key, expiresInSeconds)` — for download.
- Bucket allowlist: `scs-media` and `scs-uploads`.
- Max presign expiry: 900 seconds (15 minutes).

**Proof upload flow — confirmed:**
1. Driver requests presign: `POST /v1/shipments/:id/proof/presign` with `{ mimeType, fileName }`.
2. API validates driver is assigned to this shipment.
3. API generates key: `proofs/{shipmentId}/{proofId}/{fileName}`.
4. API returns `{ uploadUrl, storageKey }`.
5. Driver uploads directly to S3 via presigned PUT.
6. Driver confirms: `POST /v1/shipments/:id/proof/photo` (or `/signature`) with `{ storageKey, fileName, mimeType }`.
7. API creates `delivery_proofs` row.

**MIME validation:** Server validates `mimeType` is in allowed set: `image/jpeg`, `image/png`, `image/heic`. Rejected types return 400.

**Size limits:** Enforced at S3 bucket level (content-length header on PUT). API validates `file_size` on confirmation.

**Tenant isolation:** Proof access goes through `shipment → store → org` tenant checks.

**Driver ownership:** Only the assigned driver can create proofs for a shipment. Verified via `shipments.assigned_driver_id = caller.sub`.

**Immutability:** Once created, proof rows are never updated or deleted. The storage object is in S3 with no public access — only presigned URLs.

**Optional vs configurable:**
- Proof is OPTIONAL at delivery time in M7.2 (backward compatible with M7.1).
- A `stores.metadata` JSONB flag `requireDeliveryProof: boolean` allows per-store configuration.
- Default: `false` (proof optional). Merchants can opt in.

### 20.9 Driver Eligibility

**Validated against current identity/RBAC model:**

**Current driver model (verified):**
- Driver = `users` row with `organization_members` entry where `roles.key = 'DRIVER'`.
- Driver belongs to an organization via `organization_members.org_id`.
- Driver permissions: `orders:read`, `fulfillment:shipments:read`, `fulfillment:shipments:pickup`, `fulfillment:shipments:deliver`.
- No dedicated driver profile, no eligibility status, no store assignment.

**M7.2 eligibility algorithm (exact sequence):**

```
assignDriver(orderId, driverId, caller):

1. AUTH: caller has fulfillment:shipments:assign permission (existing guard).

2. TENANT: assertStoreInOrg(caller, storeId) — store belongs to caller's org.

3. ORDER: assertTransition(order.status, 'ASSIGNED') — FSM allows assignment.

4. DRIVER EXISTS: users.id = driverId (throw NotFoundException if not).

5. DRIVER MEMBERSHIP: organization_members WHERE userId=driverId AND orgId=store.orgId
   AND status='ACTIVE' AND role.key='DRIVER' (throw ForbiddenException if not).

6. DRIVER PROFILE: driver_profiles WHERE user_id=driverId
   Auto-create if missing (first assignment bootstraps the profile).

7. ELIGIBILITY: driver_profiles.eligibility = 'ACTIVE'
   (throw ForbiddenException if SUSPENDED or INACTIVE).

8. STORE ASSIGNMENT: driver_store_assignments
   WHERE driver_profile_id=profile.id AND store_id=order.storeId AND is_active=true.
   If no rows: throw ForbiddenException('Driver not assigned to this store').
   (If driver_store_assignments has ZERO rows for this driver at all, they are
   considered assigned to ALL org stores — the "unrestricted" mode.)

9. CONCURRENT LIMIT: COUNT(shipments WHERE assigned_driver_id=driverId
   AND status NOT IN ('DELIVERED','COMPLETED')) < driver_profiles.max_concurrent.
   (throw ConflictException if at limit).

10. ATOMIC ASSIGN: UPDATE shipments SET assigned_driver_id=driverId
    WHERE order_id=orderId AND status IN ('PREPARING','READY').
    (Optimistic lock on shipment status.)
```

**Bypass prevention:**
- Organization isolation: Step 5 ensures driver belongs to same org as store.
- Store access: Step 8 ensures driver is assigned to the specific store.
- Role checks: Step 5 ensures driver has DRIVER role (not BUYER, not MERCHANT_STAFF).
- Active membership: Step 5 checks `organization_members.status = 'ACTIVE'`.
- Suspension: Step 7 checks `driver_profiles.eligibility = 'ACTIVE'`.

### 20.10 Carrier Webhook Architecture

**Validated against API conventions:**

**Inbound webhook endpoint:** `POST /v1/webhooks/carrier/:providerKey`

**Security chain (verified against existing patterns):**
1. **No JWT guard.** This endpoint is public (carrier-initiated). Authentication is via HMAC signature.
2. **HMAC verification:** `X-Signature` header = HMAC-SHA256(body, provider_secret). Provider secrets stored in `shipping_providers.secret` column (or env for initial providers).
3. **Timestamp validation:** `X-Timestamp` header. Reject if `|now - timestamp| > 5 minutes`.
4. **Replay protection:** See deduplication model below.

**Deduplication model — DECISION: Relational unique constraint, NOT JSONB metadata.**

```sql
CREATE TABLE IF NOT EXISTS carrier_webhook_events (
  id                  UUID PRIMARY KEY,
  provider_key        VARCHAR(40) NOT NULL,
  external_delivery_id VARCHAR(200) NOT NULL,
  shipment_id         UUID REFERENCES shipments(id),
  carrier_status      VARCHAR(80) NOT NULL,
  mapped_status       VARCHAR(24),
  payload             JSONB NOT NULL DEFAULT '{}',
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_carrier_webhook UNIQUE (provider_key, external_delivery_id)
);
```

**Why a separate table with UNIQUE constraint:**
- JSONB metadata dedup is application-level (race condition between SELECT and INSERT).
- A UNIQUE constraint on `(provider_key, external_delivery_id)` is database-level (atomic, race-free).
- PostgreSQL raises `23505 unique_violation` on duplicate → catch and return 200 (idempotent).
- This is the same pattern used for `master_orders.idempotency_key` and `favorites(user_id, product_id)`.

**Processing flow:**
1. Receive POST.
2. Verify HMAC signature → 401 if invalid.
3. Verify timestamp → 400 if stale.
4. INSERT into `carrier_webhook_events` → catch unique violation → return 200 (duplicate, already processed).
5. Look up shipment by carrier tracking ID → 404 if not found.
6. Map carrier status to SCS status via provider's `mapStatus()` → skip if unmapped.
7. Validate transition via `assertTransition()` → skip if invalid.
8. Atomic optimistic lock on shipment status.
9. Append `shipment_events` row.
10. Publish outbox event.
11. Return 200.

### 20.11 Migration Strategy

**Verified:**
- Last migration: `0040_shipments.sql`.
- Next migration: `0041_shipping.sql` — **CONFIRMED CORRECT.**
- Migration runner: `apps/api/infra/drizzle/migrate.ts` (reads `_migration_log`, applies new files).
- Test harness: reads all `.sql` files from `infra/drizzle/migrations/`, sorts, applies to fresh Testcontainers PostgreSQL.

**Migration conventions (verified from existing 40 migrations):**
- All DDL uses `IF NOT EXISTS` (idempotent).
- No `INSERT INTO _migration_log` (runner owns bookkeeping).
- Cross-module FK references are accepted practice.
- New columns on existing tables are nullable (no backfill required).
- No destructive changes (no DROP COLUMN, no ALTER COLUMN TYPE).

**0041_shipping.sql dependency order:**
1. `shipping_methods` (depends on: `stores`)
2. `delivery_zones` (depends on: `stores`)
3. `delivery_zone_methods` (depends on: `delivery_zones`, `shipping_methods`)
4. `ALTER shipments` (add `delivery_address`, `carrier_tracking_id`, `shipping_method_id`, `shipping_provider_key`)
5. `shipment_labels` (depends on: `shipments`, `users`)
6. `delivery_proofs` (depends on: `shipments`, `users`)
7. `driver_profiles` (depends on: `users`, `organizations`)
8. `driver_store_assignments` (depends on: `driver_profiles`, `stores`)
9. `carrier_webhook_events` (depends on: `shipments`)

**Fresh database:** All tables created via `CREATE TABLE IF NOT EXISTS`. RBAC seed adds new permissions/roles.

**Existing database upgrade:** `ADD COLUMN IF NOT EXISTS` for new columns on `shipments`. Existing rows get NULL for new columns (acceptable for `delivery_address`, `shipping_method_id`, etc.).

**Rollback considerations:** No destructive changes. Rollback = drop new tables + ignore new columns. Existing data is unaffected.

### 20.12 API Boundary Decisions

**Principle:** Shipment-scoped routes for shipment-specific operations. Order-scoped routes for order lifecycle operations.

**Order-scoped (remain on `/v1/orders/:id/...`):**
- `POST /v1/orders/:id/accept` — order lifecycle
- `POST /v1/orders/:id/prepare` — order fulfillment transition
- `POST /v1/orders/:id/ready` — order fulfillment transition
- `POST /v1/orders/:id/assign-driver` — order fulfillment transition
- `POST /v1/orders/:id/pickup` — order fulfillment transition
- `POST /v1/orders/:id/out-for-delivery` — order fulfillment transition
- `POST /v1/orders/:id/deliver` — order fulfillment transition
- `GET /v1/orders/master/:id/tracking` — buyer tracking (aggregates across sub-orders)

**Shipment-scoped (new routes on `/v1/shipments/:id/...`):**
- `POST /v1/shipments/:id/labels` — label generation
- `GET /v1/shipments/:id/labels` — list labels
- `POST /v1/shipments/:id/proof/presign` — presigned upload for proof
- `POST /v1/shipments/:id/proof/photo` — register photo proof
- `POST /v1/shipments/:id/proof/signature` — register signature proof
- `GET /v1/shipments/:id/proofs` — list proofs

**Rationale:** Labels and proofs are shipment artifacts, not order artifacts. The 1:1 shipment-sub-order relationship means they're effectively equivalent, but the API should model the conceptual ownership correctly.

**Driver-scoped (remain on `/v1/drivers/...`):**
- `GET /v1/drivers/shipments` — driver's assigned shipments (existing M7.1)
- `GET /v1/drivers` — list drivers in org (new)
- `GET /v1/drivers/:id` — driver profile (new)
- `PATCH /v1/drivers/:id/eligibility` — change eligibility (new)

**Webhook routes (no auth guard, HMAC verified):**
- `POST /v1/webhooks/carrier/:providerKey` — carrier inbound

**Permission naming convention (verified against existing 52 permissions):**
- Pattern: `module:resource:action`
- New permissions follow this pattern:
  - `merchant:shipping:read` / `merchant:shipping:write`
  - `fulfillment:labels:read` / `fulfillment:labels:write`
  - `fulfillment:proof:read` / `fulfillment:proof:write`
  - `fulfillment:drivers:read` / `fulfillment:drivers:write`

**Route ordering invariant (verified from memory):**
- Literal paths MUST precede parameterized paths sharing a prefix.
- `/v1/webhooks/carrier/:providerKey` must be registered AFTER any literal `/v1/webhooks/...` paths.
- `/v1/shipments/:id/labels` must be registered after any literal `/v1/shipments/...` paths.

### 20.13 Web Architecture

**Existing pages to extend (verified):**

| Page | File | M7.2 Enhancement |
|------|------|------------------|
| Merchant Orders | `app/merchant/orders/page.tsx` (622 lines) | Add shipping method display, label generation, driver dropdown |
| Merchant Order Detail | `app/merchant/orders/[id]/page.tsx` (413 lines) | Add label section, proof display, carrier tracking |
| Buyer Order Detail | `app/orders/[id]/page.tsx` | Add shipping method, proof thumbnails, carrier tracking link |
| Checkout | `app/checkout/page.tsx` (176 lines) | Add shipping method selection per store, address enhancement |
| Merchant Layout | `app/merchant/layout.tsx` (113 lines) | Add "Shipping" nav item |

**New page:**
- `app/merchant/shipping/page.tsx` — shipping methods + delivery zones management.

**API client:** All new functions added to `lib/buyer-api.ts` (existing pattern — no separate shipping API client).

**No duplication:**
- Models/types added to existing `buyer-api.ts` type exports.
- UI components use existing `@scs/ui-kit` primitives (Card, Button, TextInput, Select).
- State management uses existing React `useState`/`useEffect` pattern (no new state library).

### 20.14 Mobile Architecture

**Existing files to modify (verified):**

| Screen | File | M7.2 Enhancement |
|--------|------|------------------|
| Driver Shipments | `screens/driver/driver_shipments_screen.dart` (280 lines) | Add proof capture (photo/signature), delivery address display |
| Merchant Orders | `screens/merchant/merchant_orders_screen.dart` (500 lines) | Add driver dropdown, label button |
| Order Detail | `screens/orders/order_detail_screen.dart` (557 lines) | Add shipping method, proof display |
| Checkout | `screens/cart/checkout_screen.dart` (496 lines) | Add shipping method selection, address fields |
| Home | `screens/home/home_screen.dart` (517 lines) | No change needed |

**New files:**
- `screens/merchant/shipping_settings_screen.dart` — shipping methods management.
- `widgets/signature_pad_widget.dart` — CustomPainter-based signature capture.

**Dependencies to add (pubspec.yaml):**
- `image_picker: ^1.0.0` — camera/gallery photo capture for delivery proof.
- NO signature package needed — CustomPainter is sufficient for signature capture.

**Existing dependencies leveraged:**
- `file_picker: ^8.1.0` — already present, can be used as fallback for photo selection.
- `cached_network_image: ^3.3.1` — already present, used for proof thumbnail display.
- `dio` (via api_service.dart) — presigned URL upload.

**Riverpod conventions:**
- New providers added to `providers/providers.dart`.
- `FutureProvider.autoDispose` for one-shot fetches (existing pattern).
- `StateNotifierProvider` for mutable state (if needed).

**Routing:**
- New routes added to `router/router.dart`.
- Merchant shipping settings: `/merchant/shipping` (under merchant shell).

### 20.15 Module Dependency Graph (Final)

```
AppModule
  ├── DatabaseModule (@Global)
  ├── RedisModule (@Global)
  ├── OutboxModule (@Global)
  ├── StorageModule (@Global)
  ├── RealtimeModule (@Global)
  │
  ├── IdentityModule
  ├── MerchantModule
  │     └── imports: IdentityModule
  ├── CatalogModule
  │     └── imports: MerchantModule
  ├── InventoryModule
  │     └── imports: CatalogModule, MerchantModule
  ├── PricingModule
  │     └── imports: CatalogModule, MerchantModule
  ├── PromotionsModule
  ├── ShippingModule (NEW)
  │     └── imports: MerchantModule
  ├── OrdersModule
  │     └── imports: PromotionsModule, NotificationsModule, ShippingModule (NEW)
  ├── NotificationsModule
  ├── ReviewsModule
  ├── AnalyticsModule
  ├── AuditModule
  ├── AdminModule
  ├── CatalogImportModule
  └── SupportModule
```

**Dependency direction:** `OrdersModule → ShippingModule` (unidirectional, no cycle).

**ShippingModule does NOT import OrdersModule.** It accesses shipment data through `DatabaseService` (global) and the Drizzle schema barrel.

---

## 21. M7.2 Implementation Sequence

### M7.2.1 — Database + Shipping Domain Foundation

**Scope:**
1. Migration `0041_shipping.sql` — all new tables.
2. Drizzle schema files: `shipping.schema.ts` (new), update `shipment.schema.ts`.
3. Update Drizzle barrel `schema.ts`.
4. RBAC seed update — new permissions, role assignments.
5. `ShippingModule` skeleton (module, service, controller, types).
6. `ShippingProvider` interface + `ManualDeliveryProvider` + `ShippingProviderRegistry`.
7. Unit tests for provider registry.

**Exit criteria:** Migration applies cleanly. Schema barrel compiles. RBAC seed includes new permissions. ShippingModule instantiates.

### M7.2.2 — Shipping Methods + Delivery Zones + Shipping Cost

**Scope:**
1. `ShippingService` — CRUD for shipping methods and delivery zones.
2. `ShippingController` — merchant-facing endpoints.
3. Delivery zone matching logic (city/postal normalization).
4. Shipping cost resolution function.
5. Checkout integration — per-store shipping cost (replace flat `deliveryFee`).
6. Fingerprint update — include shipping method in `computeCheckoutFingerprint()`.
7. Web merchant shipping settings page.
8. Web checkout shipping method selection.
9. Integration tests: shipping methods, zones, cost resolution, checkout.

**Exit criteria:** Merchant can configure shipping methods and zones. Buyer sees shipping options at checkout. Shipping cost flows through to sub-order totals correctly.

### M7.2.3 — Carrier Abstraction + Manual Provider

**Scope:**
1. `ManualDeliveryProvider` full implementation.
2. `ShippingProviderRegistry` `onModuleInit()` registration.
3. Shipment creation enhanced with `shipping_provider_key` and `delivery_address` snapshot.
4. `createShipment()` copies address from master order.
5. Unit tests for manual provider.

**Exit criteria:** Shipment creation records provider key and address snapshot. Manual provider is the default for all shipments.

### M7.2.4 — Shipping Labels

**Scope:**
1. `shipment_labels` Drizzle schema.
2. Label generation endpoint (placeholder for manual provider, PDF stub).
3. Label listing, voiding, presigned download.
4. Web merchant UI: "Generate Label" button, label list on order detail.
5. Integration tests: label lifecycle, voiding, tenant isolation.

**Exit criteria:** Merchant can generate and void labels. Labels are stored in S3 with presigned access.

### M7.2.5 — Driver Profiles + Store Assignments + Eligibility

**Scope:**
1. `driver_profiles` + `driver_store_assignments` Drizzle schema.
2. Driver profile CRUD endpoints.
3. Driver eligibility enforcement in `assignDriver()`.
4. Store assignment management endpoints.
5. Web merchant UI: driver management, store assignment.
6. Integration tests: eligibility rules, concurrent limits, cross-org rejection.

**Exit criteria:** Driver assignment validates eligibility, store access, and concurrent limits. Cross-org assignment is rejected.

### M7.2.6 — Delivery Proof

**Scope:**
1. `delivery_proofs` Drizzle schema.
2. Proof presign, photo register, signature register endpoints.
3. MIME validation, size limits, driver ownership checks.
4. `deliverOrder()` enhanced with optional proof parameter.
5. Mobile: `image_picker` dependency, signature pad widget, proof capture UI.
6. Integration tests: proof lifecycle, unauthorized access rejection.

**Exit criteria:** Driver can capture photo/signature proof at delivery. Proof is stored immutably in S3.

### M7.2.7 — Carrier Inbound Webhook / Status Synchronization

**Scope:**
1. `carrier_webhook_events` Drizzle schema (UNIQUE constraint for dedup).
2. `POST /v1/webhooks/carrier/:providerKey` endpoint (no JWT, HMAC verified).
3. HMAC signature verification, timestamp validation.
4. Provider status mapping.
5. Shipment status update via optimistic lock.
6. Shipment event append.
7. Outbox event publication.
8. Integration tests: valid webhook, invalid signature, replay dedup, unknown status.

**Exit criteria:** Carrier webhook receiver processes valid webhooks, rejects invalid signatures, deduplicates replays.

### M7.2.8 — Web UI

**Scope:**
1. Merchant shipping settings page (`/merchant/shipping`).
2. Merchant orders page enhancement (shipping method, labels, driver dropdown).
3. Merchant order detail enhancement (label section, proof display, tracking).
4. Buyer checkout enhancement (shipping method selection, address fields).
5. Buyer order detail enhancement (shipping method, proof, tracking).
6. All new API functions in `buyer-api.ts`.

**Exit criteria:** All web surfaces functional. No UI regressions.

### M7.2.9 — Mobile UI

**Scope:**
1. Driver shipments screen enhancement (address, proof capture).
2. Merchant orders screen enhancement (driver dropdown, labels).
3. Order detail screen enhancement (shipping method, proof).
4. Checkout screen enhancement (shipping method, address fields).
5. Shipping settings screen (merchant).
6. Signature pad widget.
7. All new API methods in `api_service.dart`.
8. New models in `models.dart`.
9. New providers in `providers.dart`.
10. Route updates in `router.dart`.

**Exit criteria:** All mobile surfaces functional. `dart analyze` 0 errors. `flutter test` all pass.

### M7.2.10 — Security + Concurrency + Idempotency

**Scope:**
1. Cross-tenant shipping method access tests.
2. Cross-tenant driver assignment tests.
3. Webhook signature verification tests.
4. Proof upload authorization tests.
5. Label access control tests.
6. Concurrent label generation tests.
7. Concurrent driver assignment tests.
8. Webhook replay dedup tests.
9. Checkout shipping cost tampering tests.

**Exit criteria:** All security and concurrency tests pass.

### M7.2.11 — Regression + Human UAT

**Scope:**
1. Full existing test suite (1051+ tests) — must pass.
2. `tsc --noEmit` (API + Web + Admin) — 0 errors.
3. `dart analyze lib test` — 0 errors.
4. `flutter test` — all pass.
5. Human UAT guide document (22+ scenarios).
6. UAT results document.

**Exit criteria:** Zero regressions. Human UAT guide produced.

### M7.2.12 — Final Release Gate

**Scope:**
1. Security test results document.
2. Concurrency test results document.
3. Final release gate document.
4. Condition documentation (live-device mobile UAT if not executed).

**Exit criteria:** Release gate verdict issued (PASS / PASS WITH CONDITIONS / FAIL).
