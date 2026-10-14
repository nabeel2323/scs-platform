# P13 — Policy Conflict and Dependency Report

**Version:** 1.0
**Baseline:** branch `develop`, HEAD `8d60e36`, clean working tree (read-only inspection).
**Status:** PROVISIONAL — PENDING BUSINESS APPROVAL. No decisions approved. No implementation authorized.
**Input documents audited:**
- `P13-PROVISIONAL-POLICY-RECONCILIATION.md` (469 lines)
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER.xlsx` (4 sheets, 15 decisions, 12 questions, 10 gates)
- `P13-BUSINESS-SIGNOFF-REGISTER.md` (114 lines)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-SIGNOFF-AND-RELEASE-AUTHORIZATION-REPORT.md` (167 lines)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-RULES-ARCHITECTURE-LOCK.md` (927 lines)
- Source: `apps/api/src/modules/returns/returns.service.ts`, `return-expiration.worker.ts`, `returns.schema.ts`

---

## 1. Contradictions Found and Corrected

### C-01 — Commission formula uses refund amount that may include VAT and delivery fees

**Location:** `P13-PROVISIONAL-POLICY-RECONCILIATION.md` §5.1 line 253.

**Original text:**
> "Partial returns reverse a proportional share: `commission_reversal = total_commission × (refund_amount / confirmed_payment_amount)`."

**Problem:** The formula uses `refund_amount` which is ambiguous — it could include VAT on goods, delivery fees, or VAT on delivery fees. The `confirmed_payment_amount` includes the full payment (goods + VAT + delivery + VAT on delivery). Using these values directly would calculate an incorrect commission ratio that conflates goods value with tax and delivery components.

**Correction:** Commission reversal must be calculated from the **net goods value** of returned items only, using immutable checkout-time snapshots. The correct formula is:

```
net_goods_returned = SUM(unit_price_minor × returned_qty)  [from order_items, checkout-time snapshot]
net_goods_total    = SUM(unit_price_minor × ordered_qty)   [from order_items, checkout-time snapshot]
commission_total   = order_financial_breakdown.commissionMinor  [checkout-time snapshot]

