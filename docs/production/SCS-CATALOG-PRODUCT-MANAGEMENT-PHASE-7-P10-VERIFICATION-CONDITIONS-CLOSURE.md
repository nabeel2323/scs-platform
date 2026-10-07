# SCS Catalog Product Management — Phase 7 P10 Verification Conditions Closure

**Gate type:** Verification Conditions Closure (environment repair + execution of the two
previously-unrun conditions). This is **not** a feature-development turn.
**Reference:** `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-7-P10-INDEPENDENT-RUNTIME-VERIFICATION.md`
**Starting verdict:** `P10 = PASS WITH CONDITIONS`
**Scope honored:** No feature added, no business rule changed, no migration created, no P8/P9
semantics altered, no XLSX validation rule changed, no SSE introduced, no architecture redesign.
Production source files were **not** modified (see §2 / §22 evidence).

---

## 1. Previous P10 Verification Baseline

| Item | Expected | Recorded | Match |
|------|----------|----------|:-----:|
| git branch | `develop` | `develop` | ✓ |
| git commit (HEAD) | `6106e48` | `6106e48` | ✓ |
| Node | `v26.4.0` | `v26.4.0` | ✓ |
| pnpm | `9.15.9` | `9.15.9` | ✓ |
| latest migration | `0055` | `0055_import_chunking_inventory_integrity.sql` | ✓ |
| migration 0056 | must not exist | **does not exist** | ✓ |

Commands:

```text
git rev-parse --abbrev-ref HEAD           -> develop
git rev-parse --short HEAD                -> 6106e48
node --version                             -> v26.4.0
pnpm --version                             -> 9.15.9
ls infra/drizzle/migrations/005*.sql       -> ...0055_import_chunking_inventory_integrity.sql (no 0056)
```

The working tree contains the **uncommitted P10 implementation deliverables** that were the
subject of the prior verification (untracked: `merchant-xlsx-parser.service.ts`,
`import-validation.service.ts`, `apps/web/src/app/merchant/imports/`, `p10-import-preview.postgres.spec.ts`,
`p10-import-validation.spec.ts`, and the P10 `docs/production/` reports; modified: `catalog.{controller,module,service}.ts`,
`apps/web/src/app/merchant/import/page.tsx`). Verification was executed against exactly this
tree. **No source file was edited in this closure turn.**

---

## 2. Dependency Repair

Diagnosis of the reported corruption (`next/dist/bin/next`,
`next/dist/compiled/jest-worker/processChild.js` missing from the virtual store):

```text
pnpm store path            -> C:\Users\nabee\AppData\Local\pnpm\store\v3
pnpm config get registry   -> https://registry.npmjs.org/
```

The corrupted `next@14.2.35` virtual directory was removed and re-materialized with
`pnpm install --force` against the existing lockfile.

- Attempts 1–2 were interrupted by `ECONNRESET` then `ENOTFOUND registry.npmjs.org`
  (transient network outage). No files were hand-copied and no versions were changed.
- `pnpm install --offline` initially failed with `ERR_PNPM_NO_OFFLINE_TARBALL` because the
  `next@14.2.35` tarball was not yet in the content-addressable store.
- After registry reachability returned (`curl.exe` to `registry.npmjs.org` → HTTP 200),
  `pnpm install --force` completed: **1384 packages added, "Done in 9m 36.1s"**.
- `cpu-features` (transitive, optional, of `ssh2`) install script fails and is
  **"skipped as optional"** — non-fatal, pre-existing, unrelated to Next.js.

The lockfile (`pnpm-lock.yaml`) and all `package.json` files are **unchanged** (`git status`
lists neither). No dependency version was upgraded.

---

## 3. pnpm Store Status — RECURRING INSTABILITY (material finding)

The store repair did **not** durably hold. During the §21 final gate the web production build
**failed again** with the identical class of error:

```text
Error: Cannot find module '...\node_modules\.pnpm\next@14.2.35_@opentelemetry+api@1.9.1_
@playwright+test@1.63.0_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next\
dist\compiled\jest-worker\processChild.js'
Next.js build worker exited with code: 1
```

