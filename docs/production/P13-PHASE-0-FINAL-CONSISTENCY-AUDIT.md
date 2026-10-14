# P13 — Phase 0 Final Consistency Audit

**Version:** 1.0
**Purpose:** Final read-only consistency audit of the P13 Phase 0 approval package. Correct mathematical inaccuracies and approval-boundary ambiguities before circulation for business sign-off.
**Status:** AUDIT COMPLETE — corrections applied. Documentation ready for circulation with noted caveats.
**Baseline:** branch `develop`, HEAD `8d60e36`.
**Audit date:** 2026-10-10.

---

## 1. Findings and Severity

### F-01 (CRITICAL) — Option A cap-at-remaining does not guarantee exact reconciliation

**Severity:** CRITICAL — mathematical inaccuracy in financial algorithm comparison.

**Finding:** The original documents claimed Option A (cap-at-remaining) produces a cumulative total of exactly 100 in both over-rounding and under-rounding cases. This is **incorrect** for the under-rounding case.

**Root cause:** When each individual partial return's rounding rounds down (e.g., 14.286 → 14), the cap `min(raw, remaining)` never engages because `raw < remaining` at every step. The cumulative total falls short by up to N-1 minor units (where N is the number of partial returns).

**Worked example (7 items, commission = 100):**
- Each return: `round(100 × 100/700) = round(14.286) = 14`
- Cap: `min(14, remaining)` — remaining starts at 100 and decreases by 14 each step
- Return 1: min(14, 100) = 14. Return 2: min(14, 86) = 14. ... Return 7: min(14, 16) = 14.
- Cumulative: 14 × 7 = **98** (short by 2)

**Correction applied:** All comparison tables, behavior descriptions, and Finance decision records now state that Option A produces 98 (short by 2) in the under-rounding case. Options B and C correctly produce 100.

**Files corrected:**
- `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` — §3.3, §6 comparison table, §8.1 Q1
- `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` — §1.2 Option A behavior, §1.2 comparison table
- `P13-PHASE-0-APPROVAL-AGENDA-v2.md` — Meeting 2 Option A description
- `P13-PHASE-0-OPEN-DECISION-SHEETS.md` — OQ-04 proposed default

---

### F-02 (MEDIUM) — Stale document version references

**Severity:** MEDIUM — readers could consult superseded documents.

**Finding:** Six locations in `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` and two in `P13-PHASE-0-APPROVAL-AGENDA-v2.md` referenced `P13-PHASE-0-BLOCKER-RECONCILIATION.md` (v1) instead of `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md`.

**Correction applied:** All references updated to v2. The v1 document remains in `docs/production/` for historical reference but is superseded.

---

### F-03 (LOW) — Business vs. engineering approval boundary

**Severity:** LOW — no incorrect claims found, but the separation could be more explicit.

**Finding:** The documents correctly identify Finance as the approver for accounting policy (OQ-04) and Engineering as the owner of technical implementation decisions. However, the locking strategy decision (Q4 in the Finance decision record) is a **technical** decision that Engineering should recommend and Finance should accept as a constraint, not a Finance policy decision.

