# SCS Platform — Audit-Driven Implementation Progress Tracker

**Living tracker. Update this file as part of every remediation task and phase transition.**  
**Created:** 18 November 2026  
**Plan:** [Audit-Driven Remediation & Testability Implementation Plan](./IMPLEMENTATION-PLAN.md)  
**Baseline audit:** [Comprehensive B2B Platform Readiness Audit](../audits/b2b-platform-readiness/SCS-B2B-PLATFORM-COMPREHENSIVE-READINESS-AUDIT.html)  
**Repository:** `nabeel2323/scs-platform`  
**Baseline branch/commit:** `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36`  
**Tracker status:** ACTIVE — Phases 0–4 are in progress; G-001, G-003–G-005, G-011, G-020 and G-023–G-029 are verified/closed. G-006 implementation is CI-verified on `8b77243c` by CI #703; its explicit stale-term/concurrency acceptance review remains open. G-007 implementation is CI-verified on `34728979` by CI #711; full journey UAT remains in Phase 6. G-002 and G-008 remain open P1 findings; G-007 remains tracked as implemented pending UAT.

---

## 1. Executive progress

| Metric | Current |
|---|---:|
| Planned phases | 7 (0–6) |
| Phases completed | 0 |
| Phases in progress | 4 |
| Original audit findings | 22 |
| Additional findings discovered during remediation | 7 (G-023–G-029) |
| P0 open | 0 |
| P1 open | 4 (G-002, G-006–G-008) |
| P2 open | 10 (G-009–G-010, G-012–G-019) |
| P3 open | 2 |
| Findings closed under this plan | 13 (G-001, G-003–G-005, G-011, G-020, G-023–G-029) |
| Findings implemented; latest-head CI pending | 0 |
| Findings partially remediated | 1 (G-002) |
| Final full test campaign | NOT STARTED |

**Counting note:** The original audit contains G-001–G-022. G-023–G-029 were added during remediation. Counts above reflect the current tracker classifications; CI-pending implementation is not counted as closed.

### Overall status

<badge color="success">IN PROGRESS</badge> Implementation is active on `remediation/phase-0-1-tenant-security`. CI #687 passed all executed jobs on `dc071157992bb9869fcc059d3bc079bd764f8186`. G-003 is verified by persisted-event integration coverage invoking the production generic and carrier pollers; G-004 exact selected-offer pricing/cart attribution and G-005 per-currency checkout totals passed their focused tests and the full applicable CI jobs. G-011 and G-028 remain verified from CI #647; G-029 from CI #592. G-002 remains partial pending effective DB-role/access-path verification. The September roadmap's historical phase-completion statements are not used as closure evidence for this November audit.

---

## 2. Phase dashboard

| Order | Phase | Status | Entry/exit condition | Progress |
|---:|---|---|---|---:|
| 0 | Baseline reconciliation & testability foundation | IN PROGRESS | Current baseline, test matrix, staging safety and evidence discrepancies reconciled | 45% |
| 1 | Tenant security & database access safety | IN PROGRESS | P0 tenant boundary, initial store ownership and DB role/grant/RLS design verified; limited staging testing may be authorized | 25% |
| 2 | Commercial correctness & checkout contract | IN PROGRESS | Seller attribution, quantity, currency, payment and tax/fulfillment contracts consistent | 30% |
| 3 | Event, worker & fulfillment reliability | IN PROGRESS | Outbox ownership, carrier processing, durable claims and P13 alert/lease plan verified | 40% |
| 4 | Client workflow parity & truthful notifications | IN PROGRESS | G-007 checkout parity implemented; remaining merchant/admin workflows and G-009/G-019 still open | 15% |
| 5 | Operational hardening, CI, data hygiene & documentation | NOT STARTED | CI, repository, docs, deployment and recovery controls ready | 0% |
| 6 | Consolidated full verification & release decision | NOT STARTED | One final full test campaign and evidence-based go/no-go decision | 0% |

Status vocabulary: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR VERIFICATION · COMPLETE · COMPLETE WITH APPROVED DEFERRALS.

---

## 3. Finding register

