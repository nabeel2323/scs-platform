# P13 Phase 4.1.17 — Next Phase Plan

**Phase:** 4.1.17 | **Date:** 2026-10-16 | **Branch:** `develop` | **HEAD:** `c01267cfd9be8cac72edb9333f7c7f036647fc1a`

**Principle:** the next implementation phase is scoped around **approved requirements only**. Every stage below either (a) is a human decision activity that requires no code, or (b) is an implementation/verification activity that is explicitly conditional on a documented approval and requires separate authorization. Nothing here activates a worker, webhook, pilot, or deployment.

## 1. Current position in the dependency chain

```
[Stage A] Human decisions (D01–D15 approvals + OQ-01/02/04 closure)   ← PROGRAM IS HERE (0/15, 0 resolved)
    └─► Phase 1 entry gate: 13/15 decisions + OQ-01 + OQ-02 + OQ-04 dual sign-off
            └─► [Stage B] Post-approval implementation alignment (conditional)
                    └─► Phase 2 entry gate: all 15 decisions + dependent OQs before dependent WPs
                            └─► [Stage C] Receiver verification (external, parallel from today)
                                    └─► [Stage D] Pilot readiness verification vs G-01–G-08 (gated on A+B+C+D14/D15/OQ-09/OQ-10)
                                            └─► Pilot (separately authorized) → release decision
```

## 2. Stage A — Human decision package (not a code phase; no authorization needed to *request*)

This is the critical path. The repository already contains everything the approvers need: `P13-PHASE-4.1.11-BUSINESS-APPROVAL-PACK.md` (per-decision approver roles + approval fields), `P13-PHASE-0-APPROVAL-AGENDA-v2.md` (five-meeting structure: Meeting 2 Finance policy; Meeting 4 Engineering OQ-04 sign-off; Meeting 5 consolidation), `P13-PHASE-0-OPEN-DECISION-SHEETS.md` (exact questions + evidence required), `P13-COMMISSION-ROUNDING-TECHNICAL-DECISION-v1.md` (OQ-04 option comparison + decision record), and `P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` (tracker).

| # | Ask | Owner | Input documents |
|---|---|---|---|
| A1 | Approve or reject D01–D03, D11 (returns/SLA policy) | Head of Ops/COO; Head of Merchant Partnerships (D02) | Approval pack §2; sheets OQ-01/02/03 |
| A2 | Resolve OQ-01 (calendar definition: timezone + hours + holiday source) | Head of Ops/COO | Register §5.1; calendar implemented + fail-safe |
| A3 | Resolve OQ-02 (SLA clock anchors; no backfill) | Head of Ops/COO | Register §5.2 |
| A4 | Resolve OQ-04 Finance part: algorithm A/B/C, mixed-responsibility denominator, 4 accounting questions (§9 of the technical decision doc) | Finance Lead / CFO | Technical decision doc §2–§6, §8.1, §9 |
| A5 | Resolve OQ-04 Engineering part: sign off the implemented persistence (dedicated `commission_reversals` ledger) + locking (transaction-scoped cumulative read + unique idempotency + SKIP LOCKED claim + epoch fencing), subject to A4 invariants | CTO / Head of Engineering | Technical decision doc §5, §8.2 |
| A6 | Approve or reject D04–D10, D12, D13 (financial policy) | Finance Lead/CFO; Financial Controller (D12); Risk (co, D13) | Approval pack §2; sheets OQ-05–OQ-08 |
| A7 | Approve or reject D14, D15 (deployment target, pilot controls) | CTO / Head of Engineering (co: SRE) | Approval pack §2 |
| A8 | Name pilot operational owners + recipients; define pilot scope/criteria (OQ-09/OQ-10) | CTO/SRE; CTO/Ops | Sheets OQ-09/OQ-10 |
| A9 | Confirm G-09/G-10 gate status (carried discrepancy) | Project owner | xlsx register; closure checklist (cites G-01–G-08) |
| A10 | Resolve OQ-05–OQ-08, OQ-11 (may be scheduled with WP-3G, Phase 3 — not Phase 1 blockers) | Respective owners (see register §6) | Sheets |

**Exit:** attributable approvals recorded (name, role, date, rationale, evidence) in the register + xlsx tracker; OQ-01/02/04 decision records completed. **This stage requires zero code changes.**

## 3. Stage B — Post-approval implementation alignment (conditional; requires separate authorization)

Proposed as **Phase 4.1.18** only after the Stage A items it depends on. Each work item names its authorizing decision:

