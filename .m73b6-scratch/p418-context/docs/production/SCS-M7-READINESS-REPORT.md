# SCS Platform — M7 Readiness Report

**Date:** 2026-09-27  
**Predecessor:** M6.2 (PASS)  
**Status:** Ready for M7 scope definition  

---

## 1. Current Platform Capabilities

### Catalog

| Capability | Status |
|---|---|
| Canonical products (GTIN/EAN/MPN dedup) | DELIVERED |
| Product types + attribute builder | DELIVERED |
| Variants (dimension-based matrix) | DELIVERED |
| Dynamic search facets | DELIVERED |
| Product media (presigned S3 URLs) | DELIVERED |
| Catalog import (Excel) | DELIVERED |
| Product moderation (admin) | DELIVERED |

### Merchant Offers

| Capability | Status |
|---|---|
| Merchant offer creation + lifecycle | DELIVERED |
| Offer-owned pricing (price_lists + price_tiers) | DELIVERED |
| Offer suspend / withdraw | DELIVERED |
| Offer analytics (CSV export) | DELIVERED |
| Multi-seller PDP (OfferComparisonTable) | DELIVERED |

### Inventory

| Capability | Status |
|---|---|
| Warehouses + inventory items | DELIVERED |
| Stock movements (ADJUST/RESERVE/RELEASE/SALE) | DELIVERED |
| SELECT ... FOR UPDATE concurrency | DELIVERED |
| Stock settlement on order transitions | DELIVERED |
| Cross-tenant isolation | DELIVERED |

### Cart & Checkout

| Capability | Status |
|---|---|
| Multi-merchant cart (offer-scoped uniqueness) | DELIVERED |
| MOQ enforcement | DELIVERED |
| Price tampering prevention | DELIVERED |
| Checkout idempotency (fingerprint) | DELIVERED |
| Offer snapshot immutability | DELIVERED |
| Currency snapshot | DELIVERED |

### Orders

| Capability | Status |
|---|---|
| Master order + sub-orders | DELIVERED |
| 16-status FSM (DRAFT → DELIVERED) | DELIVERED |
| Merchant acceptance (with stock reservation) | DELIVERED |
| Rejection / cancellation (with stock release) | DELIVERED |
| Transactional outbox | DELIVERED |
| Order status history | DELIVERED |

### Web App

| Capability | Status |
|---|---|
| Buyer search + PDP + offer selection | DELIVERED |
| Cart + multi-merchant checkout | DELIVERED |
| Order detail + timeline | DELIVERED |
| Merchant offer management | DELIVERED |
| Merchant inventory management | DELIVERED |
| Merchant order management | DELIVERED |
| Merchant pricing management | DELIVERED |

### Mobile App

| Capability | Status |
|---|---|
| Buyer search + PDP + offer selection | DELIVERED |
| Cart + checkout | DELIVERED |
| Order detail + timeline | DELIVERED |
| Merchant dashboard (KPI + low-stock) | DELIVERED |
| Merchant offers + inventory | DELIVERED |
| Merchant order accept/reject | DELIVERED |

### Admin Console

| Capability | Status |
|---|---|
| Organization management | DELIVERED |
| Product moderation | DELIVERED |
| Product type builder | DELIVERED |
| Role/permission management | DELIVERED |

---

## 2. Recommended M7 Scope

M7 focuses on **order fulfillment, shipping, and post-purchase lifecycle** — the capabilities needed to take a B2B order from acceptance through delivery and handle exceptions.

---

### M7.1 — Order Lifecycle & Fulfillment

**Objective:** Extend the order FSM to cover the full fulfillment pipeline from merchant acceptance through delivery.

**Business Capability:** Merchants can track orders through preparation, pickup, and delivery stages. Buyers can see real-time order progress.

**Database Entities Required:**
- `shipments` — shipment records linked to sub-orders
- `shipment_events` — tracking events (picked_up, in_transit, delivered)
- Extend `orders` with `shipment_id` FK

