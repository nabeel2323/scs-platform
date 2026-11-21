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
