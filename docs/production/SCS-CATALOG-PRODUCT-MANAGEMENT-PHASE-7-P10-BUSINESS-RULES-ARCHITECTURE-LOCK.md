# SCS Catalog Product Management — Phase 7 / P10 Business Rules & Architecture Lock

> **Status**: LOCKED / GO
> **Date**: 2026-10-07
> **Author**: Architecture Agent
> **Predecessor**: P9 = CLOSED / PASS
> **Audit**: SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-7-P10-NEXT-PHASE-ARCHITECTURE-AUDIT.md

---

## 1. Lock Status

```
P10 = LOCKED / GO
```

All business rules, API boundaries, preview semantics, authorization, concurrency, XLSX security limits, migration decision, acceptance criteria, and out-of-scope items are unambiguous and justified from repository evidence. No unresolved P0/P1/P2 architecture blockers remain.

---

## 2. P9 Baseline

```
NP-A01..NP-A15 = PASS
380/380 tests = PASS
API TypeScript = 0 errors
Web TypeScript = 0 errors
Nest build = PASS
Web build = PASS
P0 = 0
P1 = 0
P2 = 0
Architecture deviations = NONE
Latest migration = 0055
```

---

## 3. P10 Objective

**Merchant Import UX & XLSX Production Pipeline**

Merchants can upload XLSX files, preview validation results before committing, download structured error reports, track chunk-level import progress, and manage import history — all within the existing `import_jobs` infrastructure established by P8.

---

## 4. Business Problem

Repository evidence from `apps/web/src/app/merchant/import/page.tsx` L345-346:

```typescript
if (!file || !file.name.toLowerCase().endsWith('.csv')) {
  throw new Error('Only CSV files are supported in the pilot.');
}
```

1. Merchants cannot import XLSX files through the merchant portal despite `import_jobs.fileType` defaulting to `'XLSX'` (catalog.schema.ts L170).
2. CSV parsing is client-side only — no server-side validation preview before processing.
3. Error diagnosis is difficult: `errorLog` jsonb stores `{row, field, message}` tuples (catalog.service.ts L2729-2744) with no error codes, severity levels, or suggested fixes.
4. No downloadable error report — merchants must inspect chunk error logs via the API.
5. Import history page does not exist — `GET /stores/:storeId/imports` returns jobs but no dedicated UX.

---

## 5. Business Rules

### BR-01 — File Format Support

The system accepts `.csv` and `.xlsx` files for merchant import. Macro-enabled `.xlsm` files are rejected. File format is detected by extension + content validation, not trust of client-provided MIME type.

### BR-02 — Server-Side XLSX Parsing

XLSX files are parsed server-side using the existing `exceljs` dependency (already installed for the admin pipeline at `apps/api/src/modules/catalog-import/excel-parser.service.ts`). CSV files may continue to be parsed client-side for backward compatibility, but server-side CSV parsing is also accepted.

### BR-03 — Preview Before Processing

Every import undergoes server-side validation preview before processing. Preview is READ-ONLY — no catalog records are created, modified, or deleted.

### BR-04 — ERROR Blocks, WARNING Does Not

Validation results carry severity `ERROR` or `WARNING`. Processing is blocked if any `ERROR` exists. `WARNING` items are imported with a warning annotation but do not block processing.

### BR-05 — Final Validation at Process Time

Preview is informational. When the merchant confirms and processing begins, a final validation pass is performed immediately before catalog mutation. This prevents stale preview results from causing incorrect imports if catalog references changed between preview and process.

### BR-06 — Typed Attribute Convention

The canonical column convention for typed attributes is `attr:<attribute_code>`. This is already implemented in `importRow` (catalog.service.ts L2979) and must be preserved. JSONB attribute writes remain deprecated.

### BR-07 — Backward Compatibility

Existing CSV import flow (client-side parse → stage rows → process) continues to work unchanged. P10 adds XLSX support and preview; it does not remove CSV capability.

### BR-08 — P8 Guarantees Preserved

All P8 chunking guarantees are preserved: 100 rows/chunk, atomic claim mutex, sequential chunk processing, max 3 attempts per chunk, completed chunks never reprocessed, resumability, cooperative cancellation, stale-lock recovery, negative inventory protection.

---

## 6. Import Lifecycle

### State Machine

```
UPLOADED → MAPPING → PREVIEWING → READY → PROCESSING → COMPLETED
                ↓            ↓          ↓
             FAILED       FAILED     FAILED
                ↓            ↓          ↓
           CANCELLED   CANCELLED  CANCELLED
```

### State Definitions

| Status | varchar(16) fit | Meaning |
|--------|:---:|---------|
| UPLOADED | 8 ✓ | File metadata recorded, awaiting column mapping |
| MAPPING | 7 ✓ | Column mapping in progress (client-side) |
| PREVIEWING | 10 ✓ | Server-side parse + validation in progress |
| READY | 5 ✓ | Validation complete, awaiting merchant confirm + process |
| PROCESSING | 10 ✓ | Chunk-based import execution in progress |
| COMPLETED | 9 ✓ | All chunks processed successfully |
| FAILED | 6 ✓ | Validation or processing failed |
| CANCELLED | 9 ✓ | Merchant cancelled the import |