**APIs Required:**
- `POST /v1/orders/:id/prepare` — merchant marks order as preparing
- `POST /v1/orders/:id/ready` — merchant marks order as ready for pickup
- `POST /v1/orders/:id/assign-driver` — assign delivery
- `POST /v1/orders/:id/pickup` — driver confirms pickup
- `POST /v1/orders/:id/deliver` — driver confirms delivery
- `GET /v1/orders/:id/tracking` — buyer tracking endpoint

**Web UI Required:**
- Merchant order fulfillment workspace (prepare → ready → assign)
- Buyer order tracking page with timeline

**Mobile UI Required:**
- Merchant: prepare/ready buttons on order detail
- Driver: pickup/deliver confirmation screens

**State Machine Changes:**
- Add transitions: ACCEPTED → PREPARING → READY → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
- Add COMPLETED (final, after delivery confirmation window)

**Security Implications:**
- Driver role needs new permissions (pickup/deliver actions)
- Tenant isolation on shipment events

**Inventory Implications:**
- DELIVERED triggers SALE movement (already implemented via `settleStockForStatus`)

**Dependencies:**
- M6.2 (clean baseline)
- Driver role/permission seed data

**Acceptance Criteria:**
- Full FSM transition chain from ACCEPTED to DELIVERED
- Shipment events recorded and queryable
- Buyer can view tracking timeline
- Merchant can prepare/ready orders
- Driver can confirm pickup/delivery

---

### M7.2 — Shipping / Delivery

**Objective:** Implement shipping label generation, carrier integration, and delivery confirmation.

**Business Capability:** Orders can be shipped via integrated carriers with tracking numbers. Delivery confirmation triggers order completion.

**Database Entities Required:**
- `shipping_labels` — carrier, tracking_number, label_url
- `delivery_confirmations` — photo_url, signed_by, confirmed_at
- Extend `shipments` with carrier integration fields

**APIs Required:**
- `POST /v1/shipments/:id/label` — generate shipping label
- `POST /v1/shipments/:id/track` — webhook for carrier tracking updates
- `POST /v1/shipments/:id/confirm-delivery` — delivery confirmation

**Web UI Required:**
- Shipping label generation in merchant workspace
- Tracking number display on order detail

**Mobile UI Required:**
- Driver: photo capture for delivery confirmation
- Driver: signature capture

**State Machine Changes:**
- OUT_FOR_DELIVERY → DELIVERED requires delivery confirmation
- Auto-transition to COMPLETED after 24h if no dispute

**Security Implications:**
- Carrier webhook signature verification
- Delivery photo storage (S3 presigned URLs)

**Inventory Implications:**
- None (stock already settled at DELIVERED)

**Dependencies:**
- M7.1 (shipment entity)
- Carrier API integration (or mock for pilot)

**Acceptance Criteria:**
- Shipping label can be generated (or mock)
- Tracking number visible to buyer
- Delivery confirmation with photo/signature
- Auto-complete after delivery window

---

### M7.3 — Buyer Tracking

**Objective:** Provide buyers with real-time order tracking visibility.

**Business Capability:** Buyers can see their order's current status, location, and estimated delivery time.

**Database Entities Required:**
- Extend `shipment_events` with `location` (PostGIS point)
- `delivery_estimates` — ETA calculation cache

**APIs Required:**
- `GET /v1/orders/:id/tracking` — full tracking timeline
- `GET /v1/orders/:id/eta` — estimated delivery time
- WebSocket: `order.tracking.update` — real-time push

**Web UI Required:**
- Order tracking page with map (if location available)
- Timeline visualization of shipment events

**Mobile UI Required:**
- Order tracking screen with push notifications
- Map view for active deliveries

**State Machine Changes:**
- None (uses existing FSM statuses)

**Security Implications:**
- Buyer can only see their own orders (existing tenant isolation)
- Location data privacy

**Inventory Implications:**
- None

**Dependencies:**
- M7.1 (shipment events)
- M7.2 (carrier tracking webhooks)

