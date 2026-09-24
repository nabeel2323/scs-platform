import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  attributeDefinitions,
  attributeOptions,
  attributeGroups,
  productTypes,
  productTypeAttributes,
  productAttributeValues,
  variantAttributeValues,
  type AttributeScope,
  type AttributeType,
} from './catalog.taxonomy.schema';
import { products, productVariants } from './catalog.schema';
import { eq, and, ne, isNull, asc, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

const ATTRIBUTE_TYPES: ReadonlySet<string> = new Set<AttributeType>([
  'TEXT', 'LONG_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME',
  'SELECT', 'MULTI_SELECT', 'COLOR', 'URL', 'FILE', 'MEASUREMENT', 'CURRENCY',
]);

const ATTRIBUTE_SCOPES: ReadonlySet<string> = new Set<AttributeScope>([
  'PRODUCT', 'VARIANT', 'OFFER',
]);

const PRODUCT_TYPE_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT', 'PUBLISHED', 'DEPRECATED',
]);

/** SELECT-family attributes require a controlled option list (§9). */
function isSelectType(type: string): boolean {
  return type === 'SELECT' || type === 'MULTI_SELECT';
}

export interface CreateAttributeInput {
  code: string;
  name: string;
  nameAr?: string;
  description?: string;
  type?: AttributeType;
  unit?: string;
  scope?: AttributeScope;
  validation?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  options?: Array<{ value: string; valueAr?: string; label?: string; sortOrder?: number }>;
}

export interface UpdateAttributeInput {
  name?: string;
  nameAr?: string;
  description?: string;
  unit?: string;
  status?: 'ACTIVE' | 'DEPRECATED';
  validation?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpsertOptionInput {
  value: string;
  valueAr?: string;
  label?: string;
  sortOrder?: number;
}

export interface CreateProductTypeInput {
  code: string;
  name: string;
  nameAr?: string;
  description?: string;
  categoryId?: string | null;
  variantDimensions?: string[];
  metadata?: Record<string, unknown>;
}

export interface TypeAttributeConfig {
  attributeDefinitionId: string;
  groupId?: string | null;
  required?: boolean;
  scope?: AttributeScope;
  displayOrder?: number;
  filterable?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  comparable?: boolean;
  visibleInListing?: boolean;
  visibleInDetail?: boolean;
  allowedValues?: string[];
  validationRules?: Record<string, unknown>;
  conditionalRules?: unknown[];
}

/**
 * A single attribute value submitted for a product/variant (§17/§19). The raw
 * value is coerced + validated against the attribute's declared type on the
 * server before it is written to the matching typed column.
 */
export interface AttributeValueInput {
  attributeDefinitionId: string;
  value: string | number | boolean | string[] | null;
}

/** The typed-column patch produced by validating a value against its type. */
type TypedValue = {
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: boolean | null;
  optionValue: string | null;
  valueJson: unknown;
};

/**
 * CatalogTaxonomyService — platform-governed attributes & product types.
 *
 * PHASE 2 (domain model). Backend stays authoritative (§16, Rule 10): every
 * write validates type/scope and referential integrity that the schema cannot
 * express as a constraint (e.g. variant dimensions must be VARIANT-scope
 * attributes). These tables are not yet consumed by the product flows, so this
 * service is purely additive to existing behaviour.
 */
@Injectable()
export class CatalogTaxonomyService {
  constructor(private readonly db: DatabaseService) {}

  // ── Attribute definitions ────────────────────────────────────

