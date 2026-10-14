# P13 — Commission Rounding Technical Decision

**Version:** 1.0
**Purpose:** Resolve mathematical ambiguity in R-01. Present worked examples, candidate algorithms, responsibility-category treatment, persistence/locking requirements, and test strategy. Record the exact Finance policy decisions and Engineering sign-off items required.
**Status:** PROVISIONAL — PENDING FINANCE APPROVAL. No algorithm approved. No implementation authorized.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Source-level evidence inspected:**
- `apps/api/src/modules/orders/order-pricing.ts` line 101: `commissionMinor = Math.round(netGoods × commissionRate)` — VAT-exclusive, per sub-order.
- `apps/api/src/modules/orders/orders.schema.ts` line 112: `commissionMinor` is `bigint` at order level (`order_financial_breakdown`).
- `apps/api/src/modules/returns/returns.service.ts` line 759: current settlement adjustments set `commissionMinor: 0`. No commission reversal logic exists.
- `apps/api/src/modules/returns/returns.service.ts` line 839: `getCumulativeReturnedQuantities(subOrderId)` tracks quantities per order item. No equivalent for commission reversals.
- `apps/api/src/modules/returns/returns.service.ts` line 560: `requestRefund` uses `FOR UPDATE` on payment record.
- `apps/api/src/modules/returns/returns.service.ts` line 664: inventory row `FOR UPDATE` lock.

**Companion documents:**
- `P13-POLICY-RECONCILIATION-v3.md`
- `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md`
- `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`
- `P13-PHASE-0-OPEN-DECISION-SHEETS.md`

---

## 1. Problem Statement

The v3 specification §3.2 defines the commission reversal formula:

```
commission_reversal = round(commission_total × (net_goods_returned / net_goods_total))
```

And also states:

> "Cumulative commission reversals across all partial returns for an order must never exceed commission_total."

These two constraints are **both correct individually** but are **not jointly satisfiable** with independent rounding per partial return. Independent rounding can produce a cumulative sum that exceeds `commission_total` (over-rounding) or fall short (under-rounding).

**This document does not approve any algorithm.** It presents the problem, worked examples, candidate solutions, and the exact Finance policy decisions and Engineering sign-off items required.

---

## 2. Worked Examples: Over-Rounding and Under-Rounding

### 2.1 Over-rounding example (independent rounding)

**Setup:**
- `commission_total` = 100 minor units
- 6 items at equal net value: `net_goods_total` = 600, each item = 100
- All returns are merchant-responsible (eligible for reversal)

**Independent rounding per return:**

| Return | Items returned | `net_goods_returned` | Raw formula | Rounded | Cumulative |
|---|---|---|---|---|---|
| 1 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | 17 |
| 2 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | 34 |
| 3 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | 51 |
| 4 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | 68 |
| 5 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | 85 |
| 6 | 1 item | 100 | 100 × 100/600 = 16.667 | 17 | **102** |

**Result:** Cumulative = 102 > 100. Over-reversal by 2 minor units.

### 2.2 Under-rounding example (independent rounding)

**Setup:**
- `commission_total` = 100 minor units
- 7 items at equal net value: `net_goods_total` = 700, each item = 100
- All returns are merchant-responsible (eligible for reversal)

**Independent rounding per return:**

| Return | Items returned | `net_goods_returned` | Raw formula | Rounded | Cumulative |
|---|---|---|---|---|---|
| 1 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 14 |
| 2 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 28 |
| 3 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 42 |
| 4 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 56 |
| 5 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 70 |
| 6 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | 84 |
| 7 | 1 item | 100 | 100 × 100/700 = 14.286 | 14 | **98** |

**Result:** Cumulative = 98 < 100. Under-reversal by 2 minor units. The buyer receives less commission refund than the original commission charged.

### 2.3 Mixed responsibility example

**Setup:**
- `commission_total` = 100 minor units
- 4 items: A (250), B (250), C (250), D (250). `net_goods_total` = 1000.
- Items A, B: merchant-responsible (eligible for reversal)
- Items C, D: buyer-remorse (NOT eligible for reversal)

**Eligible commission:** `100 × (500/1000) = 50`

**Independent rounding (only eligible returns):**

