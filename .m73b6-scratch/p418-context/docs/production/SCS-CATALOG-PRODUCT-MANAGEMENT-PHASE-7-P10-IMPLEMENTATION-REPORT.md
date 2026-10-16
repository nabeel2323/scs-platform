# SCS Catalog Product Management — Phase 7 / P10: Merchant Import UX & XLSX Production Pipeline

## Implementation Report

| Field | Value |
|---|---|
| **Phase** | 7 (P10) |
| **Scope** | Merchant Import UX & XLSX Production Pipeline |
| **Verdict** | **P10 = IMPLEMENTATION COMPLETE** |
| **Date** | 2026-10-07 |
| **Architecture Lock** | SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-7-P10-BUSINESS-RULES-ARCHITECTURE-LOCK.md |

---

## 1. Executive Summary

P10 implements the merchant-facing XLSX import pipeline, enabling bulk product uploads via Excel files. The implementation adds server-side XLSX parsing, a preview/validation endpoint, error report downloads, and extends the web import wizard from 5 to 6 steps with full XLSX support. A new import history page provides visibility into past and active imports.

**Verdict: P10 = IMPLEMENTATION COMPLETE**

---

## 2. Scope Compliance

| Requirement | Status | Evidence |
|---|---|---|
| XLSX parser (merchant) | ✅ | `merchant-xlsx-parser.service.ts` (247 lines) |
| Shared validation service | ✅ | `import-validation.service.ts` (380 lines) |
| Preview endpoint | ✅ | `POST /imports/:id/preview` in `catalog.controller.ts` |
| Error report download | ✅ | `GET /imports/:id/errors` in `catalog.controller.ts` |
| Authorization hardening | ✅ | PermissionsGuard + assertStoreInOrg + assertStoreMember on all import endpoints |
| Web wizard (6 steps) | ✅ | `import/page.tsx` extended with Preview step |
| Import history page | ✅ | `merchant/imports/page.tsx` (262 lines) |
| Unit tests | ✅ | 30 tests in `p10-import-validation.spec.ts` |
| Security tests | ✅ | 18 tests in `p10-import-preview.postgres.spec.ts` |
| No migration 0056 | ✅ | Schema already sufficient (import_jobs has fileType, errorLog, stats, columnMapping, lockedAt) |
| No locked business rule changes | ✅ | All P9 rules preserved |
| No SSE infrastructure | ✅ | Polling at 2s/3s intervals only |
| No scope expansion | ✅ | Only P10 scope implemented |

---

## 3. Files Created

| File | Lines | Purpose |
|---|---|---|
| `apps/api/src/modules/catalog/merchant-xlsx-parser.service.ts` | 247 | Merchant XLSX parser with security limits |
| `apps/api/src/modules/catalog/import-validation.service.ts` | 380 | Read-only row validation service |
| `apps/web/src/app/merchant/imports/page.tsx` | 262 | Import history page |
| `apps/api/src/__tests__/unit/catalog/p10-import-validation.spec.ts` | 492 | 30 unit tests |
| `apps/api/src/__tests__/integration/p10-import-preview.postgres.spec.ts` | 165 | 18 security + integration tests |

---

## 4. Files Modified

| File | Changes |
|---|---|
| `apps/api/src/modules/catalog/catalog.module.ts` | Registered MerchantXlsxParserService + ImportValidationService |
| `apps/api/src/modules/catalog/catalog.service.ts` | Added constructor injection, `previewImportJob()`, `getErrorReport()`, `csvEscape()` |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Added preview + error report endpoints, authorization on list/get |
| `apps/web/src/app/merchant/import/page.tsx` | Extended to 6 steps, XLSX support, preview integration, error download |
| 19 test files | Added 2 mock params for CatalogService constructor (xlsxParser, importValidation) |

---

## 5. Backend Architecture (P10-A)

