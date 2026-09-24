import { describe, it, expect } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogTaxonomyService, type AttributeValueInput } from '../../../modules/catalog/catalog.taxonomy.service';

/**
 * PHASE 2 — CatalogTaxonomyService validation invariants (§8–§20, Rule 10).
 *
 * The backend stays authoritative: attribute type/scope are validated, codes are
 * unique, and a variant dimension may only be a VARIANT-scope attribute so a
 * merchant/admin cannot promote CPU/Warranty/OS into a variation axis. We drive
 * the service with a mock DatabaseService shaped exactly like the Drizzle
 * surface the service touches (`this.db.db.query.X.findFirst/findMany`, and
 * chainable insert/update/delete) rather than a Nest testing module.
 */

type Row = Record<string, unknown>;

interface QueryConfig {
  findFirst?: Row | null;
  findMany?: Row[];
}

interface HarnessQueries {
  attributeDefinitions?: QueryConfig;
  attributeOptions?: QueryConfig;
  attributeGroups?: QueryConfig;
  productTypes?: QueryConfig;
  productTypeAttributes?: QueryConfig;
  products?: QueryConfig;
  productVariants?: QueryConfig;
  productAttributeValues?: QueryConfig;
  variantAttributeValues?: QueryConfig;
}

interface Harness {
  svc: CatalogTaxonomyService;
  inserted: unknown[];
  updated: unknown[];
  deleted: unknown[];
}

