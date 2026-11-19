# SCS Platform — Audit-Driven Implementation Progress Tracker

**Living tracker. Update this file as part of every remediation task and phase transition.**  
**Created:** 18 November 2026  
**Plan:** [Audit-Driven Remediation & Testability Implementation Plan](./IMPLEMENTATION-PLAN.md)  
**Baseline audit:** [Comprehensive B2B Platform Readiness Audit](../audits/b2b-platform-readiness/SCS-B2B-PLATFORM-COMPREHENSIVE-READINESS-AUDIT.html)  
**Repository:** `nabeel2323/scs-platform`  
**Baseline branch/commit:** `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36`  
**Tracker status:** IN PROGRESS — G-001 tenant-scope implementation and unit/HTTP/PostgreSQL regression coverage pass CI #983; independent second-party security review remains pending. G-002 inventory/design and read-only identity diagnostic are documented, but live API/migration identities, per-table operation classification and managed-default-ACL dependency review remain open. OTP exception-log hardening is implemented in source with focused regression tests; CI for this change is pending and bounded staging logs contained readiness messages only, not an observed OTP delivery. No finding is closed yet.

---

## 1. Executive progress

| Metric | Current |
|---|---:|
| Planned phases | 7 (0–6) |
| Phases completed | 0 |
| Phases in progress | 1 |
| Original audit findings | 22 |
| P0 open | 1 |
| P1 open | 7 |
| P2 open | 12 |
| P3 open | 2 |
| Findings closed under this plan | 0 |
| Findings partially remediated under this plan | 1 |
| Final full test campaign | NOT STARTED |

**Important:** These counts represent the starting audit register, not a claim that every finding has been revalidated on the current HEAD. Phase 0 must reconcile the current branch and update counts if later commits already fixed or changed a finding.

### Overall status

<badge>IN PROGRESS</badge> Phase 1 has started. G-001 source remediation, controller unit tests, HTTP authorization matrix and PostgreSQL membership tests passed CI run #966; the latest full CI #977 also passed on HEAD `128b7e15`. G-001 is READY FOR INDEPENDENT REVIEW; it remains open until a second-party security review accepts the privileged-role bypass policy. A focused unit suite now pins all four existing bypass roles (`SUPER_ADMIN`, `ADMIN`, `MODERATOR`, `SYSTEM`) and representative non-privileged roles; the suite is awaiting CI. G-002 has an evidence-backed design and CI-executed read-only identity diagnostic, but actual Render runtime and migration identities still need to be checked.

---

## 2. Phase dashboard

| Order | Phase | Status | Entry/exit condition | Progress |
|---:|---|---|---|---:|
| 0 | Baseline reconciliation & testability foundation | NOT STARTED | Current baseline, test matrix, staging safety and evidence discrepancies reconciled | 0% |
| 1 | Tenant security & database access safety | IN PROGRESS | P0 tenant boundary and DB role/grant/RLS design verified; limited staging testing may be authorized | 20% |
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
| G-001 | P0 | Merchant offer list/analytics lack tenant authorization | 1 | READY FOR INDEPENDENT REVIEW | All three read routes enforce org + active store membership before service access. Controller unit (10), HTTP matrix (19), and real-PostgreSQL lifecycle coverage passed CI #966 on `0bb652d`; second-party review of platform-role bypass remains. |
| G-002 | P1 | RLS disabled / excessive anon-auth grants; access model needs reconciliation | 1 | OPEN | 114 public relations reconciled to source schema/partitions/support tables. Effective ACLs, grantor and default-ACL provenance documented; runtime identity, per-table operation matrix and managed grant dependency review remain open. |
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

**Status:** IN PROGRESS

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P1-01 | Reproduce merchant offer list/analytics scope defect | G-001 | SOURCE VERIFIED | Confirmed in `catalog.offer.controller.ts`: all three routes accepted caller-supplied `storeId` and queried service without tenant checks. |

