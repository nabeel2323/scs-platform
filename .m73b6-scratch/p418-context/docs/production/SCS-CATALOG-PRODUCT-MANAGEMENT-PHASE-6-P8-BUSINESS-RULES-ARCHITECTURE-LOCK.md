# P8 Business Rules & Architecture Lock
## Import/Export Production Hardening

---

## 1. Status

**P8 BUSINESS RULES & ARCHITECTURE LOCK**

Status: **LOCKED**

Architecture: **GO**

Migration: **0055 REQUIRED**

Next Gate: **P8 IMPLEMENTATION**

Date: 2026-10-06

Predecessor: P7 CLOSED / PASS WITH CONDITIONS (34/34 acceptance criteria, 35/35 PostgreSQL runtime tests)

Authoritative audit: SCS-CATALOG-PRODUCT-MANAGEMENT-NEXT-PHASE-ARCHITECTURE-AUDIT.md (GO WITH CONDITIONS)

---

## 2. Predecessor

P7 — Store Membership Authorization is formally CLOSED / PASS WITH CONDITIONS.

P7 evidence summary:
- 34/34 acceptance criteria PASS
- 0 FAIL, 0 BLOCKED
- 35/35 PostgreSQL runtime tests PASS
- 300 last-owner concurrency iterations, 0 zero-owner states
- Migration 0054 latest (store_members)
- Migration 0055 does not exist
- HEAD: 0dcf9ca on develop

P7 deferred conditions (carried forward, not in P8 scope):
- None affecting P8 scope

---

## 3. Audit Reference

The Next Phase Architecture & Business Audit (SCS-CATALOG-PRODUCT-MANAGEMENT-NEXT-PHASE-ARCHITECTURE-AUDIT.md) found:

| Severity | Count | IDs |
|----------|-------|-----|
| P0 Blocker | 0 | — |
| P1 Blocker | 0 | — |
| P2 | 3 | F-NP-01, F-NP-02, F-NP-03 |
| P3 | 7 | F-NP-04 through F-NP-10 |

P8 scope addresses the four P2 findings that are production-safety blockers:
- **F-NP-01** — Concurrent import protection
- **F-NP-02** — Import resumability
- **F-NP-03** — Negative inventory prevention
- **F-NP-08** — Typed attribute import

Remaining P3 findings (F-NP-04, F-NP-05, F-NP-06, F-NP-07, F-NP-09, F-NP-10) are deferred to subsequent milestones.

---

## 4. P8 Objective

Make catalog import production-safe for:

1. Concurrent merchant activity
2. Large imports (1,000+ rows)
3. Interrupted imports (process crash, server restart, network failure)
4. Repeated processing (idempotent chunk retry)
5. Typed product attributes (column-per-attribute import)
6. Inventory data integrity (database-level constraints)

P8 must preserve:
- Tenant isolation (org-scoped data access)
- Store membership authorization (P7 assertStoreInOrg + assertStoreMember)
- Typed attribute authority (product_attribute_values, variant_attribute_values)
- Product/variant architecture (canonical products, merchant offers)
- Inventory ledger architecture (inventory_items + stock_movements)
- Existing import compatibility (SKU matching, DRAFT creation, price tier)
- Existing order/checkout behavior (reservation, release, settlement)

---

## 5. Scope

### In Scope

| ID | Finding | Description |
|----|---------|-------------|
| F-NP-01 | P2 | Concurrent import protection (advisory lock by storeId) |
| F-NP-02 | P2 | Import resumability (chunk-based processing with durable checkpoints) |
| F-NP-03 | P2 | Negative inventory prevention (DB CHECK constraints) |
| F-NP-08 | P3 | Typed attribute import (column-per-attribute mapping) |

### Out of Scope

The following are explicitly deferred (confirmed by audit as non-blocking):

- Publishing workflow (P3)
- Moderation UI
- Search price/availability filters
- Variant media UI
- Orphan media cleanup
- RTL redesign
- Manufacturer entity
- Invitations, payments, refunds, returns, disputes
- Marketplace search redesign
- Admin redesign

---

## 6. Business Decisions

### BD-P8-01 — Import Chunk Size

**Decision: 100 rows per chunk**

| Option | Rows | Assessment |
|--------|------|------------|
| A | 50 | Too small — excessive transaction overhead, 20 chunks for 1,000 rows |
| **B** | **100** | **Balanced — 10 chunks for 1,000 rows, manageable transaction size** |
| C | 250 | Too large — long transactions, harder recovery, progress visibility gaps |

**Rationale:**
- PostgreSQL transaction size: 100 rows × (product lookup + variant upsert + price upsert + optional inventory insert) ≈ 400 queries per transaction. Well within PostgreSQL's comfort zone.
- Redis memory: staged rows are JSON strings ≈ 500 bytes each. 100 rows ≈ 50KB per chunk fetch. Negligible.
- Processing duration: ~2-5 seconds per chunk at 100 rows. Well within API timeout (30s default).
- Failure recovery: at most 100 rows to reprocess. Acceptable.
- Progress visibility: 1% granularity for a 10,000-row import. Sufficient for polling clients.
- Concurrent workers: one chunk at a time per job (serialized). No parallel chunk processing in P8.
- API timeout risk: 100 rows × ~50ms/row = ~5s per chunk. Safe.

**Business impact:** Merchants importing 5,000 rows see progress updates every 100 rows. Failed chunks retry individually without reprocessing completed chunks.

**Technical impact:** New `import_job_chunks` table. processImportJob refactored to chunk-oriented loop.

**Migration impact:** Migration 0055 creates import_job_chunks.

**Acceptance impact:** P8-A02 (chunk persistence), P8-A05 (resumability), P8-A07 (durable checkpoints).

---

### BD-P8-02 — Concurrent Import Behavior

**Decision: REJECT with PostgreSQL advisory lock**

