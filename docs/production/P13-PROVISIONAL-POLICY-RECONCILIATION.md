# SCS P13 — Provisional Business Policy Reconciliation

**Document type:** Review proposal only. No file edits. No approvals.
**Status:** PROVISIONAL — PENDING BUSINESS APPROVAL. Four previously unresolved questions are now resolved in the provisional policy (platform-responsibility commission, carrier-damage commission, carrier-damage delivery fee, administrator escalation SLA).
**Baseline:** branch `develop`, HEAD `8d60e36`, clean working tree (verified read-only).
**Authoritative inputs read:**
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-RULES-ARCHITECTURE-LOCK.md` (927 lines)
- `P13-BUSINESS-SIGNOFF-REGISTER.md` (114 lines)
- `P13-RELEASE-FOLLOW-UPS.md` (32 lines)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-SIGNOFF-AND-RELEASE-AUTHORIZATION-REPORT.md` (167 lines, gate updated)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-LINUX-CI-BUILD-VERIFICATION.md` (115 lines)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-LINUX-REGRESSION-VERIFICATION.md` (167 lines)
- Source: `apps/api/src/modules/returns/returns.service.ts`, `return-expiration.worker.ts`, `returns.schema.ts`, `returns.controller.ts`

---

## 1. Proposed Architecture-Lock Amendments

### 1.1 §4 — Return State Machine (FSM amendment)

**Current lock (BD-P13-RETURN-FSM):**
```
REQUESTED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED']
```

**Proposed amendment:**
Add a new transition target `ESCALATED` and a new state:

```
REQUESTED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'ESCALATED']
ESCALATED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED']  (admin returns to merchant queue)
```

**Proposed new rule:**
```
BD-P13-RETURN-FSM-ESC-001: When the merchant response deadline passes without action,
  the request transitions REQUESTED → ESCALATED (not EXPIRED). The request remains open.
BD-P13-RETURN-FSM-ESC-002: ESCALATED requests may be resolved by an administrator:
  reassigned to the merchant (→ MERCHANT_APPROVED path), rejected (→ MERCHANT_REJECTED),
  or cancelled at buyer request (→ CANCELLED).
BD-P13-RETURN-FSM-ESC-003: No automatic approval or rejection occurs solely because
  the merchant did not respond.
BD-P13-RETURN-FSM-ESC-004: The EXPIRED terminal state is retained for buyer-initiated
  cancellation after the return window has passed without buyer action (if applicable),
  but is NOT triggered by merchant non-response.
```

**Conflict with existing code:** The current `ReturnExpirationWorker` (`return-expiration.worker.ts` lines 68–116) transitions `REQUESTED → EXPIRED` when `expires_at <= now()`. This must be redesigned to transition `REQUESTED → ESCALATED` and emit an escalation event. The FSM transition map in `returns.service.ts` line 61 must add `'ESCALATED'` to `REQUESTED`. The CHECK constraint in migration 0059 must add `'ESCALATED'` to the status vocabulary.

### 1.2 §5.8 — Exceptions Requiring Admin Review (amendment)

**Current lock (BD-P13-EXCEPT-004):**
> "Merchant has 72 hours to respond to a return request. After 72h, the buyer or admin may escalate to ADMIN for auto-approval or expiry."

**Proposed replacement:**
```
BD-P13-EXCEPT-004 (revised): The merchant response deadline is 72 hours from the
  return request creation (or from the applicable response-clock start). When the
  deadline passes:
  (a) The request transitions to ESCALATED (not EXPIRED).
  (b) An administrator is notified and assumes responsibility for resolution.
  (c) No automatic approval, rejection, or expiry occurs solely because of the timeout.
  (d) The escalation event and administrator resolution are recorded in
      return_request_events with actor_type = 'SYSTEM' (for the timeout) and
      actor_type = 'ADMIN' (for the resolution).
  (e) Repeated processing of the same timeout must not create duplicate escalations
      (idempotent: only transition if status is still REQUESTED).

BD-P13-EXCEPT-005 (new): The provisional administrator resolution target is three
  business days from escalation. The business calendar, timezone, holiday handling,
  and overdue-escalation process remain to be specified and approved.
```