| P1-02 | Enforce authenticated store/org membership for offer list | G-001 | IMPLEMENTED — CI PASS | `assertStoreInOrg` and `assertStoreMember` run before service access; CI #966 passed. |
| P1-03 | Enforce scope for analytics and trend routes | G-001 | IMPLEMENTED — CI PASS | Both analytics and trend routes require the same fail-closed checks; CI #966 passed. |
| P1-04 | Audit adjacent storeId/orgId object-read endpoints | G-001 + new findings | TODO | |
| P1-05 | Add owner/staff/buyer/foreign merchant/admin authorization matrix tests | G-001 | IMPLEMENTED — CI PASS; REVIEW PENDING | Controller unit tests (10) and HTTP matrix (19) passed in CI #966. Matrix covers owner, active store staff, foreign merchant, same-org non-member, buyer and platform staff across all three routes. Real-PostgreSQL lifecycle tests cover active staff, missing membership and foreign-store membership denial. Second-party review remains. |
| P1-06 | Identify API runtime DB role and all database access paths | G-002 | PARTIAL — STRONG POSTGRES ROLE EVIDENCE; DIRECT RUNTIME IDENTITY PENDING | `DatabaseService` uses `DATABASE_URL`; production-like API startup skips auto-migration. Render/Supavisor logs correlate an API `SIGTERM` with a `postgres` session close 205 ms later. `pg_stat_statements` attributes 467 distinct statements and 229,829 calls since 31 October to `postgres`, including outbox, worker lease, order completion, shipment recovery and financial operations. This strongly suggests application/worker workload uses `postgres`, but role-level statistics do not identify the client process. The sanitized `db:identity` diagnostic is included in the staging release before migration/seed. CI #983 passed on HEAD `f44415b`; direct API runtime-shell execution and migration-identity execution against live staging remain outstanding. |
| P1-07 | Reconcile table count and classify all tables by access boundary | G-002 | RELATION COUNT RECONCILED; ACCESS CLASSIFICATION IN PROGRESS | Source enumeration found 99 Drizzle-declared relations; all 99 matched live public relations. The other 15 are 13 `analytics_events` partitions, `_migration_log`, and `backfill_errors`. This resolves the 114 relation count. Per-table access boundary/operation classification remains. See inventory §9.5. |
| P1-08 | Audit grants, default privileges, sequences, functions and schemas | G-002 | GRANTOR/DEFAULT-ACL PROVENANCE MAPPED; DEPENDENCY REVIEW OPEN | Read-only `aclexplode` inspection identifies `postgres` as grantor for all four structural privileges on all 114 public relations; no grant options or PUBLIC grants were observed. `postgres` public-table defaults repeat those four privileges; `supabase_admin` public-table defaults include full CRUD plus structural privileges and sequence/function defaults, although no current public objects are owned by `supabase_admin`. Other managed-schema defaults remain out of scope. Historical/business dependency and safe remediation remain unverified; no ACL changes made. See inventory §9.8. |
| P1-09 | Design least-privilege and table-specific RLS policies | G-002 | DESIGN BASELINE DOCUMENTED — IMPLEMENTATION BLOCKED | See `G-002-LEAST-PRIVILEGE-REMEDIATION-DESIGN.md`. Proposed API runtime login/group role is separated from migration identity; transaction-bound request context is a prerequisite for RLS. No blanket RLS or managed-role revocation. Complete object/query/worker matrix and prove identities before DDL. |
| P1-10 | Implement reviewed privilege/RLS migration if required | G-002 | TODO | |
| P1-11 | Add DB/client access negative tests and API tenant tests | G-002 | TODO | |
| P1-12 | Harden normalize_arabic search_path safely | G-020 | TODO | |
| P1-13 | Verify OTP redaction across success/failure/exception paths | Security safeguard | IMPLEMENTED — CI PENDING; STAGING DELIVERY SAMPLE NOT VERIFIED | Removed raw provider exception messages from the shared delivery service, Twilio network/exception paths and WhatsApp network/exception paths. Added three focused regression tests that inject exception text containing an OTP and full phone number and assert neither appears in Nest logger output. Existing identity/provider redaction tests cover normal success and delivery failure paths. Render log sample (18–19 Nov) contained OTP readiness logs but no OTP send event, so it is not an end-to-end delivery-log proof. |

**Exit gate:** P0 tenant isolation PASS; database access model and migration verified; focused security tests pass; limited staging business tests may then be considered with authorization.

