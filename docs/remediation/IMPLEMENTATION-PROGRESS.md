# SCS Platform — Audit-Driven Implementation Progress Tracker

**Living tracker. Update this file as part of every remediation task and phase transition.**  
**Created:** 18 November 2026  
**Plan:** [Audit-Driven Remediation & Testability Implementation Plan](./IMPLEMENTATION-PLAN.md)  
**Baseline audit:** [Comprehensive B2B Platform Readiness Audit](../audits/b2b-platform-readiness/SCS-B2B-PLATFORM-COMPREHENSIVE-READINESS-AUDIT.html)  
**Repository:** `nabeel2323/scs-platform`  
**Baseline branch/commit:** `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36`  
**Tracker status:** INITIALIZED — no remediation phase has been started or closed under this tracker.

---

## 1. Executive progress

| Metric | Current |
|---|---:|
| Planned phases | 7 (0–6) |
| Phases completed | 0 |
| Phases in progress | 0 |
| Original audit findings | 22 |
| P0 open | 1 |
| P1 open | 7 |
| P2 open | 12 |
| P3 open | 2 |
| Findings closed under this plan | 0 |
| Findings partially remediated under this plan | 0 |
| Final full test campaign | NOT STARTED |

**Important:** These counts represent the starting audit register, not a claim that every finding has been revalidated on the current HEAD. Phase 0 must reconcile the current branch and update counts if later commits already fixed or changed a finding.

### Overall status

<badge>PLANNED</badge> Implementation has not started under this remediation tracker. The existing September roadmap contains historical phase-completion statements; those are not counted as closure evidence for the November audit findings.

---

## 2. Phase dashboard

| Order | Phase | Status | Entry/exit condition | Progress |
|---:|---|---|---|---:|
| 0 | Baseline reconciliation & testability foundation | NOT STARTED | Current baseline, test matrix, staging safety and evidence discrepancies reconciled | 0% |
| 1 | Tenant security & database access safety | NOT STARTED | P0 tenant boundary and DB role/grant/RLS design verified; limited staging testing may be authorized | 0% |
| 2 | Commercial correctness & checkout contract | NOT STARTED | Seller attribution, quantity, currency, payment and tax/fulfillment contracts consistent | 0% |
| 3 | Event, worker & fulfillment reliability | NOT STARTED | Outbox ownership, carrier processing, durable claims and P13 alert/lease plan verified | 0% |
| 4 | Client workflow parity & truthful notifications | NOT STARTED | Agreed buyer/merchant client workflows and notification semantics coherent | 0% |
| 5 | Operational hardening, CI, data hygiene & documentation | NOT STARTED | CI, repository, docs, deployment and recovery controls ready | 0% |
| 6 | Consolidated full verification & release decision | NOT STARTED | One final full test campaign and evidence-based go/no-go decision | 0% |

Status vocabulary: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR VERIFICATION · COMPLETE · COMPLETE WITH APPROVED DEFERRALS.

---

## 3. Finding register

