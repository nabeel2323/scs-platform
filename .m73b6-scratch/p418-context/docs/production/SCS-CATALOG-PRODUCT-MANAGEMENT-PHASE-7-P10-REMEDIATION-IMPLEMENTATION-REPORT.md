# SCS Catalog Product Management — Phase 7 P10 Remediation Implementation Report

**Turn type:** IMPLEMENTATION (R1–R6 remediation of defects exposed by the P10 Verification-Conditions-Closure browser E2E).
**Gate entering this turn:** `P10 = BLOCKED`.
**Source of truth:** P10 Business Rules & Architecture Lock · P10 Implementation Report · P10 Independent Runtime Verification · P10 Verification Conditions Closure.
**Status legend used throughout:** `IMPLEMENTED` · `VERIFIED` · `NOT VERIFIED` · `BLOCKED` · `PRE-EXISTING`.

---

## 1. Executive summary

The merchant import web ↔ backend integration defects (R1–R5) that produced the `P10 = BLOCKED` verdict have been **remediated**, and the remediation was validated through automated tests, a green production build, live PostgreSQL integration, real browser E2E, and direct database inspection.

- **R1 (P1)** XLSX bytes are now actually uploaded to the server-derived `storageKey` through the existing storage abstraction; a missing object returns a structured `FILE_NOT_UPLOADED`, never an opaque HTTP 500. — `IMPLEMENTED` + `VERIFIED`.
- **R2 (P1)** Header detection + suggested mapping (incl. `attr:<code>` passthrough) are exposed to the UI, persisted, and passed into validation/processing. — `IMPLEMENTED` + `VERIFIED`.
- **R3 (P1)** Preview ordering corrected (stage/source rows before preview), preview kept strictly read-only, real counts and the 6-column validation table surfaced. — `IMPLEMENTED` + `VERIFIED`.
- **R3b** `errorCount > 0` disables the client confirm/process action while warnings do not; the backend retains final processing-time validation. — `IMPLEMENTED` + `VERIFIED`.
- **R4 (P2)** Error-report download now preserves the UTF-8 BOM and all six columns; download is exposed whenever `errorCount > 0`. — `IMPLEMENTED` + `VERIFIED-IN-BROWSER`.
- **R5 (P3)** Client now recognizes the authoritative backend `PROCESSING` lifecycle (both `PROCESSING` and `IMPORTING` keyed), polling retained (no SSE), multi-chunk progress/cancel/retry/terminal confirmed. — `IMPLEMENTED` + `VERIFIED`.
- **R6** Windows pnpm virtual-store instability documented as a repeatable, repo-compatible recovery (no version/lockfile change). — `DOCUMENTED` + `VERIFIED` in this environment.

No new catalog features, no SSE, no migration `0056`, no backend state renames. All P8/P9 guarantees are preserved.

**This turn does NOT mark P10 passed, closed, or release-ready.** It prepares the P10 Verification-Conditions Re-Closure gate.

## 2. Baseline

Prior `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-7-P10-VERIFICATION-CONDITIONS-CLOSURE.md` ran genuine browser E2E against the real production web build and recorded `P10 = BLOCKED`, exposing that:
- selecting an XLSX created a job but never carried the file bytes to storage (preview read a missing object → HTTP 500);
- `detectedHeaders`/`columnMapping` reached the UI empty ("Not mapped");
- preview ran before rows were staged;
- an invalid import still enabled **Start Import**;
- the downloaded error report lost its BOM;
- the client polled `IMPORTING` while the backend used `PROCESSING`.

The R1–R5 code changes were authored in prior turns; this turn completed validation and the one genuine client defect found only under real browser testing (R4 BOM), then documented R6.

## 3. R1 implementation — XLSX upload wiring (P1) — `IMPLEMENTED` + `VERIFIED`

