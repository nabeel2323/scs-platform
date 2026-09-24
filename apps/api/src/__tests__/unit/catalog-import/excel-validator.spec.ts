/**
 * Unit tests — ExcelValidatorService data validation against catalog rules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelValidatorService, type ExistingDataSnapshot } from '../../../modules/catalog-import/excel-validator.service';
import { CatalogValidationService } from '../../../modules/catalog/catalog.validation-service';
import type { ParsedWorkbook, ParsedSheet } from '../../../modules/catalog-import/excel-parser.service';

function makeSheet(name: string, entityType: string, headers: string[], rows: Record<string, string | null>[]): ParsedSheet {
  return { name, entityType, headers, rows, rowCount: rows.length };
}

function makeWorkbook(sheets: Map<string, ParsedSheet>): ParsedWorkbook {
  return { sheets, hasReadme: false, sheetNames: [...sheets.keys()] };
}

function emptySnapshot(): ExistingDataSnapshot {
  return {
    categorySlugs: [],
    brandSlugs: [],
    attributeMap: [],
    productTypeCodes: [],
    productSlugs: [],
    variantSkus: [],
  };
}

describe('ExcelValidatorService', () => {
  let validator: ExcelValidatorService;
  let validationService: CatalogValidationService;

  beforeEach(() => {
    validationService = new CatalogValidationService();
    validator = new ExcelValidatorService(validationService);
  });

  describe('header validation', () => {
    it('reports missing required headers', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug'], [
        { slug: 'laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'MISSING_HEADER' && e.field === 'name')).toBe(true);
    });

    it('passes when all required headers present', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('brands', makeSheet('Brands', 'brands', ['slug', 'name'], [
        { slug: 'dell', name: 'Dell', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.filter(e => e.errorCode === 'MISSING_HEADER')).toHaveLength(0);
    });
  });

  describe('category validation', () => {
    it('detects duplicate category slugs', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Laptops', __row_number: '2' },
        { slug: 'laptops', name: 'Laptops 2', __row_number: '3' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'DUPLICATE_KEY')).toBe(true);
    });

    it('detects invalid slug format', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'Invalid Slug', name: 'Bad', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'INVALID_FORMAT')).toBe(true);
    });

    it('detects missing slug value', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: '', name: 'No Slug', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'MISSING_VALUE')).toBe(true);
    });
  });

  describe('brand validation', () => {
    it('detects duplicate brand slugs', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('brands', makeSheet('Brands', 'brands', ['slug', 'name'], [
        { slug: 'dell', name: 'Dell', __row_number: '2' },
        { slug: 'dell', name: 'Dell Again', __row_number: '3' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'DUPLICATE_KEY' && e.entityType === 'brands')).toBe(true);
    });
  });

  describe('attribute validation', () => {
    it('rejects invalid attribute type', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'ram', name: 'RAM', type: 'INVALID_TYPE', scope: 'PRODUCT', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'INVALID_VALUE' && e.field === 'type')).toBe(true);
    });

    it('rejects invalid attribute scope', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'ram', name: 'RAM', type: 'INTEGER', scope: 'INVALID', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'INVALID_VALUE' && e.field === 'scope')).toBe(true);
    });
  });

  describe('product validation', () => {
    it('detects unknown brand reference', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug'], [
        { slug: 'lat-5450', title: 'Latitude 5450', brand_slug: 'nonexistent', product_type_code: 'laptop', category_slug: 'laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e => e.errorCode === 'UNKNOWN_REFERENCE' && e.field === 'brand_slug')).toBe(true);
    });

    it('detects invalid GTIN format', () => {
      const snapshot = emptySnapshot();
      snapshot.brandSlugs = ['dell'];
      snapshot.productTypeCodes = ['laptop'];
      snapshot.categorySlugs = ['laptops'];

      const sheets = new Map<string, ParsedSheet>();
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug', 'gtin'], [
        { slug: 'lat-5450', title: 'Latitude 5450', brand_slug: 'dell', product_type_code: 'laptop', category_slug: 'laptops', gtin: 'abc', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, snapshot);
      expect(errors.some(e => e.errorCode === 'INVALID_FORMAT' && e.field === 'gtin')).toBe(true);
    });
  });

  describe('variant validation', () => {
    it('detects duplicate SKUs', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('variants', makeSheet('Variants', 'variants', ['product_slug', 'sku'], [
        { product_slug: 'lat-5450', sku: 'SKU-001', __row_number: '2' },
        { product_slug: 'lat-5450', sku: 'SKU-001', __row_number: '3' },
      ]));
      // Need the product slug to be known
      const snapshot = emptySnapshot();
      snapshot.productSlugs = ['lat-5450'];
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, snapshot);
      expect(errors.some(e => e.errorCode === 'DUPLICATE_KEY' && e.entityType === 'variants')).toBe(true);
    });
  });

  describe('source validation', () => {
    it('rejects invalid source type', () => {
      const snapshot = emptySnapshot();
      snapshot.productSlugs = ['lat-5450'];

      const sheets = new Map<string, ParsedSheet>();
      sheets.set('sources', makeSheet('Sources', 'sources', ['product_slug', 'source_type', 'source_url'], [
        { product_slug: 'lat-5450', source_type: 'INVALID', source_url: 'https://example.com', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, snapshot);
      expect(errors.some(e => e.errorCode === 'INVALID_VALUE' && e.field === 'source_type')).toBe(true);
    });
  });
});
