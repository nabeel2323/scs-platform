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
| Additional findings discovered during remediation | 1 |
| P0 open | 1 |
| P1 open | 8 |
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
| 0 | Baseline reconciliation & testability foundation | IN PROGRESS | Current baseline, test matrix, staging safety and evidence discrepancies reconciled | 45% |
| 1 | Tenant security & database access safety | IN PROGRESS | P0 tenant boundary, initial store ownership and DB role/grant/RLS design verified; limited staging testing may be authorized | 25% |
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
| G-001 | P0 | Merchant offer list/analytics lack tenant authorization | 1 | VERIFIED IN CI | Controller enforces authenticated org + active store membership on all three routes; controller regression suite passed in CI run #536 |
| G-002 | P1 | RLS disabled / excessive anon-auth grants; access model needs reconciliation | 1 | IN PROGRESS | Reconciled to 114 tables: no anon/auth CRUD, but TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all tables and same postgres default ACL; all 114 RLS disabled |
| G-003 | P1 | Generic outbox dispatcher competes with carrier worker | 3 | IN PROGRESS | Generic dispatcher now excludes `shipping.carrier.%`; focused predicate regression test added; awaiting CI on latest branch head |
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
| G-020 | P2 | normalize_arabic has mutable search_path | 1 | VERIFIED IN CI | Migration 0070 pins `normalize_arabic` to `pg_catalog`; full migration apply and search_path assertion passed in CI run #536 |
| G-021 | P3 | Formal RFQ/quotation/PO workflow absent | 5 (decision) | OPEN | Decide whether in launch scope; separate project if required |
| G-022 | P3 | pg_trgm extension installed in public schema | 5 | OPEN | Live advisor confirms pg_trgm is installed in public; relocation not yet designed |
| G-023 | P1 | Store creation omits initial OWNER store_members row; membership management is deadlocked until platform admin intervenes | 1 | VERIFIED IN CI | Store + ACTIVE OWNER membership + creation outbox event are inserted in one transaction; service regression suite passed in CI run #536 |

Status definitions:
- **OPEN:** finding not yet implemented/closed.
- **IN PROGRESS:** implementation task actively underway.
- **PARTIAL:** some but not all acceptance criteria met.
- **READY FOR VERIFICATION:** implementation complete; evidence still needs independent review.
- **CLOSED:** all Definition of Done conditions and acceptance criteria satisfied with evidence.
- **DEFERRED:** explicitly excluded from current release by documented decision, risk and owner; not equivalent to fixed.

---

## 4. Phase 0 — Baseline reconciliation & testability foundation

**Status:** IN PROGRESS  
**Phase owner:** Remediation lead / repository maintainer  
**Entry commit:** `develop` / `3f7268dbc75828190f16165ca7e8dd4e315c421c`  
**Working branch:** `remediation/phase-0-1-tenant-security`

| Task | Description | Status | Evidence / result |
|---|---|---|---|
| P0-01 | Record current branch HEAD and compare with audit baseline | COMPLETE | `develop` HEAD `3f7268dbc75828190f16165ca7e8dd4e315c421c`; 7 commits ahead / 0 behind audit SHA; diff contains docs only |
| P0-02 | Revalidate all 22 findings against current source | IN PROGRESS | G-001, G-002, G-020, G-022 revalidated; remaining findings pending |
| P0-03 | Identify fixes already present after audit commit | TODO | |
| P0-04 | Inventory API/web/admin/mobile/DB test commands and prerequisites | IN PROGRESS | Root scripts and API unit/integration/typecheck/build commands inventoried; remaining app/device/provider prerequisites pending |
| P0-05 | Define synthetic buyer/merchant/admin test identities and fixtures | TODO | |
| P0-06 | Define final full test campaign command manifest | TODO | |
| P0-07 | Document Render manual-deploy and disabled auto-deploy behavior | PARTIAL | Staging auto-deploy is disabled; runbook not yet written |
| P0-08 | Review startup migration/seed and safe deploy/forward-fix procedure | TODO | |
| P0-09 | Reconcile database table counts, grants, RLS, roles and migration ledger | IN PROGRESS | 114 public tables, all owned by postgres, RLS off; anon/auth have no CRUD but have TRUNCATE/REFERENCES/TRIGGER; postgres default ACL repeats these; custom _migration_log has 69 rows |
| P0-10 | Trace OTP logging and exception paths; preserve redaction tests | IN PROGRESS | Existing OTP redaction suites cover OTP/email/phone values and provider failures; hardened `OtpDeliveryService` catch path to log only sanitized error class, with regression test for SMTP-like credentials and recipient data; latest-head CI pending |
| P0-11 | Document worker registration/flags/leases and protected-job safety | PARTIAL | Render evidence confirms OutboxDispatcher/ShippingCarrierWorker register; P13 worker disabled and alert sink absent in observed runtime; source topology review pending |
| P0-12 | Establish backup/restore evidence availability and staging runbook | TODO | |