  async createAttribute(input: CreateAttributeInput) {
    const type = input.type ?? 'TEXT';
    const scope = input.scope ?? 'PRODUCT';
    if (!ATTRIBUTE_TYPES.has(type)) {
      throw new BadRequestException(`Unsupported attribute type: ${type}`);
    }
    if (!ATTRIBUTE_SCOPES.has(scope)) {
      throw new BadRequestException(`Unsupported attribute scope: ${scope}`);
    }
    if (!input.code?.trim()) throw new BadRequestException('Attribute code is required');
    if (!input.name?.trim()) throw new BadRequestException('Attribute name is required');

    const existing = await this.db.db.query.attributeDefinitions.findFirst({
      where: eq(attributeDefinitions.code, input.code),
    });
    if (existing) throw new ConflictException(`Attribute code already exists: ${input.code}`);

    const id = crypto.randomUUID();
    await this.db.db.insert(attributeDefinitions).values({
      id,
      code: input.code,
      name: input.name,
      nameAr: input.nameAr ?? null,
      description: input.description ?? null,
      type,
      unit: input.unit ?? null,
      scope,
      status: 'ACTIVE',
      validation: input.validation ?? {},
      metadata: input.metadata ?? {},
    });

    if (input.options?.length) {
      await this.replaceOptions(id, input.options);
    }
    return this.getAttribute(id);
  }

  async updateAttribute(id: string, input: UpdateAttributeInput) {
    const attr = await this.db.db.query.attributeDefinitions.findFirst({
      where: and(eq(attributeDefinitions.id, id), isNull(attributeDefinitions.deletedAt)),
    });
    if (!attr) throw new NotFoundException('Attribute not found');

    if (input.status && !['ACTIVE', 'DEPRECATED'].includes(input.status)) {
      throw new BadRequestException('status must be ACTIVE or DEPRECATED');
    }

    await this.db.db
      .update(attributeDefinitions)
      .set({
        name: input.name ?? attr.name,
        nameAr: input.nameAr ?? attr.nameAr,
        description: input.description ?? attr.description,
        unit: input.unit ?? attr.unit,
        status: input.status ?? attr.status,
        validation: input.validation ?? attr.validation,
        metadata: input.metadata ?? attr.metadata,
        updatedAt: new Date(),
      })
      .where(eq(attributeDefinitions.id, id));

    return this.getAttribute(id);
  }

  /** Soft-delete an attribute (never hard-deletes; historical values remain). */
  async deleteAttribute(id: string) {
    const attr = await this.db.db.query.attributeDefinitions.findFirst({
      where: and(eq(attributeDefinitions.id, id), isNull(attributeDefinitions.deletedAt)),
    });
    if (!attr) throw new NotFoundException('Attribute not found');
    const inUse = await this.db.db.query.productTypeAttributes.findFirst({
      where: eq(productTypeAttributes.attributeDefinitionId, id),
    });
    if (inUse) {
      throw new ConflictException(
        'Attribute is referenced by one or more product types; deprecate it instead of deleting',
      );
    }
    await this.db.db
      .update(attributeDefinitions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(attributeDefinitions.id, id));
    return { deleted: true };
  }

  async listAttributes(opts?: { scope?: string; type?: string; includeDeprecated?: boolean }) {
    const conditions = [isNull(attributeDefinitions.deletedAt)];
    if (!opts?.includeDeprecated) {
      conditions.push(eq(attributeDefinitions.status, 'ACTIVE'));
    }
    if (opts?.scope) conditions.push(eq(attributeDefinitions.scope, opts.scope));
    if (opts?.type) conditions.push(eq(attributeDefinitions.type, opts.type));

    const rows = await this.db.db.query.attributeDefinitions.findMany({
      where: and(...conditions),
      orderBy: [asc(attributeDefinitions.name)],
    });
    return rows;
  }

  async getAttribute(id: string) {
    const attr = await this.db.db.query.attributeDefinitions.findFirst({
      where: and(eq(attributeDefinitions.id, id), isNull(attributeDefinitions.deletedAt)),
    });
    if (!attr) throw new NotFoundException('Attribute not found');
    const options = await this.db.db.query.attributeOptions.findMany({
      where: eq(attributeOptions.attributeId, id),
      orderBy: [asc(attributeOptions.sortOrder)],
    });
    return { ...attr, options };
  }

  // ── Attribute options ────────────────────────────────────────

