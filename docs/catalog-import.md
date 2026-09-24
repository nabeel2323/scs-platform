# Catalog Import Center

> Admin-driven Excel (XLSX) import system for the canonical platform catalog.

## Overview

The Catalog Import Center allows platform administrators to bulk-create and update
catalog entities — categories, brands, attributes, product types, products, variants,
and sources — via Excel workbooks. The system provides a guided workflow:

```
Upload → Auto-Validate → Preview → Confirm → Execute → Report
```

All endpoints are gated by the `catalog:imports:manage` permission and require
`ADMIN` or `SUPER_ADMIN` role.

---

## Supported Entity Types

| Sheet Name                | Entity Type              | Required Headers                              |
|---------------------------|--------------------------|-----------------------------------------------|
| Categories                | categories               | `slug`, `name`                                |
| Brands                    | brands                   | `slug`, `name`                                |
| Attribute Groups          | attribute_groups         | `name`                                        |
| Attributes                | attributes               | `code`, `name`, `type`, `scope`               |
| Attribute Options         | attribute_options        | `attribute_code`, `value`                     |
| Product Types             | product_types            | `code`, `name`                                |
| Product Type Attributes   | product_type_attributes  | `product_type_code`, `attribute_code`         |
| Products                  | products                 | `slug`, `title`, `brand_slug`, `product_type_code`, `category_slug` |
| Product Attributes        | product_attributes       | `product_slug`, `attribute_code`              |
| Variants                  | variants                 | `product_slug`, `sku`                         |
| Variant Attributes        | variant_attributes       | `variant_sku`, `attribute_code`               |
| Sources                   | sources                  | `product_slug`, `source_type`, `source_url`   |

---

## Excel Format

### File Requirements

- **Format**: `.xlsx` only (`.xls` and `.xlsm` are rejected for security)
- **Max file size**: 25 MB
- **Max rows per sheet**: 50,000
- **Max cell value length**: 10,000 characters
- **Formulas**: Cached results are read; formulas are **never** evaluated
- **Encoding**: UTF-8 (Excel default for .xlsx)

### Header Conventions

- Headers are in **Row 1** of each sheet
- Headers are case-insensitive and normalized (spaces → underscores, lowercased)
- Duplicate headers within a sheet cause an immediate error
- Unknown sheet names are silently skipped with a warning

### Slug Format

Slugs must be lowercase alphanumeric with hyphens:
- Pattern: `/^[a-z0-9]+(-[a-z0-9]+)*$/`
- Max length: 120 characters
- Examples: `business-laptops`, `gaming`, `samsung`

### Attribute Codes

Codes must be snake_case:
- Pattern: `/^[a-z][a-z0-9_]*[a-z0-9]$/`
- Min length: 2, Max length: 60
- Examples: `battery_life`, `screen_size`, `ram_gb`

### Attribute Types

Valid types: `TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, `DATETIME`, `SELECT`, `MULTI_SELECT`, `COLOR`, `URL`, `FILE`, `MEASUREMENT`, `CURRENCY`

### Attribute Scopes

Valid scopes: `PRODUCT`, `VARIANT`, `OFFER`

### Source Types

Valid source types: `MANUFACTURER`, `DISTRIBUTOR`, `MANUAL`, `API`, `IMPORT`

---

## Templates

### Download Templates

Templates are dynamically generated from the current database state, so dropdown
validations always reflect the latest brands, categories, attributes, and product types.

**Via Admin UI**: Click the template download buttons on the Import Center dashboard.

**Via API**:
```
GET /admin/catalog-imports/template/full          — All 12 entity sheets
GET /admin/catalog-imports/template/products       — Products + attributes + variants + sources
GET /admin/catalog-imports/template/categories     — Categories only
GET /admin/catalog-imports/template/brands         — Brands only
GET /admin/catalog-imports/template/attributes     — Attribute groups + attributes + options
GET /admin/catalog-imports/template/product-types  — Product types + type-attributes
```

### Template Contents

Each template includes:
- **README sheet** with instructions and sheet descriptions
- **Entity sheets** with styled headers and column widths
- **Data validations** (dropdown lists) for:
  - `brand_slug` on Products sheet
  - `category_slug` on Products sheet
  - `product_type_code` on Products sheet
  - `attribute_code` on Product Attributes and Variant Attributes sheets

---

## Validation Rules

### Per-Entity Validation

| Entity             | Checks                                                                 |
|--------------------|------------------------------------------------------------------------|
| Categories         | Slug format, name required, unique slug (within file + existing DB), parent_slug exists |
| Brands             | Slug format, name required, unique slug                                |
| Attributes         | Code format, valid type, valid scope, unique code                      |
| Attribute Options  | attribute_code exists, value required                                  |
| Product Types      | Code required, name required, unique code, category_slug exists        |
| Product Type Attrs | product_type_code exists, attribute_code exists                        |
| Products           | Slug format, title required, brand/category/product_type exist, GTIN/EAN format, unique slug |
| Product Attributes | product_slug exists, attribute_code exists, value matches attribute type |
| Variants           | product_slug exists, SKU required, unique SKU                          |
| Variant Attributes | variant_sku exists, attribute_code exists, value matches attribute type |
| Sources            | product_slug exists, valid source_type, source_url required            |

### Cross-Sheet References

The validator checks that references between sheets are consistent:
- A product's `brand_slug` must reference a brand in the Brands sheet or existing DB
- A product's `category_slug` must reference a category in the Categories sheet or existing DB
- A product attribute's `product_slug` must reference a product in the Products sheet
- A variant's `product_slug` must reference a product in the Products sheet

### Error Severities

- **ERROR**: Hard validation failure — the row will be rejected during import
- **WARNING**: Soft issue — the row can still be imported but may have issues

---

## Import Behavior

### Create vs. Update

The planner compares each row against the existing database:

| Scenario | Action |
|----------|--------|
| Entity key not in DB | **CREATE** — insert new row |
| Entity key in DB, data differs | **UPDATE** — update changed fields |
| Entity key in DB, data identical | **UNCHANGED** — skip, no DB write |
| Validation error | **REJECT** — row not imported |

### Transaction Safety

- All creates/updates execute within a single database transaction
- If any error occurs during execution, the entire transaction is **rolled back**
- The import job status is set to `FAILED` on rollback
- On success: `COMPLETED` or `COMPLETED_WITH_ERRORS` (if some rows were rejected)

### Idempotency

Re-importing the same workbook is safe:
- Entities that already exist with identical data are classified as UNCHANGED
- No duplicates are created
- The import job records how many rows were created/updated/unchanged/rejected

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/catalog-imports/upload` | Upload XLSX, auto-validate |
| `GET`  | `/admin/catalog-imports` | List import history |
| `GET`  | `/admin/catalog-imports/:id` | Get import job detail |
| `GET`  | `/admin/catalog-imports/:id/preview` | Get validation preview |
| `POST` | `/admin/catalog-imports/:id/execute` | Confirm and execute import |
| `GET`  | `/admin/catalog-imports/:id/errors` | Get row-level errors |
| `GET`  | `/admin/catalog-imports/:id/report` | Download error report (XLSX) |
| `GET`  | `/admin/catalog-imports/template/:type` | Download blank template |
| `POST` | `/admin/catalog-imports/export` | Export current catalog to XLSX |

