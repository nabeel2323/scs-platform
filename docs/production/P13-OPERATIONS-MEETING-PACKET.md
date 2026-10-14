# P13 — Operations Meeting Packet

**Version:** 1.0
**Date:** 2026-10-12
**Meeting:** Meeting 1 — Operations & Merchant Partnerships (per `P13-STAKEHOLDER-APPROVAL-EXECUTION-PACKAGE.md` §1.1)
**Duration:** 90 minutes (proposed) + extended segment for D08–D10 operational context
**Baseline:** branch `develop`, HEAD `8d60e36`, source worktree clean.
**Consolidated reassessment reference:** `P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md` v1.1 (D01 = 14 calendar days, C-NEW-01 resolved).
**Status:** MEETING PREPARATION — NO APPROVALS GRANTED. All decisions PROVISIONAL — PENDING APPROVAL.

---

## 1. Required Attendees

| Role | Authority | Required For |
|---|---|---|
| Head of Operations / COO | D01, D11, OQ-01, OQ-02, OQ-03 | Core agenda items (Operations-scope) |
| Head of Merchant Partnerships | **D02**, D03 | Merchant SLA and escalation (D02 formal approver) |
| Customer Experience Lead | OQ-03, OQ-11 | Eligibility edge cases, materiality |
| Governance Recorder | All items | Decision and OQ recording |

**Optional / Advisory:**

| Role | Advisory For |
|---|---|
| Finance Lead / CFO (or delegate) | D08–D10 operational context (formal approval in Meeting 2) |
| Platform Ops / SRE Lead | D11 business calendar technical feasibility |

---

## 2. Governance Note: D08–D10 Meeting Assignment

