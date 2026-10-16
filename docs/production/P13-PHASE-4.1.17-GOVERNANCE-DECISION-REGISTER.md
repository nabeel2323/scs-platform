# P13 Phase 4.1.17 — Governance Decision Register

**Phase:** 4.1.17 | **Date:** 2026-10-16 | **Branch:** `develop` | **HEAD:** `c01267cfd9be8cac72edb9333f7c7f036647fc1a`

## 1. Status vocabulary

| Term | Meaning in this register |
|---|---|
| `PROVISIONAL — PENDING APPROVAL` | A documented position exists (policy wording/provisional default), but no attributable approval (name, role, date, rationale, evidence) has been recorded. Not APPROVED. |
| `OPEN` | The question has no authoritative resolution. |
| `UNVERIFIED` | A verification requirement exists but no evidence exists to verify it. |
| `BLOCKED` | Progress is prevented by an external or upstream dependency. |
| `NOT APPLICABLE` | Outside P13 scope. |
| `RECOMMENDED (not approved)` | This register's evidence-based suggestion. It has **no** decision authority. |

**Reconciliation method:** carried-forward counts (15 provisional decisions, 12 open questions, 0/14 receiver items) were re-verified against `P13-PHASE-4.1.11-BUSINESS-APPROVAL-PACK.md`, `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`, `P13-PHASE-0-OPEN-DECISION-SHEETS.md`, `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md`, and the current source tree at HEAD `c01267c`. No item was converted to APPROVED/CLOSED/COMPLETE: there is no attributable approval evidence anywhere in the repository.

**Result: 15/15 decisions PROVISIONAL — PENDING APPROVAL (0 APPROVED). 12/12 questions OPEN (0 resolved). All counts match the carried baseline.**

---

## 2. Decision register D01–D15 — master table

| ID | Topic | Provisional policy | Status | Accountable approver | Co-approver | Blocking |
|---|---|---|---|---|---|---|
| D01 | Buyer return window | 14 days from delivery | PROVISIONAL — PENDING APPROVAL | Head of Operations / COO | — | YES |
| D02 | Merchant response SLA | 72 hours | PROVISIONAL — PENDING APPROVAL | Head of Merchant Partnerships | — | YES |
| D03 | Timeout → escalation | Escalate to admin; no auto-approve/reject/expire | PROVISIONAL — PENDING APPROVAL | Head of Operations / COO | — | YES |
| D04 | Merchant-responsibility commission | Reverse on net goods | PROVISIONAL — PENDING APPROVAL | Finance Lead / CFO | — | YES |
| D05 | Buyer-remorse commission | Retain commission | PROVISIONAL — PENDING APPROVAL | Finance Lead / CFO | — | YES |
| D06 | Platform-responsibility commission | Reverse on net goods | PROVISIONAL — PENDING APPROVAL | Finance Lead / CFO | — | YES |
| D07 | Carrier-damage commission | Reverse on net goods | PROVISIONAL — PENDING APPROVAL | Finance Lead / CFO | — | YES |
| D08 | Delivery fee (full sub-order) | Full-sub-order refund only | PROVISIONAL — PENDING APPROVAL | Finance Lead | Head of Operations | YES |
| D09 | Delivery-fee exception (partials) | Admin-authorized, dual approval | PROVISIONAL — PENDING APPROVAL | Finance Lead | Head of Operations | YES |
| D10 | Carrier-damage delivery fee | Refund buyer + pursue carrier | PROVISIONAL — PENDING APPROVAL | Finance Lead | Head of Operations | YES |
| D11 | Admin review target | 3 business days (calendar per OQ-01) | PROVISIONAL — PENDING APPROVAL | Head of Operations / COO | — | YES |
| D12 | Settlement adjustment authorization | Manual Finance/admin; no auto clawback | PROVISIONAL — PENDING APPROVAL | Financial Controller | — | YES |
| D13 | Voucher outcomes | Admin review for every voucher return | PROVISIONAL — PENDING APPROVAL | Finance Lead | Risk Lead | YES |
| D14 | Deployment target | Docker Compose, single Linux VPS | PROVISIONAL — PENDING APPROVAL | CTO / Head of Engineering | — | YES |
| D15 | Pilot controls | Four controls, one worker instance | PROVISIONAL — PENDING APPROVAL | CTO / Head of Engineering | SRE Lead | YES |

