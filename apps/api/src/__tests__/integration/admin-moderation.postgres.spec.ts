import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { adminTables, AdminTable, listAdminTable } from '../../modules/admin/admin-tables';
import { AdminService } from '../../modules/admin/admin.service';
import { CatalogService } from '../../modules/catalog/catalog.service';
import { MerchantService } from '../../modules/merchant/merchant.service';
import { products, productMedia, productVariants, categories, brands } from '../../modules/catalog/catalog.schema';
import { users, organizations, organizationMembers, roles } from '../../modules/identity/identity.schema';
import { stores, verificationRequests } from '../../modules/merchant/merchant.schema';
import { masterOrders, orders } from '../../modules/orders/orders.schema';
import { disputes } from '../../modules/reviews/support.schema';
import { auditLogs, outboxEvents } from '../../modules/audit/audit.schema';

// Never uses DATABASE_URL: migrations and fixtures run only in this disposable container.
describe('admin moderation on PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: DatabaseService['db'];
  let merchant: MerchantService;
  let admin: AdminService;
  let catalog: CatalogService;
  const storage = { createPresignedGetUrl: vi.fn(async (_bucket: string, key: string) => `https://preview.invalid/${key}`) };
  const orgId = randomUUID(), actorId = randomUUID(), roleId = randomUUID();
  const fixtureIds = Array.from({ length: 65 }, () => randomUUID());
  const date = new Date('2025-06-10T23:59:59.999Z');

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema: { products, productMedia, productVariants, stores, categories, brands, verificationRequests, users, organizations, disputes } }) as unknown as DatabaseService['db'];
    const migrations = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
    // Analytics partition maintenance needs pg_partman; it is unrelated to these tables.
    const excluded = ['0013_analytics.sql', '0018_analytics_retention.sql'];
    for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql') && !excluded.includes(file)).sort()) {
      await pool.query(await readFile(path.join(migrations, file), 'utf8'));
    }
    const database = { db } as DatabaseService;
    merchant = new MerchantService(database, { publish: vi.fn() } as any, storage as any);
    admin = new AdminService(database, storage as any, { send: vi.fn().mockResolvedValue(undefined) } as any);
    catalog = new CatalogService(database, {} as any, { publish: vi.fn() } as any, storage as any, { record: vi.fn() } as any);
    await db.insert(organizations).values({ id: orgId, name: 'Fixture organization', type: 'WHOLESALER', country: 'SA' });
    await db.insert(users).values({ id: actorId, fullName: 'Reviewer', phone: '+19999999999' });
    await db.insert(roles).values({ id: roleId, key: 'TEST_MEMBER', name: 'Test member' });
    for (const [index, id] of fixtureIds.entries()) {
      const label = `Fixture ${String(index).padStart(2, '0')}`;
      await db.insert(users).values({ id, fullName: label, phone: `+1555000${index}`, passwordHash: 'never-return-this', createdAt: date });
      await db.insert(stores).values({ id, orgId, slug: `fixture-${index}`, displayName: label, createdAt: date });
      await db.insert(products).values({ id, storeId: id, slug: `fixture-${index}`, title: label, images: ['https://image.invalid/a'], createdAt: date });
      await db.insert(categories).values({ id, name: label, slug: `fixture-${index}`, parentId: index ? fixtureIds[0] : null, createdAt: date });
      await db.insert(brands).values({ id, name: label, slug: `fixture-${index}`, createdAt: date });
      await db.insert(masterOrders).values({ id, buyerId: id });
      await db.insert(orders).values({ id, masterOrderId: id, buyerId: id, storeId: id, currency: 'SAR', totalMinor: index * 100, createdAt: date });
      await db.insert(verificationRequests).values({ id, orgId, storeId: id, submittedBy: actorId, submittedAt: date });
      await db.insert(disputes).values({ id, orderId: id, raisedBy: id, againstId: actorId, reason: label, createdAt: date });
      await db.insert(auditLogs).values({ id, actorType: 'ADMIN', action: label, resource: 'product', actorId, createdAt: date });
    }
  }, 180_000);
  afterAll(async () => { await pool?.end(); await container?.stop(); }, 30_000);

  it.each(Object.keys(adminTables) as AdminTable[])('%s searches and paginates beyond fifty with stable sorts', async name => {
    const first = await listAdminTable(db, name, { search: 'Fixture', limit: 50, sortBy: 'id', sortDir: 'asc' });
    const last = await listAdminTable(db, name, { search: 'Fixture', limit: 50, offset: 50, sortBy: 'id', sortDir: 'asc' });
    expect(first.total).toBe(65);
    expect(first.data).toHaveLength(50);
    expect(last.data).toHaveLength(15);
    const ascending = [...first.data, ...last.data].map(row => row['id']);
    expect(new Set(ascending).size).toBe(65);
    const descending = await listAdminTable(db, name, { search: 'Fixture', limit: 100, sortBy: 'id', sortDir: 'desc' });
    expect(descending.data.map(row => row['id'])).toEqual([...ascending].reverse());
    const beyond = await listAdminTable(db, name, { search: 'Fixture', offset: 100 });
    expect(beyond).toMatchObject({ data: [], total: 65 });
    const day = name === 'verifications' ? 'submittedAt' : 'createdAt';
    const combined = await listAdminTable(db, name, { search: 'Fixture', dateField: day, from: '2025-06-10', to: '2025-06-10' });
    expect(combined.total).toBe(65);
    const absent = await listAdminTable(db, name, { search: 'Fixture', dateField: day, from: '2025-06-11' });
    expect(absent.total).toBe(0);
  });

  it('escapes wildcard search, deduplicates memberships, and never exposes credentials', async () => {
    await db.update(users).set({ email: 'literal_%@example.test' }).where(eq(users.id, fixtureIds[0]!));
    const secondOrg = randomUUID();
    await db.insert(organizations).values({ id: secondOrg, name: 'Other', type: 'RETAILER', country: 'SA' });
    await db.insert(organizationMembers).values([orgId, secondOrg].map(org => ({ id: randomUUID(), orgId: org, userId: fixtureIds[0]!, roleId })));
    const result = await listAdminTable(db, 'users', { roleId, search: '_%' });
    expect(result.total).toBe(1);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('never-return-this');
    const detail = await admin.getUserDetail(fixtureIds[0]!);
    expect(detail.organizations).toHaveLength(2);
    expect(detail).not.toHaveProperty('passwordHash');
    const filtered = await listAdminTable(db, 'users', { orgId, roleId });
    expect(filtered.total).toBe(1);
  });

  it('joins participant/parent labels, excludes descendants, and sorts nulls last', async () => {
    const category = await listAdminTable(db, 'categories', { parentId: fixtureIds[0], search: 'Fixture 64' });
    expect(category.data[0]?.['parentName']).toBe('Fixture 00');
    expect((await listAdminTable(db, 'categories', { excludeTreeId: fixtureIds[0] })).total).toBe(0);
    const dispute = await admin.getDisputeDetail(fixtureIds[0]!);
    expect(dispute.raisedByName).toBe('Fixture 00');
    for (const sortDir of ['asc', 'desc']) {
      const result = await listAdminTable(db, 'users', { search: 'Fixture', sortBy: 'email', sortDir, limit: 100 });
      expect(result.data[0]?.['email']).toBe('literal_%@example.test');
      const nullIds = result.data.slice(1).map(row => row['id']);
      expect(nullIds).toEqual([...nullIds].sort());
    }
    const amounts = await listAdminTable(db, 'orders', { currency: 'SAR', totalMin: '6000', sortBy: 'totalMinor', sortDir: 'desc' });
    expect(amounts.total).toBe(5);
    expect(amounts.data[0]?.['totalMinor']).toBe(6400);
  });

  async function approvalFixture() {
    const storeId = randomUUID(), requestId = randomUUID(), organizationId = randomUUID();
    await db.insert(organizations).values({ id: organizationId, name: 'Approval org', type: 'WHOLESALER', country: 'SA' });
    await db.insert(stores).values({ id: storeId, orgId: organizationId, slug: storeId, displayName: 'Approval store' });
    await db.insert(verificationRequests).values({ id: requestId, storeId, orgId: organizationId, submittedBy: actorId });
    return { storeId, requestId, organizationId };
  }
  async function product(storeId: string, overrides: Partial<typeof products.$inferInsert> = {}) {
    const id = randomUUID();
    await db.insert(products).values({ id, storeId, slug: id, title: 'Eligible', images: [' products/test/a.png '], updatedAt: date, ...overrides });
    return id;
  }

  it('activates only eligible current drafts and shares image semantics with list/detail', async () => {
    const { storeId, requestId } = await approvalFixture();
    const eligible = [await product(storeId), await product(storeId, { publishedAt: date })];
    const mediaOnly = await product(storeId, { images: { malformed: true } });
    const variantId = randomUUID();
    await db.insert(productVariants).values({ id: variantId, productId: mediaOnly, sku: variantId, images: ['products/variant/a.png'] });
    await db.insert(productMedia).values([
      { id: randomUUID(), productId: mediaOnly, variantId, url: ' products/test/media.png ' },
      { id: randomUUID(), productId: eligible[0]!, url: 'products/test/a.png' },
      { id: randomUUID(), productId: eligible[0]!, url: '  ' },
    ]);
    eligible.push(mediaOnly);
    const invalid = await Promise.all([
      product(storeId, { title: ' \t\n ' }), product(storeId, { slug: ' \t ' }),
      product(storeId, { moq: 0 }), product(storeId, { condition: 'BROKEN' }),
      product(storeId, { images: [null, 1, {}, ' ', '\t'] }), product(storeId, { images: 'not-an-array' }),
      product(storeId, { images: [] }), product(storeId, { status: 'ACTIVE' }),
      product(storeId, { status: 'REJECTED' }), product(storeId, { deletedAt: date }),
      product(fixtureIds[0]!),
    ]);
    await db.insert(productVariants).values({ id: randomUUID(), productId: invalid[6]!, sku: randomUUID(), images: ['products/variant/only.png'] });
    const before = await db.select().from(products);
    const listed = await listAdminTable(db, 'products', { storeId, hasImages: 'true' });
    expect(listed.data.find(row => row['id'] === eligible[0])?.['imageCount']).toBe(1);
    expect((await catalog.getProductDetail(mediaOnly)).imageCount).toBe(1);
    const result = await merchant.reviewVerification(requestId, actorId, 'APPROVED', 'Reviewed');
    expect(result.autoActivatedProductCount).toBe(3);
    const after = await db.select().from(products);
    for (const id of invalid) expect(after.find(row => row.id === id)).toEqual(before.find(row => row.id === id));
    for (const id of eligible) {
      const row = after.find(row => row.id === id)!;
      expect(row).toMatchObject({ status: 'ACTIVE', isAvailable: true, updatedAt: result.reviewedAt });
      expect(row.publishedAt).toEqual(id === eligible[1] ? date : result.reviewedAt);
    }
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, requestId));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ autoActivatedProductCount: 3 });
    const future = await product(storeId);
    expect((await db.select().from(products).where(eq(products.id, future)))[0]?.status).toBe('DRAFT');
    await expect(merchant.reviewVerification(requestId, actorId, 'APPROVED')).rejects.toThrow('already resolved');
    await expect(catalog.getProductDetail(invalid[9]!)).rejects.toThrow();
  });

  it.each(['REJECTED', 'REVISION'] as const)('%s leaves drafts unchanged', async decision => {
    const { storeId, requestId } = await approvalFixture();
    const id = await product(storeId);
    const result = await merchant.reviewVerification(requestId, actorId, decision);
    expect(result.autoActivatedProductCount).toBe(0);
    expect((await db.select().from(products).where(eq(products.id, id)))[0]).toMatchObject({ status: 'DRAFT', updatedAt: date });
    expect((await db.select().from(stores).where(eq(stores.id, storeId)))[0]?.verificationStatus).toBe(decision === 'REVISION' ? 'REVIEW' : 'REJECTED');
  });

  it('rolls back request/store/org/products when the outbox insert fails', async () => {
    const { storeId, requestId, organizationId } = await approvalFixture();
    const id = await product(storeId);
    await pool.query(`CREATE FUNCTION fail_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test outbox failure'; END $$;
      CREATE TRIGGER fail_test_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_test_outbox()`);
    try {
      await expect(merchant.reviewVerification(requestId, actorId, 'APPROVED')).rejects.toThrow('test outbox failure');
    } finally { await pool.query('DROP TRIGGER fail_test_outbox ON outbox_events; DROP FUNCTION fail_test_outbox()'); }
    expect((await db.select().from(verificationRequests).where(eq(verificationRequests.id, requestId)))[0]?.status).toBe('SUBMITTED');
    expect((await db.select().from(stores).where(eq(stores.id, storeId)))[0]?.verificationStatus).toBe('PENDING');
    expect((await db.select().from(organizations).where(eq(organizations.id, organizationId)))[0]?.verificationStatus).toBe('PENDING');
    expect((await db.select().from(products).where(eq(products.id, id)))[0]).toMatchObject({ status: 'DRAFT', updatedAt: date });
  });

  it('serializes concurrent reviewers and handles an approval with no drafts', async () => {
    const { requestId } = await approvalFixture();
    const results = await Promise.allSettled([
      merchant.reviewVerification(requestId, actorId, 'APPROVED'),
      merchant.reviewVerification(requestId, actorId, 'APPROVED'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, requestId)))).toHaveLength(1);
  });

  it('signs only product-owned media keys and refuses archived moderation', async () => {
    const { storeId } = await approvalFixture();
    const id = await product(storeId, { images: ['products/test/a.png', 'documents/private.pdf', 'products/../private', 'https://external.invalid/image'] });
    const variant = randomUUID();
    await db.insert(productVariants).values({ id: variant, productId: id, sku: variant, images: ['products/test/variant.png'] });
    storage.createPresignedGetUrl.mockClear();
    const previews = await admin.productMediaPreviews(id);
    expect(Object.keys(previews.previews).sort()).toEqual(['products/test/a.png', 'products/test/variant.png']);
    expect(storage.createPresignedGetUrl).toHaveBeenCalledTimes(2);
    await admin.moderateProduct(id, 'ARCHIVED');
    await expect(admin.moderateProduct(id, 'APPROVED')).rejects.toThrow();
    await expect(admin.productMediaPreviews(id)).rejects.toThrow();
    await expect(catalog.getProductDetail(randomUUID())).rejects.toThrow();
  });
});