### Import Job Status Flow

```
UPLOADED → PARSING → VALIDATING → READY → IMPORTING → COMPLETED
                                                  ↘ COMPLETED_WITH_ERRORS
                                                  ↘ FAILED
                                         ↗ CANCELLED
```

---

## Catalog Export

Export the current canonical catalog to an XLSX workbook:

```
POST /admin/catalog-imports/export
```

The export includes:
- Categories (platform-level only, no store-specific)
- Brands
- Attributes (definitions)
- Attribute Options
- Product Types
- Products (platform-level only)
- Variants

The exported workbook uses the same sheet format as the import template, so it
can be round-tripped: export → edit → re-import.

---

## Permissions

| Permission Key | Description |
|---------------|-------------|
| `catalog:imports:manage` | Upload, validate, execute, and export catalog imports |

Assigned to roles:
- **SUPER_ADMIN** (inherits all permissions)
- **ADMIN** (explicitly granted)

---

## CLI Commands

```bash
# Validate a workbook without importing
pnpm --filter @scs/api catalog:import:validate --file path/to/workbook.xlsx

# Generate a blank template
pnpm --filter @scs/api catalog:template --type full --output template.xlsx
```

---

## Troubleshooting

### "No recognized worksheets found"
Ensure your sheet names match exactly: `Categories`, `Brands`, `Attributes`, etc.
Sheet names are case-sensitive.

### "File too large"
Maximum file size is 25 MB. Split large imports into multiple workbooks by entity type.

### "Duplicate header"
Each column header must be unique within a sheet. Check for accidental duplicate columns.

### "Unknown reference" errors
Cross-sheet references must be resolvable. If you reference a brand in the Products
sheet, the brand must exist in the Brands sheet (same workbook) or in the database.

### Import stuck in VALIDATING status
The plan cache is in-memory. If the API restarts between upload and execute, the
cached plan is lost. Re-upload the workbook to re-validate.

### Formula injection prevention
When exporting data, cell values starting with `=`, `+`, `-`, or `@` are prefixed
with a single quote (`'`) to prevent formula injection in Excel. This is handled
automatically by the `sanitizeForExcel()` function in `CatalogValidationService`.

---

## Architecture

### Service Pipeline

```
ExcelParserService     → Reads XLSX buffer into ParsedWorkbook
ExcelValidatorService  → Validates against catalog rules + existing data
ExcelResolverService   → Resolves external keys to internal UUIDs
ExcelPlannerService    → Generates import plan (CREATE/UPDATE/UNCHANGED/REJECT)
ExcelExecutorService   → Executes plan in DB transaction
TemplateGeneratorService → Generates templates and exports
CatalogImportService   → Orchestrates the full pipeline
```

### Database Tables

- `catalog_imports` — Import job records with status, stats, file references
- `catalog_import_errors` — Row-level validation/import errors

### File Storage

Uploaded workbooks are stored in S3-compatible storage under the
`catalog-imports/{uuid}/{filename}` key pattern in the uploads bucket.
