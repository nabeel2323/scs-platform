# P13 — Consolidated Decision and Gate Reassessment

**Version:** 1.1 — D01 policy preference updated (7-day proposal withdrawn; 14-day preference confirmed as provisional).
**Baseline:** branch `develop`, HEAD `8d60e36`, clean working tree (`git status --short -- apps/ infra/` empty).
**Node.js:** v26.4.0 | **pnpm:** 9.15.9
**Status:** `BLOCKED — FORMAL APPROVAL REQUIRED`
**Input:** Consolidated stakeholder specification (815 lines) received 2026-10-12.
**Prior governance documents:** 18 documents under `docs/production/` (v1–v3 series).

---

## 1. Repository Baseline

| Item | Value |
|---|---|
| Branch | `develop` |
| HEAD | `8d60e36` — `feat(returns): add returns oversight page and integrate returns module` |
| Prior HEAD references | `762d950` (test commit) — confirmed in history, not current |
| Source worktree | Clean — no tracked or untracked changes under `apps/` or `infra/` |
| `docs/production/*.md` | Untracked (gitignored) — governance documents authored in prior sessions |
| `docs/production/*.xlsx` | Untracked (not gitignored) — workbook from prior session |
| Latest migration | `0059_return_requests.sql` (233 lines) — creates return_requests, return_request_items, return_request_events, extends refunds/disputes/settlement_records |
| P13 implementation | Partial — 12-state FSM, worker, schema, service (959 lines), controller, oversight page |
| P13 tests | 162/162 focused tests passed (historical — not re-verified this session) |
| Regression | 3,098/3,098 passed (historical — not re-verified this session) |

---

## 2. Formal Decision and Open-Question Status

### 2.1 Decisions D01–D15

**All 15 decisions remain PROVISIONAL — PENDING APPROVAL. Zero have attributable approval evidence.**

| ID | Topic | Approver | Status | Evidence |
|---|---|---|---|---|
| D01 | Return window | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL | None |
| D02 | Merchant response SLA | Head of Merchant Partnerships | PROVISIONAL — PENDING APPROVAL | None |
| D03 | Merchant timeout → escalation | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL | None |
| D04 | Merchant-responsibility commission | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL | None |
| D05 | Buyer-remorse commission | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL | None |
| D06 | Platform-responsibility commission | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL | None |
| D07 | Carrier-damage commission | Finance Lead / CFO | PROVISIONAL — PENDING APPROVAL | None |
| D08 | Full sub-order return delivery fee | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL | None |
| D09 | Delivery-fee exception | Head of Operations / COO (co: Finance) | PROVISIONAL — PENDING APPROVAL | None |
| D10 | Carrier-damage delivery fee | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL | None |
| D11 | Administrator review target | Head of Operations / COO | PROVISIONAL — PENDING APPROVAL | None |
| D12 | Settlement adjustment authorization | Financial Controller (co: Risk) | PROVISIONAL — PENDING APPROVAL | None |
| D13 | Voucher permitted outcomes | Finance Lead / CFO (co: Risk) | PROVISIONAL — PENDING APPROVAL | None |
| D14 | Deployment target (single-process pilot) | CTO / Head of Engineering | PROVISIONAL — PENDING APPROVAL | None |
| D15 | Pilot operational controls | CTO / Head of Engineering (co: SRE) | PROVISIONAL — PENDING APPROVAL | None |

### 2.2 Open Questions OQ-01–OQ-12

**All 12 open questions remain OPEN. Zero have attributable resolution evidence.**

| ID | Topic | Accountable | Status | Phase 1 Block? |
|---|---|---|---|---|
| OQ-01 | Business calendar definition | Head of Operations / COO | OPEN | **YES** |
| OQ-02 | SLA trigger timestamps | Head of Operations / COO | OPEN | **YES** |
| OQ-03 | Eligibility edge cases | Head of Operations / COO | OPEN | No |
| OQ-04 | Commission allocation + rounding | Finance Lead / CFO + Engineering | OPEN | **YES** |
| OQ-05 | Delivery-fee allocation (D09) | Finance Lead / CFO | OPEN | No |
| OQ-06 | Exception audit trail (D09) | Finance Lead / CFO (co: Risk) | OPEN | No |
| OQ-07 | Settlement adjustment authorization (D12) | Financial Controller | OPEN | No |
| OQ-08 | Voucher risk/fraud outcomes (D13) | Risk / Fraud Lead | OPEN | No |
| OQ-09 | Pilot operational owners | CTO / SRE | OPEN | No (Phase 3) |
| OQ-10 | Pilot scope and criteria | CTO / Head of Engineering | OPEN | No (Phase 3) |
| OQ-11 | Materiality definition | Head of Operations / COO | OPEN | No |
| OQ-12 | Dispute workflow | Head of Operations / COO | OPEN | No |

