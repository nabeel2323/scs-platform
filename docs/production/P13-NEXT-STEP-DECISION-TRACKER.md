# P13 Next Step — Decision Tracker

**Purpose:** working tracker for the human decision process — one row per decision (D01–D15) and open question (OQ-01–OQ-12), plus the meeting plan that produces attributable approvals.
**Baseline:** branch `develop`, HEAD `c01267cfd9be8cac72edb9333f7c7f036647fc1a`. Created 2026-10-16.

## 1. Three different things this tracker distinguishes

| Concept | Meaning | Where it lives |
|---|---|---|
| **RECOMMENDATION** | An evidence-based suggestion (e.g., in `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md`, marked NOT APPROVED). It has **no** decision authority and never advances a status. | Approval pack, audit reports |
| **PENDING DECISION** | A decision request that has been tabled to the accountable owner but not yet answered with evidence. Status remains PROVISIONAL/OPEN. | This tracker |
| **ATTRIBUTABLE APPROVAL** | The only state that changes a register: named approver + role + date + decision (APPROVED / REJECTED / APPROVED WITH CONDITIONS) + rationale + evidence reference, recorded in the canonical register. Nothing else counts — not verbal consent, not passing tests, not green CI, not a recommendation. | Canonical xlsx register |

## 2. Canonical register

`P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` is the **canonical** register (D01–D15, OQ-01–OQ-12, gates G-01–G-10). This Markdown file is a working view and does **not** replace it; its contents were not modified in this phase. Section 4 lists the updates that would be applied to the xlsx **only after** attributable evidence arrives.

## 3. Master tracker

Status column uses: `PROVISIONAL — PENDING APPROVAL` (decisions) / `OPEN` (questions). All 27 items currently stand at 0 attributable approvals/resolutions.

