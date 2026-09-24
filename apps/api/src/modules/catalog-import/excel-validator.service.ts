import { Injectable, Logger } from '@nestjs/common';
import { CatalogValidationService, type AttributeValueType } from '../catalog/catalog.validation-service';
import type { ParsedWorkbook, ParsedSheet } from './excel-parser.service';

/**
 * Validates parsed Excel data against catalog business rules.
 *
 * Checks:
 * - Required headers per entity type
 * - Data type correctness (uses shared CatalogValidationService)
 * - Cross-sheet reference integrity (brand_key, category_key, etc.)
 * - Duplicate keys within the file
 * - Variant uniqueness
 * - Required attribute completeness per product type
 */

export interface ImportError {
  sheet: string;
  rowNumber: number;
  entityType: string;
  externalKey: string | null;
  field: string | null;
  errorCode: string;
  errorMessage: string;
  rawValue: string | null;
  suggestedFix: string | null;
  severity: 'ERROR' | 'WARNING';
}

/** Required headers for each entity sheet. */
const REQUIRED_HEADERS: Record<string, string[]> = {
  categories: ['slug', 'name'],
  brands: ['slug', 'name'],
  attribute_groups: ['name'],
  attributes: ['code', 'name', 'type', 'scope'],
  attribute_options: ['attribute_code', 'value'],
  product_types: ['code', 'name'],
  product_type_attributes: ['product_type_code', 'attribute_code'],
  products: ['slug', 'title', 'brand_slug', 'product_type_code', 'category_slug'],
  product_attributes: ['product_slug', 'attribute_code'],
  variants: ['product_slug', 'sku'],
  variant_attributes: ['variant_sku', 'attribute_code'],
  sources: ['product_slug', 'source_type', 'source_url'],
};

/** Headers that are valid but optional (reference — not enforced). */
const _OPTIONAL_HEADERS: Record<string, string[]> = {
  categories: ['name_ar', 'description', 'parent_slug', 'sort_order'],
  brands: ['name_ar', 'description'],
  attribute_groups: ['name_ar', 'kind'],
  attributes: ['name_ar', 'description', 'unit', 'validation'],
  attribute_options: ['value_ar', 'label', 'sort_order'],
  product_types: ['name_ar', 'description', 'category_slug', 'variant_dimensions'],
  product_type_attributes: ['group_name', 'required', 'scope', 'display_order', 'filterable', 'searchable', 'visible_in_listing', 'visible_in_detail'],
  products: ['title_ar', 'description', 'description_ar', 'mpn', 'gtin', 'ean', 'condition', 'status', 'source_key', 'source_url', 'verification_date'],
  product_attributes: ['value_text', 'value_number', 'value_boolean', 'option_key'],
  variants: ['title', 'title_ar', 'barcode', 'unit', 'weight_grams'],
  variant_attributes: ['value_text', 'value_number', 'value_boolean', 'option_key'],
  sources: ['verified_at'],
};

@Injectable()
export class ExcelValidatorService {
  private readonly logger = new Logger(ExcelValidatorService.name);

  constructor(private readonly validationService: CatalogValidationService) {}

