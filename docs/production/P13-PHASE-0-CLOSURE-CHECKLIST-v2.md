# P13 — Phase 0 Closure Checklist (v2)

**Version:** 2.0
**Purpose:** Distinguish what is complete with evidence, what awaits business decision, what awaits formal approval, and what awaits technical evidence. Define the exact evidence required before Phase 1 may start.
**Status:** PROVISIONAL — PENDING BUSINESS APPROVAL. No decisions approved. No implementation authorized.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Supersedes:** `P13-PHASE-0-CLOSURE-CHECKLIST.md` (v1.0)
**Changes from v1:**
- R-01 (cumulative commission rounding) resolved — see `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 1
- R-02 (Phase 0 exit criteria scope) resolved — see `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 2
- Phase-entry criteria clarified: 13 of 15 decisions for Phase 1 entry, all 15 for Phase 2 entry
- OQ-04 now includes two rounding options (Option A: cap-at-remaining, Option B: final-return catch-up)

**Changes from v2 (this version):**
- R-01 analysis expanded with over-rounding and under-rounding worked examples
- Third candidate algorithm (Option C: cumulative-target) added
- Responsibility-category treatment clarified: eligible vs. ineligible returns
- Mixed-responsibility interpretation question identified for Finance decision
- Locking requirements clarified: `FOR UPDATE` must cover entire operation
- Outstanding accounting questions documented (rounding tolerance, negative reversal, historical refunds, reclassification timing)
- Cross-reference to `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` for full technical analysis
- Superseded by `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` (comprehensive update)

