# P13 Next Step — Stakeholder Approval Pack

**Purpose:** one self-contained pack business stakeholders can use in the approval meetings to record defensible decisions for D01–D15 and OQ-01–OQ-12.
**Baseline:** branch `develop`, HEAD `c01267cfd9be8cac72edb9333f7c7f036647fc1a`. Hosted CI run `38889251079` (SUCCESS) — workflow-fix evidence only; **not** approval evidence.
**Status at pack creation:** 0/15 decisions approved · 12/12 questions open · receiver 0/14 verified.
**Sources:** `P13-PHASE-4.1.11-BUSINESS-APPROVAL-PACK.md`, `P13-PHASE-0-APPROVAL-AGENDA-v2.md`, `P13-PHASE-0-OPEN-DECISION-SHEETS.md`, `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md`, `P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md`, `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`, and the Phase 4.1.17 audit reports in this directory.

## How to use this pack

1. This pack proposes **nothing as approved**. Every "Recommendation" is marked **NOT APPROVED** and carries no decision authority. The business may accept, modify, or reject each recommendation.
2. A decision is only made when the **Approval record** table at the end of a sheet is completed with attributable evidence: approver name, role, decision, rationale, date, evidence reference.
3. Meeting structure: use `P13-NEXT-STEP-DECISION-TRACKER.md` (which preserves the five-meeting structure of `P13-PHASE-0-APPROVAL-AGENDA-v2.md`). Meeting 2 (Finance) is priority 1; Meeting 4's OQ-04 Engineering sign-off depends on Meeting 2.
4. Decisions "APPROVED WITH CONDITIONS" must list the conditions explicitly in the Rationale/Conditions fields.
5. Approvals are recorded in the canonical tracker `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx`. This Markdown pack is the meeting aid; it does not replace the xlsx.