- Endpoint `POST /v1/imports/:id/upload` (`catalog.controller.ts`) reads the request as a **raw `application/octet-stream` body** via `readRawBody(req: any, 25 * 1024 * 1024)` — no `multer`, no client-supplied storage key, and `@Req() req: any` (no value-import of `express`, which would risk an SWC boot crash).
- `CatalogService.uploadImportFile()` persists bytes with `storage.putObject({ bucket: importBucket(), key: job.storageKey, ... })` — the **server-derived** key from the stored job, using the existing storage abstraction.
- Guards return structured `BadRequestException` strings, never 500: `EMPTY_FILE`, `FILE_TOO_LARGE` (> 25 MB), `UNSUPPORTED_FILE_TYPE` (only `.csv`/`.xlsx`).
- `previewImportJob` on a missing object throws `FILE_NOT_UPLOADED` (retryable precondition; does not mark the job `FAILED`); a genuinely broken workbook is recorded as `MALFORMED_FILE` with a `suggestedFix`.
- **Evidence:** live backend sanity — created job `3710fa2c`, uploaded `valid.xlsx` as octet-stream, upload returned `detectedHeaders` = `name,sku,priceminor,unit,category,brand,moq`; browser XLSX-VALID scenario passed. Unit tests `p10-remediation.spec.ts` cover persist-to-server-key, empty/large/unsupported rejection, CSV-no-detection, and `FILE_NOT_UPLOADED`.

## 4. R2 implementation — header detection + mapping (P1) — `IMPLEMENTED` + `VERIFIED`

- XLSX upload parses the workbook (`MerchantXlsxParserService`) and returns `detectedHeaders`.
- `buildSuggestedMapping(headers)` maps standard targets by normalized equality then containment, and passes `attr:<code>` headers through unchanged (`mapping[h] = h`), so typed attributes stay in the single `attr:<code>` representation (no second form introduced).
- Header normalization (`normalizeHeader`): lowercase → trim → whitespace to `_` → strip `[^a-z0-9_:]`. Underscore and colon are preserved, so `attr:ram_gb` survives to code `ram_gb`.
- Auto-mapping only fills an **empty** mapping, so re-upload is non-destructive. The mapping is persisted to `import_jobs.column_mapping` (upload response and/or `POST /imports/:id/mapping`) and passed to preview/validation and processing.
- **Evidence:** upload response showed mapping `{name,sku,unit,priceMinor,attr:ram_gb,attr:color}`; browser Map-Columns step showed detected headers and mapped fields. Unit tests cover normalized/case-spacing matching and `attr:` passthrough; `updateImportMapping` rejects a mapping missing required targets and advances `UPLOADED → MAPPING`.

## 5. R3 implementation — preview ordering + read-only preview (P1) — `IMPLEMENTED` + `VERIFIED`

- Wizard order corrected to: Upload → Map Columns → Stage/source rows → Preview + Validate → Display → Confirm → Process → Progress → Review (`merchant/import/page.tsx`).
- For CSV, rows are staged (`POST /imports/:id/rows`, batch 200) **before** preview; for XLSX the stored workbook is the source. Both preview and process read the **same** `resolveJobRows(job)` path, so preview cannot drift from what will be imported.
- Preview is strictly read-only: it never opens a write transaction, never uses `SELECT ... FOR UPDATE`, and creates no product/variant rows.
- Browser receives real `totalRows`, `validRows`, `errorCount`, `warningCount`, `errors`, `sampleRows`; UI shows the summary plus the validation table columns **Row / Field / Error Code / Severity / Message / Suggested Fix**, and representative sample rows.
- **Evidence:** backend preview of `valid.xlsx` returned `total=3, valid=3, errorCount=0, warningCount=1, sampleRows=3`; browser XLSX-ERROR showed `errorCount=3`/`warningCount=1` with severities distinguished and produced **zero** catalog rows (see §11/§12).

## 6. R4 implementation — error report download (P2) — `IMPLEMENTED` + `VERIFIED-IN-BROWSER`

