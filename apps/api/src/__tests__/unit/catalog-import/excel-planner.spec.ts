/**
 * Unit tests — ExcelPlannerService import plan generation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelPlannerService, type ExistingEntityMap } from '../../../modules/catalog-import/excel-planner.service';
import type { ParsedWorkbook, ParsedSheet } from '../../../modules/catalog-import/excel-parser.service';
import type { ResolvedReferences } from '../../../modules/catalog-import/excel-resolver.service';

function makeSheet(name: string, entityType: string, headers: string[], rows: Record<string, string | null>[]): ParsedSheet {
  return { name, entityType, headers, rows, rowCount: rows.length };
}

function makeWorkbook(sheets: Map<string, ParsedSheet>): ParsedWorkbook {
  return { sheets, hasReadme: false, sheetNames: [...sheets.keys()] };
}

function emptyRefs(): ResolvedReferences {
  return {
    brandIds: new Map(),
    categoryIds: new Map(),
    attributeIds: new Map(),
    attributeOptions: new Map(),
    productTypeIds: new Map(),
    productIds: new Map(),
    variantIds: new Map(),
    attributeTypes: new Map(),
  };
}

function emptyExisting(): ExistingEntityMap {
  return {
    categories: new Map(),
    brands: new Map(),
    products: new Map(),
  };
}

describe('ExcelPlannerService', () => {
  let planner: ExcelPlannerService;

  beforeEach(() => { planner = new ExcelPlannerService(); });

  describe('category planning', () => {
    it('marks new categories as CREATE', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const refs = emptyRefs();
      const plan = planner.buildPlan(wb, refs, emptyExisting());

      expect(plan.categories).toHaveLength(1);
      expect(plan.categories[0]!.action).toBe('CREATE');
      expect(plan.categories[0]!.externalKey).toBe('laptops');
      expect(plan.summary.totalCreate).toBe(1);
    });

    it('marks existing unchanged categories as UNCHANGED', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const refs = emptyRefs();
      refs.categoryIds.set('laptops', 'existing-uuid');
      const existing = emptyExisting();
      existing.categories.set('laptops', { name: 'Laptops' });

      const plan = planner.buildPlan(wb, refs, existing);
      expect(plan.categories[0]!.action).toBe('UNCHANGED');
      expect(plan.summary.totalUnchanged).toBe(1);
    });

    it('marks existing changed categories as UPDATE', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Gaming Laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const refs = emptyRefs();
      refs.categoryIds.set('laptops', 'existing-uuid');
      const existing = emptyExisting();
      existing.categories.set('laptops', { name: 'Laptops' });

      const plan = planner.buildPlan(wb, refs, existing);
      expect(plan.categories[0]!.action).toBe('UPDATE');
      expect(plan.summary.totalUpdate).toBe(1);
    });
  });

  describe('brand planning', () => {
    it('marks new brands as CREATE', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('brands', makeSheet('Brands', 'brands', ['slug', 'name'], [
        { slug: 'dell', name: 'Dell', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const plan = planner.buildPlan(wb, emptyRefs(), emptyExisting());

      expect(plan.brands).toHaveLength(1);
      expect(plan.brands[0]!.action).toBe('CREATE');
    });
  });

  describe('product planning', () => {
    it('marks new products as CREATE with correct data', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug'], [
        { slug: 'lat-5450', title: 'Latitude 5450', brand_slug: 'dell', product_type_code: 'laptop', category_slug: 'laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const plan = planner.buildPlan(wb, emptyRefs(), emptyExisting());

      expect(plan.products).toHaveLength(1);
      expect(plan.products[0]!.action).toBe('CREATE');
      expect(plan.products[0]!.data['title']).toBe('Latitude 5450');
      expect(plan.products[0]!.data['brandSlug']).toBe('dell');
    });
  });

  describe('variant planning', () => {
    it('marks new variants as CREATE', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('variants', makeSheet('Variants', 'variants', ['product_slug', 'sku'], [
        { product_slug: 'lat-5450', sku: 'SKU-001', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const plan = planner.buildPlan(wb, emptyRefs(), emptyExisting());

      expect(plan.variants).toHaveLength(1);
      expect(plan.variants[0]!.action).toBe('CREATE');
      expect(plan.variants[0]!.data['sku']).toBe('SKU-001');
    });
  });

  describe('summary computation', () => {
    it('computes correct summary across entity types', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('brands', makeSheet('Brands', 'brands', ['slug', 'name'], [
        { slug: 'dell', name: 'Dell', __row_number: '2' },
        { slug: 'hp', name: 'HP', __row_number: '3' },
      ]));
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);

      const refs = emptyRefs();
      refs.brandIds.set('dell', 'existing-dell');
      const existing = emptyExisting();
      existing.brands.set('dell', { name: 'Dell' });

      const plan = planner.buildPlan(wb, refs, existing);

      // Dell is UNCHANGED, HP is CREATE, Laptops is CREATE
      expect(plan.summary.totalCreate).toBe(2);
      expect(plan.summary.totalUnchanged).toBe(1);
      expect(plan.summary.byEntity['brands']!.create).toBe(1);
      expect(plan.summary.byEntity['brands']!.unchanged).toBe(1);
      expect(plan.summary.byEntity['categories']!.create).toBe(1);
    });
  });

  describe('attribute option planning', () => {
    it('marks new options as CREATE', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attribute_options', makeSheet('Attribute Options', 'attribute_options', ['attribute_code', 'value'], [
        { attribute_code: 'cpu-brand', value: 'Intel', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const plan = planner.buildPlan(wb, emptyRefs(), emptyExisting());

      expect(plan.attributeOptions).toHaveLength(1);
      expect(plan.attributeOptions[0]!.action).toBe('CREATE');
    });
  });
});
