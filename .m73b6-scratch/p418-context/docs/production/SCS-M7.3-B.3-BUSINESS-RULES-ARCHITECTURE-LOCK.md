# SCS Platform — M7.3-B.3 Business Rules & Architecture Lock

**Milestone:** M7.3-B.3 — Carrier Cancellation & Carrier Reconciliation
**Phase:** **B.3.0 — DECISION-LOCK ONLY**
**Status:** **M7.3-B.3.0 — DECISION-LOCK COMPLETE**
**Recommendation:** Implementation MAY begin at **M7.3-B.3.1**.

> This document is a decision-lock artifact. No production code, schema, migration, provider, worker, reconciliation, tracking, test, CI, or API was modified in this phase. It converts the M7.3-B.3 architecture audit into a binding implementation contract.

---

## 1. Executive Summary

The M7.3-B.3 audit returned **GO WITH CONDITIONS** with 0 Critical / 5 High / 3 Medium / 1 Low and 3 business decisions. This lock resolves all three business decisions from repository evidence, fixes the canonical carrier-cancellation state model, and freezes the outbox/pickup/security/concurrency contract so that B.3.1–B.3.7 can proceed without re-litigating architecture.

Core invariants that are **already true and must be preserved** (confirmed in code):

- SCS order cancellation is authoritative and fully transactional (B.2). Carrier cancellation runs **only downstream** via outbox → worker.
- The order FSM makes `CANCELLED` terminal (`TRANSITIONS.CANCELLED = []`) and `OrdersService.processCarrierDelivery()` refuses `DELIVERED` on a cancelled order **before** any inventory SALE — so a carrier result can neither resurrect an order nor consume stock. CARRIER-01…04 hold today.
- Carrier HTTP is never invoked inside `cancelOrder()`.

The remaining work is **additive**: connect the cancellation leg, model cancellation as a first-class carrier operation with its own state, extend reconciliation to cancellation, and make delivered-after-cancel observable.

---

## 2. Baseline

| Item | Value |
| ---- | ----- |
| Branch / HEAD | `develop` @ `2834fa5` (clean tree) |
| Prior milestone | M7.3-B.2 **CLOSED / PASS** |
| Audit verdict | **GO WITH CONDITIONS** |
| Latest migration | `0048_cancellation_metadata.sql` |
| B.3 migration number | **`0049`** (created in B.3.1, not here) |
| Providers registered | `manual-driver` (MANUAL), `aramex` (CARRIER) |

B.2 is CLOSED/PASS. This lock does **not** reopen or redesign the order-cancellation transaction.

---

## 3. Source Artifacts

Authoritative inputs read before locking:

1. `SCS-M7.3-B.3-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` (technical baseline)
2. `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` (B.0, as amended by ADR-013)
3. `ADR-M7.3-B0-013-SUBMITTED-CANCELLATION.md`
4. `SCS-M7.3-B.1-IMPLEMENTATION-RESULTS.md` / `...-RUNTIME-VERIFICATION-RESULTS.md`
5. `SCS-M7.3-B.2-IMPLEMENTATION-RESULTS.md` / `...-RUNTIME-VERIFICATION-RESULTS.md` / `...-RELEASE-CLOSURE.md`
6. Current source: `apps/api/src/modules/shipping/` (provider, aramex, worker, reconciliation, poller, webhook, registry, schema, types, admin controller), `apps/api/src/modules/orders/` (orders.service, shipment.schema), `apps/api/src/modules/audit/` (outboxEvents), `infra/drizzle/migrations/0041–0048`.

No locked B.0/B.2 rule is silently contradicted by this document.

---

## 4. Locked Business Decisions

### BD-1 — Pickup Scheduling → **RESOLVED: OPTION B**

Repository evidence (`CONFIRMED IN CODE`):

- `AramexProvider.createPickup()` (aramex.provider.ts:588) and `cancelPickup()` (aramex.provider.ts:661) are **implemented and unit-tested** (`m723b2-aramex-http.spec.ts` against a mock Aramex HTTP server).
- **No production code path invokes either method.** A repository-wide search for `.createPickup(` / `.cancelPickup(` returns only the provider definitions and the unit tests. No service, controller, worker, or outbox handler calls them.
- `POST /v1/orders/:id/pickup` → `OrdersService.pickupOrder()` → `driverFulfillmentTransition(orderId,'PICKED_UP')` is the **driver FSM transition** `ASSIGNED → PICKED_UP`. It is **not** a carrier pickup and does **not** call Aramex.
- No pickup reference is persisted: the `shipments` table has **no** `carrier_pickup_id`, `pickup_guid`, or `pickup_scheduled` column (verified against `shipment.schema.ts` and migrations 0041/0043/0045). `AramexPickupResult` is returned only to (nonexistent) callers.

