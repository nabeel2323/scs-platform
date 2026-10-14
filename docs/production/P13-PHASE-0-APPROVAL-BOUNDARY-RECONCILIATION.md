# P13 — Phase 0 Approval-Boundary Reconciliation

**Version:** 1.0
**Date:** 2026-10-10
**Purpose:** Resolve the governance inconsistency in the P13 Phase 0 approval package where locking strategy and data source were presented as Finance approval items despite being Engineering decisions.
**Status:** Reconciliation complete. Phase-entry criteria unchanged.
**Baseline:** branch `develop`, HEAD `8d60e36`.

---

## 1. The Original Inconsistency

### 1.1 What was wrong

The P13 Phase 0 approval package contained a governance boundary error: **locking strategy** and **authoritative data source** were presented as Finance approval items in multiple documents, while the Final Consistency Audit (`P13-PHASE-0-FINAL-CONSISTENCY-AUDIT.md` §6, Condition 2) correctly identified them as Engineering decisions.

**Specific locations of the inconsistency:**

| Document | Location | Issue |
|---|---|---|
| `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | §8 "Finance Decision Record", §8.1 "Questions requiring Finance decision" — Q2 (data source), Q4 (locking) | Technical choices presented as Finance decisions |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | Meeting 2 (Finance) agenda: "Decide locking strategy"; OQ-04 decision recording template: "Locking strategy" row with (APPROVED / REJECTED / MODIFIED) | Finance meeting asked to approve technical choice |
| `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` | §1.6: "Finance Lead / CFO must explicitly approve: ... 3. The authoritative data source ... 5. The locking strategy" | Listed as Finance approval items |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | §2 (OQ-04 row), §5.1 item 3, §6 (OQ-04 status), §7.1 item 1: all state "Finance Lead / CFO has approved ... AND the locking strategy" | Phase-entry criteria required Finance approval of technical choice |
| `P13-PHASE-0-OPEN-DECISION-SHEETS.md` | OQ-04 "Evidence required to close" — only mentioned Finance approval of allocation method and rounding mechanism | Incomplete: did not mention Engineering sign-off or mixed-responsibility interpretation |

### 1.2 Root cause

OQ-04 is a compound question spanning both financial policy and technical implementation. The original documents did not separate the two domains, causing every OQ-04 reference to conflate Finance policy approval with Engineering technical sign-off.

---

## 2. Ownership Distinction Adopted

### 2.1 Finance / Accounting owns

- **Commission allocation and rounding policy:** Which algorithm to approve (Option A, B, or C).
- **Mixed-responsibility treatment:** Interpretation 1 (denominator = total order) vs. Interpretation 2 (denominator = eligible only).
- **Whether full eligible-commission reconciliation must be exact:** If yes, algorithm must be Option B or C (Option A does not guarantee exact reconciliation in under-rounding cases).
- **Negative adjustments or clawbacks:** Whether negative reversal is permitted when `already_reversed > cumulative_target`.
- **Historical-refund treatment:** Whether pre-P13 refunds are backfilled with `commission_reversal_minor`.
- **Reclassification accounting:** Whether commission reversal uses creation date or reclassification date.
- **The financial invariants Engineering must preserve:** E.g., cumulative reversals ≤ `commission_total`, rounding tolerance (±1 minor unit acceptable?).

### 2.2 Engineering owns

- **Transaction and locking strategy:** Extend `FOR UPDATE` on payment record, dedicated lock on `order_financial_breakdown`, or `pg_advisory_xact_lock(order_id)`.
- **Persistence model and authoritative technical data source:** `refunds.commission_reversal_minor` column vs. new `commission_reversals` ledger table.
- **Idempotency and concurrency controls:** Implementation details of duplicate-POST protection, retry-after-failure handling.
- **Migration approach and technical test strategy:** How to add columns, backfill data, and verify correctness.

### 2.3 Boundary principle

Finance decides WHAT (financial policy, rounding rules, invariants). Engineering decides HOW (locking, persistence, concurrency). Finance may acknowledge the financial risks and constraints of Engineering's proposal, but a technical choice is not represented as a Finance approval.

### 2.4 Unresolved governance question

**None.** The existing documents provide sufficient evidence to establish the ownership boundary. The Finance policy decisions are clearly financial in nature (algorithm choice, rounding tolerance, interpretation). The Engineering sign-off items are clearly technical (locking strategy, data source). No additional governance decision is required.

---

## 3. Cross-Document Consistency Matrix

After correction, every document consistently identifies the same ownership boundary:

| Document | Finance approval items | Engineering sign-off items | Phase-entry criteria unchanged? |
|---|---|---|---|
| `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | §8.1: Q1 (algorithm), Q2 (mixed-responsibility) | §8.2: E1 (data source), E2 (locking) | Yes — §8 header now states both roles |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | Meeting 2: algorithm, mixed-responsibility, outstanding accounting questions | Meeting 2: data source (labeled "Engineering sign-off"), locking (labeled "Engineering sign-off, not Finance approval") | Yes — OQ-04 still required for Phase 1 |
| `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` | §1.6 items 1–3: allocation, rounding, mixed-responsibility | §1.6 items 4–5: data source, locking | Yes — OQ-04 still CRITICAL blocker |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | §2 OQ-04 row: Finance items listed first | §2 OQ-04 row: Engineering items listed second | Yes — §5.1, §7.1 updated to match |
| `P13-PHASE-0-OPEN-DECISION-SHEETS.md` | OQ-04 evidence: Finance approval of (a), (b), (c) | OQ-04 evidence: Engineering sign-off of (d), (e) | Yes — evidence requirements expanded |
| `P13-PHASE-0-FINAL-CONSISTENCY-AUDIT.md` | §6 Condition 2 already identified Q4 as technical | N/A — audit already correct | Yes — audit unchanged |

