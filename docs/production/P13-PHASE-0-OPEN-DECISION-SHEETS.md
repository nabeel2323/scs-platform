# P13 — Phase 0 Open Decision Sheets (OQ-01 through OQ-12)

**Version:** 1.0
**Purpose:** One decision sheet per unresolved open question. Each sheet states the exact question, accountable role, affected decisions/work packages, proposed default (if documented, clearly provisional), consequences of leaving unresolved, and evidence required to close.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Priority legend:** CRITICAL = blocks implementation. HIGH = blocks design. MEDIUM = blocks a work package. LOW = does not block Phase 1 design.

---

## OQ-01 — Business Calendar Definition

**Priority:** HIGH
**Category:** SLA Calendar

**Exact question:** What is the definition of a business day, business hours, time zone, weekends, and public holidays for the administrator's 3-business-day escalation resolution target (D11)?

**Accountable role:** Head of Operations / COO

**Affected decisions:** D11 (Administrator Escalation SLA)
**Affected work packages:** WP-1F (admin escalation UI design), WP-2F (implementation), WP-3D (verification)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Business days: Monday through Friday, excluding public holidays.
- Business hours: 08:00–18:00 local time of the administrator's operating timezone.
- Timezone: To be defined (likely the primary operating timezone of the business).
- Weekends: Saturday and Sunday are non-business days.
- Public holidays: To be defined (likely a country-specific holiday calendar).
- SLA pauses outside business hours and on non-business days.

**Consequences of leaving unresolved:**
- Cannot implement SLA countdown tracking.
- Cannot implement overdue-escalation alerting.
- Admin SLA feature is unimplementable without calendar rules.

**Evidence required to close:**
- Written approval from Head of Operations / COO specifying: business days, business hours, timezone, weekend treatment, public holiday calendar source.
- Recorded in Decision Register with approver name, role, date, rationale.

---

## OQ-02 — SLA Trigger Timestamps

**Priority:** HIGH
**Category:** SLA Triggers

**Exact question:** What is the authoritative event and timestamp that starts each applicable SLA clock? Specifically: (a) the merchant 72-hour response clock (D02), and (b) the administrator 3-business-day resolution clock (D11).

**Accountable role:** Head of Operations / COO

**Affected decisions:** D02 (Merchant Response SLA), D11 (Administrator Escalation SLA)
**Affected work packages:** WP-1C (worker design), WP-1F (admin UI design), WP-2C, WP-2F

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Merchant 72-hour clock: starts at `return_requests.created_at` (the return request creation timestamp).
- Administrator 3-business-day clock: starts at the `return_request_events.created_at` timestamp for the `ESCALATED` event.

**Consequences of leaving unresolved:**
- SLA measurement is ambiguous.
- Overdue detection cannot be implemented.
- Disputes about whether SLA was met or breached.

**Evidence required to close:**
- Written approval from Head of Operations / COO confirming the authoritative start event for each clock.
- Recorded in Decision Register.

---

## OQ-03 — Return Eligibility Edge Cases

**Priority:** MEDIUM
**Category:** Return Eligibility

**Exact question:** How does the 14-day return-eligibility window (D01) interact with: (a) cancelled orders, (b) partial deliveries, (c) orders where the buyer never took delivery, and (d) carrier-damaged deliveries where the delivery timestamp may not reflect actual receipt?

**Accountable role:** Head of Operations / COO (co: Customer Experience)

**Affected decisions:** D01 (Buyer Return Window)
**Affected work packages:** WP-2B (FSM implementation — eligibility check)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Cancelled orders: no return eligibility (order never delivered).
- Partial deliveries: each sub-order has its own delivery timestamp and independent 14-day window.
- Buyer never took delivery: return eligibility does not start until DELIVERED status is recorded.
- Carrier-damaged delivery: delivery timestamp stands; return eligibility starts from DELIVERED. Carrier damage is handled through D10 (delivery-fee treatment) and dispute path, not through eligibility extension.