## 3. Decision details D01–D15

Common acceptance criterion for every decision: **attributable approval recorded in the decision register — approver name, role, date, rationale, evidence reference (meeting minutes / signed document).** Verbal or implied consent, and passing tests/CI, do not satisfy this.

**D01 — Buyer return window.**
Question: how long after delivery may a buyer request a return? Documented behavior: `RETURN_WINDOW_DAYS` default 14 (env-overridable) in `returns.service.ts`; eligibility anchored to DELIVERED. Undecided: formal approval of the 14-day value and edge cases (see OQ-03). Owner: Head of Operations / COO. Blocking: YES (Phase 1 entry set). Recommended (not approved): approve the implemented 14-day default if it matches operational intent.

**D02 — Merchant response SLA.**
Question: how long does a merchant have to respond to a return request? Documented behavior: `MERCHANT_SLA_HOURS = 72`; `expires_at = created_at + 72h` elapsed wall-clock; worker escalates on lapse. Undecided: SLA value approval + authoritative trigger timestamp (OQ-02). Owner: Head of Merchant Partnerships. Blocking: YES.

**D03 — Timeout → escalation.**
Question: what happens when the merchant SLA elapses? Documented behavior: worker transitions REQUESTED → ESCALATED (non-terminal); the code comments and FSM transitions confirm it never approves, rejects, refunds, or expires on SLA elapse; admin resolves via explicit action. Undecided: formal policy approval of the escalation path. Owner: Head of Operations / COO. Blocking: YES. This is the item with the closest code/policy alignment; approval should be straightforward.

**D04–D07 — Commission reversal by responsibility category.**
Question: for which responsibility categories is commission reversed, and on what basis? Documented behavior: reversal implemented for reversal-eligible categories on the net-goods basis via `commission-reversal.service.ts`; buyer-remorse retained (reversal not posted for that category); allocation math is proportional floor + cap (see OQ-04 — the *method* itself is the open decision). Undecided: approval of reversal policy per category AND the allocation/rounding algorithm (OQ-04) AND the mixed-responsibility denominator interpretation. Owner: Finance Lead / CFO. Blocking: YES — **CRITICAL path**; WP-1D/WP-2D verification sign-off is gated on OQ-04.

**D08 — Delivery fee, full sub-order return.**
Question: delivery-fee treatment when the full sub-order is returned? Documented behavior: full-sub-order refund path implemented with refund caps (cannot exceed original fee; respects already-refunded). Undecided: approval. Owner: Finance Lead (co: Head of Operations). Blocking: YES.

**D09 — Delivery-fee exception for partial returns.**
Question: who may authorize a delivery-fee exception and with what controls? Documented behavior: exception path implemented; marked "requires dual approval" in `returns.service.ts`; `DELIVERY_FEE_EXCEPTION_APPROVED` audit events; two distinct approvers (Finance + admin) enforced via the settlement dual-approval mechanism. Undecided: approval of the authorization workflow as specified. Owner: Finance Lead (co: Head of Operations). Blocking: YES.

**D10 — Carrier-damage delivery fee.**
Question: who bears the delivery fee when delivery is damaged by the carrier? Documented behavior: refund-buyer path implemented; carrier recovery is explicitly out of P13 scope (OQ-12). Undecided: approval + materiality threshold (OQ-11). Owner: Finance Lead (co: Head of Operations). Blocking: YES.

**D11 — Administrator escalation review target.**
Question: what is the admin review target? Documented behavior: 3 business days implemented via `BusinessCalendarService` (working-time accumulation, default calendar Mon–Fri 08:00–18:00 UTC, fail-safe on missing/invalid config). Undecided: approval of the target AND the calendar definition (OQ-01). Owner: Head of Operations / COO. Blocking: YES.