| Return | Items | `net_goods_returned` | Raw formula | Rounded |
|---|---|---|---|---|
| 1 | A (250) | 250 | 100 × 250/1000 = 25 | 25 |
| 2 | B (250) | 250 | 100 × 250/1000 = 25 | 25 |

**Cumulative:** 25 + 25 = 50. Correct.

**But if the formula uses `net_goods_total` (1000) instead of eligible net goods (500):**

| Return | Items | `net_goods_returned` | Raw formula | Rounded |
|---|---|---|---|---|
| 1 | A (250) | 250 | 100 × 250/1000 = 25 | 25 |
| 2 | B (250) | 250 | 100 × 250/1000 = 25 | 25 |

**Cumulative:** 50. Correct in this case, but the formula is ambiguous: does `net_goods_returned` include buyer-remorse items?

**Conclusion:** The formula must distinguish between eligible and ineligible returns. The cumulative target must be calculated from eligible net goods only.

---

## 3. Candidate Algorithm: Cumulative-Target Approach

### 3.1 Algorithm definition

**NOT APPROVED. Provisional candidate for Finance consideration.**

```
eligible_net_goods_returned = SUM(net goods returned for merchant/platform/carrier-responsible returns)
eligible_net_goods_total = SUM(net goods for items that are eligible for commission reversal)

cumulative_target = round(commission_total × (eligible_net_goods_returned / net_goods_total))
already_reversed = SUM(all prior commission reversals for this order)
current_reversal = cumulative_target - already_reversed

Enforce:
- current_reversal >= 0 (no negative reversal)
- current_reversal <= commission_total - already_reversed (no over-reversal)
- actual_reversal = max(0, min(current_reversal, commission_total - already_reversed))
```

### 3.2 Behavior across scenarios

**Scenario 1: Over-rounding example (6 items, commission = 100)**

| Return | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| 1 | 100 | round(100 × 100/600) = 17 | 0 | 17 |
| 2 | 200 | round(100 × 200/600) = 33 | 17 | 16 |
| 3 | 300 | round(100 × 300/600) = 50 | 33 | 17 |
| 4 | 400 | round(100 × 400/600) = 67 | 50 | 17 |
| 5 | 500 | round(100 × 500/600) = 83 | 67 | 16 |
| 6 | 600 | round(100 × 600/600) = 100 | 83 | **17** |

**Cumulative:** 17 + 16 + 17 + 17 + 16 + 17 = **100**. Exact.

**Comparison with independent rounding:** Independent = 102 (over by 2). Cumulative-target = 100 (exact).

**Scenario 2: Under-rounding example (7 items, commission = 100)**

| Return | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| 1 | 100 | round(100 × 100/700) = 14 | 0 | 14 |
| 2 | 200 | round(100 × 200/700) = 29 | 14 | 15 |
| 3 | 300 | round(100 × 300/700) = 43 | 29 | 14 |
| 4 | 400 | round(100 × 400/700) = 57 | 43 | 14 |
| 5 | 500 | round(100 × 500/700) = 71 | 57 | 14 |
| 6 | 600 | round(100 × 600/700) = 86 | 71 | 15 |
| 7 | 700 | round(100 × 700/700) = 100 | 86 | **14** |

**Cumulative:** 14 + 15 + 14 + 14 + 14 + 15 + 14 = **100**. Exact.

**Comparison with independent rounding:** Independent = 98 (under by 2). Cumulative-target = 100 (exact).

**Scenario 3: Mixed responsibility**

**Setup:** `commission_total` = 100, 4 items at 250 each. A, B merchant-responsible. C, D buyer-remorse.

| Return | Items | Responsibility | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|---|---|
| 1 | A (250) | Merchant | 250 | round(100 × 250/1000) = 25 | 0 | 25 |
| 2 | C (250) | Buyer remorse | 250 (unchanged) | round(100 × 250/1000) = 25 | 25 | **0** (no reversal) |
| 3 | B (250) | Merchant | 500 | round(100 × 500/1000) = 50 | 25 | 25 |
| 4 | D (250) | Buyer remorse | 500 (unchanged) | round(100 × 500/1000) = 50 | 50 | **0** (no reversal) |