**Companion documents:**
- `P13-POLICY-RECONCILIATION-v3.md`
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`
- `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md`
- `P13-IMPLEMENTATION-READINESS-AND-PHASE-PLAN.md`
- `P13-PHASE-0-APPROVAL-AGENDA-v2.md`
- `P13-PHASE-0-OPEN-DECISION-SHEETS.md`
- `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md`
- `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md`

---

## 1. Complete with Evidence

| Item | Evidence | Verified by |
|---|---|---|
| Contradictions identified and corrected | 6 contradictions (C-01 through C-06) documented and corrected in v3 specification | `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` |
| Commission formula corrected | Net-goods-only formula documented in v3 §3.2. VAT-exclusive, delivery-fee-exclusive. | `P13-POLICY-RECONCILIATION-v3.md` §3.2 |
| Status terminology standardized | Four statuses defined and applied consistently across v3 specification and v2 workbook. | v3 §1, workbook v2 |
| Two independent deadlines documented | Clock 1 (buyer 14-day) and Clock 2 (merchant 72h) documented separately with current implementation and proposed change. | v3 §2 |
| 15 decisions reconciled with definitive provisional wording | All D01–D15 have provisional wording, approver role, dependencies, implementation impact, verification requirements. | Workbook v2 Decision Register |
| 12 open questions documented with accountable roles | All OQ-01–OQ-12 have exact question, accountable role, affected decisions, proposed default (provisional), consequences, evidence required. | `P13-PHASE-0-OPEN-DECISION-SHEETS.md` |
| Release-gate checklist defined | 10 gates (G-01 through G-10) with status, blocking decisions, blocking questions, evidence, action required. **Note:** G-09 (Regression & Build Baseline) and G-10 (P12 Regression Preservation) are pre-implementation baseline verification gates (not release-blocking). Release criterion: G-01–G-08. See `P13-PHASE-0-GATE-CONSISTENCY-AUDIT.md` §Finding F-02. | Workbook v2 Release Gates |
| Approval sequence defined | 5 meeting groups with scheduling priority and dependencies. | `P13-PHASE-0-APPROVAL-AGENDA-v2.md` |
| Dependency graph documented | Decision dependencies, open question dependencies, implementation dependency chain, work package dependencies. | `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` §2–§4 |
| Phased implementation plan defined | Phase 0 (specification), Phase 1 (design), Phase 2 (implementation), Phase 3 (verification) with 32 work packages. | `P13-IMPLEMENTATION-READINESS-AND-PHASE-PLAN.md` |
| Technical baseline verified | Full regression 3098/3098, focused P13 162/162, typecheck 9/9, build 6/6 (Linux CI). | `P13-LINUX-REGRESSION-VERIFICATION.md`, `P13-LINUX-CI-BUILD-VERIFICATION.md` |
| Git baseline preserved | Branch `develop`, HEAD `8d60e36`, clean working tree (no source modifications). | `git rev-parse`, `git status` |
| R-01 (cumulative commission rounding) analyzed | Three options presented: Option A (cap-at-remaining), Option B (final-return catch-up), Option C (cumulative-target). Over/under-rounding examples documented. Mixed-responsibility interpretation question identified. Locking requirements clarified. Outstanding accounting questions documented. Finance decision required. | `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 1, `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` |
| R-02 (Phase 0 exit criteria scope) clarified | Phase-entry criteria clarified: 13 of 15 for Phase 1 entry, all 15 for Phase 2 entry. D12/D13 restrictions documented. | `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 2 |

**Count: 14 items complete.**

---

## 2. Awaiting Business Decision

These items require a business decision (the answer to a question). They are not yet decided — only provisional defaults exist.

| Item | Decision Required | Accountable Role | Priority | Blocking |
|---|---|---|---|---|
| OQ-04: Commission allocation method + rounding | Finance: approve proportional allocation + cumulative rounding enforcement (Option A, B, or C) + mixed-responsibility interpretation. Engineering: sign off on data source + locking strategy | Finance Lead / CFO (policy) + CTO / Head of Engineering (technical) | **CRITICAL** | D04, D06, D07 implementation |
| OQ-01: Business calendar definition | Define business days, hours, timezone, holidays | Head of Operations / COO | HIGH | D11 implementation |
| OQ-02: SLA trigger timestamps | Confirm authoritative start events for each clock | Head of Operations / COO | HIGH | D02, D11 implementation |
| OQ-09: Pilot operational owners | Name owners, alert recipients, thresholds | CTO / SRE | HIGH | D15 operational readiness |
| OQ-10: Pilot scope and criteria | Define environment, scope, start/success/exit criteria | CTO / Head of Engineering | HIGH | D14 pilot scope |
| OQ-03: Return eligibility edge cases | Define eligibility for cancellations, partial deliveries | Head of Operations / COO | MEDIUM | D01 edge cases |
| OQ-05: Delivery-fee allocation for exceptions | Full or proportional on admin exception | Finance Lead (co: Ops) | MEDIUM | D09, D10 implementation |
| OQ-07: Settlement adjustment authorization | Authorization levels, thresholds, reconciliation | Financial Controller | MEDIUM | D12 governance |
| OQ-11: Carrier damage materiality | Define materiality threshold | Finance Lead (co: Ops) | MEDIUM | D10 implementation |
| OQ-06: Delivery-fee exception audit | Approver role, reason codes, audit trail | Finance Lead (co: Risk) | LOW | D09 audit trail |
| OQ-08: Voucher permitted outcomes | Outcomes and financial consequences | Finance Lead (co: Risk) | LOW | D13 workflow |
| OQ-12: Carrier recovery process | NOT IN P13 SCOPE — tracked for P14+ | Head of Operations | LOW | None in P13 |

**Count: 11 in-scope decisions awaiting + 1 out-of-scope.**

---

## 3. Awaiting Formal Approval

These items have provisional positions but require formal, attributable approval evidence (approver name, role, date, rationale).

| Decision | Provisional Position | Approver Role | Status |
|---|---|---|---|
| D01 | 14 days from delivery | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL |
| D02 | 72 hours from request creation | Head of Merchant Partnerships | PROVISIONAL — PENDING APPROVAL |
| D03 | Escalate to admin; no auto-approve/reject/expire | Head of Merchant Partnerships (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D04 | Reverse commission on net goods (merchant-responsible) | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D05 | Retain commission (buyer remorse) | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D06 | Reverse commission on net goods (platform-responsible) | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D07 | Reverse commission on net goods (carrier damage) | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL |
| D08 | Full-sub-order delivery fee refund only | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D09 | Admin-authorized delivery-fee exception for partials | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D10 | Refund delivery fee for material carrier damage; partials to admin | Finance Lead (co: Ops) | PROVISIONAL — PENDING APPROVAL |
| D11 | 3 business days from escalation (calendar TBD) | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL |
| D12 | Manual Finance/admin adjustment; no auto clawback | Financial Controller | PROVISIONAL — PENDING APPROVAL |
| D13 | Administrator review for every voucher return | Finance Lead (co: Risk) | PROVISIONAL — PENDING APPROVAL |
| D14 | Limited single-process pilot | CTO / Head of Engineering | PROVISIONAL — PENDING APPROVAL |
| D15 | Four operational controls, one worker-enabled instance | CTO / Head of Engineering (co: SRE) | PROVISIONAL — PENDING APPROVAL |

**Count: 0 of 15 approved. All 15 awaiting formal approval.**

---

## 4. Awaiting Technical Evidence

These items require technical verification that can only be produced after implementation.

| Item | Evidence Required | Available After |
|---|---|---|
| FSM ESCALATED state correctness | Unit tests: all transitions legal. Integration: ESCALATED transitions verified. | Phase 2 WP-2B complete |
| Migration 0060 applies cleanly | Fresh DB: 0001–0060. Existing DB at 0059: upgrade path. Rollback tested. | Phase 2 WP-2A complete |
| Escalation idempotency | PostgreSQL concurrency: 2 processors → 1 escalation. Re-processing safe. | Phase 2 WP-2C complete |
| Commission reversal correctness | Each responsibility category verified. VAT-exclusive confirmed. Cumulative cap holds. | Phase 2 WP-2D complete |
| Delivery-fee exception correctness | Full-sub-order baseline, exception path, carrier-damage path verified. | Phase 2 WP-2E complete |
| Admin SLA tracking | Countdown from escalation, overdue detection. | Phase 2 WP-2F complete |
| Voucher review workflow | Each outcome processed correctly. Authorization verified. | Phase 2 WP-2G complete |
| P12 regression preservation | Full regression: 3098+ tests, 0 failures. | Phase 3 WP-3F |
| Pilot operational controls | All 4 controls assigned, alerting tested, dashboards active. | Phase 3 WP-3G |
| Independent verification | All evidence reviewed independently. No contradictions. | Phase 3 WP-3H |

**Count: 10 items awaiting technical evidence (all post-implementation).**

---

## 5. Phase 0 Exit Criteria — Definitive (v2)

**Phase 0 is closed when ALL of the following are true:**

### 5.1 Mandatory for Phase 1 entry (technical design may begin)

1. **D01–D11 approved** (11 of 15) with attributable evidence (approver name, role, date, rationale).
2. **D14, D15 approved** (2 of 15) with attributable evidence.
3. **OQ-04 resolved:** Finance Lead / CFO has approved the commission allocation method AND the cumulative rounding enforcement mechanism (Option A, B, or C) AND the mixed-responsibility interpretation. CTO / Head of Engineering has signed off on the data source and locking strategy. Evidence: written approval recorded in Decision Register. See `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §8 for decision record template.
4. **OQ-01 resolved:** Head of Operations / COO has defined business calendar rules. Evidence: written approval recorded in Decision Register.
5. **OQ-02 resolved:** Head of Operations / COO has confirmed SLA trigger timestamps. Evidence: written approval recorded in Decision Register.

