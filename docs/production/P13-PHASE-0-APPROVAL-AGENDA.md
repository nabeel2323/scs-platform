# P13 — Phase 0 Approval Agenda

**Version:** 1.0
**Purpose:** Structured meeting agenda for resolving all outstanding P13 business decisions and open questions. Grouped by functional area to minimize meeting count.
**Status:** PROPOSED — requires scheduling by Operations coordinator.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Companion documents:**
- `P13-POLICY-RECONCILIATION-v3.md`
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`
- `P13-PHASE-0-OPEN-DECISION-SHEETS.md`
- `P13-PHASE-0-CLOSURE-CHECKLIST.md`

---

## Pre-meeting preparation (all attendees)

1. Read `P13-POLICY-RECONCILIATION-v3.md` (corrected policy specification).
2. Read `P13-PHASE-0-OPEN-DECISION-SHEETS.md` (decision sheets for OQ-01–OQ-12).
3. Review the Decision Register in `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`.
4. Prepare provisional positions for each decision in your functional area.
5. Bring authority to approve or commit to a follow-up date.

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
- Record all approvals with: approver name, role, date, rationale.

---

## Meeting 2 — Finance & Accounting

**Duration:** 90 minutes (proposed)
**Required attendees:** Finance Lead / CFO, Financial Controller

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review P13 financial scope and commission model | — | — |
| 0:10–0:30 | **CRITICAL: Commission allocation method** | D04, D05, D06, D07 | **OQ-04** |
| 0:30–0:45 | Commission reversal per responsibility category | D04, D06, D07 | — |
| 0:45–1:00 | Delivery-fee baseline, exceptions, and carrier damage | D08, D09, D10 | OQ-05, OQ-06, OQ-11 |
| 1:00–1:15 | Settlement recovery and voucher review | D12, D13 | OQ-07, OQ-08 |
| 1:15–1:30 | Action items and approval recording | — | — |

### Expected outcomes

- **OQ-04 (CRITICAL):** Approve deterministic commission allocation method. Proposed default: proportional by net goods value ratio. Must address cumulative rounding enforcement (see residual issue R-01 in closure checklist).
- D04–D07: Approve/reject responsibility-dependent commission reversal policy.
- D08–D10: Approve/reject delivery-fee baseline, exception path, carrier-damage treatment. Define materiality threshold (OQ-11).
- D12: Approve manual settlement recovery process. Define authorization requirements (OQ-07).
- D13: Approve voucher review requirement. Define permitted outcomes (OQ-08).
- Record all approvals with: approver name, role, date, rationale.

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
- Record all approvals with: approver name, role, date, rationale.

---

## Meeting 4 — Engineering & Operations

**Duration:** 60 minutes (proposed)
**Required attendees:** CTO / Head of Engineering, Platform Ops / SRE lead

### Agenda items

| Time | Item | Decisions | Open Questions |
|---|---|---|---|
| 0:00–0:10 | Review deployment topology and pilot constraints | — | — |
| 0:10–0:25 | Deployment target selection | D14 | OQ-10 |
| 0:25–0:45 | Pilot operational controls and ownership | D15 | OQ-09 |
| 0:45–0:55 | Multi-instance production blocking condition | — | — |
| 0:55–1:00 | Action items and approval recording | — | — |

### Expected outcomes

- D14: Explicitly select deployment target (limited single-process pilot or multi-instance production).
- D15: Accept all four operational controls. Name operational owners, alert recipients, thresholds (OQ-09). Define pilot scope, start criteria, success criteria (OQ-10).
- Confirm multi-instance production blocking condition.
- Record all approvals with: approver name, role, date, rationale.

---

## Meeting 5 — Consolidation and Phase 0 Closure

**Duration:** 30 minutes (proposed)
**Required attendees:** All approvers (or delegates), governance recorder

### Agenda items

| Time | Item |
|---|---|
| 0:00–0:10 | Verify all 15 decisions have documented approval/rejection |
| 0:10–0:20 | Verify all in-scope open questions (OQ-01–OQ-11) resolved |
| 0:20–0:25 | Verify Phase 0 exit criteria met (see closure checklist) |
| 0:25–0:30 | Declare Phase 0 closed or record remaining gaps |

### Expected outcomes

- Phase 0 closure declaration (if all criteria met) or gap list with follow-up dates.
- Authorization to begin Phase 1 (technical design).

---

## Meeting sequence dependencies

```
Meeting 1 (Ops/Merchant) ──┐
Meeting 2 (Finance)     ───┼── Meeting 5 (Consolidation) ── Phase 1 start
Meeting 3 (Risk)        ───┤
Meeting 4 (Engineering) ───┘
```

Meetings 1–4 may be held in parallel or in any order. Meeting 5 requires all prior meetings complete.

---

## Scheduling priority

| Priority | Meeting | Reason |
|---|---|---|
| 1st | Meeting 2 (Finance) | OQ-04 is CRITICAL blocker for commission implementation |
| 2nd | Meeting 1 (Ops/Merchant) | D02, D03 are on the critical path for FSM design |
| 3rd | Meeting 4 (Engineering) | D14, D15 required before pilot readiness |
| 4th | Meeting 3 (Risk) | D13, OQ-06/OQ-08 are lower priority |
| Last | Meeting 5 (Consolidation) | After all prior meetings complete |

---

## Attestation

No repository files, code, migrations, tests, or configuration were modified. This is a proposed meeting agenda only. No approvals are granted by this document.
