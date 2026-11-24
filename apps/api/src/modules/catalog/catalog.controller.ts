import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { productVariants } from './catalog.schema';
import {
  CatalogService,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateBrandInput,
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  AddMediaInput,
  CreateImportJobInput,
} from './catalog.service';
import { SearchService } from './search.service';
import { CatalogTaxonomyService, AttributeValueInput } from './catalog.taxonomy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
  RequireRole,
} from '../../common/guards/current-user.decorator';
import { StorageService } from '../../common/storage/storage.service';
import { DatabaseService } from '../../common/database/database.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import {
  assertProductEditableByMerchant,
  assertStoreMember,
  assertStoreInOrg,
  assertProductReadable,
  canManageStoreCatalog,
  canManageProductCatalog,
} from '../../common/tenant-scope';
import { AuditService } from '../audit/index';
import { ProductGovernanceService } from './product-governance.service';
/**
 * Catalog API — categories, brands, products, variants, media, imports.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly searchService: SearchService,
    private readonly storageService: StorageService,
    private readonly taxonomyService: CatalogTaxonomyService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly governance: ProductGovernanceService,
  ) {}

  private async assertCategoryReadable(user: JwtPayload, categoryId: string): Promise<void> {
    const category = await this.catalogService.getCategory(categoryId);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };

    if (category.storeId) {
      try {
        await assertStoreInOrg(this.db, caller, category.storeId);
        await assertStoreMember(this.db, caller, category.storeId);
      } catch (error) {
        if (error instanceof ForbiddenException) throw new NotFoundException('Category not found');
        throw error;
      }
    }

    // Inactive categories are a governance surface, not public catalog data.
    if (
      !category.isActive &&
      user.role !== 'SUPER_ADMIN' &&
      !user.perms?.includes('catalog:categories:write')
    ) {
      throw new NotFoundException('Category not found');
    }
  }

  // ── Categories ───────────────────────────────────────────────

  @Post('categories')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermission('catalog:categories:write')
  @RequireRole('ADMIN', 'MODERATOR')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async createCategory(@Body() input: CreateCategoryInput) {
    return this.catalogService.createCategory(input);
  }

  @Get('categories')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listCategories(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId?: string,
    @Query('parentId') parentId?: string,
    @Query('all') all?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    if (storeId) {
      await assertStoreInOrg(this.db, caller, storeId);
      await assertStoreMember(this.db, caller, storeId);
    }
    const canViewInactive =
      user.role === 'SUPER_ADMIN' || user.perms?.includes('catalog:categories:write') === true;
    return this.catalogService.listCategories({
      storeId,
      parentId,
      all: all === 'true',
      isActive: includeInactive === 'true' && canViewInactive ? undefined : true,
    });
  }

  /**
   * Task §23: full platform category hierarchy in one request so the admin
   * tree view does not have to reconstruct parent/child relationships from
   * `parentSlug = ""`. Declared BEFORE `@Get('categories/:id')` because
   * NestJS matches literal path segments ahead of parameterized siblings.
   */
  @Get('categories/tree')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getCategoryTree() {
    return this.catalogService.getCategoryTree();
  }

  @Get('categories/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getCategory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertCategoryReadable(user, id);
    return this.catalogService.getCategoryContents(id);
  }

  /**
   * PHASE 10: product types associated with a category, so the admin taxonomy
   * manager can show which templates reference a given node.
   */
  @Get('categories/:id/product-types')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listCategoryProductTypes(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertCategoryReadable(user, id);
    return this.catalogService.listCategoryProductTypes(id);
  }

  /**
   * Task §4: products belonging to a category with direct vs descendant
   * clearly separated. Consumer chooses `scope=DIRECT`, `scope=DESCENDANT`,
   * or omits for BOTH (default).
   */
  @Get('categories/:id/products')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listCategoryProducts(
    @Param('id') id: string,
    @Query('scope') scope: 'DIRECT' | 'DESCENDANT' | 'BOTH' | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertCategoryReadable(user, id);
    return this.catalogService.getCategoryProducts(id, { scope });
  }

  /**
   * Task §21: admin-scoped listing that includes DRAFT product types with
   * variant and attribute counts, complementing the PUBLISHED-only
   * `GET /categories/:id/product-types` used by merchant/buyer surfaces.
   */
  @Get('admin/categories/:id/product-types')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermission('catalog:categories:write')
  @RequireRole('ADMIN', 'MODERATOR')
  async listCategoryProductTypesForAdmin(@Param('id') id: string) {
    return this.catalogService.listCategoryProductTypesForAdmin(id);
  }

  @Patch('categories/:id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermission('catalog:categories:write')
  @RequireRole('ADMIN', 'MODERATOR')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async updateCategory(@Param('id') id: string, @Body() input: UpdateCategoryInput) {
    return this.catalogService.updateCategory(id, input);
  }

  @Delete('categories/:id')
  @UseGuards(PermissionsGuard, RolesGuard)
  @RequirePermission('catalog:categories:write')
  @RequireRole('ADMIN', 'MODERATOR')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }

  // ── Brands ───────────────────────────────────────────────────

  @Post('brands')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async createBrand(@Body() input: CreateBrandInput) {
    return this.catalogService.createBrand(input);
  }

  /**
   * PHASE 11: enriched brand list with product count + merchant count.
   * Gated by catalog:brands:manage so only admins see the analytics.
   */
  @Get('admin/brands')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  async listBrandsEnriched(@Query('includeInactive') includeInactive?: string) {
    return this.catalogService.listBrandsEnriched(includeInactive === 'true');
  }

  @Get('brands')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listBrands(@Query('includeInactive') includeInactive?: string) {
    return this.catalogService.listBrands(includeInactive === 'true');
  }

  @Get('brands/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getBrand(@Param('id') id: string) {
    return this.catalogService.getBrand(id);
  }

  @Patch('brands/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async updateBrand(@Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.catalogService.updateBrand(id, input as any);
  }

  @Delete('brands/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async deactivateBrand(@Param('id') id: string) {
    return this.catalogService.deactivateBrand(id);
  }

  // ── Products ─────────────────────────────────────────────────

  @Post('products')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async createProduct(@CurrentUser() user: JwtPayload, @Body() input: CreateProductInput) {
    // P6 remediation: verify store membership before creating product.
    // Merchants must specify a valid storeId and be ACTIVE members of that store.
    const storeId = input.storeId;
    if (!storeId) {
      throw new ForbiddenException('A storeId is required to create a product');
    }
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
    return this.catalogService.createProduct(input, user.sub);
  }

  @Get('stores/:storeId/products')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listProducts(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const canManage = await canManageStoreCatalog(this.db, caller, storeId);
    return this.catalogService.listProductsByStore(storeId, {
      // Never trust a buyer-supplied status filter to expose unpublished rows.
      status: canManage ? status : 'ACTIVE',
      categoryId,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('products/:id')
  async getProduct(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const includeInactiveVariants = await this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: caller.sub,
        actorRole: caller.role,
        activeOrgId: caller.activeOrg ?? null,
      },
      async () => {
        await assertProductReadable(this.db, caller, id);
        return canManageProductCatalog(this.db, caller, id);
      },
    );
    // Redis caching and storage URL resolution happen outside the service DB actor scope.
    return this.catalogService.getProductDetail(id, caller, includeInactiveVariants);
  }

  @Patch('products/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  // These mixed operations intentionally avoid a request-wide interceptor:
  // their database phases are scoped in CatalogService, while cache invalidation,
  // outbox publication and audit recording happen after those short scopes close.
  async updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() input: UpdateProductInput,
  ) {
    const actor = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: actor.sub,
        actorRole: actor.role,
        activeOrgId: actor.activeOrg ?? null,
      },
      () => assertProductEditableByMerchant(this.db, actor, id),
    );
    // PHASE 4 P1: Extract optimistic-locking timestamp from body before passing to service.
    const { updatedAt: clientUpdatedAt, ...rest } = input;
    return this.catalogService.updateProduct(id, rest, clientUpdatedAt, actor);
  }

  @Delete('products/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async deleteProduct(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const actor = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: actor.sub,
        actorRole: actor.role,
        activeOrgId: actor.activeOrg ?? null,
      },
      () => assertProductEditableByMerchant(this.db, actor, id),
    );
    return this.catalogService.deleteProduct(id, actor);
  }

  // ── P11 Product Governance (Merchant) ─────────────────────────

  /**
   * P11: Submit a product for review.
   * DRAFT/REJECTED → SUBMITTED
   */
  @Post('merchant/products/:id/submit')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async submitProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { storeId: string; updatedAt?: string },
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, body.storeId);
    await assertStoreMember(this.db, caller, body.storeId);
    return this.governance.submitProduct({
      productId: id,
      storeId: body.storeId,
      actorUserId: user.sub,
      actorRole: user.role || 'MERCHANT',
      clientUpdatedAt: body.updatedAt,
    });
  }

  /**
   * P11: Withdraw a submitted product from review.
   * SUBMITTED → DRAFT
   */
  @Post('merchant/products/:id/withdraw')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async withdrawProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { storeId: string; updatedAt?: string },
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, body.storeId);
    await assertStoreMember(this.db, caller, body.storeId);
    return this.governance.withdrawProduct({
      productId: id,
      storeId: body.storeId,
      actorUserId: user.sub,
      actorRole: user.role || 'MERCHANT',
      clientUpdatedAt: body.updatedAt,
    });
  }

  /**
   * P11: Publish an approved product.
   * APPROVED → PUBLISHED
   */
  @Post('merchant/products/:id/publish')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async publishProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { storeId: string; updatedAt?: string },
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, body.storeId);
    await assertStoreMember(this.db, caller, body.storeId);
    return this.governance.publishProduct({
      productId: id,
      storeId: body.storeId,
      actorUserId: user.sub,
      actorRole: user.role || 'MERCHANT',
      clientUpdatedAt: body.updatedAt,
    });
  }

  /**
   * P11: Unpublish a published product.
   * PUBLISHED → APPROVED
   */
  @Post('merchant/products/:id/unpublish')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async unpublishProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { storeId: string; updatedAt?: string },
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, body.storeId);
    await assertStoreMember(this.db, caller, body.storeId);
    return this.governance.unpublishProduct({
      productId: id,
      storeId: body.storeId,
      actorUserId: user.sub,
      actorRole: user.role || 'MERCHANT',
      clientUpdatedAt: body.updatedAt,
    });
  }

  /**
   * P11: Get moderation history for a product (merchant view).
   * Only the owning store's members can access it.
   */
  @Get('merchant/products/:id/moderation-history')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:products:read')
  async getMerchantModerationHistory(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      id,
    );
    return this.governance.getModerationHistory(id);
  }

  // ── Product Attributes (typed) ──────────────────────────────

  /**
   * PHASE 4 P6: Read PRODUCT-scope typed attribute values for a product.
   * Used by Product Studio edit mode to load existing attribute values.
   */
  @Get('products/:id/attribute-values')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async getProductAttributeValues(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      id,
    );
    return this.taxonomyService.getProductAttributeValues(id);
  }

  /**
   * PHASE 3: Replace all PRODUCT-scope typed attribute values for a product.
   * Atomic replacement — validates definitions, coerces values, persists typed rows.
   * Does NOT write JSONB.
   */
  @Put('products/:id/attribute-values')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async setProductAttributeValues(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { values: AttributeValueInput[] },
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      id,
    );
    const result = await this.taxonomyService.setProductAttributeValues(id, body.values);
    // PHASE 4 P6: Audit — product attributes updated
    await this.audit.record({
      actorType: 'MERCHANT',
      action: 'attribute.updated',
      resource: 'product_attribute_values',
      resourceId: id,
      metadata: { productId: id, attributeCount: body.values.length },
    });
    return result;
  }

  // ── Variants ─────────────────────────────────────────────────

  // PHASE 7: literal path declared before parameterized :variantId siblings
  @Get('products/:productId/variant-matrix')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getVariantMatrix(@Param('productId') productId: string, @CurrentUser() user: JwtPayload) {
    await assertProductReadable(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    return this.catalogService.getVariantMatrix(productId);
  }

  @Post('products/:productId/variants')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async createVariant(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() input: CreateVariantInput,
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    return this.catalogService.createVariant(productId, input);
  }

  @Get('products/:productId/variants')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listVariants(@Param('productId') productId: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertProductReadable(this.db, caller, productId);
    const canManage = await canManageProductCatalog(this.db, caller, productId);
    return this.catalogService.listVariantsByProduct(productId, canManage);
  }

  @Patch('products/:productId/variants/:variantId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async updateVariant(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() input: Partial<CreateVariantInput> & { updatedAt?: string },
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    // PHASE 4 P1: Extract optimistic-locking timestamp from body before passing to service.
    const { updatedAt: clientUpdatedAt, ...rest } = input;
    return this.catalogService.updateVariant(productId, variantId, rest, clientUpdatedAt);
  }

  /**
   * PHASE 4 P6: Read VARIANT-scope typed attribute values for a variant.
   * Used by Product Studio edit mode to load existing variant attribute values.
   */
  @Get('products/:productId/variants/:variantId/attribute-values')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async getVariantAttributeValues(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );

    // The product path segment is part of the authorization boundary. Do not
    // let a merchant who owns product A read attribute values for product B's
    // variant by supplying B's variant UUID alongside A's product UUID.
    const variant = await this.db.db.query.productVariants.findFirst({
      where: and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)),
      columns: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found for this product');
    }

    return this.taxonomyService.getVariantAttributeValues(variantId);
  }

  /**
   * PHASE 3: Replace all VARIANT-scope typed attribute values for a variant.
   * Validates that the variant belongs to the product, coerces values,
   * persists typed rows, and recomputes combination_key.
   */
  @Put('products/:productId/variants/:variantId/attribute-values')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async setVariantAttributeValues(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() body: { values: AttributeValueInput[] },
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    const result = await this.taxonomyService.setVariantAttributeValues(
      productId,
      variantId,
      body.values,
    );
    // PHASE 4 P6: Audit — variant attributes updated
    await this.audit.record({
      actorType: 'MERCHANT',
      action: 'attribute.updated',
      resource: 'variant_attribute_values',
      resourceId: variantId,
      metadata: { productId, variantId, attributeCount: body.values.length },
    });
    return result;
  }

  @Post('products/:productId/variants/bulk')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async bulkVariantOperations(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body()
    body: {
      create?: CreateVariantInput[];
      deleteIds?: string[];
      toggleActive?: Array<{ id: string; isActive: boolean }>;
    },
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    return this.catalogService.bulkVariantOperations(productId, body);
  }

  @Post('stores/:storeId/products/bulk')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async bulkProductOperations(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { ids: string[]; action: 'delete' | 'archive' | 'draft' },
  ) {
    // Bind the supplied store scope to both the caller's active organization
    // and active store membership before any bulk mutation reaches the service.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
    return this.catalogService.bulkProductOperations(storeId, body.ids, body.action);
  }

  @Get('stores/:storeId/products/export')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async exportProducts(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    // P7 Phase 1 — F-SEC-01: require store membership for export.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
    return this.catalogService.exportProductsCsv(storeId);
  }

  @Get('stores/:storeId/variants')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async listStoreVariants(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const canManage = await canManageStoreCatalog(this.db, caller, storeId);
    return this.catalogService.listVariantsByStore(storeId, canManage);
  }

  @Post('products/:productId/media/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async reorderMedia(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() body: { order: string[] },
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    return this.catalogService.reorderMedia(productId, body.order);
  }

  // ── Media ────────────────────────────────────────────────────

  @Post('products/:productId/media')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async addMedia(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Body() input: AddMediaInput,
  ) {
    const actor = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: actor.sub,
        actorRole: actor.role,
        activeOrgId: actor.activeOrg ?? null,
      },
      () => assertProductEditableByMerchant(this.db, actor, productId),
    );
    return this.catalogService.addMedia(productId, input, actor);
  }

  @Get('products/:productId/media')
  async listMedia(@Param('productId') productId: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: caller.sub,
        actorRole: caller.role,
        activeOrgId: caller.activeOrg ?? null,
      },
      () => assertProductReadable(this.db, caller, productId),
    );
    return this.catalogService.listMediaByProduct(productId, caller);
  }

  @Delete('products/:productId/media/:mediaId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async removeMedia(
    @CurrentUser() user: JwtPayload,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
  ) {
    await assertProductEditableByMerchant(
      this.db,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      productId,
    );
    return this.catalogService.removeMedia(productId, mediaId);
  }

  @Post('media/presign')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async presignMedia(@Body() body: { fileName: string; mimeType: string }) {
    const key = `products/${crypto.randomUUID()}/${body.fileName}`;
    const bucket = process.env['S3_MEDIA_BUCKET'] || 'scs-media';

    const uploadUrl = await this.storageService.createPresignedPutUrl(
      bucket,
      key,
      body.mimeType || 'application/octet-stream',
    );

    return {
      uploadUrl,
      storageKey: key,
    };
  }

  // ── Import Jobs ──────────────────────────────────────────────

  @Post('stores/:storeId/imports')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async createImportJob(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateImportJobInput,
  ) {
    // P7 Phase 1 — F-SEC-01: require store membership for import.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
    return this.catalogService.createImportJob(storeId, input, user.sub);
  }

  @Get('stores/:storeId/imports')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:products:read')
  async listImportJobs(@Param('storeId') storeId: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, storeId);
    await assertStoreMember(this.db, caller, storeId);
    return this.catalogService.listImportJobsByStore(storeId);
  }

  @Get('imports/:id')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:products:read')
  async getImportJob(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const job = await this.catalogService.getImportJob(id);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, job.storeId);
    await assertStoreMember(this.db, caller, job.storeId);
    return job;
  }

  @Post('imports/:id/rows')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async stageImportRows(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { rows: Record<string, string>[]; append?: boolean },
  ) {
    // P7 Phase 1 — F-SEC-01: resolve storeId from persisted import job.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      { actorKind: 'user', actorId: caller.sub, actorRole: caller.role, activeOrgId: caller.activeOrg ?? null },
      async () => {
        const job = await this.catalogService.getImportJob(id);
        await assertStoreInOrg(this.db, caller, job.storeId);
        await assertStoreMember(this.db, caller, job.storeId);
      },
    );
    return this.catalogService.stageImportRows(id, body.rows || [], body.append !== false, caller);
  }

  @Post('imports/:id/upload')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async uploadImportFile(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    // P10 Remediation (R1/R11): store scope is resolved from the persisted job,
    // never from the client. Bytes arrive as a raw octet-stream body (no multer
    // dependency, no client-supplied storage key) and are capped at 25 MB.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      { actorKind: 'user', actorId: caller.sub, actorRole: caller.role, activeOrgId: caller.activeOrg ?? null },
      async () => {
        const job = await this.catalogService.getImportJob(id);
        await assertStoreInOrg(this.db, caller, job.storeId);
        await assertStoreMember(this.db, caller, job.storeId);
      },
    );
    const buffer = await readRawBody(req, 25 * 1024 * 1024);
    const contentType = req.headers['content-type'] as string | undefined;
    return this.catalogService.uploadImportFile(id, buffer, caller, contentType);
  }

  @Post('imports/:id/mapping')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async updateImportMapping(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { columnMapping: Record<string, string> },
  ) {
    const job = await this.catalogService.getImportJob(id);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, job.storeId);
    await assertStoreMember(this.db, caller, job.storeId);
    return this.catalogService.updateImportMapping(id, body.columnMapping || {});
  }

  @Post('imports/:id/process')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async processImportJob(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Resolve and authorize the persisted store under a short caller actor scope.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      { actorKind: 'user', actorId: caller.sub, actorRole: caller.role, activeOrgId: caller.activeOrg ?? null },
      async () => {
        const job = await this.catalogService.getImportJob(id);
        await assertStoreInOrg(this.db, caller, job.storeId);
        await assertStoreMember(this.db, caller, job.storeId);
      },
    );
    // The service scopes each DB phase independently; workbook/Redis work stays outside.
    return this.catalogService.processImportJob(id, caller);
  }

  // ── P8: Chunk management, cancellation, retry ────────────────

  @Get('imports/:id/chunks')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:products:read')
  async getImportChunks(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const job = await this.catalogService.getImportJob(id);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, job.storeId);
    await assertStoreMember(this.db, caller, job.storeId);
    return this.catalogService.getChunks(id);
  }

  @Post('imports/:id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async cancelImport(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const job = await this.catalogService.getImportJob(id);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, job.storeId);
    await assertStoreMember(this.db, caller, job.storeId);
    return this.catalogService.cancelImport(id);
  }

  @Post('imports/:id/retry')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async retryImportJob(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const job = await this.catalogService.getImportJob(id);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertStoreInOrg(this.db, caller, job.storeId);
    await assertStoreMember(this.db, caller, job.storeId);
    return this.catalogService.retryFailedJob(id);
  }

  // ── P10: Preview & Error Reporting ────────────────────────────

  @Post('imports/:id/preview')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async previewImportJob(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      { actorKind: 'user', actorId: caller.sub, actorRole: caller.role, activeOrgId: caller.activeOrg ?? null },
      async () => {
        const job = await this.catalogService.getImportJob(id);
        await assertStoreInOrg(this.db, caller, job.storeId);
        await assertStoreMember(this.db, caller, job.storeId);
      },
    );
    return this.catalogService.previewImportJob(id, caller);
  }

  @Get('imports/:id/errors')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:products:read')
  async getImportErrors(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Res() res: any) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await this.db.withActorContext(
      { actorKind: 'user', actorId: caller.sub, actorRole: caller.role, activeOrgId: caller.activeOrg ?? null },
      async () => {
        const job = await this.catalogService.getImportJob(id);
        await assertStoreInOrg(this.db, caller, job.storeId);
        await assertStoreMember(this.db, caller, job.storeId);
      },
    );
    const csv = await this.catalogService.getErrorReport(id, caller);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import-errors-${id}.csv"`,
    });
    res.send(csv);
  }

  // ── Search ───────────────────────────────────────────────────

  @Get('search')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async search(
    @Query('q') q: string,
    @Query('storeId') storeId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('attrFilters') attrFiltersRaw?: string,
    @Query('priceMin') priceMinRaw?: string,
    @Query('priceMax') priceMaxRaw?: string,
    @Query('availability') availability?: string,
    @Query('sort') sort?: string,
    @Query('hasOffers') hasOffersRaw?: string,
  ) {
    let attributeFilters: Record<string, string[]> | undefined;
    if (attrFiltersRaw) {
      try {
        attributeFilters = JSON.parse(attrFiltersRaw);
      } catch {
        /* ignore malformed */
      }
    }

    // P9: validate and convert price parameters (major → minor units)
    let priceMin: number | undefined;
    let priceMax: number | undefined;
    if (priceMinRaw != null && priceMinRaw !== '') {
      const parsed = parseFloat(priceMinRaw);
      if (isNaN(parsed) || parsed < 0) {
        throw new BadRequestException('priceMin must be a non-negative number');
      }
      priceMin = Math.round(parsed * 100);
    }
    if (priceMaxRaw != null && priceMaxRaw !== '') {
      const parsed = parseFloat(priceMaxRaw);
      if (isNaN(parsed) || parsed < 0) {
        throw new BadRequestException('priceMax must be a non-negative number');
      }
      priceMax = Math.round(parsed * 100);
    }
    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      throw new BadRequestException('priceMin must not exceed priceMax');
    }

    // P9: validate availability
    if (availability != null && availability !== '' && availability !== 'inStock') {
      throw new BadRequestException(
        `Invalid availability value '${availability}'. Supported: inStock`,
      );
    }

    // P9: validate sort
    const validSorts = ['price_asc', 'price_desc', 'newest', 'name'] as const;
    type SortValue = (typeof validSorts)[number];
    let sortValue: SortValue | undefined;
    if (sort != null && sort !== '') {
      if (!validSorts.includes(sort as SortValue)) {
        throw new BadRequestException(
          `Invalid sort value '${sort}'. Supported: ${validSorts.join(', ')}`,
        );
      }
      sortValue = sort as SortValue;
    }

    if (hasOffersRaw != null && hasOffersRaw !== '' && !['true', 'false'].includes(hasOffersRaw)) {
      throw new BadRequestException('hasOffers must be true or false');
    }
    const hasOffers = hasOffersRaw === 'true';

    return this.searchService.search(q, {
      storeId,
      categoryId,
      brandId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      attributeFilters,
      priceMin,
      priceMax,
      availability: availability === 'inStock' ? 'inStock' : undefined,
      sort: sortValue,
      hasOffers,
    });
  }

  @Get('search/categories')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getTopCategories(@Query('storeId') storeId?: string) {
    return this.searchService.getTopCategories(storeId);
  }

  @Get('search/brands')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async getPopularBrands() {
    return this.searchService.getPopularBrands();
  }

  @Get('search/facets')
  async getSearchFacets(
    @Query('categoryId') categoryId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const actor = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.searchService.getFacetsCached(categoryId, actor);
  }

  // ── PHASE 7: Data Quality / Deduplication ──────────────────────

  /**
   * Check if a canonical product already exists with the given identifiers.
   * Used by merchants during product creation to avoid duplicates.
   */
  @Get('canonical/match')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async findByIdentifiers(
    @Query('gtin') gtin?: string,
    @Query('ean') ean?: string,
    @Query('mpn') mpn?: string,
  ) {
    return this.catalogService.findProductByIdentifiers({ gtin, ean, mpn });
  }

  /**
   * VARIANT REMEDIATION: Free-text search across canonical products.
   * Returns products with brand/category names, variant count, offer count.
   * Used by the merchant "Existing Product Selector" on web and mobile.
   */
  @Get('canonical/search')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  async searchCanonical(
    @Query('search') search?: string,
    @Query('brandId') brandId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalogService.searchCanonicalProducts({
      search,
      brandId,
      categoryId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Admin: scan for potential duplicate products (same title + category).
   */
  @Get('canonical/duplicates')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  async findDuplicates(@Query('categoryId') categoryId?: string) {
    return this.catalogService.findPotentialDuplicates(categoryId);
  }

  /**
   * PHASE COS-14: Admin data-quality dashboard metrics.
   */
  @Get('admin/data-quality')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  getDataQuality() {
    return this.catalogService.getDataQualityMetrics();
  }

  /**
   * Catalog Governance §26: identify variants with corrupted SKU-[...] patterns.
   */
  @Get('admin/corrupted-variants')
  @UseInterceptors(TenantDatabaseContextInterceptor)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  findCorruptedVariants() {
    return this.catalogService.findCorruptedVariants();
  }
}

/**
 * P10 Remediation (R1): Read a raw request body into a Buffer without a multipart
 * dependency (multer is not installed). Express' JSON / urlencoded parsers skip
 * `application/octet-stream`, so the stream is still live here. Rejects bodies
 * larger than `maxBytes` with a structured BadRequest (clean 4xx, never an
 * opaque 500). Guards against hangs when the stream already ended.
 */
function readRawBody(req: any, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > maxBytes) {
      reject(
        new BadRequestException(
          `FILE_TOO_LARGE: exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
        ),
      );
      return;
    }
    // If a body parser already consumed the stream, fall back to what it buffered.
    if (req.body && Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        if (!settled) {
          settled = true;
          reject(
            new BadRequestException(
              `FILE_TOO_LARGE: exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
            ),
          );
        }
        req.removeAllListeners();
        return;
      }
      chunks.push(Buffer.from(c));
    });
    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', (e: Error) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
  });
}
