# P13 — Phase 0 Blocker Reconciliation

**Version:** 1.0
**Purpose:** Resolve residual issues R-01 (cumulative commission rounding) and R-02 (Phase 0 exit criteria scope). Validate decision and question registers. Produce a consistent approval package.
**Status:** PROVISIONAL — PENDING BUSINESS APPROVAL. No decisions approved. No implementation authorized.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Source-level evidence inspected:**
- `apps/api/src/modules/orders/order-pricing.ts` — commission calculation: `commissionMinor = Math.round(netGoods × commissionRate)` (line 101). VAT-exclusive.
- `apps/api/src/modules/orders/orders.schema.ts` — `commissionMinor` is `bigint` at order level (line 112).
- `apps/api/src/modules/returns/returns.service.ts` — current settlement adjustments set `commissionMinor: 0` (line 759). No commission reversal logic exists. `getCumulativeReturnedQuantities` tracks quantities (line 839) but no equivalent exists for commission reversals.
- `apps/api/src/modules/returns/returns.service.ts` — P12 `FOR UPDATE` locking on payment records (line 560) and inventory rows (line 664).

---

## Part 1 — R-01: Cumulative Commission Rounding

### 1.1 Problem statement

The v3 specification (§3.2) defines the commission reversal formula:

```
commission_reversal = round(commission_total × (net_goods_returned / net_goods_total))
```

And also states:

> "Cumulative commission reversals across all partial returns for an order must never exceed commission_total."

These two constraints are **both correct individually** but are **not jointly satisfiable** with independent rounding per partial return. Independent rounding can produce a cumulative sum that exceeds `commission_total`.

**Numerical example:**
- `commission_total` = 100 (minor units)
- 6 items at equal net value: `net_goods_total` = 600, each item = 100
- Return 1 item: `round(100 × 100/600) = round(16.667) = 17`
- Return another item: `round(100 × 100/600) = 17`
- Repeat 6 times: `17 × 6 = 102 > 100` ← **over-reversal by 2**

### 1.2 Authoritative data sources (confirmed from source)

| Data | Source | Characteristics |
|---|---|---|
| `commission_total` | `order_financial_breakdown.commissionMinor` | Order-level bigint. Immutable after finalization. VAT-exclusive. |
| `net_goods_total` | `SUM(order_items.unit_price_minor × ordered_qty)` | Per-item, immutable after checkout. VAT-exclusive. |
| `net_goods_returned` | `SUM(order_items.unit_price_minor × returned_qty)` | Per return, computed at refund time. |
| Cumulative returned quantities | `getCumulativeReturnedQuantities(subOrderId)` | Existing method (line 839). Returns `Map<orderItemId, number>`. Uses `FOR UPDATE` locking. |
| Cumulative commission reversals | **NOT YET IMPLEMENTED** | Must be derived from `refunds` table or a new ledger. |

### 1.3 Proposed cap-at-remaining approach (PROVISIONAL — NOT APPROVED)

**Option A — Cap at remaining (recommended provisional default):**

```
raw_reversal = round(commission_total × (net_goods_returned / net_goods_total))
cumulative_so_far = SUM(all prior commission reversals for this order)
remaining = commission_total - cumulative_so_far
actual_reversal = min(raw_reversal, remaining)
```

**Behavior across scenarios:**

| Scenario | Behavior |
|---|---|
| Single partial return | `raw_reversal` computed normally. `cumulative_so_far = 0`. `actual_reversal = raw_reversal`. |
| Repeated partial returns | Each return computes `raw_reversal` independently. The cap ensures `cumulative_so_far + actual_reversal ≤ commission_total`. The last return may receive a smaller reversal to absorb rounding residue. |
| Full return (all items, full qty) | `net_goods_returned = net_goods_total`. `raw_reversal = commission_total`. Cap not needed (exact match). |
| Concurrent refund requests | `FOR UPDATE` locking on the order financial record (or a new commission-reversal ledger row) serializes concurrent requests. Second request sees updated `cumulative_so_far` and computes correct `remaining`. |
| Idempotent retry | Idempotency key on `refunds` table ensures duplicate POST returns existing record. No double-reversal. |
| Contested responsibility reclassification | If commission was retained during contested period and later reclassified to merchant-responsible, a single settlement adjustment reverses the full amount. Cap applies: `actual_reversal = min(full_amount, remaining)`. |

