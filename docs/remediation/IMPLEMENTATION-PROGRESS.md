# SCS Platform — Audit-Driven Implementation Progress Tracker

**Living tracker. Update this file as part of every remediation task and phase transition.**
**Created:** 18 November 2026
**Plan:** [Audit-Driven Remediation & Testability Implementation Plan](./IMPLEMENTATION-PLAN.md)
**Baseline audit:** [Comprehensive B2B Platform Readiness Audit](../audits/b2b-platform-readiness/SCS-B2B-PLATFORM-COMPREHENSIVE-READINESS-AUDIT.html)
**Repository:** `nabeel2323/scs-platform`
**Baseline branch/commit:** `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36`
<!-- prettier-ignore -->
**Tracker status:** ACTIVE — Phases 0–5 remain in progress; Phase 6 is not started. PR #138 remains OPEN / DRAFT / UNMERGED to `develop`; latest source/test checkpoint before this tracker synchronization is `b9f9728659e71d3788cc58aa2b5ad9df29ab9731` (FIN-019 settlement-adjustment posting integrity; FIN-DSH-34/35 tests added but not executed). FIN-004–FIN-019 financial safeguards are IMPLEMENTED / TESTING_PENDING. CI #1437 on earlier SHA `9dc7d04469180807e65053fe51819afffb3b78c0` passed lint/typecheck and Flutter but failed changed-file Prettier (259 files); API/PostgreSQL/Web/Admin and dependent jobs skipped. No exact-head Actions verification exists for FIN-019. G-002 remains open: runtime identities, protected read-only catalog audit, exact FK/operation predicates and transaction-bound context proof remain outstanding. No staging deployment, shared database mutation, migration 0070/0071, grant/default-ACL change, RLS enablement or worker activation is authorized or claimed.

---

## 1. Executive progress

<!-- prettier-ignore -->
| Metric                                            | Current                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------: |
| Planned phases                                    | 7 (0–6)                                                               |
| Phases completed                                  | 0                                                                     |
| Phases in progress                                | 6                                                                     |
| Original audit findings                           | 22                                                                    |
| Additional findings discovered during remediation | 14 (G-023–G-036)                                                      |
| Total tracked findings                            | 36                                                                    |
| P0 unresolved                                     | 1 (G-001)                                                             |
| P1 unresolved                                     | 3 (G-002, G-007, G-036)                                                |
| P2 unresolved                                     | 7 (G-010, G-012–G-015, G-018, G-020)                                  |
| P3 unresolved                                     | 2 (G-021, G-022)                                                      |
| Findings closed under this plan                   | 23 (G-003–G-006, G-008–G-009, G-011, G-016–G-017, G-019, G-023–G-035) |
| Findings partially remediated                     | 6 (G-001, G-007, G-010, G-015, G-018, G-020)                          |
| Findings in progress                              | 3 (G-002, G-013, G-036)                                                |
| Findings blocked                                  | 2 (G-014, G-022)                                                      |
| Findings open                                     | 2 (G-012, G-021)                                                      |
| Final full test campaign                          | NOT STARTED                                                           |

**Counting note:** The original audit contains G-001–G-022. G-023–G-036 were added during remediation. The 36-row register includes G-024–G-029, which were previously described in the Phase 1 task table but omitted from the finding register. Exactly 23 findings are closed; six are partial, three are in progress, two are blocked and two remain open. Priority unresolved counts include partial, in-progress and blocked items: P0 = 1 (G-001), P1 = 3 (G-002, G-007, G-036), P2 = 7 (G-010, G-012–G-015, G-018, G-020), P3 = 2 (G-021, G-022).

### Overall status

<badge color="success">IN PROGRESS</badge> Source implementation continues in grouped commits. The latest exact workflow run is CI #1408 on `a76b0bef436af8bde2d9329b1cd6ee5980f593fc`: lint and typecheck passed, Flutter analysis/tests passed, but changed-file Prettier failed on 245 files in the cumulative PR diff. Dependent Web/Admin, API unit/coverage, PostgreSQL integration, migration, E6, build/container, contract and k6 jobs were skipped. UX-098/099 commits use [skip ci] and are not covered by that run. G-001 remains PARTIAL pending independent review; G-002 and G-036 remain IN PROGRESS; G-007's implementation is CI-verified but Phase 6 buyer journey/order-detail UAT remains pending. Phase 6 full test campaign is NOT STARTED. No staging/production deployment or database mutation is claimed.
---

## 2. Phase dashboard

<!-- prettier-ignore -->
| Order | Phase                                                   | Status      | Entry/exit condition                                                                                                                                                                 | Progress |
| ----: | ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: |
| 0     | Baseline reconciliation & testability foundation        | IN PROGRESS | Current baseline, test matrix, staging safety and evidence discrepancies reconciled                                                                                                  | 45%      |
| 1     | Tenant security & database access safety                | IN PROGRESS | P0 tenant boundary, initial store ownership and DB role/grant/RLS design verified; limited staging testing may be authorized                                                         | 25%      |
| 2     | Commercial correctness & checkout contract              | IN PROGRESS | Seller attribution, quantity, currency, payment and tax/fulfillment contracts consistent                                                                                             | 30%      |
| 3     | Event, worker & fulfillment reliability                 | IN PROGRESS | Outbox ownership, carrier label implementation and durable claims are CI-verified; P13 activation and alert sink remain open                                                         | 40%      |
| 4     | Client workflow parity & truthful notifications         | IN PROGRESS | G-009/G-019 are closed; G-007 full journey UAT and remaining merchant/admin workflows remain                                                                                         | 15%      |
| 5     | Operational hardening, CI, data hygiene & documentation | IN PROGRESS | CI gates, repository hygiene and remediation documentation are being hardened; admin protection, legacy boundary debt, live deployment verification and operational decisions remain | 20%      |
| 6     | Consolidated full verification & release decision       | NOT STARTED | One final full test campaign and evidence-based go/no-go decision                                                                                                                    | 0%       |

Status vocabulary: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR VERIFICATION · COMPLETE · COMPLETE WITH APPROVED DEFERRALS.

---

## 3. Finding register

<!-- prettier-ignore -->
| ID    | Priority | Finding                                                                                                                   | Planned phase | Status                                                            | Evidence / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | -------: | ------------------------------------------------------------------------------------------------------------------------- | ------------: | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 | P0       | Merchant offer list/analytics, detail, proposal and pricing mutations require complete tenant and role authorization | 1 | PARTIAL — IMPLEMENTED; INDEPENDENT REVIEW PENDING | Buyer product-offer endpoints return only ACTIVE, available offers through an explicit public-field allowlist; ranked results omit internal price-list references. Merchant list/analytics/trend reads require owning organization and active store membership; platform-privileged reads require `catalog:offers:govern`. Offer detail uses a scope-first service boundary and normalizes foreign/non-member identifiers to the same not-found class. Merchant create/propose/pricing-update/withdraw paths enforce merchant role, organization ownership and active membership; actor attribution comes from the authenticated caller. Create/update validate price-list and warehouse ownership against the offer store. Controller, service and disposable-PostgreSQL tests cover supported merchant roles, buyer denial from merchant surfaces, foreign merchant/non-member confidentiality, missing active organization, revoked membership, DRAFT-store buyer exclusion, governance permission gates and same-store references. Exact-head CI #1280 passed all 10 executable jobs on source SHA `ffd3961c32164c2af00090b32dbafb06b997a581`, including API unit/coverage and PostgreSQL integration. The INACTIVE-store regression excludes the store from buyer list and ranked results while preserving the other ACTIVE store; fixture restoration is in `finally`. G-001 remains PARTIAL solely pending independent security review and reviewer-directed remediation, if any. See `G-001-INDEPENDENT-SECURITY-REVIEW-PACKET.md`. |
| G-002 | P1       | RLS disabled / excessive anon-auth grants; access model needs reconciliation                                              | 1             | IN PROGRESS                                                       | Live 19-Nov read-only recheck: 114 public tables, RLS enabled/forced on 0; anon/authenticated/service_role have 0 SELECT/INSERT/UPDATE/DELETE but TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. No direct table grants to PUBLIC were found. `postgres` default ACL repeats non-DML grants; `supabase_admin` default ACL is broader and must not be changed without owner review. Security Advisor flags all 114 RLS-disabled; its blanket read/write description is not supported by effective DML grants. API/migration roles remain unverified. See [DB-ACCESS-VERIFICATION-2026-11-19.md](./DB-ACCESS-VERIFICATION-2026-11-19.md), including the 21-November Render runtime follow-up. PR #142 adds a non-secret identity diagnostic through the actual API pool and has passing CI, but remains open/draft and has not been deployed; API and migration identities therefore remain unverified.                                                             |
| G-003 | P1       | Generic outbox dispatcher competes with carrier worker                                                                    | 3             | CLOSED — CI #687                                                  | Generic dispatcher excludes `shipping.carrier.%`; dedicated worker claims only carrier events using `FOR UPDATE SKIP LOCKED`; stale lease recovery is carrier-prefix scoped; unsupported carrier event types enter retry/dead-letter handling. PostgreSQL Testcontainers integration coverage invokes the real OutboxDispatcher.poll() and ShippingCarrierWorker.poll() against persisted carrier/non-carrier events and verifies exclusive ownership plus retry behavior. API integration and unit/coverage jobs passed CI #687. Worker topology is source-documented; P13 activation/alerting and G-010 label generation remain separate work.                                                      |
| G-004 | P1       | Search result seller/offer differs from cart attribution                                                                  | 2             | CLOSED — CI #687                                                  | Search cards resolve the exact selected offer's active price-list tier at its MOQ (or explicit base price where no list is linked), return concrete variant and offer identity, and cart add/batch/update plus checkout repricing preserve that offer. Owner-priced cart lines remain separate from offer-backed lines; selected prices are keyed by offer + variant + quantity. Resolver (13 tests), product-card (8 tests) and cart (7 tests) suites passed API unit/coverage CI #687; integration, web/admin, lint/typecheck and build jobs also passed.                                                                                                                                           |
| G-005 | P1       | Mixed-currency checkout total incorrectly aggregates/formats                                                              | 2             | CLOSED — CI #687                                                  | Checkout now groups item and selected shipping amounts by their own normalized currency; pickup adds no fee; missing currencies mark the estimate incomplete; no SAR fallback or cross-currency grand total is shown. A single-currency total is shown only when complete. Five focused currency tests and the web/admin test job passed CI #687.                                                                                                                                                                                                                                                                                                                                                     |
| G-006 | P1       | Offer orderIncrement not enforced                                                                                         | 2             | CLOSED — CI #718                                                  | MOQ-relative formula is enforced across cart/pricing/checkout; checkout locks and re-reads authoritative offer terms. Changed-offer-term revalidation and the real PostgreSQL two-session seller-edit/buyer-checkout contention test passed in the CI #718 integration suite. Cleanup restores original MOQ/orderIncrement, fixing the CI #717 fixture leak.                                                                                                                                                                                                                                                                                                                                          |
| G-007 | P1       | Mobile checkout omits per-store shipping/payment; VAT disclosure conflicts                                                | 2, 4          | IMPLEMENTED — CI #711; UAT PENDING                                | Per-store mobile shipping/pickup and payment selections; server checkout preview uses authoritative promotion/shipping/VAT calculation; web/mobile review and confirmation aligned. CI #711 passed all executed jobs. Full buyer journey and order detail/tracking UAT remain in Phase 6.                                                                                                                                                                                                                                                                                                                                                                                                             |
| G-008 | P1       | API accepts DIGITAL without a registered digital provider                                                                 | 2             | CLOSED — CI #714                                                  | Persisted vocabulary retains DIGITAL only for historical rows; SUPPORTED_PAYMENT_METHODS reflects the registered manual-verification provider. Checkout rejects unsupported methods before opening the order transaction; PaymentsService repeats the guard before provider resolution/payment writes. Web disables DIGITAL and mobile omits it. Unit tests prove legacy retention, whitelist contents, supported-method acceptance, checkout pre-transaction rejection and payment-service no-side-effect rejection.                                                                                                                                                                                 |
| G-009 | P2       | SMS/FCM/WhatsApp stubs report SENT                                                                                        | 4             | CLOSED — CI #738                                                  | General notification SMS, FCM and WhatsApp stubs now persist NOT_CONFIGURED with stable reason codes; fake provider IDs and SENT timestamps were removed. IN_APP remains persisted and its SENT status is explicitly documented as in-app persistence, not external device delivery. Four regression tests cover SMS, push with/without active tokens, and WhatsApp. Provider sandbox delivery remains outside this finding and requires a real approved provider adapter.                                                                                                                                                                                                                            |
| G-010 | P2       | Carrier label worker handler is no-op                                                                                     | 3             | IMPLEMENTED — CI #832/#843; ARAMEX SANDBOX DEFERRED               | Authenticated POST /v1/shipments/:id/labels queues a label event after tenant authorization, carrier shipment validation, and shipment-row lock/duplicate checks. Worker invokes the provider, validates the label URL with carrier SSRF allowlist, rejects redirects, bounds the full download, verifies PDF type/signature/10 MiB limit, stores the PDF in private S3 using event UUID idempotency, and persists shipment_labels. Label reads return short-lived presigned URLs. Expanded timeout/retry regression tests passed in CI #832; API unit/coverage, integration, build and container smoke passed in CI #843. Real Aramex sandbox remains unverified; no live carrier calls.             |
| G-011 | P2       | AutoCompleteWorker claim is not durable                                                                                   | 3             | CLOSED — CI VERIFIED                                              | Migration 0071 adds persisted five-minute claim leases; worker claims one order at a time with SKIP LOCKED, reclaims expired leases, conditionally releases only its own claim, and OrdersService fences the completion status update by current owner + unexpired lease. Unit and PostgreSQL two-worker/lease-recovery/buyer-confirmation race tests passed in CI #647; migration 0071 full apply also passed in isolated CI PostgreSQL.                                                                                                                                                                                                                                                             |
| G-012 | P2       | Manual payments only; no automatic gateway/payout                                                                         | 5 (decision)  | OPEN                                                              | Product scope decision; do not silently expand scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G-013 | P2       | Foreign-key constraints lack covering indexes                                                                             | 5             | IN PROGRESS — WORKLOAD REVIEW COMPLETE; NO DDL JUSTIFIED          | Fresh read-only leading-column inventory identifies 71 candidates versus the earlier advisor count of 55. Only four tables have non-zero estimated rows (sessions 19, device_credentials 6, role_permissions 4, organization_members 3); all are small. Other candidates, including orders, shipments and merchant_offers, currently show zero estimated live rows despite cumulative scan counters. pg_stat_statements lacks representative high-volume business workload evidence. No index DDL is justified; see FOREIGN-KEY-INDEX-REVIEW-2026-11-19.md.                                                                                                                                           |
| G-014 | P2       | develop branch unprotected                                                                                                | 5             | BLOCKED — REPOSITORY ADMIN ACTION REQUIRED                        | GitHub rulesets collection is empty; classic branch-protection read is denied to the current GitHub connection. No settings changed. A repository administrator must enable PR-required checks for develop/release branches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G-015 | P2       | Formatting/boundary lint non-blocking or miswired                                                                         | 5             | PARTIAL — BLOCKING REGRESSION GATES; 193 LEGACY VIOLATIONS REMAIN | E6 checker now executes correctly. Three PR-introduced cross-module imports were moved behind orders/payments/catalog public APIs. A reviewed 193-entry legacy baseline blocks new violations; repository format:check is also configured as blocking. CI verification of the newly blocking workflow is pending. Full modular isolation remains unfinished.                                                                                                                                                                                                                                                                                                                                          |
| G-016 | P2       | Large tracked .m73b6-scratch tree                                                                                         | 5             | CLOSED IN HEAD — HISTORY RETAINS SNAPSHOT                         | Removed 1,277 tracked scratch files (about 37.9 MB), including the 19.1 MB P4.18 archive and duplicate project context. No runtime/build references were found. Targeted visible-text scan found only local CI PostgreSQL URLs and an expired test JWT; no private-key, AWS-key or GitHub-token patterns. Binary archive bytes were not independently extracted by the GitHub connector; prior Git history still retains the old tree.                                                                                                                                                                                                                                                                |
| G-017 | P2       | JWT-shaped test artifact committed twice                                                                                  | 5             | CLOSED IN HEAD — EXPIRED ARTIFACT REMOVED                         | Root test-token.txt and its duplicate in the scratch context were removed. The token was an expired short-lived HS256 test token; no signing key or environment secret was embedded in the token file. No current code reference was found. No JWT secret rotation is indicated by the evidence; historical Git objects retain the expired token.                                                                                                                                                                                                                                                                                                                                                     |
| G-018 | P2       | Mixed-age architecture/readiness documentation                                                                            | 5             | PARTIAL — CURRENT REMEDIATION DOCS ADDED                          | Added test campaign manifest, synthetic identity matrix, deployment/migration runbook, secret-artifact review and boundary-lint baseline. Historical architecture/readiness guides and all user/admin help pages still need reconciliation.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| G-019 | P2       | Mobile cannot remove applied promotion                                                                                    | 4             | CLOSED — CI #738                                                  | Added authenticated DELETE /v1/cart/promo; CartService clears promoCode and promotionId on the buyer's active cart and returns refreshed state. Flutter ApiService and cart UI expose a busy-safe Remove action with error feedback. Backend and mobile API regression tests added.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G-020 | P2       | normalize_arabic has mutable search_path                                                                                  | 1             | PARTIAL — CI VERIFIED; LIVE MIGRATION NOT APPLIED                 | Migration 0070 pins `normalize_arabic` to `pg_catalog`; full migration apply and search_path assertion passed in CI #536. Live inspection confirms `proconfig` is still null because migration 0070 is not applied. Function is not SECURITY DEFINER and its body uses pg_catalog built-ins only.                                                                                                                                                                                                                                                                                                                                                                                                     |
| G-021 | P3       | Formal RFQ/quotation/PO workflow absent                                                                                   | 5 (decision)  | OPEN                                                              | Decide whether in launch scope; separate project if required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G-022 | P3       | pg_trgm extension installed in public schema                                                                              | 5             | BLOCKED — EXTENSION OWNER IS SUPABASE_ADMIN                       | pg_trgm is relocatable and the extensions schema exists, but the extension owner is supabase_admin (superuser). The connected postgres role is not superuser, is not a member of supabase_admin and cannot SET ROLE. Five user GIN indexes depend on gin_trgm_ops; catalog search calls similarity() unqualified. API/migration role is still unverified. No extension DDL or ownership change is safe through the current connection. See PG-TRGM-RELOCATION-REVIEW-2026-11-19.md.                                                                                                                                                                                                                   |
| G-023 | P1       | Store creation omits initial OWNER store_members row; membership management is deadlocked until platform admin intervenes | 1             | VERIFIED IN CI                                                    | Store + ACTIVE OWNER membership + creation outbox event are inserted in one transaction; service regression suite passed in CI run #536                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G-024 | P1       | Merchant catalog request reads/writes lack consistent active-store authorization and trusted actor identity               | 1             | CLOSED — CI #551                                                  | Active organization and store membership are enforced; requester/reviewer identity is derived from JWT. Controller security suite passed 7/7 tests in CI #551.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G-025 | P1       | Store and warehouse lifecycle routes lack consistent target-store membership checks                                       | 1             | CLOSED — CI #551                                                  | Store update, warehouse create/list/update and verification submission enforce target store membership. Controller security suite passed 7/7 tests in CI #551.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G-026 | P1       | Pricing routes lack store ownership and variant/price-list consistency checks                                             | 1             | CLOSED — CI #551                                                  | Price-list/tier reads and writes enforce owning-store membership; variants must belong to the same store as their price list. Controller security suite passed 9/9 tests in CI #551.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G-027 | P1       | Inventory reads/writes do not consistently enforce active store membership                                                | 1             | CLOSED — CI #554                                                  | Inventory HTTP routes enforce active membership; low-stock reads are limited to active memberships in activeOrg; variant/warehouse store mismatch is rejected. Fourteen focused tests and all CI #554 jobs passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| G-028 | P1       | Buyer/merchant product reads do not consistently enforce publication and ownership boundaries                             | 1             | CLOSED — CI #647                                                  | ACTIVE products are buyer-visible; non-ACTIVE detail/variant/matrix/media reads require owning-store membership or platform privilege. Store grids, canonical categories/counts and canonical lookups enforce publication scope. Nineteen focused tests and applicable API suites passed CI #647.                                                                                                                                                                                                                                                                                                                                                                                                     |
| G-029 | P1       | Bulk catalog mutations do not consistently require active store membership                                                | 1             | CLOSED — CI #592                                                  | Bulk delete/archive/draft requires active organization ownership and active store membership before mutation. Three focused controller tests passed API unit/coverage CI #592.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G-030 | P0       | Merchant payment/settlement listings lack authenticated tenant scope                                                      | 1             | CLOSED — CI #832/#843                                             | Merchant routes pass JWT caller context to dedicated listing methods. Payment and settlement queries scope to the authenticated active organization; explicit store IDs must belong to that organization. Merchant read permission is organization-wide, so store_members is not required. Admin store/buyer payment filters apply matching order IDs. Same-org staff without store membership and foreign-org denial are covered by PostgreSQL integration tests; controller context forwarding is covered by unit tests. API unit/coverage and PostgreSQL integration passed current-head CI #832/#843.                                                                                             |
| G-031 | P1       | Product moderation mutation uses merchant read permission instead of a dedicated moderation grant                         | 1, 4          | CLOSED — CI #936                                                  | `PATCH /v1/admin/products/:id/moderate` and the Admin UI previously treated `admin:merchants:read` as sufficient to approve/reject/archive products. Added `admin:products:moderate`, assigned it to SUPER_ADMIN/ADMIN/MODERATOR in canonical idempotent RBAC seed data, changed the API route and UI actions to require it, and added API guard/seed-matrix and Admin UI permission tests. Existing read-only custom roles now fail closed. Controlled release must run `db:seed`; existing JWT permission snapshots need refresh.                                                                                                                                                                   |
| G-032 | P2       | Admin dispute detail page checks an unseeded permission and blocks all authorized dispute reviewers                       | 4             | CLOSED — CI #936                                                  | The dispute detail page required admin:disputes:read, which is absent from canonical RBAC seed data. The list page and GET /v1/admin/disputes/:id API require support:disputes:resolve. Aligned the detail page to support:disputes:resolve and added Admin UI regression coverage proving a seeded dispute reviewer can load the detail route. No API authorization change was needed.                                                                                                                                                                                                                                                                                                               |
| G-033 | P2       | Attribute detail page checks category-write permission instead of attribute-management permission                         | 4             | CLOSED — CI #936                                                  | The Admin attribute list requires catalog:attributes:manage, but the detail page incorrectly checked catalog:categories:write, denying seeded attribute managers (including ADMIN) access to detail. Aligned the detail page with catalog:attributes:manage and added regression coverage that loads the detail route with the canonical permission. No API authorization or database change was required.                                                                                                                                                                                                                                                                                            |
| G-034 | P2       | Financial Admin pages expose workflow actions without enforcing operation-specific permissions                            | 4             | CLOSED — CI #936                                                  | Payments page now separates admin:payments:read from admin:payments:verify, defaults read-only users to All Payments and hides the verification queue/actions. Settlements requires admin:settlements:read and hides Mark Paid without admin:settlements:write. Reconciliation requires read permission and hides Run/Resolve without admin:reconciliation:write. Settlement adjustments requires read permission and separately gates Submit (admin:adjustments:write) and Approve/Post (admin:adjustments:approve). Added read-only UI regression coverage for all four pages. Backend permission guards were already in place; no API or database authorization changes were required.             |
| G-035 | P2       | Merchant delivery pages expose shipment operations and return actions without checking operation-specific permissions     | 4             | CLOSED — CI #936                                                  | Merchant delivery list/detail now require fulfillment:shipments:read before loading. Carrier creation, cancellation, retry, exception and RTS operations require fulfillment:shipments:write; label details require fulfillment:labels:read; physical inventory return requires fulfillment:shipments:return. Added defensive action-handler checks and regression tests for read-only and missing-read merchants. Backend endpoint guards already enforced these grants; no API authorization or database change was required.                                                                                                                                                                       |
| G-036 | P1       | Realtime store/order room joins are not authorized by tenant ownership, buyer ownership, driver assignment or read permission | 1 | IN PROGRESS — SOURCE IMPLEMENTED / TESTING_PENDING | The gateway now stores JWT role/active-org/permission claims and authorizes each room: own-user only; store rooms require merchant:orders:read plus active organization ownership and active store membership (platform staff require orders:read); order rooms require buyer ownership, merchant store membership, assigned-driver shipment or platform orders:read as appropriate. UUIDs and all lookup failures fail closed. Web merchant realtime subscribes only with merchant:orders:read. Focused gateway tests cover foreign organization/member denial, missing permission, buyer/master-order ownership, driver assignment and platform access. Tests have not been executed; exact-head CI and independent review remain pending. No shared database or staging changes. |

Status definitions:

- **OPEN:** finding not yet implemented/closed.
- **IN PROGRESS:** implementation task actively underway.
- **PARTIAL:** some but not all acceptance criteria met.
- **READY FOR VERIFICATION:** implementation complete; evidence still needs independent review.
- **CLOSED:** all Definition of Done conditions and acceptance criteria satisfied with evidence.
- **DEFERRED:** explicitly excluded from current release by documented decision, risk and owner; not equivalent to fixed.

---

## 3A. CI and pull-request coordination checkpoint — 20 November 2026

This checkpoint records the latest inspected pull-request CI, not a release decision. All listed PRs remain draft/unmerged unless explicitly changed through normal review.

<!-- prettier-ignore -->
| PR   | Finding / scope                                   | Latest inspected CI                   | Result                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---: | ------------------------------------------------- | ------------------------------------: | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #138 | Main Phase 0–1 remediation                        | `44761880315` on code head `1cde0f34` | PASS, 10 executable jobs           | All executable CI jobs passed: API unit/coverage (4,499 passed, 110 skipped across 237 files), PostgreSQL integration (12 passed, 0 failed, 0 skipped), lint/typecheck/format, Flutter, Web/Admin, E6 boundary lint, isolated full migration apply, contract/codegen, build and container smoke. k6 and staging release were skipped. Documentation-only evidence refresh at head `4d183dce` has CI run `44781587860` queued. Vercel web/admin statuses remain provider build-rate-limit failures, separate from GitHub CI. |
| #142 | Runtime DB identity diagnostics                   | #990 / run `44656130587`              | PASS, 10 executable jobs           | The non-secret API-pool identity diagnostic has now been ported into PR #138's branch. Keep #142 draft as supporting CI evidence; the combined branch needs exact-head CI. A separate staging release approval is still required before observing the actual deployed runtime role.                                                                                                                                                                                                                                         |
| #143 | Alternate documentation reconciliation            | #991 / run `44659481564`              | PASS                               | Based on develop and substantially shorter than the detailed #138 tracker. Use as reconciliation evidence, not as a replacement for the detailed implementation history.                                                                                                                                                                                                                                                                                                                                                    |
| #144 | G-001 merchant offer authorization                | #1011 / run `44708168461`             | PASS, 10 executable jobs           | Draft implementation PR; compare against #138 before merging to avoid duplicate implementation.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| #145 | G-020 normalize_arabic search_path                | #1012 / run `44708242986`             | PASS, 10 executable jobs           | Does not authorize applying migration 0070 to the shared database.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| #146 | G-009 notification truthfulness (earlier attempt) | #1013 / run `44708460818`             | FAIL                               | API unit tests failed because the new push test mock did not provide the database query chain expected by the service. Superseded in intent by PR #150; do not merge both.                                                                                                                                                                                                                                                                                                                                                  |
| #147 | G-003 carrier outbox ownership                    | #1014 failed; #1024 in progress       | 9/10 executable jobs passed so far | TS4111 test-mock correction is in commit `590ac892`. Lint/typecheck, Flutter, web/admin, migration full apply, E6, API unit/coverage (4,328 passed / 110 skipped), PostgreSQL integration, Build and Contract/Codegen have passed; only Container Build/Smoke remains in progress. k6 was skipped; staging release remains skipped by workflow conditions. The same carrier exclusion is already present on PR #138's branch (CI #687); do not merge duplicate implementations independently.                               |
| #148 | G-008 reject unsupported DIGITAL payment          | #1015 / run `44708682886`             | PASS, 10 executable jobs           | Weaker/overlapping DIGITAL-only guard; PR #138 already has the broader supported-method allowlist and pre-provider rejection. Do not merge independently.                                                                                                                                                                                                                                                                                                                                                                   |
| #149 | G-005 multi-currency checkout display             | #1016 / run `44708820666`             | PASS, 10 executable jobs           | UI-only currency buckets are superseded by PR #138's server-authoritative checkout preview, per-supplier totals and VAT disclosure. Do not replace the more complete checkout surface.                                                                                                                                                                                                                                                                                                                                      |
| #150 | G-009 truthful notification delivery              | #1023 / run `44715420748`             | PASS, 10 executable jobs           | Supersedes failed #146, but status semantics differ from PR #138 (FAILED vs NOT_CONFIGURED). Reconcile the canonical delivery-state contract before integration; external provider delivery remains unimplemented.                                                                                                                                                                                                                                                                                                          |
| #151 | Country and currency selectors                    | #1022 / run `44715048598`             | PASS, 10 executable jobs           | Draft UX/reference-data change; k6 and staging release were skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**CI interpretation:** The ten executable jobs are lint/typecheck, Flutter analysis/tests, migration full apply in isolated CI PostgreSQL, web/admin tests, API unit/coverage, API integration, E6 boundary lint, container build/smoke, contract/codegen and build. k6 smoke and staging release were skipped on these runs. Green CI is not staging runtime verification, business UAT or release authorization.

**Coordination rules:**

- Keep PR #138 draft and do not deploy it. Its current head needs a fresh CI run after the documentation commits.
- PRs #144–#150 overlap code already present on the remediation branch. Review exact file diffs and choose one authoritative landing path per finding; do not merge competing copies without checking whether the target branch already contains the change.
- PR #150 is the preferred current G-009 candidate over failed PR #146, subject to independent review.
- PR #147 is being revalidated after a test-only type correction; its carrier exclusion duplicates behavior already present on PR #138.
- No merge, staging release, shared-database mutation, worker activation or external provider side effect is authorized by this checkpoint.

---

## 4. Phase 0 — Baseline reconciliation & testability foundation

**Status:** IN PROGRESS
**Phase owner:** Remediation lead / repository maintainer
**Entry commit:** `develop` / `3f7268dbc75828190f16165ca7e8dd4e315c421c`
**Working branch:** `remediation/phase-0-1-tenant-security`

| Task  | Description                                                              | Status                                                                  | Evidence / result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | Record current branch HEAD and compare with audit baseline               | COMPLETE                                                                | `develop` HEAD `3f7268dbc75828190f16165ca7e8dd4e315c421c`; 7 commits ahead / 0 behind audit SHA; diff contains docs only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P0-02 | Revalidate all 22 findings against current source                        | IN PROGRESS                                                             | G-001, G-002, G-020, G-022 revalidated; remaining findings pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P0-03 | Identify fixes already present after audit commit                        | COMPLETE                                                                | Comparison recorded in P0-01: develop was 7 commits ahead / 0 behind the audit SHA and the diff contained documentation only; no unrecorded code remediation was credited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P0-04 | Inventory API/web/admin/mobile/DB test commands and prerequisites        | COMPLETE                                                                | Repository, API, web/admin, Flutter, contract, container, Playwright, k6 and migration commands/prerequisites recorded in [TEST-CAMPAIGN-MANIFEST.md](./TEST-CAMPAIGN-MANIFEST.md). Provider sandbox and isolated-target requirements are explicit.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P0-05 | Define synthetic buyer/merchant/admin test identities and fixtures       | VERIFIED — CI #762                                                      | `seedTwoTenantIdentityFixture` creates two organizations, two buyers, two active stores and owner memberships atomically with fresh synthetic identities. Adopted by P311 financial tenant isolation, P4 HTTP authorization and Phase 1 marketplace integration suites. CI #762 passed API unit/coverage and PostgreSQL integration suites on current head `f8a765d0a70a9f110b7a5408d869a1424d8382b1`.                                                                                                                                                                                                                                                                    |
| P0-06 | Define final full test campaign command manifest                         | COMPLETE — MANIFEST DEFINED                                             | Phase 6 order, exact commands, CI behavior, external prerequisites and safety restrictions recorded in [TEST-CAMPAIGN-MANIFEST.md](./TEST-CAMPAIGN-MANIFEST.md). Final target-specific command freeze remains a Phase 6 entry condition.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P0-07 | Document Render manual-deploy and disabled auto-deploy behavior          | COMPLETE — SOURCE AND LIVE SETTINGS VERIFIED                            | Current Render service `scs-api-staging` tracks `develop`, auto-deploy is disabled, one instance is configured, and the health check is `/v1/readyz`. The controlled release workflow deploys an exact commit SHA after database checks. See [STAGING-RUNTIME-TOPOLOGY-2026-11-19.md](./STAGING-RUNTIME-TOPOLOGY-2026-11-19.md) and the deployment runbook.                                                                                                                                                                                                                                                                                                               |
| P0-08 | Review startup migration/seed and safe deploy/forward-fix procedure      | COMPLETE — SOURCE AND LIVE START COMMAND VERIFIED                       | Render start command is `pnpm --filter @scs/api start:prod` and does not run migrations or seeds. The release workflow separately runs `db:migrate`, the idempotent RBAC seed, migration-ledger verification and exact-SHA deployment. Migration runner uses advisory lock and per-file transaction+ledger insert. No live migration or seed executed.                                                                                                                                                                                                                                                                                                                    |
| P0-09 | Reconcile database table counts, grants, RLS, roles and migration ledger | IN PROGRESS                                                             | 19-Nov live recheck: 114 public tables; RLS enabled/forced 0; anon/authenticated/service_role have no DML on these tables but each has TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114; no direct table grants to PUBLIC; schema USAGE true/CREATE false for client roles; custom `_migration_log` has 69 rows through 0069. `postgres` and `supabase_admin` default ACLs differ; `pg_trgm` is owned by `supabase_admin`; see DB access verification and pg_trgm reports. API/migration role identity and table classification remain open.                                                                                                                               |
| P0-10 | Trace OTP logging and exception paths; preserve redaction tests          | PARTIAL — SOURCE REDACTION VERIFIED; RUNTIME VERSION PENDING            | Current branch source review covers IdentityService, OtpDeliveryService and Resend/SMTP/Twilio/WhatsApp providers: OTP values are not logged, recipients are masked, and raw provider exception/response bodies are not emitted. Existing `otp-redaction.spec.ts`, `otp-security-remediation.spec.ts` and `otp-delivery-providers.spec.ts` cover redaction. Prior Render log sampling did not reproduce the earlier six-digit entry; fresh post-fix runtime logs and deployed commit verification remain pending because staging auto-deploy is disabled. No live OTP was sent. See `OTP-LOGGING-REVIEW-2026-11-19.md`.                                                   |
| P0-11 | Document worker registration/flags/leases and protected-job safety       | COMPLETE — SOURCE AND LIVE TOPOLOGY DOCUMENTED; ACTIVATION NOT INCLUDED | Read-only Render evidence confirms one `scs-api-staging` web service, one configured instance, no separate worker service, OutboxDispatcher (1s), ShippingCarrierWorker (5s), AutoCompleteWorker (60s), P13Monitor (60s, log-only), and ReturnExpirationWorker disabled because `P13_WORKER_ENABLED` is unset. Source review confirms carrier/auto-complete atomic claims and P13 lease/fence/pause checks. The P13 return worker only escalates overdue requests to admin review; it does not approve, reject, refund or terminally expire them. No worker flags, alert sink, service settings or deployment were changed. See `STAGING-RUNTIME-TOPOLOGY-2026-11-19.md`. |
| P0-12 | Backup/restore exercise                                                  | DEFERRED — USER DIRECTION                                               | Not a prerequisite for this development remediation cycle; revisit only if required by the pre-production operational-readiness decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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