The [execution package](file:///c:/TAIF/scs-platform/docs/production/P13-STAKEHOLDER-APPROVAL-EXECUTION-PACKAGE.md) §1.1 assigns D08, D09, D10 to **Meeting 2 (Finance)** with approver role "Finance Lead (co: Head of Operations)." This packet includes D08–D10 as an **extended operational-context segment** to ensure Operations stakeholders understand the delivery-fee implications before Finance makes the formal determination.

**No formal approval of D08–D10 may be recorded in this meeting.** The governance recorder should capture Operations input as advisory context for the Meeting 2 decision record.

Similarly, OQ-11 (materiality) has accountable role "Finance Lead (co: Head of Operations)" — Operations input is advisory.

OQ-12 (carrier recovery) is explicitly out of P13 scope (P14+). It is included for situational awareness only.

---

## 3. Pre-Meeting Preparation

All attendees should review before the meeting:

1. `P13-POLICY-RECONCILIATION-v3.md` — corrected policy specification
2. `P13-PHASE-0-OPEN-DECISION-SHEETS.md` — OQ-01 through OQ-03, OQ-11, OQ-12
3. `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` — commission rounding analysis (for D08–D10 context)
4. `P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md` v1.1 — consolidated reassessment
5. `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` — Decision Register

---

## 4. Meeting Agenda

| Time | Item | Decisions | Open Questions | Segment |
|---|---|---|---|---|
| 0:00–0:10 | Review P13 scope, current status, and governance constraints | — | — | Opening |
| 0:10–0:25 | Buyer return window and eligibility edge cases | **D01** | **OQ-03** | Core |
| 0:25–0:45 | Merchant response SLA and timeout behavior | **D02**, **D03** | **OQ-02** | Core |
| 0:45–1:05 | Administrator escalation SLA and business calendar | **D11** | **OQ-01**, **OQ-02** | Core |
| 1:05–1:20 | Delivery-fee refunds, exceptions, carrier damage (operational context) | D08, D09, D10 (advisory) | **OQ-11** (advisory) | Extended |
| 1:20–1:25 | Dispute workflow awareness | — | OQ-12 (awareness) | Extended |
| 1:25–1:30 | Action items, approval recording verification, next steps | — | — | Closing |

---

## 5. Decision Sheets (D01, D02, D03, D11)

Each sheet below provides the provisional position, implementation implications, dependencies, and a blank recording template for the governance recorder.

### 5.1 D01 — Buyer Return Window

| Field | Value |
|---|---|
| **Decision ID** | D01 |
| Provisional position | **14 calendar days** from confirmed delivery (DELIVERED status timestamp) |
| Approver role | Head of Operations / COO |
| Meeting assignment | Meeting 1 |
| Dependencies | OQ-03 (eligibility edge cases) |
| Implementation impact | WP-1B (FSM design), WP-2B (FSM implementation) |
| Code baseline | `RETURN_WINDOW_DAYS = 14` in `returns.service.ts` line 40 (env-overridable) |
| Architecture lock | BD-P13-WINDOW-004 — "14 days (default, parameterized via RETURN_WINDOW_DAYS)" |
| Consolidated reassessment | C-NEW-01 RESOLVED — 7-day proposal withdrawn, 14-day preference confirmed |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

**Implementation notes:**
- Computed at request creation: `deliveredAt + RETURN_WINDOW_DAYS × 86400000`.
- Not stored as a column on `return_requests` — derived from delivery timestamp.
- For partial deliveries, each sub-order has its own delivery timestamp and independent window.
- A corrected delivery timestamp may be applied only through an authorized, auditable administrative correction.

**Decision recording template:**

| # | Field | Value |
|---|---|---|
| 1 | Decision ID | D01 |
| 2 | Approver full name | _[TO BE RECORDED]_ |
| 3 | Approver role | Head of Operations / COO |
| 4 | Approval date | _[TO BE RECORDED]_ |
| 5 | Outcome | _[APPROVED / REJECTED / APPROVED WITH CONDITIONS]_ |
| 6 | Rationale | _[TO BE RECORDED]_ |
| 7 | Conditions | _[TO BE RECORDED]_ |
| 8 | Evidence reference | _[TO BE RECORDED]_ |
| 9 | Dependent decisions | OQ-03 |
| 10 | Implementation impact | WP-1B, WP-2B |

---

### 5.2 D02 — Merchant Response SLA

| Field | Value |
|---|---|
| **Decision ID** | D02 |
| Provisional position | **72 elapsed hours** from return request creation |
| Clock start | `return_requests.created_at` (server-generated, UTC, with timezone) |
| Clock behavior | Runs continuously — includes weekends and public holidays |
| Notification failure | Must NOT pause, restart, or extend the deadline |
| Approver role | Head of Merchant Partnerships (per execution package) / Head of Operations / COO (per agenda) |
| Meeting assignment | Meeting 1 |
| Dependencies | OQ-02 (SLA trigger timestamps) |
| Implementation impact | WP-1C (worker design), WP-2C (worker implementation) |
| Code baseline | `MERCHANT_SLA_HOURS = 72` in `returns.service.ts` line 43; `expires_at` column on `return_requests` |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

**Implementation notes:**
- `expires_at` is set at creation time: `created_at + 72 hours`.
- `ReturnExpirationWorker` polls for `status = 'REQUESTED' AND expires_at <= now()`.
- Retry logic must not reset the deadline.
- Uses authoritative server/database timestamps with safe UTC handling.

**Decision recording template:**

| # | Field | Value |
|---|---|---|
| 1 | Decision ID | D02 |
| 2 | Approver full name | _[TO BE RECORDED]_ |
| 3 | Approver role | _[TO BE RECORDED]_ |
| 4 | Approval date | _[TO BE RECORDED]_ |
| 5 | Outcome | _[APPROVED / REJECTED / APPROVED WITH CONDITIONS]_ |
| 6 | Rationale | _[TO BE RECORDED]_ |
| 7 | Conditions | _[TO BE RECORDED]_ |
| 8 | Evidence reference | _[TO BE RECORDED]_ |
| 9 | Dependent decisions | OQ-02 |
| 10 | Implementation impact | WP-1C, WP-2C |

---

### 5.3 D03 — Escalation-on-Timeout Policy ⚠️ CRITICAL PATH

| Field | Value |
|---|---|
| **Decision ID** | D03 |
| Provisional position | Merchant timeout triggers **escalation to administrator** — no auto-approve, auto-reject, or auto-expire |
| FSM change | Add `ESCALATED` state: `REQUESTED → ESCALATED` (replacing terminal `EXPIRED`) |
| ESCALATED transitions | `ESCALATED → MERCHANT_APPROVED, MERCHANT_REJECTED, CANCELLED` (admin resolves) |
| Approver role | Head of Merchant Partnerships (co: Head of Operations / COO) |
| Meeting assignment | Meeting 1 |
| Dependencies | None — this is the critical-path item; FSM design cannot begin without it |
| Implementation impact | WP-1B (FSM design), WP-2B (FSM implementation), **migration 0060** |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

**Implementation notes:**
- Current code: `REQUESTED → EXPIRED` (terminal). `EXPIRED` has no outgoing transitions.
- Migration 0059 CHECK constraint includes `EXPIRED` but NOT `ESCALATED`.
- Migration 0060 required to: (a) add ESCALATED to CHECK constraint, (b) update partial unique index `idx_return_requests_active_per_order` to handle ESCALATED correctly (ESCALATED is NOT terminal — admin can still resolve).
- `getCumulativeReturnedQuantities()` (line 851–854) must include ESCALATED in the effective-status list.
- Transition must be idempotent. System-generated event: `return.escalated` with `actor_type = 'SYSTEM'`.
- Admin resolution: `actor_type = 'ADMIN'`.

**Decision recording template:**

| # | Field | Value |
|---|---|---|
| 1 | Decision ID | D03 |
| 2 | Approver full name | _[TO BE RECORDED]_ |
| 3 | Approver role | _[TO BE RECORDED]_ |
| 4 | Approval date | _[TO BE RECORDED]_ |
| 5 | Outcome | _[APPROVED / REJECTED / APPROVED WITH CONDITIONS]_ |
| 6 | Rationale | _[TO BE RECORDED]_ |
| 7 | Conditions | _[TO BE RECORDED]_ |
| 8 | Evidence reference | _[TO BE RECORDED]_ |
| 9 | Dependent decisions | None |
| 10 | Implementation impact | WP-1B, WP-2B, migration 0060 |

---

### 5.4 D11 — Administrator Escalation SLA

| Field | Value |
|---|---|
| **Decision ID** | D11 |
| Provisional position | **3 business days** from escalation event |
| Business calendar | Configurable (definition required via OQ-01) |
| Timezone | UTC (per consolidated specification §3.1) |
| Holidays | Configured holidays excluded |
| Approver role | Head of Operations / COO |
| Meeting assignment | Meeting 1 |
| Dependencies | OQ-01 (business calendar definition), OQ-02 (SLA trigger timestamps) |
| Implementation impact | WP-1F (admin escalation UI design), WP-2F (implementation) |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

**Implementation notes:**
- No business calendar, holiday configuration, or timezone-aware deadline calculation currently exists in the codebase.
- The SLA clock starts at the `return_request_events.created_at` timestamp for the `ESCALATED` event (pending OQ-02 confirmation).
- SLA pauses outside business hours and on non-business days.
- Must not invent unspecified business-hour schedules, holiday sources, or calendar ownership.

**Decision recording template:**

| # | Field | Value |
|---|---|---|
| 1 | Decision ID | D11 |
| 2 | Approver full name | _[TO BE RECORDED]_ |
| 3 | Approver role | Head of Operations / COO |
| 4 | Approval date | _[TO BE RECORDED]_ |
| 5 | Outcome | _[APPROVED / REJECTED / APPROVED WITH CONDITIONS]_ |
| 6 | Rationale | _[TO BE RECORDED]_ |
| 7 | Conditions | _[TO BE RECORDED]_ |
| 8 | Evidence reference | _[TO BE RECORDED]_ |
| 9 | Dependent decisions | OQ-01, OQ-02 |
| 10 | Implementation impact | WP-1F, WP-2F |

---

## 6. Delivery-Fee Decisions — Operational Context (D08, D09, D10)

> **GOVERNANCE NOTE:** D08, D09, D10 are formally assigned to Meeting 2 (Finance). This section provides operational context for Operations stakeholders. **No formal approval may be recorded here.** Operations input should be captured as advisory notes for the Meeting 2 record.

### 6.1 D08 — Full Sub-Order Return Delivery Fee

| Field | Value |
|---|---|
| Provisional position | Refund the **original persisted delivery fee** for an authorized full sub-order return |
| Key rule | Use the original delivery-fee amount. Do not calculate a replacement from current shipping rates. |
| Formal approver | Finance Lead (co: Head of Operations) — Meeting 2 |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

### 6.2 D09 — Delivery-Fee Exception

| Field | Value |
|---|---|
| Provisional position | Refund the **full original delivery fee** when an authorized exception applies to a partial return |
| Authorization | Exception must be justified, authorized, and audited |
| Dual approval (OQ-06) | Two distinct authorized users: one Finance approver + one administrator |
| Server enforcement | Role eligibility and distinct-user requirements enforced server-side; hiding UI buttons is not authorization |
| Formal approver | Finance Lead (co: Head of Operations) — Meeting 2 |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

### 6.3 D10 — Carrier-Damage Delivery Fee

| Field | Value |
|---|---|
| Provisional position | Refund the entire original delivery fee when carrier damage **materially compromises** the whole sub-order |
| Limited impact | If impact is limited and does not materially compromise, route for administrator review |
| Materiality basis | Impact on the whole order/sub-order — not solely a monetary threshold or item count |
| Formal approver | Finance Lead (co: Head of Operations) — Meeting 2 |
| **Status** | **PROVISIONAL — PENDING APPROVAL** |

---

## 7. Open Question Sheets (OQ-01, OQ-02, OQ-03, OQ-11, OQ-12)

### 7.1 OQ-01 — Business Calendar Definition

| Field | Value |
|---|---|
| Priority | HIGH |
| Exact question | What is the definition of a business day, business hours, timezone, weekends, and public holidays for the administrator's 3-business-day escalation resolution target (D11)? |
| Accountable role | Head of Operations / COO |
| Affected decisions | D11 |
| Affected work packages | WP-1F, WP-2F, WP-3D |
| **Status** | **OPEN** |

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Business days: Monday through Friday, excluding public holidays
- Business hours: 08:00–18:00 local time of the administrator's operating timezone
- Timezone: UTC (per consolidated specification §3.1)
- Weekends: Saturday and Sunday are non-business days
- Public holidays: Country-specific holiday calendar (source TBD)
- SLA pauses outside business hours and on non-business days

**Outstanding sub-questions requiring explicit resolution:**

| # | Sub-Question | Status |
|---|---|---|
| 1 | Who owns the business calendar? (Finance? Operations? HR?) | OPEN |
| 2 | How are holidays configured? (Database table? Config file? External service?) | OPEN |
| 3 | What is the update frequency? (Annual? Ad hoc?) | OPEN |
| 4 | Who approves calendar changes? | OPEN |
| 5 | How are timezones handled for multi-timezone organizations? | OPEN |
| 6 | What happens when a holiday is declared ad hoc (e.g., national mourning)? | OPEN |

**OQ-01 resolution recording template:**

| # | Field | Value |
|---|---|---|
| 1 | OQ ID | OQ-01 |
| 2 | Accountable role | Head of Operations / COO |
| 3 | Resolution date | _[TO BE RECORDED]_ |
| 4 | Resolution outcome | _[TO BE RECORDED]_ |
| 5 | Approver identity | _[TO BE RECORDED]_ |
| 6 | Evidence reference | _[TO BE RECORDED]_ |
| 7 | Sign-off parties | _[N/A — single party]_ |

---

### 7.2 OQ-02 — SLA Trigger Timestamps

| Field | Value |
|---|---|
| Priority | HIGH |
| Exact question | What is the authoritative event and timestamp that starts each applicable SLA clock? |
| Accountable role | Head of Operations / COO |
| Affected decisions | D02 (merchant 72h clock), D11 (admin 3-business-day clock) |
| Affected work packages | WP-1C, WP-1F, WP-2C, WP-2F |
| **Status** | **OPEN** |

**Proposed default (PROVISIONAL — NOT APPROVED):**

| Clock | Start Event | Start Timestamp |
|---|---|---|
| Merchant 72-hour | Return request creation | `return_requests.created_at` |
| Administrator 3-business-day | Escalation event | `return_request_events.created_at` where `event_type = 'ESCALATED'` |

**Outstanding sub-questions:**

| # | Sub-Question | Status |
|---|---|---|
| 1 | Is `created_at` the correct authoritative timestamp for the merchant clock? | OPEN |
| 2 | Is the ESCALATED event timestamp the correct start for the admin clock? | OPEN |
| 3 | What timezone basis is used for deadline calculations? (UTC per spec §3.1) | OPEN |

**OQ-02 resolution recording template:**

| # | Field | Value |
|---|---|---|
| 1 | OQ ID | OQ-02 |
| 2 | Accountable role | Head of Operations / COO |
| 3 | Resolution date | _[TO BE RECORDED]_ |
| 4 | Resolution outcome | _[TO BE RECORDED]_ |
| 5 | Approver identity | _[TO BE RECORDED]_ |
| 6 | Evidence reference | _[TO BE RECORDED]_ |
| 7 | Sign-off parties | _[N/A — single party]_ |

---

### 7.3 OQ-03 — Return Eligibility Edge Cases

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Exact question | How does the 14-day return-eligibility window interact with: cancelled orders, partial deliveries, non-delivery, and carrier-damaged deliveries? |
| Accountable role | Head of Operations / COO (co: Customer Experience) |
| Affected decisions | D01 |
| Affected work packages | WP-2B |
| **Status** | **OPEN** |

**Proposed default (PROVISIONAL — NOT APPROVED):**

| Edge Case | Proposed Rule |
|---|---|
| Cancelled orders | Not eligible for ordinary return workflow. Cancellation refunds follow a separate path. |
| Partial deliveries | Each sub-order has its own delivery timestamp and independent 14-day window. |
| Non-delivery | Uses administrator/non-delivery resolution workflow, not ordinary return. |
| Carrier damage (within window) | May qualify within the 14-day window; responsibility classified separately via D10. |
| Item-level safety | Eligibility must not accidentally refund ineligible items or fees. |

**OQ-03 resolution recording template:**

| # | Field | Value |
|---|---|---|
| 1 | OQ ID | OQ-03 |
| 2 | Accountable role | Head of Operations / COO |
| 3 | Resolution date | _[TO BE RECORDED]_ |
| 4 | Resolution outcome | _[TO BE RECORDED]_ |
| 5 | Approver identity | _[TO BE RECORDED]_ |
| 6 | Evidence reference | _[TO BE RECORDED]_ |
| 7 | Sign-off parties | _[N/A — single party]_ |

---

### 7.4 OQ-11 — Carrier Damage Materiality (Advisory for Operations)

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Exact question | What defines "materially compromises delivery of the order as a whole" vs. "limited-impact partial cases" for carrier-damage delivery-fee treatment (D10)? |
| Accountable role | Finance Lead (co: Head of Operations) |
| Affected decisions | D10 |
| **Status** | **OPEN** |

**Proposed default (PROVISIONAL — NOT APPROVED):**
- Material impact: >50% of items in the sub-order are damaged, or delivered goods are unusable for intended purpose
- Limited impact: <50% of items damaged, goods partially usable
- Threshold is configurable and may be adjusted post-pilot
- Per consolidated specification §3.3: "Do not infer materiality solely from a monetary threshold or the number of returned items"

> **Note:** Formal resolution is by Finance Lead. Operations provides advisory input in this meeting for the Meeting 2 record.

---

### 7.5 OQ-12 — Dispute / Carrier Recovery Workflow (Awareness Only)

| Field | Value |
|---|---|
| Priority | LOW — **NOT IN P13 SCOPE** |
| Exact question | What is the carrier recovery process, evidence requirements, and timeline? |
| Accountable role | Head of Operations / COO |
| Affected decisions | D07, D10 (referenced but not blocking) |
| Affected work packages | None in P13. Separate workflow (P14+). |
| **Status** | **OPEN — P14+** |

> **Note:** OQ-12 does not block any P13 implementation. Included for situational awareness only. No resolution required in this meeting.

---

## 8. Evidence and Approval Controls

### 8.1 Recording requirements

Per `P13-PHASE-0-APPROVAL-EVIDENCE-INTAKE-AND-GATE-REASSESSMENT.md`:

- **Decisions (D01–D15):** 10 required fields (see recording templates in §5)
- **Open Questions (OQ-01–OQ-12):** 7 required fields (see recording templates in §7)
- **Acceptable evidence:** Signed meeting minutes with attendee list, written approval email from accountable role, signed memo with all required fields
- **Unacceptable evidence:** Inferred from meeting preparation, undocumented conversation, provisional preferences in any specification, silence, or code/test behavior

### 8.2 Approval controls

- No decision is approved merely because this packet exists or a meeting is held.
- No approver identity, date, or outcome is pre-filled.
- If a stakeholder declines to decide, the item remains PROVISIONAL / OPEN.
- Conditional approvals are recorded with explicit conditions.
- The governance recorder verifies all 10 fields (decisions) or 7 fields (OQs) are complete before counting toward any phase-entry gate.

### 8.3 Post-meeting register update procedure

1. Governance recorder transcribes approved decisions into `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` Decision Register sheet.
2. Governance recorder transcribes resolved OQs into Open Questions sheet.
3. Verify each record has all required fields.
4. Reassess Phase 1 entry conditions per `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` §5.
5. Update `P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md` policy traceability.

---

## 9. Governance Consistency Report

### 9.1 Cross-document verification

| Document | D01 Position | D01 Status | Consistent? |
|---|---|---|---|
| `P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md` v1.1 | 14 calendar days | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-STAKEHOLDER-APPROVAL-EXECUTION-PACKAGE.md` | 14 days from delivery | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | 14 days from delivery | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | 14-day return window | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-PHASE-0-APPROVAL-EVIDENCE-INTAKE-AND-GATE-REASSESSMENT.md` | 14 days from delivery | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-POLICY-RECONCILIATION-v3.md` | 14 days from delivery | PROVISIONAL — PENDING APPROVAL | **YES** |
| `P13-PROVISIONAL-POLICY-RECONCILIATION.md` | 14 days from delivery | PENDING — NOT APPROVED | **YES** |
| Architecture lock BD-P13-WINDOW-004 | 14 days (parameterized) | Business approval required | **YES** |
| Code: `returns.service.ts` line 40 | `RETURN_WINDOW_DAYS = 14` | N/A (implementation) | **YES** |

**Verdict: ALL CONSISTENT.** D01 = 14 calendar days across all governance documents and code. C-NEW-01 resolved in consolidated reassessment v1.1.

### 9.2 Inconsistencies found

**None.** All documents consistently record D01 as 14 calendar days, PROVISIONAL — PENDING APPROVAL.

### 9.3 Meeting assignment consistency

| Decision | This Packet | Execution Package §1.1 | Agenda v2 | Consistent? |
|---|---|---|---|---|
| D01 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| D02 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| D03 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| D11 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| D08 | Advisory context | Meeting 2 (Finance) | Meeting 2 | **YES** (advisory only) |
| D09 | Advisory context | Meeting 2 (Finance) | Meeting 2 | **YES** (advisory only) |
| D10 | Advisory context | Meeting 2 (Finance) | Meeting 2 | **YES** (advisory only) |
| OQ-01 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| OQ-02 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| OQ-03 | Meeting 1 (Operations) | Meeting 1 | Meeting 1 | **YES** |
| OQ-11 | Advisory context | Meeting 2 (Finance) | Meeting 2 | **YES** (advisory only) |
| OQ-12 | Awareness only | Not in P13 scope | Not in P13 scope | **YES** |

---

## 10. Required Attendees and Missing Evidence

### 10.1 Evidence still missing (all items)

| Item | Missing Evidence | Who Must Provide |
|---|---|---|
| D01 | Approver name, date, outcome, rationale, conditions, evidence reference | Head of Operations / COO |
| D02 | Approver name, date, outcome, rationale, conditions, evidence reference | Head of Merchant Partnerships |
| D03 | Approver name, date, outcome, rationale, conditions, evidence reference | Head of Merchant Partnerships (co: Head of Operations) |
| D11 | Approver name, date, outcome, rationale, conditions, evidence reference | Head of Operations / COO |
| OQ-01 | Resolution, date, approver identity, evidence reference | Head of Operations / COO |
| OQ-02 | Resolution, date, approver identity, evidence reference | Head of Operations / COO |
| OQ-03 | Resolution, date, approver identity, evidence reference | Head of Operations / COO |
| D08–D10 | Formal approval in Meeting 2 (this meeting provides advisory context only) | Finance Lead (co: Head of Operations) |
| OQ-11 | Formal resolution in Meeting 2 (this meeting provides advisory input only) | Finance Lead (co: Head of Operations) |

### 10.2 Phase 0 closure criteria status (after this meeting, if all Operations items approved)

| Condition | After Meeting 1 (best case) | Still Blocking |
|---|---|---|
| D01 approved | ✅ PASS (if approved) | — |
| D02 approved | ✅ PASS (if approved) | — |
| D03 approved | ✅ PASS (if approved) | — |
| D04–D07 approved | ❌ FAIL | Meeting 2 (Finance) |
| D08–D10 approved | ❌ FAIL | Meeting 2 (Finance) |
| D11 approved | ✅ PASS (if approved) | — |
| D14, D15 approved | ❌ FAIL | Meeting 4 (Engineering) |
| OQ-01 resolved | ✅ PASS (if resolved) | — |
| OQ-02 resolved | ✅ PASS (if resolved) | — |
| OQ-04 Finance + Engineering | ❌ FAIL | Meetings 2 + 4 |

**Phase 0 cannot close after Meeting 1 alone.** Meetings 2, 3, and 4 are still required.

---

## 11. Phase 0 Status Declaration

**Phase 0 remains OPEN.** All 15 decisions are PROVISIONAL — PENDING APPROVAL. All 12 open questions remain OPEN. No phase-entry gate can pass until formal approval evidence is recorded by authorized stakeholders.

This meeting packet is preparation material. It does not constitute approval, record any decision outcome, or authorize any implementation.

---

**Attestation:** This document was produced by read-only inspection of the repository at `develop@8d60e36`. No source code, migrations, or tracked files were modified. No approval was inferred, invented, or recorded. No meeting is claimed to have occurred. All decisions remain PROVISIONAL — PENDING APPROVAL. All gates remain BLOCKED.