Verified: exactly one `next@14.2.35_*` virtual dir exists and
`.../jest-worker/processChild.js` = **missing (False)** at that moment.

Re-repair performed in this turn:

```text
pnpm install --offline --force
  -> first pass aborted: ERR_PNPM_EPERM on node_modules\.pnpm\bcrypt@6.0.0
     (the running dev API — `nest start --watch` and `dist/main` — held the native bcrypt
      .node open). Long-running dev/build processes were stopped; the lock was released.
  -> second pass: "Done in 51.6s", exit 0. processChild.js = present (True).
```

**Conclusion:** the corrupted-virtual-store condition is a **flaky infrastructure defect on this
Windows host** (store links/compiled worker files intermittently absent, re-broken between
operations; the `bcrypt` `EPERM` shows file-handle contention from concurrently running servers).
It was worked around (not structurally resolved) by re-linking from the local store. The web
production build was ultimately produced from a healthy store, but the instability is documented
here so it is **not** silently marked "cleared".

---

## 4. Next.js Verification

```text
pnpm --filter @scs/web exec next --version      -> Next.js v14.2.35
required files:
  next/dist/bin/next                             -> present
  next/dist/compiled/jest-worker/processChild.js -> present (after re-repair)
  next/dist/pages/_app.js                        -> present
  next/package.json                              -> present
pnpm --filter @scs/web exec tsc --noEmit         -> 0 errors
```

---

## 5. Web Production Build

Real `next build` (not TypeScript substitution). First execution after repair:

```text
pnpm --filter @scs/web run build   (NEXT_TELEMETRY_DISABLED=1)
```

- First attempt stalled on `next/font/google` (Inter) build-time fetch (`fonts.googleapis.com`
  "Client network socket disconnected before secure TLS connection") — a **network** symptom,
  not a code defect; killed and retried.
- Retry compiled, linting passed, **40/40 static pages generated**.
- Re-run at the §21 gate initially failed on the recurring store issue (§3); after re-repair it
  succeeded again: **exit code 0, duration ≈ 413 s**.

P10 routes produced (verified in build artifacts + `.next/routes`):

| Route | Size | Type |
|-------|------|------|
| `/merchant/import` | ~8.1 kB | Static (○) |
| `/merchant/imports` | ~4.48 kB | Static (○) |

Confirmed present: `.next/server/app/merchant/import.html`, `.next/server/app/merchant/imports.html`.

Warnings (non-blocking, pre-existing): `useProductStudio.ts:262` React Hook missing dep `'brands'`.
Errors: none (in the successful build).

**Web production build = PASS** (achieved, but only after re-repairing §3 store instability).

---

## 6. Production Web Runtime

```text
pnpm --filter @scs/web start   -> next start -p 3100  -> Ready (~17 s)
```

HTTP checks against the running production server:

```text
GET http://localhost:3100/merchant/import   -> 200
GET http://localhost:3100/merchant/imports  -> 200
```

API production runtime was started separately and served on `0.0.0.0:3000`
(`node --env-file=.env dist/main`; the app has no dotenv/ConfigModule and reads `process.env`
directly, so `--env-file` is required). Unauthenticated `GET /v1/me` → 401 (correct).

> The dev/build servers were later stopped (see §3) to release `bcrypt`/`next` file locks for the
> store re-repair. Runtime reachability for both P10 routes had already been captured (200).

**Production web runtime = PASS (reachable).**

---

## 7. Browser Environment

Genuine browser E2E was executed — **not** substituted with source inspection, TypeScript
compilation, or API-only tests (§7/§24).

- Real browser: **Chromium** driven over **Playwright** (`playwright@1.49.1`) using the
  host's cached `chromium-1243` binary via `executablePath` (the pinned `chromium-1148`
  download stalled on the degraded network; the newer cached build launches headless and runs
  the app's production bundle).