**Consequences of leaving unresolved:**
- Ambiguous eligibility causes incorrect return request acceptance or rejection.
- Customer experience inconsistency.

**Evidence required to close:**
- Written approval from Head of Operations / COO defining eligibility for each edge case.
- Recorded in Decision Register.

---

## OQ-04 — Commission Allocation Method ⚠️ CRITICAL

**Priority:** CRITICAL
**Category:** Commission Allocation

**Exact question:** What is the approved deterministic allocation method when commission snapshots exist only at the order level (`order_financial_breakdown.commissionMinor`) and a partial return involves some items from a multi-item order? Additionally: how is cumulative rounding across multiple partial returns enforced so that total commission reversals never exceed the original commission?

**Accountable role:** Finance Lead / CFO

**Affected decisions:** D04, D06, D07 (Commission reversal — merchant/platform/carrier)
**Affected work packages:** WP-1D (commission design), WP-2D (implementation), WP-3B (verification)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Allocation: proportional by net goods value ratio.
  ```
  commission_reversal = round(commission_total × (net_goods_returned / net_goods_total))
  ```
- Cumulative rounding enforcement (Option A — cap-at-remaining): on each partial return, compute the cumulative reversal so far. If `cumulative_reversal + new_reversal > commission_total`, cap `new_reversal` at `commission_total - cumulative_reversal`. This ensures the total never exceeds the original commission. **WARNING: This prevents over-reversal but does NOT guarantee full reversal in under-rounding cases** — when each individual rounding rounds down, the cap never engages and the cumulative total may fall short. Alternative algorithms (Option B: final-return catch-up, Option C: cumulative-target) guarantee exact reconciliation. See `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` for full comparison.
- All values in integer minor units. `Math.round()` for each calculation.

**Consequences of leaving unresolved:**
- **CRITICAL BLOCKER:** Commission reversal implementation (WP-1D, WP-2D) cannot begin.
- Without a deterministic method, each developer may choose a different allocation, causing financial misstatement.
- Without cumulative rounding enforcement, multiple partial returns could reverse more commission than was originally charged.

**Evidence required to close:**
- Written approval from Finance Lead / CFO of: (a) the allocation method, (b) the cumulative rounding enforcement mechanism, (c) the mixed-responsibility interpretation.
- Written sign-off from CTO / Head of Engineering of: (d) the authoritative data source for cumulative tracking, (e) the locking strategy.
- Recorded in Decision Register with approver name, role, date, rationale.

---

## OQ-05 — Delivery-Fee Allocation for Exceptions

**Priority:** MEDIUM
**Category:** Delivery-Fee Allocation

**Exact question:** When an administrator approves a delivery-fee exception for a partial return (D09), is the full original delivery fee refunded, or a proportional share? How is "proportional" calculated if applicable?

**Accountable role:** Finance Lead (co: Head of Operations)

**Affected decisions:** D09 (Delivery Fee Exception), D10 (Carrier Damage)
**Affected work packages:** WP-1E, WP-2E

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Full original delivery fee refunded on exception (simpler, admin-discretion path).
- Proportional allocation not implemented (avoids complexity).

**Consequences of leaving unresolved:**
- Delivery-fee exception calculation ambiguous.
- Admin UI cannot present correct refund amount.

**Evidence required to close:**
- Written approval from Finance Lead specifying: full or proportional, and calculation method if proportional.

---

## OQ-06 — Delivery-Fee Exception Audit Requirements

**Priority:** LOW
**Category:** Delivery-Fee Audit

**Exact question:** What approval and audit evidence is required for delivery-fee exceptions? Who can approve, what reason codes are valid, and what audit trail is required?

**Accountable role:** Finance Lead (co: Risk / Fraud)

