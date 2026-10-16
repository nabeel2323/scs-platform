# P13 — Implementation Readiness and Phase Plan

**Version:** 1.0
**Status:** PREPARATION — NOT IMPLEMENTATION AUTHORIZATION. No implementation may begin until business approvals are documented.
**Baseline:** branch `develop`, HEAD `8d60e36`, clean working tree (read-only inspection).
**Companion documents:**
- `P13-POLICY-RECONCILIATION-v3.md` — corrected policy specification
- `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` — 6 contradictions, dependency graph
- `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` — 15 decisions, 12 questions, 10 gates

---

## Phase 0 — Specification and Business Approval Readiness

**Gate condition:** All contradictions resolved, all decisions reconciled, all approvals documented.
**Current status:** IN PROGRESS — contradictions resolved in v3 specification. Approvals not yet documented.

### 0.1 Completed in this phase

| Task | Status | Evidence |
|---|---|---|
| Audit existing documents for contradictions | COMPLETE | 6 contradictions identified (C-01 through C-06) |
| Correct commission formula (VAT-exclusive, delivery-fee-exclusive) | COMPLETE | v3 §3.2 — corrected formula using net goods only |
| Remove stale "[UNRESOLVED]" labels | COMPLETE | v3 §3.1, §4.3 — all positions now consistent |
| Standardize status terminology | COMPLETE | v3 §1 — four statuses defined and applied |
| Document two independent deadlines | COMPLETE | v3 §2 — Clock 1 (buyer) and Clock 2 (merchant) separated |
| Reconcile 15 decisions with definitive provisional wording | COMPLETE | v3 §8, workbook v2 Decision Register |
| Reconcile 12 open questions with accountable roles | COMPLETE | Workbook v2 Open Questions sheet |
| Define release-gate checklist | COMPLETE | Workbook v2 Release Gates sheet (10 gates) |
| Define approval sequence by category | COMPLETE | Workbook v2 Approval Guide sheet |
| Produce conflict and dependency report | COMPLETE | `P13-POLICY-CONFLICT-AND-DEPENDENCY-REPORT.md` |

### 0.2 Remaining before Phase 1 can begin

| Requirement | Status | Blocks |
|---|---|---|
| Formal business approval of D01–D15 | NOT STARTED — 0/15 approved | All implementation |
| Resolution of OQ-04 (commission allocation method) | NOT STARTED | D04, D06, D07 implementation |
| Resolution of OQ-01 (business calendar) | NOT STARTED | D11 implementation |
| Resolution of OQ-02 (SLA trigger timestamps) | NOT STARTED | D02, D11 implementation |
| All other open questions (OQ-03, OQ-05 through OQ-12) | NOT STARTED | Respective implementations |

### 0.3 Phase 0 exit criteria

- [ ] All 15 decisions have documented approval or rejection with attributable evidence.
- [ ] OQ-04 (commission allocation) resolved by Finance Lead / CFO.
- [ ] OQ-01 (business calendar) resolved by Head of Operations / COO.
- [ ] OQ-02 (SLA triggers) resolved by Head of Operations / COO.
- [ ] At minimum, D01–D03, D04–D07, D08–D10, D11, D14, D15 approved before technical design begins.
- [ ] D12, D13 may be approved in parallel with early implementation if they do not block Phase 1 design.

---

## Phase 1 — Technical Design and Migration Planning

**Gate condition:** Phase 0 exit criteria met. Relevant business approvals documented.
**Current status:** BLOCKED — awaiting Phase 0 completion.

### 1.1 Work packages

#### WP-1A — FSM ESCALATED state design

**Scope:** Design the `ESCALATED` state addition to the return FSM.
**Affected components:**
- `apps/api/src/modules/returns/returns.service.ts` — FSM transition map (line 61)
- `apps/api/src/__tests__/unit/returns/returns-fsm.spec.ts` — 86 existing tests
- Architecture lock §4 — BD-P13-RETURN-FSM