**All six documents now consistently identify:**
- **Finance approval required before Phase 1:** Algorithm (A/B/C), mixed-responsibility interpretation, financial invariants.
- **Engineering sign-off required before commission implementation (WP-2D):** Data source, locking strategy.
- **OQ-04 is fully resolved only when both Finance and Engineering have signed off.**

---

## 4. Mathematical Examples — Confirmation of Correctness

The following numerical results remain correct and consistent across all documents:

### 4.1 Over-rounding example (6 equal items, commission = 100)

| Algorithm | Cumulative total |
|---|---|
| Independent rounding | 102 (over by 2) |
| Option A: Cap-at-remaining | 100 (exact) |
| Option B: Final-return catch-up | 100 (exact) |
| Option C: Cumulative-target | 100 (exact) |

**Source:** `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §2.1, §3.2 Scenario 1, §6.

### 4.2 Under-rounding example (7 equal items, commission = 100)

| Algorithm | Cumulative total |
|---|---|
| Independent rounding | 98 (under by 2) |
| Option A: Cap-at-remaining | **98 (short by 2)** |
| Option B: Final-return catch-up | 100 (exact) |
| Option C: Cumulative-target | 100 (exact) |

**Source:** `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §2.2, §3.2 Scenario 2, §6.

### 4.3 Key property

- **Option A** prevents over-reversal (cumulative ≤ commission_total) but does NOT guarantee full reversal in under-rounding cases.
- **Options B and C** guarantee exact reconciliation when all eligible items are fully returned.
- **Mixed-responsibility denominator** remains an explicit Finance decision (Interpretation 1 vs. Interpretation 2). No algorithm or interpretation has been selected on Finance's behalf.
- **Exact reconciliation statements are conditional:** Options B and C guarantee exact total only when all eligible items are fully returned. If only some items are returned, the cumulative target is proportional and rounding residue may persist until the final eligible return.

---

## 5. Authorization Gates — Confirmation

### 5.1 All D01–D15 remain PROVISIONAL — PENDING APPROVAL

No decision has been marked as approved. No approver names, dates, or evidence have been invented.

### 5.2 All OQ statuses remain OPEN

OQ-01 through OQ-12 remain open until actual attributable evidence exists.

### 5.3 Phase 1 entry remains blocked

Phase 1 (technical design) may begin only when:
- 13 of 15 decisions approved (D01–D11, D14, D15) with attributable evidence.
- OQ-04 resolved: Finance Lead / CFO has approved allocation method, rounding mechanism, and mixed-responsibility interpretation. CTO / Head of Engineering has signed off on data source and locking strategy.
- OQ-01 resolved: Head of Operations / COO has defined business calendar rules.
- OQ-02 resolved: Head of Operations / COO has confirmed SLA trigger timestamps.

**This is unchanged from the prior version.** The only correction is clarifying WHO approves WHAT within OQ-04.

### 5.4 Phase 2 entry remains blocked

All 15 decisions (D01–D15) must be approved before any Phase 2 implementation begins. OQ-04 must be fully resolved (Finance + Engineering) before WP-2D (commission implementation).

### 5.5 Release remains blocked

Release requires:
- All Phase 2 work packages complete and verified.
- All Phase 3 verification work packages complete with evidence.
- All 15 decisions approved.
- All in-scope open questions resolved.
- Pilot operational controls (D15) assigned and active.
- Independent verification report authored.
- Explicit release authorization from authorized person.
- All gates G-01 through G-08 PASS.

---

