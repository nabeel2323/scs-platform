import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import {
  categories,
  brands,
  products,
  productVariants,
  productMedia,
  importJobs,
  favorites,
  savedSuppliers,
} from './catalog.schema';
import { enrichProductCards } from './product-card';
import { imageReferences } from './product-images';
import { createMediaRefResolver } from './product-card';
import { productAttributeValues, attributeDefinitions } from './catalog.taxonomy.schema';
import { organizations } from '../identity/identity.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import { priceLists, priceTiers } from '../pricing/pricing.schema';
import { resolveOfferPrices } from '../pricing/price-resolution';
import { inventoryItems } from '../inventory/inventory.schema';
import { eq, and, isNull, desc, sql, inArray, ilike } from 'drizzle-orm';
import crypto from 'node:crypto';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/index';
import { timeQuery, recordCacheHit, recordCacheMiss } from '../../common/query-metrics';

/**
 * Catalog service — products, variants, categories, brands, media, imports.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly outbox: OutboxDispatcher,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {
    // Shared with card enrichment so every surface renders media the same way.
    this.resolveMediaRef = createMediaRefResolver(storage);
  }

  /** Convert a stored media reference (URL or object key) to a renderable URL. */
  private readonly resolveMediaRef: (ref: string | null | undefined) => Promise<string | null>;

  /** Resolve every image reference of one media row (url + thumbUrl). */
  private async resolveMediaRow<T extends { url: string; thumbUrl: string | null }>(row: T): Promise<T & { displayUrl: string | null; thumbSrc: string | null }> {
    const [displayUrl, thumbSrc] = await Promise.all([
      this.resolveMediaRef(row.url),
      this.resolveMediaRef(row.thumbUrl),
    ]);
    return { ...row, displayUrl, thumbSrc };
  }

  // ── Categories ───────────────────────────────────────────────

  async createCategory(input: CreateCategoryInput) {
    const id = crypto.randomUUID();
    const slug =
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    let path = `/${slug}`;
    if (input.parentId) {
      const parent = await this.db.db.query.categories.findFirst({
        where: eq(categories.id, input.parentId),
      });
      if (!parent) throw new NotFoundException('Parent category not found');
      path = `${parent['path']}${slug}/`;
    }

    await this.db.db.insert(categories).values({
      id,
      storeId: input.storeId || null,
      parentId: input.parentId || null,
      path,
      slug,
      name: input.name,
      nameAr: input.nameAr || null,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      sortOrder: input.sortOrder || 0,
    });

    return this.getCategory(id);
  }

  async getCategory(id: string) {
    const cat = await this.db.db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async listCategories(filters?: { storeId?: string; parentId?: string; isActive?: boolean }) {
    const conditions = [];
    if (filters?.storeId) conditions.push(eq(categories.storeId, filters.storeId));
    if (filters?.parentId) conditions.push(eq(categories.parentId, filters.parentId));
    if (!filters?.parentId) conditions.push(isNull(categories.parentId)); // root categories by default
    if (filters?.isActive !== undefined) conditions.push(eq(categories.isActive, filters.isActive));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return this.db.db.query.categories.findMany({
      where,
      orderBy: [categories.sortOrder],
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    const existing = await this.getCategory(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates['name'] = input.name;
    if (input.nameAr !== undefined) updates['nameAr'] = input.nameAr;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.imageUrl !== undefined) updates['imageUrl'] = input.imageUrl;
    if (input.sortOrder !== undefined) updates['sortOrder'] = input.sortOrder;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;

    // Reparenting recomputes the materialized path; null clears the parent.
    // Note: descendants keep their stored paths (admin taxonomy is 2 levels).
    if (input.parentId !== undefined && input.parentId !== existing['parentId']) {
      if (input.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      if (input.parentId === null) {
        updates['parentId'] = null;
        updates['path'] = `/${existing['slug']}`;
      } else {
        const parent = await this.db.db.query.categories.findFirst({
          where: eq(categories.id, input.parentId),
        });
        if (!parent) throw new NotFoundException('Parent category not found');
        const subtreeRoot = `${existing['path']}/`.replace(/\/+/g, '/');
        const parentPath = `${parent['path']}/`.replace(/\/+/g, '/');
        if (parentPath.startsWith(subtreeRoot)) {
          throw new BadRequestException('Cannot move a category under its own descendant');
        }
        updates['parentId'] = input.parentId;
        updates['path'] = `${parent['path']}${existing['slug']}/`;
      }
    }

    await this.db.db.update(categories).set(updates).where(eq(categories.id, id));
    return this.getCategory(id);
  }

  async deleteCategory(id: string) {
    await this.getCategory(id);
    // FK set-null: children become top-level, products lose their category
    await this.db.db.delete(categories).where(eq(categories.id, id));
    return { success: true };
  }

  // ── Brands ───────────────────────────────────────────────────

  async createBrand(input: CreateBrandInput) {
    const id = crypto.randomUUID();
    const slug =
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    await this.db.db.insert(brands).values({
      id,
      name: input.name,
      nameAr: input.nameAr || null,
      slug,
      logoUrl: input.logoUrl || null,
      description: input.description || null,
    });

    return this.getBrand(id);
  }

  async getBrand(id: string) {
    const brand = await this.db.db.query.brands.findFirst({
      where: eq(brands.id, id),
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async listBrands(includeInactive = false) {
    return this.db.db.query.brands.findMany({
      where: includeInactive ? undefined : eq(brands.isActive, true),
      orderBy: [brands.name],
    });
  }

  async updateBrand(id: string, input: Partial<CreateBrandInput> & { isActive?: boolean }) {
    await this.getBrand(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      updates['name'] = input.name;
      updates['slug'] = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (input.nameAr !== undefined) updates['nameAr'] = input.nameAr || null;
    if (input.logoUrl !== undefined) updates['logoUrl'] = input.logoUrl || null;
    if (input.description !== undefined) updates['description'] = input.description || null;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;
    await this.db.db.update(brands).set(updates).where(eq(brands.id, id));
    return this.getBrand(id);
  }

  async deactivateBrand(id: string) {
    return this.updateBrand(id, { isActive: false });
  }

  // ── Products ─────────────────────────────────────────────────

  async createProduct(input: CreateProductInput, _userId: string) {
    // PHASE 7: Check for existing canonical product with same identifiers
    if (input.gtin || input.ean || input.mpn) {
      const existing = await this.findProductByIdentifiers({
        gtin: input.gtin, ean: input.ean, mpn: input.mpn,
      });
      if (existing) {
        // Return the match so the caller can attach an offer to it
        return { ...existing, _dedup: true } as any;
      }
    }

    const id = crypto.randomUUID();
    const slug =
      input.slug ||
      `${input.title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')}-${crypto.randomUUID().substring(0, 8)}`;

    await this.db.db.insert(products).values({
      id,
      storeId: input.storeId ?? null,
      categoryId: input.categoryId || null,
      brandId: input.brandId || null,
      slug,
      title: input.title,
      titleAr: input.titleAr || null,
      description: input.description || null,
      descriptionAr: input.descriptionAr || null,
      status: 'DRAFT',
      condition: input.condition || 'NEW',
      moq: input.moq || 1,
      images: input.images || [],
      attributes: input.attributes || {},
      gtin: input.gtin || null,
      ean: input.ean || null,
      mpn: input.mpn || null,
    });

    // PHASE 9: Audit — product created
    await this.audit.record({
      actorType: 'MERCHANT',
      actorId: _userId,
      action: 'product.created',
      resource: 'product',
      resourceId: id,
      metadata: { storeId: input.storeId ?? null, title: input.title },
    });

    return this.getProduct(id);
  }

  /**
   * PHASE 7: Find an existing canonical product by its identifiers.
   * Returns the first match by GTIN, EAN, or MPN (in that priority order).
   * Callers use this during product creation or offer linking to avoid
   * duplicates and to suggest linking to the existing canonical row.
   */
  async findProductByIdentifiers(ids: {
    gtin?: string | null;
    ean?: string | null;
    mpn?: string | null;
  }): Promise<{ id: string; title: string; slug: string; matched: 'gtin' | 'ean' | 'mpn' } | null> {
    const { gtin, ean, mpn } = ids;
    if (!gtin && !ean && !mpn) return null;

    const conditions = [isNull(products.deletedAt)];
    if (gtin) conditions.push(eq(products.gtin, gtin));
    else if (ean) conditions.push(eq(products.ean, ean));
    else if (mpn) conditions.push(eq(products.mpn, mpn));

    const match = await this.db.db.query.products.findFirst({
      where: and(...conditions),
      columns: { id: true, title: true, slug: true, gtin: true, ean: true, mpn: true },
    });
    if (!match) {
      // Fallback: try remaining identifiers individually
      if (gtin && !ean && !mpn) return null;
      const remaining: Array<{ col: typeof products.gtin | typeof products.ean | typeof products.mpn; val: string; label: 'gtin' | 'ean' | 'mpn' }> = [];
      if (gtin) remaining.push({ col: products.gtin, val: gtin, label: 'gtin' });
      if (ean) remaining.push({ col: products.ean, val: ean, label: 'ean' });
      if (mpn) remaining.push({ col: products.mpn, val: mpn, label: 'mpn' });
      for (const r of remaining) {
        const found = await this.db.db.query.products.findFirst({
          where: and(isNull(products.deletedAt), eq(r.col, r.val)),
          columns: { id: true, title: true, slug: true },
        });
        if (found) return { ...found, matched: r.label };
      }
      return null;
    }
    const matched = gtin ? 'gtin' as const : ean ? 'ean' as const : 'mpn' as const;
    return { id: match.id, title: match.title, slug: match.slug, matched };
  }

  /**
   * PHASE 7: Find potential duplicate products by matching title + category.
   * Returns groups of products that likely represent the same canonical item.
   */
  async findPotentialDuplicates(categoryId?: string, limit = 50) {
    const conditions = [isNull(products.deletedAt), eq(products.status, 'ACTIVE')];
    if (categoryId) conditions.push(eq(products.categoryId, categoryId));

    // Group by normalized title + categoryId to find potential dupes
    const result = await this.db.db.execute(sql`
      SELECT
        category_id,
        lower(trim(title)) as norm_title,
        count(*)::int as dup_count,
        array_agg(id) as product_ids,
        array_agg(distinct store_id) as store_ids
      FROM products
      WHERE deleted_at IS NULL
        AND status = 'ACTIVE'
        ${categoryId ? sql`AND category_id = ${categoryId}` : sql``}
      GROUP BY category_id, lower(trim(title))
      HAVING count(*) > 1
      ORDER BY dup_count DESC
      LIMIT ${limit}
    `);
    const rows = (result as any).rows ?? result;
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      categoryId: r.category_id,
      normalizedTitle: r.norm_title,
      duplicateCount: Number(r.dup_count),
      productIds: r.product_ids as string[],
      storeIds: (r.store_ids ?? []).filter(Boolean) as string[],
    }));
  }

  async getProduct(id: string) {
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, id), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** PHASE 8: Read-through Redis cache for product detail (TTL 5 min). */
  private static readonly PRODUCT_DETAIL_CACHE_PREFIX = 'product:detail:';
  private static readonly PRODUCT_DETAIL_TTL_S = 300;

  async getProductDetail(id: string) {
    // Attempt cache hit
    const cacheKey = CatalogService.PRODUCT_DETAIL_CACHE_PREFIX + id;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) { recordCacheHit('product_detail'); return JSON.parse(cached); }
      recordCacheMiss('product_detail');
    } catch { recordCacheMiss('product_detail'); }

    const result = await timeQuery(`getProductDetail:${id}`, () => this._getProductDetailUncached(id));

    // Fire-and-forget cache write
    try {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', CatalogService.PRODUCT_DETAIL_TTL_S);
    } catch { /* non-blocking */ }

    return result;
  }

  /** Invalidate product detail cache (call on update/delete). */
  async invalidateProductCache(id: string) {
    try {
      await this.redis.client.del(CatalogService.PRODUCT_DETAIL_CACHE_PREFIX + id);
    } catch { /* non-blocking */ }
  }

  private async _getProductDetailUncached(id: string) {
    const product = await this.getProduct(id);
    const productStoreId = product.storeId;
    const [storeRows, media, variants, labels] = await Promise.all([
      productStoreId
        ? this.db.db.select({ id: stores.id, displayName: stores.displayName, name: stores.displayName,
            slug: stores.slug, currency: stores.currency, status: stores.status,
            verificationStatus: stores.verificationStatus, orgId: stores.orgId, orgName: organizations.name,
          }).from(stores).leftJoin(organizations, eq(stores.orgId, organizations.id)).where(eq(stores.id, productStoreId))
        : Promise.resolve([] as any[]),
      this.listMediaByProduct(id),
      this.listVariantsByProduct(id),
      this.db.db.select({ categoryName: categories.name, brandName: brands.name }).from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id)).leftJoin(brands, eq(products.brandId, brands.id))
        .where(eq(products.id, id)),
    ]);
    // A5-1: attach per-variant pricing via the shared resolver so the buyer
    // detail page and the cart agree on what a unit costs.
    const activeVariants = variants.filter(v => v['isActive']);
    const variantIds = activeVariants.map(v => v['id']);
    const pricingMap = variantIds.length > 0 && productStoreId
      ? await resolveOfferPrices(this.db.db, productStoreId, variantIds, product['moq'] || 1, { ladder: true })
      : new Map();
    const variantsWithPricing = variants.map(v => ({
      ...v,
      pricing: pricingMap.get(v['id']) ?? null,
    }));

    // Attach stock status per variant: sum available across all store warehouses.
    // Wrapped in try-catch so test environments with partial mock DBs still work.
    const allVariantIds = variants.map(v => v['id']);
    const stockByVariant: Record<string, { totalAvailable: number; totalOnHand: number; warehouseCount: number }> = {};
    try {
      if (allVariantIds.length > 0 && product['storeId']) {
        const storeWarehouses = await this.db.db.query.warehouses.findMany({
          where: eq(warehouses.storeId, product['storeId']),
          columns: { id: true },
        });
        if (storeWarehouses.length > 0) {
          const whIds = storeWarehouses.map(w => w.id);
          const invRows = await this.db.db.query.inventoryItems.findMany({
            where: and(
              inArray(inventoryItems.warehouseId, whIds),
              inArray(inventoryItems.variantId, allVariantIds),
            ),
          });
          for (const row of invRows) {
            const vid = row['variantId'];
            const prev = stockByVariant[vid] ?? { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 };
            const available = row['qtyOnHand'] - row['qtyReserved'];
            stockByVariant[vid] = {
              totalAvailable: prev.totalAvailable + available,
              totalOnHand: prev.totalOnHand + row['qtyOnHand'],
              warehouseCount: prev.warehouseCount + 1,
            };
          }
        }
      }
    } catch {
      // Stock tables may not be available in all environments (e.g. test mocks)
    }
    const variantsWithStock = variantsWithPricing.map(v => ({
      ...v,
      stock: stockByVariant[v['id']] ?? { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 },
    }));

    // Resolve storage keys to signed URLs so the buyer page can render
    // product photos directly; failures degrade to null (placeholder shown).
    const resolvedMedia = await Promise.all(media.map(m => this.resolveMediaRow(m)));

    // PHASE 5e: structured attribute values for specs display
    let attributeValues: Array<{ code: string; label: string; value: unknown }> = [];
    try {
      const rows = await this.db.db
        .select({
          code: attributeDefinitions.code,
          label: attributeDefinitions.name,
          valueText: productAttributeValues.valueText,
          valueNumber: productAttributeValues.valueNumber,
          valueBoolean: productAttributeValues.valueBoolean,
          optionValue: productAttributeValues.optionValue,
          valueJson: productAttributeValues.valueJson,
        })
        .from(productAttributeValues)
        .innerJoin(attributeDefinitions, eq(productAttributeValues.attributeDefinitionId, attributeDefinitions.id))
        .where(eq(productAttributeValues.productId, id));
      attributeValues = rows.map(r => ({
        code: r.code,
        label: r.label,
        value: r.valueText ?? r.valueNumber ?? r.valueBoolean ?? r.optionValue ?? r.valueJson ?? null,
      }));
    } catch { /* taxonomy tables may not be available in all envs */ }

    return { ...product, ...labels[0], store: storeRows[0] ?? null, media: resolvedMedia, variants: variantsWithStock,
      attributeValues,
      imageCount: imageReferences(product.images, media).length };
  }

  async listProductsByStore(
    storeId: string,
    filters?: {
      status?: string;
      categoryId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const conditions = [
      eq(products.storeId, storeId),
      isNull(products.deletedAt),
    ];

    if (filters?.status) {
      conditions.push(eq(products.status, filters.status));
    }

    if (filters?.categoryId) {
      conditions.push(eq(products.categoryId, filters.categoryId));
    }

    if (filters?.search) {
      conditions.push(ilike(products.title, `%${filters.search}%`));
    }

    const where = and(...conditions);

    const limit =
      typeof filters?.limit === 'number' &&
      Number.isFinite(filters.limit) &&
      filters.limit > 0
        ? Math.min(Math.floor(filters.limit), 500)
        : undefined;

    const offset =
      typeof filters?.offset === 'number' &&
      Number.isFinite(filters.offset) &&
      filters.offset >= 0
        ? Math.floor(filters.offset)
        : undefined;

    // Real COUNT for pagination (not page-size)
    const [countResult] = await this.db.db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(where);

    const items = await this.db.db.query.products.findMany({
      where,
      orderBy: [desc(products.createdAt)],
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });

    const enrichedItems = await enrichProductCards(this.db.db, items, {
      resolveImage: ref => this.resolveMediaRef(ref),
    });

    return {
      items: enrichedItems,
      total: countResult?.count ?? 0,
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    };
  }

  async updateProduct(id: string, input: UpdateProductInput) {
    const product = await this.getProduct(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) updates['title'] = input.title;
    if (input.titleAr !== undefined) updates['titleAr'] = input.titleAr;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.descriptionAr !== undefined) updates['descriptionAr'] = input.descriptionAr;
    if (input.status !== undefined) {
      updates['status'] = input.status;
      if (input.status === 'ACTIVE') updates['publishedAt'] = new Date();
    }
    if (input.condition !== undefined) updates['condition'] = input.condition;
    if (input.isAvailable !== undefined) updates['isAvailable'] = input.isAvailable;
    if (input.moq !== undefined) updates['moq'] = input.moq;
    if (input.images !== undefined) updates['images'] = input.images;
    if (input.attributes !== undefined) updates['attributes'] = input.attributes;
    if (input.categoryId !== undefined) updates['categoryId'] = input.categoryId;
    if (input.brandId !== undefined) updates['brandId'] = input.brandId;
    if (input.slug !== undefined) updates['slug'] = input.slug;
    if (input.metadata !== undefined) updates['metadata'] = input.metadata;

    await this.db.db.update(products).set(updates).where(eq(products.id, id));
    await this.invalidateProductCache(id); // PHASE 8

    // Emit event on publish
    if (input.status === 'ACTIVE') {
      await this.outbox.publish('catalog.product.published', id, {
        productId: id,
        storeId: product['storeId'],
      });
      // PHASE 9: Audit — product published
      await this.audit.record({
        actorType: 'MERCHANT',
        action: 'product.published',
        resource: 'product',
        resourceId: id,
        metadata: { storeId: product['storeId'], fromStatus: product['status'] },
      });
    }

    return this.getProduct(id);
  }

  async deleteProduct(id: string) {
    const product = await this.getProduct(id);
    await this.db.db
      .update(products)
      .set({
        deletedAt: new Date(),
        isAvailable: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));
    await this.invalidateProductCache(id); // PHASE 8

    // PHASE 9: Audit — product soft-deleted
    await this.audit.record({
      actorType: 'MERCHANT',
      action: 'product.deleted',
      resource: 'product',
      resourceId: id,
      metadata: { storeId: product['storeId'], title: product['title'] },
    });

    return { success: true };
  }

  // ── Bulk Operations ──────────────────────────────────────────

  /**
   * Bulk variant operations for a single product: create, delete, toggle active.
   */
  async bulkVariantOperations(
    productId: string,
    ops: {
      create?: CreateVariantInput[];
      deleteIds?: string[];
      toggleActive?: Array<{ id: string; isActive: boolean }>;
    },
  ) {
    const product = await this.getProduct(productId);
    const created: string[] = [];
    const deleted: string[] = [];
    const toggled: string[] = [];

    if (ops.create?.length) {
      for (const input of ops.create) {
        const id = crypto.randomUUID();
        await this.db.db.insert(productVariants).values({
          id,
          productId,
          sku: input.sku,
          barcode: input.barcode || null,
          title: input.title || null,
          titleAr: input.titleAr || null,
          unit: input.unit || 'PCS',
          weightGrams: input.weightGrams || null,
          dimensionsMm: input.dimensionsMm || {},
          attributes: input.attributes || {},
          images: input.images || [],
        });
        created.push(id);
      }
      // Ensure each newly created variant has at least a base price tier
      const bulkStoreId = product['storeId'];
      for (const variantId of created) {
        if (bulkStoreId) await this.ensureVariantPricing(bulkStoreId, variantId);
      }
    }

    if (ops.deleteIds?.length) {
      await this.db.db
        .delete(productVariants)
        .where(and(eq(productVariants.productId, productId), inArray(productVariants.id, ops.deleteIds)));
      deleted.push(...ops.deleteIds);
    }

    if (ops.toggleActive?.length) {
      for (const t of ops.toggleActive) {
        await this.db.db
          .update(productVariants)
          .set({ isActive: t.isActive, updatedAt: new Date() })
          .where(and(eq(productVariants.id, t.id), eq(productVariants.productId, productId)));
        toggled.push(t.id);
      }
    }

    return { created, deleted, toggled };
  }

  /**
   * Bulk product operations: delete (soft), archive, or set to draft.
   */
  async bulkProductOperations(
    storeId: string,
    ids: string[],
    action: 'delete' | 'archive' | 'draft',
  ) {
    // Verify all products belong to this store
    const existing = await this.db.db.query.products.findMany({
      where: and(inArray(products.id, ids), eq(products.storeId, storeId), isNull(products.deletedAt)),
    });
    const validIds = existing.map((p) => p['id']);
    if (validIds.length === 0) return { affected: 0 };

    const now = new Date();
    if (action === 'delete') {
      await this.db.db
        .update(products)
        .set({ deletedAt: now, isAvailable: false, updatedAt: now })
        .where(inArray(products.id, validIds));
    } else if (action === 'archive') {
      await this.db.db
        .update(products)
        .set({ status: 'ARCHIVED', updatedAt: now })
        .where(inArray(products.id, validIds));
    } else {
      await this.db.db
        .update(products)
        .set({ status: 'DRAFT', updatedAt: now })
        .where(inArray(products.id, validIds));
    }

    return { affected: validIds.length };
  }

  /**
   * Export products for a store as CSV rows.
   * Columns: title, titleAr, sku, priceMinor, category, brand, status, moq, description
   */
  async exportProductsCsv(storeId: string) {
    const prods = await this.db.db.query.products.findMany({
      where: and(eq(products.storeId, storeId), isNull(products.deletedAt)),
      orderBy: [desc(products.createdAt)],
    });

    const header = 'title,titleAr,sku,priceMinor,category,brand,status,moq,description';
    const rows: string[] = [header];

    for (const p of prods) {
      const [variants, labels] = await Promise.all([
        this.db.db.query.productVariants.findMany({
          where: eq(productVariants.productId, p['id']),
          limit: 1,
        }),
        this.db.db
          .select({ categoryName: categories.name, brandName: brands.name })
          .from(products)
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .leftJoin(brands, eq(products.brandId, brands.id))
          .where(eq(products.id, p['id'])),
      ]);

      let priceMinor = '';
      const variant = variants[0];
      if (variant) {
        const tier = await this.db.db.query.priceTiers.findFirst({
          where: and(eq(priceTiers.variantId, variant['id']), eq(priceTiers.minQty, 1)),
        });
        if (tier) priceMinor = String(tier['unitPriceMinor']);
      }

      const cat = labels[0]?.['categoryName'] ?? '';
      const brand = labels[0]?.['brandName'] ?? '';
      const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;

      rows.push(
        [
          esc(p['title']),
          esc(p['titleAr'] ?? ''),
          esc(variant?.['sku'] ?? ''),
          priceMinor,
          esc(cat),
          esc(brand),
          p['status'],
          String(p['moq']),
          esc(p['description'] ?? ''),
        ].join(','),
      );
    }

    return rows.join('\n');
  }

  /**
   * List all variants across all products for a store.
   * Eliminates the N+1 pattern where clients paginate products then fetch variants per product.
   */
  async listVariantsByStore(storeId: string) {
    const storeProducts = await this.db.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), isNull(products.deletedAt)));

    const productIds = storeProducts.map((p) => p.id);
    if (productIds.length === 0) return [];

    return this.db.db.query.productVariants.findMany({
      where: inArray(productVariants.productId, productIds),
      orderBy: [productVariants.createdAt],
    });
  }

  /**
   * Reorder product media by setting sortOrder for each media item.
   */
  async reorderMedia(productId: string, order: string[]) {
    await this.getProduct(productId);
    for (let i = 0; i < order.length; i++) {
      await this.db.db
        .update(productMedia)
        .set({ sortOrder: i })
        .where(and(eq(productMedia.id, order[i]!), eq(productMedia.productId, productId)));
    }
    return { success: true };
  }

  // ── Variants ─────────────────────────────────────────────────

  async createVariant(productId: string, input: CreateVariantInput) {
    const product = await this.getProduct(productId);
    const id = crypto.randomUUID();

    await this.db.db.insert(productVariants).values({
      id,
      productId,
      sku: input.sku,
      barcode: input.barcode || null,
      title: input.title || null,
      titleAr: input.titleAr || null,
      unit: input.unit || 'PCS',
      weightGrams: input.weightGrams || null,
      dimensionsMm: input.dimensionsMm || {},
      attributes: input.attributes || {},
      images: input.images || [],
    });

    // Ensure the new variant has at least a base price tier so the cart
    // can resolve a price. Without this, variants created via the catalog
    // UI are orphaned from the pricing system.
    const cvStoreId = product['storeId'];
    if (cvStoreId) await this.ensureVariantPricing(cvStoreId, id);

    return this.getVariant(id);
  }

  async updateVariant(productId: string, variantId: string, input: Partial<CreateVariantInput>) {
    const product = await this.getProduct(productId);
    const existing = await this.db.db.query.productVariants.findFirst({
      where: and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)),
    });
    if (!existing) throw new NotFoundException('Variant not found in this product');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input['sku'] !== undefined) updates['sku'] = input['sku'];
    if (input['barcode'] !== undefined) updates['barcode'] = input['barcode'] || null;
    if (input['title'] !== undefined) updates['title'] = input['title'] || null;
    if (input['titleAr'] !== undefined) updates['titleAr'] = input['titleAr'] || null;
    if (input['unit'] !== undefined) updates['unit'] = input['unit'];
    if (input['weightGrams'] !== undefined) updates['weightGrams'] = input['weightGrams'] || null;

    const [updated] = await this.db.db.update(productVariants)
      .set(updates)
      .where(eq(productVariants.id, variantId))
      .returning();
    return updated;
  }

  async getVariant(id: string) {
    const variant = await this.db.db.query.productVariants.findFirst({
      where: eq(productVariants.id, id),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async listVariantsByProduct(productId: string) {
    const variants = await this.db.db.query.productVariants.findMany({
      where: eq(productVariants.productId, productId),
      orderBy: [productVariants.createdAt],
    });
    // Attach stock status per variant (same shape as getProductDetail)
    // Wrapped in try-catch so test environments with partial mock DBs still work.
    try {
      const product = await this.getProduct(productId).catch(() => null);
      if (!product || variants.length === 0) return variants;
      if (!product['storeId']) return variants.map(v => ({ ...v, stock: { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 } }));
      const storeWarehouses = await this.db.db.query.warehouses.findMany({
        where: eq(warehouses.storeId, product['storeId']),
        columns: { id: true },
      });
      if (storeWarehouses.length === 0) return variants.map(v => ({ ...v, stock: { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 } }));
      const whIds = storeWarehouses.map(w => w.id);
      const variantIds = variants.map(v => v['id']);
      const invRows = await this.db.db.query.inventoryItems.findMany({
        where: and(
          inArray(inventoryItems.warehouseId, whIds),
          inArray(inventoryItems.variantId, variantIds),
        ),
      });
      const stockByVariant: Record<string, { totalAvailable: number; totalOnHand: number; warehouseCount: number }> = {};
      for (const row of invRows) {
        const vid = row['variantId'];
        const prev = stockByVariant[vid] ?? { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 };
        stockByVariant[vid] = {
          totalAvailable: prev.totalAvailable + (row['qtyOnHand'] - row['qtyReserved']),
          totalOnHand: prev.totalOnHand + row['qtyOnHand'],
          warehouseCount: prev.warehouseCount + 1,
        };
      }
      return variants.map(v => ({
        ...v,
        stock: stockByVariant[v['id']] ?? { totalAvailable: 0, totalOnHand: 0, warehouseCount: 0 },
      }));
    } catch {
      return variants;
    }
  }

  // ── Media ────────────────────────────────────────────────────

  async addMedia(productId: string, input: AddMediaInput) {
    await this.getProduct(productId);
    const id = crypto.randomUUID();

    await this.db.db.insert(productMedia).values({
      id,
      productId,
      variantId: input.variantId || null,
      mediaType: input.mediaType || 'IMAGE',
      url: input.url,
      thumbUrl: input.thumbUrl || null,
      blurhash: input.blurhash || null,
      altText: input.altText || null,
      altTextAr: input.altTextAr || null,
      sortOrder: input.sortOrder || 0,
      fileSize: input.fileSize || 0,
      mimeType: input.mimeType || null,
    });

    const created = {
      id,
      productId,
      variantId: input.variantId || null,
      mediaType: input.mediaType || 'IMAGE',
      url: input.url,
      thumbUrl: input.thumbUrl || null,
      blurhash: input.blurhash || null,
      altText: input.altText || null,
      altTextAr: input.altTextAr || null,
      sortOrder: input.sortOrder || 0,
      fileSize: input.fileSize || 0,
      mimeType: input.mimeType || null,
    };
    return this.resolveMediaRow(created);
  }

  async listMediaByProduct(productId: string) {
    const rows = await this.db.db.query.productMedia.findMany({
      where: eq(productMedia.productId, productId),
      orderBy: [productMedia.sortOrder],
    });
    return Promise.all(rows.map(r => this.resolveMediaRow(r)));
  }

  async removeMedia(productId: string, mediaId: string) {
    await this.getProduct(productId);
    const item = await this.db.db.query.productMedia.findFirst({
      where: eq(productMedia.id, mediaId),
    });
    if (!item || item.productId !== productId) throw new NotFoundException('Media not found');
    await this.db.db.delete(productMedia).where(eq(productMedia.id, mediaId));
    return { success: true };
  }

  // ── Import Jobs ──────────────────────────────────────────────

  async createImportJob(storeId: string, input: CreateImportJobInput, userId: string) {
    const id = crypto.randomUUID();
    const storageKey = `imports/${storeId}/${id}/${input.fileName}`;

    await this.db.db.insert(importJobs).values({
      id,
      storeId,
      fileName: input.fileName,
      fileType: input.fileType || 'XLSX',
      fileSize: input.fileSize || 0,
      storageKey,
      status: 'UPLOADED',
      columnMapping: input.columnMapping || {},
      createdBy: userId,
    });

    return this.getImportJob(id);
  }

  async getImportJob(id: string) {
    const job = await this.db.db.query.importJobs.findFirst({
      where: eq(importJobs.id, id),
    });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async listImportJobsByStore(storeId: string) {
    return this.db.db.query.importJobs.findMany({
      where: eq(importJobs.storeId, storeId),
      orderBy: [desc(importJobs.createdAt)],
    });
  }

  /**
   * Stage parsed CSV rows for an import job.
   * Clients parse the file locally and upload rows in batches
   * (keeps request bodies under the JSON parser limit).
   * Batches accumulate in Redis with a 1h TTL.
   */
  async stageImportRows(id: string, rows: Record<string, string>[], append: boolean) {
    const job = await this.getImportJob(id);
    if (job.status !== 'UPLOADED' && job.status !== 'MAPPING') {
      throw new ConflictException(`Cannot stage rows for job in status: ${job.status}`);
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('rows must be a non-empty array');
    }
    if (rows.length > 500) {
      throw new BadRequestException('Batch too large: max 500 rows per request');
    }

    const key = this.stagedRowsKey(id);
    if (!append) await this.redis.client.del(key);
    await this.redis.client.rpush(key, JSON.stringify(rows));
    await this.redis.client.expire(key, 3600);

    return { staged: rows.length, batches: await this.redis.client.llen(key) };
  }

  private stagedRowsKey(id: string) {
    return `import:rows:${id}`;
  }

  /**
   * Process an import job: reads staged CSV rows from Redis, validates
   * each row against the stored column mapping, and creates/updates
   * products, variants and base price tiers. Per-row failures are
   * collected in errorLog; the job completes with real stats.
   */
  async processImportJob(id: string) {
    const job = await this.getImportJob(id);
    const reprocessable = ['UPLOADED', 'MAPPING', 'IMPORTING', 'FAILED'];
    if (!reprocessable.includes(job.status)) {
      throw new ConflictException(`Import job cannot be processed from status: ${job.status}`);
    }

    // Pull staged rows
    const key = this.stagedRowsKey(id);
    const batches = await this.redis.client.lrange(key, 0, -1);
    const rows: Record<string, string>[] = batches.flatMap(
      (b) => JSON.parse(b) as Record<string, string>[],
    );

    if (rows.length === 0) {
      if (job.fileType === 'XLSX') {
        throw new BadRequestException(
          'XLSX parsing is deferred for the pilot. Convert the file to CSV and stage rows via POST /v1/imports/:id/rows.',
        );
      }
      throw new BadRequestException(
        'No staged rows found. Upload parsed CSV rows via POST /v1/imports/:id/rows before processing.',
      );
    }

    const mapping = (job.columnMapping || {}) as Record<string, string>;
    if (!mapping['name'] || !mapping['sku'] || !mapping['priceMinor']) {
      throw new BadRequestException('Column mapping must include at least: name, sku, priceMinor');
    }

    await this.db.db
      .update(importJobs)
      .set({
        status: 'IMPORTING',
        startedAt: new Date(),
        totalRows: rows.length,
        processedRows: 0,
        errorRows: 0,
        errorLog: [],
        stats: { total: rows.length, processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, id));

    const priceListId = await this.getOrCreateDefaultPriceList(job.storeId);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errorLog: Array<{ row: number; field: string; message: string }> = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // header is row 1 in the source file
        try {
          const outcome = await this.importRow(job.storeId, priceListId, mapping, rows[i]!, rowNum);
          if (outcome === 'created') created++;
          else if (outcome === 'updated') updated++;
          else skipped++;
        } catch (e) {
          if (errorLog.length < 100) {
            errorLog.push({
              row: rowNum,
              field: (e as ImportRowError).field || 'row',
              message: (e as Error).message,
            });
          }
        }

        // Progress checkpoint every 25 rows so polling clients see movement
        if ((i + 1) % 25 === 0 || i + 1 === rows.length) {
          await this.db.db
            .update(importJobs)
            .set({
              processedRows: i + 1,
              errorRows: errorLog.length,
              stats: {
                total: rows.length,
                processed: i + 1,
                created,
                updated,
                skipped,
                errors: errorLog.length,
              },
              updatedAt: new Date(),
            })
            .where(eq(importJobs.id, id));
        }
      }
    } catch (e) {
      // Catastrophic failure (e.g. DB connection lost) — mark FAILED, keep staged rows for retry
      await this.db.db
        .update(importJobs)
        .set({
          status: 'FAILED',
          errorLog: [{ row: 0, field: 'job', message: (e as Error).message }],
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, id));
      throw e;
    }

    await this.db.db
      .update(importJobs)
      .set({
        status: 'COMPLETED',
        processedRows: rows.length,
        errorRows: errorLog.length,
        errorLog,
        stats: {
          total: rows.length,
          processed: rows.length,
          created,
          updated,
          skipped,
          errors: errorLog.length,
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, id));

    // Clean up staged rows
    await this.redis.client.del(key);

    return this.getImportJob(id);
  }

  /**
   * Import a single row: find-or-create category/brand, then either
   * update the existing variant (matched by SKU within the store) or
   * create product + variant + base price tier.
   */
  private async importRow(
    storeId: string,
    priceListId: string,
    mapping: Record<string, string>,
    row: Record<string, string>,
    rowNum: number,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const get = (key: string): string => {
      const header = mapping[key];
      return header ? (row[header] ?? '').trim() : '';
    };

    const name = get('name');
    if (!name) throw new ImportRowError('name', `Row ${rowNum}: missing product name`);

    const sku = get('sku');
    if (!sku) throw new ImportRowError('sku', `Row ${rowNum}: missing SKU`);

    const unit = get('unit') || 'PCS';

    const priceRaw = get('priceMinor');
    const priceMinor = parseInt(priceRaw, 10);
    if (!priceRaw || isNaN(priceMinor) || priceMinor < 0) {
      throw new ImportRowError(
        'priceMinor',
        `Row ${rowNum}: invalid price "${priceRaw}" (expected minor units, e.g. 1050)`,
      );
    }

    const moqRaw = get('moq');
    const moq = moqRaw ? parseInt(moqRaw, 10) : 1;
    if (isNaN(moq) || moq < 1) {
      throw new ImportRowError('moq', `Row ${rowNum}: invalid MOQ "${moqRaw}"`);
    }

    const barcode = get('barcode') || null;
    const description = get('description') || null;
    const nameAr = get('nameAr') || null;

    // Resolve category / brand (find-or-create by name)
    const categoryName = get('category');
    const categoryId = categoryName ? await this.findOrCreateCategory(storeId, categoryName) : null;
    const brandName = get('brand');
    const brandId = brandName ? await this.findOrCreateBrand(brandName) : null;

    // Match existing variant by SKU within this store
    const existing = await this.db.db
      .select({ variantId: productVariants.id, productId: products.id })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.sku, sku),
          eq(products.storeId, storeId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const match = existing[0]!;
      await this.upsertBasePrice(priceListId, match.variantId, priceMinor);
      await this.db.db
        .update(products)
        .set({
          moq,
          ...(description ? { description } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(brandId ? { brandId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, match.productId));
      return 'updated';
    }

    // Create product (DRAFT) + default variant + base price
    const productId = crypto.randomUUID();
    const slugBase =
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') || 'product';
    const slug = `${slugBase}-${crypto.randomUUID().substring(0, 8)}`;

    await this.db.db.insert(products).values({
      id: productId,
      storeId,
      categoryId,
      brandId,
      slug,
      title: name,
      titleAr: nameAr,
      description,
      status: 'DRAFT',
      moq,
    });

    const variantId = crypto.randomUUID();
    await this.db.db.insert(productVariants).values({
      id: variantId,
      productId,
      sku,
      barcode,
      title: name,
      titleAr: nameAr,
      unit,
    });

    await this.upsertBasePrice(priceListId, variantId, priceMinor);

    // Honor the 'stock' column: create an inventory item in the store's first warehouse.
    const stockRaw = get('stock');
    if (stockRaw) {
      const stockQty = parseInt(stockRaw, 10);
      if (!isNaN(stockQty) && stockQty > 0) {
        const firstWh = await this.db.db.query.warehouses.findFirst({
          where: eq(warehouses.storeId, storeId),
        });
        if (firstWh) {
          const invId = crypto.randomUUID();
          await this.db.db.insert(inventoryItems).values({
            id: invId,
            variantId,
            warehouseId: firstWh.id,
            qtyOnHand: stockQty,
            qtyReserved: 0,
            reorderPoint: 0,
          });
        }
      }
    }

    return 'created';
  }

  /**
   * Ensure a variant has at least one price tier across the store's active
   * price lists. If no tier exists, create a default price list (if needed)
   * and insert a zero-priced base tier. This prevents variants from being
   * unpurchasable due to missing pricing entries.
   */
  private async ensureVariantPricing(storeId: string, variantId: string) {
    const existingTier = await this.db.db.query.priceTiers.findFirst({
      where: eq(priceTiers.variantId, variantId),
    });
    if (existingTier) return;

    const priceListId = await this.getOrCreateDefaultPriceList(storeId);
    await this.upsertBasePrice(priceListId, variantId, 0);
  }

  /** Get or create the store's default public B2B price list. */
  private async getOrCreateDefaultPriceList(storeId: string): Promise<string> {
    const existing = await this.db.db.query.priceLists.findFirst({
      where: and(
        eq(priceLists.storeId, storeId),
        eq(priceLists.channel, 'B2B'),
        eq(priceLists.audience, 'PUBLIC'),
        eq(priceLists.isActive, true),
      ),
      orderBy: [priceLists.priority],
    });
    if (existing) return existing.id;

    const id = crypto.randomUUID();
    await this.db.db.insert(priceLists).values({
      id,
      storeId,
      name: 'Default B2B Price List',
      currency: 'SAR',
      channel: 'B2B',
      audience: 'PUBLIC',
      priority: 0,
    });
    return id;
  }

  /** Find a store category by name, or create it at root level. */
  private async findOrCreateCategory(storeId: string, name: string): Promise<string> {
    const existing = await this.db.db.query.categories.findFirst({
      where: and(eq(categories.storeId, storeId), eq(categories.name, name)),
    });
    if (existing) return existing.id;

    const id = crypto.randomUUID();
    const slug = `${
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') || 'category'
    }-${crypto.randomUUID().substring(0, 8)}`;
    await this.db.db.insert(categories).values({
      id,
      storeId,
      slug,
      name,
      path: `/${slug}`,
      sortOrder: 0,
    });
    return id;
  }

  /** Find a global brand by name, or create it. */
  private async findOrCreateBrand(name: string): Promise<string> {
    const existing = await this.db.db.query.brands.findFirst({
      where: eq(brands.name, name),
    });
    if (existing) return existing.id;

    const id = crypto.randomUUID();
    const slug = `${
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') || 'brand'
    }-${crypto.randomUUID().substring(0, 8)}`;
    await this.db.db.insert(brands).values({ id, name, slug });
    return id;
  }

  /** Upsert the min-qty-1 price tier for a variant in a price list. */
  private async upsertBasePrice(priceListId: string, variantId: string, priceMinor: number) {
    const existing = await this.db.db.query.priceTiers.findFirst({
      where: and(
        eq(priceTiers.priceListId, priceListId),
        eq(priceTiers.variantId, variantId),
        eq(priceTiers.minQty, 1),
      ),
    });
    if (existing) {
      await this.db.db
        .update(priceTiers)
        .set({ unitPriceMinor: priceMinor, updatedAt: new Date() })
        .where(eq(priceTiers.id, existing.id));
    } else {
      await this.db.db.insert(priceTiers).values({
        id: crypto.randomUUID(),
        priceListId,
        variantId,
        minQty: 1,
        unitPriceMinor: priceMinor,
      });
    }
  }

  // ── Favorites / Wishlist ───────────────────────────────────

  async listFavorites(userId: string) {
    const favs = await this.db.db.query.favorites.findMany({
      where: eq(favorites.userId, userId),
      orderBy: [desc(favorites.createdAt)],
    });
    // Enrich with product data
    const result = [];
    for (const fav of favs) {
      const product = await this.db.db.query.products.findFirst({
        where: and(eq(products.id, fav['productId']), isNull(products.deletedAt)),
      });
      if (product) result.push({ ...fav, product });
    }
    return result;
  }

  async addFavorite(userId: string, productId: string) {
    await this.getProduct(productId); // ensure product exists
    // Check for duplicate
    const existing = await this.db.db.query.favorites.findFirst({
      where: and(eq(favorites.userId, userId), eq(favorites.productId, productId)),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.db.insert(favorites).values({ id, userId, productId });
    return { id, userId, productId, createdAt: new Date() };
  }

  async removeFavorite(userId: string, productId: string) {
    await this.db.db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    return { success: true };
  }

  // ── Saved Suppliers (§21.3) ──────────────────────────────────

  /**
   * List the stores (suppliers) a retailer has saved, enriched with store data.
   * Stores are fetched in ONE batched query (inArray) to avoid an N+1 per save.
   */
  async listSavedSuppliers(userId: string) {
    const saved = await this.db.db.query.savedSuppliers.findMany({
      where: eq(savedSuppliers.userId, userId),
      orderBy: [desc(savedSuppliers.createdAt)],
    });
    if (saved.length === 0) return [];

    const storeIds = saved.map((s) => s['storeId']);
    const storeRows = await this.db.db.select().from(stores).where(inArray(stores.id, storeIds));

    const storeById: Record<string, (typeof storeRows)[number]> = {};
    for (const st of storeRows) storeById[st['id']] = st;

    return saved
      .map((s) => ({ ...s, store: storeById[s['storeId']] ?? null }))
      .filter((entry) => entry.store !== null);
  }

  /**
   * Save a store as a supplier for the user. Idempotent: re-saving returns the
   * existing row. Throws NotFoundException if the store does not exist.
   */
  async saveSupplier(userId: string, storeId: string) {
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
    });
    if (!store) throw new NotFoundException('Store not found');

    const existing = await this.db.db.query.savedSuppliers.findFirst({
      where: and(eq(savedSuppliers.userId, userId), eq(savedSuppliers.storeId, storeId)),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.db.insert(savedSuppliers).values({ id, userId, storeId });
    return { id, userId, storeId, createdAt: new Date() };
  }

  /**
   * Remove a saved supplier. Idempotent: removing a store that was never saved
   * is a no-op that still reports success.
   */
  async removeSavedSupplier(userId: string, storeId: string) {
    await this.db.db
      .delete(savedSuppliers)
      .where(and(eq(savedSuppliers.userId, userId), eq(savedSuppliers.storeId, storeId)));
    return { success: true };
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CreateCategoryInput {
  name: string;
  nameAr?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  storeId?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  nameAr?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateBrandInput {
  name: string;
  nameAr?: string;
  slug?: string;
  logoUrl?: string;
  description?: string;
}

export interface CreateProductInput {
  storeId?: string | null;
  title: string;
  titleAr?: string;
  slug?: string;
  description?: string;
  descriptionAr?: string;
  categoryId?: string;
  brandId?: string;
  condition?: string;
  moq?: number;
  images?: string[];
  attributes?: Record<string, unknown>;
  /** PHASE 7: Canonical identifiers for deduplication. */
  gtin?: string;
  ean?: string;
  mpn?: string;
  productTypeId?: string;
}

export interface UpdateProductInput {
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  status?: string;
  condition?: string;
  isAvailable?: boolean;
  moq?: number;
  images?: string[];
  attributes?: Record<string, unknown>;
  categoryId?: string;
  brandId?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateVariantInput {
  sku: string;
  barcode?: string;
  title?: string;
  titleAr?: string;
  unit?: string;
  weightGrams?: number;
  dimensionsMm?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  images?: string[];
}

export interface AddMediaInput {
  url: string;
  variantId?: string;
  mediaType?: string;
  thumbUrl?: string;
  blurhash?: string;
  altText?: string;
  altTextAr?: string;
  sortOrder?: number;
  fileSize?: number;
  mimeType?: string;
}

export interface CreateImportJobInput {
  fileName: string;
  fileType?: string;
  fileSize?: number;
  columnMapping?: Record<string, string>;
}

/** Row-level validation error carrying the offending field name. */
class ImportRowError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImportRowError';
  }
}