**D12 — Settlement adjustment authorization.**
Question: who authorizes manual settlement adjustments and under what controls? Documented behavior: `settlement-adjustment.service.ts` — `thresholdMinor: 1000` ($10.00) defined; **all** adjustments created `fxStatus='BLOCKED'` + `requiresDualApproval=true` because no authoritative FX provider exists (the USD-equivalent threshold is intentionally unevaluable rather than approximated); 2 distinct approvers (one Finance, one admin); creator cannot be any approver; reconciliation flags POSTED adjustments lacking required dual approval; monthly reconciliation implemented (`reconciliation.service.ts`). Undecided: approval of the authorization workflow and the $10 threshold semantics once an FX source exists. Owner: Financial Controller. Blocking: YES.

**D13 — Voucher returns.**
Question: what outcomes are permitted for voucher-paid orders? Documented behavior (test evidence, `delivery-fee-voucher.spec.ts`): cash refund goes to the original payment method; no replacement voucher is issued as a cash substitute; only unused voucher balance is preserved — redeemed and expired value is never restored; payment-provider failure leaves the refund FAILED for retry/review; duplicate webhooks are idempotent. Undecided: approval of the outcome set and financial treatment per outcome (OQ-08 sheets). Owner: Finance Lead (co: Risk Lead). Blocking: YES.

**D14 — Deployment target.**
Question: what is the production deployment target? Documented behavior: Docker Compose artifacts exist; container gates pass in CI; **no deployment has been executed**. Undecided: infrastructure specification confirmation (VPS specs, sizing, environment ownership). Owner: CTO / Head of Engineering. Blocking: YES.

**D15 — Pilot operational controls.**
Question: what controls govern the pilot? Documented behavior: all four documented controls implemented — (1) alert on 3 consecutive worker polling failures, (2) alert when REQUESTED overdue >10 min, (3) alert on zero/multiple worker-enabled instances (`expectedWorkerCount=1`), (4) alert when heartbeat absent >5 min; plus durable pause control, epoch fencing, and monitor checks 5–10 (stop-pilot triggers). Undecided: approval of the control set, kill-switch test evidence, named pilot operators (OQ-09/OQ-10). Owner: CTO / Head of Engineering (co: SRE Lead). Blocking: YES.

## 4. Open questions OQ-01–OQ-12 — master table

| ID | Topic | Status | Accountable owner | Priority | Phase 1 blocker |
|---|---|---|---|---|---|
| OQ-01 | Business calendar definition | OPEN | Head of Operations / COO | HIGH | YES |
| OQ-02 | SLA trigger timestamps | OPEN | Head of Operations / COO | HIGH | YES |
| OQ-03 | Return eligibility edge cases | OPEN | Head of Operations / COO (co: CX) | MEDIUM | No (WP-2B refinement) |
| OQ-04 | Commission allocation + rounding | OPEN | Finance Lead / CFO + CTO/Head of Eng (dual) | CRITICAL | YES |
| OQ-05 | Delivery-fee allocation for exceptions | OPEN | Finance Lead (co: Ops) | MEDIUM | No (WP-3G, Phase 3) |
| OQ-06 | Delivery-fee exception audit requirements | OPEN | Finance Lead (co: Risk) | LOW | No (WP-3G, Phase 3) |
| OQ-07 | Settlement adjustment authorization details | OPEN | Financial Controller | MEDIUM | No (WP-3G, Phase 3) |
| OQ-08 | Voucher permitted outcomes | OPEN | Finance Lead (co: Risk) | LOW | No (WP-3G, Phase 3) |
| OQ-09 | Pilot operational owners | OPEN | CTO / SRE | HIGH | No (pilot gate) |
| OQ-10 | Pilot scope and criteria | OPEN | CTO / Head of Engineering (co: Ops) | HIGH | No (pilot gate) |
| OQ-11 | Carrier-damage materiality threshold | OPEN | Finance Lead (co: Ops) | MEDIUM | No (WP-3G, Phase 3) |
| OQ-12 | Carrier recovery process | OPEN — NOT APPLICABLE to P13 | Head of Operations / COO | LOW | No — P14+ |

## 5. Deep dives — OQ-01, OQ-02, OQ-04

### 5.1 OQ-01 — Business calendar definition (OPEN)