  /**
   * Validate a parsed workbook against catalog rules.
   * Returns all errors and warnings found.
   */
  validate(workbook: ParsedWorkbook, existingData: ExistingDataSnapshot): ImportError[] {
    const errors: ImportError[] = [];

    // Validate each sheet's headers
    for (const [entityType, sheet] of workbook.sheets) {
      this.validateHeaders(sheet, entityType, errors);
    }

    // Validate categories — workbook categories become available for
    // downstream cross-references (product category_slug, etc.)
    const catSheet = workbook.sheets.get('categories');
    const catSlugs = new Set<string>(existingData.categorySlugs);
    if (catSheet) {
      this.validateCategories(catSheet, catSlugs, errors);
      for (const row of catSheet.rows) {
        const slug = row['slug'];
        if (slug) catSlugs.add(slug);
      }
    }

    // Validate brands — workbook brands become available for products
    const brandSheet = workbook.sheets.get('brands');
    const brandSlugs = new Set<string>(existingData.brandSlugs);
    if (brandSheet) {
      this.validateBrands(brandSheet, brandSlugs, errors);
      for (const row of brandSheet.rows) {
        const slug = row['slug'];
        if (slug) brandSlugs.add(slug);
      }
    }

    // Validate attributes — workbook attributes become available for
    // attribute options, product type attributes, product/variant attributes
    const attrSheet = workbook.sheets.get('attributes');
    const attrCodes = new Map<string, { type: string; options: Set<string> }>(existingData.attributeMap);
    if (attrSheet) {
      this.validateAttributes(attrSheet, attrCodes, errors);
      // Register validated workbook attributes for downstream lookups
      for (const row of attrSheet.rows) {
        const code = row['code'];
        const type = row['type'] ?? 'TEXT';
        if (code && !attrCodes.has(code)) {
          attrCodes.set(code, { type, options: new Set() });
        }
      }
    }

    // Validate attribute options (needs attrCodes from above)
    const optSheet = workbook.sheets.get('attribute_options');
    if (optSheet) {
      this.validateAttributeOptions(optSheet, attrCodes, errors);
      // Register option values so typed-value validation can check them
      for (const row of optSheet.rows) {
        const ac = row['attribute_code'];
        const val = row['value'];
        if (ac && val) {
          const entry = attrCodes.get(ac);
          if (entry) entry.options.add(val);
        }
      }
    }

    // Validate product types — workbook product types become available
    // for product type attributes and products
    const ptSheet = workbook.sheets.get('product_types');
    const ptCodes = new Set<string>(existingData.productTypeCodes);
    if (ptSheet) {
      this.validateProductTypes(ptSheet, ptCodes, catSlugs, errors);
      for (const row of ptSheet.rows) {
        const code = row['code'];
        if (code) ptCodes.add(code);
      }
    }

    // Validate product type attributes
    const ptaSheet = workbook.sheets.get('product_type_attributes');
    if (ptaSheet) {
      this.validateProductTypeAttributes(ptaSheet, ptCodes, attrCodes, errors);
    }

    // Validate products (needs brandSlugs, catSlugs, ptCodes — all populated)
    const prodSheet = workbook.sheets.get('products');
    const prodSlugs = new Set<string>(existingData.productSlugs);
    if (prodSheet) {
      this.validateProducts(prodSheet, prodSlugs, brandSlugs, catSlugs, ptCodes, errors);
      for (const row of prodSheet.rows) {
        const slug = row['slug'];
        if (slug) prodSlugs.add(slug);
      }
    }

    // Validate product attributes
    const paSheet = workbook.sheets.get('product_attributes');
    if (paSheet) {
      this.validateProductAttributes(paSheet, prodSlugs, attrCodes, errors);
    }

    // Validate variants (needs prodSlugs)
    const varSheet = workbook.sheets.get('variants');
    const variantSkus = new Set<string>(existingData.variantSkus);
    if (varSheet) {
      this.validateVariants(varSheet, prodSlugs, variantSkus, errors);
      for (const row of varSheet.rows) {
        const sku = row['sku'];
        if (sku) variantSkus.add(sku);
      }
    }

    // Validate variant attributes
    const vaSheet = workbook.sheets.get('variant_attributes');
    if (vaSheet) {
      this.validateVariantAttributes(vaSheet, variantSkus, attrCodes, errors);
    }

    // Validate sources
    const srcSheet = workbook.sheets.get('sources');
    if (srcSheet) {
      this.validateSources(srcSheet, prodSlugs, errors);
    }

    return errors;
  }

  private validateHeaders(sheet: ParsedSheet, entityType: string, errors: ImportError[]): void {
    const required = REQUIRED_HEADERS[entityType] ?? [];
    const headerSet = new Set(sheet.headers);

    for (const h of required) {
      if (!headerSet.has(h)) {
        errors.push({
          sheet: sheet.name,
          rowNumber: 1,
          entityType,
          externalKey: null,
          field: h,
          errorCode: 'MISSING_HEADER',
          errorMessage: `Required column "${h}" is missing from sheet "${sheet.name}"`,
          rawValue: null,
          suggestedFix: `Add a "${h}" column to the ${sheet.name} sheet`,
          severity: 'ERROR',
        });
      }
    }
  }

