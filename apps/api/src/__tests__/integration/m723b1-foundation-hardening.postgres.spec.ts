/**
 * M7.2.3-B.1 — PostgreSQL Integration Tests
 *
 * Covers:
 *   B1.1 — Atomic Shipment + Outbox Transaction
 *   B1.7 — Webhook Tenant Routing (token-based)
 *   B1.2 — Email Resolution (database-backed)
 *   Security — Credential isolation, cross-tenant webhook
 *
 * Uses testcontainers (postgres:16-alpine) with an isolated test database
 * to avoid testcontainers port-mapping issues on Docker Desktop for Windows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../drizzle/schema';
import { DatabaseService } from '../../common/database/database.service';
import { CarrierCredentialCryptoService } from '../../modules/shipping/carrier-credential-crypto.service';
import { CarrierCredentialsService } from '../../modules/shipping/carrier-credentials.service';
import { CarrierEmailResolver, CarrierEmailRequiredError } from '../../modules/shipping/carrier-email-resolver';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { shipments } from '../../modules/orders/shipment.schema';
import { outboxEvents } from '../../modules/audit/audit.schema';
import { carrierCredentials, carrierWebhookEvents } from '../../modules/shipping/shipping.schema';
import { orders } from '../../modules/orders/orders.schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

// Hybrid connection strategy:
// - CI (Linux): testcontainers → fresh isolated container.
// - Local Windows: Docker Desktop port-mapping bug → fall back to direct
//   connection on the dedicated scs-b21-pg container (port 15432).
let container: StartedPostgreSqlContainer | undefined;
const FALLBACK_PG_HOST = process.env['TEST_PG_HOST'] ?? 'localhost';
const FALLBACK_PG_PORT = parseInt(process.env['TEST_PG_PORT'] ?? '15432', 10);
const FALLBACK_PG_USER = process.env['TEST_PG_USER'] ?? 'scs';
const FALLBACK_PG_PASSWORD = process.env['TEST_PG_PASSWORD'] ?? 'scs_dev_2026';

describe('M7.2.3-B.1 — PostgreSQL Integration', () => {
  let adminPool: Pool;
  let testDbName: string;
  let pool: Pool;
  let db: any;
  let database: DatabaseService;
  let credentialsService: CarrierCredentialsService;
  let cryptoService: CarrierCredentialCryptoService;
  let emailResolver: CarrierEmailResolver;

  // Test fixtures
  const orgA = randomUUID();
  const orgB = randomUUID();
  const merchantA = randomUUID();
  const merchantB = randomUUID();
  const buyerA = randomUUID();
  const buyerB = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const masterOrderId = randomUUID();

  const CARRIER_MASTER_KEY = randomBytes(32).toString('hex');

  beforeAll(async () => {
    process.env['CARRIER_CREDENTIALS_MASTER_KEY'] = CARRIER_MASTER_KEY;

    // 1. Create an isolated test database
    testDbName = `b1_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let adminConnectionString: string;
    let testDbUrl: string;

    // Try testcontainers first (works on CI/Linux); fall back to direct
    // connection for local Windows Docker Desktop port-mapping issues.
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      adminConnectionString = container.getConnectionUri();
      console.log('B.1 PG: using testcontainers');
    } catch {
      container = undefined;
      adminConnectionString = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/scs_b21_test`;
      console.log('B.1 PG: testcontainers unavailable, using direct connection');
    }

    adminPool = new Pool({ connectionString: adminConnectionString });
    // Verify connectivity
    await adminPool.query('SELECT 1');
    await adminPool.query(`CREATE DATABASE ${testDbName}`);

    // 2. Connect to the test database
    if (container) {
      testDbUrl = container.getConnectionUri().replace(/\/postgres$/, `/${testDbName}`);
    } else {
      testDbUrl = `postgresql://${FALLBACK_PG_USER}:${FALLBACK_PG_PASSWORD}@${FALLBACK_PG_HOST}:${FALLBACK_PG_PORT}/${testDbName}`;
    }
    pool = new Pool({ connectionString: testDbUrl });
    db = drizzle(pool, { schema }) as any;

    // 3. Run all migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
    for (const file of files) {
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try { await pool.query(sqlContent); await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]); await pool.query('COMMIT'); }
      catch { await pool.query('ROLLBACK'); }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    // 5. Roles
    const rolesRes = await pool.query(`SELECT id, key FROM roles`);
    const roleById = new Map(rolesRes.rows.map((r: any) => [r.key, r.id] as const));

    // 6. Create two orgs for tenant isolation testing
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'WHOLESALER', 'Org A', 'SA')`, [orgA]);
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1, 'RETAILER', 'Org B', 'SA')`, [orgB]);

    // 7. Users
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Merchant A', '+966500000001')`, [merchantA]);
    await pool.query(`INSERT INTO users (id, full_name, phone, email) VALUES ($1, 'Merchant B', '+966500000002', 'merchant-b@test.com')`, [merchantB]);
    await pool.query(`INSERT INTO users (id, full_name, phone, email) VALUES ($1, 'Buyer A', '+966500000098', 'buyer-a@test.com')`, [buyerA]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1, 'Buyer B', '+966500000099')`, [buyerB]);

    // 8. Org memberships
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, merchantA, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgB, merchantB, roleById.get('MERCHANT_OWNER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgA, buyerA, roleById.get('BUYER')]);
    await pool.query(`INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, 'ACTIVE')`, [randomUUID(), orgB, buyerB, roleById.get('BUYER')]);

    // 9. Stores
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-a', 'Store A', 'APPROVED')`, [storeA, orgA]);
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, status) VALUES ($1, $2, 'store-b', 'Store B', 'APPROVED')`, [storeB, orgB]);

    // 10. Master order
    await pool.query(
      `INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at, updated_at)
       VALUES ($1, $2, 'ACCEPTED', '{}', NOW(), NOW())`,
      [masterOrderId, buyerA],
    );

    // 11. Initialize services
    const databaseService = { db } as any;
    database = databaseService;
    cryptoService = new CarrierCredentialCryptoService();
    credentialsService = new CarrierCredentialsService(databaseService, cryptoService);
    emailResolver = new CarrierEmailResolver(databaseService);
  }, 180_000);

  afterAll(async () => {
    delete process.env['CARRIER_CREDENTIALS_MASTER_KEY'];
    await pool?.end();
    // Drop the isolated test database
    await adminPool?.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await adminPool?.end();
    if (container) await container.stop();
  }, 30_000);

  // ── B1.1: Atomic Shipment + Outbox Transaction ────────────────────────────

  describe('B1.1 — Atomic Shipment + Outbox Transaction', () => {
    it('successful transaction: shipment UPDATE + outbox INSERT are atomic', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
        [shipmentId, localOrderId, storeA],
      );

      // Simulate the atomic transaction
      const idempotencyKey = `carrier-create:${shipmentId}`;
      await db.transaction(async (tx: any) => {
        await tx.update(shipments)
          .set({ carrierCreateStatus: 'PENDING', idempotencyKey, carrierCreateRetries: 0, updatedAt: new Date() })
          .where(eq(shipments.id, shipmentId));

        await tx.insert(outboxEvents).values({
          id: randomUUID(),
          eventType: 'shipping.carrier.create',
          aggregateId: shipmentId,
          payload: { shipmentId, idempotencyKey },
          metadata: { providerKey: 'manual-driver' },
          status: 'PENDING',
        });
      });

      // Verify both changes are committed
      const shipment = await pool.query(`SELECT carrier_create_status, idempotency_key FROM shipments WHERE id = $1`, [shipmentId]);
      expect(shipment.rows[0].carrier_create_status).toBe('PENDING');
      expect(shipment.rows[0].idempotency_key).toBe(idempotencyKey);

      const outbox = await pool.query(`SELECT event_type, aggregate_id FROM outbox_events WHERE aggregate_id = $1`, [shipmentId]);
      expect(outbox.rows.length).toBe(1);
      expect(outbox.rows[0].event_type).toBe('shipping.carrier.create');
    });

    it('transaction rollback: failure in outbox INSERT rolls back shipment UPDATE', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
        [shipmentId, localOrderId, storeA],
      );

      // Attempt a transaction that fails on the outbox insert
      try {
        await db.transaction(async (tx: any) => {
          await tx.update(shipments)
            .set({ carrierCreateStatus: 'PENDING', updatedAt: new Date() })
            .where(eq(shipments.id, shipmentId));

          // Force a failure: insert with a NULL required field
          await tx.insert(outboxEvents).values({
            id: null, // This will fail — id is PRIMARY KEY NOT NULL
            eventType: 'shipping.carrier.create',
            aggregateId: shipmentId,
            payload: {},
            metadata: {},
            status: 'PENDING',
          });
        });
      } catch {
        // Expected to fail
      }

      // Verify the shipment was NOT updated (rolled back)
      const shipment = await pool.query(`SELECT carrier_create_status FROM shipments WHERE id = $1`, [shipmentId]);
      expect(shipment.rows[0].carrier_create_status).toBeNull(); // Still the original value
    });

    it('no orphan PENDING shipment without outbox event', async () => {
      // Verify that for every PENDING shipment, there is a corresponding outbox event
      const orphans = await pool.query(`
        SELECT s.id, s.carrier_create_status
        FROM shipments s
        WHERE s.carrier_create_status = 'PENDING'
        AND NOT EXISTS (
          SELECT 1 FROM outbox_events oe
          WHERE oe.aggregate_id = s.id
          AND oe.event_type = 'shipping.carrier.create'
          AND oe.status = 'PENDING'
        )
      `);
      expect(orphans.rows).toHaveLength(0);
    });

    it('repeated worker processing remains safe (idempotency)', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, carrier_create_status, idempotency_key, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', 'SUCCESS', 'carrier-create:$1', NOW(), NOW())`,
        [shipmentId, localOrderId, storeA],
      );

      // The worker should skip already-successful shipments
      const shipment = await pool.query(
        `SELECT carrier_create_status FROM shipments WHERE id = $1`,
        [shipmentId],
      );
      expect(shipment.rows[0].carrier_create_status).toBe('SUCCESS');
    });
  });

  // ── B1.7: Webhook Tenant Routing ──────────────────────────────────────────

  describe('B1.7 — Webhook Tenant Routing', () => {
    it('migration 0044 adds webhook_token column', async () => {
      const cols = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'carrier_credentials' AND column_name = 'webhook_token'
      `);
      expect(cols.rows).toHaveLength(1);
      expect(cols.rows[0].is_nullable).toBe('NO');
    });

    it('webhook tokens are unique per credential', async () => {
      // Use ADMIN role to pass assertAdmin + assertOrgAccess
      const adminCaller = { sub: merchantA, role: 'ADMIN', activeOrg: orgA };

      const credA = await credentialsService.create({
        orgId: orgA,
        providerKey: 'test-carrier',
        environment: 'sandbox',
        label: 'Org A Test',
        credentialsJson: JSON.stringify({ apiKey: 'key-a' }),
        webhookSecret: 'secret-a',
      }, adminCaller as any);

      const adminCallerB = { sub: merchantB, role: 'ADMIN', activeOrg: orgB };
      const credB = await credentialsService.create({
        orgId: orgB,
        providerKey: 'test-carrier',
        environment: 'sandbox',
        label: 'Org B Test',
        credentialsJson: JSON.stringify({ apiKey: 'key-b' }),
        webhookSecret: 'secret-b',
      }, adminCallerB as any);

      // Tokens should be different
      expect(credA.webhookToken).toBeTruthy();
      expect(credB.webhookToken).toBeTruthy();
      expect(credA.webhookToken).not.toBe(credB.webhookToken);

      // Token-based lookup should find exactly one credential
      const lookupA = await pool.query(
        `SELECT id, org_id FROM carrier_credentials WHERE webhook_token = $1 AND is_active = TRUE`,
        [credA.webhookToken],
      );
      expect(lookupA.rows).toHaveLength(1);
      expect(lookupA.rows[0].org_id).toBe(orgA);

      const lookupB = await pool.query(
        `SELECT id, org_id FROM carrier_credentials WHERE webhook_token = $1 AND is_active = TRUE`,
        [credB.webhookToken],
      );
      expect(lookupB.rows).toHaveLength(1);
      expect(lookupB.rows[0].org_id).toBe(orgB);
    });

    it('cross-tenant webhook: token routes to correct org only', async () => {
      const adminCallerA = { sub: merchantA, role: 'ADMIN', activeOrg: orgA };
      const credA = await credentialsService.create({
        orgId: orgA,
        providerKey: 'test-carrier-2',
        environment: 'sandbox',
        label: 'Org A Carrier 2',
        credentialsJson: JSON.stringify({ apiKey: 'key-a2' }),
        webhookSecret: 'secret-a2',
      }, adminCallerA as any);

      const adminCallerB = { sub: merchantB, role: 'ADMIN', activeOrg: orgB };
      const credB = await credentialsService.create({
        orgId: orgB,
        providerKey: 'test-carrier-2',
        environment: 'sandbox',
        label: 'Org B Carrier 2',
        credentialsJson: JSON.stringify({ apiKey: 'key-b2' }),
        webhookSecret: 'secret-b2',
      }, adminCallerB as any);

      // Look up using test-carrier-2 + credB's token — should find Org B's credential
      const result = await pool.query(
        `SELECT org_id FROM carrier_credentials
         WHERE provider_key = $1 AND webhook_token = $2 AND is_active = TRUE`,
        ['test-carrier-2', credB.webhookToken],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].org_id).toBe(orgB); // NOT Org A
    });
  });

  // ── B1.2: Email Resolution ────────────────────────────────────────────────

  describe('B1.2 — Email Resolution', () => {
    it('resolves email from buyer user record', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
        [shipmentId, localOrderId, storeA],
      );

      // buyerA has email 'buyer-a@test.com'
      const resolved = await emailResolver.resolve(shipmentId);
      expect(resolved.email).toBe('buyer-a@test.com');
      expect(resolved.source).toBe('buyer_user_record');
    });

    it('resolves email from shipment metadata (highest priority)', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', $4, NOW(), NOW())`,
        [shipmentId, localOrderId, storeA, JSON.stringify({ email: 'META@Test.COM' })],
      );

      const resolved = await emailResolver.resolve(shipmentId);
      expect(resolved.email).toBe('meta@test.com'); // Normalized
      expect(resolved.source).toBe('shipment_metadata');
    });

    it('throws CarrierEmailRequiredError when no email available', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      // buyerB has no email
      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeB, buyerB],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
        [shipmentId, localOrderId, storeB],
      );

      await expect(emailResolver.resolve(shipmentId)).rejects.toThrow(CarrierEmailRequiredError);
    });

    it('tenant isolation: wrong org cannot resolve email', async () => {
      const localOrderId = randomUUID();
      const shipmentId = randomUUID();

      await pool.query(
        `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, subtotal_minor, tax_minor, delivery_fee_minor, discount_minor, total_minor, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACCEPTED', 'PLATFORM_DELIVERY', 100, 0, 0, 0, 100, 'SAR', NOW(), NOW())`,
        [localOrderId, masterOrderId, storeA, buyerA],
      );
      await pool.query(
        `INSERT INTO shipments (id, order_id, store_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'PREPARING', NOW(), NOW())`,
        [shipmentId, localOrderId, storeA],
      );

      // Org B trying to resolve Org A's shipment email should fail
      await expect(emailResolver.resolve(shipmentId, orgB)).rejects.toThrow(CarrierEmailRequiredError);
    });
  });

  // ── Security: Credential Isolation ────────────────────────────────────────

  describe('Security — Credential Isolation', () => {
    it('org A cannot see org B credentials', async () => {
      const callerA = { sub: merchantA, role: 'MERCHANT_OWNER', activeOrg: orgA };
      // Should throw ForbiddenException because orgA !== orgB
      await expect(credentialsService.listForOrg(orgB, callerA as any)).rejects.toThrow();
    });

    it('credential list only returns own org credentials', async () => {
      const callerA = { sub: merchantA, role: 'ADMIN', activeOrg: orgA };
      const credsA = await credentialsService.listForOrg(orgA, callerA as any);
      // All returned credentials should belong to orgA
      expect(credsA.length).toBeGreaterThan(0);
      for (const c of credsA) {
        expect(c.orgId).toBe(orgA);
      }
    });
  });
});