### 5.1 MerchantXlsxParserService
- **Location:** `apps/api/src/modules/catalog/merchant-xlsx-parser.service.ts`
- **Security limits:** 25MB file, 50K rows, 100 columns, 10K cell length, 1 worksheet
- **Rejections:** .xlsm (macros), empty files, malformed workbooks
- **Header normalization:** lowercase → trim → whitespace→underscore → strip non-alnum (except colon for `attr:<code>`)
- **Cell conversion:** formula cached result only (never evaluates), dates→ISO, rich text→concat, hyperlinks→display text
- **Output:** `MerchantParsedXlsx { headers, rawHeaders, rows, rowCount, fileType: 'XLSX' }`

### 5.2 ImportValidationService
- **Location:** `apps/api/src/modules/catalog/import-validation.service.ts`
- **Guarantee:** Entirely read-only — no INSERT, UPDATE, DELETE, FOR UPDATE, or write transactions
- **Pre-loads:** categories, brands, attribute definitions in parallel
- **Validates:** required fields (name, sku, priceMinor), price/MOQ/stock format, duplicate SKU, unit, category/brand references, typed attributes
- **Error model:** `ImportError { rowNumber, field, errorCode, severity, message, suggestedFix }`
- **Severity:** ERROR blocks processing, WARNING does not
- **Output:** `ValidationResult { totalRows, validRows, errorCount, warningCount, errors, sampleRows }`

### 5.3 Preview Endpoint
- **Route:** `POST /v1/imports/:id/preview`
- **Auth:** JWT → merchant:products:write → assertStoreInOrg → assertStoreMember
- **Lifecycle:** MAPPING/UPLOADED/READY → PREVIEWING → READY/FAILED
- **XLSX flow:** Read from S3 → parse → validate → store results
- **CSV flow:** Read staged rows from Redis → validate → store results
- **Caps:** 5000 stored errors, 500 in response

### 5.4 Error Report Endpoint
- **Route:** `GET /v1/imports/:id/errors`
- **Auth:** JWT → merchant:products:read → assertStoreInOrg → assertStoreMember
- **Output:** UTF-8 CSV with BOM, header: `row_number,field,error_code,severity,message,suggested_fix`
- **Source:** Combines preview errors (import_jobs.errorLog) + chunk errors (import_job_chunks.errorLog)
- **Cap:** 50,000 rows, sorted by rowNumber ASC, field ASC

### 5.5 Authorization Hardening
- `GET /stores/:storeId/imports`: Added PermissionsGuard + merchant:products:read + assertStoreInOrg + assertStoreMember
- `GET /imports/:id`: Added PermissionsGuard + merchant:products:read + resolve storeId from job + assertStoreInOrg + assertStoreMember

---

## 6. Frontend Architecture (P10-B)

### 6.1 Import Wizard (6 Steps)
1. **Upload File** — Accepts CSV + XLSX, client-side header detection for CSV
2. **Map Columns** — Dropdown mapping of TARGET_COLUMNS to detected/source headers
3. **Validation** — Quick pass/fail summary with error count
4. **Preview** (NEW) — Calls `POST /imports/:id/preview`, shows detailed error table, sample valid rows, detected headers
5. **Import Progress** — Polling at 2s, progress bar
6. **Review** — Stats (created/updated/skipped/errors), links to catalog

### 6.2 XLSX Flow Differences
- No client-side parsing (binary format)
- No client-side row staging (server reads from S3)
- Error report download available from Preview step
- Detected headers shown in Preview step

### 6.3 Import History Page
- **Route:** `/merchant/imports`
- **Features:** Lists all import jobs, status badges, row counts, timestamps, error report download for failed imports
- **Polling:** 3s interval when active jobs exist, auto-stops when all complete

---

## 7. Test Coverage (P10-C)

