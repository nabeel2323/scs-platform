# SCS Platform — Start Here

**Last updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Default branch:** `main`  
**Development branch:** `develop`

## Read first

1. [Current state](./CURRENT-STATE.md)
2. [Decisions and constraints](./DECISIONS-AND-CONSTRAINTS.md)
3. [Work log](./WORK-LOG.md)
4. [Audit-driven remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md)
5. [Audit-driven implementation progress](../docs/remediation/IMPLEMENTATION-PROGRESS.md)
6. [Outbox dispatch safety checkpoint](../docs/remediation/OUTBOX-DISPATCH-SAFETY-2026-11-25.md)

The detailed remediation and product gap registers on the audit branch remain historical/source evidence. Do not merge PR #138 wholesale to obtain those documents; it is intentionally a large draft branch and must be split into bounded changes.

## Verified repository baseline

- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25` — PR #147 merge, 25 November 2026.
- Latest develop CI: run #1509, completed **successfully** on that exact SHA.
- `main`: `d3f4aefc41b37ad82f0aeb2eb78121342455eb21` at the last inspected repository check.
- PR #142 (runtime database identity diagnostics), PR #152 (OTP log redaction), and PR #147 (carrier outbox ownership) are merged to develop.
- PR #138 remains **OPEN / DRAFT / UNMERGED**. Do not merge it as a single unit.
- Other draft PRs must be assessed individually; green CI or a mergeable flag is not release authorization.

## Current continuation

A clean implementation branch, `fix/outbox-placeholder-dispatch-safety-2026-11-25`, was created from the verified develop SHA.

The current slice removes the generic outbox poller's false-success behavior: no delivery adapter exists, so the provider now writes durable `PENDING` events and does not poll or mark them `DISPATCHED`. See the linked safety checkpoint and work log for exact scope and verification limits.

After this slice, continue the worker/event-delivery audit. Define the supported event families and their authoritative consumers before implementing a real generic publisher. Then address the remaining worker transaction/claim boundaries and the dedicated database runtime-role/RLS design in the documented order.

## Important safety gates

- Do not merge PR #138 wholesale.
- Do not treat source changes, authored tests, green CI, staging observations, independent review, approval and deployment as interchangeable evidence.
- Do not deploy or change Render configuration/environment, restart services, activate workers, or run business workflows without separate explicit authorization.
- Do not run the mutating release workflow as a substitute for a database-only operation.
- Do not change shared database grants/default ACLs, ownership, migrations or RLS ad hoc. The recorded staging-only database authorization is conditional on verified API/migration identities, complete access-context coverage, ownership reconciliation and a reviewed migration/rollback path.
- Do not enable RLS while the API role is a table owner or has `BYPASSRLS`; do not apply migration 0070 until its role/default-ACL assumptions are reviewed.
- No production database has been provisioned or deployed.
- Never expose credentials, connection strings, OTPs or customer secrets in logs or documentation.

