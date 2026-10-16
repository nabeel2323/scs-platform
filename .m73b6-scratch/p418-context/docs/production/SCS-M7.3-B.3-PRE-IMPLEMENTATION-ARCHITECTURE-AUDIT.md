# SCS Platform — M7.3-B.3 Pre-Implementation Architecture Audit

**Milestone:** M7.3-B.3 — Carrier Cancellation & Carrier Reconciliation
**Mode:** READ-ONLY architecture & implementation audit (no code produced)
**Verdict:** **GO WITH CONDITIONS**

---

## 0. Baseline

| Item | Value |
| ---- | ----- |
| Branch | `develop` |
| HEAD | `2834fa5` |
| Working tree | clean (0 modified files) |
| Runtime | Node v26.4.0, pnpm 9.15.9 |
| Prior milestone status | M7.3-B.2 **CLOSED / PASS** |
| Latest migration | `0048_cancellation_metadata.sql` (→ B.3 would be `0049`) |

This audit did **not** modify production code, schemas, migrations, workers, providers, tests, or CI. It inspected the repository read-only and produced this report only.

Evidence labels used throughout:
`CONFIRMED IN CODE` · `CONFIRMED BY TEST` · `INFERRED` · `NOT IMPLEMENTED` · `REQUIRES IMPLEMENTATION` · `REQUIRES BUSINESS DECISION` · `REQUIRES EXTERNAL CARRIER VERIFICATION`.

---

## 1. Executive Summary

The carrier operations layer built in **M7.2.3-C / M7.2.4-A** already provides the hard distributed-systems machinery B.3 needs: a lease-based transactional outbox worker (`FOR UPDATE SKIP LOCKED`, stale-lease recovery, retry policy, per-provider circuit breaker, dead-letter), a reconciliation service with atomic claiming, a hardened tracking poller with DB-enforced event dedup, and a token-routed HMAC webhook ingester. The SCS cancellation transaction itself (B.2) is atomic and authoritative, and the order FSM makes `CANCELLED` terminal, so **carrier results can already neither resurrect a cancelled order nor trigger an inventory SALE against it** — the most dangerous invariants hold today.

What B.3 actually lacks is the **cancellation-specific wiring and state**:

1. Nothing consumes the `shipment.cancelled` outbox event to drive a carrier action, and the `shipping.carrier.cancel` handler is an explicit **no-op**.
2. The provider abstraction exposes only `cancelShipment` (and a single `canCancel` flag); Aramex's usable `cancelPickup` is a provider-only method the generic worker cannot reach, and there is no `canCancelPickup` capability.
3. The shipment record stores **no pickup reference** and no "pickup scheduled" signal, so the locked policy "attempt `cancelPickup` only if a pickup was scheduled" cannot be evaluated.
4. There is **no carrier-cancellation operation state** and the reconciliation engine only scans `carrier_create_status`, so a failed/unknown carrier cancellation is currently unrecoverable.
5. The locked "carrier DELIVERED after SCS cancel" rule is **partially** satisfied: the order is protected, but the divergence is silent — no shipment exception, no `recoveryStatus`, no `shipment.reconciliation_required` event.

Because the authoritative foundation exists and the gaps are additive rather than corrective, the architecture **can safely support B.3**. Verdict is **GO WITH CONDITIONS** (see §32).

---

## 2. Audit Scope

Repository areas inspected (`CONFIRMED IN CODE`):

```
apps/api/src/modules/shipping/            (provider, aramex, worker, reconciliation, poller, webhook, registry, schema, types)
apps/api/src/modules/orders/              (orders.service cancel + carrier bridge, shipment.schema)
apps/api/src/modules/audit/               (outboxEvents)
infra/drizzle/migrations/                 (0041, 0043, 0044, 0045, 0046, 0047, 0048)
```

Out-of-scope confirmation: no production code was altered.

---

## 3. Authoritative Baseline (B.0, as amended)

Locked rules relevant to B.3 (`docs/production/SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` + `ADR-M7.3-B0-013`):

- Aramex: `CancelShipment` NOT supported; `CancelPickup` supported; manual delivery has no carrier integration. **Confirmed accurate in code** — `AramexProvider.capabilities.canCancel = false` and `cancelShipment()` returns `{ supported: false, reason: 'Aramex does not provide a shipment cancellation API...' }`.
- Carrier policy order: `canCancel` → `cancelShipment`; else `cancelPickup` if pickup scheduled; else reconciliation; failure → failure/recovery state; unknown → reconciliation. SCS cancellation always succeeds; carrier failure never rolls back committed SCS cancellation.
- `SUBMITTED` is no longer externally cancellable (B.0 amendment via ADR-013). Consistent with `TRANSITIONS.SUBMITTED = ['PENDING_CONFIRMATION']`.

The audit found **no contradiction** between B.3 requirements and locked B.0 rules.

---

## 4. Current Carrier Architecture (where carrier cancellation runs)

Answer to §13 of the specification — **Option D + hybrid, currently unimplemented for cancel**:

- Order cancellation runs in the B.2 dedicated DB transaction and, on success, enqueues `order.cancelled` and (if a shipment exists) `shipment.cancelled` inside the same transaction (`CONFIRMED IN CODE`, orders.service.ts:1108-1143; `CONFIRMED BY TEST`, m73b2-merchant-cancellation.postgres.spec.ts asserts exactly one `shipment.cancelled` outbox row).
- Carrier side-effects are designed to run **asynchronously through the outbox worker** (`ShippingCarrierWorker`), which is the correct placement: **no external HTTP call occurs inside the SCS cancellation transaction**. This satisfies the critical boundary (§6 of the spec).
- However, the carrier worker only claims events whose `event_type LIKE 'shipping.carrier.%'` (`CONFIRMED IN CODE`, worker claim, line 180). The emitted `shipment.cancelled` event does **not** match this prefix and has **no consumer**. The matching `shipping.carrier.cancel` event is defined in the worker's `switch` but is **never published by anyone**, and its handler `handleCancel()` is a no-op log line (`CONFIRMED IN CODE`, lines 445-448).