**Locked conclusion:**

```text
pickupScheduled = false  for every shipment reachable in the current production workflow.
No shipment can hold a real Aramex pickup GUID today.
CancelPickup is NOT reachable in production at B.3.0 baseline.
```

Per the audit's OPTION B guidance, the **provider capability is still implemented generically** (`canCancelPickup`) so that a future pickup-scheduling flow can drive `CancelPickup` without re-architecting cancellation. When such a flow is introduced, it MUST persist the pickup GUID and set `pickupScheduled = true` (see §6).

### BD-2 — No-Pickup / No-Carrier-Cancellation → **RESOLVED**

Locked decision table:

| Condition | Result |
| --------- | ------ |
| `provider.type = MANUAL` (manual-driver) | `NOT_REQUIRED` (no external carrier to cancel; no fake HTTP) |
| `aramex` AND `pickupScheduled = false` | `NOT_REQUIRED` (nothing scheduled to cancel) — **the current production reality for Aramex** |
| `aramex` AND `pickupScheduled = true` AND `pickupGuid` present | attempt `cancelPickup()` |
| `cancelPickup()` fails (retryable) | retry/backoff via worker |
| `cancelPickup()` fails (terminal) / returns UNKNOWN / times out | `RECONCILIATION_REQUIRED` |
| `provider.canCancel = true` | attempt `cancelShipment()` (no such provider today) |

Never fabricate or emulate a `CancelShipment` API. Never silently mark an unverified cancellation as success.

### BD-3 — Admin Recovery → **RESOLVED: YES**

Locked conclusion: B.3 exposes an **operational** admin recovery action, **reusing the existing surface** and permission.