| ID | Priority | Finding | Planned phase | Status | Evidence / notes |
|---|---:|---|---:|---|---|
| G-001 | P0 | Merchant offer list/analytics lack tenant authorization | 1 | VERIFIED IN CI | Controller enforces authenticated org + active store membership on all three routes; controller regression suite passed in CI run #536 |
| G-002 | P1 | RLS disabled / excessive anon-auth grants; access model needs reconciliation | 1 | IN PROGRESS | Reconciled to 114 tables: no anon/auth CRUD, but TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all tables and same postgres default ACL; all 114 RLS disabled |
| G-003 | P1 | Generic outbox dispatcher competes with carrier worker | 3 | CLOSED — CI #687 | Generic dispatcher excludes `shipping.carrier.%`; dedicated worker claims only carrier events using `FOR UPDATE SKIP LOCKED`; stale lease recovery is carrier-prefix scoped; unsupported carrier event types enter retry/dead-letter handling. PostgreSQL Testcontainers integration coverage invokes the real OutboxDispatcher.poll() and ShippingCarrierWorker.poll() against persisted carrier/non-carrier events and verifies exclusive ownership plus retry behavior. API integration and unit/coverage jobs passed CI #687. Worker topology is source-documented; P13 activation/alerting and G-010 label generation remain separate work. |
| G-004 | P1 | Search result seller/offer differs from cart attribution | 2 | CLOSED — CI #687 | Search cards resolve the exact selected offer's active price-list tier at its MOQ (or explicit base price where no list is linked), return concrete variant and offer identity, and cart add/batch/update plus checkout repricing preserve that offer. Owner-priced cart lines remain separate from offer-backed lines; selected prices are keyed by offer + variant + quantity. Resolver (13 tests), product-card (8 tests) and cart (7 tests) suites passed API unit/coverage CI #687; integration, web/admin, lint/typecheck and build jobs also passed. |
| G-005 | P1 | Mixed-currency checkout total incorrectly aggregates/formats | 2 | CLOSED — CI #687 | Checkout now groups item and selected shipping amounts by their own normalized currency; pickup adds no fee; missing currencies mark the estimate incomplete; no SAR fallback or cross-currency grand total is shown. A single-currency total is shown only when complete. Five focused currency tests and the web/admin test job passed CI #687. |
| G-006 | P1 | Offer orderIncrement not enforced | 2 | IMPLEMENTED — CI #703; ACCEPTANCE REVIEW OPEN | MOQ-relative formula agreed; API cart/pricing/checkout enforcement, locked authoritative checkout terms, web/mobile step controls and selected-offer increment exposure implemented. CI #703 passed all jobs. Explicit changed-offer-term and concurrency acceptance cases still require confirmation before CLOSED. |
| G-007 | P1 | Mobile checkout omits per-store shipping/payment; VAT disclosure conflicts | 2, 4 | IMPLEMENTED — CI #711; UAT PENDING | Per-store mobile shipping/pickup and payment selections; server checkout preview uses authoritative promotion/shipping/VAT calculation; web/mobile review and confirmation aligned. CI #711 passed all executed jobs. Full buyer journey and order detail/tracking UAT remain in Phase 6. |
| G-008 | P1 | API accepts DIGITAL without a registered digital provider | 2 | IMPLEMENTED — CI PENDING | Supported manual-method whitelist enforced at checkout and payment-record creation; DIGITAL retained only for legacy persisted rows. Targeted rejection tests added. |
| G-009 | P2 | SMS/FCM/WhatsApp stubs report SENT | 4 | OPEN | Implement provider or truthful NOT_CONFIGURED state |
| G-010 | P2 | Carrier label worker handler is no-op | 3 | OPEN | Use provider sandbox; no live shipment without approval |
| G-011 | P2 | AutoCompleteWorker claim is not durable | 3 | CLOSED — CI VERIFIED | Migration 0071 adds persisted five-minute claim leases; worker claims one order at a time with SKIP LOCKED, reclaims expired leases, conditionally releases only its own claim, and OrdersService fences the completion status update by current owner + unexpired lease. Unit and PostgreSQL two-worker/lease-recovery/buyer-confirmation race tests passed in CI #647; migration 0071 full apply also passed in isolated CI PostgreSQL. |
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
| P0-12 | Backup/restore exercise | DEFERRED — USER DIRECTION | Not a prerequisite for this development remediation cycle; revisit only if required by the pre-production operational-readiness decision |

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
| P1-04 | Audit adjacent storeId/orgId object-read endpoints | G-001 + G-024–G-029 | IN PROGRESS | G-024–G-026 fixes committed with regression tests; G-027 closed after CI #554; G-028 now has 19 focused tests (8 publication helper, 6 controller boundary, 2 category query/count, 3 canonical lookup); latest lookup/category-count changes await CI. G-029's 3 bulk mutation tests passed CI #592 and are closed. G-029's 3 bulk mutation tests passed in CI #592 and are closed. G-028 review also tightened buyer-facing canonical category reads to ACTIVE products and PUBLISHED product types; latest-head CI remains pending |
| P1-05 | Add owner/staff/buyer/foreign merchant/admin authorization matrix tests | G-001 | VERIFIED IN CI | Controller regression tests cover authorized member, foreign org, missing membership and admin bypass; API unit/coverage suite passed in CI run #536 |
| P1-06 | Identify API runtime DB role and all database access paths | G-002 | PARTIAL — TARGET DB CONFIRMED; ROLE UNVERIFIED | User confirmed one PostgreSQL database is shared across all branches and there is no separate production infrastructure deployed. The Render API and staging migration workflow target that same database. Source confirms the API uses a direct node-postgres/Drizzle Pool from Render DATABASE_URL; the reusable staging release workflow separately injects GitHub environment secret STAGING_DATABASE_URL into the migration runner. The API does not use a Supabase JS SDK directly (web/admin package dependencies and Flutter pubspec show API clients instead). Render staging service is scs-api-staging, branch develop, autoDeploy off, last live commit 9f5bc397; Render connector does not expose env-var names/values, and no Render Postgres resource is attached. Supabase pg_stat_activity shows only mgmt-api under postgres, no SCS API connection. MCP SQL current_user=postgres is the MCP session, not evidence of the API role. The database target is shared, but API and migration credentials could still authenticate as different PostgreSQL roles. This is not blocking ongoing application remediation; verify the effective roles before applying migration 0070 or enabling RLS, and revisit before production infrastructure is introduced. |
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
| P1-19 | Enforce buyer/merchant publication boundary for product detail, variants, media, store grids, category reads and canonical lookup | G-028 | COMPLETE — CI #647 | ACTIVE products are buyer-visible; non-ACTIVE detail/variant/matrix/media reads require owning-store active membership or privileged platform role; non-member store grids force ACTIVE products and active variants; public/studio detail cache keys are separated; canonical category rows/counts require ACTIVE products and product-type counts require PUBLISHED types; canonical identifier and selector lookups require ACTIVE platform-level products. All 19 focused tests and latest full API unit/coverage, integration and migration suites passed in CI #647. |
| P1-20 | Enforce store membership before bulk catalog mutations | G-029 | CLOSED — CI #592 | Bulk delete/archive/draft requires active organization ownership and active store membership before invoking the service; all 3 focused controller tests passed in API unit/coverage CI #592 on code commit `335d8db`. |