**Status vocabulary:** `PROVISIONAL — PENDING APPROVAL` (documented position, no attributable approval) · `OPEN` (no resolution) · `UNVERIFIED` (no verification evidence) · `BLOCKED` (external/upstream dependency) · `NOT APPROVED` (this pack's suggestions).

---

# PART 1 — CRITICAL DECISION SHEETS (Phase 1 entry blockers)

## OQ-01 — Business calendar definition

**Decision requested:** Approve the complete definition of the administrator business calendar for the 3-business-day escalation target (D11): business days, working hours, timezone, weekend treatment, public-holiday source and maintainer, and calendar ownership/change management.

**Current provisional policy / implemented behavior:**
- Implemented: Monday–Friday, 08:00–18:00 **UTC**, excluding configured holidays; "3 business days" accumulates real working time (3 × 10h = 30h); clock pauses outside business hours and on holidays; holidays administered via admin endpoints with an audit trail; **no holiday list is approved or populated anywhere**.
- Fail-safe (implemented, verified): missing or invalid calendar configuration throws (`BUSINESS_CALENDAR_NOT_FOUND` / `BUSINESS_CALENDAR_DISABLED` / validation / `MAX_ITERATIONS`) — it never silently degrades to elapsed-time counting.

**Options and trade-offs:**
1. **Confirm UTC** — matches current implementation and the carried documented requirement; DST-free; trade-off: must match how the operations team actually works.
2. **Named IANA timezone** — aligns with staff expectations; requires approved data update via existing admin endpoints + re-verification of SLA math (no code change expected).
3. **Holiday source:** admin-maintained list (current mechanism, owner enters approved list) vs external calendar feed (new scope — requires its own authorization).

**Approver:** Head of Operations / COO. **Co-approver:** —
**Recommendation (NOT APPROVED):** confirm UTC + admin-maintained holidays (matches implemented, tested, fail-safe behavior); record the initial holiday list explicitly as empty-until-published and name its maintainer.
**Evidence / acceptance criteria:** written approval stating days, hours, timezone, weekend treatment, holiday source + maintainer, change-management owner; recorded in the Decision Register with attributable evidence.
**Dependencies / blocking:** blocks D11 approval and Phase 1 entry; blocks pilot SLA-verification evidence. Fail-safe behavior is a preserved requirement — an approved decision cannot remove it.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

---

## OQ-02 — SLA trigger timestamps

**Decision requested:** Approve the authoritative start event and timestamp for (a) the merchant 72-hour response clock (D02) and (b) the administrator 3-business-day resolution clock (D11), and state whether clock resets or historical backfills are permitted.

**Current provisional policy / implemented behavior:**
- Merchant clock: starts at return-request creation — `expires_at = created_at + 72h` elapsed wall-clock (72h includes weekends/holidays; that is the documented requirement). Worker escalates when `status='REQUESTED' AND expires_at <= NOW()`.
- Administrator clock: starts at the `ESCALATED` event timestamp in `return_request_events`; countdown computed over the business calendar (OQ-01).
- Duplicates/retries: per-item re-verification + 409-conflict skip; `FOR UPDATE SKIP LOCKED` claim + lease epoch fencing make duplicate escalation impossible.
- Validity checking: monitor detects any REQUESTED return past `expires_at` (+10 min grace) and alerts.

**Options and trade-offs:**
1. **Approve implemented anchors** — consistent with the provisional default and all preserved requirements; zero code change.
2. **Re-anchor to a delivery-confirmed event** — no register evidence supports it; would change `expires_at` semantics and require authorized code changes. Not recommended unless the business identifies a concrete need.

**Clock resets / backfill:** nothing resets a clock in the implementation, and no historical backfill exists. The decision must state explicitly whether that remains true (recommended) or authorize a specific, scoped exception.

**Approver:** Head of Operations / COO. **Co-approver:** —
**Recommendation (NOT APPROVED):** approve the implemented anchors; record "no resets, no backfill" as part of the decision.
**Evidence / acceptance criteria:** written approval naming the two anchor events and the reset/backfill stance; recorded in the Decision Register.
**Dependencies / blocking:** blocks D02 + D11 verification evidence and Phase 1 entry. Existing clock behavior must not change without this decision.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

---

## OQ-04 — Commission allocation and rounding ⚠️ CRITICAL (two separate sign-offs required)

**Decision requested:** (1) **Finance** approves the business algorithm, mixed-responsibility treatment, rounding tolerance, and accounting policies. (2) **Engineering** separately approves the actual persistence and concurrency design. OQ-04 is resolved only when **both** sign-offs are recorded.

### Current implemented behavior — Option A semantics (accurate description)

`commission-reversal.service.ts`: `rawReversal = Math.floor(originalCommission × returnNetGoods / orderNetGoods)`, then `reversal = min(rawReversal, remainingCommission)` where `remainingCommission = originalCommission − Σ already reversed`; skip when remaining ≤ 0; integer minor units on the VAT-exclusive, delivery-fee-exclusive net-goods basis; per-reversal idempotency key; dedicated `commission_reversals` ledger; over-reversal and `EXCESSIVE_REVERSAL` detection in reconciliation + monitor.

- **This is Option A (cap-at-remaining). It is NOT cumulative-target rounding**, despite a code comment that mislabels it — a comment-only correction has been proposed separately and is not made here.
- Property per the repository's own technical decision document: Option A **prevents over-reversal but does NOT guarantee full reversal** — in under-rounding cases the cap never engages and the cumulative total may fall permanently short by up to N−1 minor units.

### Algorithm comparison (from `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §2–§6)

| Algorithm | How it works | Over-rounding case (6 items) | Under-rounding case (7 items) | Notes |
|---|---|---|---|---|
| **Option A — cap-at-remaining (current)** | Per return: proportional floor, capped at remaining commission | 100 (exact — cap engages) | **98 (short by 2)** — cap never engages | Simplest; already implemented; prevents over-reversal only |
| **Option B — final-return catch-up** | Same as A, except when the last eligible return is detected: reverse whatever remains to reach the target | 100 (exact) | 100 (exact) | Requires **reliable last-return detection** at processing time — genuinely hard when further returns may arrive later; not implemented |
| **Option C — cumulative-target** | `current_reversal = round(commission_total × eligible_net_goods_returned / net_goods_total) − already_reversed` (floor at 0, cap at remaining) | 100 (exact) | 100 (exact) | Residue absorbed in the first transaction; requires cumulative-target bookkeeping (cumulative state is already persisted via the ledger); not implemented |

Options B and C guarantee exact reconciliation **when all eligible items are fully returned**. The choice of acceptable shortfall is a Finance business decision.

### Mixed-responsibility denominator question (Finance must pick one)

When some items are buyer-remorse (ineligible for reversal), which denominator applies?

| Interpretation | Formula | Worked example (commission 100; items A,B merchant-responsible 500; C,D buyer-remorse 500) |
|---|---|---|
| **1 — total order net goods (currently implemented)** | `round(commission × eligible_returned / order_net_goods_total)` | Reverses **50** (proportional to the eligible portion of the order) |
| **2 — eligible net goods only** | `round(commission × eligible_returned / eligible_net_goods_total)` | Reverses **100** (full commission on eligible items) |

These produce materially different financial outcomes. The answer cannot be inferred from code.

### Four accounting questions (Finance, from the technical decision doc §9)

1. **Rounding tolerance:** is ±1 minor unit acceptable, or must the cumulative total be exactly the eligible commission when all eligible items are returned? (Exact ⇒ Option B or C.)
2. **Negative reversal (clawback):** if `already_reversed > cumulative_target` (reclassification/correction), is a negative reversal permitted, or must it be a separate audited adjustment?
3. **Historical refunds:** backfill pre-P13 refunds with reversal data, or start cumulative tracking from zero at go-live? (No backfill exists today.)
4. **Reclassification timing:** when a contested return is later reclassified, is the reversal computed from return-creation date or reclassification date?

### Sign-off 1 — Finance (business policy)

Covers: allocation method (proportional by net-goods ratio), rounding mechanism (A/B/C), mixed-responsibility interpretation (1/2), rounding tolerance, and the four accounting questions.

| Field | Value |
|---|---|
| Finance approver name | |
| Role | |
| Allocation method (proportional net-goods) | ☐ APPROVED ☐ REJECTED ☐ MODIFIED |
| Rounding mechanism | ☐ Option A (current; under-reversal possible) ☐ Option B ☐ Option C |
| Mixed-responsibility interpretation | ☐ 1 — total order ☐ 2 — eligible only |
| Rounding tolerance | ☐ Exact (⇒ B/C) ☐ ±1 minor unit acceptable |
| Accounting Q2 (negative reversal) | ☐ Permitted ☐ Separate audited adjustment |
| Accounting Q3 (historical backfill) | ☐ None — start at go-live ☐ Approved backfill (scope: ______) |
| Accounting Q4 (reclassification timing) | ☐ Return creation date ☐ Reclassification date |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

### Sign-off 2 — Engineering (persistence & concurrency, subject to Finance invariants)

Engineering signs off on the **actual implemented design**, which differs from the technical decision doc's provisional "recommended" persistence option (the doc's Option 1 was a `refunds` column; the implementation uses its Option 2 — a dedicated ledger):

