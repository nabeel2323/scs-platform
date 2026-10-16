# P13 Phase 4.1.10 — Business Approval Register

**Phase:** 4.1.10 | **Date:** 2026-10-15 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Status

All 15 decisions: PROVISIONAL — PENDING APPROVAL. Zero have attributable approval evidence.
All 12 open questions: OPEN. Zero have attributable resolution evidence.

Source: P13-PHASE-4.1.9-EXTERNAL-DEPENDENCIES-AND-DECISIONS.md, P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md.

---

## 2. Decision Register

### Returns Policy

| ID | Topic | Provisional Position | Approver | Blocks Release | Status |
|----|-------|---------------------|----------|---------------|--------|
| D01 | Return window | 14 days from delivery | Head of Operations / COO | YES | PROVISIONAL |
| D02 | Merchant response SLA | 72 hours | Head of Merchant Partnerships | YES | PROVISIONAL |
| D03 | Timeout -> escalation | Escalate to admin; no auto-approve/reject/expire | Head of Operations / COO | YES | PROVISIONAL |
| D08 | Delivery fee (full sub-order) | Full-sub-order refund only | Finance Lead (co: Ops) | YES | PROVISIONAL |
| D09 | Delivery-fee exception | Admin-authorized for partials | Finance Lead (co: Ops) | YES | PROVISIONAL |
| D10 | Carrier-damage delivery fee | Refund + pursue carrier | Finance Lead (co: Ops) | YES | PROVISIONAL |
| D11 | Admin review target | 3 business days (calendar TBD) | Head of Operations / COO | YES | PROVISIONAL |

### Commission Reversal

| ID | Topic | Provisional Position | Approver | Blocks Release | Status |
|----|-------|---------------------|----------|---------------|--------|
| D04 | Merchant-responsibility | Reverse on net goods | Finance Lead / CFO | YES | PROVISIONAL |
| D05 | Buyer-remorse | Retain commission | Finance Lead / CFO | YES | PROVISIONAL |
| D06 | Platform-responsibility | Reverse on net goods | Finance Lead / CFO | YES | PROVISIONAL |
| D07 | Carrier-damage | Reverse on net goods | Finance Lead / CFO | YES | PROVISIONAL |

### Financial Governance

| ID | Topic | Provisional Position | Approver | Blocks Release | Status |
|----|-------|---------------------|----------|---------------|--------|
| D12 | Settlement adjustment auth | Manual Finance/admin; no auto clawback | Financial Controller | YES | PROVISIONAL |
| D13 | Voucher outcomes | Admin review for every voucher return | Finance Lead (co: Risk) | YES | PROVISIONAL |

### Operational

| ID | Topic | Provisional Position | Approver | Blocks Release | Status |
|----|-------|---------------------|----------|---------------|--------|
| D14 | Deployment target | Docker Compose single VPS | CTO / Head of Engineering | YES | PROVISIONAL |
| D15 | Pilot controls | Four controls, one worker instance | CTO / Head of Engineering (co: SRE) | YES | PROVISIONAL |

---

## 3. Open Questions

| ID | Topic | Accountable | Blocking | Status |
|----|-------|-------------|----------|--------|
| OQ-01 | Business calendar | Head of Operations / COO | YES (D11) | OPEN |
| OQ-02 | SLA trigger timestamps | Head of Operations / COO | YES (D02, D11) | OPEN |
| OQ-03 | Return eligibility edges | Head of Operations / COO | No | OPEN |
| OQ-04 | Commission allocation + rounding | Finance Lead / CFO + Eng | YES (D04-D07) | OPEN |
| OQ-05 | Delivery-fee allocation | Finance Lead / CFO | No | OPEN |
| OQ-06 | Exception audit trail | Finance Lead (co: Risk) | No | OPEN |
| OQ-07 | Settlement auth workflow | Financial Controller | No | OPEN |
| OQ-08 | Voucher risk/fraud | Risk / Fraud Lead | No | OPEN |
| OQ-09 | Pilot owners | CTO / SRE | No | OPEN |
| OQ-10 | Pilot scope | CTO / Head of Engineering | No | OPEN |
| OQ-11 | Materiality definition | Finance Lead (co: Ops) | No | OPEN |
| OQ-12 | Dispute workflow | Head of Operations / COO | No | OPEN |

---

## 4. Confirmation

No approvals were invented. No provisional positions were converted to approved policy. All decisions require explicit attributable sign-off before release or pilot activation.