## 6. Outstanding Accounting Questions

The following questions remain open and require Finance input. They are documented in `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §9 and `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` §1.7:

| Question | Status |
|---|---|
| Q1: Rounding residue tolerance — is ±1 minor unit acceptable? | OPEN — Finance decision |
| Q2: Negative reversal handling — is clawback permitted? | OPEN — Finance decision |
| Q3: Historical refunds — backfill or start from zero? | OPEN — Finance decision |
| Q4: Contested reclassification timing — creation date or reclassification date? | OPEN — Finance decision |

These are purely financial policy questions. They do not involve Engineering sign-off.

---

## 7. Exact Files Modified

| File | Operation | Changes |
|---|---|---|
| `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | **Corrected** | §8 heading: "Finance Decision Record" → "OQ-04 Decision Record — Finance Policy and Engineering Sign-off". §8.1: "Questions requiring Finance decision" → "Finance policy decisions". Q2 (data source) and Q4 (locking) moved to new §8.2 "Engineering sign-off". Added financial invariants statement. §8.2–8.6 renumbered. Purpose and problem statement updated. |
| `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md` | **Corrected** | §1.6: Split 5 Finance items into 3 Finance items + 2 Engineering items. Added boundary principle note. Attestation updated. |
| `P13-PHASE-0-APPROVAL-AGENDA-v2.md` | **Corrected** | Meeting 2 agenda: data source labeled "Engineering sign-off", locking labeled "Engineering sign-off, not Finance approval". Decision recording template: data source and locking rows labeled "(Engineering sign-off)". Added "Financial invariants acknowledged (Finance)" row. |
| `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | **Corrected** | §2 OQ-04 row: split Finance/Engineering accountable roles. §5.1 item 3: split Finance approval from Engineering sign-off. §6 OQ-04 status: updated accountable roles, fixed stale §1.7 reference → §9. §7.1 item 1: split Finance approval from Engineering sign-off. |
| `P13-PHASE-0-OPEN-DECISION-SHEETS.md` | **Corrected** | OQ-04 evidence required: expanded to include Finance approval of (a) allocation method, (b) rounding mechanism, (c) mixed-responsibility interpretation + Engineering sign-off of (d) data source, (e) locking strategy. |
| `P13-PHASE-0-FINAL-CONSISTENCY-AUDIT.md` | **Not modified** | Already correctly identified the boundary (§6 Condition 2). |
| `P13-PHASE-0-APPROVAL-BOUNDARY-RECONCILIATION.md` | **Created** | This document. |

**No application source code, database schemas, migrations, tests, runtime configuration, or deployment files were modified.**

---

## 8. PASS / FAIL Assessment

### VERDICT: PASS

**Rationale:**

1. **Ownership boundary established and consistent.** All six documents now clearly separate Finance policy decisions (algorithm, mixed-responsibility interpretation, financial invariants) from Engineering sign-off items (data source, locking strategy). No document represents a technical choice as a Finance approval.

2. **Phase-entry criteria unchanged.** The conditions for Phase 1 entry remain: 13/15 decisions + OQ-01 + OQ-02 + OQ-04. The only correction is clarifying that OQ-04 requires both Finance approval (of policy) and Engineering sign-off (of technical implementation). No gate has been added, removed, or relaxed.

3. **Mathematical examples correct.** Over-rounding (6 items → 102 independent, 100 all options) and under-rounding (7 items → 98 independent, 98 Option A, 100 Options B/C) are consistent across all documents.

4. **All authorization gates preserved.** D01–D15 remain PROVISIONAL — PENDING APPROVAL. All OQ statuses remain OPEN. No approvers, dates, or evidence fabricated. Phase 1, Phase 2, and release gates unchanged.

5. **No unresolved governance questions.** The ownership boundary is fully determined from the existing documents. Finance decides WHAT, Engineering decides HOW. No additional governance decision is needed.

6. **Cross-references current.** Stale §1.7 reference in closure checklist corrected to §9. All v2 document references point to v2.

**The approval package is ready to circulate to business approvers.**

**This is NOT authorization to begin implementation.** All decisions remain PROVISIONAL — PENDING APPROVAL.

---

## Attestation

- No application source code, database schema, migrations, tests, or runtime configuration were modified.
- No commits, pushes, merges, or deployments were performed.
- No business decision was marked as approved.
- No approval was inferred from code, tests, or prior documents.
- No approver identities, dates, or evidence were invented.
- 5 existing documents corrected; 1 new reconciliation document created; 1 document (Final Consistency Audit) unchanged.
- Baseline preserved: branch `develop`, HEAD `8d60e36`.
- `git status --short -- apps/ infra/` returns empty (no source changes).