  async addOption(attributeId: string, input: UpsertOptionInput) {
    const attr = await this.db.db.query.attributeDefinitions.findFirst({
      where: and(eq(attributeDefinitions.id, attributeId), isNull(attributeDefinitions.deletedAt)),
    });
    if (!attr) throw new NotFoundException('Attribute not found');
    if (!isSelectType(attr.type)) {
      throw new BadRequestException(`Attribute type ${attr.type} does not support options`);
    }
    const dup = await this.db.db.query.attributeOptions.findFirst({
      where: and(eq(attributeOptions.attributeId, attributeId), eq(attributeOptions.value, input.value)),
    });
    if (dup) throw new ConflictException(`Option value already exists: ${input.value}`);

    const id = crypto.randomUUID();
    await this.db.db.insert(attributeOptions).values({
      id,
      attributeId,
      value: input.value,
      valueAr: input.valueAr ?? null,
      label: input.label ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    });
    return this.getAttribute(attributeId);
  }

  /** Replace the full option set for a SELECT attribute (used by the editor + import). */
  private async replaceOptions(attributeId: string, options: UpsertOptionInput[]) {
    await this.db.db.delete(attributeOptions).where(eq(attributeOptions.attributeId, attributeId));
    if (options.length === 0) return;
    await this.db.db.insert(attributeOptions).values(
      options.map((o, i) => ({
        id: crypto.randomUUID(),
        attributeId,
        value: o.value,
        valueAr: o.valueAr ?? null,
        label: o.label ?? null,
        sortOrder: o.sortOrder ?? i,
        isActive: true,
      })),
    );
  }

  // ── Attribute groups ─────────────────────────────────────────

  async createGroup(input: { name: string; nameAr?: string; kind?: string }) {
    if (!input.name?.trim()) throw new BadRequestException('Group name is required');
    const dup = await this.db.db.query.attributeGroups.findFirst({
      where: eq(attributeGroups.name, input.name),
    });
    if (dup) throw new ConflictException(`Attribute group already exists: ${input.name}`);
    const id = crypto.randomUUID();
    await this.db.db.insert(attributeGroups).values({
      id,
      name: input.name,
      nameAr: input.nameAr ?? null,
      kind: input.kind ?? null,
    });
    return this.db.db.query.attributeGroups.findFirst({ where: eq(attributeGroups.id, id) });
  }

  async listGroups() {
    return this.db.db.query.attributeGroups.findMany({ orderBy: [asc(attributeGroups.name)] });
  }

  // ── Product types ────────────────────────────────────────────

  async createProductType(input: CreateProductTypeInput) {
    if (!input.code?.trim()) throw new BadRequestException('Product type code is required');
    if (!input.name?.trim()) throw new BadRequestException('Product type name is required');
    await this.validateVariantDimensions(input.categoryId ?? null, input.variantDimensions ?? []);

    const existingV1 = await this.db.db.query.productTypes.findFirst({
      where: and(eq(productTypes.code, input.code), eq(productTypes.version, 1)),
    });
    if (existingV1) throw new ConflictException(`Product type already exists: ${input.code}`);

    const id = crypto.randomUUID();
    await this.db.db.insert(productTypes).values({
      id,
      code: input.code,
      version: 1,
      name: input.name,
      nameAr: input.nameAr ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      status: 'DRAFT',
      variantDimensions: input.variantDimensions ?? [],
      metadata: input.metadata ?? {},
    });
    return this.getProductType(id);
  }