**Cumulative:** 25 + 0 + 25 + 0 = **50**. Correct (only eligible items reversed).

**Scenario 4: Reclassification after contested period**

**Setup:** `commission_total` = 100, 2 items at 500 each. Return 1 item, initially contested, later reclassified to merchant-responsible.

| Event | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| Return 1 item (contested) | 0 (not yet eligible) | 0 | 0 | **0** (retain during contested) |
| Reclassify to merchant | 500 | round(100 × 500/1000) = 50 | 0 | **50** (single adjustment) |

**Cumulative:** 0 + 50 = **50**. Correct.

**Scenario 5: Concurrent refund requests**

**Setup:** Two simultaneous returns on the same order. `commission_total` = 100, `net_goods_total` = 1000. Return 1: 300. Return 2: 400.

**Serialized by `FOR UPDATE` lock:**

| Return | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| 1 (first to acquire lock) | 300 | round(100 × 300/1000) = 30 | 0 | 30 |
| 2 (waits for lock) | 300 + 400 = 700 | round(100 × 700/1000) = 70 | 30 | 40 |

**Cumulative:** 30 + 40 = **70**. Correct.

**Without lock (race condition):**

| Return | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| 1 (reads before 2 commits) | 300 | 30 | 0 | 30 |
| 2 (reads before 1 commits) | 400 | 40 | 0 | 40 |

**Cumulative:** 30 + 40 = **70**. Correct in this case, but if both returns were for 600:

| Return | `eligible_net_goods_returned` | Cumulative target | Already reversed | Current reversal |
|---|---|---|---|---|
| 1 | 600 | 60 | 0 | 60 |
| 2 | 600 | 60 | 0 | 60 |

**Cumulative:** 60 + 60 = **120 > 100**. Over-reversal. **Lock is required.**

### 3.3 Rounding residue handling

The cumulative-target approach concentrates all rounding residue in the **first** transaction, not the last.

**Example (6 items, commission = 100):**
- First return: reversal = 17 (includes +0.667 rounding)
- Last return: reversal = 17 (exact, no residue)

**Comparison with cap-at-remaining (Option A) — over-rounding case (6 items):**
- First return: reversal = 17 (includes +0.667 rounding)
- Last return: reversal = 15 (absorbs -2 rounding residue)
- Cumulative total: 100. Cap engages because each individual rounding (17) exceeds the exact share (16.667).

**IMPORTANT — Option A does NOT guarantee exact reconciliation in the under-rounding case (7 items):**
- Each return: reversal = 14 (each rounds down from 14.286)
- Cap never engages because 14 < remaining at every step
- Cumulative total: **98** (short by 2)
- Option A prevents over-reversal but does not correct under-rounding.

**Comparison with final-return catch-up (Option B):**
- First return: reversal = 17 (includes +0.667 rounding)
- Last return: reversal = 15 (catch-up to exactly 100)
- Cumulative total: 100 in both over-rounding and under-rounding cases.

**Summary of cumulative totals:**

| Algorithm | Over-rounding (6 items) | Under-rounding (7 items) |
|---|---|---|
| Independent rounding | 102 (over by 2) | 98 (under by 2) |
| Option A: Cap-at-remaining | 100 (exact) | **98 (short by 2)** |
| Option B: Final-return catch-up | 100 (exact) | 100 (exact) |
| Option C: Cumulative-target | 100 (exact) | 100 (exact) |

**Option A prevents over-reversal but does not guarantee full reversal when rounding leaves a shortfall.** Options B and C both guarantee exact reconciliation when all eligible items are fully returned.

---

## 4. Responsibility-Category Treatment

### 4.1 Eligible vs. ineligible returns

| Responsibility category | Commission treatment | Eligible for reversal? |
|---|---|---|
| Merchant-responsible (D04) | Reverse | **Yes** |
| Platform-responsible (D06) | Reverse | **Yes** |
| Carrier-damage (D07) | Reverse | **Yes** |
| Buyer-remorse (D05) | Retain | **No** |
| Contested/unresolved | Retain until classified | **No** (until reclassified) |

### 4.2 Cumulative target calculation