| Task  | Description                                                                                                                       | Finding             | Status                                                                                  | Evidence / result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | Reproduce merchant offer list/analytics scope defect                                                                              | G-001               | SOURCE VERIFIED                                                                         | Controller routes pass caller-supplied storeId directly to offer service without caller scope; source at audit baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P1-02 | Enforce authenticated store/org membership for offer list                                                                         | G-001               | VERIFIED IN CI                                                                          | `assertStoreInOrg` + `assertStoreMember`; API unit/coverage suite passed in CI run #536                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P1-03 | Enforce scope for analytics and trend routes                                                                                      | G-001               | VERIFIED IN CI                                                                          | Shared access assertion protects analytics and trend routes; API unit/coverage suite passed in CI run #536                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1-04 | Audit adjacent storeId/orgId object-read endpoints                                                                                | G-001 + G-024–G-029 | CLOSED FOR G-024–G-029; G-001 FOLLOW-UP TRACKED IN P1-21                                | G-024–G-026 passed focused controller suites in CI #551; G-027 passed all jobs in CI #554; G-028's 19 focused publication-boundary tests and applicable API suites passed CI #647; G-029's three bulk mutation tests passed CI #592. G-001's additional offer detail/mutation/actor-attribution hardening is tracked separately in P1-21 and remains PARTIAL pending review/integration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P1-05 | Add owner/staff/buyer/foreign merchant/admin authorization matrix tests                                                           | G-001               | PARTIAL — ORIGINAL MATRIX CI #536; EXTENDED REVIEW PENDING                              | Original list/analytics/trend authorization tests passed CI #536. PR #144 adds same-organization non-member denial, offer-detail authorization and authenticated actor-attribution tests; all ten executable jobs passed CI #1011, but the PR remains draft and G-001 is not yet independently reviewed/integrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P1-06 | Identify API runtime DB role and all database access paths                                                                        | G-002               | SOURCE IMPLEMENTED — MIGRATION DIAGNOSTIC ADDED; FULL CI PENDING; LIVE ROLES UNVERIFIED | API startup queries its actual `pg.Pool`; the migration runner separately queries the exact `PoolClient` it uses. Both diagnostics report session/effective role, database name, superuser/BYPASSRLS/CREATEROLE/CREATEDB flags and TLS without printing DSNs, hosts or raw errors. API diagnostic source passed CI #1156. Migration diagnostic passed lint/typecheck and isolated full migration apply in CI #1161; its first integration test failed only because it assumed the disposable role was `postgres` rather than CI's `test`. The assertion is now role-agnostic, and CI #1164 passed all executable jobs on the formatted preceding commit. CI #1169 passed lint/typecheck and mobile but failed Prettier on two changed files; the formatter corrected them. CI #1171 on the bot cleanup commit had `action_required` with no jobs and is not validation. The app-authored formatted head still requires full exact-head CI. Neither live API nor migration identity is verified until an explicitly approved protected staging run. No Render setting, secret, deployment, migration, seed or DB permission was changed. |
| P1-07 | Reconcile table count and classify all tables by access boundary                                                                  | G-002               | PARTIAL — 114 LIVE RELATIONS RECONCILED AGAINST 99 DRIZZLE TABLES                       | The 19-Nov read-only catalog inventory covers all 114 public relations. A 21-Nov source reconciliation inspected all 25 API `*.schema.ts` files and matched 99 distinct Drizzle `pgTable` declarations; the 15 non-modelled relations are `_migration_log`, `backfill_errors`, and 13 physical analytics partitions. See [G-002 schema coverage reconciliation](./G-002-SCHEMA-COVERAGE-RECONCILIATION-2026-11-21.md). This is schema coverage evidence, not a row-policy matrix: exact owner paths, operations and predicates for all 114 relations remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P1-08 | Audit grants, default privileges, sequences, functions and schemas                                                                | G-002               | PARTIAL — TABLE GRANTS/MEMBERSHIP RECHECKED                                             | Read-only live queries confirm anon/authenticated/service_role have no SELECT/INSERT/UPDATE/DELETE on the 114 public tables; all three retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. No direct table grants to PUBLIC and no PUBLIC default-ACL grants were found. Public sequence privileges: anon/authenticated/authenticator/service_role have 0; postgres has USAGE/SELECT/UPDATE on 1. 32 public functions are executable by PUBLIC (31 also by anon/authenticated); none inspected are SECURITY DEFINER. `normalize_arabic` has no live pinned search_path because 0070 is not applied; its body uses pg_catalog built-ins only. `pg_trgm` is owned by supabase_admin and five GIN indexes use gin_trgm_ops. postgres default ACL repeats the four table privileges; separate supabase_admin defaults include broader grants and require owner review. Role snapshot: postgres LOGIN+BYPASSRLS; service_role NOLOGIN+BYPASSRLS; authenticator LOGIN without BYPASSRLS. Schema/function/default-ACL matrix remains in progress                                                                                           |
| P1-09 | Design least-privilege and table-specific RLS policies                                                                            | G-002               | BLOCKED — ROLE AND CONTEXT GATE                                                         | Must verify API/migration identities and prove safe transaction-local tenant context across pooled API queries and background workers before policy design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1-10 | Implement reviewed privilege/RLS migration if required                                                                            | G-002               | PARTIAL — CI VERIFIED / NOT DEPLOYED                                                    | Migration 0070 revokes all table/sequence privileges from anon/authenticated and the executing migration role's defaults; full apply + grant assertions passed in CI #536. Live _migration_log ends at 0069 (2026-11-17) and live grants still include the legacy four privileges on all 114 tables; migration 0070 is not applied to the connected Supabase project. Supabase table inventory/advisory flags all 114 public tables as RLS-disabled (critical). Direct privilege checks show anon/authenticated currently lack CRUD on app tables, so the advisory's blanket 'read or modify every row' statement is not supported by current table grants; the absence of RLS remains a serious defense-in-depth and future-grant risk. RLS remains gated on API/migration runtime role confirmation                                                                                                                                                                                                                                                                                                                                   |
| P1-11 | Add DB/client access negative tests and API tenant tests                                                                          | G-002               | TODO                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P1-12 | Harden normalize_arabic search_path safely                                                                                        | G-020               | PARTIAL — CI VERIFIED; LIVE NOT APPLIED                                                 | Migration 0070 sets function search_path to `pg_catalog`; assertion passed in CI #536. Live function `proconfig` remains null until the controlled release applies 0070.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P1-13 | Verify OTP redaction across success/failure/exception paths                                                                       | Security safeguard  | PARTIAL — REGRESSION COVERAGE ADDED; CI PENDING                                         | Added tests for provider exceptions containing synthetic OTP/recipient data and network-error paths in Twilio/WhatsApp; Pino redaction now covers OTP, code, password and token request-body fields. Runtime log sample did not reproduce the earlier leak. CI and controlled staging verification remain pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P1-14 | Create initial ACTIVE OWNER membership atomically with new store and outbox event                                                 | G-023               | VERIFIED IN CI                                                                          | Store + `storeMembers` OWNER + outbox event inserted in one transaction; focused service regression tests passed in CI run #536                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P1-15 | Enforce store membership and authenticated actor identity on merchant catalog requests                                            | G-024               | VERIFIED IN UNIT/COVERAGE CI                                                            | Controller security suite passed 7/7 tests in CI #551; active org + store membership enforced; requestedBy and reviewer identity derive from JWT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P1-16 | Enforce store membership on store and warehouse lifecycle routes                                                                  | G-025               | VERIFIED IN UNIT/COVERAGE CI                                                            | Controller security suite passed 7/7 tests in CI #551; store update, warehouse create/list/update and verification submission check target store membership                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P1-17 | Enforce store ownership and variant/list consistency on pricing routes                                                            | G-026               | VERIFIED IN UNIT/COVERAGE CI                                                            | Controller security suite passed 9/9 tests in CI #551; price-list/tier reads and writes check owning store membership; variant must belong to the same store as its price list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1-18 | Enforce store membership throughout inventory read/write paths                                                                    | G-027               | VERIFIED IN CI — CLOSED                                                                 | Added fail-closed warehouse, variant and inventory-item membership helpers; wired every inventory HTTP route through service authorization; low-stock listing now limits to active memberships in activeOrg; inventory creation rejects variant/warehouse store mismatch; 14 focused tests passed in CI #554 and all workflow jobs passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P1-19 | Enforce buyer/merchant publication boundary for product detail, variants, media, store grids, category reads and canonical lookup | G-028               | COMPLETE — CI #647                                                                      | ACTIVE products are buyer-visible; non-ACTIVE detail/variant/matrix/media reads require owning-store active membership or privileged platform role; non-member store grids force ACTIVE products and active variants; public/studio detail cache keys are separated; canonical category rows/counts require ACTIVE products and product-type counts require PUBLISHED types; canonical identifier and selector lookups require ACTIVE platform-level products. All 19 focused tests and latest full API unit/coverage, integration and migration suites passed in CI #647.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1-20 | Enforce store membership before bulk catalog mutations                                                                            | G-029               | CLOSED — CI #592                                                                        | Bulk delete/archive/draft requires active organization ownership and active store membership before invoking the service; all 3 focused controller tests passed in API unit/coverage CI #592 on code commit `335d8db`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P1-21 | Complete offer detail/mutation object authorization and authenticated audit actor attribution                                     | G-001               | IMPLEMENTED ON REMEDIATION BRANCH — CURRENT-HEAD CI/REVIEW PENDING                      | Ported the PR #144 implementation into this branch: store-membership checks at service boundaries for propose/update/withdraw; offer-detail object authorization; JWT-derived merchant/admin actor attribution; focused controller/service regression tests; active store-membership fixtures and updated lifecycle test signatures. PR #144's separate CI #1011 passed all ten executable jobs, but the combined remediation branch still needs exact-head CI and independent review. G-001 remains PARTIAL until its full acceptance matrix is verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Exit gate:** P0 tenant isolation is not yet complete: G-001 remains PARTIAL pending independent review/integration of the PR #144 mutation/detail/actor-attribution hardening; G-030 and G-023–G-029 have the recorded CI evidence. Phase 1 also remains IN PROGRESS because G-002 database role/grant/RLS design is a pre-production blocker and the actual API/migration identities remain unverified. G-031–G-035 are closed by CI #936. Do not authorize authenticated staging business writes, apply migration 0070, change live grants or enable RLS until the relevant gates and access model are approved.

**Phase evidence:**

- Implementation PR/commit: TBD
- Focused test commands/results: TBD
- Migration ID(s): TBD
- Independent review: TBD
- Phase decision: NOT STARTED

---

## 6. Phase 2 — Commercial correctness & checkout contract

**Status:** IN PROGRESS

| Task  | Description                                                      | Finding     | Status                | Evidence / result                                                                                                                                                                                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------- | ----------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-01 | Define canonical offer identity in search contract               | G-004       | COMPLETE — CI #687    | Search cards return selected offer/store identity and concrete active variant; exact-offer resolver tests passed.                                                                                                                                                                                                                                  |
| P2-02 | Align displayed seller/offer with add-to-cart payload            | G-004       | COMPLETE — CI #687    | Cart add/batch/update and checkout repricing preserve the exact selected offer; owner-priced lines cannot merge into offer-backed lines.                                                                                                                                                                                                           |
| P2-03 | Test multiple sellers, stale/inactive offers and price snapshots | G-004       | COMPLETE — CI #687    | Resolver, product-card and cart focused tests passed API unit/coverage; integration suite passed.                                                                                                                                                                                                                                                  |
| P2-04 | Agree and document MOQ/orderIncrement formula                    | G-006       | COMPLETE              | Agreed rule: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement; documented in plan.                                                                                                                                                                                                                                                 |
| P2-05 | Enforce quantity rule on add/update/checkout server-side         | G-006       | IMPLEMENTED — CI #703 | Shared validation wired into cart add/batch/update/validation, selected-offer pricing and checkout; checkout locks and re-reads authoritative offer terms.                                                                                                                                                                                         |
| P2-06 | Add invalid quantity, stale terms and race regression tests      | G-006       | COMPLETE — CI #718    | Invalid quantity, stale offer terms and true PostgreSQL two-session contention tests passed in CI #718. The seller MOQ edit is held uncommitted while buyer checkout waits on the offer-row lock; after seller commit, checkout observes the updated terms and creates no order for the now-invalid quantity. Test cleanup restores fixture terms. |
| P2-07 | Replace mixed-currency grand total with per-currency subtotals   | G-005       | COMPLETE — CI #687    | Totals are grouped by currency; mixed currencies are never added together.                                                                                                                                                                                                                                                                         |
| P2-08 | Validate currency exponent/formatting and same-currency totals   | G-005       | COMPLETE — CI #687    | Five tests cover same-currency totals, mixed currencies, shipping currency, missing currency and pickup behavior.                                                                                                                                                                                                                                  |
| P2-09 | Reject DIGITAL unless a real provider is registered              | G-008       | COMPLETE — CI #714    | Checkout rejects DIGITAL before transaction entry; PaymentsService rejects it before provider lookup or payment insert. The focused payment-method support tests and checkout rejection test passed in CI #714.                                                                                                                                    |
| P2-10 | Align API contracts and web/admin payment choices                | G-008       | PARTIAL — CI PENDING  | API supported-method whitelist aligned with current manual provider; buyer web disables DIGITAL and mobile omits it. Admin payment configuration still requires a focused review.                                                                                                                                                                  |
| P2-11 | Define mobile per-store shipping/payment and tax contract        | G-007       | COMPLETE — CI #711    | API preview uses the same financial helper as checkout; shipping estimate exposes actual fulfillmentMethod; server validates each supplier selection.                                                                                                                                                                                              |
| P2-12 | Update mobile request/review UI and generated clients            | G-007       | COMPLETE — CI #711    | Mobile per-store selection, payment choice, tax-inclusive review and persisted delivery/VAT confirmation implemented; web aligned to same preview.                                                                                                                                                                                                 |
| P2-13 | Add targeted API/web/mobile contract tests                       | G-004–G-008 | COMPLETE — CI #714    | G-006/G-007 tests passed CI #703/#711; G-008 whitelist, checkout pre-transaction rejection, payment-service side-effect guard, web disabled option and mobile omission are covered by focused tests/source review and latest full CI.                                                                                                              |

**Exit gate:** seller attribution, quantity rules, currency totals, supported payment methods and tax/fulfillment semantics are consistent across API and clients.

---

## 7. Phase 3 — Event, worker & fulfillment reliability

**Status:** IN PROGRESS

| Task  | Description                                                                                                | Finding     | Status                                                                    | Evidence / result                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | Map event types to exactly one authoritative consumer                                                      | G-003       | COMPLETE — CI #687                                                        | [Outbox Event Ownership Map](./OUTBOX-EVENT-OWNERSHIP-MAP.md) documents carrier and non-carrier publisher families; PostgreSQL integration test invokes both real poll methods against persisted events and verifies exclusive ownership.                                                                                                                                                                                     |
| P3-02 | Prevent generic dispatcher from consuming carrier events and keep lease recovery within ownership boundary | G-003       | COMPLETE — CI #687                                                        | Generic dispatcher exclusion, carrier-only claim/recovery and unsupported-event retry behavior passed API unit/coverage and PostgreSQL integration CI.                                                                                                                                                                                                                                                                        |
| P3-03 | Implement event retry, idempotency and terminal failure behavior                                           | G-003       | COMPLETE — CI #687                                                        | Carrier worker retry/dead-letter paths and unsupported-event retry behavior passed focused and integration CI. Provider-side idempotency and live carrier behavior remain outside this finding's verified scope.                                                                                                                                                                                                              |
| P3-04 | Connect carrier label event to provider label generation                                                   | G-010       | IMPLEMENTED — CI #832/#843; SANDBOX DEFERRED                              | Authenticated POST /v1/shipments/:id/labels queues the event; worker calls provider.generateLabel and unsupported providers fail closed into retry/dead-letter.                                                                                                                                                                                                                                                               |
| P3-05 | Persist label metadata and shipment state safely                                                           | G-010       | IMPLEMENTED — CI #832/#843; SANDBOX DEFERRED                              | PDF is stored in private S3; shipment_labels uses the outbox event UUID and object key for retry idempotency. Read models provide short-lived presigned URLs.                                                                                                                                                                                                                                                                 |
| P3-06 | Test provider timeout, duplicate event and retry behavior                                                  | G-003/G-010 | TIMEOUT/RETRY REGRESSIONS — CI #832; SANDBOX DEFERRED                     | Worker tests cover PDF persistence, SSRF rejection, duplicate event idempotency, invalid PDF and transient storage failure; controller tests cover duplicate active/pending request suppression. Real provider sandbox and end-to-end timeout/retry evidence remain pending.                                                                                                                                                  |
| P3-07 | Implement durable AutoCompleteWorker lease/claim                                                           | G-011       | COMPLETE — CI #647                                                        | Migration 0071 + Drizzle schema add claim timestamp/owner; worker persists a five-minute lease, recovers expired claims, and completion is fenced by owner + lease validity in the atomic status flip.                                                                                                                                                                                                                        |
| P3-08 | Test multi-instance claim and buyer confirmation race                                                      | G-011       | COMPLETE — CI #647                                                        | Focused unit tests cover persisted claim SQL, owner propagation and conditional release. PostgreSQL Testcontainers integration test races two worker instances, expires/reclaims the lease, then verifies buyer confirmation fences the stale worker; passed in CI #647.                                                                                                                                                      |
| P3-09 | Document P13 worker registration and intended holder topology                                              | Runtime     | COMPLETE — SOURCE + LIVE VERIFIED                                         | Staging has zero active P13 return-worker holders: `P13_WORKER_ENABLED` is unset and expected worker count defaults to 0. The API process hosts OutboxDispatcher, ShippingCarrierWorker and AutoCompleteWorker; no dedicated worker service exists. P13Monitor is active in log-only mode. The report records one-holder expectations, embedded-worker implications and the generic outbox multi-instance limitation.         |
| P3-10 | Define safe P13 staging/prod activation configuration                                                      | Runtime     | PARTIAL — SAFE DEFAULTS VERIFIED; ACTIVATION NOT AUTHORIZED               | Source defaults keep P13_WORKER_ENABLED false, expected holder count 0, 90s lease TTL, 30s heartbeat (clamped to at most half the TTL), 45s startup delay and 120s poll cadence. Before activation: configure one intended holder, explicitly set expected count, establish durable pause, verify the signed alert sink, inspect the lease/status endpoint, then perform a controlled resume. No runtime values were changed. |
| P3-11 | Configure and test alert sink and worker anomaly alerts                                                    | Runtime     | BLOCKED — EXTERNAL SIGNED SINK REQUIRED                                   | Render logs show P13Monitor running every 60s via `log-only`. No webhook is configured. Source fails closed to log-only unless `P13_OPS_ALERT_WEBHOOK_URL` and a signing secret of at least 32 characters are both valid. No endpoint or secret was created/read/changed.                                                                                                                                                     |
| P3-12 | Verify return expiration and protected financial job guards                                                | Runtime     | PARTIAL — RETURN ESCALATION GUARDS VERIFIED; BROADER FINANCIAL PATHS OPEN | ReturnExpirationWorker is disabled in staging. Source requires explicit enablement, a live epoch-fenced worker lease, and a readable/unpaused durable control before batch work; it rechecks fence and pause before each item. Its only business action is escalation to admin review, not approval/rejection/refund/terminal expiry. Broader commission/settlement/refund execution paths remain outside this worker review. |

**Exit gate:** no event ownership ambiguity; durable claims; carrier/worker retry tests pass; P13 activation and alerting are intentionally configured and evidenced.

---

## 8. Phase 4 — Client workflow parity & truthful notifications

**Status:** IN PROGRESS

| Task  | Description                                               | Finding         | Status                                                                         | Evidence / result                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-01 | Complete mobile per-store shipping/payment and tax review | G-007           | COMPLETE — CI #711                                                             | Server-calculated tax-inclusive preview, per-supplier fulfillment/payment request and order confirmation details implemented. Full journey UAT reserved for Phase 6.                                                                                                         |
| P4-02 | Complete mobile order detail/fulfillment parity           | G-007           | TODO                                                                           | Verify per-suborder order detail and tracking in Phase 6 UAT.                                                                                                                                                                                                                |
| P4-03 | Add mobile remove-promotion operation/UI                  | G-019           | COMPLETE — CI #738                                                             | Authenticated DELETE route clears promoCode + promotionId; Flutter ApiService and cart screen provide a removable applied-promo action with loading/error handling. Backend and mobile API tests added.                                                                      |
| P4-04 | Define truthful notification delivery states              | G-009           | COMPLETE                                                                       | External channels use NOT_CONFIGURED until a real adapter confirms provider acceptance; IN_APP SENT means persisted in-app item only. Documented in notifications provider selection/troubleshooting guides.                                                                 |
| P4-05 | Implement provider adapters or NOT_CONFIGURED behavior    | G-009           | COMPLETE — NOT_CONFIGURED                                                      | Removed fake SMS/FCM/WhatsApp success responses and generated message IDs. Rows now record NOT_CONFIGURED with channel-specific reason codes. No external provider calls are made.                                                                                           |
| P4-06 | Add provider sandbox and retry/status tests               | G-009           | PARTIAL — REGRESSION TESTS ADDED                                               | Four unit tests verify truthful NOT_CONFIGURED states and absence of sentAt/providerMsgId for unconfigured channels. Provider sandbox/retry behavior is deferred until a real provider adapter and sandbox credentials are approved; no live customer notification was sent. |
| P4-07 | Verify in-scope admin list/detail/edit/archive workflows  | Workflow parity | PARTIAL — G-031/G-032/G-033/G-034/G-035 PERMISSION FIXES COMMITTED; CI PENDING |                                                                                                                                                                                                                                                                              |
| P4-08 | Verify merchant workflow permission and error states      | Workflow parity | TODO                                                                           |                                                                                                                                                                                                                                                                              |
| P4-09 | Update relevant user-facing help and screen documentation | G-018           | TODO                                                                           |                                                                                                                                                                                                                                                                              |

**Exit gate:** agreed user workflows are coherent and truthful across API/web/mobile; no external channel reports SENT without an actual send.

---

## 9. Phase 5 — Operational hardening, CI, data hygiene & documentation

**Status:** IN PROGRESS

| Task  | Description                                                           | Finding    | Status                                                 | Evidence / result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P5-01 | Add develop/release branch protection and rulesets                    | G-014      | BLOCKED — ADMIN ACTION                                 | Rulesets are empty and classic protection cannot be read or changed through the current connection.                                                                                                                                                                                                                                                                                                                                                                                               |
| P5-02 | Fix boundary-lint workflow invocation                                 | G-015      | COMPLETE                                               | Root script uses API workspace tsx and resolves apps/api/src/modules; CI #738 executed the checker and exposed the existing debt.                                                                                                                                                                                                                                                                                                                                                                 |
| P5-03 | Enforce formatting on PR-changed files and block boundary regressions | G-015      | IMPLEMENTED — CI #843 PASS; LATEST DOC RECHECK PENDING | Changed-file Prettier gate uses a full-history PR-base diff. An exact-blob baseline records 87 unchanged legacy formatting exceptions; any edit to an exempt file invalidates its hash and makes Prettier check it. Three newly edited OTP files were formatted with the repository's Prettier version. The 193-entry E6 baseline gate blocks new imports. Full-repository formatting remains separate legacy debt.                                                                               |
| P5-04 | Classify and scan .m73b6-scratch contents                             | G-016      | PARTIAL — INVENTORY/TEXT SCAN COMPLETE                 | File inventory and visible text scan completed; binary tar contents were not independently extracted. All scratch artifacts were removed from the current tree.                                                                                                                                                                                                                                                                                                                                   |
| P5-05 | Remove unnecessary scratch artifacts and add ignore rules             | G-016      | COMPLETE                                               | Removed 1,277 files / approximately 37.9 MB and added ignore rules.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P5-06 | Verify/remove JWT-shaped artifact and duplicate; rotate if needed     | G-017      | COMPLETE                                               | Expired short-lived HS256 test token removed from current tree; no signing secret embedded and no rotation indicated. Historical Git objects remain.                                                                                                                                                                                                                                                                                                                                              |
| P5-07 | Reconcile legacy docs and mark old statuses historical                | G-018      | PARTIAL                                                | New remediation docs are current; legacy architecture/readiness guides and historical status pages still need review.                                                                                                                                                                                                                                                                                                                                                                             |
| P5-08 | Update technical/user/admin/deployment/troubleshooting docs           | G-018      | PARTIAL                                                | Test, identity, deployment/migration, secret-artifact and boundary docs added; user/admin/troubleshooting guides remain.                                                                                                                                                                                                                                                                                                                                                                          |
| P5-09 | Prioritize FK indexes using workload/EXPLAIN evidence                 | G-013      | REVIEW COMPLETE — DDL DEFERRED                         | 71 candidates; only four affected tables have estimated rows (19/6/4/3). No representative high-volume FK query was identified; defer all index DDL until realistic staging data and EXPLAIN (ANALYZE, BUFFERS) evidence exist.                                                                                                                                                                                                                                                                   |
| P5-10 | Review pg_trgm extension schema placement safely                      | G-022      | BLOCKED — SUPABASE-ADMIN OWNER REQUIRED                | pg_trgm is owned by supabase_admin; current postgres connection cannot SET ROLE. Five GIN indexes and unqualified similarity() calls require an owner-supported, isolated migration path and API search_path verification. No DDL.                                                                                                                                                                                                                                                                |
| P5-11 | Record manual vs gateway payment launch scope decision                | G-012      | OPEN — PRODUCT DECISION PENDING                        | Current supported new-transaction methods remain BANK_TRANSFER, CASH_ON_DELIVERY and VOUCHER; automatic gateway/payout is not implemented. Recommendation: retain manual verification for this release and scope gateway integration separately.                                                                                                                                                                                                                                                  |
| P5-12 | Record RFQ/quotation/PO scope decision                                | G-021      | OPEN — PRODUCT DECISION PENDING                        | Recommendation: defer formal RFQ/quotation/PO workflow to a separate B2B roadmap milestone unless launch scope explicitly requires it.                                                                                                                                                                                                                                                                                                                                                            |
| P5-13 | Complete isolated backup/restore drill                                | Operations | DEFERRED — USER DIRECTION                              | Deferred for the current development remediation cycle; revisit before the pre-production GO decision.                                                                                                                                                                                                                                                                                                                                                                                            |
| P5-14 | Verify deploy/migration/worker/alert runbooks                         | Operations | PARTIAL — LIVE RENDER CONFIG VERIFIED                  | Render currently has one web service (`scs-api-staging`), branch `develop`, auto-deploy off, one instance, Frankfurt/free plan, health `/v1/readyz`; build runs API build and start runs `pnpm --filter @scs/api start:prod` (no startup migration/seed). Release workflow separately runs `db:migrate`, RBAC `db:seed`, ledger checks, then deploys. Outbox/carrier workers run inside the API; P13 worker is disabled and alert sink is log-only. No environment values or live config changed. |

**Exit gate:** CI checks block bad merges; repository risks are resolved; docs are current; payment/procurement scope decisions recorded; backup/restore and deployment controls evidenced.

---

## 10. Phase 6 — Consolidated full verification & release decision

**Status:** NOT STARTED — deliberately deferred until Phases 0–5.

| Test group                | Scope                                                             | Status  | Evidence / result |
| ------------------------- | ----------------------------------------------------------------- | ------- | ----------------- |
| Full builds and contracts | API/web/admin/mobile/packages; generated TS/Dart contracts        | NOT RUN |                   |
| Full unit suites          | All packages/apps                                                 | NOT RUN |                   |
| Full integration suites   | PostgreSQL/Redis/Testcontainers                                   | NOT RUN |                   |
| Migration validation      | Empty DB + representative upgrade path                            | NOT RUN |                   |
| Tenant security           | Buyer, merchant A/B, staff, admin and unauthorized access matrix  | NOT RUN |                   |
| Buyer browser journey     | Search → offer → cart → checkout → order → tracking               | NOT RUN |                   |
| Merchant browser journey  | Onboard → verify → catalog/offer → inventory → order processing   | NOT RUN |                   |
| Admin journey             | Verification, moderation, order/payment/refund/dispute/operations | NOT RUN |                   |
| Mobile integration        | Auth, cart, checkout, orders, promotions, fulfillment             | NOT RUN |                   |
| Worker/event tests        | Outbox, carrier, labels, retries, leases, P13                     | NOT RUN |                   |
| Concurrency/idempotency   | Multi-worker races and duplicate requests/events                  | NOT RUN |                   |
| External provider sandbox | OTP, notifications, carrier and payment if in scope               | NOT RUN |                   |
| Performance/load          | k6 critical paths and queue lag                                   | NOT RUN |                   |
| Backup/restore            | Isolated restore and recovery evidence                            | NOT RUN |                   |
| Business UAT              | Agreed buyer/merchant/admin scenarios                             | NOT RUN |                   |

**Final decision:** NOT ASSESSED
**Release candidate SHA:** TBD
**Full campaign date:** TBD
**Report:** TBD

---

## 11. Implementation task log

Append a new entry for each implementation task. Keep entries concise but evidence-rich.

| Date (UTC) | Phase / task                                                   | Branch + commit                                                                                                                           | Change summary                                                                                                                                                                                                                                                                                                                                                                                                                                       | Focused checks                                                                                                                                                                                                                                                                                                                                                                  | Outcome                                | Next action                                                                                                                              |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-18 | Background worker activation/source topology review            | commit `5da83d0`                                                                                                                          | Inspected AppModule imports and provider registration for OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, AutoCompleteWorker and ReturnExpirationWorker. Documented that most pollers start inside each API process; ReturnExpirationWorker is explicitly gated by `P13_WORKER_ENABLED`. Clarified that existing persisted-event integration coverage mirrors SQL predicates and does not yet call both production consumer methods. | Source review and module registration evidence; no Render environment values or runtime flags changed                                                                                                                                                                                                                                                                           | PARTIAL                                | Add true integration invocation of both consumers; inspect AutoCompleteWorker durable claim as G-011                                     |
| 2026-11-18 | CI #629 failure diagnosis and catalog/search regression repair | commits `ce38d91`, `4ce474b`, `d631cf5`, `aef5dfd`, `d8e82b5`, `eed9e42`                                                                  | Applied `brandId` in both full-text result/count SQL; restored admin category product counts to include draft canonical products; corrected canonical selector response and identifier-fallback test mocks; changed buyer-search integration fixtures from invalid `PUBLISHED` product status to `ACTIVE`. CI #629 also showed P9 performance suite teardown hook timing out at 30s; raise teardown allowance if reproduced in #633.                 | CI #633 running on head `eed9e42`; #629 failed API coverage + integration, while lint/typecheck, web/admin, mobile, migration full apply and E6 passed                                                                                                                                                                                                                          | IN PROGRESS                            | Inspect #633 results; fix remaining failures before closing G-028/G-003                                                                  |
| 2026-11-18 | CI #541 diagnosis; OTP exception redaction                     | branch `remediation/phase-0-1-tenant-security`                                                                                            | CI #541: lint/typecheck, Flutter, integration, web/admin, migration assertions and E6 passed; API coverage failed only because test expected uppercase `NOT LIKE` while Drizzle emits lowercase `not like`. Assertion corrected. OTP delivery catch now logs sanitized error class only; exception-redaction regression test added.                                                                                                                  | Latest-head CI pending; prior #536 remains green for G-001/G-023/migration 0070; no live DB migration or Render deploy                                                                                                                                                                                                                                                          | IN PROGRESS                            | Verify latest-head API coverage + full CI; continue G-003 ownership and remaining P1 remediation                                         |
| 2026-11-18 | P1-04 adjacent tenant-scope audit and G-024–G-026 fixes        | commits `c48bb9d`, `c0b8f0e`, `9511d5a`, `f77f553`, `d83da11`, `2b16c3e` on `remediation/phase-0-1-tenant-security`                       | Added store/org and active-membership checks to merchant catalog request routes; requester/reviewer identities now derive from JWT. Added store membership checks to store/warehouse lifecycle routes. Added price-list/tier ownership checks and variant/list store consistency. Added focused security regression suites. P1-04 source audit also recorded G-027–G-029 for inventory, product-read publication boundary and bulk product mutation. | CI #551 on head `2b16c3e`: lint/typecheck, mobile, web/admin, E6, full migration apply and API unit/coverage passed. Unit coverage reported 216 passed files, 6 skipped; 4,363 passed tests, 110 skipped. New security suites passed: pricing 9/9, merchant 7/7, catalog requests 7/7. API integration tests still running. No live DB migration, staging write, or deployment. | IN PROGRESS — API VERIFICATION PENDING | Verify CI #551; then implement G-027 inventory membership, G-028 buyer/merchant product-read boundary and G-029 bulk product membership. |
| 2026-11-18 | G-027 inventory store-membership enforcement                   | commits `ce6a0c4`, `cc7ddbb`, `8af101e`, `a79ad4f`, `a2f0814`, `ca4c637`, `f995157`, `2e45806` on `remediation/phase-0-1-tenant-security` | Added active store membership checks for warehouse, variant and inventory-item access; all inventory controller routes forward authenticated caller context; low-stock listing is limited to active memberships in activeOrg; inventory items require variant and warehouse to belong to the same store; added 14 focused helper/service tests.                                                                                                      | CI #554 on code head `2e45806`: all jobs passed, including API unit/coverage, API integration, lint/typecheck, format, mobile, web/admin, E6, migration full apply, build, contract/codegen and container smoke.                                                                                                                                                                | CLOSED — CI GREEN                      | Proceed to G-028/G-029.                                                                                                                  |