**Affected decisions:** D09 (Delivery Fee Exception)
**Affected work packages:** WP-1E, WP-2E

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Approver: any user with `admin:returns:write` permission.
- Reason codes: `MERCHANT_FAULT`, `PLATFORM_FAULT`, `CARRIER_DAMAGE`, `GOODWILL`.
- Audit trail: `return_request_events` records exception approval with `actor_type = 'ADMIN'`, `event_type = 'DELIVERY_FEE_EXCEPTION_APPROVED'`, and reason code.

**Consequences of leaving unresolved:**
- Exception approvals lack governance.
- No audit trail for delivery-fee exceptions.

**Evidence required to close:**
- Written approval from Finance Lead + Risk specifying: approver role, reason codes, audit requirements.

---

## OQ-07 — Settlement Adjustment Authorization

**Priority:** MEDIUM
**Category:** Settlement Authorization

**Exact question:** What Finance reconciliation and authorization requirements apply to manual settlement adjustments? Who can authorize an adjustment, what amount thresholds apply, and what review cycle is required?

**Accountable role:** Financial Controller

**Affected decisions:** D12 (Settlement Recovery)
**Affected work packages:** Operational process (not a code work package — D12 is already implemented)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Authorizer: Financial Controller or delegate.
- Amount thresholds: all adjustments require dual authorization above a threshold (threshold TBD).
- Review cycle: monthly reconciliation of all adjustments.

**Consequences of leaving unresolved:**
- Manual adjustments lack financial governance.
- Audit risk.

**Evidence required to close:**
- Written approval from Financial Controller specifying: authorization levels, thresholds, reconciliation frequency.

---

## OQ-08 — Voucher Permitted Outcomes

**Priority:** LOW
**Category:** Voucher Outcomes

**Exact question:** What are the permitted outcomes after administrator review of a voucher-related return? What is the financial consequence of each outcome (cash refund, voucher reissue, store credit, reject)?

**Accountable role:** Finance Lead (co: Risk / Fraud)

**Affected decisions:** D13 (Voucher Returns)
**Affected work packages:** WP-1G, WP-2G

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Permitted outcomes: cash refund, store credit (voucher), reject.
- Cash refund: standard refund processing, commission treatment follows responsibility category.
- Store credit: issued as account credit, no commission reversal (credit is not a refund).
- Reject: no refund, no credit. Return closed.

**Consequences of leaving unresolved:**
- Admin reviewers have no policy guidance.
- Inconsistent treatment of voucher returns.

**Evidence required to close:**
- Written approval from Finance Lead + Risk specifying: permitted outcomes, financial treatment per outcome.

---

## OQ-09 — Pilot Operational Owners

**Priority:** HIGH
**Category:** Pilot Operations

**Exact question:** Who are the named operational owners for each of the four pilot operational controls? What are the alert recipients, monitoring thresholds, and pilot rollback responsibility?

**Accountable role:** CTO / Head of Engineering (co: Platform Ops / SRE)

**Affected decisions:** D15 (Pilot Operational Controls)
**Affected work packages:** WP-3G (pilot verification)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Control 1 (polling errors): Owner = SRE on-call. Alert = PagerDuty. Threshold = 3 consecutive failures.
- Control 2 (overdue requests): Owner = SRE on-call. Alert = dashboard + Slack. Threshold = any row >10 min overdue.
- Control 3 (single instance): Owner = Platform Ops lead. Verification = deployment config check.
- Control 4 (startup/activity): Owner = SRE on-call. Alert = missing heartbeat >5 min.
- Rollback authority: CTO / Head of Engineering.

**Consequences of leaving unresolved:**
- Controls unowned and unenforced.
- Pilot cannot launch.

**Evidence required to close:**
- Written acceptance from CTO / SRE lead naming: owners, alert recipients, thresholds, rollback authority.

---

## OQ-10 — Pilot Scope and Criteria

**Priority:** HIGH
**Category:** Pilot Scope

**Exact question:** What is the exact pilot environment, scope, start criteria, and success criteria for the limited single-process pilot?

**Accountable role:** CTO / Head of Engineering (co: Head of Operations)

