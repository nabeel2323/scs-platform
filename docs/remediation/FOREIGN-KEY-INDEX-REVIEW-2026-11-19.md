# Foreign-Key Index Candidate Review — 19 November 2026

**Finding:** G-013 — foreign-key constraints without a matching leading index  
**Environment:** Shared Supabase PostgreSQL project  
**Method:** Read-only catalog and statistics queries  
**Mutation performed:** None

## Executive result

The fresh exact leading-column inventory identifies **71 candidate foreign keys** without a matching valid index, compared with the earlier Supabase advisor count of **55**. The difference has not been reconciled to identical advisor semantics.

The current data does not justify creating indexes for all candidates. Only four affected tables have non-zero estimated live rows, and all are small. The current query-statistics snapshot does not identify representative high-volume application joins that would benefit from a specific candidate index.

**Decision:** no index DDL was applied or prepared for automatic execution. Revisit after representative staging data and query plans are available.

## Non-empty candidate tables

| Table | Estimated live rows | Seq scans | Index scans | Total size |
|---|---:|---:|---:|---:|
| sessions | 19 | 6 | 47 | 96 kB |
| device_credentials | 6 | 14 | 43 | 88 kB |
| role_permissions | 4 | 55 | 6,518 | 80 kB |
| organization_members | 3 | 15 | 135 | 40 kB |

The candidate inventory includes two missing foreign-key indexes on `device_credentials` and two on `organization_members`. The row estimates are approximate PostgreSQL statistics, not exact counts.

## Empty-table candidates and misleading scan counters

The remaining candidate list reports zero estimated live rows for tables including `products`, `shipments`, `merchant_offers`, `orders`, `refunds`, `payment_records`, `commission_reversals`, `stock_movements` and other operational/catalog tables.

Some empty tables still have high cumulative scan counters. These counters are accumulated since the relevant statistics reset and do not prove that the table currently contains rows or that a particular missing FK index would improve a real query. For example, `orders` and `commission_reversals` have high sequential-scan counters but zero estimated live rows in this snapshot.

## Workload evidence

The available `pg_stat_statements` snapshot is dominated by Supabase metadata/management queries. The outbox polling query is the clearest application workload signal, but it does not justify creating arbitrary indexes on unrelated foreign-key columns. No representative high-volume join, parent delete/update or child lookup plan was identified for the candidate list.

## Recommended next evidence

1. Load a representative, non-sensitive staging dataset with realistic order, catalog, inventory, offer, return and payment volumes.
2. Capture the exact application SQL for high-frequency joins and parent-row update/delete paths.
3. Run `EXPLAIN (ANALYZE, BUFFERS)` before and after each proposed index on representative data.
4. Measure index size, write amplification and migration lock behavior.
5. Add only the indexes with demonstrated query benefit and acceptable write/storage cost; keep the migration reversible through a forward-fix plan.

## Status

**Review complete; index DDL deferred.** The 71-candidate inventory is documented, but a safe index list cannot be selected from the current near-empty dataset. No schema or data was changed.
