# SCS Platform — Decisions and Constraints

**Last reconciled:** 21 November 2026  
**Purpose:** Preserve durable user instructions, architecture constraints and safety boundaries across conversations.

## User working preferences

- Continue work autonomously through logical implementation steps; do not ask for approval for every small step.
- The user expects ChatGPT to work directly in the GitHub repository, including editing, committing and pushing when the connected GitHub tools permit. Do not default to handing work to a coding agent.
- Group related implementation, tests and documentation changes into cohesive commits when practical, reducing repeated validation cycles.
- Keep documentation consistent with the actual implementation and verified behavior.
- Give detailed status with exact branches, commits, CI runs, job outcomes and unresolved work.
- Do not repeat completed work. Read the project checkpoint and verify GitHub before resuming.

## Repository architecture context

- Product: B2B-first true multi-merchant commerce and supply marketplace.
- Monorepo: pnpm workspaces and Turborepo.
- API: NestJS modular monolith under `apps/api`.
- Buyer/merchant web: Next.js under `apps/web`.
- Admin console: Next.js under `apps/admin`.
- Mobile: Flutter under `mobile/`.
- Shared packages include contracts, UI kit, event types and environment schemas.
- Data layer: PostgreSQL 16/PostGIS and Drizzle ORM; Redis 7 is also used.
- CI includes lint/typecheck/format, boundary lint, API unit/coverage, PostgreSQL integration, Web/Admin tests, migration apply, contracts/codegen, build/container smoke, Flutter, k6 and release-related jobs. Actual job execution depends on workflow conditions and upstream success.

## Binding remediation decisions

1. PR #138 is an audit-driven remediation branch and must remain **open, draft and unmerged** until the required gates are satisfied.
2. G-001 must not be marked complete solely because code and automated tests exist. Independent security review and complete acceptance evidence are required.
3. G-002 must not be marked complete based on Supabase Management API identity or disposable CI database evidence. Actual API and migration runtime identities must be established.
4. Do not infer staging/production behavior from local or CI fixture evidence.
5. Preserve the detailed remediation plan and progress tracker as the authoritative records for finding definitions, acceptance criteria and statuses.
6. Preserve product scope decisions. For example, do not silently expand automatic gateway/payout scope or activate workers merely because implementation exists.

## Explicit safety restrictions

The following are prohibited unless the specifically required explicit authorization is obtained:

- Do not merge PR #138 or treat it as release authorization.
- Do not bypass or circumvent the protected GitHub `staging` environment approval.
- Do not dispatch or approve protected staging operations on the user's behalf.
- Do not deploy the remediation branch or modify Render staging/production configuration.
- Do not change environment variables, restart services, activate workers or perform staging writes.
- Do not modify shared database privileges, grants, default ACLs or ownership.
- Do not apply migration 0070 (or related RLS/access-model migrations) to the shared database.
- Do not enable RLS on live/shared tables.
- Do not alter Supabase-managed extension ownership.
- Do not expose database connection strings, credentials, secrets or OTP values in logs or documentation.

## Evidence and status vocabulary

Use precise distinctions:

- **Implemented:** source change exists.
- **Automated-test verified:** relevant test(s) passed.
- **CI verified:** named workflow run passed the relevant job(s) on the exact cited SHA.
- **Runtime verified:** behavior was observed in the target runtime/environment.
- **Independently reviewed:** a reviewer other than the implementation author examined the work and recorded findings.
- **Approved:** the authorized person/system explicitly granted the required approval.
- **Released/deployed:** the target environment confirms the deployed version.

Never promote one state to another by implication. A skipped job is not a pass; a green CI run is not deployment approval.

## Change management

- Prefer one cohesive commit for a related implementation/test/documentation group.
- Keep temporary helper workflows self-removing and verify they are absent afterward.
- Do not force-push or rewrite history unless separately and explicitly authorized.
- Before updating a branch ref, verify the expected current SHA and use a lease/expected-SHA check where supported.
- If a commit or push fails, inspect branch state before retrying; do not assume the action succeeded.

## Buyer-facing offer data contract — 21 November 2026

Buyer product-offer endpoints must return explicit allowlisted public commercial fields only. They must not expose merchant metadata, external references, actor identifiers, review details, internal price-list IDs or warehouse IDs. Merchant-management endpoints may retain their richer offer shape behind tenant and role authorization.

Create and update operations that attach a price list or warehouse to an offer must verify that each referenced resource belongs to the same store as the offer. This invariant is enforced at the service boundary, not solely by controller validation.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## Buyer visibility query implementation note — 21 November 2026

Use an uncorrelated store-ID subquery for ACTIVE-store visibility in the Drizzle relational offer queries. The correlated EXISTS form produced an invalid outer-table reference in PostgreSQL integration tests; the IN-subquery expresses the same visibility condition while remaining valid in this query shape.

## User-approved implementation-first programme — 22 November 2026

The user approved a change to the project-wide execution sequence:

1. Complete baseline/gap mapping against the actual repository and requirements.
2. Prioritize implementation completion across backend/API, database/schema, permissions/tenant security, web, admin, mobile, POS/merchant, workflows/integrations, operations and documentation.
3. Complete cross-component integration before the consolidated full regression campaign.
4. Run one coordinated comprehensive testing phase after planned implementation is complete, covering unit/API, PostgreSQL/migrations, tenant isolation/security, concurrency, web/admin/mobile E2E and performance.
5. Stabilize and fix the defects discovered by that campaign, then perform release-readiness gates.