**Exit gate:** P0 tenant isolation PASS; G-023 initial owner membership PASS; G-024–G-029 tenant/catalog boundaries verified; focused security tests pass. Database privilege/RLS hardening remains a pre-production gate and must not be applied until effective API/migration roles are understood.

**Phase evidence:**  
- Implementation PR/commit: TBD  
- Focused test commands/results: TBD  
- Migration ID(s): TBD  
- Independent review: TBD  
- Phase decision: NOT STARTED

---

## 6. Phase 2 — Commercial correctness & checkout contract

**Status:** IN PROGRESS

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P2-01 | Define canonical offer identity in search contract | G-004 | COMPLETE — CI #687 | Search cards return selected offer/store identity and concrete active variant; exact-offer resolver tests passed. |
| P2-02 | Align displayed seller/offer with add-to-cart payload | G-004 | COMPLETE — CI #687 | Cart add/batch/update and checkout repricing preserve the exact selected offer; owner-priced lines cannot merge into offer-backed lines. |
| P2-03 | Test multiple sellers, stale/inactive offers and price snapshots | G-004 | COMPLETE — CI #687 | Resolver, product-card and cart focused tests passed API unit/coverage; integration suite passed. |
| P2-04 | Agree and document MOQ/orderIncrement formula | G-006 | COMPLETE | Agreed rule: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement; documented in plan. |
| P2-05 | Enforce quantity rule on add/update/checkout server-side | G-006 | IMPLEMENTED — CI #703 | Shared validation wired into cart add/batch/update/validation, selected-offer pricing and checkout; checkout locks and re-reads authoritative offer terms. |
| P2-06 | Add invalid quantity, stale terms and race regression tests | G-006 | IMPLEMENTED — CI PENDING; DB CONTENTION UAT OPEN | Pricing invalid-increment, negative quantity rejection and zero-as-remove tests plus stale MOQ/orderIncrement-after-cart tests added. Checkout test asserts both authoritative FOR UPDATE reads and rejection before insert. Full multi-connection contention verification remains Phase 6. |
| P2-07 | Replace mixed-currency grand total with per-currency subtotals | G-005 | COMPLETE — CI #687 | Totals are grouped by currency; mixed currencies are never added together. |
| P2-08 | Validate currency exponent/formatting and same-currency totals | G-005 | COMPLETE — CI #687 | Five tests cover same-currency totals, mixed currencies, shipping currency, missing currency and pickup behavior. |
| P2-09 | Reject DIGITAL unless a real provider is registered | G-008 | IMPLEMENTED — CI PENDING | Checkout and PaymentsService both reject DIGITAL before transaction/provider side effects; regression tests added. |
| P2-10 | Align API contracts and web/admin payment choices | G-008 | PARTIAL — CI PENDING | API supported-method whitelist aligned with current manual provider; buyer web disables DIGITAL and mobile omits it. Admin payment configuration still requires a focused review. |
| P2-11 | Define mobile per-store shipping/payment and tax contract | G-007 | COMPLETE — CI #711 | API preview uses the same financial helper as checkout; shipping estimate exposes actual fulfillmentMethod; server validates each supplier selection. |
| P2-12 | Update mobile request/review UI and generated clients | G-007 | COMPLETE — CI #711 | Mobile per-store selection, payment choice, tax-inclusive review and persisted delivery/VAT confirmation implemented; web aligned to same preview. |
| P2-13 | Add targeted API/web/mobile contract tests | G-004–G-008 | IMPLEMENTED — CI PENDING | G-006/G-007 tests passed CI #703/#711; G-008 tests cover the supported-method whitelist, checkout rejection and payment-service side-effect guard. |