### 1.3 §5.2 — Return Window (clarification — no change to value)

**No change to the 14-day provisional value.** Add clarification:

```
BD-P13-WINDOW-005 (new): The buyer's return-eligibility deadline (14 days from
  DELIVERED) is distinct from the merchant's response deadline (72 hours from
  request creation). The return_requests.expires_at column currently represents
  the merchant response deadline. Conceptually:
  - return_deadline_at = deliveredAt + 14 days (buyer eligibility — not stored
    as a column; computed at request creation time)
  - merchant_response_deadline_at = createdAt + 72h (stored as expires_at)
  These are two separate clocks. The column name expires_at is retained for
  backward compatibility but its documented meaning is merchant_response_deadline_at.
```

### 1.4 §7.2 — Commission Treatment (amendment — responsibility-dependent)

**Current lock (BD-P13-COMM-001):**
> "Commission is NOT adjusted when a refund is issued. The platform retains its original commission."

**Proposed amendment — responsibility-dependent commission:**
```
BD-P13-COMM-001 (revised): Commission treatment depends on the confirmed responsibility
  category for the return:

  (a) Confirmed merchant responsibility: Reverse commission attributable to refunded
      goods. The merchant's settlement is credited for the commission portion of the
      refund (reducing platform take-rate on returned volume).
  (b) Buyer remorse (CUSTOMER_REQUEST): Retain original commission. No reversal.
  (c) Confirmed platform responsibility: Reverse commission attributable to refunded
      goods (same treatment as merchant-responsible).
  (d) Carrier damage: Reverse commission attributable to refunded goods (same
      treatment as merchant-responsible). Carrier recovery is pursued separately
      and is not implemented in P13.
  (e) Contested/unresolved responsibility: Retain commission until administrator
      assigns a final category. If later reclassified to merchant-responsible,
      create a settlement adjustment for the commission reversal.

BD-P13-COMM-002 (revised): Commission reversal is limited to the commission
  attributable to goods actually refunded. Partial returns reverse a proportional
  share of commission (same ratio as the refund-to-confirmed-payment ratio).
BD-P13-COMM-003 (retained): BUSINESS APPROVAL REQUIRED.
```

**Conflict with existing code:** The current `returns.service.ts` does not differentiate commission treatment by responsibility category. The `p13-financial-dispute.postgres.spec.ts` tests verify commission retention for all cases. If responsibility-dependent commission is approved, the refund calculation logic and settlement adjustment path must be extended.

### 1.5 §7.3 — Delivery Fee Treatment (amendment — exception-based)

**Current lock (BD-P13-FEE-001/002/003):**
> "Delivery fees are refunded ONLY when the entire sub-order is returned."

**Proposed amendment — exception for confirmed fault:**
```
BD-P13-FEE-001 (retained as baseline): The provisional baseline is that the original
  delivery fee is refunded for a full-sub-order return only.
BD-P13-FEE-004 (new): Exception — confirmed merchant or platform fault: When a return
  is confirmed as merchant-responsible or platform-responsible, the original delivery
  fee MAY be refunded even on partial returns, at administrator discretion. This is
  an exception path, not the default.
BD-P13-FEE-005 (new): Carrier damage: Refund the buyer's original delivery fee.
  Pursue carrier recovery separately where possible. Carrier recovery is not
  guaranteed and must not be represented as implemented. The policy must define
  eligibility for partial versus full returns.
BD-P13-FEE-006 (new): The following amounts are conceptually distinct and must not
  be conflated in calculations or UI:
  (a) Refund for goods
  (b) Original delivery fee charged to the buyer
  (c) Return-shipping cost (not implemented — carrier integration deferred)
  (d) Commission reversal
  (e) Settlement adjustment
```

### 1.6 §15 — Risks & Unresolved Business Decisions (additions)

**Add new unresolved decisions:**