**Assessment:** the intended architecture (outbox→worker→carrier→recovery) is sound and already the dominant pattern for the create-flow, but the **cancellation leg is not connected end-to-end**. This is expected B.3 scope, not a B.2 regression.

---

## 5. Carrier Provider Interface

`ShippingProvider` (abstract class, `CONFIRMED IN CODE`):

| Method | Present | Notes |
| ------ | ------- | ----- |
| `createShipment` | ✅ abstract | used by worker/reconciliation |
| `cancelShipment(shipmentId)` | ✅ (default `{supported:false}`) | returns typed `CancelShipmentResult` |
| `generateLabel` | ✅ | |
| `getTrackingInfo` | ✅ | |
| `validateAddress` | ✅ | |
| `mapCarrierStatus` | ✅ | |
| `cancelPickup` | ❌ | **Aramex-only method, not on the abstraction** |
| `createPickup` | ❌ | **Aramex-only method, not on the abstraction** |

`ProviderCapabilities` has a single cancellation flag: `canCancel: boolean`. There is **no `canCancelPickup`** and no way for a provider to advertise pickup-cancellation support to the generic worker.

Error/timeout model (`CONFIRMED IN CODE`): carrier HTTP errors are classified by `classifyCarrierError` into retryable / terminal / unsupported; timeouts are detected by `isTimeoutError()` (etimedout/econnreset/socket hang up). Retry/backoff is centralised in `CarrierRetryPolicy`; failures route to `handleFailure` → `PENDING` (retry) or `DEAD_LETTER`. Correlation IDs are generated per call via `CarrierObservabilityService`. Idempotency for **create** uses `generateIdempotencyKey(shipmentId) = 'carrier-create:<shipmentId>'`.

**Finding:** cancellation idempotency has **no equivalent key** (`carrier-cancel:<shipmentId>` does not exist). `REQUIRES IMPLEMENTATION` (§16).

---

## 6. Aramex Provider Audit

`CONFIRMED IN CODE`:

- `capabilities = { canCreateShipment:true, canCancel:false, canGenerateLabel:true, canTrack:true, canValidateAddress:true, canReceiveWebhooks:true }` — accurately reflects B.0 (no CancelShipment).
- `cancelShipment(_shipmentId)` → `{ supported:false, reason:'Aramex does not provide a shipment cancellation API. If a pickup is scheduled, CancelPickup may be available...' }`. Correctly refuses to fabricate an API.
- `cancelPickup({ pickupGuid, comments?, storeId })` → POSTs `{shippingBaseUrl}/json/CancelPickup` with `{ ClientInfo, PickupGUID, Comments }`; parses `HasErrors`/`Notifications` into `{ supported:true, cancelled:false, reason }` or `{ supported:true, cancelled:true, carrierStatus:'CANCELLED' }`.
- `createPickup({...})` → POSTs `/json/CreatePickup`, returns `{ pickupGuid, pickupId, reference, carrierStatus:'SCHEDULED' }`.

**Critical:** `cancelPickup` requires a `pickupGuid`. That GUID is returned by `createPickup` but is **not persisted anywhere retrievable per-shipment** (see §7). Therefore the correct `cancelPickup` call cannot currently be assembled from a shipment.

Endpoint/authentication are resolved from encrypted per-org credentials via `resolveCredentials(storeId)` — tenant/provider isolation of credentials is preserved (`carrier_credentials.credentials_encrypted`, AES-256-GCM, `CONFIRMED IN CODE`).

**REQUIRES EXTERNAL CARRIER VERIFICATION:** real Aramex sandbox `CancelPickup` behaviour (accepted-after-dispatch, already-picked-up errors, idempotent re-cancel) was not exercised in this read-only audit; behaviour is verified only against the request/response shape in code, not a live/sandbox call.

---

## 7. Shipment Data Model Audit

`shipments` cancellation-relevant columns (`CONFIRMED IN CODE`, shipment.schema.ts + 0043/0045):

```
status                     ← set to 'CANCELLED' by B.2
cancelledAt                ← set by B.2
cancellationReason         ← set by B.2 (VARCHAR 300, order-level reason reused)
recoveryStatus             ← VARCHAR(24), free-form (NO CHECK) — currently CREATE-flow only
nextReconciliationAt       ← reconciliation scheduling/lease
carrierCreateStatus        ← PENDING/IN_PROGRESS/SUCCESS/FAILED/RECOVERY_REQUIRED
carrierCreateError / carrierCreateRetries / carrierCreateErrorClass / carrierCreateAttemptedAt
carrierShipmentId, carrierTrackingId, carrierStatusRaw, carrierStatusMapped, lastCarrierSyncAt
idempotencyKey             ← 'carrier-create:<shipmentId>' only
```

Absent (required by B.3):

- **No pickup reference** — no `carrier_pickup_id` / `carrier_pickup_guid`, no `pickup_scheduled` flag, no pickup date/status. → Cannot decide or execute CancelPickup. `REQUIRES IMPLEMENTATION`.
- **No carrier-cancellation operation state** — no `carrierCancelStatus`, `carrierCancelRetries`, `carrierCancelAttemptedAt`, `carrierCancelError`, `carrierCancelErrorClass`. The existing create-flow columns are semantically about *creation*, not cancellation. `REQUIRES IMPLEMENTATION`.
- **No carrier-cancel idempotency key**. `REQUIRES IMPLEMENTATION`.
- **No shipment exception** field/type for `CARRIER_DELIVERED_AFTER_CANCEL`. `REQUIRES IMPLEMENTATION` (can be modelled as a `shipment_events` row + `recoveryStatus`, or a dedicated column — see §15 tradeoff).