commission_reversal = round(commission_total × (net_goods_returned / net_goods_total))
```

This is a **VAT-exclusive, delivery-fee-exclusive** calculation. The ratio is computed from net goods values only. VAT and delivery fees are never part of the commission reversal ratio.

**Impact:** Without this correction, implementation would calculate incorrect commission reversals for any return involving delivery fees or VAT, potentially exceeding the commission attributable to the returned goods.

**Status:** CORRECTED in v3 specification. Blocked on Finance approval of the allocation method.

---

### C-02 — Stale "[UNRESOLVED]" labels for platform-responsibility and carrier-damage commission

**Location:** `P13-PROVISIONAL-POLICY-RECONCILIATION.md` §5.1 line 255.

**Original text:**
> "Platform-responsibility and carrier-damage commission treatment is [UNRESOLVED]."

**Problem:** This contradicts §3B of the same document, which explicitly states that platform-responsibility commission and carrier-damage commission are both **RESOLVED** — reverse commission (same as merchant-responsible). The §5.1 statement is stale from the pre-resolution draft.

**Correction:** Remove the "[UNRESOLVED]" label. Replace with: "Platform-responsibility and carrier-damage commission reversal follow the same treatment as merchant-responsible returns under the provisional policy (pending formal business approval)."

**Status:** CORRECTED in v3 specification.

---

### C-03 — Stale "[UNRESOLVED]" label for carrier-damage delivery fee

**Location:** `P13-PROVISIONAL-POLICY-RECONCILIATION.md` §6.2 line 319.

**Original text:**
> "Carrier damage: [UNRESOLVED] — requires explicit policy decision on who bears the delivery cost."

**Problem:** This contradicts the resolved provisional policy which states: refund the buyer's original delivery fee; pursue carrier recovery separately where possible. The §6.2 statement is stale.

**Correction:** Replace with the resolved provisional position, clearly marked as PROVISIONAL — PENDING APPROVAL.

**Status:** CORRECTED in v3 specification.

---

### C-04 — Inconsistent status terminology

**Location:** Multiple documents.

**Problem:** The original sign-off register uses `PENDING` while the reconciliation uses `PENDING — NOT APPROVED`. Some sections use `RESOLVED` without clarifying that this means "resolved in the provisional proposal, pending formal approval." The workbook uses `BLOCKED` for gates but `PENDING` for decisions without a consistent mapping.

**Correction:** Standardize on three statuses:
- `PROVISIONAL — PENDING APPROVAL` — a provisional position exists but formal approval is required.
- `PENDING — NOT APPROVED` — no provisional position or the position is still under discussion.
- `APPROVED` — formal, attributable approval evidence exists (none currently).
- `REJECTED` — formal, attributable rejection evidence exists (none currently).

All 15 decisions use `PROVISIONAL — PENDING APPROVAL` where a provisional position exists, or `PENDING — NOT APPROVED` where it does not.

**Status:** CORRECTED in v3 specification and v2 workbook.

---

### C-05 — Commission allocation method not defined for order-level snapshots

**Location:** Not explicitly addressed in any existing document.

**Problem:** The provisional policy says to use "authoritative checkout-time commission snapshots" but `order_financial_breakdown.commissionMinor` is stored at the **order level**, not per-item. When a partial return involves some items from a multi-item order, the allocation of total commission to the returned items requires a deterministic method. No document defines this method.

**Correction:** Record as an outstanding Finance decision (OQ-04 in the tracking register). The implementation is blocked until Finance approves a deterministic allocation method. Proposed default: proportional allocation by net goods value ratio (`net_goods_returned / net_goods_total`), but this requires explicit approval.

**Status:** RECORDED as outstanding question. Implementation BLOCKED until resolved.

---

### C-06 — `expires_at` semantics not consistently documented across documents

**Location:** Architecture lock §12.2, reconciliation §1.3, sign-off register Decision 4.

**Problem:** The architecture lock documents `expires_at` as "SLA expiry." The reconciliation proposes renaming its meaning to "merchant response deadline" without changing the column. The sign-off register Decision 4 describes it as "72 hours before automatic expiry." Under the proposed escalation policy, `expires_at` would no longer trigger automatic expiry — it would trigger escalation.

**Correction:** Document clearly:
- **Current implementation:** `expires_at = createdAt + 72h`. When `expires_at <= now()`, worker transitions `REQUESTED → EXPIRED`.
- **Proposed change:** `expires_at` retains its name and calculation. When `expires_at <= now()`, worker transitions `REQUESTED → ESCALATED` (not EXPIRED). The column's semantic meaning changes from "auto-expiry deadline" to "merchant response deadline."
- **Migration implication:** No schema change to the column itself. The CHECK constraint on `return_requests.status` must add `'ESCALATED'`. The worker SQL query changes from transitioning to EXPIRED to transitioning to ESCALATED.

**Status:** DOCUMENTED in v3 specification.

---

## 2. Dependency Graph

### 2.1 Decision dependencies

```
D01 (return window)
  └── (no dependencies — foundational)

D02 (merchant response SLA: 72h)
  └── depends on D01 (eligibility window defines outer boundary)

D03 (merchant timeout → escalate)
  └── depends on D02 (defines what happens when the 72h clock expires)

D04 (commission reversal — merchant-responsible)
  └── depends on D03 (responsibility classification requires escalation path)

D05 (commission retained — buyer remorse)
  └── depends on D04 (consistent treatment across categories)

D06 (commission reversal — platform-responsible)
  └── depends on D04 (same treatment as merchant)

D07 (commission reversal — carrier damage)
  └── depends on D04 (same treatment as merchant)

D08 (delivery fee baseline — full sub-order only)
  └── (no dependencies — standalone baseline)

D09 (delivery fee exception — admin-authorized partial)
  └── depends on D08 (exception references the baseline)

D10 (delivery fee — carrier damage)
  └── depends on D08 (baseline), D09 (exception path)