| ID | Topic | Accountable owner | Co-approver | Current status | Required evidence | Next action | Blocks |
|---|---|---|---|---|---|---|---|
| D01 | Buyer return window (14 days from delivery) | Head of Operations / COO | — | PROVISIONAL — PENDING APPROVAL | Approval: name/role/date/rationale/evidence | Meeting 1 | Phase 1 entry |
| D02 | Merchant response SLA (72h elapsed) | Head of Merchant Partnerships | — | PROVISIONAL — PENDING APPROVAL | Approval incl. OQ-02 anchor | Meeting 1 | Phase 1 entry |
| D03 | Timeout → escalation, no auto-action | Head of Operations / COO | — | PROVISIONAL — PENDING APPROVAL | Approval of escalation path | Meeting 1 | Phase 1 entry |
| D04 | Commission reversal — merchant responsibility | Finance Lead / CFO | — | PROVISIONAL — PENDING APPROVAL | Approval + OQ-04 resolution | Meeting 2 | Phase 1 entry |
| D05 | Commission retention — buyer remorse | Finance Lead / CFO | — | PROVISIONAL — PENDING APPROVAL | Approval | Meeting 2 | Phase 1 entry |
| D06 | Commission reversal — platform responsibility | Finance Lead / CFO | — | PROVISIONAL — PENDING APPROVAL | Approval + OQ-04 | Meeting 2 | Phase 1 entry |
| D07 | Commission reversal — carrier damage | Finance Lead / CFO | — | PROVISIONAL — PENDING APPROVAL | Approval + OQ-04 | Meeting 2 | Phase 1 entry |
| D08 | Delivery fee — full sub-order return | Finance Lead | Head of Operations | PROVISIONAL — PENDING APPROVAL | Approval | Meeting 2 | Phase 1 entry |
| D09 | Delivery-fee exception (partials, dual approval) | Finance Lead | Head of Operations | PROVISIONAL — PENDING APPROVAL | Approval of workflow | Meetings 2+3 | Phase 1 entry |
| D10 | Delivery fee — carrier damage | Finance Lead | Head of Operations | PROVISIONAL — PENDING APPROVAL | Approval + OQ-11 | Meeting 2 | Phase 1 entry |
| D11 | Admin review target (3 business days) | Head of Operations / COO | — | PROVISIONAL — PENDING APPROVAL | Approval + OQ-01 calendar | Meeting 1 | Phase 1 entry |
| D12 | Settlement adjustment authorization | Financial Controller | — | PROVISIONAL — PENDING APPROVAL | Approval of workflow + FX stance | Meeting 2 | Phase 1 entry; D12 before WP-2D |
| D13 | Voucher outcomes | Finance Lead | Risk Lead | PROVISIONAL — PENDING APPROVAL | Approval of outcome set | Meetings 2+3 | Phase 1 entry; D13 before WP-2G |
| D14 | Deployment target (Docker Compose, single VPS) | CTO / Head of Engineering | — | PROVISIONAL — PENDING APPROVAL | Infrastructure spec confirmation | Meeting 4 | Phase 1 entry; pilot readiness |
| D15 | Pilot operational controls (4 controls) | CTO / Head of Engineering | SRE Lead | PROVISIONAL — PENDING APPROVAL | Control approval + kill-switch test commitment | Meeting 4 | Phase 1 entry; pilot readiness |
| OQ-01 | Business calendar definition | Head of Operations / COO | — | OPEN | Written calendar spec (days/hours/timezone/holidays/owner) | Meeting 1 | Phase 1 entry; D11 |
| OQ-02 | SLA trigger timestamps | Head of Operations / COO | — | OPEN | Written anchor decision + reset/backfill stance | Meeting 1 | Phase 1 entry; D02, D11 |
| OQ-03 | Return eligibility edge cases | Head of Operations / COO | CX | OPEN | Edge-case policy per case | Meeting 1 (may defer to WP-2B) | WP-2B refinement — not Phase 1 |
| OQ-04 | Commission allocation + rounding | Finance Lead / CFO **and** CTO / Head of Engineering (two separate sign-offs) | — | OPEN | Finance template (Meeting 2) **and** Engineering template (Meeting 4), both attributable | Meetings 2 then 4 | Phase 1 entry; D04–D07; WP-2D |
| OQ-05 | Delivery-fee allocation for exceptions | Finance Lead (co: Ops) | — | OPEN | Full-vs-proportional approval | Meeting 2 (may defer to WP-3G) | WP-3G — not Phase 1 |
| OQ-06 | Delivery-fee exception audit requirements | Finance Lead (co: Risk) | — | OPEN | Approver/reason-codes/audit spec | Meeting 3 | WP-3G — not Phase 1 |
| OQ-07 | Settlement authorization details | Financial Controller | — | OPEN | Authorization levels + thresholds + review cycle | Meeting 2 | WP-3G — not Phase 1 |
| OQ-08 | Voucher permitted outcomes | Finance Lead (co: Risk) | — | OPEN | Outcome set + consequences | Meeting 3 | WP-3G — not Phase 1 |
| OQ-09 | Named pilot operational owners | CTO / SRE | — | OPEN | Named individuals + recipients + rollback authority | Meeting 4 | Pilot gate — not Phase 1 |
| OQ-10 | Pilot scope and criteria | CTO / Head of Engineering (co: Ops) | — | OPEN | Environment/scope/start/success/exit criteria | Meeting 4 | Pilot gate — not Phase 1 |
| OQ-11 | Carrier-damage materiality threshold | Finance Lead (co: Ops) | — | OPEN | Threshold + configurability | Meeting 2 (may defer to WP-3G) | WP-3G — not Phase 1 |
| OQ-12 | Carrier recovery process | Head of Operations / COO | — | OPEN — NOT APPLICABLE to P13 | None required for P13 | Track for P14+ | Nothing in P13 |
| G-09/G-10 | Gate status discrepancy (Markdown cites G-01–G-08; xlsx tracks G-01–G-10) | Project owner | — | OPEN (flagged, unresolved) | Project-owner written confirmation | Request via approval pack Part 5 | Release-criteria interpretation |

## 4. Proposed tracker updates (documented separately — NOT applied)

