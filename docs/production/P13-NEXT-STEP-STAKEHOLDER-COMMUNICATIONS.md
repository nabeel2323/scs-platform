# P13 Next Step — Stakeholder Communication Kit

**Purpose:** ready-to-send meeting invitations, an onboarding message for the alert receiver owner, an approval evidence intake checklist, and a post-meeting status template. All materials are documentation only — no meetings have been scheduled, no stakeholders contacted, no approvals recorded.
**Baseline:** branch `develop`, HEAD `c01267cfd9be8cac72edb9333f7c7f036647fc1a`. Created 2026-10-16.
**Companion documents:**
- `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — decision sheets for each meeting
- `P13-NEXT-STEP-DECISION-TRACKER.md` — master tracker and meeting plan
- `P13-NEXT-STEP-RECEIVER-ONBOARDING.md` — receiver integration contract and verification matrix
- `P13-NEXT-STEP-FINAL-REPORT.md` — phase summary and verification

**Status:** 0/15 decisions approved · 12/12 questions open · receiver 0/14 verified.

> **Important:** Every recommendation in the approval pack is marked **NOT APPROVED**. Recommendations carry no decision authority. The business may accept, modify, or reject each one. A decision is only made when the approval record is completed with attributable evidence and recorded in the canonical register.

---

## Table of Contents

1. [Meeting Invitation 1 — Operations and Merchant Partnerships](#meeting-invitation-1--operations-and-merchant-partnerships)
2. [Meeting Invitation 2 — Finance and Accounting (Priority 1)](#meeting-invitation-2--finance-and-accounting-priority-1)
3. [Meeting Invitation 3 — Risk and Fraud](#meeting-invitation-3--risk-and-fraud)
4. [Meeting Invitation 4 — Engineering and SRE](#meeting-invitation-4--engineering-and-sre)
5. [Meeting Invitation 5 — Final Consolidation and Gate Review](#meeting-invitation-5--final-consolidation-and-gate-review)
6. [Receiver Owner Onboarding Message](#receiver-owner-onboarding-message)
7. [Approval Evidence Intake Checklist](#approval-evidence-intake-checklist)
8. [Post-Meeting Status Template](#post-meeting-status-template)

---

## Meeting Invitation 1 — Operations and Merchant Partnerships

**Subject:** P13 Phase 0 — Operations and Merchant Partnerships Decision Meeting

**Meeting objective:** Resolve the business calendar definition (OQ-01), SLA trigger timestamps (OQ-02), and obtain attributable approvals for D01 (buyer return window), D02 (merchant response SLA), D03 (timeout-to-escalation policy), and D11 (administrator review target). Record return eligibility edge cases (OQ-03).

**Scheduling priority:** 2 (after Finance).

**Proposed agenda:**

| # | Item | Duration | Decision / question | Approver role |
|---|---|---|---|---|
| 1 | Business calendar definition (OQ-01) | 25 min | Days, hours, timezone (UTC vs named IANA), holiday source and maintainer, change-management owner | Head of Operations / COO |
| 2 | SLA trigger timestamps (OQ-02) | 15 min | Merchant clock anchor (return-request creation) and admin clock anchor (ESCALATED event); confirm no resets, no backfill | Head of Operations / COO |
| 3 | Buyer return window (D01) | 10 min | Approve 14 days from delivery as implemented | Head of Operations / COO |
| 4 | Merchant response SLA (D02) | 10 min | Approve 72 elapsed hours as implemented | Head of Merchant Partnerships |
| 5 | Timeout → escalation, no auto-action (D03) | 10 min | Approve escalation-only path | Head of Operations / COO |
| 6 | Administrator review target (D11) | 10 min | Approve 3 business days per OQ-01 calendar | Head of Operations / COO |
| 7 | Return eligibility edge cases (OQ-03) | 10 min | Cancelled orders, partial delivery, non-delivery, carrier-damaged delivery | Head of Operations / COO |

**Required attendees (roles):**
- Head of Operations / COO (decision authority for OQ-01, OQ-02, D01, D03, D11, OQ-03)
- Head of Merchant Partnerships (decision authority for D02)
- CX Lead (co-advisor for OQ-03)

**Required pre-reading:**
1. `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — Part 1 (OQ-01, OQ-02) and Part 2 (D01, D02, D03, D11) and Part 4 (OQ-03 compact sheet)
2. `P13-NEXT-STEP-DECISION-TRACKER.md` — §3 (master tracker) and §5 (meeting plan)

