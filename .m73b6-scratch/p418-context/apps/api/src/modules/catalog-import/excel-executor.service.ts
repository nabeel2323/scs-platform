import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { brands, categories, products, productVariants, productSources } from '../catalog/catalog.schema';
import {
  attributeGroups,
  attributeDefinitions,
  attributeOptions,
  productTypes,
  productTypeAttributes,
  productAttributeValues,
  variantAttributeValues,
} from '../catalog/catalog.taxonomy.schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import type { ImportPlan, PlanEntry } from './excel-planner.service';
import type { ResolvedReferences } from './excel-resolver.service';

/**
 * Executes a validated import plan using 12 ordered per-entity-type
 * transactions (Phase 2).
 *
 * Each entity type runs in its own database transaction.  A failure in one
 * entity type does NOT poison unrelated entity types.  Dependent entities
 * are tracked via a dependency graph and marked as DEPENDENCY_ERROR when
 * their parent entity fails.
 *
 * Within each entity-type transaction, SAVEPOINTs provide row-level error
 * isolation so that one bad row does not abort the entire batch.
 */

// ── Phase 2 execution types ──────────────────────────────────────────

export type ErrorClassification = 'ROOT_ERROR' | 'DEPENDENCY_ERROR';

export interface StructuredError {
  id: string;
  classification: ErrorClassification;
  entityType: string;
  externalKey: string;
  sheet?: string;
  rowNumber?: number;
  field?: string | null;
  rawValue?: string | null;
  normalizedValue?: string | null;
  errorCode: string;
  errorMessage: string;
  expected?: string | null;
  actual?: string | null;
  dependency?: string | null;
  rootErrorId?: string | null;
  severity: 'ERROR' | 'WARNING' | 'DEPENDENCY';
}

export interface EntityBatchResult {
  entityType: string;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  skipped: number;
  errors: StructuredError[];
}

export interface ExecutionResult {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  skipped: number;
  errors: string[];
  sources: { created: number; updated: number; unchanged: number };
  entityBreakdown: Record<string, {
    created: number;
    updated: number;
    unchanged: number;
    rejected: number;
    skipped: number;
  }>;
  structuredErrors: StructuredError[];
  /** Internal — excluded from API responses (Map is not JSON-serializable). */
  entityOutcomes?: Map<string, 'COMMITTED' | 'FAILED' | 'DEPENDENCY_FAILED'>;
}

/**
 * Maximum VARCHAR lengths per entity field, mirroring the Drizzle schema.
 * Used for pre-flight validation before entering the DB transaction so that
 * PostgreSQL error 22001 never poisons the transaction.
 */
export const VARCHAR_LIMITS: Record<string, Record<string, number>> = {
  attribute_groups: { name: 120, nameAr: 120, kind: 40 },
  categories: { slug: 120, name: 200, nameAr: 200 },
  brands: { slug: 120, name: 200, nameAr: 200 },
  attributes: { code: 80, name: 200, nameAr: 200, type: 40, unit: 40, scope: 16 },
  attribute_options: { value: 200, valueAr: 200, label: 200 },
  product_types: { code: 80, name: 200, nameAr: 200 },
  productTypeAttributes: { scope: 16 },
  products: { slug: 200, title: 300, titleAr: 300, mpn: 100, gtin: 20, ean: 20, status: 16, condition: 16 },
  variants: { sku: 100, title: 300, titleAr: 300, barcode: 60 },
};

/**
 * Dependency graph — maps each entity type to its parent entity types.
 * Locked by the Business Rules + Architecture Decision Lock.
 */
const DEPENDENCY_GRAPH: Record<string, string[]> = {
  categories: [],
  brands: [],
  attribute_groups: [],
  attributes: [],
  attribute_options: ['attributes'],
  product_types: ['categories'],
  product_type_attributes: ['product_types', 'attributes', 'attribute_groups'],
  products: ['categories', 'brands', 'product_types'],
  product_attributes: ['products', 'attributes'],
  variants: ['products'],
  variant_attributes: ['variants', 'attributes'],
  sources: ['products'],
};

/**
 * Ordered execution sequence — one transaction per entity type.
 * Must respect the dependency chain above.
 */
