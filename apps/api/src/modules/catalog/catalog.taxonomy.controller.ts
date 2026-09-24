import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  CatalogTaxonomyService,
  CreateAttributeInput,
  UpdateAttributeInput,
  UpsertOptionInput,
  CreateProductTypeInput,
  TypeAttributeConfig,
} from './catalog.taxonomy.service';
import { ConditionalRulesService, ConditionalRule, AttributeValueMap } from './conditional-rules.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * Catalog taxonomy API — attributes, options, groups, product types (§32–§34).
 *
 * Governance writes require the new platform-admin keys; reads sit behind the
 * shared JwtAuthGuard (matching CatalogController — reads are authenticated but
 * not permission-gated so merchant/buyer surfaces can render dynamic forms).
 * Literal routes are declared before parameterized siblings that share a prefix.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CatalogTaxonomyController {
  constructor(
    private readonly taxonomy: CatalogTaxonomyService,
    private readonly rules: ConditionalRulesService,
  ) {}

  // ── Attributes ───────────────────────────────────────────────

  @Get('attributes')
  listAttributes(
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('includeDeprecated') includeDeprecated?: string,
  ) {
    return this.taxonomy.listAttributes({
      scope,
      type,
      includeDeprecated: includeDeprecated === 'true',
    });
  }

  @Post('admin/attributes')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:attributes:manage')
  createAttribute(@Body() input: CreateAttributeInput) {
    return this.taxonomy.createAttribute(input);
  }

  @Get('attributes/:id')
  getAttribute(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.getAttribute(id);
  }

  @Patch('admin/attributes/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:attributes:manage')
  updateAttribute(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateAttributeInput) {
    return this.taxonomy.updateAttribute(id, input);
  }

  @Delete('admin/attributes/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:attributes:manage')
  deleteAttribute(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.deleteAttribute(id);
  }

  @Post('admin/attributes/:id/options')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:attributes:manage')
  addAttributeOption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpsertOptionInput,
  ) {
    return this.taxonomy.addOption(id, input);
  }

  // ── Attribute groups ─────────────────────────────────────────

  @Get('attribute-groups')
  listGroups() {
    return this.taxonomy.listGroups();
  }

  @Post('admin/attribute-groups')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:attributes:manage')
  createGroup(@Body() input: { name: string; nameAr?: string; kind?: string }) {
    return this.taxonomy.createGroup(input);
  }

  // ── Product types ────────────────────────────────────────────

  @Get('product-types')
  listProductTypes(@Query('categoryId') categoryId?: string, @Query('status') status?: string) {
    return this.taxonomy.listProductTypes({ categoryId, status });
  }

  @Post('admin/product-types')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  createProductType(@Body() input: CreateProductTypeInput) {
    return this.taxonomy.createProductType(input);
  }

  @Get('product-types/:id')
  getProductType(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.getProductType(id);
  }

  @Get('product-types/:id/schema')
  getProductTypeSchema(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.getProductTypeSchema(id);
  }

  @Post('admin/product-types/:id/publish')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.publishProductType(id);
  }

  @Post('admin/product-types/:id/duplicate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.duplicateProductType(id);
  }

  @Post('admin/product-types/:id/versions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  newVersion(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.createNewVersion(id);
  }

  @Put('admin/product-types/:id/attributes')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  setAttributes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { attributes: TypeAttributeConfig[] },
  ) {
    return this.taxonomy.setProductTypeAttributes(id, body.attributes ?? []);
  }

  @Put('admin/product-types/:id/variant-dimensions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  setVariantDimensions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { attributeIds: string[] },
  ) {
    return this.taxonomy.setVariantDimensions(id, body.attributeIds ?? []);
  }

  /**
   * Preview how a product type renders for merchants (form), buyers (spec),
   * and search (facets) — with conditional rules evaluated against sample values.
   */
  @Post('admin/product-types/:id/preview')
  @UseGuards(PermissionsGuard)
  @RequirePermission('catalog:product-types:manage')
  async preview(@Param('id', ParseUUIDPipe) id: string, @Body() body: { values?: Record<string, unknown> }) {
    const schema = await this.taxonomy.getProductTypeSchema(id);

    // Build attribute value map from body
    const valueMap: AttributeValueMap = new Map();
    if (body.values) {
      for (const [key, val] of Object.entries(body.values)) {
        valueMap.set(key, val);
      }
    }

    // Collect all conditional rules from the schema's attributes
    const allRules: ConditionalRule[] = [];
    for (const attr of schema.attributes) {
      const rules = (attr as any).conditionalRules;
      if (Array.isArray(rules)) {
        allRules.push(...rules);
      }
    }

    // Evaluate rules
    const attrIds = schema.attributes.map(a => a.attributeDefinitionId);
    const result = this.rules.evaluate(allRules, valueMap, attrIds);

    // Build preview response
    const attributes = schema.attributes.map(attr => {
      const effect = result.effects.get(attr.attributeDefinitionId);
      return {
        ...attr,
        effectiveRequired: attr.required || (effect?.required ?? false),
        effectiveHidden: effect?.hidden ?? false,
        appliedActions: effect?.appliedActions ?? [],
      };
    });

    // Categorize for different views
    const formFields = attributes.filter(a => !a.effectiveHidden);
    const facets = attributes.filter(a => a.filterable && !a.effectiveHidden);
    const specFields = attributes.filter(a => a.visibleInDetail && !a.effectiveHidden);

    return {
      productType: schema,
      attributes,
      formFields,
      facets,
      specFields,
      validationErrors: result.errors,
    };
  }
}