- Harness location: `c:\TAIF\pw-e2e\` — a **scratch directory outside the repository**, so the app's
  `package.json`/lockfile were not touched.
- Session seeding: a valid HS256 access JWT was minted with the application's own dev secret
  (`JWT_ACCESS_SECRET`) and injected into `localStorage['scs_web_session']` +
  `['scs_web_user']` before page load. `JwtAuthGuard` verifies only the signature + a `jti`
  denylist (no server-side session lookup), so a correctly-signed token with the real merchant
  claims authenticates the **real UI**. The OTP/login path itself is an already-passed P10
  security criterion and is out of scope for this condition.
- Merchant principal: `MERCHANT_OWNER` / phone `+966500000010`, activeOrg
  `55c93c39-165d-4271-ba3d-35fc65092a79`, store `e448c1d9-66a1-46c0-b652-c6827028b4b2`
  "Gulf Tech Electronics". `GET /v1/me` → 200; `GET /v1/stores` returned the store.

Evidence artifacts: 16 screenshots + `evidence.json` in `c:\TAIF\pw-e2e\evidence\`.

**Browser environment = ESTABLISHED (real Chromium, authenticated).**

---

## 8. P10 Merchant Import Browser Flow

Wizard steps as implemented: `Upload File → Map Columns → Validation → Preview → Import Progress → Review`.

| Flow segment | CSV | XLSX |
|--------------|:---:|:----:|
| Login/authenticated entry to `/merchant/import` | ✓ | ✓ |
| Upload (file selected, name+size shown) | ✓ | ✓ (name/size only) |
| Map Columns | ✓ auto-mapped | ✗ **empty (no headers)** |
| Preview & Validate | ✗ **0 rows** | ✗ **HTTP 500** |
| Confirmation gate on errors | ✗ not enforced | ✗ unreachable |
| Import → Progress → Review | ✓ completes | ✗ unreachable |

The overall P10 flow **cannot be completed for XLSX**, and the **Preview/Validation stage does not
function for CSV either**. See §10–§13.

---

## 9. Upload Step

Verified in-browser:

- CSV accepted (`valid.csv`, `errors.csv`) — filename + size + type shown (e.g. `valid.csv 0.3 KB`). ✓
- XLSX accepted at selection (`valid.xlsx 6.5 KB`) — filename + size shown. ✓ (acceptance only)
- Unsupported extension rejected — client `handleFileSelect` guards `ext !== 'csv' && ext !== 'xlsx'`
  → "Please select a CSV or XLSX file." (source-guarded; consistent with acceptance). ✓
- Oversized-file rejection: **not exercised** in the browser (would require a >25 MB fixture); the
  file-size limit is enforced backend-side and covered by the passing
  `catalog-import/security.spec.ts` ("accepts files just under 25 MB", "rejects > 50,000 rows").
- UI remains usable after selection/rejection. ✓

**Upload UI = functional.** XLSX "acceptance" is superficial — the selected bytes never reach the
server (see §10).

---

## 10. XLSX Mapping — **DEFECT (P1)**

Requirement (§10 / lock line 713): "headers are detected by backend; mapping UI displays them;
mappings can be selected; typed attribute columns recognized; mapping survives to Preview."

Browser result for `valid.xlsx` (headers `name,sku,priceMinor,unit,category,brand,moq`):

- Map Columns step rendered **all 11 target selects at "— Not mapped —"**; captured select values:
  `["","","","","","","","","","",""]`. No backend-detected headers were surfaced.
- No `attr:` typed-attribute columns surfaced or selectable.
- `createImportJob` was called with `columnMapping = {}`.

Root cause (traced to source + live behavior):

1. `apps/web/src/app/merchant/import/page.tsx` — for XLSX it sets `detectedHeaders=[]` and
   `columnMapping={}` and **never uploads the file bytes** to the `storageKey` that
   `previewImportJob` reads (`catalog.service.ts` → `storage.getObject(bucket, job.storageKey)`).
2. There is **no import upload/presign route** (the only presign is `media/presign` for product
   images). `createImportJob` records metadata only.
3. Consequence observed live: `POST /v1/imports/:id/preview` → **HTTP 500**
   (`{"status":500,"detail":"An unexpected error occurred"}`) because the S3 object does not exist;
   and even if it existed, `ImportValidationService.get()` returns `''` for every field when the
   mapping is empty, so all rows would fail.

**XLSX merchant import is non-functional through the browser.** This is a genuine P10 code defect
(web↔storage↔validation integration), not environment and not pre-existing.

---

## 11. Preview UI — **DEFECT (P1)**

Requirement (§11): preview must show total rows, valid rows, ERROR count, WARNING count, validation
table (row/field/error code/message/suggested fix), and sample valid rows; no catalog mutation.

Browser result (CSV happy path, 3 valid rows):

- `POST /v1/imports/:id/preview` → **201** with body
  `{"totalRows":0,"validRows":0,"errorCount":0,"warningCount":0,"errors":[],"sampleRows":[]}`.
- Preview panel displayed: **"Preview Passed — No Errors · 0 total rows · 0 valid"** and only the
  detected-columns line. **No error/warning table, no row/field/code/message/suggested-fix columns,
  no sample rows** — because there are zero.
- No catalog records created by preview (isolation holds; the 0-row result simply means it validated
  an empty set).

Root cause (traced): the wizard requests `/preview` **before** staging rows. For CSV the rows are
staged only inside `handleStartImport` (`POST /imports/:id/rows`) which runs at "Start Import" —
i.e. **after** Preview. `previewImportJob` for CSV reads staged rows from Redis
(`stagedRowsKey`), which is empty at preview time → `totalRows:0`. (For XLSX preview is unreachable,
§10.)

**Preview UI does not meet §11 acceptance.** Genuine P1 defect (ordering/integration in the delivered
P10 web flow).

---

## 12. Error Handling UI — **DEFECT (P1)**

Requirement (§12): with an error file, ERROR must be visibly distinguished from WARNING; import
cannot be confirmed while blocking errors exist.

Browser result with `errors.csv` (missing name, missing SKU, invalid price, one good row):

- Preview again returned **0 rows / errorCount 0** (same root cause as §11 — preview runs before
  staging).
- Panel showed **"Preview Passed — No Errors · 0 total rows · 0 valid"**.
- **`Start Import` was ENABLED (`isDisabled() === false`)** despite the file containing hard errors.
- Consequently the `disabled={previewData.errorCount > 0}` confirmation gate can never engage, and
  ERROR-vs-WARNING styling has no data to render.

**§12 fails.** The "cannot confirm while blocking errors exist" guarantee is not effective in the
browser. Genuine P1 defect.

---

## 13. Error Report Download — **not reachable via UI; endpoint contract verified separately**

Requirement (§13): click "Download Error Report"; CSV downloads with correct filename, BOM, six
columns, error code + severity + suggested fix; no stack traces/secrets/DB/infra leakage.

Browser finding: the client `handleDownloadErrors` (and the conditional "Download full report"
buttons) are **not reachable** in the normal flow because Preview never surfaces errors (§11/§12),
and the XLSX path fails at Preview (§10). The download button is additionally gated behind
`errorCount > 500` (preview step) / `> 50` (validation step), so small error sets would not show it.

Contract-level verification of the endpoint itself (`GET /v1/imports/:id/errors` →
`catalog.service.ts::getErrorReport`), read from source and exercised via the API:

- Emits BOM `\uFEFF`, header `row_number,field,error_code,severity,message,suggested_fix` —
  **six columns**, including error code, severity and suggested fix. ✓ (contract)
- Values come from stored structured `ImportError`s (`errorCode`, `severity`, `message`,
  `suggestedFix`) — no stack traces, secrets, DB strings or internal infrastructure paths. ✓

The **report generator contract is correct**, but it **cannot be exercised end-to-end through the
browser** because the upstream Preview/error surface is broken. **§13 = BLOCKED by §11/§12.**

---

## 14. Successful Import — **PASS (CSV path)**

Browser (CSV happy path) executed to completion:

- Confirmation → `POST /imports/:id/rows` → **201**, `POST /imports/:id/process` → **201**.
- Poll `GET /imports/:id` → 200; terminal state reached; Review panel:
  **"Import Complete! · Created 3 · Updated 0 · Skipped 0 · Errors 0"**; note "created as DRAFT".
- No UI errors.

**Database verification** (`scs-postgres` / `scs_platform`):

```sql
SELECT v.sku, (v.product_id IS NOT NULL) AS has_product, p.status
FROM product_variants v LEFT JOIN products p ON p.id=v.product_id
WHERE v.sku IN ('WS-0001','UC-0002','KB-0003');
```

| sku | has_product | status |
|-----|:-----------:|:------:|
| KB-0003 | t | DRAFT |
| UC-0002 | t | DRAFT |
| WS-0001 | t | DRAFT |

Products and variants **were created**; typed-attribute rows = 0 for these SKUs (the CSV fixture had
no `attr:` columns, and the XLSX typed-attribute path is unreachable — §10). The underlying
`processImportJob`/`importRow` pipeline is **intact**.

**CSV successful import = PASS.** XLSX successful import = **BLOCKED** (§10).

---

## 15. Progress UI — **PARTIAL / NOT DEMONSTRABLE**

Browser: the Progress panel appeared ("Importing Products…") but the bar read **0%** with the job
status line showing a transitional value, then the wizard advanced directly to Review once the poll
observed `COMPLETED`. For a 3-row single-chunk import the work completes faster than the 2 s poll,
so multi-chunk progress could not be observed.

Additional concern (source, flagged not fixed): the client poll advances the bar only on
`job.status === 'IMPORTING'`, whereas the P8 backend uses `PROCESSING`; combined with fast small
jobs the visible progress signal is unreliable. To meet §15 properly a multi-chunk (>100 row) import
and a corrected status match would be required. **Not re-run at scale to avoid an expensive suite
without a working Preview/confirmation gate.**

---

## 16. Cancellation / 17. Retry — **NOT DEMONSTRABLE IN BROWSER**

`POST /imports/:id/cancel` and `POST /imports/:id/retry` endpoints exist and were exercised in the
prior P8/P10 PostgreSQL verification. In this browser pass they could not be reached because a large
enough import could not be started through the broken Preview/confirmation flow (§11/§12 gate is
ineffective but Preview itself shows 0 rows; XLSX is 500). Backend semantics were **not** altered
(scope rule). **§16/§17 = not exercised via UI; carried by the prior API/DB verification.**

---

## 18. Import History — **PASS**

Browser navigated to `/merchant/imports`:

- Page loads; table with columns **File / Type / Status / Rows / Errors / Created / Actions**.
- Jobs listed with correct filename, CSV/XLSX type and status:
  `valid.xlsx · XLSX · Previewing`, `errors.csv · CSV · Ready`, `valid.csv · CSV · Completed · 3 rows`.
- Footer: "3 imports total · 1 completed · 0 failed · 0 in progress".
- With no active jobs remaining, polling stops (no active status present).

**Import history = PASS.** Note the two non-completed jobs are the direct artifacts of the broken
XLSX (`Previewing`, never reached READY) and the pre-staging CSV preview (`Ready`, 0 rows) flows.

---

## 19. Store Isolation — **carried by prior verification**

Authorization invariant is intact in source and confirmed by the passing catalog security unit suite:
every import endpoint resolves `storeId` from the persisted job row and calls
`assertStoreInOrg` + `assertStoreMember` before touching data. A second browser store/user was not
provisioned for this turn; PostgreSQL tenant-isolation was already verified in the prior P10 pass and
is supplementary here. **Not weakened.**

---

## 20. CSV Backward Compatibility — **PASS for import; Preview feature not conformant**

Per lock BR-07, the existing CSV flow (client parse → stage rows → process) continues to work: the
browser completed a CSV import end-to-end and persisted 3 products (§14). The **new** P10 CSV
*preview* step is the part that does not conform (§11/§12). CSV *import* is not broken by P10.

---

## 21. Production Build Final Gate

All four gates re-run at closure time (compiler/build counts re-derived, not copied):

```text
pnpm --filter @scs/api exec tsc --noEmit    -> 0 errors            (API_TS = 0)
pnpm --filter @scs/web exec tsc --noEmit    -> 0 errors            (WEB_TS = 0)
pnpm --filter @scs/api run build            -> TSC 0 issues; SWC compiled 307 files; exit 0   (NEST = PASS)
pnpm --filter @scs/web run build            -> exit 0, ~413s; /merchant/import + /merchant/imports built
```

The web build first failed on the recurring virtual-store issue (§3) and passed only after
`pnpm install --offline --force` re-materialized `next`. **Web build = PASS (with §3 caveat).**

| Gate | Result |
|------|--------|
| API TS | 0 |
| Web TS | 0 |
| Nest build | PASS |
| Web build | PASS (flaky store) |

---

## 22. Targeted Regression

Fast, mock-based suites re-run after the dependency re-link to prove the environment repair caused
**no** backend regression (`vitest run`, exit 0):

```text
pnpm --filter @scs/api exec vitest run src/__tests__/unit/catalog src/__tests__/unit/catalog-import
  -> Test Files 25 passed (25) | Tests 388 passed (388) | Duration 62.12s