1. **B1 — Commission rounding alignment (authorizer: A4+A5).** If Finance approves Option C (cumulative-target): implement `current_reversal = round(commission_total × eligible_net_goods_returned / net_goods_total) − already_reversed` in `commission-reversal.service.ts` (and the equivalent path in `returns.service.ts`), keeping the cap as a defensive invariant; extend `commission-reversal.spec.ts` with the over-rounding (6-item) and under-rounding (7-item) exactness cases from the technical decision doc §2; add a concurrency test proving serialized cumulative reads. If Finance approves Option A as-is: **no runtime change** — only the comment correction in B4. If Option B: scope the "last eligible return" detection first (design note required before implementation). No migration expected for B or C (the ledger already persists cumulative state).
2. **B2 — Calendar configuration data entry (authorizer: A2).** Enter the approved holiday list (possibly empty) and confirm timezone via the existing admin endpoints; no code change expected; re-run calendar unit checks; verify fail-safe behavior after configuration changes.
3. **B3 — Settlement FX decision support (authorizer: A6/D12 outcome).** If Finance designates an authoritative FX source, the $10 threshold becomes evaluable; until then the FX-BLOCKED + dual-approval safe default remains untouched. No invented rates under any outcome.
4. **B4 — Comment correction (authorizer: any maintainers; comment-only).** Relabel the "Cumulative-target reversal calculation" comment in `commission-reversal.service.ts` to accurately describe Option A semantics with the under-reversal caveat and the pending OQ-04 reference. One-line change; no behavior change.
5. **B5 — Register wording reconciliation (authorizer: documentation-only).** Align the approval pack §3 OQ topic wording with the decision sheets (sheets authoritative); record the G-09/G-10 outcome from A9.

**Explicitly out of Stage B:** any migration to financial tables without an approved requirement; any worker/webhook/pilot activation; any backfill or clawback tooling (prohibited by preserved constraints unless a future approved phase explicitly authorizes it); any test weakening.

## 4. Stage C — Receiver verification track (external; starts in parallel with Stage A)

The sender side is complete and fail-closed; the gap is entirely external.

1. C1 — Business/designate a production alert receiver implementation and an attributable owner (this is itself a decision; belongs with A7/A8).
2. C2 — Receiver owner implements and verifies the 14-point checklist (`P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md` §3) against **disposable test endpoints only**; program provides the v2 protocol description (`${timestamp}.${rawBody}` HMAC-SHA256, `X-SCS-Alert-Signature`, `X-SCS-Alert-Timestamp`, 300 s default freshness) and may provide a disposable test-receiver reference without touching production.
3. C3 — Receiver owner delivers retained end-to-end evidence (items 13) and the attributable sign-off (item 14).
4. C4 — Only then is configuring a real webhook URL/secret considered — as a separately authorized change, in `allowlist`-safe order (secret provisioned before URL; the config layer enforces fail-closed regardless).

## 5. Stage D — Pilot readiness verification (last; requires A+B+C complete)

A verification-only phase against the release gates G-01–G-08: all work packages verified, all required gates passing, deployment-invariants suite green on the release candidate, monitor checks active, pause control tested (kill-switch), single-worker-instance deployment config confirmed, receiver 14/14 + sign-off attached, and **explicit human release authorization recorded**. The pilot itself (worker enabled, allowlist mode, allowlist populated) remains a separately authorized event after Stage D — never an automatic consequence of gates passing.

## 6. Test plan for the next implementation phase (Stage B, if authorized)

- Unit: commission-reversal spec extended with exactness cases for the approved algorithm; existing 36-deployment-invariant suite must remain green and unweakened.
- Integration: PostgreSQL suites for returns/financial-dispute/concurrency re-run on disposable services; verify cumulative sums against the approved algorithm's expected totals.
- Typecheck/lint unchanged; CI must remain green; container gates unchanged.

## 7. What will NOT be done without explicit separate authorization

No deployment or merge; no worker/webhook/pilot activation; no production financial-data change; no invented policy, calendar data, FX rates, credentials, or approvals; no migration merely to make a decision item appear resolved; no weakening of tests, tenant isolation, financial invariants, monitoring gates, or CI requirements.

## 8. Recommended next phase

**Recommendation (not an authorization):** run **Stage A now** — it is the critical path, requires zero code, and every input document already exists in the repository. In parallel, start **Stage C** receiver identification, since it is the only other long-lead external dependency. The first implementation phase after that is **Stage B**, strictly conditional on A4+A5 (OQ-04) and A2 (OQ-01) outcomes, with B4/B5 as trivial, separately-authorized documentation fixes that can proceed at any time.
