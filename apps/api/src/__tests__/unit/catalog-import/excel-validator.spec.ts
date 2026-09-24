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

  describe('cross-sheet attribute resolution', () => {
    it('should resolve Attribute Options against Attributes by Attribute Code', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'resolution', name: 'Resolution', type: 'SELECT', scope: 'PRODUCT', __row_number: '2' },
      ]));
      sheets.set('attribute_options', makeSheet('Attribute Options', 'attribute_options', ['attribute_code', 'value'], [
        { attribute_code: 'resolution', value: '1920x1080', __row_number: '2' },
        { attribute_code: 'resolution', value: '2560x1440', __row_number: '3' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      // No UNKNOWN_REFERENCE errors — "resolution" is defined in the Attributes sheet
      const refErrors = errors.filter(e => e.errorCode === 'UNKNOWN_REFERENCE' && e.field === 'attribute_code');
      expect(refErrors).toHaveLength(0);
    });

    it('still catches genuinely invalid attribute references', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'resolution', name: 'Resolution', type: 'SELECT', scope: 'PRODUCT', __row_number: '2' },
      ]));
      sheets.set('attribute_options', makeSheet('Attribute Options', 'attribute_options', ['attribute_code', 'value'], [
        { attribute_code: 'does-not-exist', value: 'some-value', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      expect(errors.some(e =>
        e.errorCode === 'UNKNOWN_REFERENCE' &&
        e.field === 'attribute_code' &&
        e.errorMessage?.includes('does-not-exist'),
      )).toBe(true);
    });
  });

  describe('full cross-sheet workbook validation', () => {
    it('validates a complete workbook with all entity types referencing each other', () => {
      const sheets = new Map<string, ParsedSheet>();

      // Categories
      sheets.set('categories', makeSheet('Categories', 'categories', ['slug', 'name'], [
        { slug: 'laptops', name: 'Laptops', __row_number: '2' },
      ]));

      // Brands
      sheets.set('brands', makeSheet('Brands', 'brands', ['slug', 'name'], [
        { slug: 'test-brand', name: 'Test Brand', __row_number: '2' },
      ]));

      // Attributes
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'resolution', name: 'Resolution', type: 'SELECT', scope: 'PRODUCT', __row_number: '2' },
        { code: 'cpu-model', name: 'CPU Model', type: 'SELECT', scope: 'PRODUCT', __row_number: '3' },
        { code: 'ram-type', name: 'RAM Type', type: 'SELECT', scope: 'PRODUCT', __row_number: '4' },
      ]));

      // Attribute Options
      sheets.set('attribute_options', makeSheet('Attribute Options', 'attribute_options', ['attribute_code', 'value'], [
        { attribute_code: 'resolution', value: '1920x1080', __row_number: '2' },
        { attribute_code: 'resolution', value: '2560x1440', __row_number: '3' },
        { attribute_code: 'cpu-model', value: 'Intel Core i5-1335U', __row_number: '4' },
        { attribute_code: 'ram-type', value: 'DDR5', __row_number: '5' },
      ]));

      // Product Types
      sheets.set('product_types', makeSheet('Product Types', 'product_types', ['code', 'name'], [
        { code: 'business-laptop', name: 'Business Laptop', __row_number: '2' },
      ]));

      // Product Type Attributes
      sheets.set('product_type_attributes', makeSheet('Product Type Attributes', 'product_type_attributes', ['product_type_code', 'attribute_code'], [
        { product_type_code: 'business-laptop', attribute_code: 'resolution', __row_number: '2' },
        { product_type_code: 'business-laptop', attribute_code: 'cpu-model', __row_number: '3' },
        { product_type_code: 'business-laptop', attribute_code: 'ram-type', __row_number: '4' },
      ]));

      // Products
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug'], [
        { slug: 'test-laptop', title: 'Test Laptop', brand_slug: 'test-brand', product_type_code: 'business-laptop', category_slug: 'laptops', __row_number: '2' },
      ]));

      // Product Attributes
      sheets.set('product_attributes', makeSheet('Product Attributes', 'product_attributes', ['product_slug', 'attribute_code', 'value_text'], [
        { product_slug: 'test-laptop', attribute_code: 'resolution', value_text: '1920x1080', __row_number: '2' },
      ]));

      // Variants
      sheets.set('variants', makeSheet('Variants', 'variants', ['product_slug', 'sku'], [
        { product_slug: 'test-laptop', sku: 'TEST-LAPTOP-I5', __row_number: '2' },
      ]));

      // Variant Attributes
      sheets.set('variant_attributes', makeSheet('Variant Attributes', 'variant_attributes', ['variant_sku', 'attribute_code', 'value_text'], [
        { variant_sku: 'TEST-LAPTOP-I5', attribute_code: 'cpu-model', value_text: 'Intel Core i5-1335U', __row_number: '2' },
        { variant_sku: 'TEST-LAPTOP-I5', attribute_code: 'ram-type', value_text: 'DDR5', __row_number: '3' },
      ]));

      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      const hardErrors = errors.filter(e => e.severity === 'ERROR');

      // Zero validation errors — all cross-sheet references resolve
      expect(hardErrors).toHaveLength(0);
    });
  });

  describe('column length validation', () => {
    it('reports VALUE_TOO_LONG when a field exceeds the database column limit', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'x'.repeat(81), name: 'Valid Name', type: 'TEXT', scope: 'PRODUCT', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      const tooLong = errors.filter(e => e.errorCode === 'VALUE_TOO_LONG');
      expect(tooLong.length).toBeGreaterThanOrEqual(1);
      const first = tooLong[0]!;
      expect(first.field).toBe('code');
      expect(first.errorMessage).toContain('81');
      expect(first.errorMessage).toContain('80');
      expect(first.suggestedFix).toContain('80');
    });

    it('reports VALUE_TOO_LONG for attribute type exceeding 40 chars', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'my-attr', name: 'My Attribute', type: 'A'.repeat(41), scope: 'PRODUCT', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      const tooLong = errors.filter(e => e.errorCode === 'VALUE_TOO_LONG' && e.field === 'type');
      expect(tooLong).toHaveLength(1);
      expect(tooLong[0]!.errorMessage).toContain('41');
      expect(tooLong[0]!.errorMessage).toContain('40');
    });

    it('reports VALUE_TOO_LONG for product gtin exceeding 20 chars', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug', 'gtin'], [
        { slug: 'test-product', title: 'Test', brand_slug: 'b', product_type_code: 'pt', category_slug: 'c', gtin: '1'.repeat(21), __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      const tooLong = errors.filter(e => e.errorCode === 'VALUE_TOO_LONG' && e.field === 'gtin');
      expect(tooLong).toHaveLength(1);
      expect(tooLong[0]!.errorMessage).toContain('21');
      expect(tooLong[0]!.errorMessage).toContain('20');
    });

    it('does not report VALUE_TOO_LONG when all fields are within limits', () => {
      const sheets = new Map<string, ParsedSheet>();
      sheets.set('attributes', makeSheet('Attributes', 'attributes', ['code', 'name', 'type', 'scope'], [
        { code: 'resolution', name: 'Resolution', type: 'SELECT', scope: 'PRODUCT', __row_number: '2' },
      ]));
      sheets.set('products', makeSheet('Products', 'products', ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug'], [
        { slug: 'test-product', title: 'Test Product', brand_slug: 'test-brand', product_type_code: 'laptop', category_slug: 'laptops', __row_number: '2' },
      ]));
      const wb = makeWorkbook(sheets);
      const errors = validator.validate(wb, emptySnapshot());
      const tooLong = errors.filter(e => e.errorCode === 'VALUE_TOO_LONG');
      expect(tooLong).toHaveLength(0);
    });
  });
});
