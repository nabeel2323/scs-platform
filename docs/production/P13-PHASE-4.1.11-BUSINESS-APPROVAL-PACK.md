# P13 Phase 4.1.11 — Business Approval Pack

**Phase:** 4.1.11 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Status

All 15 decisions: **PROVISIONAL — PENDING APPROVAL.** Zero have attributable approval evidence.
All 12 open questions: **OPEN.** Zero have attributable resolution evidence.

No approvals were inferred from code. No provisional positions were converted to approved policy.

---

## 2. Decision Register

### Returns Policy

| ID | Topic | Provisional Policy | Accountable Approver | Co-Approver | Blocking | Evidence Required | Approval Field |
|----|-------|-------------------|---------------------|-------------|----------|-------------------|----------------|
| D01 | Return window | 14 days from delivery | Head of Operations / COO | — | YES | Policy wording, edge cases | ☐ APPROVED / ☐ REJECTED |
| D02 | Merchant response SLA | 72 hours | Head of Merchant Partnerships | — | YES | SLA definition, trigger timestamp | ☐ APPROVED / ☐ REJECTED |
| D03 | Timeout → escalation | Escalate to admin; no auto-approve/reject/expire | Head of Operations / COO | — | YES | FSM spec, escalation path | ☐ APPROVED / ☐ REJECTED |
| D08 | Delivery fee (full sub-order) | Full-sub-order refund only | Finance Lead | Head of Operations | YES | Refund calculation rule | ☐ APPROVED / ☐ REJECTED |
| D09 | Delivery-fee exception | Admin-authorized for partials | Finance Lead | Head of Operations | YES | Exception authorization workflow | ☐ APPROVED / ☐ REJECTED |
| D10 | Carrier-damage delivery fee | Refund buyer + pursue carrier | Finance Lead | Head of Operations | YES | Recovery process | ☐ APPROVED / ☐ REJECTED |
| D11 | Admin review target | 3 business days (calendar TBD) | Head of Operations / COO | — | YES | Calendar definition (OQ-01) | ☐ APPROVED / ☐ REJECTED |

### Commission Reversal

| ID | Topic | Provisional Policy | Accountable Approver | Co-Approver | Blocking | Evidence Required | Approval Field |
|----|-------|-------------------|---------------------|-------------|----------|-------------------|----------------|
| D04 | Merchant-responsibility | Reverse on net goods | Finance Lead / CFO | — | YES | Reversal calculation, rounding | ☐ APPROVED / ☐ REJECTED |
| D05 | Buyer-remorse | Retain commission | Finance Lead / CFO | — | YES | Retention rationale | ☐ APPROVED / ☐ REJECTED |
| D06 | Platform-responsibility | Reverse on net goods | Finance Lead / CFO | — | YES | Reversal calculation | ☐ APPROVED / ☐ REJECTED |
| D07 | Carrier-damage | Reverse on net goods | Finance Lead / CFO | — | YES | Recovery + reversal | ☐ APPROVED / ☐ REJECTED |

### Financial Governance

| ID | Topic | Provisional Policy | Accountable Approver | Co-Approver | Blocking | Evidence Required | Approval Field |
|----|-------|-------------------|---------------------|-------------|----------|-------------------|----------------|
| D12 | Settlement adjustment auth | Manual Finance/admin; no auto clawback | Financial Controller | — | YES | Authorization workflow | ☐ APPROVED / ☐ REJECTED |
| D13 | Voucher outcomes | Admin review for every voucher return | Finance Lead | Risk Lead | YES | Fraud/risk assessment | ☐ APPROVED / ☐ REJECTED |

### Operational

| ID | Topic | Provisional Policy | Accountable Approver | Co-Approver | Blocking | Evidence Required | Approval Field |
|----|-------|-------------------|---------------------|-------------|----------|-------------------|----------------|
| D14 | Deployment target | Docker Compose, single Linux VPS | CTO / Head of Engineering | — | YES | Infrastructure spec, VPS specs | ☐ APPROVED / ☐ REJECTED |
| D15 | Pilot controls | Four controls, one worker instance | CTO / Head of Engineering | SRE Lead | YES | Pilot scope, kill-switch test | ☐ APPROVED / ☐ REJECTED |

---

## 3. Open Questions

| ID | Topic | Accountable Owner | Blocking | Depends On | Required Resolution |
|----|-------|-------------------|----------|------------|---------------------|
| OQ-01 | Business calendar definition (weekdays, holidays, timezone) | Head of Operations / COO | YES | — | Calendar spec for D11 |
| OQ-02 | SLA trigger timestamps (delivery confirmed? order created?) | Head of Operations / COO | YES | D02, D11 | Exact trigger event definition |
| OQ-03 | Return eligibility edge cases (partial delivery, exchanges) | Head of Operations / COO | No | D01 | Edge-case policy |
| OQ-04 | Commission allocation + rounding (per-item? pro-rata? banker's rounding?) | Finance Lead / CFO + Engineering | YES | D04-D07 | Allocation algorithm, rounding rule |
| OQ-05 | Delivery-fee allocation across items | Finance Lead / CFO | No | D08-D10 | Allocation method |
| OQ-06 | Exception audit trail requirements | Finance Lead | No | D09 | Audit log spec |
| OQ-07 | Settlement authorization workflow details | Financial Controller | No | D12 | Dual-approval UX |
| OQ-08 | Voucher risk/fraud thresholds | Risk / Fraud Lead | No | D13 | Risk parameters |
| OQ-09 | Pilot owners (who operates during pilot) | CTO / SRE | No | D15 | Named individuals |
| OQ-10 | Pilot scope (which merchants, which products) | CTO / Head of Engineering | No | D15 | Scope definition |
| OQ-11 | Materiality definition (what $ threshold triggers manual review) | Finance Lead | No | — | Threshold value |
| OQ-12 | Dispute workflow (buyer escalation path) | Head of Operations / COO | No | — | Workflow spec |

---

## 4. Blocking Analysis

### Hard Blockers (must resolve before pilot)

| Blocker | Decisions | Open Questions |
|---------|-----------|----------------|
| Business calendar | D11 | OQ-01 |
| SLA trigger timestamps | D02, D11 | OQ-02 |
| Commission allocation + rounding | D04-D07 | OQ-04 |
| All 15 decisions need formal approval | D01-D15 | — |

### Soft Dependencies (should resolve, not strictly blocking)

| Dependency | Decisions | Open Questions |
|------------|-----------|----------------|
| Delivery-fee allocation | D08-D10 | OQ-05 |
| Voucher risk assessment | D13 | OQ-08 |
| Pilot scope and owners | D15 | OQ-09, OQ-10 |

---

## 5. Deployment Target

Docker Compose on a single Linux VPS remains **PROVISIONAL** (D14) until the designated engineering approver (CTO / Head of Engineering) confirms the infrastructure specification. No deployment has been executed.

---

## 6. Confirmation

- No decision has been approved. All remain PROVISIONAL.
- No open question has been resolved. All remain OPEN.
- No approver identity, date, or attributable evidence has been recorded.
- This pack does not authorize deployment, pilot activation, or policy enforcement.

---

## 7. Status

**PENDING** — 15 decisions PROVISIONAL, 12 OQs OPEN. 4 hard blockers identified (calendar, SLA triggers, commission rounding, formal approvals). Approval pack ready for stakeholder review.