| Field | Actual implemented design (to be signed off) |
|---|---|
| Data source | Dedicated `commission_reversals` ledger table (POSTED rows, original-commission snapshot retained) — the doc's Option 2 |
| Cumulative read | Transaction-scoped `SUM(reversal_minor)` baseline per sub-order |
| Idempotency | Per-reversal unique idempotency key; duplicate request returns existing record |
| Concurrency | `FOR UPDATE SKIP LOCKED` claim + lease epoch fencing + single-transaction reversal posting |
| Detection | Reconciliation `EXCESSIVE_REVERSAL`; monitor checks 6–7 |

| Field | Value |
|---|---|
| Engineering approver name | |
| Role | |
| Implemented design as described | ☐ SIGNED OFF ☐ NOT SIGNED OFF — required changes: ______ |
| Finance invariants preserved | ☐ YES ☐ NO |
| Required tests acknowledged (concurrency, idempotency, reconciliation) | ☐ YES ☐ NO |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

**Dependencies / blocking:** blocks D04–D07 approval, WP-2D verification sign-off, Phase 1 entry, production deployment, and any pilot exercising commission reversals. If Finance selects B or C, an implementation change is required in a separately authorized follow-up phase — approval of B/C does **not** retroactively change the running code.

---

# PART 2 — RETURN AND FINANCIAL POLICY DECISIONS (D01–D13)

