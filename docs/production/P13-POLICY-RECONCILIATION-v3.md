# P13 — Policy Reconciliation v3

**Version:** 3.0 (corrected)
**Supersedes:** `P13-PROVISIONAL-POLICY-RECONCILIATION.md` (v1, 469 lines)
**Status:** PROVISIONAL — PENDING BUSINESS APPROVAL. All decisions formally unapproved.
**Baseline:** branch `develop`, HEAD `8d60e36`, clean working tree (read-only inspection).
**Companion documents:**
- `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` — 6 contradictions identified and corrected
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` — 15 decisions, 12 questions, 10 gates
- `P13-IMPLEMENTATION-READINESS-AND-PHASE-PLAN.md` — phased implementation plan

---

## 1. Status Terminology (standardized)

All documents use these statuses consistently:

| Status | Meaning |
|---|---|
| `PROVISIONAL — PENDING APPROVAL` | A provisional position exists. Formal approval is required before implementation. |
| `PENDING — NOT APPROVED` | No provisional position or still under discussion. Formal approval required. |
| `APPROVED` | Formal, attributable approval evidence exists (approver name, role, date, rationale). |
| `REJECTED` | Formal, attributable rejection evidence exists. |

**No decision currently has `APPROVED` or `REJECTED` status.** All 15 decisions are `PROVISIONAL — PENDING APPROVAL` (a provisional position exists) or `PENDING — NOT APPROVED` (awaiting direction).

---

## 2. Two Independent Deadlines

### 2.1 Clock 1 — Buyer return-eligibility deadline

| Attribute | Value |
|---|---|
| Provisional value | 14 days from the sub-order's DELIVERED timestamp |
| Current implementation | `RETURN_WINDOW_DAYS = 14` (env-overridable via `RETURN_WINDOW_DAYS`). Computed at request creation: `deliveredAt + RETURN_WINDOW_DAYS × 86400000`. Not stored as a column. Enforced in `returns.service.ts` lines 127–131. |
| Proposed change | None. The 14-day window is retained as-is. |
| Decision | D01 |
| Approval status | PROVISIONAL — PENDING APPROVAL |

### 2.2 Clock 2 — Merchant response deadline

| Attribute | Value |
|---|---|
| Provisional value | 72 hours from the return request creation timestamp |
| Current implementation | Stored as `return_requests.expires_at` (schema: `expires_at TIMESTAMPTZ`). Set at creation: `createdAt + 72h`. Used by `ReturnExpirationWorker` to auto-transition `REQUESTED → EXPIRED` when `expires_at <= now()`. |
| Proposed change | The column `expires_at` is retained with its current name and calculation. When the deadline passes, the worker transitions `REQUESTED → ESCALATED` (not `EXPIRED`). The column's semantic meaning changes from "auto-expiry deadline" to "merchant response deadline." |
| Migration implication | No schema change to the column. The CHECK constraint on `return_requests.status` must add `'ESCALATED'` to the vocabulary. The worker SQL changes from transitioning to EXPIRED to transitioning to ESCALATED. |
| Decision | D02, D03 |
| Approval status | PROVISIONAL — PENDING APPROVAL |

### 2.3 Clock independence

The two clocks are **independent**:
- Clock 1 (buyer eligibility) determines whether a buyer may create a return request.
- Clock 2 (merchant response) determines when an unactioned request is escalated to an administrator.
- Clock 1 expiry does not affect Clock 2. Clock 2 expiry does not affect Clock 1.
- A request created within Clock 1 but not actioned before Clock 2 expires is escalated, not expired.

---

## 3. Responsibility and Commission Treatment

### 3.1 Responsibility categories

| Category | Decision authority | Provisional commission treatment | Status |
|---|---|---|---|
| Confirmed merchant responsibility | Merchant (or admin if escalated) | Reverse commission attributable to net goods refunded | PROVISIONAL — PENDING APPROVAL (D04) |
| Buyer remorse (CUSTOMER_REQUEST) | Merchant (or admin if escalated) | Retain original commission. No reversal. | PROVISIONAL — PENDING APPROVAL (D05) |
| Confirmed platform responsibility | Admin only | Reverse commission attributable to net goods refunded (same as merchant) | PROVISIONAL — PENDING APPROVAL (D06) |
| Confirmed carrier damage | Admin only | Reverse commission attributable to net goods refunded (same as merchant) | PROVISIONAL — PENDING APPROVAL (D07) |
| Contested / unresolved | Merchant responds first → admin escalation | Retain commission until classified. Reconcile through auditable adjustment after classification. | PROVISIONAL — PENDING APPROVAL |

### 3.2 Commission reversal calculation (corrected)

**CORRECTED FORMULA — VAT-exclusive, delivery-fee-exclusive:**

```
net_goods_returned = SUM(order_items.unit_price_minor × returned_qty)
net_goods_total    = SUM(order_items.unit_price_minor × ordered_qty)
commission_total   = order_financial_breakdown.commissionMinor