**Decisions and evidence expected:**
- OQ-01: written calendar specification (days, hours, timezone, holiday source, maintainer, change-management owner)
- OQ-02: written anchor decision + reset/backfill stance
- D01, D02, D03, D11: completed approval record tables (approver name, role, date, decision, rationale, conditions, evidence reference)
- OQ-03: edge-case policy per case

**Explicit statement:** The recommendations in the approval pack are suggestions based on implemented behavior. They are **not** approvals and carry no decision authority. The business may accept, modify, or reject each recommendation. A decision is only recorded when the approval record table is completed with attributable evidence.

**Scheduling placeholder (to be filled by the project owner):**

| Field | Value |
|---|---|
| Date | |
| Time | |
| Duration | 90 minutes |
| Attendees (names) | |
| Meeting link / room | |

---

## Meeting Invitation 2 — Finance and Accounting (Priority 1)

**Subject:** P13 Phase 0 — Finance and Accounting Decision Meeting ⚠️ PRIORITY 1

**Meeting objective:** Resolve OQ-04 Finance sign-off (commission allocation algorithm, mixed-responsibility interpretation, rounding tolerance, and four accounting questions), and obtain attributable approvals for D04–D10, D12, and D13. This meeting is scheduling priority 1 because Meeting 4's OQ-04 Engineering sign-off depends on its outcomes.

**Scheduling priority:** 1 (highest).

**Proposed agenda:**

| # | Item | Duration | Decision / question | Approver role |
|---|---|---|---|---|
| 1 | **OQ-04 Finance sign-off** — algorithm selection (A/B/C) | 15 min | Choose rounding mechanism; understand Option A prevents over-reversal but may leave cumulative shortfall | Finance Lead / CFO |
| 2 | **OQ-04 Finance sign-off** — mixed-responsibility denominator | 10 min | Interpretation 1 (total order net goods — currently implemented) vs Interpretation 2 (eligible net goods only) — materially different outcomes | Finance Lead / CFO |
| 3 | **OQ-04 Finance sign-off** — rounding tolerance | 5 min | Exact (requires B or C) vs ±1 minor unit acceptable | Finance Lead / CFO |
| 4 | **OQ-04 Finance sign-off** — four accounting questions | 10 min | Negative reversal policy; historical backfill stance; reclassification timing; rounding tolerance confirmation | Finance Lead / CFO |
| 5 | Commission reversal — merchant responsibility (D04) | 5 min | Approve reversal on merchant-responsible returns | Finance Lead / CFO |
| 6 | Commission retention — buyer remorse (D05) | 5 min | Approve retention on buyer-remorse returns | Finance Lead / CFO |
| 7 | Commission reversal — platform responsibility (D06) | 5 min | Approve reversal on platform-responsible returns | Finance Lead / CFO |
| 8 | Commission reversal — carrier damage (D07) | 5 min | Approve reversal on carrier-damage returns | Finance Lead / CFO |
| 9 | Delivery fee — full sub-order return (D08) | 5 min | Approve full-refund-on-full-return | Finance Lead (co: Head of Operations) |
| 10 | Delivery-fee exception — partial returns (D09) | 5 min | Approve dual-approval exception workflow | Finance Lead (co: Head of Operations) |
| 11 | Delivery fee — carrier damage (D10) | 5 min | Approve refund-buyer + separate recovery | Finance Lead (co: Head of Operations) |
| 12 | Settlement adjustment authorization (D12) | 10 min | Approve FX-BLOCKED + always-dual-approval workflow; or designate FX source | Financial Controller |
| 13 | Voucher outcomes (D13) | 5 min | Approve implemented outcome set | Finance Lead (co: Risk Lead) |
| 14 | Remaining OQs (OQ-05, OQ-06, OQ-07, OQ-08, OQ-11) | 10 min | Delivery-fee allocation, audit requirements, settlement levels, voucher outcomes, carrier-damage materiality | Finance Lead |