**Acceptance Criteria:**
- Buyer sees full tracking timeline
- ETA displayed when available
- Real-time updates via WebSocket
- Map view for active deliveries (optional for pilot)

---

### M7.4 — Merchant Fulfillment Workspace

**Objective:** Build a dedicated merchant workspace for managing order fulfillment operations.

**Business Capability:** Merchants have a single workspace to see pending orders, prepare them, mark ready, and hand off to delivery.

**Database Entities Required:**
- `fulfillment_batches` — group orders for batch preparation
- Extend `orders` with `fulfillment_batch_id`

**APIs Required:**
- `GET /v1/merchant/fulfillment/queue` — pending orders queue
- `POST /v1/merchant/fulfillment/batch` — create fulfillment batch
- `POST /v1/merchant/fulfillment/batch/:id/prepare` — batch prepare
- `POST /v1/merchant/fulfillment/batch/:id/ready` — batch ready

**Web UI Required:**
- Fulfillment queue page (sortable, filterable)
- Batch preparation workflow
- Print packing slips

**Mobile UI Required:**
- Simplified fulfillment view for merchant staff
- Prepare/ready actions

**State Machine Changes:**
- None (uses existing FSM transitions)

**Security Implications:**
- Merchant staff permissions (fulfillment role)
- Batch operations scoped to merchant's store

**Inventory Implications:**
- Stock already reserved at ACCEPTED
- Fulfillment workspace shows reserved stock status

**Dependencies:**
- M7.1 (fulfillment FSM states)

**Acceptance Criteria:**
- Merchant sees pending orders in fulfillment queue
- Can batch-prepare multiple orders
- Can mark orders ready for pickup
- Packing slip generation

---

### M7.5 — Cancellation / Returns / Disputes

**Objective:** Implement order cancellation, return requests, and dispute resolution.

**Business Capability:** Buyers can cancel orders, request returns, and file disputes. Merchants and admins can resolve them.

**Database Entities Required:**
- `return_requests` — order_item_id, reason, status, resolution
- `disputes` — order_id, type, status, resolution, evidence
- Extend `orders` with cancellation reason

**APIs Required:**
- `POST /v1/orders/:id/cancel` — buyer cancellation (with reason)
- `POST /v1/orders/:id/return-request` — buyer requests return
- `POST /v1/disputes` — file a dispute
- `PATCH /v1/disputes/:id/resolve` — admin resolves dispute
- `POST /v1/returns/:id/approve` — merchant approves return
- `POST /v1/returns/:id/reject` — merchant rejects return

**Web UI Required:**
- Buyer: cancel/return buttons on order detail
- Merchant: return request management
- Admin: dispute resolution workspace

**Mobile UI Required:**
- Buyer: cancel/return actions
- Merchant: return request notifications

**State Machine Changes:**
- Add DISPUTED status (already defined in FSM)
- Cancellation from more statuses (currently limited)
- Return creates a parallel resolution flow

**Security Implications:**
- Return/dispute evidence storage (S3)
- Admin-only dispute resolution
- Merchant return approval within SLA

**Inventory Implications:**
- Cancellation → RELEASE stock (already implemented)
- Return → ADJUST stock (increase on_hand) + RETURN movement
- Dispute resolution may require stock adjustment

**Dependencies:**
- M7.1 (order lifecycle)
- Notification system (return/dispute notifications)

**Acceptance Criteria:**
- Buyer can cancel before acceptance
- Buyer can request returns after delivery
- Merchant can approve/reject returns
- Admin can resolve disputes
- Stock correctly adjusted on return
- All transitions logged in order_status_history

---

### M7.6 — Notifications

**Objective:** Implement comprehensive notification delivery across channels (in-app, email, push, SMS).

**Business Capability:** Users receive timely notifications for order status changes, returns, disputes, and system events.

**Database Entities Required:**
- Extend `notifications` with channel-specific delivery tracking
- `notification_preferences` — per-user channel preferences
- `notification_templates` — configurable message templates