**Exit gate:** seller attribution, quantity rules, currency totals, supported payment methods and tax/fulfillment semantics are consistent across API and clients.

---

## 7. Phase 3 — Event, worker & fulfillment reliability

**Status:** NOT STARTED

| Task | Description | Finding | Status | Evidence / result |
|---|---|---|---|---|
| P3-01 | Map event types to exactly one authoritative consumer | G-003 | COMPLETE — CI #687 | [Outbox Event Ownership Map](./OUTBOX-EVENT-OWNERSHIP-MAP.md) documents carrier and non-carrier publisher families; PostgreSQL integration test invokes both real poll methods against persisted events and verifies exclusive ownership. |
| P3-02 | Prevent generic dispatcher from consuming carrier events and keep lease recovery within ownership boundary | G-003 | COMPLETE — CI #687 | Generic dispatcher exclusion, carrier-only claim/recovery and unsupported-event retry behavior passed API unit/coverage and PostgreSQL integration CI. |
| P3-03 | Implement event retry, idempotency and terminal failure behavior | G-003 | COMPLETE — CI #687 | Carrier worker retry/dead-letter paths and unsupported-event retry behavior passed focused and integration CI. Provider-side idempotency and live carrier behavior remain outside this finding's verified scope. |
| P3-04 | Connect carrier label event to provider label generation | G-010 | TODO | |
| P3-05 | Persist label metadata and shipment state safely | G-010 | TODO | |
| P3-06 | Test provider timeout, duplicate event and retry behavior | G-003/G-010 | TODO | |
| P3-07 | Implement durable AutoCompleteWorker lease/claim | G-011 | COMPLETE — CI #647 | Migration 0071 + Drizzle schema add claim timestamp/owner; worker persists a five-minute lease, recovers expired claims, and completion is fenced by owner + lease validity in the atomic status flip. |
| P3-08 | Test multi-instance claim and buyer confirmation race | G-011 | COMPLETE — CI #647 | Focused unit tests cover persisted claim SQL, owner propagation and conditional release. PostgreSQL Testcontainers integration test races two worker instances, expires/reclaims the lease, then verifies buyer confirmation fences the stale worker; passed in CI #647. |
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
| P4-01 | Complete mobile per-store shipping/payment and tax review | G-007 | COMPLETE — CI #711 | Server-calculated tax-inclusive preview, per-supplier fulfillment/payment request and order confirmation details implemented. Full journey UAT reserved for Phase 6. |
| P4-02 | Complete mobile order detail/fulfillment parity | G-007 | TODO | Verify per-suborder order detail and tracking in Phase 6 UAT. |
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
| 2026-11-18 | Background worker activation/source topology review | commit `5da83d0` | Inspected AppModule imports and provider registration for OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, AutoCompleteWorker and ReturnExpirationWorker. Documented that most pollers start inside each API process; ReturnExpirationWorker is explicitly gated by `P13_WORKER_ENABLED`. Clarified that existing persisted-event integration coverage mirrors SQL predicates and does not yet call both production consumer methods. | Source review and module registration evidence; no Render environment values or runtime flags changed | PARTIAL | Add true integration invocation of both consumers; inspect AutoCompleteWorker durable claim as G-011 |
| 2026-11-18 | CI #629 failure diagnosis and catalog/search regression repair | commits `ce38d91`, `4ce474b`, `d631cf5`, `aef5dfd`, `d8e82b5`, `eed9e42` | Applied `brandId` in both full-text result/count SQL; restored admin category product counts to include draft canonical products; corrected canonical selector response and identifier-fallback test mocks; changed buyer-search integration fixtures from invalid `PUBLISHED` product status to `ACTIVE`. CI #629 also showed P9 performance suite teardown hook timing out at 30s; raise teardown allowance if reproduced in #633. | CI #633 running on head `eed9e42`; #629 failed API coverage + integration, while lint/typecheck, web/admin, mobile, migration full apply and E6 passed | IN PROGRESS | Inspect #633 results; fix remaining failures before closing G-028/G-003 |
| 2026-11-18 | CI #541 diagnosis; OTP exception redaction | branch `remediation/phase-0-1-tenant-security` | CI #541: lint/typecheck, Flutter, integration, web/admin, migration assertions and E6 passed; API coverage failed only because test expected uppercase `NOT LIKE` while Drizzle emits lowercase `not like`. Assertion corrected. OTP delivery catch now logs sanitized error class only; exception-redaction regression test added. | Latest-head CI pending; prior #536 remains green for G-001/G-023/migration 0070; no live DB migration or Render deploy | IN PROGRESS | Verify latest-head API coverage + full CI; continue G-003 ownership and remaining P1 remediation |
| 2026-11-18 | P1-04 adjacent tenant-scope audit and G-024–G-026 fixes | commits `c48bb9d`, `c0b8f0e`, `9511d5a`, `f77f553`, `d83da11`, `2b16c3e` on `remediation/phase-0-1-tenant-security` | Added store/org and active-membership checks to merchant catalog request routes; requester/reviewer identities now derive from JWT. Added store membership checks to store/warehouse lifecycle routes. Added price-list/tier ownership checks and variant/list store consistency. Added focused security regression suites. P1-04 source audit also recorded G-027–G-029 for inventory, product-read publication boundary and bulk product mutation. | CI #551 on head `2b16c3e`: lint/typecheck, mobile, web/admin, E6, full migration apply and API unit/coverage passed. Unit coverage reported 216 passed files, 6 skipped; 4,363 passed tests, 110 skipped. New security suites passed: pricing 9/9, merchant 7/7, catalog requests 7/7. API integration tests still running. No live DB migration, staging write, or deployment. | IN PROGRESS — API VERIFICATION PENDING | Verify CI #551; then implement G-027 inventory membership, G-028 buyer/merchant product-read boundary and G-029 bulk product membership. |
| 2026-11-18 | G-027 inventory store-membership enforcement | commits `ce6a0c4`, `cc7ddbb`, `8af101e`, `a79ad4f`, `a2f0814`, `ca4c637`, `f995157`, `2e45806` on `remediation/phase-0-1-tenant-security` | Added active store membership checks for warehouse, variant and inventory-item access; all inventory controller routes forward authenticated caller context; low-stock listing is limited to active memberships in activeOrg; inventory items require variant and warehouse to belong to the same store; added 14 focused helper/service tests. | CI #554 on code head `2e45806`: all jobs passed, including API unit/coverage, API integration, lint/typecheck, format, mobile, web/admin, E6, migration full apply, build, contract/codegen and container smoke. | CLOSED — CI GREEN | Proceed to G-028/G-029. |

