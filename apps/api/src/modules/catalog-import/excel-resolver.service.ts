import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { brands, categories, products, productVariants } from '../catalog/catalog.schema';
import { attributeDefinitions, attributeOptions, productTypes } from '../catalog/catalog.taxonomy.schema';
import { isNull, eq } from 'drizzle-orm';
import type { ParsedWorkbook } from './excel-parser.service';

/**
 * Resolves external keys (slugs/codes) from Excel to internal UUIDs.
 *
 * Batch-loads all referenced entities from the database and builds in-memory
 * lookup maps.  Also tracks entities created earlier in the same import so
 * that cross-references within a single workbook resolve correctly.
 */

export interface ResolvedReferences {
  brandIds: Map<string, string>;          // slug -> UUID
  categoryIds: Map<string, string>;       // slug -> UUID
  attributeIds: Map<string, string>;      // code -> UUID
  attributeOptions: Map<string, Map<string, string>>; // attrCode -> (value -> UUID)
  productTypeIds: Map<string, string>;    // code -> UUID
  productIds: Map<string, string>;        // slug -> UUID
  variantIds: Map<string, string>;        // sku -> UUID
  attributeTypes: Map<string, string>;    // code -> type
}

@Injectable()
export class ExcelResolverService {
  private readonly logger = new Logger(ExcelResolverService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Build a complete reference map from the database + pending import data.
   */
  async resolve(workbook: ParsedWorkbook): Promise<ResolvedReferences> {
    const refs: ResolvedReferences = {
      brandIds: new Map(),
      categoryIds: new Map(),
      attributeIds: new Map(),
      attributeOptions: new Map(),
      productTypeIds: new Map(),
      productIds: new Map(),
      variantIds: new Map(),
      attributeTypes: new Map(),
    };

    // Batch load all existing entities
    const [brandRows, categoryRows, attrRows, optRows, ptRows, prodRows, varRows] = await Promise.all([
      this.db.db.select({ id: brands.id, slug: brands.slug }).from(brands),
      this.db.db.select({ id: categories.id, slug: categories.slug, storeId: categories.storeId }).from(categories),
      this.db.db.select({ id: attributeDefinitions.id, code: attributeDefinitions.code, type: attributeDefinitions.type }).from(attributeDefinitions),
      this.db.db.select({ id: attributeOptions.id, attributeId: attributeOptions.attributeId, value: attributeOptions.value }).from(attributeOptions),
      this.db.db.select({ id: productTypes.id, code: productTypes.code }).from(productTypes),
      this.db.db.select({ id: products.id, slug: products.slug, storeId: products.storeId }).from(products),
      this.db.db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants),
    ]);

    // Build lookup maps from DB
    for (const r of brandRows) refs.brandIds.set(r.slug, r.id);
    for (const r of categoryRows) {
      // Only platform-level categories (store_id IS NULL)
      if (!r.storeId) refs.categoryIds.set(r.slug, r.id);
    }
    for (const r of attrRows) {
      refs.attributeIds.set(r.code, r.id);
      refs.attributeTypes.set(r.code, r.type);
    }

    // Build option map: attrCode -> (value -> optionId)
    const attrIdToCode = new Map<string, string>();
    for (const [code, id] of refs.attributeIds) attrIdToCode.set(id, code);

    for (const r of optRows) {
      const code = attrIdToCode.get(r.attributeId);
      if (code) {
        if (!refs.attributeOptions.has(code)) refs.attributeOptions.set(code, new Map());
        refs.attributeOptions.get(code)!.set(r.value, r.id);
      }
    }

    for (const r of ptRows) refs.productTypeIds.set(r.code, r.id);
    for (const r of prodRows) {
      // Only canonical products (store_id IS NULL)
      if (!r.storeId) refs.productIds.set(r.slug, r.id);
    }
    for (const r of varRows) refs.variantIds.set(r.sku, r.id);

    // Pre-register entities being created in this import (from earlier sheets)
    this.registerPendingEntities(workbook, refs);

    this.logger.log(
      `Resolved references: ${refs.brandIds.size} brands, ${refs.categoryIds.size} categories, ` +
      `${refs.attributeIds.size} attributes, ${refs.productTypeIds.size} product types, ` +
      `${refs.productIds.size} products, ${refs.variantIds.size} variants`,
    );

    return refs;
  }

  /**
   * Pre-register entities from the import workbook so cross-sheet references
   * within the same import resolve correctly.
   */
  private registerPendingEntities(workbook: ParsedWorkbook, refs: ResolvedReferences): void {
    // Categories from the import
    const catSheet = workbook.sheets.get('categories');
    if (catSheet) {
      for (const row of catSheet.rows) {
        const slug = row['slug'];
        if (slug && !refs.categoryIds.has(slug)) {
          // Use a placeholder UUID — will be replaced during execution
          refs.categoryIds.set(slug, `pending:cat:${slug}`);
        }
      }
    }

    // Brands from the import
    const brandSheet = workbook.sheets.get('brands');
    if (brandSheet) {
      for (const row of brandSheet.rows) {
        const slug = row['slug'];
        if (slug && !refs.brandIds.has(slug)) {
          refs.brandIds.set(slug, `pending:brand:${slug}`);
        }
      }
    }

    // Attributes from the import
    const attrSheet = workbook.sheets.get('attributes');
    if (attrSheet) {
      for (const row of attrSheet.rows) {
        const code = row['code'];
        const type = row['type'] ?? 'TEXT';
        if (code && !refs.attributeIds.has(code)) {
          refs.attributeIds.set(code, `pending:attr:${code}`);
          refs.attributeTypes.set(code, type);
        }
      }
    }

    // Product types from the import
    const ptSheet = workbook.sheets.get('product_types');
    if (ptSheet) {
      for (const row of ptSheet.rows) {
        const code = row['code'];
        if (code && !refs.productTypeIds.has(code)) {
          refs.productTypeIds.set(code, `pending:pt:${code}`);
        }
      }
    }

    // Products from the import
    const prodSheet = workbook.sheets.get('products');
    if (prodSheet) {
      for (const row of prodSheet.rows) {
        const slug = row['slug'];
        if (slug && !refs.productIds.has(slug)) {
          refs.productIds.set(slug, `pending:prod:${slug}`);
        }
      }
    }

    // Variants from the import
    const varSheet = workbook.sheets.get('variants');
    if (varSheet) {
      for (const row of varSheet.rows) {
        const sku = row['sku'];
        if (sku && !refs.variantIds.has(sku)) {
          refs.variantIds.set(sku, `pending:var:${sku}`);
        }
      }
    }
  }
}