### Schema Compatibility

`import_jobs.status` is `varchar('status', { length: 16 })` (catalog.schema.ts L173). The longest new state `PREVIEWING` = 10 characters — fits within 16. **No migration required.**

### Transition Rules

- `UPLOADED → MAPPING`: Client begins column mapping
- `MAPPING → PREVIEWING`: Client requests preview (POST /imports/:id/preview)
- `PREVIEWING → READY`: Preview completes (validation results stored)
- `PREVIEWING → FAILED`: Preview encounters fatal parse error
- `READY → PROCESSING`: Client confirms + triggers processing (POST /imports/:id/process)
- `READY → CANCELLED`: Merchant cancels
- `PROCESSING → COMPLETED`: All chunks completed
- `PROCESSING → FAILED`: Unrecoverable chunk error
- `PROCESSING → CANCELLED`: Cooperative cancellation between chunks
- `FAILED → READY`: Retry resets failed chunks (POST /imports/:id/retry)

### P8 Compatibility

Existing transitions `UPLOADED → MAPPING → READY → PROCESSING` remain valid. The `PREVIEWING` state is optional in the sense that a CSV-only flow can skip directly from `MAPPING` to `READY` via `stageImportRows` (which already transitions to `READY` at L2461-2465).

---

## 7. Preview Semantics

### Preview Is READ-ONLY

Preview MUST NOT:
- Create products, variants, offers, or any catalog records
- Modify inventory, prices, or any persistent domain state
- Consume or create import_job_chunks
- Hold long-lived write locks
- Acquire the import job mutex (lockedAt)

Preview MAY:
- Parse the uploaded file (XLSX or CSV) server-side
- Resolve column mapping against the file headers
- Validate required fields (name, SKU, priceMinor, unit)
- Validate reference integrity (category, brand by name)
- Validate typed attribute columns (`attr:<code>`)
- Calculate row-level errors and warnings
- Generate preview statistics (total rows, valid rows, error count, warning count)
- Store preview results in `import_jobs.errorLog` and `import_jobs.stats`

### Preview Implementation

```
POST /imports/:id/preview
  ↓
Set status = PREVIEWING
  ↓
Retrieve file from storage (storageKey)
  ↓
Parse file (XLSX via ExcelJS / CSV via built-in parser)
  ↓
Apply column mapping from import_jobs.columnMapping
  ↓
Validate each row (reuse importRow validation logic, without DB writes)
  ↓
Store validation results in errorLog + stats
  ↓
Set status = READY (or FAILED if fatal parse error)
  ↓
Return preview summary
```

### Preview vs Processing Separation

The architecture prevents accidental persistence during preview by:
1. Preview uses a dedicated `previewImportRows()` method that explicitly does NOT call `importRow()` or any DB write method.
2. Preview validation extracts the validation checks from `importRow` into a shared `validateImportRow()` function that returns errors without executing mutations.
3. The `previewImportRows()` method never opens a write transaction.

---

## 8. Validation Model

### Validation Layers

1. **File-level**: File size, extension, format validity, empty file detection
2. **Structure-level**: Header row present, recognized columns, duplicate header detection
3. **Row-level**: Required fields, data type correctness, reference resolution, typed attribute validation

### Row Validation Rules

| Field | Rule | Severity |
|-------|------|----------|
| name | Required, non-empty | ERROR |
| sku | Required, non-empty | ERROR |
| priceMinor | Required, valid integer ≥ 0 | ERROR |
| unit | Required (defaults to PCS if missing) | WARNING |
| category | If provided, resolved by name (find-or-create at process time) | WARNING if not found |
| brand | If provided, resolved by name (find-or-create at process time) | WARNING if not found |
| barcode | If provided, non-empty string | WARNING if format unusual |
| attr:<code> | If provided, attribute must exist; value must match attribute type | ERROR |
| stock | If provided, valid integer ≥ 0 | WARNING |

### Validation Reuse

The existing `importRow` method (catalog.service.ts L2785-2970) contains inline validation that throws `ImportRowError`. P10 extracts these checks into a shared `validateImportRow()` function that:
- Returns an array of structured validation errors instead of throwing
- Does NOT perform any DB writes (no findOrCreateCategory, no findOrCreateBrand)
- Does NOT create products, variants, or offers
- Checks reference existence via read-only queries (SELECT without FOR UPDATE)

---

## 9. Error Model

### Structured Error Format

Each validation error conforms to:

```typescript
interface ImportError {
  rowNumber: number;       // 1-based row number in the source file
  field: string;           // Column name or attr:<code>
  errorCode: string;       // Stable machine-readable code (e.g. MISSING_REQUIRED_FIELD)
  severity: 'ERROR' | 'WARNING';
  message: string;         // Human-readable description
  suggestedFix: string | null;  // Actionable remediation guidance
}
```

### Error Codes

