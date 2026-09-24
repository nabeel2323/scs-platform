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

  it('validates a full catalog workbook with attributes → options → product type attrs → product attrs → variant attrs', async () => {
    // Builds a realistic XLSX workbook mirroring the real test-data workbook
    // with 33 attributes, options, product types, products, variants, and
    // all cross-sheet references.  This is the end-to-end regression test
    // for the attribute-definition resolution fix.
    const wb = new ExcelJS.Workbook();

    // Categories
    const catWs = wb.addWorksheet('Categories');
    catWs.addRow(['slug', 'name']);
    catWs.addRow(['laptops', 'Laptops']);
    catWs.addRow(['electronics', 'Electronics']);

    // Brands
    const brandWs = wb.addWorksheet('Brands');
    brandWs.addRow(['slug', 'name']);
    brandWs.addRow(['dell', 'Dell']);
    brandWs.addRow(['lenovo', 'Lenovo']);
    brandWs.addRow(['hp', 'HP']);

    // Attributes (realistic set matching the user's workbook)
    const attrWs = wb.addWorksheet('Attributes');
    attrWs.addRow(['Code', 'Name', 'Type', 'Scope']);
    const attrDefs = [
      ['screen-size-in', 'Screen Size', 'DECIMAL', 'PRODUCT'],
      ['resolution', 'Resolution', 'SELECT', 'PRODUCT'],
      ['panel-type', 'Panel Type', 'SELECT', 'PRODUCT'],
      ['refresh-rate-hz', 'Refresh Rate', 'SELECT', 'PRODUCT'],
      ['brightness-nits', 'Brightness', 'INTEGER', 'PRODUCT'],
      ['cpu-model', 'CPU Model', 'SELECT', 'PRODUCT'],
      ['cpu-cores', 'CPU Cores', 'INTEGER', 'PRODUCT'],
      ['cpu-threads', 'CPU Threads', 'INTEGER', 'PRODUCT'],
      ['ram-type', 'RAM Type', 'SELECT', 'PRODUCT'],
      ['ram-gb', 'RAM (GB)', 'INTEGER', 'PRODUCT'],
      ['poe', 'PoE', 'BOOLEAN', 'PRODUCT'],
    ];
    for (const a of attrDefs) attrWs.addRow(a);

    // Attribute Options
    const optWs = wb.addWorksheet('Attribute Options');
    optWs.addRow(['Attribute Code', 'Value']);
    const optData = [
      ['resolution', '1920x1080'],
      ['resolution', '2560x1440'],
      ['resolution', '3840x2160'],
      ['panel-type', 'IPS'],
      ['panel-type', 'OLED'],
      ['panel-type', 'VA'],
      ['refresh-rate-hz', '60'],
      ['refresh-rate-hz', '120'],
      ['refresh-rate-hz', '144'],
      ['cpu-model', 'Intel Core i5-1335U'],
      ['cpu-model', 'Intel Core i7-1355U'],
      ['cpu-model', 'AMD Ryzen 7 7730U'],
      ['ram-type', 'DDR4'],
      ['ram-type', 'DDR5'],
    ];
    for (const o of optData) optWs.addRow(o);

    // Product Types
    const ptWs = wb.addWorksheet('Product Types');
    ptWs.addRow(['Code', 'Name']);
    ptWs.addRow(['business-laptop', 'Business Laptop']);
    ptWs.addRow(['gaming-laptop', 'Gaming Laptop']);

    // Product Type Attributes
    const ptaWs = wb.addWorksheet('Product Type Attributes');
    ptaWs.addRow(['Product Type Code', 'Attribute Code']);
    const ptaData = [
      ['business-laptop', 'resolution'],
      ['business-laptop', 'cpu-model'],
      ['business-laptop', 'ram-type'],
      ['business-laptop', 'ram-gb'],
      ['gaming-laptop', 'resolution'],
      ['gaming-laptop', 'panel-type'],
      ['gaming-laptop', 'refresh-rate-hz'],
      ['gaming-laptop', 'cpu-model'],
    ];
    for (const p of ptaData) ptaWs.addRow(p);

    // Products
    const prodWs = wb.addWorksheet('Products');
    prodWs.addRow(['Slug', 'Title', 'Brand Slug', 'Product Type Code', 'Category Slug']);
    prodWs.addRow(['latitude-5550', 'Latitude 5550', 'dell', 'business-laptop', 'laptops']);
    prodWs.addRow(['thinkpad-t14', 'ThinkPad T14', 'lenovo', 'business-laptop', 'laptops']);

    // Product Attributes
    const paWs = wb.addWorksheet('Product Attributes');
    paWs.addRow(['Product Slug', 'Attribute Code', 'Value Text']);
    paWs.addRow(['latitude-5550', 'resolution', '1920x1080']);
    paWs.addRow(['latitude-5550', 'cpu-model', 'Intel Core i5-1335U']);
    paWs.addRow(['thinkpad-t14', 'resolution', '2560x1440']);

    // Variants
    const varWs = wb.addWorksheet('Variants');
    varWs.addRow(['Product Slug', 'SKU']);
    varWs.addRow(['latitude-5550', 'LAT-5550-I5-16']);
    varWs.addRow(['latitude-5550', 'LAT-5550-I7-32']);
    varWs.addRow(['thinkpad-t14', 'TP-T14-I5-16']);

    // Variant Attributes
    const vaWs = wb.addWorksheet('Variant Attributes');
    vaWs.addRow(['Variant SKU', 'Attribute Code', 'Value Text']);
    vaWs.addRow(['LAT-5550-I5-16', 'cpu-model', 'Intel Core i5-1335U']);
    vaWs.addRow(['LAT-5550-I5-16', 'ram-type', 'DDR5']);
    vaWs.addRow(['LAT-5550-I5-16', 'ram-gb', '16']);
    vaWs.addRow(['LAT-5550-I7-32', 'cpu-model', 'Intel Core i7-1355U']);
    vaWs.addRow(['LAT-5550-I7-32', 'ram-type', 'DDR5']);
    vaWs.addRow(['LAT-5550-I7-32', 'ram-gb', '32']);
    vaWs.addRow(['TP-T14-I5-16', 'cpu-model', 'Intel Core i5-1335U']);
    vaWs.addRow(['TP-T14-I5-16', 'ram-type', 'DDR4']);
    vaWs.addRow(['TP-T14-I5-16', 'ram-gb', '16']);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    // Parse
    const workbook = await parser.parse(buf, 'real-catalog.xlsx');
    expect(workbook.sheets.size).toBe(10); // all entity sheets (no Sources)

    // Validate with empty DB (fresh import)
    const snapshot: ExistingDataSnapshot = {
      categorySlugs: [],
      brandSlugs: [],
      attributeMap: [],
      productTypeCodes: [],
      productSlugs: [],
      variantSkus: [],
    };
    const errors = validator.validate(workbook, snapshot);
    const hardErrors = errors.filter(e => e.severity === 'ERROR');

    // Zero errors — all cross-sheet references resolve correctly
    expect(hardErrors).toHaveLength(0);

    // Also verify specific attributes that were previously failing
    const attrRefErrors = errors.filter(
      e => e.errorCode === 'UNKNOWN_REFERENCE' && e.field === 'attribute_code',
    );
    expect(attrRefErrors).toHaveLength(0);

    // Plan (all CREATE since DB is empty)
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
    expect(plan.summary.totalCreate).toBeGreaterThan(0);
    expect(plan.attributes.length).toBe(attrDefs.length);
    expect(plan.attributeOptions.length).toBe(optData.length);
  });
});

function emptyExisting(): ExistingEntityMap {
  return {
    categories: new Map(),
    brands: new Map(),
    products: new Map(),
  };
}