---

## 3. Provisional Decisions from New Specification

The consolidated specification (§3–§6) introduces provisional stakeholder preferences. These are **preferences, not approvals**. Each is reconciled against the existing governance baseline below.

### 3.1 Return Eligibility and Deadlines (§3.1)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| D01 — Return window | ~~7 calendar days~~ → **14 calendar days** from confirmed delivery (preference confirmed; 7-day proposal withdrawn) | **14 days** (architecture lock BD-P13-WINDOW-004, `RETURN_WINDOW_DAYS = 14`) | **CONSISTENT** — C-NEW-01 RESOLVED. Provisional preference aligns with existing architecture and code baseline. Formal approval still required. |
| D02 — Merchant SLA | 72 elapsed hours, continuous, from server creation timestamp | 72 hours, `MERCHANT_SLA_HOURS = 72` | Consistent |
| D03 — Merchant timeout | Escalation to admin; no auto-approve/reject/expire | Same — ESCALATED state proposed | Consistent |
| D11 — Admin review target | 3 business days; configurable calendar; UTC; configured holidays excluded | Same provisional position | Consistent |
| OQ-03 — Edge cases | Cancelled orders excluded; partial deliveries use item timestamps; non-delivery uses separate workflow; carrier damage within 14-day window | Same positions in v3 reconciliation | Consistent |

### 3.2 Financial Responsibility and Commission Reversal (§3.2)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| D04 — Merchant responsibility | Reverse commission for eligible items | Same | Consistent |
| D05 — Buyer remorse | Retain commission for eligible items | Same | Consistent |
| D06 — Platform responsibility | Reverse commission for eligible items | Same | Consistent |
| D07 — Carrier damage | Reverse commission for eligible items | Same | Consistent |
| Mixed responsibility | Item-level allocation; reverse only eligible items | Same | Consistent |
| OQ-04.1 — Allocation basis | VAT-exclusive, delivery-fee-exclusive net goods | Same (C-01 correction in v3) | Consistent |
| OQ-04.2 — Source of truth | Immutable finalized order financial breakdown | Same | Consistent |
| OQ-04.3 — Mixed allocation | Original item-level commission allocation | Same | Consistent |
| OQ-04.4 — Rounding | **Cumulative-target rounding** (Option C) | Three options presented; none approved | Preference stated, not decision |
| OQ-04.5 — Tolerance | **Zero minor currency units** | Not explicitly stated in existing docs | **NEW — N-NEW-01** |
| OQ-04.6 — Historical backfill | None | Same | Consistent |
| OQ-04.7 — Automatic clawback | None | Same | Consistent |
| OQ-04.8 — Reclassification | Preserve original + auditable adjustment | Same | Consistent |
| OQ-04.9 — Persistence | **Dedicated commission-reversal ledger** (subject to verification) | Two options: (1) `refunds.commission_reversal_minor`, (2) new ledger table | **Stronger preference signal — see §6.2** |
| OQ-04.10 — Concurrency | Lock order financial breakdown in DB transaction | Same | Consistent |

### 3.3 Delivery-Fee Refunds and Exceptions (§3.3)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| D08 — Full sub-order return | Refund original delivery fee | Same | Consistent |
| D09 — Delivery-fee exception | Refund full original delivery fee when exception applies | Same | Consistent |
| D10 — Carrier damage | Full delivery fee if material compromise; admin review if limited | Same | Consistent |
| OQ-06 — Exception approvals | **Two distinct users**: one Finance, one administrator; role eligibility enforced server-side | OQ-06 asks "what requirements apply" — no specific dual-approval stated | **NEW provisional content — N-NEW-02** |
| OQ-11 — Materiality | Impact on whole order/sub-order | Same | Consistent |

### 3.4 Settlement Authorization and Currency Conversion (§3.4)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| Settlement threshold | **USD $10 equivalent** — below: 1 approver; at/above: 2 distinct (Finance + admin) | OQ-07 asks "what amount thresholds apply" — no specific threshold defined | **NEW provisional content — N-NEW-03** |
| Exchange-rate policy | **Unresolved implementation blocker** — provider, rate type, valuation timestamp, failure behavior all TBD | Only mentioned peripherally in blocker reconciliation Q4 (reclassification timing) | **NEW dependency — N-NEW-04** |
| Monthly reconciliation | Finance reconciliation is monthly; specific reporting items listed | Not explicitly stated in existing docs | **NEW provisional content — N-NEW-05** |

### 3.5 Voucher-Related Refund Behavior (§3.5)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| D13 — Permitted outcomes | (1) Cash refund to original payment method, (2) Preserve unused voucher balance. **No replacement voucher or store credit.** | OQ-08 asks about permitted outcomes — not yet specified | **NEW provisional content — N-NEW-06** |
| Voucher rules | Never restore redeemed/expired value; preserve original expiry/terms; no auto-backfill | Not in existing docs | **NEW provisional content** |

