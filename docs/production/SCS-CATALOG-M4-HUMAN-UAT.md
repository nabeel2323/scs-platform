# SCS Catalog M4 — Human UAT Guide

**Date:** 2026-09-26
**Prerequisites:** Running API (port 3000), Admin (port 3200), and PostgreSQL with migrated database

---

## Prerequisites Checklist

Before starting UAT, verify:

1. **Infrastructure running:**
   ```powershell
   pnpm infra:up
   ```

2. **Database migrated:**
   ```powershell
   $env:DATABASE_URL="postgresql://scs:scs_dev_2026@localhost:5432/scs_platform"
   pnpm db:migrate
   ```

3. **API running (port 3000):**
   ```powershell
   pnpm --filter @scs/api dev
   ```

4. **Admin running (port 3200):**
   ```powershell
   pnpm --filter @scs/admin dev
   ```

5. **Logged into Admin** with an account that has `catalog:product-types:manage` permission.

---

## A. Import

### Steps

1. Navigate to **Admin → Catalog Import** (or `http://localhost:3200/catalog-import`)
2. Click **Upload Workbook** and select the acceptance workbook:
   - Location: `docs/production/catalog-import-real-test-data-final.xlsx`
3. Wait for the upload to complete and auto-validation to run
4. Review the **Preview** results:

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Upload succeeds | File accepted | | |
| Parse succeeds | All 12 sheets recognized | | |
| Validation errors | 0 hard errors | | |
| Validation warnings | 0 or expected warnings | | |
| Plan summary | All CREATE (empty DB) | | |
| Publishability section | Present in preview | | |
| No database mutations | Verify via DB query | | |

### Verification Query (run in psql)

```sql
-- Before import: should be 0
SELECT 'categories' as t, COUNT(*) FROM categories WHERE store_id IS NULL
UNION ALL SELECT 'brands', COUNT(*) FROM brands
UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
UNION ALL SELECT 'variants', COUNT(*) FROM product_variants;
```

### Record Result

```
A. Import: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## B. Execute Import

### Steps

1. From the import preview, click **Execute Import**
2. Wait for execution to complete
3. Review the execution result

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Execution succeeds | No errors | | |
| Created count | > 0 (all entities) | | |
| Updated count | 0 | | |
| Rejected count | 0 | | |
| Sources created | > 0 | | |
| Errors array | Empty | | |

### Verification Query

```sql
-- After import: should show counts
SELECT 'categories' as t, COUNT(*) as cnt FROM categories WHERE store_id IS NULL
UNION ALL SELECT 'brands', COUNT(*) FROM brands
UNION ALL SELECT 'attribute_groups', COUNT(*) FROM attribute_groups
UNION ALL SELECT 'attributes', COUNT(*) FROM attribute_definitions
UNION ALL SELECT 'attribute_options', COUNT(*) FROM attribute_options
UNION ALL SELECT 'product_types', COUNT(*) FROM product_types
UNION ALL SELECT 'pta', COUNT(*) FROM product_type_attributes
UNION ALL SELECT 'products', COUNT(*) FROM products WHERE store_id IS NULL
UNION ALL SELECT 'variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'sources', COUNT(*) FROM product_sources;
```

### Record Result

```
B. Execute Import: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## C. Category Navigation

### Steps

1. Navigate to **Admin → Categories** (or the categories sidebar entry)
2. Locate and click on **Electronics** (or **Computers**)
3. Navigate the hierarchy: **Computers → Laptops → Business Laptops**
4. On the **Business Laptops** category, check available tabs

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Root categories visible | Electronics, Computers visible | | |
| Hierarchy correct | Computers → Laptops → Business Laptops | | |
| Parent/child relationships | Correct nesting | | |
| Products tab | Shows products in this category | | |
| Product Types tab | Shows product types | | |
| Attributes tab | Shows attributes | | |
| Category metadata | Name, slug, description present | | |

### Record Result

```
C. Category Navigation: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## D. Product Type

### Steps

1. Navigate to a **Product Type** (e.g., Business Laptop)
2. Review its configuration

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Product Type opens | Detail page loads | | |
| Attributes listed | All PTA attributes shown | | |
| Required attributes marked | Required flag visible | | |
| Variant dimensions shown | Dimension attributes identified | | |
| Publish readiness | Shows readiness status | | |
| Category association | Correct category shown | | |

### Record Result

```
D. Product Type: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## E. Publishing

### Steps

1. Open a valid **Product Type** (one with all required attributes configured)
2. Look for the **Publish** action/button
3. Attempt to publish

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Publish action available | Button/action visible | | |
| Valid PT publishes | Status transitions to PUBLISHED | | |
| Invalid PT rejected | Error message shown | | |
| Status change persisted | Refresh shows PUBLISHED | | |

### Verification Query

```sql
SELECT code, name, status FROM product_types;
```

### Record Result

```
E. Publishing: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## F. Product

### Steps

1. Navigate to **Admin → Products** (or browse via category)
2. Open an imported product (e.g., Latitude 5550)
3. Review all product details

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Product opens | Detail page loads | | |
| Canonical identity | `store_id IS NULL` (canonical) | | |
| Brand | Correct brand shown (e.g., Dell) | | |
| Category | Correct category shown | | |
| Product Type | Correct PT shown | | |
| Variants listed | All variants visible | | |
| Variant SKUs | Human-readable, not `SKU-[...]` | | |
| Attributes | Product attributes shown | | |

### Record Result

```
F. Product: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## G. Sources

