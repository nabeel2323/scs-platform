import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { categories, brands, products, productVariants, productMedia, importJobs, favorites } from './catalog.schema';
import { priceLists, priceTiers } from '../pricing/pricing.schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Catalog service — products, variants, categories, brands, media, imports.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  // ── Categories ───────────────────────────────────────────────

  async createCategory(input: CreateCategoryInput) {
    const id = crypto.randomUUID();
    const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

  // ── Brands ───────────────────────────────────────────────────

  async createBrand(input: CreateBrandInput) {
    const id = crypto.randomUUID();
    const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

  async listBrands() {
    return this.db.db.query.brands.findMany({
      where: eq(brands.isActive, true),
      orderBy: [brands.name],
    });
  }

  // ── Products ─────────────────────────────────────────────────

  async createProduct(input: CreateProductInput, userId: string) {
    const id = crypto.randomUUID();
    const slug = input.slug || `${input.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${crypto.randomUUID().substring(0, 8)}`;

    await this.db.db.insert(products).values({
      id,
      storeId: input.storeId,
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
    });

    return this.getProduct(id);
  }

  async getProduct(id: string) {
    const product = await this.db.db.query.products.findFirst({
      where: and(eq(products.id, id), isNull(products.deletedAt)),
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async listProductsByStore(storeId: string, filters?: { status?: string; categoryId?: string }) {
    const conditions = [eq(products.storeId, storeId), isNull(products.deletedAt)];
    if (filters?.status) conditions.push(eq(products.status, filters.status));
    if (filters?.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));

    return this.db.db.query.products.findMany({
      where: and(...conditions),
      orderBy: [desc(products.createdAt)],
    });
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

    await this.db.db.update(products).set(updates).where(eq(products.id, id));

    // Emit event on publish
    if (input.status === 'ACTIVE') {
      await this.outbox.publish('catalog.product.published', id, {
        productId: id,
        storeId: product['storeId'],
      });
    }

    return this.getProduct(id);
  }

  async deleteProduct(id: string) {
    await this.getProduct(id);
    await this.db.db.update(products).set({
      deletedAt: new Date(),
      isAvailable: false,
      updatedAt: new Date(),
    }).where(eq(products.id, id));
    return { success: true };
  }

  // ── Variants ─────────────────────────────────────────────────

  async createVariant(productId: string, input: CreateVariantInput) {
    await this.getProduct(productId);
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

    return this.getVariant(id);
  }

  async getVariant(id: string) {
    const variant = await this.db.db.query.productVariants.findFirst({
      where: eq(productVariants.id, id),
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async listVariantsByProduct(productId: string) {
    return this.db.db.query.productVariants.findMany({
      where: eq(productVariants.productId, productId),
      orderBy: [productVariants.createdAt],
    });
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

    return { id, ...input };
  }

  async listMediaByProduct(productId: string) {
    return this.db.db.query.productMedia.findMany({
      where: eq(productMedia.productId, productId),
      orderBy: [productMedia.sortOrder],
    });
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

    await this.db.db.update(importJobs)
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
          await this.db.db.update(importJobs)
            .set({
              processedRows: i + 1,
              errorRows: errorLog.length,
              stats: { total: rows.length, processed: i + 1, created, updated, skipped, errors: errorLog.length },
              updatedAt: new Date(),
            })
            .where(eq(importJobs.id, id));
        }
      }
    } catch (e) {
      // Catastrophic failure (e.g. DB connection lost) — mark FAILED, keep staged rows for retry
      await this.db.db.update(importJobs)
        .set({
          status: 'FAILED',
          errorLog: [{ row: 0, field: 'job', message: (e as Error).message }],
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, id));
      throw e;
    }

    await this.db.db.update(importJobs)
    .set({
        status: 'COMPLETED',
        processedRows: rows.length,
        errorRows: errorLog.length,
        errorLog,
        stats: { total: rows.length, processed: rows.length, created, updated, skipped, errors: errorLog.length },
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
      throw new ImportRowError('priceMinor', `Row ${rowNum}: invalid price "${priceRaw}" (expected minor units, e.g. 1050)`);
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
      .where(and(
        eq(productVariants.sku, sku),
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
      ))
      .limit(1);

    if (existing.length > 0) {
      const match = existing[0]!;
      await this.upsertBasePrice(priceListId, match.variantId, priceMinor);
      await this.db.db.update(products)
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
    const slugBase = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'product';
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
    return 'created';
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
    const slug = `${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'category'}-${crypto.randomUUID().substring(0, 8)}`;
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
    const slug = `${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'brand'}-${crypto.randomUUID().substring(0, 8)}`;
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
      await this.db.db.update(priceTiers)
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
    await this.db.db.delete(favorites).where(
      and(eq(favorites.userId, userId), eq(favorites.productId, productId)),
    );
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

export interface CreateBrandInput {
  name: string;
  nameAr?: string;
  slug?: string;
  logoUrl?: string;
  description?: string;
}

export interface CreateProductInput {
  storeId: string;
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
