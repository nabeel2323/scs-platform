# P13 — Phase 0 Approval Agenda (v2)

**Version:** 2.0
**Purpose:** Structured meeting agenda for resolving all outstanding P13 business decisions and open questions. Grouped by functional area to minimize meeting count.
**Status:** PROPOSED — requires scheduling by Operations coordinator.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Supersedes:** `P13-PHASE-0-APPROVAL-AGENDA.md` (v1.0)
**Changes from v1:**
- Meeting 2 (Finance) now includes OQ-04 rounding options (Option A: cap-at-remaining, Option B: final-return catch-up) with Finance decision required.
- Meeting 5 (Consolidation) updated to reflect clarified Phase 0 exit criteria: 13 of 15 decisions for Phase 1 entry, all 15 for Phase 2 entry.
- Phase-entry criteria reference updated to `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` and `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`.
- Approval recording checklist added to each meeting.

**Companion documents:**
- `P13-POLICY-RECONCILIATION-v3.md`
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`
- `P13-PHASE-0-OPEN-DECISION-SHEETS.md`
- `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`
- `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md`
- `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md`

---

## Pre-meeting preparation (all attendees)

1. Read `P13-POLICY-RECONCILIATION-v3.md` (corrected policy specification).
2. Read `P13-PHASE-0-OPEN-DECISION-SHEETS.md` (decision sheets for OQ-01–OQ-12).
3. Read `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` (R-01 rounding options, R-02 phase-entry criteria).
4. Read `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` (full technical analysis of commission rounding algorithms, worked examples, Finance decision record template).
5. Review the Decision Register in `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`.
6. Prepare provisional positions for each decision in your functional area.
7. Bring authority to approve or commit to a follow-up date.

---

## Meeting 1 — Operations & Merchant Partnerships

**Duration:** 90 minutes (proposed)
**Required attendees:** Head of Operations / COO, Head of Merchant Partnerships, Customer Experience lead

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review P13 scope and current status | — | — |
| 0:10–0:25 | Buyer return window and eligibility edge cases | D01 | OQ-03 |
| 0:25–0:45 | Merchant response SLA and timeout behavior | D02, D03 | OQ-02 |
| 0:45–1:05 | Administrator escalation SLA and business calendar | D11 | OQ-01, OQ-02 |
| 1:05–1:20 | Disputed responsibility flow and escalation path | — | — |
| 1:20–1:30 | Action items and approval recording | — | — |

### Expected outcomes

- D01: Approve/reject/modify 14-day return window. Define eligibility edge cases (OQ-03).
- D02: Approve/reject/modify 72-hour merchant response SLA. Confirm trigger timestamp (OQ-02).
- D03: Approve/reject escalation-on-timeout policy (material FSM change).
- D11: Approve/reject 3-business-day admin SLA. Define business calendar (OQ-01): business days, hours, timezone, holidays.
- Record all approvals with: approver name, role, date, rationale, evidence reference.

### Approval recording checklist

For each decision, record in the Decision Register:
- [ ] Approver full name
- [ ] Approver role
- [ ] Approval date
- [ ] Decision: APPROVED / REJECTED / APPROVED WITH CONDITIONS
- [ ] Rationale (brief)
- [ ] Conditions (if any)
- [ ] Evidence reference (meeting minutes, email, signed document)

---

## Meeting 2 — Finance & Accounting ⚠️ PRIORITY 1

**Duration:** 120 minutes (proposed — extended from 90 to accommodate OQ-04 rounding discussion)
**Required attendees:** Finance Lead / CFO, Financial Controller

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review P13 financial scope and commission model | — | — |
| 0:10–0:40 | **CRITICAL: Commission allocation method AND cumulative rounding** | D04, D05, D06, D07 | **OQ-04** |
| 0:40–0:55 | Commission reversal per responsibility category | D04, D06, D07 | — |
| 0:55–1:10 | Delivery-fee baseline, exceptions, and carrier damage | D08, D09, D10 | OQ-05, OQ-06, OQ-11 |
| 1:10–1:25 | Settlement recovery and voucher review | D12, D13 | OQ-07, OQ-08 |
| 1:25–1:40 | Action items and approval recording | — | — |

### Expected outcomes

- **OQ-04 (CRITICAL — 30 minutes minimum):**
  - Approve deterministic commission allocation method: proportional by net goods value ratio.
  - **Decide cumulative rounding enforcement mechanism:**
    - **Option A (cap-at-remaining):** On each partial return, compute `raw_reversal = round(commission_total × (net_goods_returned / net_goods_total))`. Then `actual_reversal = min(raw_reversal, commission_total - cumulative_reversals_so_far)`. The cap ensures total never exceeds `commission_total`. **WARNING: Prevents over-reversal but does NOT guarantee full reversal in under-rounding cases** — when each individual rounding rounds down, the cap never engages and the cumulative total may fall short by up to N-1 minor units. See `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §3.3 and §6.
    - **Option B (final-return catch-up):** Same as Option A for all returns except the last. When full return detected (`cumulative_returned_qty = total_ordered_qty`), compute `actual_reversal = commission_total - cumulative_reversals_so_far` (catch-up). Ensures exact total when fully returned but requires detecting "last return" at processing time.
    - **Option C (cumulative-target):** Calculate `cumulative_target = round(commission_total × (eligible_net_goods_returned / net_goods_total))`. Then `current_reversal = cumulative_target - already_reversed`. Enforce non-negative and remaining cap. Rounding residue absorbed in first transaction. Requires cumulative tracking.
  - **Decide mixed-responsibility interpretation:** When some items are buyer-remorse (ineligible), should the denominator be total order net goods (Interpretation 1) or eligible net goods only (Interpretation 2)?
  - **Finance acknowledges financial invariants Engineering must preserve:** Cumulative reversals ≤ `commission_total`. [Finance to specify: must cumulative = eligible commission when all eligible items fully returned? Rounding tolerance ±1 minor unit acceptable?]
  - **Note:** Data source and locking strategy are Engineering sign-off items. They will be recorded in Meeting 4 (Engineering & Operations) after Finance has approved the policy invariants above. Engineering must respect the financial invariants Finance specifies here.
  - See `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 1 and `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` for full analysis, worked examples, and outstanding accounting questions.

- D04–D07: Approve/reject responsibility-dependent commission reversal policy.
- D08–D10: Approve/reject delivery-fee baseline, exception path, carrier-damage treatment. Define materiality threshold (OQ-11).
- D12: Approve manual settlement recovery process. Define authorization requirements (OQ-07).
- D13: Approve voucher review requirement. Define permitted outcomes (OQ-08).
- Record all approvals with: approver name, role, date, rationale, evidence reference.

### OQ-04 Finance policy decision recording template (Meeting 2)

| Field | Value |
|---|---|
| Allocation method | Proportional by net goods value ratio (APPROVED / REJECTED / MODIFIED) |
| Rounding mechanism | Option A: cap-at-remaining / Option B: final-return catch-up / Option C: cumulative-target (APPROVED / REJECTED / MODIFIED) |
| Mixed-responsibility interpretation | Interpretation 1: denominator = total order / Interpretation 2: denominator = eligible only (APPROVED / REJECTED / MODIFIED) |
| Financial invariants acknowledged (Finance) | Cumulative reversals ≤ commission_total (YES / NO). Exact reconciliation required?: YES / NO. Rounding tolerance ±1 minor unit?: YES / NO. Additional invariants: [specify] |
| Rationale | [Finance explanation] |
| Outstanding accounting questions | Rounding tolerance (±1 minor unit acceptable?): YES / NO. Negative reversal (clawback) permitted?: YES / NO. Historical refunds backfilled?: YES / NO. Reclassification timing: creation date / reclassification date. |

**Note:** Data source and locking strategy are Engineering sign-off items. They are recorded in Meeting 4 using the OQ-04 Engineering sign-off template below.

### OQ-04 Engineering sign-off decision recording template (Meeting 4)

| Field | Value |
|---|---|
| Data source | Option 1: `refunds.commission_reversal_minor` / Option 2: new ledger table (APPROVED / REJECTED / MODIFIED) |
| Locking strategy | Extend `FOR UPDATE` on payment record / Dedicated lock on order financial breakdown / `pg_advisory_xact_lock` (APPROVED / REJECTED / MODIFIED) |
| Finance invariants respected | Finance policy decisions from Meeting 2 acknowledged. Invariants preserved in technical design (YES / NO). |
| Required tests acknowledged | Concurrency, idempotency, financial reconciliation, cumulative cap tests (YES / NO) |
| Rationale | [Engineering explanation] |

**OQ-04 is fully resolved only when BOTH templates above have been completed with attributable evidence.**

---

## Meeting 3 — Risk & Fraud

**Duration:** 45 minutes (proposed)
**Required attendees:** Finance Lead (co: Risk / Fraud), Risk/Fraud representative

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review voucher return risk surface | — | — |
| 0:10–0:25 | Voucher review workflow and permitted outcomes | D13 | OQ-08 |
| 0:25–0:35 | Delivery-fee exception audit requirements | D09 | OQ-06 |
| 0:35–0:45 | Action items and approval recording | — | — |

### Expected outcomes

- D13: Define permitted voucher outcomes (cash, voucher, store credit, reject) and financial consequences.
- OQ-06: Define audit evidence requirements for delivery-fee exceptions.
- Record all approvals with: approver name, role, date, rationale, evidence reference.

---

## Meeting 4 — Engineering & Operations

**Duration:** 90 minutes (proposed — extended from 60 to accommodate OQ-04 Engineering sign-off)
**Required attendees:** CTO / Head of Engineering, Platform Ops / SRE lead

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review deployment topology and pilot constraints | — | — |
| 0:10–0:25 | Deployment target selection | D14 | OQ-10 |
| 0:25–0:45 | Pilot operational controls and ownership | D15 | OQ-09 |
| 0:45–0:55 | Multi-instance production blocking condition | — | — |
| 0:55–1:15 | **OQ-04 Engineering sign-off:** Data source and locking strategy for commission reversal tracking. Engineering must respect the financial invariants approved by Finance in Meeting 2. | — | OQ-04 (Engineering items) |
| 1:15–1:25 | Action items and approval recording | — | — |

### Expected outcomes

- D14: Explicitly select deployment target (limited single-process pilot or multi-instance production).
- D15: Accept all four operational controls. Name operational owners, alert recipients, thresholds (OQ-09). Define pilot scope, start criteria, success criteria (OQ-10).
- **OQ-04 Engineering sign-off:** CTO / Head of Engineering signs off on: (a) authoritative data source for cumulative commission-reversal tracking (Option 1: `refunds.commission_reversal_minor`, or Option 2: new ledger table), (b) locking strategy (extend `FOR UPDATE` on payment record, dedicated lock, or advisory lock). Engineering must confirm that the chosen approach preserves the financial invariants approved by Finance in Meeting 2.
- Confirm multi-instance production blocking condition.
- Record all approvals with: approver name, role, date, rationale, evidence reference.

**Dependency:** The OQ-04 Engineering sign-off items require Meeting 2 (Finance) to have completed its Finance policy decisions first. Engineering cannot sign off on the technical implementation until Finance has approved the algorithm, mixed-responsibility interpretation, and financial invariants.

---

## Meeting 5 — Consolidation and Phase 0 Closure

**Duration:** 30 minutes (proposed)
**Required attendees:** All approvers (or delegates), governance recorder

### Agenda items

| Time | Item |
|---|---|
| 0:00–0:10 | Verify D01–D11, D14, D15 have documented approval/rejection (13 of 15 required for Phase 1 entry) |
| 0:10–0:15 | Verify OQ-01, OQ-02 resolved with written approval. Verify OQ-04 resolved: Finance policy decisions (Meeting 2 template) AND Engineering sign-off (Meeting 4 template) both recorded with attributable evidence. |
| 0:15–0:20 | Verify D12, D13 status (approved or in parallel approval process) |
| 0:20–0:25 | Verify Phase 0 exit criteria met (see `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` §5) |
| 0:25–0:30 | Declare Phase 0 closed or record remaining gaps with follow-up dates |

### Expected outcomes

- Phase 0 closure declaration (if all criteria met) or gap list with follow-up dates.
- Authorization to begin Phase 1 (technical design).
- Confirmation that D12, D13 will be approved before Phase 2 entry.
- Confirmation that remaining OQs (OQ-03, OQ-05 through OQ-11) are tracked for resolution before their dependent work packages.

### Phase 0 closure declaration template

> **PHASE 0 CLOSURE DECLARATION**
>
> All mandatory exit criteria are satisfied:
> - OQ-01, OQ-02, OQ-04 resolved with written approval.
> - D01–D11, D14, D15 approved with attributable evidence (13 of 15).
> - R-01 (cumulative rounding) resolved as part of OQ-04.
> - R-02 (exit criteria scope) clarified — see `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 2.
>
> D12, D13 are [approved / in parallel approval process].
> Remaining open questions (OQ-03, OQ-05 through OQ-11) have proposed defaults annotated as PROVISIONAL and are tracked for resolution before their dependent work packages.
>
> Phase 1 (technical design) is authorized to begin.
>
> Declared by: [name, role, date]

