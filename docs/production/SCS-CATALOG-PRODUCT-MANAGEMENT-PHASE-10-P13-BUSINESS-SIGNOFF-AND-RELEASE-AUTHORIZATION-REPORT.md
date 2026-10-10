# SCS P13 — Business Sign-Off and Release Authorization Readiness Report

**Milestone:** `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13` — Returns, Refunds & Disputes Integration
**Task scope:** Prepare the evidence and authorization package for the P13 release gate. **Preparation and verification only** — no commit, push, deploy, production-data change, or release declaration.
**Prior technical gate (input):** `P13 RELEASE CLOSURE READINESS = PASS WITH CONDITIONS`

---

## FINAL GATE (verbatim)

```
BLOCKED — BUSINESS APPROVALS PENDING
```

Rationale: All six P13 business decisions **and** the deployment-target decision are unapproved `PENDING` items (see §3, §4). Technical verification is complete and the full regression was re-run clean on the current tree (§5, §6), with a single environment-only caveat on the local web/admin production packaging build (§6.3, AC-P13-030). The dominant blocker is business authorization, which cannot be inferred from code, tests, documents, or this prompt. No release commit is authorized by this task (§8).

---

## 1. Baseline, HEAD, and working-tree status

Verified at start and re-checked (no drift; no commit created by this task):

- **Branch:** `develop`  **HEAD:** `762d950`
- **Working tree:** 14 tracked modifications + full untracked P13 surface preserved:
  - Modified: `apps/admin/src/components/AdminSidebar.tsx`, `apps/api/infra/drizzle/seed-pg.ts`, `apps/api/src/__tests__/integration/{phase3-security.e2e.spec.ts,seed-pg.postgres.spec.ts}`, `apps/api/src/__tests__/scratch/p6-independent-runtime-verification.postgres.spec.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common/tenant-scope.ts`, `apps/api/src/drizzle/schema.ts`, `apps/api/src/modules/payments/payments.schema.ts`, `apps/api/src/modules/reviews/disputes.service.ts`, `apps/api/src/modules/reviews/support.schema.ts`, `apps/web/src/app/merchant/layout.tsx`, `apps/web/src/app/orders/[id]/page.tsx`, `apps/web/src/lib/buyer-api.ts` (366 insertions / 41 deletions).
  - Untracked: `apps/admin/src/app/returns/`, `apps/api/src/modules/returns/`, `apps/api/src/__tests__/unit/returns/`, `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts`, `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts`, `apps/web/src/app/merchant/returns/`, `apps/web/src/app/returns/`, `infra/drizzle/migrations/0059_return_requests.sql`, and the P13 docs.
- **No destructive operation** (`git reset`/`clean`, DB drop) performed. No commit, push, or deploy.

## 2. Changes made and files changed by this task

**No P13 source code was modified by this task.** Deliverables created:

- `docs/production/P13-BUSINESS-SIGNOFF-REGISTER.md` — six-decision business register + deployment-target section (§2/§3).
- `docs/production/P13-RELEASE-FOLLOW-UPS.md` — two separately-tracked follow-up items (§6).
- `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-SIGNOFF-AND-RELEASE-AUTHORIZATION-REPORT.md` — this report (§7).
- Non-product scratch runners/logs under `c:\TAIF\.m73b6-scratch\` (regression, focused-suite, build, diagnostics).

## 3. Six-item business decision register (with approval evidence)

Full detail (proposed default, alternatives, consequences, approver role, date/rationale, evidence) is in `P13-BUSINESS-SIGNOFF-REGISTER.md`. Status summary:

| # | Decision | Proposed default (as implemented) | Accountable approver role | Status | Approval evidence |
|---|---|---|---|---|---|
| 1 | Return window | 14 days from delivery | Head of Operations / COO | **PENDING** | none — no owner instruction |
| 2 | Commission on refunds | Retain original platform commission | Finance Lead / CFO | **PENDING** | none — no owner instruction |
| 3 | Delivery-fee refunds | Refund only on full sub-order returns | Finance Lead (co: Ops) | **PENDING** | none — no owner instruction |
| 4 | Merchant response SLA | 72 hours before automatic expiry | Head of Merchant Partnerships | **PENDING** | none — no owner instruction |
| 5 | Settlement recovery | Manual admin handling (no auto clawback) | Financial Controller | **PENDING** | none — no owner instruction |
| 6 | Voucher returns | Require admin review | Finance Lead (co: Risk/Fraud) | **PENDING** | none — no owner instruction |

**0 of 6 approved.** No decision was marked approved from code, tests, the architecture lock, prior implementation, or this prompt — doing so would be non-attributable. The approvers named above are roles; specific individuals must be designated by the business and must record decision + date + rationale in the register.

## 4. Deployment target and scheduler acceptance

From `P13-BUSINESS-SIGNOFF-REGISTER.md` §2:

- **Selected target:** `<to be designated>` — ☐ `LIMITED_SINGLE_PROCESS_PILOT` ☐ `MULTI_INSTANCE_PRODUCTION`. **Status: PENDING** (owner: CTO / Head of Engineering). The pilot target was **not** silently assumed.
- **If `LIMITED_SINGLE_PROCESS_PILOT`:** owner accepts the existing in-process `ReturnExpirationWorker` **provided** the four operational controls are assigned and confirmed — (a) alert on repeated expiration-poll errors; (b) monitor overdue via `status = 'REQUESTED' AND expires_at < NOW() - interval '10 min'`; (c) confirm the designated single worker instance; (d) monitor startup registration and worker activity. All four remain unchecked pending owner acceptance.
- **If `MULTI_INSTANCE_PRODUCTION`:** remains a **blocking condition** until a supported durable scheduler or equivalent leader-coordinated worker is implemented, tested, and independently verified. No BullMQ / new infrastructure / scheduler redesign was introduced by this task.

## 5. Full regression — command, results, failures, skip analysis

**Working directory:** `apps/api`. **Exact command (exit code 0):**

```
npx vitest run --pool=forks --poolOptions.forks.singleFork=true --testTimeout 30000 --hookTimeout 60000
```

- **Result:** **Test Files 151 passed (151) · Tests 3098 passed (3098) · 0 failed · 0 skipped** · Duration 829.01s (start 00:23:14 → end 00:37:03) · **REGRESS_DONE_EXIT=0** (log `p13so_regress.log`).
- **Failures:** none. This is the **complete** suite run, not an isolated result — the entire suite is described as passing only because the whole suite was re-executed here.
- **Prior-session reconciliation:** the previous task's full run was `150/151 files, 4 failed` (all in `seed-pg.postgres.spec.ts`, RBAC counts 76→78 after P13 added `admin:returns:read/write`). That seed-count correction is confirmed in the current tree (`seed-pg.ts` +8, `seed-pg.postgres.spec.ts` +18) and **resolved this run** — 151/151, 3098/3098.
- **Skipped / environment-dependent:** **0 skipped.** The historical "196 skipped" was Docker-connection/testcontainers flakiness under parallel forks; under single-fork every test executed. Static scan confirms no `.skip/.only/.todo` were introduced.
- **PostgreSQL integration exercised:** yes — every `*.postgres.spec.ts` provisions a throwaway PostgreSQL via `@testcontainers/postgresql` and applies migrations through `0059`; RV fresh-migration, P6/P11/M7.3-B.5 concurrency, financial/dispute, returns, seed-RBAC, and security specs all ran green.
- **No tests weakened, deleted, or skipped** to obtain the pass — assertions still enforce exact counts, idempotency, and per-role distribution.
- **Benign warning:** a Vitest-2 deprecation note ("auto-awaits hanging assertions … will fail in Vitest 3") appears on stderr; it is non-failing and pre-existing, not a P13 defect.
- **Environment limitation:** this is a Windows Docker-Desktop run, not Linux CI. It succeeded cleanly here, but see §6.3 — the local `next build` packaging step is separately blocked by a node_modules store defect. Linux CI remains the recommended final pre-production confirmation.

## 6. P13-specific verification and build results (current tree)

### 6.1 Focused P13 suites (re-run this task, exit 0, 52.88s) — 162/162
| Suite | File | Tests | Result |
|---|---|---|---|
| Returns FSM (unit) | `unit/returns/returns-fsm.spec.ts` | 86 | ✓ |
| Returns PG (integration/concurrency/cross-store) | `integration/p13-returns.postgres.spec.ts` | 14 | ✓ |
| Dispute/refund/settlement PG | `integration/p13-financial-dispute.postgres.spec.ts` | 10 | ✓ |
| RBAC seed (78 total / SUPER_ADMIN 78 / ADMIN 54) | `integration/seed-pg.postgres.spec.ts` | 5 | ✓ |
| Security / permission / IDOR | `integration/phase3-security.e2e.spec.ts` | 47 | ✓ |

### 6.2 Type-check & API production build (re-run this task)
- **`pnpm typecheck` → exit 0** (turbo: **9/9 tasks successful**; API, web, admin, and all packages compile with `tsc --noEmit`). This confirms the current tree is the tested tree at the type level, and that all P13 web/admin/returns sources are valid and import-resolvable.
- **`@scs/api` build (`nest build`) → success** (TSC found 0 issues; SWC compiled 336 files).

### 6.3 Web/Admin `next build` — BLOCKED by local environment (NOT a code defect)
- `pnpm build` → **exit 1**: `@scs/web` and `@scs/admin` (`next build`) fail identically with `Cannot find module …\node_modules\.pnpm\next@14.2.35_…\next\dist\compiled\jest-worker\processChild.js` (`MODULE_NOT_FOUND`).
- **Diagnosis:** the `next@14.2.35` store package is **trimmed/corrupted** — `next/dist/compiled/*` (jest-worker, react, babel, react-dom, webpack) and `next/dist/bin/next` are missing from disk (verified via `p13so_diag_*.ps1`). This is Next.js failing to load **its own** bundled files, not any app module.
- **Why this is environmental, not P13:** (1) type-check of the exact same web/admin sources passes 9/9; (2) API build is green; (3) the **identical source tree** built 6/6 in the prior task before the store was trimmed; (4) the only post-build change since then is documentation `.md` files, which are not build inputs; (5) running `next dev` servers on :3100/:3200 currently hold the package, so a repair would require stopping the user's live environment and reinstalling the whole virtual store.
- **Remedy (for the user / Linux CI, not run here to avoid disruption):** stop the dev servers, then `pnpm install --frozen-lockfile` to restore the `next` store package, and re-run `pnpm build`; alternatively run the packaging build on a clean Linux CI checkout. **This report does not claim the web/admin build passed in this environment.**

## 7. Acceptance criteria traceability (AC-P13-001 … AC-P13-030)

Legend: **[RERUN]** re-demonstrated on the current tree this task · **[PRIOR-IDENTICAL-TREE]** verified in the prior task and the tree is unchanged since · **[ENV-CAVEAT]** verified but with a local environment caveat.

| AC | Area | Basis this task | Status |
|---|---|---|---|
| AC-P13-001 | FSM 12-state legal transitions | [RERUN] returns-fsm 86/86 | PASS |
| AC-P13-002 | Terminal states no outgoing transitions | [RERUN] returns-fsm | PASS |
| AC-P13-003 | Eligibility: DELIVERED/COMPLETED + payment state | [RERUN] p13-returns | PASS |
| AC-P13-004 | Return window (14d) enforced | [RERUN] returns-fsm + p13-returns (mocked clock) | PASS |
| AC-P13-005 | Cumulative returned qty ≤ ordered | [RERUN] p13-returns (bigint-coercion fix) | PASS |
| AC-P13-006 | Refund = partial sum / full incl. delivery fee | [RERUN] p13-financial-dispute | PASS |
| AC-P13-007 | Cumulative refund ≤ confirmed payment | [RERUN] p13-financial-dispute | PASS |
| AC-P13-008 | Idempotent refund (key enforced) | [RERUN] p13-financial-dispute | PASS |
| AC-P13-009 | Buyer IDOR → 403 | [RERUN] phase3-security + p13-returns | PASS |
| AC-P13-010 | Merchant cross-store → 403 (assertStoreMember) | [RERUN] p13-returns cross-store | PASS |
| AC-P13-011 | Admin cross-org access allowed | [RERUN] p13-returns | PASS |
| AC-P13-012 | Order breakdown never mutated | [RERUN] p13-financial-dispute + code review | PASS |
| AC-P13-013 | PAID settlement → new ADJUSTMENT record | [RERUN] p13-financial-dispute | PASS |
| AC-P13-014 | PENDING/CALCULATED settlement updated in place | [RERUN] p13-financial-dispute | PASS |
| AC-P13-015 | GOOD condition → qty_on_hand + RETURN movement | [RERUN] p13-returns inventory | PASS |
| AC-P13-016 | DAMAGED/DEFECTIVE → RELEASE + ADJUST | [RERUN] p13-returns inventory | PASS |
| AC-P13-017 | No restoration on REJECTED_AFTER_INSPECTION | [RERUN] returns-fsm + p13-returns | PASS |
| AC-P13-018 | FOR UPDATE lock during restoration | [RERUN] p13-returns concurrency | PASS |
| AC-P13-019 | Two simultaneous returns → one 409 | [RERUN] p13-returns concurrency | PASS |
| AC-P13-020 | Concurrent refund approval → one Conflict | [RERUN] p13-financial-dispute concurrency | PASS |
| AC-P13-021 | Dispute resolution creates refund recommendation | [RERUN] p13-financial-dispute | PASS |
| AC-P13-022 | Dispute + return refund ≤ confirmed payment | [RERUN] p13-financial-dispute | PASS |
| AC-P13-023 | Atomic outbox event per transition | [RERUN] p13-returns + p13-financial-dispute | PASS |
| AC-P13-024 | Migration 0059 on fresh DB | [RERUN] every *.postgres.spec.ts applies 0001–0059 on a fresh container | PASS |
| AC-P13-025 | Migration 0059 on existing DB (idempotent) | [PRIOR-IDENTICAL-TREE] prior §4 existing-DB-at-0058 upgrade; tree unchanged | PASS |
| AC-P13-026 | Buyer web UI full lifecycle | [PRIOR-IDENTICAL-TREE] browser E2E run10 25/25 (`p13_e2e_run10.log`); tree unchanged | PASS |
| AC-P13-027 | Merchant web UI workflow | [PRIOR-IDENTICAL-TREE] browser E2E run10 M01–M05 | PASS |
| AC-P13-028 | Admin web UI oversight | [PRIOR-IDENTICAL-TREE] browser E2E run10 A01–A04/D01–D04 | PASS |
| AC-P13-029 | All existing P12/regression tests pass | [RERUN] 3098/3098 full suite | PASS |
| AC-P13-030 | Project builds without errors (exit 0) | typecheck 9/9 + `nest build` green [RERUN]; web/admin `next build` **[ENV-CAVEAT]** — passed 6/6 prior task on identical tree, local re-run blocked by trimmed `next` store package | **CONDITIONAL** — confirm packaging build on Linux CI / clean `pnpm install` |

**Summary:** 29 of 30 acceptance criteria are PASS by re-run this task or by unambiguous prior-task evidence on the unchanged tree. **AC-P13-030 is CONDITIONAL**: the application code type-checks and the API builds cleanly this task, but the local web/admin Next production packaging step could not be re-executed due to a node_modules store-integrity defect (not a code defect). It is recommended to close AC-P13-030 with a Linux CI (or clean-install) `pnpm build` before release.

## 8. Outstanding risks and separately tracked follow-ups

- **Business approvals (§3):** 6 of 6 pending — the primary release blocker.
- **Deployment target (§4):** not selected; pilot operational controls not accepted; multi-instance retains the durable-scheduler blocking condition.
- **AC-P13-030 / local build (§6.3):** `next` store package trimmed → web/admin `next build` blocked locally; close via CI or `pnpm install --frozen-lockfile` after stopping dev servers. Environment-only; no code change required.
- **Follow-ups (tracked in `P13-RELEASE-FOLLOW-UPS.md`, not absorbed into P13):**
  - **FU-P13-01** — P11 moderator concurrency/ledger race observed on stderr under full-suite load (`p11-independent-runtime-verification.postgres.spec.ts` still passes; lenient assertion). P11-domain follow-up; does not block P13.
  - **FU-P13-02** — Admin client-side `AccessDenied` gate parity outside the returns page (server `PermissionsGuard` verified as the real boundary; UX-only gap). Does not block P13.
- **No P13 defect** surfaced by the re-run; none of the follow-ups blocks a stated P13 acceptance criterion or security boundary.

## 9. Release recommendation

**Recommendation: do not release P13 yet.** Technical verification is complete and reproducible (full regression 3098/3098, focused P13 162/162, typecheck 9/9, API build green on `develop @ 762d950`), but release is gated on business decisions and an authorization that this task cannot and must not supply.

**Gate: `BLOCKED — BUSINESS APPROVALS PENDING`.**

To advance the gate, the following are required:
1. **Six business decisions** (§3) recorded `APPROVED` with approver name, role, date, and rationale by authorized owners.
2. **Deployment target** (§4) explicitly selected; if pilot, accept the four worker controls; if multi-instance, implement + independently verify a durable/leader-coordinated scheduler first.
3. **Close AC-P13-030** with a clean `pnpm build` on Linux CI (or after a `next` store restore), confirming exit 0 for web/admin.
4. **Explicit release authorization** from the user for any commit/push/deploy (out of scope for this task per §8).

Once (1)–(3) are satisfied, the gate moves to **`PASS WITH CONDITIONS — RELEASE AUTHORIZATION PENDING`** (or **`READY FOR AUTHORIZED RELEASE CLOSURE`** if the pilot target is accepted and the CI build is green with no residual conditions). It was **not** declared `CLOSED/PASS` here solely because tests pass — the business decisions and release authorization remain outstanding.

---

## FINAL GATE (verbatim)

```
BLOCKED — BUSINESS APPROVALS PENDING
```
