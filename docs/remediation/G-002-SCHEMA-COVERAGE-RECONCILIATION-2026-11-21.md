# G-002 — Live relation and Drizzle schema coverage reconciliation

**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Evidence date:** 21 November 2026  
**Finding:** G-002 — database privileges and tenant-aware RLS architecture  
**Live database mutation:** None

## Executive result

The 19-November read-only inventory records 114 relations in the public schema. A source reconciliation of all 25 API module `*.schema.ts` files on this branch found 99 distinct Drizzle `pgTable` declarations matching live relation names.

The 15 live relations without a corresponding Drizzle table declaration are:

- `_migration_log`
- `backfill_errors`
- `analytics_events_default`
- `analytics_events_p20260101`
- `analytics_events_p20260201`
- `analytics_events_p20260301`
- `analytics_events_p20260401`
- `analytics_events_p20260501`
- `analytics_events_p20260601`
- `analytics_events_p20260701`
- `analytics_events_p20260801`
- `analytics_events_p20260901`
- `analytics_events_p20261001`
- `analytics_events_p20261101`
- `analytics_events_p20261201`

The `analytics_events` partitioned parent is represented in the Drizzle schema. Its 13 physical partitions are not separate `pgTable` declarations.

## Interpretation and required follow-up

| Relation(s) | Current source-level interpretation | Required verification |
| --- | --- | --- |
| `_migration_log` | Migration-runner ledger; not a browser/mobile business resource | Confirm only the approved migration identity needs ledger access and inspect any bootstrap path that creates or reads it |
| `backfill_errors` | Not represented in the API Drizzle schemas; its authoritative writer/reader and ownership path are not established by this reconciliation | Trace its DDL, every insert/select/update/delete path, retention and whether records carry a tenant or job owner before assigning a predicate |
| `analytics_events` partitions | Physical partitions under the Drizzle-modeled `analytics_events` parent | Inspect parent/partition privileges and policy behavior, partition routing, worker access and whether direct partition access is possible; keep raw event data internal |
| Other 99 relations | Have a Drizzle `pgTable` declaration | Derive the exact owner path, allowed operations and deny-by-default row predicate from the schema, service queries and authorization rules |

## Source-observed tenant anchors

The schema contains useful relationship paths that can guide the next source audit. Examples include:

- `organization_members` links organizations, users and roles; `store_members` links stores and users.
- `stores` link to organizations; warehouses, inventory and merchant-owned catalog/offer data connect through store, warehouse or organization relationships.
- Products connect to stores and catalog taxonomy; variants, product attribute values, media and sources connect back to products or variants.
- Carts are user-owned; cart items connect to carts and selected store/product/offer records.
- Orders connect to master orders, stores and buyer users; order items, financial breakdowns, status history and shipments connect through orders.
- Payment, refund, settlement, return and dispute records connect to orders, users, stores or their parent financial/return records.
- Notifications, notification preferences and device tokens are user-linked; messages connect to conversations and their participants.
- Worker leases, operations controls, outbox, audit and feature-flag tables are operational surfaces rather than ordinary merchant/buyer resources.

These are relationship anchors, not approved SQL predicates. Some tables are global taxonomy or platform configuration; they do not become tenant-owned merely because they are represented by Drizzle. Service-level authorization and allowed operations must be checked before turning any relationship into an RLS policy.

## Security baseline retained from the live inventory

The 19-November read-only catalog snapshot records:

- 114 public relations; RLS enabled/forced on 0; no public RLS policies.
- `anon`, `authenticated` and `service_role` have no effective SELECT/INSERT/UPDATE/DELETE privileges on those relations.
- Those roles retain TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on the 114 relations.
- The inspection connection was `postgres` with BYPASSRLS; it does not establish the API or migration runtime identity.

The schema-count reconciliation does not change those facts and does not prove that the intended RLS architecture is ready. The full source inventory, grant evidence and design constraints remain in [DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md](./DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md) and [G-002-RLS-ARCHITECTURE-PROPOSAL.md](./G-002-RLS-ARCHITECTURE-PROPOSAL.md).

## Exit criteria still open

1. Trace the owner and operations for `backfill_errors` and the migration ledger.
2. Verify analytics parent/partition access semantics and direct partition privileges.
3. Produce a 114-relation matrix with exact owner path, principal classes, permitted operations and deny-by-default predicate or documented global/system exception.
4. Audit every service/raw-SQL/worker access path against that matrix.
5. Prove transaction-local actor and tenant context across pooled requests, rollback, concurrent connection reuse and background workers.
6. Capture actual API and migration session/effective roles in an explicitly approved protected staging run.
7. Only then prepare a reviewed least-privilege and table-specific RLS migration for isolated verification.

**Status:** P1-07 remains PARTIAL. This document closes only the Drizzle schema coverage reconciliation, not the per-table authorization matrix or G-002.
