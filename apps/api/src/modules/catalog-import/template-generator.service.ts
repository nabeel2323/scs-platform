import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../common/database/database.service';
import { brands, categories, products, productVariants } from '../catalog/catalog.schema';
import {
  attributeDefinitions,
  attributeGroups,
  attributeOptions,
  productAttributeValues,
  productTypeAttributes,
  productTypes,
  variantAttributeValues,
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
   *
   * Emits every sheet the importer recognises so an export → re-import cycle
   * preserves all catalog semantics. See docs/production/SCS-CATALOG-ROUNDTRIP-INTEGRITY-AUDIT.md
   * for the specific defects this method is designed to close:
   *   - Categories.parent_slug is preserved via a self-lookup (audit §2)
   *   - Products.brand_slug / product_type_code / category_slug are joined (audit §3)
   *   - Product Types.variant_dimensions are exported as attribute CODES even
   *     when stored as UUIDs internally, so the importer can consume them
   *     without a reverse-resolution step (audit §9)
   *   - Product Type Attributes, Product Attributes, Variant Attributes,
   *     Sources, and Attribute Groups sheets are produced (audit §4)
   *   - README metadata sheet records per-sheet counts (task §26)
   */
  async generateExport(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SCS Platform';
    workbook.created = new Date();

    // Order here controls the visible sheet tab order in Excel. Each method
    // queries independently, so this ordering does NOT affect correctness.
    const counts: Record<string, number> = {};
    counts['Attribute Groups'] = await this.exportAttributeGroups(workbook);
    counts['Categories'] = await this.exportCategories(workbook);
    counts['Brands'] = await this.exportBrands(workbook);
    counts['Attributes'] = await this.exportAttributes(workbook);
    counts['Attribute Options'] = await this.exportAttributeOptions(workbook);
    counts['Product Types'] = await this.exportProductTypes(workbook);
    counts['Product Type Attributes'] = await this.exportProductTypeAttributes(workbook);
    counts['Products'] = await this.exportProducts(workbook);
    counts['Product Attributes'] = await this.exportProductAttributes(workbook);
    counts['Variants'] = await this.exportVariants(workbook);
    counts['Variant Attributes'] = await this.exportVariantAttributes(workbook);
    counts['Sources'] = await this.exportSources(workbook);

    // Metadata / README placed last so the entity sheets open first when the
    // workbook is loaded, but present so integrity verification is trivial.
    this.addExportReadme(workbook, counts);

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

      // Add validations to Product Types sheet
      const ptSheet = workbook.getWorksheet('Product Types');
      if (ptSheet) {
        this.addDropdownValidation(ptSheet, catSlugs, 5); // category_slug column
      }

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

  private async exportCategories(workbook: ExcelJS.Workbook): Promise<number> {
    // Include the row id and parentId so we can resolve parent_slug via an
    // in-memory lookup — avoids a self-join and correctly emits parents that
    // are also in this result set (the platform category tree is small).
    // See audit §2 — this is the specific defect that emptied parent_slug.
    const rows = await this.db.db.select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      nameAr: categories.nameAr,
      description: categories.description,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    }).from(categories).where(isNull(categories.storeId));

    const idToSlug = new Map(rows.map(r => [r.id, r.slug] as const));

    const sheet = workbook.addWorksheet('Categories');
    this.addHeaders(sheet, SHEET_HEADERS['Categories']!);
    for (const r of rows) {
      const parentSlug = r.parentId ? (idToSlug.get(r.parentId) ?? '') : '';
      sheet.addRow([r.slug, r.name, r.nameAr ?? '', r.description ?? '', parentSlug, r.sortOrder ?? 0]);
    }
    return rows.length;
  }

  private async exportAttributeGroups(workbook: ExcelJS.Workbook): Promise<number> {
    const rows = await this.db.db.select({
      name: attributeGroups.name,
      nameAr: attributeGroups.nameAr,
      kind: attributeGroups.kind,
    }).from(attributeGroups);

    const sheet = workbook.addWorksheet('Attribute Groups');
    this.addHeaders(sheet, SHEET_HEADERS['Attribute Groups']!);
    for (const r of rows) {
      sheet.addRow([r.name, r.nameAr ?? '', r.kind ?? '']);
    }
    return rows.length;
  }

  private async exportBrands(workbook: ExcelJS.Workbook): Promise<number> {
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
    return rows.length;
  }

  private async exportAttributes(workbook: ExcelJS.Workbook): Promise<number> {
    const rows = await this.db.db.select({
      code: attributeDefinitions.code,
      name: attributeDefinitions.name,
      nameAr: attributeDefinitions.nameAr,
      description: attributeDefinitions.description,
      type: attributeDefinitions.type,
      scope: attributeDefinitions.scope,
      unit: attributeDefinitions.unit,
      validation: attributeDefinitions.validation,
    }).from(attributeDefinitions);

    const sheet = workbook.addWorksheet('Attributes');
    this.addHeaders(sheet, SHEET_HEADERS['Attributes']!);
    for (const r of rows) {
      // SHEET_HEADERS declares 8 columns including `validation`; the previous
      // version of this method wrote 7 values and left validation blank.
      // Serialise as JSON when non-empty so the field round-trips; the
      // importer's `product_attributes` handling ignores it, but preserving
      // it keeps the workbook faithful.
      const validation = r.validation && typeof r.validation === 'object' && Object.keys(r.validation as object).length > 0
        ? JSON.stringify(r.validation)
        : '';
      sheet.addRow([r.code, r.name, r.nameAr ?? '', r.description ?? '', r.type, r.scope, r.unit ?? '', validation]);
    }
    return rows.length;
  }

  private async exportAttributeOptions(workbook: ExcelJS.Workbook): Promise<number> {
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
    return optRows.length;
  }

  private async exportProductTypes(workbook: ExcelJS.Workbook): Promise<number> {
    // Join with categories to get the category slug for each product type.
    const rows = await this.db.db.select({
      code: productTypes.code,
      name: productTypes.name,
      nameAr: productTypes.nameAr,
      description: productTypes.description,
      categorySlug: categories.slug,
      variantDimensions: productTypes.variantDimensions,
    }).from(productTypes)
      .leftJoin(categories, eq(productTypes.categoryId, categories.id));

    // variantDimensions is JSONB. Under the current importer it holds attribute
    // UUIDs (see excel-executor.service.ts upsertProductType: variantDimensions
    // is written from resolvedVariantDimensionIds). Legacy rows and rows
    // created via other paths may hold attribute CODES directly. The importer
    // expects codes, so map UUIDs → codes and pass codes through unchanged.
    // See audit §9.
    const attrRows = await this.db.db.select({
      id: attributeDefinitions.id,
      code: attributeDefinitions.code,
    }).from(attributeDefinitions);
    const idToCode = new Map(attrRows.map(a => [a.id, a.code] as const));

    const sheet = workbook.addWorksheet('Product Types');
    this.addHeaders(sheet, SHEET_HEADERS['Product Types']!);
    for (const r of rows) {
      const dimsRaw = Array.isArray(r.variantDimensions) ? r.variantDimensions : [];
      const dims = dimsRaw
        .map(v => (typeof v === 'string' ? (idToCode.get(v) ?? v) : String(v)))
        .join(',');
      sheet.addRow([r.code, r.name, r.nameAr ?? '', r.description ?? '', r.categorySlug ?? '', dims]);
    }
    return rows.length;
  }

  private async exportProductTypeAttributes(workbook: ExcelJS.Workbook): Promise<number> {
    // The absence of this sheet is the direct root cause of "Imported Product
    // Types cannot be published" (audit §5, task §8/§10): publish requires
    // at least one PTA row, and re-import of the previous export produced
    // zero. Every PTA relationship is now written.
    const rows = await this.db.db.select({
      productTypeCode: productTypes.code,
      attributeCode: attributeDefinitions.code,
      groupName: attributeGroups.name,
      required: productTypeAttributes.required,
      scope: productTypeAttributes.scope,
      displayOrder: productTypeAttributes.displayOrder,
      filterable: productTypeAttributes.filterable,
      searchable: productTypeAttributes.searchable,
      visibleInListing: productTypeAttributes.visibleInListing,
      visibleInDetail: productTypeAttributes.visibleInDetail,
    }).from(productTypeAttributes)
      .innerJoin(productTypes, eq(productTypeAttributes.productTypeId, productTypes.id))
      .innerJoin(attributeDefinitions, eq(productTypeAttributes.attributeDefinitionId, attributeDefinitions.id))
      .leftJoin(attributeGroups, eq(productTypeAttributes.groupId, attributeGroups.id));

    const sheet = workbook.addWorksheet('Product Type Attributes');
    this.addHeaders(sheet, SHEET_HEADERS['Product Type Attributes']!);
    const bool = (v: boolean | null | undefined): string => (v ? 'true' : 'false');
    for (const r of rows) {
      sheet.addRow([
        r.productTypeCode,
        r.attributeCode,
        r.groupName ?? '',
        bool(r.required),
        r.scope,
        r.displayOrder ?? 0,
        bool(r.filterable),
        bool(r.searchable),
        bool(r.visibleInListing),
        bool(r.visibleInDetail),
      ]);
    }
    return rows.length;
  }

  private async exportProducts(workbook: ExcelJS.Workbook): Promise<number> {
    // Join brand / product_type / category so their natural keys are exported
    // alongside the product. See audit §3 — the previous version of this
    // method wrote three literal empty strings for these columns, silently
    // stripping every relationship on the round trip.
    const rows = await this.db.db.select({
      slug: products.slug,
      title: products.title,
      titleAr: products.titleAr,
      description: products.description,
      descriptionAr: products.descriptionAr,
      brandSlug: brands.slug,
      productTypeCode: productTypes.code,
      categorySlug: categories.slug,
      mpn: products.mpn,
      gtin: products.gtin,
      ean: products.ean,
      status: products.status,
      condition: products.condition,
    }).from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(productTypes, eq(products.productTypeId, productTypes.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(isNull(products.storeId));

    const sheet = workbook.addWorksheet('Products');
    this.addHeaders(sheet, SHEET_HEADERS['Products']!);
    for (const r of rows) {
      sheet.addRow([
        r.slug, r.title, r.titleAr ?? '', r.description ?? '', r.descriptionAr ?? '',
        r.brandSlug ?? '', r.productTypeCode ?? '', r.categorySlug ?? '',
        r.mpn ?? '', r.gtin ?? '', r.ean ?? '',
        r.condition ?? 'NEW', r.status ?? 'ACTIVE',
      ]);
    }
    return rows.length;
  }

  private async exportProductAttributes(workbook: ExcelJS.Workbook): Promise<number> {
    // Task §11 — preserve typed values. The four columns the importer writes
    // (value_text, value_number, value_boolean, option_key) map 1:1 to the
    // typed columns on product_attribute_values.
    //
    // Known limitation tracked as follow-up: MULTI_SELECT attribute values are
    // stored in the JSONB `value_json` column and have no matching sheet
    // column; they are silently skipped here. The current import pipeline
    // cannot ingest value_json either, so this preserves round-trip parity
    // (nothing new is lost) rather than fabricating a schema. Task §32 forbids
    // inventing values, so we do not flatten value_json into value_text.
    const rows = await this.db.db.select({
      productSlug: products.slug,
      attributeCode: attributeDefinitions.code,
      valueText: productAttributeValues.valueText,
      valueNumber: productAttributeValues.valueNumber,
      valueBoolean: productAttributeValues.valueBoolean,
      optionValue: productAttributeValues.optionValue,
      valueJson: productAttributeValues.valueJson,
    }).from(productAttributeValues)
      .innerJoin(products, eq(productAttributeValues.productId, products.id))
      .innerJoin(attributeDefinitions, eq(productAttributeValues.attributeDefinitionId, attributeDefinitions.id));

    const sheet = workbook.addWorksheet('Product Attributes');
    this.addHeaders(sheet, SHEET_HEADERS['Product Attributes']!);
    let written = 0;
    for (const r of rows) {
      // Skip rows whose only populated value is the JSONB array (MULTI_SELECT).
      if (r.valueText == null && r.valueNumber == null && r.valueBoolean == null && r.optionValue == null) {
        continue;
      }
      sheet.addRow([
        r.productSlug,
        r.attributeCode,
        r.valueText ?? '',
        r.valueNumber ?? '',
        r.valueBoolean == null ? '' : String(r.valueBoolean),
        r.optionValue ?? '',
      ]);
      written++;
    }
    return written;
  }

  private async exportVariants(workbook: ExcelJS.Workbook): Promise<number> {
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
    return rows.length;
  }

  private async exportVariantAttributes(workbook: ExcelJS.Workbook): Promise<number> {
    // Task §12 — SKU on this sheet is always `productVariants.sku`, never a
    // derived JSON blob. The corrupted-SKU variant (audit §8) will still be
    // exported with its current (invalid) SKU because Task §32 forbids
    // hiding/silently rewriting records at export time; that row is dealt
    // with as an explicit data classification/migration in M5, not masked
    // here.
    const rows = await this.db.db.select({
      variantSku: productVariants.sku,
      attributeCode: attributeDefinitions.code,
      valueText: variantAttributeValues.valueText,
      valueNumber: variantAttributeValues.valueNumber,
      valueBoolean: variantAttributeValues.valueBoolean,
      optionValue: variantAttributeValues.optionValue,
    }).from(variantAttributeValues)
      .innerJoin(productVariants, eq(variantAttributeValues.variantId, productVariants.id))
      .innerJoin(attributeDefinitions, eq(variantAttributeValues.attributeDefinitionId, attributeDefinitions.id));

    const sheet = workbook.addWorksheet('Variant Attributes');
    this.addHeaders(sheet, SHEET_HEADERS['Variant Attributes']!);
    let written = 0;
    for (const r of rows) {
      if (r.valueText == null && r.valueNumber == null && r.valueBoolean == null && r.optionValue == null) {
        continue;
      }
      sheet.addRow([
        r.variantSku,
        r.attributeCode,
        r.valueText ?? '',
        r.valueNumber ?? '',
        r.valueBoolean == null ? '' : String(r.valueBoolean),
        r.optionValue ?? '',
      ]);
      written++;
    }
    return written;
  }

  private async exportSources(workbook: ExcelJS.Workbook): Promise<number> {
    // SHEET_HEADERS declares Sources and excel-parser.service.ts's
    // SHEET_ENTITY_MAP recognises the sheet, but no `sources` /
    // `product_sources` table exists in the current Drizzle schema (verified
    // against catalog.schema.ts, catalog.taxonomy.schema.ts, catalog.offer
    // .schema.ts and the migrations dir). Emitting an empty sheet preserves
    // the workbook structure without inventing values (Task §13: "Do not
    // invent values", Task §32: "Do not mask the problem"). Persisting
    // Sources through the importer and adding the corresponding table are
    // tracked as follow-ups.
    const sheet = workbook.addWorksheet('Sources');
    this.addHeaders(sheet, SHEET_HEADERS['Sources']!);
    return 0;
  }

  /**
   * Metadata / README sheet written after the entity sheets so integrity
   * verification is a matter of comparing counts (Task §26). Organization,
   * catalog version and schema version placeholders remain empty until a
   * live-datasource (organization context, catalog version, schema-version
   * migration table) is threaded through the export path — those fields
   * require M2+ scope and are intentionally not fabricated here.
   */
  private addExportReadme(workbook: ExcelJS.Workbook, counts: Record<string, number>): void {
    const sheet = workbook.addWorksheet('README');
    sheet.columns = [{ width: 34 }, { width: 60 }];

    const rows: Array<[string, string]> = [
      ['Catalog Export', ''],
      ['Export Date', new Date().toISOString()],
      ['Organization', ''],
      ['Catalog Version', ''],
      ['Schema Version', ''],
      ['', ''],
      ['Sheet', 'Records'],
    ];
    for (const [name, count] of Object.entries(counts)) {
      rows.push([name, String(count)]);
    }
    for (const row of rows) sheet.addRow(row);

    const titleCell = sheet.getCell('A1');
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF0F3340' } };
  }
}