| ID | Decision | Default | Risk if Not Approved |
|---|---|---|---|
| BD-P13-APPROVE-007 | Platform-responsibility commission treatment | **RESOLVED** — reverse commission (same as merchant) | None — provisional policy is clear |
| BD-P13-APPROVE-008 | Carrier-damage commission treatment | **RESOLVED** — reverse commission (same as merchant) | None — provisional policy is clear |
| BD-P13-APPROVE-009 | Carrier-damage delivery-fee treatment | **RESOLVED** — refund buyer; carrier recovery separate | Carrier recovery process not implemented |
| BD-P13-APPROVE-010 | Administrator escalation resolution SLA | **RESOLVED** — 3 business days (provisional) | Business calendar/timezone/holiday handling TBD |
| BD-P13-APPROVE-011 | Merchant timeout behavior | Escalate (not auto-expire) | Requires redesign of expiration worker + FSM + migration |

---

## 2. Proposed Business Sign-Off Register Entries

Each entry marked **PENDING — NOT APPROVED**.

| # | Decision | Provisional decision | Accountable approver role | Status |
|---|---|---|---|---|
| 1 | Buyer return window | 14 days from delivery | Head of Operations / COO | **PENDING — NOT APPROVED** |
| 2 | Merchant response SLA | 72 hours before escalation | Head of Merchant Partnerships | **PENDING — NOT APPROVED** |
| 3 | Merchant timeout behavior | Escalate to admin; no auto-approve/reject/expiry | Head of Merchant Partnerships (co: Ops) | **PENDING — NOT APPROVED** |
| 4 | Commission on merchant-responsible refund | Reverse commission on refunded goods | Finance Lead / CFO | **PENDING — NOT APPROVED** |
| 5 | Commission on buyer-remorse refund | Retain commission | Finance Lead / CFO | **PENDING — NOT APPROVED** |
| 6 | Commission on platform-responsible refund | Reverse commission on refunded goods (same as merchant) | Finance Lead / CFO | **PENDING — NOT APPROVED** |
| 7 | Commission on carrier-damage refund | Reverse commission on refunded goods (same as merchant) | Finance Lead / CFO | **PENDING — NOT APPROVED** |
| 8 | Delivery-fee refund baseline | Full-sub-order return only | Finance Lead (co: Ops) | **PENDING — NOT APPROVED** |
| 9 | Delivery-fee exception for confirmed fault | May refund on partial if merchant/platform fault | Finance Lead (co: Ops) | **PENDING — NOT APPROVED** |
| 10 | Delivery-fee treatment for carrier damage | Refund buyer; pursue carrier recovery separately | Finance Lead (co: Ops) | **PENDING — NOT APPROVED** |
| 11 | Disputed responsibility flow | Merchant first → admin escalation | Head of Operations / COO | **PENDING — NOT APPROVED** |
| 12 | Settlement recovery | Manual Finance/admin adjustment; no auto clawback | Financial Controller | **PENDING — NOT APPROVED** |
| 13 | Voucher returns | Administrator review for every case | Finance Lead (co: Risk/Fraud) | **PENDING — NOT APPROVED** |
| 14 | Administrator escalation resolution SLA | 3 business days from escalation (provisional) | Head of Operations / COO | **PENDING — NOT APPROVED** |
| D | Deployment target | Limited single-process pilot only | CTO / Head of Engineering | **PENDING — NOT APPROVED** |

**Overall register status: 0 of 14 business decisions and 0 of 1 deployment-target decision approved → release is BLOCKED on business approvals.**

---

## 3. Decision Matrix — Provisional Choices vs. Unresolved Questions

### A. Responsibility Matrix