| 2026-11-18 | G-028 product publication visibility boundary | commits `d4ddaaa`, `527e21c`, `eac0817`, `904d20c`, `9432ad7`, `cc3aba6`, `09f57c6`, `f4127d6`, `3a05c00`, `44746ce` on `remediation/phase-0-1-tenant-security` | Enforced ACTIVE-only public product grids and public variants; non-ACTIVE product detail, variants, matrix and media require active owning-store membership or platform privilege. Buyer detail excludes inactive variants. Public/studio Redis cache keys are separated; auth is checked before cache lookup. Added 8 focused helper tests. | CI #592 passed API unit/coverage, integration, build, contract/codegen, lint/typecheck, mobile, web/admin, boundary lint and migration full apply for the pre-latest-lookup code. Latest canonical lookup/category-count changes are newer than that run and await fresh CI; the container smoke job was cancelled and is being rerun. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-029 bulk catalog mutation authorization | commits `b8f240e`, `3e030bf` on `remediation/phase-0-1-tenant-security` | Bulk delete/archive/draft now requires active organization ownership and active store membership before the mutation service is invoked. Added 3 controller regression tests for member allow, same-org non-member deny and foreign-org deny. | CI #592 API unit/coverage passed on code head `335d8db`; all 3 focused bulk-mutation controller tests passed. Container smoke was separately cancelled and is being rerun. | IN PROGRESS — CI PENDING | Obtain a current CI run and fix any failures. |
| 2026-11-18 | G-002 runtime DB-role and access-path investigation | read-only Supabase SQL + Render service inspection; branch `remediation/phase-0-1-tenant-security` | Confirmed Render service `scs-api-staging` uses branch `develop`, autoDeploy off, and last live deploy commit `9f5bc397`; no Render Postgres resource exists. Render service details omit env vars. Supabase pg_stat_activity showed only `mgmt-api` using `postgres`, with no SCS API connection. MCP SQL session reports current_user=postgres, which is not proof of API identity. Live DB has 114 public tables, all owned by postgres, no RLS; anon/authenticated have no CRUD on app tables but retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. They have no public sequence privileges. 32 public functions are PUBLIC-executable (none of the inspected functions are SECURITY DEFINER); normalize_arabic remains PUBLIC-executable with default search_path. postgres default ACL repeats the four table privileges; supabase_admin has separate broad default ACLs that need internal-object classification. Roles include postgres LOGIN+BYPASSRLS and service_role NOLOGIN+BYPASSRLS. _migration_log ends at 0069, so migration 0070 is not deployed; live grants remain. No writes or deploys performed. | Read-only SQL only; no staging write, migration, grant, RLS or Render configuration change. Database target equality is confirmed by the user. Runtime role remains unverified because DATABASE_URL's username is not exposed by the Render connector and no API connection appeared in pg_stat_activity; same database does not establish that API and migration credentials use the same PostgreSQL role. | PARTIAL — BLOCKED ON RUNTIME ROLE | Obtain the Render DATABASE_URL username only (never password/URL), or capture current_user from a controlled API-side diagnostic; compare with the migration runner's effective role, complete default-ACL/access-path matrix, then review migration/RLS design. |

| 2026-11-18 | G-003 carrier event ownership hardening | commits `a1d48c6`, `58d4104`, `1416de1`, `f363828` on `remediation/phase-0-1-tenant-security` | Kept generic dispatcher exclusion for `shipping.carrier.%`; scoped stale PROCESSING lease recovery to the carrier prefix; unsupported carrier event types now throw into retry/dead-letter handling instead of being acknowledged. Added three worker tests for carrier-only atomic claim, carrier-only stale-lease recovery and unsupported-event retry. Added [Outbox Event Ownership Map](./OUTBOX-EVENT-OWNERSHIP-MAP.md) documenting observed publisher families and the generic dispatcher’s log-only behavior. | Generic dispatcher predicate passed CI #592 API unit/coverage. New worker lease-scope/unknown-event changes and three worker tests are newer than CI #592 and await fresh CI. No worker activation/config changes or live shipping actions. | IN PROGRESS — CI PENDING | Obtain CI, then add integration-level persisted-event ownership proof; keep G-010 label handler separate. |

| 2026-11-19 | G-006 MOQ/orderIncrement enforcement | commits `2521c63`, `ed3bb96`, `8b77243` on `remediation/phase-0-1-tenant-security`; PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) | Agreed MOQ-relative rule: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement. Enforced shared validation across cart add/batch/update/validation, selected-offer pricing and checkout; checkout re-reads and locks authoritative offer/variant terms in its transaction. Invalid negative/fractional/non-finite/unsafe quantities are rejected; zero explicitly removes a cart line. Product-card offer data exposes orderIncrement and web/mobile controls use the MOQ step. | CI #703 on `8b77243c3fc015bf19f66d0cd71b613398311a70`: all executed jobs passed, including API unit/coverage, API integration, lint/typecheck/format, Flutter, web/admin, boundary lint, full migration apply, contract/codegen, build and container smoke. k6 and staging release skipped by workflow conditions. No live DB migration or deployment. | CLOSED — CI #718 VERIFIED | CI #718 passed stale MOQ/orderIncrement revalidation and real PostgreSQL two-session offer-row-lock contention tests, including fixture cleanup. D-002 business formula is RESOLVED. Keep broader buyer checkout UAT in the Phase 6 campaign; no G-006 implementation or acceptance blocker remains. |

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

| ID    | Decision / blocker                                                       | Required input or owner    | Status              | Resolution evidence                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------ | -------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Reconcile DB inventory count (114 vs 111) and effective API DB role      | Engineering + DB owner     | PARTIAL — ROLE OPEN | Live read-only SQL reconciles count to 114; runtime API DATABASE_URL username remains unverified because Render connector does not expose env vars and pg_stat_activity shows no API session. |
| D-002 | Confirm MOQ/orderIncrement business formula                              | Product/business owner     | RESOLVED            | Agreed formula: quantity >= MOQ and (quantity - MOQ) divisible by orderIncrement; MOQ is the first permitted quantity.                                                                        |
| D-003 | Confirm first-release payment scope: manual methods vs digital gateway   | Product/business + finance | OPEN                |                                                                                                                                                                                               |
| D-004 | Confirm RFQ/quotation/PO required for first release or defer             | Product/business owner     | OPEN                |                                                                                                                                                                                               |
| D-005 | Confirm intended P13 worker topology and alert destination               | Operations owner           | OPEN                |                                                                                                                                                                                               |
| D-006 | Confirm which notification channels are in the first release             | Product/operations         | OPEN                |                                                                                                                                                                                               |
| D-007 | Confirm staging provider sandbox availability and permitted side effects | Operations owner           | OPEN                |                                                                                                                                                                                               |

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

**Next:** continue G-002 runtime-role/access-path verification through the authorized read-only audit; exact table ownership predicates and transaction-local context proof remain required before any RLS design can be approved. In parallel, complete remaining Phase 0, 3, 4 and 5 work packages in dependency order. G-031–G-035 are closed by CI #936. G-007 implementation is CI-verified; full buyer journey and order-detail/tracking UAT remains in Phase 6. G-014 requires repository-administrator action because the connected GitHub integration cannot read classic branch protection. Do not apply migration 0070/0071, change grants or enable RLS until the database access model is verified and approved.

**Current state (19 November 2026):** G-001, G-003–G-005, G-008, G-011, G-020 and G-023–G-029 are verified/closed with CI evidence. CI #711 on `347289796961a8f80368e20a0fa7fa33d7a8c999` passed all executed jobs: lint/typecheck/format, Flutter analysis/tests, API unit/coverage (4,444 passed; 110 skipped across 226 files), API integration, web/admin tests, boundary lint, full migration apply on isolated CI PostgreSQL, contract/codegen, production build and container build/smoke including health, P13 configuration and non-root checks. k6 smoke and staging release were skipped by workflow conditions. G-006's agreed MOQ-relative rule and server enforcement are implemented; explicit changed-offer-term and concurrency acceptance cases remain to be reviewed before closure. G-007's per-supplier shipping/payment, server-calculated VAT preview and confirmation parity are implemented and CI-verified; full buyer journey/order-detail UAT remains in Phase 6. G-008 unsupported DIGITAL rejection is CLOSED by CI #714: API unit coverage includes five focused payment-method support tests, the checkout unit test rejects DIGITAL before transaction entry, and web/mobile choices remain aligned. G-002 remains partial: live inspection confirms 114 public tables, all postgres-owned, no RLS, residual anon/authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants, zero anon/authenticated CRUD on app tables, no public sequence privileges for those roles, and an unverified API/migration DB username. No live database migration, staging write, Render configuration change or deployment has been performed.

| 2026-11-18 | CI #636 failure diagnosis and G-011 durable auto-completion claims | commits `605ed04`, `0ea9908`, `0805f11`, `eaed103`, `58990ad`, `08c89f2`, `c93281a` on `remediation/phase-0-1-tenant-security` | CI #636 confirmed all jobs except API unit/coverage passed. Fixed the admin category-count regression test to preserve the draft-inclusive admin contract. Increased the P9 PostgreSQL benchmark test and container teardown allowances to tolerate the observed CI resource contention. Implemented G-011 durable five-minute order claim leases, expired-claim recovery, conditional release, and a fenced OrdersService status update requiring the same current claim owner and unexpired lease. Added focused worker unit tests. | CI #636: lint/typecheck, integration, migration full apply, web/admin, Flutter and E6 passed; API coverage failed on the stale category-count expectation plus P9 availability test timeout (60s) and afterAll timeout (30s). Latest CI #643 is pending for head `c93281a`. Vercel preview statuses separately report external `build-rate-limit` failures. | IN PROGRESS — LATEST CI PENDING | Verify CI #643, add real PostgreSQL two-worker and buyer-confirmation race coverage for G-011, then continue G-003 integration proof. No live migration, deployment or shared DB change. |

| 2026-11-18 | G-011 PostgreSQL multi-instance and buyer-confirmation race coverage | commit `95a7363` on `remediation/phase-0-1-tenant-security` | Added a Testcontainers PostgreSQL integration test with two AutoCompleteWorker instances. It verifies only one instance claims a due order, the second instance reclaims an expired lease, and a buyer-confirmation status/claim clear prevents the stale worker's fenced OrdersService transition. | New integration test committed; CI run #645 was superseded by this test commit. Await fresh latest-head CI. | IN PROGRESS — CI PENDING | Verify latest CI; if the PostgreSQL test passes, close G-011 after independent review of the migration and fencing behavior. |

| 2026-11-19 | G-011 durable AutoCompleteWorker lease and race remediation | commits `0805f11`, `58990ad`, `08c89f2`, `c93281a`, `57e170a`, `95a7363`, `874f07b` on `remediation/phase-0-1-tenant-security` | Added migration 0071 and Drizzle claim fields; implemented persisted five-minute claims, SKIP LOCKED acquisition, expired lease recovery, owner-conditional release and claim-owner/lease-fenced completion. Added focused unit tests and PostgreSQL Testcontainers coverage for competing workers, lease recovery and buyer-confirmation race. | CI #647 passed all executed jobs: lint/typecheck, Flutter, API unit/coverage, API integration, boundary lint E6, migration full apply, web/admin tests, build, container build/smoke and contract/codegen. k6 smoke and staging release were skipped by workflow conditions. | CLOSED — CI VERIFIED | Continue G-003 production-consumer integration proof. |

| 2026-11-19 | G-003 production outbox poller integration proof | commit `2856d5c` on `remediation/phase-0-1-tenant-security` | Added a PostgreSQL Testcontainers integration test that inserts carrier and non-carrier outbox events, invokes the real `OutboxDispatcher.poll()`, verifies the carrier event remains PENDING while the generic event becomes DISPATCHED, then invokes the real `ShippingCarrierWorker.poll()` and verifies the carrier event is claimed and safely retried for an unsupported event type without being acknowledged. Source review also found that raw SQL `RETURNING *` yields database snake_case column names while the worker consumes camelCase properties; the claim query now aliases its returned fields explicitly, and the integration test asserts the exact event type reaches retry classification. | Test committed; latest-head CI pending. Existing unit coverage for generic exclusion and dedicated worker claim/recovery/unknown-event behavior passed in prior CI #592/#647 as applicable. | IN PROGRESS — CI PENDING | Run latest CI; fix integration failures and verify the persisted-event ownership proof. |

| 2026-11-19 | G-003 raw claim-row mapping correction | commits `7aed300`, `919ad41` on `remediation/phase-0-1-tenant-security` | Corrected `ShippingCarrierWorker.claimEvents()` raw SQL `RETURNING` fields to explicitly alias snake_case database columns to the camelCase properties consumed by event processing. Extended the persisted-event integration test to assert the real unsupported carrier event type reaches retry classification, preventing a false-positive test that would otherwise pass on an undefined event type. | Latest-head CI pending. | IN PROGRESS — CI PENDING | Verify the production-poller integration test and mapping fix in CI. |

| 2026-11-19 | G-004 selected seller and price parity remediation | commits `973680a`, `2507837`, `8cace3c`, `464175a`, `0fca2dc`, `db2aacc`, `edf52c2`, `12e7370`, `8f65c70` on `remediation/phase-0-1-tenant-security` | Source review confirmed the search card's offerId/storeId handoff existed, but card price was read from `merchant_offers.base_price_minor` while cart pricing could use another offer's price list (including variant-level precedence over the selected product-level offer). Added batch `resolveSelectedOfferPrices` to resolve a specified offer's own active price-list tier at the requested quantity, or its explicit base price when no list is linked. Product-card enrichment now displays this resolved value and concrete variant. Cart add, batch add, quantity update and checkout price-delta checks preserve the exact selected offer. Owner-priced cart lines are no longer merged into offer-backed lines. Price results are keyed by offer/variant/quantity to support multiple variants under one product-level offer. Unavailable offers are excluded from validation. | Focused resolver, product-card and cart tests committed; latest-head CI pending. | IN PROGRESS — CI PENDING | Verify latest API unit/coverage, integration, web/admin, build and migration jobs; then close G-004 only after latest-head CI passes. |

| 2026-11-19 | G-004 multi-variant and cart-line identity hardening | commits `a2d905d`, `68df198`, `02a3aaa`, `ac94efa`, `92c87fd`, `56aecb1`, `69c692d`, `2e0a401` | Extended exact-offer price results to key by (offerId, variantId, quantity), preventing a product-level offer's price for one variant from overwriting another variant's result during checkout repricing. Search-card enrichment now returns the concrete active variant for product-level offers. Cart line lookup explicitly matches `offer_id IS NULL` for owner-priced items, preventing them from merging into an existing seller-offer line. | Focused unit tests committed; latest-head CI pending. | IN PROGRESS — CI PENDING | Verify latest CI and resolve any test/type errors before closing G-004. |

| 2026-11-19 | G-003, G-004 and G-005 latest-head verification | CI #687 on commit `dc071157992bb9869fcc059d3bc079bd764f8186` | G-003 production-poller integration test passed within API integration CI; generic dispatcher and carrier worker ownership is verified for persisted carrier/non-carrier events, including unsupported-event retry. G-004 exact-offer price resolver (13 tests), product-card (8) and cart (7) focused suites passed API unit/coverage; integration and all other applicable jobs passed. G-005 checkout currency helper passed all 5 focused tests; web/admin tests and lint/typecheck passed. | CI #687 passed every executed job: lint/typecheck, Flutter, API integration, web/admin, boundary lint, unit/coverage (4,419 passed; 110 skipped), migration full apply on isolated CI PostgreSQL, container build/smoke, contract/codegen and build. k6 smoke and staging release were skipped. | CLOSED — CI VERIFIED | Continue Phase 2 with G-006; G-002 remains a pre-production access-model gate. No deployment or live migration. |

| 2026-11-19 | G-008 unsupported DIGITAL payment rejection | CI #714 on current PR head `5b0670a327a70f553e69175ec2d0a6e981244039` | `PAYMENT_METHODS` retains DIGITAL only for historical persistence; `SUPPORTED_PAYMENT_METHODS` contains BANK_TRANSFER, CASH_ON_DELIVERY and VOUCHER. Checkout rejects unsupported methods before transaction entry; PaymentsService rejects before provider resolution and payment insert. Buyer web disables DIGITAL; mobile offers only supported methods. Focused payment-method support suite passed (5 tests), including the checkout test proving no transaction starts. | CI #714 passed all executed jobs on current head: lint/typecheck, Flutter, API unit/coverage (4,452 passed; 110 skipped; 227 files passed/6 skipped), API integration, web/admin, boundary lint, isolated full migration apply, build, contract/codegen and container build/smoke. k6 and staging release skipped. | CLOSED — CI VERIFIED | Keep DIGITAL out of all new checkout/payment flows; any future gateway requires a separately approved provider architecture. No live migration or deployment. |

---

## 14. Execution update — 19 November 2026

### Latest verified CI

- CI #718 passed all 10 executed jobs on `783c03814d1527184c0eb69c2df1c396944056cc`.
- Successful jobs: Lint & Typecheck; Mobile analyze/tests; Web & Admin tests; API Unit Tests + Coverage; Migration Full Apply (isolated CI PostgreSQL); Boundary Lint; Integration Tests; Contract Spec & Codegen; Container Build & Smoke Test; Build.
- Skipped: k6 Smoke Test and Trigger Staging Release. A green CI run is not a staging deployment or release authorization.
- G-006 is now CLOSED: the changed-offer-term revalidation and true PostgreSQL two-session offer-row lock contention case passed in the integration suite; CI #718 also verifies the fixture cleanup correction after CI #717.

### Latest live database evidence

- Read-only Supabase inspection on 19-Nov confirmed 114 public tables and RLS enabled/forced on 0.
- Effective privileges on all 114 tables: anon/authenticated/service_role have no SELECT/INSERT/UPDATE/DELETE, but do have TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.
- `postgres` default ACL repeats the non-DML client-role grants. `supabase_admin` default ACL contains broader grants and is not to be changed without a separate ownership/platform review.
- The Supabase Security Advisor's critical RLS-disabled finding remains valid as a defense-in-depth issue, but its generic claim that all rows are readable/writable is not supported by the effective DML grant checks from this snapshot.
- The Supabase MCP SQL session is `postgres`; no identifiable SCS API session appeared in the inspected `pg_stat_activity` snapshot. The actual API and migration login/effective roles remain NOT VERIFIED.
- Custom migration ledger remains at 69 entries through 0069. Migrations 0070/0071 have not been applied to the shared database.

### New implementation artifacts

- `apps/api/scripts/audit-db-access.ts` — read-only, no application-row reads, no DSN output, no database mutation.
- `apps/api/package.json` — `db:audit-access` command.
- `.github/workflows/db-access-audit.yml` — manual staging-environment read-only audit; no migration, deployment or write step.
- `docs/remediation/DB-ACCESS-VERIFICATION-2026-11-19.md` — live evidence and next-step record.

### Next execution order

1. Validate the new audit utility through CI and run it against the configured staging connection once the workflow is available from the default branch; record the effective role only, never the DSN.
2. Obtain equivalent runtime identity evidence for the Render API without revealing environment values.
3. Complete the per-table access classification and role/default-ACL matrix; design the least-privilege API/migration role contract.
4. Add isolated role-switching and cross-tenant database negative tests before preparing any RLS/grant migration.
5. Continue the remaining Phase 0–5 findings in the plan; Phase 6 remains one consolidated campaign after implementation.

**Safety:** no live SQL mutation, grant change, RLS enablement, worker activation, Render configuration change or deployment was performed in this update.

### G-009 implementation update — 19 November 2026

- Replaced simulated SMS primary/fallback IDs, FCM fake IDs, and WhatsApp placeholder success with a shared NOT_CONFIGURED persistence path.
- SMS records `SMS_PROVIDER_NOT_CONFIGURED`; PUSH records `PUSH_NO_ACTIVE_DEVICE_TOKEN` or `PUSH_PROVIDER_NOT_CONFIGURED`; WhatsApp records `WHATSAPP_PROVIDER_NOT_CONFIGURED`.
- No external provider is called and no external channel receives SENT or a fabricated provider message ID.
- IN_APP remains a supported persisted channel; documentation clarifies that SENT represents successful persistence, not guaranteed realtime/socket delivery.
- Added four regression cases in `external-provider-state.spec.ts`; CI verification pending.
- Updated notification provider-selection and troubleshooting documentation.

### G-010 implementation update — 19 November 2026

- Added authenticated POST /v1/shipments/:id/labels to enqueue label work with tenant authorization, shipment-row serialization, and active/pending duplicate checks.
- Replaced the carrier label worker no-op with provider-driven label generation.
- Provider-returned label URLs are revalidated with the carrier-specific HTTPS/host/DNS allowlist; redirects are rejected, download timeout is bounded, content type/PDF signature are checked, and payloads are limited to 10 MiB.
- PDF bytes are stored in the private S3 uploads bucket. Outbox event UUID is used for both object key and shipment_labels row ID, making retries idempotent across an upload/DB interruption.
- Shipment label list/detail responses now include short-lived presigned download URLs for managed label objects.
- Added four mocked unit tests. Real Aramex sandbox verification is still unavailable; no live shipment or provider call was made.

### CI #729 diagnosis — 19 November 2026

- CI #729 failed in API typecheck because the new tsconfig include glob `scripts/**/*.ts` unintentionally pulled in pre-existing M5/M6 operational scripts that are not part of the API build and already contain strict-type errors (unknown response values and possibly undefined strings).
- The new database audit script itself produced no reported TypeScript error. The scope is corrected to typecheck only `scripts/audit-db-access.ts`, avoiding unrelated legacy tooling and ensuring the new utility is checked.
- Mobile analyze/tests passed in CI #729. API unit/integration and downstream jobs were skipped after the typecheck gate failed; G-009/G-010 verification remains pending until the corrected full CI run.

### CI trigger and frontend preview note — 19 November 2026

- Corrected the API TypeScript include to compile only the new database audit utility after CI #729 showed that a broad scripts glob pulled in unrelated pre-existing manual M5/M6 script errors.
- Current implementation head: `d624805be3ec5e2c35770b7ab3398555f7e76557`. Full CI verification is pending for the combined G-009, G-019 and G-010 changes.
- Vercel web/admin status checks reported build-rate-limit failures from the Taif Vercel account. These are external preview-build quota failures, not successful builds or deployments. No Vercel deployment was performed by this implementation work.

### G-019 implementation update — 19 November 2026

- Added authenticated DELETE /v1/cart/promo; it clears both the raw promo code and resolved promotion ID from the current buyer's active cart and returns refreshed cart state.
- Added the Flutter ApiService method and a Remove action in the applied-promotion row, including busy state and error feedback.
- Added backend service and Flutter API regression tests. CI verification pending.
- No live cart or promotion was modified.

### G-010 implementation update — 19 November 2026

- Added authenticated POST /v1/shipments/:id/labels to enqueue label work with tenant authorization, a carrier-shipment precondition, shipment-row locking, and active/pending duplicate checks.
- Replaced the carrier label worker no-op with provider-driven generation, carrier-specific SSRF validation, redirect rejection, bounded streaming download, PDF validation and private S3 persistence.
- Outbox event UUID is reused as the S3 object key suffix and shipment_labels primary key, making storage/metadata retries idempotent.
- Label list/detail responses include short-lived presigned URLs for managed labels.
- Added worker and controller tests. Real Aramex sandbox verification is pending; no live shipment/provider call was made.

### CI #731 diagnosis and correction — 19 November 2026

- API typecheck identified two integration points introduced by G-010: the existing M7.2.3-A.1 concurrency test constructed ShippingCarrierWorker with the old eight-argument constructor, and the provider's unsupported-label reason is optional.
- Added a storage mock to the integration test constructor and a safe fallback reason when the provider omits one. No runtime configuration or live carrier behavior was changed.
- CI #731's remaining dependent API jobs were skipped after typecheck failed; a fresh full CI run is required to verify G-009, G-010 and G-019.

### CI #734 diagnosis and correction — 19 November 2026

- Flutter analyze/tests passed in CI #734.
- API typecheck found one remaining strict-null issue in the carrier label content-type parser: the first split element is possibly undefined under the repository's TypeScript settings.
- Updated the parser to default an absent media type to an empty string before normalization. The earlier constructor and optional provider-reason issues are resolved.
- API unit/integration and downstream jobs were skipped after the typecheck gate; rerun full CI on the corrected head before closing G-009/G-019 or treating G-010 as CI-verified.

### Phase 0 documentation update — 19 November 2026

- Added TEST-CAMPAIGN-MANIFEST.md with root/API/web/admin/mobile/contract/container/E2E/k6/migration commands, prerequisites, current CI gate behavior and Phase 6 sequence.
- Added SYNTHETIC-TEST-IDENTITY-MATRIX.md defining two buyers, two merchants, owner/staff/admin/moderator/suspended/inactive/unauthenticated cases and minimum synthetic data/negative authorization matrix. Shared fixture factory adoption remains partial.
- Added DEPLOYMENT-MIGRATION-RUNBOOK.md documenting API startup, migration runner, RBAC seed, release workflow, manual dispatch mutation warning, Render exact-SHA deploy, shared-database constraints and forward-fix behavior.
- P0-03, P0-04, P0-06 and P0-08 are now complete by source/document evidence; P0-05 is partial until reusable fixtures are adopted; P0-07 remains partial pending a fresh Render service check.

### G-016/G-017 repository artifact cleanup — 19 November 2026

- Removed the 1,277-file `.m73b6-scratch` tree (approximately 37.9 MB), including the 19.1 MB archive and duplicated project context, plus the root `test-token.txt` artifact.
- Added ignore rules for `.m73b6-scratch/` and `test-token.txt` to prevent reintroduction.
- Enumerated the scratch file tree and scanned the visible token, diff, CI parser and smoke-script text artifacts. The database URLs found were localhost/CI-container test endpoints; no private-key, AWS access-key or GitHub-token pattern was found. The token was expired; no signing secret was embedded.
- The GitHub connector could not independently extract the binary tar contents. The archive and all scratch files are removed from the current tree, but historical Git objects remain; no history rewrite or secret rotation is justified by the evidence available.

### G-015 boundary-lint execution correction — 19 November 2026

- CI #736's boundary job reported success only because the step was `continue-on-error`; its log showed `ts-node: not found` and the checker had a wrong module-root path.
- Root script now uses the API workspace's installed `tsx`; checker resolves `apps/api/src/modules` from `infra/ci`.
- The gate remains advisory until the corrected checker executes, all reported cross-module violations are addressed, and the result is zero violations. Do not count the prior green job as E6 evidence.

### CI #736 results and correction — 19 November 2026

- Passed: API lint/typecheck, Flutter analyze/tests, web/admin tests, isolated migration full apply, and the other completed CI jobs.
- API unit/coverage: 4,465 passed, 110 skipped, 2 failed. Both failures were in the new G-010 label-request controller tests: two locked-shipment fixtures omitted carrierShipmentId/provider fields, so the intended precondition correctly rejected the requests. The fixtures now include the locked row fields in commit 78efd99.
- API integration job was still running when the corrected head superseded CI #736; it is not counted as passed evidence.
- Boundary Lint appeared green only because continue-on-error was enabled; logs show the previous command failed with `ts-node: not found`. The root command and checker module path are corrected in the current head; next CI must show the actual checker output.
- Full verification remains pending. Vercel web/admin preview checks are still affected by account build-rate-limit failures; no frontend deployment was performed.

### CI #738 and Phase 5 progress — 19 November 2026

- CI #738 completed API unit/coverage with 4,467 passed / 110 skipped across 230 passing test files (6 files skipped); API integration suite passed all 12 executed tests. Lint/typecheck/format, Flutter, web/admin, isolated migration full apply, contract/codegen, build and the advisory boundary job passed. Container build/smoke was still running at the time of this tracker update; k6 and staging release were skipped.
- G-009 and G-019 are closed on CI #738. G-010 implementation and API tests pass; container smoke and Aramex sandbox remain outstanding.
- Phase 5 has started. Formatting and boundary gates are configured as blocking in the staged workflow; the next CI run must verify them. The boundary gate blocks new imports against a reviewed 193-entry legacy baseline; it does not claim zero legacy violations.
- G-013 and G-022 are under read-only database analysis only. No index DDL, extension relocation, grant changes, RLS changes, migrations, seed or deployment were performed.

### Formatting gate correction — 19 November 2026

- CI #739 exposed 1,181 repository-wide Prettier failures. Those are legacy debt, not a safe reason to block the whole PR or mass-reformat unrelated code.
- Replaced the advisory full-repository check with a blocking PR-changed-files check. The new script compares `origin/$GITHUB_BASE_REF...HEAD`, checks only changed supported files, and requires full git history in checkout.
- The 193-entry E6 baseline gate passed in CI #740: 193 current legacy entries, zero newly introduced imports. CI #740 API unit suite passed 4,467 tests with 110 skipped; integration tests were still running at tracker update.

### Runtime and OTP security verification — 19 November 2026

- Render service metadata and logs were rechecked read-only. Current staging service topology and worker activation are recorded in `STAGING-RUNTIME-TOPOLOGY-2026-11-19.md`; no deploy, restart or configuration change was performed.
- OTP source review found raw provider exception logging on the deployed `develop` revision. The remediation branch now logs error classes only, redacts common request-body secret fields, and includes synthetic leak regression tests. The sampled Render log window did not reproduce a six-digit OTP log; this is not treated as proof that all historical leakage is resolved.
- The exact-hash formatting baseline preserves existing style debt while making future edits to exempt files subject to Prettier. The three newly edited OTP files were formatted using the same Prettier version as CI.

### G-013 foreign-key index candidate review — 19 November 2026

- A read-only exact leading-column inventory found 71 candidate foreign keys; the earlier Supabase advisor count was 55. The difference remains a methodology reconciliation item, not a reason to add indexes.
- Only four candidate tables have non-zero estimated live rows: sessions (19), device_credentials (6), role_permissions (4) and organization_members (3). All are small. Several tables with high cumulative scan counts currently have zero estimated live rows.
- The available pg_stat_statements snapshot does not contain representative high-volume application joins that justify a specific FK index. No index DDL was run. The review and next evidence requirements are documented in FOREIGN-KEY-INDEX-REVIEW-2026-11-19.md.

### G-022 pg_trgm ownership and relocation review — 19 November 2026

- The `extensions` schema exists and the connected `postgres` role has CREATE/USAGE there, but `pg_trgm` is owned by `supabase_admin`, which is a separate superuser. The connected `postgres` role is not a member of `supabase_admin` and cannot `SET ROLE` to it.
- The extension is relocatable and has 47 extension-owned objects. Five application GIN indexes use `gin_trgm_ops`; catalog search uses unqualified `similarity()` calls. The current `postgres` search_path includes `extensions`, but the Render API/migration role is still unknown.
- No extension relocation, owner change, grant change or search_path change was attempted. The migration is blocked until an owner-supported Supabase path and actual runtime role/search_path are confirmed. See PG-TRGM-RELOCATION-REVIEW-2026-11-19.md.

### Database ACL and search-path reconciliation — 19 November 2026

- A catalog-level `aclexplode` check found no direct table grants to the PUBLIC pseudo-role across the 114 public tables and no PUBLIC default-ACL grants. This complements the effective `has_table_privilege` results; it does not replace the RLS design requirement.
- `normalize_arabic(text)` is not SECURITY DEFINER, is owned by postgres and uses pg_catalog built-ins only. Its live function configuration remains unpinned because migration 0070 is not applied; therefore G-020 is partial, not closed.
- G-022 is blocked because `pg_trgm` is owned by `supabase_admin`; the connected postgres role cannot assume that owner. No live database changes were made.

### Worker topology and protected-job review — 19 November 2026

- Render read-only metadata: one API web service, one configured instance, no dedicated worker service; start command is `pnpm --filter @scs/api start:prod`, auto-deploy remains disabled.
- Runtime logs from the 2026-11-19 02:51:19 UTC boot show OutboxDispatcher (1s), ShippingCarrierWorker (5s), AutoCompleteWorker (60s), P13Monitor (60s, log-only), and ReturnExpirationWorker disabled because `P13_WORKER_ENABLED` is unset.
- Source confirms carrier and auto-complete workers use database row claims/leases. The P13 return worker requires an explicit environment opt-in, a durable lease with epoch fencing, and an unpaused control; it only escalates overdue returns to admin review.
- Generic OutboxDispatcher currently logs and marks non-carrier events dispatched without an atomic claim. This is not an external side effect today (dispatch is a log statement) and the staging service is configured for one instance; do not scale the API horizontally or add side-effecting consumers to this dispatcher without introducing an atomic claim/lease and multi-instance tests.
- No alert webhook is configured; P13 monitoring is log-only. No environment values, service settings, worker flags, database rows, migrations, or deployments were changed.

### Current-head verification — CI #762 — 19 November 2026

- Current PR #138 head `f8a765d0a70a9f110b7a5408d869a1424d8382b1` completed CI #762 successfully. All 10 executable jobs passed: lint/typecheck/changed-file formatting, Flutter analyze/tests, isolated PostgreSQL full migration apply plus public-schema privilege/search_path assertions, API integration tests, web/admin tests, E6 boundary lint, API unit/coverage, contract/codegen, container build/smoke, and production build. k6 smoke and staging release were skipped by workflow conditions.
- P0-05 synthetic two-tenant fixture adoption is now CI-verified. G-006's two-session MOQ/offer-lock contention and fixture cleanup are also included in the current passing integration suite; G-006 remains closed.
- No staging deployment, live migration, database grant/RLS change, or shared-database write was performed. The PR remains draft. G-002 and P0-09/P1-06 through P1-11 remain gated on identifying the actual Render API and migration database roles and completing table-by-table access classification.

### G-002 table-by-table inventory and access-intent classification — 19 November 2026

- Rechecked the live public-schema catalog read-only: 114 relations, 0 with RLS enabled, 0 forced, and 0 public RLS policies. The inventory contains one partitioned analytics parent, 12 monthly partitions, one default partition and 100 ordinary tables.
- Completed a domain/access-intent classification for every relation in [DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md](./DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md). No table is approved for direct browser/mobile Supabase CRUD; buyer-visible catalog reads remain API-mediated.
- Rechecked effective privileges: anon/authenticated/service_role have no SELECT/INSERT/UPDATE/DELETE across the 114 relations, but each retains TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114. The authenticator role inherits anon/authenticated/service_role memberships.
- Reconfirmed there are no public RLS policies. Blindly enabling RLS would either be bypassed by a BYPASSRLS API role or deny every table query to a non-BYPASSRLS role. Transaction-local tenant context and full query/worker coverage are prerequisites for a real tenant-aware RLS implementation.
- P1-07 is now partial with its live inventory/domain classification deliverable complete; exact per-table ownership predicates remain open. P1-06 remains blocked on the actual Render API and migration role identities. P1-09 is blocked pending role/context evidence.
- No database mutation, migration, grant change, RLS enablement, Render configuration change or deployment was performed.

### CI #764 formatting diagnosis — 19 November 2026

- CI #764 on commit `bc2c85c` still failed only at `pnpm format:check:changed`; Prettier flagged the two remediation tracker documents. TypeScript checks passed; dependent jobs were skipped by the workflow dependency graph.
- Added a branch-scoped formatter workflow to run the repository's locked Prettier version against the three remediation documents and commit only formatting changes. This is a temporary correction mechanism; remove it after the documents pass the blocking changed-file format gate.
- Full CI on the formatter-produced head remains required before claiming the documentation correction verified.