**Design deliverables:**
- Transition map amendment: `REQUESTED` adds `'ESCALATED'`; new `ESCALATED` state with transitions to `['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED']`.
- Authorization model: who can transition to/from ESCALATED (SYSTEM for timeout, ADMIN for resolution).
- Event model: `return_request_events` records `ESCALATED` with `actor_type = 'SYSTEM'`; admin resolution with `actor_type = 'ADMIN'`.
- Outbox event: `return.escalated` emitted atomically with the transition.

**Acceptance criteria:**
- Design document reviewed and approved.
- Test plan covers: all 12 existing states + ESCALATED, idempotent escalation, duplicate-timeout protection.

**Depends on:** D03 approval.
**Blocks:** WP-1B, WP-2A, WP-2B, WP-2C.

---

#### WP-1B — Migration 0059 amendment planning

**Scope:** Plan the migration to add `ESCALATED` to the `return_requests.status` CHECK constraint.
**Affected components:**
- `infra/drizzle/migrations/0059_return_requests.sql` — CHECK constraint on `status`

**Design deliverables:**
- New migration `0060_add_escalated_status.sql` (or amend 0059 if not yet in production).
- Idempotent DDL: `ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS ...; ALTER TABLE ... ADD CONSTRAINT ... CHECK (status IN (...))`.
- Rollback strategy: reverse migration to remove `ESCALATED` from vocabulary.
- Existing-DB upgrade path: verified on a database at migration 0059.

**Acceptance criteria:**
- Migration applies cleanly on fresh DB (all migrations 0001–0060).
- Migration applies cleanly on existing DB at 0059 (upgrade path).
- Rollback migration tested.

**Depends on:** WP-1A design.
**Blocks:** WP-2A.

---

#### WP-1C — Idempotent timeout escalation worker design

**Scope:** Redesign `ReturnExpirationWorker` to escalate instead of expire.
**Affected components:**
- `apps/api/src/modules/returns/return-expiration.worker.ts` — poll query and transition logic
- `apps/api/src/modules/returns/returns.service.ts` — `expireReturn()` → `escalateReturn()`

**Design deliverables:**
- Poll query changes from `status = 'REQUESTED' AND expires_at <= now()` transitioning to EXPIRED, to transitioning to ESCALATED.
- `FOR UPDATE SKIP LOCKED` batch claiming retained for concurrency safety.
- Idempotency: only transition if `status = 'REQUESTED'` (optimistic lock). Repeated processing of the same timeout must not create duplicate escalations.
- Outbox event emission: `return.escalated` emitted atomically with the transition.
- Monitoring: log escalation events for operational control #2 (overdue monitoring).

**Acceptance criteria:**
- Design document covers: concurrency, idempotency, outbox atomicity, monitoring integration.
- Test plan covers: single escalation, concurrent timeout processors (2 → 1 escalation), re-processing protection.

**Depends on:** WP-1A design, D02/D03 approval.
**Blocks:** WP-2C.

---

#### WP-1D — Responsibility-dependent commission reversal design

**Scope:** Design the commission reversal calculation for each responsibility category.
**Affected components:**
- `apps/api/src/modules/returns/returns.service.ts` — refund calculation logic
- `apps/api/src/modules/returns/returns.schema.ts` — `responsibility_category` field
- Settlement adjustment path

**Design deliverables:**
- Commission reversal formula (v3 §3.2): `round(commission_total × (net_goods_returned / net_goods_total))`.
- `responsibility_category` field on `return_requests`: enum `['MERCHANT', 'BUYER_REMORSE', 'PLATFORM', 'CARRIER', 'CONTESTED', 'UNRESOLVED']`.
- Authorization: who can set `responsibility_category` (merchant for initial, admin for escalation/override).
- Settlement adjustment path: when category is MERCHANT/PLATFORM/CARRIER, create ADJUSTMENT record with commission reversal.
- Contested handling: retain commission until classified; reconcile through adjustment after classification.
- Cumulative cap: total commission reversals ≤ commission_total.

**Acceptance criteria:**
- Design document covers: formula, allocation method (pending OQ-04), authorization, cumulative cap, contested handling.
- Test plan covers: each responsibility category, partial returns, cumulative cap, contested reclassification.

**Depends on:** D04–D07 approval, OQ-04 resolution.
**Blocks:** WP-2D.