| Responsibility category | Decision authority | Commission treatment | Original delivery-fee treatment | Refund implications | Policy still requiring approval |
|---|---|---|---|---|---|
| **Confirmed merchant responsibility** | Merchant (or admin if escalated) | Reverse commission on refunded goods | Refund if full sub-order return; exception for partial if admin approves | Goods + proportional VAT refunded; settlement adjusted | Commission reversal mechanics (BD-P13-APPROVE-004) |
| **Buyer remorse (CUSTOMER_REQUEST)** | Merchant (or admin if escalated) | Retain commission | Refund only if full sub-order return | Goods + proportional VAT refunded; no commission reversal; no delivery-fee exception | None — provisional policy is clear |
| **Confirmed platform responsibility** | Admin only | Reverse commission on refunded goods (same as merchant-responsible) | Refund if full sub-order return; exception for partial if admin approves | Goods + proportional VAT refunded; commission reversed; settlement adjusted | None — provisional policy is clear |
| **Carrier damage** | Admin only (carrier integration not implemented) | Reverse commission on refunded goods (same as merchant-responsible) | Refund buyer's original delivery fee; pursue carrier recovery separately (not implemented) | Goods + proportional VAT refunded; commission reversed; delivery fee refunded; carrier recovery separate | Carrier recovery process (not implemented); partial vs full delivery-fee eligibility |
| **Contested responsibility** | Merchant responds first → admin escalation | Retain until admin assigns final category; reconcile through auditable adjustment after classification | Retain until admin assigns final category; reconcile through auditable adjustment after classification | Goods + proportional VAT refunded; financial treatment follows final category; provisional treatment recorded if refund proceeds first | Administrator escalation SLA (provisional: 3 business days) |
| **Unresolved after review** | Admin assumes full responsibility | Retain until resolved | Retain until resolved | Refund processed; financial treatment follows eventual category assignment | Administrator resolution SLA |

### B. Unresolved Questions (explicit)

**RESOLVED in provisional policy (pending formal business approval):**

1. **Platform-responsibility commission:** **RESOLVED** — Reverse commission attributable to the net value of goods refunded (same treatment as merchant-responsible).
2. **Carrier-damage commission:** **RESOLVED** — Reverse commission attributable to the net value of goods refunded (same treatment as merchant-responsible).
3. **Carrier-damage delivery fee:** **RESOLVED** — Refund the buyer's original delivery fee; pursue carrier recovery separately where possible. Carrier recovery is not guaranteed and must not be represented as implemented. Policy must define eligibility for partial versus full returns.
4. **Administrator escalation SLA:** **RESOLVED** — Provisional target: 3 business days from escalation. Business calendar, timezone, holiday handling, and overdue-escalation process remain to be specified and approved.

**Still unresolved:**

5. **Contested/unresolved responsibility financial treatment:** When responsibility is contested or unresolved, do not make a final responsibility-dependent commission adjustment until responsibility is classified. If the buyer's refund proceeds first, record the provisional treatment and reconcile it through an auditable adjustment after classification.

---

## 4. Separation of the Two Clocks

### Clock 1 — Buyer's return-eligibility deadline

- **Provisional value:** 14 days from the sub-order's DELIVERED timestamp.
- **Conceptual name:** `return_deadline_at`
- **Current implementation:** Computed at request creation time (`deliveredAt + RETURN_WINDOW_DAYS * 86400000`). Not stored as a column on `return_requests`. Enforced by `returns.service.ts` line 129–131.
- **Proposed change:** None. The 14-day window is retained as-is.

### Clock 2 — Merchant's response deadline

- **Provisional value:** 72 hours from the return request creation (or from the applicable response-clock start).
- **Conceptual name:** `merchant_response_deadline_at`
- **Current implementation:** Stored as `return_requests.expires_at` (schema line 42). Used by `ReturnExpirationWorker` to auto-expire (`REQUESTED → EXPIRED`).
- **Proposed change:** The column `expires_at` is retained but its documented meaning changes from "auto-expiry deadline" to "merchant response deadline." When the deadline passes, the request transitions `REQUESTED → ESCALATED` (not `EXPIRED`). The worker is renamed conceptually to a "merchant-response monitor" that escalates rather than expires.

### What happens when the merchant response deadline passes

| Event | Behavior |
|---|---|
| Request status | Remains open (transitions to `ESCALATED`, not terminal) |
| Escalation | Administrator is notified (outbox event `return.escalated`) |
| Auto-approve/reject/expiry | **None.** No automatic approval, rejection, or expiry occurs solely because of the timeout. |
| Auditability | `return_request_events` records the escalation with `actor_type = 'SYSTEM'` and `event_type = 'ESCALATED'`. Administrator resolution recorded with `actor_type = 'ADMIN'`. |
| Idempotency | Repeated processing of the same timeout must not create duplicate escalations. Enforced by: only transition if `status = 'REQUESTED'` (optimistic lock). |
| Duplicate financial adjustments | The existing cumulative-refund cap (`requestRefund()` FOR UPDATE) and single-active-return-per-sub-order constraint prevent duplicate adjustments regardless of escalation. |

