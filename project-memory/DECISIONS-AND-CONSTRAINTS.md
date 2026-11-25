# SCS Platform — Decisions and Constraints

**Last reconciled:** 25 November 2026

## Working method

- Continue autonomously through coherent implementation steps; do not request approval for every small change.
- Work directly in `nabeel2323/scs-platform` when connected GitHub operations permit.
- Group source, regression tests and documentation into a small number of cohesive commits.
- Keep project memory and user-facing technical documentation synchronized with actual code and evidence.
- Do not repeat completed work. Verify branch, PR, exact commit and CI before continuing.
- Preserve exact evidence levels: implemented, test-executed, CI-verified, runtime-verified, independently reviewed, approved and deployed are distinct.

## Binding project decisions

- PR #138 is an audit-driven remediation branch and must remain open/draft/unmerged until its remaining gates are satisfied. Never merge its very large diff as one unit; extract bounded, independently reviewed slices.
- The user prefers implementation completion and integration before one consolidated comprehensive regression campaign. Use narrow developer checks only when needed to protect a critical invariant; do not repeatedly run the full suite after each small change.
- GitHub Actions minutes are constrained. Batch related work, avoid CI on documentation-only/small intermediate commits, and reserve the consolidated validation run for a coherent implementation checkpoint. Never disable required checks or claim skipped checks passed.
- Preserve product scope. Do not silently add automatic gateway/payout scope or activate workers because code exists.

## Database and deployment restrictions

- The user authorized necessary **staging-database-only** schema, privilege, default-ACL, RLS, migration and controlled fixture/data changes for first-production-launch preparation. This authorization is conditional:
  - establish actual API and migration identities;
  - reconcile postgres/supabase_admin object ownership and default ACLs;
  - complete table/operation/worker transaction-context coverage;
  - review the exact migration and rollback/recovery strategy;
  - use the approved protected staging process.
- The latest recorded API identity is `postgres` with `BYPASSRLS`, `CREATEROLE`, and `CREATEDB`; TLS was reported false. Do not enable RLS under that identity.
- Do not apply migration 0070 or related access-model changes until a dedicated non-owner/non-BYPASSRLS API identity and default-ACL plan are ready and reviewed.
- Do not change Render service/environment settings, secrets, restart/deploy, activate workers, or execute staging business workflows without separate explicit authorization.
- Do not bypass the protected GitHub `staging` environment approval.
- Do not provision or deploy a production database; none currently exists.
- Do not expose connection strings, secrets, customer data or OTP values.

## Engineering constraints

- Keep `ShippingCarrierWorker` the sole consumer of `shipping.carrier.*` events.
- Never mark an outbox event `DISPATCHED` unless a real consumer/publisher has acknowledged successful delivery.
- Unknown event types must never be treated as successful delivery. Dedicated consumers must explicitly dead-letter or quarantine unsupported types.
- A durable claim requires an explicit lease/ownership strategy and crash/concurrency tests; `FOR UPDATE SKIP LOCKED` alone is not a durable claim after the transaction commits.
- A generic publisher must have explicit event-type ownership, idempotency, tenant/recipient resolution, bounded redacted errors, retry/backoff and dead-letter observability before it is enabled.
- Never use session-level tenant context on pooled database connections. Any RLS design must use transaction-local context on the same connection as all scoped queries.
- Do not force-push or rewrite history without explicit authorization. Use expected-SHA/lease checks for ref updates.