The xlsx register is modified only by the register maintainer, only when attributable evidence exists. For each item, the fields to update upon approval are: `Approval Status` → APPROVED / REJECTED / APPROVED WITH CONDITIONS; `Approver Name`, `Approver Role`, `Approval Date`, `Rationale`, `Conditions`, `Evidence Reference`. For OQ-04 specifically, **two** evidence records are required (Finance template from Meeting 2 + Engineering template from Meeting 4) before the OQ-04 row may move to resolved. Until then every row stays exactly as it is now.

## 5. Meeting plan (preserves the five-meeting structure of `P13-PHASE-0-APPROVAL-AGENDA-v2.md`)

No meetings have been scheduled or held. No names, dates, or outcomes exist. The agenda document remains the authoritative meeting specification; this section restates it for tracking purposes only.

| # | Meeting | Attendees (roles) | Decisions / questions on agenda | Intended outcome |
|---|---|---|---|---|
| 1 | Operations & Merchant Partnerships (90 min) | Head of Ops/COO, Head of Merchant Partnerships, CX lead | D01, D02, D03, D11; OQ-01, OQ-02, OQ-03 | Approve/modify the return window, SLA, escalation policy, admin target; resolve calendar + clock anchors; record eligibility edge cases |
| 2 | Finance & Accounting — **PRIORITY 1** (120 min) | Finance Lead/CFO, Financial Controller | D04–D10, D12, D13; **OQ-04 (Finance part, ≥30 min)**, OQ-05, OQ-06, OQ-07, OQ-08, OQ-11 | Approve commission policy per responsibility category; **choose rounding mechanism A/B/C + mixed-responsibility interpretation + tolerance + 4 accounting questions**; approve delivery-fee, settlement, voucher policies |
| 3 | Risk & Fraud (45 min) | Finance Lead (co: Risk), Risk/Fraud rep | D13, D09; OQ-06, OQ-08 | Define voucher outcomes + exception audit requirements |
| 4 | Engineering & Operations (90 min) | CTO / Head of Engineering, Platform Ops/SRE lead | D14, D15; OQ-09, OQ-10; **OQ-04 (Engineering sign-off)** | Select deployment target; accept 4 pilot controls + owners + scope; **sign off the implemented persistence/concurrency design (dedicated `commission_reversals` ledger, transaction-scoped cumulative read, idempotency, locking, epoch fencing) subject to Meeting 2 invariants** |
| 5 | Consolidation & Phase 0 Closure (30 min) | All approvers (or delegates), governance recorder | Verification of 1–4 outcomes | Verify 13/15 decisions (D01–D11, D14, D15) + OQ-01/OQ-02 + **both** OQ-04 templates are attributable; verify D12/D13 status; declare Phase 0 closed or record gaps with follow-up dates |

**Sequence dependency (from agenda v2):** Meetings 1–4 may run in any order **except** that Meeting 4's OQ-04 Engineering sign-off requires Meeting 2's Finance policy decisions to be complete first. Meeting 5 requires all prior meetings complete. Scheduling priority: Meeting 2 → 1 → 4 → 3 → 5.

**Approval-recording checklist (per decision, from agenda v2):** ☐ approver full name ☐ role ☐ date ☐ decision (APPROVED / REJECTED / APPROVED WITH CONDITIONS) ☐ rationale ☐ conditions (if any) ☐ evidence reference (meeting minutes / email / signed document).

## 6. Evidence standards

- **Acceptable:** meeting minutes with named attendees and recorded decisions; signed document; dated email from the approver's accountable address; the completed templates in the approval pack.
- **Not acceptable:** verbal consent without a record; recommendations (including the approval pack's own); passing tests or CI; absence of objection; engineering or agent assertions that a policy "is already how the code works".

## 7. Attestation

No register (Markdown or xlsx) was modified in this phase. No meeting was scheduled, held, or minuted. No name, date, outcome, or approval was invented. All statuses reflect repository evidence at HEAD `c01267c`.