Each sheet below follows the same structure. All current behaviors are documented/implemented facts, **not** approvals.

## D01 — Buyer return window

**Decision requested:** approve the length of the buyer return window and its anchor.
**Provisional policy / implemented:** 14 days from delivery (`RETURN_WINDOW_DAYS` default 14); eligibility anchored to DELIVERED status; edge cases governed by OQ-03.
**Options / trade-offs:** keep 14 days (implemented) vs another period (requires code change to the default and re-verification).
**Approver:** Head of Operations / COO.
**Recommendation (NOT APPROVED):** approve 14 days from delivery as implemented.
**Evidence / acceptance criteria:** attributable approval with window value + anchor.
**Dependencies / blocking:** Phase 1 entry; interacts with OQ-03.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D02 — Merchant response SLA

**Decision requested:** approve the merchant response SLA duration.
**Provisional policy / implemented:** 72 elapsed hours from creation (`MERCHANT_SLA_HOURS = 72`); anchor per OQ-02.
**Options / trade-offs:** keep 72h elapsed (implemented, includes weekends/holidays) vs business-hour counting (would contradict the documented "72 elapsed hours" requirement and require redesign).
**Approver:** Head of Merchant Partnerships.
**Recommendation (NOT APPROVED):** approve 72 elapsed hours as implemented.
**Evidence / acceptance criteria:** attributable approval.
**Dependencies / blocking:** Phase 1 entry; depends on OQ-02 anchor approval.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D03 — Timeout → escalation (no automatic financial action)

**Decision requested:** approve that SLA timeout escalates to admin review and never auto-approves, rejects, refunds, or expires.
**Provisional policy / implemented:** worker transitions REQUESTED → ESCALATED (non-terminal); admin resolves explicitly; the code path performs no financial action on timeout.
**Options / trade-offs:** approve as implemented (preserved requirement) vs any auto-action variant (contradicts the preserved safety requirement — not offered as an option).
**Approver:** Head of Operations / COO.
**Recommendation (NOT APPROVED):** approve as implemented.
**Evidence / acceptance criteria:** attributable approval of the escalation path.
**Dependencies / blocking:** Phase 1 entry; FSM-wide.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D04 — Commission reversal: merchant responsibility

**Decision requested:** approve reversing commission on merchant-responsible returns.
**Provisional policy / implemented:** reverse on net goods for reversal-eligible categories; allocation method itself is OQ-04.
**Options / trade-offs:** reverse (current) vs retain (would make merchant faults free for merchants — no register evidence supports it).
**Approver:** Finance Lead / CFO.
**Recommendation (NOT APPROVED):** approve reversal on merchant responsibility.
**Dependencies / blocking:** depends on OQ-04; Phase 1 entry.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D05 — Commission retention: buyer remorse

**Decision requested:** approve retaining commission on buyer-remorse returns.
**Provisional policy / implemented:** buyer-remorse is not reversal-eligible; no reversal is posted for that category.
**Options / trade-offs:** retain (current; merchant keeps commission on buyer-change-of-mind) vs reverse (shifts merchant loss to platform; no register evidence supports it).
**Approver:** Finance Lead / CFO.
**Recommendation (NOT APPROVED):** approve retention.
**Dependencies / blocking:** Phase 1 entry; interacts with OQ-04 denominator.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D06 — Commission reversal: platform responsibility