### 3.6 Return Lifecycle and Escalation (§5)

| Item | New Spec | Existing Governance | Reconciliation |
|---|---|---|---|
| ESCALATED state | Add ESCALATED; REQUESTED → ESCALATED instead of EXPIRED | Same — proposed in architecture lock | Consistent |
| Migration 0059 | Inspect before planning schema amendment | Known — creates return_requests with 12-state CHECK constraint | Consistent |
| Idempotent escalation | Prevent duplicate escalation events | Same | Consistent |

### 3.7 Scheduler and Deployment (§6)

| Decision | New Spec Preference | Existing Governance | Reconciliation |
|---|---|---|---|
| D14 — Deployment target | Single-process pilot, allowlisted cohort, gated expansion | Same | Consistent |
| D15 — Operational controls | Four controls with specific thresholds | Same | Consistent |
| Pilot observation | **30 consecutive days** | Not specified in existing docs | **NEW — N-NEW-07** |
| Stop conditions | **Seven explicit stop conditions** listed | Not specified in existing docs | **NEW — N-NEW-08** |
| Success criteria | **Nine specific criteria** for expansion | OQ-10 asks to define these | **NEW — N-NEW-09** |

---

## 4. Missing Approver Evidence

**No approver evidence exists for any decision or open question.** The following table lists the exact evidence required before Phase 1 can begin:

### 4.1 Phase 1 Critical-Path Blockers

| ID | Required Evidence | Approver | Meeting |
|---|---|---|---|
| D01 | Decision ID, provisional policy, **approved/rejected/modified**, approver identity + role, date, rationale, conditions, evidence reference | Head of Operations / COO | Meeting 1 |
| D02 | Same | Head of Merchant Partnerships | Meeting 1 |
| D03 | Same | Head of Operations / COO | Meeting 1 |
| D04–D07 | Same (each individually) | Finance Lead / CFO | Meeting 2 |
| D08–D10 | Same (each individually) | Head of Operations / COO | Meeting 1 |
| D11 | Same | Head of Operations / COO | Meeting 1 |
| OQ-01 | Question, resolution, accountable role, date, evidence reference | Head of Operations / COO | Meeting 1 |
| OQ-02 | Same | Head of Operations / COO | Meeting 1 |
| OQ-04 Finance | Algorithm choice, mixed-responsibility interpretation, financial invariants, outstanding accounting questions — all with Finance approval | Finance Lead / CFO | Meeting 2 |
| OQ-04 Engineering | Data source, locking strategy — signed off after Finance policy | CTO / Head of Engineering | Meeting 4 (depends on Meeting 2) |

### 4.2 Non-Critical-Path (Phase 2/3)

| ID | Required Evidence | Approver | Phase |
|---|---|---|---|
| D12 | Settlement adjustment authorization | Financial Controller (co: Risk) | Phase 1 (parallel OK) |
| D13 | Voucher permitted outcomes | Finance Lead / CFO (co: Risk) | Phase 1 (parallel OK) |
| OQ-03 | Eligibility edge cases | Head of Operations / COO | Phase 2 (before WP-2B) |
| OQ-05–OQ-08 | Various | Various | Phase 2 |
| D14, D15 | Deployment + controls | CTO / Engineering (co: SRE) | Phase 1 (parallel, needs OQ-09/10) |
| OQ-09–OQ-12 | Various | Various | Phase 3 (WP-3G) |

---

## 5. Unresolved Exchange-Rate Policy

**Status: UNRESOLVED — BLOCKS cross-currency settlement threshold evaluation.**

The new specification (§3.4) explicitly identifies this as an "unresolved implementation blocker." The following must be formally approved before cross-currency threshold evaluation can be implemented:

1. Authoritative exchange-rate provider or accounting source
2. Rate type and direction (buy/sell/mid; base→quote)
3. Valuation timestamp or valuation-time rule
4. Behavior for unavailable, stale, invalid, or disputed rates
5. Rounding and comparison rules
6. Audit and reproducibility requirements

**Current repository state:** No exchange-rate service, provider integration, or rate table exists in the codebase. The platform operates in a single currency (SYP) per P12 architecture. Cross-currency comparison is explicitly avoided in the current catalog pricing implementation.

**Impact:** The settlement approval threshold (USD $10 equivalent) cannot be evaluated for non-USD, non-SYP orders without this policy. The spec correctly mandates: "If the rate is unavailable or invalid, fail safely and hold the settlement for review."

**Recommendation:** Add this as an explicit open question (candidate: OQ-13 or sub-question of OQ-07) requiring Finance + Engineering joint resolution.

---

## 6. Unresolved Business-Calendar Configuration