| Code | Meaning | Severity |
|------|---------|----------|
| MISSING_REQUIRED_FIELD | Required column is empty | ERROR |
| INVALID_PRICE_FORMAT | priceMinor is not a valid integer | ERROR |
| INVALID_MOQ_FORMAT | moq is not a valid positive integer | ERROR |
| INVALID_STOCK_FORMAT | stock is not a valid non-negative integer | WARNING |
| UNKNOWN_ATTRIBUTE_CODE | attr:<code> does not match any attribute_definition | ERROR |
| INVALID_ATTRIBUTE_VALUE | Typed attribute value fails type coercion | ERROR |
| DUPLICATE_SKU | Same SKU appears in multiple rows within the file | WARNING |
| EMPTY_ROW | Row is completely empty (skipped, not an error) | WARNING |
| FILE_TOO_LARGE | File exceeds maximum size limit | ERROR |
| UNSUPPORTED_FORMAT | File extension or content not recognized | ERROR |
| MALFORMED_FILE | File cannot be parsed (corrupt XLSX, etc.) | ERROR |
| REFERENCE_NOT_FOUND | Category/brand name not found in catalog | WARNING |

### Error Storage

Errors are stored in `import_jobs.errorLog` (jsonb) during preview and in `import_job_chunks.errorLog` (jsonb) during processing. The existing jsonb columns are sufficient — no schema change required. The error structure is enriched from `{row, field, message}` to the full `ImportError` format.

### Error Report Download

Error reports are generated as CSV with the following deterministic format:

```csv
row_number,field,error_code,severity,message,suggested_fix
3,name,MISSING_REQUIRED_FIELD,ERROR,Product name is required,Enter a product name in the name column
5,attr:color,UNKNOWN_ATTRIBUTE_CODE,ERROR,Attribute 'color' not found,Check attribute codes in the admin catalog settings
```

- UTF-8 encoding with BOM
- Stable column ordering (as above)
- Deterministic row ordering (by row_number ASC, then field ASC)
- No internal stack traces, secrets, or infrastructure details

---

## 10. XLSX Security

### Security Controls

Based on the existing admin `ExcelParserService` (excel-parser.service.ts) with merchant-specific additions:

1. **Authentication**: JWT required (existing `JwtAuthGuard`)
2. **Permission**: `merchant:products:write` (existing `RequirePermission`)
3. **Store scope**: `assertStoreInOrg` + `assertStoreMember` (existing)
4. **File size**: 25 MB maximum (reuse `MAX_FILE_SIZE` from excel-parser.service.ts L13)
5. **Extension validation**: Only `.xlsx` accepted; `.xlsm` rejected (macro security, L74-77)
6. **Content validation**: ExcelJS `workbook.xlsx.load()` validates OOXML structure
7. **No formula evaluation**: `cellToString()` extracts cached formula results, never evaluates (L222-228)
8. **No macro execution**: `.xlsm` extension rejected before parsing
9. **No external links**: ExcelJS does not resolve external references by default
10. **Row limit**: 50,000 rows per sheet (reuse `MAX_ROWS_PER_SHEET` L16)
11. **Cell length limit**: 10,000 characters per cell (reuse `MAX_CELL_LENGTH` L19)
12. **No path traversal**: File content is read from object storage by `storageKey`, never from user-supplied paths
13. **Decompression safety**: ExcelJS handles OOXML decompression internally with bounded memory

### Merchant vs Admin Parser

The admin `ExcelParserService` is designed for multi-sheet platform seed imports with fixed sheet names (`SHEET_ENTITY_MAP`). Merchant imports use a single flexible sheet with user-defined column mapping. Therefore:

- **Shared**: ExcelJS dependency, security constants (MAX_FILE_SIZE, MAX_ROWS_PER_SHEET, MAX_CELL_LENGTH), cell value conversion logic, malformed file handling
- **New**: Merchant-specific parser (`merchant-xlsx-parser.service.ts`) that reads a single worksheet, extracts headers for column mapping, and produces rows keyed by mapped column names
- **Not reused**: `SHEET_ENTITY_MAP`, multi-sheet entity routing, admin-specific header validation

---

## 11. File and Resource Limits

| Limit | Value | Justification |
|-------|-------|---------------|
| Maximum XLSX file size | 25 MB | Reuse admin parser limit (excel-parser.service.ts L13) |
| Maximum rows per file | 50,000 | Reuse admin parser limit (L16) |
| Maximum worksheets parsed | 1 (merchant) | Merchant import is single-sheet; extra sheets ignored |
| Maximum columns | 100 | Reasonable for product catalog + typed attributes |
| Maximum cell/string size | 10,000 chars | Reuse admin parser limit (L19) |
| Maximum preview rows displayed in UI | 100 | UI pagination; full validation processes all rows |
| Maximum preview errors returned | 5,000 | Prevent excessive memory/response size |
| Maximum error report rows | 50,000 | One error per row maximum |
| Maximum staged rows per request (CSV) | 500 | Existing limit (catalog.service.ts L2451) |
| Staged rows Redis TTL | 1 hour | Existing (catalog.service.ts L2458) |

---

## 12. Import/Preview Consistency

### Selected Architecture: Preview is Informational; Final Validation at Process Time

```
Preview validation (READ-ONLY)
      ↓
User reviews results, confirms
      ↓
Final validation (repeated immediately before processing)
      ↓
Processing (catalog mutation)
```

**Rationale**: Between preview and processing, catalog references may change (categories deleted, attributes modified, products created by Product Studio). Re-validating at process time ensures correctness.