### Remediation document formatting correction — 19 November 2026

- The repository-locked Prettier 3.9.6 formatter ran successfully in the temporary branch-scoped workflow and committed the formatted implementation plan, progress tracker and database classification document at `8649cea1f4594d26e45abe56fafff74118eaf700`.
- The temporary formatter workflow was removed immediately after the one-time correction; no ongoing write-enabled formatter automation remains.
- CI #767 was triggered on the preceding unformatted commit and is not evidence for the formatted head. CI #768 on the formatted bot commit was marked `action_required` by GitHub because the run was initiated by the automation actor; it is not counted as a pass or failure.
- A subsequent normal repository-authored documentation commit is triggering the full CI gate against the formatted contents. Do not close the formatting correction until the blocking changed-file Prettier job passes on that head.

### G-002 tenant-aware RLS architecture proposal — 19 November 2026

- Added [G-002-RLS-ARCHITECTURE-PROPOSAL.md](./G-002-RLS-ARCHITECTURE-PROPOSAL.md) documenting role separation, transaction-local request context, worker/system context, policy families, pool-reuse risks, isolated test requirements and the required migration sequence.
- This is a design proposal only. No RLS policies, role DDL or grant migration were generated or applied. P1-06 and P1-09 remain blocked until actual Render API and migration roles are verified.
- Updated the read-only database audit workflow to allow a push-triggered audit on the remediation branch using the existing staging GitHub environment. The job remained in a waiting/approval state and did not execute; the workflow run concluded failure. Environment protection was not bypassed.
- Corrected the Phase 6 release-gate table: backup/restore drills are DEFERRED BY USER DIRECTION and are excluded from the release campaign, consistent with Phase 5 and the test campaign description.

### G-010 retry and timeout regression coverage — 19 November 2026

- Added focused worker tests proving HTTP 5xx and download timeouts are retryable, HTTP 4xx is terminal, and no label object/metadata is persisted on those failures.
- Existing tests cover successful PDF persistence, SSRF rejection, duplicate-event idempotency, invalid PDF payloads and storage failure. The label-request controller tests cover shipment locking and duplicate request suppression.
- Expanded tests await CI #772 or a newer latest-head run. CI #762 had already passed container build/smoke. No real Aramex sandbox or live shipment operation was performed.

### Documentation formatting gate — 19 November 2026

- The four living remediation documents were submitted to the repository's locked Prettier 3.9.6 formatter. The temporary formatter workflow is removed after its one-time run; the blocking CI changed-file format gate remains the final verification.

### Latest Prettier correction — 19 November 2026

- Repository-locked Prettier 3.9.6 completed successfully for the implementation plan, progress tracker, 114-relation classification and G-002 RLS proposal. The formatter commit is `21ad7802fd3d4b7f1d4b153a25644ca954069d00`.
- The temporary formatter workflow was deleted after its successful run; no write-enabled formatter workflow remains in the repository.
- CI #772 failed at the changed-file format gate before unit/integration jobs could run; the log identified the new G-010 worker test and progress tracker as the two unformatted files. Both were formatted by the successful formatter run.
- CI #777 on the formatter bot commit was marked `action_required`; it is not treated as verification. A normal repository-authored documentation commit is being used to trigger the full CI suite against the formatted content.

### G-018 current-readiness documentation reconciliation — 19 November 2026

- Added a current readiness notice to `docs/User_Guide.html`, `docs/Developer_Guide.html` and `docs/Testing_Guide.html`. Replaced the Testing Guide's stale assertion that all Phase 1 P0/P1 gaps were closed and the platform was pilot-ready.
- Marked `docs/production/CAPABILITY-MATRIX.md` as a historical 25-Sep baseline whose checkmarks are not current release evidence.
- Updated `docs/pilot/go-no-go-checklist.md` to reflect that backup/restore drills are deferred by user direction and excluded from the current campaign.
- Marked `docs/monitoring/slo-and-alerting.md` thresholds as proposed, not measured/active, and called out the mismatch between Kubernetes/pod terminology and the currently observed Render service topology.
- Added explicit shared-database and live-side-effect safety warnings to `docs/playbooks/operational-playbooks.md`.
- G-018 remains PARTIAL: this targeted reconciliation covers the most misleading readiness and operational documents, not all 533 files under `docs/`. Remaining guides must be reconciled alongside their owning code changes.

### Documentation formatter handoff — 19 November 2026

- The current-readiness notices and operational documentation corrections are being normalized with the repository's locked Prettier version before the next full CI verification.

### G-030 merchant payment and settlement listing tenant isolation — 19 November 2026

- Source review found merchant listing routes calling unscoped service methods. The previous payment list method built store/buyer order conditions but never applied them to the returned payment query.
- Added dedicated merchant payment and settlement listing methods. Both require the caller's active organization and filter through stores.org_id; explicit store IDs are validated against organization ownership. This preserves the seeded organization-wide merchant read permission.
- Updated both merchant controller methods to pass the authenticated JWT caller context. Corrected admin/service payment store/buyer filters to constrain matching order IDs.
- Added controller tests for caller-context forwarding and PostgreSQL two-tenant tests for merchant A/B, same-org user without a store_members row, foreign store ID, missing activeOrg and store/buyer filter behavior.
- G-030 is P0 and remains OPEN until latest-head CI passes all relevant API unit and PostgreSQL integration tests. No shared database or live financial records were modified.

### G-030 formatter coverage — 19 November 2026

- The temporary locked-Prettier workflow now includes the G-030 payment service/controller and PostgreSQL/controller tests, plus the earlier G-010 worker test and eight Markdown artifacts. It will be removed after one successful formatting pass.

### G-030 evidence artifact — 19 November 2026

- Added [G-030-MERCHANT-FINANCIAL-LISTING-TENANT-ISOLATION.md](./G-030-MERCHANT-FINANCIAL-LISTING-TENANT-ISOLATION.md) with source-level root cause, remediation paths, test coverage and closure criteria. The finding remains P0/OPEN pending latest-head CI.

### Final formatter pass — 19 November 2026

- The temporary formatter now rebases its formatting commit onto the latest branch head before pushing, preventing stale-checkout non-fast-forward failures. No application or database behavior is changed by this formatter.

### Formatter retry hardening — 19 November 2026

- Updated the temporary formatter to use Git rebase autostash so its Prettier-only changes can be rebased safely if the branch advances while the workflow is running. The formatter remains temporary and will be deleted after the successful pass.

### Final Prettier pass and G-030 authorization alignment — 19 November 2026

- Temporary formatter run #23 completed successfully with repository-locked Prettier 3.9.6. It formatted the remediation plans/reports, current-readiness Markdown guides and the G-010/G-030 TypeScript implementation and test files.
- The temporary write-enabled formatter workflow was deleted immediately after the successful pass. No temporary formatter workflow remains.
- G-030 authorization was aligned with the seeded RBAC contract: MERCHANT_OWNER and MERCHANT_STAFF receive organization-wide `merchant:orders:read`. Financial listings therefore scope to the authenticated active organization, not `store_members`; an explicit store ID must belong to the active organization. Same-organization merchant staff without a store membership remain authorized by their organization-level permission.
- The PostgreSQL fixture now creates an ACTIVE MERCHANT_STAFF organization member without a store_members row, proving org-level read behavior while retaining cross-organization denial.
- Full current-head CI is required after the formatter commit and this tracker update. G-030 remains P0/OPEN until API unit/coverage and PostgreSQL integration suites pass.

### G-030 CI #815 typecheck correction — 19 November 2026

- CI #815 passed repository lint and Flutter analysis/tests, then failed API typecheck on the optional index-signature access to the new `orgStaffA` fixture identity.
- Corrected the fixture lookup to use the required indexed property with a non-null assertion after the fixture creates it. No runtime authorization logic changed.
- The next full CI run must verify typecheck, formatting, API unit/coverage, PostgreSQL integration, migration apply, web/admin, build and container smoke before G-030 can close.

### G-030 evidence formatting correction — 19 November 2026

- CI #817 passed API lint and typecheck, then the blocking changed-file Prettier gate flagged the G-030 report and this progress tracker. Repository-locked Prettier completed successfully in the one-time formatter run; the temporary workflow was removed immediately after. The blocking gate remains in place.

### G-010 timeout-test synchronization correction — 19 November 2026

- Review of the in-progress coverage run identified a race in the new fake-timer test: it advanced the clock before the asynchronous shipment/provider/allowlist chain had reached `fetch` and installed the abort timer.
- Updated the test to flush that promise chain and assert the fetch mock is installed before advancing 15 seconds. Production worker behavior is unchanged.
- The previous CI run is superseded; a fresh full run must verify the corrected timeout test and G-030 tenant-isolation suites.

### CI #823 formatting correction — 19 November 2026

- CI #823 passed lint and TypeScript typechecking, then the changed-file Prettier gate identified only this progress tracker. No application-code formatting or typecheck errors were reported; repository-locked Prettier completed successfully in the one-time formatter run; the temporary workflow was removed.

### G-010 fake-timer rejection observer correction — 19 November 2026

- The latest full API coverage run completed 4,480 tests successfully but failed Vitest's unhandled-rejection guard: the 15-second timeout rejection occurred before the test attached its `.rejects` assertion.
- Updated the timeout test to attach the rejection observer before advancing fake timers, then await that observer after the timeout fires. This is test-only synchronization; the worker implementation is unchanged.
- The same CI attempt's PostgreSQL integration suite passed, including the G-030 tenant-isolation fixture. A fresh full CI run is required after this correction.

### G-010 rejection observer follow-up — 19 November 2026

- The timeout regression test now registers its rejection assertion before the fake 15-second deadline is advanced, preventing Vitest from classifying the expected timeout as an unhandled rejection. CI #827 had otherwise passed all 4,480 unit tests and the full PostgreSQL integration suite; this harness correction is being revalidated.

### Current-head CI #832 — 19 November 2026

- CI #832 passed on current branch head `d965e73da727aa136fa4af859f7f423de04d00d7`. Lint/typecheck and changed-file formatting, Flutter analysis/tests, API unit/coverage, PostgreSQL integration, E6 boundary lint, web/admin tests, isolated full migration apply, contract/codegen, build and container build/smoke all passed.
- k6 smoke and staging release were skipped by workflow conditions; no performance or staging-release verification is claimed.
- G-030 is CLOSED for implementation and automated regression coverage. Its two-tenant PostgreSQL tests, same-organization staff-without-store-membership case, foreign-store denial and controller context forwarding passed in current-head CI. See the updated G-030 evidence report.
- G-010's corrected fake-timer timeout test passed as part of the current-head API unit/coverage job. This verifies the regression test and worker code path, not the wider operational P13 activation gate.
- Deleted the temporary one-time formatter workflow after its successful formatting pass. No repository-write formatter workflow remains.

### Phase 5 control status — 19 November 2026

- Repository rulesets read returned an empty list. Reading the `develop` branch-protection endpoint returned HTTP 403 (resource not accessible to this integration), so G-014 remains UNVERIFIED/OPEN; no assumption is made about effective protection.
- G-002 remains BLOCKED pending verified effective API/migration database roles and an approved RLS/access architecture. No shared database grants or RLS policies were changed.
- CI #832 skipped k6 and staging release. The consolidated Phase 6 campaign, staging E2E, performance verification and release decision remain pending.
- No shared database mutation, staging write, deployment or production financial-data change was performed.

### Read-only database audit role-chain enhancement — 19 November 2026

- Extended `db:audit-access` to report role attributes for the effective session role and PostgREST roles (`authenticator`, `anon`, `authenticated`, `service_role`), including superuser/BYPASSRLS/login/inherit flags.
- Replaced the direct-only membership report with a cycle-safe recursive membership graph so inherited role grants are visible for the same identities.
- The audit remains read-only, runs inside `BEGIN READ ONLY`, does not print connection strings or application rows, and makes no schema/privilege changes. Typecheck and formatter verification are pending.

### CI #843 and expanded G-002 live ACL evidence — 19 November 2026

- CI #843 passed all 10 executable jobs on commit `58053f61e9d3679e81b999e2a9f24f4c8ad4f5ab`: lint/typecheck/format, Flutter, API unit/coverage, PostgreSQL integration, web/admin, E6 boundary lint, isolated migration full apply, contract/codegen, build and container smoke. k6 and staging release were skipped.
- Fresh read-only live SQL against SCS-PlatForm PostgreSQL 17.6 confirms 114 public tables and 0 RLS-enabled/forced. Direct ACL entries grant MAINTAIN, REFERENCES, TRIGGER and TRUNCATE to anon, authenticated and service_role on all 114; effective SELECT/INSERT/UPDATE/DELETE remain 0 for those roles.
- postgres-owned public-table default ACLs repeat those four privileges for future tables created by postgres. Supabase-managed supabase_admin defaults are separate; do not modify them in this remediation.
- authenticator has SET but not INHERIT membership edges to anon/authenticated/service_role. The MCP session is postgres with BYPASSRLS and is not evidence of the Render API/migration login.
- The read-only audit utility now emits direct table/sequence grants to API roles, includes authenticator in privilege inventories, and returns transitive role membership edges. The corrected recursive SQL was separately run against the live catalog and verified.
- Read-only database audit workflow run #3 failed on a push event without producing usable API/migration identity evidence. No environment approval was bypassed. G-002 remains BLOCKED pending actual API and migration role proof; no shared DB changes were made.
- The audit utility and documentation changes made after CI #843 require a fresh CI run. k6, staging release, performance verification and Phase 6 remain outstanding.

### CI #848 documentation-format gate correction — 19 November 2026

- CI #848 completed API/web/admin/mobile typechecking successfully and Flutter tests passed, then the changed-file Prettier gate identified four documentation files (G-002 evidence report, RLS proposal, implementation plan and progress tracker). No application-code lint/typecheck failure was reported.
- A one-time repository-locked Prettier pass is being applied to those four documents. The temporary formatter workflow will be removed immediately after its single successful pass; a fresh full CI run is required afterward.

### OTP logging and P13 worker source review — 19 November 2026

- Reviewed current IdentityService, OtpDeliveryService and Resend/SMTP/Twilio/WhatsApp provider logging. Inspected paths log masked recipients and stable error classes/codes; no OTP value or raw provider error/response body is logged. Existing regression tests `otp-redaction.spec.ts`, `otp-security-remediation.spec.ts` and `otp-delivery-providers.spec.ts` cover OTP/recipient redaction.
- This is source-level evidence only. The earlier Render plaintext-OTP log finding remains OPEN until the deployed version and fresh runtime logs are verified. No live OTP was sent.
- AppModule registers Orders, Shipping, Returns and Operations modules. AutoCompleteWorker and ShippingCarrierWorker start inside each API process with database claim/locking safeguards. Runtime replica count and staging worker topology remain unverified.
- P13 ReturnExpirationWorker is OFF unless `P13_WORKER_ENABLED` is truthy; expected worker count defaults to 0 while disabled, pilot mode defaults to legacy, and alert delivery is log-only unless a signed webhook is configured. P13Monitor runs independently on each API process with database alert deduplication. Do not activate protected P13 jobs until holder count, allowlist and alert delivery are verified.
- No Render environment values, worker flags, staging data, OTP provider or deployment settings were changed.

### Evidence formatting pass — 19 November 2026

- The G-002 live ACL report, architecture proposal, implementation plan and progress tracker have received the additional live database and source-review evidence. Repository-locked Prettier is being applied before the next full CI run.

### G-031 permission separation implementation — 19 November 2026

- Added the dedicated admin:products:moderate permission. SUPER_ADMIN, ADMIN and MODERATOR receive it from canonical RBAC seed data; read-only merchant inspection remains admin:merchants:read.
- The Admin API moderation mutation and UI action buttons now require the dedicated permission. API guard/role-matrix tests and Admin UI permission-gating tests are committed. The controlled release seed will add the new role-permission rows idempotently; no live seed or role mutation was performed.
- Phase 4 admin UI review also hid Create User, Create Product and Edit Product controls unless the corresponding write permission is present; regression tests cover read-only users.
- G-031 is a P1 finding and remains open until current-head CI verifies API unit/coverage, Admin tests, lint/typecheck and full integration gates.

### G-032 dispute detail permission correction — 19 November 2026

- The dispute detail route previously checked admin:disputes:read, which is not seeded. It now checks support:disputes:resolve, matching both the dispute list and GET /v1/admin/disputes/:id API guard.
- Added a regression test that loads the dispute detail page with the canonical dispute-review permission and verifies the detail API request. G-032 remains open until current-head Admin tests and full CI pass.

### G-033 attribute detail permission correction — 19 November 2026

- The Admin Attributes list requires catalog:attributes:manage, but the detail page checked catalog:categories:write and denied the seeded attribute managers. The detail page now uses catalog:attributes:manage.
- Added regression coverage proving a user with the canonical attribute-management permission can load the attribute detail route. G-033 remains open until current-head Admin tests and full CI pass.

### G-034 financial Admin workflow permission correction — 19 November 2026

- Payment, settlement, reconciliation and settlement-adjustment pages previously called useRequirePerms but ignored its result and exposed some mutation actions to read-only users. The API guards were already enforcing operation-specific permissions, so this caused misleading controls and avoidable 403s rather than an API authorization bypass.
- Added page-level read guards. Payment verification queue/actions require admin:payments:verify; settlement Mark Paid requires admin:settlements:write; reconciliation Run/Resolve requires admin:reconciliation:write; adjustment Submit requires admin:adjustments:write and Approve/Post requires admin:adjustments:approve.
- Added UI regression tests for read-only roles across all four financial pages. G-034 remains open until current-head Admin tests and full CI pass.

### G-034 financial workflow formatter pass — 19 November 2026

- The financial Admin pages and read-only regression tests have been updated; repository-locked Prettier is applied before the next full CI run.

### Final Admin workflow formatting and CI correction — 19 November 2026

- CI #909 passed Flutter analysis/tests and completed all workspace typechecks, then the changed-file Prettier gate identified eight files: the Admin management test, attribute detail page, four financial workflow pages, and the implementation plan/progress tracker.
- The repository-locked formatter is being rerun explicitly against all eight files before another full CI attempt. No application test failure was reported by CI #909 because downstream test jobs were skipped after the formatting gate.

### G-035 merchant delivery UI permission correction — 19 November 2026

- Merchant delivery list/detail previously checked only the merchant role and exposed shipment operations to any merchant-role user, regardless of the active organization's permission set.
- The list and detail now require fulfillment:shipments:read before requesting shipment data. Create/cancel/retry/exception/RTS controls and handlers require fulfillment:shipments:write. Label detail is shown only with fulfillment:labels:read. Physical return is exposed only with fulfillment:shipments:return.
- Added tests proving missing shipment-read permission prevents network requests and shipment-read-only users can inspect delivery details without seeing mutation controls. Existing merchant delivery tests now use the canonical permission grants.
- The API already enforces these endpoint permissions; this change aligns the client with the backend. No API authorization, RBAC seed or database change was made. CI #916 failed only at Prettier on the API test before the delivery UI commits; latest-head CI remains pending.

### Current-head CI #936 and staging deployment reconciliation — 19 November 2026

- CI #936 passed all 10 executable jobs on implementation code head `78d083a63c454b48fa9808fe25206264766f2523`. API unit/coverage reported 4,483 passed and 110 skipped across 237 test files (231 passed, 6 skipped). PostgreSQL integration, lint/typecheck/format, Flutter, web/admin, E6 boundary lint, isolated migration full apply, contract/codegen, build and container smoke all passed. k6 smoke and staging release were skipped.
- G-031 through G-035 are CLOSED for implementation and automated regression coverage. Their API, RBAC seed, Admin UI and merchant Web permission tests were included in the successful current-head jobs as applicable.
- Render inspection confirms `scs-api-staging` remains configured for `develop`, with auto-deploy disabled, one API instance, and latest live deployment at baseline commit `9f5bc397467dc92cdc8debd54797b6d730659c36`. The latest branch/PR implementation has not been deployed. No deployment was triggered.
- The Render OTP log sample contains startup/provider configuration and route registration records; it does not provide a post-remediation live OTP request/verification exercise. OTP runtime remediation therefore remains unverified until the fixed code is deployed in an authorized staging window and fresh logs are reviewed without exposing OTP values.
- G-002 remains blocked pending effective API and migration PostgreSQL identity evidence. The connected Supabase inspection session is `postgres` and is not a substitute for either runtime identity. Do not apply migration 0070, alter grants/default ACLs, enable RLS, or change Supabase-managed extension ownership as part of this continuation.
- This tracker update is documentation-only; the final documentation head must pass its own CI run. No shared database mutation, staging write, environment change, worker activation or deployment was performed.

## 20 November 2026 — runtime database identity follow-up

### CI #948 — PR #138

- Verified CI #948 on head `a1cd93085136db59fe82aa858ae4ff4227547d36`: all 10 executable jobs passed, including API unit/coverage, PostgreSQL integration, lint/typecheck/format, Flutter, Web/Admin, E6 boundary lint, isolated full migration apply, contract/codegen, build and container smoke.
- k6 smoke and staging release were skipped. No performance, staging runtime, deployment or release authorization is claimed.
- The blocking E6 gate passes with the existing 193 reviewed legacy violations; this does not close G-015.

### G-002 — read-only staging DB audit run #4

- The protected read-only audit completed successfully. The `STAGING_DATABASE_URL` credential used by the audit and staging migration workflow authenticates as `session_user = current_user = postgres`; role flags include `BYPASSRLS`, `CREATEROLE` and `CREATEDB`. This confirms the migration/audit credential is highly privileged and is not a dedicated least-privilege migration role.
- The snapshot contains 114 public tables/partitions and 0 with RLS enabled or forced. Effective SELECT/INSERT/UPDATE/DELETE privileges are 0/114 for anon, authenticated and service_role, while TRUNCATE/REFERENCES/TRIGGER/MAINTAIN and owner-specific default ACL risks remain. Function EXECUTE exposure and extension ownership require separate intent review.
- The audit did not identify a uniquely attributable Render API session. Supavisor-normalized session metadata and timing correlation are insufficient to prove API identity. G-002 remains BLOCKED.
- No database grants, defaults, RLS policies, data, migrations, seeds or extensions were changed; audit result records `mutationPerformed: false`.

### PR #142 — safe API runtime identity diagnostics