**Decision requested:** approve reversing commission on platform-responsible returns.
**Provisional policy / implemented:** reverse on net goods (eligible category).
**Approver:** Finance Lead / CFO.
**Recommendation (NOT APPROVED):** approve reversal.
**Dependencies / blocking:** depends on OQ-04; Phase 1 entry.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D07 — Commission reversal: carrier damage

**Decision requested:** approve reversing commission on carrier-damage returns.
**Provisional policy / implemented:** reverse on net goods (eligible category); carrier recovery itself is out of P13 scope (OQ-12, P14+).
**Approver:** Finance Lead / CFO.
**Recommendation (NOT APPROVED):** approve reversal.
**Dependencies / blocking:** depends on OQ-04; Phase 1 entry.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D08 — Delivery fee: full sub-order return

**Decision requested:** approve delivery-fee treatment when the full sub-order is returned.
**Provisional policy / implemented:** full-sub-order refund of the delivery fee, capped at the original fee and cumulative already-refunded amounts.
**Approver:** Finance Lead. **Co-approver:** Head of Operations.
**Recommendation (NOT APPROVED):** approve full-refund-on-full-return as implemented.
**Dependencies / blocking:** Phase 1 entry.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D09 — Delivery-fee exception: partial returns

**Decision requested:** approve the admin-authorized delivery-fee exception path for partial returns, including dual approval.
**Provisional policy / implemented:** exception path implemented; requires dual approval (two distinct approvers, one Finance + one admin); `DELIVERY_FEE_EXCEPTION_APPROVED` audit events; creator cannot self-approve.
**Options / trade-offs:** keep dual approval (preserved requirement) vs single approver (contradicts the preserved two-approver requirement — not offered).
**Approver:** Finance Lead. **Co-approver:** Head of Operations.
**Recommendation (NOT APPROVED):** approve as implemented.
**Dependencies / blocking:** Phase 1 entry; audit detail in OQ-06.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D10 — Delivery fee: carrier damage

**Decision requested:** approve that the buyer is refunded the delivery fee on carrier damage, with carrier recovery pursued separately.
**Provisional policy / implemented:** refund-buyer path implemented; materiality threshold is OQ-11; recovery is OQ-12 (P14+).
**Approver:** Finance Lead. **Co-approver:** Head of Operations.
**Recommendation (NOT APPROVED):** approve refund-buyer + separate recovery.
**Dependencies / blocking:** Phase 1 entry; OQ-11 for the materiality rule.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D11 — Administrator escalation review target

**Decision requested:** approve the 3-business-day admin review target (calendar per OQ-01).
**Provisional policy / implemented:** 3 business days computed by the business-calendar service (working-time accumulation, fail-safe).
**Approver:** Head of Operations / COO.
**Recommendation (NOT APPROVED):** approve 3 business days as implemented.
**Dependencies / blocking:** depends on OQ-01 + OQ-02; Phase 1 entry.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D12 — Settlement adjustment authorization

**Decision requested:** approve the manual settlement-adjustment authorization workflow, thresholds, and reconciliation.
**Provisional policy / implemented:** adjustments created with `fxStatus='BLOCKED'` + `requiresDualApproval=true` because **no authoritative FX provider exists** — the USD-equivalent $10 threshold (`thresholdMinor: 1000`) is defined but intentionally unevaluable rather than approximated; two distinct approvers (one Finance, one admin); creator cannot approve; reconciliation flags POSTED-without-dual-approval; monthly reconciliation implemented; no auto clawback.
**Options / trade-offs:** keep FX-BLOCKED + always-dual-approval until Finance designates an FX source (safe default; preserved "no invented FX rates" constraint) vs designating an FX source now (new decision with data-quality obligations).
**Approver:** Financial Controller.
**Recommendation (NOT APPROVED):** approve the safe-default workflow; treat FX-source designation as a separate future decision.
**Dependencies / blocking:** Phase 1 entry (approval), Phase 2 (D12 before WP-2D).

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D13 — Voucher returns