**Status: UNRESOLVED — BLOCKS D11 implementation.**

The new specification (§3.1 D11) requires:
- Configurable business calendar
- UTC timezone basis
- Configured holidays excluded
- No unspecified business-hour schedules

**Current repository state:** No business calendar, holiday configuration, or timezone-aware deadline calculation exists. The merchant SLA uses raw elapsed hours (72h from creation).

**Outstanding questions (OQ-01):**
- Who owns the business calendar? (Finance? Operations? HR?)
- How are holidays configured? (Database table? Config file? External service?)
- What is the update frequency? (Annual? Ad hoc?)
- Who approves calendar changes?
- How are timezones handled for multi-timezone organizations?

**Recommendation:** OQ-01 must be resolved by Head of Operations / COO before D11 implementation. The implementation should support a pluggable calendar source to avoid hardcoding.

---

## 7. Engineering Feasibility Findings

### 7.1 FSM ESCALATED State — Feasible with Forward Migration

**Current state:** 12-state FSM with CHECK constraint in migration 0059 (line 124–132). The constraint includes: REQUESTED, MERCHANT_APPROVED, BUYER_SHIPPED, RECEIVED, INSPECTED, REFUND_PENDING, REFUND_FAILED, REFUNDED, MERCHANT_REJECTED, CANCELLED, EXPIRED, REJECTED_AFTER_INSPECTION.

**Required change:** Add ESCALATED to the CHECK constraint. Modify transition map: REQUESTED → ESCALATED (replacing or supplementing REQUESTED → EXPIRED).

**Feasibility:** Straightforward. Requires a new forward migration (0060) to:
1. Alter the CHECK constraint to include ESCALATED
2. Update the partial unique index `idx_return_requests_active_per_order` to exclude ESCALATED from active returns (since ESCALATED is not terminal — admin can still resolve)
3. Update `getCumulativeReturnedQuantities()` to include ESCALATED in the effective-status list (line 851–854)

**Risk:** Low. Migration 0059 uses `IF NOT EXISTS` guards, so it is idempotent. Migration 0060 must similarly be idempotent.

### 7.2 Commission Reversal — Feasible but Architecture Decision Pending

**Current state:**
- `adjustSettlement()` (line 731–768) creates ADJUSTMENT settlement records with `commissionMinor: 0` — **does not reverse commission**
- No dedicated commission-reversal ledger exists
- Cumulative refund tracking uses `refunds.amountMinor` via `getCumulativeRefundedAmount()` (line 861–870)
- `orderFinancialBreakdown.commissionMinor` is `bigint` at order level — no per-item breakdown stored

**Required change (per new spec preference):**
- Implement cumulative-target rounding algorithm
- Create dedicated commission-reversal ledger OR extend refunds table
- Responsibility-dependent commission treatment in settlement adjustment path
- Item-level allocation from immutable financial data

**Feasibility:** Feasible but requires:
1. Finance approval of algorithm (Option C — cumulative-target)
2. Engineering sign-off on persistence model (dedicated ledger vs. refunds column)
3. Schema verification: can item-level commission allocations be recovered from existing data?

**Risk:** MEDIUM. The current `orderFinancialBreakdown` stores `commissionMinor` at the sub-order level. Item-level allocation requires either:
- Storing per-item commission at order creation time (schema change), OR
- Computing item-level allocation at return time from net goods proportions (derivable from immutable data)

The spec prefers derivation from immutable data (§3.2: "Derive eligible item-level net-goods allocations from immutable finalized financial data"). This is feasible because `order_items` stores `unit_price_minor` and `quantity` at checkout time, and `orderFinancialBreakdown` stores the total `commissionMinor`. The per-item allocation can be computed as:

```
item_commission = round(total_commission × (item_net_goods / total_net_goods))
```

This is the same formula already used for cumulative-target rounding. **No schema change required for item-level allocation** — it is derivable.

### 7.3 Settlement Adjustment Commission Reversal — Gap Identified

**Current code gap:** `adjustSettlement()` at line 759 sets `commissionMinor: 0` for ADJUSTMENT records. This means the current implementation does NOT reverse commission when a return is processed. This must change when responsibility-dependent commission reversal is approved.

**Required change:** The ADJUSTMENT settlement record must include the computed commission reversal amount (negative or zero depending on responsibility category).

### 7.4 Worker Exclusivity — Not Verified

**Current state:** The `ReturnExpirationWorker` polls for expired returns. The new spec requires exactly one worker-enabled API instance.

**Finding:** The current code does not have a worker exclusivity enforcement mechanism. The worker runs in every API instance that starts it. This must be addressed before pilot activation.

