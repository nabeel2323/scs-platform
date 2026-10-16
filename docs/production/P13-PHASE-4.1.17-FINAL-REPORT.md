# P13 Phase 4.1.17 — Final Report

**Phase:** 4.1.17 — Governance Blocker Audit and Decision-Closure Plan
**Date:** 2026-10-16
**Branch:** `develop`
**HEAD:** `c01267cfd9be8cac72edb9333f7c7f036647fc1a` (= `origin/develop`, Phase 4.1.16 workflow-fix commit)
**Hosted CI reference:** run `38889251079` (SUCCESS) — evidence of the 4.1.16 workflow fix only; **not** evidence of any business approval.
**Phase type:** READ-ONLY governance audit. No code, tests, migrations, configuration, or register files were modified.

---

## 1. Executive outcome

**GOVERNANCE AUDIT COMPLETE — HUMAN DECISIONS REQUIRED.**

All authoritative governance registers were located, read in full, and reconciled against the current tree at HEAD `c01267c`. The carried-forward baseline counts were verified rather than copied:

| Register | Carried baseline | Reconciled current status | Source |
|---|---|---|---|
| Decisions D01–D15 | 15 provisional, 0 approved | **0/15 APPROVED — all PROVISIONAL — PENDING APPROVAL** | `P13-PHASE-4.1.11-BUSINESS-APPROVAL-PACK.md` §1–§2; `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` |
| Open questions OQ-01–OQ-12 | 12 open | **12/12 OPEN — zero resolved** | `P13-PHASE-0-OPEN-DECISION-SHEETS.md`; approval pack §3 |
| Alert receiver checklist | 0/14 verified | **0/14 — all items UNVERIFIED, no receiver available** | `P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md` |
| OQ-04 algorithm decision | pending | **PENDING — decision record entirely `[PENDING]`/`[NOT PROVIDED]`** | `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` §8 |

No approval was inferred from code, tests, CI results, or prior documents. Every implemented behavior cited in this audit is cited as **documented/implemented behavior**, never as approval.

## 2. Baseline verification (preflight)

1. Branch `develop`; HEAD `c01267cfd9be8cac72edb9333f7c7f036647fc1a`; `origin/develop` identical (0/0 divergence); `c01267c` confirmed present in history (ancestor check) and is the authorized Phase 4.1.16 workflow-fix commit.
2. Working tree at audit time: **0 modified tracked files, 0 staged files, 17 untracked entries** — all preserved:
   - `.m73b6-scratch/` (scratch dir: probes, state files, logs, 4.1.15/4.1.16 helper scripts)
   - `.p41-net-probe.mjs`, `p41-p4suites.json`, `apps/api/.p41-counts.cjs`, `apps/api/.p41-runbook-check.ps1`, `apps/api/.p41-secretscan.cjs` (earlier-phase probe artifacts)
   - 11 untracked phase reports: `P13-PHASE-4.1.14-{COMMIT-PUSH,FINAL,HOSTED-CI}-REPORT*.md` (3), `P13-PHASE-4.1.15-*.md` (5), `P13-PHASE-4.1.16-*.md` (3)
3. Phase 4.1.14, 4.1.15, and 4.1.16 reports re-read; no material divergence between documented baseline and repository state.
4. No `git clean`, staging, reset, stash, checkout, or history operation was performed.

## 3. Sources inspected

### 3.1 Governance registers and specification documents (all read)