- Backend contract preserved (`getErrorReport`): UTF-8 BOM + columns `row_number,field,error_code,severity,message,suggested_fix`; deterministic sort (row ASC, field ASC); caps 50k rows; only sanitized messages (no stacks, DB errors, secrets, filesystem paths, or infra internals).
- **Genuine defect found only under real browser testing:** the client downloaded via `res.text()` then re-blobbed, which **strips the leading BOM** — the downloaded file had `UTF8_BOM=False` even though the backend `/errors` bytes began `EF BB BF`.
- **Fix (this turn):** both download handlers (`merchant/import/page.tsx` wizard and `merchant/imports/page.tsx` history) now use `const blob = await res.blob();` so the backend's exact bytes (BOM included) are preserved.
- Download is now exposed whenever `errorCount > 0` (the `> 50` / `> 500` requirements were removed).
- **Evidence:** after rebuild, browser download produced `BOM=True`; 10k-row report measured `bom=true` at the byte level with the 6-column header intact.

## 7. R5 implementation — progress / cancellation / retry (P3) — `IMPLEMENTED` + `VERIFIED`

- Client keys the authoritative backend state: `STATUS_STYLES` includes both `PROCESSING` and `IMPORTING`; progress polling checks `job.status === 'PROCESSING'` and stops at terminal `COMPLETED`/`FAILED`/`CANCELLED`. No backend states were renamed.
- Polling retained (no SSE), consistent with the locked P10 design.
- Multi-chunk (> 100 rows) exercised a 150-row fixture: chunks created/processed, progress advanced, terminal state shown, polling stopped. Cancel/retry reachable via `POST /imports/:id/cancel` and `/retry`.
- **Evidence:** browser XLSX-MULTI 150 rows completed (Created/Updated 150); live history showed correct status/rows/errors/created/actions.

## 8. R6 infrastructure work — `DOCUMENTED` + `VERIFIED`