**Implementation**: `processImportJob` already reads staged rows and calls `importRow` per row, which performs validation inline. P10 preserves this behavior — the final validation is inherent in `importRow`'s existing checks. If `importRow` throws, the error is captured in the chunk's `errorLog`.

---

## 13. Concurrency Rules

### P10-C01 — Concurrent Imports Same Store

Protected by existing DB-backed mutex: `processImportJob` claims with atomic `UPDATE ... WHERE status IN ('READY','FAILED') RETURNING id` (catalog.service.ts L2492-2494). Only one worker processes a given job at a time. Multiple jobs for the same store can exist but each is independently claimed.

### P10-C02 — Preview No Long-Lived Write Locks

Preview is entirely read-only. No `SELECT ... FOR UPDATE`, no write transactions. Preview cannot block other operations.

### P10-C03 — Preview Does Not Block Catalog Operations

Preview uses regular `SELECT` queries with no row-level locks. Concurrent Product Studio edits, search operations, and other imports proceed normally.

### P10-C04 — Processing Uses Existing Chunk Claim

Chunk processing uses the existing `UPDATE import_job_chunks SET status='PROCESSING' WHERE id=? AND status='PENDING'` atomic claim. No new locking mechanism introduced.

### P10-C05 — Two Workers Cannot Claim Same Chunk

Guaranteed by the atomic conditional UPDATE on `import_job_chunks.status`. The `WHERE status='PENDING'` clause ensures only one worker succeeds.

### P10-C06 — Retry Cannot Reprocess Completed Chunks

`retryFailedJob` (catalog.service.ts L3269) only resets chunks with `status='FAILED'` to `PENDING`. Completed chunks retain `status='COMPLETED'` and are skipped during re-processing.

### P10-C07 — Cancel Cannot Corrupt Chunks

Cancellation is cooperative: `cancelImport` sets `import_jobs.status='CANCELLED'`, and the processing loop checks `currentJob['status'] === 'CANCELLED'` between chunks (L2563-2564). The current chunk's transaction completes normally; subsequent chunks are skipped.

### P10-C08 — Import vs Product Studio Race

Both import and Product Studio use SKU-based find-or-create. If a Product Studio edit and import target the same SKU concurrently, the import's `importRow` uses `ON CONFLICT` upsert semantics (existing behavior). The last writer wins for product fields; variant combination_key uniqueness is enforced by DB constraint.

---

## 14. Authorization Rules

### Authorization Chain

```
JWT → PermissionsGuard → RequirePermission → assertStoreInOrg → assertStoreMember
```

### Endpoint Authorization Matrix

| Endpoint | Permission | Store Auth | Notes |
|----------|-----------|------------|-------|
| POST /stores/:storeId/imports | merchant:products:write | assertStoreInOrg + assertStoreMember | Existing |
| GET /stores/:storeId/imports | merchant:products:read | assertStoreInOrg + assertStoreMember | Existing (needs guard added) |
| GET /imports/:id | merchant:products:read | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| POST /imports/:id/preview | merchant:products:write | assertStoreInOrg + assertStoreMember (from job.storeId) | **NEW** |
| POST /imports/:id/rows | merchant:products:write | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| POST /imports/:id/process | merchant:products:write | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| POST /imports/:id/cancel | merchant:products:write | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| POST /imports/:id/retry | merchant:products:write | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| GET /imports/:id/chunks | merchant:products:read | assertStoreInOrg + assertStoreMember (from job.storeId) | Existing |
| GET /imports/:id/errors | merchant:products:read | assertStoreInOrg + assertStoreMember (from job.storeId) | **NEW** |

### IDOR Prevention

No import resource is accessible by ID alone. Every endpoint resolves `storeId` from the persisted `import_jobs` row and enforces `assertStoreInOrg` + `assertStoreMember` before returning data or performing mutations.

---

## 15. API Contract

### Existing Endpoints (Reused)

**POST /v1/stores/:storeId/imports** — Create import job
- Request: `{ fileName: string, fileType?: string, fileSize?: number, columnMapping?: Record<string, string> }`
- Response: ImportJob record
- Idempotency: Each call creates a new job (no dedup)

**GET /v1/stores/:storeId/imports** — List import jobs (history)
- Response: ImportJob[] ordered by createdAt DESC
- Authorization: Needs PermissionsGuard + merchant:products:read added (currently missing guard)

**GET /v1/imports/:id** — Get import job details
- Response: ImportJob record with status, progress, stats

**POST /v1/imports/:id/rows** — Stage parsed rows
- Request: `{ rows: Record<string, string>[], append?: boolean }`
- Response: `{ staged: number, batches: number }`

**POST /v1/imports/:id/process** — Begin chunk processing
- Response: ImportJob record (status transitions to PROCESSING)
- Idempotency: Atomic claim prevents double-processing

**POST /v1/imports/:id/cancel** — Cancel import
- Response: ImportJob record (status transitions to CANCELLED)
- Idempotency: Repeated cancel on CANCELLED job is safe (returns current state)

**POST /v1/imports/:id/retry** — Retry failed import
- Response: ImportJob record (status transitions to READY)
- Idempotency: Only operates on FAILED/CANCELLED jobs

**GET /v1/imports/:id/chunks** — Get chunk details
- Response: ImportJobChunk[] with per-chunk status, counts, errors