| 2026-11-18 | G-028 product publication visibility boundary | commits `d4ddaaa`, `527e21c`, `eac0817`, `904d20c`, `9432ad7`, `cc3aba6`, `09f57c6`, `f4127d6`, `3a05c00`, `44746ce` on `remediation/phase-0-1-tenant-security` | Enforced ACTIVE-only public product grids and public variants; non-ACTIVE product detail, variants, matrix and media require active owning-store membership or platform privilege. Buyer detail excludes inactive variants. Public/studio Redis cache keys are separated; auth is checked before cache lookup. Added 8 focused helper tests. | CI #592 passed API unit/coverage, integration, build, contract/codegen, lint/typecheck, mobile, web/admin, boundary lint and migration full apply for the pre-latest-lookup code. Latest canonical lookup/category-count changes are newer than that run and await fresh CI; the container smoke job was cancelled and is being rerun. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-029 bulk catalog mutation authorization | commits `b8f240e`, `3e030bf` on `remediation/phase-0-1-tenant-security` | Bulk delete/archive/draft now requires active organization ownership and active store membership before the mutation service is invoked. Added 3 controller regression tests for member allow, same-org non-member deny and foreign-org deny. | CI #592 API unit/coverage passed on code head `335d8db`; all 3 focused bulk-mutation controller tests passed. Container smoke was separately cancelled and is being rerun. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-002 runtime DB-role and access-path investigation | read-only Supabase SQL + Render service inspection; branch `remediation/phase-0-1-tenant-security` | Confirmed Render service `scs-api-staging` uses branch `develop`, autoDeploy off, and last live deploy commit `9f5bc397`; no Render Postgres resource exists. Render service details omit env vars. Supabase pg_stat_activity showed only `mgmt-api` using `postgres`, with no SCS API connection. MCP SQL session reports current_user=postgres, which is not proof of API identity. Live DB has 114 public tables, all owned by postgres, no RLS; anon/authenticated have no CRUD on app tables but retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. They have no public sequence privileges. 32 public functions are PUBLIC-executable (none of the inspected functions are SECURITY DEFINER); normalize_arabic remains PUBLIC-executable with default search_path. postgres default ACL repeats the four table privileges; supabase_admin has separate broad default ACLs that need internal-object classification. Roles include postgres LOGIN+BYPASSRLS and service_role NOLOGIN+BYPASSRLS. _migration_log ends at 0069, so migration 0070 is not deployed; live grants remain. No writes or deploys performed. | Read-only SQL only; no staging write, migration, grant, RLS or Render configuration change. Database target equality is confirmed by the user. Runtime role remains unverified because DATABASE_URL's username is not exposed by the Render connector and no API connection appeared in pg_stat_activity; same database does not establish that API and migration credentials use the same PostgreSQL role. | PARTIAL — BLOCKED ON RUNTIME ROLE | Obtain the Render DATABASE_URL username only (never password/URL), or capture current_user from a controlled API-side diagnostic; compare with the migration runner's effective role, complete default-ACL/access-path matrix, then review migration/RLS design. |

