import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { catalogImports, catalogImportErrors } from './catalog-import.schema';
import { brands, categories, products, productVariants } from '../catalog/catalog.schema';
import { attributeDefinitions, attributeOptions, productTypes } from '../catalog/catalog.taxonomy.schema';
import ExcelJS from 'exceljs';
import { eq, isNull, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ExcelParserService, type ParsedWorkbook } from './excel-parser.service';
import { ExcelValidatorService, type ExistingDataSnapshot, type ImportError } from './excel-validator.service';
import { ExcelResolverService, type ResolvedReferences } from './excel-resolver.service';
import { ExcelPlannerService, type ImportPlan, type PlanEntry, type ExistingEntityMap } from './excel-planner.service';
import { ExcelExecutorService, type ExecutionResult, VARCHAR_LIMITS } from './excel-executor.service';
import { TemplateGeneratorService } from './template-generator.service';
import { CatalogTaxonomyService } from '../catalog/catalog.taxonomy.service';

/** Extended result with publishability info per Catalog Governance §21. */
export interface ImportExecutionResult extends ExecutionResult {
  publishability: PublishabilityReport;
}

/** Per-product-type publishability breakdown after import. */
export interface PublishabilityReport {
  totalProductTypes: number;
  publishable: number;
  notPublishable: number;
  details: Array<{
    code: string;
    name: string;
    canPublish: boolean;
    errors: Array<{ code: string; message: string }>;
  }>;
}

/**
 * Orchestrates the catalog import pipeline:
 *   upload → parse → validate → resolve → plan → preview → execute → report
 *
 * Each import job is tracked in the `catalog_imports` table with status
 * transitions and row-level errors stored in `catalog_import_errors`.
 */