Migration 0048 does **not** cover these; the audit confirms **0048 is not sufficient** for B.3 (§10 of the spec).

---

## 8. Recovery Status Audit

Existing `recoveryStatus` values actually written (`CONFIRMED IN CODE`): `PENDING_RECOVERY`, `RECONCILING`, `RECOVERED`, `ADMIN_TRIGGERED`, `RETRY_SCHEDULED`, `DEFERRED`. All describe the **create** flow.

Storage: `VARCHAR(24)`, **no CHECK constraint** (`CONFIRMED IN CODE`, 0045 line 30; grep of migrations for a `recovery_status` CHECK returns none). Consequence: **new cancellation states can be introduced without loosening any constraint**, subject to the 24-char width.

Requested cancel states do **not** exist today: `CARRIER_CANCEL_FAILED`, `CARRIER_CANCEL_UNKNOWN`, `CARRIER_CANCEL_TIMEOUT`, `CARRIER_CANCEL_NOT_SUPPORTED`, `RECONCILIATION_REQUIRED` → `NOT IMPLEMENTED`.

Width caution (`MEDIUM`, §25/B3-M-2): `CARRIER_CANCEL_NOT_SUPPORTED` is 28 chars > VARCHAR(24). Either pick ≤24-char tokens (e.g. `CANCEL_UNSUPPORTED`) or widen the column in migration 0049. Transitions are not currently monotonic because the field is a free-form single value reused across flows; B.3 should either segregate cancel state onto its own column/enum or namespace the values.

---

## 9. Outbox / Worker Audit

`CONFIRMED IN CODE` (`ShippingCarrierWorker`):

- Claim: raw `UPDATE outbox_events SET status='PROCESSING', locked_at, locked_by WHERE id IN (SELECT ... WHERE status='PENDING' AND (next_attempt_at IS NULL OR <= now) AND event_type LIKE 'shipping.carrier.%' ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *` — atomic, no double-claim (`CONFIRMED BY TEST`, m723c 100-concurrent no-double-claim).
- Lease recovery: stale `PROCESSING` (locked_at < now-5m) reset to `PENDING`.
- Failure handling: retry policy with exponential backoff + jitter; `DEAD_LETTER` on budget exhaustion.
- Routing already includes `case 'shipping.carrier.cancel' → handleCancel()` (no-op).