| Document | Role |
|---|---|
| `docs/production/P13-PHASE-0-CLOSURE-CHECKLIST-v2.md` | Canonical gate criteria: Phase 1 entry = 13/15 decisions (D01–D11, D14, D15) + OQ-01 + OQ-02 resolved + OQ-04 dual sign-off (Finance policy + Engineering technical); Phase 2 entry = all 15; release = G-01–G-08; OQ-05–OQ-11 assigned to WP-3G (Phase 3); OQ-12 out of P13 scope |
| `docs/production/P13-PHASE-0-OPEN-DECISION-SHEETS.md` | Per-OQ evidence sheets (exact question, accountable role, provisional default, evidence required to close) |
| `docs/production/P13-PHASE-4.1.11-BUSINESS-APPROVAL-PACK.md` | D01–D15 decision register with approver roles, co-approvers, blocking flags; OQ table; hard-blocker analysis |
| `docs/production/P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md` | 14-point receiver checklist (all UNVERIFIED); sender-side 14 properties PASS; fail-closed guarantees; blocking status |
| `docs/production/P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` | OQ-04 primary source: Option A/B/C comparison, mixed-responsibility interpretations, persistence/locking requirements, decision record (pending), 4 outstanding accounting questions |
| `docs/production/P13-PHASE-0-APPROVAL-AGENDA-v2.md`, `P13-PHASE-0-BLOCKER-RECONCILIATION-v2.md`, `P13-PHASE-0-GATE-CONSISTENCY-AUDIT.md` and companion Phase 0 artifacts | Approval process structure (five meetings; Meeting 2 Finance policy; Meeting 4 Engineering OQ-04 sign-off; Meeting 5 consolidation); exist in `docs/production/` (directory enumeration) |
| `docs/production/P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` | Canonical tracking workbook (D01–D15, OQ-01–OQ-12, gates G-01–G-10); markdown sources cite G-01–G-08 as the release criterion — G-09/G-10 status previously flagged for project-owner confirmation (carried forward, unresolved) |
| `docs/production/P13-PHASE-4.1.14-*.md`, `P13-PHASE-4.1.15-*.md`, `P13-PHASE-4.1.16-*.md` | Prior-phase reports (untracked; re-read this phase) |

### 3.2 Source code and tests (read or targeted-grepped)

| File | Relevance |
|---|---|
| `apps/api/src/modules/returns/business-calendar.service.ts` (543 lines) | OQ-01: default calendar Mon–Fri 08:00–18:00 UTC; fail-safe throws (`BUSINESS_CALENDAR_NOT_FOUND`/`_DISABLED`/`_MAX_ITERATIONS`); working-time accumulation; holiday + audit support |
| `apps/api/src/modules/returns/return-expiration.worker.ts` (423 lines) | OQ-02/D03/D15: opt-in worker (`P13_WORKER_ENABLED`), epoch-fenced lease, claims `REQUESTED AND expires_at <= NOW()`, escalates only (never approves/rejects/refunds/expiry), pausable fail-closed, alert 1 at threshold |
| `apps/api/src/modules/returns/returns.service.ts` | OQ-02: `MERCHANT_SLA_HOURS = 72`; `expiresAt = now + 72h` at creation; D09: delivery-fee exception "requires dual approval" |
| `apps/api/src/modules/returns/commission-reversal.service.ts` | OQ-04: implemented math `floor(originalCommission × returnNetGoods / orderNetGoods)` capped at remaining — Option A semantics (code comment mislabels it "cumulative-target"); cumulative baseline from `commission_reversals` ledger; idempotency key; over-reversal guard |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | D12/OQ-07: `thresholdMinor: 1000` ($10.00); `fxStatus='BLOCKED'` for ALL adjustments (no authoritative FX provider) → dual approval always required as safe default; 2 distinct approvers (Finance + admin); creator-cannot-approve |
| `apps/api/src/modules/returns/reconciliation.service.ts` | EXCESSIVE_REVERSAL detection; POSTED-without-required-dual-approval flag |
| `apps/api/src/modules/operations/p13-monitor.service.ts` (590 lines) | 10 read-only alert conditions incl. poll failures, overdue REQUESTED, worker count, heartbeat, refund/commission/financial-invariant/tenant-isolation/outbox/alert-delivery checks |
| `apps/api/src/modules/operations/p13-ops.config.ts` (165 lines) | Safe defaults: `workerEnabled=false`, `pilotMode='legacy'`, `expectedWorkerCount=1`, `pollFailureAlertCount=3`, `requestedStaleMs=10min`, `heartbeatStaleMs=5min`, freshness 300s, fail-closed webhook (secret <32 chars → log-only) |
| `apps/api/src/__tests__/unit/returns/delivery-fee-voucher.spec.ts` | D13 voucher rules: refund to original payment method; no replacement vouchers; unused balance only; expired value not restored; provider failure → FAILED; webhook idempotency |
| `apps/api/src/__tests__/unit/returns/commission-reversal.spec.ts` | Proportional net-goods allocation test evidence |

## 4. Headline findings