---

## Meeting sequence dependencies

```
Meeting 1 (Ops/Merchant) ──┐
Meeting 2 (Finance)     ───┼────────────────────────────── Meeting 5 (Consolidation) ── Phase 1 start
Meeting 3 (Risk)        ───┤                                      ↑
Meeting 4 (Engineering) ───┘                                      │
       ↑                                                          │
       └── OQ-04 Eng. sign-off depends on Meeting 2 Finance ──────┘
```

Meetings 1–4 may be held in parallel or in any order, **except:** Meeting 4's OQ-04 Engineering sign-off items require Meeting 2 (Finance) to have completed its Finance policy decisions first. Meeting 5 requires all prior meetings complete.

---

## Scheduling priority

| Priority | Meeting | Reason |
|---|---|---|
| 1st | Meeting 2 (Finance) | OQ-04 is CRITICAL blocker for commission implementation. Includes rounding mechanism decision. |
| 2nd | Meeting 1 (Ops/Merchant) | D02, D03 are on the critical path for FSM design. OQ-01, OQ-02 required for Phase 1 entry. |
| 3rd | Meeting 4 (Engineering) | D14, D15 required before pilot readiness. OQ-09, OQ-10 required. **OQ-04 Engineering sign-off** (data source, locking strategy) — depends on Meeting 2 Finance decisions. |
| 4th | Meeting 3 (Risk) | D13, OQ-06/OQ-08 are lower priority. May be approved in parallel with Phase 1. |
| Last | Meeting 5 (Consolidation) | After all prior meetings complete. Declares Phase 0 closed. |

---

## Phase-entry criteria quick reference

| Phase | Decisions required | OQs required | Notes |
|---|---|---|---|
| **Phase 1 entry** (technical design) | D01–D11, D14, D15 (13 of 15) | OQ-01, OQ-02, OQ-04 | D12, D13 may be approved in parallel |
| **Phase 2 entry** (implementation) | All D01–D15 (15 of 15) | All in-scope OQs before their dependent WPs | D12 before WP-2D. D13 before WP-2G. |
| **Release** | All D01–D15 approved | All in-scope OQs resolved | All gates G-01 through G-08 PASS |

---

## Attestation

No repository files, code, migrations, tests, or configuration were modified. This is a proposed meeting agenda only. No approvals are granted by this document. All decisions remain PROVISIONAL — PENDING APPROVAL until formally approved with attributable evidence.