```
eligible_net_goods_returned = 
  SUM(net goods returned for merchant/platform/carrier-responsible returns)

eligible_net_goods_total = 
  SUM(net goods for items that are currently classified as eligible)

cumulative_target = round(commission_total × (eligible_net_goods_returned / net_goods_total))
```

**Key:** `net_goods_total` in the denominator is the **total order net goods**, not just eligible goods. The numerator is only eligible goods. This ensures the ratio reflects the proportion of the order that is eligible for reversal.

**Alternative interpretation:** If Finance determines that commission should be reversed only on the eligible portion of the order, the formula becomes:

```
cumulative_target = round(commission_total × (eligible_net_goods_returned / eligible_net_goods_total))
```

**This is a Finance decision.** The two interpretations produce different results when some items are buyer-remorse.

**Example:**
- `commission_total` = 100, 4 items at 250 each. `net_goods_total` = 1000.
- Items A, B: merchant-responsible (500 eligible). Items C, D: buyer-remorse (500 ineligible).

**Interpretation 1 (denominator = total order):**
- Return A (250): `round(100 × 250/1000) = 25`
- Return B (250): `round(100 × 500/1000) = 50`. Cumulative: 25 + 25 = 50.

**Interpretation 2 (denominator = eligible only):**
- Return A (250): `round(100 × 250/500) = 50`
- Return B (250): `round(100 × 500/500) = 100`. Cumulative: 50 + 50 = 100.

**Interpretation 1** reverses 50 (proportional to eligible portion of order).
**Interpretation 2** reverses 100 (full commission, even though only half the order is eligible).

**Finance must decide which interpretation is correct.**

---

## 5. Persistence, Locking, and Idempotency Requirements

### 5.1 Authoritative persisted amount

The cumulative commission reversal must be derived from a **persisted, auditable source**. Two options:

**Option 1 — Derive from `refunds` table:**
- Add `commission_reversal_minor` column to `refunds`.
- Cumulative = `SUM(refunds.commission_reversal_minor WHERE return_request_id IN (returns for this order))`.
- Requires `FOR UPDATE` lock on the payment record (or a dedicated lock) to serialize concurrent refund creation.

**Option 2 — New commission-reversal ledger table:**
- `commission_reversals (id, order_id, return_request_id, amount_minor, created_at)`.
- Cumulative = `SUM(amount_minor WHERE order_id = ?)`.
- Requires its own `FOR UPDATE` lock on a sentinel row per order.

**Recommendation (provisional, not approved):** Option 1 is simpler and avoids a new table. The `refunds` table already has `FOR UPDATE` serialization via P12 `requestRefund`. The `commission_reversal_minor` column is additive.

### 5.2 Transaction locking requirements

**Current implementation:**
- `requestRefund` acquires `FOR UPDATE` on the payment record (line 560).
- Lock is released when `requestRefund` returns.
- Settlement adjustment is created **after** `requestRefund` returns (line 746–764), **outside** the lock.

**Problem:** If commission reversal is calculated outside the `requestRefund` lock, concurrent transactions can read stale cumulative values.

**Required fix (provisional, not approved):**
- Extend the `FOR UPDATE` lock to cover the entire operation: refund creation + commission reversal calculation + settlement adjustment creation.
- Alternatively, use a dedicated `FOR UPDATE` lock on the `order_financial_breakdown` row or a `pg_advisory_xact_lock(order_id)`.

**Lock scope must include:**
1. Read cumulative commission already reversed (`SUM(refunds.commission_reversal_minor)`).
2. Calculate current reversal (cumulative-target formula).
3. Create refund record with `commission_reversal_minor`.
4. Create settlement adjustment (if applicable).
5. Commit transaction (releases lock).

### 5.3 Idempotency requirements

**Idempotency key:** The `refunds` table has an idempotency key (return_request_id + reason). Duplicate POST returns the existing record.

**Commission reversal idempotency:**
- If a refund request is replayed, the existing refund record is returned.
- The `commission_reversal_minor` on the existing record is returned as-is.
- No new commission reversal is calculated or created.

**Test requirement:** Duplicate POST → existing record returned. No double-reversal. Cumulative sum unchanged.

---

## 6. Comparison of Candidate Algorithms

