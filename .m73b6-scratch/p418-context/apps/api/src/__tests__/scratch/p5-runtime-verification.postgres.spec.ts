/**
 * P5 Runtime Verification Completion — PostgreSQL Integration Tests
 *
 * Exercises the actual AdminService → CatalogService/TaxonomyService
 * delegation chain against real PostgreSQL (Testcontainers).
 *
 * SCRATCH FILE — deleted after verification.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseService } from '../../common/database/database.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { AdminService } from '../../modules/admin/admin.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from '../../drizzle/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

/** Convert pg timestamp to ISO string (handles both Date and string). */
function toISO(val: any): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

async function applyMigrations(pool: Pool) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort();
  for (const f of files) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'));
  }
}

// ── Shared state ────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: DatabaseService;
let catalogService: CatalogService;
let taxonomyService: CatalogTaxonomyService;
let adminService: AdminService;
let productId: string;
let attrDefId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await applyMigrations(pool);

  const drizzleDb = drizzle(pool, { schema: schema as any }) as any;
  db = { db: drizzleDb } as any;

  taxonomyService = new CatalogTaxonomyService(db);
  catalogService = new CatalogService(
    db,
    {} as any,  // RedisService
    { publish: async () => undefined } as any,  // OutboxDispatcher
    { createPresignedGetUrl: async () => null } as any,  // StorageService
    { record: async () => {} } as any,  // AuditService
    { evaluate: () => ({ effects: new Map(), errors: [] }) } as any,  // ConditionalRulesService
    taxonomyService,
    {} as any, // MerchantXlsxParserService
    {} as any, // ImportValidationService,
    {} as any, // ProductGovernanceService
  );
  adminService = new AdminService(
    db,
    {} as any,  // storage
    {} as any,  // notifications
    catalogService,
    taxonomyService,
    {} as any, // governance
  );

  // Seed org + store
  const orgId = randomUUID();
  const storeId = randomUUID();
  await pool.query(
    `INSERT INTO organizations (id, name, type, country) VALUES ($1, $2, $3, $4)`,
    [orgId, 'P5-Verify-Org', 'WHOLESALER', 'SA'],
  );
  await pool.query(
    `INSERT INTO stores (id, org_id, slug, display_name) VALUES ($1, $2, $3, $4)`,
    [storeId, orgId, 'p5-verify-store', 'P5 Verify Store'],
  );

  // Seed taxonomy
  const attrGroupId = randomUUID();
  attrDefId = randomUUID();
  const productTypeId = randomUUID();
  await pool.query(`INSERT INTO attribute_groups (id, name) VALUES ($1, $2)`, [attrGroupId, 'Variant Attrs']);
  await pool.query(`INSERT INTO attribute_definitions (id, code, name, scope, type) VALUES ($1, $2, $3, $4, $5)`,
    [attrDefId, 'color', 'Color', 'VARIANT', 'TEXT']);
  await pool.query(`INSERT INTO product_types (id, code, name) VALUES ($1, $2, $3)`,
    [productTypeId, 'p5-type', 'P5-Type']);
  await pool.query(`INSERT INTO product_type_attributes (id, product_type_id, attribute_definition_id, required) VALUES ($1, $2, $3, false)`,
    [randomUUID(), productTypeId, attrDefId]);

  // Insert canonical product
  productId = randomUUID();
  await pool.query(
    `INSERT INTO products (id, store_id, product_type_id, slug, title, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [productId, storeId, productTypeId, 'p5-verify-product', 'P5 Verify Product', new Date()],
  );
}, 120_000);

afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

// ═══════════════════════════════════════════════════════════════════════
// All tests in one sequential describe to avoid cross-test state issues
// ═══════════════════════════════════════════════════════════════════════

describe('P5 Runtime Verification', () => {
  // ── CRUD ──────────────────────────────────────────────────────────

  it('CRUD-A: admin creates variant', async () => {
    const v = await adminService.adminCreateVariant(productId, {
      sku: 'P5-CRUD-001', title: 'CRUD Variant', titleAr: 'بديل اختبار',
      barcode: '6001234567890', unit: 'BOX', weightGrams: 250,
    });
    expect(v).toBeDefined();
    expect(v.sku).toBe('P5-CRUD-001');
    expect(v.title).toBe('CRUD Variant');
    expect(v.titleAr).toBe('بديل اختبار');
    expect(v.productId).toBe(productId);
    expect(v.isActive).toBe(true);

    const row = await pool.query(`SELECT * FROM product_variants WHERE sku = 'P5-CRUD-001'`);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].barcode).toBe('6001234567890');
    expect(row.rows[0].unit).toBe('BOX');
    expect(String(row.rows[0].weight_grams)).toMatch(/^250/);
  });

  it('CRUD-B: admin retrieves variant', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001'`);
    const result = await adminService.adminGetVariant(row.rows[0].id);
    expect(result).toBeDefined();
    expect(result.sku).toBe('P5-CRUD-001');
  });

  it('CRUD-C: admin edits variant scalar fields', async () => {
    const row = await pool.query(`SELECT id, updated_at FROM product_variants WHERE sku = 'P5-CRUD-001'`);
    const vid = row.rows[0].id;
    const ts = toISO(row.rows[0].updated_at);

    const updated = await adminService.adminUpdateVariant(productId, vid, {
      sku: 'P5-CRUD-001-E', title: 'Edited CRUD', titleAr: 'المعدل',
      barcode: '9999999999999', unit: 'KG', weightGrams: 500,
    }, ts);
    expect(updated!.sku).toBe('P5-CRUD-001-E');
    expect(updated!.title).toBe('Edited CRUD');
    expect(updated!.titleAr).toBe('المعدل');

    const check = await pool.query(`SELECT * FROM product_variants WHERE id = '${vid}'`);
    expect(check.rows[0].sku).toBe('P5-CRUD-001-E');
    expect(check.rows[0].barcode).toBe('9999999999999');
    expect(check.rows[0].unit).toBe('KG');
  });

  it('CRUD-D: admin deactivates variant via bulk toggleActive', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001-E'`);
    const vid = row.rows[0].id;
    const result = await adminService.adminBulkVariantOperations(productId, {
      toggleActive: [{ id: vid, isActive: false }] as any,
    });
    expect(result.toggled).toContain(vid);
    const check = await pool.query(`SELECT is_active FROM product_variants WHERE id = '${vid}'`);
    expect(check.rows[0].is_active).toBe(false);
  });

  it('CRUD-E: admin reactivates variant via bulk toggleActive', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001-E'`);
    const vid = row.rows[0].id;
    const result = await adminService.adminBulkVariantOperations(productId, {
      toggleActive: [{ id: vid, isActive: true }] as any,
    });
    expect(result.toggled).toContain(vid);
    const check = await pool.query(`SELECT is_active FROM product_variants WHERE id = '${vid}'`);
    expect(check.rows[0].is_active).toBe(true);
  });

  it('CRUD-F: admin deletes variant via bulk deleteIds', async () => {
    const throwaway = await adminService.adminCreateVariant(productId, { sku: 'P5-DROP' });
    const result = await adminService.adminBulkVariantOperations(productId, { deleteIds: [throwaway.id] });
    expect(result.deleted).toContain(throwaway.id);
    const check = await pool.query(`SELECT * FROM product_variants WHERE id = '${throwaway.id}'`);
    expect(check.rowCount).toBe(0);
  });

  it('CRUD-G: unknown variant → 404', async () => {
    try {
      await adminService.adminGetVariant(randomUUID());
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.status || err.statusCode).toBe(404);
    }
  });

  // ── Typed Attributes ──────────────────────────────────────────────

  it('ATTR-A: admin writes typed attributes', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001-E'`);
    const vid = row.rows[0].id;
    const result = await adminService.adminSetVariantAttributeValues(productId, vid, [
      { attributeDefinitionId: attrDefId, value: 'Red' },
    ]);
    expect(result).toBeDefined();
    // Return shape depends on tx.query binding; verify via DB directly
    const attrRows = await pool.query(`SELECT * FROM variant_attribute_values WHERE variant_id = '${vid}'`);
    expect(attrRows.rowCount).toBeGreaterThanOrEqual(1);
    expect(attrRows.rows[0].value_text).toBe('Red');
  });

  it('ATTR-B: admin reads typed attributes', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001-E'`);
    const vid = row.rows[0].id;
    const result = await adminService.adminGetVariantAttributeValues(vid);
    expect(result.length).toBe(1);
    expect((result as any)[0].valueText).toBe('Red');
  });

  it('ATTR-C: attribute replacement is atomic (DELETE + INSERT)', async () => {
    const row = await pool.query(`SELECT id FROM product_variants WHERE sku = 'P5-CRUD-001-E'`);
    const vid = row.rows[0].id;
    await adminService.adminSetVariantAttributeValues(productId, vid, [
      { attributeDefinitionId: attrDefId, value: 'Green' },
    ]);
    const attrRows = await pool.query(`SELECT * FROM variant_attribute_values WHERE variant_id = '${vid}'`);
    expect(attrRows.rowCount).toBe(1);
    expect(attrRows.rows[0].value_text).toBe('Green');
  });

  // ── Optimistic Locking: 50 iterations admin-vs-admin ──────────────

  it('LOCK-01: 50 iterations admin-vs-admin — 0 double-success', async () => {
    const raceVariant = await adminService.adminCreateVariant(productId, { sku: 'P5-RACE-ADMIN' });
    const variantId = raceVariant.id;
    let doubleSuccess = 0, winsA = 0, winsB = 0, conflicts = 0, unexpectedErrors = 0;

    for (let i = 0; i < 50; i++) {
      const current = await pool.query(`SELECT updated_at FROM product_variants WHERE id = '${variantId}'`);
      const snapshotTs = toISO(current.rows[0].updated_at);

      const results = await Promise.allSettled([
        adminService.adminUpdateVariant(productId, variantId, { title: `Admin-A-${i}` }, snapshotTs),
        adminService.adminUpdateVariant(productId, variantId, { title: `Admin-B-${i}` }, snapshotTs),
      ]);
      const aOk = results[0].status === 'fulfilled';
      const bOk = results[1].status === 'fulfilled';
      if (aOk && bOk) doubleSuccess++;
      else if (aOk) winsA++;
      else if (bOk) winsB++;
      for (const r of results) {
        if (r.status === 'rejected') {
          const code = r.reason?.status || r.reason?.statusCode;
          if (code === 409) conflicts++;
          else unexpectedErrors++;
        }
      }
    }

    const final = await pool.query(`SELECT title FROM product_variants WHERE id = '${variantId}'`);
    await adminService.adminBulkVariantOperations(productId, { deleteIds: [variantId] });

    expect(doubleSuccess).toBe(0);
    expect(unexpectedErrors).toBe(0);
    expect(winsA + winsB).toBe(50);
    expect(conflicts).toBe(50);
    expect(final.rows[0].title).toMatch(/^Admin-(A|B)-\d+$/);
  }, 180_000);

  // ── Attribute Concurrency: 50 iterations ──────────────────────────

  it('ATTR-CONC-01: 50 iterations concurrent attribute replacement — 0 corrupt', async () => {
    const concVariant = await adminService.adminCreateVariant(productId, { sku: 'P5-RACE-ATTR' });
    const variantId = concVariant.id;
    let bothSucceeded = 0, oneSucceeded = 0, bothFailed = 0;

    for (let i = 0; i < 50; i++) {
      const results = await Promise.allSettled([
        adminService.adminSetVariantAttributeValues(productId, variantId, [
          { attributeDefinitionId: attrDefId, value: `Color-A-${i}` },
        ]),
        adminService.adminSetVariantAttributeValues(productId, variantId, [
          { attributeDefinitionId: attrDefId, value: `Color-B-${i}` },
        ]),
      ]);
      const aOk = results[0].status === 'fulfilled';
      const bOk = results[1].status === 'fulfilled';
      if (aOk && bOk) bothSucceeded++;
      else if (aOk || bOk) oneSucceeded++;
      else bothFailed++;
    }

    const attrRows = await pool.query(`SELECT * FROM variant_attribute_values WHERE variant_id = '${variantId}'`);
    expect(attrRows.rowCount).toBe(1);
    expect(attrRows.rows[0].value_text).toMatch(/^Color-(A|B)-\d+$/);

    const varRow = await pool.query(`SELECT combination_key FROM product_variants WHERE id = '${variantId}'`);
    expect(varRow.rows[0].combination_key).toBeTruthy();

    await adminService.adminBulkVariantOperations(productId, { deleteIds: [variantId] });
    expect(bothSucceeded + oneSucceeded + bothFailed).toBe(50);
  }, 180_000);

  // ── Combination Key ───────────────────────────────────────────────

  it('COMBKEY-01: sequential duplicate combination_key prevented', async () => {
    const v1 = await adminService.adminCreateVariant(productId, { sku: 'P5-COMB-A' });
    const v2 = await adminService.adminCreateVariant(productId, { sku: 'P5-COMB-B' });

    await adminService.adminSetVariantAttributeValues(productId, v1.id, [
      { attributeDefinitionId: attrDefId, value: 'DupColor' },
    ]);

    let caught = false;
    try {
      await adminService.adminSetVariantAttributeValues(productId, v2.id, [
        { attributeDefinitionId: attrDefId, value: 'DupColor' },
      ]);
    } catch { caught = true; }
    expect(caught).toBe(true);

    await adminService.adminBulkVariantOperations(productId, { deleteIds: [v1.id, v2.id] });
  });

  it('COMBKEY-02: concurrent duplicate — at most one winner', async () => {
    const v1 = await adminService.adminCreateVariant(productId, { sku: 'P5-CCOMB-A' });
    const v2 = await adminService.adminCreateVariant(productId, { sku: 'P5-CCOMB-B' });

    const results = await Promise.allSettled([
      adminService.adminSetVariantAttributeValues(productId, v1.id, [
        { attributeDefinitionId: attrDefId, value: 'RaceColor' },
      ]),
      adminService.adminSetVariantAttributeValues(productId, v2.id, [
        { attributeDefinitionId: attrDefId, value: 'RaceColor' },
      ]),
    ]);
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeLessThanOrEqual(1);

    const dupes = await pool.query(
      `SELECT combination_key, COUNT(*) FROM product_variants WHERE product_id = '${productId}' AND combination_key IS NOT NULL GROUP BY combination_key HAVING COUNT(*) > 1`);
    expect(dupes.rowCount).toBe(0);

    await adminService.adminBulkVariantOperations(productId, { deleteIds: [v1.id, v2.id] });
  });

  // ── Bulk Operations ──────────────────────────────────────────────

  it('BULK-01: bulk create + toggle + delete', async () => {
    const created = await adminService.adminBulkVariantOperations(productId, {
      create: [{ sku: 'P5-BULK-A' }, { sku: 'P5-BULK-B' }, { sku: 'P5-BULK-C' }],
    });
    expect(created.created.length).toBe(3);

    for (const id of created.created) {
      const row = await pool.query(`SELECT id FROM product_variants WHERE id = '${id}'`);
      expect(row.rowCount).toBe(1);
    }

    const toggled = await adminService.adminBulkVariantOperations(productId, {
      toggleActive: created.created.map((id: string) => ({ id, isActive: false })) as any,
    });
    expect(toggled.toggled.length).toBe(3);
    for (const id of created.created) {
      const row = await pool.query(`SELECT is_active FROM product_variants WHERE id = '${id}'`);
      expect(row.rows[0].is_active).toBe(false);
    }

    const deleted = await adminService.adminBulkVariantOperations(productId, { deleteIds: created.created });
    expect(deleted.deleted.length).toBe(3);
    for (const id of created.created) {
      const row = await pool.query(`SELECT id FROM product_variants WHERE id = '${id}'`);
      expect(row.rowCount).toBe(0);
    }
  });

  // ── Canonical-vs-Offer Boundary ──────────────────────────────────

  it('BOUNDARY-01: full CRUD lifecycle does not mutate merchant_offers', async () => {
    const beforeCount = parseInt((await pool.query(`SELECT COUNT(*) FROM merchant_offers`)).rows[0].count);

    const v = await adminService.adminCreateVariant(productId, { sku: 'P5-BOUND-FULL' });
    const vid = v.id;

    const ts = toISO((await pool.query(`SELECT updated_at FROM product_variants WHERE id = '${vid}'`)).rows[0].updated_at);
    await adminService.adminUpdateVariant(productId, vid, { title: 'Boundary Edit' }, ts);

    await adminService.adminSetVariantAttributeValues(productId, vid, [
      { attributeDefinitionId: attrDefId, value: 'Boundary' },
    ]);

    await adminService.adminBulkVariantOperations(productId, { toggleActive: [{ id: vid, isActive: false }] as any });
    await adminService.adminBulkVariantOperations(productId, { toggleActive: [{ id: vid, isActive: true }] as any });

    const afterCount = parseInt((await pool.query(`SELECT COUNT(*) FROM merchant_offers`)).rows[0].count);
    expect(afterCount).toBe(beforeCount);

    const linked = await pool.query(`SELECT * FROM merchant_offers WHERE variant_id = '${vid}'`);
    expect(linked.rowCount).toBe(0);

    await adminService.adminBulkVariantOperations(productId, { deleteIds: [vid] });
  });
});