### Steps

1. Open an imported product
2. Navigate to the **Sources** section (if available in Admin UI)
3. Alternatively, use the API directly:

```bash
curl http://localhost:3000/api/v1/products/:productId/sources
```

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Source records exist | At least 1 source per product | | |
| Source type correct | MANUFACTURER/DISTRIBUTOR/etc. | | |
| Source URL present | Valid URL shown | | |
| Multiple types supported | Different types coexist | | |

### Verification Query

```sql
SELECT p.slug as product, ps.source_type, ps.source_url, ps.verified_at
FROM product_sources ps
JOIN products p ON p.id = ps.product_id
ORDER BY p.slug, ps.source_type;
```

### Record Result

```
G. Sources: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## H. Export

### Steps

1. Navigate to **Admin → Catalog Export** (or the export endpoint)
2. Trigger a catalog export
3. Download the generated XLSX file
4. Open in Excel and inspect all sheets

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Export succeeds | File downloaded | | |
| README sheet | Present | | |
| Categories sheet | Present with data | | |
| Brands sheet | Present with data | | |
| Attribute Groups sheet | Present with data | | |
| Attributes sheet | Present with data | | |
| Attribute Options sheet | Present with data | | |
| Product Types sheet | Present with data | | |
| Product Type Attributes sheet | Present with data | | |
| Products sheet | Present with data | | |
| Product Attributes sheet | Present with data | | |
| Variants sheet | Present with data | | |
| Variant Attributes sheet | Present with data | | |
| Sources sheet | Present with data | | |
| No UUID leakage | Natural keys only (slugs, codes) | | |
| All FK fields populated | No empty relationship columns | | |

### Record Result

```
H. Export: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## I. Re-Import

### Steps

1. Using the **exported** workbook from step H, upload it as a new import
2. Run Preview
3. Review the plan summary

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Upload succeeds | File accepted | | |
| Validation errors | 0 hard errors | | |
| Plan: Creates | 0 | | |
| Plan: Updates | 0 | | |
| Plan: Unchanged | > 0 (all entities) | | |
| Plan: Rejected | 0 | | |

If executing:

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Execution result: Created | 0 | | |
| Execution result: Updated | 0 | | |
| Execution result: Rejected | 0 | | |
| Execution result: Errors | Empty | | |

### Record Result

```
I. Re-Import: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## J. Corrupted SKU Report

### Steps

1. Navigate to the corrupted variants endpoint:
   ```
   GET http://localhost:3000/api/v1/catalog/admin/corrupted-variants
   ```
   (Use browser with valid auth token, or Postman/curl)
2. Review the response

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Endpoint accessible | Returns 200 | | |
| Response format | `{ count: N, variants: [...] }` | | |
| Count on fresh DB | 0 (no corrupted records) | | |
| RBAC enforced | 403 for non-admin users | | |

### Record Result

```
J. Corrupted SKU Report: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## K. Security

### Steps

1. Log out of Admin
2. Attempt to access protected endpoints without authentication:
   - `GET http://localhost:3000/api/v1/catalog/admin/corrupted-variants`
   - `POST http://localhost:3000/api/v1/catalog-import/upload`
3. Log in as a non-admin user (if available)
4. Attempt the same endpoints

### Expected Results

| Check | Expected | Actual | Status |
|-------|----------|--------|:------:|
| Unauthenticated access blocked | 401 Unauthorized | | |
| Non-admin access blocked | 403 Forbidden | | |
| Import Center inaccessible | 401/403 | | |
| Corrupted variants inaccessible | 401/403 | | |
| Catalog admin inaccessible | 401/403 | | |
| Publishing controls inaccessible | 401/403 | | |

### Record Result

```
K. Security: [ PASS / FAIL / BLOCKED / NOT TESTED ]
Notes:
```

---

## UAT Summary Template

After completing all scenarios, fill in:

```
M4 HUMAN UAT RESULTS:

A. Import:                    [ PASS / FAIL / BLOCKED / NOT TESTED ]
B. Execute Import:            [ PASS / FAIL / BLOCKED / NOT TESTED ]
C. Category Navigation:       [ PASS / FAIL / BLOCKED / NOT TESTED ]
D. Product Type:              [ PASS / FAIL / BLOCKED / NOT TESTED ]
E. Publishing:                [ PASS / FAIL / BLOCKED / NOT TESTED ]
F. Product:                   [ PASS / FAIL / BLOCKED / NOT TESTED ]
G. Sources:                   [ PASS / FAIL / BLOCKED / NOT TESTED ]
H. Export:                    [ PASS / FAIL / BLOCKED / NOT TESTED ]
I. Re-Import:                 [ PASS / FAIL / BLOCKED / NOT TESTED ]
J. Corrupted SKU Report:      [ PASS / FAIL / BLOCKED / NOT TESTED ]
K. Security:                  [ PASS / FAIL / BLOCKED / NOT TESTED ]

Tester: ___________________________
Date:   ___________________________
Environment: ______________________

Overall UAT Status: [ PASS / FAIL / PARTIAL ]
```