| Algorithm | Cumulative total (over-rounding example) | Cumulative total (under-rounding example) | Rounding residue absorbed | Complexity |
|---|---|---|---|---|
| **Independent rounding** | 102 (over by 2) | 98 (under by 2) | Not handled | Low |
| **Option A: Cap-at-remaining** | 100 (exact) | **98 (short by 2)** | Last transaction (over-rounding only) | Low |
| **Option B: Final-return catch-up** | 100 (exact) | 100 (exact) | Last transaction | Medium (detect "last return") |
| **Option C: Cumulative-target** | 100 (exact) | 100 (exact) | First transaction | Medium (requires cumulative tracking) |

**Option A prevents over-reversal but does NOT guarantee full reversal in the under-rounding case.** When each individual rounding rounds down, the cap never engages and the cumulative total falls short by up to N-1 minor units (where N is the number of partial returns).

**Options B and C both guarantee exact reconciliation** when all eligible items are fully returned.

**Option A (cap-at-remaining):** Simplest. Tracks remaining commission and caps each reversal. Prevents over-reversal but may leave a permanent shortfall in under-rounding cases.
**Option B (final-return catch-up):** Requires detecting "this is the last return" at processing time. Only known after the fact. Guarantees exact total.
**Option C (cumulative-target):** Requires cumulative tracking (SUM of prior reversals). More complex but provides explicit audit trail of cumulative state. Guarantees exact total.

**Finance decision required:** Which algorithm to approve? Option A is simplest but does not guarantee exact reconciliation. Options B and C guarantee exact reconciliation but are more complex. The choice depends on whether Finance requires exact full reversal or accepts a potential shortfall of up to N-1 minor units.

---

## 7. Test Strategy

### 7.1 Unit tests

| Test | What it verifies |
|---|---|
| Formula correctness | Each responsibility category. Cumulative-target formula. Cap enforcement. |
| Over-rounding scenario | 6 items, commission = 100. Cumulative = 100 (not 102). |
| Under-rounding scenario | 7 items, commission = 100. Cumulative = 100 (not 98). |
| Mixed responsibility | Merchant + buyer-remorse. Only eligible items reversed. |
| Reclassification | Contested → merchant. Single adjustment. Cumulative correct. |

### 7.2 PostgreSQL integration tests

| Test | What it verifies |
|---|---|
| Commission reversal persisted | `refunds.commission_reversal_minor` correct. Settlement adjustment created. |
| Cumulative sum matches | `SUM(refunds.commission_reversal_minor)` = expected cumulative. |
| Mixed responsibility | Eligible vs. ineligible items. Cumulative target correct. |

### 7.3 Concurrency tests

| Test | What it verifies |
|---|---|
| 2+ simultaneous partial returns | `FOR UPDATE` serialization. Total reversal ≤ commission_total. |
| Race condition without lock | Demonstrate over-reversal without lock. Prove lock is required. |
| Lock scope | Lock covers refund creation + commission calculation + settlement adjustment. |

### 7.4 Idempotency tests

| Test | What it verifies |
|---|---|
| Duplicate refund POST | Existing record returned. No double-reversal. Cumulative unchanged. |
| Retry after failure | Idempotency key ensures same result. No duplicate records. |

### 7.5 Financial reconciliation tests

| Test | What it verifies |
|---|---|
| Sum of all reversals ≤ commission_total | For each order, cumulative reversal ≤ original commission. |
| Full return → total = commission_total | When all eligible items returned, cumulative = eligible commission (±1 rounding). |
| VAT-exclusive confirmed | Commission reversal never includes VAT or delivery fees. |
| Mixed responsibility | Only eligible items contribute to cumulative target. |

---

## 8. OQ-04 Decision Record — Finance Policy and Engineering Sign-off

**NOT APPROVED. All fields pending decision.**

| Field | Value |
|---|---|
| **Decision ID** | OQ-04 (Commission Allocation Method + Cumulative Rounding) |
| **Finance approver role** | Finance Lead / CFO |
| **Engineering sign-off role** | CTO / Head of Engineering |
| **Approver name** | [NOT PROVIDED] |
| **Approval date** | [NOT PROVIDED] |
| **Decision** | [PENDING] — APPROVED / REJECTED / APPROVED WITH CONDITIONS |

### 8.1 Finance policy decisions