### New Endpoints

**POST /v1/imports/:id/preview** — Server-side preview & validation
- Authorization: JWT → merchant:products:write → assertStoreInOrg → assertStoreMember (from job.storeId)
- Request: `{}` (uses stored file at `storageKey` and stored `columnMapping`)
- Pre-condition: Job status must be `MAPPING` or `READY`
- Response:
  ```json
  {
    "totalRows": 1500,
    "validRows": 1450,
    "errorCount": 30,
    "warningCount": 20,
    "errors": [
      {
        "rowNumber": 5,
        "field": "name",
        "errorCode": "MISSING_REQUIRED_FIELD",
        "severity": "ERROR",
        "message": "Product name is required",
        "suggestedFix": "Enter a product name in the mapped name column"
      }
    ],
    "sampleRows": [ ... first 5 valid rows ... ],
    "columnMapping": { "name": "Product Name", "sku": "Item SKU", ... },
    "fileType": "XLSX",
    "detectedHeaders": ["Product Name", "Item SKU", "Price", "attr:color", ...]
  }
  ```
- Status codes: 200 (success), 404 (job not found), 409 (invalid status), 400 (fatal parse error)
- Side effects: Updates `import_jobs.status` to `PREVIEWING` then `READY`; stores validation results in `errorLog` and `stats`
- Idempotency: Repeated preview re-validates and overwrites previous results (safe)

**GET /v1/imports/:id/errors** — Download error report (CSV)
- Authorization: JWT → merchant:products:read → assertStoreInOrg → assertStoreMember (from job.storeId)
- Response: CSV file (Content-Type: text/csv, Content-Disposition: attachment)
- Format: UTF-8 with BOM, columns: row_number, field, error_code, severity, message, suggested_fix
- Ordering: row_number ASC, field ASC
- Status codes: 200 (success), 404 (job not found), 403 (not authorized)
- Combines errors from `import_jobs.errorLog` (preview errors) and all `import_job_chunks.errorLog` (processing errors)

---

## 16. Idempotency Rules

| Operation | Idempotency Behavior |
|-----------|---------------------|
| Upload (createImportJob) | Each call creates a new job. Repeated uploads create separate jobs. |
| Preview | Repeated preview re-validates and overwrites previous results. Safe to retry. |
| Stage rows (append=true) | Appends to Redis list. Duplicate batches create duplicate rows (client responsibility). |
| Stage rows (append=false) | Replaces Redis list. Idempotent. |
| Process | Atomic claim ensures only one worker processes. Repeated calls return current state. |
| Cancel | Idempotent. Cancelling an already-cancelled job returns current state. |
| Retry | Only operates on FAILED/CANCELLED jobs. Resets failed chunks. Idempotent. |
| Error report | Read-only. Deterministic output for the same error state. |

---

## 17. Web UX

### Extended Wizard Steps

```
Upload → Mapping → Preview & Validation → Confirmation → Processing → Result
```

### Step 1: Upload

- File selection (CSV or XLSX)
- Display file name, size, type
- File size validation (client-side: 25 MB max)
- Accept attribute: `.csv,.xlsx`
- Template download (CSV template with TARGET_COLUMNS headers)

### Step 2: Mapping

- Display detected headers from file
- Auto-map columns by name similarity (existing logic preserved)
- Manual override for each TARGET_COLUMN
- Support `attr:<code>` column detection for typed attributes
- For XLSX: server parses and returns headers (new: POST /imports/:id/preview with mapping-only mode)
- For CSV: client-side header detection preserved

### Step 3: Preview & Validation

- Triggered by "Preview" button → POST /imports/:id/preview
- Display:
  - Total rows detected
  - Valid rows count
  - Error count (with severity badge)
  - Warning count
  - Mapped columns summary
  - Error table: row number, field, error code, message, suggested fix
  - Sample of first 5 valid rows
- Pagination for errors (100 per page)
- "Download Error Report" button → GET /imports/:id/errors

### Step 4: Confirmation

- Display:
  - Rows that will be imported (validRows count)
  - Rows blocked by errors (errorCount)
  - Warnings that will be annotated
  - Estimated scope (new products vs updates based on SKU presence)
- "Confirm & Import" button → triggers stage rows + process
- "Back to Preview" button
- If errors exist: "Import" button disabled with message "Fix errors before importing"

### Step 5: Processing

- Progress bar (percentage from processedRows / totalRows)
- Chunk-level progress (processed/total chunks)
- Current status badge
- Row counts: processed, created, updated, skipped, errors
- "Cancel" button → POST /imports/:id/cancel
- Polling interval: 2 seconds (existing pattern from page.tsx L313-341)

### Step 6: Result

- Final status: COMPLETED / FAILED / CANCELLED
- Imported count (created + updated)
- Skipped count
- Error count
- "Download Error Report" button (if errors exist)
- "Retry" button (if FAILED) → POST /imports/:id/retry
- "Back to Imports" navigation

---

## 18. Import History

### History Page

A new page at `/merchant/imports` (or section within the import wizard) showing previous imports.

### Table Columns

