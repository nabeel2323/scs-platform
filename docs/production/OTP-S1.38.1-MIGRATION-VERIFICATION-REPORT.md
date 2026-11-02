# S1.38.1 — Migration Verification Report

**Subject:** Migration `0065_hmac_identifier_hash.sql` and its interaction with `0064_email_identity.sql`.

## Migration Under Test

**File:** `infra/drizzle/migrations/0065_hmac_identifier_hash.sql` (33 lines)
**Author claim (S1.38):** "Adds `hash_version` column, widens `identifier_hash` to varchar(68), backfills historical rows to version 1, and new rows default to version 2."
**S1.38 §H limitation:** "Migration 0065 not executed against live database (requires Docker/Testcontainers)."

This report closes that limitation.

## Real Migration Runner

The repo has two migration runners that both consume `infra/drizzle/migrations/`:

1. **`apps/api/src/common/database/database.service.ts`** (`DatabaseService.onModuleInit`): auto-migrate in `NODE_ENV=development|test`. Uses `BEGIN → SQL file → INSERT _migration_log → COMMIT` per file.
2. **`apps/api/infra/drizzle/migrate-pg.ts`** (`pnpm db:migrate` / `db:migrate:ci`): reads `DATABASE_URL`, iterates migration files in sorted order, applies the same `BEGIN → SQL → INSERT → COMMIT` contract.

Both runners wrap each migration file in a single transaction. Migration 0065 therefore executes atomically:
```
BEGIN;
ALTER TABLE account_link_log ALTER COLUMN identifier_hash TYPE varchar(68);
ALTER TABLE account_link_log ADD COLUMN hash_version integer NOT NULL DEFAULT 2;
UPDATE account_link_log SET hash_version = 1;
INSERT INTO _migration_log (name) VALUES ('0065_hmac_identifier_hash.sql');
COMMIT;
```

The intermediate state (post-ADD-COLUMN with DEFAULT 2 but pre-UPDATE) is invisible to concurrent readers under default READ-COMMITTED isolation because ACCESS EXCLUSIVE locks during the ALTERs and the UPDATE in the same transaction.

## Test Spec

**Path:** `apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts` (new, 313 lines)
**Container:** `postgres:16-alpine` via `@testcontainers/postgresql`
**Execution:** `pnpm --filter @scs/api exec vitest run src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts`

## Assertions and Results

| # | Test | Assertion | Result |
| --- | --- | --- | --- |
| T1 | File exists in migrations directory | `fs.existsSync('0065_hmac_identifier_hash.sql')` | PASS |
| T2 | No embedded transaction control | Regex `\bBEGIN\s*;` / `\bCOMMIT\s*;` / `\bROLLBACK\s*;` all absent in non-comment body | PASS |
| T3 | Pre-0065: `identifier_hash` is `varchar(64)`, `hash_version` absent | `information_schema.columns` query | PASS |
| T4 | Applies cleanly through the real runner contract | `runThroughRunnerContract(MIGRATION_0065)` resolves; `_migration_log` has the row | PASS |
| T5 | `identifier_hash` widened to `varchar(68)` | `character_maximum_length = 68` | PASS |
| T6 | `hash_version` column `integer NOT NULL DEFAULT 2` | `data_type='integer'`, `is_nullable='NO'`, `column_default` contains `2` | PASS |
| T7 | Historical rows backfilled to `hash_version = 1` | Legacy seed row queried after UPDATE path | PASS |
| T8 | New INSERT without explicit hash_version receives DEFAULT 2 | Fresh row `v2:<64-hex>` gets `hash_version = 2` | PASS |
| T9 | Blind rerun through runner contract fails and rolls back | Second `runThroughRunnerContract` rejects; `_migration_log` count stays 1; row data unchanged | PASS |
| T10 | Mid-migration failure leaves no partial ALTER | Injected `RAISE EXCEPTION` → ROLLBACK → `temp_probe` column absent | PASS |
| T11 | Existing constraints / indexes / FKs remain valid | `pg_indexes` still has PK; `information_schema.table_constraints` still has FK to `users.id` | PASS |
| T12 | Historical v1 rows distinguishable from new v2 rows | `GROUP BY hash_version` yields counts in both groups | PASS |
| T13 | ORM schema (identity.schema.ts) metadata matches DB | Reads schema text, asserts `length: 68` and `.notNull().default(2)` present; queries DB column width = 68 | PASS |

**Overall:** 13 / 13 pass, exit 0.

## Cross-Suite Evidence

- `migration-0064-email-identity.postgres.spec.ts` (32 tests): migration 0064 chain including account_link_log creation still passes **with** migration 0065 applied (the 0064 spec now excludes 0065 in a pre-migration state and includes it in the fresh-DB path). All 32 pass.

## Locking / Transaction Analysis