**Required attendees (roles):**
- Finance Lead / CFO (decision authority for D04–D10, D13, OQ-04 Finance, OQ-05, OQ-06, OQ-08, OQ-11)
- Financial Controller (decision authority for D12, OQ-07)

**Required pre-reading:**
1. `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — Part 1 (OQ-04 full sheet with algorithm comparison, denominator question, and four accounting questions) and Part 2 (D04–D13) and Part 4 (OQ-05, OQ-06, OQ-07, OQ-08, OQ-11 compact sheets)
2. `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` — the authoritative technical analysis of Options A, B, C
3. `P13-NEXT-STEP-DECISION-TRACKER.md` — §3 (master tracker, OQ-04 row)

**Decisions and evidence expected:**
- OQ-04 Finance: completed Finance sign-off template (allocation method, rounding mechanism A/B/C, mixed-responsibility interpretation, rounding tolerance, accounting Q2–Q4, rationale, conditions, date, evidence reference)
- D04–D10, D12, D13: completed approval record tables
- OQ-05, OQ-06, OQ-07, OQ-08, OQ-11: completed approval record tables (may defer to WP-3G)

**Explicit statement:** The recommendations in the approval pack are suggestions based on implemented behavior. They are **not** approvals and carry no decision authority. The business may accept, modify, or reject each recommendation. A decision is only recorded when the approval record table is completed with attributable evidence.

**Critical dependency:** The OQ-04 Finance decisions made in this meeting are a prerequisite for Meeting 4's OQ-04 Engineering sign-off. If Finance selects Option B or C, an implementation change is required in a separately authorized follow-up phase — approval of B/C does not retroactively change the running code.

**Scheduling placeholder (to be filled by the project owner):**

| Field | Value |
|---|---|
| Date | |
| Time | |
| Duration | 120 minutes |
| Attendees (names) | |
| Meeting link / room | |

---

## Meeting Invitation 3 — Risk and Fraud

**Subject:** P13 Phase 0 — Risk and Fraud Decision Meeting

**Meeting objective:** Resolve D13 (voucher permitted outcomes) with risk perspective, D09 (delivery-fee exception audit requirements), and address OQ-06 (audit trail specification) and OQ-08 (voucher outcomes and consequences).

**Scheduling priority:** 4.

**Proposed agenda:**

| # | Item | Duration | Decision / question | Approver role |
|---|---|---|---|---|
| 1 | Voucher permitted outcomes (D13) | 15 min | Approve outcome set: cash refund / store credit (no commission reversal on credit) / reject; confirm no voucher reissue as cash substitute | Finance Lead (co: Risk Lead) |
| 2 | Delivery-fee exception audit requirements (OQ-06) | 15 min | Approve approver role (`admin:returns:write`), reason codes (`MERCHANT_FAULT`/`PLATFORM_FAULT`/`CARRIER_DAMAGE`/`GOODWILL`), audit event trail (`DELIVERY_FEE_EXCEPTION_APPROVED`) | Finance Lead (co: Risk Lead) |
| 3 | Voucher outcomes detail (OQ-08) | 10 min | Confirm outcome set + consequences; fraud implications of each | Finance Lead (co: Risk Lead) |
| 4 | Delivery-fee exception workflow (D09) | 5 min | Confirm dual-approval requirement (two distinct approvers, one Finance + one admin; creator cannot self-approve) | Finance Lead (co: Head of Operations) |

**Required attendees (roles):**
- Finance Lead (decision authority for D13, OQ-06, OQ-08, D09)
- Risk / Fraud Representative (co-advisor for D13, OQ-06, OQ-08)

**Required pre-reading:**
1. `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — Part 2 (D09, D13) and Part 4 (OQ-06, OQ-08 compact sheets)
2. `P13-NEXT-STEP-DECISION-TRACKER.md` — §3 (master tracker)

**Decisions and evidence expected:**
- D13: completed approval record table (Finance Lead + Risk Lead)
- D09: completed approval record table (Finance Lead + Head of Operations)
- OQ-06: completed approval record table (approver/reason-codes/audit spec)
- OQ-08: completed approval record table (outcome set + consequences)

**Explicit statement:** The recommendations in the approval pack are suggestions based on implemented behavior. They are **not** approvals and carry no decision authority. The business may accept, modify, or reject each recommendation. A decision is only recorded when the approval record table is completed with attributable evidence.