- Windows pnpm virtual-store corruption (`next/dist/compiled/jest-worker/processChild.js` missing; `bcrypt` `EPERM`) recurred during this turn's web rebuilds (twice).
- Recovery used and verified: stop all `node` → `pnpm install --offline --force` → confirm `processChild.js` restored → rebuild green. The `cpu-features` native-build error is an optional transitive and harmless.
- **No changes** to dependency versions, `package.json`, or `pnpm-lock.yaml`.
- Documented as a repo-compatible runbook: [SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md](file:///c:/TAIF/scs-platform/docs/production/SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md). Honestly recorded as **host/environment-specific** — it cannot be permanently eliminated by a repository change.

## 9. Security verification (P10 §11) — `IMPLEMENTED` + `VERIFIED`

Every import endpoint enforces the chain `JWT → Permission → assertStoreInOrg → assertStoreMember → import-job store ownership`. `storeId` is resolved from the **persisted job**, never trusted from the client, for `/upload`, `/mapping`, `/preview`, `/process`, `/cancel`, `/retry`, `/errors`, and `/chunks`.

Covered by `p10-import-preview.postgres.spec.ts` (S-series) and `p10-remediation.spec.ts`:
- merchant A cannot access/upload/preview/process/download for merchant B's job (`S08`, `C04`, `C05`);
- storage key is server-derived (no client-supplied key, no cross-store write, no path traversal);
- malformed/missing files do not leak internals (structured codes only);
- read-only validation service exposes no write methods (`S05`); parser rejects macros/non-xlsx/oversize (`S01`–`S04`, `S07`).

**Note (honesty):** tenant-isolation guarantees are exercised by unit/design-guarantee assertions and code inspection of the guards, not by a two-tenant live HTTP E2E in this environment. A dedicated two-merchant live isolation run is a recommended item for the re-closure gate.

## 10. Automated tests (P10 §13) — `VERIFIED`

Unit suite (`pnpm --filter @scs/api exec vitest run src/__tests__/unit/catalog`): **400 passed / 26 files**, including the 12 new `p10-remediation` tests and full P8/P10 regression. New/updated specs:
- `p10-remediation.spec.ts` — R1 upload guards + server-key persist + re-upload non-clobber, R2 mapping build/persist, R3 `FILE_NOT_UPLOADED` + CSV-stage-before-preview.
- `p10-import-validation.spec.ts` — parser (A01–A07: valid, empty, >25MB, >50k rows, `.xlsm`, malformed, formula-cache-only, duplicate headers, row-number, README-sheet skip) and validation (A08–A16: required fields, price/moq/stock, `DUPLICATE_SKU` = WARNING, `REFERENCE_NOT_FOUND` warnings, unknown-attr + INTEGER/BOOLEAN coercion, sample rows, error/warning counting).
- `p10-import-preview.postgres.spec.ts` — S01–S10 security/read-only guarantees + C01–C08 lifecycle design guarantees.

## 11. PostgreSQL integration verification (P10 §15) — `VERIFIED`

- **Integration suites** (`p8-import-hardening` 23 + `p10-import-preview` 18 = **41 passed**) via testcontainers PostgreSQL confirm chunking, concurrency mutex, atomic transitions, and lifecycle guarantees hold against a real database.
- **Live DB inspection** after browser/API imports (`docker exec scs-postgres psql`):
  - 150 multi-chunk variants → `DRAFT`; 150 products → `DRAFT`; 150 SKUs = 150 distinct (**no duplicates**).
  - `err.xlsx` job → **0** catalog rows despite `errorCount=3` (**preview read-only** + gate blocked process).
  - **Typed attributes (PRE-EXISTING P8 path, now exercised through the P10 chain):** seeded `ram_gb` (INTEGER/PRODUCT) + `color` (TEXT/VARIANT); imported `typed.xlsx` (COMPLETED, created=2). Verified in authoritative typed columns, **not JSONB**:
    - `product_attribute_values.value_number` = 16 / 8 (`value_text`/`value_json` NULL);
    - `variant_attribute_values.value_text` = Silver / Blue (`value_json` NULL);
    - products created as `DRAFT`.

## 12. Browser E2E results (P10 §14) — `VERIFIED`

Genuine Chromium/Playwright runs against the real production web build (`merchant/import`) + live API, executed twice with `EXIT=0` (once before and once after the R4 BOM fix). Scenarios:
- **XLSX happy path:** upload → detected headers visible → map → preview (correct counts, no errors) → start import → progress → completed → review → DB verified.
- **XLSX error path:** missing name/SKU/invalid price + a warning row + a valid row; ERROR ≠ WARNING displayed; **Start Import disabled** while `errorCount > 0`; **Download Error Report** produced a CSV that, after the fix, **includes the BOM** and the 6 columns.
- **CSV compatibility:** upload → mapping → preview → valid import (Updated 3) unchanged.
- **Multi-chunk:** 150 rows → 0% → intermediate → completion; polling stops at terminal.
- **Import history:** filename, type, status, rows, errors, created time, actions all correct.

No substitution with source inspection / `tsc` / API-only / mocks was used for these results.

## 13. Performance (P10 §16) — `VERIFIED` (end-to-end HTTP timings)

| Metric | Target | Measured | Result |
|---|---|---|---|
| XLSX parse 1000 rows (`/upload`) | < 5 s | **188 ms** | PASS |
| Preview 1000 rows (`/preview`) | < 3 s | **112 ms** | PASS |
| Error report 10,000 errors (`/errors`) | < 2 s | **36 ms** | PASS |

The 10k report was produced by a real all-invalid 10k-row import (100 chunks × ≤100 chunk errors), yielding exactly 10,000 data lines, `bom=true`, 6 columns. These are conservative end-to-end timings (network + storage + DB included), not isolated micro-benchmarks. (The 10k import *processing* itself took ~3.8 s, which is not a §16 target.)

## 14. Build results (P10 §17) — `VERIFIED`

- `pnpm --filter @scs/api exec tsc --noEmit` → EXIT 0.
- `pnpm --filter @scs/web exec tsc --noEmit` → EXIT 0.
- `pnpm --filter @scs/api run build` (nest) → EXIT 0; `dist/.../catalog.controller.js` contains **no** `require("express")` (boot-crash risk eliminated).
- `pnpm --filter @scs/web run build` → EXIT 0 (after two R6 store recoveries; `processChild.js` confirmed restored each time).

## 15. Files changed

Core remediation (authored prior turns, validated this turn):
- `apps/api/src/modules/catalog/catalog.controller.ts` — raw octet-stream upload route, `readRawBody(req: any)`, guards on every import route (+145/-… lines).
- `apps/api/src/modules/catalog/catalog.service.ts` — `uploadImportFile`, `resolveJobRows`, `buildSuggestedMapping`, `FILE_NOT_UPLOADED`/`MALFORMED_FILE` preview errors, status semantics (+371 lines).
- `apps/api/src/modules/catalog/catalog.module.ts` — provider wiring for parser/validation services.
- `apps/api/src/modules/catalog/merchant-xlsx-parser.service.ts` — new, workbook security + normalization.
- `apps/api/src/modules/catalog/import-validation.service.ts` — new, read-only validation (errors vs warnings, typed attrs).
- `apps/web/src/app/merchant/import/page.tsx` — wizard re-ordering, mapping UI, gate, progress (+468 lines).
- `apps/web/src/app/merchant/imports/page.tsx` — history + PROCESSING/IMPORTING.
- Tests: `unit/catalog/p10-remediation.spec.ts`, `unit/catalog/p10-import-validation.spec.ts`, `integration/p10-import-preview.postgres.spec.ts`.

Changed this turn (the only production source edit):
- `apps/web/src/app/merchant/import/page.tsx` and `apps/web/src/app/merchant/imports/page.tsx` — `handleDownloadErrors` now `res.blob()` (BOM preservation, R4).

New docs: this report + the R6 recovery runbook. (No migration/schema/version/lockfile changes.)

## 16. Database / migration status

- **No new migration.** Migration `0056` was NOT created — no measured architectural evidence required a schema change. The import lifecycle, typed attributes, and error reporting use existing tables (`import_jobs`, `import_job_chunks`, `product_attribute_values`, `variant_attribute_values`).
- PostgreSQL reachable; `readyz` = 200 (db + redis up).

## 17. P8 / P9 regression status — `VERIFIED` (no regression)

All §12-preserved guarantees re-run green: 100-row chunking, DB-backed concurrency mutex, atomic `READY/FAILED → PROCESSING` claim, 409 concurrent rejection, stale-lock handling (30 min), max 3 chunk attempts, resumability, cancellation semantics, completed-chunk non-reprocessing, typed attributes, negative-inventory protection, and CSV compatibility. Evidence: 400 unit tests + 41 PostgreSQL integration tests + live multi-chunk (150-row) import.

## 18. Known limitations (honest)

- Two-merchant **live** cross-tenant HTTP isolation was validated via unit/design-guarantee specs + guard code inspection, not a dedicated live two-tenant E2E run in this environment — recommended to add to the re-closure gate.
- Cancellation mid-processing and retry were confirmed reachable (endpoints + history actions) but not forced into a partially-cancelled live chunk state in this run.
- The XLSX parse/preview "timings" are end-to-end HTTP measurements (include storage round-trips), which are conservative but not isolated CPU-only profiles.
- R6 remains host/environment-specific and cannot be structurally eliminated by a repo change.

## 19. Scope compliance (P10 §18)

P10 scope ("Merchant Import UX & XLSX Production Pipeline") was held. **Not** implemented and intentionally out of scope: product submission workflow, mobile search parity, inventory receiving/cycle counting/valuation, promotions, returns, payments, refunds, new catalog features, **SSE**, XLSX export, unrelated UI redesign, and migration `0056`. No backend lifecycle states were renamed.

## 20. Recommended next gate

This turn is an **IMPLEMENTATION** turn. The correct next step is an **independent** re-verification of the remediation through real PostgreSQL and real browser E2E:

```text
P10 VERIFICATION CONDITIONS RE-CLOSURE
```

It is explicitly **NOT** `P10 RELEASE CLOSURE`, `P10 CLOSED`, or `P10 PASS` — those require the independent verification gate to be executed by a separate pass.

---

## Final state for this turn

```text
P10 REMEDIATION IMPLEMENTATION COMPLETE
```

```text
READY FOR P10 VERIFICATION CONDITIONS RE-CLOSURE
```
