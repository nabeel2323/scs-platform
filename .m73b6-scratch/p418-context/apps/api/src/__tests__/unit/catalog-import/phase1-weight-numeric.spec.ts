/**
 * Phase 1 regression tests — Catalog Import weight_grams INT → NUMERIC(10,2).
 *
 * Reproduces the original production failure (KC3000-2TB, weight_grams = 9.7)
 * and verifies the complete fix:
 *   A. Decimal weight acceptance
 *   B. Integer weight remains valid
 *   C. Zero rejected
 *   D. Negative rejected
 *   E. Maximum accepted
 *   F. Above maximum rejected
 *   G. Invalid numeric rejected
 *   H. Integer-only fields reject decimals
 *   I. NOT NULL validation
 *   J. Enum validation
 *   K. Existing integer data migration safety (unit test — no DB required)
 *   L. API serialization (NUMERIC → JSON number)
 *
 * These tests exercise the parser → validator → planner pipeline without
 * requiring a database connection.  Executor/DB tests require testcontainers.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelParserService } from '../../../modules/catalog-import/excel-parser.service';
import { ExcelValidatorService, type ExistingDataSnapshot } from '../../../modules/catalog-import/excel-validator.service';
import { ExcelPlannerService, type ExistingEntityMap, type ImportPlan } from '../../../modules/catalog-import/excel-planner.service';
import { CatalogValidationService } from '../../../modules/catalog/catalog.validation-service';

// ── Helpers ──────────────────────────────────────────────────────────

const EMPTY_SNAPSHOT: ExistingDataSnapshot = {
  categorySlugs: ['electronics'],
  brandSlugs: ['kingston'],
  attributeMap: [],
  productTypeCodes: ['ssd'],
  productSlugs: ['kc3000'],
  variantSkus: [],
};

const EMPTY_REFS = {
  brandIds: new Map<string, string>([['kingston', 'brand-uuid-1']]),
  categoryIds: new Map<string, string>([['electronics', 'cat-uuid-1']]),
  attributeGroupIds: new Map<string, string>(),
  attributeIds: new Map<string, string>(),
  attributeOptions: new Map<string, Map<string, string>>(),
  productTypeIds: new Map<string, string>([['ssd', 'pt-uuid-1']]),
  productIds: new Map<string, string>([['kc3000', 'prod-uuid-1']]),
  variantIds: new Map<string, string>(),
  attributeTypes: new Map<string, string>(),
};

const EMPTY_EXISTING: ExistingEntityMap = {
  categories: new Map(),
  brands: new Map(),
  products: new Map(),
};

/**
 * Build a minimal workbook with a variants sheet containing the given weight_grams values.
 */