- Opened [PR #142](https://github.com/nabeel2323/scs-platform/pull/142) on `security/runtime-db-identity-diagnostics`. It adds a non-secret identity query to the actual API `pg.Pool`, reporting session/effective role names, database name, role capability flags and TLS status. It does not log the DSN, host, client address, credentials, SQL text or raw diagnostic errors; diagnostic failure is non-fatal.
- CI run `44656130587` passed all executable jobs, including API unit/coverage, PostgreSQL integration, lint/typecheck/format, Flutter, Web/Admin, migration full apply, contract/codegen, build and container smoke.
- This is source/test-pipeline evidence only. The diagnostic must be reviewed and merged under normal controls, then included in a separately authorized staging release before the runtime identity can be marked verified. No deployment or environment change was performed.

### Next gates

1. Review PR #142's diagnostic query and ensure its safe logging contract remains intact.
2. After normal review/merge and explicit release authorization, deploy through the existing protected release workflow and inspect the non-secret API startup identity record. Do not trigger the release as part of this implementation continuation.
3. Independently map API runtime privileges, migration ownership, table/function exposure and default ACLs. Design role separation and table-specific RLS policies before any shared-database DDL.
4. Keep PR #138 draft. Do not apply migration 0070/0071, alter shared grants/default ACLs, enable RLS, activate P13 workers, or run staging business writes until the relevant architecture and release gates are approved.

### Post-reconciliation CI gate — 20 November 2026

- The plan and tracker reconciliation were pushed as documentation-only commits `fb81c7139e150ab8a8e6e28feacfa7c55a8429b7` and `429f88b0e009d30c450091650e2f15d5a5f9f39d`.
- CI #948 passed on the preceding PR #138 head `a1cd93085136db59fe82aa858ae4ff4227547d36`; it does not verify these later documentation commits.
- GitHub currently returns no PR-triggered workflow run for either documentation commit. Latest-head CI remains pending; keep PR #138 draft and do not treat the documentation update as fully verified until CI covers the new head.

### Integration-control and register reconciliation — 20 November 2026

- Corrected the finding register to include G-024–G-029. These six findings were already evidenced in the Phase 1 task history, but were missing from the register itself. Their statuses and CI references are now represented explicitly.
- Reconciled the 35-finding totals: 24 closed, 5 partially remediated, 2 in progress, 2 blocked and 2 open. Priority unresolved counts now include partial/in-progress/blocked items: P1 = 2 (G-002, G-007), P2 = 7 (G-010, G-012–G-015, G-018, G-020), P3 = 2 (G-021, G-022).
- Reviewed the latest focused PR CI and documented overlap/landing controls in the implementation plan. In particular, PR #145's 0070 migration filename conflicts with the broader 0070 migration already on this branch; PRs #144, #147, #148, #149 and #150 overlap implementation files/behavior already present here.
- Fixed PR #147's TS4111 test-mock typing issue in commit `590ac8922bcacc03d18d4bf62eb163155dc2188b`. CI #1024 is running; do not mark G-003 newly reverified from that PR until it completes. The existing remediation-branch G-003 evidence remains CI #687.
- PR #150 CI #1023 and PR #151 CI #1022 passed all ten executable jobs. PR #149 CI #1016, PR #148 CI #1015, PR #145 CI #1012 and PR #144 CI #1011 also passed all ten executable jobs. k6 and staging release were skipped in these runs.
- PR #146 CI #1013 failed in API unit tests; PR #150 is the newer G-009 candidate and passed CI #1023. Do not merge both.
- The implementation plan integration-control addendum was committed as `3d287b11994be1159d21fdfd0b80f4422751ea63`. The resulting plan/tracker documentation changes are not yet covered by a CI run on the current PR #138 head. Keep PR #138 draft.

No PR merge, deployment, shared database mutation, worker activation, external provider call, shipment, payment or customer notification was performed.

### G-001 follow-up review — 20 November 2026

- Independent comparison found that the remediation branch's original G-001 implementation protects the merchant list/analytics/trend routes and checks organization scope on mutations, while focused PR #144 adds the missing active store-membership check inside mutation service methods, offer-detail object authorization, and JWT-derived merchant/admin audit actor attribution.
- PR #144 CI #1011 passed all ten executable jobs, including API unit/coverage and PostgreSQL integration. Its own PR description still states that G-001 must remain PARTIAL pending full acceptance review and broader tenant-isolation evidence. The tracker now follows that conservative status.
- G-001 is P0. Do not authorize authenticated staging business testing until the PR #144 additions are independently reviewed, reconciled with this branch, and the full acceptance matrix is verified.

### G-001 hardening ported into the remediation branch — 20 November 2026

- Ported the focused PR #144 implementation into `remediation/phase-0-1-tenant-security` rather than leaving the P0 fix split across two competing branches.
- Merchant offer detail now checks owning organization + active store membership; privileged platform users must hold `catalog:offers:govern` for the generic detail route.
- Merchant propose/update/withdraw service methods now enforce both organization ownership and active store membership. Create/propose attribution and admin approve/reject/suspend/reactivate audit actors are derived from the authenticated JWT, not caller-supplied body IDs or the original proposer.
- Added/ported focused controller and service tests, including same-organization non-member denial, foreign organization denial, detail authorization, forged actor rejection, and audit actor attribution. Updated PostgreSQL lifecycle fixtures with active store memberships and passed authenticated reviewer IDs to governance methods.
- The source changes were ported from PR #144, whose CI #1011 passed all ten executable jobs. This does not verify the combined PR #138 branch head. G-001 remains PARTIAL until current-head CI, independent review and the full acceptance matrix are complete.
- PR #144 remains a draft duplicate candidate until the combined remediation-branch verification is complete; do not merge both copies independently.

### Current remediation-head checks — 20 November 2026

- Current PR #138 head at this checkpoint: `45a4c9359965df5eb609dbcc9b11ee8c13dcfa42` (the plan integration-control addendum). GitHub Actions returned no workflow run/check-run for this exact head; prior CI #948 is not exact-head evidence.
- The commit status API reports two failing external statuses on this head: `Vercel – scs-platform-admin` and `Vercel – scs-platform-web`, both with the message `Deployment rate limited — retry in 24 hours`. These are preview/deployment rate-limit failures, not API test, typecheck, migration or GitHub Actions results. They must remain visible as external check failures until the provider allows a retry; do not claim the PR is green.
- No Vercel deployment was requested or manually initiated by this remediation work. No release or staging action was triggered.
- PR #147 CI #1024 remains in progress on corrected test commit `590ac8922bcacc03d18d4bf62eb163155dc2188b`; lint/typecheck, Flutter, web/admin, migration full apply and E6 have passed, while API unit/coverage and PostgreSQL integration are still running.
- The G-001 code/test hardening from PR #144 has been ported into this branch. The focused PR #144 CI #1011 is supporting evidence only; the combined current branch still needs a full test run and independent review.

### Focused PR behavior comparison — 20 November 2026

- PR #148's DIGITAL-only guard is narrower than the already integrated `SUPPORTED_PAYMENT_METHODS` allowlist on this branch; retain the broader guard and do not merge the focused copy independently.
- PR #149's client-only currency buckets are less complete than this branch's server-authoritative checkout preview, which returns per-supplier financial rows and `totalsByCurrency`, including VAT and shipping. Do not replace the server-calculated contract with the simpler UI-only patch.
- PR #150 passes CI #1023 and is newer than failed PR #146, but it records unconfigured delivery differently from this branch: PR #150 uses FAILED for missing-token push and throws for unconfigured provider stubs; this branch persists NOT_CONFIGURED with stable reason codes. Review the notification status contract and API/client compatibility before selecting one implementation.
- PR #151 remains a useful additive UX/reference-data candidate. Its country/currency selectors pass CI #1022, but its mobile model changes overlap other work on the remediation branch and require integration-level review before merging.

### Develop-branch reconciliation — 20 November 2026

- PR #140's read-only DB access audit entry point was already merged into `develop` at `f74eb588cc58fc99b105e749d39dbfbacb4f9775`. The remediation branch had diverged by one commit and contained a similar workflow variant.
- Reconciled the branch rather than leaving duplicate definitions: the root `package.json` now exposes `db:audit-access` as a forwarding script; `.github/workflows/db-access-audit.yml` now matches the canonical `develop` version; `apps/api/scripts/audit-db-access.ts` was already byte-identical. The workflow remains manually dispatched and read-only.
- Merged the already-landed develop commit into the remediation branch with merge commit `92cb3d2498ea6539923cc3e5ef67e7b6eb738451`. Compare against `develop` now reports 547 commits ahead and 0 behind; no behind commit remains to reconcile.
- This is source/history reconciliation only. The read-only audit workflow was not dispatched, no staging DB query was initiated, and no database state was changed.
- Exact-head GitHub Actions CI remains pending. The commit status API reports Vercel web/admin failures with `Deployment rate limited — retry in 24 hours`; these are external preview deployment statuses, not test-suite failures.

### G-002 runtime identity diagnostic ported — 20 November 2026

- Ported the single-file, non-secret startup identity diagnostic from PR #142 into `apps/api/src/common/database/database.service.ts` (commit `0cf7f227054f49e8265f6b2654ecdec5426f6f8f`). It queries the actual API `pg.Pool` and logs only session/effective role, database name, role capability flags and TLS state. The DSN, hostname, client address, credentials, SQL text and raw diagnostic error are not logged; failure is non-fatal.
- PR #142 CI #990 passed all ten executable jobs and is supporting evidence for this isolated change. The combined remediation branch still needs exact-head CI.
- This does not establish the deployed API identity. A separate approved staging release and log inspection are required. No deployment, restart, environment change, migration, seed or shared-database action was performed.

### Latest working-branch snapshot — 20 November 2026

- The current PR #138 head before this tracker update is `16ab87370a6ae8a56f048400fc93c7a08bb8510d`; it is a draft branch with 553 commits ahead and 0 behind `develop` after reconciling PR #140's audit-workflow commit.
- G-001's additional service/detail/actor-attribution hardening and G-002's safe API-pool identity diagnostic are now present on this branch. Their focused source PRs #144 and #142 each passed their own CI, but the combined PR #138 head still has no exact-head GitHub Actions run.
- The current PR #138 commit status reports Vercel admin and web failures: `Deployment rate limited — retry in 24 hours`. These are external preview-provider statuses; no application test result can be inferred from them. No Vercel deployment was manually initiated by this work.
- PR #147 CI #1024 is still running. Nine executable jobs have passed; only Container Build/Smoke remains in progress. The completed unit suite reports 4,328 passed and 110 skipped; the PostgreSQL integration job and Build/Contract jobs passed. k6 was skipped.
- PR #138 remains draft. No merge, deployment, staging release, shared DB mutation, migration, seed, worker activation, payment, shipment or notification side effect was initiated.

### Latest CI and formatting checkpoint — 20 November 2026

- PR #147 CI run [#1024](https://github.com/nabeel2323/scs-platform/actions/runs/44724574256) completed successfully: all 10 executable jobs passed, including Container Build & Smoke Test. API unit/coverage reported 4,328 passed and 110 skipped. k6 smoke and staging release were skipped.
- PR #138 CI run [#1037](https://github.com/nabeel2323/scs-platform/actions/runs/44727424022) failed in the changed-file formatting gate because the two remediation documents had been appended after the earlier formatting pass. The seven G-001/G-002 source and test files passed the changed-file formatting check. Lint/typecheck completed without errors; API lint reported warnings only.
- Both remediation documents were then formatted with repository-locked Prettier 3.9.6 in commit `f2c0bf67fddda8180f788cb868aed2aa193229d5`. The temporary formatter removed itself in the same commit; no temporary formatting workflow remains.
- The current branch tree contains no `.m73b6-scratch/` files and no root `test-token.txt`. Those paths in the PR changed-file list are deletions, not files retained in the current branch tree.
- PR #138 remains draft. Exact-head CI must be rerun after this tracker update; do not treat the earlier `action_required` run as a pass. G-001 remains PARTIAL, G-002 remains blocked on independent runtime identity and reviewed least-privilege/RLS design, and the migration/notification integration decisions remain open.
- No staging release, deployment, shared-database mutation, migration, seed, grant/default-ACL change, RLS enablement, worker activation or business-side effect was performed.

### Exact-head CI verification — 20 November 2026

- PR #138 exact head `b092fd8970c1609f19cc2458ff4b04eaf48b5241` completed GitHub Actions CI run [#1041](https://github.com/nabeel2323/scs-platform/actions/runs/44730559224) successfully.
- All 10 executable jobs passed: Mobile (Flutter analyze/tests), Lint & Typecheck, Web & Admin App Tests, Integration Tests, Boundary Lint (E6), Migration Full Apply, Unit Tests + Coverage Gates, Contract Spec & Codegen, Container Build & Smoke Test, and Build. k6 Smoke Test and Trigger Staging Release were skipped.
- CI #1040 had exposed six downstream PostgreSQL lifecycle failures because `suspendOffer()` set `is_available=false`, while `reactivateOffer()` restored only `status='ACTIVE'`. This conflated lifecycle suspension with the merchant's independent availability preference.
- Fixed `suspendOffer()` to change lifecycle status without overwriting `is_available`; added a regression assertion that reactivation preserves availability. Commits: `8b1d3aa6beb691af59612580089648720b704d41` and `b092fd8970c1609f19cc2458ff4b04eaf48b5241`.
- PR #138 remains open and draft. The two Vercel preview contexts still report provider build-rate-limit failures; these are external preview statuses and do not change the successful GitHub Actions result. No deployment was requested.
- This run verifies the current source head against the executable CI suite only. k6, staging release, staging runtime verification and production release remain unverified/not authorized. G-001 remains PARTIAL; G-002 remains blocked pending approved runtime identity evidence and reviewed least-privilege/RLS design. Migration-numbering and notification status-contract conflicts remain open.
- No merge, deployment, staging release, shared database mutation, migration, grant/default-ACL change, RLS enablement, worker activation or external business side effect was performed.

### G-002 audit compatibility and immutable revision checkpoint — 20 November 2026

- Source review confirmed the repository's local development database and CI PostgreSQL integration service use PostgreSQL 16 (infra/docker-compose.dev.yml and .github/workflows/ci.yml). The audit previously called has_table_privilege(..., 'MAINTAIN') unconditionally; that privilege is PostgreSQL 17+, so the read-only audit would fail against the documented PostgreSQL 16 baseline.
- Updated apps/api/scripts/audit-db-access.ts to read server_version_num, include the MAINTAIN privilege count only on PostgreSQL 17+, and return maintain_count: null when the server does not support that privilege. PostgreSQL 16 continues to be audited for the other supported table privileges. Commit: 82afa41668c8161874f401170ad466affaa6da1a.
- Found and corrected a workflow/revision mismatch: the manual audit workflow previously checked out hard-coded develop, meaning dispatching it from the remediation branch would still execute the develop copy of the audit script. It now checks out the immutable github.sha selected for the workflow dispatch. Commit: 7eb09a40b42209feac0393151ab523e729f1f366.
- No GitHub Actions run is currently associated with the audit-compatibility commit; the combined status currently shows only the two external Vercel preview contexts failing with provider build-rate-limit status. Therefore this source correction is NOT YET CI-VERIFIED. It has not been run against a live database.
- The workflow remains manual-dispatch only and protected by the staging environment. It was not dispatched and no approval was requested. No staging secret was accessed; no deployment, migration, shared-database mutation, grant/default-ACL change, RLS enablement, worker activation or business side effect occurred.
- PR #138 remains open and draft. G-002 remains BLOCKED until an authorized operator dispatches the reviewed immutable revision, approves the protected environment, and the actual API and migration identities are independently established. The audit report is evidence gathering only; it does not authorize privilege or RLS changes.

### G-002 PostgreSQL CI execution coverage — 20 November 2026

- PR #138 exact source head `3e856985893a5eb5da63434b856f0eacd20bcb29` passed GitHub Actions CI #1049: all 10 executable jobs succeeded, including PostgreSQL integration, full migration apply, formatting, typecheck, container smoke and build. k6 and staging release were skipped. The Vercel web/admin preview contexts remain externally rate-limited and are not part of the successful GitHub Actions result.
- Extended the disposable PostgreSQL migration job to execute `pnpm db:audit-access` immediately after the full migration apply. This exercises the actual read-only audit against the CI PostgreSQL instance, after application roles and schema are provisioned; it uses no staging credentials and does not touch a shared database. Commit: `d8652850adf84d0b61986683a97d29149cd7670d`.
- The new workflow step is not yet verified: it requires a new CI run on the updated workflow commit. Keep PR #138 draft. Do not dispatch the protected staging audit, deploy, migrate a shared database, alter grants/default ACLs, enable RLS, or activate workers as part of this gate.

### CI #1051 formatting-gate correction — 20 November 2026

- CI run [#1051](https://github.com/nabeel2323/scs-platform/actions/runs/44755411592) ran on PR #138 merge ref `e920e1e27f3bf3a830ef2a1523c22a9bdfc3ba23`, containing source head `2efe9319b00e70e4f9c6398dadb07c4fc2a323cf`.
- `pnpm lint` and `pnpm typecheck` passed; Flutter analysis and tests passed. `pnpm format:check:changed` failed and flagged `.github/workflows/ci.yml`, `docs/remediation/IMPLEMENTATION-PLAN.md` and `docs/remediation/IMPLEMENTATION-PROGRESS.md`.
- Migration Full Apply and downstream jobs were skipped because the lint job failed. Therefore the new `pnpm db:audit-access` PostgreSQL CI step has not yet executed and is not verified.
- Removed trailing whitespace and normalized blank-line spacing in the three flagged files. A new exact-head CI run is required to verify the formatting correction and execute the disposable PostgreSQL audit.
- PR #138 remains open and draft. No protected staging workflow was dispatched; no deployment, shared-database mutation, grant/default-ACL change, RLS enablement, worker activation or business-side effect was performed.

### CI #1053 — read-only PostgreSQL audit verified — 20 November 2026

- Exact branch head `1ec2a60d9bce6ff502fa7baa9e740798fc2b60f9` passed CI [#1053](https://github.com/nabeel2323/scs-platform/actions/runs/44756359937). All 10 executable jobs passed: Lint & Typecheck (including changed-file formatting), Mobile Flutter analyze/tests, Unit Tests + Coverage, Boundary Lint, Web/Admin Tests, Integration Tests, Migration Full Apply, Build, Contract Spec & Codegen, and Container Build & Smoke Test. k6 and Trigger Staging Release were skipped.
- The Migration Full Apply job executed the read-only audit successfully against disposable PostgreSQL 16.16. Audit output confirms no mutation and no connection-string disclosure. It reported login/effective role `scs` as superuser and RLS bypass, 116 public tables with RLS enabled on 0, and no effective table privileges for `anon` or `authenticated` in this fixture. These are CI fixture results only; they do not establish staging/runtime identity.
- The successful run exposed that the audit was being exercised with the migration owner's superuser credentials. Added a separate CI step to provision a random-password `scs_audit` login with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`, grant only database CONNECT, and run the read-only audit using that restricted login. Commit: `501cc5f575e2b3fcadb7a89260beda47cdbecf4f`.
- The restricted-login audit is pending a new exact-head CI run. If catalog inspection fails due to insufficient visibility, adjust only the minimum required catalog access; do not grant application-table privileges or elevate the audit role.
- G-002 remains BLOCKED until the protected staging audit is run with approval and actual API/migration identities are independently established. PR #138 remains draft. No staging workflow dispatch, deployment, shared database mutation, grant/default-ACL change, RLS enablement, worker activation or business-side effect occurred.

### G-001 expanded mutation coverage and latest CI — 20 November 2026

- CI [#1068](https://github.com/nabeel2323/scs-platform/actions/runs/44795252257) passed all 10 executable jobs on source head `66dbd325ac68ecd2d5eff60043b31e3f92eec1ea`. API unit/coverage: 4,503 passed, 110 skipped across 237 test files (231 passed, 6 skipped); PostgreSQL integration: 12 passed, 0 failed, 0 skipped; Flutter: 188 tests passed.
- The isolated Migration Full Apply job executed the read-only audit using a temporary `scs_audit` login with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` and only database CONNECT granted. On disposable PostgreSQL 16.16, the audit reported no mutation, no connection-string disclosure, zero effective table DML privileges for `anon`, `authenticated` and `scs_audit`, no PUBLIC table/sequence grants, and RLS enabled on 0 of 116 fixture tables. These results do not establish staging or production state or the actual Render API runtime identity.
- Added three G-001 service regression tests in commit `565124c38f83622a55b824f268332ca03cab9e6f`: deny foreign-organization proposal; deny foreign-organization pricing mutation; allow an active member to propose with authenticated actor attribution. Denial assertions verify no update is issued.
- CI [#1069](https://github.com/nabeel2323/scs-platform/actions/runs/44798898165) on `565124c` passed lint/typecheck and Flutter, but failed the changed-file Prettier gate for `catalog-offer.spec.ts`; downstream jobs were skipped. The formatting-only correction is commit `5768869a34288d00988e29abde6560aeef8f064e` and requires a new exact-head CI run.
- G-001 remains PARTIAL pending successful exact-head verification, independent security review and full owner/staff/buyer/foreign-merchant/platform-admin acceptance coverage. G-002 remains BLOCKED pending approved protected staging audit, actual API and migration runtime identity, and reviewed least-privilege/RLS design.
- k6, staging E2E, live OTP verification and staging release remain unverified. No shared database mutation, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.

### 20 November 2026 — G-001 service-boundary tenant-context hardening

**Implementation checkpoint — exact-head CI pending.**

- Made authenticated caller context mandatory for the offer mutation service methods: offer creation, proposal, pricing updates and withdrawal.
- The service now performs store organization and active membership checks for these mutations. Proposal and audit actor attribution are derived from `caller.sub`; client-supplied `proposedBy` is not trusted.
- Updated the HTTP controller to pass the caller context into offer creation and proposal operations. Existing route-level permission checks remain in place.
- Updated PostgreSQL lifecycle fixtures across catalog lifecycle, marketplace, multi-merchant, security, import-commerce and transaction flows to exercise explicit tenant contexts. Added unit coverage for foreign-organization offer creation denial and authenticated creator/audit attribution.
- CI #1082 exposed remaining direct service call sites in older integration fixtures. Those fixtures were corrected. CI #1089 then confirmed TypeScript typechecking passed; its formatting gate identified seven changed files. Those files have now been formatted with the repository-locked Prettier 3.9.6, and the one-time formatter has been removed from the branch.
- Latest implementation head before this tracker update: `bee2469f573c96b23dbd786a31c02aa9938c302e`. A fresh exact-head CI run is required; no result is claimed for the formatted service-boundary changes yet.
- G-001 remains **PARTIAL** pending exact-head CI, independent security review, and the complete owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix. G-002 remains **BLOCKED** pending protected staging verification and actual runtime identity evidence.
- No staging or production database changes, grants/default-ACL changes, RLS changes, migrations, worker activation, environment-protection changes or deployments were performed.

### 20 November 2026 — store-membership lookup correction

- CI #1098 exposed that `assertStoreMember` attempted to use `db.query.storeMembers.findFirst()`, but the runtime Drizzle relational query object did not expose that table query. Replaced it with a typed direct `select().from(storeMembers).where(...).limit(1)` lookup.
- Updated the offer-service unit harness and controller tests to mock the direct query surface and to assert the current proposal caller-context signature.
- Seeded explicit ACTIVE store memberships for the merchant owners (and merchant staff where applicable) in the PostgreSQL marketplace, multi-merchant, security, import-commerce and transaction lifecycle fixtures. The catalog lifecycle fixture already seeded these rows.
- The one-time formatter has been removed. The formatted implementation head is `8ea6e1a02ffaa9483d92e1427b6081c556a3ad98`; a new exact-head CI run is required. CI #1098 is recorded as failed and is not accepted as validation.
- G-001 remains **PARTIAL** pending exact-head CI, independent security review and the complete authorization acceptance matrix. G-002 remains **BLOCKED** pending protected staging verification and runtime identity evidence.

### 20 November 2026 — active store membership enforcement follow-up

- CI #1098 showed that the relational query accessor for `storeMembers` was unavailable. The shared `assertStoreMember` helper now uses a direct Drizzle table select, preserving the ACTIVE membership predicate and failing closed when no row exists.
- Added explicit ACTIVE `store_members` fixtures for the merchant owners and applicable merchant staff in the affected PostgreSQL lifecycle suites. Updated the service/controller unit mocks to exercise the direct select surface and corrected the proposal-controller caller-context assertion.
- CI #1106 reported a formatting warning for `phase4-import-commerce.e2e.spec.ts`. A branch-scoped diagnostic using the repository-locked Prettier 3.9.6 ran `prettier --write` followed by `prettier --check` successfully for that exact file. The temporary diagnostic workflow has been removed; a fresh exact-head CI run remains required.
- Latest source and fixture changes are present on the branch; G-001 remains **PARTIAL** pending exact-head CI, independent security review and the complete authorization acceptance matrix. G-002 remains **BLOCKED** pending protected staging verification and runtime identity evidence.
- No staging/production database changes, grants/default-ACL changes, RLS changes, migrations, worker activation, environment-protection changes or deployments were performed.

### 20 November 2026 — phase4 fixture formatting verification

- CI #1110 confirmed lint and TypeScript typecheck passed but still reported `phase4-import-commerce.e2e.spec.ts` at the formatting gate.
- A diagnostic run using the locked Prettier 3.9.6 performed `--write` followed by `--check` successfully. Its formatted file was then committed to the branch; the resulting Git blob is `57603a05e605983bc1f1fe49f5f1850066fc0f65`. The temporary formatter workflow has been removed.
- Latest formatted source head before this tracker update: `c4e4d3e70b01d179fbabb7cf869c73c1a19009cb`. Fresh exact-head CI remains required; earlier failed/cancelled runs are not accepted as validation.

### Exact-head CI #1131 formatting follow-up — 21 November 2026

CI #1131 ran against PR #138 source head `dc2436ef6e2fadd1a982e44f935fcc5f56bc6d0b`. `pnpm lint`, `pnpm typecheck`, Flutter analysis and Flutter tests passed. The changed-file Prettier gate failed on exactly two files: `apps/api/src/__tests__/unit/catalog/catalog-offer-controller.spec.ts` and `docs/remediation/DB-ACCESS-VERIFICATION-2026-11-19.md`. The lint/typecheck job therefore failed and all dependent API unit/coverage, PostgreSQL integration, migration full-apply, Web/Admin, boundary, build, container, contract/codegen, k6 and staging-release jobs were skipped. This is a formatting failure, not a test failure. The formatting-only corrections are grouped with this tracker reconciliation; a new exact-head CI run is required. No shared database mutation, staging write, environment change or deployment was performed.

The formatting corrections, DB runtime-evidence report, implementation tracker and plan reconciliation were committed atomically in `9a798353283650bfe9cd28ba9afbf4b722f38d02` (four files, one commit). GitHub Actions is being re-triggered against the updated PR head; no prior CI result is attributed to this commit.

### Grouped Prettier remediation — 21 November 2026

- CI #1133 on head `6063645058d026c49fcddc1499a78bc169d7de95` confirmed four files required the repository's locked Prettier formatting: the G-001 offer-controller unit test and the database-access verification, implementation plan and progress tracker documents. Lint, TypeScript typecheck and Flutter analysis/tests passed; the formatting gate failed and downstream jobs were skipped.
- Ran the repository-locked Prettier `--write` and `--check` against all four files in a temporary self-cleaning workflow. The formatter job completed successfully. Its single cleanup commit `96820fe00da6c7db29736e04cea82ebcf78b36b9` contains the four formatting updates and removes the temporary workflow.
- A new full CI run must verify the post-format commit. The formatting workflow's success is not a substitute for the full test, migration and build gates. G-001 remains PARTIAL and G-002 remains BLOCKED. No shared database mutation, staging write or deployment was performed.

The post-format tree and tracker reconciliation are now at `17975caf086bfc5c9dc86785bcf9d0e0f541403e`. The formatter's Prettier `--write` and `--check` both succeeded on all four files. A fresh PR CI event is required for this final tree; prior run #1134 used the pre-format temporary-workflow commit and run #1135 returned `action_required` without creating jobs, so neither is accepted as final verification.

### Post-format verification checkpoint — 21 November 2026

CI #1136 evaluated the pre-format documentation head `e8afb2d8713217e9b4f77de3f2b534046fa6202e`. Lint, TypeScript typecheck, Flutter analysis and Flutter tests passed; Prettier failed only on `IMPLEMENTATION-PLAN.md` and `IMPLEMENTATION-PROGRESS.md`, so dependent API unit/coverage, PostgreSQL integration, migration full-apply, Web/Admin, boundary, build, container and contract/codegen jobs were skipped. A second temporary self-cleaning workflow ran the repository-locked Prettier write/check successfully on both documents and completed successfully, removing itself. The post-format branch head is `a5227c897dc397ad4f890fe2bf96181c971e59f2`; full exact-head CI is still required. Neither the formatter job nor earlier CI runs constitute full verification of this head. G-001 remains PARTIAL and G-002 remains BLOCKED. No staging deployment, shared database mutation or environment change was performed.

### Exact-head CI #1142 — 21 November 2026

- PR #138 source head `c7165d891b87e008e9872e6aaefa299eaef9a61d` completed [CI #1142](https://github.com/nabeel2323/scs-platform/actions/runs/44832686714) successfully. All 10 executable jobs passed: Lint & Typecheck (including changed-file Prettier), Mobile Flutter analysis/tests, Web & Admin App Tests, API Unit Tests + Coverage Gates, PostgreSQL Integration Tests, Boundary Lint (E6), Migration Full Apply (including the disposable PostgreSQL read-only database-access audit), Contract Spec & Codegen, Container Build & Smoke Test, and Build. k6 Smoke Test and Trigger Staging Release were skipped.
- This is the first successful exact-head CI run after the G-001 offer-detail authorization tests and the remediation-document formatting corrections. The successful run verifies the source and tests at this exact head; it does not establish independent security approval or staging runtime behavior.
- G-001 remains **PARTIAL** pending independent security review and a documented owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix. G-002 remains **BLOCKED** pending the protected staging audit, actual API and migration runtime identity evidence, and reviewed least-privilege/RLS design.
- PR #138 remains open and draft. No staging deployment, k6 run, live OTP exercise, shared-database mutation, migration, grant/default-ACL change, RLS enablement, environment change or worker activation was performed.

### Exact-head CI #1155 — 21 November 2026

- PR #138 head `b619045e0743ce17b540943bce8b0417aade12d3` completed [CI #1155](https://github.com/nabeel2323/scs-platform/actions/runs/44844118818) successfully. All 10 executable jobs passed: Mobile (Flutter analyze/tests), Lint & Typecheck, Migration Full Apply, Web & Admin App Tests, Unit Tests + Coverage Gates, Integration Tests, Boundary Lint (E6), Build, Container Build & Smoke Test, and Contract Spec & Codegen.
- k6 Smoke Test and Trigger Staging Release were skipped. No performance, staging-runtime, live OTP or business UAT evidence is claimed.
- G-001 remains PARTIAL pending independent security review and the complete owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix. Buyer-role denial hardening and regression tests are included in the branch.
- G-002 remains BLOCKED pending protected staging identity audit, actual API/migration runtime identities and reviewed least-privilege/RLS design. The connected Supabase Management inspection identity is not evidence of the API runtime identity.
- OTP source review of API identity and delivery paths found masked recipient identifiers in the request/delivery logging path and no OTP value interpolated into inspected log statements. Provider implementations use masked recipients and stable error codes. This source finding does not erase historical Render log exposure: verify deployed revision and current runtime logs under approved staging access before closing the finding.
- PR #138 remains open and draft. No shared database mutation, live staging write, migration, grant/default-ACL change, RLS enablement, environment change, worker activation or deployment was performed.

### Exact-head CI #1156 and evidence reconciliation — 21 November 2026

- PR #138 exact head `c0377ba8d43f21ceb36b296061d432b8cd6db102` passed [CI #1156](https://github.com/nabeel2323/scs-platform/actions/runs/44845984823). All 10 executable jobs succeeded: Flutter analyze/tests, lint/typecheck/changed-file formatting, E6 boundary lint, PostgreSQL integration, isolated full migration apply/read-only audit, Web/Admin tests, API unit/coverage, contract/codegen, build and container smoke. k6 smoke and staging release were skipped.
- G-006 is consistently recorded as CLOSED: the MOQ-relative formula is documented and accepted (D-002 RESOLVED); shared validation and checkout locking/re-read are implemented; CI #718 passed invalid-quantity, changed-offer-term and real PostgreSQL two-session seller-edit/buyer-checkout contention tests. The older execution-log entry that said acceptance review was open is corrected. Broader buyer journey UAT remains in Phase 6 and is not a G-006 implementation blocker.
- P1-06 diagnostic source is present in this PR branch and exact-head CI #1156 passed. It logs non-secret role/database/TLS metadata from the API's actual pool. This does not prove the live role because staging remains on `develop` with auto-deploy disabled and the diagnostic has not run in the deployed service. Migration identity also remains unverified.
- P1-07 inventory/domain classification remains partial pending exact per-table ownership predicates. P1-08 catalog/ACL review remains partial pending the full schema/function/default-ACL and role matrix. P1-09 remains blocked until actual API/migration identities and safe transaction-local tenant context across pooled API requests and background workers are proven. P1-10 migration 0070 remains CI-verified but not deployed.
- PR #138 remains open and draft. No protected staging audit was dispatched or approved; no deployment, shared database mutation, migration 0070, grant/default-ACL change, RLS enablement, environment change or worker activation was performed.

### Migration runtime identity diagnostic — CI #1161 follow-up — 21 November 2026

- Added `readMigrationDatabaseIdentity` to query `session_user`, `current_user`, database name, login/effective role superuser/BYPASSRLS/CREATEROLE/CREATEDB flags and TLS state from the exact `PoolClient` used by the migration runner. The migration runner emits only this non-secret fingerprint and a fixed warning on diagnostic failure; it does not log DSNs, hostnames, addresses or raw query errors.
- Added focused unit tests and extended the existing PostgreSQL migration-lock integration test to exercise the same-session diagnostic. The first integration assertion incorrectly assumed the disposable Testcontainers role would always be `postgres`; CI's actual container role is `test`. CI #1161 therefore reported 1 failed assertion among 1,641 integration tests (1,640 passed); the coverage job also failed on that same included integration test (4,518 passed, 1 failed). Lint/typecheck, migration full apply and boundary lint passed. Dependent build/container/contract jobs were skipped.
- Corrected the integration assertion to validate non-empty identity metadata and boolean privilege/TLS fields without assuming a fixed role name or privilege posture. Fresh full CI is required on the corrected commit.
- The source diagnostic is not live identity evidence until the protected staging migration workflow runs under explicit approval. No staging secret was read, no migration was dispatched, and no shared database or deployment state was changed.

### G-002 Drizzle schema coverage reconciliation — 21 November 2026

- Compared the 114-relation live public-schema inventory from 19 November with all 25 API module `*.schema.ts` files on the remediation branch.
- Found 99 distinct `pgTable` declarations matching live relation names. The remaining 15 are `_migration_log`, `backfill_errors`, and 13 physical partitions of the `analytics_events` parent (the parent itself is represented in Drizzle).
- Recorded the exact non-modelled relation list and follow-up requirements in [G-002 schema coverage reconciliation](./G-002-SCHEMA-COVERAGE-RECONCILIATION-2026-11-21.md). This improves inventory completeness but does not establish row ownership predicates or RLS readiness.
- G-002 remains IN PROGRESS. API and migration identities remain unverified in live staging; exact per-table operation/predicate review and transaction-local context feasibility remain open. No protected workflow was dispatched and no shared database state was changed.

### CI #1163/#1164 formatter event reconciliation — 21 November 2026

- CI #1163 ran against the temporary formatter-workflow insertion commit, before the formatter had completed. It failed the changed-file Prettier gate on the then-unformatted progress tracker and temporary workflow; dependent test jobs did not run.
- The one-time formatter completed successfully and removed itself in commit `122b6662281e1df37ba3f57ff1881c3291e3f6a3`. CI #1164 for that bot-authored cleanup commit concluded `action_required` with no jobs, so it is not a verification result.
- A new app-authored implementation/documentation commit is being used to trigger full CI against the corrected and formatted tree. Do not treat #1163 or #1164 as a passing or failing code-test result.

### G-001 merchant mutation role gate and CI reconciliation — 21 November 2026

- Merchant offer mutation handlers now explicitly require one of the supported merchant principals: `MERCHANT_OWNER`, `MERCHANT_STAFF`, or legacy `MERCHANT`. This applies to create, propose, pricing update and withdrawal, in addition to the existing permission and active store-membership checks.
- Platform-privileged roles retain merchant-offer read access only through `catalog:offers:govern`; that governance permission no longer makes them eligible to create or mutate merchant offers. The dedicated admin approve/reject/suspend/reactivate routes remain the governance surface.
- Added controller regression coverage for all supported merchant roles and negative cases for BUYER, ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN even when merchant write/govern permissions are present. Existing governance-read tests remain in place.
- CI #1164 passed all executable jobs on preceding commit `122b6662281e1df37ba3f57ff1881c3291e3f6a3`; it is not claimed as validation of this grouped commit. CI #1168 attempt 2 on the preceding documentation-only head is superseded by this commit. Exact-head CI is pending.
- CI #1165's changed-file Prettier failure was corrected with the repository-locked formatter. CI #1166/#1167 were superseded/cancelled in the rapid formatter sequence; no approval was requested or required by those runs. Vercel web/admin preview statuses separately report a 24-hour deployment rate limit.
- G-001 remains PARTIAL until exact-head CI, independent security review and the full owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix are recorded. G-002 remains IN PROGRESS; no live API/migration identity or RLS readiness is inferred from source/CI evidence.
- PR #138 remains open and draft. No staging release, deployment, shared database mutation, migration 0070 application, grant/default-ACL change, RLS enablement or worker activation was performed.

### G-001 role-gate formatter and CI event reconciliation — 21 November 2026

- The controller test matrix now includes FINANCE alongside BUYER, ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN as negative merchant-mutation principals. The supported merchant roles remain MERCHANT_OWNER, MERCHANT_STAFF and legacy MERCHANT.
- RBAC seed source confirms ADMIN, MODERATOR and SUPER_ADMIN receive `catalog:offers:write`; ADMIN and MODERATOR also receive `catalog:offers:govern`. The explicit role gate is therefore required even when the permission guard passes: these platform roles must use governance routes rather than merchant create/propose/pricing/withdraw handlers.
- CI #1169 on commit `e1c499f146c514f0e5f5cd131a2b3f6b2819608f` passed lint, TypeScript typecheck and mobile analysis/tests, but failed changed-file Prettier on `catalog-offer-controller.spec.ts` and this tracker. Dependent API unit/coverage, PostgreSQL integration, migration and build jobs did not run.
- One-time formatter workflow run #12 completed successfully, formatted the two files with repository-locked Prettier and removed itself. CI #1171 on the formatter bot's cleanup commit returned `action_required` with no jobs; it is not a test result and does not ask the repository owner to approve anything. CI #1170 on the temporary-workflow insertion commit is superseded.
- The formatter-cleanup head's Vercel web/admin preview contexts report deployment rate limits. These are external preview statuses, not protected-environment approval requests.
- A normal app-authored commit is being used to trigger the full CI suite on the formatted source. G-001 remains PARTIAL until exact-head CI, independent security review and the complete owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix are recorded. G-002 remains IN PROGRESS; no live API/migration identity or RLS readiness is inferred from source/CI evidence.
- PR #138 remains open and draft. No staging release, deployment, shared database mutation, migration 0070 application, grant/default-ACL change, RLS enablement or worker activation was performed.

### G-001 expanded merchant role matrix and formatter reconciliation — 21 November 2026

- The merchant-offer mutation regression matrix covers supported merchant roles `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`, and denies `BUYER`, `FINANCE`, `ADMIN`, `MODERATOR`, `SYSTEM` and `SUPER_ADMIN` even when merchant write/govern permissions are present.
- RBAC seed source confirms platform ADMIN, MODERATOR and SUPER_ADMIN can receive offer write/govern permissions. The controller's explicit merchant-role check therefore remains necessary; administrative offer lifecycle operations stay on dedicated governance routes.
- CI #1169 passed lint/typecheck and mobile analysis/tests but failed changed-file Prettier on the controller test and progress tracker; dependent API, PostgreSQL, migration and build jobs did not run. Formatter run #12 corrected the files; CI #1171 then passed all executable jobs on cleanup commit `c18118793638f3c3f8d936e8608e228f56263e19`.
- Commit `1697c20240bfb3d82bc7c8520f8b6747da4e98ea` expanded the negative role matrix to include FINANCE and reconciled tracker wording. CI #1172 on that commit was cancelled during the formatter sequence.
- Formatter run #13 completed successfully and removed its temporary workflow. CI #1173 on the temporary-workflow insertion commit is superseded; CI #1174 on the formatter cleanup commit returned `action_required` with no jobs. Neither is accepted as code verification or a request for repository-owner approval.
- A new app-authored documentation reconciliation commit is triggering exact-head CI against the formatted expanded role matrix. G-001 remains PARTIAL pending that exact-head result, independent security review and complete owner/staff/buyer/foreign-merchant/platform-admin acceptance evidence. G-002 remains IN PROGRESS; no live API/migration identity or RLS readiness is inferred from source/CI evidence.
- PR #138 remains open and draft. No staging release, deployment, shared database mutation, migration 0070 application, grant/default-ACL change, RLS enablement or worker activation was performed.

### Project-memory handover system established — 21 November 2026

- Added the repository-level cross-chat handover system under `project-memory/`. Start new project sessions at `project-memory/START-HERE.md`; the companion files capture the current checkpoint, roadmap, decisions/constraints, work log, open issues and CI/release evidence.
- The handover documents are a navigation/checkpoint layer, not a replacement for this authoritative remediation plan, finding register, phase acceptance criteria or technical evidence files.
- The checkpoint was reconciled against GitHub PR #138, branch head `1c1cf2f5032cf789789f0efc527e3c976a9ceb78`, and CI #1176. CI #1176 failed the changed-file Prettier gate on the controller test and this tracker; lint/typecheck completed, Flutter passed, and dependent jobs were skipped. Do not treat this run as full test verification.
- Next: finish the grouped formatting correction, obtain a new exact-head CI result, then continue G-001 role/tenant acceptance work. G-001 remains PARTIAL; G-002 remains IN PROGRESS. PR #138 remains draft. All database, staging and deployment safety restrictions remain in force.

### Project-memory formatter follow-up — 21 November 2026

- Repository-locked Prettier formatter run #14 completed successfully and formatted the new handover files, README, remediation documents and G-001 controller test.
- The formatter removed its temporary workflow; verified the resulting tree does not contain .github/workflows/format-fix.yml.
- CI #1179 on cleanup commit 2776f97e902f7569afdc08ba75db8109238e9fcf returned action_required with no jobs; CI #1178 is on the pre-format input commit. Neither is accepted as exact-head verification of the formatted tree.
- Next app-authored checkpoint commit must trigger full CI on the formatted tree. G-001 remains PARTIAL; G-002 remains IN PROGRESS. PR #138 remains open and draft; all staging/database safety restrictions remain unchanged.

### G-001 offer existence confidentiality hardening — 21 November 2026

- Added a scope-first merchant offer service boundary: owning-organization and ACTIVE store-membership checks occur before full offer detail is loaded.
- Unknown, foreign-organization and same-organization non-member offer identifiers now share the same 404 response on merchant detail, proposal, pricing-update and withdrawal paths.
- Added service/controller regression coverage for 404 parity, lookup ordering, active-member access and separation of permission-gated governance reads.
- Source and tests are committed. Focused API unit tests and exact-head CI remain pending; G-001 remains PARTIAL pending the complete acceptance matrix and independent security review.

### G-001 active-store buyer visibility — 21 November 2026

- Buyer-facing product offer lists and ranked seller results now require the owning store to have status ACTIVE in addition to the offer being ACTIVE and available.
- DRAFT stores retain merchant management access but their offers are not exposed through buyer discovery.
- Added unit coverage for both buyer query paths and the no-active-store case. Focused API tests and exact-head CI remain pending; G-001 remains PARTIAL.

### G-001 active-store query efficiency refinement — 21 November 2026

The ACTIVE-store buyer visibility rule is enforced with a correlated SQL EXISTS predicate in both product offer list queries. This avoids fetching every active store ID into application memory and keeps the store lifecycle check in the database query. Unit tests assert the correlated EXISTS predicate for both list and ranked paths.

### G-001 merchant read-surface acceptance expansion — 21 November 2026

- Expanded the positive merchant-principal controller matrix so MERCHANT_OWNER, MERCHANT_STAFF and legacy MERCHANT are exercised across merchant offer lists, analytics, trends and scope-first offer detail.
- Added FINANCE to the negative privileged-read matrix, preserving the requirement for explicit offer-governance permission rather than relying on a generic platform role.
- Added a foreign-organization trend-denial regression assertion that verifies the trend service is not called after tenant authorization fails.
- These are source-level regression additions only. Focused API tests and exact-head CI are pending; G-001 remains PARTIAL pending the full acceptance evidence and independent security review.
- No database, staging, deployment, worker or environment changes were made.

### G-001 missing-organization and membership-denial coverage — 21 November 2026

- Extended the controller authorization regression matrix to deny foreign-organization merchants from offer lists before service access.
- Added a fail-closed case for merchant principals with no active organization.
- Added analytics denial coverage for revoked/inactive store membership, asserting the analytics service is not called.
- These are source-level test additions only. Focused API tests and exact-head CI remain pending; G-001 remains PARTIAL pending complete acceptance evidence and independent security review.
- No database, staging, deployment, worker or environment changes were made.

### G-001 store lifecycle acceptance — 21 November 2026

- Added controller regression coverage confirming an ACTIVE store member retains merchant-side offer-management access while the store is DRAFT.
- This preserves the recorded lifecycle distinction: DRAFT stores remain manageable by their merchant members, while buyer-facing offer discovery is restricted to ACTIVE stores by the correlated SQL visibility predicate.
- This is test-source coverage only; focused API tests and exact-head CI remain pending. No policy was inferred for SUSPENDED stores.
- G-001 remains PARTIAL pending complete acceptance evidence and independent security review.

### G-001 PostgreSQL ACTIVE-store visibility regression — 21 November 2026

- Corrected the catalog lifecycle PostgreSQL fixture to create both merchant stores as ACTIVE, matching the buyer-discovery scenario rather than inheriting the schema's DRAFT default.
- Added a real PostgreSQL regression that changes Merchant B's store to DRAFT, verifies its offer disappears from both buyer product-offer list and ranked seller results while Merchant A remains visible, and restores ACTIVE in a `finally` block.
- This directly exercises the correlated SQL EXISTS lifecycle predicate against PostgreSQL. The test has been committed but not yet executed in CI; exact-head API unit and PostgreSQL integration results remain pending.
- G-001 remains PARTIAL pending the complete acceptance matrix and independent security review.

### G-001 PostgreSQL offer-detail confidentiality and revocation regression — 21 November 2026

- Added real PostgreSQL service-boundary coverage proving foreign-organization merchants and same-organization non-members receive the same not-found result from merchant offer detail.
- Added a membership-revocation scenario that marks the owning store membership INACTIVE, verifies detail access is denied, and restores the fixture to ACTIVE in a `finally` block.
- These tests complement the controller role matrix and the PostgreSQL buyer-visibility lifecycle test. They are committed but not yet CI-executed.
- G-001 remains PARTIAL pending exact-head API/PostgreSQL CI, remaining acceptance evidence and independent security review.

### G-001 PostgreSQL merchant-staff detail acceptance — 21 November 2026

- Added a disposable-PostgreSQL service test that creates an ACTIVE MEMBER row and verifies a `MERCHANT_STAFF` caller in the owning organization can read the store's offer detail.
- The test marks its temporary membership INACTIVE in a `finally` block so the shared integration fixture remains deterministic for later scenarios.
- This adds real database evidence for the owner/staff distinction; controller role coverage remains complementary. Exact-head API/PostgreSQL CI is still pending.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized in this change. Exact-head CI must verify the resulting commit before G-001 status changes. G-001 remains PARTIAL pending full CI, remaining role/tenant acceptance and independent security review. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## CI #1265 regression analysis and tenant-fixture correction — 21 November 2026

Exact-head CI [#1265](https://github.com/nabeel2323/scs-platform/actions/runs/44897469038) evaluated branch head `36399ce6704b0774f0ebb0f670a3e7d735b19295`. Lint/typecheck/changed-file formatting, Flutter, E6 boundary lint, migration full-apply (including the disposable-PostgreSQL read-only access audit and public-schema hardening checks), and Web/Admin tests passed. API unit/coverage and PostgreSQL integration failed; Contract Spec & Codegen, Container Build & Smoke, Build, k6 and staging release were skipped after upstream failures. The two Vercel web/admin status contexts separately reported the provider's build-rate-limit page and are not application test results.

The failure summary reported 7 failed assertions in the PostgreSQL integration suite (1,486/1,646 passed) and 5 failed test files in the coverage run (4,405 passed, 7 failed, 263 skipped). The common root cause was test-only Drizzle schema metadata: five real-PostgreSQL suites created `DatabaseService` with explicit schema maps that omitted `storeMembers`, so the newly enforced `assertStoreMember` lookup reached an undefined `db.query.storeMembers`. The affected suites were Phase 1 marketplace, Phase 2 multi-merchant, Phase 3 security, Phase 4 import-commerce and transaction-lifecycle. Phase 4 offer/cart/checkout failures were downstream cascades after offer creation failed.

The grouped correction adds `storeMembers` to all five Drizzle schema maps (and its missing import in Phase 1). Buyer-discovery fixtures are explicitly ACTIVE in all five suites because the G-001 buyer offer query now intentionally excludes offers belonging to DRAFT stores. This changes test fixtures only; it does not weaken or bypass the production membership authorization guard. Exact-head CI after this correction is required before treating the acceptance coverage as verified. G-001 remains PARTIAL pending the complete role/tenant matrix and independent security review.

No shared database, staging, grants, RLS, migration, deployment, worker or external business side effects were changed.

## G-002 additional read-only database checks — 21 November 2026

A subsequent read-only database check reported:

- PostgreSQL confirmed RLS is disabled on 111 of 111 tables in the query's table scope.
- 32 public-schema functions were found; none were marked `SECURITY DEFINER`.
- `anon` and `authenticated` do not have `BYPASSRLS`; the privileged `service_role` does and must remain server-side.
- The performance advisor reports 55 foreign-key constraints without covering indexes. Treat this as a workload/performance follow-up, not immediate schema-change authorization.
- Earlier direct privilege checks found no DML grants to `anon`/`authenticated` on sampled tables, but the complete grant/ACL audit and application access model remain unresolved.
- The separate Render review found OTP verification codes in plaintext logs. The source-level cause and redaction fix remain to be traced and verified.
- Render showed one API service and no separate worker service in the inspected workspace; this does not prove whether workers run inside the API process. Worker registration and startup flags still need source/runtime reconciliation.
- The configured startup command runs migrations and RBAC seed; logs reported 63 migrations applied. A safe repeatable deployment procedure remains to be established before any restart/deployment.

The earlier schema inventory reported 114 relations, while this check reports 111 tables. These are not assumed to be equivalent scopes; reconcile the inventory query/table/partition definitions before finalizing the per-table matrix. No grants, policies, migrations, workers, deployment configuration or shared data were changed by this read-only review.

## CI #1266 formatting-gate regression — 21 November 2026

Exact-head CI #1266 on `52336f751dc2558b10834940034833b4573c5ca4` passed Flutter analysis/tests and completed lint/typecheck with zero errors (309 existing warnings), but failed the changed-file Prettier gate on nine files: the Phase 2, Phase 3 and Phase 4 integration suites, the progress tracker, and five project-memory documents (CURRENT-STATE, IMPLEMENTATION-ROADMAP, OPEN-ISSUES, RELEASE-AND-CI-STATUS and WORK-LOG). API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, contract/codegen, container and build jobs were skipped. This is a formatting-only gate failure; no functional test result was produced for the corrected fixtures. The repository-locked Prettier formatter is being run over all changed test and handover files, including this tracker. A fresh exact-head CI is required after the formatted commit.

### G-002 evidence reconciliation note

The additional read-only check reports 111/111 tables with RLS disabled, while the existing live inventory records 114 public relations (100 ordinary tables, one partitioned parent and 13 partitions). These counts have different/unconfirmed scopes and must not be silently equated. The detailed FK review records 71 exact leading-column candidates versus the advisor's 55; retain these as distinct measurements pending semantic reconciliation. The additional check reports 32 public functions and none marked SECURITY DEFINER; this is compatible with the earlier function review but does not settle EXECUTE grants or mutable search_path.

The additional audit note's claim that the Render startup command runs migrations/RBAC seed and that 63 migrations were applied conflicts with the existing source/topology evidence: the inspected production start command is `pnpm --filter @scs/api start:prod`, while the release workflow runs migrations and RBAC seed separately; the DB verification report recorded 69 custom-ledger rows at its inspection time. Treat the 63 count/command claim as unverified until the exact service command and log timestamp are reconciled. No restart or deployment is authorized to resolve this discrepancy. The absence of a separate worker service is consistent with the existing topology evidence that the outbox, shipping carrier, auto-complete and monitor workers are embedded in the API process; verify the deployed revision before making a new runtime claim.

## G-001 exact-head CI #1268 and independent review handoff — 21 November 2026

Live GitHub state was verified before this checkpoint: branch `remediation/phase-0-1-tenant-security` at `b73f72e34406c1260f214610539139d0d096b2de`; PR #138 remains open, draft and unmerged; base `develop` is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.

CI [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) passed all 10 executable jobs on that exact SHA: lint/typecheck/changed-file formatting, API unit/coverage, PostgreSQL integration, Web/Admin, migration full apply plus read-only access audit, E6 boundary lint, Flutter, contract/codegen, build and container smoke. k6 and protected staging release were skipped. The five test-only Drizzle `storeMembers` schema-map fixes and ACTIVE buyer-discovery fixtures are now verified by API unit/coverage and real PostgreSQL integration. Production authorization behavior was not relaxed.

The G-001 role/tenant acceptance coverage is mapped in [G-001 Independent Security Review Packet](./G-001-INDEPENDENT-SECURITY-REVIEW-PACKET.md). It documents the relevant controller/service and PostgreSQL suites, the intended invariants, and reviewer questions. It is a handoff artifact, not an independent review. G-001 remains PARTIAL until a reviewer other than the implementation author records the review scope, date, conclusion, findings and disposition. No finding is closed merely because CI is green.

G-002 remains IN PROGRESS. The actual staging API/migration identities, protected read-only staging audit and reviewed least-privilege/RLS design remain unresolved. No shared database grants/default ACL, RLS, migration 0070, staging deployment/write, environment or worker changes were performed.

## G-001 INACTIVE-store buyer-visibility acceptance extension — 21 November 2026

Added `hides buyer offers for an INACTIVE store` to `apps/api/src/__tests__/integration/catalog-lifecycle.e2e.spec.ts`. Against disposable PostgreSQL, the test sets Merchant B's store to `INACTIVE`, verifies its offers are excluded from both buyer list and ranked results while Merchant A's ACTIVE store remains visible, then restores the status in `finally`. This closes the explicit inactive-store buyer-visibility test dimension without defining merchant-management behavior for inactive stores. The test is committed but awaits exact-head PostgreSQL integration CI. G-001 remains PARTIAL pending that CI and independent security review.

## G-001 INACTIVE-store test and exact-head CI handoff — 21 November 2026

The disposable-PostgreSQL lifecycle test now explicitly sets Merchant B's store to `INACTIVE`, verifies that both buyer list and ranked-offer paths exclude its offers while Merchant A's ACTIVE store remains visible, and restores the fixture in `finally`. This adds test-source coverage only; the behavior is not considered CI-verified yet.

CI #1271 passed all 10 executable jobs on `71550c4c6d71de1b3b54f6d2230b308251a73e23`, before this test was added. CI #1272 on test commit `6a7a620f9a68528ec7f638dbf85ad3c13031a5e5` failed only changed-file Prettier on seven Markdown files; API unit/coverage and PostgreSQL integration were skipped. Temporary formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) succeeded and removed itself, producing formatted documentation commit `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`. CI #1273 for that formatter-bot commit returned `action_required` with no jobs; it is not a test result.

**Next:** obtain a normal exact-head CI run for the formatted branch commit and inspect API unit/coverage plus real PostgreSQL integration. Keep G-001 PARTIAL until those pass and an independent security reviewer records findings and disposition. G-002 remains IN PROGRESS; no protected staging or shared-database changes are authorized.

## CI #1275 — handover-document formatting correction required — 21 November 2026

Exact-head CI [#1275](https://github.com/nabeel2323/scs-platform/actions/runs/44922283263) on `d67875507a07a75f2945b44beb7bfbec387f169e` passed lint, TypeScript typecheck, Flutter analysis and Flutter tests. The changed-file Prettier gate failed on five Markdown files: this tracker, `project-memory/CURRENT-STATE.md`, `project-memory/OPEN-ISSUES.md`, `project-memory/RELEASE-AND-CI-STATUS.md` and `project-memory/WORK-LOG.md`. API unit/coverage, PostgreSQL integration and all dependent jobs were skipped. The newly added INACTIVE-store PostgreSQL test has not yet executed in CI. Apply repository-locked formatting and obtain a normal exact-head run; keep G-001 PARTIAL until API unit/coverage and PostgreSQL integration pass and independent security review is recorded.

## G-001 INACTIVE-store buyer visibility — exact-head CI verification — 21 November 2026

The source commit `ffd3961c32164c2af00090b32dbafb06b997a581` contains the PostgreSQL lifecycle test `hides buyer offers for an INACTIVE store`. It changes Merchant B's store to `INACTIVE`, verifies both buyer product-offer list and ranked-offer results exclude that store while Merchant A's ACTIVE store remains visible, and restores the fixture in `finally`.

Exact-head [CI #1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on that source SHA. The PostgreSQL integration job passed while executing `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services; API unit/coverage and all other executable jobs also passed. Therefore the INACTIVE-store regression is now **CI-verified**. k6 and protected staging release were skipped. This CI result does not establish staging/production runtime behavior.

G-001 remains PARTIAL solely pending an independent security review and disposition of any reviewer findings. G-002 remains IN PROGRESS. No shared database, staging, deployment, migration 0070, grants/default ACL, RLS or worker changes were performed.

## G-002 database identity and RLS architecture checkpoint — 22 November 2026

PR #138 exact-head CI [#44948332893](https://github.com/nabeel2323/scs-platform/actions/runs/44948332893) passed all 10 executable jobs, including migration full apply and the read-only database-access audit. The migration CI job created a separate `scs_audit` login with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` and `NOINHERIT`, granted only database CONNECT, and ran the audit utility successfully against disposable PostgreSQL 16. The audit role could inspect catalog metadata without application table privileges. The migration runner's `scs` identity in this run was a disposable CI superuser; it is not the live staging migration identity.

PR #142 CI [#44948310469](https://github.com/nabeel2323/scs-platform/actions/runs/44948310469) passed all 10 executable jobs on source SHA `6567eb3b94de62514b5e8c5b9512cef995a8dd7f`. A new real-PostgreSQL test was then added to verify the API identity SQL against distinct login/effective roles using a non-owner, non-superuser, non-BYPASSRLS login. Exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) is still in progress on `dddff20c170737dc4694008bb807b2b90e177f77`; the added integration test remains pending verification.

The new [G-002 RLS architecture design](./G-002-RLS-ARCHITECTURE-DESIGN.md) records the target role model, transaction-bound tenant context, initial ownership classification, test requirements and rollout gates. The key blocker is that the current API uses a process-wide Drizzle pool and the inspected middleware does not bind every request query to a transaction with verified tenant context. A session-level tenant variable on a pooled connection would risk cross-request leakage. RLS remains disabled until transaction-local context is established and all HTTP, worker, webhook, audit and bootstrap paths use explicit transaction handles.

G-002 remains IN PROGRESS. Actual staging API/migration identities and the protected read-only staging audit remain unverified. No staging deployment, shared database mutation, migration 0070, grant/default-ACL change, RLS enablement or worker activation occurred.

## G-002 schema inventory and exact-head CI — 22 November 2026

Exact-head CI is now complete for both open draft remediation PRs:

- PR #138 source SHA 741a09f68721898a5bed6601bc3bc636867c78c2 — [CI #44954371615](https://github.com/nabeel2323/scs-platform/actions/runs/44954371615) passed all executable jobs. k6 and protected staging release skipped.
- PR #142 source SHA dddff20c170737dc4694008bb807b2b90e177f77 — [CI #44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) passed all executable jobs, including the added disposable-PostgreSQL integration test that verifies distinct login/effective roles using a non-owner, non-superuser, non-BYPASSRLS login. k6 and protected staging release skipped.

Added G-002-TABLE-OWNERSHIP-MATRIX.md. It enumerates 99 named tables from the Drizzle schema export and records candidate row scopes plus required completion evidence. It does not claim completeness against the historical 116-table live inventory; exact columns/FKs, route/service/worker operation paths and raw-SQL-only objects remain to be reconciled. All candidate scopes remain unapproved.

Both PRs remain open, draft and unmerged. G-001 remains PARTIAL pending independent security review. G-002 remains IN PROGRESS pending actual staging API/migration identity evidence, refreshed protected read-only inventory, completed per-operation matrix, transaction-bound tenant context, isolated RLS tests and approval. No staging deployment, shared DB mutation, migration 0070, grant/default-ACL change, RLS enablement or worker activation occurred.


## 22 November 2026 — Current source and CI reconciliation

- PR #138 branch head is caba922e866635fad51e549e095a186f9d9df6cf; PR remains open/draft/unmerged. Exact-head Actions lookup returned no workflow run because the grouped source commits used [skip ci]. Vercel Admin and Web statuses are SUCCESS on source head caba922; no GitHub Actions workflow run is attached. Vercel build status is separate from the deferred application test campaign.
- PR #142 head dddff20c170737dc4694008bb807b2b90e177f77 remains open/draft/unmerged. CI #1293 / run 44953735602 passed on that exact head, including its disposable PostgreSQL identity integration test; live staging identity remains unverified.
- Admin read permission, cart mutation permission and Aramex registry wiring changes are implemented in source. Focused regression tests were added, not executed. The full test campaign remains NOT STARTED by design.
- MAP-001 now has a 28-controller route-family inventory, API wrapper symbol map and worker/provider activation cross-reference. Exact page/screen call-site tracing, operation-level DB ownership mapping and live-catalog reconciliation remain open.
- The latest detailed 19-November live catalog report and 21-November Drizzle reconciliation agree on 114 public relations (99 Drizzle tables plus 15 non-Drizzle/partition relations). The table ownership matrix still contains a separate 116-table historical count; its scope is not reconciled. Treat the discrepancy as open and resolve it only with a refreshed protected read-only catalog audit.
- G-001 remains PARTIAL pending independent security review. G-002 remains IN PROGRESS. Do not apply migrations 0070/0071, alter grants/default ACLs, enable RLS, activate workers, deploy or mutate staging/production as part of this source-only work.


## G-002 database access-path inventory — 22 November 2026

A bounded static review of all 53 API module service/worker/provider files plus DatabaseService, audit middleware/service, guards, AppModule and main.ts is recorded in docs/remediation/G-002-DATABASE-ACCESS-PATH-INVENTORY-2026-11-22.md. The source confirms singleton Drizzle access, multiple existing nested transactions, asynchronous audit writes after response completion, and worker/monitor/bootstrap paths outside HTTP request context. It does not prove live staging role identity or resolve the 114-versus-116 relation count. The next G-002 task is operation/ownership and runtime-context proof; a global request transaction and RLS activation remain blocked.


## Vercel status refresh — 22 November 2026

Exact PR #138 source head caba922e866635fad51e549e095a186f9d9df6cf reports SUCCESS for both Vercel Admin and Vercel Web. No GitHub Actions workflow run is attached to that head because the grouped source/documentation commit used [skip ci]. Application unit/integration/E2E validation remains deferred to Phase 3.


## G-002 operation and ownership evidence update — 22 November 2026

- Added a source operation map covering 26 service files and supporting worker/system paths, with Drizzle operations and raw-SQL touchpoints distinguished.
- Added a schema-backed ownership/predicate candidate matrix covering identity, organization/store membership, catalog, inventory/pricing, orders, shipments/drivers, payments/refunds/returns, disputes, user-private notifications, carrier credentials, audit/outbox and system operations.
- The matrix is not an approved policy. FK constraints, plain UUID references, all 99 Drizzle tables, DB objects, route callers, bootstrap/migration/CLI paths and exact predicates still require verification. The protected read-only staging catalog and actual runtime identities remain blocked on operator-approved access.
- No tests or CI were run; no live DB query/write, migration, grants, RLS, staging, deployment or worker activation occurred.


## API-003 permission-seed alignment — 22 November 2026

A static comparison of method-level permission decorators across the 28 API controller files in docs/api-route-permission-matrix.md found one key not present in the canonical seed: merchant:products:read. The five affected CatalogController read routes now use catalog:products:read, preserving service-level store/org checks. StoreMembershipController member listing now uses merchant:stores:read; the existing key is granted to MERCHANT_STAFF as well as MERCHANT_OWNER. All writes remain guarded by merchant:products:write and service-level membership-manager checks. Focused regression tests were added for metadata, guard behavior and role grants; execution is deferred. API-003 is IMPLEMENTED / NOT VERIFIED.


## G-002 migration FK crosswalk update — 22 November 2026

The migration crosswalk now includes core schema relationships from migrations 0001, 0003, 0004, 0005, 0009, 0010, 0023, 0026, 0040, 0041, 0034, 0043, 0054, 0058–0063, 0070 and 0071. It records deferred FKs, non-FK org_id scope metadata, system tables without actor/tenant FKs, and cross-parent consistency gaps not protected by composite constraints. This is static migration evidence, not a refreshed staging catalog or complete 114/116 relation audit. Exact current constraints still require protected read-only verification.


## G-002 service and CLI access-path continuation — 22 November 2026

- Reconciled the API source tree at 06c5f25f1e0a967129ddae8b94b33e060f2e9691: all 53 service/worker/poller/dispatcher/executor candidates were inspected. The operation map now records 44 DB-operation-bearing paths and identifies 9 database-independent parser/rule/provider/crypto helpers.
- Added docs/remediation/G-002-CLI-AND-BOOTSTRAP-ACCESS-MAP-2026-11-22.md. It maps the API runtime pool and dev/test auto-migration/seed path, the DATABASE_URL migration runner and local Docker runner, migration identity/lock helpers, RBAC/catalog/demo seeds, bootstrap token issuance/completion, staging provisioning, read-only DB audit, destructive reset tools and legacy M5/M6 UAT/migration harnesses.
- Hardened apps/api/scripts/create-admin-user.ts: explicit development/test and local-host guard, caller-supplied credentials, transaction-bound organization/user/membership creation, no fixed or logged password.
- Hardened apps/api/infra/drizzle/reset-pg.ts: explicit environment, exact database name, typed destructive confirmation, local-host restriction for development/test, separate staging approval, and connected-database identity match. Not executed.
- Hardened apps/api/scripts/m6-env-check.ts: local API/Redis host validation, explicit UAT opt-in and caller-supplied credentials; OTP and raw verification response are not logged.
- Source inspection confirms application OTP logging redaction is already present in IdentityService/OtpDeliveryService and covered by otp-redaction and otp-security-remediation tests. This does not prove historical or current staging logs are clean; runtime log verification remains pending.
- No unit/integration/migration/client tests were run, no Actions workflow was triggered, and no staging/shared DB command or provider/worker action was executed.
- Remaining G-002 blockers: exact controller/route-to-operation predicates, legacy UAT script guard/retirement, uniform staging bootstrap target confirmation, live API/migration identity and protected 114-versus-116 catalog evidence. Do not implement request-scoped transaction propagation or RLS activation until those proof gates are complete.


## G-002 controller callsite mapping and webhook tenant-routing fix — 22 November 2026

- Added docs/remediation/G-002-CONTROLLER-TO-SERVICE-CALL-MAP-2026-11-22.md covering all 28 module controllers, controller method→service method callsites, four direct-DB controllers, six controllers using shared tenant-scope helpers, and the shipment/provider/bootstrap/operator context boundaries.
- Confirmed the four direct DatabaseService controller paths: StoreMembershipController (stores/store_members), CarrierAdminController (shipments/stores), CarrierWebhookController (carrier_credentials/carrier_webhook_events/shipments/outbox_events), and ShipmentOperationsController (shipments/stores/orders/shipment_events/shipment_labels/outbox_events).
- Mapped common tenant-scope helpers to stores, store_members, products, product_variants, warehouses, inventory_items and order/master-order ownership. These helpers use the singleton DatabaseService rather than the caller's active transaction.
- Found a multi-tenant ambiguity in the legacy providerKey-only carrier webhook route: findFirst could select an arbitrary active credential if multiple organizations configured the same provider. Changed the legacy path to inspect at most two active credentials and return 401 when more than one exists; exactly-one legacy behavior and exact token route remain supported.
- Added focused controller tests for ambiguous legacy route rejection, single-credential compatibility and exact provider/token lookup. Tests were not run.
- Updated the G-002 operation map and DB-003 register. Remaining work: physical DB-object inventory, method-level ownership predicate validation, legacy UAT script guard/retirement, staging bootstrap target guard, live runtime identity and protected 114-versus-116 catalog evidence.
- No webhook was invoked, no worker/provider action occurred, no database query/write or migration was executed, no staging/deployment action occurred, and no test/CI run was triggered.


## G-002 physical database object inventory and read-only audit enhancement — 22 November 2026

- Source-reconciled the 15 non-Drizzle public relations in the 19-November 114 r/p table count: public._migration_log, public.backfill_errors, and 13 analytics_events partition children (analytics_events_default plus p20260101–p20261201). The 99 Drizzle declarations plus these 15 relations equal 114.
- Traced _migration_log to the migration runners; it is created dynamically and written transactionally with each migration under a session advisory lock. The 19-November report recorded 69 rows/latest 0069; 0070/0071 were not applied to the shared DB.
- Traced backfill_errors to migration 0053_attribute_backfill.sql. The migration creates it and writes PRODUCT/VARIANT conversion/conflict errors; no Drizzle declaration, FK, tenant owner column or API reader/writer was found in the inspected source tree.
- Traced analytics_events partitioning to migrations 0002/0013/0018 and audit.schema.ts. pg_partman owns monthly partition management, with a default partition and 12 monthly partitions listed in the 19-November snapshot. The analytics controller derives event user/org from CurrentUser; analytics:read is assigned to platform ADMIN/SUPER_ADMIN, while merchant roles receive analytics:track.
- Extended apps/api/scripts/audit-db-access.ts (still read-only) to report public relation counts by relkind, per-relation owner/RLS/policy/extension/partition metadata, parent/child partition bounds and safe summaries for _migration_log/backfill_errors. The extension inventory now includes all installed extensions, not only pg_trgm.
- Added docs/remediation/G-002-PHYSICAL-DATABASE-OBJECT-INVENTORY-2026-11-22.md and linked it from the schema reconciliation, CLI map and operation map.
- No audit was executed, no database contents were read, no live query/write, migration, seed, reset, grant, default-ACL, RLS, deployment, worker or provider action occurred.
- The 114-versus-116 discrepancy remains unresolved until the enhanced audit is run with an explicitly approved protected read-only connection and its relation-kind scope is compared with the historical count.


## G-002 method-level ownership predicate batch 1 — 22 November 2026

- Added docs/remediation/G-002-METHOD-LEVEL-OWNERSHIP-PREDICATE-MAP-2026-11-22.md for OrdersService, PaymentsService and InventoryService.
- Confirmed public OrdersController routes pass CallerContext or a specific buyer/driver identity; payment detail helpers are unscoped by UUID but controller paths apply assertOrderAccessible; admin global queues rely on platform-only permissions and service role checks; inventory controller routes pass CallerContext to active org/store-membership helpers.
- Identified InventoryService.transferStock missing the same-store relationship check already enforced by createItem. Fixed it so source warehouse, destination warehouse and variant store must match for both caller and system paths.
- Added inventory-transfer regression test; not run. No tests, CI, database or staging actions occurred.


## G-002 method-level ownership predicate batch 2 — Catalog family — 22 November 2026

- Extended the method-level map to CatalogService, CatalogOfferService, ProductGovernanceService and CatalogTaxonomyService.
- Confirmed canonical product discovery filters storeId IS NULL, deletedAt IS NULL and ACTIVE status; bulk product operations select valid IDs constrained to storeId; variant update/delete/toggle and typed attribute writes bind variant to product; media reorder/remove bind media to product; import jobs are controller-scoped to active org/store membership.
- Fixed four catalog/offer ownership gaps: variant attribute GET now verifies variant belongs to authorized product; addMedia rejects foreign variantId; updateVariant legacy UPDATE includes productId; createOffer rejects private products owned by another store.
- Added focused regression tests for the catalog controller variant-attribute read, media attachment and offer product scope. Not run. Existing inventory transfer store-boundary test also remains unrun.
- No tests, CI, DB query/write, migration, seed, grant, RLS or staging action occurred.


## G-002 method-level ownership predicate batch 3 — Pricing, Merchant and Store Membership — 22 November 2026

- Extended the method-level map to PricingService, MerchantService and StoreMembershipService.
- PricingService now independently validates variant → product → store against the owning price list for tier creation, update, removal and price resolution, and against the requested store for product-pricing reads. This preserves the same-store invariant even when service methods are called without the controller preflight.
- Merchant document reads, merchant presigning and organization verification listing now require current ACTIVE organization membership. A still-valid JWT activeOrg claim no longer lets an inactive organization member pass these service checks.
- Document upload now receives CallerContext from MerchantController. Service validation requires activeOrg equality and ACTIVE organization membership; optional storeId must belong to the same org and have ACTIVE store membership. Organization-scoped store/customer reads also receive caller context and revalidate active membership.
- Added merchant-service-tenant-scope.spec.ts and pricing-service-tenant-scope.spec.ts for foreign/inactive membership and cross-store relationship denials. Tests were not run.
- No tests, Actions, database connections/queries, migrations, grants, RLS, staging/deployment or worker/provider actions were performed.
- Remaining method-level families: Returns/Disputes/Reviews; carrier/shipping; worker/outbox/bootstrap/system. Pricing caller-context propagation and controller-preflight concurrency windows remain explicit follow-up design work.


## G-002 method-level ownership predicate batch 4 — Returns, Disputes, Reviews and Financial Controls — 22 November 2026

- ReturnsService inspection no longer searches all inventory globally by canonical variant. It resolves the return order's store and joins inventory_items to warehouses filtered by that store before restoration.
- SettlementAdjustmentService now derives target org from sub-order → store even when orgId is supplied, rejects cross-org subOrderId, validates optional returnRequestId belongs to the same sub-order, and revalidates tenant identity on locked transitions and detail reads.
- ReturnsController discrepancy resolution now uses financialOrgScope rather than passing user.activeOrg directly. ReconciliationService repeats the org predicate in the UPDATE and verifies a row was updated.
- Reviewed DisputesService participant boundaries and ReviewsService order/buyer/subject predicates; no additional code change was required in this batch. BusinessCalendarService is global platform configuration behind admin permission guards.
- Added returns-inspection-inventory-scope.spec.ts, settlement-adjustment-tenant-scope.spec.ts and reconciliation-tenant-scope.spec.ts. Tests were not run.
- No tests, Actions, DB connection/query/write, migrations, grants, RLS, staging/deployment, worker activation or provider calls occurred.
- Remaining method-level families: carrier/shipping; worker/outbox/bootstrap/system. Exact transaction-context propagation and protected live identity/catalog evidence remain open.


## G-002 method-level ownership predicate batch 5 — Carrier, Shipping, Webhook and Outbox — 22 November 2026

- Added shared assertActiveOrgMembership and applied it to shipping store CRUD, carrier credential/config management, shipment list/detail/action routes and carrier recovery routes.
- CarrierConfigurationsService.resolveForStore now verifies store→org and linked credential→same org/active status before returning a store override or org default.
- Removed Aramex's arbitrary cross-tenant active-credential fallback. Store-bound tracking, rate, batch and location operations resolve through store→org→configuration→active credential; unscoped address validation uses only the PLATFORM organization's credential.
- Updated shipment tracking callers in ShipmentOperationsController, ShippingCarrierWorker, CarrierTrackingPoller and CarrierReconciliationService to pass storeId.
- Added outbox event store/org metadata and worker-side store→org validation before carrier create/cancel/label/track side effects. Webhook retry rejects inactive credentials and verifies credential org against the shipment store.
- Direct shipment mutations repeat shipmentId + storeId.
- Added shipping-tenant-context.spec.ts and updated shipping-carrier-worker-label.spec.ts. Tests not run.
- No CI, database, migration, grant/RLS, staging, deployment, worker activation or carrier/provider call occurred.
- Remaining method-level families: worker/outbox/bootstrap/system and final raw DB object reconciliation. Protected live identity/catalog evidence and request transaction-context proof remain open.


## UX-012 — Mobile merchant pricing management and offer linkage — 22 November 2026

- Added /merchant/pricing and /merchant/pricing/:id, protected by merchant:pricing:read; write affordances require merchant:pricing:write.
- Added store-scoped price-list listing, creation, edit and activation/deactivation. Added quantity-tier create/edit/delete with product and variant selection; tier read responses include product title, variant title and SKU.
- Merchant Dashboard links to Pricing. Offer creation can select an active price list, sets offer currency to the selected list currency, and verifies a quantity tier covers the selected variant and minimum order quantity before creating. Offer details link to the associated price list.
- Added focused Flutter route-policy and API tier-enrichment tests. Not executed.

## UX-013 — Admin order item labels — 22 November 2026

- AdminService.getOrderDetail now joins orderItems to products and productVariants and returns productTitle, variantTitle and variantSku.
- Admin order detail renders product/variant labels and SKU rather than opaque UUIDs, retaining ID fallback for missing historical references.
- Added focused AdminService regression test. Not executed.

## G-002 PricingService store-scope follow-up — 22 November 2026

- PricingController.getProductPricing resolves the variant's store and passes it into PricingService.listTiersByVariant.
- listTiersByVariant now rejects calls without storeId and joins priceLists with a storeId predicate for both cross-list reads and a specific price-list read. getProductPricing passes its storeId through the internal call.
- Added a focused unit test for missing-store fail-closed behavior and the owning-store SQL predicate. Not executed.


## UX-027 retry-safety and UX-028 buyer return parity — 22 November 2026

- UX-027 source completion now includes target-scoped create retry markers and pre-retry existing-offer reconciliation; nullable current-offer pricing is handled safely. The change does not claim server-side atomic idempotency.
- UX-028 closes the source-confirmed buyer-return parity gap in Flutter using the existing API lifecycle. Mobile supports owner-scoped request creation on DELIVERED/COMPLETED orders, status display, cancellation and shipped handover.
- Focused tests: Product Studio helper tests and `mobile/test/returns_api_test.dart`. Not executed; comprehensive test execution remains scheduled for Phase 3.


## UX-028 exact source commit — 22 November 2026

- Flutter buyer-return parity is committed in source as `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf` (parent `9ce77fe3076adeafd58c26cb898bb1c5722d3baf`).
- Focused tests are present in `mobile/test/returns_api_test.dart`; not executed. Exact-head GitHub Actions lookup returned no workflow run because the source commit used `[skip ci]`.
- PR #138 remains open/draft/unmerged. Comprehensive testing stays in Phase 3; no staging or database action was performed.


## UX-029 — Mobile buyer return detail/history parity — 22 November 2026

- Reused the existing authenticated buyer return-detail endpoint and API wrapper to expose detail/history on the existing Order Detail screen.
- Detail sheet includes status, requested/actual refund, reason/description, tracking, inspection/merchant notes, returned item quantities/conditions and chronological lifecycle events. Detail-fetch errors expose a retry action.
- Added optional DTO fields and focused assertions to `mobile/test/returns_api_test.dart`. Not executed; comprehensive regression remains Phase 3.
- No API, schema, DB, route or permission changes.


## UX-030 — Web buyer self-service read/action recovery — 22 November 2026

- Source commit `b310f4da3ccda31f7a8c815f1d99ed1977329ad6` adds explicit retryable read errors to Notifications, Favorites, Saved Suppliers and Profile Sessions. Failed reads no longer render as successful empty results.
- Failed favorite/supplier remove actions are surfaced and preserve the row; pending remove buttons are disabled and labelled.
- Notification mark-read/unread failure rolls back to the exact pre-action `readAt` and `status`, and shows an action error.
- Added `apps/web/src/__tests__/buyer-self-service-recovery.test.tsx` covering all four read/retry paths and a failed favorite removal. Not executed; full test campaign remains Phase 3.
- No API/schema/DB/permission/route/migration change.


## UX-031 — Web Merchant Customers read recovery — 22 November 2026

- Source commit `18fe161297b3302c94c2a9df3a0dc24c68b4fbf8` corrects the Merchant Customers page's silent read failure: failed initial reads no longer render a false empty directory; a Retry action is available.
- Failed realtime/manual refresh preserves the last successfully loaded customer rows while surfacing the error.
- Added `apps/web/src/__tests__/merchant-customer-recovery.test.tsx` for initial failure/retry and stale-data preservation. Not executed; comprehensive testing remains Phase 3.
- No API, schema, DB, permission, route or migration change.


## UX-032 — Web Merchant Deliveries read recovery — 22 November 2026

- Source commit `b09dde7d7bd7de9c73f86b8dc5eb6b11271b3d81` adds a retry action to the Merchant Deliveries list read error and prevents a failed read from being represented as “No deliveries yet.”
- The existing loader retains the last successful rows when a refresh fails; the error banner remains visible for recovery.
- Added `apps/web/src/__tests__/merchant-deliveries-recovery.test.tsx`. Not executed; comprehensive testing remains Phase 3.
- No API, schema, DB, permission, route or migration change.

## UX-033 — Web Merchant Returns store selection and read recovery — 22 November 2026

- Replaced the manual Store ID input with the authenticated store directory from `GET /v1/stores`; the first available store is selected by default and merchants can switch stores.
- Added distinct retryable store-directory and return-list errors, status filtering, successful-empty-only rendering and stale-request cancellation/version protection.
- Added retry to Merchant Return Detail.
- Existing API authorization remains unchanged: list requires `merchant:orders:read`; return transitions require `merchant:orders:write`.
- Focused tests: `merchant-returns-recovery.test.tsx` and `merchant-return-detail-recovery.test.tsx`. Not run.

## UX-034 — Merchant Organization auxiliary read recovery — 22 November 2026

- Added visible retryable failures for verification history, update requests, store information, warehouses, roles and members; retained last successful auxiliary data across failed refreshes.
- A failed update-request read blocks verified-organization update submission until pending-request state is known. A primary profile/organization read failure no longer appears as a successful no-organization state.
- Role loading exposes retry and does not loop automatically after a failure.
- Focused test: `merchant-organization-recovery.test.tsx`. Not run.
- No API, permission, route, schema or database change.

## UX-034 follow-up refinement — 22 November 2026

- Added `rolesError` to the role-loader effect dependency list; the explicit error guard prevents automatic retry loops while keeping the effect dependency-complete.
- The warehouse summary no longer renders an empty table when the initial read fails, and its count is not presented as a confirmed zero.
- Commit `36c11c8be3c22cbdb79bd341d4a798f28dde30b6`. Not tested; exact-head Actions not run.

## UX-034 stale-data preservation refinement — 22 November 2026

- Member and document read failures now display their retryable error while retaining any last successful rows. Document counts show unavailable rather than zero when the read has failed.
- Warehouse count/empty presentation no longer implies a confirmed empty table when its read fails.
- Commit `3a8c5767ffd2a8e852ef0f7bcbe042da35dfa812`. Not tested; exact-head Actions not run.

## UX-035 — Merchant Orders store and queue read recovery — 22 November 2026

- Initial store discovery failure no longer disappears and cannot lead to a false “No orders yet” message.
- Added retryable store/order reads and visible queue loading. Retry reloads the selected store; if no accessible store remains, stale order/store selection is cleared.
- Added `merchant-orders-recovery.test.tsx`. Not run; API permissions and transitions unchanged.

## UX-036 — Merchant Offers list and analytics recovery — 22 November 2026

- Added explicit store-discovery loading/error/retry and no-store state; failed offer-list reads no longer show a successful empty list.
- Product-directory failure is visible/retryable and blocks offer creation until products are available.
- Analytics/trend errors have independent retry paths. Failed analytics no longer becomes zero sales in the table/CSV; trend failure no longer becomes “No sales in this range.”
- Added `merchant-offers-recovery.test.tsx`. Not run; no API/permission/schema/DB change.

## UX-037 — Merchant Inventory movement-history recovery — 22 November 2026

- Stock movement-history read failures now remain visible and retryable; the dialog does not present a failed request as a successful empty history.
- Extracted `readInventoryHistory` into `apps/web/src/lib/inventory-history.ts`; added `inventory-history-recovery.test.ts` for successful and failed responses.
- Tests not executed. No API, permission, schema or DB changes.

## UX-046 / UX-047 — Admin Users and Merchants UX completion — 22 November 2026

- UX-046 implemented: Admin User creation matches the optional-phone contract; organization and role lookups are independently retryable; initial membership requires both org and role or neither, with the same invariant enforced at the AdminService boundary. Dedicated User Detail exposes the existing audited profile-update endpoint, membership assignment/removal, confirmed status actions, and role-configured permissions rather than the global permission catalog.
- UX-047 implemented: Merchant Store Detail now displays locale, popularity-badge visibility, logo/cover previews and address from the existing store detail endpoint.
- Focused tests added: Admin create-user recovery, user role-permission/profile/membership display, merchant detail presentation, and API user-creation partial-membership rejection. Tests have not been executed; status remains IMPLEMENTED / TESTING_PENDING for the consolidated Phase 3 campaign.
- No new API routes, permission keys, schema, migrations, database changes, staging writes, grant/RLS changes, deployment or worker activation.

## UX-048 / UX-049 — Admin Roles and Audit Log recovery — 22 November 2026

- UX-048 implemented: Roles list exposes retry on failed reads and uses request-version guards with effect cleanup to prevent stale/unmounted updates.
- UX-049 implemented: Audit Log query responses are generation-guarded; older filter responses cannot overwrite newer results. Pending requests are invalidated during cleanup, errors expose Retry audit log, and last successful rows remain visible during refresh/failure.
- Focused tests added for role lookup retry, audit query response ordering and audit retry. Tests have not been executed; status remains IMPLEMENTED / TESTING_PENDING for Phase 3.
- No API routes, permission keys, schema, migrations or database changes.

## UX-050–UX-053 — Admin Catalog and Analytics recovery — 22 November 2026

- UX-050 implemented: Category Detail product-type, product and attribute-schema reads expose retryable errors and request-version guards. Attributes resolves linked product types directly and only publishes a complete schema union.
- UX-051 implemented: Product Type Detail Products tab exposes a retryable failure and successful-empty-only state with request cleanup protection.
- UX-052 implemented: Catalog Import Center separates history read failures from action errors, retries history reads, preserves last successful rows and suppresses false empty history.
- UX-053 implemented: Analytics event/activity reads use independent request generations, cleanup invalidation and direct retry controls; stale filter results are ignored.
- Focused tests added for each slice but not executed; all remain IMPLEMENTED / TESTING_PENDING for Phase 3. No API, permission, schema, migration or DB changes.

## UX-054–UX-057 — Admin finance, brand and calendar recovery — 22 November 2026

- UX-054 implemented: Commission Oversight status-filter reads are generation-guarded and retryable; failed reads no longer display a false empty result.
- UX-055 implemented: Offer KPI/Trend filters use request-version guards and cleanup invalidation; direct retry actions are available; failed initial reads no longer display zero metrics or false no-sales states.
- UX-056 implemented: Brand list exposes retry, guards stale responses and suppresses empty state after failed reads.
- UX-057 implemented: Business Calendar reads use request-version guards and retry; failed reads no longer appear as no configured calendar or empty holiday/audit lists.
- Focused tests added for all four slices but not executed; status remains IMPLEMENTED / TESTING_PENDING for Phase 3. No API, permission, schema, migration or DB changes.

## UX-058 — Admin Attribute directory recovery — 22 November 2026

- Implemented request-version guards and cleanup invalidation for Attribute Groups and Attribute Definitions. Failed reads expose accessible retryable errors and do not render successful-empty counts/rows. Filter requests in Attribute Definitions cannot overwrite newer results.
- Focused tests added for both pages but not executed; status remains IMPLEMENTED / TESTING_PENDING for Phase 3. No API, permission, schema, migration or DB changes.


## UX-059 — Admin Payments stale-data recovery — 22 November 2026

- The Payments page now tracks which tab produced the last successful response. Switching tabs cannot present rows from a different view as if they belonged to the selected tab.
- During a refresh, the current tab's last successful rows remain visible with a refresh status. If refresh fails, the retryable error explicitly identifies the displayed rows as the last successful result. An initial failure still does not render a false empty state.
- Added `admin-payments-recovery.test.tsx` for failed initial reads/retry and preservation of successful rows after a failed refresh.
- No payment, refund, approval, reconciliation, API, permission, schema, migration, database, staging or provider behavior changed. Tests remain pending the consolidated Phase 3 campaign.


## UX-060 — Admin Catalog Requests read recovery — 22 November 2026

- Added request-generation guards and effect-cleanup invalidation so an older type/status filter response cannot overwrite the currently selected filter, and pending reads cannot update state after unmount.
- Catalog Requests now gates the read on `catalog:requests:manage`; a user without access does not trigger the list API request.
- Added explicit retry for list-read failures, suppresses false empty states when the selected filter has never loaded successfully, preserves the last successful rows during refresh, and labels stale rows when a refresh fails.
- Separated list-read errors from approve/reject action errors so action failures do not mislabel valid rows as stale.
- Added `admin-catalog-requests-recovery.test.tsx` for initial failure/retry, stale filter response ordering and permission-gated reads. Tests remain pending the consolidated Phase 3 campaign.
- No API route, permission, business transition, schema, migration, database, staging or provider behavior changed.


## UX-061 — Admin Returns Oversight read recovery — 22 November 2026

- Added explicit Refresh for the selected return status filter.
- The page now tracks which status filter produced the last successful response. It preserves those rows during same-filter refreshes and after refresh failures, clearly labels stale results, and offers Retry.
- A filter change never displays rows from the previous filter as if they matched the new selection; an initial/changed-filter failure remains an error rather than a false empty state. Existing request-version and unmount guards remain in place.
- Added `admin-returns-recovery.test.tsx` for failed initial reads/retry, stale-data preservation after failed refresh, and isolation between status-filter result sets. Tests remain pending the consolidated Phase 3 campaign.
- No return workflow, refund calculation, action, API, permission, schema, migration, database, staging or provider behavior changed.


## UX-062 — Admin Settlements and Settlement Adjustments read recovery — 22 November 2026

- Settlements now tracks the status filter associated with its last successful response, exposes an explicit Refresh action, retains current-filter rows during refresh and after a failed refresh, and labels stale results with a retry path.
- Settlement Adjustments now applies the same filter-aware stale-data behavior while retaining its existing Refresh action, request-version guard and separate action-error channel.
- Neither page displays rows from a previous filter as if they belonged to the newly selected filter; failed first reads remain errors rather than successful empty states.
- Added `admin-settlements-recovery.test.tsx` and `admin-settlement-adjustments-recovery.test.tsx` for initial failure/retry, stale-data preservation and filter isolation.
- Tests remain pending the consolidated Phase 3 campaign. No settlement/adjustment business actions, payment logic, API, permissions, schema, migration, database, staging or provider behavior changed.


## UX-063 — Admin Reconciliation detail recovery — 22 November 2026

- Reconciliation detail refresh now preserves the last successfully loaded discrepancy detail when refreshing the same run. If the refresh fails, the retryable detail error is shown without discarding the last known detail.
- Added an explicit Refresh run details action and invalidates pending detail requests on unmount. Existing request-generation protection continues to prevent an older selected-run response from overwriting a newer selection.
- Added `admin-reconciliation-detail-recovery.test.tsx` for successful detail load followed by failed refresh with stale-detail preservation.
- Corrected the Catalog Requests result-count singular/plural label as a small UX-060 polish fix.
- No reconciliation execution, discrepancy resolution, financial record, API, permission, schema, migration, database, staging or provider behavior changed. Tests remain pending the consolidated Phase 3 campaign.


## UX-064 — Admin Order Detail cancellation/read separation — 22 November 2026

- Separated the cancellation mutation outcome from the subsequent order-detail refresh. A successful cancellation is no longer reported as a failed cancellation merely because the follow-up read fails.
- Added a distinct retryable detail-refresh error and an explicit Refresh order action; the last known order detail remains visible while the refresh is unavailable.
- Once the cancellation mutation succeeds, the UI suppresses repeat cancellation controls even if the follow-up read fails, preventing a stale pre-cancellation status from inviting a duplicate action.
- Added `admin-order-cancel-refresh.test.tsx` for mutation success followed by detail-read failure, truthful success messaging, stale-detail visibility and safe retry.
- No API, permission, order transition, stock/shipment side effect, schema, migration, database, staging or provider behavior changed. Tests remain pending the consolidated Phase 3 campaign.


## UX-065 — Admin Offer Detail inventory recovery — 22 November 2026

- Offer Detail inventory now records the variant ID associated with the last successful inventory response. A variant change cannot display the previous variant's stock as current.
- Added explicit Refresh inventory, loading feedback, retryable errors and preservation of the last successful inventory values after a same-variant refresh failure. Failed refreshes no longer discard the last successful stock summary.
- Added `admin-offer-detail-inventory-recovery.test.tsx` for successful inventory load followed by failed refresh with stale-data preservation.
- No inventory, stock, offer, API, permission, schema, migration, database, staging or provider behavior changed. Tests remain pending the consolidated Phase 3 campaign.


## UX-066 — Admin Variant Detail read recovery — 22 November 2026

- Added request-generation and unmount protection to the Variant Detail read; an older variant response cannot overwrite the currently selected ID or update state after unmount.
- The page now tracks the ID associated with its last successful response, retains same-variant details during refresh/failure, and never presents a previous variant as the selected variant after an ID change.
- Added explicit Refresh/Retry and refreshing feedback. Variant read errors and deactivate/reactivate/delete action errors now have separate UI channels.
- Added `admin-variant-detail-recovery.test.tsx` for stale-data preservation after a failed refresh.
- No variant business actions, API, permission, schema, migration, database, staging or provider behavior changed. Tests remain pending the consolidated Phase 3 campaign.


## UX-067 — Mobile Merchant Offer Detail analytics truthfulness — 22 November 2026

- Merchant Offer Detail no longer converts an analytics-provider loading/error state into a successful-looking `No sales data yet` message. Loading, unavailable and successfully empty analytics are now distinct states.
- Added a retry action for performance analytics and for trend failures; successful empty responses still render the legitimate no-sales state.
- Added `merchant_offer_detail_analytics_test.dart` to verify unavailable analytics are not rendered as zero-sales data and the retry action is visible.
- No offer, pricing, analytics API, permission, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-068 — Mobile Merchant Orders stale-read recovery — 22 November 2026

- Merchant Orders now retains the last successful list while a manual refresh is in progress and after a refresh fails, instead of replacing the entire queue with a spinner/error empty state.
- A failed refresh displays a clear retry banner and identifies the visible list as the last successful result. An initial failure still uses the existing error/retry state and cannot become a false successful empty state.
- Added `merchant_orders_read_recovery_test.dart` for stale-list preservation and initial failure/retry.
- No merchant order transitions, permissions, API calls, inventory reservation, fulfillment or other business behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-069 — Mobile Driver Shipments stale-read recovery — 22 November 2026

- Driver Shipments now retains the last successful shipment list during manual refresh and after refresh failures, with explicit stale-data messaging and Retry.
- Pull-to-refresh now awaits the refreshed provider result instead of completing immediately after invalidation; failures remain visible through the provider state while the last successful shipment list is retained.
- Initial read failures continue to show the existing retryable error state; no empty-shipment state is presented as a successful result after a failed first read.
- Added `driver_shipments_read_recovery_test.dart` for same-session stale-list preservation and initial failure/retry.
- No pickup, delivery, shipment status transition, permissions, API, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-070 — Mobile Buyer Order Detail refresh recovery — 22 November 2026

- Added an explicit order refresh action and request-generation protection for successive order loads. Responses from a prior load/order ID cannot replace the current order, and pending order responses are invalidated on dispose.
- The detail screen now retains and displays the last successful order while refreshing; if a refresh fails, it shows a retryable warning and identifies the visible order as the last successful response. Initial failures now provide an actionable retry instead of a dead-end error state.
- Status-history read failures are now visible with a retry action instead of silently appearing as an absent timeline.
- Added `order_detail_read_recovery_test.dart` for initial load, failed refresh with stale order preservation and retry recovery.
- No order/return/fulfillment business actions, API, permissions, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-071 — Mobile Merchant Inventory stale-page recovery — 22 November 2026

- Merchant Inventory now keeps the last successful page visible during same-page refresh and after refresh failure, with explicit stale-data messaging and Retry.
- Pull-to-refresh awaits the refreshed provider result; failures are surfaced through the provider state while the previous successful page remains available.
- A page/store change still uses its own keyed provider result and cannot display a previous page as if it were the new page. Initial errors continue to use the retryable error state.
- Added `inventory_read_recovery_test.dart` for stale-page preservation after refresh failure and initial failure/retry.
- No stock adjustment, transfer, low-stock, export, API, permission, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-072 — Mobile Cart stale-read recovery — 22 November 2026

- Cart now retains the last successful cart during refresh and after a refresh failure, with explicit stale-data messaging and Retry. The screen exposes a Refresh cart action.
- The same read status is shown when the last successful cart is empty; the buyer can distinguish a known-empty cart from an unavailable first read.
- Initial load failures continue to use the existing retryable error state. Cart mutations, idempotency, promo handling, MOQ/step constraints and validation behavior are unchanged.
- Added `cart_read_recovery_test.dart` for stale-cart preservation after refresh failure and initial failure/retry.
- No cart/checkout business behavior, API, permission, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-073 — Mobile Merchant Dashboard KPI recovery — 22 November 2026

- Merchant Dashboard KPI refresh now retains the last successful metrics during refresh and after a refresh failure, with explicit stale-value messaging and Retry.
- Initial KPI errors now include a Retry KPIs action instead of a static unavailable label. The dashboard's top-level Refresh action now also invalidates the KPI provider.
- Existing nullable revenue/units/low-stock values continue to render as unavailable rather than fabricated zero values.
- Added `merchant_dashboard_kpi_recovery_test.dart` for same-session stale KPI preservation after refresh failure and retry.
- No KPI calculation, merchant permissions, API, schema, migration, database, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-074 — Mobile Organizations list stale-read recovery — 22 November 2026

- Organizations now has an explicit Refresh action even when the membership list is empty, and pull-to-refresh awaits the provider result.
- The last successful organization list remains visible during refresh and after refresh failure, with stale-data messaging and Retry. Initial failures remain actionable errors rather than successful empty states.
- Added `organizations_read_recovery_test.dart` for stale-list preservation and initial failure/retry.
- Organization switching, token replacement, active-organization selection, creation and membership semantics are unchanged. No API, permission, database, migration, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-075 — Mobile Organization Detail independent stale-read recovery — 22 November 2026

- Organization Detail now exposes a Refresh action for both organization metadata and member list, while retaining the two reads as independent data states.
- Each tab preserves its last successful result during refresh and after refresh failure, with a tab-specific warning and Retry. A failed metadata read does not suppress a successfully loaded member list, and vice versa.
- Initial failures continue to use the existing retryable error states.
- Added `org_detail_read_recovery_test.dart` for independent stale metadata/member preservation.
- Restored the Organizations list's permission-aware empty-state copy for users who can create an organization.
- Organization switching, membership changes, invitations, roles and access-control behavior are unchanged. No API, permission, database, migration, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-076 — Mobile Profile stale-read recovery — 22 November 2026

- Profile now exposes an explicit Refresh action and retains the last successful profile while refreshing or after a refresh failure, with a retryable warning.
- Initial profile failures continue to use the existing retryable error state; profile edit form state is not reset by a same-screen refresh.
- Added `profile_read_recovery_test.dart` for stale profile preservation after refresh failure.
- Profile editing, OTP linking, authentication/session handling and sign-out behavior are unchanged. No API, permission, database, migration, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-077 — Mobile Store Profile refresh and active-organization safety — 22 November 2026

- Store Profile now exposes an explicit Refresh action and retains the last successful same-organization store details during refresh and after a failed refresh, with Retry.
- The form initialization is now keyed by store ID, so switching to a different store cannot leave the previous store's values in the editor.
- A cached store whose organization ID does not match the active organization is not presented as the active store while the new organization lookup is pending or failing.
- Added `store_profile_read_recovery_test.dart` for stale store detail preservation after refresh failure.
- Store editing, warehouse creation, currency/locale selection and permissions are unchanged. No API, database, migration, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-078 — Mobile Buyer Store Directory and Store Detail recovery — 23 November 2026

- Buyer Store Directory now has explicit refresh and pull-to-refresh. The last successful store list remains visible during refresh and after a failed refresh, with stale-data messaging and Retry. Initial failures remain actionable errors rather than successful empty states.
- Buyer Store Detail now uses a dedicated store-keyed, auto-disposed provider for its catalogue, preserving the existing buyer-only ACTIVE product filter. It exposes explicit refresh, pull-to-refresh, retryable initial errors and same-store stale catalogue preservation; an unavailable first read cannot become a false "No products" state.
- Added `store_buyer_read_recovery_test.dart` for store-list and store-catalogue stale-data preservation, initial failure/retry and successful empty states.
- No API, permission, product visibility, store lifecycle, cart mutation, database, migration, staging or provider behavior changed. The existing `fetchStoreProducts(..., status: 'ACTIVE')` contract remains authoritative. Flutter tests are pending the consolidated Phase 3 campaign.


## UX-079 — Mobile Buyer Order History read recovery — 23 November 2026

- Buyer Order History now keeps the last successful order list visible during refresh and after refresh failure. The selected status filter remains applied to that last successful list, and a stale-data notice with Retry makes the failed refresh explicit.
- Added explicit Refresh orders and a pull-to-refresh action that awaits the provider result. Initial failures remain retryable and cannot render as a successful empty order history.
- Added `buyer_orders_read_recovery_test.dart` for stale order preservation, initial failure/retry and filter-aware empty-state behavior after refresh failure.
- No order state transition, cancellation, payment, fulfillment, API, permission, database, migration, staging or provider behavior changed. Flutter tests remain pending the consolidated Phase 3 campaign.


## UX-080 — Mobile Search facet contract and request lifecycle — 23 November 2026

- Search attribute facet chips now reach the existing API contract as JSON `attrFilters` (attribute code to selected-value array). The API controller and SearchService already support this filter; the mobile client previously changed chip state but omitted it from the request.
- Added request-generation protection across query typing/debounce, filter changes, pagination and disposal so older responses cannot replace results for a newer query/filter set.
- Added explicit Refresh search. A same-query refresh keeps the last successful results visible with a refreshing notice; a failed same-query refresh identifies stale results. A failed different-query read clears old-query rows and suppresses the false "No products found" state.
- Pagination is disabled while loading or after an error, and append requests are accepted only for the current successful search key.
- Added an ApiService query-serialization test and a Flutter widget test proving a late older search response cannot overwrite a newer query. Tests remain pending Phase 3.
- No backend route, permission, search SQL, database, migration, product visibility, staging or provider behavior changed.


## UX-081 — Mobile Product Detail stable reads and recovery — 23 November 2026

- Replaced the inline `FutureBuilder` product fetch with a product-ID-keyed auto-disposed provider. The previous inline future was recreated on every stateful PDP rebuild, including gallery, variant and offer state updates, causing redundant product-detail requests.
- Added explicit refresh and pull-to-refresh with last-successful product preservation and retryable initial errors.
- Variant-matrix and offer-comparison reads now expose loading/error/retry states instead of silently swallowing failures; request generations prevent an old product's matrix/offers from overwriting a newly selected product after route reuse.
- Seller review read failures now have an explicit retry affordance instead of disappearing silently.
- Added Flutter widget coverage for stale product preservation after refresh failure, initial failure/retry and stable product request count across auxiliary-read rebuilds. Tests remain pending Phase 3.
- No product API route, permissions, cart/order behavior, database, migration, staging or provider behavior changed.


## UX-082 — Mobile Notifications read and action recovery — 23 November 2026

- Notifications now retain the last successful list during realtime-triggered or manual refresh and after refresh failure, with explicit refresh, pull-to-refresh, stale-data messaging and retry. Initial read failures remain distinct from a true empty inbox.
- Individual mark-as-read actions now expose per-row progress and catch/report failures instead of allowing an uncaught async action error. Mark All Read is extracted into a guarded action with success/failure feedback and retains its in-flight disable state.
- Added Flutter widget coverage for stale notification preservation, initial failure/retry and individual mark-read failure feedback. Tests remain pending Phase 3.
- Realtime subscription behavior and notification API contracts are unchanged. No provider, database, migration, staging or outbound notification behavior changed.


## UX-083 — Mobile Home discovery section recovery — 23 November 2026

- Categories, Popular Products and Suppliers sections now expose initial loading/error states and retry rather than silently disappearing on read failure. Refresh failures preserve their last successful data with an explicit stale-data notice.
- Home refresh now awaits each independent provider refresh while allowing other sections to complete when one fails; added an explicit Refresh home action.
- The notification badge no longer converts unread-count loading/error into a fabricated zero count; it remains unbadged until a successful count is available.
- Added Flutter widget coverage for stale category preservation, initial category failure/retry and unread-count failure not displaying a false zero. Tests remain pending Phase 3.
- No discovery API, permissions, role gating, database, migration, staging or provider behavior changed.


## UX-084 — Mobile Checkout idempotency-key payload alignment — 23 November 2026

- Payment-method changes on the Review step now mint a new checkout idempotency key because the request payload has changed. Retries of an identical payload continue to reuse the same key, preserving the existing network-timeout duplicate-prevention contract.
- Added a Flutter widget regression test that simulates two failed identical submissions followed by a payment-method change and successful submission; it asserts the first two keys match and the changed-payload key differs.
- No checkout API contract, backend idempotency behavior, order/payment state, database, migration, staging or provider behavior changed. Test remains pending Phase 3.


## UX-085 — Mobile Merchant Dashboard identity/store recovery — 23 November 2026

- Merchant Dashboard profile and active-store reads now preserve the last successful identity/store through refresh/reload failures, with visible stale-data notices and retry. Initial errors remain retryable.
- Explicit dashboard refresh and pull-to-refresh now await profile, active-store and KPI refreshes independently; one failing read does not prevent the others from completing.
- The store hub list is always-scrollable so pull-to-refresh works even when content is shorter than the viewport. Existing KPI-level recovery remains intact.
- Added Flutter widget coverage for simultaneous profile/store refresh failures with stale identity and storefront preservation. Test remains pending Phase 3.
- No organization/store lifecycle, permission, API, database, migration, staging or provider behavior changed.


## UX-086 — Mobile Merchant Catalog read recovery — 23 November 2026

- Active-store and merchant-product reads now preserve last-successful data through refresh/reload failure, with visible stale-data notices and retry. Initial failures remain errors rather than successful empty catalogues.
- Explicit Refresh catalog now awaits the active-store refresh, then refreshes products for the current resolved store. Pull-to-refresh awaits the product provider instead of invalidating and returning immediately.
- Existing product search/status filters and create/delete permission gates remain unchanged; successful empty and filtered-no-match states remain distinct.
- Added Flutter widget coverage for stale product preservation, initial failure/retry and true-empty catalogue state. Tests remain pending Phase 3.
- No catalog API, product visibility, permission, database, migration, staging or provider behavior changed.

## Mobile workflow implementation continuation — UX-087 / UX-088 — 23 November 2026

This is programme-level UX implementation evidence; it does not change the status or acceptance criteria of any G-001–G-035 audit finding.

- **UX-087 — Mobile Merchant Offer Detail:** implemented stale-safe offer and analytics refresh, retryable initial offer failure, independent offer/analytics/trend refresh, and unavailable-metrics handling rather than treating failed analytics as zero. Focused Flutter widget tests were added in `mobile/test/merchant_offer_detail_read_recovery_test.dart`; not executed.
- **UX-088 — Mobile Merchant Inventory:** implemented stale-safe active-store and inventory refresh, independent warehouse-directory retry/error handling, retained inventory rows on failed refresh, and pull-to-refresh for successful empty inventory. Focused Flutter widget tests were added in `mobile/test/merchant_inventory_read_recovery_test.dart`; not executed.
- Source commit: `df5a171762a5f6a5b365a13f491a975d4c6e9aa8`; focused inventory test commit: `fe508b0d30c791fb7597ec7f1c95d6b6968461b4`. The offer-detail focused test commit is `910466470d28c7d1eec08c80db47a74b6727f3bc`.
- Both deliverables are **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified. They introduce no API, permission, schema, migration, database, staging or worker changes.
- Continue Mobile merchant operational source audit, then remaining Web/Admin route/action permission mapping. Comprehensive testing remains deferred to Phase 3.

## Mobile merchant operational continuation — UX-089 / UX-090 — 23 November 2026

This is programme-level UX implementation evidence and does not change any G-001–G-035 audit finding status.

- **UX-089 — Mobile Merchant Pricing:** implemented stale-safe store/list/detail/tier reads, independent retry/error states, awaited refresh, pull-to-refresh for successful empty states, and an unavailable tier count when the initial tier read has not succeeded. Four focused Flutter widget scenarios added in `mobile/test/merchant_pricing_read_recovery_test.dart`; not executed.
- **UX-090 — Mobile Merchant Customers:** implemented stale-safe customer directory/statistics, retryable initial errors, awaited explicit/pull-to-refresh and true empty/no-match states while preserving search/sort state. Focused Flutter widget scenarios added in `mobile/test/merchant_customers_read_recovery_test.dart`; not executed.
- Pricing source commits: `9b0393a`, `3b76bf4`, `0fd2622`, `fd3b94b`; pricing test commits: `2f112e9`, `a03c23f`. Customers source/test commits: `b279c263`, `3f3b0f6`.
- Both deliverables are **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified. No API, permission, schema, migration, database, staging or worker changes.
- Continue Mobile Merchant Orders and store/profile route audit, then remaining Web/Admin route/action permission mapping. Comprehensive testing remains deferred to Phase 3.

## Mobile merchant order refresh continuation — UX-091 — 23 November 2026

This is programme-level UX implementation evidence; it does not change G-001–G-035 audit finding status.

- **UX-091 — Mobile Merchant Orders:** explicit refresh now resolves active store then awaits the dependent order queue without duplicate requests. The queue and successful empty state support pull-to-refresh; existing stale-data preservation and retry states remain.
- Added three focused Flutter widget scenarios in `mobile/test/merchant_orders_read_recovery_test.dart` for stale queue preservation, initial error/retry and pull-to-refresh failure while empty. Not executed.
- Source commits: `da19ca1`, `9ecce8a`; test commits: `112bf00`, `b8c7b1c`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified. No API, permission, order transition, stock, fulfillment, schema, migration, database, staging or worker behavior changed.
- Continue Mobile Store Profile and route-transition audit, then remaining Web/Admin route/action permission mapping. Comprehensive testing remains deferred to Phase 3.

## Mobile merchant Store Profile continuation — UX-092 — 23 November 2026

This is programme-level UX implementation evidence; it does not change G-001–G-035 audit finding status.

- **UX-092 — Mobile Store Profile:** refresh now awaits the organization store-directory read, dependent active-store value and current warehouse directory. The full form supports pull-to-refresh; store and warehouse reads preserve last-successful values and expose retry. Successful empty warehouse state is distinct from failure.
- Added three focused Flutter widget scenarios in `mobile/test/store_profile_read_recovery_test.dart` for stale store preservation, warehouse retry and initial store lookup recovery. Not executed.
- Source commit: `bfb820e`; focused test commit: `90b2b6b`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified. No store update, warehouse creation, API, permission, schema, migration, database, staging or worker behavior changed.
- Continue remaining Mobile merchant route-transition/source audit, then remaining Web/Admin route/action permission mapping. Comprehensive testing remains deferred to Phase 3.

## Mobile organization/session context continuation — UX-093 — 23 November 2026

This is client-side context/caching remediation evidence; it does not close or change G-001–G-035 server-side authorization findings.

- **UX-093 — Organization/session context:** centralized invalidation for organization-scoped providers and invoked it from both organization-switch flows after the replacement token is persisted and installed. Active-store resolution filters by the selected active organization and will not fall back across organizations.
- New login clears persisted active-org selection before token persistence, resets in-memory identity/org context and invalidates authenticated reads. Logout resets the same context and authenticated caches.
- Three focused ProviderContainer tests are in `mobile/test/organization_scope_invalidation_test.dart`; not executed.
- Source commits: `b49424e`, `3f4a6a3`, `1f29e7c`, `cd04739`, `fc1f22a`, `b416041`; tests `a0f308c` / `d0d0b26`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified. No API/backend authorization, permission, schema, migration, RLS, database, staging or worker changes.
- Continue Mobile route permission/context transition audit, then Web/Admin route/action permission mapping. Comprehensive testing remains deferred to Phase 3.


## Programme UX-097 — Admin action-handler permission rechecks — 23 November 2026

This is a client action-safety improvement and does not change the status or acceptance criteria of G-001–G-036.

- **Verification detail:** organization deactivate/reactivate handlers now recheck `admin:users:write` and reject duplicate in-flight actions.
- **Organizations directory:** status toggle and update-request review handlers now recheck `admin:users:write` at execution time and reject duplicate in-flight actions.
- **Dispute detail:** resolution handler now rechecks `support:disputes:resolve` before sending the mutation.
- The UI already hid these controls for users lacking the corresponding permissions; this follow-up closes the stale-confirmation/event-handler gap if the permission projection changes while a dialog is open.
- Focused tests were added in `apps/admin/src/__tests__/verification-org-status-permissions.test.tsx` and `apps/admin/src/__tests__/admin-organization-action-permissions.test.tsx`. They simulate permission loss while the modal remains open. Tests have **not been executed**.
- Source commits: `112cee31`, `94f86dac`, `41fca823`; focused test commits: `c0aa3122`, `856d527a`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not automated-test verified or CI-verified. No API role grants, backend authorization, schema, migration, database, staging or deployment behavior changed.

**Next:** continue remaining Admin custom route/action-to-controller mapping. The 56-page route-level audit (UX-009) is complete; do not repeat it. Comprehensive testing remains deferred to Phase 3.


## Programme UX-098 — Admin capability-aware navigation and Payments access — 23 November 2026

This client access-alignment work does not change G-001–G-036 finding status or API permission grants.

- Carrier & Recovery navigation now uses an any-of rule for `admin:carrier:read` or `admin:shipping:recovery`, matching the page's existing access condition.
- Payments now admits users with any of `admin:payments:read`, `admin:payments:verify` or `admin:refunds:approve`. Its tabs and data requests remain separately permission-gated: queue uses verify, all/stale use read, and refunds use refund approval.
- Added unit tests for all-of/any-of navigation policies and a Payments page regression for a verification-only user. Tests have **not been executed**.
- Source commits: `07ff19c`, `f303153`, `14214f0`; tests: `d504ace`, `89624f6`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not automated-test verified or CI-verified. No backend role grant, API contract, schema, migration, database, staging or deployment behavior changed.

**Next:** continue the remaining Admin custom route/action-to-controller mapping. The 56-page route-level audit is complete; do not repeat it. Comprehensive validation and formatting remain in the consolidated Phase 3 campaign.


## G-002 supplemental audit evidence — 23 November 2026

A user-uploaded audit note reports 111/111 tables with RLS disabled; 32 public-schema functions with none marked SECURITY DEFINER; anon/authenticated without BYPASSRLS; service_role with BYPASSRLS; 55 foreign-key constraints without covering indexes; earlier plaintext OTP log observations; no separate Render worker service observed; and a startup migration/RBAC-seed command with 63 migrations reportedly applied.

The note contains no observation timestamp, database endpoint, SQL/query text, connection identity or relation-kind scope. It is preserved as supplemental, not independently reconciled evidence in [G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md](./G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md). Its 111-table count is not substituted for the detailed 114 public ordinary/partitioned table snapshot or historical 116 wording. Function-scope reconciliation, actual API/migration identities and protected read-only catalog evidence remain open. The 55-index count aligns with the existing G-013 candidate count; no index DDL is justified without workload evidence.

No G-002 status is promoted. No SQL mutation, migration, grant/default-ACL change, RLS enablement, extension ownership change, staging write, deployment, restart, worker activation or test-record creation occurred.


## Programme UX-099 — Shared Admin mutation permission rechecks — 23 November 2026

This is client-side action safety and does not change G-001–G-036 audit finding status or server-side authorization.

- Extended `useAdminMutation` with an optional action-specific permission predicate checked at request dispatch.
- Bound User status/membership, dispute, category, brand and offer-governance actions to their actual permissions. Carrier recovery and shipment exception/RTS, inventory-return, carrier-write and carrier-recovery actions now use their distinct permission conditions.
- User Detail profile submission rechecks `admin:users:write` and prevents duplicate save; profile edit UI is hidden if permission is lost.
- Added `apps/admin/src/__tests__/admin-mutation-permission-guard.test.tsx` for permission loss before dispatch and the authorized path. Test has **not been executed**.
- Source commits: `262f2d1`, `d52acd6`, `93ec686`, `20447d2`, `bed844f`, `9313b85`, `5ea1145`, `91d69e4`; tests: `046160d`, `57d3a25`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not automated-test verified or CI-verified. No API grants, backend auth, schema, migration, DB, staging or deployment changes.

**Next:** complete remaining Admin custom route/action-to-controller mapping and verify all `useAdminMutation` call sites use action-specific permissions. Phase 3 remains the consolidated formatting and test campaign.


## Programme UX-100 — Admin settlement adjustment rejection action — 23 November 2026

This closes a UI-to-controller workflow omission; it does not change G-001–G-036 finding status or backend authorization.

- Compared custom Admin financial action handlers with API controller permission decorators for reconciliation, settlement adjustments, settlements, payments and role permission updates; the page-level action predicates align with the corresponding API permission keys.
- Found that the API already exposed `POST /admin/settlement-adjustments/:id/reject` guarded by `admin:adjustments:approve`, but the Admin page exposed only Submit, Approve and Post. Added an approver-only Reject action with a required reason and the controller's expected `{ reason }` payload.
- The rejection form is only rendered for a pending-approval adjustment and users with `admin:adjustments:approve`; users with read-only access do not see Approve or Reject.
- Added focused tests for successful rejection request payload and read-only visibility in `apps/admin/src/__tests__/admin-settlement-adjustments-recovery.test.tsx`. Tests have **not been executed**.
- Source commit: `14c8c5ca`; focused test commit: `e471e6b4`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not automated-test verified or CI-verified. No backend permission, role grant, schema, migration, database, staging, worker or deployment behavior changed.

**Next:** finish the remaining Admin custom route/action-to-controller audit and inspect any custom handlers not covered by the shared `useAdminMutation` path. Keep the repository-locked formatting and comprehensive test campaign grouped at Phase 3.


### Admin custom action mapping follow-up — 23 November 2026

- Completed a source-level pass over the remaining direct custom mutation handlers for payments/refunds, calendar holidays, reconciliation, settlement adjustments, settlements, role permission updates, return resolution, order cancellation, verification review/organization status and product moderation.
- The reviewed UI permission predicates match their API controller decorators. The shared `useAdminMutation` invocations reviewed in `EntityActions.tsx`, Carrier Recovery and Shipment Detail provide action-specific predicates/per-call overrides.
- The only concrete UI-to-controller workflow omission found in this slice was settlement-adjustment rejection; UX-100 now exposes the API operation with the exact approval permission and required reason.
- This audit is source evidence only. Focused UX-100 tests and the consolidated Admin/API test campaign remain pending.


## Programme UX-101 — Catalog governance action guards and Product Type publish correctness — 23 November 2026

- Added action-boundary checks for `catalog:product-types:manage` across Product Type list publish, create form, category update and Product Type Builder save/publish handlers.
- Product Type Builder save now returns an explicit success result. Publish will not run after a failed save of dirty attribute/variant-dimension configuration. Save and Publish operations use in-flight refs and pending UI states to prevent duplicate requests.
- Product Type Builder products-tab reads are gated on the same active permission.
- Catalog Import Center initial reads and its upload/execute/retry/error/report/template/export actions now fail closed without `catalog:imports:manage`; upload/execute/retry use a shared single-flight guard. Backend permission and ADMIN/SUPER_ADMIN role checks are unchanged.
- Attribute and Attribute Group create/update/deactivate/option actions now receive and recheck `catalog:attributes:manage`; controls are disabled when the capability is absent.
- Added a focused Product Type Builder regression proving a failed dirty-configuration save does not dispatch Publish. Test has **not been executed**.
- Source commits: `bbe5a72`, `9af0646`, `553cb25`, `8e795c3`; test commits: `43c6e5e`, `997da23`, `3d59ae9`.
- Status: **IMPLEMENTED / TESTING_PENDING**. No API permission grants, role grants, schema, migration, database, staging, worker or deployment behavior changed.

**Next:** continue the remaining Admin operational UX/source audit beyond permission mapping; keep the accumulated formatting and comprehensive test campaign grouped in Phase 3.


## Programme UX-102 — Product editor action-time permission guard — 23 November 2026

- The shared Admin ProductForm now receives `canWrite` from both create and edit route gates.
- Save returns early when `catalog:products:write` is absent and uses a ref-backed single-flight guard against duplicate create/update submissions.
- The Save button is disabled when write capability is absent or a save is in progress.
- API endpoints remain unchanged and continue enforcing `catalog:products:write`.
- No ProductForm-specific test was added; validation is pending the consolidated Phase 3 campaign.
- Source commit: `383ea13c589d9023aab24d3b2d15c5c0db2cd751`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not automated-test or CI verified.


## Programme UX-103 — Product Type stale-response suppression — 23 November 2026

- Product Type list/filter loads now use request-version checks and effect cleanup so stale filter responses cannot overwrite newer results.
- Product Type selected-schema loads use a separate request version, preventing late schema responses from replacing the currently selected item.
- Product Type Builder schema, attribute and publish-readiness loads now invalidate stale requests when the route ID or access state changes; stale requests cannot update data, errors or loading state.
- No focused regression test was added; testing remains pending Phase 3.
- Source commit: `892bb24f4522988c89dea507cb848d80fb4dbe2e`.
- CI #1419 on this source commit: lint and TypeScript typecheck passed; Flutter analysis/tests passed; changed-file Prettier failed with 254 files needing formatting. Web/Admin tests and dependent gates skipped.
- Status: **IMPLEMENTED / TESTING_PENDING**.


## Programme UX-104 — Catalog Requests action guards — 23 November 2026

- Catalog Requests Approve now rechecks `catalog:requests:manage` at dispatch and uses a ref-backed single-flight guard; the action state disables competing row actions.
- RejectDialog receives the same capability, checks it at dispatch, prevents duplicate submissions, and keeps the reason requirement. Backend permission enforcement is unchanged.
- Added focused tests for one-time approval dispatch and rejection reason/reviewer payload. Not executed.
- Source/test commit: `00427e5f0cdd183aa7b8c910a93b8edd2e0d0723`.
- Status: IMPLEMENTED / TESTING_PENDING.


## Programme UX-105 — Dashboard protected-read gating — 23 November 2026

- Data Quality and KPI Dashboard now check their route permissions inside their read callbacks and before starting the initial effect; unauthorized users no longer trigger protected API reads.
- Both pages invalidate in-flight reads on permission changes/unmount and suppress stale state updates.
- Added `admin-dashboard-read-permissions.test.tsx` asserting that unauthorized users trigger neither Data Quality nor KPI API requests. Tests not executed.
- Source/test commit: `8474b7acd264872a01d305bef515009eded104ed`.
- Status: IMPLEMENTED / TESTING_PENDING.


## Programme FIN-001 — Payment refund concurrency and idempotency — 23 November 2026

- Fixed a refund-approval race: `approveRefund` now locks the associated `payment_records` row before changing refund status and recomputing the cumulative successful refund total. This serializes distinct approvals for the same payment and keeps the final payment status consistent.
- Implemented request idempotency for caller-supplied keys. Identical retries return the existing refund record; a key reused with a different payment, amount, reason or requester is rejected. A conflict-safe insert handles concurrent reuse across separate payment rows.
- Added PostgreSQL regression scenarios FIN-DSH-11 and FIN-DSH-12 to `p13-financial-dispute.postgres.spec.ts`. Tests have **not** been executed.
- Source/test commit: `117614884ff1e0d50ca116f0b28f249fd83761c0`. Status: **IMPLEMENTED / TESTING_PENDING**.
- No schema, migration, provider integration, automatic payout, database deployment or shared database action occurred. G-012 remains OPEN and unchanged.

## FIN-002 — Settlement calculation idempotency — 23 November 2026

- **Finding:** repeated settlement calculation could create another payable settlement after an earlier record was PAID. The existing partial unique index only covers active PENDING/CALCULATED/DUE statuses.
- **Implementation:** `PaymentsService.calculateSettlement` now locks the payment row (the same serialization point used by refund requests/approvals), checks for an existing settlement, returns an active settlement idempotently, and rejects recalculation after PAID/ADJUSTMENT history. Financial breakdown and successful-refund totals are read inside the same locked transaction.
- **Regression coverage:** FIN-DSH-13 verifies concurrent calls reuse one CALCULATED record and publish one settlement outbox event. FIN-DSH-14 verifies recalculation after PAID conflicts and creates no second record. Tests are added but **not executed**.
- **Source/test commit:** `5473f15ed6fcf8982dbbc45d8254eeb255c5db10`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, automatic payout, staging, shared database or deployment behavior changed.
- **Next:** continue source-first financial correctness review. Do not expand the G-012 manual-payment product scope.

## FIN-002 — Settlement calculation idempotency and confirmed-funds guard — 23 November 2026

- **Finding:** repeated settlement calculation could create another payable settlement after an earlier record was PAID. The partial unique index only covers active PENDING/CALCULATED/DUE statuses. The path also previously permitted settlement calculation before the payment was confirmed.
- **Implementation:** `PaymentsService.calculateSettlement` now locks the payment row (the same serialization point used by refund requests/approvals), checks for an existing settlement, returns an active settlement idempotently, and rejects recalculation after PAID/ADJUSTMENT history. It now also requires payment status CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED before a settlement may be calculated. Financial breakdown and successful-refund totals are read inside the same locked transaction.
- **Regression coverage:** FIN-DSH-13 verifies concurrent calls reuse one CALCULATED record and publish one settlement outbox event. FIN-DSH-14 verifies recalculation after PAID conflicts and creates no second record. FIN-DSH-15 verifies an AWAITING_PAYMENT record cannot be settled. Tests are added but **not executed**.
- **Source/test commit:** `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, automatic payout, staging, shared database or deployment behavior changed.
- **Next:** continue source-first financial correctness review. Do not expand the G-012 manual-payment product scope.

## FIN-002 — Settlement calculation idempotency and confirmed-funds guard — 23 November 2026

- **Finding:** repeated settlement calculation could create another payable settlement after an earlier record was PAID. The partial unique index only covers active PENDING/CALCULATED/DUE statuses. The path also previously permitted settlement calculation before payment confirmation.
- **Implementation:** `PaymentsService.calculateSettlement` now locks the payment row (the same serialization point used by refund requests/approvals), checks for an existing settlement, returns an active settlement idempotently, and rejects recalculation after PAID/ADJUSTMENT history. It also requires payment status CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED before settlement calculation. Financial breakdown and successful-refund totals are read inside the same locked transaction.
- **Regression coverage:** FIN-DSH-13 verifies concurrent calls reuse one CALCULATED record and publish one settlement outbox event. FIN-DSH-14 verifies recalculation after PAID conflicts and creates no second record. FIN-DSH-15 verifies AWAITING_PAYMENT cannot be settled. Tests are added but **not executed**.
- **Source/test commit:** `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, automatic payout, staging, shared database or deployment behavior changed.
- **Next:** continue source-first financial correctness review. Do not expand the G-012 manual-payment product scope.

## FIN-002 — Settlement idempotency and confirmed-funds guard — 23 November 2026

- Source/test checkpoint: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- `calculateSettlement` now serializes on the payment row, reuses an existing PENDING/CALCULATED/DUE settlement, rejects recalculation after PAID/ADJUSTMENT history, and requires payment status CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED.
- FIN-DSH-13 verifies concurrent idempotency and one outbox event; FIN-DSH-14 verifies post-PAID rejection; FIN-DSH-15 verifies an AWAITING_PAYMENT payment cannot be settled. Tests added, not executed.
- CI #1425 tested earlier SHA `994fee9a332f4c553fa09687101d8f6ecdec3103`: lint and Flutter passed, typecheck failed, downstream tests/format/build skipped. The settlement insert-result narrowing guard was added afterward; exact-head validation remains pending.
- No schema/migration, provider, automatic payout, staging, shared database or deployment behavior changed.

## FIN-002 typecheck remediation note — 23 November 2026

- CI #1425 on `994fee9a332f4c553fa09687101d8f6ecdec3103` passed lint and Flutter analysis/tests but failed TypeScript typecheck. Errors identified a possibly-undefined Drizzle insert return in `PaymentsService.calculateSettlement`, propagated to P12/P13 test callers.
- Source commit `60bf231f950dec8ede3c8945f76b22bc8e4b4451` adds an explicit guard that throws if the insert returns no persisted settlement row, narrowing the service result type.
- This correction has not been re-run in CI; no typecheck or PostgreSQL test pass is claimed.

## FIN-003 — Payment minor-unit amount validation — 23 November 2026

- **Finding:** manual payment verification, COD cash confirmation and refund request handlers accepted unvalidated numeric values. Zero/negative values could be stored as confirmed/collected amounts, and fractional/unsafe JavaScript numbers were not rejected before BIGINT persistence.
- **Implementation:** introduced shared `assertPositiveMinorAmount` validation in `PaymentsService.verifyPayment`, `confirmCash`, `requestRefund` and `calculateSettlement`. Amounts must be positive safe integers in minor units before transaction/state changes.
- **Scope:** no maximum, equality, underpayment or overpayment rule was added; existing manual-verification semantics remain unchanged.
- **Regression coverage:** FIN-DSH-16 rejects fractional verification/refund values and zero COD collection, and verifies rejected verification/COD attempts leave payment status unchanged. Test added but **not executed**.
- **Source/test commit:** `f554617c592ff57db296e0ca88614ac246468194`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared DB or deployment behavior changed.

## FIN-003 — Payment minor-unit amount validation — 23 November 2026

- Source/test checkpoint: `f554617c592ff57db296e0ca88614ac246468194`.
- Positive safe-integer minor-unit validation now guards payment verification, COD cash confirmation, refund requests and settlement confirmed amounts.
- FIN-DSH-16 covers fractional/zero inputs and unchanged verification/COD payment state. Added but not executed.
- No new amount cap/equality policy, schema/migration, provider, gateway, payout, staging, shared DB or deployment behavior.

## FIN-004 — Settlement lifecycle event consistency — 23 November 2026

Settlement calculation now writes `PAYMENT_SETTLEMENT_CALCULATED` rather than the unrelated refund-success event. Marking PAID now locks the settlement row and atomically updates the settlement, appends `PAYMENT_SETTLEMENT_PAID` history with actor/amount/reference metadata, and writes `payment.settlement_paid` to the transactional outbox. FIN-DSH-13 asserts calculation history/outbox; FIN-DSH-17 verifies concurrent pay attempts yield one winner and one history/outbox pair. Not executed.

## FIN-005 — COD order payment projection consistency — 23 November 2026

COD cash confirmation now synchronizes the denormalized `orders.payment_status` to CONFIRMED in the same transaction as the payment transition, while preserving fulfillment/order status (for example DELIVERED). FIN-DSH-18 verifies order/payment projection and payment event. Not executed.

Source/test commits: `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`, `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`. Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, automatic payout, staging, shared DB or deployment changes.


## FIN-006 — Dispute refund idempotency payload integrity — 23 November 2026

- **Finding:** the orphan-refund recovery branch in `DisputesService.resolveDispute` reused any row matching `dispute-refund:<disputeId>` without verifying that it represented the same financial request as the retry. A changed amount or reason could silently resolve the dispute while retaining the old refund terms.
- **Implementation:** recovery now requires the existing refund to match payment, order, amount, reason, requester, currency and dispute link. Any mismatch raises `ConflictException` before linking the refund or resolving the dispute.
- **Regression coverage:** FIN-DSH-20 adds PostgreSQL scenarios for changed amount and changed reason; tests added but **not executed**.
- **Source/test commit:** `9899113a4f574d2733b957d2f1b489e35a71fe0f`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared database or deployment behavior changed.
- **Next:** continue source-first financial/operational correctness review. Preserve the consolidated Phase 3 test campaign and the existing G-012 manual-payment scope.


## FIN-007 — Refund approval order payment projection — 23 November 2026

- **Finding:** refund approval updated the authoritative `payment_records.status` but did not synchronize the denormalized `orders.payment_status`. A successful partial/full refund could leave the order projection stale.
- **Implementation:** `PaymentsService.approveRefund` now updates `orders.payment_status` to the newly derived payment state in the same transaction as refund/payment status, payment history and outbox writes. It deliberately does not alter order fulfillment status.
- **Regression coverage:** FIN-DSH-21 verifies PARTIALLY_REFUNDED projection and preserved DELIVERED order status; FIN-DSH-22 verifies REFUNDED projection and preserved DELIVERED status. Added but **not executed**.
- **Source/test commit:** `5b68edac4d148f68656b4331a9612cd1752eab3d`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared database or deployment behavior changed.


## FIN-008 — Return refund idempotency payload integrity — 23 November 2026

- **Finding:** `ReturnsService.createRefundRequest` reused an orphan refund found by deterministic `return-refund:<returnId>` key without checking whether its financial terms matched the return retry.
- **Implementation:** recovery now verifies payment, sub-order, amount, reason, buyer/requester, currency and return link before reuse. Mismatches conflict before linking the refund or advancing the return to REFUND_PENDING.
- **Regression coverage:** FIN-DSH-24/25 add PostgreSQL cases for changed amount and changed reason; tests added but **not executed**.
- **Source/test commit:** `72927529e64a719741b94b864f6adba7cafd4f0d`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging, shared database or deployment behavior changed.

## Financial correctness continuation FIN-004–FIN-013 — 23 November 2026

- FIN-004 settlement event consistency: calculation event corrected; PAID transition now atomically persists settlement state, immutable payment history and outbox event. Commits `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`.
- FIN-005 COD order payment projection: payment_status synchronized without changing fulfillment state. Commit `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- FIN-006 dispute refund recovery validates full request identity before reusing an orphan refund. Commit `9899113a4f574d2733b957d2f1b489e35a71fe0f`.
- FIN-007 refund approval synchronizes the order payment projection. Commit `5b68edac4d148f68656b4331a9612cd1752eab3d`.
- FIN-008 return refund recovery validates full request identity. Commit `72927529e64a719741b94b864f6adba7cafd4f0d`.
- FIN-009 dispute resolution uses compare-and-set to prevent duplicate terminal events/outbox. Commit `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010 return refund adjustment serializes against settlement payment. Commit `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011 settlement adjustment preserves original currency. Commit `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-012 missing financial breakdown blocks manual/COD payment confirmation and rolls back. Commit `cdb189e95dd7022793af33352a18c31f81117059`.
- FIN-013 payment expiry records cancellation history only after the conditional order update succeeds. Source/test commits `028e30e9ebeb626b51b6d80bc28467c9c946c419`, `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- FIN-DSH-11–28 are added but not executed. Status for all is IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, automatic payout, staging, shared DB, grant/RLS, deployment or worker changes.


## FIN-014 — Discount-adjusted commission reversal and currency integrity — 23 November 2026

- Commission reversal now allocates the order-level discount proportionally across returned goods using persisted order financials. Commission reversal and settlement adjustment rows preserve the original payment currency.
- FIN-DSH-29 covers a partial discounted return and verifies reversal amount/currency in both ledgers. Test added, not executed.
- Source commits: 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration or gateway/payout scope change.

## FIN-015 — Exact commission reversal arithmetic — 23 November 2026

- Added a shared BigInt cumulative-target helper for commission reversal. Both ReturnsService settlement adjustment and CommissionReversalService now use exact multiplication/division rather than floating-point Number multiplication.
- The helper validates safe-integer minor-unit inputs and caps the result at remaining commission.
- Added a unit regression with individually safe integer operands whose Number product rounds the quotient up by one minor unit. Test added, not executed.
- Source commits: 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; unit test commit: 4e67e5ef7541e87ef5d9698e3abad7529cd07219.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration or gateway/payout scope change.


## FIN-016 — COD payment expiry exclusion — 23 November 2026

- **Finding:** stale-payment reconciliation selected CASH_ON_DELIVERY rows alongside bank-transfer payments; a COD payment could be expired despite collection being due at delivery.
- **Implementation:** getStalePayments excludes CASH_ON_DELIVERY, and expirePayment has a direct service-level COD guard.
- **Regression coverage:** FIN-DSH-30 creates a 365-day-old COD payment on a DELIVERED order, asserts it is absent from stale candidates, calls expirePayment directly, and verifies no payment expiry event or order/payment state mutation. Test added but **not executed**.
- **Source commit:** 68b5251200f9f3765a0568b796db056a18cd878e; **test commit:** 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, payout, staging or shared DB change.


## FIN-017 — Exact return refund allocation and payment-currency delivery adjustments — 23 November 2026

- **Finding:** return request calculations used floating-point discount/VAT ratios with `Math.round`, creating minor-unit precision risk for large values. Partial-return delivery-fee exception adjustments also hardcoded SYP despite the return's payment currency being available.
- **Implementation:** `roundProportionalMinorUnits` now performs validated half-up allocation using BigInt. Return line discounts, VAT and delivery-fee VAT use exact minor-unit arithmetic with safe-integer bounds. Delivery-fee exception adjustments inherit `payment.currency`.
- **Regression coverage:** FIN-DSH-31 verifies a partial return with products 3000, discount 600, tax 240 and delivery fee 450 yields refund 880 and a 495 USD delivery-fee adjustment. Unit tests cover half-up allocation and an intermediate product beyond safe Number precision. Tests added, not executed.
- **Source commit:** `122edb4bf1dc67ba01bfc33b97809cc037781f87`; unit/integration test commit: `e6823ee9b1c68f5b71229ffbda17c9f525b66565`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, provider, staging, shared DB or deployment behavior changed.


## FIN-019 — Settlement adjustment posting integrity — 23 November 2026

- **Finding:** commission reversal settlement adjustments were recorded with a negative net, reversing the intended merchant-credit sign. Approved adjustments could also become POSTED without any settlement ledger row when the order had no primary settlement.
- **Implementation:** COMMISSION_REVERSAL now produces positive net; refund/delivery-fee/balance-debit types remain negative. Amounts require positive safe integers. Posting locks the latest primary settlement row and rejects when no primary settlement exists, so status and ledger insertion remain atomic.
- **Regression coverage:** unit sign tests and PostgreSQL FIN-DSH-34/35. Added, not executed.
- **Source commits:** `968fa110fb77efcc98c5a892c5ed69029347fc8e`, `b2f0dc49b85d65dac0eaf631bf6fab7beaba8cae`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration or automatic payment/payout scope change.


## FIN-019 — Settlement adjustment posting integrity — 23 November 2026

- **Finding:** `SettlementAdjustmentService.postAdjustment` recorded commission reversals with a negative settlement net, despite commission reversal being a merchant credit. It could also mark an adjustment POSTED without a primary settlement ledger row.
- **Implementation:** commission reversals now increase net; refund/delivery-fee/balance-debit adjustments reduce net. Amounts require positive safe integers. Posting locks the latest primary settlement and refuses to mark POSTED when no primary settlement exists.
- **Regression coverage:** unit tests cover credit/debit signs. PostgreSQL FIN-DSH-34 verifies a commission reversal creates positive net; FIN-DSH-35 verifies posting is rejected without a primary settlement and the adjustment remains APPROVED/unlinked. Tests added, not executed.
- **Source commits:** `968fa110fb77efcc98c5a892c5ed69029347fc8e`, `b2f0dc49b85d65dac0eaf631bf6fab7beaba8cae`; scenario-ID correction `b9f9728659e71d3788cc58aa2b5ad9df29ab9731`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, shared DB or automatic gateway/payout change.


## FIN-020 — Reconciliation ledger correctness — 23 November 2026

- **Finding:** reconciliation treated a positive commission-reversal credit in an `ADJUSTMENT` settlement row as a debit; refund-status mismatches attempted to persist text in BIGINT discrepancy columns; commission reversal aggregation used Number; and the delivery-fee refund cap used a floating-point ratio that differed from return posting.
- **Implementation:** reconcile primary and ADJUSTMENT rows with their respective commission sign conventions; use BigInt aggregation for safe reversal totals; use the same net-goods denominator and half-up minor-unit helper as return creation; include both `DELIVERY_FEE_EXCEPTION` and `DELIVERY_FEE_REFUND`; reject unsafe input amounts; record refund status mismatch in descriptive evidence only.
- **Regression coverage:** unit tests exercise production helpers for primary/adjustment ledger signs, safe integer limits, BigInt totals, half-up delivery-fee tax and non-monetary status discrepancy drafts. PostgreSQL FIN-DSH-36 creates a commission reversal adjustment and a deliberately inconsistent return/refund pair in the disposable Testcontainers database, then checks persisted reconciliation output.
- **Source/test commit:** `ad478cc53ce40bec86172e881b4f14cea7e6dfac`.
- **Status:** IMPLEMENTED / TESTING_PENDING. Tests have **not** been executed; the exact-head GitHub Actions lookup returned no run. Vercel Web/Admin preview contexts were successful but are not application test evidence.
- **No schema/migration, shared DB/staging write, provider, gateway, payout, worker, grant/RLS, environment or deployment change.**
- **Next:** FIN-021 source audit of reconciliation version allocation, `superseded_by` semantics, concurrent runs and failure/partial persistence before further history/outbox changes.


## FIN-021 — Reconciliation run lifecycle integrity — 23 November 2026

- **Findings:** unlocked read-then-insert allowed concurrent same-tenant version collisions; unique index omitted org_id despite tenant-scoped queries; the service wrote superseded_by backward; and run/discrepancy writes were not atomic, allowing partial/RUNNING records.
- **Implementation:** acquire a PostgreSQL transaction-scoped advisory lock keyed by tenant, period and currency; select/insert the next version while locked; use predecessor → successor supersession links; run source checks, discrepancy inserts and COMPLETED update in one transaction. Any execution failure rolls back the whole attempt; a separate best-effort transaction records a FAILED run with zero discrepancies and a generic execution-error summary.
- **Migration:** `0074_reconciliation_tenant_version_integrity.sql` converts existing backward supersession pointers and replaces the global unique index with tenant-aware `NULLS NOT DISTINCT` uniqueness, including the NULL/global scope. Migration is committed but **not applied** to shared/staging.
- **Regression coverage:** PostgreSQL FIN-DSH-37 races two same-tenant runs and runs a second organization concurrently, asserting independent version 1 and correct forward links. FIN-DSH-38 injects a failure after a discrepancy draft is created and asserts FAILED status with no persisted partial discrepancy. Tests added, not executed.
- **Source/test/migration/runbook commit:** `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`.
- **Status:** IMPLEMENTED / TESTING_PENDING. Exact-head Actions returned no run; Vercel Web build-rate-limit failure and Admin success are not application test evidence.
- **No shared database/staging writes, migration execution, grant/RLS, worker, environment, provider, gateway, payout, deployment or merge action.**
- **Next:** FIN-022 audit immutable financial event/history and transactional outbox consistency across payment, settlement, refund, return, dispute and settlement-adjustment transitions.


## FIN-022 — Financial history and outbox consistency — 23 November 2026

- **Findings:** payment creation and CREATED → AWAITING_PAYMENT had immutable history but no corresponding outbox event; dispute opening/evidence/response were not consistently transactional and evidence/response had no outbox event; settlement-adjustment DRAFT creation had no outbox event; generic outbox polling selected PENDING rows without cross-instance claim ownership.
- **Implementation:** payment create/awaiting events are written in the same transaction as payment history/state. Dispute creation locks the order and commits dispute + OPENED event + outbox together; evidence and response lock the dispute and commit state/history/outbox together. Settlement-adjustment creation emits `settlement_adjustment.created` inside its insert transaction. Generic outbox uses atomic `FOR UPDATE SKIP LOCKED` claims, five-minute leases and owner-conditional success/retry updates; returned event columns are aliased to the dispatch contract.
- **Regression coverage:** PostgreSQL FIN-DSH-39 verifies payment/dispute history and outbox parity; FIN-DSH-40 verifies dispute creation rollback on outbox failure; FIN-DSH-41 verifies adjustment creation outbox; FIN-DSH-42 races two dispatcher instances against one pending event. Unit tests verify the claim SQL and field projection. Tests added, not executed.
- **Commits:** `3784bca3dd9a21fa3123e555aebbdd13addfb21b`, `a77339ab1b50d881fc006a16b9613505458fcd27`, `ccde36322f9bcfd12f2de2bfad22390cd9b7f503`, `5d7eadf07e11801813a606dfeeda60b83c16eb19`, `e761195829d3fcd4bc2d9d0eecfd848188c32d53`.
- **Status:** IMPLEMENTED / TESTING_PENDING. Exact-head Actions returned no run; Vercel Web/Admin rate-limit failures are not test evidence. The dispatcher remains a logging implementation; no external bus or consumer delivery guarantees are claimed.
- **No migration/shared database/staging write, worker activation, grant/RLS, environment, provider/gateway/payout, deployment or merge action.**
- **Next:** FIN-023 — inspect BANK_TRANSFER checkout's post-commit order/payment state transition and dispute-refund split transaction recovery.


## FIN-023 — Checkout and dispute-refund transaction boundaries — 23 November 2026

- **Findings:** BANK_TRANSFER checkout committed the order/payment before separate best-effort order/payment state transitions; a swallowed payment transition error could leave order PAYMENT_PENDING with payment CREATED. Dispute resolution created a refund in one transaction and finalized the dispute in another, permitting an orphan refund if the latter failed.
- **Implementation:** BANK_TRANSFER order/payment state, both immutable history records and payment/order outbox messages now commit in the original checkout transaction. The post-commit best-effort mutation was removed; checkout fails closed if PaymentsService is unavailable. `PaymentsService.requestRefund` now accepts an optional caller transaction client. Dispute resolution locks the dispute row and performs refund creation, payment event/outbox, refund linkage, dispute resolution, dispute event/outbox in one transaction. Legacy orphan-refund idempotency recovery and strict payload validation remain.
- **Regression coverage:** PostgreSQL FIN-DSH-43 verifies order/payment status, history and outbox parity; FIN-DSH-44 injects awaiting-event failure and verifies full checkout rollback; FIN-DSH-45 injects final dispute-outbox failure and verifies refund/payment/dispute rows all roll back. Tests added, not executed.
- **Commits:** `a5fa4806e310159b6f2708d366764ffe4fa3892f`, `442b03a77e4645fba01b8f33d3d2351265365b9d`, `71c8acb5a890a8b7350915cc4eca80dd6104874c`.
- **Status:** IMPLEMENTED / TESTING_PENDING. Exact-head Actions returned no run; Vercel Web/Admin rate-limit failures are not test evidence.
- **No migration/shared DB/staging write, worker activation, grant/RLS, environment, provider/gateway/payout, deployment or merge action.**
- **Next:** FIN-024 — audit payment proof storage upload, DB failure cleanup, retry and replacement semantics.


## FIN-024 — Payment proof upload lifecycle — 23 November 2026

- **Findings:** service upload could succeed before the DB transaction and leave an orphan on failure; replacing a proof could strand the old object; the controller accepted receipt URL/reference fields but did not expose the existing file-buffer path.
- **Implementation:** added multipart `file` support with a 10 MB limit and JPEG/PNG/WebP/PDF allowlist. Service validates storage availability, file size and MIME, sanitizes extension, generates unique per-payment keys and preserves the prior proof when no replacement is supplied. On DB failure it re-reads the payment row and deletes the new object only if no committed row references it; if verification fails it intentionally leaves the object. After successful replacement commit, the previous managed proof is deleted; external URLs are never deleted.
- **Regression coverage:** PostgreSQL FIN-DSH-46 verifies failure compensation deletes only the new upload and preserves the old proof; FIN-DSH-47 verifies the new key is committed before old-object retirement. Tests added, not executed.
- **Commits:** `7f6e3a949975511b5be56470c0dd427dc92ba16d`, `41c8db370a30124e981c42c1e7d7b8487771e8ec`.
- **Status:** IMPLEMENTED / TESTING_PENDING_WITH_RESIDUAL. A process crash between upload and DB transaction can leave an orphan; no durable upload-intent/sweeper exists. Cleanup verification/deletion failures preserve objects for safety.
- **No migration/shared DB/staging write, worker activation, grants/RLS, environment, provider/gateway/payout, deployment or merge action.**
- **Next:** FIN-025 — implement crash-safe upload intent/recovery and bounded orphan cleanup with lease/retry and DB-reference checks.


### FIN-024 follow-up — uncertain upload response — 23 November 2026

- Moved payment transition validation before storage upload so invalid transitions cannot create unused objects.
- If `putObject` throws after the storage service may have accepted the object, check the generated key with `exists` and delete it when present. Cleanup failures are logged without masking the original upload error.
- Added PostgreSQL FIN-DSH-48. Latest commit: `847647c424097e5ace69236d0c3b4592f85d30e9`. Test not executed. Process crash after upload but before DB transaction remains a known orphan window for FIN-025.


## FIN-025 — Durable payment-proof upload recovery — 23 November 2026

- **Finding:** FIN-024 still allowed process crashes between object upload and payment-row commit to leave orphan objects. A caught error could be compensated, but there was no durable intent record or bounded recovery process.
- **Implementation:** Added the `payment_proof_upload_intents` Drizzle table and forward-only migration 0075. An intent is persisted before the upload, with unique object key, bucket, MIME/size, lifecycle status, upload lease and retry metadata. Payment status, immutable event, outbox event and intent COMMITTED state now share one DB transaction. The prior managed proof receives a durable cleanup intent in that same transaction; cleanup checks every payment row before deleting and never lists the bucket.
- **Recovery:** `PaymentsService.cleanupStaleProofUploads` claims only stale intent rows via `FOR UPDATE SKIP LOCKED`, applies a five-minute fenced cleanup lease, verifies the payment row does not reference the object, checks exact-key existence with HEAD, deletes only that key, and persists CLEANED/COMMITTED or retry/terminal FAILED state. Retries use capped exponential backoff; only confirmed 404/not-found responses count as absent. No bucket listing or broad deletion exists.
- **Safety boundary:** cleanup is a callable service method only. It is not registered with a scheduler, timer, worker or HTTP route and has not been activated. Migration 0075 has not been applied to any shared/staging database.
- **Regression coverage:** FIN-DSH-46/48 updated for durable pending intents; FIN-DSH-47 checks COMMITTED intent; FIN-DSH-49–53 cover stale orphan deletion, cross-payment committed-reference preservation, bounded retry, concurrent claim exclusion and previous-proof retirement. Tests added, not executed.
- **FIN-021 follow-up:** fixed transaction-incompatible Drizzle relational accessors by using core selects in the transaction. Commit `1997ee604f58328faf580328817ec5b7b326fabf`; FIN-DSH-37/38 remain unexecuted.
- **Status:** IMPLEMENTED / TESTING_PENDING. The consolidated Phase 3 test and isolated migration campaign remains outstanding.
- **No shared/staging DB write, migration execution, grants/RLS, worker activation, environment change, provider/gateway/payout, deployment or merge action.**