**Decision requested:** approve permitted outcomes for voucher-paid order returns and their financial consequences.
**Provisional policy / implemented (test evidence):** cash refund to the original payment method; no replacement voucher issued as a cash substitute; only unused voucher balance preserved — redeemed and expired value never restored; provider failure leaves refund FAILED for retry/review; duplicate webhooks idempotent; admin review for every voucher return.
**Options / trade-offs:** approve the implemented outcome set vs adding voucher reissue as a first-class outcome (new scope; would need its own fraud analysis — OQ-08).
**Approver:** Finance Lead. **Co-approver:** Risk Lead.
**Recommendation (NOT APPROVED):** approve the implemented outcome set.
**Dependencies / blocking:** Phase 1 entry (approval), Phase 2 (D13 before WP-2G); detail in OQ-08.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

---

# PART 3 — DEPLOYMENT AND PILOT DECISIONS

## D14 — Deployment target

**Decision requested:** approve the production deployment target and confirm the infrastructure specification.
**Provisional policy / implemented:** Docker Compose on a single Linux VPS; container gates pass in hosted CI; **no deployment has ever been executed**.
**Options / trade-offs:** single-VPS Compose (provisional; consistent with single-worker-instance architecture) vs multi-instance production (would change the worker-count control model and requires its own design).
**Approver:** CTO / Head of Engineering.
**Recommendation (NOT APPROVED):** confirm single-VPS Compose for the pilot horizon.
**Dependencies / blocking:** Phase 1 entry; pilot readiness.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

## D15 — Pilot operational controls

**Decision requested:** approve the four pilot operational controls, the kill-switch, and the single-worker-instance constraint.
**Provisional policy / implemented:** (1) alert on 3 consecutive worker polling failures; (2) alert on REQUESTED overdue >10 min; (3) alert on zero/multiple worker instances (`expectedWorkerCount=1`); (4) alert on heartbeat absent >5 min; durable pause control (`p13.worker.paused`, fail-closed); worker opt-in (`P13_WORKER_ENABLED=false` default); all stop-pilot detections implemented in the read-only monitor. None of it is activated.
**Options / trade-offs:** approve as implemented vs adjusting thresholds (all thresholds are env-configurable; changing them is a decision to record).
**Approver:** CTO / Head of Engineering. **Co-approver:** SRE Lead.
**Recommendation (NOT APPROVED):** approve the four controls as implemented.
**Dependencies / blocking:** Phase 1 entry; pilot readiness; owners/scope in OQ-09/OQ-10.

**Approval record:**

| Field | Value |
|---|---|
| Approver name | |
| Role | |
| Decision | ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS |
| Rationale / conditions | |
| Date | |
| Evidence reference | |

---

# PART 4 — REMAINING OPEN QUESTIONS (compact sheets)

Owners and blocking scope per the authoritative decision sheets. OQ-05–OQ-11 are **not Phase 1 blockers** (assigned to WP-3G, Phase 3); OQ-12 is out of P13 scope.