| 2026-11-18 | G-003 carrier event ownership hardening | commits `a1d48c6`, `58d4104`, `1416de1`, `f363828` on `remediation/phase-0-1-tenant-security` | Kept generic dispatcher exclusion for `shipping.carrier.%`; scoped stale PROCESSING lease recovery to the carrier prefix; unsupported carrier event types now throw into retry/dead-letter handling instead of being acknowledged. Added three worker tests for carrier-only atomic claim, carrier-only stale-lease recovery and unsupported-event retry. Added [Outbox Event Ownership Map](./OUTBOX-EVENT-OWNERSHIP-MAP.md) documenting observed publisher families and the generic dispatcher’s log-only behavior. | Generic dispatcher predicate passed CI #592 API unit/coverage. New worker lease-scope/unknown-event changes and three worker tests are newer than CI #592 and await fresh CI. No worker activation/config changes or live shipping actions. | IN PROGRESS — CI PENDING | Obtain CI, then add integration-level persisted-event ownership proof; keep G-010 label handler separate. |

| 2026-11-19 | G-006 MOQ/orderIncrement enforcement | commits `2521c63`, `ed3bb96`, `8b77243` on `remediation/phase-0-1-tenant-security`; PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) | Agreed MOQ-relative rule: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement. Enforced shared validation across cart add/batch/update/validation, selected-offer pricing and checkout; checkout re-reads and locks authoritative offer/variant terms in its transaction. Invalid negative/fractional/non-finite/unsafe quantities are rejected; zero explicitly removes a cart line. Product-card offer data exposes orderIncrement and web/mobile controls use the MOQ step. | CI #703 on `8b77243c3fc015bf19f66d0cd71b613398311a70`: all executed jobs passed, including API unit/coverage, API integration, lint/typecheck/format, Flutter, web/admin, boundary lint, full migration apply, contract/codegen, build and container smoke. k6 and staging release skipped by workflow conditions. No live DB migration or deployment. | IMPLEMENTED — CI VERIFIED; ACCEPTANCE REVIEW OPEN | Verify the new stale MOQ/orderIncrement and FOR UPDATE race-window tests in CI; complete multi-connection contention UAT in Phase 6 before closing G-006. |

| 2026-11-19 | G-007 mobile checkout parity and tax preview | commit `347289796961a8f80368e20a0fa7fa33d7a8c999` on `remediation/phase-0-1-tenant-security`; PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) | Added per-store shipping estimates and explicit delivery/pickup selection to Flutter; mobile submits per-store shipping selections and selected payment method. Added `POST /v1/checkout/preview` using the same backend promotion, authoritative shipping fee and VAT calculation as checkout; final checkout recalculates before persistence. Shipping estimate includes actual `fulfillmentMethod`. Web and mobile show supplier subtotal, discount, delivery, VAT and tax-inclusive totals; order confirmation shows persisted delivery/tax. Pickup remains available when delivery estimates fail. | CI #711 passed all executed jobs: API unit/coverage 4,444 passed/110 skipped across 226 files; API integration; lint/typecheck/format; Flutter; web/admin; boundary lint; full migration apply; contract/codegen; production build; container image and smoke (health/P13/non-root). k6 and staging release skipped. No live DB migration or deployment. | IMPLEMENTED — CI VERIFIED; PHASE 6 UAT PENDING | Complete buyer journey and per-suborder order-detail/tracking UAT in Phase 6; continue with G-008 unsupported DIGITAL rejection. |

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
| D-002 | Confirm MOQ/orderIncrement business formula | Product/business owner | RESOLVED | Agreed formula: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement; MOQ is the first permitted quantity. |
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