- **Exact question** (decision sheet): "What is the definition of a business day, business hours, time zone, weekends, and public holidays for the administrator's 3-business-day escalation resolution target (D11)?"
- **Status:** OPEN. No attributable resolution. Source: `P13-PHASE-0-OPEN-DECISION-SHEETS.md` (sheet OQ-01); approval pack §3.
- **Existing documented/implemented behavior** (verified in code):
  - Default calendar: Monday–Friday, 08:00–18:00 **UTC**, excluding configured holidays (`business-calendar.service.ts`; default calendar row seeded by migration 0060).
  - "Three business days" accumulates actual working time (3 × 10h = 30 working hours), not calendar dates; weekends and holidays are skipped; the SLA clock pauses outside business hours.
  - Holidays are administered via admin CRUD endpoints with an audit trail (`business_calendar_audit`); **no holiday list is approved or documented anywhere in the repository — the list is empty until an approved list is entered.**
  - Fail-safe on missing/invalid configuration: throws `BUSINESS_CALENDAR_NOT_FOUND` (no enabled default), `BUSINESS_CALENDAR_DISABLED`, validation errors on empty working days / start ≥ end, and `BUSINESS_CALENDAR_MAX_ITERATIONS` guard. Missing or invalid configuration never silently degrades to elapsed-time counting.
- **What remains undecided:** (a) formal approval of the calendar definition; (b) the authoritative timezone — the implementation uses UTC and the Phase 4.1.17 requirements carry "08:00–18:00 UTC" as the documented requirement, but the decision sheet's older provisional wording says "08:00–18:00 local time ... timezone TBD"; (c) the official holiday list and its change-management owner; (d) calendar ownership/administration responsibility.
- **Required approver:** Head of Operations / COO.
- **Options and trade-offs:**
  1. Confirm UTC as canonical (matches current implementation; DST-free; trade-off: must match how the ops team actually works).
  2. Reconfigure to a named IANA timezone (requires a data update via existing admin endpoints + re-verification of SLA math; no code change expected).
  3. Holiday source: admin-maintained list (current mechanism) vs external calendar feed (new scope, not authorized).
- **Recommended (not approved):** Option 1 + admin-maintained holidays, since it matches the implemented, tested, fail-safe behavior and the carried documented requirement; explicitly record the initial holiday list as empty-until-published with a named owner for entering it.
- **Dependencies / acceptance criteria:** resolution recorded with name/role/date/rationale; D11 approval; holiday list (possibly empty) entered by the named owner; a fail-safe behavior spot-check after any configuration change.
- **Blocking scope:** blocks Phase 1 entry and D11; does not block worker code (implemented); blocks pilot SLA verification evidence (WP-2F/WP-3D).

### 5.2 OQ-02 — SLA trigger timestamps (OPEN)

- **Exact question** (decision sheet): "What is the authoritative event and timestamp that starts each applicable SLA clock? Specifically: (a) the merchant 72-hour response clock (D02), and (b) the administrator 3-business-day resolution clock (D11)."
- **Status:** OPEN. Source: decision sheet OQ-02; approval pack §3. Depends on D02, D11.
- **Existing documented/implemented behavior** (verified in code):
  - Merchant 72-hour clock: `expiresAt = new Date(Date.now() + MERCHANT_SLA_HOURS × 3600 × 1000)` with `MERCHANT_SLA_HOURS = 72`, set when the return request row is created — i.e., anchored to `return_requests.created_at`, 72 **elapsed** hours including weekends and holidays (matches the preserved requirement).
  - Worker escalation trigger: claims rows where `status = 'REQUESTED' AND expires_at <= NOW()` (`return-expiration.worker.ts`); transition target is ESCALATED only.
  - Administrator 3-business-day clock: provisional default is the `ESCALATED` event's timestamp in `return_request_events`; the ESCALATED transition is implemented and event-recorded; the admin countdown is computed from that event via the business calendar.
  - Retries and duplicate events: each escalation is a single transaction; the worker re-verifies `status='REQUESTED'` immediately before each escalation and treats an already-transitioned return (409 ConflictException) as a skip; the `FOR UPDATE SKIP LOCKED` claim plus lease epoch fencing make a duplicate escalation by a second worker impossible.
  - Timestamp validity verification: monitor check 2 detects any return still REQUESTED past `expires_at` (+10-minute grace) and raises an alert; the whole detection path is read-only.