```

Includes: `p10-import-validation.spec.ts` (**30 tests PASS**, `MerchantXlsxParserService` A01/A02c…,
`ImportValidationService`), `catalog-remediation-security.spec.ts` (9), `catalog-import/security.spec.ts`
(12, incl. 25 MB + 50k-row limits, formula-injection), `p9-search-export-unit` / `search-service`,
`excel-parser`, `catalog-*` core. **Catalog/P10/P9 unit = PASS.**

The PostgreSQL-backed suites (`p10-import-preview.postgres`, `p8-import-hardening.postgres`,
`p9-search-export.postgres`) were **not** re-run here: they are expensive (testcontainers) and were
PASS in the prior independent verification; per §22 they are only required if the repair regressed
behavior, which the 388-test unit sweep shows it did not. They also cannot reproduce the defects
below, because — as the P10 unit tests do — they exercise the **services** directly with a valid
mapping + parsed rows, bypassing the broken **web** integration (see §23).

---

## 23. Failure Classification

Every non-passing item was classified with evidence; none is dismissed as "pre-existing".

| Item | Classification | Evidence |
|------|----------------|----------|
| `next` `processChild.js` missing (build fail) | **environment (recurring)** | §3 — file absent in `.pnpm` dir; fixed only by store re-link; no source change |
| `bcrypt` `EPERM` during `pnpm install` | **environment** | Running dev servers held the native `.node`; resolved by stopping them |
| `cpu-features` install script | **pre-existing / optional** | "skipped as optional" (transitive of `ssh2`); unrelated to Next.js |
| `useProductStudio.ts:262` react-hooks warning | **pre-existing (P10-unrelated)** | Present before this turn; non-blocking |
| XLSX import non-functional (§10) | **NEW-CONFIRMED P1 — P10 defect** | Live `preview` HTTP 500 + empty mapping; no upload route |
| CSV Preview shows 0 rows / no error gate (§11/§12) | **NEW-CONFIRMED P1 — P10 defect** | Live 201 body `totalRows:0`; `Start Import` enabled with error file |
| Error-report unreachable (§13) | **P10 defect (via §11/§12)** | Buttons gated behind >50/>500; upstream broken |
| Progress not observable (§15); Cancel/Retry not exercised (§16/§17) | **not a backend regression** | Backend intact (unit + prior DB verification); UI entry path broken |

Prior infrastructure failures (6 identity `bcrypt` suites; 1 webhook rate-limit suite) were **not**
re-run and are outside the P10 catalog scope.

**Why the prior P10 pass missed these:** P10's functional verification was service/API/DB-level. The
browser is the only layer that couples `createImportJob → (upload) → columnMapping → preview →
confirm-gate`, and that coupling is exactly what is broken — which is the precise purpose of the
cleared "Browser E2E" condition.

---

## 24. Browser Verification Integrity

Browser E2E was **actually executed** in a real Chromium against the production web build — it is
**not** BLOCKED, and **not** faked via source/TS/API substitution. It succeeded mechanically (routes
loaded, files uploaded, wizard driven, screenshots + network captured) and returned **negative
functional results** for the P10 XLSX and Preview/Validation features. Per §24, because the flow was
successfully exercised and failed on real defects, the outcome is a defect finding, not an
infrastructure block.

---

## 25. Remaining Conditions & Remediation Requirements

**Original two conditions:**

1. *Web production build blocked by corrupted pnpm store* → **CLEARED** (build passes), but the store
   instability is **recurring on this host** (§3) and should be structurally fixed before release.
2. *Browser E2E not executed* → **EXECUTED**; it did **not** pass — it surfaced genuine P1 defects.

**Required remediation (to be performed in a separate implementation turn — deliberately NOT done
here, because these touch the import architecture / XLSX validation wiring that the scope rule
forbids changing in a verification-closure turn):**

- **R1 (P1, XLSX upload):** Wire the selected XLSX bytes to the `storageKey` object that
  `previewImportJob` reads — add a presigned-PUT (or multipart) upload step between
  `createImportJob` and `preview`, or have the client POST the buffer to the storage layer. Without
  this, XLSX preview throws a raw **HTTP 500** (also fix it to a clean 4xx + structured
  `MALFORMED_FILE`/`FILE_NOT_UPLOADED` error with a suggested fix).
- **R2 (P1, XLSX mapping):** Surface backend-detected headers in the Map Columns step (from the
  parsed workbook) and let the merchant select mappings — including `attr:<code>` typed-attribute
  columns — so a non-empty `columnMapping` is persisted before `validateRows`. Currently XLSX sends
  `columnMapping={}` and every field resolves to `''`.
- **R3 (P1, Preview ordering):** Request `/preview` only **after** rows are available (stage CSV rows
  before preview, or make preview parse the source), so `totalRows/validRows/errorCount/warningCount`,
  the ERROR-vs-WARNING table and suggested fixes are real, and the `disabled={errorCount>0}`
  confirmation gate actually blocks a bad import (§11/§12).
- **R4 (P2, Download reachability):** Expose "Download Error Report" whenever `errorCount>0` (not
  only >500/>50) and verify the browser download (§13). Endpoint contract already emits BOM + 6 columns.
- **R5 (P3, Progress):** Match the backend `PROCESSING` status (client currently keys on `IMPORTING`)
  and demonstrate multi-chunk progress/cancellation/retry in the UI (§15/§16/§17).
- **R6 (infra):** Durably repair the pnpm virtual-store instability on this Windows host (§3).

---

## 26. Final Decision

- Condition 1 (Web production build) = **PASS** (with a recurring-store infrastructure caveat).
- Condition 2 (Browser E2E) = **executed and FAILED**, revealing genuine **P1** defects in the
  delivered P10 web↔backend integration (XLSX import; Preview/Validation and the error-confirmation
  gate).
- Backend services, P8 chunking/cancel/retry, P9 search/export, catalog security and the successful
  CSV import pipeline remain **PASS** (388 unit tests + live DB verification of 3 created products).

Because a genuine **P1/P2 P10 defect was found**, and the fixes require import-architecture changes
explicitly out of this turn's scope, the mandated outcome is **BLOCKED** with the remediation
requirements above — not a silent fix, and not a faked pass.

---

## 27. Verdict

```
P10 = BLOCKED
```

Next gate after remediation **R1–R5** are implemented and re-verified via browser E2E:
`P10 VERIFICATION CONDITIONS RE-CLOSURE` → then `P10 RELEASE CLOSURE`.