function makeHarness(queries: HarnessQueries = {}): Harness {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const deleted: unknown[] = [];

  const q = (cfg?: QueryConfig) => ({
    findFirst: async () => cfg?.findFirst ?? null,
    findMany: async () => cfg?.findMany ?? [],
  });

  const db = {
    db: {
      query: {
        attributeDefinitions: q(queries.attributeDefinitions),
        attributeOptions: q(queries.attributeOptions),
        attributeGroups: q(queries.attributeGroups),
        productTypes: q(queries.productTypes),
        productTypeAttributes: q(queries.productTypeAttributes),
        products: q(queries.products),
        productVariants: q(queries.productVariants),
        productAttributeValues: q(queries.productAttributeValues),
        variantAttributeValues: q(queries.variantAttributeValues),
      },
      insert: () => ({
        values: (rows: unknown) => {
          inserted.push(rows);
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (patch: unknown) => ({
          where: () => {
            updated.push(patch);
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: () => {
          deleted.push(true);
          return Promise.resolve();
        },
      }),
    },
  };

  // @ts-expect-error — partial mock is sufficient for the service's call surface
  const svc = new CatalogTaxonomyService(db);
  return { svc, inserted, updated, deleted };
}

describe('CatalogTaxonomyService — attributes', () => {
  it('rejects an unsupported attribute type', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.createAttribute({ code: 'x', name: 'X', type: 'BLOB' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unsupported scope', async () => {
    const { svc } = makeHarness();
    await expect(
      svc.createAttribute({ code: 'x', name: 'X', scope: 'ORDER' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate code before inserting', async () => {
    const { svc, inserted } = makeHarness({
      attributeDefinitions: { findFirst: { id: 'existing', code: 'ram_gb' } },
    });
    await expect(
      svc.createAttribute({ code: 'ram_gb', name: 'RAM', type: 'INTEGER' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(inserted.length).toBe(0);
  });

  it('inserts the definition then its options for a SELECT attribute', async () => {
    // findFirst=null → duplicate check passes; final getAttribute read-back then
    // throws NotFound (no row configured). The inserts still happen first.
    const { svc, inserted, deleted } = makeHarness({
      attributeDefinitions: { findFirst: null },
    });
    await expect(
      svc.createAttribute({
        code: 'color',
        name: 'Color',
        type: 'SELECT',
        scope: 'VARIANT',
        options: [{ value: 'Black' }, { value: 'Silver' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // 1 definition insert + 1 options insert (replaceOptions deletes then inserts).
    expect(inserted.length).toBeGreaterThanOrEqual(2);
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CatalogTaxonomyService — variant dimensions', () => {
  it('rejects a dimension whose attribute is not VARIANT scope', async () => {
    const { svc } = makeHarness({
      productTypes: { findFirst: { id: 'pt-1', categoryId: null } },
      attributeDefinitions: { findMany: [{ id: 'cpu', code: 'cpu', scope: 'PRODUCT' }] },
    });
    await expect(svc.setVariantDimensions('pt-1', ['cpu'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown dimension attribute', async () => {
    const { svc } = makeHarness({
      productTypes: { findFirst: { id: 'pt-1', categoryId: null } },
      attributeDefinitions: { findMany: [] },
    });
    await expect(svc.setVariantDimensions('pt-1', ['missing'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CatalogTaxonomyService — product types', () => {
  it('refuses to publish a type with no attributes', async () => {
    const { svc } = makeHarness({
      productTypes: {
        findFirst: { id: 'pt-1', code: 'laptop', version: 1, status: 'DRAFT', categoryId: null, variantDimensions: [] },
      },
      productTypeAttributes: { findMany: [] },
    });
    await expect(svc.publishProductType('pt-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate version-1 code on create', async () => {
    const { svc } = makeHarness({
      productTypes: { findFirst: { id: 'pt-1', code: 'laptop', version: 1 } },
    });
    await expect(
      svc.createProductType({ code: 'laptop', name: 'Laptop' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CatalogTaxonomyService — canonical attribute values (PHASE 3)', () => {
  it('rejects a variant-scope attribute written at the product level', async () => {
    const { svc } = makeHarness({
      products: { findFirst: { id: 'p-1' } },
      attributeDefinitions: { findMany: [{ id: 'a-color', code: 'color', type: 'SELECT', scope: 'VARIANT' }] },
    });
    await expect(
      svc.setProductAttributeValues('p-1', [{ attributeDefinitionId: 'a-color', value: 'Black' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a value that does not match the attribute type', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p-1' } },
      attributeDefinitions: { findMany: [{ id: 'a-ram', code: 'ram_gb', type: 'INTEGER', scope: 'PRODUCT' }] },
    });
    await expect(
      svc.setProductAttributeValues('p-1', [{ attributeDefinitionId: 'a-ram', value: 'not-a-number' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted.length).toBe(0);
  });

  it('stores an INTEGER value in the typed numeric column', async () => {
    const { svc, inserted } = makeHarness({
      products: { findFirst: { id: 'p-1' } },
      attributeDefinitions: { findMany: [{ id: 'a-ram', code: 'ram_gb', type: 'INTEGER', scope: 'PRODUCT' }] },
      productAttributeValues: { findMany: [] },
    });
    await svc.setProductAttributeValues('p-1', [{ attributeDefinitionId: 'a-ram', value: 16 }]);
    const rows = inserted[0] as Row[];
    expect(rows[0]).toMatchObject({ attributeDefinitionId: 'a-ram', valueNumber: '16', valueText: null });
  });

  it('requires the variant to belong to the product', async () => {
    const { svc } = makeHarness({ productVariants: { findFirst: null } });
    await expect(
      svc.setVariantAttributeValues('p-1', 'v-1', [{ attributeDefinitionId: 'a', value: 'x' }]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes an order-independent combination key', async () => {
    const defs = [
      { id: 'a-color', code: 'color', type: 'SELECT', scope: 'VARIANT' },
      { id: 'a-storage', code: 'storage_gb', type: 'INTEGER', scope: 'VARIANT' },
    ];
    const run = (values: AttributeValueInput[]) => {
      const { svc, updated } = makeHarness({
        productVariants: { findFirst: { id: 'v-1', productId: 'p-1' } },
        attributeDefinitions: { findMany: defs },
        variantAttributeValues: { findMany: [] },
      });
      return svc
        .setVariantAttributeValues('p-1', 'v-1', values)
        .then(() => (updated[0] as { combinationKey: string }).combinationKey);
    };
    const a = await run([
      { attributeDefinitionId: 'a-color', value: 'Black' },
      { attributeDefinitionId: 'a-storage', value: 512 },
    ]);
    const b = await run([
      { attributeDefinitionId: 'a-storage', value: 512 },
      { attributeDefinitionId: 'a-color', value: 'Black' },
    ]);
    const c = await run([
      { attributeDefinitionId: 'a-color', value: 'Black' },
      { attributeDefinitionId: 'a-storage', value: 256 },
    ]);
    expect(a).toBe(b); // permutation-invariant
    expect(a).not.toBe(c); // a real value change flips the key
    expect(typeof a).toBe('string');
  });
});
