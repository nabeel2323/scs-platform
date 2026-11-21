# G-001 — Independent Security Review Packet

**Prepared:** 21 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Commit under review:** `b73f72e34406c1260f214610539139d0d096b2de`  
**Pull request:** [#138](https://github.com/nabeel2323/scs-platform/pull/138) — open, draft, unmerged  
**Exact-head CI:** [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) — 10 executable jobs passed

> **Review independence:** This packet was assembled by the implementation author from repository source and CI evidence. It is not an independent security review and must not be treated as one. A reviewer other than the implementation author must inspect the code and record a conclusion.

## 1. Review objective

Independently assess the G-001 merchant-offer authorization boundary and its buyer-facing projection. Confirm that tenant ownership, active store membership, role restrictions, object-level confidentiality, privileged governance access and audit attribution are enforced consistently across HTTP controller and service entry points.

The review is limited to G-001. It does not approve G-002 database/RLS changes, staging tests, deployment, migration 0070, worker activation or release.

## 2. Source map

| Area                                                                                                                           | Source                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| HTTP routes, merchant-role checks, governance permission gates                                                                 | `apps/api/src/modules/catalog/catalog.offer.controller.ts` |
| Service-level role/tenant checks, scope-first detail, mutation authorization, buyer projection and same-store reference checks | `apps/api/src/modules/catalog/catalog.offer.service.ts`    |
| Shared organization/store membership predicates                                                                                | `apps/api/src/common/tenant-scope.ts`                      |
| Offer persistence schema                                                                                                       | `apps/api/src/modules/catalog/catalog.offer.schema.ts`     |
| Store and warehouse persistence schema                                                                                         | `apps/api/src/modules/merchant/merchant.schema.ts`         |
| Price-list persistence schema                                                                                                  | `apps/api/src/modules/pricing/pricing.schema.ts`           |

## 3. Acceptance evidence map

| Acceptance dimension                    | Automated evidence                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported merchant principals           | Controller and service unit suites exercise `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT` on merchant surfaces and mutation entry points.                                                                |
| Non-merchant mutation denial            | Controller/service suites deny `BUYER`, `FINANCE`, `ADMIN`, `MODERATOR`, `SYSTEM` and `SUPER_ADMIN`, including service entry points before database mutation.                                                       |
| Buyer cannot use merchant surfaces      | Controller tests deny buyer list/detail access even when a store-membership fixture exists.                                                                                                                         |
| Buyer offer visibility                  | Service tests assert ACTIVE-store, ACTIVE-offer and available predicates and the explicit allowlisted projection; PostgreSQL integration proves DRAFT-store offers disappear from buyer list and ranked results. A new INACTIVE-store PostgreSQL scenario is added and awaits exact-head CI. |
| Foreign merchant confidentiality        | Scope-first service and PostgreSQL tests compare foreign-organization and same-organization non-member detail responses; both use the not-found class.                                                              |
| Organization and membership enforcement | Controller tests cover missing active organization, foreign organization, same-organization non-member and revoked/inactive membership; PostgreSQL tests cover foreign merchant, non-member and revoked membership. |
| Analytics and trend reads               | Controller tests apply the same store organization/membership checks to list, store analytics and trend; denial cases assert protected services are not called.                                                     |
| Privileged governance reads             | Controller tests require `catalog:offers:govern` for privileged offer list, analytics, trend and detail; negative and positive privileged-role cases are present.                                                   |
| Authenticated actor attribution         | Controller/service tests verify proposal, pricing and governance audit attribution uses the authenticated principal rather than caller-supplied actor fields.                                                       |
| Same-store resource references          | Service unit tests reject foreign-store price-list/warehouse references on create/update and accept same-store references; PostgreSQL integration verifies cross-store create rejection without inserting an offer. |

## 4. Test files and exact CI evidence

- Controller unit tests: `apps/api/src/__tests__/unit/catalog/catalog-offer-controller.spec.ts`.
- Service unit tests: `apps/api/src/__tests__/unit/catalog/catalog-offer.spec.ts`.
- PostgreSQL lifecycle/tenant integration: `apps/api/src/__tests__/integration/catalog-lifecycle.e2e.spec.ts` (includes DRAFT-store coverage; the new INACTIVE-store buyer-visibility case awaits exact-head CI).
- Additional PostgreSQL fixture suites repaired in the latest change: Phase 1 marketplace, Phase 2 multi-merchant, Phase 3 security, Phase 4 import-commerce and transaction-lifecycle suites. Each explicit Drizzle schema map now registers `storeMembers`; buyer-discovery fixtures use ACTIVE stores where that behavior is under test.

CI #1268 on exact commit `b73f72e34406c1260f214610539139d0d096b2de` passed:

- Lint, TypeScript typecheck and changed-file Prettier.
- API unit tests and coverage gates.
- Real PostgreSQL integration tests.
- Web/Admin tests.
- Migration full apply and read-only database-access/public-schema audit in disposable CI PostgreSQL.
- E6 boundary lint.
- Flutter analysis and tests.
- Contract specification/code generation.
- Build and container build/smoke.

k6 and protected staging release were skipped. No staging/runtime behavior is claimed from this CI run.

## 5. Reviewer checklist

The reviewer should inspect source and tests rather than rely only on this summary.

- [ ] Verify every merchant-offer route and service entry point has the intended role and tenant boundary.
- [ ] Verify store organization ownership and active membership are derived from trusted authenticated context, not caller-controlled actor or tenant claims.
- [ ] Verify the scope-first offer-detail query does not disclose foreign/non-member object existence through response class or avoidable error differences.
- [ ] Verify privileged read paths consistently require the explicit governance permission and do not grant merchant mutation authority.
- [ ] Verify buyer endpoints expose only the documented public projection and cannot be made to include internal/private fields through query options.
- [ ] Verify ACTIVE-store filtering is applied consistently to buyer list and ranked paths; do not infer an undocumented SUSPENDED-store operational policy.
- [ ] Verify create/update price-list and warehouse ownership checks are performed at the service boundary and cannot be bypassed by alternate callers.
- [ ] Assess race windows between membership validation and the subsequent read/write, including whether transactional locking or revalidation is required for the threat model.
- [ ] Verify audit actor attribution cannot be forged through request bodies or internal call paths.
- [ ] Review error handling, logging and timing for tenant/object existence leakage.
- [ ] Identify any adjacent offer export, bulk, reporting or alternate API paths that bypass the reviewed controller/service boundary.
- [ ] Confirm tests fail if the authorization predicates are removed or reordered.

## 6. Known scope boundaries and cautions

- DRAFT stores remain manageable by their active merchant members; buyer discovery is limited to ACTIVE stores. The tests do not establish a separate SUSPENDED-store merchant-management policy.
- Platform governance reads are separate from merchant operations. A platform role with a generic merchant write permission must still be denied by the merchant-principal guard.
- The PostgreSQL integration suites use disposable CI containers. They do not establish the live staging/production database identity or RLS behavior.
- G-002 remains IN PROGRESS. Do not apply migration 0070, enable RLS, modify shared grants/default ACLs, change Supabase-managed ownership or run staging writes as part of this G-001 review.
- PR #138 remains draft and must not be merged or deployed under this packet.

## 7. Independent reviewer record — to be completed by reviewer

| Field                                  | Reviewer entry |
| -------------------------------------- | -------------- |
| Reviewer name / role                   |                |
| Independence from implementation       |                |
| Review date (UTC)                      |                |
| Commit reviewed                        |                |
| Scope and files reviewed               |                |
| Conclusion                             | NOT REVIEWED   |
| Findings (severity, file/line, impact) |                |
| Required remediation                   |                |
| Retest evidence                        |                |
| Final disposition                      | PENDING        |

**G-001 status remains PARTIAL until this reviewer record is completed and all findings are dispositioned.**


## Addendum — INACTIVE-store buyer visibility test

A real PostgreSQL scenario now changes Merchant B's store status to `INACTIVE`, asserts the store's offers are absent from both buyer list and ranked results while the other ACTIVE store remains visible, and restores the fixture in `finally`. This test is newly implemented and is **not yet CI-verified** at the packet's current commit. It does not establish a merchant-management policy for inactive stores.