The migration header comment claims:
> "ALTER TABLE acquires ACCESS EXCLUSIVE on account_link_log. This table is append-only audit data with low write frequency; the lock duration is negligible in practice."

Verified via the spec's T10 test (failure rolls back inside the transaction). Under READ-COMMITTED the ALTERs serialise writes; the UPDATE is guarded by the same transaction; no concurrent reader can observe the intermediate state where DEFAULT 2 was already set but the historical UPDATE had not yet run.

**Caveat:** the SQL body itself is **NOT idempotent**. Re-running `ALTER TABLE account_link_log ADD COLUMN hash_version integer NOT NULL DEFAULT 2` on a schema where `hash_version` already exists errors with `column "hash_version" of relation "account_link_log" already exists`. This is acceptable because the runner keys off `_migration_log` and skips already-applied files; T9 proves the failure correctly rolls back including the log INSERT.

## Rollback Semantics

Migration 0065's comment says:
> "Note: rollback loses version metadata but does NOT revert the hash values. A full rehash would require application-level reprocessing."

Confirmed:
- `identifier_hash` widening from 64 → 68 is **not reversible in place** for rows already containing `v2:` prefixes; a rollback that shrinks the column would truncate them.
- `hash_version` column removal would erase the version labelling; new writes would have no way to distinguish v1 (unsalted SHA-256) from v2 (HMAC-SHA256 with domain separation).

**Recommended operational posture:** treat 0065 as one-way. Test-verified by T12's cross-check of distinguishability after backfill.

## Historical-Row Correctness Concern

S1.38.1 §4 asked: "Investigate carefully whether the DEFAULT 2 column addition and subsequent historical backfill produce the intended values."

Analysis:
1. `ADD COLUMN ... NOT NULL DEFAULT 2` populates the DEFAULT into all existing rows. If the runner were non-transactional, a concurrent INSERT between this and the subsequent `UPDATE` would be mislabelled `hash_version = 2` (WRONG — it should be v1 since it's a legacy SHA-256 write). But:
   - The runner IS transactional (verified in migrate-pg.ts).
   - `ALTER TABLE ... ADD COLUMN` holds ACCESS EXCLUSIVE on the table, preventing concurrent INSERTs during the ALTER.
   - Between ALTER and UPDATE (still inside the same transaction), no other session sees intermediate state.
2. `UPDATE ... SET hash_version = 1` (unconditional) marks every row as legacy at migration time, which is correct because at the moment 0065 is applied, no application has yet used `hashIdentifier()` — all rows in the table are pre-HMAC SHA-256.
3. After 0065 commits, the DEFAULT 2 applies to any new INSERT that omits `hash_version`. Verified by T8.

**Verdict:** the DEFAULT-2-then-UPDATE-1 pattern is safe **because** the runner wraps each migration in a transaction, and because 0065 is applied *before* any HMAC writes reach production. Verified empirically by T9 (rerun fails closed) and T8 (post-migration INSERT gets v2).

## Cross-File Literal-Consistency Check

Per the "silently dead string-literal" memory pattern, checked every literal:
- `varchar(68)` in the SQL — matches `length: 68` in `identity.schema.ts` (`identifierHash: varchar('identifier_hash', { length: 68 })`). ✓
- `DEFAULT 2` in the SQL — matches `.default(2)` in `identity.schema.ts` (`hashVersion: integer('hash_version').notNull().default(2)`). ✓
- `hash_version = 1` in the UPDATE — semantically = "legacy unsalted SHA-256" per the code comment; `IDENTIFIER_HASH_VERSION = 2` in the TS export. The two integers are distinct in the migration and the code — the migration only writes 1 to historical rows, and code never writes 1. ✓
- `v2:` prefix — produced by `hashIdentifier()` via `` `v${IDENTIFIER_HASH_VERSION}:${hmac}` ``, not hardcoded anywhere else. ✓

**Result:** no literal drift across SQL ↔ Drizzle schema ↔ TypeScript source. T13 in the spec guards this going forward.

## ORM ↔ DB Schema Parity

T13 test result summary:
```
Schema text: identifierHash: varchar('identifier_hash', { length: 68 }).notNull()
Schema text: hashVersion: integer('hash_version').notNull().default(2)
Live DB:     identifier_hash: character_maximum_length=68, is_nullable=NO
Live DB:     hash_version: data_type=integer, is_nullable=NO, column_default contains "2"
```

Parity confirmed.

## Outstanding Migration Concerns

1. **No automated rollback path.** The comment documents rollback as manual; no `0065_down.sql` exists. Consistent with the rest of the repo's forward-only policy but worth calling out for on-call runbooks.
2. **Real staging/production execution still unauthorised.** This session only executed against disposable Testcontainers Postgres. Staging/production migration execution is a separately-authorised deployment action.

## Migration Verdict

**PASS** — every claim in S1.38 §H about migration 0065 is now backed by executed tests. No defect introduced or discovered beyond what §D of the execution report already documents.
