import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import {
  CatalogService,
  CreateCategoryInput, CreateBrandInput,
  CreateProductInput, UpdateProductInput,
  CreateVariantInput, AddMediaInput, CreateImportJobInput,
} from './catalog.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * Catalog API — categories, brands, products, variants, media, imports.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ── Categories ───────────────────────────────────────────────

  @Post('categories')
  async createCategory(@Body() input: CreateCategoryInput) {
    return this.catalogService.createCategory(input);
  }

  @Get('categories')
  async listCategories(
    @Query('storeId') storeId?: string,
    @Query('parentId') parentId?: string,
  ) {
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

  // ── Brands ───────────────────────────────────────────────────

  @Post('brands')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:brands:manage')
  async createBrand(@Body() input: CreateBrandInput) {
    return this.catalogService.createBrand(input);
  }

  @Get('brands')
  async listBrands() {
    return this.catalogService.listBrands();
  }

  // ── Products ─────────────────────────────────────────────────

  @Post('products')
  async createProduct(
    @CurrentUser() user: JwtPayload,
    @Body() input: CreateProductInput,
  ) {
    return this.catalogService.createProduct(input, user.sub);
  }

  @Get('stores/:storeId/products')
  async listProducts(
    @Param('storeId') storeId: string,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.catalogService.listProductsByStore(storeId, { status, categoryId });
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    return this.catalogService.getProduct(id);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body() input: UpdateProductInput,
  ) {
    return this.catalogService.updateProduct(id, input);
  }

  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(id);
  }

  // ── Variants ─────────────────────────────────────────────────

  @Post('products/:productId/variants')
  async createVariant(
    @Param('productId') productId: string,
    @Body() input: CreateVariantInput,
  ) {
    return this.catalogService.createVariant(productId, input);
  }

  @Get('products/:productId/variants')
  async listVariants(@Param('productId') productId: string) {
    return this.catalogService.listVariantsByProduct(productId);
  }

  // ── Media ────────────────────────────────────────────────────

  @Post('products/:productId/media')
  async addMedia(
    @Param('productId') productId: string,
    @Body() input: AddMediaInput,
  ) {
    return this.catalogService.addMedia(productId, input);
  }

  @Get('products/:productId/media')
  async listMedia(@Param('productId') productId: string) {
    return this.catalogService.listMediaByProduct(productId);
  }

  @Post('media/presign')
  async presignMedia(@Body() body: { fileName: string; mimeType: string }) {
    // In production: generate S3/MinIO presigned upload URL
    const key = `products/${crypto.randomUUID()}/${body.fileName}`;
    return {
      uploadUrl: `https://storage.local/${key}?expires=900`,
      storageKey: key,
    };
  }

  // ── Import Jobs ──────────────────────────────────────────────

  @Post('stores/:storeId/imports')
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
}