**Next:** verify G-008 unsupported DIGITAL payment rejection with CI, then complete G-006 stale-term/concurrency acceptance review. G-007 implementation is CI-verified; its full buyer journey/order-detail UAT remains in Phase 6. G-002 runtime-role/access-path verification remains a pre-production gate; do not apply migration 0070, change grants or enable RLS until the access model is verified.

**Current state (19 November 2026):** G-001, G-003–G-005, G-011, G-020 and G-023–G-029 are verified/closed with CI evidence. CI #711 on `347289796961a8f80368e20a0fa7fa33d7a8c999` passed all executed jobs: lint/typecheck/format, Flutter analysis/tests, API unit/coverage (4,444 passed; 110 skipped across 226 files), API integration, web/admin tests, boundary lint, full migration apply on isolated CI PostgreSQL, contract/codegen, production build and container build/smoke including health, P13 configuration and non-root checks. k6 smoke and staging release were skipped by workflow conditions. G-006's agreed MOQ-relative rule and server enforcement are implemented; explicit changed-offer-term and concurrency acceptance cases remain to be reviewed before closure. G-007's per-supplier shipping/payment, server-calculated VAT preview and confirmation parity are implemented and CI-verified; full buyer journey/order-detail UAT remains in Phase 6. G-008 unsupported DIGITAL rejection remains open. G-002 remains partial: live inspection confirms 114 public tables, all postgres-owned, no RLS, residual anon/authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants, zero anon/authenticated CRUD on app tables, no public sequence privileges for those roles, and an unverified API/migration DB username. No live database migration, staging write, Render configuration change or deployment has been performed.


| 2026-11-18 | CI #636 failure diagnosis and G-011 durable auto-completion claims | commits `605ed04`, `0ea9908`, `0805f11`, `eaed103`, `58990ad`, `08c89f2`, `c93281a` on `remediation/phase-0-1-tenant-security` | CI #636 confirmed all jobs except API unit/coverage passed. Fixed the admin category-count regression test to preserve the draft-inclusive admin contract. Increased the P9 PostgreSQL benchmark test and container teardown allowances to tolerate the observed CI resource contention. Implemented G-011 durable five-minute order claim leases, expired-claim recovery, conditional release, and a fenced OrdersService status update requiring the same current claim owner and unexpired lease. Added focused worker unit tests. | CI #636: lint/typecheck, integration, migration full apply, web/admin, Flutter and E6 passed; API coverage failed on the stale category-count expectation plus P9 availability test timeout (60s) and afterAll timeout (30s). Latest CI #643 is pending for head `c93281a`. Vercel preview statuses separately report external `build-rate-limit` failures. | IN PROGRESS — LATEST CI PENDING | Verify CI #643, add real PostgreSQL two-worker and buyer-confirmation race coverage for G-011, then continue G-003 integration proof. No live migration, deployment or shared DB change. |


| 2026-11-18 | G-011 PostgreSQL multi-instance and buyer-confirmation race coverage | commit `95a7363` on `remediation/phase-0-1-tenant-security` | Added a Testcontainers PostgreSQL integration test with two AutoCompleteWorker instances. It verifies only one instance claims a due order, the second instance reclaims an expired lease, and a buyer-confirmation status/claim clear prevents the stale worker's fenced OrdersService transition. | New integration test committed; CI run #645 was superseded by this test commit. Await fresh latest-head CI. | IN PROGRESS — CI PENDING | Verify latest CI; if the PostgreSQL test passes, close G-011 after independent review of the migration and fencing behavior. |


| 2026-11-19 | G-011 durable AutoCompleteWorker lease and race remediation | commits `0805f11`, `58990ad`, `08c89f2`, `c93281a`, `57e170a`, `95a7363`, `874f07b` on `remediation/phase-0-1-tenant-security` | Added migration 0071 and Drizzle claim fields; implemented persisted five-minute claims, SKIP LOCKED acquisition, expired lease recovery, owner-conditional release and claim-owner/lease-fenced completion. Added focused unit tests and PostgreSQL Testcontainers coverage for competing workers, lease recovery and buyer-confirmation race. | CI #647 passed all executed jobs: lint/typecheck, Flutter, API unit/coverage, API integration, boundary lint E6, migration full apply, web/admin tests, build, container build/smoke and contract/codegen. k6 smoke and staging release were skipped by workflow conditions. | CLOSED — CI VERIFIED | Continue G-003 production-consumer integration proof. |