| Option | Assessment |
|--------|------------|
| **A. REJECT** | **Deterministic, immediate feedback, no hidden state** |
| B. QUEUE | Creates hidden waiting jobs, requires polling/webhook notification, complex state management |
| C. SERIALIZE | Hidden waiting with no visibility, same complexity as QUEUE |

**Mechanism: PostgreSQL session-level advisory lock**

Lock key derivation: `hashtext(storeId)` — PostgreSQL's built-in `hashtext()` function produces a stable 32-bit integer from the store UUID string. This avoids manual hash computation and collision risk is negligible for the expected store count (<10,000).

Lock acquisition:
```sql
SELECT pg_try_advisory_xact_lock(hashtext(<storeId>))
```

- **Transaction-level lock** (`pg_try_advisory_xact_lock`): automatically released when the processing transaction commits or rolls back. No orphan locks on crash.
- **Non-blocking** (`pg_try_advisory_*`): returns false immediately if lock is held, rather than waiting.
- **Single transaction scope**: the lock is acquired at the start of processImportJob and held until completion/failure. The entire chunked processing loop runs inside this transaction boundary.

Wait — a single transaction spanning the entire import would hold the advisory lock but also create an unacceptably long transaction. The correct approach:

**Revised mechanism: Application-level mutex with database-backed state**

1. Before processing, atomically transition the import job from READY → PROCESSING using a conditional UPDATE:
   ```sql
   UPDATE import_jobs SET status = 'PROCESSING', updated_at = NOW()
   WHERE id = <jobId> AND status = 'READY'
   RETURNING id
   ```
2. If zero rows returned → another process is already handling this job → reject with 409 CONFLICT.
3. If one row returned → this process owns the job → proceed with chunked processing.
4. On completion → status = COMPLETED. On failure → status = FAILED.
5. For crash recovery: a job stuck in PROCESSING for > 30 minutes (configurable) can be reset to READY by an admin endpoint or background sweeper.

This is simpler than advisory locks, survives connection pool recycling, and provides clear state visibility.

**Collision avoidance:** The conditional UPDATE is atomic in PostgreSQL. Two concurrent UPDATEs on the same row are serialized by the row lock. Exactly one sees `status = 'READY'` and succeeds; the other sees the already-changed status and returns zero rows.

**Crash behavior:** If the process crashes mid-import, the job remains in PROCESSING. A background sweeper (or manual admin action) resets stale PROCESSING jobs (>30 min) to READY. The chunk table tracks which chunks completed, so resumption skips them.

**Pool behavior:** No session-level locks held across connections. The mutex is purely row-level.

**Business impact:** A merchant who clicks "Process" twice sees a clear 409 conflict on the second click. A crashed import can be resumed without data loss.

**Technical impact:** processImportJob wraps the chunk loop in a state-guarded entry. New CANCELLED state for explicit abort.

**Migration impact:** import_jobs.status must accommodate new states (PROCESSING, CANCELLED). Migration 0055 widens if needed and adds `locked_at` column.

**Acceptance impact:** P8-A03 (same-store rejection), P8-A04 (different-store parallelism), P8-A13 (cancellation).

---

### BD-P8-03 — Typed Attribute Import Format

**Decision: One column per attribute (column-per-attribute)**

| Option | Assessment |
|--------|------------|
| **A. Column per attribute** | **Aligns with Excel UX, maps to typed storage, preserves existing template format** |
| B. JSON attribute column | Reintroduces JSONB as authority, violates Phase 3 architecture |

**Column naming convention:**
- Attribute columns are prefixed with `attr:` followed by the attribute code
- Example: `attr:color`, `attr:weight_kg`, `attr:material`, `attr:is_hazardous`
- This prefix distinguishes attribute columns from structural columns (name, sku, priceMinor, etc.)

**Attribute code resolution:**
1. Parse column header → extract code after `attr:` prefix
2. Look up `attribute_definitions` by code (case-sensitive, trimmed)
3. If not found → row error: "Unknown attribute: <code>"
4. If found → resolve scope (PRODUCT or VARIANT), type, and validation rules

**Mapping to typed storage:**

| Attribute Type | Storage Column | Import Parsing |
|---------------|----------------|----------------|
| TEXT, LONG_TEXT, URL, COLOR | valueText | Trim, validate length |
| INTEGER, MEASUREMENT | valueNumber | parseInt, validate |
| DECIMAL, CURRENCY | valueNumber | parseFloat, validate |
| BOOLEAN | valueBoolean | true/false/1/0/yes/no |
| DATE, DATETIME | valueText (ISO 8601) | Validate format |
| SELECT | optionValue | Must match an active attribute_option.value |
| MULTI_SELECT | valueJson (string array) | Comma-separated → JSON array |
| FILE | valueText (URL) | Validate URL format |

**Product vs Variant attributes:**
- If scope = PRODUCT → write to product_attribute_values
- If scope = VARIANT → write to variant_attribute_values
- The scope is determined from the attribute_definition, not the column header

**Validation rules:**
1. Unknown attribute code → row error (not job failure)
2. Invalid value for type (e.g., "abc" for INTEGER) → row error
3. Invalid option for SELECT → row error listing valid options
4. Empty/null value → skip (do not write, do not error)
5. Duplicate attribute column → first occurrence wins, subsequent ignored with warning
6. Attribute not in product type's productTypeAttributes → warning (not error — attributes can exist independently)
7. MULTI_SELECT with duplicate values within a cell → deduplicate

**Arabic attribute values:**
- Text values are stored as-is (Arabic text in valueText)
- SELECT option matching is against `value` (not `valueAr`) — consistent with existing taxonomy service
- No transliteration

**Business impact:** Merchants add attribute columns to their Excel template using attribute codes. The import validates each value against the attribute definition's type and options.