| ID | Priority | Finding | Planned phase | Status | Evidence / notes |
|---|---:|---|---:|---|---|
| G-001 | P0 | Merchant offer list/analytics lack tenant authorization | 1 | OPEN | Must close before authenticated business testing |
| G-002 | P1 | RLS disabled / excessive anon-auth grants; access model needs reconciliation | 1 | OPEN | Table count differs between snapshots (114 vs 111); inventory first |
| G-003 | P1 | Generic outbox dispatcher competes with carrier worker | 3 | OPEN | Source-level consumer ownership conflict |
| G-004 | P1 | Search result seller/offer differs from cart attribution | 2 | OPEN | Seller and offer identity must be consistent end-to-end |
| G-005 | P1 | Mixed-currency checkout total incorrectly aggregates/formats | 2 | OPEN | No cross-currency sum without disclosed FX |
| G-006 | P1 | Offer orderIncrement not enforced | 2 | OPEN | Confirm exact increment formula with business rule |
| G-007 | P1 | Mobile checkout omits per-store shipping/payment; VAT disclosure conflicts | 2, 4 | OPEN | Shared API contract first; client parity afterward |
| G-008 | P1 | API accepts DIGITAL without a registered digital provider | 2 | OPEN | Reject unsupported method unless gateway separately approved |
| G-009 | P2 | SMS/FCM/WhatsApp stubs report SENT | 4 | OPEN | Implement provider or truthful NOT_CONFIGURED state |
| G-010 | P2 | Carrier label worker handler is no-op | 3 | OPEN | Use provider sandbox; no live shipment without approval |
| G-011 | P2 | AutoCompleteWorker claim is not durable | 3 | OPEN | Multi-instance and buyer-confirmation race |
| G-012 | P2 | Manual payments only; no automatic gateway/payout | 5 (decision) | OPEN | Product scope decision; do not silently expand scope |
| G-013 | P2 | 55 foreign-key constraints lack covering indexes | 5 | OPEN | Workload/EXPLAIN-driven, not blanket indexing |
| G-014 | P2 | develop branch unprotected | 5 | OPEN | Repository ruleset required |
| G-015 | P2 | Formatting/boundary lint non-blocking or miswired | 5 | OPEN | Correct command, then make blocking |
| G-016 | P2 | Large tracked .m73b6-scratch tree | 5 | OPEN | Classify and scan before removal |
| G-017 | P2 | JWT-shaped test artifact committed twice | 5 | OPEN | Verify provenance; remove/rotate if needed |
| G-018 | P2 | Mixed-age architecture/readiness documentation | 5 | OPEN | This plan/tracker become current remediation references |
| G-019 | P2 | Mobile cannot remove applied promotion | 4 | OPEN | API authoritative cart recalculation |
| G-020 | P2 | normalize_arabic has mutable search_path | 1 | OPEN | Review function dependencies and harden safely |
| G-021 | P3 | Formal RFQ/quotation/PO workflow absent | 5 (decision) | OPEN | Decide whether in launch scope; separate project if required |
| G-022 | P3 | pg_trgm extension installed in public schema | 5 | OPEN | Review dependencies before relocation |

Status definitions:
- **OPEN:** finding not yet implemented/closed.
- **IN PROGRESS:** implementation task actively underway.
- **PARTIAL:** some but not all acceptance criteria met.
- **READY FOR VERIFICATION:** implementation complete; evidence still needs independent review.
- **CLOSED:** all Definition of Done conditions and acceptance criteria satisfied with evidence.
- **DEFERRED:** explicitly excluded from current release by documented decision, risk and owner; not equivalent to fixed.

---

## 4. Phase 0 — Baseline reconciliation & testability foundation

**Status:** NOT STARTED  
**Phase owner:** Remediation lead / repository maintainer  
**Entry commit:** `develop` — to be refreshed at phase start.

| Task | Description | Status | Evidence / result |
|---|---|---|---|
| P0-01 | Record current branch HEAD and compare with audit baseline | TODO | |
| P0-02 | Revalidate all 22 findings against current source | TODO | |
| P0-03 | Identify fixes already present after audit commit | TODO | |
| P0-04 | Inventory API/web/admin/mobile/DB test commands and prerequisites | TODO | |
| P0-05 | Define synthetic buyer/merchant/admin test identities and fixtures | TODO | |
| P0-06 | Define final full test campaign command manifest | TODO | |
| P0-07 | Document Render manual-deploy and disabled auto-deploy behavior | TODO | |
| P0-08 | Review startup migration/seed and safe deploy/forward-fix procedure | TODO | |
| P0-09 | Reconcile database table counts, grants, RLS, roles and migration ledger | TODO | |
| P0-10 | Trace OTP logging and exception paths; preserve redaction tests | TODO | |
| P0-11 | Document worker registration/flags/leases and protected-job safety | TODO | |
| P0-12 | Establish backup/restore evidence availability and staging runbook | TODO | |

**Exit gate:** test matrix and runbooks accepted; baseline discrepancies resolved or explicitly blocked; no unsafe staging/production writes or worker activation performed.

**Phase evidence:**  
- Baseline SHA: TBD  
- Test matrix: TBD  
- Staging runbook: TBD  
- DB access inventory: TBD  
- OTP logging review: TBD  
- Phase decision: NOT STARTED

---

