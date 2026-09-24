import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { StorageService } from '../../common/storage/storage.service';
import { RedisService } from '../../common/redis/redis.service';
import { timeQuery, recordCacheHit, recordCacheMiss } from '../../common/query-metrics';
import { products, productVariants, brands, categories } from './catalog.schema';
import { searchQueries } from './search.schema';
import { attributeDefinitions, productTypeAttributes, productAttributeValues, productTypes } from './catalog.taxonomy.schema';
import { eq, and, isNull, or, sql, desc, inArray } from 'drizzle-orm';
import { createMediaRefResolver, enrichProductCards } from './product-card';
import crypto from 'node:crypto';

/**
 * Search service — FTS + trigram fuzzy search with Arabic normalization.
 *
 * Strategy:
 * 1. SKU/barcode exact match → fast path (returns immediately)
 * 2. Full-text search via tsvector (normalized Arabic)
 * 3. Trigram similarity fallback for fuzzy matching
 * 4. Search history logged for analytics
 *
 * The normalize_arabic() function is defined in migration 0007_search.
 * This service calls it via raw SQL.
 */
@Injectable()
export class SearchService {
  /** Signed/absolute URL for the first renderable card image. */
  private readonly resolveImage: (ref: string) => Promise<string | null>;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
  ) {
    this.resolveImage = createMediaRefResolver(storage);
  }

  async search(query: string, options?: SearchOptions) {
    // Handle missing or empty query — return paginated active products
    if (!query || !query.trim()) {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const conditions = [
        isNull(products.deletedAt),
        eq(products.status, 'ACTIVE'),
      ];
      if (options?.storeId) conditions.push(eq(products.storeId, options.storeId));
      if (options?.categoryId) conditions.push(eq(products.categoryId, options.categoryId));
      if (options?.brandId) conditions.push(eq(products.brandId, options.brandId));

      // PHASE 6: attribute filter via EXISTS subquery
      const attrSql = this.buildAttributeFilterSql(options?.attributeFilters);

      const [rows, countResult] = await Promise.all([
        this.db.db.query.products.findMany({
          where: and(...conditions, ...(attrSql ? [attrSql] : [])),
          orderBy: [desc(products.createdAt)],
          limit,
          offset,
        }),
        this.db.db
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(...conditions, ...(attrSql ? [attrSql] : []))),
      ]);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        items: await enrichProductCards(
          this.db.db,
          rows.map(row => ({
            id: row.id,
            storeId: row.storeId,
            categoryId: row.categoryId,
            brandId: row.brandId,
            slug: row.slug,
            title: row.title,
            titleAr: row.titleAr,
            description: row.description,
            status: row.status,
            condition: row.condition,
            isAvailable: row.isAvailable,
            moq: row.moq,
            images: row.images,
            attributes: row.attributes,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            score: null,
          })),
          { resolveImage: this.resolveImage },
        ),
        total,
        matchType: 'all',
        query: '',
        facets: options?.includeFacets === false ? undefined : await this.getFacets(options?.categoryId),
      };
    }

    const normalized = this.normalizeQuery(query);
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    // 1. Fast path: SKU/barcode exact match
    const skuMatch = await this.db.db.query.productVariants.findFirst({
      where: or(
        eq(productVariants.sku, query.trim()),
        eq(productVariants.barcode, query.trim()),
      ),
    });

    if (skuMatch) {
      const product = await this.db.db.query.products.findFirst({
        where: eq(products.id, skuMatch['productId']),
      });
      // The other two paths filter on status = 'ACTIVE'; the fast path must too,
      // otherwise scanning the SKU of a DRAFT or SUSPENDED listing exposes it to
      // any buyer who happens to have its code.
      if (product && !product['deletedAt'] && product['status'] === 'ACTIVE') {
        // A5-2 residual: use the same explicit projection as the other two
        // paths so no client can depend on `matchedVariant` being present.
        return {
          items: await enrichProductCards(this.db.db, [
            {
              id: product.id,
              storeId: product.storeId,
              categoryId: product.categoryId,
              brandId: product.brandId,
              slug: product.slug,
              title: product.title,
              titleAr: product.titleAr,
              description: product.description,
              status: product.status,
              condition: product.condition,
              isAvailable: product.isAvailable,
              moq: product.moq,
              images: product.images,
              attributes: product.attributes,
              createdAt: product.createdAt,
              updatedAt: product.updatedAt,
              score: null,
            },
          ], { resolveImage: this.resolveImage }),
          total: 1,
          matchType: 'exact',
          query,
        };
      }
    }

    // 2. Full-text search with trigram fallback via raw SQL
    const conditions = [
      sql`${products.deletedAt} IS NULL`,
    ];

    if (options?.storeId) {
      conditions.push(eq(products.storeId, options.storeId));
    }
    if (options?.categoryId) {
      conditions.push(eq(products.categoryId, options.categoryId));
    }
    if (options?.brandId) {
      conditions.push(eq(products.brandId, options.brandId));
    }
    if (options?.status) {
      conditions.push(eq(products.status, options.status));
    } else {
      conditions.push(eq(products.status, 'ACTIVE'));
    }

    // Use raw SQL for trigram similarity + FTS
    const attrFilterSql = this.buildRawAttrFilter(options?.attributeFilters);
    const [results, countResult] = await Promise.all([
      this.db.db.execute(sql`
        SELECT p.*, 
          similarity(
            normalize_arabic(p.title),
            normalize_arabic(${query})
          ) AS sim_score
        FROM products p
        WHERE p.deleted_at IS NULL
          AND p.status = 'ACTIVE'
          ${options?.storeId ? sql`AND p.store_id = ${options.storeId}` : sql``}
          ${options?.categoryId ? sql`AND p.category_id = ${options.categoryId}` : sql``}
          ${attrFilterSql}
          AND (
            to_tsvector('simple', normalize_arabic(COALESCE(p.title, ''))) @@ plainto_tsquery('simple', normalize_arabic(${query}))
            OR similarity(normalize_arabic(p.title), normalize_arabic(${query})) > 0.3
            OR normalize_arabic(p.title) ILIKE '%' || normalize_arabic(${query}) || '%'
          )
        ORDER BY sim_score DESC, p.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `),
      this.db.db.execute(sql`
        SELECT count(*) AS total
        FROM products p
        WHERE p.deleted_at IS NULL
          AND p.status = 'ACTIVE'
          ${options?.storeId ? sql`AND p.store_id = ${options.storeId}` : sql``}
          ${options?.categoryId ? sql`AND p.category_id = ${options.categoryId}` : sql``}
          ${attrFilterSql}
          AND (
            to_tsvector('simple', normalize_arabic(COALESCE(p.title, ''))) @@ plainto_tsquery('simple', normalize_arabic(${query}))
            OR similarity(normalize_arabic(p.title), normalize_arabic(${query})) > 0.3
            OR normalize_arabic(p.title) ILIKE '%' || normalize_arabic(${query}) || '%'
          )
      `),
    ]);

    const rows = (results as any).rows ?? results;
    const countRows = (countResult as any).rows ?? countResult;
    const items = (rows as any[]).map(row => ({
      id: row.id,
      storeId: row.store_id,
      categoryId: row.category_id,
      brandId: row.brand_id,
      slug: row.slug,
      title: row.title,
      titleAr: row.title_ar,
      description: row.description,
      status: row.status,
      condition: row.condition,
      isAvailable: row.is_available,
      moq: row.moq,
      images: row.images,
      attributes: row.attributes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      score: row.sim_score,
    }));

    const total = Number((countRows as any[])?.[0]?.total ?? items.length);

    // 3. Log search query for analytics
    await this.logSearchQuery(query, normalized, options?.storeId, options?.userId, items.length);

    return {
      items: await enrichProductCards(this.db.db, items, { resolveImage: this.resolveImage }),
      total,
      matchType: items.length > 0 ? 'fuzzy' : 'none',
      query,
      facets: options?.includeFacets === false ? undefined : await this.getFacets(options?.categoryId),
    };
  }

  async getTopCategories(storeId?: string) {
    const conditions = [eq(categories.isActive, true)];
    if (storeId) conditions.push(eq(categories.storeId, storeId));
    else conditions.push(isNull(categories.storeId));

    return this.db.db.query.categories.findMany({
      where: and(...conditions),
      orderBy: [categories.sortOrder],
      limit: 20,
    });
  }

  async getPopularBrands() {
    return this.db.db.query.brands.findMany({
      where: eq(brands.isActive, true),
      orderBy: [brands.name],
      limit: 20,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private async logSearchQuery(
    query: string,
    normalized: string,
    storeId?: string,
    userId?: string,
    resultsCount = 0,
  ) {
    try {
      await this.db.db.insert(searchQueries).values({
        id: crypto.randomUUID(),
        queryText: query,
        normalizedText: normalized,
        storeId: storeId || null,
        userId: userId || null,
        resultsCount,
      });
    } catch {
      // Non-critical: don't fail search if logging fails
    }
  }

  /**
   * Build an EXISTS subquery SQL condition that filters products by attribute
   * values. Each attr code requires a matching row in product_attribute_values
   * joined to attribute_definitions. Multiple codes are ANDed; multiple values
   * within a code are ORed.
   */
  private buildAttributeFilterSql(
    filters?: Record<string, string[]>,
  ): ReturnType<typeof sql> | undefined {
    if (!filters || Object.keys(filters).length === 0) return undefined;
    const conditions: ReturnType<typeof sql>[] = [];
    for (const [code, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      const placeholders = sql.join(values.map(v => sql`${v}`), sql`, `);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM product_attribute_values pav
        JOIN attribute_definitions ad ON ad.id = pav.attribute_definition_id
        WHERE pav.product_id = ${products.id}
          AND ad.code = ${code}
          AND (pav.value_text IN (${placeholders}) OR pav.option_value IN (${placeholders}))
      )`);
    }
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return sql`(${sql.join(conditions, sql` AND `)})`;
  }

  /**
   * Variant of buildAttributeFilterSql for the raw SQL FTS path (uses `p.id` alias).
   */
  private buildRawAttrFilter(filters?: Record<string, string[]>): ReturnType<typeof sql> {
    if (!filters || Object.keys(filters).length === 0) return sql``;
    const parts: ReturnType<typeof sql>[] = [];
    for (const [code, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      const placeholders = sql.join(values.map(v => sql`${v}`), sql`, `);
      parts.push(sql`AND EXISTS (
        SELECT 1 FROM product_attribute_values pav
        JOIN attribute_definitions ad ON ad.id = pav.attribute_definition_id
        WHERE pav.product_id = p.id
          AND ad.code = ${code}
          AND (pav.value_text IN (${placeholders}) OR pav.option_value IN (${placeholders}))
      )`);
    }
    if (parts.length === 0) return sql``;
    return sql.join(parts, sql` `);
  }

  /** PHASE 8: Read-through cache for facets (TTL 2 min). */
  private static readonly FACETS_CACHE_PREFIX = 'search:facets:';
  private static readonly FACETS_TTL_S = 120;

  async getFacetsCached(categoryId?: string): Promise<FacetEntry[]> {
    const key = SearchService.FACETS_CACHE_PREFIX + (categoryId ?? 'all');
    try {
      const hit = await this.redis.client.get(key);
      if (hit) { recordCacheHit('facets'); return JSON.parse(hit); }
      recordCacheMiss('facets');
    } catch { recordCacheMiss('facets'); }

    const facets = await timeQuery(`getFacets:${categoryId ?? 'all'}`, () => this.getFacets(categoryId));

    try {
      await this.redis.client.set(key, JSON.stringify(facets), 'EX', SearchService.FACETS_TTL_S);
    } catch { /* non-blocking */ }

    return facets;
  }

  /**
   * PHASE 6: Return dynamic facet metadata for the given category context.
   * Finds published product types linked to the category, their filterable
   * attributes, and aggregates distinct values from products' attribute_values.
   */
  async getFacets(categoryId?: string): Promise<FacetEntry[]> {
    try {
      // 1. Find published product types for this category (or all types if no category)
      const typeConditions = [eq(productTypes.status, 'PUBLISHED')];
      if (categoryId) typeConditions.push(eq(productTypes.categoryId, categoryId));
      const types = await this.db.db.query.productTypes.findMany({
        where: and(...typeConditions),
        columns: { id: true },
      });
      if (types.length === 0) return [];
      const typeIds = types.map(t => t.id);

      // 2. Find filterable attributes for these types
      const filterableAttrs = await this.db.db
        .select({
          code: attributeDefinitions.code,
          name: attributeDefinitions.name,
          type: attributeDefinitions.type,
        })
        .from(productTypeAttributes)
        .innerJoin(attributeDefinitions, eq(productTypeAttributes.attributeDefinitionId, attributeDefinitions.id))
        .where(and(
          inArray(productTypeAttributes.productTypeId, typeIds),
          eq(productTypeAttributes.filterable, true),
        ));
      if (filterableAttrs.length === 0) return [];
      const attrCodes = filterableAttrs.map(a => a.code);

      // 3. Aggregate distinct values for each filterable attribute via raw SQL
      const attrDefs = await this.db.db.query.attributeDefinitions.findMany({
        where: inArray(attributeDefinitions.code, attrCodes),
        columns: { id: true, code: true },
      });
      const facets: FacetEntry[] = [];

      for (const attr of attrDefs) {
        const result = await this.db.db.execute(sql`
          SELECT
            COALESCE(pav.value_text, pav.option_value, pav.value_number::text, pav.value_boolean::text) AS val,
            count(*)::int AS cnt
          FROM product_attribute_values pav
          WHERE pav.attribute_definition_id = ${attr.id}
            AND (pav.value_text IS NOT NULL OR pav.option_value IS NOT NULL OR pav.value_number IS NOT NULL OR pav.value_boolean IS NOT NULL)
          GROUP BY val
          ORDER BY cnt DESC
          LIMIT 20
        `);
        const rows = (result as any).rows ?? result;
        const def = filterableAttrs.find(f => f.code === attr.code);
        if (def && Array.isArray(rows) && rows.length > 0) {
          facets.push({
            code: def.code,
            label: def.name,
            type: def.type,
            values: rows.filter((r: any) => r.val != null).map((r: any) => ({ value: String(r.val), count: Number(r.cnt) })),
          });
        }
      }
      return facets;
    } catch {
      return []; // taxonomy may not be available in all envs
    }
  }
}

export interface SearchOptions {
  storeId?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  /** PHASE 6: dynamic attribute filtering — attr code → selected values. */
  attributeFilters?: Record<string, string[]>;
  /** When true, include facet aggregation in the response (default true). */
  includeFacets?: boolean;
}

export interface FacetEntry {
  code: string;
  label: string;
  type: string;
  values: Array<{ value: string; count: number }>;
}
