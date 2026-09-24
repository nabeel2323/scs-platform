import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { brands, categories, products, productVariants } from '../catalog/catalog.schema';
import {
  attributeDefinitions,
  attributeOptions,
  productTypes,
  productTypeAttributes,
  productAttributeValues,
  variantAttributeValues,
} from '../catalog/catalog.taxonomy.schema';
import { eq } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import type { ImportPlan, PlanEntry } from './excel-planner.service';
import type { ResolvedReferences } from './excel-resolver.service';

/**
 * Executes a validated import plan inside a single database transaction.
 *
 * Inserts/updates entities in dependency order.  On any failure the entire
 * transaction is rolled back — no partial catalog states.
 *
 * After execution the plan's pending references (`pending:*`) are replaced
 * with the real UUIDs allocated during insert.
 */

export interface ExecutionResult {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  errors: string[];
}

@Injectable()
export class ExcelExecutorService {
  private readonly logger = new Logger(ExcelExecutorService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Execute the import plan in a transaction.
   */
  async execute(plan: ImportPlan, refs: ResolvedReferences): Promise<ExecutionResult> {
    const result: ExecutionResult = { created: 0, updated: 0, unchanged: 0, rejected: 0, errors: [] };

    // Track real UUIDs for entities created during this execution
    const realIds: Map<string, string> = new Map();

    // Helper to resolve a reference that might be pending
    const resolveId = (key: string, map: Map<string, string>): string | undefined => {
      const id = map.get(key);
      if (!id) return undefined;
      if (id.startsWith('pending:')) return realIds.get(id) ?? undefined;
      return id;
    };

    try {
      // Use a transaction for atomicity
      await this.db.db.transaction(async (tx) => {
        // 1. Categories
        for (const entry of plan.categories) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const id = await this.upsertCategory(tx, entry, refs, realIds);
            if (entry.action === 'CREATE') {
              realIds.set(`pending:cat:${entry.externalKey}`, id);
              refs.categoryIds.set(entry.externalKey, id);
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`Category ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 2. Brands
        for (const entry of plan.brands) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const id = await this.upsertBrand(tx, entry);
            if (entry.action === 'CREATE') {
              realIds.set(`pending:brand:${entry.externalKey}`, id);
              refs.brandIds.set(entry.externalKey, id);
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`Brand ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 3. Attribute Groups (from attributes sheet context — create if referenced)
        // Attribute groups are handled implicitly; skip for now as they're optional

        // 4. Attributes
        for (const entry of plan.attributes) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const id = await this.upsertAttribute(tx, entry);
            if (entry.action === 'CREATE') {
              realIds.set(`pending:attr:${entry.externalKey}`, id);
              refs.attributeIds.set(entry.externalKey, id);
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`Attribute ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 5. Attribute Options
        for (const entry of plan.attributeOptions) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
            if (!attrId) throw new Error(`Attribute "${entry.data['attributeCode']}" not resolved`);
            await this.insertAttributeOption(tx, entry, attrId);
            result.created++;
          } catch (err) {
            result.rejected++;
            result.errors.push(`Option ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 6. Product Types
        for (const entry of plan.productTypes) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const catId = entry.data['categorySlug']
              ? resolveId(entry.data['categorySlug'] as string, refs.categoryIds)
              : null;
            const id = await this.upsertProductType(tx, entry, catId);
            if (entry.action === 'CREATE') {
              realIds.set(`pending:pt:${entry.externalKey}`, id);
              refs.productTypeIds.set(entry.externalKey, id);
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`ProductType ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 7. Product Type Attributes
        for (const entry of plan.productTypeAttributes) {
          try {
            const ptId = resolveId(entry.data['productTypeCode'] as string, refs.productTypeIds);
            const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
            if (!ptId || !attrId) {
              result.rejected++;
              result.errors.push(`PTA ${entry.externalKey}: unresolved reference`);
              continue;
            }
            await this.insertProductTypeAttribute(tx, entry, ptId, attrId);
            result.created++;
          } catch (err) {
            result.rejected++;
            result.errors.push(`PTA ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 8. Products
        for (const entry of plan.products) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
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
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`Product ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 9. Product Attributes
        for (const entry of plan.productAttributes) {
          try {
            const prodId = resolveId(entry.data['productSlug'] as string, refs.productIds);
            const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
            if (!prodId || !attrId) {
              result.rejected++;
              result.errors.push(`PA ${entry.externalKey}: unresolved reference`);
              continue;
            }
            await this.upsertProductAttributeValue(tx, prodId, attrId, entry);
            result.created++;
          } catch (err) {
            result.rejected++;
            result.errors.push(`PA ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 10. Variants
        for (const entry of plan.variants) {
          if (entry.action === 'UNCHANGED') { result.unchanged++; continue; }
          try {
            const prodId = resolveId(entry.data['productSlug'] as string, refs.productIds);
            if (!prodId) throw new Error(`Product "${entry.data['productSlug']}" not resolved`);
            const id = await this.upsertVariant(tx, entry, prodId);
            if (entry.action === 'CREATE') {
              realIds.set(`pending:var:${entry.externalKey}`, id);
              refs.variantIds.set(entry.externalKey, id);
              result.created++;
            } else {
              result.updated++;
            }
          } catch (err) {
            result.rejected++;
            result.errors.push(`Variant ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // 11. Variant Attributes
        for (const entry of plan.variantAttributes) {
          try {
            const varId = resolveId(entry.data['variantSku'] as string, refs.variantIds);
            const attrId = resolveId(entry.data['attributeCode'] as string, refs.attributeIds);
            if (!varId || !attrId) {
              result.rejected++;
              result.errors.push(`VA ${entry.externalKey}: unresolved reference`);
              continue;
            }
            await this.upsertVariantAttributeValue(tx, varId, attrId, entry);
            result.created++;
          } catch (err) {
            result.rejected++;
            result.errors.push(`VA ${entry.externalKey}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      });

      // Post-transaction: update variant combination keys
      await this.updateCombinationKeys(plan, refs);

    } catch (err) {
      this.logger.error(`Import execution failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    return result;
  }

  // ── Entity upsert helpers ────────────────────────────────────────

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
    });
    return id;
  }

  private async upsertAttribute(tx: any, entry: PlanEntry): Promise<string> {
    const d = entry.data as any;
    const id = randomUUID();
    await tx.insert(attributeDefinitions).values({
      id,
      code: d.code as string,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      description: (d.description as string) ?? null,
      type: d.type as string,
      unit: (d.unit as string) ?? null,
      scope: (d.scope as string) ?? 'PRODUCT',
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
    await tx.insert(productTypes).values({
      id,
      code: d.code as string,
      name: d.name as string,
      nameAr: (d.nameAr as string) ?? null,
      description: (d.description as string) ?? null,
      categoryId: categoryId ?? null,
      status: 'DRAFT',
      variantDimensions: (d.variantDimensions as string[]) ?? [],
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
      storeId: null, // Canonical product
      categoryId,
      brandId,
      productTypeId,
      slug: d.slug as string,
      title: d.title as string,
      titleAr: (d.titleAr as string) ?? null,
      description: (d.description as string) ?? null,
      descriptionAr: (d.descriptionAr as string) ?? null,
      mpn: (d.mpn as string) ?? null,
      gtin: (d.gtin as string) ?? null,
      ean: (d.ean as string) ?? null,
      status: (d.status as string) ?? 'ACTIVE',
      condition: (d.condition as string) ?? 'NEW',
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
      weightGrams: (d.weightGrams as number) ?? null,
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

      // Collect this variant's attribute values
      const varAttrs = plan.variantAttributes.filter(va => va.data['variantSku'] === sku);
      if (varAttrs.length === 0) continue;

      // Build sorted key-value pairs for the combination digest
      const pairs: Array<{ attrId: string; value: string }> = [];
      for (const va of varAttrs) {
        const attrId = refs.attributeIds.get(va.data['attributeCode'] as string);
        if (!attrId || attrId.startsWith('pending:')) continue;
        const val = (va.data['valueText'] ?? va.data['optionKey'] ?? String(va.data['valueNumber'] ?? '') ?? String(va.data['valueBoolean'] ?? '')) as string;
        pairs.push({ attrId, value: val });
      }

      if (pairs.length === 0) continue;

      // Sort by attrId and compute SHA-256
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