### Administrator resolution SLA

**Provisional target:** 3 business days from escalation. The business calendar, timezone, holiday handling, and overdue-escalation process remain to be specified and approved (Q-08).

---

## 5. Commission and Refund Calculation Rules

### 5.1 Commission reversal scope

- Commission reversal is limited to the commission attributable to **goods actually refunded** in a confirmed merchant-responsible return.
- Partial returns reverse a proportional share: `commission_reversal = total_commission × (refund_amount / confirmed_payment_amount)`.
- Buyer-remorse returns retain commission under the provisional policy.
- Platform-responsibility and carrier-damage commission treatment is **[UNRESOLVED]**.

### 5.2 Authoritative data sources

- Calculations must use **authoritative order/offer/commission snapshots** rather than current mutable settings:
  - `order_items.unit_price_minor` (checkout-time snapshot)
  - `order_financial_breakdown.commissionMinor` (finalized at checkout)
  - `order_financial_breakdown.deliveryFeeMinor` (finalized at checkout)
- Do not re-read from `merchant_offers` or `price_tiers` — these may have changed since checkout.

### 5.3 Rounding, precision, and idempotency (for later approval)

| Concern | Proposed rule (pending approval) |
|---|---|
| Rounding | Use `Math.round()` on minor units (integer arithmetic). No floating-point. |
| Currency precision | All amounts in minor units (fils/cents). No fractional minor units. |
| Repeated partial returns | Cumulative returned quantity per `order_item` must not exceed ordered quantity. Cumulative refund must not exceed confirmed payment. Enforced by existing `requestRefund()` FOR UPDATE cap. |
| Maximum refundable amount | `SUM(unit_price × returned_qty) + delivery_fee (if full sub-order) + proportional VAT`. Must not exceed confirmed payment amount. |
| Idempotency | Return request creation uses `idempotency_key` (unique per buyer + sub_order + fingerprint). Refund creation uses `idempotency_key` (unique per payment_record + return_request). Duplicate POST returns existing record. |

### 5.4 Illustrative calculation (labelled illustrative — NOT a configured rate or production fact)

> **Example:** A sub-order has 3 items: A (qty 2, unit_price 100,000), B (qty 1, unit_price 50,000), C (qty 5, unit_price 20,000). Delivery fee: 50,000. VAT rate: 15%. Commission rate: 10%.
>
> Confirmed payment = (200,000 + 50,000 + 100,000 + 50,000) × 1.15 = 460,000.
>
> **Partial return:** Return 1 unit of A (buyer remorse).
> - Goods refund = 100,000
> - VAT on refund = round(100,000 × 0.15) = 15,000
> - Total refund = 115,000
> - Delivery fee refund = 0 (not full sub-order)
> - Commission reversal = 0 (buyer remorse — retain commission)
>
> **Full sub-order return:** Return all items, full quantity (merchant-responsible).
> - Goods refund = 350,000
> - VAT on refund = round(350,000 × 0.15) = 52,500
> - Delivery fee refund = 50,000 (full sub-order)
> - VAT on delivery = round(50,000 × 0.15) = 7,500
> - Total refund = 350,000 + 52,500 + 50,000 + 7,500 = 460,000
> - Commission reversal = round(35,000 × (460,000 / 460,000)) = 35,000 (full commission reversed)
>
> **This example is illustrative only.** Actual rates, rounding, and responsibility-dependent treatment are subject to business approval.

---

## 6. Delivery-Fee Rules

### 6.1 Conceptual separation

The following amounts are **distinct** and must not be conflated:

| Amount | Description | Implemented? |
|---|---|---|
| Refund for goods | `SUM(unit_price × returned_qty)` + proportional VAT | Yes (P13) |
| Original delivery fee | `order_financial_breakdown.deliveryFeeMinor` + VAT | Yes (P13, full sub-order only) |
| Return-shipping cost | Carrier-charged cost for return logistics | **No** — carrier integration deferred to P14+ |
| Commission reversal | Proportional commission attributable to refunded goods | **Proposed** — responsibility-dependent |
| Settlement adjustment | Post-finalization financial correction (ADJUSTMENT settlement record) | Yes (P13) |