**Implication for B.3:** the transport is ready. Two connection options exist — (a) have `cancelOrder` (or a small dispatcher) publish `shipping.carrier.cancel` (aggregateId = shipmentId) so the existing prefix-claim reaches it; or (b) extend the worker claim predicate to also match `shipment.cancelled`. Option (a) is preferred (keeps the worker's event taxonomy under `shipping.carrier.*`, avoids changing the claim predicate which is covered by a partial index). **REQUIRES IMPLEMENTATION / minor business decision** (§26, §35).

Payload requirements (audit of what the cancel handler will need): shipmentId, orderId, storeId, orgId (tenant), providerKey, idempotency key. Note the emitted `shipment.cancelled` payload today carries `{ shipmentId, orderId, status, reason, actorType, source }` but **not** orgId/providerKey — the worker resolves provider/org from the shipment row (as create does), so that is acceptable, but outbox `organization_id` is currently populated as `null`/`{}` for cancel events and should be set for tenant-scoped processing.

---

## 10. Carrier Cancellation Flow Audit

Target flow (locked): `order cancelled → shipment.cancelled → carrier cancel attempt → result → recovery/reconciliation`.

Current reality:
```
order cancelled ........................ CONFIRMED IN CODE (B.2 atomic)
  emits shipment.cancelled ............. CONFIRMED IN CODE
  worker consumes shipment.cancelled ... NOT IMPLEMENTED (prefix mismatch)
  shipping.carrier.cancel published .... NOT IMPLEMENTED
  handleCancel executes ................ NOT IMPLEMENTED (no-op)
  cancelShipment path .................. provider returns unsupported (correct)
  cancelPickup path .................... NOT WIRED (no pickup ref, not on interface)
  result recorded ...................... NOT IMPLEMENTED
  reconciliation of cancels ............ NOT IMPLEMENTED
```

The SCS-authoritative principle (§31) is already honoured: carrier calls are entirely absent from the SCS commit path and cannot roll it back. This invariant is **preserved as long as B.3 implements cancellation exclusively in the worker**, never in `cancelOrder`. Release gates must enforce this.

---

## 11. CancelPickup Readiness

`REQUIRES IMPLEMENTATION` — currently **not ready**:
- Interface lacks `cancelPickup` (§5).
- No persisted pickup GUID / "pickup scheduled" state (§7).
- No decision rule source for "was a pickup ever scheduled for this shipment".

Required for B.3: store `carrier_pickup_id`/`pickup_guid` (or a namespaced metadata convention) at `createPickup` success time, plus a deterministic `pickupScheduled` boolean. The policy must be:
```
if pickupScheduled and provider supports cancelPickup → attempt CancelPickup
else if no carrier cancel capability at all           → RECONCILIATION_REQUIRED
else (neither)                                          → NOT_REQUIRED / manual handover note
```
This is a **business decision** to confirm with B.0 owners: whether shipments ever schedule Aramex pickups in the current flow, and if a non-scheduled pickup should be `NOT_REQUIRED` vs `RECONCILIATION_REQUIRED`.

---

## 12. Idempotency Audit

Invariant: *one logical shipment cancellation → at most one effective carrier operation.*

Current guarantees:
- Outbox dedup does **not** prevent two `shipment.cancelled` rows (no uniqueness on `(event_type, aggregate_id)`); B.2's optimistic-lock flip means a second concurrent cancel loses the race and never emits, so **today duplicate emission is prevented by the FSM lock, not by the outbox** (`CONFIRMED IN CODE`/`INFERRED`).
- Worker double-claim is prevented by `FOR UPDATE SKIP LOCKED` (`CONFIRMED BY TEST`), so one event is processed by one worker at a time.
- There is **no idempotency token for carrier cancellation** and **no state guard** ("already cancelled at carrier → skip"). The create flow has `generateIdempotencyKey`; cancel has none.

`REQUIRES IMPLEMENTATION`: a deterministic `carrier-cancel:<shipmentId>` operation key + a state guard in `handleCancel` (terminal cancel state ⇒ no-op), so a re-delivered or re-driven `shipment.cancelled`/`shipping.carrier.cancel` cannot cause a second effective carrier call, except when a retry policy explicitly re-attempts an UNKNOWN result.

---

## 13. Concurrency Audit (Race matrix)

| # | Race | Current arbitration | Verdict |
|---|------|-------------------|---------|
| 1 | Cancel vs carrier DELIVERED | `TRANSITIONS.CANCELLED=[]` + `processCarrierDelivery` guard (returns false) | Order safe; **no cancel-aware reconciliation record** (B3-H-5) |
| 2 | Cancel vs tracking poller | Poller claim filter ignores `shipments.status='CANCELLED'` | **B3-M-1** — cancelled shipments still polled |
| 3 | Cancel worker vs duplicate worker | `FOR UPDATE SKIP LOCKED` on outbox | **Safe** (`CONFIRMED BY TEST`) |
| 4 | Carrier cancel vs reconciliation | Reconciliation scans `carrier_create_status` only | **Does not touch cancels** — B3-H-4 |
| 5 | CancelPickup vs CreatePickup | No shared lock on pickup resource | `REQUIRES IMPLEMENTATION` |
| 6 | Carrier timeout vs late success | create flow: timeout ⇒ `RECOVERY_REQUIRED`; cancel flow absent | `REQUIRES IMPLEMENTATION` |
| 7 | `shipment.cancelled` processed twice | No cancel idempotency guard | `REQUIRES IMPLEMENTATION` (§12) |

Database-level arbitration exists for the outbox (row locks) and for order status (optimistic lock). No application-level mutex is relied upon for those — good. B.3 must keep DB-level arbitration for cancel-operation claims (e.g. `UPDATE ... SET carrier_cancel_status='IN_PROGRESS' WHERE ... AND status IS DISTINCT FROM 'IN_PROGRESS' RETURNING`, or advisory lock keyed by shipmentId).

---

## 14. Carrier DELIVERED-after-CANCEL (§18)

Required behaviour vs reality:
```
SCS CANCELLED wins ..................... CONFIRMED IN CODE (FSM terminal + bridge guard)
No order resurrection .................. CONFIRMED IN CODE (processCarrierDelivery returns false)
No inventory SALE ...................... CONFIRMED IN CODE (SALE settle is after the guard)
shipment exception recorded ............ NOT IMPLEMENTED
recovery RECONCILIATION_REQUIRED ....... NOT IMPLEMENTED
shipment.reconciliation_required outbox  NOT IMPLEMENTED
no automatic refund .................... CONFIRMED IN CODE (no refund path exists)
```

Note the ordering subtlety (`INFERRED`): the poller writes `carrier_status_mapped='DELIVERED'` on the shipment **before** calling `processCarrierDelivery`; the order-layer guard then refuses the transition. Result: **silent divergence** where the shipment shows carrier DELIVERED while the order stays CANCELLED, with no exception/alert. This satisfies the safety invariant but violates the *observability/reconciliation* requirement. `REQUIRES IMPLEMENTATION` (B3-H-5).

---

## 15. Reconciliation Engine Audit

`CONFIRMED IN CODE` (`CarrierReconciliationService`):
- Claim: `UPDATE shipments SET recovery_status='RECONCILING', next_reconciliation_at=<lease> WHERE (carrier_create_status='RECOVERY_REQUIRED' OR (carrier_create_status IN ('PENDING','IN_PROGRESS') AND next_reconciliation due)) AND recovery_status NOT IN ('RECONCILING','RECOVERED','ADMIN_TRIGGERED') ... FOR UPDATE SKIP LOCKED RETURNING *` — atomic, multi-instance safe, tenant/provider resolved from shipment, bounded batch (20), exponential defer (10m→4h cap).
- Cases A/B/C/D all concern **shipment creation** recovery via `getTrackingInfo`.

Direct answer to §19: **Can the existing engine recover a carrier cancellation that timed out or failed? — NO.** It never selects rows based on cancellation state (there is none) and its decision logic is create-specific. `REQUIRES IMPLEMENTATION`: add cancellation reconciliation (query carrier for cancellation/pickup status; on UNKNOWN escalate to `RECONCILIATION_REQUIRED`; on confirmed success mark cancel terminal) and fold `CARRIER_DELIVERED_AFTER_CANCEL` into its case set.

State-model placement tradeoff (§15 of spec): a **dedicated `carrier_cancel_*` column group on `shipments`** (mirrors the proven `carrier_create_*` pattern, cheap to query/index, single source of truth) is preferred over a separate carrier-operations table (more flexible, richer audit, but heavier and duplicates the existing create pattern). Outbox status alone is **insufficient** because outbox events are transient per attempt and do not survive as the authoritative recovery state. Recommend: cancel state on `shipments` + an append-only `shipment_events`/audit trail for operation observability (§24).

---

## 16. Tracking Poller Audit

`CONFIRMED IN CODE`: forward-only status progression (`canTransition` with `CARRIER_STATUS_ORDER` + `TERMINAL_STATUSES`), DB-enforced dedup via partial `UNIQUE(external_event_id)` (added in 0046, closing the M7.2.4 TOCTOU finding), atomic claim via `last_carrier_sync_at` throttle.

Gap for B.3: eligibility is `carrier_create_status='SUCCESS' AND carrier_tracking_id IS NOT NULL AND carrier_status_mapped NOT IN ('DELIVERED','CANCELLED','COMPLETED')`. It keys off `carrier_status_mapped`, **not** `shipments.status`. A B.2-cancelled shipment sets `shipments.status='CANCELLED'` but leaves `carrier_status_mapped` at its last carrier value (e.g. `IN_TRANSIT`) and `carrier_create_status='SUCCESS'` → **it remains eligible and keeps polling after cancellation** (`MEDIUM`, B3-M-1). Recommend the claim predicate also exclude `shipments.status='CANCELLED'` (or set `carrier_status_mapped='CANCELLED'` on cancel, which also affects the §14 divergence record).

---

## 17. Webhook Audit

`CONFIRMED IN CODE` (`CarrierWebhookController`): HMAC-SHA256 signature verification, body-size limit, rate limit before verification, tenant routing via `:webhookToken` → credential row → org; **payload storeId/orgId never trusted**; shipment resolved solely from `carrierShipmentId == externalDeliveryId`; atomic dedup `UNIQUE(provider_key, external_delivery_id)`; failures persist `processed=false` + enqueue `shipping.carrier.webhook.retry`; always returns 200.

Does a webhook resurrect a cancelled order? **No** — the webhook ingester does not itself transition the order/shipment; it persists and links. Order state only changes through the poller/bridge path, which is FSM-guarded. Cancellation-related carrier statuses in webhooks are currently not mapped to any cancel action (no cancel-relevant processing exists), which is consistent with B.3 being unimplemented. `REQUIRES IMPLEMENTATION`: if carriers push "shipment cancelled/withdrawn" webhooks, B.3 must decide whether to reconcile them; out of scope to invent.

---

## 18. Failure-Injection Analysis (design contract, not implemented)

| Case | SCS order | SCS shipment | Carrier-op state | recoveryStatus | outbox | inventory | action |
|------|-----------|--------------|------------------|----------------|--------|-----------|--------|
| 1 HTTP success | CANCELLED (unchanged) | CANCELLED | `CANCEL_SUCCEEDED` | cleared | DISPATCHED | none (already released) | terminal |
| 2 HTTP failure (retryable) | CANCELLED | CANCELLED | `CANCEL_IN_PROGRESS` | `CANCEL_RETRYING` | backoff PENDING | none | retry via policy |
| 3 Timeout (unknown) | CANCELLED | CANCELLED | `CANCEL_UNKNOWN` | `CANCEL_UNKNOWN`/`RECONCILIATION_REQUIRED` | DISPATCHED or reconcile | none | reconciliation lookup |
| 4 Response lost | CANCELLED | CANCELLED | `CANCEL_UNKNOWN` | `RECONCILIATION_REQUIRED` | — | none | reconciliation |
| 5 Crash before call | CANCELLED | CANCELLED | lease stale | (unchanged) | stale→PENDING | none | lease recovery re-claims |
| 6 Crash after call, before record | CANCELLED | CANCELLED | UNKNOWN | `RECONCILIATION_REQUIRED` | stale→PENDING | none | **must be idempotent** (§12) |
| 7 Crash after record | CANCELLED | CANCELLED | terminal | terminal | DISPATCHED | none | re-delivery ⇒ no-op guard |
| 8 Duplicate worker | CANCELLED | CANCELLED | single effective op | single | SKIP LOCKED | none | DB claim |
| 9 Reconcile UNKNOWN | CANCELLED | CANCELLED | resolved | `RECOVERED`/terminal | — | none | carrier lookup |
| 10 Carrier DELIVERED after cancel | **CANCELLED wins** | CANCELLED | n/a | `RECONCILIATION_REQUIRED` | `shipment.reconciliation_required` | **NO SALE** | exception + no refund |

Key safety fact (`CONFIRMED IN CODE`): because the SCS cancel transaction is already committed before any carrier call, and the poller/bridge refuse DELIVERED on a CANCELLED order, **every one of these cases leaves the order CANCELLED with no SALE**. B.3 adds *observability and reconciliation*, not new safety-critical writes to the order.

---

## 19. Security Audit

Tenant isolation, provider isolation, credential isolation, webhook security — all present and reusable (`CONFIRMED IN CODE`):
- Credentials AES-256-GCM encrypted (`carrier_credentials`), never returned via API; decrypted only for the outbound call.
- Provider resolved from `shipment.shippingProviderKey` → registry; a shipment can only invoke its configured provider (§23/CARRIER-07).
- Webhook tenant routing via `webhookToken`; external IDs mapped to shipments within the resolved credential's org context.
- Worker processes only the shipment named in the claimed event (no arbitrary shipment IDs accepted from external input).

Admin recovery: `carrier-admin.controller.ts` already gates recovery behind `admin:shipping:recovery` + `AuditService`. If B.3 adds a manual "re-run carrier cancellation" action, it must reuse this permission or introduce an equivalent — `REQUIRES BUSINESS DECISION` on whether B.3 exposes any admin cancel-recovery control (recommend yes, reusing the existing permission).

`IDOR`: the cancel operation is triggered internally by event, not by a client-supplied shipment id in the carrier worker — safe by construction, provided B.3 does not add a public "cancel shipment" endpoint (it should not; see §26).

---

## 20. Observability Audit

Existing: `CarrierObservabilityService` in-memory counters with periodic flush + per-call correlation IDs; structured logs per event; `carrier_webhook_total`, `carrier_webhook_failures_total`.

For B.3 to answer "who/which carrier/was cancel attempted/did it fail/timeout/reconciled/retries?", the following are **MISSING (do not implement now)**:
- Cancel-specific metrics: `carrier_cancel_attempted_total`, `carrier_cancel_succeeded/failed/unknown_total`, `carrier_cancel_reconciliation_total`, `carrier_delivered_after_cancel_total` (by provider).
- Persisted cancel attempt timestamp/retries/errorClass on the shipment (currently only create has these).
- A durable audit record of the cancel attempt (correlationId ↔ shipmentId ↔ provider ↔ result). In-memory counters alone (per-process) are not sufficient for post-hoc answering — flag that the M7.2.4 known limitation (in-memory, per-process observability and circuit breaker) applies equally to cancels.

---

## 21. Database / Migration Assessment

**B.3 DOES require migration `0049`** (0048 is not sufficient). Minimum additions (design only — not created):
- `shipments.carrier_pickup_id VARCHAR` (or `carrier_pickup_guid`) + `pickup_scheduled BOOLEAN DEFAULT false` (+ optional `pickup_status`, `pickup_date`).
- `shipments.carrier_cancel_status VARCHAR(24)`, `carrier_cancel_error TEXT`, `carrier_cancel_error_class VARCHAR(40)`, `carrier_cancel_retries INTEGER DEFAULT 0`, `carrier_cancel_attempted_at TIMESTAMPTZ`, `carrier_cancel_idempotency_key VARCHAR`.
- Widen or namespace `recovery_status` for cancel tokens ≤24 chars (else `ALTER ... TYPE VARCHAR(32)`).
- Supporting indexes: reconciliation-by-cancel (`WHERE carrier_cancel_status IN ('UNKNOWN','RETRY')`), partial index if the worker claim predicate changes to include `shipment.cancelled`.
- Optional: a partial `UNIQUE` on `outbox_events (event_type, aggregate_id) WHERE event_type IN ('shipping.carrier.cancel', ...)` to enforce at-most-one pending cancel event (defence-in-depth for §12).

Fresh DB, existing prod DB, idempotency (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), and zero-downtime (nullable columns, backfill not required — new cancel columns default null/terminal-safe) are all achievable. Rollback is additive-only. `REQUIRES IMPLEMENTATION` (B.3.1).

---

## 22. API Assessment

B.3 should require **no new public API**. The entire flow is expressible as: order cancellation (existing `/cancel`) → `shipment.cancelled`/`shipping.carrier.cancel` outbox → worker → reconciliation. The only acceptable new surface is an **admin** cancel-recovery action reusing `admin:shipping:recovery`. If a client-facing "carrier cancellation status" read is needed, it can be a projection on existing shipment reads. Recommendation: **no public write API** (§26 of spec).

---

## 23. Existing Carrier Capabilities (§27 matrix)

| Provider | type | canCancel | cancelShipment | cancelPickup | Current impl | B.3 impact |
|----------|------|-----------|----------------|--------------|--------------|------------|
| `manual-driver` | MANUAL | false | inherited no-op `{supported:false}` | not present | deterministic create only | Cancel = `NOT_REQUIRED`, no carrier action |
| `aramex` | CARRIER | false | explicit `{supported:false, reason}` | present (provider-only), needs GUID | verified request shape | Route to CancelPickup **only if** pickup scheduled; else reconcile |

Only these two providers exist; the audit does not assume future providers.

---

## 24. Test Infrastructure Audit

Available (`CONFIRMED IN CODE` / prior milestones): PostgreSQL Testcontainers + CI `postgis` service containers; 100-concurrent-worker claim tests (m723c); HTTP-mocked provider unit specs; failure-injection via monkey-patched `outbox.publish` (m73b2). Webhook signature and dedup tests exist.

Known limitation (do not treat as a defect): **>10 simultaneous Testcontainers on Windows Docker Desktop → resource exhaustion**; prefer sequential/controlled integration runs and rely on CI service containers for full parallel suites. B.3 should add: cancel idempotency (duplicate event), 100-concurrent cancel-worker no-double-effective-op, cancel-vs-DELIVERED reconciliation, cancel timeout→unknown→reconcile, provider isolation on cancel.

---

## 25. Required Invariants (validated against current code)

| ID | Invariant | Status today |
|----|-----------|--------------|
| CARRIER-01 | Carrier failure never rolls back SCS cancellation | ✅ HOLDS (carrier is downstream, out of tx) |
| CARRIER-02 | Carrier failure can't reactivate a cancelled order | ✅ HOLDS (FSM terminal) |
| CARRIER-03 | Carrier DELIVERED can't override SCS CANCELLED | ✅ HOLDS (processCarrierDelivery guard) |
| CARRIER-04 | No inventory SALE after SCS cancellation | ✅ HOLDS (SALE gated behind CARRIER-03 guard) |
| CARRIER-05 | Duplicate cancel ⇒ one effective carrier op | ⚠️ `REQUIRES IMPLEMENTATION` (no cancel idempotency) |
| CARRIER-06 | Unknown carrier result ⇒ reconciliation | ⚠️ `REQUIRES IMPLEMENTATION` (reconcile is create-only) |
| CARRIER-07 | Only the configured provider is invoked | ✅ HOLDS (registry key lookup) |
| CARRIER-08 | Carrier credentials tenant/provider isolated | ✅ HOLDS (encrypted per-org creds) |
| CARRIER-09 | Reconciliation processing concurrency-safe | ✅ create path (SKIP LOCKED); ⚠️ cancel path N/A until implemented |
| CARRIER-10 | Carrier ops observable/auditable | ⚠️ PARTIAL (create logged; cancel + delivered-after-cancel not recorded) |

B.3's remaining work is concentrated on CARRIER-05, -06, -10 (and the cancel half of -09).

---

## 26. Business Rule Compliance (§31)

No repository behaviour contradicts the locked rules. The SCS-authoritative, best-effort-carrier, never-rollback, unknown⇒reconcile, DELIVERED-after-cancel-wins principles are structurally satisfied for the order/inventory layers. Compliance gaps are **missing features** (cancel orchestration + reconciliation), not **incorrect existing behaviour**.

---

## 27. Scope Compliance (§32)

All findings fall inside B.3 scope (cancel orchestration, cancelPickup, unsupported-cancel handling, cancel state, recovery, reconciliation, delivered-after-cancel, poller/webhook integration, outbox, idempotency, concurrency, security, observability, PG verification). No finding required touching delivery-exception/RTS/refund/payment/dispute surfaces (explicitly out of scope and confirmed untouched).

---

## 28. Proposed B.3 Implementation Sequence (design only — not implemented)

**M7.3-B.3.1 — Schema & Carrier-Cancel State Foundation**
- Objective: model cancellation as a first-class carrier operation.
- Files: `infra/drizzle/migrations/0049_*.sql`, `shipment.schema.ts`, `shipping.types.ts`.
- Changes: pickup ref + `pickupScheduled`; `carrier_cancel_*` columns; cancel idempotency key; cancel state enum; indexes; widen/namespace recovery tokens.
- Exit: migration idempotent on fresh+prod; `tsc`/build clean; no behaviour change yet.

**M7.3-B.3.2 — Provider Abstraction + Wiring of Cancel**
- Objective: give the worker a generic, capability-aware cancel path and connect the event.
- Files: `shipping-provider.ts`, `shipping.types.ts` (add `canCancelPickup` capability + `cancelPickup`/typed result), `aramex.provider.ts` (lift cancelPickup onto contract), `orders.service.ts` (publish `shipping.carrier.cancel` post-commit-transactional) **or** worker claim predicate.
- Exit: cancel event is claimed by the worker; manual + aramex route correctly; unit-tested.

**M7.3-B.3.3 — Cancel Execution, Timeout/Failure/Unknown States**
- Objective: implement `handleCancel` per locked policy with retries/backoff and deterministic state transitions.
- Files: `shipping-carrier.worker.ts` (`handleCancel`), `carrier-errors.ts`, `carrier-retry-policy.ts` reuse.
- Exit: idempotent, single-effective-op, correct state for each of Cases 1-9.

**M7.3-B.3.4 — Reconciliation + DELIVERED-after-CANCEL**
- Objective: extend reconciliation to cancel; record `CARRIER_DELIVERED_AFTER_CANCEL` exception + `shipment.reconciliation_required` outbox; make poller skip cancelled shipments.
- Files: `carrier-reconciliation.service.ts`, `carrier-tracking-poller.ts`.
- Exit: unknown cancels recover; delivered-after-cancel is observable and never SALEs/resurrects (CARRIER-06/-10, B3-M-1, B3-H-5).

**M7.3-B.3.5 — Concurrency & Failure Injection**
- Objective: DB-level cancel-claim arbitration; 100-worker duplicate-event test; timeout vs late-success; crash-window injection.
- Files: new `m73b3-*.postgres.spec.ts` + unit specs.
- Exit: required concurrency matrix (§29) green; no double-effective cancel op.

**M7.3-B.3.6 — Runtime Verification** · independent gates, evidence-driven (mirrors B.2 verification structure).

**M7.3-B.3.7 — Release Closure** · B.0 reconciliation note if any cancel business rule (e.g. pickup scheduling existence) needs formal lock; ADR as needed.

---

## 29. Proposed Runtime Verification Contract

- Static: no external carrier HTTP inside `cancelOrder` transaction; all cancel writes use the transaction client where applicable.
- Unit: capability routing (manual→NOT_REQUIRED, aramex no-pickup→reconcile, aramex pickup→cancelPickup), typed cancel results, error classification, idempotency guard.
- PostgreSQL integration: single-effective-op under 100 duplicate `shipment.cancelled`/`shipping.carrier.cancel`; cancel-claim mutual exclusion; delivered-after-cancel ⇒ order CANCELLED + no SALE + exception recorded + `shipment.reconciliation_required`; unknown-cancel ⇒ reconcile to terminal; provider/tenant isolation; lease recovery across crash windows.
- Regression: B.1, B.2 (289 targeted), M7.2.x carrier operations all remain green.

---

## 30. Proposed Release Gates (design)

Architecture (cancel never in SCS tx; SCS authoritative; Aramex capability truthful; no fabricated CancelShipment) · Database (0049 idempotent; cancel state correct) · Carrier (CancelPickup only when scheduled; unsupported handled; timeout/failure/unknown handled) · Reconciliation (cancel-aware, concurrent-safe, tenant-safe, retry-safe) · Tracking (delivered-after-cancel safe; no SALE; no resurrection; poller respects cancelled) · Outbox (atomic, deduplicated, retryable) · Security (tenant/provider/credential isolation; webhook protected; no IDOR) · Concurrency (100-worker duplicate safety) · Failure injection (all 10 cases) · Regression (B.1/B.2/M7.2.x green).

---

## 31. Findings by Severity

**CRITICAL:** none. (SCS authority + FSM guard + out-of-transaction carrier calls already prevent the catastrophic outcomes: no resurrection, no post-cancel SALE.)

**HIGH:**
- **B3-H-1** Cancellation leg not connected: `shipment.cancelled` has no consumer; `shipping.carrier.cancel` never published; `handleCancel` is a no-op. *Location:* orders.service.ts:1126-1143, shipping-carrier.worker.ts:180/208/445. *Risk:* carrier is never told about cancellations. *Action:* B.3.2/B.3.3. *Milestone:* B.3.
- **B3-H-2** `cancelPickup`/`createPickup` not on the provider abstraction; capabilities lack `canCancelPickup`. *Location:* shipping-provider.ts, shipping.types.ts:159-166, aramex.provider.ts:586-708. *Risk:* worker cannot generically invoke pickup cancellation. *Action:* B.3.2.
- **B3-H-3** No persisted pickup reference / "pickup scheduled" signal on shipment. *Location:* shipment.schema.ts (absent). *Risk:* CancelPickup cannot be assembled or safely gated; blind call prohibited. *Action:* B.3.1.
- **B3-H-4** No carrier-cancellation operation state and reconciliation is create-only → failed/unknown cancels are unrecoverable. *Location:* shipment.schema.ts, carrier-reconciliation.service.ts:106-245. *Action:* B.3.1/B.3.4.
- **B3-H-5** DELIVERED-after-CANCEL is safe but silent: no exception, no `recoveryStatus`, no `shipment.reconciliation_required`, violating locked §18 observability. *Location:* carrier-tracking-poller.ts:230-254, orders.service.ts:2458-2466. *Action:* B.3.4.

**MEDIUM:**
- **B3-M-1** Tracking poller eligibility ignores `shipments.status='CANCELLED'`; cancelled shipments keep being polled / can advance carrier_status_mapped. *Location:* carrier-tracking-poller.ts:168-183.
- **B3-M-2** `recovery_status VARCHAR(24)` width vs proposed `CARRIER_CANCEL_*` tokens (some >24 chars). *Location:* 0045:30. *Action:* namespace to ≤24 tokens or widen in 0049.
- **B3-M-3** No DB-level uniqueness enforcing at-most-one pending cancel event; cancel idempotency relies on not-yet-existing worker logic + the order optimistic lock. *Action:* B.3.1/B.3.5.

**LOW:**
- **B3-L-1** Aramex CancelPickup live/sandbox behaviour unverified (shape-only). *REQUIRES EXTERNAL CARRIER VERIFICATION.*

**INFO:**
- **B3-I-1** Circuit breaker + observability are per-process in-memory (M7.2.4 known limitation) — applies to cancel retries/results in multi-instance.
- **B3-I-2** Windows Docker Desktop >10 Testcontainers resource exhaustion — prefer sequential/CI service containers.

**Business decisions required:**
- **BD-1** Do shipments ever schedule Aramex pickups in the current flow? Determines whether `cancelPickup` is reachable or whether cancel always lands in `RECONCILIATION_REQUIRED`/`NOT_REQUIRED`.
- **BD-2** For a shipment with no carrier-cancel capability and no scheduled pickup: `NOT_REQUIRED` vs `RECONCILIATION_REQUIRED`.
- **BD-3** Whether B.3 exposes an admin "re-run carrier cancellation" control (recommend reusing `admin:shipping:recovery`).

---

## 32. GO / GO WITH CONDITIONS / NO-GO

**GO WITH CONDITIONS.**

The distributed-systems foundation (lease outbox, retry, circuit breaker, reconciliation cadence, DB-enforced tracking dedup, secure webhook/credential handling, FSM-authoritative cancellation) is present, tested, and correct, so B.3 can be implemented **additively** without destabilising B.1/B.2 or the order/inventory invariants. Conditions that must be resolved before/within implementation:

1. **Connect the cancellation leg** (B3-H-1): publish/consume a `shipping.carrier.cancel` event; never call the carrier inside the SCS transaction.
2. **Extend the provider abstraction** with capability-aware pickup cancellation (B3-H-2).
3. **Add migration 0049** to persist pickup reference + carrier-cancel state and reconcile recovery-token width (B3-H-3, B3-H-4, B3-M-2, B3-M-3).
4. **Implement cancel-aware reconciliation** and the `CARRIER_DELIVERED_AFTER_CANCEL` exception + `shipment.reconciliation_required` event (B3-H-4, B3-H-5).
5. **Make the tracking poller cancellation-aware** (B3-M-1).
6. Confirm **BD-1/BD-2/BD-3** before coding the cancel routing decisions.
7. Real Aramex CancelPickup semantics to be validated against a sandbox during runtime verification (B3-L-1).

**Not a NO-GO:** the dangerous invariants (CARRIER-01..04) already hold today; the missing pieces are functionality and observability, not corrective safety work.

---

## 33. Recommended Next Step

Begin **M7.3-B.3.1 — Carrier-Cancel State Foundation** (schema 0049 + types + recovery-token decisions), which unblocks every other phase and is the only step requiring an up-front business decision (BD-1/BD-2) on pickup-scheduling reachability.

---

```text
========================================
SCS M7.3-B.3 — ARCHITECTURE AUDIT
========================================

Baseline:
M7.3-B.2 CLOSED / PASS

Carrier:
Manual (no integration) + Aramex (canCancel=false, CancelShipment
unsupported, CancelPickup implemented but provider-only and un-persisted).
SCS-authoritative cancellation + lease outbox + retry + circuit breaker +
create-only reconciliation are present and correct; the cancellation leg,
cancel state, cancel-aware reconciliation, and delivered-after-cancel
observability are NOT implemented.

Critical findings: 0
High findings: 5
Medium findings: 3
Low findings: 1
Business decisions required: 3
Implementation blockers: 0 (all gaps are additive B.3 work, not defects)

Verdict: GO WITH CONDITIONS

Recommended next phase: M7.3-B.3.1 — Carrier Cancellation State Foundation
========================================
```