  private validateCategories(sheet: ParsedSheet, existingSlugs: Set<string>, errors: ImportError[]): void {
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const slug = row['slug'] ?? '';
      const name = row['name'] ?? '';

      if (!slug) {
        errors.push(this.err(sheet.name, rn, 'categories', null, 'slug', 'MISSING_VALUE', 'Category slug is required', null, null));
        continue;
      }

      const slugCheck = this.validationService.validateSlug(slug);
      if (!slugCheck.valid) {
        errors.push(this.err(sheet.name, rn, 'categories', slug, 'slug', 'INVALID_FORMAT', slugCheck.error!, slug, null));
      }

      if (!name) {
        errors.push(this.err(sheet.name, rn, 'categories', slug, 'name', 'MISSING_VALUE', 'Category name is required', null, null));
      }

      if (seen.has(slug)) {
        errors.push(this.err(sheet.name, rn, 'categories', slug, 'slug', 'DUPLICATE_KEY', `Duplicate category slug "${slug}"`, slug, 'Each category must have a unique slug'));
      }
      seen.add(slug);

      // Parent reference
      const parentSlug = row['parent_slug'];
      if (parentSlug && !seen.has(parentSlug)) {
        errors.push(this.err(sheet.name, rn, 'categories', slug, 'parent_slug', 'UNKNOWN_REFERENCE', `Parent category "${parentSlug}" not found`, parentSlug, 'Add the parent category first or use an existing category slug'));
      }
    }
  }

  private validateBrands(sheet: ParsedSheet, existingSlugs: Set<string>, errors: ImportError[]): void {
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const slug = row['slug'] ?? '';
      const name = row['name'] ?? '';

      if (!slug) {
        errors.push(this.err(sheet.name, rn, 'brands', null, 'slug', 'MISSING_VALUE', 'Brand slug is required', null, null));
        continue;
      }

      const slugCheck = this.validationService.validateSlug(slug);
      if (!slugCheck.valid) {
        errors.push(this.err(sheet.name, rn, 'brands', slug, 'slug', 'INVALID_FORMAT', slugCheck.error!, slug, null));
      }

      if (!name) {
        errors.push(this.err(sheet.name, rn, 'brands', slug, 'name', 'MISSING_VALUE', 'Brand name is required', null, null));
      }

      if (seen.has(slug)) {
        errors.push(this.err(sheet.name, rn, 'brands', slug, 'slug', 'DUPLICATE_KEY', `Duplicate brand slug "${slug}"`, slug, 'Each brand must have a unique slug'));
      }
      seen.add(slug);
    }
  }

  private validateAttributes(sheet: ParsedSheet, existingAttrs: Map<string, { type: string; options: Set<string> }>, errors: ImportError[]): void {
    const validTypes = new Set(['TEXT', 'LONG_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT', 'COLOR', 'URL', 'FILE', 'MEASUREMENT', 'CURRENCY']);
    const validScopes = new Set(['PRODUCT', 'VARIANT', 'OFFER']);
    const seen = new Set<string>();

    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const code = row['code'] ?? '';
      const type = row['type'] ?? '';
      const scope = row['scope'] ?? 'PRODUCT';

      if (!code) {
        errors.push(this.err(sheet.name, rn, 'attributes', null, 'code', 'MISSING_VALUE', 'Attribute code is required', null, null));
        continue;
      }

      const codeCheck = this.validationService.validateCode(code);
      if (!codeCheck.valid) {
        errors.push(this.err(sheet.name, rn, 'attributes', code, 'code', 'INVALID_FORMAT', codeCheck.error!, code, null));
      }

      if (!validTypes.has(type)) {
        errors.push(this.err(sheet.name, rn, 'attributes', code, 'type', 'INVALID_VALUE', `Invalid attribute type "${type}"`, type, `Allowed: ${[...validTypes].join(', ')}`));
      }

      if (!validScopes.has(scope)) {
        errors.push(this.err(sheet.name, rn, 'attributes', code, 'scope', 'INVALID_VALUE', `Invalid attribute scope "${scope}"`, scope, 'Allowed: PRODUCT, VARIANT, OFFER'));
      }

      if (seen.has(code)) {
        errors.push(this.err(sheet.name, rn, 'attributes', code, 'code', 'DUPLICATE_KEY', `Duplicate attribute code "${code}"`, code, 'Each attribute must have a unique code'));
      }
      seen.add(code);
    }
  }

  private validateAttributeOptions(sheet: ParsedSheet, attrCodes: Map<string, { type: string; options: Set<string> }>, errors: ImportError[]): void {
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const attrCode = row['attribute_code'] ?? '';
      const value = row['value'] ?? '';

      if (!attrCode) {
        errors.push(this.err(sheet.name, rn, 'attribute_options', null, 'attribute_code', 'MISSING_VALUE', 'Attribute code is required', null, null));
        continue;
      }
      if (!value) {
        errors.push(this.err(sheet.name, rn, 'attribute_options', attrCode, 'value', 'MISSING_VALUE', 'Option value is required', null, null));
        continue;
      }

      const attr = attrCodes.get(attrCode);
      if (!attr) {
        errors.push(this.err(sheet.name, rn, 'attribute_options', attrCode, 'attribute_code', 'UNKNOWN_REFERENCE', `Attribute "${attrCode}" not found`, attrCode, 'Add the attribute first or use an existing attribute code'));
      }
    }
  }

  private validateProductTypes(sheet: ParsedSheet, ptCodes: Set<string>, catSlugs: Set<string>, errors: ImportError[]): void {
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const code = row['code'] ?? '';
      const name = row['name'] ?? '';
      const catSlug = row['category_slug'];

      if (!code) {
        errors.push(this.err(sheet.name, rn, 'product_types', null, 'code', 'MISSING_VALUE', 'Product type code is required', null, null));
        continue;
      }
      if (!name) {
        errors.push(this.err(sheet.name, rn, 'product_types', code, 'name', 'MISSING_VALUE', 'Product type name is required', null, null));
      }
      if (seen.has(code)) {
        errors.push(this.err(sheet.name, rn, 'product_types', code, 'code', 'DUPLICATE_KEY', `Duplicate product type code "${code}"`, code, null));
      }
      seen.add(code);

      if (catSlug && !catSlugs.has(catSlug)) {
        errors.push(this.err(sheet.name, rn, 'product_types', code, 'category_slug', 'UNKNOWN_REFERENCE', `Category "${catSlug}" not found`, catSlug, null));
      }
    }
  }

  private validateProductTypeAttributes(sheet: ParsedSheet, ptCodes: Set<string>, attrCodes: Map<string, { type: string; options: Set<string> }>, errors: ImportError[]): void {
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const ptCode = row['product_type_code'] ?? '';
      const attrCode = row['attribute_code'] ?? '';

      if (!ptCode || !ptCodes.has(ptCode)) {
        errors.push(this.err(sheet.name, rn, 'product_type_attributes', null, 'product_type_code', 'UNKNOWN_REFERENCE', `Product type "${ptCode}" not found`, ptCode, null));
      }
      if (!attrCode || !attrCodes.has(attrCode)) {
        errors.push(this.err(sheet.name, rn, 'product_type_attributes', ptCode, 'attribute_code', 'UNKNOWN_REFERENCE', `Attribute "${attrCode}" not found`, attrCode, null));
      }
    }
  }

  private validateProducts(sheet: ParsedSheet, prodSlugs: Set<string>, brandSlugs: Set<string>, catSlugs: Set<string>, ptCodes: Set<string>, errors: ImportError[]): void {
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const slug = row['slug'] ?? '';
      const title = row['title'] ?? '';
      const brandSlug = row['brand_slug'] ?? '';
      const ptCode = row['product_type_code'] ?? '';
      const catSlug = row['category_slug'] ?? '';

      if (!slug) {
        errors.push(this.err(sheet.name, rn, 'products', null, 'slug', 'MISSING_VALUE', 'Product slug is required', null, null));
        continue;
      }

      const slugCheck = this.validationService.validateSlug(slug);
      if (!slugCheck.valid) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'slug', 'INVALID_FORMAT', slugCheck.error!, slug, null));
      }

      if (!title) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'title', 'MISSING_VALUE', 'Product title is required', null, null));
      }

      if (!brandSlug || !brandSlugs.has(brandSlug)) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'brand_slug', 'UNKNOWN_REFERENCE', `Brand "${brandSlug}" not found`, brandSlug, 'Add the brand first or use an existing brand slug'));
      }

      if (!catSlug || !catSlugs.has(catSlug)) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'category_slug', 'UNKNOWN_REFERENCE', `Category "${catSlug}" not found`, catSlug, null));
      }

      if (!ptCode || !ptCodes.has(ptCode)) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'product_type_code', 'UNKNOWN_REFERENCE', `Product type "${ptCode}" not found`, ptCode, null));
      }

      if (seen.has(slug)) {
        errors.push(this.err(sheet.name, rn, 'products', slug, 'slug', 'DUPLICATE_KEY', `Duplicate product slug "${slug}"`, slug, null));
      }
      seen.add(slug);

      // GTIN/EAN format
      const gtin = row['gtin'];
      if (gtin) {
        const check = this.validationService.validateGtin(gtin);
        if (!check.valid) {
          errors.push(this.err(sheet.name, rn, 'products', slug, 'gtin', 'INVALID_FORMAT', check.error!, gtin, null));
        }
      }
      const ean = row['ean'];
      if (ean) {
        const check = this.validationService.validateEan(ean);
        if (!check.valid) {
          errors.push(this.err(sheet.name, rn, 'products', slug, 'ean', 'INVALID_FORMAT', check.error!, ean, null));
        }
      }
    }
  }

  private validateProductAttributes(sheet: ParsedSheet, prodSlugs: Set<string>, attrCodes: Map<string, { type: string; options: Set<string> }>, errors: ImportError[]): void {
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const prodSlug = row['product_slug'] ?? '';
      const attrCode = row['attribute_code'] ?? '';

      if (!prodSlug || !prodSlugs.has(prodSlug)) {
        errors.push(this.err(sheet.name, rn, 'product_attributes', null, 'product_slug', 'UNKNOWN_REFERENCE', `Product "${prodSlug}" not found`, prodSlug, null));
      }

      const attr = attrCodes.get(attrCode);
      if (!attr) {
        errors.push(this.err(sheet.name, rn, 'product_attributes', prodSlug, 'attribute_code', 'UNKNOWN_REFERENCE', `Attribute "${attrCode}" not found`, attrCode, null));
        continue;
      }

      // Validate the value matches the attribute type
      this.validateTypedValue(sheet.name, rn, 'product_attributes', prodSlug, attrCode, attr.type, attr.options, row, errors);
    }
  }

  private validateVariants(sheet: ParsedSheet, prodSlugs: Set<string>, variantSkus: Set<string>, errors: ImportError[]): void {
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const prodSlug = row['product_slug'] ?? '';
      const sku = row['sku'] ?? '';

      if (!prodSlug || !prodSlugs.has(prodSlug)) {
        errors.push(this.err(sheet.name, rn, 'variants', null, 'product_slug', 'UNKNOWN_REFERENCE', `Product "${prodSlug}" not found`, prodSlug, null));
      }
      if (!sku) {
        errors.push(this.err(sheet.name, rn, 'variants', prodSlug, 'sku', 'MISSING_VALUE', 'Variant SKU is required', null, null));
        continue;
      }
      if (seen.has(sku)) {
        errors.push(this.err(sheet.name, rn, 'variants', sku, 'sku', 'DUPLICATE_KEY', `Duplicate SKU "${sku}"`, sku, null));
      }
      seen.add(sku);
    }
  }

  private validateVariantAttributes(sheet: ParsedSheet, variantSkus: Set<string>, attrCodes: Map<string, { type: string; options: Set<string> }>, errors: ImportError[]): void {
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const varSku = row['variant_sku'] ?? '';
      const attrCode = row['attribute_code'] ?? '';

      if (!varSku || !variantSkus.has(varSku)) {
        errors.push(this.err(sheet.name, rn, 'variant_attributes', null, 'variant_sku', 'UNKNOWN_REFERENCE', `Variant "${varSku}" not found`, varSku, null));
      }

      const attr = attrCodes.get(attrCode);
      if (!attr) {
        errors.push(this.err(sheet.name, rn, 'variant_attributes', varSku, 'attribute_code', 'UNKNOWN_REFERENCE', `Attribute "${attrCode}" not found`, attrCode, null));
        continue;
      }

      this.validateTypedValue(sheet.name, rn, 'variant_attributes', varSku, attrCode, attr.type, attr.options, row, errors);
    }
  }

  private validateSources(sheet: ParsedSheet, prodSlugs: Set<string>, errors: ImportError[]): void {
    const validSourceTypes = new Set(['MANUFACTURER', 'DISTRIBUTOR', 'MANUAL', 'API', 'IMPORT']);
    for (const row of sheet.rows) {
      const rn = Number(row['__row_number'] ?? 0);
      const prodSlug = row['product_slug'] ?? '';
      const sourceType = row['source_type'] ?? '';
      const sourceUrl = row['source_url'] ?? '';

      if (!prodSlug || !prodSlugs.has(prodSlug)) {
        errors.push(this.err(sheet.name, rn, 'sources', null, 'product_slug', 'UNKNOWN_REFERENCE', `Product "${prodSlug}" not found`, prodSlug, null));
      }
      if (!sourceType || !validSourceTypes.has(sourceType)) {
        errors.push(this.err(sheet.name, rn, 'sources', prodSlug, 'source_type', 'INVALID_VALUE', `Invalid source type "${sourceType}"`, sourceType, `Allowed: ${[...validSourceTypes].join(', ')}`));
      }
      if (!sourceUrl) {
        errors.push(this.err(sheet.name, rn, 'sources', prodSlug, 'source_url', 'MISSING_VALUE', 'Source URL is required', null, null));
      }
    }
  }

  private validateTypedValue(
    sheetName: string, rn: number, entityType: string, key: string,
    attrCode: string, attrType: string, allowedOptions: Set<string>,
    row: Record<string, string | null>, errors: ImportError[],
  ): void {
    const type = attrType as AttributeValueType;
    const value = {
      text: row['value_text'] ?? undefined,
      number: row['value_number'] ? Number(row['value_number']) : undefined,
      boolean: row['value_boolean'] !== undefined && row['value_boolean'] !== null ? row['value_boolean'] : undefined,
      option: row['option_key'] ?? undefined,
    };

    const result = this.validationService.validateAttributeValue(type, value, [...allowedOptions]);
    if (!result.valid) {
      const rawVal = row['value_text'] ?? row['value_number'] ?? row['value_boolean'] ?? row['option_key'] ?? null;
      errors.push(this.err(sheetName, rn, entityType, key, attrCode, 'INVALID_ATTRIBUTE_VALUE', result.error!, rawVal, null));
    }
  }

  private err(
    sheet: string, rowNumber: number, entityType: string, externalKey: string | null,
    field: string, errorCode: string, errorMessage: string, rawValue: string | null,
    suggestedFix: string | null, severity: 'ERROR' | 'WARNING' = 'ERROR',
  ): ImportError {
    return { sheet, rowNumber, entityType, externalKey, field, errorCode, errorMessage, rawValue, suggestedFix, severity };
  }
}

/** Snapshot of existing DB data for cross-reference validation. */
export interface ExistingDataSnapshot {
  categorySlugs: string[];
  brandSlugs: string[];
  attributeMap: Array<[string, { type: string; options: Set<string> }]>;
  productTypeCodes: string[];
  productSlugs: string[];
  variantSkus: string[];
}