## 5. Phase 1 — Tenant security & database access safety

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P1-01 | Reproduce merchant offer list/analytics scope defect | G-001 | TODO | |
| P1-02 | Enforce authenticated store/org membership for offer list | G-001 | TODO | |
| P1-03 | Enforce scope for analytics and trend routes | G-001 | TODO | |
| P1-04 | Audit adjacent storeId/orgId object-read endpoints | G-001 + new findings | TODO | |
| P1-05 | Add owner/staff/buyer/foreign merchant/admin authorization matrix tests | G-001 | TODO | |
| P1-06 | Identify API runtime DB role and all database access paths | G-002 | TODO | |
| P1-07 | Reconcile table count and classify all tables by access boundary | G-002 | TODO | |
| P1-08 | Audit grants, default privileges, sequences, functions and schemas | G-002 | TODO | |
| P1-09 | Design least-privilege and table-specific RLS policies | G-002 | TODO | |
| P1-10 | Implement reviewed privilege/RLS migration if required | G-002 | TODO | |
| P1-11 | Add DB/client access negative tests and API tenant tests | G-002 | TODO | |
| P1-12 | Harden normalize_arabic search_path safely | G-020 | TODO | |
| P1-13 | Verify OTP redaction across success/failure/exception paths | Security safeguard | TODO | |

**Exit gate:** P0 tenant isolation PASS; database access model and migration verified; focused security tests pass; limited staging business tests may then be considered with authorization.

**Phase evidence:**  
- Implementation PR/commit: TBD  
- Focused test commands/results: TBD  
- Migration ID(s): TBD  
- Independent review: TBD  
- Phase decision: NOT STARTED

---

## 6. Phase 2 — Commercial correctness & checkout contract

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P2-01 | Define canonical offer identity in search contract | G-004 | TODO | |
| P2-02 | Align displayed seller/offer with add-to-cart payload | G-004 | TODO | |
| P2-03 | Test multiple sellers, stale/inactive offers and price snapshots | G-004 | TODO | |
| P2-04 | Agree and document MOQ/orderIncrement formula | G-006 | TODO | |
| P2-05 | Enforce quantity rule on add/update/checkout server-side | G-006 | TODO | |
| P2-06 | Add invalid quantity, stale terms and race regression tests | G-006 | TODO | |
| P2-07 | Replace mixed-currency grand total with per-currency subtotals | G-005 | TODO | |
| P2-08 | Validate currency exponent/formatting and same-currency totals | G-005 | TODO | |
| P2-09 | Reject DIGITAL unless a real provider is registered | G-008 | TODO | |
| P2-10 | Align API contracts and web/admin payment choices | G-008 | TODO | |
| P2-11 | Define mobile per-store shipping/payment and tax contract | G-007 | TODO | |
| P2-12 | Update mobile request/review UI and generated clients | G-007 | TODO | |
| P2-13 | Add targeted API/web/mobile contract tests | G-004–G-008 | TODO | |

**Exit gate:** seller attribution, quantity rules, currency totals, supported payment methods and tax/fulfillment semantics are consistent across API and clients.

---

## 7. Phase 3 — Event, worker & fulfillment reliability

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P3-01 | Map event types to exactly one authoritative consumer | G-003 | TODO | |
| P3-02 | Prevent generic dispatcher from consuming carrier events | G-003 | TODO | |
| P3-03 | Implement event retry, idempotency and terminal failure behavior | G-003 | TODO | |
| P3-04 | Connect carrier label event to provider label generation | G-010 | TODO | |
| P3-05 | Persist label metadata and shipment state safely | G-010 | TODO | |
| P3-06 | Test provider timeout, duplicate event and retry behavior | G-003/G-010 | TODO | |
| P3-07 | Implement durable AutoCompleteWorker lease/claim | G-011 | TODO | |
| P3-08 | Test multi-instance claim and buyer confirmation race | G-011 | TODO | |
| P3-09 | Document P13 worker registration and intended holder topology | Runtime | TODO | |
| P3-10 | Define safe P13 staging/prod activation configuration | Runtime | TODO | |
| P3-11 | Configure and test alert sink and worker anomaly alerts | Runtime | TODO | |
| P3-12 | Verify return expiration and protected financial job guards | Runtime | TODO | |

**Exit gate:** no event ownership ambiguity; durable claims; carrier/worker retry tests pass; P13 activation and alerting are intentionally configured and evidenced.