**Exit gate:** test matrix and runbooks accepted; baseline discrepancies resolved or explicitly blocked; no unsafe staging/production writes or worker activation performed.

**Phase evidence:**  
- Baseline SHA: `3f7268dbc75828190f16165ca7e8dd4e315c421c`  
- Audit comparison: 7 commits ahead, 0 behind; only docs/report/README changed since audit SHA  
- Supabase project: `wplsxxevoevzqbgtpctw` (Postgres 17.6.1.166)  
- DB inventory: 114 tables, all postgres-owned, RLS disabled on all 114  
- Grants: no anon/auth CRUD; TRUNCATE/REFERENCES/TRIGGER granted on all 114; postgres default ACL also grants DELETE/TRUNCATE/TRIGGER to anon/auth/service_role  
- Migration ledger: `_migration_log` contains 69 rows, latest 2026-11-17 16:07:23 UTC; Supabase migration list is empty and not authoritative for this app  
- Staging runbook: TBD  
- OTP logging review: TBD  
- Phase decision: IN PROGRESS

---

## 5. Phase 1 — Tenant security & database access safety

**Status:** IN PROGRESS

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P1-01 | Reproduce merchant offer list/analytics scope defect | G-001 | SOURCE VERIFIED | Controller routes pass caller-supplied storeId directly to offer service without caller scope; source at audit baseline |
| P1-02 | Enforce authenticated store/org membership for offer list | G-001 | VERIFIED IN CI | `assertStoreInOrg` + `assertStoreMember`; API unit/coverage suite passed in CI run #536 |
| P1-03 | Enforce scope for analytics and trend routes | G-001 | VERIFIED IN CI | Shared access assertion protects analytics and trend routes; API unit/coverage suite passed in CI run #536 |
| P1-04 | Audit adjacent storeId/orgId object-read endpoints | G-001 + G-024–G-029 | IN PROGRESS | G-024–G-026 fixes committed with regression tests; G-027 closed after CI #554; G-028/G-029 implemented with 11 focused tests total and awaiting latest-head CI |
| P1-05 | Add owner/staff/buyer/foreign merchant/admin authorization matrix tests | G-001 | VERIFIED IN CI | Controller regression tests cover authorized member, foreign org, missing membership and admin bypass; API unit/coverage suite passed in CI run #536 |
| P1-06 | Identify API runtime DB role and all database access paths | G-002 | PARTIAL — BLOCKED ON RENDER DB USERNAME | Source confirms the API uses a direct node-postgres/Drizzle Pool from Render DATABASE_URL; the reusable staging release workflow separately injects GitHub environment secret STAGING_DATABASE_URL into the migration runner. The API does not use a Supabase JS SDK directly (web/admin package dependencies and Flutter pubspec show API clients instead). Render staging service is scs-api-staging, branch develop, autoDeploy off, last live commit 9f5bc397; Render connector does not expose env-var names/values, and no Render Postgres resource is attached. Supabase pg_stat_activity shows only mgmt-api under postgres, no SCS API connection. MCP SQL current_user=postgres is the MCP session, not evidence of the API role. Need the username components only (not passwords/URLs) for both Render DATABASE_URL and GitHub staging STAGING_DATABASE_URL to compare the API runtime and migration roles |
| P1-07 | Reconcile table count and classify all tables by access boundary | G-002 | IN PROGRESS | Read-only live query confirms 114 public tables, all owned by postgres; RLS enabled on 0 and forced on 0. Table-by-table access classification remains pending |
| P1-08 | Audit grants, default privileges, sequences, functions and schemas | G-002 | IN PROGRESS | Read-only live queries confirm anon/authenticated have no SELECT/INSERT/UPDATE/DELETE on the 114 postgres-owned app tables (confirmed via has_table_privilege on users, organizations, orders, merchant_offers, products and inventory_items), but retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. Public sequence privileges: anon/authenticated/authenticator/service_role have 0; postgres has USAGE/SELECT/UPDATE on 1. 32 public functions are executable by PUBLIC (31 also by anon/authenticated); inspected functions are not SECURITY DEFINER, mostly pg_trgm; normalize_arabic remains PUBLIC-executable with default search_path because 0070 is not applied. postgres default ACL repeats the four table privileges; separate supabase_admin defaults include broader grants and require internal-object classification. Role snapshot: postgres LOGIN+BYPASSRLS; service_role NOLOGIN+BYPASSRLS; authenticator LOGIN without BYPASSRLS. Schema/function/default-ACL matrix remains in progress |
| P1-09 | Design least-privilege and table-specific RLS policies | G-002 | TODO | Must finish API runtime role and public Data API access classification before migration design |
| P1-10 | Implement reviewed privilege/RLS migration if required | G-002 | PARTIAL — CI VERIFIED / NOT DEPLOYED | Migration 0070 revokes all table/sequence privileges from anon/authenticated and the executing migration role's defaults; full apply + grant assertions passed in CI #536. Live _migration_log ends at 0069 (2026-11-17) and live grants still include the legacy four privileges on all 114 tables; migration 0070 is not applied to the connected Supabase project. Supabase table inventory/advisory flags all 114 public tables as RLS-disabled (critical). Direct privilege checks show anon/authenticated currently lack CRUD on app tables, so the advisory's blanket 'read or modify every row' statement is not supported by current table grants; the absence of RLS remains a serious defense-in-depth and future-grant risk. RLS remains gated on API/migration runtime role confirmation |
| P1-11 | Add DB/client access negative tests and API tenant tests | G-002 | TODO | |
| P1-12 | Harden normalize_arabic search_path safely | G-020 | VERIFIED IN CI | Migration 0070 sets function search_path to `pg_catalog`; assertion passed in CI run #536 |
| P1-13 | Verify OTP redaction across success/failure/exception paths | Security safeguard | IN PROGRESS | Existing success/failure redaction suites reviewed; exception-path logger now omits raw provider error message and a regression test asserts secrets/recipient data are absent; latest-head CI pending |
| P1-14 | Create initial ACTIVE OWNER membership atomically with new store and outbox event | G-023 | VERIFIED IN CI | Store + `storeMembers` OWNER + outbox event inserted in one transaction; focused service regression tests passed in CI run #536 |
| P1-15 | Enforce store membership and authenticated actor identity on merchant catalog requests | G-024 | VERIFIED IN UNIT/COVERAGE CI | Controller security suite passed 7/7 tests in CI #551; active org + store membership enforced; requestedBy and reviewer identity derive from JWT |
| P1-16 | Enforce store membership on store and warehouse lifecycle routes | G-025 | VERIFIED IN UNIT/COVERAGE CI | Controller security suite passed 7/7 tests in CI #551; store update, warehouse create/list/update and verification submission check target store membership |
| P1-17 | Enforce store ownership and variant/list consistency on pricing routes | G-026 | VERIFIED IN UNIT/COVERAGE CI | Controller security suite passed 9/9 tests in CI #551; price-list/tier reads and writes check owning store membership; variant must belong to the same store as its price list |
| P1-18 | Enforce store membership throughout inventory read/write paths | G-027 | VERIFIED IN CI — CLOSED | Added fail-closed warehouse, variant and inventory-item membership helpers; wired every inventory HTTP route through service authorization; low-stock listing now limits to active memberships in activeOrg; inventory creation rejects variant/warehouse store mismatch; 14 focused tests passed in CI #554 and all workflow jobs passed |
| P1-19 | Enforce buyer/merchant publication boundary for product detail, variants, media and store product grids | G-028 | IMPLEMENTED — CI PENDING | ACTIVE products are buyer-visible; non-ACTIVE detail/variant/matrix/media reads require owning-store active membership or privileged platform role; non-member store grids force ACTIVE products and active variants; public/studio detail cache keys are separated; 8 focused helper tests added |
| P1-20 | Enforce store membership before bulk catalog mutations | G-029 | IMPLEMENTED — CI PENDING | Bulk delete/archive/draft requires active organization ownership and active store membership before invoking the service; 3 focused controller tests added |