| 2026-11-19 | G-003 production outbox poller integration proof | commit `2856d5c` on `remediation/phase-0-1-tenant-security` | Added a PostgreSQL Testcontainers integration test that inserts carrier and non-carrier outbox events, invokes the real `OutboxDispatcher.poll()`, verifies the carrier event remains PENDING while the generic event becomes DISPATCHED, then invokes the real `ShippingCarrierWorker.poll()` and verifies the carrier event is claimed and safely retried for an unsupported event type without being acknowledged. Source review also found that raw SQL `RETURNING *` yields database snake_case column names while the worker consumes camelCase properties; the claim query now aliases its returned fields explicitly, and the integration test asserts the exact event type reaches retry classification. | Test committed; latest-head CI pending. Existing unit coverage for generic exclusion and dedicated worker claim/recovery/unknown-event behavior passed in prior CI #592/#647 as applicable. | IN PROGRESS — CI PENDING | Run latest CI; fix integration failures and verify the persisted-event ownership proof. |


| 2026-11-19 | G-003 raw claim-row mapping correction | commits `7aed300`, `919ad41` on `remediation/phase-0-1-tenant-security` | Corrected `ShippingCarrierWorker.claimEvents()` raw SQL `RETURNING` fields to explicitly alias snake_case database columns to the camelCase properties consumed by event processing. Extended the persisted-event integration test to assert the real unsupported carrier event type reaches retry classification, preventing a false-positive test that would otherwise pass on an undefined event type. | Latest-head CI pending. | IN PROGRESS — CI PENDING | Verify the production-poller integration test and mapping fix in CI. |


| 2026-11-19 | G-004 selected seller and price parity remediation | commits `973680a`, `2507837`, `8cace3c`, `464175a`, `0fca2dc`, `db2aacc`, `edf52c2`, `12e7370`, `8f65c70` on `remediation/phase-0-1-tenant-security` | Source review confirmed the search card's offerId/storeId handoff existed, but card price was read from `merchant_offers.base_price_minor` while cart pricing could use another offer's price list (including variant-level precedence over the selected product-level offer). Added batch `resolveSelectedOfferPrices` to resolve a specified offer's own active price-list tier at the requested quantity, or its explicit base price when no list is linked. Product-card enrichment now displays this resolved value and concrete variant. Cart add, batch add, quantity update and checkout price-delta checks preserve the exact selected offer. Owner-priced cart lines are no longer merged into offer-backed lines. Price results are keyed by offer/variant/quantity to support multiple variants under one product-level offer. Unavailable offers are excluded from validation. | Focused resolver, product-card and cart tests committed; latest-head CI pending. | IN PROGRESS — CI PENDING | Verify latest API unit/coverage, integration, web/admin, build and migration jobs; then close G-004 only after latest-head CI passes. |


| 2026-11-19 | G-004 multi-variant and cart-line identity hardening | commits `a2d905d`, `68df198`, `02a3aaa`, `ac94efa`, `92c87fd`, `56aecb1`, `69c692d`, `2e0a401` | Extended exact-offer price results to key by (offerId, variantId, quantity), preventing a product-level offer's price for one variant from overwriting another variant's result during checkout repricing. Search-card enrichment now returns the concrete active variant for product-level offers. Cart line lookup explicitly matches `offer_id IS NULL` for owner-priced items, preventing them from merging into an existing seller-offer line. | Focused unit tests committed; latest-head CI pending. | IN PROGRESS — CI PENDING | Verify latest CI and resolve any test/type errors before closing G-004. |


| 2026-11-19 | G-003, G-004 and G-005 latest-head verification | CI #687 on commit `dc071157992bb9869fcc059d3bc079bd764f8186` | G-003 production-poller integration test passed within API integration CI; generic dispatcher and carrier worker ownership is verified for persisted carrier/non-carrier events, including unsupported-event retry. G-004 exact-offer price resolver (13 tests), product-card (8) and cart (7) focused suites passed API unit/coverage; integration and all other applicable jobs passed. G-005 checkout currency helper passed all 5 focused tests; web/admin tests and lint/typecheck passed. | CI #687 passed every executed job: lint/typecheck, Flutter, API integration, web/admin, boundary lint, unit/coverage (4,419 passed; 110 skipped), migration full apply on isolated CI PostgreSQL, container build/smoke, contract/codegen and build. k6 smoke and staging release were skipped. | CLOSED — CI VERIFIED | Continue Phase 2 with G-006; G-002 remains a pre-production access-model gate. No deployment or live migration. |