**Affected decisions:** D14 (Deployment Target)
**Affected work packages:** WP-3G (pilot verification)

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Environment: staging or production subset (TBD).
- Scope: selected merchants/buyers (TBD).
- Start criteria: all Phase 0 approvals documented, all Phase 2 implementation verified, all Phase 3 evidence gathered, all 4 operational controls active.
- Success criteria: zero financial discrepancies, zero data-loss incidents, SLA compliance >95%, no P1/P2 incidents over pilot duration (TBD).
- Exit criteria: success criteria met for pilot duration, or pilot terminated with rollback.

**Consequences of leaving unresolved:**
- No measurable success/failure criteria.
- Pilot has no defined end state.

**Evidence required to close:**
- Written approval from CTO specifying: environment, scope, start/success/exit criteria.

---

## OQ-11 — Carrier Damage Materiality Threshold

**Priority:** MEDIUM
**Category:** Carrier Materiality

**Exact question:** What defines "materially compromises delivery of the order as a whole" vs. "limited-impact partial cases" for carrier-damage delivery-fee treatment (D10)?

**Accountable role:** Finance Lead (co: Head of Operations)

**Affected decisions:** D10 (Delivery Fee — Carrier Damage)
**Affected work packages:** WP-1E, WP-2E

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Material impact: >50% of items in the sub-order are damaged, or the delivered goods are unusable for their intended purpose.
- Limited impact: <50% of items damaged, goods partially usable.
- Threshold is configurable and may be adjusted post-pilot.

**Consequences of leaving unresolved:**
- Carrier-damage delivery-fee decisions are arbitrary.
- Inconsistent buyer treatment.

**Evidence required to close:**
- Written approval from Finance Lead + Ops specifying: materiality threshold, configurability.

---

## OQ-12 — Carrier Recovery Process

**Priority:** LOW (NOT IN P13 SCOPE)
**Category:** Carrier Recovery

**Exact question:** What is the carrier recovery process, evidence requirements, and timeline for pursuing recovery from carriers for damaged goods?

**Accountable role:** Head of Operations / COO

**Affected decisions:** D07, D10 (referenced but not blocking)
**Affected work packages:** None in P13. Separate workflow (P14+).

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Not defined in P13 scope. Carrier recovery is acknowledged as a future capability.

**Consequences of leaving unresolved:**
- No impact on P13 implementation. Carrier recovery is ad hoc.

**Evidence required to close:**
- NOT REQUIRED for P13 Phase 0 closure. Tracked separately for P14+.

---

## Summary

| ID | Priority | Accountable Role | Blocks | Status |
|---|---|---|---|---|
| OQ-01 | HIGH | Head of Operations / COO | D11 implementation | OPEN |
| OQ-02 | HIGH | Head of Operations / COO | D02, D11 implementation | OPEN |
| OQ-03 | MEDIUM | Head of Operations / COO | D01 edge cases | OPEN |
| **OQ-04** | **CRITICAL** | **Finance Lead / CFO** | **D04, D06, D07 implementation** | **OPEN** |
| OQ-05 | MEDIUM | Finance Lead (co: Ops) | D09, D10 implementation | OPEN |
| OQ-06 | LOW | Finance Lead (co: Risk) | D09 audit trail | OPEN |
| OQ-07 | MEDIUM | Financial Controller | D12 governance | OPEN |
| OQ-08 | LOW | Finance Lead (co: Risk) | D13 workflow | OPEN |
| OQ-09 | HIGH | CTO / SRE | D15 operational readiness | OPEN |
| OQ-10 | HIGH | CTO / Head of Engineering | D14 pilot scope | OPEN |
| OQ-11 | MEDIUM | Finance Lead (co: Ops) | D10 materiality | OPEN |
| OQ-12 | LOW (out of scope) | Head of Operations | None in P13 | OPEN — P14+ |

**Attestation:** No repository files, code, migrations, tests, or configuration were modified. No business answers are provided by this document — all proposed defaults are clearly marked PROVISIONAL and require formal approval.