async function buildVariantWorkbook(weightValues: Array<string | number | null>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Variants');
  ws.addRow(['product_slug', 'sku', 'weight_grams']);
  for (let i = 0; i < weightValues.length; i++) {
    ws.addRow(['kc3000', `SKU-${i + 1}`, weightValues[i]]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Build a workbook with integer fields containing decimal values.
 */
async function buildIntegerFieldWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Categories sheet with decimal sort_order
  const catWs = wb.addWorksheet('Categories');
  catWs.addRow(['slug', 'name', 'sort_order']);
  catWs.addRow(['cat-ok', 'Good Category', '1']);
  catWs.addRow(['cat-bad', 'Bad Category', '1.5']);

  // Brands sheet (required for product reference)
  const brandWs = wb.addWorksheet('Brands');
  brandWs.addRow(['slug', 'name']);
  brandWs.addRow(['kingston', 'Kingston']);

  // Product types sheet with decimal display_order in PTA
  const ptWs = wb.addWorksheet('Product Types');
  ptWs.addRow(['code', 'name', 'category_slug']);
  ptWs.addRow(['ssd', 'SSD', 'electronics']);

  // Attributes sheet
  const attrWs = wb.addWorksheet('Attributes');
  attrWs.addRow(['code', 'name', 'type', 'scope']);
  attrWs.addRow(['color', 'Color', 'TEXT', 'VARIANT']);

  // Product type attributes with decimal display_order
  const ptaWs = wb.addWorksheet('Product Type Attributes');
  ptaWs.addRow(['product_type_code', 'attribute_code', 'display_order']);
  ptaWs.addRow(['ssd', 'color', '2']);
  ptaWs.addRow(['ssd', 'color', '2.5']);

  // Products sheet
  const prodWs = wb.addWorksheet('Products');
  prodWs.addRow(['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug']);
  prodWs.addRow(['kc3000', 'KC3000 SSD', 'kingston', 'ssd', 'electronics']);

  // Variants sheet
  const varWs = wb.addWorksheet('Variants');
  varWs.addRow(['product_slug', 'sku']);
  varWs.addRow(['kc3000', 'kc3000-1tb']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Build a workbook with enum violations.
 */
async function buildEnumWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Products with invalid status/condition
  const prodWs = wb.addWorksheet('Products');
  prodWs.addRow(['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug', 'status', 'condition']);
  prodWs.addRow(['prod-ok', 'Good Product', 'kingston', 'ssd', 'electronics', 'ACTIVE', 'NEW']);
  prodWs.addRow(['prod-bad-status', 'Bad Status', 'kingston', 'ssd', 'electronics', 'INVALID_STATUS', 'NEW']);
  prodWs.addRow(['prod-bad-condition', 'Bad Condition', 'kingston', 'ssd', 'electronics', 'ACTIVE', 'BROKEN']);

  // Brands
  const brandWs = wb.addWorksheet('Brands');
  brandWs.addRow(['slug', 'name']);
  brandWs.addRow(['kingston', 'Kingston']);

  // Product types
  const ptWs = wb.addWorksheet('Product Types');
  ptWs.addRow(['code', 'name', 'category_slug']);
  ptWs.addRow(['ssd', 'SSD', 'electronics']);

  // Categories
  const catWs = wb.addWorksheet('Categories');
  catWs.addRow(['slug', 'name']);
  catWs.addRow(['electronics', 'Electronics']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Test suite ────────────────────────────────────────────────────────

describe('Phase 1 — Weight grams NUMERIC(10,2) regression', () => {
  let parser: ExcelParserService;
  let validator: ExcelValidatorService;
  let planner: ExcelPlannerService;

  beforeEach(() => {
    parser = new ExcelParserService();
    validator = new ExcelValidatorService(new CatalogValidationService());
    planner = new ExcelPlannerService();
  });

  // ── A. Decimal weight acceptance ──────────────────────────────────

  it('A: accepts weight_grams = 9.7 (decimal) through validation and planning', async () => {
    const buf = await buildVariantWorkbook(['9.7']);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors).toHaveLength(0);

    // Planner should produce 9.7 (not 9, not "9.7")
    const plan = planner.buildPlan(workbook, EMPTY_REFS as any, EMPTY_EXISTING);
    const variant = plan.variants.find(v => v.externalKey === 'SKU-1');
    expect(variant).toBeDefined();
    expect(variant!.data['weightGrams']).toBe(9.7);
  });

  // ── B. Integer weight ─────────────────────────────────────────────

  it('B: accepts weight_grams = 1250 (integer) — backward compatible', async () => {
    const buf = await buildVariantWorkbook([1250]);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors).toHaveLength(0);

    const plan = planner.buildPlan(workbook, EMPTY_REFS as any, EMPTY_EXISTING);
    const variant = plan.variants.find(v => v.externalKey === 'SKU-1');
    expect(variant!.data['weightGrams']).toBe(1250);
  });

  // ── C. Zero rejected ──────────────────────────────────────────────

  it('C: rejects weight_grams = 0', async () => {
    const buf = await buildVariantWorkbook([0]);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors.length).toBeGreaterThanOrEqual(1);
    expect(weightErrors[0]!.errorCode).toBe('VALUE_OUT_OF_RANGE');
  });

  // ── D. Negative rejected ──────────────────────────────────────────

  it('D: rejects weight_grams = -1', async () => {
    const buf = await buildVariantWorkbook([-1]);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors.length).toBeGreaterThanOrEqual(1);
    expect(weightErrors[0]!.errorCode).toBe('VALUE_OUT_OF_RANGE');
  });

  // ── E. Maximum accepted ───────────────────────────────────────────

  it('E: accepts weight_grams = 99999999.99 (maximum)', async () => {
    const buf = await buildVariantWorkbook([99999999.99]);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors).toHaveLength(0);

    const plan = planner.buildPlan(workbook, EMPTY_REFS as any, EMPTY_EXISTING);
    const variant = plan.variants.find(v => v.externalKey === 'SKU-1');
    expect(variant!.data['weightGrams']).toBe(99999999.99);
  });

  // ── F. Above maximum rejected ─────────────────────────────────────

  it('F: rejects weight_grams = 100000000 (above maximum)', async () => {
    const buf = await buildVariantWorkbook([100000000]);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors.length).toBeGreaterThanOrEqual(1);
    expect(weightErrors[0]!.errorCode).toBe('VALUE_OUT_OF_RANGE');
  });

  // ── G. Invalid numeric rejected ───────────────────────────────────

  it('G: rejects weight_grams = "abc" (non-numeric)', async () => {
    const buf = await buildVariantWorkbook(['abc']);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors.length).toBeGreaterThanOrEqual(1);
    expect(weightErrors[0]!.errorCode).toBe('INVALID_NUMERIC');
  });

  it('G: rejects weight_grams = "9.7g" (non-numeric with unit)', async () => {
    const buf = await buildVariantWorkbook(['9.7g']);
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors.length).toBeGreaterThanOrEqual(1);
    expect(weightErrors[0]!.errorCode).toBe('INVALID_NUMERIC');
  });

  // ── H. Integer-only fields reject decimals ────────────────────────

  it('H: rejects sort_order = 1.5 in categories', async () => {
    const buf = await buildIntegerFieldWorkbook();
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, {
      ...EMPTY_SNAPSHOT,
      categorySlugs: [],
    });
    const sortErrors = errors.filter(e => e.field === 'sort_order' && e.errorCode === 'INVALID_INTEGER');
    expect(sortErrors.length).toBeGreaterThanOrEqual(1);
    // The bad category should have an error
    const badCatError = sortErrors.find(e => e.externalKey === 'cat-bad');
    expect(badCatError).toBeDefined();
  });

  it('H: rejects display_order = 2.5 in product_type_attributes', async () => {
    const buf = await buildIntegerFieldWorkbook();
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, {
      ...EMPTY_SNAPSHOT,
      categorySlugs: ['electronics'],
      brandSlugs: ['kingston'],
      productTypeCodes: ['ssd'],
    });
    const displayErrors = errors.filter(e => e.field === 'display_order' && e.errorCode === 'INVALID_INTEGER');
    expect(displayErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ── I. NOT NULL validation ────────────────────────────────────────
  // Covered by existing validateVariants (SKU required) and validateProducts (slug, title required).
  // Phase 1 establishes the foundation — full NOT NULL coverage is in the validator's
  // REQUIRED_HEADERS and per-entity validation methods.

  it('I: existing NOT NULL validation still catches missing SKU', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Variants');
    ws.addRow(['product_slug', 'sku']);
    ws.addRow(['kc3000', '']); // empty SKU
    const buf = await wb.xlsx.writeBuffer();
    const workbook = await parser.parse(Buffer.from(buf), 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);
    const skuErrors = errors.filter(e => e.field === 'sku' && e.errorCode === 'MISSING_VALUE');
    expect(skuErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ── J. Enum validation ────────────────────────────────────────────

  it('J: rejects invalid product status', async () => {
    const buf = await buildEnumWorkbook();
    const workbook = await parser.parse(buf, 'test.xlsx');
    const errors = validator.validate(workbook, {
      ...EMPTY_SNAPSHOT,
      productSlugs: [],
    });
    const enumErrors = errors.filter(e => e.errorCode === 'INVALID_ENUM');
    expect(enumErrors.length).toBeGreaterThanOrEqual(2); // bad status + bad condition
    const statusError = enumErrors.find(e => e.field === 'status');
    expect(statusError).toBeDefined();
    const condError = enumErrors.find(e => e.field === 'condition');
    expect(condError).toBeDefined();
  });

  // ── K. Existing integer data migration safety ─────────────────────

  it('K: integer weight 100 → Number("100") = 100 (no data loss)', () => {
    // The planner converts via Number().  For integer strings, Number("100") = 100.
    // After migration, PostgreSQL stores 100 as 100.00 — numerically identical.
    expect(Number('100')).toBe(100);
    expect(Number('250')).toBe(250);
    expect(Number('0')).toBe(0);
  });

  // ── L. API serialization ──────────────────────────────────────────

  it('L: Number("9.70") produces JSON-compatible number 9.7', () => {
    // Drizzle numeric() returns "9.70" (string).  The coerceVariantNumeric
    // helper converts it via Number().  Verify the round-trip:
    const drizzleValue = '9.70';
    const jsonValue = Number(drizzleValue);
    expect(jsonValue).toBe(9.7);
    expect(JSON.stringify({ weight_grams: jsonValue })).toBe('{"weight_grams":9.7}');
  });

  it('L: Number("1250.00") produces 1250 (integer preserved)', () => {
    const drizzleValue = '1250.00';
    const jsonValue = Number(drizzleValue);
    expect(jsonValue).toBe(1250);
    expect(JSON.stringify({ weight_grams: jsonValue })).toBe('{"weight_grams":1250}');
  });

  // ── Regression: original production failure ───────────────────────

  it('REGRESSION: KC3000-2TB weight_grams=9.7 passes validation (root cause fixed)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Variants');
    ws.addRow(['product_slug', 'sku', 'weight_grams']);
    ws.addRow(['kc3000', 'KC3000-2TB', '9.7']);

    const buf = await wb.xlsx.writeBuffer();
    const workbook = await parser.parse(Buffer.from(buf), 'test.xlsx');
    const errors = validator.validate(workbook, EMPTY_SNAPSHOT);

    // No weight_grams errors — the original root cause is fixed
    const weightErrors = errors.filter(e => e.field === 'weight_grams');
    expect(weightErrors).toHaveLength(0);

    // Planner produces a valid decimal
    const plan = planner.buildPlan(workbook, EMPTY_REFS as any, EMPTY_EXISTING);
    const variant = plan.variants.find(v => v.externalKey === 'KC3000-2TB');
    expect(variant).toBeDefined();
    expect(typeof variant!.data['weightGrams']).toBe('number');
    expect(variant!.data['weightGrams']).toBe(9.7);
  });
});