**Technical impact:** importRow extended with attribute parsing after product/variant creation. Uses existing taxonomyService.setProductAttributeValues / setVariantAttributeValues.

**Migration impact:** None — uses existing attribute_definitions and typed value tables.

**Acceptance impact:** P8-A08 (typed attribute import), P8-A09 (row-level validation).

---

### BD-P8-04 — Negative Inventory Prevention

**Decision: HARD BLOCK with database CHECK constraints**

| Option | Assessment |
|--------|------------|
| A. Warning | Application-level only — no safety net against bugs or direct DB access |
| **B. Hard block** | **Database-level CHECK constraints as final safety net** |

**Inventory lifecycle analysis (from source code inspection):**

| Operation | Method | qty_on_hand effect | qty_reserved effect | FOR UPDATE? |
|-----------|--------|--------------------|---------------------|-------------|
| IN (adjust +) | adjustStock | +quantity | — | No (but checked) |
| OUT (adjust -) | adjustStock | -quantity (checked vs reserved) | — | No (but checked) |
| RESERVE | reserveStock | — | +quantity | **Yes** |
| RELEASE | releaseStock | — | -quantity (clamped to 0) | **Yes** |
| ADJUST (bulk) | bulkAdjustStock | +quantity (checked vs reserved) | — | No (but checked) |
| TRANSFER out | transferStock | -quantity (checked vs available) | — | **No** |
| TRANSFER in | transferStock | +quantity (dest) | — | **No** |
| IMPORT (initial) | createItem | initialQty | 0 | No |
| SALE | (via RESERVE + settlement) | — | — | — |
| CANCEL | (via RELEASE) | — | — | — |
| RETURN | (via adjustStock +) | +quantity | — | — |

**Safe constraints:**

1. **CHECK (qty_on_hand >= 0)** — SAFE to enforce at DB level.
   - Every decrement path already checks at application level.
   - adjustStock: `if (newQty < 0) throw BadRequestException`
   - bulkAdjustStock: `if (newQty < inv['qtyReserved'])` and `if (newQty < 0)`
   - transferStock: `if (availableForTransfer < input.quantity)` ensures new_on_hand >= reserved >= 0
   - The CHECK provides a safety net against future code changes or direct DB access.

2. **CHECK (qty_reserved >= 0)** — SAFE to enforce at DB level.
   - reserveStock: always adds positive quantity
   - releaseStock: `Math.max(0, locked.qtyReserved - input.quantity)` — clamps to zero
   - No path decrements below zero.

3. **CHECK (qty_reserved <= qty_on_hand)** — **NOT safe to enforce at DB level in current architecture.**
   - transferStock reads qty_on_hand and qty_reserved outside a FOR UPDATE lock.
   - Race scenario: transfer reads (on_hand=10, reserved=5), concurrent reserveStock changes reserved to 9, transfer UPDATE sets on_hand=5 → now reserved(9) > on_hand(5).
   - The application-level check (`availableForTransfer = on_hand - reserved`) prevents this at the application layer, but a DB CHECK would cause raw constraint violations instead of friendly errors.
   - **P8 implementation must harden transferStock with SELECT ... FOR UPDATE before this constraint can be safely added.** This is a P8 implementation task, not a P8 architecture blocker.

**Existing data compatibility:**
- All existing inventory_items rows have qty_on_hand >= 0 and qty_reserved >= 0 (verified by application-level guards in all write paths).
- No backfill needed.
- Migration adds constraints with `ADD CONSTRAINT ... CHECK (...)` — idempotent with `IF NOT EXISTS` (PostgreSQL 9.5+).

**Business impact:** No merchant or admin workflow can produce negative inventory, even under concurrent access or application bugs. The database is the final authority.

**Technical impact:** Two CHECK constraints on inventory_items. transferStock hardened with FOR UPDATE in P8 implementation.

**Migration impact:** Migration 0055 adds CHECK constraints.

**Acceptance impact:** P8-A10 (negative inventory DB constraints).

---

## 7. Import Lifecycle

### Current State Machine (Pre-P8)

```
UPLOADED → MAPPING → IMPORTING → COMPLETED
                         ↓
                       FAILED (reprocessable)
```

Current states: UPLOADED, MAPPING, IMPORTING, COMPLETED, FAILED (from migration 0015 + 0036 widening to varchar(30)).

### Target State Machine (P8)

```
UPLOADED → MAPPING → READY → PROCESSING → COMPLETED
                                    ↓
                              FAILED (resumable)
                                    ↓
                              CANCELLED (terminal)
```

| State | Meaning | Entry Conditions | Exit Conditions |
|-------|---------|------------------|-----------------|
| UPLOADED | File uploaded, no column mapping yet | Initial state after createImportJob | User submits column mapping |
| MAPPING | Column mapping submitted, rows staged | columnMapping set, rows staged in Redis | Validation passes → READY |
| READY | Validated, ready for processing | All rows staged and validated | User clicks Process → PROCESSING |
| PROCESSING | Actively being processed by a worker | Atomic status transition from READY | All chunks done → COMPLETED; fatal error → FAILED |
| COMPLETED | All chunks processed (some may have errors) | Final chunk committed | Terminal state |
| FAILED | Processing failed (catastrophic or user-cancelled) | Error during processing or explicit cancel | Admin resets → READY (if chunks allow resume) |
| CANCELLED | Explicitly cancelled by user | User requests cancel while READY or PROCESSING | Terminal state |

**Removed state:** IMPORTING (replaced by PROCESSING for clarity).

**New states:** READY (explicit "ready to process" gate), CANCELLED (explicit termination).

**State transition rules:**
- UPLOADED → MAPPING: column mapping submitted
- MAPPING → READY: rows staged and validated
- READY → PROCESSING: atomic conditional UPDATE (concurrent guard)
- PROCESSING → COMPLETED: all chunks committed
- PROCESSING → FAILED: catastrophic error (DB connection lost, process crash)
- READY → CANCELLED: user cancel
- PROCESSING → CANCELLED: user cancel (cooperative — checked between chunks)
- FAILED → READY: admin reset for retry (chunks with status COMPLETED are preserved)