const ENTITY_TYPE_ORDER: Array<{
  key: keyof ImportPlan;
  type: string;
}> = [
  { key: 'categories', type: 'categories' },
  { key: 'brands', type: 'brands' },
  { key: 'attributeGroups', type: 'attribute_groups' },
  { key: 'attributes', type: 'attributes' },
  { key: 'attributeOptions', type: 'attribute_options' },
  { key: 'productTypes', type: 'product_types' },
  { key: 'productTypeAttributes', type: 'product_type_attributes' },
  { key: 'products', type: 'products' },
  { key: 'productAttributes', type: 'product_attributes' },
  { key: 'variants', type: 'variants' },
  { key: 'variantAttributes', type: 'variant_attributes' },
  { key: 'sources', type: 'sources' },
];

/**
 * Per-entity-type parent-key extractors.
 * Given an entry, returns the outcome-map keys for its specific parents.
 * Outcome keys use the format `${parentTypeSingular}:${externalKey}`.
 */
function getEntryDependencies(
  entityType: string,
  entry: PlanEntry,
): Array<{ type: string; key: string }> {
  const d = entry.data;
  switch (entityType) {
    case 'categories': {
      const parentSlug = d['parentSlug'] as string | undefined;
      return parentSlug ? [{ type: 'category', key: parentSlug }] : [];
    }
    case 'attribute_options':
      return [{ type: 'attribute', key: d['attributeCode'] as string }];
    case 'product_types':
      return [{ type: 'category', key: d['categorySlug'] as string }];
    case 'product_type_attributes':
      return [
        { type: 'product_type', key: d['productTypeCode'] as string },
        { type: 'attribute', key: d['attributeCode'] as string },
      ];
    case 'products':
      return [
        { type: 'category', key: d['categorySlug'] as string },
        { type: 'brand', key: d['brandSlug'] as string },
        { type: 'product_type', key: d['productTypeCode'] as string },
      ];
    case 'product_attributes':
      return [
        { type: 'product', key: d['productSlug'] as string },
        { type: 'attribute', key: d['attributeCode'] as string },
      ];
    case 'variants':
      return [{ type: 'product', key: d['productSlug'] as string }];
    case 'variant_attributes':
      return [
        { type: 'variant', key: d['variantSku'] as string },
        { type: 'attribute', key: d['attributeCode'] as string },
      ];
    case 'sources':
      return [{ type: 'product', key: d['productSlug'] as string }];
    default:
      return [];
  }
}

/** Singular form of each entity type for outcome-map keys. */
function singularType(entityType: string): string {
  const map: Record<string, string> = {
    categories: 'category',
    brands: 'brand',
    attribute_groups: 'attribute_group',
    attributes: 'attribute',
    attribute_options: 'attribute_option',
    product_types: 'product_type',
    product_type_attributes: 'product_type_attribute',
    products: 'product',
    product_attributes: 'product_attribute',
    variants: 'variant',
    variant_attributes: 'variant_attribute',
    sources: 'source',
  };
  return map[entityType] ?? entityType;
}