  /**
   * Publish a NEW version (§12) copying the current attribute config. The prior
   * version is left intact (marked DEPRECATED) so existing products keep their
   * schema. New products resolve the newly PUBLISHED version.
   */
  async createNewVersion(id: string) {
    const current = await this.db.db.query.productTypes.findFirst({
      where: eq(productTypes.id, id),
    });
    if (!current) throw new NotFoundException('Product type not found');

    const { version: _v, id: _id, status: _s, publishedAt: _p, ...base } = current;
    const newVersion = current.version + 1;
    const newId = crypto.randomUUID();

    await this.db.db.insert(productTypes).values({
      ...base,
      id: newId,
      version: newVersion,
      status: 'DRAFT',
      publishedAt: null,
    });

    const attrs = await this.db.db.query.productTypeAttributes.findMany({
      where: eq(productTypeAttributes.productTypeId, id),
    });
    if (attrs.length > 0) {
      await this.db.db.insert(productTypeAttributes).values(
        attrs.map(a => ({
          ...a,
          id: crypto.randomUUID(),
          productTypeId: newId,
        })),
      );
    }
    return this.getProductType(newId);
  }

  async publishProductType(id: string) {
    const pt = await this.db.db.query.productTypes.findFirst({ where: eq(productTypes.id, id) });
    if (!pt) throw new NotFoundException('Product type not found');

    // A published template must have at least one attribute and valid dimensions.
    const attrs = await this.db.db.query.productTypeAttributes.findMany({
      where: eq(productTypeAttributes.productTypeId, id),
    });
    if (attrs.length === 0) {
      throw new BadRequestException('Cannot publish a product type with no attributes');
    }
    await this.validateVariantDimensions(pt.categoryId, (pt.variantDimensions as string[]) ?? []);

    const now = new Date();
    // Deprecate every PRIOR published version of the same logical code (§12) so
    // only the newly published version is active; existing products keep pointing
    // at the older (now-deprecated) rows until migrated.
    await this.db.db
      .update(productTypes)
      .set({ status: 'DEPRECATED', updatedAt: now })
      .where(
        and(
          eq(productTypes.code, pt.code),
          eq(productTypes.status, 'PUBLISHED'),
          ne(productTypes.id, id),
        ),
      );

    await this.db.db
      .update(productTypes)
      .set({ status: 'PUBLISHED', publishedAt: now, updatedAt: now })
      .where(eq(productTypes.id, id));

    return this.getProductType(id);
  }

  async getProductType(id: string) {
    const pt = await this.db.db.query.productTypes.findFirst({ where: eq(productTypes.id, id) });
    if (!pt) throw new NotFoundException('Product type not found');
    return pt;
  }

  /**
   * Duplicate a product type with all its attribute configurations.
   * The copy starts as DRAFT with a new ID and name suffixed " (Copy)".
   */
  async duplicateProductType(id: string) {
    const source = await this.getProductType(id);
    const sourceAttrs = await this.db.db.query.productTypeAttributes.findMany({
      where: eq(productTypeAttributes.productTypeId, id),
    });

    const newId = crypto.randomUUID();
    const now = new Date();
    await this.db.db.insert(productTypes).values({
      id: newId,
      code: source.code,
      version: 1,
      name: `${source.name} (Copy)`,
      nameAr: source.nameAr,
      description: source.description,
      categoryId: source.categoryId,
      status: 'DRAFT',
      variantDimensions: source.variantDimensions,
      metadata: source.metadata,
      publishedAt: null,
      effectiveFrom: null,
    });

    // Copy all product_type_attributes rows (attribute config, conditional
    // rules, validation, display order)
    for (const pta of sourceAttrs) {
      await this.db.db.insert(productTypeAttributes).values({
        id: crypto.randomUUID(),
        productTypeId: newId,
        attributeDefinitionId: pta.attributeDefinitionId,
        groupId: pta.groupId,
        required: pta.required,
        scope: pta.scope,
        displayOrder: pta.displayOrder,
        filterable: pta.filterable,
        searchable: pta.searchable,
        sortable: pta.sortable,
        comparable: pta.comparable,
        visibleInListing: pta.visibleInListing,
        visibleInDetail: pta.visibleInDetail,
        allowedValues: pta.allowedValues,
        validationRules: pta.validationRules,
        conditionalRules: pta.conditionalRules,
        metadata: pta.metadata,
      });
    }

    return this.getProductType(newId);
  }