**Scheduling placeholder (to be filled by the project owner):**

| Field | Value |
|---|---|
| Date | |
| Time | |
| Duration | 45 minutes |
| Attendees (names) | |
| Meeting link / room | |

---

## Meeting Invitation 4 — Engineering and SRE

**Subject:** P13 Phase 0 — Engineering and SRE Decision Meeting

**Meeting objective:** Resolve D14 (deployment target), D15 (pilot operational controls), OQ-09 (named pilot operational owners), OQ-10 (pilot scope and criteria), and — critically — obtain the OQ-04 Engineering sign-off on the implemented persistence and concurrency design.

**Scheduling priority:** 3. **Dependency:** OQ-04 Engineering sign-off requires Meeting 2 (Finance) to be complete first.

**Proposed agenda:**

| # | Item | Duration | Decision / question | Approver role |
|---|---|---|---|---|
| 1 | Deployment target (D14) | 10 min | Confirm single-VPS Docker Compose for the pilot horizon | CTO / Head of Engineering |
| 2 | Pilot operational controls (D15) | 15 min | Approve the four controls (3 consecutive poll failures alert; overdue REQUESTED >10 min alert; zero/multiple worker instances alert; heartbeat absent >5 min alert); confirm kill-switch and single-worker-instance constraint | CTO / Head of Engineering (co: SRE Lead) |
| 3 | Named pilot operational owners (OQ-09) | 10 min | Name individuals: SRE on-call, Platform Ops lead, CTO rollback authority; alert recipients | CTO / SRE Lead |
| 4 | Pilot scope and criteria (OQ-10) | 15 min | Define environment, scope, start criteria, success criteria (zero financial discrepancies, zero data loss, SLA >95%, no P1/P2), exit criteria | CTO / Head of Engineering (co: Head of Operations) |
| 5 | **OQ-04 Engineering sign-off** | 25 min | Sign off the **actual implemented** persistence/concurrency design: dedicated `commission_reversals` ledger (the technical decision doc's Option 2, not its provisional "recommended" Option 1); transaction-scoped cumulative read; per-reversal idempotency key; `FOR UPDATE SKIP LOCKED` claim + lease epoch fencing; reconciliation `EXCESSIVE_REVERSAL` detection. Confirm Finance invariants from Meeting 2 are preserved | CTO / Head of Engineering |

**Required attendees (roles):**
- CTO / Head of Engineering (decision authority for D14, D15, OQ-09, OQ-10, OQ-04 Engineering)
- SRE Lead / Platform Ops Lead (co-approver for D15; advisor for OQ-09, OQ-10)

**Required pre-reading:**
1. `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — Part 1 (OQ-04 Engineering sign-off template with actual implemented design table) and Part 3 (D14, D15) and Part 4 (OQ-09, OQ-10 compact sheets)
2. `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` — §5.1 (persistence options — note the implemented design is Option 2, not the provisionally "recommended" Option 1)
3. `P13-NEXT-STEP-DECISION-TRACKER.md` — §3 (master tracker, OQ-04 row)
4. Meeting 2 (Finance) outcomes — the OQ-04 Finance decisions must be available before this meeting

**Decisions and evidence expected:**
- D14: completed approval record table
- D15: completed approval record table (CTO + SRE Lead)
- OQ-09: completed approval record table (named individuals)
- OQ-10: completed approval record table (environment/scope/criteria)
- OQ-04 Engineering: completed Engineering sign-off template (implemented design accepted/not accepted, Finance invariants preserved, required tests acknowledged, rationale, conditions, date, evidence reference)

**Explicit statement:** The recommendations in the approval pack are suggestions based on implemented behavior. They are **not** approvals and carry no decision authority. The business may accept, modify, or reject each recommendation. A decision is only recorded when the approval record table is completed with attributable evidence.

**Critical note on OQ-04:** The Engineering sign-off validates the **actual implemented** design, which differs from the technical decision document's provisional "recommended" persistence option. The document recommended a `refunds` column (Option 1); the implementation uses a dedicated `commission_reversals` ledger (Option 2). The sign-off must explicitly acknowledge this difference.

**Scheduling placeholder (to be filled by the project owner):**

| Field | Value |
|---|---|
| Date | |
| Time | |
| Duration | 90 minutes |
| Attendees (names) | |
| Meeting link / room | |
| **Prerequisite** | Meeting 2 (Finance) must be complete before this meeting |

---

## Meeting Invitation 5 — Final Consolidation and Gate Review

**Subject:** P13 Phase 0 — Final Consolidation and Gate Review

**Meeting objective:** Verify that all decisions from Meetings 1–4 are attributable and recorded in the canonical register. Declare Phase 0 closed or record gaps with follow-up dates. Address the G-09/G-10 gate status discrepancy.

**Scheduling priority:** 5 (last — requires all prior meetings complete).

**Proposed agenda:**

| # | Item | Duration | Check |
|---|---|---|---|
| 1 | Verify D01–D11 approvals | 10 min | All 11 decisions have attributable approval records in the canonical xlsx register |
| 2 | Verify OQ-01 and OQ-02 resolutions | 5 min | Written calendar spec and anchor decisions recorded |
| 3 | Verify OQ-04 — both sign-offs present | 10 min | Finance template (Meeting 2) **and** Engineering template (Meeting 4) both recorded with attributable evidence |
| 4 | Verify D12 and D13 status | 5 min | Approval records present or gaps documented with follow-up dates |
| 5 | Verify D14 and D15 approvals | 5 min | Infrastructure spec and pilot controls approved |
| 6 | G-09/G-10 gate status | 5 min | Project owner provides authoritative status relative to G-01–G-08 |
| 7 | Phase 0 closure declaration | 5 min | All gates satisfied → declare closed; otherwise record gaps with owners and dates |

**Required attendees (roles):**
- All approvers from Meetings 1–4 (or their delegates)
- Governance / register maintainer (records final verification)
- Project owner (for G-09/G-10 question)

**Required pre-reading:**
1. `P13-NEXT-STEP-DECISION-TRACKER.md` — §3 (master tracker, verify all rows)
2. Completed approval record tables from Meetings 1–4
3. `P13-NEXT-STEP-STAKEHOLDER-APPROVAL-PACK.md` — Part 5 (G-09/G-10 question)

**Decisions and evidence expected:**
- Verification that 13/15 decisions (D01–D11, D14, D15) have attributable approvals
- Verification that OQ-01, OQ-02, and both OQ-04 templates are attributable
- D12/D13 status confirmed or gaps documented
- G-09/G-10: project owner written response
- Phase 0 closure declaration (or gap list with follow-up dates)

**Explicit statement:** This meeting does not make new decisions. It verifies that decisions from Meetings 1–4 are properly recorded with attributable evidence in the canonical register.

**Scheduling placeholder (to be filled by the project owner):**

| Field | Value |
|---|---|
| Date | |
| Time | |
| Duration | 30 minutes |
| Attendees (names) | |
| Meeting link / room | |
| **Prerequisite** | Meetings 1–4 must all be complete |

---

## Receiver Owner Onboarding Message

**Subject:** P13 Alert Receiver Onboarding — Protocol v2 Contract and Verification Requirements

---

Dear Receiver Owner,

You are being designated as the owner of the production alert receiver for the SCS Platform's P13 operational-alert system. This message explains what you need to implement and verify before production alert delivery can be authorized.

### Current status

Receiver verification is **0 out of 14**. Every checklist item is UNVERIFIED. No production receiver implementation exists. No production receiver URL or shared secret has been provisioned.

### What you need to implement

The sender (SCS API operations alert service) delivers alerts via HTTP POST with the following contract:

**Protocol v2 summary:**
- **Signature:** HMAC-SHA256 over the exact UTF-8 bytes of `${timestamp}.${rawBody}` (Unix-seconds timestamp string, a literal dot, then the exact raw request body bytes as sent — before JSON parsing).
- **Headers:** `X-SCS-Alert-Signature: sha256=<lowercase-hex>` and `X-SCS-Alert-Timestamp: <unix-seconds>`.
- **Freshness:** Default 300-second (5-minute) replay window. Receivers must reject deliveries whose timestamp age exceeds the agreed window.
- **Deduplication:** Persistent, atomic record of processed alert IDs (UUIDs). Must survive restarts. Concurrent duplicates (same ID arriving simultaneously) must result in exactly one processing.
- **Payload:** JSON containing a unique alert ID plus condition metadata.

**Expected behavior:**

| Scenario | Your receiver must |
|---|---|
| Valid delivery (correct signature + fresh + new ID) | Return 2xx, process once |
| Invalid signature | Return 401/403, do not process |
| Tampered body | Return 401/403, do not process |
| Stale timestamp | Return 401/403, do not process |
| Duplicate ID (already processed) | Return 200, no reprocessing |
| Concurrent duplicates | Return 200 for both, exactly one processing |
| Receiver error | Return 5xx; do not partially commit state |

### What you need to verify — the 14-point checklist

You must verify all 14 items against a **disposable test endpoint** (e.g., an ephemeral local HTTP server under your control). You may not test against any production endpoint. The 14 items are:

1. HMAC-SHA256 of exact UTF-8 `${timestamp}.${rawBody}` — recompute and assert match; assert mismatch with one byte changed
2. Constant-time comparison — demonstrate `timingSafeEqual` or equivalent in the verify path
3. Timestamp freshness enforcement — reject aged timestamps; accept fresh ones
4. Persistent atomic dedup by alert ID — survive restarts; show uniqueness mechanism
5. Concurrent duplicate safety — exactly one processing for simultaneous same-ID requests
6. Valid delivery accepted
7. Tampered body rejected
8. Invalid signature rejected
9. Stale timestamp rejected
10. Duplicate + concurrent duplicate handling
11. Receiver error behavior — sender treats 5xx as retryable
12. Sender retry with same alert ID — receiver deduplicates
13. End-to-end evidence with real signed payloads
14. Receiver-owner sign-off — you review items 1–13 and sign the contract

### Testing constraints

- **Disposable endpoints only.** All testing uses ephemeral test endpoints under your control. No production endpoint may be probed, contacted, or pre-provisioned.
- **No secret in evidence.** Evidence artifacts must contain signatures and bodies but never the shared secret. Redact any header that echoes the secret.
- **Attributable evidence.** Each item's evidence must include date, executor, and environment.

### Your sign-off

After completing all 14 items, you will sign the receiver-owner attestation:

| Field | Value |
|---|---|
| Receiver owner name | |
| Role / team | |
| Receiver implementation (repo/system) | |
| Contract version verified | v2 (HMAC-SHA256 over `${timestamp}.${rawBody}`; headers `X-SCS-Alert-Signature`, `X-SCS-Alert-Timestamp`; 300 s default freshness) |
| Checklist items verified | ☐ 1–3 ☐ 4–5 ☐ 6–10 ☐ 11–12 ☐ 13 |
| Evidence location | |
| Conditions (if any) | |
| Date | |

### After sign-off

Configuring a real webhook URL and shared secret on any deployment is a **separately authorized change**. Until that authorization, the sender continues log-only operation (fail-closed: no URL configured; even if one were, delivery is refused without a ≥32-character secret).

### Reference documents

- `P13-NEXT-STEP-RECEIVER-ONBOARDING.md` — full integration contract, behavior matrix, test matrix (1:1 with the 14 checklist items), secret storage and rotation expectations
- `P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md` — the authoritative 14-item checklist

Please confirm receipt of this message and provide an estimated timeline for completing the verification matrix.

---

## Approval Evidence Intake Checklist

Use this checklist when recording attributable approvals in the canonical register (`P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`). Every decision record must include all seven fields. Incomplete records do not count as approvals.

### Standard decision record (D01–D11, D14, D15, OQ-01, OQ-02, OQ-03, OQ-05–OQ-11)

| Field | Required | Notes |
|---|---|---|
| **Approver name** | Yes | Full legal name of the accountable individual |
| **Role** | Yes | Organizational role (e.g., Head of Operations / COO, Finance Lead / CFO) |
| **Date** | Yes | Date the decision was made |
| **Decision** | Yes | One of: APPROVED, REJECTED, APPROVED WITH CONDITIONS |
| **Rationale** | Yes | Brief explanation of the reasoning |
| **Conditions** | If applicable | Explicit conditions for APPROVED WITH CONDITIONS; blank if unconditional |
| **Evidence reference** | Yes | Meeting minutes / signed document / dated email / completed template reference |

### OQ-04 — requires two separate sign-offs

OQ-04 is resolved **only** when both sign-offs are recorded with attributable evidence.

**Sign-off 1 — Finance (business policy):**

| Field | Required | Notes |
|---|---|---|
| Finance approver name | Yes | |
| Role | Yes | |
| Allocation method | Yes | Proportional net-goods ratio: APPROVED / REJECTED / MODIFIED |
| Rounding mechanism | Yes | Option A (current) / Option B / Option C |
| Mixed-responsibility interpretation | Yes | 1 — total order / 2 — eligible only |
| Rounding tolerance | Yes | Exact (⇒ B/C) / ±1 minor unit acceptable |
| Accounting Q2 (negative reversal) | Yes | Permitted / Separate audited adjustment |
| Accounting Q3 (historical backfill) | Yes | None — start at go-live / Approved backfill (scope) |
| Accounting Q4 (reclassification timing) | Yes | Return creation date / Reclassification date |
| Rationale / conditions | Yes | |
| Date | Yes | |
| Evidence reference | Yes | |

**Sign-off 2 — Engineering (persistence and concurrency, subject to Finance invariants):**

| Field | Required | Notes |
|---|---|---|
| Engineering approver name | Yes | |
| Role | Yes | |
| Implemented design as described | Yes | SIGNED OFF / NOT SIGNED OFF — required changes |
| Finance invariants preserved | Yes | YES / NO |
| Required tests acknowledged | Yes | YES / NO (concurrency, idempotency, reconciliation) |
| Rationale / conditions | Yes | |
| Date | Yes | |
| Evidence reference | Yes | |

### Acceptable evidence sources

- Meeting minutes with named attendees and recorded decisions
- Signed document
- Dated email from the approver's accountable address
- Completed templates from the approval pack

### Not acceptable as evidence

- Verbal consent without a record
- Recommendations (including the approval pack's own)
- Passing tests or CI runs
- Absence of objection
- Engineering or agent assertions that a policy "is already how the code works"

### Register update rules

1. The canonical xlsx register is modified **only** by the register maintainer.
2. The register is modified **only** when attributable evidence exists.
3. No canonical decision status changes unless actual attributable approval evidence is supplied **and** a separately authorized register update is requested.
4. OQ-04 requires both Finance and Engineering templates before the OQ-04 row may move to resolved.

---

## Post-Meeting Status Template

Use this template to update the project owner after each meeting. Copy and fill in the fields.

---

**Subject:** P13 Meeting [N] Status Update — [Meeting Name] — [Date]

**Meeting held:** [Date] | [Duration] | [Attendees present]

**Decisions recorded:**

| ID | Topic | Decision | Approver | Conditions | Evidence reference |
|---|---|---|---|---|---|
| | | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS | | | |

**Questions resolved:**

| ID | Question | Resolution | Evidence reference |
|---|---|---|---|
| | | | |

**Items deferred or gaps identified:**

| ID | Topic | Reason for deferral | Owner | Follow-up date |
|---|---|---|---|---|
| | | | | |

**Running totals:**

| Metric | Before this meeting | After this meeting |
|---|---|---|
| Decisions approved (D01–D15) | /15 | /15 |
| Questions resolved (OQ-01–OQ-12) | /12 | /12 |
| OQ-04 sign-offs (Finance + Engineering) | /2 | /2 |
| Receiver verification items | /14 | /14 |

**Next meeting scheduled:** [Meeting N+1] — [Date/time or "pending scheduling"]

**Blockers or escalations:** [None / describe]

**Register updated:** ☐ YES ☐ NO (if YES, evidence references recorded in xlsx)

---

**Important:** This status update does not change any canonical decision status. The canonical register (`P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`) is updated separately by the register maintainer when attributable evidence is confirmed. This template is a communication aid for the project owner.

---

## Attestation

This document contains no invented names, dates, decisions, meeting outcomes, or approvals. No meeting has been scheduled or held. No stakeholder has been contacted. No canonical decision status has been changed. No runtime code, database schema, financial logic, or production configuration has been modified. All statuses reflect repository evidence at HEAD `c01267c`.

**Final status:** `STAKEHOLDER COMMUNICATION KIT READY — HUMAN OUTREACH REQUIRED`