### 7.1 Unit Tests (30 tests)
| ID | Test | Status |
|---|---|---|
| A01 | XLSX parse happy path | ✅ |
| A02a-c | Security limits (empty, 25MB, 50K rows) | ✅ |
| A03a-c | File type rejection (.xlsm, non-xlsx, malformed) | ✅ |
| A04 | Header normalization | ✅ |
| A05a-d | Cell conversion (formula, date, rich text, row number) | ✅ |
| A06 | Duplicate header detection | ✅ |
| A07 | Skip empty rows | ✅ |
| A08 | ImportError structure | ✅ |
| A09 | Required field validation | ✅ |
| A10a-c | Price/MOQ/Stock format validation | ✅ |
| A11 | Duplicate SKU (WARNING) | ✅ |
| A12-A12b | Category/Brand reference check | ✅ |
| A13a-d | Typed attribute validation | ✅ |
| A15 | Sample rows collection (first 5) | ✅ |
| A16 | Error vs warning counting | ✅ |
| Full valid row | Zero errors | ✅ |

### 7.2 Security Tests (18 tests)
| ID | Test | Status |
|---|---|---|
| S01 | .xlsm rejection | ✅ |
| S02 | Empty file rejection | ✅ |
| S03 | File size limit | ✅ |
| S04 | Formula cached result (never evaluates) | ✅ |
| S05 | Read-only guarantee (no write methods) | ✅ |
| S06-S10 | Design guarantees (caps, auth, no FOR UPDATE) | ✅ |
| C01-C08 | Lifecycle state machine | ✅ |

---

## 8. Build Gates

| Gate | Result |
|---|---|
| API TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Web TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| Unit tests (P10) | ✅ 30/30 pass |
| Security tests (P10) | ✅ 18/18 pass |
| Existing tests (constructor fix) | ✅ All 19 files fixed |

---

## 9. Schema Sufficiency

No migration required. The existing `import_jobs` schema provides all needed columns:
- `file_type` varchar(10) default 'XLSX' — supports XLSX/CSV
- `status` varchar(16) — supports PREVIEWING/READY states
- `error_log` jsonb — stores preview errors
- `stats` jsonb — stores preview stats
- `column_mapping` jsonb — stores user mapping
- `locked_at` timestamp — supports optimistic locking

---

## 10. P8 Guarantees Preserved

| Guarantee | Status |
|---|---|
| 100 rows/chunk | ✅ Unchanged |
| Atomic claim | ✅ Unchanged |
| Sequential processing | ✅ Unchanged |
| Max 3 attempts | ✅ Unchanged |
| Resumability | ✅ Unchanged |
| Cancellation | ✅ Unchanged |
| Stale-lock recovery | ✅ Unchanged |

---

## 11. Security Guarantees

| Guarantee | Evidence |
|---|---|
| .xlsm rejected | Parser checks extension before parsing |
| Formulas never evaluated | `cellToString` reads `.result` only |
| External refs never resolved | No ExcelJS external ref API called |
| File size capped at 25MB | Checked before parsing |
| Row count capped at 50K | Checked during parsing |
| Cell length capped at 10K | Checked per cell |
| Column count capped at 100 | Excess silently ignored |
| Auth on all import endpoints | JWT + PermissionsGuard + assertStoreInOrg + assertStoreMember |
| Preview is read-only | No FOR UPDATE, no write transactions |
| Error report capped at 50K rows | Hardcoded in getErrorReport |

---

## 12. Lifecycle State Machine

```
UPLOADED → MAPPING → PREVIEWING → READY → PROCESSING → COMPLETED
                                   ↓           ↓
                                FAILED      FAILED
                                            CANCELLED
```

- **Previewable states:** MAPPING, READY, UPLOADED
- **Transition to PREVIEWING:** Optimistic UPDATE with WHERE status IN (...)
- **Transition to READY:** After successful validation
- **Transition to FAILED:** On parse error or zero valid rows

---

## 13. Error Model

```typescript
interface ImportError {
  rowNumber: number;      // 1-based row in file
  field: string;          // Logical field name (name, sku, priceMinor, attr:code)
  errorCode: string;      // MISSING_REQUIRED_FIELD, INVALID_PRICE_FORMAT, etc.
  severity: 'ERROR' | 'WARNING';  // ERROR blocks, WARNING does not
  message: string;        // Human-readable description
  suggestedFix: string | null;  // Actionable fix suggestion
}
```

