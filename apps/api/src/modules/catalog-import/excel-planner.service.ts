import { Injectable, Logger } from '@nestjs/common';
import type { ParsedWorkbook } from './excel-parser.service';
import type { ResolvedReferences } from './excel-resolver.service';

/**
 * Generates an import plan by comparing workbook data with existing DB state.
 *
 * For each entity, classifies the action as CREATE, UPDATE, or UNCHANGED.
 * The plan is the single source of truth for both the preview UI and the
 * executor — the file is never parsed twice with different logic.
 */

export type PlanAction = 'CREATE' | 'UPDATE' | 'UNCHANGED';

export interface PlanEntry {
  entityType: string;
  externalKey: string;
  action: PlanAction;
  data: Record<string, unknown>;
  existingId?: string;
}

export interface ImportPlan {
  categories: PlanEntry[];
  brands: PlanEntry[];
  attributeGroups: PlanEntry[];
  attributes: PlanEntry[];
  attributeOptions: PlanEntry[];
  productTypes: PlanEntry[];
  productTypeAttributes: PlanEntry[];
  products: PlanEntry[];
  productAttributes: PlanEntry[];
  variants: PlanEntry[];
  variantAttributes: PlanEntry[];
  sources: PlanEntry[];
  summary: {
    totalCreate: number;
    totalUpdate: number;
    totalUnchanged: number;
    byEntity: Record<string, { create: number; update: number; unchanged: number }>;
  };
}

@Injectable()
export class ExcelPlannerService {
  private readonly logger = new Logger(ExcelPlannerService.name);

  /**
   * Build an import plan from parsed workbook data and resolved references.
   *
   * The `existingEntities` parameter provides the current DB state for
   * comparison.  Pending references (prefixed `pending:`) are always CREATE.
   */
  buildPlan(
    workbook: ParsedWorkbook,
    refs: ResolvedReferences,
    existingEntities: ExistingEntityMap,
  ): ImportPlan {
    const plan: ImportPlan = {
      categories: [],
      brands: [],
      attributeGroups: [],
      attributes: [],
      attributeOptions: [],
      productTypes: [],
      productTypeAttributes: [],
      products: [],
      productAttributes: [],
      variants: [],
      variantAttributes: [],
      sources: [],
      summary: { totalCreate: 0, totalUpdate: 0, totalUnchanged: 0, byEntity: {} },
    };

    // Process each entity type in dependency order
    this.planCategories(workbook, refs, existingEntities, plan);
    this.planBrands(workbook, refs, existingEntities, plan);
    this.planAttributeGroups(workbook, refs, plan);
    this.planAttributes(workbook, refs, existingEntities, plan);
    this.planAttributeOptions(workbook, refs, existingEntities, plan);
    this.planProductTypes(workbook, refs, existingEntities, plan);
    this.planProductTypeAttributes(workbook, refs, existingEntities, plan);
    this.planProducts(workbook, refs, existingEntities, plan);
    this.planProductAttributes(workbook, refs, existingEntities, plan);
    this.planVariants(workbook, refs, existingEntities, plan);
    this.planVariantAttributes(workbook, refs, existingEntities, plan);
    this.planSources(workbook, refs, existingEntities, plan);

    // Compute summary
    const entityKeys = ['categories', 'brands', 'attributeGroups', 'attributes', 'attributeOptions', 'productTypes', 'productTypeAttributes', 'products', 'productAttributes', 'variants', 'variantAttributes', 'sources'] as const;
    for (const key of entityKeys) {
      const entries = plan[key] as PlanEntry[] | undefined;
      if (!entries || entries.length === 0) continue;
      const create = entries.filter(e => e.action === 'CREATE').length;
      const update = entries.filter(e => e.action === 'UPDATE').length;
      const unchanged = entries.filter(e => e.action === 'UNCHANGED').length;
      plan.summary.byEntity[key as string] = { create, update, unchanged };
      plan.summary.totalCreate += create;
      plan.summary.totalUpdate += update;
      plan.summary.totalUnchanged += unchanged;
    }

    this.logger.log(
      `Import plan: ${plan.summary.totalCreate} create, ${plan.summary.totalUpdate} update, ${plan.summary.totalUnchanged} unchanged`,
    );

    return plan;
  }

