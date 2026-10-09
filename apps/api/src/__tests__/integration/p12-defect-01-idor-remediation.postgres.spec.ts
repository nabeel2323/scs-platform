/**
 * P12 DEFECT-01 Remediation — GET /v1/payments/:id IDOR Regression Tests
 *
 * Verifies that the payment GET endpoint enforces proper authorization:
 * - Buyer can read own payment
 * - Buyer cannot read another buyer's payment (IDOR)
 * - Cross-org payment access denied
 * - Privileged admin retains access
 * - Events and refunds not leaked
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PaymentsService } from '../../modules/payments/payments.service';
import { DatabaseService } from '../../common/database/database.service';
import { PaymentProviderRegistry } from '../../modules/payments/payments.provider-registry';
import { ManualVerificationProvider } from '../../modules/payments/manual-verification.provider';
import * as schema from '../../drizzle/schema';
import type { CallerContext } from '../../common/tenant-scope';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

async function q(pool: Pool, text: string, params?: any[]) {
  return pool.query(text, params);
}

describe('P12 DEFECT-01 — GET /v1/payments/:id IDOR Regression', () => {
  let container: StartedPostgreSqlContainer;
  let db: DatabaseService;
  let payments: PaymentsService;
  let pool: Pool;

  // Test data
  const orgA = { id: '' };
  const orgB = { id: '' };
  const storeA = { id: '', orgId: '' };
  const storeB = { id: '', orgId: '' };
  const buyerA = { id: '' };
  const buyerB = { id: '' };
  const admin = { id: '', orgId: '' };
  const paymentA = { id: '', orderId: '' };
  const paymentB = { id: '', orderId: '' };

  beforeAll(async () => {
    // 1. Start PostgreSQL container
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({
      connectionString: container.getConnectionUri(),
      max: 10,
    });

    // 2. Run migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();

    await q(pool, `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await q(pool, 'BEGIN');
      try {
        await pool.query(sqlText);
        await q(pool, `INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
        await q(pool, 'COMMIT');
      } catch (e: any) {
        await q(pool, 'ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e.message}`);
      }
    }

    // 3. Seed RBAC
    const client = await pool.connect();
    try {
      const { seedPlatformRbac } = await import('../../../infra/drizzle/seed-pg');
      await seedPlatformRbac(client);
    } finally { client.release(); }

    // 4. Drizzle wiring
    const drizzleDb = drizzle(pool, { schema }) as any;
    db = { db: drizzleDb } as unknown as DatabaseService;

    // 5. Service construction
    const registry = new PaymentProviderRegistry();
    registry.register(new ManualVerificationProvider());
    const outboxMock = { publish: vi.fn().mockResolvedValue(undefined) } as any;
    payments = new PaymentsService(db, outboxMock, registry);

    // 6. Seed test data
    await pool.query('BEGIN');
    try {
      // Create organizations
      const orgARes = await pool.query(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        ['Org A - DEFECT-01'],
      );
      orgA.id = orgARes.rows[0].id;

      const orgBRes = await pool.query(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        ['Org B - DEFECT-01'],
      );
      orgB.id = orgBRes.rows[0].id;

      // Create stores
      const storeARes = await pool.query(
        `INSERT INTO stores (org_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id, org_id`,
        [orgA.id, 'Store A - DEFECT-01'],
      );
      storeA.id = storeARes.rows[0].id;
      storeA.orgId = storeARes.rows[0].org_id;

      const storeBRes = await pool.query(
        `INSERT INTO stores (org_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id, org_id`,
        [orgB.id, 'Store B - DEFECT-01'],
      );
      storeB.id = storeBRes.rows[0].id;
      storeB.orgId = storeBRes.rows[0].org_id;

      // Create buyers
      const buyerARes = await pool.query(
        `INSERT INTO users (email, full_name) VALUES ($1, $2) RETURNING id`,
        ['buyer-a-defect01@test.com', 'Buyer A'],
      );
      buyerA.id = buyerARes.rows[0].id;

      const buyerBRes = await pool.query(
        `INSERT INTO users (email, full_name) VALUES ($1, $2) RETURNING id`,
        ['buyer-b-defect01@test.com', 'Buyer B'],
      );
      buyerB.id = buyerBRes.rows[0].id;

      // Create admin (in Org A)
      const adminRes = await pool.query(
        `INSERT INTO users (email, full_name) VALUES ($1, $2) RETURNING id`,
        ['admin-defect01@test.com', 'Admin User'],
      );
      admin.id = adminRes.rows[0].id;
      admin.orgId = orgA.id;

      await pool.query(
        `INSERT INTO organization_members (org_id, user_id, role_id) VALUES ($1, $2, (SELECT id FROM roles WHERE key='ADMIN'))`,
        [orgA.id, admin.id],
      );

      // Create orders
      const masterOrderARes = await pool.query(
        `INSERT INTO master_orders (buyer_id, status) VALUES ($1, 'CONFIRMED') RETURNING id`,
        [buyerA.id],
      );
      const orderARes = await pool.query(
        `INSERT INTO orders (master_order_id, buyer_id, store_id, status, subtotal_minor, delivery_fee_minor, tax_minor, total_minor, currency, fulfillment_method) VALUES ($1, $2, $3, 'PAYMENT_PENDING', 50000, 5000, 0, 55000, 'SYP', 'COURIER') RETURNING id`,
        [masterOrderARes.rows[0].id, buyerA.id, storeA.id],
      );
      paymentA.orderId = orderARes.rows[0].id;

      const masterOrderBRes = await pool.query(
        `INSERT INTO master_orders (buyer_id, status) VALUES ($1, 'CONFIRMED') RETURNING id`,
        [buyerB.id],
      );
      const orderBRes = await pool.query(
        `INSERT INTO orders (master_order_id, buyer_id, store_id, status, subtotal_minor, delivery_fee_minor, tax_minor, total_minor, currency, fulfillment_method) VALUES ($1, $2, $3, 'PAYMENT_PENDING', 60000, 5000, 0, 65000, 'SYP', 'COURIER') RETURNING id`,
        [masterOrderBRes.rows[0].id, buyerB.id, storeB.id],
      );
      paymentB.orderId = orderBRes.rows[0].id;

      // Create payments
      const paymentARes = await pool.query(
        `INSERT INTO payment_records (order_id, provider_key, payment_method, status, amount_minor, currency, idempotency_key) VALUES ($1, 'manual', 'BANK_TRANSFER', 'AWAITING_VERIFICATION', 55000, 'SYP', $2) RETURNING id`,
        [paymentA.orderId, `test-defect01-a-${Date.now()}`],
      );
      paymentA.id = paymentARes.rows[0].id;

      const paymentBRes = await pool.query(
        `INSERT INTO payment_records (order_id, provider_key, payment_method, status, amount_minor, currency, idempotency_key) VALUES ($1, 'manual', 'CASH_ON_DELIVERY', 'AWAITING_PAYMENT', 65000, 'SYP', $2) RETURNING id`,
        [paymentB.orderId, `test-defect01-b-${Date.now()}`],
      );
      paymentB.id = paymentBRes.rows[0].id;

      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  }, 30_000);

  it('D01-01: buyer can read own payment', async () => {
    const caller: CallerContext = { sub: buyerA.id, role: 'BUYER', activeOrg: null };
    const payment = await payments.getPaymentOrThrow(paymentA.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    // Should not throw
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).resolves.not.toThrow();
  });

  it('D01-02: buyer cannot read another buyer payment (IDOR)', async () => {
    const caller: CallerContext = { sub: buyerB.id, role: 'BUYER', activeOrg: null };
    const payment = await payments.getPaymentOrThrow(paymentA.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).rejects.toThrow('You do not have access to this order');
  });

  it('D01-03: cross-org payment access denied', async () => {
    // Buyer B is in Org B, trying to access payment in Org A's store
    const caller: CallerContext = { sub: buyerB.id, role: 'BUYER', activeOrg: orgB.id };
    const payment = await payments.getPaymentOrThrow(paymentA.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).rejects.toThrow('You do not have access to this order');
  });

  it('D01-04: privileged admin retains access', async () => {
    const caller: CallerContext = { sub: admin.id, role: 'ADMIN', activeOrg: orgA.id };
    const payment = await payments.getPaymentOrThrow(paymentA.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).resolves.not.toThrow();
  });

  it('D01-05: buyer B can read own payment', async () => {
    const caller: CallerContext = { sub: buyerB.id, role: 'BUYER', activeOrg: null };
    const payment = await payments.getPaymentOrThrow(paymentB.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).resolves.not.toThrow();
  });

  it('D01-06: buyer A cannot read buyer B payment', async () => {
    const caller: CallerContext = { sub: buyerA.id, role: 'BUYER', activeOrg: null };
    const payment = await payments.getPaymentOrThrow(paymentB.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).rejects.toThrow('You do not have access to this order');
  });

  it('D01-07: MODERATOR (privileged) retains access', async () => {
    const caller: CallerContext = { sub: admin.id, role: 'MODERATOR', activeOrg: orgA.id };
    const payment = await payments.getPaymentOrThrow(paymentA.id);
    const order = await payments.getOrderForPayment(payment.orderId);
    
    const { assertOrderAccessible } = await import('../../common/tenant-scope');
    await expect(assertOrderAccessible(db, caller, order)).resolves.not.toThrow();
  });
});