**Exit gate:** P0 tenant isolation PASS; G-023 initial owner membership PASS; database access model and migration verified; focused security tests pass; limited staging business tests may then be considered with authorization.

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
| P3-01 | Map event types to exactly one authoritative consumer | G-003 | IN PROGRESS | Confirmed dedicated carrier worker owns `shipping.carrier.%`; generic dispatcher exclusion implemented; full event-type ownership map remains open |
| P3-02 | Prevent generic dispatcher from consuming carrier events | G-003 | IN PROGRESS | Generic dispatcher excludes `shipping.carrier.%`; CI #541 exposed a case-sensitive assertion mismatch (`not like` emitted by Drizzle); assertion corrected in commit `86f30d8`, latest-head CI pending |
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
| 2026-11-18 | CI #541 diagnosis; OTP exception redaction | branch `remediation/phase-0-1-tenant-security` | CI #541: lint/typecheck, Flutter, integration, web/admin, migration assertions and E6 passed; API coverage failed only because test expected uppercase `NOT LIKE` while Drizzle emits lowercase `not like`. Assertion corrected. OTP delivery catch now logs sanitized error class only; exception-redaction regression test added. | Latest-head CI pending; prior #536 remains green for G-001/G-023/migration 0070; no live DB migration or Render deploy | IN PROGRESS | Verify latest-head API coverage + full CI; continue G-003 ownership and remaining P1 remediation |
| 2026-11-18 | P1-04 adjacent tenant-scope audit and G-024–G-026 fixes | commits `c48bb9d`, `c0b8f0e`, `9511d5a`, `f77f553`, `d83da11`, `2b16c3e` on `remediation/phase-0-1-tenant-security` | Added store/org and active-membership checks to merchant catalog request routes; requester/reviewer identities now derive from JWT. Added store membership checks to store/warehouse lifecycle routes. Added price-list/tier ownership checks and variant/list store consistency. Added focused security regression suites. P1-04 source audit also recorded G-027–G-029 for inventory, product-read publication boundary and bulk product mutation. | CI #551 on head `2b16c3e`: lint/typecheck, mobile, web/admin, E6, full migration apply and API unit/coverage passed. Unit coverage reported 216 passed files, 6 skipped; 4,363 passed tests, 110 skipped. New security suites passed: pricing 9/9, merchant 7/7, catalog requests 7/7. API integration tests still running. No live DB migration, staging write, or deployment. | IN PROGRESS — API VERIFICATION PENDING | Verify CI #551; then implement G-027 inventory membership, G-028 buyer/merchant product-read boundary and G-029 bulk product membership. |
| 2026-11-18 | G-027 inventory store-membership enforcement | commits `ce6a0c4`, `cc7ddbb`, `8af101e`, `a79ad4f`, `a2f0814`, `ca4c637`, `f995157`, `2e45806` on `remediation/phase-0-1-tenant-security` | Added active store membership checks for warehouse, variant and inventory-item access; all inventory controller routes forward authenticated caller context; low-stock listing is limited to active memberships in activeOrg; inventory items require variant and warehouse to belong to the same store; added 14 focused helper/service tests. | CI #554 on code head `2e45806`: all jobs passed, including API unit/coverage, API integration, lint/typecheck, format, mobile, web/admin, E6, migration full apply, build, contract/codegen and container smoke. | CLOSED — CI GREEN | Proceed to G-028/G-029. |