  private planCategories(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('categories');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const slug = row['slug']!;
      const existingId = refs.categoryIds.get(slug);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.categories.push({
          entityType: 'categories',
          externalKey: slug,
          action: 'CREATE',
          data: {
            slug,
            name: row['name']!,
            nameAr: row['name_ar'],
            description: row['description'],
            parentSlug: row['parent_slug'],
            sortOrder: row['sort_order'] ? Number(row['sort_order']) : 0,
          },
        });
      } else {
        const ex = existing.categories.get(slug);
        const changed = ex && (
          ex.name !== row['name'] ||
          (row['name_ar'] ?? '') !== (ex.nameAr ?? '') ||
          (row['description'] ?? '') !== (ex.description ?? '')
        );
        plan.categories.push({
          entityType: 'categories',
          externalKey: slug,
          action: changed ? 'UPDATE' : 'UNCHANGED',
          data: { slug, name: row['name']!, nameAr: row['name_ar'], description: row['description'] },
          existingId,
        });
      }
    }
  }

  private planBrands(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('brands');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const slug = row['slug']!;
      const existingId = refs.brandIds.get(slug);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.brands.push({
          entityType: 'brands',
          externalKey: slug,
          action: 'CREATE',
          data: { slug, name: row['name']!, nameAr: row['name_ar'], description: row['description'] },
        });
      } else {
        const ex = existing.brands.get(slug);
        const changed = ex && (
          ex.name !== row['name'] ||
          (row['name_ar'] ?? '') !== (ex.nameAr ?? '') ||
          (row['description'] ?? '') !== (ex.description ?? '')
        );
        plan.brands.push({
          entityType: 'brands',
          externalKey: slug,
          action: changed ? 'UPDATE' : 'UNCHANGED',
          data: { slug, name: row['name']!, nameAr: row['name_ar'], description: row['description'] },
          existingId,
        });
      }
    }
  }

  private planAttributeGroups(workbook: ParsedWorkbook, refs: ResolvedReferences, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('attribute_groups');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const name = row['name']!;
      const existingId = refs.attributeGroupIds?.get(name);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.attributeGroups.push({
          entityType: 'attribute_groups',
          externalKey: name,
          action: 'CREATE',
          data: {
            name,
            nameAr: row['name_ar'],
            kind: row['kind'],
          },
        });
      } else {
        plan.attributeGroups.push({
          entityType: 'attribute_groups',
          externalKey: name,
          action: 'UNCHANGED',
          data: { name },
          existingId,
        });
      }
    }
  }

  private planAttributes(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('attributes');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const code = row['code']!;
      const existingId = refs.attributeIds.get(code);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.attributes.push({
          entityType: 'attributes',
          externalKey: code,
          action: 'CREATE',
          data: {
            code,
            name: row['name']!,
            nameAr: row['name_ar'],
            description: row['description'],
            type: row['type']!,
            unit: row['unit'],
            scope: row['scope'] ?? 'PRODUCT',
          },
        });
      } else {
        plan.attributes.push({
          entityType: 'attributes',
          externalKey: code,
          action: 'UNCHANGED',
          data: { code },
          existingId,
        });
      }
    }
  }

  private planAttributeOptions(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('attribute_options');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const attrCode = row['attribute_code']!;
      const value = row['value']!;
      const key = `${attrCode}:${value}`;

      const optMap = refs.attributeOptions.get(attrCode);
      const existingId = optMap?.get(value);

      if (!existingId) {
        plan.attributeOptions.push({
          entityType: 'attribute_options',
          externalKey: key,
          action: 'CREATE',
          data: {
            attributeCode: attrCode,
            value,
            valueAr: row['value_ar'],
            label: row['label'],
            sortOrder: row['sort_order'] ? Number(row['sort_order']) : 0,
          },
        });
      } else {
        plan.attributeOptions.push({
          entityType: 'attribute_options',
          externalKey: key,
          action: 'UNCHANGED',
          data: { attributeCode: attrCode, value },
          existingId,
        });
      }
    }
  }

  private planProductTypes(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('product_types');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const code = row['code']!;
      const existingId = refs.productTypeIds.get(code);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.productTypes.push({
          entityType: 'product_types',
          externalKey: code,
          action: 'CREATE',
          data: {
            code,
            name: row['name']!,
            nameAr: row['name_ar'],
            description: row['description'],
            categorySlug: row['category_slug'],
            variantDimensions: row['variant_dimensions']
              ? row['variant_dimensions'].split(',').map((s: string) => s.trim()).filter(Boolean)
              : [],
          },
        });
      } else {
        plan.productTypes.push({
          entityType: 'product_types',
          externalKey: code,
          action: 'UNCHANGED',
          data: { code },
          existingId,
        });
      }
    }
  }

  private planProductTypeAttributes(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('product_type_attributes');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const ptCode = row['product_type_code']!;
      const attrCode = row['attribute_code']!;
      const key = `${ptCode}:${attrCode}`;

      plan.productTypeAttributes.push({
        entityType: 'product_type_attributes',
        externalKey: key,
        action: 'CREATE', // Always insert — upsert handled by unique constraint
        data: {
          productTypeCode: ptCode,
          attributeCode: attrCode,
          groupName: row['group_name'],
          required: row['required']?.toLowerCase() === 'true',
          scope: row['scope'] ?? 'PRODUCT',
          displayOrder: row['display_order'] ? Number(row['display_order']) : 0,
          filterable: row['filterable']?.toLowerCase() === 'true',
          searchable: row['searchable']?.toLowerCase() === 'true',
          visibleInListing: row['visible_in_listing']?.toLowerCase() !== 'false',
          visibleInDetail: row['visible_in_detail']?.toLowerCase() !== 'false',
        },
      });
    }
  }

  private planProducts(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('products');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const slug = row['slug']!;
      const existingId = refs.productIds.get(slug);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.products.push({
          entityType: 'products',
          externalKey: slug,
          action: 'CREATE',
          data: {
            slug,
            title: row['title']!,
            titleAr: row['title_ar'],
            description: row['description'],
            descriptionAr: row['description_ar'],
            brandSlug: row['brand_slug']!,
            productTypeCode: row['product_type_code']!,
            categorySlug: row['category_slug']!,
            mpn: row['mpn'],
            gtin: row['gtin'] || null,
            ean: row['ean'] || null,
            condition: row['condition'] ?? 'NEW',
            status: row['status'] ?? 'ACTIVE',
          },
        });
      } else {
        const ex = existing.products.get(slug);
        const changed = ex && (
          ex.title !== row['title'] ||
          (row['description'] ?? '') !== (ex.description ?? '') ||
          (row['mpn'] ?? '') !== (ex.mpn ?? '')
        );
        plan.products.push({
          entityType: 'products',
          externalKey: slug,
          action: changed ? 'UPDATE' : 'UNCHANGED',
          data: {
            slug,
            title: row['title']!,
            description: row['description'],
            mpn: row['mpn'],
          },
          existingId,
        });
      }
    }
  }

  private planProductAttributes(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('product_attributes');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const prodSlug = row['product_slug']!;
      const attrCode = row['attribute_code']!;
      const key = `${prodSlug}:${attrCode}`;

      plan.productAttributes.push({
        entityType: 'product_attributes',
        externalKey: key,
        action: 'CREATE',
        data: {
          productSlug: prodSlug,
          attributeCode: attrCode,
          valueText: row['value_text'],
          valueNumber: row['value_number'] ? Number(row['value_number']) : null,
          valueBoolean: row['value_boolean'] !== undefined && row['value_boolean'] !== null
            ? row['value_boolean'].toLowerCase() === 'true'
            : null,
          optionKey: row['option_key'],
        },
      });
    }
  }

  private planVariants(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('variants');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const sku = row['sku']!;
      const existingId = refs.variantIds.get(sku);
      const isPending = existingId?.startsWith('pending:');

      if (!existingId || isPending) {
        plan.variants.push({
          entityType: 'variants',
          externalKey: sku,
          action: 'CREATE',
          data: {
            sku,
            productSlug: row['product_slug']!,
            title: row['title'],
            titleAr: row['title_ar'],
            barcode: row['barcode'],
            unit: row['unit'] ?? 'PCS',
            weightGrams: row['weight_grams'] ? Number(row['weight_grams']) : null,
          },
        });
      } else {
        plan.variants.push({
          entityType: 'variants',
          externalKey: sku,
          action: 'UNCHANGED',
          data: { sku },
          existingId,
        });
      }
    }
  }

  private planVariantAttributes(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('variant_attributes');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const varSku = row['variant_sku']!;
      const attrCode = row['attribute_code']!;
      const key = `${varSku}:${attrCode}`;

      plan.variantAttributes.push({
        entityType: 'variant_attributes',
        externalKey: key,
        action: 'CREATE',
        data: {
          variantSku: varSku,
          attributeCode: attrCode,
          valueText: row['value_text'],
          valueNumber: row['value_number'] ? Number(row['value_number']) : null,
          valueBoolean: row['value_boolean'] !== undefined && row['value_boolean'] !== null
            ? row['value_boolean'].toLowerCase() === 'true'
            : null,
          optionKey: row['option_key'],
        },
      });
    }
  }

  private planSources(workbook: ParsedWorkbook, refs: ResolvedReferences, existing: ExistingEntityMap, plan: ImportPlan): void {
    const sheet = workbook.sheets.get('sources');
    if (!sheet) return;

    for (const row of sheet.rows) {
      const prodSlug = row['product_slug']!;
      const sourceType = row['source_type']!;
      const sourceUrl = row['source_url']!;
      const compositeKey = `${prodSlug}:${sourceType}:${sourceUrl}`;

      // Check if this exact source already exists
      const exists = existing.sources?.has(compositeKey) ?? false;
      plan.sources.push({
        entityType: 'sources',
        externalKey: `${prodSlug}:${sourceType}`,
        action: exists ? 'UNCHANGED' : 'CREATE',
        data: {
          productSlug: prodSlug,
          sourceType,
          sourceUrl,
          verifiedAt: row['verified_at'],
        },
      });
    }
  }
}

export interface ExistingEntityMap {
  categories: Map<string, { name: string; nameAr?: string | null; description?: string | null }>;
  brands: Map<string, { name: string; nameAr?: string | null; description?: string | null }>;
  products: Map<string, { title: string; description?: string | null; mpn?: string | null }>;
  sources?: Set<string>;  // composite keys: "productSlug:sourceType:sourceUrl"
}