- **What remains undecided:** formal approval of `created_at` as the merchant clock anchor and of the ESCALATED event timestamp as the admin clock anchor; whether any admin action can reset either clock (nothing of the sort is implemented); confirmation that no historical backfill is wanted (none exists; none should be added without approval).
- **Required approver:** Head of Operations / COO.
- **Options and trade-offs:** approve implemented anchors (consistent with the provisional default and all preserved requirements) vs re-anchor to a delivery-confirmed event (would change `expires_at` semantics and require code changes — no evidence supports this variant in any register).
- **Recommended (not approved):** approve the implemented anchors exactly as implemented; explicitly record "no backfill, no clock reset" as part of the decision.
- **Dependencies / acceptance criteria:** resolution recorded; D02 + D11 approval; monitor check 2 evidence retained as the ongoing validity check.
- **Blocking scope:** blocks Phase 1 entry; blocks D02/D11 verification evidence; no worker/pilot activation implications beyond that.

### 5.3 OQ-04 — Commission allocation and rounding (OPEN — CRITICAL)

- **Exact question** (decision sheet): "What is the approved deterministic allocation method when commission snapshots exist only at the order level (`order_financial_breakdown.commissionMinor`) and a partial return involves some items from a multi-item order? Additionally: how is cumulative rounding across multiple partial returns enforced so that total commission reversals never exceed the original commission?"
- **Status:** OPEN. Source: `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` (present in repo, read in full; §8 decision record entirely `[PENDING]`/`[NOT PROVIDED]`), decision sheet OQ-04, approval pack §3.
- **Existing documented/implemented behavior** (verified in code):
  - Allocation: `reversal = Math.floor(originalCommission × returnNetGoods / orderNetGoods)`, then capped at `remainingCommission = originalCommission − Σ(already reversed)`; skips when remaining ≤ 0 (exact zero-minor-unit tolerance); values in integer minor units on the VAT-exclusive, delivery-fee-exclusive net-goods basis.
  - **This is Option A (cap-at-remaining) semantics.** The repository's own technical decision document (§3.3, §6) warns: "Option A prevents over-reversal but does NOT guarantee full reversal in the under-rounding case" — cumulative shortfall of up to N−1 minor units is possible. The code comment describing this math as "Cumulative-target reversal calculation" is a **mislabel** (Option C's formula is `current_reversal = round(commission_total × eligible_net_goods_returned / net_goods_total) − already_reversed`, which is not what the code computes).
  - Persistence: a dedicated `commission_reversals` ledger (POSTED rows, per-reversal idempotency key, outbox event `commission.reversed`, original commission snapshot retained) — i.e., the technical decision doc's §5.1 "Option 2" persistence model, not the provisionally "recommended" Option 1 (a `refunds.commission_reversal_minor` column). This is a legitimate engineering choice consistent with the preserved constraint "preserve original records and use a dedicated reversal ledger when supported safely", but it has **not** received the documented Engineering sign-off (E1/E2 in §8.2).
  - Concurrency: per-reversal idempotency key (unique), transaction-scoped cumulative read, `FOR UPDATE SKIP LOCKED` claim, worker epoch fencing.
  - Detection: reconciliation flags `EXCESSIVE_REVERSAL` (Σ reversals > `commissionMinor`); monitor checks 6–7 alert on reversal-integrity and over-reversal/over-refund invariant breaches.
  - No automatic historical clawback and no historical backfill exist anywhere in the code.