The following require explicit Finance Lead / CFO approval.

**Q1: Which algorithm to approve?**
- [ ] Option A: Cap-at-remaining (simplest, prevents over-reversal but does NOT guarantee full reversal in under-rounding cases — may leave shortfall of up to N-1 minor units)
- [ ] Option B: Final-return catch-up (requires detecting "last return", guarantees exact total)
- [ ] Option C: Cumulative-target (requires cumulative tracking, guarantees exact total, residue absorbed in first transaction)
- [ ] Other: [specify]

**IMPORTANT for Finance awareness:** Option A is the simplest but has a known limitation: when each partial return's rounding rounds down (under-rounding), the cap never engages and the cumulative total may fall permanently short of the original commission. Options B and C guarantee exact reconciliation. Finance must decide whether a potential shortfall of up to N-1 minor units per order is acceptable.

**Q2: Mixed responsibility — which interpretation?**
- [ ] Interpretation 1: Denominator = total order net goods (reverses proportional to eligible portion)
- [ ] Interpretation 2: Denominator = eligible net goods only (reverses full commission on eligible items)
- [ ] Other: [specify]

---

### 8.2 Engineering sign-off (subject to Finance policy invariants)

The following are Engineering decisions. Finance may acknowledge the financial risks and constraints of Engineering's proposal, but the technical choice is Engineering's responsibility. Engineering must preserve the financial invariants Finance specifies above.

**E1: Which data source for cumulative tracking?**
- [ ] Option 1: `refunds.commission_reversal_minor` column (recommended)
- [ ] Option 2: New `commission_reversals` ledger table
- [ ] Other: [specify]

**E2: Locking strategy?**
- [ ] Extend `FOR UPDATE` on payment record to cover entire operation (recommended)
- [ ] Dedicated `FOR UPDATE` on `order_financial_breakdown` row
- [ ] `pg_advisory_xact_lock(order_id)`
- [ ] Other: [specify]

**Financial invariants Engineering must preserve (Finance to confirm):**
- Cumulative reversals ≤ `commission_total` (no over-reversal).
- [Finance to specify: must cumulative = eligible commission when all eligible items fully returned? If yes, algorithm must be Option B or C.]
- [Finance to specify: rounding tolerance — is ±1 minor unit acceptable?]

### 8.3 Rationale

[Finance to provide rationale for policy decisions. Engineering to provide rationale for sign-off decisions.]

### 8.4 Conditions

[Finance to provide conditions if APPROVED WITH CONDITIONS.]

### 8.5 Evidence

[Meeting minutes, email, signed document, or other evidence reference.]

### 8.6 Required tests acknowledged

[ ] Unit tests (formula, over/under-rounding, mixed responsibility, reclassification)
[ ] PostgreSQL integration tests (persistence, cumulative sum, mixed responsibility)
[ ] Concurrency tests (simultaneous returns, race condition, lock scope)
[ ] Idempotency tests (duplicate POST, retry after failure)
[ ] Financial reconciliation tests (cumulative ≤ commission_total, full return, VAT-exclusive)

---

## 9. Outstanding Accounting Questions

**Q1: Rounding residue tolerance.** Is ±1 minor unit acceptable? Or must the cumulative total be **exactly** equal to the eligible commission when all eligible items are returned?

**Q2: Negative reversal handling.** If `already_reversed > cumulative_target` (due to reclassification or correction), is a negative reversal (clawback) permitted? Or must it be handled via a separate adjustment?

**Q3: Historical refunds.** How should existing refunds (pre-P13) be handled? Should they be backfilled with `commission_reversal_minor`? Or should the cumulative tracking start from zero at P13 go-live?

**Q4: Contested reclassification timing.** If a return is reclassified after 30 days, should the commission reversal be calculated based on the return creation date or the reclassification date? (Affects which exchange rate or commission rate applies, if rates change over time.)

**These questions require Finance input. Not resolved in this document.**

---

## 10. Attestation

- No repository files, code, migrations, tests, or configuration were modified.
- No algorithm was approved. All options are provisional candidates for Finance decision.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- No approver identities, dates, or evidence were invented.
- Baseline preserved: branch `develop`, HEAD `8d60e36`.