| ID | Question (abbreviated) | Owner | Provisional default (NOT APPROVED) | Blocks |
|---|---|---|---|---|
| OQ-03 | 14-day window edge cases: cancelled orders, partial delivery, non-delivery, carrier-damaged delivery | Head of Ops/COO (co: CX) | Cancelled: ineligible; per-sub-order windows; eligibility starts at DELIVERED; carrier damage → D10 path | WP-2B refinement |
| OQ-05 | Delivery-fee exception: full vs proportional refund | Finance Lead (co: Ops) | Full refund; no proportional logic | WP-3G (Phase 3) |
| OQ-06 | Delivery-fee exception audit: approver, reason codes, trail | Finance Lead (co: Risk) | `admin:returns:write`; `MERCHANT_FAULT`/`PLATFORM_FAULT`/`CARRIER_DAMAGE`/`GOODWILL`; `DELIVERY_FEE_EXCEPTION_APPROVED` events | WP-3G |
| OQ-07 | Settlement authorization levels, thresholds, review cycle | Financial Controller | Controller-or-delegate; dual approval (currently always, FX-BLOCKED); monthly reconciliation | WP-3G |
| OQ-08 | Voucher permitted outcomes + consequences | Finance Lead (co: Risk) | Cash refund / store credit (no commission reversal on credit) / reject | WP-3G |
| OQ-09 | Named pilot operational owners, alert recipients, rollback authority | CTO / SRE | SRE on-call; Platform Ops lead; CTO rollback | Pilot gate |
| OQ-10 | Pilot environment, scope, start/success/exit criteria | CTO/Head of Eng (co: Ops) | TBD environment/scope; start = approvals+implementation+evidence+4 controls; success = zero financial discrepancies, zero data loss, SLA >95%, no P1/P2 | Pilot gate |
| OQ-11 | Carrier-damage materiality threshold | Finance Lead (co: Ops) | >50% items damaged or goods unusable; configurable | WP-3G |
| OQ-12 | Carrier recovery process, evidence, timeline | Head of Ops/COO | NOT APPLICABLE to P13 — P14+ workflow | Nothing in P13 |

Each compact sheet above uses the same **Approval record** table format (Approver name / Role / Decision ☐ APPROVED ☐ REJECTED ☐ APPROVED WITH CONDITIONS / Rationale / Date / Evidence reference).

---

# PART 5 — G-09/G-10 GATE STATUS (project-owner request only)

The Markdown gate sources consistently cite **G-01–G-08** as the release criteria; the canonical xlsx tracker tracks **G-01–G-10**. This discrepancy was previously flagged and remains unresolved. **This pack does not infer the outcome.**

| Field | Value |
|---|---|
| Requested of | Project owner |
| Question | What is the authoritative status and scope of gates G-09 and G-10 relative to the G-01–G-08 release criteria? |
| Response | |
| Date / evidence reference | |

---

# PART 6 — SOURCE CONFLICTS RECORDED (not silently reconciled)

| # | Conflict | Authoritative source pending decision |
|---|---|---|
| 1 | OQ topic wording differs between the approval pack summary table (OQ-08 "voucher risk/fraud thresholds", OQ-11 "materiality $ threshold", OQ-12 "dispute workflow") and the per-question decision sheets (voucher permitted outcomes / carrier-damage materiality / carrier recovery) | Decision sheets are the detailed authority; owners agree in both. OQ-08/OQ-11/OQ-12 sheets govern |
| 2 | OQ-01 timezone: decision sheet provisional wording says "08:00–18:00 local time, timezone TBD"; the implementation and the carried Phase 4.1.17 requirement say 08:00–18:00 **UTC** | The OQ-01 approval itself (Part 1) must state the timezone explicitly |
| 3 | Release gates: Markdown sources cite G-01–G-08; xlsx tracker includes G-09/G-10 | Project owner (Part 5) |
| 4 | Technical decision doc §5.1 provisionally "recommends" persistence via a `refunds` column (its Option 1); the implemented design is its Option 2 (dedicated `commission_reversals` ledger) | Engineering sign-off (OQ-04 Sign-off 2) validates the **actual** implemented design |
| 5 | Code comment in `commission-reversal.service.ts` labels Option A math as "cumulative-target" | Implementation is Option A; a comment-only correction has been proposed in a follow-up plan and is deliberately **not** applied here |

## Attestation

This pack modifies no code, no registers, no policy status fields, and no xlsx contents. It preselects nothing and approves nothing. Every recommendation is marked NOT APPROVED. All statuses reflect repository evidence at HEAD `c01267c`.