**Advantages:** Simple, deterministic, prevents over-reversal, handles all scenarios.
**Disadvantage:** The last partial return in a sequence may receive a slightly different amount than the formula suggests (rounding residue absorbed). This is financially correct (never over-reverse) but must be documented.

### 1.4 Alternative option (for Finance consideration)

**Option B — Proportional allocation with final-return catch-up:**

Same as Option A for all returns except the last one. When `cumulative_returned_qty = total_ordered_qty` (full return), compute `actual_reversal = commission_total - cumulative_so_far` (catch-up). This ensures the total always equals `commission_total` exactly when all items are eventually returned.

**Advantage:** Exact total when fully returned.
**Disadvantage:** Requires detecting "this is the last return" at processing time, which is only known after the fact.

### 1.5 Authoritative persisted amount for cumulative tracking

The cumulative commission reversal must be derived from a **persisted, auditable source**. Two options:

**Option 1 — Derive from `refunds` table:**
- Add a `commission_reversal_minor` column to `refunds`.
- Cumulative = `SUM(refunds.commission_reversal_minor WHERE return_request_id IN (returns for this order))`.
- Requires `FOR UPDATE` lock on the parent `payment_records` row (already done by P12 `requestRefund`) to serialize concurrent refund creation.

**Option 2 — New commission-reversal ledger table:**
- `commission_reversals (id, order_id, return_request_id, amount_minor, created_at)`.
- Cumulative = `SUM(amount_minor WHERE order_id = ?)`.
- Requires its own `FOR UPDATE` lock on a sentinel row per order.

**Recommendation:** Option 1 (derive from `refunds` table) is simpler and avoids a new table. The `refunds` table already has `FOR UPDATE` serialization via P12 `requestRefund`. The `commission_reversal_minor` column is additive.

### 1.6 Required tests before accepting implementation

| Test type | What it verifies |
|---|---|
| **Unit tests** | Formula correctness for each responsibility category. Cap-at-remaining logic. Rounding behavior. |
| **PostgreSQL integration tests** | Commission reversal persisted correctly. Cumulative sum matches. Settlement adjustment created. |
| **Concurrency tests** | 2+ simultaneous partial returns on same order → total reversal ≤ commission_total. `FOR UPDATE` serialization prevents race. |
| **Idempotency tests** | Duplicate refund POST → existing record returned. No double-reversal. |
| **Financial reconciliation tests** | Sum of all commission reversals for an order ≤ commission_total. Full return → total = commission_total (±1 rounding). VAT-exclusive confirmed. |
| **Cumulative cap tests** | 6+ partial returns on same order → total never exceeds commission_total. Last return absorbs rounding residue. |

### 1.7 Finance decision required

Finance Lead / CFO must explicitly approve:
1. The allocation method (proportional by net goods value ratio).
2. The cumulative rounding enforcement mechanism (Option A: cap-at-remaining, or Option B: final-return catch-up).
3. The authoritative data source (Option 1: `refunds.commission_reversal_minor`, or Option 2: new ledger table).

**This is OQ-04. It is a CRITICAL blocker for D04, D06, D07 implementation.**

---

## Part 2 — R-02: Phase 0 Exit Criteria Reconciliation

### 2.1 Problem statement

The Phase 0 exit criteria in `P13-IMPLEMENTATION-READINESS-AND-PHASE-PLAN.md` §0.3 contain an apparent contradiction:

> "All 15 decisions have documented approval or rejection with attributable evidence."

And also:

> "D12, D13 may be approved in parallel with early implementation if they do not block Phase 1 design."

### 2.2 Reconciliation

The two statements are **not contradictory** when the phase boundaries are precisely defined. The confusion arises from using "Phase 0 exit" to mean both "Phase 1 entry" and "full approval completion." These are different gates.