| 2026-11-18 | G-028 product publication visibility boundary | commits `d4ddaaa`, `527e21c`, `eac0817`, `904d20c`, `9432ad7`, `cc3aba6`, `09f57c6`, `f4127d6`, `3a05c00`, `44746ce` on `remediation/phase-0-1-tenant-security` | Enforced ACTIVE-only public product grids and public variants; non-ACTIVE product detail, variants, matrix and media require active owning-store membership or platform privilege. Buyer detail excludes inactive variants. Public/studio Redis cache keys are separated; auth is checked before cache lookup. Added 8 focused helper tests. | Latest branch head is documentation-only after code head `44746ce` has no associated GitHub Actions run; Vercel admin/web checks fail with external `build-rate-limit`; tests are committed but not yet CI-verified. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-029 bulk catalog mutation authorization | commits `b8f240e`, `3e030bf` on `remediation/phase-0-1-tenant-security` | Bulk delete/archive/draft now requires active organization ownership and active store membership before the mutation service is invoked. Added 3 controller regression tests for member allow, same-org non-member deny and foreign-org deny. | Latest branch head is documentation-only after code head `44746ce` has no associated GitHub Actions run/status; focused tests are committed but not yet CI-verified. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-002 runtime DB-role and access-path investigation | read-only Supabase SQL + Render service inspection; branch `remediation/phase-0-1-tenant-security` | Confirmed Render service `scs-api-staging` uses branch `develop`, autoDeploy off, and last live deploy commit `9f5bc397`; no Render Postgres resource exists. Render service details omit env vars. Supabase pg_stat_activity showed only `mgmt-api` using `postgres`, with no SCS API connection. MCP SQL session reports current_user=postgres, which is not proof of API identity. Live DB has 114 public tables, all owned by postgres, no RLS; anon/authenticated have no CRUD on app tables but retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. They have no public sequence privileges. 32 public functions are PUBLIC-executable (none of the inspected functions are SECURITY DEFINER); normalize_arabic remains PUBLIC-executable with default search_path. postgres default ACL repeats the four table privileges; supabase_admin has separate broad default ACLs that need internal-object classification. Roles include postgres LOGIN+BYPASSRLS and service_role NOLOGIN+BYPASSRLS. _migration_log ends at 0069, so migration 0070 is not deployed; live grants remain. No writes or deploys performed. | Read-only SQL only; no staging write, migration, grant, RLS or Render configuration change. Runtime/migration usernames cannot be identified without the non-secret username components from Render DATABASE_URL and GitHub staging STAGING_DATABASE_URL, or a live API connection. | PARTIAL — BLOCKED ON RUNTIME ROLE | Obtain DATABASE_URL username only (never password/URL); complete default-ACL/access-path matrix, then review migration/RLS design. |
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
| D-001 | Reconcile DB inventory count (114 vs 111) and effective API DB role | Engineering + DB owner | PARTIAL — ROLE OPEN | Live read-only SQL reconciles count to 114; runtime API DATABASE_URL username remains unverified because Render connector does not expose env vars and pg_stat_activity shows no API session. |
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