### 6.2 Provisional baseline

- Original delivery fee is refunded for a **full-sub-order return** only (all items, full quantity).
- Partial returns refund goods + proportional VAT only. Delivery fee is **not** refunded.
- **Exception:** When merchant or platform fault is confirmed, the administrator **may** refund the original delivery fee even on a partial return. This is an exception path, not the default.
- **Carrier damage:** [UNRESOLVED] — requires explicit policy decision on who bears the delivery cost.

### 6.3 Return-shipping costs

- Return-shipping costs and carrier integrations are **not implemented**.
- P13 does not integrate with any carrier for return shipments (BD-P13-SHIP-001).
- Aramex exposes no reverse-shipment API.
- Return shipping is buyer-arranged (manual handover).
- Do not imply that return-shipping cost calculations or carrier integrations are available.

---

## 7. Financial, Authorization, and Audit Controls

### 7.1 Proposed acceptance criteria

| ID | Control | Verification method |
|---|---|---|
| AC-PROP-001 | No mutation of finalized financial snapshots | Integration test: `order_financial_breakdown` row unchanged after refund/settlement adjustment |
| AC-PROP-002 | Append-only, traceable refund and settlement adjustments | Integration test: `refunds` and `settlement_records` rows are INSERT-only; UPDATE only on PENDING/CALCULATED settlements |
| AC-PROP-003 | Idempotent timeout escalation | PostgreSQL concurrency test: two simultaneous timeout processors → only one escalation event |
| AC-PROP-004 | Idempotent refund/adjustment processing | Integration test: duplicate refund POST returns existing refund; no duplicate settlement adjustments |
| AC-PROP-005 | Prevention of duplicate/excessive refunds across partial returns | Integration test: cumulative refund cap enforced; over-refund rejected |
| AC-PROP-006 | Tenant-isolation for buyer, merchant, admin | Integration test: IDOR attempts return 403 (cross-buyer, cross-store, cross-org) |
| AC-PROP-007 | Explicit authorization for every decision/financial action | Code review + integration test: every transition/financial action checks `assertStoreInOrg()`, `isTenantPrivileged()`, or buyer ownership |
| AC-PROP-008 | Responsibility decision recorded before responsibility-dependent financial treatment | Integration test: refund with commission reversal requires `responsibility_category` to be set; rejects if null |
| AC-PROP-009 | P12 payment/security regressions retained | Regression gate: all P1-P12 tests pass; 0 new failures |

### 7.2 Audit trail

- Every return state transition emits an outbox event atomically (`return_request_events` + `outbox_events` in same transaction).
- Every escalation records `actor_type = 'SYSTEM'` with `event_type = 'ESCALATED'`.
- Every administrator resolution records `actor_type = 'ADMIN'` with `event_type` = final status.
- Every refund creates a `refunds` row with `idempotency_key`, `return_request_id`, and `dispute_id` (if applicable).
- Every settlement adjustment creates a `settlement_records` row with `status = 'ADJUSTMENT'` and negative `net_minor`.

---

## 8. Pilot Operations

### 8.1 Single-process pilot restriction

**Provisional decision:** Limited single-process pilot only. Multi-instance production is **not authorized** until a durable or leader-coordinated scheduler is implemented, tested, and independently verified.

### 8.2 Four operational controls

The existing in-process `ReturnExpirationWorker` is accepted for a single-instance pilot **provided** the following four operational controls are in place and owned:

| # | Control | Description | Owner role |
|---|---|---|---|
| 1 | Alert on repeated expiration-polling errors | Page/notify when the worker logs consecutive poll failures (e.g., DB connection lost, query timeout). | Platform Ops / SRE |
| 2 | Monitor overdue merchant-response deadlines | Query/alert on `status = 'REQUESTED' AND expires_at < NOW() - interval '10 min'` to catch any row the worker has not yet escalated. **Note:** Under the proposed policy, this monitors escalation lag, not auto-expiry. | Platform Ops / SRE |
| 3 | Designate exactly one worker-enabled instance | Record which single API instance owns the worker so duplicates are impossible during the pilot. The worker registers on every API instance (no enable/disable flag), so the pilot must run exactly one replica. | Platform Ops / SRE |
| 4 | Monitor worker startup and activity | Verify the `ReturnExpirationWorker` module-init log line on each boot and periodic activity (e.g., poll cycle logged every 2 minutes). | Platform Ops / SRE |

### 8.3 Multi-instance production blocking condition

Multi-instance production **retains a blocking condition**: P13 must not be released to multi-instance production until a supported durable scheduler or equivalent leader-coordinated worker has been **implemented, tested, and independently verified**.

- The current worker's `FOR UPDATE SKIP LOCKED` claim prevents double-processing and restart recovery is state-based.
- However, the worker registers on **every** API replica and has no enable/disable flag, so uncontrolled multi-instance production is not established.
- No BullMQ, external scheduler, Kubernetes CronJob, or new infrastructure is introduced by this proposal.
- The durable-scheduler work is deferred until the owner selects multi-instance production and authorizes it.

### 8.4 Release authorization

**Not granted.** This proposal does not authorize release. Release requires:
1. All business decisions approved.
2. Deployment target selected.
3. Explicit release authorization from the user.

---

## 9. Conflict Report

| # | Conflict | Existing document/code | Proposed change | Resolution required |
|---|---|---|---|---|
| C-01 | Merchant timeout behavior | Lock §4 FSM: `REQUESTED → EXPIRED` (terminal). Worker auto-expires. | `REQUESTED → ESCALATED` (non-terminal). Worker escalates to admin. | **Material change.** Requires FSM amendment, migration 0059 CHECK constraint update, worker redesign, new `ESCALATED` state, admin UI for escalated queue. Business must approve the escalation policy. |
| C-02 | Commission treatment | Lock §7.2 BD-P13-COMM-001: "Commission is NOT adjusted." Sign-off register Decision 2: "Retain original platform commission." | Responsibility-dependent: reverse on merchant-responsible/platform-responsible/carrier-damage, retain on buyer-remorse, reconcile after classification for contested. | **Material change.** Requires refund calculation logic extension, settlement adjustment path extension, new `responsibility_category` field on `return_requests`, new tests. Business must approve commission reversal policy. |
| C-03 | Delivery-fee exception | Lock §7.3 BD-P13-FEE-001/002: "Delivery fees refunded ONLY when entire sub-order returned." | Exception for confirmed merchant/platform fault (admin discretion). | **Minor change.** Requires admin UI override path, delivery-fee refund calculation on partial returns when exception applies. Business must approve exception policy. |
| C-04 | `expires_at` semantics | Lock §12.2 schema: `expires_at TIMESTAMPTZ` — documented as "SLA expiry." | Documented meaning changes to "merchant response deadline." Request remains open after deadline (escalated, not expired). | **Documentation change.** No schema change required. Worker logic changes (see C-01). |
| C-05 | Platform/carrier-damage financial treatment | Lock §7.2 BD-P13-COMM-001: uniform commission retention. | **RESOLVED in proposal** — reverse commission for platform-responsible and carrier-damage (same as merchant). Refund delivery fee for carrier damage; pursue carrier recovery separately. | Business must formally approve the resolved provisional positions. |
| C-06 | Administrator escalation SLA | Lock §5.8 BD-P13-EXCEPT-004: "After 72h, the buyer or admin may escalate." No admin SLA. | **RESOLVED in proposal** — provisional 3 business days from escalation. Business calendar/timezone/holiday handling TBD. | Business must formally approve the provisional SLA and define calendar rules. |

---

## 10. Outstanding Business Questions