---

#### WP-1E — Delivery-fee exception design

**Scope:** Design the admin-authorized delivery-fee exception path for partial returns.
**Affected components:**
- `apps/api/src/modules/returns/returns.service.ts` — delivery-fee refund calculation
- Admin API and UI for exception approval
- Audit trail for exception reason

**Design deliverables:**
- Exception approval workflow: admin reviews partial return, approves delivery-fee exception with reason.
- Delivery-fee refund calculation: full original delivery fee or proportional (pending OQ-05).
- Carrier-damage delivery-fee path: refund if material impact (pending OQ-11), partial to admin review.
- Audit trail: exception approval recorded in `return_request_events` with `actor_type = 'ADMIN'`, reason code.

**Acceptance criteria:**
- Design document covers: approval workflow, calculation, carrier-damage materiality, audit requirements.
- Test plan covers: full-sub-order baseline, exception path, carrier-damage path, audit trail.

**Depends on:** D08–D10 approval, OQ-05 resolution, OQ-11 resolution.
**Blocks:** WP-2E.

---

#### WP-1F — Administrator escalation UI and SLA design

**Scope:** Design the admin escalated-queue UI and SLA tracking.
**Affected components:**
- `apps/admin/src/app/returns/` — escalated queue page
- Admin API endpoints for escalated return listing and resolution
- SLA tracking and overdue alerting

**Design deliverables:**
- Escalated queue: list of `ESCALATED` returns with age, original merchant, buyer details.
- Resolution actions: reassign to merchant, reject, cancel.
- SLA tracking: 3-business-day countdown from escalation timestamp (pending OQ-01 for calendar rules).
- Overdue alerting: integration with operational control #2.

**Acceptance criteria:**
- Design document covers: UI layout, API endpoints, authorization, SLA calculation, alerting.
- Test plan covers: queue listing, resolution actions, SLA countdown, overdue detection.

**Depends on:** D03, D11 approval, OQ-01 resolution.
**Blocks:** WP-2F.

---

#### WP-1G — Voucher review workflow design

**Scope:** Design the administrator voucher-review workflow.
**Affected components:**
- Admin API and UI for voucher return review
- Refund issuance path (voucher vs. cash)

**Design deliverables:**
- Voucher-review queue: list of returns requesting voucher refund.
- Review actions: approve voucher, approve cash, reject.
- Financial consequences per outcome (pending OQ-08).

**Acceptance criteria:**
- Design document covers: workflow, authorization, financial treatment per outcome.
- Test plan covers: each outcome, audit trail, authorization.

**Depends on:** D13 approval, OQ-08 resolution.
**Blocks:** WP-2G.

---

### 1.2 Phase 1 exit criteria

- [ ] All design documents (WP-1A through WP-1G) reviewed and approved.
- [ ] Migration plan (WP-1B) verified on fresh and existing databases.
- [ ] Test plans for all work packages reviewed.
- [ ] API contract changes documented.
- [ ] Rollback strategy documented for each work package.

---

## Phase 2 — Implementation Work Breakdown

**Gate condition:** Phase 1 exit criteria met. Design documents approved.
**Current status:** BLOCKED — awaiting Phase 1 completion.

### 2.1 Work packages

Each work package includes: affected components, intended behavior, API/schema/migration implications, test requirements, rollback criteria.

#### WP-2A — Migration: add ESCALATED to CHECK constraint

**Affected components:** `infra/drizzle/migrations/0060_add_escalated_status.sql`
**Intended behavior:** `return_requests.status` vocabulary includes `'ESCALATED'`.
**Migration:** New migration 0060 (idempotent DDL).
**Tests:** Apply on fresh DB (0001–0060). Apply on existing DB at 0059. Rollback tested.
**Regression:** Every `*.postgres.spec.ts` applies all migrations on fresh testcontainers DB.
**Rollback:** Reverse migration removes `ESCALATED` from vocabulary (only if no ESCALATED rows exist).
**Depends on:** WP-1B.

#### WP-2B — FSM: add ESCALATED transition