**Next:** obtain latest-head CI for G-028/G-029 (the current PR head has no GitHub Actions run/status yet), then ask for the non-secret DATABASE_URL username from Render to close P1-06. Complete the access-path/default-ACL matrix before revising migration 0070 or designing RLS. Do not deploy, apply migrations, change grants, or enable RLS.

**Current state:** G-001 and G-023 fixes and migration 0070 passed CI #536. G-003 dispatcher filtering and P0-10 OTP exception redaction have source changes and regression tests. G-024–G-026 fixes and tests are committed. G-027 inventory membership remediation is closed after all CI #554 jobs passed on code head `2e45806`, including API unit/coverage, integration, build, contract/codegen, migration full apply and container smoke. G-028 publication-aware product reads are implemented with 8 focused helper tests; G-029 bulk catalog authorization is implemented with 3 focused controller tests. Latest branch head is documentation-only after code head `44746ce` has no associated GitHub Actions run; Vercel admin/web checks are failing with the external `build-rate-limit` upgrade gate, so both remain CI-pending. G-002 read-only live inspection confirms 114 public tables, all postgres-owned, no RLS, residual anon/authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants, zero anon/authenticated CRUD on app tables, no public sequence privileges for those roles, and an unverified API/migration DB username. Supabase's critical RLS advisory is recorded with the direct-grant qualification. No live database migration, staging write, Render configuration change or deployment has been performed.