### 2.3 Definitive phase-entry criteria

#### Phase 1 entry (technical design may begin)

**Mandatory approvals (13 of 15):**

| Decision | Reason |
|---|---|
| D01 | Foundational — defines return eligibility window |
| D02 | Defines merchant response clock |
| D03 | FSM change — critical path for design |
| D04 | Commission reversal — requires OQ-04 |
| D05 | Commission retention — consistency with D04 |
| D06 | Commission reversal — consistency with D04 |
| D07 | Commission reversal — consistency with D04 |
| D08 | Delivery-fee baseline |
| D09 | Delivery-fee exception |
| D10 | Carrier-damage delivery fee |
| D11 | Admin escalation SLA — requires OQ-01, OQ-02 |
| D14 | Deployment target |
| D15 | Pilot operational controls |

**Mandatory open question resolutions:**

| Question | Reason |
|---|---|
| OQ-04 | CRITICAL — commission allocation method + rounding |
| OQ-01 | Business calendar for admin SLA |
| OQ-02 | SLA trigger timestamps |

**Not required for Phase 1 entry:**

| Decision | Reason it can be deferred |
|---|---|
| D12 | Settlement recovery — already implemented. Approval governs operational process, not code design. |
| D13 | Voucher review — does not block any Phase 1 work package design. |

**Phase 1 entry gate:** 13 of 15 decisions approved (D01–D11, D14, D15) + OQ-01, OQ-02, OQ-04 resolved.

#### Phase 2 entry (implementation may begin)

**Mandatory approvals (all 15):**

All D01–D15 must be approved before any Phase 2 implementation begins. This includes D12 and D13.

**Rationale:** Implementation writes code that encodes business policy. D12 governs settlement recovery behavior that the code must implement correctly. D13 governs voucher review workflow that WP-2G implements. Neither can be implemented without an approved policy.

**Mandatory open question resolutions:**

All in-scope questions (OQ-01 through OQ-11) must be resolved before their dependent work packages begin. They do not all need to be resolved before Phase 2 starts — only before their specific work packages:

| Question | Must resolve before |
|---|---|
| OQ-04 | WP-2D (commission implementation) |
| OQ-01 | WP-2F (admin SLA UI) |
| OQ-02 | WP-2C (worker), WP-2F |
| OQ-03 | WP-2B (FSM eligibility edge cases) |
| OQ-05 | WP-2E (delivery-fee exception) |
| OQ-06 | WP-2E (audit trail) |
| OQ-07 | Operational process (not a code WP) |
| OQ-08 | WP-2G (voucher workflow) |
| OQ-09 | WP-3G (pilot readiness) |
| OQ-10 | WP-3G (pilot scope) |
| OQ-11 | WP-2E (carrier damage materiality) |

**Phase 2 entry gate:** All 15 decisions approved. OQ-04 resolved before WP-2D. Other OQs resolved before their dependent WPs.

#### Pilot deployment and release authorization

**Mandatory:**

- All Phase 2 work packages complete and verified.
- All Phase 3 verification work packages complete with evidence.
- All 15 decisions approved.
- All in-scope open questions resolved.
- Pilot operational controls (D15) assigned and active.
- Independent verification report authored.
- Explicit release authorization from authorized person.

**Release gate:** All gates G-01 through G-08 PASS.

### 2.4 D12 and D13 — exact restrictions

| Decision | Can Phase 1 design begin without approval? | Can Phase 2 implementation begin without approval? | Restriction |
|---|---|---|---|
| D12 (Settlement recovery) | Yes — settlement recovery is already implemented. Design work does not change it. | **No** — implementation must encode the approved settlement recovery process. | D12 must be approved before WP-2D (settlement adjustment path) is implemented. |
| D13 (Voucher returns) | Yes — voucher review workflow design (WP-1G) can use provisional default. | **No** — WP-2G implements the voucher review workflow. | D13 must be approved before WP-2G (voucher workflow implementation) begins. |

### 2.5 Corrected Phase 0 exit criteria

**Phase 0 is closed when ALL of the following are true:**