---

## 8. Chunk Architecture

### import_job_chunks Table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Unique identifier |
| import_job_id | UUID | NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE | Parent job |
| chunk_index | INTEGER | NOT NULL | Zero-based ordinal position |
| start_row | INTEGER | NOT NULL | First data row index (0-based within staged rows) |
| end_row | INTEGER | NOT NULL | Last data row index (inclusive) |
| status | VARCHAR(16) | NOT NULL DEFAULT 'PENDING' | Chunk state |
| row_count | INTEGER | NOT NULL | Total rows in this chunk |
| processed_rows | INTEGER | NOT NULL DEFAULT 0 | Rows processed so far |
| created_count | INTEGER | NOT NULL DEFAULT 0 | Products created |
| updated_count | INTEGER | NOT NULL DEFAULT 0 | Products updated |
| skipped_count | INTEGER | NOT NULL DEFAULT 0 | Rows skipped |
| error_count | INTEGER | NOT NULL DEFAULT 0 | Rows that failed |
| error_log | JSONB | DEFAULT '[]' | Row-level errors (capped at 100 per chunk) |
| attempt_count | INTEGER | NOT NULL DEFAULT 0 | Number of processing attempts |
| last_error | TEXT | | Last catastrophic error message |
| started_at | TIMESTAMPTZ | | When processing began |
| completed_at | TIMESTAMPTZ | | When processing finished |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Last update timestamp |

**Chunk status state machine:**
```
PENDING → PROCESSING → COMPLETED
              ↓
            FAILED (retryable up to max_attempts)
```

| Chunk Status | Meaning |
|-------------|---------|
| PENDING | Not yet processed |
| PROCESSING | Currently being processed |
| COMPLETED | All rows processed (some may have row-level errors) |
| FAILED | Chunk processing failed (attempt_count incremented) |

**Constraints:**
- UNIQUE (import_job_id, chunk_index) — prevents duplicate chunks
- CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
- CHECK (chunk_index >= 0)
- CHECK (start_row >= 0)
- CHECK (end_row >= start_row)
- CHECK (attempt_count >= 0)

**Indexes:**
- idx_import_job_chunks_job_status ON (import_job_id, status) — for finding pending/failed chunks
- idx_import_job_chunks_job_index ON (import_job_id, chunk_index) — for ordered retrieval

### Chunk Creation

When processImportJob begins:
1. Count total staged rows (from Redis or from a new durable row-count field)
2. Divide into chunks of 100 rows each
3. INSERT chunks with PENDING status
4. Process chunks sequentially (chunk_index ORDER)

### Chunk Processing

For each chunk:
1. Atomic transition: PENDING → PROCESSING (conditional UPDATE)
2. Fetch rows from Redis for this chunk's range
3. Process each row via importRow (existing logic)
4. On success: update chunk with counts, transition to COMPLETED
5. On failure: increment attempt_count, transition to FAILED
6. Update parent import_job progress

### Retry Policy

- Maximum attempts per chunk: 3
- No automatic retry (user or admin triggers retry by re-processing the job)
- Failed chunks can be individually retried
- Completed chunks are never reprocessed (idempotency guarantee)

---

## 9. Concurrency Architecture

### Same-Store Protection

**Mechanism:** Atomic conditional UPDATE on import_jobs.status.

```sql
UPDATE import_jobs
SET status = 'PROCESSING', locked_at = NOW(), updated_at = NOW()
WHERE id = <jobId> AND status = 'READY'
RETURNING id
```

- Zero rows → 409 CONFLICT with active job info
- One row → proceed with processing