commission_reversal = round(commission_total × (net_goods_returned / net_goods_total))
```

**Constraints:**
- All values sourced from immutable checkout-time snapshots (`order_items.unit_price_minor`, `order_financial_breakdown.commissionMinor`).
- Never re-read from `merchant_offers` or `price_tiers` (mutable).
- VAT is excluded from both numerator and denominator.
- Delivery fees are excluded from both numerator and denominator.
- `commission_reversal` must never exceed `commission_total × (net_goods_returned / net_goods_total)`.
- Cumulative commission reversals across all partial returns for an order must never exceed `commission_total`.
- Rounding: `Math.round()` on integer minor units. No floating-point. No fractional minor units.

**Outstanding Finance decision (OQ-04):** The allocation method above is the proposed default (proportional by net goods value ratio). Finance must explicitly approve this method. If the existing snapshots cannot support a reliable allocation (e.g., order-level commission with no per-item breakdown), the exact unresolved question must be recorded and the dependent implementation blocked.

### 3.3 Contested responsibility — provisional handling

When responsibility is contested or not yet classified:
1. The buyer's refund may proceed first if eligibility and merchant approval conditions are met.
2. Commission treatment defaults to **retain** (no reversal) until responsibility is classified.
3. When the administrator classifies responsibility:
   - If merchant/platform/carrier-responsible: create a settlement adjustment for the commission reversal.
   - If buyer-remorse: no adjustment needed (commission was correctly retained).
4. All provisional and final treatments are recorded in `return_request_events` with `actor_type` and `event_type` for auditability.

---

## 4. Delivery-Fee Treatment

### 4.1 Baseline (D08)

The original delivery fee is refunded **only** for a full-sub-order return (all items, full quantity). Partial returns refund goods + proportional VAT only. Delivery fee is **not** refunded on partial returns under the baseline.

**Status:** PROVISIONAL — PENDING APPROVAL

### 4.2 Exception — confirmed merchant or platform fault (D09)

When a return is confirmed as merchant-responsible or platform-responsible, the administrator **may** approve a delivery-fee refund even on a partial return. The reason must be recorded in the audit trail.

**Status:** PROVISIONAL — PENDING APPROVAL

### 4.3 Carrier damage (D10)

For confirmed carrier damage:
- **Full-sub-order impact:** When carrier damage materially compromises delivery of the order as a whole, refund the buyer's original delivery fee.
- **Limited-impact partial cases:** Refer to administrator review for delivery-fee exception decision.
- **Carrier recovery:** Pursue separately where possible. Carrier recovery is **not implemented** in P13 and must not be represented as implemented.

**Outstanding definition (OQ-11):** "Materially compromises delivery of the order as a whole" vs. "limited-impact partial cases" requires a materiality threshold to be defined by Finance + Operations.

**Status:** PROVISIONAL — PENDING APPROVAL

### 4.4 Conceptual separation of financial amounts

The following amounts are **distinct** and must not be conflated in calculations, UI, or audit trails:

| Amount | Source | Implemented |
|---|---|---|
| Refund for goods | `SUM(unit_price_minor × returned_qty)` + proportional VAT | Yes (P13) |
| Original delivery fee | `order_financial_breakdown.deliveryFeeMinor` + VAT | Yes (P13, full sub-order only) |
| Return-shipping cost | Carrier-charged cost for return logistics | **No** — deferred to P14+ |
| Commission reversal | Calculated per §3.2 | **Proposed** — responsibility-dependent |
| Settlement adjustment | Post-finalization financial correction | Yes (P13) |

---

## 5. Merchant Response and Administrator Escalation

### 5.1 Merchant timeout behavior (D03)

**Current implementation:** When `expires_at <= now()`, `ReturnExpirationWorker` transitions `REQUESTED → EXPIRED` (terminal state).

**Proposed change:** When `expires_at <= now()`, the worker transitions `REQUESTED → ESCALATED` (non-terminal). The request remains open. An administrator is notified via outbox event `return.escalated`. No automatic approval, rejection, or expiry occurs solely because of the timeout.

**FSM amendment required:**
```
Current:  REQUESTED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED']
Proposed: REQUESTED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'ESCALATED']
          ESCALATED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED']