**Risk:** HIGH for multi-instance deployment. LOW for single-process pilot (the spec's selected target).

### 7.5 Tenant Isolation — Existing Controls Intact

**Current state:** All return operations use `assertOrderAccessible()` and `assertStoreInOrg()` from `tenant-scope`. Tenant isolation is enforced at the query level.

**Finding:** No gaps identified in the current tenant-isolation implementation for returns. New financial operations (commission reversal, settlement adjustment) must maintain the same controls.

---

## 8. Migration and Compatibility Risks

### 8.1 Migration 0059 — Already Applied

Migration 0059 creates the return_requests infrastructure. It uses `IF NOT EXISTS` guards and is idempotent. It has been applied to the development database.

**Risk of editing:** None. Migration 0059 must NOT be modified. Any schema changes require a forward migration (0060+).

### 8.2 Migration 0060 — ESCALATED State

**Required changes:**
- Add ESCALATED to CHECK constraint
- Update partial unique index for active returns
- No data migration needed (no existing ESCALATED rows)

**Rollback:** Drop constraint, recreate without ESCALATED. Safe because no data depends on the new state.

### 8.3 Migration 0061+ — Commission Reversal Ledger (if approved)

**Required changes (if Option 2 selected):**
- New `commission_reversals` table
- Indexes on order_id, return_request_id, tenant
- Constraints for cumulative cap enforcement

**Required changes (if Option 1 selected):**
- Add `commission_reversal_minor` column to `refunds` table
- Index for cumulative tracking

**Risk:** LOW for Option 1 (column addition). MEDIUM for Option 2 (new table with constraints).

### 8.4 Historical Data

**No historical return data exists** — the returns feature is new in P13. No historical backfill is required or authorized.

---

## 9. Recommended Implementation Sequence

### Phase A — Discovery and Governance Reassessment (CURRENT — COMPLETE)

**Deliverable:** This document.

### Phase B — Approved Technical Design

**Gate:** Phase 0 closure (13/15 decisions + OQ-01 + OQ-02 + OQ-04 resolved).

**Work packages (from existing phase plan):**
- WP-1A: FSM ESCALATED state design
- WP-1B: FSM transition map amendment
- WP-1C: Worker timeout → escalation design
- WP-1D: Commission reversal calculation design
- WP-2A: Migration 0060 (ESCALATED state)
- WP-2B: FSM implementation
- WP-2C: Commission reversal implementation
- WP-2D: Settlement adjustment extension
- WP-3A: Authorization and audit trail
- WP-3B: Tenant isolation verification
- WP-3C: Concurrency and idempotency tests
- WP-3D: Pilot operational controls
- WP-3E: Monitoring and alerting
- WP-3F: Pilot allowlist and cohort
- WP-3G: Pilot verification

### Phase C — Approved Implementation

**Gate:** Phase B design approved.

### Phase D — Independent Verification

**Deliverable:** `P13-INDEPENDENT-VERIFICATION-REPORT.md`

### Phase E — Pilot Readiness and Release Gate

**Deliverable:** `P13-PRODUCTION-PILOT-READINESS-AND-ROLLBACK.md`

---

## 10. Explicit Blocked, Permitted, and Conditional Work

### 10.1 BLOCKED — Cannot Begin Until Formal Approval

| Work | Blocks | Reason |
|---|---|---|
| FSM ESCALATED state implementation | WP-1B, WP-2B | Requires D03 approval |
| Commission reversal calculation | WP-1D, WP-2C | Requires D04–D07 + OQ-04 Finance approval |
| Settlement adjustment extension | WP-2D | Requires D12 + OQ-04 Finance approval |
| Delivery-fee exception workflow | WP-2B extension | Requires D09 + OQ-06 approval |
| Voucher refund behavior | WP-2B extension | Requires D13 + OQ-08 approval |
| Migration 0060 (ESCALATED) | WP-2A | Requires D03 approval |
| Migration 0061+ (commission ledger) | WP-2C | Requires OQ-04 Engineering sign-off |
| Business calendar implementation | WP-2B extension | Requires OQ-01 resolution |
| Pilot activation | WP-3F | Requires D14 + D15 + OQ-09 + OQ-10 |

### 10.2 PERMITTED — May Proceed Without Approval

| Work | Rationale |
|---|---|
| Read documentation and source code | Phase A explicitly allowed |
| Inspect repository and working tree | Phase A explicitly allowed |
| Reassess approval and release gates | Phase A explicitly allowed |
| Produce traceability matrix | Phase A explicitly allowed |
| Identify conflicts and dependencies | Phase A explicitly allowed |
| Prepare implementation plan and test matrix | Phase A explicitly allowed |
| Run safe, non-destructive checks | Phase A explicitly allowed |
| Produce this reassessment document | Phase A deliverable |

### 10.3 CONDITIONAL — May Proceed with Restrictions

| Work | Condition |
|---|---|
| Technical design (Phase B) | Only after Phase 0 closure declaration |
| Test planning | May proceed in parallel with approval, but test execution requires implementation approval |
| Migration planning | May design forward migration structure, but must not apply or test against production |

---

## 11. Conflicts and New Content Summary

### 11.1 Conflicts with Existing Governance

| ID | Topic | New Spec | Existing Governance | Severity | Status |
|---|---|---|---|---|---|
| ~~C-NEW-01~~ | ~~D01 — Return window~~ | ~~7 calendar days~~ | ~~14 calendar days~~ | ~~HIGH~~ | **RESOLVED** — Provisional preference confirmed as 14 calendar days from confirmed delivery, consistent with existing architecture lock BD-P13-WINDOW-004 and code baseline (`RETURN_WINDOW_DAYS = 14`). The 7-day proposal in the consolidated specification §3.1 is withdrawn. Formal approval by Head of Operations / COO still required. |

### 11.2 New Provisional Content (Not in Existing Governance)

| ID | Topic | New Spec Content | Existing Gap | Action Required |
|---|---|---|---|---|
| N-NEW-01 | OQ-04 tolerance | Zero minor units | Not explicitly stated | Add to OQ-04 Finance decision worksheet |
| N-NEW-02 | OQ-06 dual approval | Two distinct users (Finance + admin) | OQ-06 open-ended | Add to OQ-06 resolution |
| N-NEW-03 | Settlement threshold | USD $10 equivalent | OQ-07 open-ended | Add to D12/OQ-07 resolution |
| N-NEW-04 | Exchange-rate policy | Unresolved blocker | Not in existing docs | Add as new OQ or sub-question of OQ-07 |
| N-NEW-05 | Monthly reconciliation | Finance reconciliation monthly | Not explicitly stated | Add to Finance workflow requirements |
| N-NEW-06 | D13 voucher outcomes | Cash refund + preserve unused balance only | OQ-08 open-ended | Add to D13/OQ-08 resolution |
| N-NEW-07 | Pilot observation | 30 consecutive days | Not specified | Add to D14/OQ-10 resolution |
| N-NEW-08 | Pilot stop conditions | Seven explicit conditions | Not specified | Add to D15/OQ-10 resolution |
| N-NEW-09 | Pilot success criteria | Nine specific criteria | OQ-10 open-ended | Add to D14/OQ-10 resolution |

---

## 12. Gate Reassessment

### 12.1 Phase 1 Entry (17 Granular Conditions)

| # | Condition | Status | Blocker? |
|---|---|---|---|
| 1 | D01 approved | FAIL — no evidence | YES |
| 2 | D02 approved | FAIL — no evidence | YES |
| 3 | D03 approved | FAIL — no evidence | YES |
| 4 | D04 approved | FAIL — no evidence | YES |
| 5 | D05 approved | FAIL — no evidence | YES |
| 6 | D06 approved | FAIL — no evidence | YES |
| 7 | D07 approved | FAIL — no evidence | YES |
| 8 | D08 approved | FAIL — no evidence | YES |
| 9 | D09 approved | FAIL — no evidence | YES |
| 10 | D10 approved | FAIL — no evidence | YES |
| 11 | D11 approved | FAIL — no evidence | YES |
| 12 | D14 approved | FAIL — no evidence | YES |
| 13 | D15 approved | FAIL — no evidence | YES |
| 14 | OQ-01 resolved | FAIL — open | YES |
| 15 | OQ-02 resolved | FAIL — open | YES |
| 16 | OQ-04 Finance policy approved | FAIL — no evidence | YES |
| 17 | OQ-04 Engineering sign-off | FAIL — no evidence | YES |

**Phase 1 status: BLOCKED — 0/17 conditions met.**

### 12.2 Phase 2 Entry (12 Conditions)

All 15 decisions + all in-scope OQs resolved before dependent work packages.

**Phase 2 status: BLOCKED — 0/15 decisions approved, 0/11 OQs resolved.**

### 12.3 Release Gates (G-01 through G-08)

| Gate | Description | Status |
|---|---|---|
| G-01 | All Phase 1 work packages verified | FAIL |
| G-02 | All Phase 2 work packages verified | FAIL |
| G-03 | All Phase 3 verification work packages complete | FAIL |
| G-04 | Independent verification report produced | FAIL |
| G-05 | Pilot readiness report produced | FAIL |
| G-06 | All release-gate evidence reviewed | FAIL |
| G-07 | Explicit release authorization recorded | FAIL |
| G-08 | Pilot allowlist and pause capability verified | FAIL |

**Release status: BLOCKED — 0/8 gates PASS.**

### 12.4 Baseline Checkpoints (G-09, G-10)

| Gate | Description | Status | Notes |
|---|---|---|---|
| G-09 | Regression & Build Baseline | PASS (pre-implementation) | 3,098/3,098 (historical) — must re-verify after implementation |
| G-10 | P12 Regression Preservation | PASS (pre-implementation) | 162/162 P13 (historical) — must re-verify after implementation |

G-09 and G-10 are pre-implementation baseline verification checkpoints, not release-blocking gates.

---

## 13. Status

**`BLOCKED — FORMAL APPROVAL REQUIRED`**

Phase A is complete. The consolidated specification has been reconciled against the existing governance baseline. One conflict was identified and resolved (C-NEW-01: D01 return window — 7-day proposal withdrawn, 14-day preference confirmed as provisional). Nine new provisional content items identified (N-NEW-01 through N-NEW-09). All 15 decisions remain PROVISIONAL — PENDING APPROVAL. All 12 OQs remain OPEN. Phase 1 entry is blocked at 0/17 conditions.

**No implementation may begin.** The next step is formal stakeholder scheduling and approval recording per the meeting sequence defined in `P13-STAKEHOLDER-APPROVAL-EXECUTION-PACKAGE.md`.

---

## 14. Files Inspected

| File | Lines | Purpose |
|---|---|---|
| `apps/api/src/modules/returns/returns.service.ts` | 959 | FSM, settlement adjustment, cumulative tracking |
| `apps/api/src/modules/returns/returns.schema.ts` | 75 | Return requests, items, events schema |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | ~120 | Worker polling for expired returns |
| `apps/api/src/modules/returns/returns.controller.ts` | ~180 | API endpoints |
| `infra/drizzle/migrations/0059_return_requests.sql` | 233 | Migration creating return infrastructure |
| `P13-STAKEHOLDER-APPROVAL-EXECUTION-PACKAGE.md` | 572 | Stakeholder meeting package |
| `P13-APPROVAL-EXECUTION-READINESS-REPORT.md` | 319 | Readiness assessment |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | 312 | Phase entry criteria |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | 266 | Meeting agendas |
| `P13-PHASE-0-OPEN-DECISION-SHEETS.md` | 355 | OQ evidence requirements |
| `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | 526 | Rounding algorithm analysis |
| `P13-POLICY-RECONCILIATION-v3.md` | ~469 | Corrected policy specification |
| `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` | 304 | Prior conflict report |
| `P13-IMPLEMENTATION-READINESS-AND-PHASE-PLAN.md` | 420 | Work package structure |
| `P13-PHASE-0-APPROVAL-EVIDENCE-INTAKE-AND-GATE-REASSESSMENT.md` | ~382 | Evidence intake procedures |
| `P13-PHASE-0-GATE-CONSISTENCY-AUDIT.md` | ~218 | Gate audit |
| `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` | 4 sheets | Decision register workbook |
| `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | 927 | Architecture lock |

---

---

## 15. Final Report Format (per Specification §11)

### A. Status

**`BLOCKED — FORMAL APPROVAL REQUIRED`**

Phase A (Discovery and Governance Reassessment) is complete. No formal authorization exists. Phase 1 entry is blocked at 0/17 conditions.

### B. Work Completed

| Activity | Evidence |
|---|---|
| Branch/HEAD verified | `git branch --show-current` → `develop`; `git log --oneline -3` → `8d60e36` |
| Worktree inspected | `git status --short -- apps/ infra/` → empty |
| Node.js/pnpm versions | v26.4.0 / 9.15.9 |
| Migration history inspected | `infra/drizzle/migrations/0001..0059` — 59 migrations, latest is `0059_return_requests.sql` |
| Source code inspected | `returns.service.ts` (959 lines), `returns.schema.ts` (75 lines), `return-expiration.worker.ts`, `returns.controller.ts` |
| 18 governance documents read | Listed in §14 |
| Workbook inspected | `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` — 4 sheets |
| New specification reconciled | §3 of this document — every provisional preference compared against existing governance |
| Conflicts identified | 1 conflict (C-NEW-01), 9 new content items (N-NEW-01 through N-NEW-09) |
| Engineering feasibility assessed | §7 — FSM, commission reversal, settlement gap, worker exclusivity, tenant isolation |
| Migration risks assessed | §8 — migration 0059 intact, 0060+ planned |
| Phase A deliverable produced | This document (531 lines) |

### C. Policy Traceability

| Decision ID | Provisional Policy | Formal Approval | Implementation | Verification | Remaining Blockers |
|---|---|---|---|---|---|
| D01 | 14 calendar days from confirmed delivery | NOT APPROVED | IMPLEMENTED (`RETURN_WINDOW_DAYS = 14`) | NOT VERIFIED | None — provisional preference consistent with code |
| D02 | 72h elapsed, continuous | NOT APPROVED | IMPLEMENTED (`MERCHANT_SLA_HOURS = 72`) | NOT VERIFIED | None |
| D03 | Timeout → ESCALATED | NOT APPROVED | NOT IMPLEMENTED (code: → EXPIRED) | NOT VERIFIED | Migration 0060 needed |
| D04 | Merchant: reverse commission | NOT APPROVED | NOT IMPLEMENTED (code: no commission reversal) | NOT VERIFIED | OQ-04 Finance |
| D05 | Buyer remorse: retain commission | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-04 Finance |
| D06 | Platform: reverse commission | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-04 Finance |
| D07 | Carrier damage: reverse commission | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-04 Finance |
| D08 | Full sub-order: refund delivery fee | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | None |
| D09 | Exception: full original delivery fee | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-06 |
| D10 | Carrier damage: full delivery fee if material | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-11 |
| D11 | 3 business days admin SLA | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-01, OQ-02 |
| D12 | Settlement adjustment authorization | NOT APPROVED | PARTIAL (code has adjustSettlement but no dual-approval) | NOT VERIFIED | OQ-07, exchange-rate policy |
| D13 | Voucher: cash refund + preserve unused balance | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-08 |
| D14 | Single-process pilot | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-09, OQ-10 |
| D15 | Four operational controls | NOT APPROVED | NOT IMPLEMENTED | NOT VERIFIED | OQ-09, OQ-10 |

### D. Financial Safety

| Requirement | Current Evidence | Status |
|---|---|---|
| Exact financial reconciliation | No commission reversal implemented | NOT IMPLEMENTED |
| Cumulative caps | `getCumulativeRefundedAmount()` exists; no cumulative commission cap | PARTIAL — refund cap exists, commission cap missing |
| Idempotency | Idempotency key unique index on `return_requests` | IMPLEMENTED for return creation; NOT for financial operations |
| Concurrency | `FOR UPDATE` on inventory row (line 664); cumulative cap re-reads after lock | IMPLEMENTED for inventory; NOT for commission reversal |
| Historical-data preservation | `orderFinancialBreakdown` never mutated (line 13) | IMPLEMENTED |
| Manual adjustment behavior | `adjustSettlement()` creates ADJUSTMENT records (line 752–766) | IMPLEMENTED but `commissionMinor: 0` — gap identified (§7.3) |
| Voucher correctness | No voucher refund logic implemented | NOT IMPLEMENTED |

### E. Operational Readiness

| Requirement | Current Evidence | Status |
|---|---|---|
| Worker exclusivity | No enforcement mechanism — worker runs in every API instance | NOT IMPLEMENTED |
| Polling-failure alert | No alert mechanism | NOT IMPLEMENTED |
| Overdue-request alert | No alert mechanism | NOT IMPLEMENTED |
| Startup/heartbeat alert | No alert mechanism | NOT IMPLEMENTED |
| Alert delivery | No alerting infrastructure for returns | NOT IMPLEMENTED |
| Pilot allowlisting | No allowlist mechanism | NOT IMPLEMENTED |
| Pause and rollback | No pause mechanism | NOT IMPLEMENTED |

### F. Remaining Actions

| Priority | Action | Owner | Blocks |
|---|---|---|---|
| 1 | ~~Resolve C-NEW-01~~ — **RESOLVED.** D01 preference confirmed as 14 calendar days. Formal approval by Head of Operations / COO still required. | Head of Operations / COO | D01 formal approval (Meeting 1) |
| 2 | Schedule Meeting 2 (Finance) — approve D04–D07, D12, D13 Finance aspects, OQ-04 Finance policy | Finance Lead / CFO | D04–D07, OQ-04, commission reversal |
| 3 | Schedule Meeting 1 (Operations) — approve D01–D03, D08–D11 | Head of Operations / COO | FSM design, eligibility, SLA |
| 4 | Schedule Meeting 4 (Engineering) — OQ-04 Engineering sign-off (depends on Meeting 2) | CTO / Head of Engineering | Commission reversal persistence |
| 5 | Add exchange-rate policy as formal OQ (N-NEW-04) | Finance + Engineering | D12 cross-currency threshold |
| 6 | Add OQ-04 tolerance (zero minor units) to Finance decision worksheet (N-NEW-01) | Finance Lead / CFO | OQ-04 resolution |
| 7 | Record all decisions with 10-field template per evidence intake procedures | Governance recorder | Phase 0 closure |
| 8 | Re-run regression suite (3,098 tests) to verify current baseline | Engineering | G-09 re-verification |
| 9 | Re-run P13 focused suite (162 tests) to verify current baseline | Engineering | G-10 re-verification |
| 10 | After Phase 0 closure: produce Phase B technical design document | Engineering | Phase 1 entry |

---

**Attestation:** This document was produced by read-only inspection of the repository at `develop@8d60e36`. No source code, migrations, or tracked files were modified. No approval was inferred, invented, or recorded. All decisions remain PROVISIONAL — PENDING APPROVAL. All gates remain BLOCKED.