- **What remains undecided (all require the named approvers):**
  1. **Finance Q1 — algorithm:** Option A (implemented; simplest; does not guarantee full reversal) vs Option B (final-return catch-up; exact; requires detecting the last return) vs Option C (cumulative-target; exact; requires cumulative-target bookkeeping).
  2. **Finance Q2 — mixed responsibility:** denominator = total order net goods (implemented; reverses proportionally to the eligible portion) vs denominator = eligible net goods only (reverses full commission on eligible items). The technical decision doc shows these produce materially different totals (50 vs 100 in its worked example). **This is a genuine business fork that cannot be inferred from code.**
  3. **Finance accounting questions** (technical decision doc §9): rounding tolerance (±1 minor unit vs exact zero); negative-reversal/clawback handling; historical refund treatment (backfill vs start-from-zero at go-live); contested-reclassification timing.
  4. **Engineering sign-off (E1/E2):** authoritative cumulative data source and locking strategy — Engineering must sign off on the **actually implemented** mechanism (dedicated `commission_reversals` ledger + transaction-scoped cumulative read + unique idempotency + SKIP LOCKED claim + epoch fencing), which differs from the doc's provisional "recommended" persistence option.
- **Required approvers:** Finance Lead / CFO (policy Q1, Q2, §9 questions) + CTO / Head of Engineering (E1, E2, subject to Finance invariants). Per the closure checklist, OQ-04 closes only with **both** sign-offs.
- **Options and trade-offs:** see the comparison table in the technical decision doc §6 (Option A: exact in over-rounding, short in under-rounding; B and C: exact in both, higher complexity). Implementation effort exists only for A today.
- **Recommended (not approved):** the preserved Phase 4.1.17 requirement text ("apply cumulative-target rounding and exact zero minor-unit tolerance") is semantically Option C; if Finance requires exact reconciliation, Option C is the consistent choice and would require a separately authorized, narrowly scoped implementation change. If Finance accepts the documented under-rounding shortfall property, Option A can be approved as-implemented with the mislabeled comment corrected. **Either way the decision belongs to Finance; this register does not approve anything.**
- **Dependencies / acceptance criteria:** both sign-offs recorded in the technical decision doc §8 fields; approved option implemented (if not A) or comment corrected (if A); tests per §7 of that doc acknowledged; D04–D07 approvals referencing the resolved OQ-04.
- **Blocking scope:** blocks Phase 1 entry, D04–D07 approval, WP-2D verification sign-off; therefore blocks production deployment and any pilot that exercises commission reversals.

## 6. Remaining open questions — details

**OQ-03 — Return eligibility edge cases (OPEN, MEDIUM, owner: Head of Ops co CX).** Question: interaction of the 14-day window with cancelled orders, partial deliveries, non-delivery, and carrier-damaged deliveries. Provisional default documented (cancelled: ineligible; per-sub-order windows; eligibility starts at DELIVERED; carrier damage handled via D10, not eligibility extension). Undecided: approval per edge case. Blocking: not Phase 1; refines WP-2B.

**OQ-05 — Delivery-fee allocation for exceptions (OPEN, MEDIUM, owner: Finance Lead co Ops).** Question: full vs proportional delivery-fee refund on a partial-return exception. Provisional default: full refund, no proportional logic. Undecided: approval. Blocking: WP-3G (Phase 3), not Phase 1.

**OQ-06 — Delivery-fee exception audit requirements (OPEN, LOW, owner: Finance Lead co Risk).** Question: approver role, valid reason codes, audit-trail requirements. Provisional default: `admin:returns:write` approver; reason codes `MERCHANT_FAULT`/`PLATFORM_FAULT`/`CARRIER_DAMAGE`/`GOODWILL`; `DELIVERY_FEE_EXCEPTION_APPROVED` events. Undecided: approval. Blocking: WP-3G.

**OQ-07 — Settlement adjustment authorization details (OPEN, MEDIUM, owner: Financial Controller).** Question: authorization levels, thresholds, review cycle. Documented behavior already implemented: dual approval for all adjustments (FX-BLOCKED safe default), $10 threshold defined but unevaluable without an FX source, monthly reconciliation. Undecided: approval of the workflow + FX-source decision that would make the $10 threshold operational. Blocking: WP-3G.

**OQ-08 — Voucher permitted outcomes (OPEN, LOW, owner: Finance Lead co Risk).** Question: permitted outcomes and financial consequences for voucher returns. Provisional default: cash refund / store credit (no commission reversal on credit) / reject. Implemented voucher safety rules as listed under D13. Undecided: approval of outcome set. Blocking: WP-3G.