```

**Status:** PROVISIONAL — PENDING APPROVAL

### 5.2 Administrator resolution SLA (D11)

**Provisional target:** 3 business days from escalation.

**Outstanding definitions (OQ-01, OQ-02):**
- Business day definition, business hours, time zone, weekends, public holidays.
- Authoritative event and timestamp that starts the SLA clock (proposed: escalation event timestamp).
- Overdue-escalation process (alerting, escalation-of-escalation).

**Status:** PROVISIONAL — PENDING APPROVAL

---

## 6. Settlement and Financial Integrity

### 6.1 Immutable financial snapshots

- `order_financial_breakdown` rows are **never mutated** after finalization.
- All post-finalization financial changes use auditable `refunds` and `settlement_records` (ADJUSTMENT type).
- VAT-exclusive calculations throughout.

### 6.2 Settlement recovery (D12)

- Post-finalization recovery uses manual Finance/administrator adjustments.
- No automated clawback.
- Settlement adjustments are append-only: new `settlement_records` rows with `status = 'ADJUSTMENT'` and negative `net_minor`.
- PENDING/CALCULATED settlements may be updated in place. PAID/DUE settlements require new ADJUSTMENT records.

**Status:** PROVISIONAL — PENDING APPROVAL

### 6.3 Voucher returns (D13)

- Every voucher-related return requires administrator review.
- Voucher refunds are not auto-issued on merchant inspection alone.

**Outstanding definition (OQ-08):** Permitted outcomes after review (cash, voucher, store credit, reject) and financial consequences.

**Status:** PROVISIONAL — PENDING APPROVAL

### 6.4 Financial integrity constraints

All implementations must preserve:
1. **Idempotent processing** — duplicate requests return existing records.
2. **Deterministic rounding** — `Math.round()` on integer minor units.
3. **Cumulative refund caps** — cumulative returned quantity ≤ ordered quantity; cumulative refund ≤ confirmed payment.
4. **Prevention of duplicate adjustments** — enforced by `FOR UPDATE` locking and idempotency keys.
5. **Tenant isolation** — `assertStoreInOrg()`, `assertStoreMember()`, `isTenantPrivileged()` checks on every operation.
6. **Authorization** — explicit authorization for every decision and financial action.
7. **Audit trail** — every transition emits outbox events atomically.

---

## 7. Deployment and Operations

### 7.1 Provisional deployment target (D14)

Limited single-process pilot only. Multi-instance production is **not authorized** until a durable or leader-coordinated scheduler is implemented, tested, and independently verified.

**Status:** PROVISIONAL — PENDING APPROVAL

### 7.2 Four operational controls (D15)

| # | Control | Description | Owner role |
|---|---|---|---|
| 1 | Alert on repeated worker polling errors | Page/notify when the worker logs consecutive poll failures. | Platform Ops / SRE |
| 2 | Monitor overdue merchant-response deadlines | Query/alert on `status = 'REQUESTED' AND expires_at < NOW() - interval '10 min'` to catch escalation lag. | Platform Ops / SRE |
| 3 | Designate exactly one worker-enabled API instance | Record which single API instance owns the worker. The worker registers on every replica (no enable/disable flag), so the pilot must run exactly one replica. | Platform Ops / SRE |
| 4 | Monitor worker startup and activity | Verify the `ReturnExpirationWorker` module-init log line on each boot and periodic activity. | Platform Ops / SRE |

**Status:** PROVISIONAL — PENDING APPROVAL

### 7.3 Multi-instance production blocking condition

P13 must not be released to multi-instance production until a supported durable scheduler or equivalent leader-coordinated worker has been **implemented, tested, and independently verified**. The current worker registers on every API replica with no enable/disable flag.

---

## 8. Decision Register Summary

| ID | Decision | Provisional position | Approver role | Status |
|---|---|---|---|---|
| D01 | Buyer return window | 14 days from delivery | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL |
| D02 | Merchant response SLA | 72 hours from request creation | Head of Merchant Partnerships | PROVISIONAL — PENDING APPROVAL |
| D03 | Merchant timeout behavior | Escalate to admin; no auto-approve/reject/expire | Head of Merchant Partnerships (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D04 | Commission — merchant-responsible | Reverse commission on net goods refunded | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D05 | Commission — buyer remorse | Retain commission | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D06 | Commission — platform-responsible | Reverse commission on net goods refunded | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D07 | Commission — carrier damage | Reverse commission on net goods refunded | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D08 | Delivery fee baseline | Full-sub-order return only | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D09 | Delivery fee exception | Admin-authorized for merchant/platform fault partials | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D10 | Delivery fee — carrier damage | Refund if material impact; partials to admin review | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D11 | Admin escalation SLA | 3 business days (calendar TBD) | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL |
| D12 | Settlement recovery | Manual Finance/admin adjustment; no auto clawback | Financial Controller | PROVISIONAL — PENDING APPROVAL |
| D13 | Voucher returns | Administrator review for every case | Finance Lead (co: Risk/Fraud) | PROVISIONAL — PENDING APPROVAL |
| D14 | Deployment target | Limited single-process pilot | CTO / Head of Engineering | PROVISIONAL — PENDING APPROVAL |
| D15 | Pilot operational controls | Four controls, one worker-enabled instance | CTO / Head of Engineering (co: SRE) | PROVISIONAL — PENDING APPROVAL |

**0 of 15 approved. Release is BLOCKED on business approvals.**

---

## 9. Attestation

- No repository files were edited, created, renamed, or deleted by this document.
- No source code, migrations, schemas, tests, or configuration were modified.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- This document corrects 6 contradictions identified in the conflict report.
- All provisional positions remain subject to formal business approval.