**Total: 13 of 15 decisions approved (D01–D11, D14, D15) + OQ-01, OQ-02, OQ-04 resolved.**

### 5.2 May be approved in parallel with Phase 1 (not hard blockers for design)

6. **D12 approved:** Settlement recovery process approved. (Does not block any Phase 1 work package. Blocks Phase 2 WP-2D implementation.)
7. **D13 approved:** Voucher review requirement approved. (Does not block Phase 1 design. Blocks Phase 2 WP-2G implementation.)

### 5.3 Not required for Phase 1 entry

8. **OQ-03 resolved:** Helpful but not blocking — edge cases can be addressed during implementation.
9. **OQ-05 through OQ-11 resolved:** Helpful for design completeness but not blocking — proposed defaults may be used for design with explicit "pending approval" annotation.
10. **OQ-12:** Out of P13 scope.

### 5.4 Phase 2 entry (implementation may begin)

**All 15 decisions (D01–D15) must be approved before any Phase 2 implementation begins.**

**Mandatory open question resolutions before their dependent work packages:**

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

### 5.5 Pilot deployment and release authorization

**Mandatory:**

- All Phase 2 work packages complete and verified.
- All Phase 3 verification work packages complete with evidence.
- All 15 decisions approved.
- All in-scope open questions resolved.
- Pilot operational controls (D15) assigned and active.
- Independent verification report authored.
- Explicit release authorization from authorized person.