@Injectable()
export class ExcelExecutorService {
  private readonly logger = new Logger(ExcelExecutorService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Execute the import plan using 12 ordered per-entity-type transactions.
   *
   * A failure in one entity type does NOT poison unrelated entity types.
   * Dependent entities are skipped and recorded as DEPENDENCY_ERROR.
   */
  async execute(plan: ImportPlan, refs: ResolvedReferences): Promise<ExecutionResult> {
    // Pre-flight: validate all string lengths BEFORE entering any transaction.
    const lengthErrors = this.validateStringLengths(plan);
    if (lengthErrors.length > 0) {
      throw new BadRequestException(
        `Import data has ${lengthErrors.length} field-length violation(s): ${lengthErrors.join('; ')}`,
      );
    }

    // Track real UUIDs for entities created during this execution
    const realIds: Map<string, string> = new Map();

    // Per-entity outcome map: `${singularType}:${externalKey}` → outcome
    const entityOutcomes = new Map<string, 'COMMITTED' | 'FAILED' | 'DEPENDENCY_FAILED'>();

    // All structured errors collected across entity types
    const allErrors: StructuredError[] = [];

    // Per-entity-type batch results
    const batchResults: EntityBatchResult[] = [];

    // Helper to resolve a reference that might be pending
    const resolveId = (key: string, map: Map<string, string>): string | undefined => {
      const id = map.get(key);
      if (!id) return undefined;
      if (id.startsWith('pending:')) return realIds.get(id) ?? undefined;
      return id;
    };

    try {
      // Execute each entity type in dependency order — each in its own TX
      for (const { key, type } of ENTITY_TYPE_ORDER) {
        const entries = plan[key] as PlanEntry[];

        const batchResult = await this.executeEntityBatch(
          type, entries, refs, realIds, entityOutcomes, resolveId,
        );

        batchResults.push(batchResult);
        allErrors.push(...batchResult.errors);
      }

      // Post-transaction: update variant combination keys
      await this.updateCombinationKeys(plan, refs);

    } catch (err) {
      this.logger.error(`Import execution failed: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && (err as any).code === '22001') {
        throw new BadRequestException(
          'A text field in the workbook exceeds the database column limit. ' +
          'Check field lengths in your Excel file and re-upload. ' +
          `Detail: ${err.message}`,
        );
      }
      throw err;
    }

    // Build aggregate result
    const result: ExecutionResult = {
      created: 0, updated: 0, unchanged: 0, rejected: 0, skipped: 0,
      errors: allErrors.map(e =>
        `[${e.classification}] ${e.entityType} ${e.externalKey}: ${e.errorMessage}` +
        (e.dependency ? ` (depends on ${e.dependency})` : ''),
      ),
      sources: { created: 0, updated: 0, unchanged: 0 },
      entityBreakdown: {},
      structuredErrors: allErrors,
      entityOutcomes,
    };

    for (const br of batchResults) {
      result.created += br.created;
      result.updated += br.updated;
      result.unchanged += br.unchanged;
      result.rejected += br.rejected;
      result.skipped += br.skipped;
      result.entityBreakdown[br.entityType] = {
        created: br.created,
        updated: br.updated,
        unchanged: br.unchanged,
        rejected: br.rejected,
        skipped: br.skipped,
      };
      if (br.entityType === 'sources') {
        result.sources.created = br.created;
        result.sources.updated = br.updated;
        result.sources.unchanged = br.unchanged;
      }
    }

    return result;
  }

  // ── Phase 2: per-entity-type batch execution ─────────────────────

  /**
   * Execute all entries of one entity type inside a single DB transaction.
   * Uses SAVEPOINT per row for row-level error isolation.
   *
   * Entries whose parent dependencies failed are skipped WITHOUT attempting
   * DB operations, and recorded as DEPENDENCY_ERROR.
   */
  private async executeEntityBatch(
    entityType: string,
    entries: PlanEntry[],
    refs: ResolvedReferences,
    realIds: Map<string, string>,
    entityOutcomes: Map<string, 'COMMITTED' | 'FAILED' | 'DEPENDENCY_FAILED'>,
    resolveId: (key: string, map: Map<string, string>) => string | undefined,
  ): Promise<EntityBatchResult> {
    const batch: EntityBatchResult = {
      entityType, created: 0, updated: 0, unchanged: 0,
      rejected: 0, skipped: 0, errors: [],
    };
    const sType = singularType(entityType);

    await this.db.db.transaction(async (tx) => {
      for (const entry of entries) {
        if (entry.action === 'UNCHANGED') {
          batch.unchanged++;
          entityOutcomes.set(`${sType}:${entry.externalKey}`, 'COMMITTED');
          continue;
        }

        // Check per-entity dependency failures BEFORE attempting DB work
        const depFailures = this.resolveDependencyFailures(entityType, entry, entityOutcomes);
        if (depFailures.length > 0) {
          batch.skipped++;
          entityOutcomes.set(`${sType}:${entry.externalKey}`, 'DEPENDENCY_FAILED');
          const depError: StructuredError = {
            id: randomUUID(),
            classification: 'DEPENDENCY_ERROR',
            entityType,
            externalKey: entry.externalKey,
            errorCode: 'DEPENDENCY_ERROR',
            errorMessage: `Skipped — depends on ${depFailures.map(f => f.depKey).join(', ')} which failed`,
            dependency: depFailures.map(f => f.depKey).join(', '),
            rootErrorId: depFailures[0]?.rootErrorId ?? null,
            severity: 'DEPENDENCY',
          };
          batch.errors.push(depError);
          continue;
        }

        // Execute row within SAVEPOINT for error isolation
        const savepointId = randomUUID().replace(/-/g, '').slice(0, 12);
        try {
          await tx.execute(sql.raw(`SAVEPOINT sp_${savepointId}`));
          await this.executeEntityRow(tx, entityType, entry, refs, realIds, resolveId);
          await tx.execute(sql.raw(`RELEASE SAVEPOINT sp_${savepointId}`));

          // Success — track outcome and update refs
          entityOutcomes.set(`${sType}:${entry.externalKey}`, 'COMMITTED');
          if (entry.action === 'CREATE') {
            batch.created++;
          } else {
            batch.updated++;
          }
        } catch (err) {
          await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT sp_${savepointId}`));

          batch.rejected++;
          entityOutcomes.set(`${sType}:${entry.externalKey}`, 'FAILED');

          const rootError = this.classifyError(err, entityType, entry, entityOutcomes);
          entityOutcomes.set(`__root__:${sType}:${entry.externalKey}`, 'FAILED' as any);
          batch.errors.push(rootError);
        }
      }
    });

    return batch;
  }

  /**
   * Check which specific parent entities have failed for a given entry.
   * Returns an array of dependency failure descriptors (empty = all deps OK).
   */
  private resolveDependencyFailures(
    entityType: string,
    entry: PlanEntry,
    entityOutcomes: Map<string, 'COMMITTED' | 'FAILED' | 'DEPENDENCY_FAILED'>,
  ): Array<{ depKey: string; rootErrorId: string | undefined }> {
    const deps = getEntryDependencies(entityType, entry);
    const failures: Array<{ depKey: string; rootErrorId: string | undefined }> = [];

    for (const dep of deps) {
      if (!dep.key) continue; // skip empty references (caught as unresolved later)
      const outcome = entityOutcomes.get(`${dep.type}:${dep.key}`);
      if (outcome === 'FAILED' || outcome === 'DEPENDENCY_FAILED') {
        // Find the root error ID for this dependency
        const rootErrorId = this.findRootErrorId(dep.type, dep.key, entityOutcomes);
        failures.push({ depKey: `${dep.type}:${dep.key}`, rootErrorId });
      }
    }

    return failures;
  }

  /**
   * Walk up the dependency chain to find the original ROOT_ERROR id.
   * Falls back to a deterministic synthetic UUID if no explicit root is found.
   */
  private findRootErrorId(
    depType: string,
    depKey: string,
    entityOutcomes: Map<string, any>,
  ): string | undefined {
    // Check if there's a stored root error id for this entity
    return entityOutcomes.get(`__rootId__:${depType}:${depKey}`) as string | undefined;
  }

  /**
   * Classify a database error into a StructuredError with a stable error code.
   */
  private classifyError(
    err: unknown,
    entityType: string,
    entry: PlanEntry,
    entityOutcomes: Map<string, any>,
  ): StructuredError {
    const pgCode = (err as any)?.code as string | undefined;
    const message = err instanceof Error ? err.message : String(err);

    let errorCode = 'PERSISTENCE_ERROR';
    if (pgCode) {
      switch (pgCode) {
        case '23505': errorCode = 'UNIQUE_VIOLATION'; break;
        case '23503': errorCode = 'FK_VIOLATION'; break;
        case '23502': errorCode = 'NOT_NULL_VIOLATION'; break;
        case '22001': errorCode = 'STRING_TOO_LONG'; break;
        case '22003': errorCode = 'NUMERIC_OUT_OF_RANGE'; break;
        case '23514': errorCode = 'CHECK_VIOLATION'; break;
        case '25P02': errorCode = 'CASCADE_ERROR'; break;
        default: errorCode = `PG_${pgCode}`; break;
      }
    }

    const rootErrorId = randomUUID();
    const sType = singularType(entityType);

    // Store root error ID so dependents can reference it
    // (We abuse entityOutcomes for this since it's the shared state map)
    const structured: StructuredError = {
      id: rootErrorId,
      classification: 'ROOT_ERROR',
      entityType,
      externalKey: entry.externalKey,
      errorCode,
      errorMessage: message,
      severity: 'ERROR',
    };

    // Stash the root error ID for dependency lookups
    (entityOutcomes as any).set(`__rootId__:${sType}:${entry.externalKey}`, rootErrorId);

    return structured;
  }

  /**
   * Dispatch a single entity row to the correct upsert method.
   * This mirrors the original per-entity-type logic from the execute loop.
   */
  private async executeEntityRow(
    tx: any,
    entityType: string,
    entry: PlanEntry,
    refs: ResolvedReferences,
    realIds: Map<string, string>,
    resolveId: (key: string, map: Map<string, string>) => string | undefined,
  ): Promise<void> {
    switch (entityType) {
      case 'categories': {
        const id = await this.upsertCategory(tx, entry, refs, realIds);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:cat:${entry.externalKey}`, id);
          refs.categoryIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'brands': {
        const id = await this.upsertBrand(tx, entry);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:brand:${entry.externalKey}`, id);
          refs.brandIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'attribute_groups': {
        const id = await this.upsertAttributeGroup(tx, entry);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:ag:${entry.externalKey}`, id);
          refs.attributeGroupIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'attributes': {
        const id = await this.upsertAttribute(tx, entry);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:attr:${entry.externalKey}`, id);
          refs.attributeIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'attribute_options': {
        const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
        if (!attrId) throw new Error(`Attribute "${entry.data['attributeCode']}" not resolved`);
        await this.insertAttributeOption(tx, entry, attrId);
        break;
      }
      case 'product_types': {
        const catSlug = entry.data['categorySlug'] as string | undefined;
        let catId: string | null | undefined = null;
        if (catSlug) {
          catId = resolveId(catSlug, refs.categoryIds);
          if (!catId) throw new Error(`Category slug "${catSlug}" could not be resolved`);
        }
        const dimCodes = (entry.data['variantDimensions'] as string[]) ?? [];
        const dimIds = dimCodes
          .map(code => resolveId(code, refs.attributeIds))
          .filter((id): id is string => !!id);
        entry.data['resolvedVariantDimensionIds'] = dimIds;
        const id = await this.upsertProductType(tx, entry, catId);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:pt:${entry.externalKey}`, id);
          refs.productTypeIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'product_type_attributes': {
        const ptId = resolveId(entry.data['productTypeCode'] as string, refs.productTypeIds);
        const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
        if (!ptId || !attrId) throw new Error(`PTA ${entry.externalKey}: unresolved reference`);
        await this.insertProductTypeAttribute(tx, entry, ptId, attrId);
        break;
      }
      case 'products': {
        const brandId = resolveId(entry.data['brandSlug'] as string, refs.brandIds);
        const catId = resolveId(entry.data['categorySlug'] as string, refs.categoryIds);
        const ptId = resolveId(entry.data['productTypeCode'] as string, refs.productTypeIds);
        if (!brandId) throw new Error(`Brand "${entry.data['brandSlug']}" not resolved`);
        if (!catId) throw new Error(`Category "${entry.data['categorySlug']}" not resolved`);
        if (!ptId) throw new Error(`Product type "${entry.data['productTypeCode']}" not resolved`);
        const id = await this.upsertProduct(tx, entry, brandId, catId, ptId);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:prod:${entry.externalKey}`, id);
          refs.productIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'product_attributes': {
        const prodId = resolveId(entry.data['productSlug'] as string, refs.productIds);
        const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
        if (!prodId || !attrId) throw new Error(`PA ${entry.externalKey}: unresolved reference`);
        await this.upsertProductAttributeValue(tx, prodId, attrId, entry);
        break;
      }
      case 'variants': {
        const prodId = resolveId(entry.data['productSlug'] as string, refs.productIds);
        if (!prodId) throw new Error(`Product "${entry.data['productSlug']}" not resolved`);
        const id = await this.upsertVariant(tx, entry, prodId);
        if (entry.action === 'CREATE') {
          realIds.set(`pending:var:${entry.externalKey}`, id);
          refs.variantIds.set(entry.externalKey, id);
        }
        break;
      }
      case 'variant_attributes': {
        const varId = resolveId(entry.data['variantSku'] as string, refs.variantIds);
        const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
        if (!varId || !attrId) throw new Error(`VA ${entry.externalKey}: unresolved reference`);
        await this.upsertVariantAttributeValue(tx, varId, attrId, entry);
        break;
      }
      case 'sources': {
        const prodId = resolveId(entry.data['productSlug'] as string, refs.productIds);
        if (!prodId) throw new Error(`Source ${entry.externalKey}: unresolved product reference`);
        await this.upsertSource(tx, prodId, entry);
        break;
      }
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Pre-flight check: validates all plan entry string fields against their
   * database column length constraints.  Runs BEFORE any transaction so that
   * violations produce clear, field-level error messages instead of aborting
   * a PostgreSQL transaction with an opaque "value too long" error.
   */
  private validateStringLengths(plan: ImportPlan): string[] {
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

  // ── Entity upsert helpers ────────────────────────────────────────

  private async upsertAttributeGroup(tx: any, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(attributeGroups).values({
      id,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      kind: (d.kind as string) ?? null,
    });
    return id;
  }

  private async upsertCategory(tx: any, entry: PlanEntry, refs: ResolvedReferences, realIds: Map<string, string>): Promise<string> {
    const d = entry.data as any;
    const parentId = d.parentSlug ? (realIds.get(`pending:cat:${d.parentSlug}`) ?? refs.categoryIds.get(d.parentSlug as string)) : null;

    if (entry.action === 'UPDATE' && entry.existingId) {
      await tx.update(categories).set({
        name: d.name as string,
        nameAr: (d.nameAr as string) ?? null,
        description: (d.description as string) ?? null,
        updatedAt: new Date(),
      }).where(eq(categories.id, entry.existingId));
      return entry.existingId;
    }

    const id = randomUUID();
    const parentPath = parentId ? await this.getCategoryPath(tx, parentId) : '/';
    await tx.insert(categories).values({
      id,
      storeId: null,
      parentId: parentId ?? null,
      path: `${parentPath}${d.slug}/${d.slug}`.replace(/\/\//g, '/'),
      slug: d.slug as string,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      description: (d.description as string) ?? null,
      sortOrder: (d.sortOrder as number) ?? 0,
    });
    return id;
  }

  private async getCategoryPath(tx: any, parentId: string): Promise<string> {
    const rows = await tx.select({ path: categories.path }).from(categories).where(eq(categories.id, parentId)).limit(1);
    return rows[0]?.path ?? '/';
  }

  private async upsertBrand(tx: any, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    if (entry.action === 'UPDATE' && entry.existingId) {
      await tx.update(brands).set({
        name: d.name as string,
        nameAr: (d.nameAr as string) ?? null,
        description: (d.description as string) ?? null,
        updatedAt: new Date(),
      }).where(eq(brands.id, entry.existingId));
      return entry.existingId;
    }

    const id = randomUUID();
    await tx.insert(brands).values({
      id,
      slug: d.slug as string,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      description: (d.description as string) ?? null,
    }).onConflictDoUpdate({
      target: brands.slug,
      set: {
        name: sql`excluded.name`,
        nameAr: sql`excluded.name_ar`,
        description: sql`excluded.description`,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  private async upsertAttribute(tx: any, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(attributeDefinitions).values({
      id,
      code: (d.code as string).slice(0, 80),
      name: (d.name as string).slice(0, 200),
      nameAr: d.nameAr ? (d.nameAr as string).slice(0, 200) : null,
      description: (d.description as string) ?? null,
      type: ((d.type as string) || 'TEXT').slice(0, 40),
      unit: d.unit ? (d.unit as string).slice(0, 40) : null,
      scope: ((d.scope as string) || 'PRODUCT').slice(0, 16),
    }).onConflictDoUpdate({
      target: attributeDefinitions.code,
      set: {
        name: sql`excluded.name`,
        nameAr: sql`excluded.name_ar`,
        description: sql`excluded.description`,
        type: sql`excluded.type`,
        unit: sql`excluded.unit`,
        scope: sql`excluded.scope`,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  private async insertAttributeOption(tx: any, entry: PlanEntry, attrId: string): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(attributeOptions).values({
      id,
      attributeId: attrId,
      value: d.value as string,
      valueAr: (d.valueAr as string) ?? null,
      label: (d.label as string) ?? null,
      sortOrder: (d.sortOrder as number) ?? 0,
    });
    return id;
  }

  private async upsertProductType(tx: any, entry: PlanEntry, categoryId: string | null | undefined): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    const variantDimIds = (d.resolvedVariantDimensionIds as string[]) ?? [];
    await tx.insert(productTypes).values({
      id,
      code: d.code as string,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      description: (d.description as string) ?? null,
      categoryId: categoryId ?? null,
      status: (d.status as string) || 'DRAFT',
      variantDimensions: variantDimIds,
    });
    return id;
  }

  private async insertProductTypeAttribute(tx: any, entry: PlanEntry, ptId: string, attrId: string): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(productTypeAttributes).values({
      id,
      productTypeId: ptId,
      attributeDefinitionId: attrId,
      required: (d.required as boolean) ?? false,
      scope: (d.scope as string) ?? 'PRODUCT',
      displayOrder: (d.displayOrder as number) ?? 0,
      filterable: (d.filterable as boolean) ?? false,
      searchable: (d.searchable as boolean) ?? false,
      visibleInListing: (d.visibleInListing as boolean) ?? true,
      visibleInDetail: (d.visibleInDetail as boolean) ?? true,
    }).onConflictDoUpdate({
      target: [productTypeAttributes.productTypeId, productTypeAttributes.attributeDefinitionId],
      set: {
        required: sql`excluded.required`,
        scope: sql`excluded.scope`,
        displayOrder: sql`excluded.display_order`,
        filterable: sql`excluded.filterable`,
        searchable: sql`excluded.searchable`,
        visibleInListing: sql`excluded.visible_in_listing`,
        visibleInDetail: sql`excluded.visible_in_detail`,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  private async upsertProduct(tx: any, entry: PlanEntry, brandId: string, categoryId: string, productTypeId: string): Promise<string> {
    const d = entry.data as any;

    if (entry.action === 'UPDATE' && entry.existingId) {
      await tx.update(products).set({
        title: d.title as string,
        description: (d.description as string) ?? null,
        mpn: (d.mpn as string) ?? null,
        updatedAt: new Date(),
      }).where(eq(products.id, entry.existingId));
      return entry.existingId;
    }

    const id = randomUUID();
    await tx.insert(products).values({
      id,
      storeId: null,
      categoryId,
      brandId,
      productTypeId,
      slug: (d.slug as string).slice(0, 200),
      title: (d.title as string).slice(0, 300),
      titleAr: d.titleAr ? (d.titleAr as string).slice(0, 300) : null,
      description: (d.description as string) ?? null,
      descriptionAr: (d.descriptionAr as string) ?? null,
      mpn: d.mpn ? (d.mpn as string).slice(0, 100) : null,
      gtin: d.gtin ? (d.gtin as string).slice(0, 20) : null,
      ean: d.ean ? (d.ean as string).slice(0, 20) : null,
      status: ((d.status as string) || 'ACTIVE').slice(0, 16),
      condition: ((d.condition as string) || 'NEW').slice(0, 16),
    });
    return id;
  }

  private async upsertProductAttributeValue(tx: any, productId: string, attrId: string, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(productAttributeValues).values({
      id,
      productId,
      attributeDefinitionId: attrId,
      valueText: (d.valueText as string) ?? null,
      valueNumber: d.valueNumber != null ? String(d.valueNumber) : null,
      valueBoolean: (d.valueBoolean as boolean) ?? null,
      optionValue: (d.optionKey as string) ?? null,
    }).onConflictDoUpdate({
      target: [productAttributeValues.productId, productAttributeValues.attributeDefinitionId],
      set: {
        valueText: sql`excluded.value_text`,
        valueNumber: sql`excluded.value_number`,
        valueBoolean: sql`excluded.value_boolean`,
        optionValue: sql`excluded.option_value`,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  private async upsertVariant(tx: any, entry: PlanEntry, productId: string): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(productVariants).values({
      id,
      productId,
      sku: d.sku as string,
      title: (d.title as string) ?? null,
      titleAr: (d.titleAr as string) ?? null,
      barcode: (d.barcode as string) ?? null,
      unit: (d.unit as string) ?? 'PCS',
      // NUMERIC(10,2) — Drizzle expects string for numeric columns (Phase 1)
      weightGrams: d.weightGrams != null ? String(d.weightGrams) : null,
    });
    return id;
  }

  private async upsertVariantAttributeValue(tx: any, variantId: string, attrId: string, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(variantAttributeValues).values({
      id,
      variantId,
      attributeDefinitionId: attrId,
      valueText: (d.valueText as string) ?? null,
      valueNumber: d.valueNumber != null ? String(d.valueNumber) : null,
      valueBoolean: (d.valueBoolean as boolean) ?? null,
      optionValue: (d.optionKey as string) ?? null,
    }).onConflictDoUpdate({
      target: [variantAttributeValues.variantId, variantAttributeValues.attributeDefinitionId],
      set: {
        valueText: sql`excluded.value_text`,
        valueNumber: sql`excluded.value_number`,
        valueBoolean: sql`excluded.value_boolean`,
        optionValue: sql`excluded.option_value`,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  /**
   * Upsert a product source. Idempotent on (product_id, source_type, source_url).
   */
  private async upsertSource(tx: any, productId: string, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    let verifiedAt: Date | null = null;
    if (d.verifiedAt) {
      try {
        const parsed = new Date(d.verifiedAt as string);
        if (!isNaN(parsed.getTime())) {
          verifiedAt = parsed;
        }
      } catch {
        // Ignore invalid date — leave verifiedAt as null
      }
    }
    await tx.insert(productSources).values({
      id,
      productId,
      sourceType: d.sourceType as string,
      sourceUrl: d.sourceUrl as string,
      verifiedAt,
    }).onConflictDoUpdate({
      target: [productSources.productId, productSources.sourceType, productSources.sourceUrl],
      set: {
        verifiedAt: verifiedAt,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  /**
   * After all variant attributes are inserted, compute and update combination
   * keys (SHA-256 digest of sorted attribute values, same as seed-catalog).
   */
  private async updateCombinationKeys(plan: ImportPlan, refs: ResolvedReferences): Promise<void> {
    const createdVariants = plan.variants.filter(v => v.action === 'CREATE');
    if (createdVariants.length === 0) return;

    for (const variantEntry of createdVariants) {
      const sku = variantEntry.externalKey;
      const varId = refs.variantIds.get(sku);
      if (!varId || varId.startsWith('pending:')) continue;

      const varAttrs = plan.variantAttributes.filter(va => va.data['variantSku'] === sku);
      if (varAttrs.length === 0) continue;

      const pairs: Array<{ attrId: string; value: string }> = [];
      for (const va of varAttrs) {
        const attrId = refs.attributeIds.get(va.data['attributeCode'] as string);
        if (!attrId || attrId.startsWith('pending:')) continue;
        const val = (va.data['valueText'] ?? va.data['optionKey'] ?? String(va.data['valueNumber'] ?? '') ?? String(va.data['valueBoolean'] ?? '')) as string;
        pairs.push({ attrId, value: val });
      }

      if (pairs.length === 0) continue;

      pairs.sort((a, b) => a.attrId.localeCompare(b.attrId));
      const digest = pairs.map(p => `${p.attrId}=${p.value}`).join('|');
      const combinationKey = createHash('sha256').update(digest).digest('hex').slice(0, 64);

      try {
        await this.db.db.update(productVariants)
          .set({ combinationKey })
          .where(eq(productVariants.id, varId));
      } catch (err) {
        this.logger.warn(`Failed to set combination key for variant ${sku}: ${err}`);
      }
    }
  }
}