**OQ-09 — Pilot operational owners (OPEN, HIGH, owner: CTO / SRE).** Question: named owners per control, alert recipients, thresholds, rollback authority. Provisional default documented (SRE on-call / Platform Ops lead / CTO rollback). Undecided: named individuals and recipients. Blocking: pilot activation gate (not Phase 1 entry).

**OQ-10 — Pilot scope and criteria (OPEN, HIGH, owner: CTO / Head of Eng co Ops).** Question: environment, scope, start/success/exit criteria. Provisional default documented (TBD environment/scope; start = approvals + implementation + evidence + 4 controls active; success = zero financial discrepancies, zero data loss, SLA >95%, no P1/P2). Undecided: concrete values. Blocking: pilot activation gate.

**OQ-11 — Carrier-damage materiality threshold (OPEN, MEDIUM, owner: Finance Lead co Ops).** Question: what "materially compromises delivery of the order as a whole" means. Provisional default: >50% items damaged or goods unusable; configurable. Undecided: approval + configurability. Blocking: WP-3G.

**OQ-12 — Carrier recovery process (OPEN — NOT APPLICABLE to P13, owner: Head of Ops).** Out of P13 scope; P14+ workflow. No P13 gate depends on it. NOT APPLICABLE for P13 phase-entry/release decisions.

## 7. Blocking matrix

| Item / group | Production deployment | Worker activation | Pilot activation | Later feature only |
|---|---|---|---|---|
| D01–D11, D14, D15 approvals (13/15, Phase 1 entry) | BLOCKS | BLOCKS | BLOCKS | — |
| D12, D13 approvals (Phase 2 entry set) | BLOCKS (via Phase 2) | BLOCKS | BLOCKS | — |
| OQ-01 resolution | BLOCKS (Phase 1 entry) | — | BLOCKS (SLA evidence) | — |
| OQ-02 resolution | BLOCKS (Phase 1 entry) | — | BLOCKS (SLA evidence) | — |
| OQ-04 dual sign-off | BLOCKS (Phase 1 entry) | BLOCKS (commission integrity) | BLOCKS | — |
| OQ-03, OQ-05, OQ-06, OQ-07, OQ-08 | — | — | BLOCKS at WP-3G (Phase 3) | — |
| OQ-09, OQ-10 | — | BLOCKS (worker runs only in pilot) | BLOCKS | — |
| OQ-11 | — | — | BLOCKS at WP-3G | — |
| OQ-12 | — | — | — | NOT APPLICABLE (P14+) |
| Receiver 14-point checklist + owner sign-off | — | — | BLOCKS (alert-delivery gate) | — |
| Release gates G-01–G-08 | BLOCKS release | — | — | — |
| G-09/G-10 status confirmation | OPEN question to project owner (carried forward) | — | — | — |

Note: per the closure checklist, worker activation and pilot activation are themselves separately authorized events on top of these gates; nothing in this register authorizes either.

## 8. Register-maintenance findings (documentation only — no status changed)

1. **Mislabelled comment:** `commission-reversal.service.ts` describes Option A math as "Cumulative-target reversal calculation". Recommended (separately authorized, comment-only change): relabel to "proportional floor, capped at remaining (Option A semantics) — does not guarantee full reversal; algorithm choice pending OQ-04".
2. **Topic-wording drift:** the approval pack §3 summary table lists OQ-08 as "Voucher risk/fraud thresholds", OQ-11 as "Materiality definition ($ threshold)", OQ-12 as "Dispute workflow", while the per-question decision sheets define them as voucher permitted outcomes / carrier-damage materiality / carrier recovery. The decision sheets are the authoritative per-question source; owners agree in both documents; no status is affected.
3. **G-09/G-10:** markdown sources cite G-01–G-08 as release criteria; the xlsx register tracks G-01–G-10. The status of G-09/G-10 was previously flagged for project-owner confirmation and remains unconfirmed — carried forward unchanged.

## 9. Attestation

No decision was marked APPROVED, CLOSED, or COMPLETE. No question was marked resolved. No approver name, date, or evidence was invented or inferred from code, tests, or CI. All statuses reflect repository evidence at HEAD `c01267c`. Recommendations in this register are labelled as such and carry no decision authority.