**Clarification:** The Finance decision record in `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §8.1 Q4 asks "Locking strategy?" as a Finance question. This is a technical implementation detail. Finance should decide **what** (the algorithm and rounding rules); Engineering should decide **how** (the locking strategy, persistence model, and concurrency controls). The locking strategy must preserve the financial invariants Finance specifies, but the choice of `FOR UPDATE` vs. advisory lock is an Engineering decision.

**No document correction applied** — the question is retained in the Finance decision record for completeness, but Finance should be advised that Q4 is a technical recommendation subject to Engineering sign-off.

---

### F-04 (INFO) — Phase-entry consistency

**Severity:** INFO — no contradictions found.

**Finding:** All documents agree on the proposed phase-entry gates:
- **Phase 1 entry:** 13 of 15 decisions approved (D01–D11, D14, D15) + OQ-01, OQ-02, OQ-04 resolved.
- **Phase 2 entry:** All 15 decisions approved. Each OQ resolved before its dependent work package.
- **Release:** All verification gates pass. Explicit release authorization recorded.

No document marks a gate complete merely because its requirements are documented. All gates correctly show AWAITING status.

---

### F-05 (INFO) — No document says an unresolved decision is approved

**Severity:** INFO — verified clean.

**Finding:** All D01–D15 consistently show `PROVISIONAL — PENDING APPROVAL`. All OQ-01–OQ-12 consistently show `OPEN`. No approver names, dates, or evidence have been invented.

---

## 2. Corrected Numerical Results for Each Algorithm

### Over-rounding example (6 items, commission = 100, net_goods_total = 600)

| Return | Independent | Option A (cap) | Option B (catch-up) | Option C (cumulative-target) |
|---|---|---|---|---|
| 1 | 17 | 17 | 17 | 17 |
| 2 | 17 | 17 | 17 | 16 |
| 3 | 17 | 17 | 17 | 17 |
| 4 | 17 | 17 | 17 | 17 |
| 5 | 17 | 16 | 16 | 16 |
| 6 | 17 | **15** | **16** | **17** |
| **Cumulative** | **102** | **100** | **100** | **100** |

All three capped algorithms produce 100 in the over-rounding case.

### Under-rounding example (7 items, commission = 100, net_goods_total = 700)

| Return | Independent | Option A (cap) | Option B (catch-up) | Option C (cumulative-target) |
|---|---|---|---|---|
| 1 | 14 | 14 | 14 | 14 |
| 2 | 14 | 14 | 14 | 15 |
| 3 | 14 | 14 | 14 | 14 |
| 4 | 14 | 14 | 14 | 14 |
| 5 | 14 | 14 | 14 | 14 |
| 6 | 14 | 14 | 14 | 15 |
| 7 | 14 | **14** | **16** | **14** |
| **Cumulative** | **98** | **98** | **100** | **100** |

**Option A produces 98 (short by 2).** Options B and C produce 100 (exact).

---

## 3. Cross-Document Consistency Findings

| Check | Result | Notes |
|---|---|---|
| Option A behavior consistent across all documents | **CORRECTED** | Was incorrect in 4 documents; now corrected. |
| Option B and C behavior consistent | **PASS** | All documents agree: both produce 100 in both cases. |
| Phase 1 entry criteria consistent | **PASS** | All documents: 13 of 15 (D01–D11, D14, D15) + OQ-01, OQ-02, OQ-04. |
| Phase 2 entry criteria consistent | **PASS** | All documents: all 15 decisions + OQs before dependent WPs. |
| Release criteria consistent | **PASS** | All documents: all gates PASS + explicit release authorization. |
| D12/D13 deferral rules consistent | **PASS** | All documents: D12/D13 may defer to Phase 2 entry; not required for Phase 1. |
| All decisions show PENDING status | **PASS** | 0 of 15 approved. No fabricated approvals. |
| All OQs show OPEN status | **PASS** | 11 in-scope + 1 out-of-scope (OQ-12). |
| Document cross-references current | **CORRECTED** | 8 stale v1 references updated to v2. |
| Responsibility-category treatment consistent | **PASS** | All documents: merchant/platform/carrier = reverse; buyer-remorse = retain; contested = hold. |
| Mixed-responsibility interpretation preserved as Finance decision | **PASS** | Interpretation 1 vs. 2 documented; not silently resolved. |
| Locking strategy identified as technical decision | **PASS** | Engineering owns locking strategy; Finance owns algorithm and rounding rules. |

---

## 4. Business Decisions Still Requiring Approval

### Finance / Accounting decisions (approver: Finance Lead / CFO)

| Decision | Description | Blocks |
|---|---|---|
| OQ-04 / Q1 | Commission rounding algorithm (Option A, B, or C) | D04, D06, D07 implementation |
| OQ-04 / Q2 | Authoritative data source for cumulative tracking | D04, D06, D07 implementation |
| OQ-04 / Q3 | Mixed-responsibility interpretation (denominator policy) | D04, D06, D07 implementation |
| OQ-04 §9 Q1 | Rounding residue tolerance (±1 minor unit acceptable?) | Financial reconciliation tests |
| OQ-04 §9 Q2 | Negative reversal / clawback policy | Settlement adjustment path |
| OQ-04 §9 Q3 | Historical refunds treatment (backfill or start from zero?) | Migration strategy |
| OQ-04 §9 Q4 | Contested reclassification timing (creation vs. reclassification date) | Settlement adjustment path |
| D04 | Commission reversal — merchant-responsible | WP-2D |
| D05 | Commission retention — buyer remorse | WP-2D |
| D06 | Commission reversal — platform-responsible | WP-2D |
| D07 | Commission reversal — carrier damage | WP-2D |
| D08 | Delivery-fee baseline | WP-2E |
| D09 | Delivery-fee exception | WP-2E |
| D10 | Delivery-fee carrier damage | WP-2E |
| D12 | Settlement recovery process | WP-2D |
| D13 | Voucher review workflow | WP-2G |
| OQ-05 | Delivery-fee allocation for exceptions | WP-2E |
| OQ-06 | Delivery-fee exception audit | WP-2E |
| OQ-07 | Settlement adjustment authorization | D12 governance |
| OQ-08 | Voucher permitted outcomes | WP-2G |
| OQ-11 | Carrier damage materiality threshold | WP-2E |

### Operations decisions (approver: Head of Operations / COO)

| Decision | Description | Blocks |
|---|---|---|
| D01 | Buyer return window (14 days) | WP-2B |
| D02 | Merchant response SLA (72h) | WP-2C |
| D03 | Escalation-on-timeout policy | WP-1A, WP-2B (critical path) |
| D11 | Admin escalation SLA (3 business days) | WP-2F |
| OQ-01 | Business calendar definition | WP-2F |
| OQ-02 | SLA trigger timestamps | WP-2C, WP-2F |
| OQ-03 | Return eligibility edge cases | WP-2B |

### Engineering / Operations decisions (approver: CTO / Head of Engineering)

| Decision | Description | Blocks |
|---|---|---|
| D14 | Deployment target (single-process pilot) | WP-3G |
| D15 | Pilot operational controls | WP-3G |
| OQ-09 | Pilot operational owners | WP-3G |
| OQ-10 | Pilot scope and criteria | WP-3G |

### Out of P13 scope

| Decision | Description | Blocks |
|---|---|---|
| OQ-12 | Carrier recovery process | None in P13 (P14+) |

---

## 5. Engineering Decisions Requiring Technical Sign-Off

These are technical implementation decisions that Engineering owns. Finance specifies the accounting policy; Engineering specifies how to implement it safely.

| Decision | Accountable | Description | Dependencies |
|---|---|---|---|
| Locking strategy | Engineering Lead / CTO | `FOR UPDATE` on payment record extended to cover full operation, or dedicated lock on `order_financial_breakdown`, or `pg_advisory_xact_lock(order_id)` | Must preserve financial invariants Finance specifies |
| Persistence model | Engineering Lead / CTO | `refunds.commission_reversal_minor` column (recommended) or new `commission_reversals` ledger table | Must support cumulative tracking for approved algorithm |
| Idempotency implementation | Engineering Lead | Idempotency key on `refunds` table prevents double-reversal | Must work with approved algorithm |
| Concurrency controls | Engineering Lead | `FOR UPDATE SKIP LOCKED` for worker; transaction serialization for refund creation | Must prevent over-reversal under concurrent access |
| Migration strategy | Engineering Lead | New migration 0060 for `ESCALATED` status; column addition for `commission_reversal_minor` | Must apply on fresh and existing databases |
| Test evidence | Engineering Lead | Unit, PostgreSQL integration, concurrency, idempotency, financial reconciliation tests | Must pass before release |

---

## 6. Phase-Entry Status and Outstanding Blockers

### Phase 1 entry (technical design)

| Requirement | Status | Evidence |
|---|---|---|
| D01–D11 approved | **AWAITING** | 0 of 11 approved |
| D14, D15 approved | **AWAITING** | 0 of 2 approved |
| OQ-04 resolved | **AWAITING** | CRITICAL — includes algorithm, data source, interpretation, rounding tolerance |
| OQ-01 resolved | **AWAITING** | Business calendar |
| OQ-02 resolved | **AWAITING** | SLA trigger timestamps |

**Phase 1 entry: BLOCKED. 0 of 5 mandatory conditions met.**

### Phase 2 entry (implementation)

| Requirement | Status | Evidence |
|---|---|---|
| D12, D13 approved | **AWAITING** | 0 of 2 approved |
| All OQs resolved before dependent WPs | **AWAITING** | 11 in-scope OQs open |

**Phase 2 entry: BLOCKED. Phase 1 must complete first.**

### Release

| Requirement | Status | Evidence |
|---|---|---|
| All Phase 2 WPs complete | **AWAITING** | Phase 2 not started |
| All Phase 3 WPs complete | **AWAITING** | Phase 3 not started |
| All gates G-01 through G-08 PASS | **AWAITING** | No gates verified |
| Explicit release authorization | **AWAITING** | No authorization granted |

**Release: BLOCKED. All phases must complete first.**

---

## 7. Exact List of Files Modified

| File | Operation | Changes |
|---|---|---|
| `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | **Corrected** | §3.3: Added under-rounding example for Option A (98, not 100). Added summary table. §6: Corrected comparison table (Option A under-rounding = 98). Corrected narrative. §8.1 Q1: Added warning about Option A limitation. |
| `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` | **Corrected** | §1.2: Corrected Option A behavior description. Corrected comparison table (Option A under-rounding = 98). Replaced "All three produce same total" with correct statement. |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | **Corrected** | Meeting 2: Added WARNING to Option A description about under-rounding limitation. Fixed 2 stale v1 references to v2. |
| `P13-PHASE-0-OPEN-DECISION-SHEETS.md` | **Corrected** | OQ-04: Added WARNING to proposed default about Option A under-rounding limitation. Added reference to technical decision document. |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | **Corrected** | Fixed 6 stale v1 references to v2. Removed duplicate companion document entry. |
| `P13-PHASE-0-FINAL-CONSISTENCY-AUDIT.md` | **Created** | This document. |

