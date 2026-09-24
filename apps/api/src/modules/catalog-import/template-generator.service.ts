import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../common/database/database.service';
import { brands, categories, products, productVariants } from '../catalog/catalog.schema';
import {
  attributeDefinitions,
  attributeOptions,
  attributeGroups,
  productTypes,
  productTypeAttributes,
} from '../catalog/catalog.taxonomy.schema';
import { isNull, eq } from 'drizzle-orm';
import { CatalogValidationService } from '../catalog/catalog.validation-service';

/**
 * Generates downloadable Excel templates and full-catalog workbooks.
 *
 * Templates are dynamically built from the current DB state so that dropdown
 * validations always reflect the latest brands, categories, attributes, and
 * product types.
 */

/** Headers for each entity sheet. */
const SHEET_HEADERS: Record<string, string[]> = {
  Categories: ['slug', 'name', 'name_ar', 'description', 'parent_slug', 'sort_order'],
  Brands: ['slug', 'name', 'name_ar', 'description'],
  'Attribute Groups': ['name', 'name_ar', 'kind'],
  Attributes: ['code', 'name', 'name_ar', 'description', 'type', 'scope', 'unit', 'validation'],
  'Attribute Options': ['attribute_code', 'value', 'value_ar', 'label', 'sort_order'],
  'Product Types': ['code', 'name', 'name_ar', 'description', 'category_slug', 'variant_dimensions'],
  'Product Type Attributes': ['product_type_code', 'attribute_code', 'group_name', 'required', 'scope', 'display_order', 'filterable', 'searchable', 'visible_in_listing', 'visible_in_detail'],
  Products: ['slug', 'title', 'title_ar', 'description', 'description_ar', 'brand_slug', 'product_type_code', 'category_slug', 'mpn', 'gtin', 'ean', 'condition', 'status'],
  'Product Attributes': ['product_slug', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key'],
  Variants: ['product_slug', 'sku', 'title', 'title_ar', 'barcode', 'unit', 'weight_grams'],
  'Variant Attributes': ['variant_sku', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key'],
  Sources: ['product_slug', 'source_type', 'source_url', 'verified_at'],
};

/** Header style for template sheets. */
const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3340' } },
  alignment: { horizontal: 'left', vertical: 'middle' },
  border: {
    bottom: { style: 'thin', color: { argb: 'FF38BDF8' } },
  },
};

@Injectable()
export class TemplateGeneratorService {
  private readonly logger = new Logger(TemplateGeneratorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly validationService: CatalogValidationService,
  ) {}

  /**
   * Generate a blank catalog template with data validations (dropdowns).
   */
  async generateTemplate(type: 'full' | string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SCS Platform';
    workbook.created = new Date();

    // README sheet
    this.addReadmeSheet(workbook);

    // Entity sheets
    const sheetOrder = type === 'full'
      ? Object.keys(SHEET_HEADERS)
      : this.getSheetsForType(type);

    for (const sheetName of sheetOrder) {
      const headers = SHEET_HEADERS[sheetName];
      if (!headers) continue;
      const sheet = workbook.addWorksheet(sheetName);
      this.addHeaders(sheet, headers);
    }

    // Add data validations from DB
    await this.addDataValidations(workbook);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate a full catalog export workbook with current data.
   */
  async generateExport(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SCS Platform';
    workbook.created = new Date();

    // Export each entity type
    await this.exportCategories(workbook);
    await this.exportBrands(workbook);
    await this.exportAttributes(workbook);
    await this.exportAttributeOptions(workbook);
    await this.exportProductTypes(workbook);
    await this.exportProducts(workbook);
    await this.exportVariants(workbook);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addReadmeSheet(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet('README');
    sheet.columns = [{ width: 80 }];

    const rows = [
      ['SCS Catalog Import Template'],
      [''],
      ['Instructions:'],
      ['1. Fill in each sheet with your catalog data'],
      ['2. Required columns are marked with dropdown validations'],
      ['3. Use lowercase slugs with hyphens (e.g. "business-laptops")'],
      ['4. Attribute codes must match existing definitions'],
      ['5. Save as .xlsx (not .xls or .xlsm)'],
      ['6. Maximum file size: 25 MB'],
      [''],
      ['Sheet Descriptions:'],
      ['Categories — Product categories with hierarchy (parent_slug)'],
      ['Brands — Manufacturer brands'],
      ['Attribute Groups — Logical grouping for attributes'],
      ['Attributes — Attribute definitions (code, type, scope)'],
      ['Attribute Options — Allowed values for SELECT attributes'],
      ['Product Types — Product type definitions with variant dimensions'],
      ['Product Type Attributes — Which attributes belong to each product type'],
      ['Products — Canonical products (platform-level)'],
      ['Product Attributes — Product-level attribute values'],
      ['Variants — Product variants (configurations)'],
      ['Variant Attributes — Variant-level attribute values'],
      ['Sources — Product data source provenance'],
      [''],
      [`Generated: ${new Date().toISOString()}`],
    ];

    for (const row of rows) {
      sheet.addRow(row);
    }

    // Style the title
    const titleCell = sheet.getCell('A1');
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF0F3340' } };
  }

  private addHeaders(sheet: ExcelJS.Worksheet, headers: string[]): void {
    const headerRow = sheet.addRow(headers.map(h => h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())));
    headerRow.eachCell((cell) => {
      Object.assign(cell, { style: { ...HEADER_STYLE } });
    });
    // Set column widths
    sheet.columns = headers.map(() => ({ width: 22 }));
  }

  private async addDataValidations(workbook: ExcelJS.Workbook): Promise<void> {
    try {
      // Load brands for dropdown
      const brandRows = await this.db.db.select({ slug: brands.slug }).from(brands).limit(500);
      const brandSlugs = brandRows.map(r => r.slug);

      // Load categories for dropdown
      const catRows = await this.db.db.select({ slug: categories.slug }).from(categories).where(isNull(categories.storeId)).limit(500);
      const catSlugs = catRows.map(r => r.slug);

      // Load attribute codes
      const attrRows = await this.db.db.select({ code: attributeDefinitions.code }).from(attributeDefinitions).limit(500);
      const attrCodes = attrRows.map(r => r.code);

      // Load product type codes
      const ptRows = await this.db.db.select({ code: productTypes.code }).from(productTypes).limit(500);
      const ptCodes = ptRows.map(r => r.code);

      // Add validations to Products sheet
      const productsSheet = workbook.getWorksheet('Products');
      if (productsSheet) {
        this.addDropdownValidation(productsSheet, brandSlugs, 7); // brand_slug column
        this.addDropdownValidation(productsSheet, catSlugs, 9); // category_slug column
        this.addDropdownValidation(productsSheet, ptCodes, 8); // product_type_code column
      }

      // Add validations to Product Attributes sheet
      const paSheet = workbook.getWorksheet('Product Attributes');
      if (paSheet) {
        this.addDropdownValidation(paSheet, attrCodes, 2); // attribute_code column
      }

      // Add validations to Variant Attributes sheet
      const vaSheet = workbook.getWorksheet('Variant Attributes');
      if (vaSheet) {
        this.addDropdownValidation(vaSheet, attrCodes, 2); // attribute_code column
      }
    } catch (err) {
      this.logger.warn(`Failed to add data validations: ${err}`);
    }
  }

  private addDropdownValidation(sheet: ExcelJS.Worksheet, values: string[], colNumber: number): void {
    if (values.length === 0) return;
    // ExcelJS data validation with list
    for (let row = 2; row <= 1000; row++) {
      sheet.getCell(row, colNumber).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Invalid Value',
        error: 'Please select a value from the dropdown list',
      };
    }
  }

  private getSheetsForType(type: string): string[] {
    switch (type) {
      case 'products': return ['Products', 'Product Attributes', 'Variants', 'Variant Attributes', 'Sources'];
      case 'categories': return ['Categories'];
      case 'brands': return ['Brands'];
      case 'attributes': return ['Attribute Groups', 'Attributes', 'Attribute Options'];
      case 'product-types': return ['Product Types', 'Product Type Attributes'];
      default: return Object.keys(SHEET_HEADERS);
    }
  }

  // ── Export helpers ────────────────────────────────────────────

  private async exportCategories(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      slug: categories.slug,
      name: categories.name,
      nameAr: categories.nameAr,
      description: categories.description,
      sortOrder: categories.sortOrder,
    }).from(categories).where(isNull(categories.storeId));

    const sheet = workbook.addWorksheet('Categories');
    this.addHeaders(sheet, SHEET_HEADERS['Categories']!);
    for (const r of rows) {
      sheet.addRow([r.slug, r.name, r.nameAr ?? '', r.description ?? '', '', r.sortOrder ?? 0]);
    }
  }

  private async exportBrands(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      slug: brands.slug,
      name: brands.name,
      nameAr: brands.nameAr,
      description: brands.description,
    }).from(brands);

    const sheet = workbook.addWorksheet('Brands');
    this.addHeaders(sheet, SHEET_HEADERS['Brands']!);
    for (const r of rows) {
      sheet.addRow([r.slug, r.name, r.nameAr ?? '', r.description ?? '']);
    }
  }

  private async exportAttributes(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      code: attributeDefinitions.code,
      name: attributeDefinitions.name,
      nameAr: attributeDefinitions.nameAr,
      description: attributeDefinitions.description,
      type: attributeDefinitions.type,
      scope: attributeDefinitions.scope,
      unit: attributeDefinitions.unit,
    }).from(attributeDefinitions);

    const sheet = workbook.addWorksheet('Attributes');
    this.addHeaders(sheet, SHEET_HEADERS['Attributes']!);
    for (const r of rows) {
      sheet.addRow([r.code, r.name, r.nameAr ?? '', r.description ?? '', r.type, r.scope, r.unit ?? '']);
    }
  }

  private async exportAttributeOptions(workbook: ExcelJS.Workbook): Promise<void> {
    // Need attribute codes for the attribute_code column
    const attrRows = await this.db.db.select({
      id: attributeDefinitions.id,
      code: attributeDefinitions.code,
    }).from(attributeDefinitions);
    const idToCode = new Map(attrRows.map(r => [r.id, r.code] as const));

    const optRows = await this.db.db.select({
      attributeId: attributeOptions.attributeId,
      value: attributeOptions.value,
      valueAr: attributeOptions.valueAr,
      label: attributeOptions.label,
      sortOrder: attributeOptions.sortOrder,
    }).from(attributeOptions);

    const sheet = workbook.addWorksheet('Attribute Options');
    this.addHeaders(sheet, SHEET_HEADERS['Attribute Options']!);
    for (const r of optRows) {
      const code = idToCode.get(r.attributeId) ?? '';
      sheet.addRow([code, r.value, r.valueAr ?? '', r.label ?? '', r.sortOrder ?? 0]);
    }
  }

  private async exportProductTypes(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      code: productTypes.code,
      name: productTypes.name,
      nameAr: productTypes.nameAr,
      description: productTypes.description,
    }).from(productTypes);

    const sheet = workbook.addWorksheet('Product Types');
    this.addHeaders(sheet, SHEET_HEADERS['Product Types']!);
    for (const r of rows) {
      sheet.addRow([r.code, r.name, r.nameAr ?? '', r.description ?? '', '', '']);
    }
  }

  private async exportProducts(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      slug: products.slug,
      title: products.title,
      titleAr: products.titleAr,
      description: products.description,
      descriptionAr: products.descriptionAr,
      mpn: products.mpn,
      gtin: products.gtin,
      ean: products.ean,
      status: products.status,
      condition: products.condition,
    }).from(products).where(isNull(products.storeId));

    const sheet = workbook.addWorksheet('Products');
    this.addHeaders(sheet, SHEET_HEADERS['Products']!);
    for (const r of rows) {
      sheet.addRow([
        r.slug, r.title, r.titleAr ?? '', r.description ?? '', r.descriptionAr ?? '',
        '', '', '', r.mpn ?? '', r.gtin ?? '', r.ean ?? '',
        r.condition ?? 'NEW', r.status ?? 'ACTIVE',
      ]);
    }
  }

  private async exportVariants(workbook: ExcelJS.Workbook): Promise<void> {
    const rows = await this.db.db.select({
      sku: productVariants.sku,
      title: productVariants.title,
      titleAr: productVariants.titleAr,
      barcode: productVariants.barcode,
      unit: productVariants.unit,
      weightGrams: productVariants.weightGrams,
      productId: productVariants.productId,
    }).from(productVariants);

    // Need product slugs
    const prodRows = await this.db.db.select({
      id: products.id,
      slug: products.slug,
    }).from(products);
    const idToSlug = new Map(prodRows.map(r => [r.id, r.slug] as const));

    const sheet = workbook.addWorksheet('Variants');
    this.addHeaders(sheet, SHEET_HEADERS['Variants']!);
    for (const r of rows) {
      const prodSlug = idToSlug.get(r.productId) ?? '';
      sheet.addRow([prodSlug, r.sku, r.title ?? '', r.titleAr ?? '', r.barcode ?? '', r.unit ?? 'PCS', r.weightGrams ?? '']);
    }
  }
}