During implementation, use narrow, proportionate developer checks and focused tests where a critical invariant or safe implementation requires them. Do not repeatedly run the entire regression suite after every small enhancement. Do not knowingly defer a concrete security or correctness defect discovered during implementation; fix it immediately. This sequencing decision does not waive any existing independent-review, staging, database, deployment, business-signoff or release restriction.

The [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md) is the programme-level sequencing register. The audit-driven [implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) remain authoritative for finding definitions, acceptance criteria and evidence. The programme register must not overwrite their historical records or promote a finding status without evidence.

Use these programme statuses consistently: `IMPLEMENTATION_PENDING`, `IMPLEMENTATION_IN_PROGRESS`, `IMPLEMENTED`, `INTEGRATION_PENDING`, `TESTING_PENDING`, `VERIFIED`, `BLOCKED` and `DEFERRED_BY_DECISION`. Implementation, integration, test verification, runtime verification, independent review, approval and release are separate states.

## GitHub Actions budget and grouped validation — 22 November 2026

The user reports that approximately 90% of the GitHub Actions minutes allowance has been consumed. Treat remaining Actions minutes as a constrained project resource:

- Group related implementation, focused tests, documentation and project-memory updates into one cohesive branch commit whenever practical.
- Avoid triggering a workflow for each small change or for documentation-only edits that can be included with the next implementation batch.
- Keep change-local checks narrow; reserve the comprehensive CI/regression campaign for the consolidated implementation/integration checkpoint.
- Do not create repeated temporary formatter workflows. Follow repository formatting conventions and batch formatting with the same implementation commit.
- Do not disable required checks, bypass workflow approval, or misrepresent unrun checks. A single meaningful CI run is preferred over many incremental runs, but required validation remains mandatory before merge/release.
- When a workflow fails, inspect job outcomes and rerun only failed jobs when the workflow and GitHub permissions support that safely; do not rerun successful jobs unnecessarily.

## GitHub Actions budget — 22 November 2026

The user reports that 90% of GitHub Actions action minutes have been consumed. Group related implementation and documentation changes into fewer commits, avoid workflow runs for individual edits, and defer broad testing until the implementation batch is complete. Use one consolidated formatter/test/security/CI run for the final validation and fix all findings together. Implementation commits may use `[skip ci]` when validation is intentionally deferred and clearly recorded.

## 2026-11-23 — Mobile organization/session cache boundaries

- On a successful organization switch, persist and install the replacement token, update `activeOrgIdProvider`, then invalidate the organization-scoped provider set. Do not invalidate user-level buyer cart/order/notification state for an org-only switch.
- Active-store resolution must match the selected `activeOrgIdProvider`; it must return null rather than fall back to a store from another organization.
- At a user-session boundary (new login/logout), clear in-memory phone/email/active-org identity and invalidate all authenticated provider caches, including buyer orders/cart, notifications, organization detail/members and driver reads. New login clears persisted active-org selection before writing the new token. Logout clears persisted tokens and active-org through `AuthStorage.clearTokens`.
- This is client-side cache/context hygiene only. Backend tenant authorization remains authoritative; do not treat client invalidation as a security boundary or as closure of RLS/grant findings.


## User reaffirmation — implementation first, tests afterward — 24 November 2026

The user has explicitly reaffirmed the required execution sequence for all subsequent SCS Platform sessions:

1. Complete the planned implementation work first, including cross-module and cross-client integration; do not switch prematurely into test execution.
2. Do not run test commands or trigger GitHub Actions/CI workflows during the implementation phase. Tests and comprehensive verification are deferred until the implementation/integration phase is complete. Existing test files or historical CI results do not change this sequencing instruction.
3. Continue autonomously through routine implementation steps without asking the user for approval at each step.
4. Batch related source and documentation changes into cohesive commits wherever practical, and keep project memory/handoff documents synchronized after meaningful work.
5. Continue to inspect source and fix concrete security/correctness defects discovered during implementation. Preserve every existing safety, independent-review, protected-staging, database, no-merge, no-deploy and release gate. This sequencing instruction does not waive those restrictions.

This is a standing instruction for future sessions unless the user changes it. The implementation author must not claim tests passed when they have not been run; report them as deferred/pending.


## G-002 scoped actor-context rollout — 24 November 2026

- The DatabaseService actor-context primitive is opt-in. Do not install a global request interceptor or blanket transaction wrapper.
- Context must be derived from server-verified JWT identity or an explicitly reviewed worker/system principal; never trust client-supplied tenant headers.
- PostgreSQL identity settings must use parameterized transaction-local `set_config(..., true)`; session-level settings are prohibited.
- Existing `DatabaseService.db` calls inside a scoped awaited operation must resolve to the same transaction-bound Drizzle handle. Same-actor nested calls reuse the active transaction; switching actors fails closed.
- AsyncLocalStorage context must be fenced after the transaction callback completes so detached tasks cannot query through a closed transaction.
- Controller adoption is selective and requires review of nested transactions, detached work, streaming, external I/O, and module provider wiring.
- Current bounded adoption: Notifications, Pricing, Store Membership, Promotions, Reviews, Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Admin reads, Cart, Returns, Organizations and Roles.
- Workers, carrier webhooks, bootstrap, audit writes, realtime, CLI and migration paths need separate principal contracts. Webhook context may only be established after credential authentication.
- Do not enable RLS, change grants/default ACLs, apply shared-database migrations, or use protected staging as part of this implementation.
- The user requires implementation/integration to finish before test execution; no tests or CI during the implementation phase.
