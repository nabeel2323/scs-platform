import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { StorageService } from '../../common/storage/storage.service';
import { products, productVariants, brands, categories } from './catalog.schema';
import { searchQueries } from './search.schema';
import { eq, and, isNull, or, sql, desc } from 'drizzle-orm';
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

      const [rows, countResult] = await Promise.all([
        this.db.db.query.products.findMany({
          where: and(...conditions),
          orderBy: [desc(products.createdAt)],
          limit,
          offset,
        }),
        this.db.db
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(...conditions)),
      ]);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        // A5-2: cards carry the seller and a comparable price, so a buyer can
        // compare the same product across stores without opening each one.
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
}

export interface SearchOptions {
  storeId?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}