| Column | Source |
|--------|--------|
| Import ID | import_jobs.id (truncated) |
| Filename | import_jobs.file_name |
| Type | import_jobs.file_type (CSV/XLSX badge) |
| Created | import_jobs.created_at |
| Status | import_jobs.status (color-coded badge) |
| Total Rows | import_jobs.total_rows |
| Processed | import_jobs.processed_rows |
| Successful | import_jobs.stats->created + stats->updated |
| Failed | import_jobs.error_rows |
| Completed | import_jobs.completed_at |

### Filters

- Status filter (ALL, COMPLETED, FAILED, PROCESSING, CANCELLED)
- Date range filter

### Actions Per Row

- View details (expand drawer or navigate to detail page)
- Download error report (GET /imports/:id/errors)
- Retry (if FAILED/CANCELLED) → POST /imports/:id/retry
- Cancel (if PROCESSING/READY) → POST /imports/:id/cancel

### Pagination

- 20 imports per page
- Ordered by created_at DESC

---

## 19. Progress Mechanism

### Selected: Polling

**Rationale**: Repository inspection found no SSE infrastructure (`grep` for SSE, EventSource, text/event-stream returned 0 relevant matches). The existing web import page already uses polling at 2-second intervals (page.tsx L313-341). Introducing SSE solely for P10 would add infrastructure complexity without proportional benefit.

### Polling Contract

- Endpoint: `GET /v1/imports/:id` (existing)
- Interval: 2 seconds
- Response includes: status, processedRows, totalRows, errorRows, stats (jsonb with created/updated/skipped/errors)
- Client stops polling when status reaches terminal state (COMPLETED, FAILED, CANCELLED)

### Chunk-Level Progress

- Endpoint: `GET /v1/imports/:id/chunks` (existing)
- Returns per-chunk status, processedRows, createdCount, updatedCount, skippedCount, errorCount
- UI can display chunk progress bar alongside overall progress

---

## 20. Database/Migration Decision

```
Migration 0056 = NOT REQUIRED
```

### Verification

| Requirement | Existing Schema | Fits? |
|-------------|----------------|:-----:|
| XLSX file type | `fileType varchar(10) DEFAULT 'XLSX'` (L170) | ✓ |
| PREVIEWING status | `status varchar(16)` — "PREVIEWING" = 10 chars | ✓ |
| Structured error storage | `errorLog jsonb DEFAULT []` (L178) | ✓ |
| Preview statistics | `stats jsonb DEFAULT {}` (L179) | ✓ |
| Column mapping | `columnMapping jsonb DEFAULT {}` (L177) | ✓ |
| Chunk-level errors | `import_job_chunks.errorLog jsonb DEFAULT []` (L210) | ✓ |
| Progress tracking | totalRows, processedRows, errorRows (L174-176) | ✓ |
| Job mutex | lockedAt (L185) | ✓ |

No new tables, columns, indexes, or constraints are required. The existing `import_jobs` and `import_job_chunks` tables (migration 0055) are sufficient.

---

## 21. Performance Targets

| ID | Target | Threshold | Justification |
|----|--------|-----------|---------------|
| P10-P01 | XLSX parsing (1,000 rows) | < 5 seconds | ExcelJS load + sheet extraction on Node 22 |
| P10-P02 | Import preview validation (1,000 rows) | < 3 seconds | Read-only queries, no catalog mutation |
| P10-P03 | Error report generation (10,000 errors) | < 2 seconds | CSV serialization from jsonb, no computation |

### Memory Safety

- XLSX parsing: ExcelJS loads entire workbook into memory. 25 MB file limit ensures bounded memory.
- Preview validation: Processes rows sequentially, not all at once. Error array capped at 5,000 entries.
- Error report: Stream CSV generation for large error sets; do not build entire CSV in memory.
- Staged rows: Redis-backed with 1-hour TTL (existing).

---

## 22. Testing Strategy

### Unit Tests

| Area | Coverage |
|------|----------|
| Merchant XLSX parser | File validation, header extraction, row extraction, cell type handling, formula rejection, macro rejection, size limits |
| Column mapping | Auto-mapping logic, attr:<code> detection, duplicate handling |
| Validation | Required fields, type checking, reference resolution, typed attribute coercion, error code assignment |
| Error normalization | Structured error format, severity assignment, suggested fix generation |
| XLSX security | Oversized file rejection, malformed XLSX handling, .xlsm rejection, empty file |

### PostgreSQL Integration Tests

| Area | Coverage |
|------|----------|
| Import authorization | Store membership, org membership, IDOR prevention |
| Preview isolation | Verify no catalog records created during preview |
| Import state transitions | Full lifecycle: UPLOADED → PREVIEWING → READY → PROCESSING → COMPLETED |
| Concurrent imports | Same-store serialization, atomic claim |
| Chunk locking | Two workers cannot claim same chunk |
| Retry | Failed chunk reprocessing, completed chunk preservation |
| Cancellation | Cooperative cancel between chunks |
| Error persistence | Preview errors + processing errors stored correctly |
| Tenant isolation | Cross-store import access denied |

### E2E Tests

Upload XLSX → mapping → preview → validation → confirmation → processing → completion → error download → retry

### Regression

Preserve all existing test suites:
- P8 import tests (p8-import-hardening.postgres.spec.ts)
- P9 catalog/search/export tests
- catalog/inventory/pricing regression (284 tests)