const UPLOAD_BUCKET = process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads';

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  /** In-memory cache of plans/errors keyed by import ID (for preview before execute). */
  private readonly planCache = new Map<string, { plan: ImportPlan; refs: ResolvedReferences; errors: ImportError[] }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly parser: ExcelParserService,
    private readonly validator: ExcelValidatorService,
    private readonly resolver: ExcelResolverService,
    private readonly planner: ExcelPlannerService,
    private readonly executor: ExcelExecutorService,
    private readonly templateGenerator: TemplateGeneratorService,
    private readonly taxonomyService: CatalogTaxonomyService,
  ) {}

  // ── Upload ────────────────────────────────────────────────────

  async upload(file: { buffer: Buffer; originalName: string; size: number }, userId: string) {
    const storageKey = `catalog-imports/${randomUUID()}/${file.originalName}`;

    await this.storage.putObject({
      bucket: UPLOAD_BUCKET,
      key: storageKey,
      body: file.buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const id = randomUUID();
    await this.db.db.insert(catalogImports).values({
      id,
      fileName: file.originalName,
      fileSize: file.size,
      fileType: 'XLSX',
      storageKey,
      importType: 'FULL_CATALOG',
      status: 'UPLOADED',
      uploadedBy: userId,
    });

    this.logger.log(`Import ${id} uploaded: ${file.originalName} (${file.size} bytes)`);

    // Auto-validate after upload
    await this.validate(id);

    return this.getImportDetail(id);
  }

  // ── Validate (parse → validate → resolve → plan) ──────────────

  async validate(importId: string): Promise<{ errors: ImportError[]; plan: ImportPlan }> {
    const job = await this.getJobOrThrow(importId);

    // Update status
    await this.updateStatus(importId, 'VALIDATING');

    // Download file from storage
    const obj = await this.storage.getObject(UPLOAD_BUCKET, job.storageKey);
    const chunks: Uint8Array[] = [];
    for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // 1. Parse
    await this.updateStatus(importId, 'PARSING');
    const workbook = await this.parser.parse(buffer, job.fileName);

    // 2. Load existing data snapshot for validation
    const existingData = await this.loadExistingDataSnapshot();

    // 3. Validate
    const errors = this.validator.validate(workbook, existingData);

    // 4. Resolve references
    const refs = await this.resolver.resolve(workbook);

    // 5. Build plan
    const existingEntities = await this.loadExistingEntityMap();
    const plan = this.planner.buildPlan(workbook, refs, existingEntities);

    // Store plan in cache
    this.planCache.set(importId, { plan, refs, errors });

    // Update import record
    const totalRows = this.countTotalRows(workbook);
    const hardErrors = errors.filter(e => e.severity === 'ERROR');

    await this.db.db.update(catalogImports).set({
      status: hardErrors.length > 0 ? 'READY' : 'READY',
      totalRows,
      errorCount: hardErrors.length,
      warningCount: errors.length - hardErrors.length,
      stats: {
        summary: plan.summary,
        sheets: [...workbook.sheets.keys()],
      } as any,
      updatedAt: new Date(),
    }).where(eq(catalogImports.id, importId));

    // Store errors in DB
    if (errors.length > 0) {
      await this.storeErrors(importId, errors);
    }

    return { errors, plan };
  }

  // ── Execute ───────────────────────────────────────────────────

  async execute(
    importId: string,
    userId: string,
    overrides?: Record<string, Record<string, Record<string, string>>>,
  ): Promise<ImportExecutionResult> {
    const cached = this.planCache.get(importId);
    if (!cached) {
      throw new BadRequestException('No validated plan found. Please validate the import first.');
    }

    const { plan, refs } = cached;

    // Apply interactive corrections (if any) before executing
    if (overrides && Object.keys(overrides).length > 0) {
      const applied = this.applyOverrides(plan, overrides);
      const remaining = this.validateOverrideLengths(plan);
      if (remaining.length > 0) {
        throw new BadRequestException(
          `Overrides still have ${remaining.length} violation(s): ${remaining.join('; ')}`,
        );
      }
      this.logger.log(`Applied ${applied} override(s) to import ${importId}`);
    }

    await this.updateStatus(importId, 'IMPORTING');
    await this.db.db.update(catalogImports).set({
      startedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(catalogImports.id, importId));

    try {
      const result = await this.executor.execute(plan, refs);

      // Catalog Governance §21: post-import publishability check. After the
      // transaction commits, validate every product type that was created or
      // updated so the admin knows which ones can be published immediately.
      const publishability = await this.checkPublishability(plan, refs);

      const status = (result.errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED')
        .slice(0, CatalogImportService.STATUS_MAX_LEN);

      await this.db.db.update(catalogImports).set({
        status,
        processedRows: result.created + result.updated + result.unchanged + result.rejected,
        createdRows: result.created,
        updatedRows: result.updated,
        unchangedRows: result.unchanged,
        rejectedRows: result.rejected,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(catalogImports.id, importId));

      // Audit
      await this.audit.record({
        actorType: 'ADMIN',
        actorId: userId,
        action: 'CATALOG_IMPORT_EXECUTED',
        resource: 'catalog_import',
        resourceId: importId,
        metadata: {
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          rejected: result.rejected,
        },
      });

      // Clear cache
      this.planCache.delete(importId);

      this.logger.log(`Import ${importId} completed: ${result.created} created, ${result.updated} updated`);
      return {
        ...result,
        publishability,
      };
    } catch (err) {
      await this.updateStatus(importId, 'FAILED');
      this.logger.error(`Import ${importId} failed: ${err}`);
      throw err;
    }
  }

  /**
   * Mapping from error sheet/entity names to ImportPlan keys.
   */
  private static readonly ENTITY_PLAN_KEYS: Record<string, keyof ImportPlan> = {
    categories: 'categories',
    brands: 'brands',
    attribute_groups: 'attributeGroups',
    attributes: 'attributes',
    attribute_options: 'attributeOptions',
    product_types: 'productTypes',
    product_type_attributes: 'productTypeAttributes',
    products: 'products',
    variants: 'variants',
  };

  /**
   * Apply interactive overrides to a cached plan.
   * Overrides format: { [entityType]: { [externalKey]: { [field]: newValue } } }
   * Returns the number of plan entries patched.
   */
  private applyOverrides(
    plan: ImportPlan,
    overrides: Record<string, Record<string, Record<string, string>>>,
  ): number {
    let applied = 0;
    for (const [entityType, keyMap] of Object.entries(overrides)) {
      const planKey = CatalogImportService.ENTITY_PLAN_KEYS[entityType];
      if (!planKey) continue;
      const entries = plan[planKey] as PlanEntry[];
      for (const entry of entries) {
        const fieldOverrides = keyMap[entry.externalKey];
        if (!fieldOverrides) continue;
        for (const [field, value] of Object.entries(fieldOverrides)) {
          entry.data[field] = value;
          applied++;
        }
      }
    }
    return applied;
  }

  /**
   * Re-validate string lengths after overrides are applied.
   * Returns an array of human-readable violation descriptions (empty = all good).
   */
  private validateOverrideLengths(plan: ImportPlan): string[] {
    const errors: string[] = [];
    const sections: Array<{ key: keyof ImportPlan; label: string }> = [
      { key: 'attributeGroups', label: 'AttributeGroup' },
      { key: 'categories', label: 'Category' },
      { key: 'brands', label: 'Brand' },
      { key: 'attributes', label: 'Attribute' },
      { key: 'attributeOptions', label: 'AttributeOption' },
      { key: 'productTypes', label: 'ProductType' },
      { key: 'productTypeAttributes', label: 'ProductTypeAttribute' },
      { key: 'products', label: 'Product' },
      { key: 'variants', label: 'Variant' },
    ];
    for (const { key, label } of sections) {
      const constraints = VARCHAR_LIMITS[key];
      if (!constraints) continue;
      for (const entry of plan[key] as PlanEntry[]) {
        if (entry.action === 'UNCHANGED') continue;
        for (const [field, maxLen] of Object.entries(constraints)) {
          const value = entry.data[field];
          if (typeof value === 'string' && value.length > maxLen) {
            errors.push(
              `${label} "${entry.externalKey}": field "${field}" is ${value.length} chars (max ${maxLen})`,
            );
          }
        }
      }
    }
    return errors;
  }

  // ── Query methods ─────────────────────────────────────────────

  async listImports(params: { limit?: number; offset?: number; status?: string }) {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;

    let query = this.db.db.select().from(catalogImports).$dynamic();
    if (params.status) {
      query = query.where(eq(catalogImports.status, params.status)) as typeof query;
    }
    const rows = await query.orderBy(desc(catalogImports.createdAt)).limit(limit).offset(offset);
    return rows;
  }

  async getImportDetail(importId: string) {
    const job = await this.getJobOrThrow(importId);
    return job;
  }

  async getPreview(importId: string) {
    const cached = this.planCache.get(importId);
    if (!cached) {
      throw new NotFoundException('No preview available. Please validate the import first.');
    }
    return {
      plan: cached.plan,
      errors: cached.errors,
    };
  }

  async getErrors(importId: string) {
    const rows = await this.db.db.select().from(catalogImportErrors)
      .where(eq(catalogImportErrors.importId, importId))
      .orderBy(catalogImportErrors.rowNumber);
    return rows;
  }

  async downloadTemplate(type: string): Promise<Buffer> {
    return this.templateGenerator.generateTemplate(type);
  }

  async exportCatalog(): Promise<Buffer> {
    return this.templateGenerator.generateExport();
  }

  async downloadReport(importId: string): Promise<Buffer> {
    // Generate an error report XLSX for the import
    const errors = await this.getErrors(importId);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Errors');
    sheet.columns = [
      { header: 'Sheet', key: 'sheet', width: 20 },
      { header: 'Row', key: 'rowNumber', width: 8 },
      { header: 'Entity', key: 'entityType', width: 20 },
      { header: 'Key', key: 'externalKey', width: 25 },
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Code', key: 'errorCode', width: 20 },
      { header: 'Message', key: 'errorMessage', width: 50 },
      { header: 'Severity', key: 'severity', width: 10 },
    ];
    for (const e of errors) {
      sheet.addRow(e);
    }
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async getJobOrThrow(importId: string) {
    const rows = await this.db.db.select().from(catalogImports).where(eq(catalogImports.id, importId)).limit(1);
    if (!rows[0]) throw new NotFoundException(`Import job ${importId} not found`);
    return rows[0];
  }

  /** Max length of catalog_imports.status column (varchar(30)). */
  private static readonly STATUS_MAX_LEN = 30;

  private async updateStatus(importId: string, status: string): Promise<void> {
    // Safety: truncate to column limit to prevent PG 22001 transaction poisoning
    const safe = status.slice(0, CatalogImportService.STATUS_MAX_LEN);
    await this.db.db.update(catalogImports).set({ status: safe, updatedAt: new Date() }).where(eq(catalogImports.id, importId));
  }

  private async storeErrors(importId: string, errors: ImportError[]): Promise<void> {
    // Delete existing errors for this import
    await this.db.db.delete(catalogImportErrors).where(eq(catalogImportErrors.importId, importId));

    // Insert new errors in batches
    const batchSize = 100;
    for (let i = 0; i < errors.length; i += batchSize) {
      const batch = errors.slice(i, i + batchSize);
      await this.db.db.insert(catalogImportErrors).values(
        batch.map(e => ({
          id: randomUUID(),
          importId,
          sheet: e.sheet,
          rowNumber: e.rowNumber,
          entityType: e.entityType,
          externalKey: e.externalKey,
          field: e.field,
          errorCode: e.errorCode,
          errorMessage: e.errorMessage,
          rawValue: e.rawValue,
          suggestedFix: e.suggestedFix,
          severity: e.severity,
        })),
      );
    }
  }

  private countTotalRows(workbook: ParsedWorkbook): number {
    let total = 0;
    for (const [, sheet] of workbook.sheets) {
      total += sheet.rowCount;
    }
    return total;
  }

  private async loadExistingDataSnapshot(): Promise<ExistingDataSnapshot> {
    const [brandRows, catRows, attrRows, _optRows, ptRows, prodRows, varRows] = await Promise.all([
      this.db.db.select({ slug: brands.slug }).from(brands),
      this.db.db.select({ slug: categories.slug, storeId: categories.storeId }).from(categories),
      this.db.db.select({ code: attributeDefinitions.code, type: attributeDefinitions.type }).from(attributeDefinitions),
      this.db.db.select({ id: attributeOptions.id, attributeId: attributeOptions.attributeId, value: attributeOptions.value }).from(attributeOptions),
      this.db.db.select({ code: productTypes.code }).from(productTypes),
      this.db.db.select({ slug: products.slug, storeId: products.storeId }).from(products),
      this.db.db.select({ sku: productVariants.sku }).from(productVariants),
    ]);

    // Build attribute map with options
    const attributeMap = new Map<string, { type: string; options: Set<string> }>();
    for (const r of attrRows) {
      attributeMap.set(r.code, { type: r.type, options: new Set() });
    }

    return {
      categorySlugs: catRows.filter(r => !r.storeId).map(r => r.slug),
      brandSlugs: brandRows.map(r => r.slug),
      attributeMap: [...attributeMap.entries()],
      productTypeCodes: ptRows.map(r => r.code),
      productSlugs: prodRows.filter(r => !r.storeId).map(r => r.slug),
      variantSkus: varRows.map(r => r.sku),
    };
  }

  private async loadExistingEntityMap(): Promise<ExistingEntityMap> {
    const [catRows, brandRows, prodRows] = await Promise.all([
      this.db.db.select({ slug: categories.slug, name: categories.name, nameAr: categories.nameAr, description: categories.description }).from(categories).where(isNull(categories.storeId)),
      this.db.db.select({ slug: brands.slug, name: brands.name, nameAr: brands.nameAr, description: brands.description }).from(brands),
      this.db.db.select({ slug: products.slug, title: products.title, description: products.description, mpn: products.mpn }).from(products).where(isNull(products.storeId)),
    ]);

    return {
      categories: new Map(catRows.map(r => [r.slug, { name: r.name, nameAr: r.nameAr, description: r.description }])),
      brands: new Map(brandRows.map(r => [r.slug, { name: r.name, nameAr: r.nameAr, description: r.description }])),
      products: new Map(prodRows.map(r => [r.slug, { title: r.title, description: r.description, mpn: r.mpn }])),
    };
  }

  /**
   * Catalog Governance §21: after import execution, validate each product type
   * that was created or updated so the admin sees publishability counts and
   * can drill into specific validation failures.
   */
  private async checkPublishability(plan: ImportPlan, refs: ResolvedReferences): Promise<PublishabilityReport> {
    const details: PublishabilityReport['details'] = [];

    // Collect product type IDs that were created or updated in this import.
    // After execution, refs.productTypeIds maps externalKey → real UUID.
    for (const entry of plan.productTypes) {
      if (entry.action === 'UNCHANGED') continue;
      const ptId = refs.productTypeIds.get(entry.externalKey);
      if (!ptId || ptId.startsWith('pending:')) continue;
      try {
        const result = await this.taxonomyService.validateProductTypeForPublish(ptId);
        details.push({
          code: entry.data['code'] as string || entry.externalKey,
          name: entry.data['name'] as string || entry.externalKey,
          canPublish: result.canPublish,
          errors: result.errors.map(e => ({ code: e.code, message: e.message })),
        });
      } catch (err) {
        this.logger.warn(`Publishability check failed for PT ${ptId}: ${err}`);
        details.push({
          code: entry.data['code'] as string || entry.externalKey,
          name: entry.data['name'] as string || entry.externalKey,
          canPublish: false,
          errors: [{ code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : String(err) }],
        });
      }
    }

    return {
      totalProductTypes: details.length,
      publishable: details.filter(d => d.canPublish).length,
      notPublishable: details.filter(d => !d.canPublish).length,
      details,
    };
  }
}
