import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { AdminService } from '../../modules/admin/admin.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { CatalogTaxonomyService } from '../../modules/catalog/catalog.taxonomy.service';
import { products, productMedia, productVariants, categories, brands } from '../../modules/catalog/catalog.schema';
import { merchantOffers } from '../../modules/catalog/catalog.offer.schema';
import { users, organizations } from '../../modules/identity/identity.schema';
import { stores, verificationRequests } from '../../modules/merchant/merchant.schema';
import { disputes } from '../../modules/reviews/support.schema';
import { ConflictException } from '@nestjs/common';

/**
 * P3-19 Remediation — Moderation concurrency race test.
 *
 * Uses testcontainers for a disposable PostgreSQL instance.
 *
 * Verifies that the atomic conditional UPDATE in moderateProduct()
 * prevents lost updates when moderation and product edits race
 * from the same updatedAt timestamp.
 *
 * Pre-remediation: 17/50 double-success (34% lost-update rate)
 * Post-remediation expected: 0/50 double-success
 */
describe('P3-19 Remediation — Moderation concurrency race', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let admin: AdminService;
  let catalog: CatalogService;
  const storage = { createPresignedGetUrl: vi.fn(async (_b: string, k: string) => `https://preview.invalid/${k}`) };
  const orgId = randomUUID();
  const storeId = randomUUID();
  const actorId = randomUUID();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: { products, productMedia, productVariants, stores, categories, brands, verificationRequests, users, organizations, disputes, merchantOffers },
    }) as unknown as DatabaseService['db'];

    // Run all migrations in the race test database
    const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
    const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
    for (const file of (await readdir(migrations)).filter(f => f.endsWith('.sql') && !excluded.includes(f)).sort()) {
      await pool.query(await readFile(path.join(migrations, file), 'utf8'));
    }

    const database = { db } as DatabaseService;
    const taxonomyService = new CatalogTaxonomyService(database);
    catalog = new CatalogService(database, {} as any, { publish: vi.fn() } as any, storage as any, { record: vi.fn() } as any, { evaluate: () => ({ effects: new Map(), errors: [] }) } as any, taxonomyService, {} as any, {} as any, {} as any);
    admin = new AdminService(database, storage as any, { send: vi.fn().mockResolvedValue(undefined) } as any, catalog, taxonomyService, {} as any);

    await db.insert(organizations).values({ id: orgId, name: 'Race Org', type: 'WHOLESALER', country: 'SA' });
    await db.insert(users).values({ id: actorId, fullName: 'Race Admin', phone: '+19990000088' });
    await db.insert(stores).values({ id: storeId, orgId, slug: 'race-store', displayName: 'Race Store' });
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  it('50 iterations: concurrent moderation vs edit — expects 0 double-success', async () => {
    let doubleSuccess = 0;
    let oneWinnerOne409 = 0;
    let otherFailures = 0;

    for (let i = 0; i < 50; i++) {
      const created = await admin.adminCreateProduct({
        title: `Race Product ${i}`,
        storeId,
        slug: `race-${i}-${randomUUID().substring(0, 8)}`,
      } as any, actorId);

      const updatedAt = created['updatedAt'] as string;
      const productId = created.id;

      const results = await Promise.allSettled([
        admin.moderateProduct(productId, 'APPROVED', undefined, updatedAt),
        admin.adminUpdateProduct(productId, { title: `Race Edited ${i}` } as any, updatedAt),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      if (fulfilled.length === 2) {
        doubleSuccess++;
      } else if (fulfilled.length === 1 && rejected.length === 1) {
        oneWinnerOne409++;
        const rejection = (rejected[0] as PromiseRejectedResult).reason;
        expect(rejection).toBeInstanceOf(ConflictException);
      } else {
        otherFailures++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== Moderation vs Edit Race (50 iterations) ===`);
    // eslint-disable-next-line no-console
    console.log(`Double-success:            ${doubleSuccess}`);
    // eslint-disable-next-line no-console
    console.log(`One winner + one 409:      ${oneWinnerOne409}`);
    // eslint-disable-next-line no-console
    console.log(`Other failures:             ${otherFailures}`);

    expect(doubleSuccess).toBe(0);
    expect(oneWinnerOne409).toBe(50);
    expect(otherFailures).toBe(0);
  }, 300_000);

  it('50 iterations: concurrent admin vs admin edit — expects 0 double-success', async () => {
    let doubleSuccess = 0;
    let oneWinnerOne409 = 0;

    for (let i = 0; i < 50; i++) {
      const created = await admin.adminCreateProduct({
        title: `Admin Race ${i}`,
        storeId,
        slug: `arace-${i}-${randomUUID().substring(0, 8)}`,
      } as any, actorId);

      const updatedAt = created['updatedAt'] as string;
      const productId = created.id;

      const results = await Promise.allSettled([
        admin.adminUpdateProduct(productId, { title: `Admin Edit A ${i}` } as any, updatedAt),
        admin.adminUpdateProduct(productId, { title: `Admin Edit B ${i}` } as any, updatedAt),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      if (fulfilled.length === 2) doubleSuccess++;
      else if (fulfilled.length === 1 && rejected.length === 1) oneWinnerOne409++;
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== Admin/Admin Race (50 iterations) ===`);
    // eslint-disable-next-line no-console
    console.log(`Double-success:            ${doubleSuccess}`);
    // eslint-disable-next-line no-console
    console.log(`One winner + one 409:      ${oneWinnerOne409}`);

    expect(doubleSuccess).toBe(0);
    expect(oneWinnerOne409).toBe(50);
  }, 300_000);

  it('50 iterations: concurrent admin edit vs merchant catalog update — expects 0 double-success', async () => {
    let doubleSuccess = 0;
    let oneWinnerOne409 = 0;

    for (let i = 0; i < 50; i++) {
      const created = await admin.adminCreateProduct({
        title: `Merchant Race ${i}`,
        storeId,
        slug: `mrace-${i}-${randomUUID().substring(0, 8)}`,
      } as any, actorId);

      const updatedAt = created['updatedAt'] as string;
      const productId = created.id;

      const results = await Promise.allSettled([
        admin.adminUpdateProduct(productId, { title: `Admin Wins ${i}` } as any, updatedAt),
        catalog.updateProduct(productId, { title: `Merchant Wins ${i}` } as any, updatedAt),
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      if (fulfilled.length === 2) {
        doubleSuccess++;
      } else if (fulfilled.length === 1 && rejected.length === 1) {
        oneWinnerOne409++;
        const rejection = (rejected[0] as PromiseRejectedResult).reason;
        expect(rejection).toBeInstanceOf(ConflictException);
      }

      // Verify final state consistency
      const finalProduct = await catalog.getProductDetail(productId);
      if (fulfilled.length === 1) {
        const titleIsConsistent = finalProduct.title === `Admin Wins ${i}` || finalProduct.title === `Merchant Wins ${i}`;
        expect(titleIsConsistent).toBe(true);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== Admin/Merchant Race (50 iterations) ===`);
    // eslint-disable-next-line no-console
    console.log(`Double-success:            ${doubleSuccess}`);
    // eslint-disable-next-line no-console
    console.log(`One winner + one 409:      ${oneWinnerOne409}`);

    expect(doubleSuccess).toBe(0);
    expect(oneWinnerOne409).toBe(50);
  }, 300_000);
});