---

## 8. Phase 4 — Client workflow parity & truthful notifications

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P4-01 | Complete mobile per-store shipping/payment and tax review | G-007 | TODO | |
| P4-02 | Complete mobile order detail/fulfillment parity | G-007 | TODO | |
| P4-03 | Add mobile remove-promotion operation/UI | G-019 | TODO | |
| P4-04 | Define truthful notification delivery states | G-009 | TODO | |
| P4-05 | Implement provider adapters or NOT_CONFIGURED behavior | G-009 | TODO | |
| P4-06 | Add provider sandbox and retry/status tests | G-009 | TODO | |
| P4-07 | Verify in-scope admin list/detail/edit/archive workflows | Workflow parity | TODO | |
| P4-08 | Verify merchant workflow permission and error states | Workflow parity | TODO | |
| P4-09 | Update relevant user-facing help and screen documentation | G-018 | TODO | |

**Exit gate:** agreed user workflows are coherent and truthful across API/web/mobile; no external channel reports SENT without an actual send.

---

## 9. Phase 5 — Operational hardening, CI, data hygiene & documentation

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P5-01 | Add develop/release branch protection and rulesets | G-014 | TODO | |
| P5-02 | Fix boundary-lint workflow invocation | G-015 | TODO | |
| P5-03 | Make formatting and boundary checks blocking | G-015 | TODO | |
| P5-04 | Classify and scan .m73b6-scratch contents | G-016 | TODO | |
| P5-05 | Remove unnecessary scratch artifacts and add ignore rules | G-016 | TODO | |
| P5-06 | Verify/remove JWT-shaped artifact and duplicate; rotate if needed | G-017 | TODO | |
| P5-07 | Reconcile legacy docs and mark old statuses historical | G-018 | TODO | |
| P5-08 | Update technical/user/admin/deployment/troubleshooting docs | G-018 | TODO | |
| P5-09 | Prioritize FK indexes using workload/EXPLAIN evidence | G-013 | TODO | |
| P5-10 | Review pg_trgm extension schema placement safely | G-022 | TODO | |
| P5-11 | Record manual vs gateway payment launch scope decision | G-012 | TODO | |
| P5-12 | Record RFQ/quotation/PO scope decision | G-021 | TODO | |
| P5-13 | Complete isolated backup/restore drill | Operations | TODO | |
| P5-14 | Verify deploy/migration/worker/alert runbooks | Operations | TODO | |

**Exit gate:** CI checks block bad merges; repository risks are resolved; docs are current; payment/procurement scope decisions recorded; backup/restore and deployment controls evidenced.

---

## 10. Phase 6 — Consolidated full verification & release decision

**Status:** NOT STARTED — deliberately deferred until Phases 0–5.

| Test group | Scope | Status | Evidence / result |
|---|---|---|---|
| Full builds and contracts | API/web/admin/mobile/packages; generated TS/Dart contracts | NOT RUN | |
| Full unit suites | All packages/apps | NOT RUN | |
| Full integration suites | PostgreSQL/Redis/Testcontainers | NOT RUN | |
| Migration validation | Empty DB + representative upgrade path | NOT RUN | |
| Tenant security | Buyer, merchant A/B, staff, admin and unauthorized access matrix | NOT RUN | |
| Buyer browser journey | Search → offer → cart → checkout → order → tracking | NOT RUN | |
| Merchant browser journey | Onboard → verify → catalog/offer → inventory → order processing | NOT RUN | |
| Admin journey | Verification, moderation, order/payment/refund/dispute/operations | NOT RUN | |
| Mobile integration | Auth, cart, checkout, orders, promotions, fulfillment | NOT RUN | |
| Worker/event tests | Outbox, carrier, labels, retries, leases, P13 | NOT RUN | |
| Concurrency/idempotency | Multi-worker races and duplicate requests/events | NOT RUN | |
| External provider sandbox | OTP, notifications, carrier and payment if in scope | NOT RUN | |
| Performance/load | k6 critical paths and queue lag | NOT RUN | |
| Backup/restore | Isolated restore and recovery evidence | NOT RUN | |
| Business UAT | Agreed buyer/merchant/admin scenarios | NOT RUN | |