**Properties:**
- Same store, two imports simultaneously: exactly one enters PROCESSING (the other's job is in a different state or a different job ID)
- Different stores: no contention (different job rows)
- Same import, two process requests: exactly one succeeds (conditional UPDATE is idempotent-safe)

### Cross-Store Independence

Different stores' imports operate on different import_jobs rows. No cross-store contention. The chunk processing for Store A does not block Store B.

### Import vs Product Studio Edit

Import creates products in DRAFT status. Product Studio edits may target ACTIVE products. These operate on different product rows (DRAFT vs ACTIVE) with different authorization paths. No conflict.

If an import updates an existing SKU (matched by SKU within store), the importRow UPDATE is a simple SET without optimistic locking. A concurrent Product Studio edit on the same product uses optimistic locking (updatedAt comparison). The import's unconditional UPDATE could overwrite a concurrent edit. **This is an accepted limitation** — import updates are rare (most imports create new products) and the import's changes are limited to description, categoryId, brandId.

### Duplicate SKU Race

Two concurrent imports for the same store with the same SKU:
- Only one import can be in PROCESSING state at a time (same-store guard)
- Therefore, no duplicate SKU race between concurrent imports
- Sequential imports with the same SKU: second import matches the existing variant (find-or-create logic) → update path, not duplicate creation

---

## 10. Resumability Architecture

### Failure Scenarios and Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Process crash during chunk | Job stuck in PROCESSING, chunk in PROCESSING | Admin resets job to READY; chunk resets to PENDING or FAILED |
| Server restart | Same as process crash | Same recovery |
| Worker crash | Same | Same |
| DB transaction fails | Chunk transaction rolls back | Chunk transitions to FAILED; retry resets to PENDING |
| Redis restart | Staged rows lost | **Staged rows must be re-staged from the original file** (see Redis Role section) |
| Network failure | DB connection error | Job transitions to FAILED; chunks preserve progress |
| One row fails | Row-level error caught | Error logged, row counted in error_count, processing continues |
| One chunk fails | Chunk transaction fails | Chunk → FAILED; other chunks unaffected |
| Entire import fails | All chunks failed or catastrophic error | Job → FAILED; admin can reset |

### Checkpoint Location

Primary checkpoint: `import_job_chunks.status` and `import_job_chunks.processed_rows`.

Secondary checkpoint: `import_jobs.processed_rows` and `import_jobs.stats` (aggregated from chunks).

### Durable State Principle

**The database is the durable source of truth for import progress.** Redis holds staged rows temporarily, but chunk state, counts, and errors are persisted in PostgreSQL after each chunk completes.

If Redis is lost after chunks have been committed to PostgreSQL, the chunk-level counts (created_count, updated_count, etc.) remain accurate. Only the raw staged rows need to be re-staged for retry.

### Retry Count

- Per-chunk maximum attempts: 3
- Per-job: no global limit (admin-controlled via reset)

### Retry Policy

- No exponential backoff (manual retry, not automatic)
- Failed chunk → attempt_count incremented → status = FAILED
- Admin retry → chunk status reset to PENDING → re-processing
- Completed chunks are skipped during retry

---

## 11. Redis Role

### Current Role (Pre-P8)

Redis stores staged rows as a list of JSON-serialized row batches. processImportJob reads all rows from Redis at the start of processing.

### P8 Role

**Redis remains staging storage only.**

| Data | Source of Truth | Rationale |
|------|----------------|-----------|
| Import job state | PostgreSQL (import_jobs) | Durable, transactional |
| Chunk state | PostgreSQL (import_job_chunks) | Durable, resumable |
| Checkpoint | PostgreSQL (chunk processed_rows, job processed_rows) | Durable, queryable |
| Staged rows | Redis (temporary) | Large data, ephemeral |
| Row-level errors | PostgreSQL (chunk error_log) | Durable, queryable |
| Progress | PostgreSQL (job stats, chunk counts) | Durable, pollable |

**Redis restart scenario:**
- If Redis loses staged rows before processing starts → user must re-upload/re-stage rows
- If Redis loses staged rows during processing → current chunk fails (rows unavailable), but completed chunks are preserved in PostgreSQL
- **Mitigation:** P8 implementation should fetch all staged rows from Redis at the start of processing and cache them in the chunk's error_log or a temporary table for the duration of the job. Alternatively, accept that Redis loss during processing requires re-staging.

**Decision:** Accept Redis as ephemeral staging. The chunk table provides durable progress tracking. If Redis is lost mid-processing, the job transitions to FAILED and the user re-uploads. Completed chunks are preserved.

---

## 12. Idempotency Model

### Product Matching

**Existing behavior preserved:** SKU within store.

```sql
SELECT ... FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.sku = <sku> AND p.store_id = <storeId> AND p.deleted_at IS NULL
LIMIT 1
```

### Idempotency Guarantees

| Scenario | Behavior |
|----------|----------|
| Existing SKU | Update path: update product description/category/brand, upsert base price |
| New SKU | Create path: create DRAFT product + variant + base price |
| Duplicate SKU within same import | First occurrence creates/updates; subsequent occurrences match the same variant (update path) |
| Duplicate SKU across concurrent imports | Prevented by same-store concurrent import guard (only one import processes at a time) |
| Variant SKU | Matched by SKU within store (same as product SKU matching) |
| GTIN/EAN/barcode | Not used for import matching (preserved from existing behavior) |
| Invalid identifiers | Row error: missing SKU → row rejected |

### Chunk Idempotency

A chunk that is retried after failure must not create duplicate products.

**Strategy:** The importRow logic uses find-or-create by SKU. If a chunk partially processed before failing:
- Rows that succeeded already created/updated products
- On retry, those same SKUs are found by the find-or-create logic → update path (not duplicate creation)
- Rows that were not processed are processed normally

**This makes chunk retry naturally idempotent** — the SKU matching logic ensures that re-processing a row that already succeeded is a safe update, not a duplicate creation.

### Price Idempotency

upsertBasePrice uses INSERT ... ON CONFLICT (price_list_id, variant_id) DO UPDATE. Naturally idempotent.

---

## 13. Typed Attribute Import Contract

### Column Format

Attribute columns in the import file use the prefix `attr:` followed by the attribute definition code.

Example import file:
```
name | sku | priceMinor | attr:color | attr:material | attr:weight_kg
-----|-----|------------|------------|---------------|----------------
Widget | W001 | 1050 | Red | Steel | 2.5
Gadget | G001 | 2500 | Blue | Plastic | 0.8
```

### Resolution Pipeline

```
Column header "attr:color"
  → Extract code: "color"
  → SELECT * FROM attribute_definitions WHERE code = 'color' AND deleted_at IS NULL
  → Found: id=abc, type=SELECT, scope=PRODUCT
  → SELECT * FROM attribute_options WHERE attribute_id = 'abc' AND value = 'Red' AND is_active = true
  → Found: optionValue = 'Red'
  → INSERT INTO product_attribute_values (product_id, attribute_definition_id, option_value)
```

### Error Handling

| Condition | Behavior | Error Message |
|-----------|----------|---------------|
| Unknown attribute code | Row error | "Unknown attribute: <code>" |
| Invalid value for type | Row error | "Invalid <type> value '<value>' for attribute <code>" |
| Invalid SELECT option | Row error | "Invalid option '<value>' for attribute <code>. Valid: <options>" |
| Empty/null value | Skip silently | — |
| Duplicate column | First wins | Warning in error log |
| Attribute not in product type | Warning (not error) | "Attribute <code> not in product type <type>" |
| MULTI_SELECT parsing | Comma-separated → array | Each value validated against options |

### VALID-ROWS-COMMIT Principle

Preserved from existing import behavior: a bad row does not cause valid rows in the same chunk to be lost. Row-level errors are caught individually and logged. The chunk transaction commits all successful rows.

---

## 14. Inventory Integrity Rules

### Database Constraints (Migration 0055)

```sql
ALTER TABLE inventory_items
  ADD CONSTRAINT ck_inventory_qty_on_hand_non_negative
  CHECK (qty_on_hand >= 0);

ALTER TABLE inventory_items
  ADD CONSTRAINT ck_inventory_qty_reserved_non_negative
  CHECK (qty_reserved >= 0);
```

### Deferred Constraint

```sql
-- NOT in migration 0055. Requires transferStock FOR UPDATE hardening first.
-- CHECK (qty_reserved <= qty_on_hand)
```

**Rationale for deferral:** transferStock reads qty_on_hand and qty_reserved outside a FOR UPDATE lock. A concurrent reserveStock can change qty_reserved between the read and the UPDATE, causing the CHECK to fail with a raw constraint violation instead of a friendly business error. P8 implementation must harden transferStock with SELECT ... FOR UPDATE before this constraint is safe.

### Application-Level Guards (Existing, Preserved)

All inventory write paths already enforce non-negativity at the application level:
- adjustStock: `if (newQty < 0) throw BadRequestException`
- bulkAdjustStock: `if (newQty < 0) throw BadRequestException`
- reserveStock: `if (available < input.quantity) throw BadRequestException`
- transferStock: `if (availableForTransfer < input.quantity) throw BadRequestException`
- releaseStock: `Math.max(0, ...)` clamps to zero

The DB CHECK constraints are a safety net, not the primary enforcement.

---

## 15. Migration 0055 Design

### Contents

```sql
-- Migration 0055: Import chunking, inventory integrity, import state hardening
-- Idempotent: all statements use IF NOT EXISTS or are safe to re-run.

-- 1. Import job chunks table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_job_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id   UUID         NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    chunk_index     INTEGER      NOT NULL,
    start_row       INTEGER      NOT NULL,
    end_row         INTEGER      NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    row_count       INTEGER      NOT NULL,
    processed_rows  INTEGER      NOT NULL DEFAULT 0,
    created_count   INTEGER      NOT NULL DEFAULT 0,
    updated_count   INTEGER      NOT NULL DEFAULT 0,
    skipped_count   INTEGER      NOT NULL DEFAULT 0,
    error_count     INTEGER      NOT NULL DEFAULT 0,
    error_log       JSONB        DEFAULT '[]',
    attempt_count   INTEGER      NOT NULL DEFAULT 0,
    last_error      TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_import_job_chunks_job_index
        UNIQUE (import_job_id, chunk_index),
    CONSTRAINT ck_import_job_chunks_status
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    CONSTRAINT ck_import_job_chunks_index_non_negative
        CHECK (chunk_index >= 0),
    CONSTRAINT ck_import_job_chunks_rows_valid
        CHECK (end_row >= start_row),
    CONSTRAINT ck_import_job_chunks_attempts_non_negative
        CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_import_job_chunks_job_status
    ON import_job_chunks (import_job_id, status);

CREATE INDEX IF NOT EXISTS idx_import_job_chunks_job_index
    ON import_job_chunks (import_job_id, chunk_index);

-- 2. Import job state hardening ────────────────────────────────────

-- Add locked_at column for concurrent processing guard
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Widen status to accommodate new states (PROCESSING, CANCELLED)
-- Current: varchar(16) from migration 0004, widened to varchar(30) by 0036
-- Ensure sufficient width for all state values
ALTER TABLE import_jobs ALTER COLUMN status TYPE VARCHAR(30);

-- 3. Inventory integrity constraints ──────────────────────────────

-- Safety net: prevent negative quantities at database level
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_inventory_qty_on_hand_non_negative'
    ) THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT ck_inventory_qty_on_hand_non_negative
            CHECK (qty_on_hand >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_inventory_qty_reserved_non_negative'
    ) THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT ck_inventory_qty_reserved_non_negative
            CHECK (qty_reserved >= 0);
    END IF;
END $$;
```

### Existing Data Compatibility

- **import_job_chunks:** New table, no existing data affected.
- **import_jobs.locked_at:** New nullable column, no backfill needed. Existing rows have NULL (unlocked).
- **import_jobs.status:** Already varchar(30) from migration 0036. No data change needed. New status values (READY, PROCESSING, CANCELLED) are compatible.
- **inventory_items CHECK constraints:** All existing rows already satisfy qty_on_hand >= 0 and qty_reserved >= 0 (enforced at application level since migration 0005). No backfill needed.

### Rollback Considerations

- import_job_chunks: DROP TABLE IF EXISTS (only if no processing has occurred)
- import_jobs.locked_at: DROP COLUMN (safe if no processing is active)
- inventory_items CHECK constraints: DROP CONSTRAINT (safe, reverts to application-level enforcement)

### Compatibility with Migration 0054

Migration 0054 creates store_members. Migration 0055 does not reference store_members. No dependency conflict.

---

## 16. Security Model

### Authorization Preservation

All import endpoints maintain the P7 authorization chain:

| Endpoint | Authorization |
|----------|---------------|
| POST stores/:storeId/imports | assertStoreInOrg + assertStoreMember |
| POST imports/:id/rows | assertStoreInOrg + assertStoreMember (storeId resolved from job) |
| POST imports/:id/process | assertStoreInOrg + assertStoreMember (storeId resolved from job) |
| GET stores/:storeId/products/export | assertStoreInOrg + assertStoreMember |

### New Endpoint Authorization

| Endpoint | Authorization |
|----------|---------------|
| GET imports/:id/chunks | assertStoreInOrg + assertStoreMember (storeId resolved from job) |
| POST imports/:id/chunks/:chunkId/retry | assertStoreInOrg + assertStoreMember (storeId resolved from job) |
| POST imports/:id/cancel | assertStoreInOrg + assertStoreMember (storeId resolved from job) |

### Trust Boundaries

- **Client storeId:** Never trusted. Always validated via assertStoreInOrg.
- **Job ID alone:** Not sufficient. Ownership resolved from import_jobs.storeId → assertStoreInOrg + assertStoreMember.
- **Chunk ID alone:** Not sufficient. Ownership resolved from chunk.import_job_id → import_jobs.storeId → assertStoreInOrg + assertStoreMember.

### Tenant Isolation

A store member cannot access another store's:
- Import jobs (filtered by storeId)
- Chunks (resolved through job → storeId)
- Errors (part of chunk data)
- Staged rows (Redis key derived from job ID, accessed only after authorization)
- Progress (part of job/chunk data)
- Exports (scoped to storeId)

---

## 17. Tenant Isolation

Tenant isolation is preserved through the existing P7 authorization architecture:

1. **JWT → Permission:** `@RequirePermission('merchant:products:write')` on all import mutation endpoints
2. **Permission → Organization:** `assertStoreInOrg` verifies the store belongs to the caller's active organization
3. **Organization → Store Membership:** `assertStoreMember` verifies the caller is an ACTIVE member of the store
4. **Store Membership → Operation:** Only authorized members can create, process, or query imports

P8 adds no new tenant escape vectors. Chunk operations resolve ownership through the parent import job's storeId.

---

## 18. Transaction Boundaries

### Decision: One Transaction Per Chunk

| Option | Assessment |
|--------|------------|
| One transaction per row | Too granular — excessive overhead, no atomicity for related rows within a chunk |
| **One transaction per chunk** | **Balanced — rollback scope is 100 rows max, checkpoint is chunk-level** |
| Smaller sub-transactions | PostgreSQL doesn't support true sub-transactions (SAVEPOINT is limited) |

**Chunk transaction scope:**
```
BEGIN
  → Update chunk: PENDING → PROCESSING
  → For each row in chunk:
      → importRow (find-or-create product, variant, price, inventory, attributes)
      → Catch row-level errors, log to error_log
  → Update chunk: counts, status → COMPLETED
  → Update import_job: aggregated progress
COMMIT
```

**Rollback behavior:** If any statement within the chunk transaction fails catastrophically (e.g., DB connection lost), the entire chunk rolls back. No partial chunk state.

**Checkpoint safety:** The chunk's COMPLETED status and counts are committed in the same transaction as the row processing. Therefore, a committed chunk is guaranteed to have all its changes persisted.

**Lock scope:** Each chunk transaction holds row-level locks on the products/variants it touches. Locks are released at COMMIT. No cross-chunk lock contention (chunks process sequentially).

---

## 19. Failure Recovery

### Recovery Matrix

| Failure | Scope | Recovery Path |
|---------|-------|---------------|
| Row-level error | Single row | Logged in chunk error_log, processing continues |
| Chunk processing error | Single chunk | Chunk → FAILED, attempt_count++. Other chunks unaffected. |
| DB connection lost | Current chunk | Chunk transaction rolls back. Job → FAILED. Admin resets. |
| Process crash | Current chunk | Chunk stuck in PROCESSING. Job stuck in PROCESSING. Admin resets job → READY, chunk → PENDING or FAILED. |
| Redis restart | Staged rows | If before processing: re-upload required. If during processing: current chunk fails, job → FAILED. Completed chunks preserved. |
| Server restart | Same as process crash | Same recovery. |

### Stale PROCESSING Detection

A background sweeper or admin endpoint detects jobs stuck in PROCESSING:
- Condition: `status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '30 minutes'`
- Action: Reset to FAILED (or READY if chunks allow resume)
- Chunk in PROCESSING: Reset to PENDING (if attempt_count < max) or FAILED

---

## 20. Concurrency Test Strategy

### Mandatory Tests

| ID | Scenario | Expected | Iterations |
|----|----------|----------|------------|
| CT-01 | Same store — two imports simultaneously | Exactly one enters PROCESSING, other gets 409 | 100 |
| CT-02 | Different stores — two imports simultaneously | Both proceed independently | 50 |
| CT-03 | Same import — two process requests | Exactly one active processor | 100 |
| CT-04 | Worker crash during chunk | Chunk recoverable (reset to PENDING/FAILED) | 50 |
| CT-05 | Retry completed chunk | No duplicate product creation | 50 |
| CT-06 | Two workers resume same failed chunk | Exactly one successful ownership | 100 |
| CT-07 | Import vs Product Studio edit on same product | Deterministic behavior (import updates are non-conflicting fields) | 50 |
| CT-08 | Duplicate SKU race (sequential imports) | Second import matches existing variant | 50 |
| CT-09 | Negative inventory concurrent update | CHECK constraint preserved | 100 |
| CT-10 | Import cancellation vs processing | Deterministic state transition | 50 |

### Test Infrastructure

- Real PostgreSQL (Testcontainers or persistent container)
- Separate database connections per concurrent actor
- Real transactions (no mocks)
- Minimum iterations as specified per scenario
- Each scenario produces: success count, failure count, invariant violations

---

## 21. Regression Strategy

### Required Regression Coverage

| Area | Test Suite | Must Remain Green |
|------|-----------|-------------------|
| Catalog | catalog.service tests | Product CRUD, search, export |
| Product Studio | product update/create tests | Optimistic locking, type change guards |
| Variants | variant CRUD tests | FOR SHARE locks, combination keys |
| Attributes | taxonomy service tests | Typed value storage, validation |
| Offers | offer lifecycle tests | Status transitions, store scoping |
| Inventory | inventory service tests | Stock adjustments, reservations, transfers |
| Checkout | order flow tests | Cart → order → reservation |
| Orders | order management tests | Status transitions, settlement |
| Membership | P7 verification tests | Store membership, bypass roles, last-owner |
| Import/Export | import job tests | Create, stage, process, export |
| Security | authorization tests | Tenant isolation, permission guards |

### Regression Principle

No P8 change may break P6/P7 authorization, product/variant architecture, or inventory ledger integrity. All existing tests must pass without modification.

---

## 22. Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| P8-A01 | Import state machine: jobs transition through UPLOADED → MAPPING → READY → PROCESSING → COMPLETED/FAILED/CANCELLED with no invalid transitions | Unit test: all valid transitions succeed; all invalid transitions rejected |
| P8-A02 | Chunk persistence: each import job produces import_job_chunks rows with correct start_row, end_row, status | PostgreSQL test: verify chunk creation for various row counts |
| P8-A03 | Concurrent same-store rejection: two processImportJob calls for the same store → exactly one succeeds, other gets 409 | PostgreSQL concurrency test: 100 iterations, 0 double-success |
| P8-A04 | Different-store parallelism: two processImportJob calls for different stores → both succeed independently | PostgreSQL concurrency test: 50 iterations, both succeed |
| P8-A05 | Resumability: after process crash, completed chunks are not reprocessed; failed chunks can be retried | PostgreSQL test: simulate crash, resume, verify no duplicate processing |
| P8-A06 | Chunk idempotency: retrying a completed chunk produces no duplicate products | PostgreSQL test: retry completed chunk, verify product count unchanged |
| P8-A07 | Durable checkpoints: chunk status and counts survive server restart | PostgreSQL test: verify chunk state after simulated restart |
| P8-A08 | Typed attribute import: attr:code columns resolve to attribute definitions and write to typed value tables | Unit + PostgreSQL test: verify product_attribute_values and variant_attribute_values |
| P8-A09 | Row-level validation: bad attribute values produce row errors, not job failures; valid rows in same chunk commit | Unit test: verify error isolation |
| P8-A10 | Negative inventory DB constraints: CHECK (qty_on_hand >= 0) and CHECK (qty_reserved >= 0) prevent negative quantities | PostgreSQL test: attempt negative insert → constraint violation |
| P8-A11 | Import authorization: all import/chunk endpoints require assertStoreInOrg + assertStoreMember | Unit test: non-member gets 403 |
| P8-A12 | Tenant isolation: store member cannot access another store's import jobs, chunks, or errors | PostgreSQL test: cross-store access returns 403/404 |
| P8-A13 | Import cancellation: cancelling a PROCESSING job stops processing between chunks | Unit test: cancel during processing → remaining chunks not processed |
| P8-A14 | Failure recovery: a failed chunk can be retried without reprocessing completed chunks | PostgreSQL test: fail chunk 2 of 5, retry, verify chunks 1, 3, 4, 5 unaffected |
| P8-A15 | Duplicate SKU protection: same SKU in same import → first creates, subsequent updates | Unit test: verify no duplicate product |
| P8-A16 | Regression compatibility: all existing catalog, inventory, membership, and import tests pass | Full regression suite: 0 failures |

---

## 23. Migration Decision

**Migration 0055: REQUIRED**

Contents:
1. import_job_chunks table (with constraints and indexes)
2. import_jobs.locked_at column
3. inventory_items CHECK constraints (qty_on_hand >= 0, qty_reserved >= 0)

Properties:
- Idempotent (IF NOT EXISTS, DO $$ blocks)
- Non-destructive (no data modification)
- Production-safe (no table rewrites, no locks beyond brief DDL)
- Compatible with migration 0054 (no dependency)
- Compatible with existing import_jobs (new column is nullable)
- Compatible with existing inventory_items (all rows already satisfy constraints)

---

## 24. Implementation Phases

| Phase | Description | Dependencies |
|-------|-------------|--------------|
| **Phase 1** | Migration 0055 + Drizzle schema for import_job_chunks + chunk creation logic | None |
| **Phase 2** | Concurrent import protection (atomic status transition, locked_at, 409 conflict) | Phase 1 |
| **Phase 3** | Chunked processing (refactor processImportJob to chunk-oriented loop) | Phase 1, Phase 2 |
| **Phase 4** | Resumability/recovery (chunk retry, stale job detection, admin reset) | Phase 3 |
| **Phase 5** | Typed attribute import (attr:code column parsing, validation, typed storage) | Phase 3 |
| **Phase 6** | Negative inventory constraints (verify CHECK constraints, harden transferStock with FOR UPDATE) | Phase 1 |
| **Phase 7** | Regression testing (full suite: catalog, inventory, membership, import, security) | Phase 1-6 |
| **Phase 8** | Independent runtime verification (P8-A01 through P8-A16, concurrency tests) | Phase 7 |
| **Phase 9** | Release closure | Phase 8 |

---

## 25. Independent Runtime Verification Requirements

The independent runtime verification (Phase 8) must:

1. Verify all 16 acceptance criteria (P8-A01 through P8-A16) against a real PostgreSQL instance
2. Execute all 10 concurrency test scenarios (CT-01 through CT-10) with minimum iterations
3. Verify TypeScript compilation: 0 errors in API and Web
4. Verify Nest build: 0 issues
5. Verify full regression suite: 0 failures
6. Verify migration 0055 applies cleanly to existing database
7. Verify no architecture deviations from this lock document
8. Produce a verification report with PASS/FAIL per criterion
9. All concurrency tests use real PostgreSQL, separate connections, no mocks

---

## 26. Release Gate

P8 release closure requires:

- 16/16 acceptance criteria PASS
- 10/10 concurrency scenarios PASS (with minimum iterations)
- 0 P8 defects
- TypeScript: 0 errors
- Nest build: 0 issues
- Full regression: 0 failures
- Migration 0055: verified on existing database
- No architecture deviations
- Independent runtime verification report: PASS

---

## P8 BUSINESS RULES & ARCHITECTURE LOCK

**Status: LOCKED**

**Architecture: GO**

**Migration: 0055 REQUIRED**

**Next Gate: P8 IMPLEMENTATION**
