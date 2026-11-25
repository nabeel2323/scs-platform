import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { AutoCompleteWorker } from '../../modules/orders/auto-complete.worker';
import { OrdersService } from '../../modules/orders/orders.service';
import { orders } from '../../modules/orders/orders.schema';

describe('G-011 AutoCompleteWorker PostgreSQL ownership', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: any;
  const dialect = new PgDialect();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY,
        status VARCHAR(24) NOT NULL,
        auto_complete_at TIMESTAMPTZ,
        buyer_confirmed_at TIMESTAMPTZ,
        auto_complete_claimed_at TIMESTAMPTZ,
        auto_complete_claimed_by VARCHAR(128),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    db = drizzle(pool, { schema: { orders } });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  }, 60_000);

  it('allows only one instance to claim an order and fences a stale worker after lease recovery and buyer confirmation', async () => {
    const orderId = '11111111-1111-4111-8111-111111111111';
    await pool.query(
      `INSERT INTO orders (id, status, auto_complete_at)
       VALUES ($1, 'DELIVERED', NOW() - INTERVAL '1 minute')`,
      [orderId],
    );

    const execute = async (statement: any) => {
      const query = dialect.sqlToQuery(statement);
      return pool.query(query.sql, query.params as unknown[]);
    };
    const workerDb = { db: { execute } } as any;
    const workerA = new AutoCompleteWorker(workerDb, { completeOrder: vi.fn() } as any);
    const workerB = new AutoCompleteWorker(workerDb, { completeOrder: vi.fn() } as any);

    const [claimA, claimB] = await Promise.all([
      (workerA as any).claimNextOrder(),
      (workerB as any).claimNextOrder(),
    ]);

    expect(Number(Boolean(claimA)) + Number(Boolean(claimB))).toBe(1);
    const firstClaim = claimA ?? claimB;
    const firstWorker = claimA ? workerA : workerB;
    const secondWorker = claimA ? workerB : workerA;
    const firstOwner = firstClaim.auto_complete_claimed_by;

    // Simulate a crashed worker. The other instance must recover the expired lease.
    await pool.query(
      `UPDATE orders
       SET auto_complete_claimed_at = NOW() - INTERVAL '6 minutes'
       WHERE id = $1`,
      [orderId],
    );
    const recoveredClaim = await (secondWorker as any).claimNextOrder();
    expect(recoveredClaim).toBeTruthy();
    expect(recoveredClaim.auto_complete_claimed_by).not.toBe(firstOwner);

    // Buyer confirmation wins after the worker read its DELIVERED snapshot.
    await pool.query(
      `UPDATE orders
       SET status = 'COMPLETED',
           buyer_confirmed_at = NOW(),
           auto_complete_claimed_at = NULL,
           auto_complete_claimed_by = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status = 'DELIVERED'`,
      [orderId],
    );

    const service = Object.create(OrdersService.prototype) as OrdersService;
    (service as any).db = { db };
    vi.spyOn(service as any, 'getOrder').mockResolvedValue({ id: orderId, status: 'DELIVERED' });

    await expect(
      service.completeOrder(
        orderId,
        'system',
        'SYSTEM',
        'AUTO_COMPLETION',
        recoveredClaim.auto_complete_claimed_by,
      ),
    ).rejects.toMatchObject({ status: 409 });

    const finalOrder = await pool.query(
      `SELECT status, auto_complete_claimed_by FROM orders WHERE id = $1`,
      [orderId],
    );
    expect(finalOrder.rows[0]).toEqual({
      status: 'COMPLETED',
      auto_complete_claimed_by: null,
    });
    expect(firstWorker).toBeTruthy();
  }, 60_000);
});
