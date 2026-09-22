import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import { StorageService } from '../../common/storage/storage.service';
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
  ) {}

  // ── Categories ───────────────────────────────────────────────

  @Post('categories')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async createCategory(@Body() input: CreateCategoryInput) {
    return this.catalogService.createCategory(input);
  }

  @Get('categories')
  async listCategories(@Query('storeId') storeId?: string, @Query('parentId') parentId?: string) {
    return this.catalogService.listCategories({
      storeId,
      parentId,
      isActive: true,
    });
  }

  @Get('categories/:id')
  async getCategory(@Param('id') id: string) {
    return this.catalogService.getCategory(id);
  }

  @Patch('categories/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async updateCategory(@Param('id') id: string, @Body() input: UpdateCategoryInput) {
    return this.catalogService.updateCategory(id, input);
  }

  @Delete('categories/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:categories:write')
  async deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }

  // ── Brands ───────────────────────────────────────────────────

  @Post('brands')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  async createBrand(@Body() input: CreateBrandInput) {
    return this.catalogService.createBrand(input);
  }

  @Get('brands')
  async listBrands(@Query('includeInactive') includeInactive?: string) {
    return this.catalogService.listBrands(includeInactive === 'true');
  }

  @Get('brands/:id')
  async getBrand(@Param('id') id: string) {
    return this.catalogService.getBrand(id);
  }

  @Patch('brands/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  async updateBrand(@Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.catalogService.updateBrand(id, input as any);
  }

  @Delete('brands/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  async deactivateBrand(@Param('id') id: string) {
    return this.catalogService.deactivateBrand(id);
  }

  // ── Products ─────────────────────────────────────────────────

  @Post('products')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async createProduct(@CurrentUser() user: JwtPayload, @Body() input: CreateProductInput) {
    return this.catalogService.createProduct(input, user.sub);
  }

  @Get('stores/:storeId/products')
  async listProducts(
    @Param('storeId') storeId: string,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalogService.listProductsByStore(storeId, {
      status,
      categoryId,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('products/:id')
  async getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getProductDetail(id);
  }

  @Patch('products/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async updateProduct(@Param('id') id: string, @Body() input: UpdateProductInput) {
    return this.catalogService.updateProduct(id, input);
  }

  @Delete('products/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(id);
  }

  // ── Variants ─────────────────────────────────────────────────

  @Post('products/:productId/variants')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async createVariant(@Param('productId') productId: string, @Body() input: CreateVariantInput) {
    return this.catalogService.createVariant(productId, input);
  }

  @Get('products/:productId/variants')
  async listVariants(@Param('productId') productId: string) {
    return this.catalogService.listVariantsByProduct(productId);
  }

  @Patch('products/:productId/variants/:variantId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async updateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() input: Partial<CreateVariantInput>,
  ) {
    return this.catalogService.updateVariant(productId, variantId, input);
  }

  @Post('products/:productId/variants/bulk')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async bulkVariantOperations(
    @Param('productId') productId: string,
    @Body() body: {
      create?: CreateVariantInput[];
      deleteIds?: string[];
      toggleActive?: Array<{ id: string; isActive: boolean }>;
    },
  ) {
    return this.catalogService.bulkVariantOperations(productId, body);
  }

  @Post('stores/:storeId/products/bulk')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async bulkProductOperations(
    @Param('storeId') storeId: string,
    @Body() body: { ids: string[]; action: 'delete' | 'archive' | 'draft' },
  ) {
    return this.catalogService.bulkProductOperations(storeId, body.ids, body.action);
  }

  @Get('stores/:storeId/products/export')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async exportProducts(@Param('storeId') storeId: string) {
    return this.catalogService.exportProductsCsv(storeId);
  }

  @Get('stores/:storeId/variants')
  async listStoreVariants(@Param('storeId') storeId: string) {
    return this.catalogService.listVariantsByStore(storeId);
  }

  @Post('products/:productId/media/reorder')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async reorderMedia(
    @Param('productId') productId: string,
    @Body() body: { order: string[] },
  ) {
    return this.catalogService.reorderMedia(productId, body.order);
  }

  // ── Media ────────────────────────────────────────────────────

  @Post('products/:productId/media')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async addMedia(@Param('productId') productId: string, @Body() input: AddMediaInput) {
    return this.catalogService.addMedia(productId, input);
  }

  @Get('products/:productId/media')
  async listMedia(@Param('productId') productId: string) {
    return this.catalogService.listMediaByProduct(productId);
  }

  @Delete('products/:productId/media/:mediaId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async removeMedia(@Param('productId') productId: string, @Param('mediaId') mediaId: string) {
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
  async createImportJob(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateImportJobInput,
  ) {
    return this.catalogService.createImportJob(storeId, input, user.sub);
  }

  @Get('stores/:storeId/imports')
  async listImportJobs(@Param('storeId') storeId: string) {
    return this.catalogService.listImportJobsByStore(storeId);
  }

  @Get('imports/:id')
  async getImportJob(@Param('id') id: string) {
    return this.catalogService.getImportJob(id);
  }

  @Post('imports/:id/rows')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async stageImportRows(
    @Param('id') id: string,
    @Body() body: { rows: Record<string, string>[]; append?: boolean },
  ) {
    return this.catalogService.stageImportRows(id, body.rows || [], body.append !== false);
  }

  @Post('imports/:id/process')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async processImportJob(@Param('id') id: string) {
    return this.catalogService.processImportJob(id);
  }

  // ── Search ───────────────────────────────────────────────────

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('storeId') storeId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.searchService.search(q, {
      storeId,
      categoryId,
      brandId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('search/categories')
  async getTopCategories(@Query('storeId') storeId?: string) {
    return this.searchService.getTopCategories(storeId);
  }

  @Get('search/brands')
  async getPopularBrands() {
    return this.searchService.getPopularBrands();
  }
}