1. **0/15 decisions approved.** All D01–D15 remain PROVISIONAL — PENDING APPROVAL with named accountable approvers. Hard blockers unchanged: business calendar (OQ-01/D11), SLA trigger timestamps (OQ-02/D02+D11), commission allocation + rounding (OQ-04/D04–D07), and formal approval of all 15 decisions.
2. **12/12 open questions OPEN.** OQ-01, OQ-02, OQ-04 block Phase 1 entry. OQ-05–OQ-11 are not Phase 1 blockers (WP-3G, Phase 3). OQ-12 is out of P13 scope (P14+).
3. **OQ-04 has an implementation/approval gap that must not be papered over:** the implemented algorithm is Option A semantics (floor + cap-at-remaining), which the repository's own technical decision document warns "prevents over-reversal but does NOT guarantee full reversal" (under-rounding shortfall up to N−1 minor units). The code comment mislabels this as "cumulative-target". Options B/C remain unimplemented and unapproved. The Finance decision record (§8 of the technical decision doc) is entirely `[PENDING]`.
4. **Alert receiver: 0/14 UNVERIFIED (rechecked; unchanged since Phase 4.1.11).** No production receiver exists or was made available. Sender side: 14/14 properties PASS (30 unit + 18 integration tests). External delivery remains correctly suppressed by fail-closed defaults. BLOCKED BY EXTERNAL DEPENDENCY.
5. **All documented operational safeguards are implemented in code** (Section 8; detail in the operational gap report), including every preserved alert condition and threshold.
6. **All documented financial safeguards are implemented in code** (Section 8): $10 settlement threshold (dual-approved regardless due to FX-BLOCKED hold), Finance+admin dual approval with self-dealing prevention, no invented FX rates, voucher rules, refund caps, commission over-reversal detection, no automatic financial action on timeout.
7. **Minor register-maintenance findings** (documentation only; no runtime impact): (a) the "cumulative-target" code comment in `commission-reversal.service.ts` mislabels Option A math; (b) OQ-08/OQ-11/OQ-12 topic wording differs between the approval pack summary table and the per-question decision sheets (sheets are authoritative); (c) G-09/G-10 gate status remains flagged for project-owner confirmation. None of these changes any item's status.

## 5. Exit criteria verification

| # | Criterion | Status |
|---|---|---|
| 1 | Inventory reconciled against authoritative source documents | MET — counts verified (15 D / 12 OQ), not copied |
| 2 | OQ-01/OQ-02/OQ-04 have clear decision requests + identified approvers, or remain explicitly OPEN/BLOCKED | MET — all three remain OPEN with named approver roles and documented evidence requirements (register §6.1–6.3) |
| 3 | D01–D15 and all OQ items individually documented | MET — register §4–§6 |
| 4 | Alert receiver 14-point checklist evidence-backed | MET — gap report §2 (all 14 UNVERIFIED with required evidence named) |
| 5 | Production blockers + dependencies explicitly listed | MET — register §7 blocking matrix |
| 6 | Next phase scoped around approved requirements, not guesses | MET — next-phase plan §2–§4 |
| 7 | Working tree and excluded artifacts preserved | MET — §2 above; no clean/stage/reset operations |
| 8 | No deployment, activation, or production financial-data change | MET — §9 below |

## 6. Governance blockers requiring human decisions

Full detail: `P13-PHASE-4.1.17-GOVERNANCE-DECISION-REGISTER.md`.

| Blocker | Owner | Blocks |
|---|---|---|
| All 15 decisions D01–D15 require attributable approval | Named per decision (Ops, Merchant Partnerships, Finance/CFO, Financial Controller, CTO/Head of Eng, SRE) | Phase 1 entry (13/15), Phase 2 entry (15/15), pilot |
| OQ-01 business calendar (timezone, holidays, hours) | Head of Operations / COO | D11, Phase 1 entry |
| OQ-02 SLA trigger timestamps | Head of Operations / COO | D02, D11, Phase 1 entry |
| OQ-04 commission allocation + rounding (algorithm A/B/C, mixed-responsibility interpretation, 4 accounting questions) | Finance Lead / CFO + CTO/Head of Engineering (dual sign-off) | D04–D07, WP-2D, Phase 1 entry |
| Receiver 14-point checklist + owner sign-off | External receiver owner | External alert-delivery activation, pilot gates |

## 7. Operational readiness gaps