**Release gate:** All gates G-01 through G-08 PASS.

---

## 6. Phase 0 Exit Criteria — Status

| Exit Criterion | Status | Evidence / Gap |
|---|---|---|
| All contradictions resolved | **COMPLETE** | 6 contradictions corrected in v3. R-01, R-02 resolved in blocker reconciliation. |
| 15 decisions reconciled with provisional wording | **COMPLETE** | Workbook v2 Decision Register. |
| 12 open questions documented | **COMPLETE** | Decision sheets OQ-01–OQ-12. |
| R-01 (cumulative rounding) resolved | **COMPLETE** | Three options presented in `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 1 and `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md`. Over/under-rounding examples, mixed-responsibility interpretation, locking requirements documented. Awaiting Finance decision as part of OQ-04. |
| R-02 (exit criteria scope) clarified | **COMPLETE** | Phase-entry criteria clarified in `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 2 and this document §5. |
| OQ-04 resolved by Finance Lead / CFO + CTO / Head of Engineering | **AWAITING** | CRITICAL — blocks D04/D06/D07 implementation. Finance must approve: rounding mechanism (Option A/B/C), mixed-responsibility interpretation, and answers to outstanding accounting questions. Engineering must sign off: data source, locking strategy. See `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §9. |
| OQ-01 resolved by Head of Operations / COO | **AWAITING** | HIGH — blocks D11 implementation. |
| OQ-02 resolved by Head of Operations / COO | **AWAITING** | HIGH — blocks D02/D11 implementation. |
| D01–D03 approved (return window, merchant SLA, escalation) | **AWAITING** | Critical-path decision for FSM design. |
| D04–D07 approved (commission per category) | **AWAITING** | Requires OQ-04 first. |
| D08–D10 approved (delivery fee) | **AWAITING** | Requires OQ-05, OQ-11. |
| D11 approved (admin SLA) | **AWAITING** | Requires OQ-01. |
| D14, D15 approved (deployment + controls) | **AWAITING** | Requires OQ-09, OQ-10. |
| D12, D13 approved (settlement + voucher) | **AWAITING** | May be approved in parallel with Phase 1. Must be approved before Phase 2. |

---

## 7. Exact Evidence Required Before Phase 1 May Start

Phase 1 (technical design) may begin when **all** of the following are satisfied:

### 7.1 Mandatory (hard blockers)

1. **OQ-04 resolved:** Finance Lead / CFO has approved the commission allocation method AND the cumulative rounding enforcement mechanism (Option A, B, or C) AND the mixed-responsibility interpretation. CTO / Head of Engineering has signed off on the data source and locking strategy. Evidence: written approval recorded in Decision Register. See `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §8 for decision record template.
2. **OQ-01 resolved:** Head of Operations / COO has defined business calendar rules. Evidence: written approval recorded in Decision Register.
3. **OQ-02 resolved:** Head of Operations / COO has confirmed SLA trigger timestamps. Evidence: written approval recorded in Decision Register.
4. **D01 approved:** Buyer return window (14 days) approved. Evidence: attributable approval.
5. **D02 approved:** Merchant response SLA (72h) approved. Evidence: attributable approval.
6. **D03 approved:** Escalation-on-timeout policy approved. Evidence: attributable approval. **This is the critical-path item** — FSM design cannot begin without it.
7. **D04–D07 approved:** Commission reversal policy approved for all four responsibility categories. Evidence: attributable approval for each.
8. **D08–D10 approved:** Delivery-fee baseline, exception, and carrier-damage policies approved. Evidence: attributable approval for each.
9. **D11 approved:** Admin escalation SLA approved. Evidence: attributable approval.
10. **D14, D15 approved:** Deployment target and operational controls approved. Evidence: attributable approval.

