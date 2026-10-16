# DRIVER Role — M7.3-B.6 Investigation & Decision Record

**Milestone:** M7.3-B.6 — Ship-Ops Visibility
**Baseline:** develop @ `5c6649d` (working HEAD `d554fd7`)
**Date:** 2026-10-02
**Status:** Decision — **DO NOT activate a new DRIVER web surface in M7.3-B.6.** DRIVER stays mobile-only and remains an explicitly deferred, documented capability.

---

## 1. Why this is a decision, not a feature

The M7.3-B.6 brief scopes the milestone to *Ship-Ops Visibility* for **admin, merchant
and buyer** surfaces only. DRIVER is called out as item 4: *investigate and document,
do not activate without documenting the decision.* This record is that documentation.

---

## 2. Verified current state

### 2.1 Database support — PRESENT

- The `DRIVER` role is seeded in the canonical production seed
  `apps/api/infra/drizzle/seed-pg.ts` with a focused permission set:
  `orders:read`, `fulfillment:shipments:read`, `fulfillment:shipments:pickup`,
  `fulfillment:shipments:deliver`, `fulfillment:proof:read`, `fulfillment:proof:write`.
- `shipments.assigned_driver_id` persists the driver assignment; `shipment_events`
  records `actor_type = 'DRIVER'` transitions.

### 2.2 API support — PRESENT

- `GET  /v1/drivers/shipments` → `listDriverShipments` (perm `fulfillment:shipments:read`).
- `POST /v1/orders/:id/assign-driver` → merchant assigns a driver (perm `fulfillment:shipments:assign`).
- `POST /v1/orders/:id/pickup`, `POST /v1/orders/:id/out-for-delivery` (perm `fulfillment:shipments:pickup`).
- `POST /v1/orders/:id/deliver` (perm `fulfillment:shipments:deliver`).
- The service enforces that a `DRIVER` caller may act only on a shipment assigned to
  them (`orders.service.ts` — driver-assignment check; `DRIVER_ROLES` allow-lists for
  driver + admin/super-admin). Delivery auto-resolves an open exception and transitions
  the order.

### 2.3 Mobile support — PRESENT (this is the DRIVER operational surface)

- `mobile/lib/screens/driver/driver_shipments_screen.dart` renders the driver's queue and
  wires `pickupOrder`, `outForDelivery`, `deliverOrder` to the API above.
- `home_screen.dart` shows a driver section only when `role == 'DRIVER'`.
- `router/router.dart` guards `/driver` routes to `DRIVER` (or admin).
- `api_service.dart` implements `listDriverShipments`, `assignDriver`, `pickupOrder`,
  `outForDelivery`, `deliverOrder`.
- `core/app_flavor.dart` has a dedicated `driver` flavor.

### 2.4 RBAC provisioning — PARTIAL / GAP

- The admin Users console (`apps/admin/src/components/EntityActions.tsx`,
  `UserMemberships` → `admin/users/:id/assign-role`) can attach **any** seeded role,
  including `DRIVER`, to an existing user within an organization. So *provisioning a
  DRIVER onto a user is possible* through the admin UI today.
- **However** there is no driver onboarding/registration flow, no dedicated
  "create driver" affordance, and no web (admin/merchant/buyer) driver *operational*
  surface. Reaching the DRIVER workflow requires: an existing user → an active
  organization membership with the `DRIVER` role → assignment to a shipment → the
  **mobile** app. Login/role projection works, but the discovery and provisioning path
  is implicit and mobile-dependent.

---

## 3. Decision

**Do not build a new DRIVER web console in M7.3-B.6.** Rationale:

1. Out of milestone scope — M7.3-B.6 is admin/merchant/buyer ship-ops visibility.
2. The DRIVER operational capability already exists and is exercised end-to-end in
   **mobile** against the same backend, so there is no *missing* delivery-execution path.
3. Introducing a parallel web driver surface would duplicate mobile, add new scope, and
   require provisioning/onboarding decisions that belong in their own milestone.

This milestone therefore **only documents** DRIVER and makes no backend or RBAC change
for it. No `@RequirePermission`, seed, or route behaviour for DRIVER was modified.

---

## 4. Recommendation for a future milestone (M7.3-B.7+ / DRIVER provisioning)

If DRIVER parity on web is wanted later, the delta is:

1. **Provisioning UX** — an explicit driver-invite/registration + org-membership flow so
   a DRIVER can be created without hand-inserting `organization_members` rows.
2. **Web driver console** — a `role === 'DRIVER'` surface consuming the existing
   `GET /v1/drivers/shipments` + pickup/out-for-delivery/deliver endpoints (parity with
   mobile), behind the already-seeded permissions.
3. **Delivery-proof** UI for `fulfillment:proof:read|write` (currently mobile-oriented).

No new backend endpoints are required for (2) — the API already exists; only client
surfaces and provisioning workflows are missing.