**APIs Required:**
- `GET /v1/notifications` — list user notifications
- `POST /v1/notifications/:id/read` — mark as read
- `POST /v1/notifications/preferences` — update preferences
- Internal: notification dispatch service (outbox consumer)

**Web UI Required:**
- Notification bell with unread count
- Notification dropdown/page
- Preferences settings page

**Mobile UI Required:**
- Push notification handling (FCM)
- In-app notification list
- Badge count

**State Machine Changes:**
- None

**Security Implications:**
- Notification content must not leak cross-tenant data
- Push token management (device → user mapping)

**Inventory Implications:**
- Low-stock alert notifications (already scaffolded)

**Dependencies:**
- Outbox dispatcher (already implemented)
- FCM integration (mobile)
- SMTP configuration (email)

**Acceptance Criteria:**
- Order status changes trigger notifications
- Email delivery for order confirmations
- Push notifications on mobile
- In-app notification list with read/unread
- User can configure notification preferences

---

### M7.7 — M7 Production UAT & Release Gate

**Objective:** Comprehensive production verification of all M7 capabilities.

**Business Capability:** Confidence that M7 features work correctly across API, Web, Mobile, and production deployment.

**Deliverables:**
- M7 automated regression suite (API scripts)
- M7 security regression (tenant isolation for new endpoints)
- M7 concurrency tests (fulfillment batch races, return/dispute concurrent resolution)
- M7 web UAT (browser agent)
- M7 mobile live-device UAT (physical device or emulator)
- M7 production deployment verification
- M7 final release gate document

**Acceptance Criteria:**
- All M7.1-M7.6 features pass automated tests
- Security regression: 0 cross-tenant leaks
- Concurrency: 0 race conditions
- Mobile live-device UAT executed (not code inspection only)
- Production migration applied cleanly
- Release gate: PASS

---

## 3. M7 Dependency Graph

```
M7.1 Order Lifecycle & Fulfillment
  ↓
M7.2 Shipping / Delivery
  ↓
M7.3 Buyer Tracking (depends on M7.1 + M7.2)
  
M7.4 Merchant Fulfillment Workspace (depends on M7.1)

M7.5 Cancellation / Returns / Disputes (independent, but benefits from M7.1)

M7.6 Notifications (independent, but all milestones benefit)

M7.7 Production UAT (depends on all above)
```

---

## 4. Why M7 Is the Next Logical Capability Boundary

M6 delivered the **supply side** of the marketplace: merchants can publish products, create offers, manage inventory, and accept orders. The platform now has a complete catalog-to-order pipeline.

However, the order lifecycle currently ends at merchant acceptance. The platform cannot:
- Track orders through fulfillment stages
- Generate shipping labels
- Handle delivery confirmation
- Process returns or disputes
- Notify users about order progress

M7 closes this gap by extending the order lifecycle from acceptance through delivery and exception handling. This is the minimum capability needed for a B2B pilot where:
- Buyers expect order tracking
- Merchants need fulfillment workflows
- Returns and disputes are inevitable in real commerce
- Notifications are essential for order visibility

Without M7, the platform can accept orders but cannot complete the physical fulfillment cycle. M7 is the bridge between "order placed" and "order fulfilled."

---

## 5. M7 Estimated Scope

| Milestone | Entities | APIs | Web Pages | Mobile Screens | Tests |
|---|---|---|---|---|---|
| M7.1 Fulfillment | 2 new | 6 | 2 | 3 | ~20 |
| M7.2 Shipping | 2 new | 3 | 1 | 2 | ~10 |
| M7.3 Tracking | 1 extend | 3 | 1 | 1 | ~8 |
| M7.4 Workspace | 1 new | 4 | 2 | 1 | ~10 |
| M7.5 Returns | 2 new | 6 | 3 | 2 | ~15 |
| M7.6 Notifications | 2 new | 4 | 2 | 1 | ~12 |
| M7.7 UAT | — | — | — | — | ~30 |
| **Total** | **~10** | **~28** | **~11** | **~10** | **~105** |