### 7.2 May be approved in parallel with Phase 1 (not hard blockers for design)

11. **D12 approved:** Settlement recovery process approved. (Does not block any Phase 1 work package.)
12. **D13 approved:** Voucher review requirement approved. (Does not block Phase 1 design; blocks WP-1G design if voucher workflow design is in Phase 1 scope.)

### 7.3 Not required for Phase 1

13. **OQ-03 resolved:** Helpful but not blocking — edge cases can be addressed during implementation.
14. **OQ-05 through OQ-11 resolved:** Helpful for design completeness but not blocking — proposed defaults may be used for design with explicit "pending approval" annotation.
15. **OQ-12:** Out of P13 scope.

---

## 8. Phase 0 Closure Declaration Template

Phase 0 is closed when the following statement can be made with evidence:

> **PHASE 0 CLOSURE DECLARATION**
>
> All mandatory exit criteria (§7.1) are satisfied:
> - OQ-01, OQ-02, OQ-04 resolved with written approval.
> - D01–D11, D14, D15 approved with attributable evidence.
> - R-01 (cumulative rounding) resolved as part of OQ-04.
> - R-02 (exit criteria scope) clarified — see `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` Part 2.
>
> D12, D13 are [approved / in parallel approval process].
> Remaining open questions (OQ-03, OQ-05 through OQ-11) have proposed defaults annotated as PROVISIONAL and are tracked for resolution during Phase 1.
>
> Phase 1 (technical design) is authorized to begin.
>
> Declared by: [name, role, date]

---

## 9. Approval Recording Checklist

For each decision, record the following in the Decision Register:

| Field | Description |
|---|---|
| Decision ID | D01, D02, ..., D15 |
| Approver name | Full name of the person approving |
| Approver role | Job title / role (e.g., Finance Lead / CFO) |
| Approval date | Date the decision was formally approved |
| Decision | APPROVED / REJECTED / APPROVED WITH CONDITIONS |
| Rationale | Brief explanation of the decision |
| Conditions | If APPROVED WITH CONDITIONS, list the conditions |
| Evidence | Reference to meeting minutes, email, signed document, etc. |
| Dependent decisions | List of decisions that depend on this one |
| Implementation impact | Which work packages are affected |

---

## 10. Remaining Blockers Summary

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

## 11. Attestation

- No repository files, code, migrations, tests, or configuration were modified.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- No approver identities, dates, or evidence were invented.
- R-01 resolved: cumulative rounding problem documented, two options presented, Finance decision required.
- R-02 resolved: phase-entry criteria clarified. 13 of 15 for Phase 1 entry, all 15 for Phase 2 entry.
- Baseline preserved: branch `develop`, HEAD `8d60e36`.