Full detail: `P13-PHASE-4.1.17-OPERATIONAL-READINESS-GAP-REPORT.md`. Receiver 0/14 UNVERIFIED across signature verification (1–3), deduplication (4–5), acceptance/rejection (6–10), error/retry (11–12), end-to-end evidence + owner sign-off (13–14). Sender-side fail-closed guarantees verified. No production webhook activated; no test messages sent; no receiver configuration fabricated.

## 8. Financial and deployment gates preserved (verified, not weakened)

- Exactly one worker-enabled API instance (`expectedWorkerCount=1` default; worker service separated; count-anomaly alert on zero/multiple live holders).
- `P13_WORKER_ENABLED=false` and `P13_PILOT_MODE=legacy` are code defaults; empty pilot allowlist behavior preserved (unreadable/empty allowlist denies everything in `allowlist` mode).
- No automatic financial action on timeout — worker escalates only (`processExpiration` never approves/rejects/refunds/expires).
- Delivery-fee exceptions require dual approval (Finance + admin) — enforced in `returns.service.ts`/settlement flow.
- Settlement adjustments: threshold `thresholdMinor: 1000` ($10) defined; because no authoritative FX provider exists, **all** adjustments are created `fxStatus='BLOCKED'` + `requiresDualApproval=true` (safe default; USD-equivalent threshold intentionally unevaluable); creator cannot be any approver; reconciliation flags POSTED-without-dual-approval.
- No invented FX rates; SYP-only records hold at BLOCKED.
- Voucher rules verified in test evidence: refund to original payment method; no replacement vouchers; only unused balance preserved; redeemed/expired value never restored; provider failure → FAILED (retry/review); duplicate webhook → no duplicate refund.
- Refund caps (confirmed payment − already refunded), delivery-fee refund caps (original fee − already refunded), idempotency throughout.
- Commission reversal: cumulative baseline from dedicated `commission_reversals` ledger, cap prevents over-reversal, exact-zero skip, idempotency key, `EXCESSIVE_REVERSAL` reconciliation detection, monitor checks 6–7 enforce financial invariants.
- No historical clawback or backfill logic exists; none was added.

## 9. Explicit statement of what was NOT done

- No production deployment, merge, or release of any kind.
- No production worker, webhook, or pilot activation; no alert delivery enabled.
- No production financial data change of any kind; no financial mutation executed.
- No business policy invented, no holiday list/timezone/FX rate/approval fabricated.
- No decision converted to APPROVED/CLOSED/COMPLETE; no OQ converted to resolved.
- No test weakened; no tenant-isolation, financial invariant, monitoring gate, or CI requirement altered.
- No commit or push (all four deliverables are untracked, unstaged).
- No receiver contacted, no endpoint probed, no credentials created or recorded.

## 10. Tests run / not run / limitations

- **Tests run: none.** This is a read-only governance audit; no code was modified, so no test suite was executed. Hosted CI run `38889251079` (4.1.16) is referenced solely as workflow-fix evidence.
- **Tests not run:** all suites; also no live receiver verification (impossible — no receiver exists).
- **Limitations:** (a) no production environment access — readiness evidence is repository-based; (b) no business stakeholders consulted — this audit prepares decision requests, it does not make decisions; (c) provisional defaults in the decision sheets are documented positions, not approvals; (d) initial file-discovery searches returned empty results for `docs/production/` — direct directory enumeration and git history were used instead, and all document-existence findings in this report rest on the enumeration (notably, `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` was confirmed present and read in full); (e) the xlsx tracking register was not parsed this phase — its D/OQ status contents were taken as described by the markdown registers, which agree.

## 11. Deliverables (all untracked, unstaged)

1. `docs/production/P13-PHASE-4.1.17-FINAL-REPORT.md` (this file)
2. `docs/production/P13-PHASE-4.1.17-GOVERNANCE-DECISION-REGISTER.md`
3. `docs/production/P13-PHASE-4.1.17-OPERATIONAL-READINESS-GAP-REPORT.md`
4. `docs/production/P13-PHASE-4.1.17-NEXT-PHASE-PLAN.md`

## 12. Final status

**GOVERNANCE AUDIT COMPLETE — HUMAN DECISIONS REQUIRED**

Production readiness is **not** claimed. Green CI (run 38889251079) demonstrates the container-build workflow fix only. The program remains gated on: 0/15 business approvals, 12/12 open questions, and 0/14 receiver verification.