### Security Tests

- Cross-store import access denied
- Cross-org import access denied
- Import IDOR (access by ID without store membership)
- Malicious XLSX (corrupt file, formula injection, external reference)
- Oversized XLSX (> 25 MB)
- Macro/external-reference rejection
- Error report IDOR (download another store's errors)

### Concurrency Tests

| Scenario | Iterations |
|----------|-----------|
| 2 concurrent previews | 50 |
| 2 concurrent processing attempts | 50 |
| 50 concurrent processing attempts | 10 |
| 2 concurrent retries | 50 |
| Cancel vs process | 50 |
| Retry vs process | 50 |
| Preview vs process | 50 |
| Import vs Product Studio edit | 50 |

---

## 23. Acceptance Criteria

| ID | Criterion | Test |
|----|-----------|------|
| P10-A01 | Merchant can upload XLSX | E2E: upload .xlsx, job created with fileType=XLSX |
| P10-A02 | XLSX parsing extracts supported catalog data | Unit: parse 1000-row XLSX, verify row count and headers |
| P10-A03 | Preview validates without catalog mutation | PG integration: preview then SELECT COUNT(*) from products = unchanged |
| P10-A04 | Preview provides row-level validation | PG integration: preview returns errors with rowNumber, field, errorCode |
| P10-A05 | Preview distinguishes ERROR vs WARNING | Unit: missing name → ERROR, missing category → WARNING |
| P10-A06 | Processing blocked by ERRORs | PG integration: preview with errors, process returns 409 |
| P10-A07 | Merchant can download error report | E2E: GET /imports/:id/errors returns CSV |
| P10-A08 | Error report contains row, field, code, severity, message, suggested fix | Unit: CSV has all 6 columns populated |
| P10-A09 | Import progress visible | E2E: polling shows processedRows increasing |
| P10-A10 | Import history available | E2E: GET /stores/:storeId/imports returns job list |
| P10-A11 | CSV backward compatible | Regression: existing CSV import tests pass unchanged |
| P10-A12 | Typed attr:<code> imports supported | PG integration: XLSX with attr:color column validates and imports |
| P10-A13 | Store authorization enforced | Security: cross-store/cross-org access returns 403 |
| P10-A14 | P8 guarantees intact | Regression: p8-import-hardening tests pass |
| P10-A15 | No catalog mutation during preview | PG integration: product/variant/offer counts unchanged after preview |
| P10-A16 | Final validation before processing | PG integration: preview → catalog change → process detects new error |
| P10-A17 | Concurrent processing cannot double-apply chunk | Concurrency: 50 iterations, exactly one worker succeeds |
| P10-A18 | Completed chunk never reprocessed | Concurrency: retry after partial completion preserves completed chunks |
| P10-A19 | XLSX security controls enforced | Security: .xlsm rejected, >25MB rejected, corrupt file handled |
| P10-A20 | Performance targets pass | Performance: P10-P01/P02/P03 within thresholds |

---

## 24. Security Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P10-S01 | Store membership required | All import endpoints call assertStoreMember |
| P10-S02 | Cross-store import access denied | Security test: user in store A cannot access store B import |
| P10-S03 | Cross-org import access denied | Security test: user in org A cannot access store in org B |
| P10-S04 | Preview is non-mutating | PG test: catalog tables unchanged after preview |
| P10-S05 | Error reports cannot leak another store's data | Error report endpoint enforces store membership |
| P10-S06 | XLSX macros not executed | .xlsm rejected; formula cells return cached result only |
| P10-S07 | External references not executed | ExcelJS does not resolve external links by default |
| P10-S08 | File/resource limits enforced | 25 MB, 50K rows, 10K cell length enforced |
| P10-S09 | Malformed XLSX cannot crash worker | Try/catch around ExcelJS load; BadRequestException on failure |
| P10-S10 | Import IDs cannot be used for IDOR | All endpoints resolve storeId from job, enforce membership |

---

## 25. Concurrency Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| P10-C01 | Concurrent imports same store serialized | Atomic claim on import_jobs.status |
| P10-C02 | Two workers cannot claim same chunk | Atomic UPDATE on import_job_chunks.status |
| P10-C03 | Retry cannot duplicate completed chunks | retryFailedJob only resets FAILED chunks |
| P10-C04 | Cancel vs process: one authoritative outcome | Cooperative cancel between chunks; current chunk completes |
| P10-C05 | Preview does not create catalog records | Read-only queries, no INSERT/UPDATE/DELETE |
| P10-C06 | Preview does not hold write locks | No SELECT FOR UPDATE, no write transactions |
| P10-C07 | Final validation + processing preserve P8 integrity | importRow validation + chunk transaction boundary |
| P10-C08 | Import vs Product Studio race defined | SKU find-or-create with ON CONFLICT; last writer wins for product fields |

---

## 26. Implementation Phases

### P10-A — XLSX Foundation (Backend)

1. Create `merchant-xlsx-parser.service.ts` — merchant-specific XLSX parser
2. Extract shared validation from `importRow` into `validateImportRow()`
3. Add `POST /imports/:id/preview` endpoint
4. Add preview state transitions (MAPPING → PREVIEWING → READY)
5. XLSX file upload handling (storage, retrieval)
6. Unit tests: parser, validation, security limits
7. PG integration tests: preview isolation, state transitions

### P10-B — Preview & Validation (Backend + Web)

1. Web: Preview step in wizard (validation summary, error table)
2. Web: Confirmation step (import scope, error blocks)
3. Web: XLSX file support in upload step
4. Backend: Enhanced error format (errorCode, severity, suggestedFix)
5. PG integration tests: authorization, tenant isolation

### P10-C — Error Reporting & Progress (Backend + Web)

1. Backend: `GET /imports/:id/errors` — CSV error report download
2. Web: Processing step with chunk-level progress
3. Web: Result step with error download, retry
4. Web: Import history page (/merchant/imports)
5. Security tests: IDOR, cross-store, cross-org
6. Concurrency tests: all 8 scenarios

### P10-D — Independent Runtime Verification

No feature development. Only:
- Full test suite execution
- PostgreSQL concurrency tests
- Security penetration tests
- XLSX E2E tests
- Regression suite
- Performance benchmarks
- Build verification (tsc, nest build, next build)

---

## 27. Out of Scope

The following are explicitly excluded from P10:

1. Admin XLSX pipeline redesign
2. XLSX export
3. Mobile XLSX import
4. Mobile search filters
5. Product submission workflow
6. SUBMITTED/PENDING_REVIEW lifecycle
7. Bulk moderation
8. Product merge/dedup UI
9. Inventory receiving
10. Cycle counting
11. Inventory valuation
12. Price validity periods
13. Price history
14. Promotions/cart integration
15. Product Studio autosave
16. Variant media UI
17. Orphan S3 cleanup
18. Search relevance tuning
19. Full-text search optimization
20. New catalog schema redesign

These belong to separate future milestones as identified by the P10 architecture audit.

---

## 28. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ExcelJS memory consumption on large files | API worker OOM | 25 MB file limit + 50K row limit enforced before parsing |
| Preview results stale at process time | Incorrect imports | Final validation at process time (BR-05) |
| XLSX formula injection | Data integrity | Never evaluate formulas; extract cached result only |
| Client-side XLSX parsing complexity | Browser compatibility | Server-side parsing for XLSX; client only sends file |
| Error report size for large imports | Response timeout | Stream CSV generation; cap at 50K error rows |
| Backward compatibility break | Existing CSV imports fail | CSV flow unchanged; XLSX is additive |
| Concurrent preview + process | Inconsistent state | Preview requires MAPPING/READY; process requires READY; transitions are exclusive |

---

## 29. Dependencies

| Dependency | Source | Status |
|------------|--------|--------|
| `exceljs` npm package | Already installed for admin pipeline | Available |
| `import_jobs` table | Migration 0032 + 0055 | Exists |
| `import_job_chunks` table | Migration 0055 | Exists |
| Object storage (S3/B2) | Existing media storage | Available |
| Redis (staged rows) | Existing infrastructure | Available |
| `assertStoreInOrg` / `assertStoreMember` | Existing auth helpers | Available |
| `PermissionsGuard` / `RequirePermission` | Existing auth infrastructure | Available |
| P8 chunked processing | catalog.service.ts | Exists, preserved |
| P9 typed attribute import | catalog.service.ts importRow | Exists, preserved |
| Admin ExcelParserService (reference) | catalog-import module | Exists, partially reused |

---

## 30. Release Gate

P10 cannot be released until:

```
P10-A01..P10-A20 = PASS
P10-S01..P10-S10 = PASS
P10-C01..P10-C08 = PASS

XLSX tests = PASS
PostgreSQL tests = PASS
Security tests = PASS
Concurrency tests = PASS
E2E = PASS
Regression = PASS

API TypeScript = 0 errors
Web TypeScript = 0 errors
Nest build = PASS
Web build = PASS

P0 = 0
P1 = 0
P2 = 0

Architecture deviations = NONE
```

---

## 31. Architecture Deviations

```
NONE
```

P10 extends the existing merchant import infrastructure without deviating from established patterns:
- Same authorization chain (JWT → Permission → assertStoreInOrg → assertStoreMember)
- Same chunked processing (P8)
- Same state machine pattern (varchar status with atomic transitions)
- Same error storage (jsonb errorLog)
- Same polling mechanism (existing pattern)
- No new tables, no new infrastructure, no new patterns

---

## 32. Final Decision

```
P10 = LOCKED / GO
```

All conditions met:
- Business rules are unambiguous
- API boundaries are defined (2 new endpoints, 8 existing reused)
- Preview semantics are defined (READ-ONLY, informational, final validation at process time)
- Authorization is defined (full endpoint matrix)
- Concurrency behavior is defined (8 conditions, all preserve P8 guarantees)
- XLSX security limits are defined (25 MB, 50K rows, 10K cell, no macros, no formula eval)
- Migration decision is justified (NOT REQUIRED — all schema fits existing columns)
- Acceptance criteria are testable (20 functional + 10 security + 8 concurrency)
- Out-of-scope is explicit (20 items deferred)
- No unresolved P0/P1/P2 architecture blocker remains

---

## 33. Next Gate

```
P10 IMPLEMENTATION
```