1. D01–D11, D14, D15 approved (13 of 15) with attributable evidence.
2. OQ-01, OQ-02, OQ-04 resolved with written approval.
3. R-01 (cumulative rounding) resolved as part of OQ-04.
4. R-02 (exit criteria scope) resolved — this document serves as the resolution.
5. D12, D13 approval in progress — scheduled for approval before Phase 2 entry.

**Phase 1 may begin when Phase 0 is closed.**

**Phase 2 may begin when additionally:**
6. D12, D13 approved (all 15 of 15).
7. All remaining in-scope OQs resolved before their dependent WPs.

---

## Part 3 — Decision and Question Register Validation

### 3.1 Decision register validation (D01–D15)

| Check | Result |
|---|---|
| Missing accountable roles | **None found.** All 15 decisions have documented approver roles. |
| Contradictory statuses | **None found.** All 15 consistently `PROVISIONAL — PENDING APPROVAL`. |
| Missing evidence requirements | **None found.** All 15 have `UNKNOWN` / `NOT PROVIDED` for approver name, date, evidence. |
| Unclear dependencies | **None found.** Dependencies documented in workbook v2 and conflict report. |
| Proposed defaults incorrectly presented as approved | **None found.** All clearly marked `PROVISIONAL — PENDING APPROVAL`. |
| Questions that must be resolved before design vs. implementation | **Documented in §2.3 above.** OQ-04/OQ-01/OQ-02 before design. Others before their dependent implementation WPs. |

### 3.2 Open question register validation (OQ-01–OQ-12)

| Check | Result |
|---|---|
| Missing accountable roles | **None found.** All 12 have documented accountable roles. |
| OQ-12 correctly identified as out of scope | **Confirmed.** OQ-12 (carrier recovery) marked `OPEN — NOT IN P13`. |
| Priority assignments consistent | **Confirmed.** OQ-04 CRITICAL, OQ-01/02/09/10 HIGH, OQ-03/05/07/11 MEDIUM, OQ-06/08/12 LOW. |
| Dependencies documented | **Confirmed.** Each OQ lists dependent decisions and blocked work packages. |
| Proposed defaults clearly provisional | **Confirmed.** All marked `PROVISIONAL — NOT APPROVED`. |

### 3.3 Validation conclusion

**No defects found in the decision or question registers.** All roles present, all statuses consistent, all dependencies documented, all proposed defaults clearly marked provisional.

---

## Part 4 — Remaining Blockers Summary

| Blocker | Type | Priority | Blocks |
|---|---|---|---|
| 0/15 formal approvals | Business | CRITICAL | All implementation |
| OQ-04 (commission allocation + rounding) | Business + Technical | CRITICAL | D04/D06/D07 implementation |
| OQ-01 (business calendar) | Business | HIGH | D11 implementation |
| OQ-02 (SLA triggers) | Business | HIGH | D02/D11 implementation |
| OQ-09 (pilot owners) | Business | HIGH | D15 operational readiness |
| OQ-10 (pilot scope) | Business | HIGH | D14 pilot scope |
| OQ-03 (eligibility edge cases) | Business | MEDIUM | D01 edge cases |
| OQ-05 (delivery-fee allocation) | Business | MEDIUM | D09/D10 implementation |
| OQ-07 (settlement authorization) | Business | MEDIUM | D12 governance |
| OQ-11 (carrier materiality) | Business | MEDIUM | D10 implementation |
| OQ-06 (delivery-fee audit) | Business | LOW | D09 audit trail |
| OQ-08 (voucher outcomes) | Business | LOW | D13 workflow |
| OQ-12 (carrier recovery) | Business | LOW | None in P13 (P14+) |

---

## Attestation

- No repository files, code, migrations, tests, or configuration were modified.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- No approver identities, dates, or evidence were invented.
- R-01 resolved: cumulative rounding problem documented, two options presented, Finance decision required.
- R-02 resolved: phase-entry criteria clarified. 13 of 15 for Phase 1 entry, all 15 for Phase 2 entry.
- Baseline preserved: branch `develop`, HEAD `8d60e36`.