| # | Question | Status | Impact |
|---|---|---|---|
| Q-01 | Platform-responsibility commission treatment | **RESOLVED** — reverse commission (same as merchant) | Consistent financial treatment for platform-caused returns |
| Q-02 | Carrier-damage commission treatment | **RESOLVED** — reverse commission (same as merchant) | Clear commission treatment for carrier-damaged goods |
| Q-03 | Carrier-damage delivery-fee treatment | **RESOLVED** — refund buyer; pursue carrier recovery separately | Buyer not penalized for carrier damage; carrier recovery is separate workflow |
| Q-04 | Administrator escalation resolution SLA | **RESOLVED** — provisional 3 business days | Escalated returns have a target resolution window |
| Q-05 | Should the merchant timeout behavior change from auto-expire to escalate? (C-01) | **PENDING** — proposed: escalate | Requires FSM + migration + worker redesign |
| Q-06 | Should commission treatment become responsibility-dependent? (C-02) | **PENDING** — proposed: yes | Requires refund logic + settlement adjustment extension |
| Q-07 | Should delivery-fee exceptions be permitted for confirmed fault? (C-03) | **PENDING** — proposed: yes | Requires admin UI override path |
| Q-08 | Business calendar, timezone, holiday handling for 3-business-day SLA | **PENDING** | Needed to implement the escalation SLA |
| Q-09 | Carrier recovery process and eligibility | **PENDING** — not implemented | Carrier recovery is a separate workflow; not part of P13 |

---

## 11. Release-Gate Status

| Item | Status |
|---|---|
| Technical verification (build + regression) | **PASS** (Linux CI verified) |
| Business approvals (6 original + 8 new = 14 total) | **0 of 14 approved → BLOCKED** |
| Deployment target | **PENDING — NOT APPROVED** |
| Release authorization | **NOT GRANTED** |
| Policy discussion | **IN PROGRESS** (this proposal) |
| Technical implementation/reverification | **NOT AUTHORIZED** by this task |

**Gate: `PASS WITH CONDITIONS — RELEASE AUTHORIZATION PENDING`** (from prior gate report, unchanged).

This proposal does not change the gate. Business approvals are still required.

---

## 12. Change-Scope Attestation

**I attest that:**

- **No repository files were edited, created, renamed, or deleted by the proposal itself.** This document was created only at the user's explicit subsequent request.
- **No source code, database migrations, schemas, configuration, tests, or deployment workflows were modified.**
- **No migrations were executed. No database or production data was modified.**
- **No commits, pushes, branches, deployments, or release actions were performed.**
- **No business decision, sign-off, or release gate was marked as approved.**
- **No approval was inferred from existing code, passing tests, previous reports, or this prompt.**
- **The current baseline is preserved:** branch `develop`, HEAD `8d60e36`, clean working tree.

This is a documentation-only review exercise. The proposal is reviewable but not authoritative until business owners approve.

---

## 13. Review Checklist for the Business Owner

- [ ] **Review the 14 provisional business decisions** (§2). Each is marked `PENDING — NOT APPROVED`. Approve, reject, or modify each.
- [ ] **Review the 4 resolved provisional positions** (§3B): platform-responsibility commission, carrier-damage commission, carrier-damage delivery fee, administrator escalation SLA. Confirm or revise.
- [ ] **Decide on the merchant timeout behavior** (Q-05): auto-expire (current) vs. escalate to admin (proposed). This is a material policy change.
- [ ] **Decide on responsibility-dependent commission** (Q-06): uniform retention (current) vs. responsibility-dependent (proposed).
- [ ] **Decide on delivery-fee exceptions** (Q-07): full-sub-order only (current) vs. exception for confirmed fault (proposed).
- [ ] **Define the business calendar rules** (Q-08): timezone, holiday handling for the 3-business-day administrator SLA.
- [ ] **Acknowledge carrier recovery scope** (Q-09): carrier recovery is not implemented in P13; it is a separate workflow.
- [ ] **Select the deployment target** (Decision D): limited single-process pilot or multi-instance production.
- [ ] **Accept the four operational controls** (§8.2) if pilot is selected.
- [ ] **Review the conflict report** (§9): 6 conflicts identified. C-05 and C-06 are resolved in the proposal; C-01, C-02, C-03, C-04 require decisions.
- [ ] **Grant explicit release authorization** if all decisions are approved and conflicts resolved.

**Completion of this review does not mean business policy is approved, implementation is authorized, or P13 is released.**