**Affected components:** `returns.service.ts` transition map, `returns.schema.ts`
**Intended behavior:** `REQUESTED` may transition to `ESCALATED`. `ESCALATED` may transition to `MERCHANT_APPROVED`, `MERCHANT_REJECTED`, `CANCELLED`.
**API:** No new endpoints. Existing transition API extended for new state.
**Tests:** Unit: 86 existing + new ESCALATED tests. Integration: transition verification.
**Regression:** All existing FSM tests must continue to pass.
**Rollback:** Revert code change. Migration 0060 remains (harmless if no ESCALATED rows).
**Depends on:** WP-1A, WP-2A.

#### WP-2C — Worker: redesign expiration → escalation

**Affected components:** `return-expiration.worker.ts`, `returns.service.ts` (`expireReturn()` → `escalateReturn()`)
**Intended behavior:** Poll `REQUESTED` rows past `expires_at`. Transition to `ESCALATED` (not `EXPIRED`). Emit `return.escalated` outbox event. Idempotent (FOR UPDATE SKIP LOCKED + optimistic lock).
**Tests:** Unit: worker logic. PostgreSQL concurrency: 2 simultaneous processors → 1 escalation. Idempotency: re-processing does not duplicate.
**Regression:** All existing worker tests updated. P12 regression preserved.
**Rollback:** Revert to `expireReturn()` behavior. Migration 0060 ESCALATED state unused.
**Depends on:** WP-1C, WP-2A, WP-2B.

#### WP-2D — Commission: responsibility-dependent reversal

**Affected components:** `returns.service.ts` refund calculation, `returns.schema.ts` (`responsibility_category`), settlement adjustment path
**Intended behavior:** Commission reversal calculated per v3 §3.2 formula. Category-specific treatment (reverse for merchant/platform/carrier, retain for buyer-remorse, hold for contested).
**Schema:** New `responsibility_category` column on `return_requests`.
**Migration:** Add column with default `NULL`. Backfill not required (existing returns pre-P13-policy).
**Tests:** Unit: formula verification for each category. PostgreSQL: settlement adjustment creation, cumulative cap, contested reclassification. Financial correctness: VAT-exclusive, delivery-fee-exclusive.
**Regression:** All existing financial-dispute tests updated. P12 payment tests preserved.
**Rollback:** Revert code. Column remains (nullable, no constraint).
**Depends on:** WP-1D.

#### WP-2E — Delivery fee: exception path

**Affected components:** `returns.service.ts` delivery-fee calculation, admin API, admin UI
**Intended behavior:** Admin may approve delivery-fee exception for partial returns on merchant/platform fault. Carrier-damage: refund if material, partial to admin review.
**Tests:** PostgreSQL: full-sub-order baseline, exception path, carrier-damage path. Audit trail verification.
**Regression:** All existing delivery-fee tests preserved.
**Rollback:** Revert code. Exception approval records remain (audit trail preserved).
**Depends on:** WP-1E.

#### WP-2F — Admin UI: escalated queue + SLA tracking

**Affected components:** `apps/admin/src/app/returns/`, admin API endpoints
**Intended behavior:** Escalated queue lists ESCALATED returns. Resolution actions (reassign, reject, cancel). SLA countdown displayed.
**Tests:** E2E: queue listing, resolution actions. Authorization: admin-only access.
**Regression:** All existing admin tests preserved.
**Rollback:** Revert UI code. API endpoints remain.
**Depends on:** WP-1F, WP-2C.

#### WP-2G — Admin UI: voucher review workflow

**Affected components:** `apps/admin/src/app/returns/`, admin API, refund issuance path
**Intended behavior:** Voucher-review queue. Admin approves voucher/cash/reject per case.
**Tests:** E2E: review workflow. Authorization: admin-only. Financial: correct refund type issued.
**Regression:** All existing admin and refund tests preserved.
**Rollback:** Revert UI code.
**Depends on:** WP-1G.

### 2.2 Phase 2 exit criteria

- [ ] All work packages (WP-2A through WP-2G) implemented.
- [ ] All unit tests pass.
- [ ] All PostgreSQL integration tests pass.
- [ ] All authorization and tenant-isolation tests pass.
- [ ] All financial correctness tests pass.
- [ ] Typecheck passes (0 issues).
- [ ] Production build passes (API nest build, web/admin next build).
- [ ] Code review completed for each work package.