D11 (admin escalation SLA: 3 business days)
  └── depends on D02, D03 (escalation must exist before admin SLA applies)

D12 (settlement recovery — manual)
  └── (no dependencies — standalone financial process)

D13 (voucher returns — admin review)
  └── (no dependencies — standalone fraud control)

D14 (deployment target — pilot)
  └── depends on D01–D13 (pilot scope requires approved policies)

D15 (pilot operational controls)
  └── depends on D14 (controls apply to the selected target)
```

### 2.2 Open question dependencies

| Question | Blocks | Required Before |
|---|---|---|
| OQ-01 (business calendar definition) | D11 implementation | Admin SLA tracking cannot be implemented |
| OQ-02 (SLA trigger timestamps) | D02, D11 implementation | Clock start must be defined |
| OQ-03 (eligibility edge cases) | D01 implementation | Cancellation/partial-delivery interactions |
| OQ-04 (commission allocation method) | D04, D06, D07 implementation | **CRITICAL BLOCKER** — no deterministic commission reversal without this |
| OQ-05 (delivery-fee allocation for exceptions) | D09, D10 implementation | Partial-return delivery-fee calculation |
| OQ-06 (delivery-fee exception audit requirements) | D09 implementation | Audit trail design |
| OQ-07 (settlement adjustment authorization) | D12 operational process | Finance governance |
| OQ-08 (voucher permitted outcomes) | D13 implementation | Admin review workflow |
| OQ-09 (pilot operational owners) | D15 operational readiness | Control assignment |
| OQ-10 (pilot scope and criteria) | D14 operational readiness | Pilot start/exit criteria |
| OQ-11 (carrier damage materiality) | D10 implementation | Materiality threshold |
| OQ-12 (carrier recovery process) | Not in P13 scope | Separate workflow |

### 2.3 Implementation dependency chain

```
Business approvals (D01–D15)
  → Open question resolution (OQ-01–OQ-12, where applicable)
    → Technical design (Phase 1)
      → Migration planning
        → Implementation (Phase 2)
          → Verification (Phase 3)
            → Release authorization
