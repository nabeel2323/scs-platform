import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { products, productVariants, brands, categories } from './catalog.schema';
import { searchQueries } from './search.schema';
import { eq, and, isNull, or, like, sql, desc } from 'drizzle-orm';
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
  constructor(private readonly db: DatabaseService) {}

  async search(query: string, options?: SearchOptions) {
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
      if (product && !product['deletedAt']) {
        return {
          items: [{ ...product, matchedVariant: skuMatch }],
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
    const results = await this.db.db.execute(sql`
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
    `);

    const items = (results as any[]).map(row => ({
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

    // 3. Log search query for analytics
    await this.logSearchQuery(query, normalized, options?.storeId, options?.userId, items.length);

    return {
      items,
      total: items.length,
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