---

## Phase 3 — Verification and Release Readiness

**Gate condition:** Phase 2 exit criteria met. All implementation complete.
**Current status:** BLOCKED — awaiting Phase 2 completion.

### 3.1 Verification work packages

#### WP-3A — FSM + escalation idempotency verification

**Evidence required:**
- FSM unit tests: all transitions legal, ESCALATED state verified.
- Escalation idempotency: 2 concurrent processors → 1 escalation event.
- Timeout re-processing: no duplicate escalations.
- Outbox event atomicity: `return_request_events` + `outbox_events` in same transaction.

#### WP-3B — Commission correctness verification

**Evidence required:**
- Commission reversal formula verified for each responsibility category.
- VAT-exclusive, delivery-fee-exclusive calculation confirmed.
- Cumulative cap: total reversals ≤ commission_total.
- Partial returns: proportional allocation verified.
- Contested reclassification: adjustment created correctly.
- Settlement immutability: `order_financial_breakdown` unchanged.

#### WP-3C — Delivery-fee exception verification

**Evidence required:**
- Full-sub-order baseline: delivery fee refunded.
- Partial return baseline: delivery fee NOT refunded.
- Exception path: admin-approved delivery-fee refund on partial.
- Carrier-damage: material impact → refund; partial → admin review.
- Audit trail: exception reason recorded.

#### WP-3D — Admin SLA tracking verification

**Evidence required:**
- SLA countdown: 3 business days from escalation (calendar rules applied).
- Overdue detection: rows past SLA flagged.
- Operational control #2 integration: monitoring query works.

#### WP-3E — Voucher review verification

**Evidence required:**
- Voucher return → admin review required.
- Each outcome (voucher, cash, reject) processed correctly.
- Authorization: admin-only.

#### WP-3F — P12 regression preservation

**Evidence required:**
- Full regression suite: 3098+ tests, 0 failures, 0 skipped.
- Focused P13 suites: all pass.
- P1–P12 tests: all pass. No new failures.
- Typecheck: 0 issues. Build: all tasks successful.

#### WP-3G — Pilot topology and operational controls

**Evidence required:**
- Exactly one worker-enabled API instance confirmed.
- All 4 operational controls assigned to named owners.
- Alerting configured and tested.
- Monitoring dashboards active.
- Rollback plan documented.

#### WP-3H — Independent verification and release closure

**Evidence required:**
- All WP-3A through WP-3G evidence reviewed independently.
- No contradictions between evidence and claims.
- Release-gate checklist: all gates PASS or explicitly documented as conditionally PASS.
- Explicit release authorization from authorized person.

### 3.2 Phase 3 exit criteria

- [ ] All verification work packages (WP-3A through WP-3H) complete with evidence.
- [ ] Full regression re-run: 3098+ tests, 0 failures.
- [ ] Focused P13 suites: all pass.
- [ ] Typecheck + build: all green.
- [ ] Pilot operational controls: verified.
- [ ] Independent verification report authored.
- [ ] Release-gate report authored.
- [ ] Explicit release authorization granted.

---

## 4. Summary

| Phase | Status | Exit criteria | Blockers |
|---|---|---|---|
| Phase 0 — Specification | IN PROGRESS | All approvals documented | 0/15 decisions approved |
| Phase 1 — Design | BLOCKED | All designs approved | Phase 0 incomplete |
| Phase 2 — Implementation | BLOCKED | All work packages complete | Phase 1 incomplete |
| Phase 3 — Verification | BLOCKED | All evidence gathered | Phase 2 incomplete |

**Total work packages:** 10 (Phase 0) + 7 (Phase 1) + 7 (Phase 2) + 8 (Phase 3) = 32.

**Critical path:** D03 approval → WP-1A → WP-1B → WP-2A → WP-2B → WP-2C → WP-3A → WP-3H → Release.

**Attestation:** No repository files, code, migrations, tests, configuration, or workflows were modified. This is a planning document only. No implementation is authorized.