- Existing endpoints (`CONFIRMED IN CODE`, carrier-admin.controller.ts): `POST /v1/carrier/shipments/:id/recover` and `GET /v1/carrier/recovery/queue`, gated by `admin:shipping:recovery`, audited via `AuditService` (action `carrier.shipment.recover`), tenant-scoped via `isTenantPrivileged` (org admins see only their stores' shipments).
- **Today these are create-only** — the recover handler sets create recovery fields and the queue filters on `carrier_create_status`. B.3 MUST **extend** (not replace) them to include carrier-cancellation states.

```text
Admin recovery is operational recovery, not a second cancellation mechanism.
```

Recovery may only **re-drive or reconcile an existing carrier-cancellation operation** for a shipment that is already `CANCELLED` at SCS. It must NOT: create an order cancellation, bypass tenant/provider isolation, accept a client-supplied provider or carrier shipment id, alter credentials, or move the order FSM.

---

## 5. Locked Carrier Cancellation Policy

Canonical decision function (executed by `ShippingCarrierWorker.handleCancel`, never inside the SCS transaction):

```text
IF provider.canCancel
    → cancelShipment()
ELSE IF provider.canCancelPickup AND pickupScheduled AND pickupGuid present
    → cancelPickup()
ELSE IF no external carrier cancellation is required (MANUAL, or carrier with nothing scheduled)
    → NOT_REQUIRED
ELSE
    → RECONCILIATION_REQUIRED
```

Execution boundary (mandatory):

```text
cancelOrder()  →  COMMIT  →  outbox  →  ShippingCarrierWorker  →  provider
```

Carrier cancellation NEVER occurs inside `cancelOrder()` or any SCS order transaction. A carrier failure MUST NEVER roll back a committed SCS cancellation.

---

## 6. Pickup Policy

Locked persistence (created in B.3.1 migration 0049, not here):

```text
carrier_pickup_id   VARCHAR   -- Aramex Pickup GUID used by CancelPickup
pickup_scheduled    BOOLEAN DEFAULT false
```

Optional, added only if a pickup-scheduling flow needs them (names consistent with existing snake_case schema convention): `pickup_status VARCHAR`, `pickup_date TIMESTAMPTZ`.

Deterministic requirement:

```text
A worker MUST determine, WITHOUT any external carrier call:
  - Was a pickup scheduled?   → pickup_scheduled
  - Which identifier to cancel?→ carrier_pickup_id
```

Write discipline: `carrier_pickup_id` + `pickup_scheduled = true` are set **only** by a successful `createPickup` at the moment a future pickup-scheduling workflow is added. At B.3.0 baseline no writer exists, so all rows remain `pickup_scheduled = false` / `carrier_pickup_id = null`.

---

## 7. Provider Capability Policy

Locked capability contract. `canCancelPickup` is **added to `ProviderCapabilities`** (B.3.2), and `cancelPickup`/`createPickup` + a typed `CancelPickupResult` are lifted onto the `ShippingProvider` abstraction with a safe default so non-pickup providers remain no-op.

| Provider | type | canCancel | canCancelPickup | cancelShipment | cancelPickup |
| -------- | ---- | --------- | --------------- | -------------- | ------------|
| `manual-driver` | MANUAL | false | false | inherited `{supported:false}` (unchanged) | default unsupported |
| `aramex` | CARRIER | **false** | **true** | returns `{supported:false, reason}` (no API fabricated) | real `/json/CancelPickup` |

```text
Aramex: canCancel = false, canCancelPickup = true   (locked, explicit)
```

The generic worker must invoke cancellation **through the abstraction** (capability-gated), never through an `instanceof AramexProvider` cast or provider-specific branch.

---

## 8. Carrier State Machine

Cancellation uses a **dedicated** `carrier_cancel_status` field group. It MUST NOT overload create-specific columns (`carrierCreateStatus`, `carrierCreateRetries`, `carrierCreateError`, `carrierCreateErrorClass`, `carrierCreateAttemptedAt`).

Canonical `carrier_cancel_status` values (all ≤ 24 chars → fit `VARCHAR(24)`):

```text
PENDING                   -- cancel operation enqueued, not yet attempted
IN_PROGRESS               -- claimed by a worker (doubles as the claim marker)
SUCCEEDED                 -- carrier confirmed cancellation / pickup cancelled
FAILED                    -- carrier definitively rejected (terminal, reconciled)
UNKNOWN                   -- outcome indeterminate (timeout / lost response / crash-after-call)
NOT_REQUIRED              -- no external cancellation applies (manual / nothing scheduled)
RECONCILIATION_REQUIRED   -- needs reconciliation to resolve UNKNOWN/FAILED
RETRY                      -- (transient, optional) retryable attempt outstanding
```

Monotonic + terminal rules:

```text
Terminal: SUCCEEDED, NOT_REQUIRED, FAILED(→ after reconcile)
UNKNOWN and RECONCILIATION_REQUIRED are NOT terminal — they route through reconciliation.
A terminal success (SUCCEEDED / NOT_REQUIRED) is never downgraded by a duplicate event.
Transition is claimed via: UPDATE ... SET carrier_cancel_status='IN_PROGRESS'
  WHERE id=? AND carrier_cancel_status IS DISTINCT FROM 'IN_PROGRESS' RETURNING id
  (0 rows ⇒ another worker owns it ⇒ no-op).
```

---

## 9. Idempotency Policy

Every carrier-cancellation operation has deterministic identity:

```text
carrier-cancel:<shipmentId>
```

(store this in `carrier_cancel_idempotency_key`, mirroring the existing `carrier-create:<shipmentId>` convention.)

Locked rule:

```text
One logical shipment cancellation  →  at most one EFFECTIVE carrier cancellation operation.
```

Distinguish explicitly:

- **Duplicate delivery of a known event** (shipment already `SUCCEEDED`/`NOT_REQUIRED`/terminal) → **no-op**; do not re-call the carrier.
- **Legitimate retry after `UNKNOWN`** → permitted, and only via the retry/reconciliation path, still keyed by the same `carrier-cancel:<shipmentId>` identity so it can never fan out into parallel effective operations.

Defence-in-depth: a partial unique index limiting at-most-one *pending/in-progress* cancel event per shipment may be added in B.3.5 if concurrency testing shows a need (see §18). Primary idempotency is the state guard + DB-level claim.

---

## 10. Failure / Timeout / Unknown Policy

Locked outcomes (SCS order and SCS shipment are always `CANCELLED` in every case — the carrier result never changes them):

| Case | carrier_cancel_status | recoveryStatus | outbox | inventory | action |
| ---- | --------------------- | -------------- | -------- | --------- | ------ |
| HTTP success / confirmed | `SUCCEEDED` | null | DISPATCHED | none | terminal |
| Retryable failure | `RETRY`→`PENDING` | null | backoff PENDING | none | worker retry |
| Terminal rejection | `FAILED` | `CANCEL_FAILED` | DISPATCHED | none | reconcile |
| Timeout | `UNKNOWN` | `CANCEL_TIMEOUT` | DISPATCHED | none | reconcile |
| Response lost after carrier accepted | `UNKNOWN` | `CANCEL_UNKNOWN` | DISPATCHED | none | reconcile |
| Unsupported / nothing to cancel | `NOT_REQUIRED` | null | DISPATCHED | none | terminal |
| Crash before carrier call | (unchanged `PENDING`) | null | lease stale → PENDING | none | lease recovery re-claims |
| Crash after call, before recording | treated as `UNKNOWN` | `CANCEL_UNKNOWN` | lease stale → PENDING | none | **never assume failure** — reconcile |
| Duplicate worker | single effective op | — | SKIP LOCKED | none | DB claim |

```text
Crash-after-call ⇒ UNKNOWN, never FAILED.
UNKNOWN ⇒ RECONCILIATION_REQUIRED.
Reconciliation resolves UNKNOWN to SUCCEEDED / FAILED(terminal) / remains RECONCILIATION_REQUIRED for admin.
```

---

## 11. Reconciliation Policy

`CarrierReconciliationService` currently reconciles **create** only (it scans `carrier_create_status`). B.3 MUST extend it to **cancellation** without breaking the create path.

Locked cancellation reconciliation:

- **Cases handled:** `CANCEL_UNKNOWN`, `CANCEL_FAILED`, `CANCEL_TIMEOUT`, `CARRIER_DELIVERED_AFTER_CANCEL` (see §12).
- **Claim:** database-backed, using the existing `FOR UPDATE SKIP LOCKED` pattern (the create path already uses a two-phase claim setting `recovery_status='RECONCILING'` + `next_reconciliation_at` as a lease). The cancellation claim MUST be keyed on `carrier_cancel_status` (e.g. claim rows in `UNKNOWN`/`RECONCILIATION_REQUIRED`/`RETRY` with due `next_reconciliation_at`) so it does not collide with the create-only scan.
- **Discovery:** query the provider (tracking / pickup status) to resolve an UNKNOWN cancellation. Aramex CancelPickup/track result decides SUCCEEDED vs still-active.
- **Resolution:** monotonic — set a terminal `carrier_cancel_status` and clear `next_reconciliation_at`; never downgrade a confirmed terminal.
- **Properties (locked):** database-claimed, concurrency-safe, tenant-safe (resolve org from shipment/store, never from carrier payload), provider-safe (only the shipment's configured provider), retry-safe, idempotent.

```text
No process-local mutex is the primary concurrency guarantee — DB claim is authoritative.
```

---

## 12. Delivered-after-Cancel Policy (mandatory)

If SCS `shipment.status = CANCELLED` (and order `CANCELLED`) and the carrier later reports `DELIVERED`:

```text
SCS CANCELLED remains authoritative.
NEVER  CANCELLED → DELIVERED
NEVER  CANCELLED → COMPLETED
NEVER  inventory SALE
NEVER  automatic refund  (refunds are out of B.3 scope)
```

Required observable side effects (currently the order is protected but the divergence is silent — B.3.4 must add):

```text
shipment exception : CARRIER_DELIVERED_AFTER_CANCEL   (recorded on shipment_events / exception marker)
recoveryStatus     : DELIVERED_AFTER_CANCEL
carrier_cancel_status : RECONCILIATION_REQUIRED       (a live shipment may still need a manual/pickup reconciliation)
outbox event       : shipment.reconciliation_required
```

The existing `processCarrierDelivery()` guard (returns `false` for a cancelled order, before `settleStockForStatus`) satisfies the safety half; B.3 adds the **recording + reconciliation** half so the divergence is observable and recoverable.

---

## 13. Tracking Policy

Locked:

```text
shipments.status = CANCELLED  ⇒  shipment is INELIGIBLE for normal tracking progression.
```

The current poller claim filters only on `carrier_status_mapped`/`carrier_create_status`, so cancelled shipments keep being polled and can advance `carrier_status_mapped` after cancellation (audit B3-M-1). B.3 must add `shipments.status` to the eligibility predicate (exclude `CANCELLED`) and must distinguish:

```text
normal tracking progression            → suppressed for CANCELLED shipments
post-cancellation reconciliation evidence → still recorded (feeds §12 exception + reconciliation)
```

A post-cancel carrier event must NOT be silently hidden — it is the trigger for the delivered-after-cancel exception.

---

## 14. Outbox Policy

Locked flow (preserves the worker's claim taxonomy `shipping.carrier.*`):

```text
cancelOrder() [B.2]
    → publishes shipment.cancelled  (unchanged, inside the transaction)
shipment.cancelled
    → publish/derive  shipping.carrier.cancel   (aggregateId = shipmentId)
shipping.carrier.cancel
    → ShippingCarrierWorker (claims shipping.carrier.*)  → handleCancel()
```

Rules:

- The carrier-worker event remains under the `shipping.carrier.*` prefix. Changing the claim predicate to match `shipment.cancelled` is **disfavoured**; deriving `shipping.carrier.cancel` is preferred (avoids touching the indexed claim path). Final mechanism is an implementation choice in B.3.2 but MUST keep carrier HTTP outside the cancellation transaction.
- Set correct tenant context: `outbox_events.organization_id` (and `store_id`) MUST be populated for `shipping.carrier.cancel` (today cancel events carry null org context). No cross-tenant carrier processing.
- Payload minimum for the handler: `shipmentId` (aggregateId), `orderId`, `organizationId`, `providerKey`, `reason`, `actorType`, `carrier-cancel:<shipmentId>` idempotency key, `correlationId`.

---

## 15. Database / Migration Contract (migration 0049 — to be authored in B.3.1)

**Migration 0048 is NOT sufficient.** B.3 requires an additive `0049_carrier_cancellation.sql`. It is **not created in this phase**. Required categories:

**Pickup:** `carrier_pickup_id VARCHAR`, `pickup_scheduled BOOLEAN NOT NULL DEFAULT false` (+ optional `pickup_status`, `pickup_date`).

**Carrier cancellation (dedicated `carrier_cancel_*` group):**
```
carrier_cancel_status        VARCHAR(24)
carrier_cancel_error         TEXT
carrier_cancel_error_class   VARCHAR(40)
carrier_cancel_retries       INTEGER NOT NULL DEFAULT 0
carrier_cancel_attempted_at  TIMESTAMPTZ
carrier_cancel_idempotency_key VARCHAR(120)
```

**Recovery state:** `recovery_status` remains `VARCHAR(24)` with **no CHECK constraint** (verified in 0045). New cancellation recovery tokens MUST be ≤24 chars (locked below); if any future token would exceed 24, 0049 must widen the column explicitly — do not insert an over-width value without migrating.

**Locked `recovery_status` cancellation tokens (namespaced, ≤ 24 chars):**
```
CANCEL_UNKNOWN            (14)
CANCEL_TIMEOUT            (14)
CANCEL_FAILED             (13)
CANCEL_RECONCILE          (14)
DELIVERED_AFTER_CANCEL    (22)
```
These are namespaced with a `CANCEL_`/`DELIVERED_` prefix to avoid collision with the existing create-flow values (`PENDING_RECOVERY`, `RECONCILING`, `RECOVERED`, `ADMIN_TRIGGERED`, `RETRY_SCHEDULED`, `DEFERRED`). The audit token `CARRIER_CANCEL_NOT_SUPPORTED` (28 chars) is **rejected**; `NOT_REQUIRED` is expressed via `carrier_cancel_status`, not `recovery_status`.

**Indexes (partial, additive):**
- cancel reconciliation/worker claim: `ON shipments (carrier_cancel_status, next_reconciliation_at) WHERE carrier_cancel_status IN ('PENDING','IN_PROGRESS','UNKNOWN','RETRY','RECONCILIATION_REQUIRED')`.
- (optional, B.3.5) partial unique on `outbox_events (event_type, aggregate_id) WHERE event_type = 'shipping.carrier.cancel'` for at-most-one-pending-cancel defence.

Migration must be: additive, idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), fresh-DB safe, existing-DB safe, zero-downtime (nullable/defaulted columns, no backfill required), repeatable without duplicate objects, and **non-destructive**.

---

## 16. Security Contract

Carrier cancellation MUST preserve (`CONFIRMED IN CODE` mechanisms, reuse as-is):

- **Tenant isolation** — org/store resolved from the shipment row, never from a carrier/event-supplied identity. Outbox events carry correct `organization_id`.
- **Provider isolation** — a shipment invokes only its `shippingProviderKey` via the registry; no client-supplied arbitrary provider.
- **Credential isolation** — per-org encrypted (`AES-256-GCM`, `carrier_credentials`), decrypted only for the outbound call; never returned/logged/in errors.
- **No client-supplied carrier shipment id** on any worker path; the worker acts only on the shipment named in the claimed event.
- **No cross-tenant recovery** — admin recovery is scoped by `isTenantPrivileged` + store filter (existing pattern).
- **Admin-only manual recovery** — `admin:shipping:recovery`; audited via `AuditService`.
- **Webhook security unchanged** — HMAC + token routing; never trust carrier payload tenant fields.

---

## 17. Observability Contract

Durable, post-incident reconstruction of every carrier cancellation must be possible from persisted shipment state + append-only history. For each operation the following are recorded (durable columns/history, not metrics-only):

```text
shipmentId, orderId, organizationId, providerKey, carrier operation type (shipment|pickup|none),
attempt number, idempotency key (carrier-cancel:<shipmentId>), correlationId,
startedAt (carrier_cancel_attempted_at), completedAt, result (carrier_cancel_status),
error class (carrier_cancel_error_class), retry state, reconciliation state (recovery_status).
```

Metrics may reuse the existing in-memory `CarrierObservabilityService` (per-process limitation acknowledged), but **durable state/history is authoritative**. Recommended counters (additive, non-blocking):

```text
carrier_cancel_attempted_total, carrier_cancel_succeeded_total, carrier_cancel_failed_total,
carrier_cancel_unknown_total, carrier_cancel_reconciliation_total, carrier_delivered_after_cancel_total
```

Recorded via `shipment_events` (audit trail) — the same mechanism already used for `CANCELLED` shipment events.

---

## 18. Concurrency Contract

Preserve:

```text
100 duplicate carrier-cancel events  →  exactly one EFFECTIVE carrier cancellation operation,
unless the state is UNKNOWN and retry/reconciliation is explicitly authorized.
```

Mandatory DB-backed arbitration (no process-local lock as primary guarantee):

- Event claim: existing `SELECT ... FOR UPDATE SKIP LOCKED` in `ShippingCarrierWorker` (`CONFIRMED BY TEST`, 100-concurrent no-double-claim).
- Operation claim: optimistic `UPDATE ... SET carrier_cancel_status='IN_PROGRESS' WHERE id=? AND carrier_cancel_status IS DISTINCT FROM 'IN_PROGRESS' RETURNING` — 0 rows ⇒ no-op.
- Reconciliation claim: `FOR UPDATE SKIP LOCKED` + `recovery_status='RECONCILING'`/`next_reconciliation_at` lease.

Required test races (B.3.5): cancel-worker vs cancel-worker; cancel-worker vs reconciliation; cancel-worker vs tracking; cancel vs delivered webhook/poller; CancelPickup vs CreatePickup; timeout vs late success; admin-recovery vs worker; `shipment.cancelled`/`shipping.carrier.cancel` processed twice.

---

## 19. Failure-Injection Contract

B.3 must be verifiable against every case in §10 (success, retryable, terminal, timeout, lost-response, crash-before, crash-after, duplicate-worker, reconcile-unknown, delivered-after-cancel) with the exact resulting tuple of `{SCS order, SCS shipment, carrier_cancel_status, recoveryStatus, outbox state, inventory effect, retry/reconcile action}`. Two safety invariants every injected case must hold:

```text
SCS order/shipment stay CANCELLED in ALL cases; inventory SALE count for the order stays 0 after cancellation.
```

---

## 20. API Contract

- B.3 introduces **no public buyer/merchant carrier-cancellation API.** Prohibited: `POST /shipments/:id/cancel-carrier` or equivalent. Carrier cancellation is an internal consequence of SCS cancellation.
- **Admin recovery only**, reusing the existing endpoints (extended to cancellation in B.3.4):
  - `POST /v1/carrier/shipments/:id/recover` — `admin:shipping:recovery`, audited, tenant/provider scoped.
  - `GET /v1/carrier/recovery/queue` — `admin:shipping:recovery`, tenant scoped, extended to list `carrier_cancel_status` candidates.
- The recovery action operates on an existing cancellation state, is audited, is tenant/provider safe, and never creates a new order cancellation.

---

## 21. Scope / Non-Scope

**IN SCOPE (B.3):** carrier-cancel state model + migration 0049; pickup persistence; provider capability abstraction (`canCancelPickup`, `cancelPickup` on contract); Aramex CancelPickup wiring; manual `NOT_REQUIRED` handling; `handleCancel` execution; deterministic idempotency; retry/failure/unknown; cancellation reconciliation; delivered-after-cancel reconciliation; tracking-poller cancellation awareness; outbox integration; concurrency; failure injection; security; observability; PostgreSQL verification.

**OUT OF SCOPE (later milestones):** returns; return-to-stock (RTS); refunds; payments; disputes; notification redesign; GPS/maps; delivery-exception redesign; RTS business workflow; new public buyer/merchant carrier APIs; **fictional Aramex APIs (no `CancelShipment`)**.

---

## 22. Implementation Sequence (approved — do not merge phases)

```text
B.3.1  Carrier-Cancel State Foundation        (migration 0049, types, pickup + carrier_cancel_* columns, state enum)
B.3.2  Provider Abstraction + Cancel Wiring   (canCancelPickup + cancelPickup on contract; derive shipping.carrier.cancel; org context)
B.3.3  Cancel Execution + Retry + Unknown     (handleCancel per §5 policy; §10 outcomes; idempotency guard)
B.3.4  Reconciliation + Delivered-after-Cancel(cancel-aware reconcile; §12 exception + shipment.reconciliation_required; poller §13)
B.3.5  Concurrency + Failure Injection        (§18 races; §19 injection; at-most-one-effective-op tests)
B.3.6  Independent Runtime Verification        (evidence-driven; B.0 compliance; regression B.1/B.2 green)
B.3.7  Release Closure                         (formal verdict; ADR-014 if a new business rule is locked)
```

---

## 23. Release Gates (defined at lock time, verified in B.3.6/B.3.7)

```text
Architecture : cancel never inside SCS tx; SCS authoritative; Aramex canCancel=false/canCancelPickup=true truthful; no fabricated CancelShipment; routing via capability not provider cast.
Database     : 0049 additive/idempotent/fresh+prod/zero-downtime; dedicated carrier_cancel_* group; recovery tokens ≤24 chars; claim indexes present.
Carrier      : CancelPickup only when pickupScheduled+GUID; unsupported→NOT_REQUIRED; timeout/failure/unknown handled per §10.
Reconciliation: cancel-aware, DB-claimed, concurrency/tenant/provider/retry/idempotency safe.
Tracking     : CANCELLED shipments ineligible for normal progression; post-cancel event still recorded; no SALE; no resurrection.
Outbox       : shipping.carrier.* taxonomy preserved; org/store context set; no cross-tenant; atomic with cancel tx.
Security     : tenant/provider/credential isolation; admin-only recovery; audited; no client-supplied provider/shipment.
Concurrency  : 100 duplicate → one effective op; DB-backed arbitration for all §18 races.
Failure inj. : all §19 cases produce the locked tuple; order stays CANCELLED + SALE=0 in every case.
Regression   : B.1, B.2 (289 targeted), M7.2.x carrier operations remain green; tsc 0 errors; build clean.
```

---

## 24. ADRs / Decisions

- **ADR-013 (existing, B.0):** SUBMITTED not externally cancellable — respected; no contradiction.
- **ADR-M7.3-B0-014 — Carrier Cancellation Capability Model** — *to be authored during B.3.1/B.3.4*: records (a) Aramex `canCancel=false / canCancelPickup=true`, (b) the `NOT_REQUIRED` vs `RECONCILIATION_REQUIRED` decision (§4 BD-2), and (c) the delivered-after-cancel reconciliation contract (§12). Recorded as a new ADR rather than amending B.0 because it adds carrier behaviour downstream of, and fully consistent with, the locked cancellation rules.
- **Open external item:** live Aramex sandbox `CancelPickup` semantics (already-picked-up error codes, idempotent re-cancel, post-dispatch acceptance) remain **REQUIRES EXTERNAL CARRIER VERIFICATION** — a B.3.6 runtime item, not to be fabricated here.

---

## 25. Final Gate — Explicit Resolutions

| Decision / Rule | Resolution |
| --------------- | ---------- |
| **BD-1 Pickup scheduling** | **RESOLVED — OPTION B.** `createPickup`/`cancelPickup` exist and are unit-tested but are **unreachable from production workflow**; no pickup GUID persisted. `pickupScheduled = false` for all current shipments; capability implemented generically for future use. |
| **BD-2 No-pickup / no-cancel** | **RESOLVED.** MANUAL → `NOT_REQUIRED`; Aramex with no scheduled pickup → `NOT_REQUIRED`; Aramex with pickup → `CancelPickup`, fail/unknown → `RECONCILIATION_REQUIRED`. |
| **BD-3 Admin recovery** | **RESOLVED — YES.** Reuse `POST /v1/carrier/shipments/:id/recover` + `GET /v1/carrier/recovery/queue` under `admin:shipping:recovery`, audited, tenant-scoped; **extend** to cancellation; operational recovery only, not a second cancellation. |
| **Exact Aramex behaviour** | `canCancel=false`, `canCancelPickup=true`. No `CancelShipment` ever called. CancelPickup only if `pickupScheduled` AND `carrier_pickup_id` present; success→`SUCCEEDED`; terminal reject→`FAILED`; timeout/lost→`UNKNOWN`; unresolved→`RECONCILIATION_REQUIRED`. Live semantics pending external verification. |
| **Exact manual-driver behaviour** | No external carrier; cancellation result `NOT_REQUIRED`; no fake HTTP; order/shipment already `CANCELLED` from B.2. |
| **Exact UNKNOWN behaviour** | `carrier_cancel_status=UNKNOWN`, `recovery_status=CANCEL_UNKNOWN`/`CANCEL_TIMEOUT`; never assumed failed; routed to `RECONCILIATION_REQUIRED` and resolved by cancel-aware reconciliation; retry permitted only through this path, keyed by `carrier-cancel:<shipmentId>`. |
| **Exact DELIVERED-after-CANCEL behaviour** | SCS `CANCELLED` wins; no `CANCELLED→DELIVERED/COMPLETED`; no SALE; no auto refund; record `CARRIER_DELIVERED_AFTER_CANCEL` exception + `recovery_status=DELIVERED_AFTER_CANCEL` + `carrier_cancel_status=RECONCILIATION_REQUIRED` + outbox `shipment.reconciliation_required`. |
| **Exact idempotency behaviour** | Deterministic identity `carrier-cancel:<shipmentId>`; duplicate event on a terminal shipment is a no-op; single effective operation enforced by state guard + DB claim (`FOR UPDATE SKIP LOCKED` / optimistic `UPDATE ... WHERE status IS DISTINCT FROM 'IN_PROGRESS'`); optional partial-unique outbox guard in B.3.5. |
| **Exact migration requirements** | `0049` additive: pickup (`carrier_pickup_id`, `pickup_scheduled`), `carrier_cancel_*` group (status/error/error_class/retries/attempted_at/idempotency_key), partial cancel-claim index, optional cancel-outbox unique. `recovery_status` kept `VARCHAR(24)`, no CHECK, namespaced `CANCEL_*`/`DELIVERED_*` tokens ≤24. Idempotent, fresh+prod safe, zero-downtime, non-destructive. |

Any item that could not be resolved from repository evidence or locked policy is marked above as an external-verification item (Aramex live sandbox semantics only). No decision was invented.

---

## Verdict

```text
========================================
SCS M7.3-B.3.0 — BUSINESS RULES & ARCHITECTURE LOCK
========================================

Baseline            : M7.3-B.2 CLOSED / PASS ; audit GO WITH CONDITIONS
BD-1 (pickup)       : RESOLVED — OPTION B (not reachable in production; generic capability retained)
BD-2 (no-cancel)    : RESOLVED — NOT_REQUIRED / RECONCILIATION_REQUIRED matrix locked
BD-3 (admin)        : RESOLVED — YES, reuse admin:shipping:recovery, extended to cancel
Safety invariants   : CARRIER-01..04 already hold (confirmed); preserved by lock
Remaining open item : live Aramex CancelPickup sandbox semantics (B.3.6 external verification)

Verdict             : GO — architecture contract locked and consistent with B.0/B.2

Recommendation      : Proceed to M7.3-B.3.1 (Carrier-Cancel State Foundation)
Status              : M7.3-B.3.0 — DECISION-LOCK COMPLETE
========================================
```