**Error codes:** MISSING_REQUIRED_FIELD, INVALID_PRICE_FORMAT, INVALID_MOQ_FORMAT, INVALID_STOCK_FORMAT, UNKNOWN_ATTRIBUTE_CODE, INVALID_ATTRIBUTE_VALUE, DUPLICATE_SKU, REFERENCE_NOT_FOUND

---

## 14. API Endpoints Summary

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/imports/:id/preview` | merchant:products:write | Preview + validate import |
| GET | `/v1/imports/:id/errors` | merchant:products:read | Download error report CSV |
| GET | `/v1/stores/:storeId/imports` | merchant:products:read | List import jobs (auth hardened) |
| GET | `/v1/imports/:id` | merchant:products:read | Get import job (auth hardened) |

---

## 15. Web Routes

| Route | Component | Purpose |
|---|---|---|
| `/merchant/import` | ImportWizardPage | 6-step import wizard (CSV + XLSX) |
| `/merchant/imports` | ImportHistoryPage | Import job history + error downloads |

---

## 16. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| ExcelJS | ✅ Already installed | Reused from admin pipeline |
| @aws-sdk/client-s3 | ✅ Already installed | Used for XLSX storage reads |
| drizzle-orm | ✅ Already installed | Used for DB queries |

---

## 17. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Large XLSX files | Low | 25MB/50K row limits enforced |
| Macro injection | Low | .xlsm rejected before parsing |
| Formula injection | Low | Cached result only, never evaluated |
| Concurrent preview | Low | Optimistic status transition |
| Cross-org access | Low | assertStoreInOrg + assertStoreMember |

---

## 18. Known Limitations

1. XLSX column mapping requires manual entry (no client-side header detection for binary format)
2. Preview endpoint stores max 5000 errors; full report available via download
3. Import history page polls at 3s; no real-time push (no SSE infrastructure)

---

## 19. Regression Verification

- All 19 test files broken by CatalogService constructor change have been fixed
- API TypeScript: 0 errors
- Web TypeScript: 0 errors
- All P10 unit tests: 30/30 pass
- All P10 security tests: 18/18 pass

---

## 20. Checklist

- [x] P10-A1: Create merchant-xlsx-parser.service.ts
- [x] P10-A2: Extract validateImportRow() shared validation
- [x] P10-A3: Add preview endpoint + state transitions
- [x] P10-A4: Add error report download endpoint
- [x] P10-A5: Add authorization to list/get import endpoints
- [x] P10-B1: Update web import wizard (6 steps, XLSX support)
- [x] P10-B2: Create import history page /merchant/imports
- [x] P10-C1: Write unit tests (parser, validation, errors)
- [x] P10-C2: Write PG integration tests (preview, lifecycle, auth)
- [x] P10-C3: Write security + concurrency tests
- [x] P10-D: Build gates, regression, implementation report

---

## 21. Architectural Decisions

1. **Separate parser service** — Merchant parser is independent from admin Excel parser (different scope, no SHEET_ENTITY_MAP)
2. **Read-only validation** — Validation service never mutates catalog data; reference checks use plain SELECT
3. **Thenable mock pattern** — Unit tests use thenable objects to mock drizzle query chains that may or may not call `.where()`
4. **Polling over SSE** — No SSE infrastructure exists; polling at 2-3s intervals is sufficient
5. **CSV error report** — UTF-8 with BOM for Excel compatibility; deterministic sort by rowNumber, field

---

## 22. Verdict

**P10 = IMPLEMENTATION COMPLETE**

All requirements from the P10 Architecture Lock specification have been implemented and verified. The implementation preserves all P8/P9 guarantees, adds no new migrations, and passes all build gates.

---

## 23. Sign-Off

| Role | Name | Date |
|---|---|---|
| Implementation | SCS Agent | 2026-10-07 |
| Architecture Lock | SCS Agent | 2026-10-07 |
| Test Coverage | 48 tests (30 unit + 18 security) | 2026-10-07 |
| Build Gates | API TS: 0, Web TS: 0 | 2026-10-07 |