**Phase evidence:**  
- Implementation branch: `security/p0-merchant-offer-tenant-scope`  
- Implementation commit(s): `1ad2e758661aa8d8baa6c12558eb9def11d9152a`, `65ffec69c80d6f7471395d328f6db30ea77c39dd`, `09f617d2a0cba0fbcc1e0369e8d6ed49ee09b85e`, `0f45e7f2b8eb8ca59b3bd73108e72a120f32a7d5`, `9dd0b00d6a975541507d8b666373157e7207a1eb`, `0bb652d77eb30fbc3e0de5dbd68d4fc54d45f68f`, `e6d3638331eb8214997ad54750c50b03c2b68e6e`, `cec4971c77e6ea00f6750471e60220cf82da8a31`, `963938973c6a2c8e51e564a74f38605c12ea7c86`, `8101774d3e5c117c2f78267523c20044884b85ba`, `29343b55b1f59582b174e78190632a45f1e93e51`, `c895c6eb91788516ca5a1d16705a8162a9d6161e`, `8eaeea457d3d2ff7fc7cdfde590984b2ef37e69d`, `c10713999033846f081f0e9dc01cb51b4f478d25`, `128b7e15e604827367ba4e90364ef2689722e09a`, `e906acd8055f14c14bedf9f833c88e0992476007`  
- Focused unit test: `apps/api/src/__tests__/unit/catalog-offer-tenant-authorization.spec.ts` (10 tests passed in CI #966; API unit/coverage job: 213 files passed, 6 skipped; 4,359 tests passed, 110 skipped)  
- HTTP regression test: `apps/api/src/__tests__/integration/catalog-offer-tenant-authorization.http.spec.ts` (19 tests passed in CI #966)  
- Migration ID(s): none for G-001  
- Database inventory: `docs/remediation/G-002-SUPABASE-DATABASE-ACCESS-INVENTORY.md` (read-only; no DB changes)
- G-002 least-privilege design: `docs/remediation/G-002-LEAST-PRIVILEGE-REMEDIATION-DESIGN.md` (design only; no DDL)
- Read-only role diagnostic: `apps/api/scripts/inspect-db-identity.mjs`, command `pnpm --filter @scs/api db:identity` (added; not yet executed against Render/Supabase)  
- Real PostgreSQL membership tests: `apps/api/src/__tests__/integration/catalog-lifecycle.e2e.spec.ts` (included in passing `pnpm --filter @scs/api test:integration` job in CI #966)
- Independent second-party review: pending  
- CI evidence: workflow run `44610599038` (#952), all executed jobs SUCCESS. Latest CI #983: [run 44635280279](https://github.com/nabeel2323/scs-platform/actions/runs/44635280279), HEAD `f44415b15efd647a1650b6e7fe1681cb2743656b`, all required jobs SUCCESS (API unit/coverage, PostgreSQL integration, migration full apply, lint/typecheck/format, boundary lint, web/admin, Flutter, build, contract/codegen and container smoke); k6 and staging release skipped.
- Phase decision: IN PROGRESS — G-001 is READY FOR INDEPENDENT REVIEW; do not mark CLOSED until second-party review accepts privileged-role bypass semantics and the route matrix.

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
| 2026-11-18 | Plan initialization | `develop` / `9f5bc397` audit baseline | Created audit-driven sequence and tracker; no remediation code changed. | Source/report review only. | PLANNED | Reconcile baseline and test harness. |
| 2026-11-19 | G-001 merchant offer tenant authorization | `security/p0-merchant-offer-tenant-scope` / `0bb652d` / CI #966 | Enforced organization and active store membership on offer list, analytics and trend routes; added controller, HTTP and PostgreSQL membership coverage. | CI #966 passed all required jobs; API unit/coverage, HTTP matrix (19), PostgreSQL integration, migration apply, lint/typecheck, web/admin and Flutter passed. | READY FOR INDEPENDENT REVIEW — second-party review of privileged-role bypass remains outstanding. | Obtain independent security review; do not close before acceptance. |
| 2026-11-20 | G-002 live database evidence and identity preflight | `security/p0-merchant-offer-tenant-scope` / `8cdf148`–`e92ddfc` / CI #982 | Reconciled 114 public relations, role-attributed workload evidence, ACL grantor/default-privilege provenance; added sanitized DB identity diagnostic to release preflight. | Read-only Supabase catalog/Advisor/pg_stat_statements and Render metadata/log inspection; CI #982 passed. | PARTIAL — exact API/migration identities and per-table access matrix remain outstanding; no live DDL/ACL/RLS changes. | Run API identity diagnostic in Render Shell; validate managed defaults and complete query/worker access matrix. |
| 2026-11-20 | OTP exception-log redaction | `security/p0-merchant-offer-tenant-scope` / baseline `f44415b` / CI pending | Suppressed raw exception messages in OTP orchestration, Twilio and WhatsApp providers; added injected-secret exception regression tests. | Focused tests added to API unit suite; CI not yet run. Existing success/failure redaction tests remain in place. | IMPLEMENTED — VERIFICATION PENDING; bounded Render log sample had no OTP-send event and is not end-to-end delivery proof. | Verify CI; then inspect bounded post-deploy logs only after separately authorized staging release. |

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

**Continue Phase 1:** verify the new OTP exception-redaction tests in CI; obtain the read-only API identity output from Render Shell using `pnpm --filter @scs/api db:identity` (never print or copy `DATABASE_URL`); collect migration identity evidence only on a separately authorized release; complete the per-table/query/worker access matrix; validate managed `supabase_admin` default-ACL dependencies. Do not apply grants, revokes or RLS until identities, query requirements, managed dependencies and rollback procedures are reviewed.

In parallel, obtain a second-party review of G-001's preserved privileged-role bypass policy. Do not close G-001 until that review is recorded.

**Current safety state:** no Supabase DDL, grants, revokes, role memberships, RLS policies, Render environment values, staging deployments or production changes have been made. Render log inspection was read-only. PR #139 remains unmerged because the `develop` workflow invokes staging release after a successful develop push and the staging environment's required-reviewer gate could not be verified through the connected GitHub API.