**Final decision:** NOT ASSESSED  
**Release candidate SHA:** TBD  
**Full campaign date:** TBD  
**Report:** TBD

---

## 11. Implementation task log

Append a new entry for each implementation task. Keep entries concise but evidence-rich.

| Date (UTC) | Phase / task | Branch + commit | Change summary | Focused checks | Outcome | Next action |
|---|---|---|---|---|---|---|
| 2026-11-18 | Plan initialization | develop / 9f5bc397… audit baseline | Created audit-driven sequence and tracker; no remediation code changed | Source/report review only | PLANNED | Start Phase 0 baseline reconciliation |

### Required task log entry format

For substantial tasks, add a short subsection below:

- **Task ID:**
- **Finding(s):**
- **Baseline SHA:**
- **Implementation commit / PR:**
- **Files and migrations changed:**
- **Focused tests run (exact commands):**
- **Results:**
- **Security/data/operational review:**
- **Documentation updated:**
- **Remaining risks / blockers:**
- **Status:** IN PROGRESS / PARTIAL / READY FOR VERIFICATION / CLOSED

---

## 12. Decision and blocker log

| ID | Decision / blocker | Required input or owner | Status | Resolution evidence |
|---|---|---|---|---|
| D-001 | Reconcile DB inventory count (114 vs 111) and effective API DB role | Engineering + DB owner | OPEN | |
| D-002 | Confirm MOQ/orderIncrement business formula | Product/business owner | OPEN | |
| D-003 | Confirm first-release payment scope: manual methods vs digital gateway | Product/business + finance | OPEN | |
| D-004 | Confirm RFQ/quotation/PO required for first release or defer | Product/business owner | OPEN | |
| D-005 | Confirm intended P13 worker topology and alert destination | Operations owner | OPEN | |
| D-006 | Confirm which notification channels are in the first release | Product/operations | OPEN | |
| D-007 | Confirm staging provider sandbox availability and permitted side effects | Operations owner | OPEN | |

Do not block unrelated engineering work on a decision that can be safely isolated. If a decision affects data integrity, money movement, external side effects or release scope, record it and pause that specific implementation.

---

## 13. Change-control and automatic update rules

- This tracker and the companion plan are maintained by the implementation assistant as part of each remediation task. The user does not need to request routine tracker maintenance.
- At the start of a new implementation session, fetch the latest versions from the repository; do not rely on old conversation state or Library snapshots.
- Update task status before work, after focused checks and at phase completion.
- Record exact commit SHA and exact commands/results. Never infer test success from source inspection or CI configuration.
- Keep the original audit finding IDs stable. Add new IDs for newly discovered defects and link them to the parent finding.
- A fix is not CLOSED until acceptance criteria and Definition of Done are evidenced.
- Update the plan only when scope, sequencing, dependency or acceptance criteria change; update the tracker for routine progress.
- Keep full end-to-end test campaign deferred until all planned remediation is integrated. Focused automated regression checks remain mandatory during implementation.
- Do not trigger Render deploys, modify environment variables, run production migrations, enable protected workers, create real shipments, capture payments or send customer notifications without the required explicit authorization.
- Repository files are canonical. Any separate Library copy is a snapshot unless a synchronization mechanism is explicitly established.

---

## 14. Next action

**Start Phase 0, task P0-01:** retrieve current `develop` HEAD and compare it with audit baseline `9f5bc397...`. Then revalidate the 22 findings before implementation. Do not start Phase 1 based solely on the historical audit if the branch has moved.

**Current state:** no remediation code has been changed by initializing these documents.


---

## 15. G-001 implementation progress — 20 November 2026

**Status: PARTIAL / IN PROGRESS.** This entry supersedes the earlier initialization statement that no remediation code had changed. It does not close G-001 or any release gate.

### Baseline and implementation

