/**
 * Integration test — Catalog import pipeline (parse → validate → plan).
 *
 * Tests the full pipeline with real Excel workbooks (no DB required):
 *   1. Build an XLSX workbook with multiple entity sheets
 *   2. Parse it with ExcelParserService
 *   3. Validate with ExcelValidatorService
 *   4. Plan with ExcelPlannerService
 *   5. Verify correct CREATE/UPDATE/UNCHANGED classification
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelParserService } from '../../modules/catalog-import/excel-parser.service';
import { ExcelValidatorService, type ExistingDataSnapshot } from '../../modules/catalog-import/excel-validator.service';
import { ExcelPlannerService, type ExistingEntityMap } from '../../modules/catalog-import/excel-planner.service';
import { ExcelResolverService } from '../../modules/catalog-import/excel-resolver.service';
import { CatalogValidationService } from '../../modules/catalog/catalog.validation-service';

/**
 * Build a multi-sheet workbook representing a catalog import.
 */
async function buildCatalogWorkbook(data: {
  brands?: Array<{ slug: string; name: string }>;
  categories?: Array<{ slug: string; name: string; parent_slug?: string }>;
  products?: Array<{ slug: string; title: string; brand_slug: string; product_type_code: string; category_slug: string }>;
  variants?: Array<{ product_slug: string; sku: string; title?: string }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  if (data.brands?.length) {
    const ws = wb.addWorksheet('Brands');
    ws.addRow(['slug', 'name']);
    for (const b of data.brands) ws.addRow([b.slug, b.name]);
  }

  if (data.categories?.length) {
    const ws = wb.addWorksheet('Categories');
    ws.addRow(['slug', 'name', 'parent_slug']);
    for (const c of data.categories) ws.addRow([c.slug, c.name, c.parent_slug ?? '']);
  }

  if (data.products?.length) {
    const ws = wb.addWorksheet('Products');
    ws.addRow(['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug']);
    for (const p of data.products) ws.addRow([p.slug, p.title, p.brand_slug, p.product_type_code, p.category_slug]);
  }

  if (data.variants?.length) {
    const ws = wb.addWorksheet('Variants');
    ws.addRow(['product_slug', 'sku', 'title']);
    for (const v of data.variants) ws.addRow([v.product_slug, v.sku, v.title ?? '']);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe('Catalog Import Pipeline Integration', () => {
  let parser: ExcelParserService;
  let validator: ExcelValidatorService;
  let planner: ExcelPlannerService;

  beforeEach(() => {
    parser = new ExcelParserService();
    validator = new ExcelValidatorService(new CatalogValidationService());
    planner = new ExcelPlannerService();
  });

  it('parses, validates, and plans a clean brand import', async () => {
    const buf = await buildCatalogWorkbook({
      brands: [
        { slug: 'dell', name: 'Dell' },
        { slug: 'hp', name: 'HP' },
        { slug: 'lenovo', name: 'Lenovo' },
      ],
    });

    // 1. Parse
    const workbook = await parser.parse(buf, 'brands.xlsx');
    expect(workbook.sheets.size).toBe(1);
    expect(workbook.sheets.has('brands')).toBe(true);
    expect(workbook.sheets.get('brands')!.rowCount).toBe(3);

    // 2. Validate (no existing data)
    const snapshot: ExistingDataSnapshot = {
      categorySlugs: [],
      brandSlugs: [],
      attributeMap: [],
      productTypeCodes: [],
      productSlugs: [],
      variantSkus: [],
    };
    const errors = validator.validate(workbook, snapshot);
    expect(errors.filter((e: any) => e.severity === 'ERROR')).toHaveLength(0);

    // 3. Plan (all new)
    const refs = {
      brandIds: new Map<string, string>(),
      categoryIds: new Map<string, string>(),
      attributeIds: new Map<string, string>(),
      attributeOptions: new Map<string, Map<string, string>>(),
      productTypeIds: new Map<string, string>(),
      productIds: new Map<string, string>(),
      variantIds: new Map<string, string>(),
      attributeTypes: new Map<string, string>(),
    };
    const existing: ExistingEntityMap = {
      categories: new Map(),
      brands: new Map(),
      products: new Map(),
    };
    const plan = planner.buildPlan(workbook, refs, existing);
    expect(plan.brands).toHaveLength(3);
    expect(plan.brands.every((b: any) => b.action === 'CREATE')).toBe(true);
    expect(plan.summary.totalCreate).toBe(3);
  });

  it('detects existing brands as UNCHANGED', async () => {
    const buf = await buildCatalogWorkbook({
      brands: [
        { slug: 'dell', name: 'Dell' },
        { slug: 'new-brand', name: 'New Brand' },
      ],
    });

    const workbook = await parser.parse(buf, 'brands.xlsx');

    const snapshot: ExistingDataSnapshot = {
      categorySlugs: [],
      brandSlugs: ['dell'],
      attributeMap: [],
      productTypeCodes: [],
      productSlugs: [],
      variantSkus: [],
    };
    const errors = validator.validate(workbook, snapshot);
    expect(errors.filter((e: any) => e.severity === 'ERROR')).toHaveLength(0);

    const refs = {
      brandIds: new Map([['dell', 'existing-uuid']]),
      categoryIds: new Map<string, string>(),
      attributeIds: new Map<string, string>(),
      attributeOptions: new Map<string, Map<string, string>>(),
      productTypeIds: new Map<string, string>(),
      productIds: new Map<string, string>(),
      variantIds: new Map<string, string>(),
      attributeTypes: new Map<string, string>(),
    };
    const existing: ExistingEntityMap = {
      categories: new Map(),
      brands: new Map([['dell', { name: 'Dell' }]]),
      products: new Map(),
    };
    const plan = planner.buildPlan(workbook, refs, existing);
    expect(plan.brands).toHaveLength(2);
    expect(plan.brands.find((b: any) => b.externalKey === 'dell')!.action).toBe('UNCHANGED');
    expect(plan.brands.find((b: any) => b.externalKey === 'new-brand')!.action).toBe('CREATE');
  });

  it('validates cross-sheet references and reports errors', async () => {
    const buf = await buildCatalogWorkbook({
      products: [
        { slug: 'lat-5450', title: 'Latitude 5450', brand_slug: 'nonexistent', product_type_code: 'laptop', category_slug: 'laptops' },
      ],
    });

    const workbook = await parser.parse(buf, 'products.xlsx');

    const snapshot: ExistingDataSnapshot = {
      categorySlugs: [],
      brandSlugs: [],
      attributeMap: [],
      productTypeCodes: [],
      productSlugs: [],
      variantSkus: [],
    };
    const errors = validator.validate(workbook, snapshot);
    // Should have errors for unknown brand, product type, and category
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.errorCode === 'UNKNOWN_REFERENCE' && e.field === 'brand_slug')).toBe(true);
  });

  it('handles multi-sheet workbook with categories + brands', async () => {
    const buf = await buildCatalogWorkbook({
      categories: [
        { slug: 'laptops', name: 'Laptops' },
        { slug: 'gaming-laptops', name: 'Gaming Laptops', parent_slug: 'laptops' },
      ],
      brands: [
        { slug: 'dell', name: 'Dell' },
      ],
    });

    const workbook = await parser.parse(buf, 'catalog.xlsx');
    expect(workbook.sheets.size).toBe(2);

    const snapshot: ExistingDataSnapshot = {
      categorySlugs: [],
      brandSlugs: [],
      attributeMap: [],
      productTypeCodes: [],
      productSlugs: [],
      variantSkus: [],
    };
    const errors = validator.validate(workbook, snapshot);
    expect(errors.filter(e => e.severity === 'ERROR')).toHaveLength(0);

    const refs = {
      brandIds: new Map<string, string>(),
      categoryIds: new Map<string, string>(),
      attributeIds: new Map<string, string>(),
      attributeOptions: new Map<string, Map<string, string>>(),
      productTypeIds: new Map<string, string>(),
      productIds: new Map<string, string>(),
      variantIds: new Map<string, string>(),
      attributeTypes: new Map<string, string>(),
    };
    const plan = planner.buildPlan(workbook, refs, emptyExisting());
    expect(plan.categories).toHaveLength(2);
    expect(plan.brands).toHaveLength(1);
    expect(plan.summary.totalCreate).toBe(3);
  });

  it('re-importing same data produces all UNCHANGED', async () => {
    const buf = await buildCatalogWorkbook({
      brands: [{ slug: 'dell', name: 'Dell' }],
      categories: [{ slug: 'laptops', name: 'Laptops' }],
    });

    const workbook = await parser.parse(buf, 'catalog.xlsx');

    // Simulate that dell and laptops already exist
    const refs = {
      brandIds: new Map([['dell', 'uuid-brand']]),
      categoryIds: new Map([['laptops', 'uuid-cat']]),
      attributeIds: new Map<string, string>(),
      attributeOptions: new Map<string, Map<string, string>>(),
      productTypeIds: new Map<string, string>(),
      productIds: new Map<string, string>(),
      variantIds: new Map<string, string>(),
      attributeTypes: new Map<string, string>(),
    };
    const existing: ExistingEntityMap = {
      categories: new Map([['laptops', { name: 'Laptops' }]]),
      brands: new Map([['dell', { name: 'Dell' }]]),
      products: new Map(),
    };

    const plan = planner.buildPlan(workbook, refs, existing);
    expect(plan.summary.totalCreate).toBe(0);
    expect(plan.summary.totalUpdate).toBe(0);
    expect(plan.summary.totalUnchanged).toBe(2);
  });
});

function emptyExisting(): ExistingEntityMap {
  return {
    categories: new Map(),
    brands: new Map(),
    products: new Map(),
  };
}