**No other files were modified. No application source code, migrations, tests, configuration, or deployment files were changed.**

---

## 8. PASS / FAIL Assessment

### Documentation readiness for circulation to approvers

**VERDICT: PASS WITH CONDITIONS**

**PASS:**
- All mathematical inaccuracies corrected. Option A under-rounding limitation now documented in all affected files.
- All three algorithm options (A, B, C) described consistently across all documents.
- Phase-entry criteria consistent across all documents.
- No unresolved decision is marked as approved.
- No approver identities, dates, or evidence fabricated.
- All cross-references current (v2 documents reference v2).
- Business vs. engineering approval boundary clarified.
- Mixed-responsibility interpretation preserved as open Finance decision.
- Outstanding accounting questions documented for Finance awareness.

**CONDITIONS:**
1. **Finance must be made aware of Option A's under-rounding limitation** before the approval meeting. The corrected documents now state this clearly, but the meeting facilitator should ensure this is discussed explicitly. Option A is simplest but may leave a permanent shortfall of up to N-1 minor units per order in under-rounding cases.
2. **Q4 (locking strategy) in the Finance decision record** is a technical decision, not a Finance policy decision. Finance should be advised that Engineering will recommend the locking strategy subject to preserving the financial invariants Finance specifies.
3. **The v1 blocker reconciliation document** (`P13-PHASE-0-BLOCKER-RECONCILIATION.md`) remains in `docs/production/` but is superseded by v2. Readers should be directed to v2.

**This is NOT authorization to begin implementation.** All decisions remain PROVISIONAL — PENDING APPROVAL. Phase 1 may begin only when the specified gate conditions are met with attributable evidence.

---

## Attestation

- No application source code, database schema, migrations, tests, or runtime configuration were modified.
- No commits, pushes, merges, or deployments were performed.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- No approver identities, dates, or evidence were invented.
- Mathematical corrections applied to 4 existing documents; 1 new audit document created.
- Baseline preserved: branch `develop`, HEAD `8d60e36`.
- `git status --short -- apps/ infra/` returns empty (no source changes).