- Baseline: `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Implementation branch: `security/g001-merchant-offer-authorization`.
- Pull request: [#144](https://github.com/nabeel2323/scs-platform/pull/144) (draft; not merged).
- Latest implementation commit at this entry: `4385624fee39d9fe2bda3931d76b52b3cc55b249`.
- Merchant offer list, store analytics and trend endpoints now require both active-organization ownership and ACTIVE store membership before querying merchant data.
- Propose, pricing-update and withdraw service operations now apply the same organization + store-membership checks when called with authenticated caller context.
- Buyer-facing canonical-product offer discovery routes remain distinct from merchant dashboard routes.
- Added controller tests for active membership, same-org non-member denial, cross-org denial, analytics trend authorization and missing storeId; added service tests for authorized, non-member and cross-org mutation cases.
- No schema or migration change.

### Files changed

- `apps/api/src/modules/catalog/catalog.offer.controller.ts`
- `apps/api/src/modules/catalog/catalog.offer.service.ts`
- `apps/api/src/__tests__/unit/catalog/catalog-offer-controller.spec.ts`
- `apps/api/src/__tests__/unit/catalog/catalog-offer.spec.ts`

### Verification

- GitHub Actions CI run `44660050627` was observed in progress after the initial PR push; its checks must be refreshed against the latest head before claiming results.
- No local test execution is claimed.
- G-001 remains **PARTIAL** until the focused unit tests, API lint/typecheck, broader merchant/tenant authorization matrix, and review/merge controls pass.
- No Render deployment, Supabase mutation, staging transaction, customer notification, provider send, payment, shipment, migration, seed or worker activation occurred.

### Next actions

1. Refresh PR #144 CI for the latest head and fix any failures.
2. Review adjacent offer/object read routes and the complete G-001 acceptance criteria for bypass paths.
3. Add any missing role-matrix or cross-tenant negative tests, then request normal review.
4. Keep G-001 PARTIAL until all acceptance criteria are evidenced on the integrated baseline.


### 2026-11-20 — G-001 CI failure analysis and fixture correction

- **Task ID:** P1-01 through P1-05 (G-001)
- **Finding(s):** G-001 — merchant offer tenant authorization
- **Baseline SHA:** `f74eb588cc58fc99b105e749d39dbfbacb4f9775`
- **Implementation PR:** [#144](https://github.com/nabeel2323/scs-platform/pull/144)
- **Failure evidence:** GitHub Actions run [44660124704](https://github.com/nabeel2323/scs-platform/actions/runs/44660124704) exposed a fixture defect in `catalog-lifecycle.e2e.spec.ts`: the Drizzle test schema omitted `storeMembers`, and the fixture created organization memberships but no explicit store memberships. The new authorization correctly failed closed when `assertStoreMember` attempted the missing relation.
- **Correction committed:** Added `storeMembers` to the integration-test Drizzle schema and seeded ACTIVE OWNER memberships for Merchant A and Merchant B in their respective stores. No production schema or migration changed.
- **Commit:** `073800cbb845ae1263797102a9516b7cd3730638`
- **CI at failure snapshot:** API lint/boundary checks and web/admin tests passed; API unit/coverage and integration jobs failed on the same fixture defect. PR #143 documentation branch CI passed its executable jobs.
- **Next:** Re-run PR #144 CI, inspect any remaining failures, then continue endpoint authorization review. G-001 remains PARTIAL until full authorization matrix and review are complete.
- **Operational boundary:** No Render or Supabase changes, deployment, migration, seed, worker activation, or staging business transaction.


### 2026-11-20 — G-001 proposal audit-actor hardening

- **Finding:** G-001 (adjacent merchant mutation audit integrity)
- **Review observation:** The proposal endpoint accepted a client-provided `proposedBy` value and forwarded it as the proposal/audit actor. Although tenant authorization was applied in the service, a caller could spoof the recorded actor identifier.
- **Correction:** The controller now always supplies the authenticated JWT principal (`user.sub`) to `proposeOffer`; the request-body field is ignored for actor attribution. Added a regression test proving a forged `proposedBy` value cannot replace the authenticated principal.
- **Commits:** `9034a79e0672dfdd5ae3ff09adbecbd23a55e0a6`, `3aa3e72b60863b45344b2c53b86d508c879905f9`
- **Status:** PARTIAL — pending CI for the updated head and broader review of offer-detail visibility and all merchant mutation paths.


### 2026-11-20 — G-001 CI green and audit attribution follow-up

- **Finding:** G-001 — merchant offer tenant authorization and audit integrity
- **PR:** [#144](https://github.com/nabeel2323/scs-platform/pull/144)
- **Verified CI head:** `e9cd0bdebfc4990d707b3fca98a0a4b360eec0e6`
- **CI run:** [44661813971](https://github.com/nabeel2323/scs-platform/actions/runs/44661813971)
- **Results:** Lint & Typecheck, Flutter analyze/test, Web & Admin App Tests, Boundary Lint (E6), Integration Tests, Unit Tests + Coverage Gates, Migration Full Apply, Container Build & Smoke Test, Contract Spec & Codegen, and Build all SUCCESS. k6 Smoke Test and Trigger Staging Release were SKIPPED. No staging release was triggered.
- **Further review:** Merchant pricing and withdrawal audit records previously attributed actions to the offer's original proposer rather than the authenticated caller. The service now uses `caller.sub` when caller context is available, retaining the legacy fallback only for non-request/internal invocations. Added a regression test for pricing audit attribution.
- **Commits:** `aab6c8faf5bfe60923a41a58a535207be5c25454`, `b44a14d9fa27a62062bfa5967ec0d5fbbb7000e7`.
- **Status:** PARTIAL. The latest audit-attribution commits require a fresh CI run. Generic `GET /offers/:id` visibility still needs a product/API contract review before any access restriction is introduced. PR #144 remains draft and unmerged.
- **Operational boundary:** Vercel preview quota is not a code gate and was not retried. No Render/Supabase mutation, deployment, migration, seed, worker activation, or staging business transaction.


### 2026-11-20 — G-001 create-offer actor attribution hardening

- **Review observation:** The create-offer controller validated store ownership and membership but forwarded the client-supplied `proposedBy` field unchanged. The service uses that field for both the persisted proposer (when starting PROPOSED) and the `offer.created` audit actor.
- **Correction:** The controller now overwrites `proposedBy` with the authenticated JWT principal after store authorization. Added a regression test using a forged actor value.
- **Files:** `apps/api/src/modules/catalog/catalog.offer.controller.ts`; `apps/api/src/__tests__/unit/catalog/catalog-offer-controller.spec.ts`.
- **Verification:** Fresh CI remains pending; no local execution is claimed.
- **Status:** G-001 PARTIAL. Generic offer-detail/read projection and admin governance actor attribution remain under review.


### 2026-11-20 — G-001 admin reviewer attribution hardening

- **Review observation:** Admin approval and rejection accepted `reviewerId` from the request body. That allowed an authorized administrator to attribute a governance action to another user.
- **Correction:** Approval and rejection now derive the reviewer ID from the authenticated JWT principal. The rejection body contains only the reason. Added controller regression tests for both paths.
- **Files:** `apps/api/src/modules/catalog/catalog.offer.controller.ts`; `apps/api/src/__tests__/unit/catalog/catalog-offer-controller.spec.ts`.
- **Commits:** `5b14497b8ff4af6d19c5dea18f6843612e357922`, `75d4549229aa688feb90e7a61de8e47eb622860b`.
- **Verification:** CI for the updated branch head is pending. No local execution is claimed.
- **Status:** G-001 PARTIAL. Generic offer-detail/read projection and governance audit attribution for suspend/reactivate remain to be reviewed.


### 2026-11-20 — G-001 admin suspend/reactivate audit attribution

- **Review observation:** Admin suspension and reactivation audit records omitted the actor ID, even though the authenticated admin was available at the controller boundary.
- **Correction:** Both controller routes now pass the authenticated principal to the service; service audit events record that principal as `actorId`. Added controller and service regression tests.
- **Files:** `apps/api/src/modules/catalog/catalog.offer.controller.ts`; `apps/api/src/modules/catalog/catalog.offer.service.ts`; corresponding catalog offer controller/service unit tests.
- **Commits:** `5902dd759d209cd1b186cd89ecbd74df78fa829f`, `5179380041bc1bba077637592d29a393b01367b4`, `94f5abf6ab57daa7977c4aa0f8fdd36a41b0fe73`, `d599c67d1b68f5957831edeb081d426255b6924b`.
- **Verification:** CI for the final implementation head is pending. No local execution is claimed.
- **Status:** G-001 PARTIAL. The generic `GET /offers/:id` response still needs a consumer/visibility contract review before changing its behavior.