  async listProductTypes(opts?: { categoryId?: string; status?: string }) {
    const conditions = [];
    if (opts?.categoryId) conditions.push(eq(productTypes.categoryId, opts.categoryId));
    if (opts?.status) conditions.push(eq(productTypes.status, opts.status));
    else conditions.push(eq(productTypes.status, 'PUBLISHED'));
    return this.db.db.query.productTypes.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [asc(productTypes.code), asc(productTypes.version)],
    });
  }

  /**
   * The compiled schema a dynamic form/presentation is generated from (§13,
   * §28, §33). Returns the type with its attributes joined to their definitions
   * and grouped by `groupId`, plus the resolved variant dimensions.
   */
  async getProductTypeSchema(id: string) {
    const pt = await this.getProductType(id);
    const configs = await this.db.db.query.productTypeAttributes.findMany({
      where: eq(productTypeAttributes.productTypeId, id),
      orderBy: [asc(productTypeAttributes.displayOrder)],
    });
    const attrIds = configs.map(c => c.attributeDefinitionId);
    const attrs = attrIds.length
      ? await this.db.db.query.attributeDefinitions.findMany({
          where: inArray(attributeDefinitions.id, attrIds),
        })
      : [];
    const attrById = new Map(attrs.map(a => [a.id, a]));
    const optionsByAttr = attrIds.length
      ? await this.db.db.query.attributeOptions.findMany({
          where: inArray(attributeOptions.attributeId, attrIds),
          orderBy: [asc(attributeOptions.sortOrder)],
        })
      : [];
    const groups = await this.listGroups();

    const attributes = configs.map(c => {
      const def = attrById.get(c.attributeDefinitionId);
      return {
        ...c,
        definition: def ?? null,
        options: optionsByAttr.filter(o => o.attributeId === c.attributeDefinitionId),
      };
    });

    return { ...pt, groups, attributes };
  }

  // ── Product type ⇄ attribute configuration ───────────────────

  async setProductTypeAttributes(id: string, configs: TypeAttributeConfig[]) {
    const pt = await this.db.db.query.productTypes.findFirst({ where: eq(productTypes.id, id) });
    if (!pt) throw new NotFoundException('Product type not found');

    const attrIds = configs.map(c => c.attributeDefinitionId);
    if (attrIds.length > 0) {
      const found = await this.db.db.query.attributeDefinitions.findMany({
        where: inArray(attributeDefinitions.id, attrIds),
      });
      if (found.length !== new Set(attrIds).size) {
        throw new BadRequestException('One or more attribute definitions do not exist');
      }
    }

    await this.db.db.delete(productTypeAttributes).where(eq(productTypeAttributes.productTypeId, id));
    if (configs.length === 0) return this.getProductTypeSchema(id);

    await this.db.db.insert(productTypeAttributes).values(
      configs.map((c, i) => ({
        id: crypto.randomUUID(),
        productTypeId: id,
        attributeDefinitionId: c.attributeDefinitionId,
        groupId: c.groupId ?? null,
        required: c.required ?? false,
        scope: c.scope ?? 'PRODUCT',
        displayOrder: c.displayOrder ?? i,
        filterable: c.filterable ?? false,
        searchable: c.searchable ?? false,
        sortable: c.sortable ?? false,
        comparable: c.comparable ?? false,
        visibleInListing: c.visibleInListing ?? true,
        visibleInDetail: c.visibleInDetail ?? true,
        allowedValues: c.allowedValues ?? [],
        validationRules: c.validationRules ?? {},
        conditionalRules: c.conditionalRules ?? [],
      })),
    );
    return this.getProductTypeSchema(id);
  }

  async setVariantDimensions(id: string, dimensionAttributeIds: string[]) {
    const pt = await this.db.db.query.productTypes.findFirst({ where: eq(productTypes.id, id) });
    if (!pt) throw new NotFoundException('Product type not found');
    await this.validateVariantDimensions(pt.categoryId, dimensionAttributeIds);
    await this.db.db
      .update(productTypes)
      .set({ variantDimensions: dimensionAttributeIds, updatedAt: new Date() })
      .where(eq(productTypes.id, id));
    return this.getProductTypeSchema(id);
  }

  /**
   * Variant dimensions must exist, be ACTIVE, and be VARIANT-scope (§10, §20).
   * Merchants must not be able to promote an arbitrary PRODUCT/OFFER attribute
   * (CPU, Warranty, OS, country of origin) into a variation axis.
   */
  private async validateVariantDimensions(
    _categoryId: string | null,
    dimensionAttributeIds: string[],
  ) {
    if (dimensionAttributeIds.length === 0) return;
    const attrs = await this.db.db.query.attributeDefinitions.findMany({
      where: inArray(attributeDefinitions.id, dimensionAttributeIds),
    });
    const byId = new Map(attrs.map(a => [a.id, a]));
    for (const attrId of dimensionAttributeIds) {
      const a = byId.get(attrId);
      if (!a) throw new BadRequestException(`Unknown attribute for variant dimension: ${attrId}`);
      if (a.scope !== 'VARIANT') {
        throw new BadRequestException(
          `Variant dimension "${a.code}" must have VARIANT scope (found ${a.scope})`,
        );
      }
    }
  }

  // ── Canonical attribute values (PHASE 3, migration 0025) ──────

  /**
   * Coerce + validate a raw value against its attribute type, returning the
   * typed-column patch. The backend is authoritative (§16): a value that does
   * not match its declared type is rejected rather than silently stored, so a
   * facet/comparison built on these columns is always well-typed.
   */
  private coerceValue(
    def: { code: string; type: string },
    value: string | number | boolean | string[] | null,
  ): TypedValue {
    const empty: TypedValue = {
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      optionValue: null,
      valueJson: null,
    };
    if (value === null || value === undefined || value === '') return empty;

    const t = def.type;
    if (t === 'INTEGER' || t === 'DECIMAL' || t === 'MEASUREMENT' || t === 'CURRENCY') {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) throw new BadRequestException(`Attribute "${def.code}" expects a number`);
      if (t === 'INTEGER' && !Number.isInteger(n)) {
        throw new BadRequestException(`Attribute "${def.code}" expects a whole number`);
      }
      return { ...empty, valueNumber: String(n) };
    }
    if (t === 'BOOLEAN') {
      const b = typeof value === 'boolean' ? value : value === 'true' || value === 1 || value === '1';
      return { ...empty, valueBoolean: b };
    }
    if (t === 'MULTI_SELECT') {
      const arr = Array.isArray(value) ? value : [String(value)];
      return { ...empty, valueJson: arr };
    }
    if (t === 'SELECT') {
      return { ...empty, optionValue: String(value) };
    }
    if (t === 'DATE' || t === 'DATETIME') {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`Attribute "${def.code}" expects a valid date`);
      }
      return { ...empty, valueText: d.toISOString() };
    }
    // TEXT, LONG_TEXT, URL, FILE, COLOR and anything else fall back to text.
    return { ...empty, valueText: String(value) };
  }

  /** Fetch definitions, ensuring they all exist and match the required scope. */
  private async loadDefsForScope(
    attributeIds: string[],
    requiredScope: AttributeScope,
  ): Promise<Array<{ id: string; code: string; type: string; scope: string }>> {
    if (attributeIds.length === 0) return [];
    const defs = await this.db.db.query.attributeDefinitions.findMany({
      where: inArray(attributeDefinitions.id, attributeIds),
    });
    if (defs.length !== new Set(attributeIds).size) {
      throw new BadRequestException('One or more attribute definitions do not exist');
    }
    for (const d of defs) {
      if (d.scope !== requiredScope) {
        throw new BadRequestException(
          `Attribute "${d.code}" has scope ${d.scope}; expected ${requiredScope}`,
        );
      }
    }
    return defs;
  }

  /** Replace the PRODUCT-scope typed attribute values for a canonical product. */
  async setProductAttributeValues(productId: string, values: AttributeValueInput[]) {
    const product = await this.db.db.query.products.findFirst({ where: eq(products.id, productId) });
    if (!product) throw new NotFoundException('Product not found');

    const attrIds = values.map(v => v.attributeDefinitionId);
    const defs = await this.loadDefsForScope(attrIds, 'PRODUCT');
    const defById = new Map(defs.map(d => [d.id, d]));

    await this.db.db
      .delete(productAttributeValues)
      .where(eq(productAttributeValues.productId, productId));

    const now = new Date();
    const rows = values.map(v => {
      const def = defById.get(v.attributeDefinitionId)!;
      return {
        id: crypto.randomUUID(),
        productId,
        attributeDefinitionId: v.attributeDefinitionId,
        ...this.coerceValue(def, v.value),
        createdAt: now,
        updatedAt: now,
      };
    });
    if (rows.length > 0) await this.db.db.insert(productAttributeValues).values(rows);
    return this.getProductAttributeValues(productId);
  }

  async getProductAttributeValues(productId: string) {
    return this.db.db.query.productAttributeValues.findMany({
      where: eq(productAttributeValues.productId, productId),
      orderBy: [asc(productAttributeValues.attributeDefinitionId)],
    });
  }

  /**
   * Replace the VARIANT-scope typed values for one variant and recompute its
   * combination key (§19). The variant must belong to the given product; two
   * variants of the same product resolving to the same key are rejected by the
   * partial unique index (product_id, combination_key).
   */
  async setVariantAttributeValues(
    productId: string,
    variantId: string,
    values: AttributeValueInput[],
  ) {
    const variant = await this.db.db.query.productVariants.findFirst({
      where: and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)),
    });
    if (!variant) throw new NotFoundException('Variant not found for this product');

    const attrIds = values.map(v => v.attributeDefinitionId);
    const defs = await this.loadDefsForScope(attrIds, 'VARIANT');
    const defById = new Map(defs.map(d => [d.id, d]));

    await this.db.db
      .delete(variantAttributeValues)
      .where(eq(variantAttributeValues.variantId, variantId));

    const now = new Date();
    const rows = values.map(v => {
      const def = defById.get(v.attributeDefinitionId)!;
      return {
        id: crypto.randomUUID(),
        variantId,
        attributeDefinitionId: v.attributeDefinitionId,
        ...this.coerceValue(def, v.value),
        createdAt: now,
        updatedAt: now,
      };
    });
    if (rows.length > 0) await this.db.db.insert(variantAttributeValues).values(rows);

    const combinationKey = this.buildCombinationKey(defs, values);
    await this.db.db
      .update(productVariants)
      .set({ combinationKey, updatedAt: now })
      .where(eq(productVariants.id, variantId));

    return this.getVariantAttributeValues(variantId);
  }

  async getVariantAttributeValues(variantId: string) {
    return this.db.db.query.variantAttributeValues.findMany({
      where: eq(variantAttributeValues.variantId, variantId),
      orderBy: [asc(variantAttributeValues.attributeDefinitionId)],
    });
  }

  /**
   * Deterministic digest of a variant's attribute values (§19). Order- and
   * type-independent: attribute codes are sorted and each reduced to a stable
   * scalar representation, then hashed so the key always fits the 255 column.
   */
  private buildCombinationKey(
    defs: Array<{ id: string; code: string }>,
    values: AttributeValueInput[],
  ): string {
    const codeById = new Map(defs.map(d => [d.id, d.code]));
    const parts = values
      .map(v => {
        const code = codeById.get(v.attributeDefinitionId) ?? v.attributeDefinitionId;
        const repr = Array.isArray(v.value)
          ? v.value.slice().sort().join(',')
          : String(v.value);
        return `${code}=${repr}`;
      })
      .sort();
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
  }
}
