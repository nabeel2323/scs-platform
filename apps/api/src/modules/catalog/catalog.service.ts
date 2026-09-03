import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { categories, brands, products, productVariants, productMedia, importJobs, favorites } from './catalog.schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Catalog service — products, variants, categories, brands, media, imports.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DatabaseService,
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
}