```

---

## 3. Technical Dependencies and Risk Classification

### 3.1 Critical blockers (implementation cannot proceed without resolution)

| ID | Blocker | Affected decisions | Risk if unresolved |
|---|---|---|---|
| B-01 | Commission allocation method (OQ-04) | D04, D06, D07 | Commission reversals calculated incorrectly; financial misstatement |
| B-02 | Business calendar definition (OQ-01) | D11 | Admin SLA tracking cannot be implemented |
| B-03 | All 15 formal business approvals | All | No implementation authorized without approval |

### 3.2 High-impact dependencies (design cannot be finalized without resolution)

| ID | Dependency | Affected decisions | Impact |
|---|---|---|---|
| H-01 | SLA trigger timestamps (OQ-02) | D02, D11 | Clock start ambiguity affects all SLA calculations |
| H-02 | Eligibility edge cases (OQ-03) | D01 | Cancellation/partial-delivery interactions affect return eligibility |
| H-03 | Delivery-fee allocation for exceptions (OQ-05) | D09, D10 | Partial-return delivery-fee calculation ambiguous |
| H-04 | Carrier damage materiality (OQ-11) | D10 | Materiality threshold undefined |

### 3.3 Operational dependencies (pilot cannot launch without resolution)

| ID | Dependency | Affected decisions | Impact |
|---|---|---|---|
| O-01 | Pilot operational owners (OQ-09) | D15 | Controls unowned |
| O-02 | Pilot scope and criteria (OQ-10) | D14 | No start/exit criteria |
| O-03 | Settlement adjustment authorization (OQ-07) | D12 | Finance governance gap |
| O-04 | Voucher permitted outcomes (OQ-08) | D13 | Admin workflow undefined |

---

## 4. Work Package Dependencies

### 4.1 Phase 1 — Technical design (all blocked on business approval)

| WP | Work package | Depends on | Blocks |
|---|---|---|---|
| WP-1A | FSM ESCALATED state design | D03 approval | WP-2A, WP-2B |
| WP-1B | Migration 0059 amendment planning | D03 approval | WP-2A |
| WP-1C | Idempotent escalation worker design | D02, D03 approval | WP-2C |
| WP-1D | Responsibility-dependent commission design | D04–D07 approval, OQ-04 resolution | WP-2D |
| WP-1E | Delivery-fee exception design | D08–D10 approval, OQ-05 resolution | WP-2E |
| WP-1F | Admin escalation UI design | D03, D11 approval, OQ-01 resolution | WP-2F |
| WP-1G | Voucher review workflow design | D13 approval, OQ-08 resolution | WP-2G |

### 4.2 Phase 2 — Implementation (all blocked on Phase 1 design completion)

| WP | Work package | Depends on | Blocks |
|---|---|---|---|
| WP-2A | Migration: add ESCALATED to CHECK constraint | WP-1B | WP-2C, WP-3A |
| WP-2B | FSM: add ESCALATED transition to returns.service.ts | WP-1A | WP-2C |
| WP-2C | Worker: redesign expiration→escalation | WP-1C, WP-2A, WP-2B | WP-3A |
| WP-2D | Commission: responsibility-dependent reversal | WP-1D | WP-3B |
| WP-2E | Delivery fee: exception path | WP-1E | WP-3C |
| WP-2F | Admin UI: escalated queue + SLA tracking | WP-1F | WP-3D |
| WP-2G | Admin UI: voucher review workflow | WP-1G | WP-3E |

### 4.3 Phase 3 — Verification (all blocked on Phase 2 implementation)

| WP | Work package | Depends on |
|---|---|---|
| WP-3A | FSM + escalation idempotency verification | WP-2A, WP-2B, WP-2C |
| WP-3B | Commission correctness verification | WP-2D |
| WP-3C | Delivery-fee exception verification | WP-2E |
| WP-3D | Admin SLA tracking verification | WP-2F |
| WP-3E | Voucher review verification | WP-2G |
| WP-3F | P12 regression preservation | All WP-2* complete |
| WP-3G | Pilot topology and operational controls | D14, D15 approval |
| WP-3H | Independent verification and release closure | All WP-3* complete |

---

## 5. Release-Gate Dependencies

| Gate | Blocked on | Cannot pass until |
|---|---|---|
| G-01 Business Approval | All 15 decisions | Explicit attributable approval from designated approvers |
| G-02 Policy Ambiguity | 12 open questions (8 in-scope, 4 out-of-scope) | Responsible roles provide definitive answers |
| G-03 Technical Implementation | G-01 + design completion | Phase 2 work packages complete |
| G-04 Commission Correctness | G-01 + OQ-04 + WP-2D | Commission tests pass for all responsibility categories |
| G-05 Worker Scheduling | G-01 + D14/D15 approval | Pilot topology verified |
| G-06 Pilot Readiness | G-05 + OQ-09 + OQ-10 | Controls assigned, dashboards active |
| G-07 Deployment Sign-Off | G-01 + D14 approval | CTO confirms target |
| G-08 Release Authorization | G-01 through G-07 | Authorized person grants explicit release |
| G-09 Regression Baseline | Pre-implementation evidence | Re-verify after implementation |
| G-10 P12 Preservation | Pre-implementation evidence | Re-verify after implementation |

---

## 6. Summary

**Contradictions found:** 6 (C-01 through C-06).
**All corrected in:** v3 specification and v2 workbook.

**Critical blockers:** 3 (B-01 commission allocation, B-02 business calendar, B-03 all approvals).
**High-impact dependencies:** 4 (H-01 through H-04).
**Operational dependencies:** 4 (O-01 through O-04).

**Work packages:** 7 design (Phase 1) + 7 implementation (Phase 2) + 8 verification (Phase 3) = 22 total.

**Release gates:** 8 BLOCKED, 2 PASS (pre-implementation baseline).

**Attestation:** No repository files, code, migrations, tests, configuration, or workflows were modified. This is a read-only audit document.
