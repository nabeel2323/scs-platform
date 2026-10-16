/**
 * P13 Phase 4 §8 — HTTP authorization and tenant isolation (PostgreSQL)
 *
 * Everything before Phase 4 proved P13 authorization at the *service* boundary
 * (p311-tenant-isolation calls the services directly). That leaves the actual
 * attack surface unproven: the guards, the decorator metadata, the controller
 * edge that derives an organization scope from the token, and the RFC 7807 error
 * shape a client sees. This spec boots the real Nest HTTP application — real
 * `JwtAuthGuard`, real `PermissionsGuard`, real `ReturnsController` and
 * `OperationsController` against a disposable PostgreSQL built from the full
 * migration chain and the production RBAC seed — and drives it over the network.
 *
 * Permission lists are read from the seeded `role_permissions` tables instead of
 * being copied into this file, so a grant change in `seed-pg.ts` is reflected
 * here automatically (and a *missing* grant breaks the positive controls loudly).
 *
 * Nothing here mocks a collaborator on the path under test.
 *
 * Two harness facts, both consequences of booting a real HTTP application under
 * vitest instead of `nest build`:
 *   - vitest transpiles with esbuild, which does not implement
 *     `emitDecoratorMetadata`, so the `design:paramtypes` Nest reads to resolve
 *     constructors are declared explicitly in `beforeAll`. That reproduces the
 *     metadata the SWC builder emits for the real app; it changes no wiring.
 *   - the app is bound with `listen(0)` on 127.0.0.1 and every route is addressed
 *     as `/v1/...`, which is the same surface `main.ts` produces through URI
 *     versioning (`defaultVersion: '1'`).
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { PaymentsService } from '../../modules/payments/payments.service';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { denylistKey } from '../../common/auth/token-denylist';
import { AuditService } from '../../modules/audit/audit.service';
import { BusinessCalendarService } from '../../modules/returns/business-calendar.service';
import { ReturnsService } from '../../modules/returns/returns.service';
import { ReturnsController } from '../../modules/returns/returns.controller';
import { SettlementAdjustmentService } from '../../modules/returns/settlement-adjustment.service';
import { ReconciliationService } from '../../modules/returns/reconciliation.service';
import { CommissionReversalService } from '../../modules/returns/commission-reversal.service';
import { OperationsController } from '../../modules/operations/operations.controller';
import { WorkerLeaseService } from '../../modules/operations/worker-lease.service';
import { OpsAlertService } from '../../modules/operations/ops-alert.service';
import { OpsControlService } from '../../modules/operations/ops-control.service';
import { P13MonitorService } from '../../modules/operations/p13-monitor.service';
import { PilotControlService } from '../../modules/operations/pilot-control.service';
import { P13_PILOT_FLAG_KEY } from '../../modules/operations/p13-ops.config';
import { getOpsCounter, resetOpsCounters } from '../../modules/operations/ops-counters';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as schema from '../../drizzle/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

/** Every protected operations route and the permission key it must require. */
const OPS_ROUTES: ReadonlyArray<{
  method: 'GET' | 'POST';
  path: string;
  perm: string;
  body?: Record<string, unknown>;
}> = [
  { method: 'GET', path: '/v1/admin/ops/p13/status', perm: 'admin:returns:read' },
  { method: 'GET', path: '/v1/admin/ops/p13/alerts', perm: 'admin:returns:read' },
  { method: 'GET', path: '/v1/admin/ops/p13/controls/history', perm: 'admin:returns:read' },
  { method: 'GET', path: '/v1/admin/ops/p13/pilot', perm: 'admin:returns:read' },
  { method: 'POST', path: '/v1/admin/ops/p13/scan', perm: 'admin:returns:read' },
  {
    method: 'POST', path: '/v1/admin/ops/p13/worker/pause',
    perm: 'admin:returns:write', body: { reason: 'phase 4 http spec' },
  },
  {
    method: 'POST', path: '/v1/admin/ops/p13/worker/resume',
    perm: 'admin:returns:write', body: { reason: 'phase 4 http spec' },
  },
  {
    method: 'POST', path: '/v1/admin/ops/p13/pilot/flag',
    perm: 'admin:returns:write', body: { enabled: false, description: 'phase 4 http spec' },
  },
  {
    method: 'POST', path: '/v1/admin/ops/p13/pilot/allowlist',
    perm: 'admin:returns:write', body: { orgId: 'PLACEHOLDER_ORG_A', note: 'http spec' },
  },
  {
    method: 'POST', path: '/v1/admin/ops/p13/pilot/allowlist/revoke',
    perm: 'admin:returns:write', body: { orgId: 'PLACEHOLDER_ORG_A', note: 'http spec' },
  },
];

/**
 * A fetch result. Deliberately NOT named `Response` — that would shadow the
 * global DOM `Response` type this spec also touches through `fetch`.
 */
interface HttpResult {
  status: number;
  /** Parsed JSON body; `{ raw: text }` when the payload is not JSON. */
  body: Record<string, unknown>;
  type: string | null;
}

describe('P13 Phase 4 §8 — HTTP authorization and tenant isolation (PostgreSQL)', () => {
  let container: { stop(): Promise<unknown> };
  let pool: Pool;
  let database: DatabaseService;
  let app: INestApplication;
  let jwt: JwtService;
  let baseUrl: string;
  /** jti whose denylist entry is present — models a token revoked after switchOrg. */
  let revokedJti: string;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const buyerA = randomUUID();
  const buyerB = randomUUID();
  const merchantOwnerA = randomUUID();
  const merchantOwnerB = randomUUID();
  const adminUser = randomUUID();
  const finUserA = randomUUID();
  const finUserB = randomUUID();
  let storeA: string;
  let storeB: string;
  let orderA: string;
  let orderB: string;
  let payA: string;
  let payB: string;
  let retA: string;
  let retB: string;
  let adjA: string;
  let adjB: string;
  let runA: string;
  let runB: string;

  // ── Harness ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Configuration must be fixed before any service resolves its ops config.
    process.env['JWT_ACCESS_SECRET'] = 'p4-http-spec-access-secret-32chars-long!!';
    process.env['P13_PILOT_MODE'] = 'legacy';
    process.env['P13_MONITOR_INTERVAL_MS'] = '3600000'; // no background scans mid-test
    delete process.env['P13_OPS_ALERT_WEBHOOK_URL'];
    delete process.env['P13_WORKER_ENABLED'];
    revokedJti = `revoked-${randomUUID()}`;

    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const started = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    container = started;
    pool = new Pool({ connectionString: started.getConnectionUri() });

    const db = drizzle(pool, { schema }) as unknown as DatabaseService['db'];
    database = { db } as unknown as DatabaseService;

    await pool.query(
      `CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`,
    );
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
      .sort();
    for (const file of files) {
      const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(text);
        await pool.query(`INSERT INTO _migration_log (name) VALUES ($1)`, [file]);
        await pool.query('COMMIT');
      } catch {
        await pool.query('ROLLBACK');
      }
    }

    const client = await pool.connect();
    try { await seedPlatformRbac(client); } finally { client.release(); }

    await seedBusinessFixture();

    // ── The real HTTP application ──
    const outbox = {
      publish: async () => undefined,
      dispatch: async () => undefined,
    } as unknown as OutboxDispatcher;
    // The outbox stub is the only substitution: nothing in §8 asserts on it, and
    // the real dispatcher would start a 1s polling timer against this database.
    const redis = {
      client: {
        get: async (key: string) => (key === denylistKey(revokedJti) ? '1' : null),
      },
    } as unknown as RedisService;

    // ── Constructor metadata for this transform pipeline ──
    // `nest build` runs on the SWC builder, which emits `design:paramtypes`, so the
    // real application resolves every class below by type. Vitest transpiles with
    // esbuild, and esbuild does not implement `emitDecoratorMetadata` — in this
    // process that metadata is simply absent, and Nest would then instantiate each
    // class with zero arguments (guards, controllers and services alike). Declaring
    // the identical paramtypes here is therefore test-pipeline wiring, not a
    // substitution: no collaborator is faked, these are the production classes.
    const paramTypes: ReadonlyArray<readonly [unknown, readonly unknown[]]> = [
      [AuditService, [DatabaseService]],
      [BusinessCalendarService, [DatabaseService]],
      [SettlementAdjustmentService, [DatabaseService, OutboxDispatcher]],
      [ReconciliationService, [DatabaseService]],
      [CommissionReversalService, [DatabaseService, OutboxDispatcher]],
      [PilotControlService, [DatabaseService, AuditService, OpsAlertService]],
      [ReturnsService, [
        DatabaseService, OutboxDispatcher, PaymentsService, BusinessCalendarService,
        CommissionReversalService, SettlementAdjustmentService, PilotControlService,
      ]],
      [WorkerLeaseService, [DatabaseService]],
      [OpsAlertService, [DatabaseService]],
      [OpsControlService, [DatabaseService, AuditService, OpsAlertService]],
      [P13MonitorService, [DatabaseService, OpsAlertService, WorkerLeaseService]],
      [ReturnsController, [
        ReturnsService, BusinessCalendarService, SettlementAdjustmentService,
        ReconciliationService, CommissionReversalService,
      ]],
      [OperationsController, [
        WorkerLeaseService, OpsControlService, OpsAlertService, P13MonitorService,
        PilotControlService,
      ]],
      [JwtAuthGuard, [JwtService, RedisService]],
      [PermissionsGuard, [Reflector]],
    ];
    for (const [cls, types] of paramTypes) {
      Reflect.defineMetadata('design:paramtypes', [...types], cls as object);
    }

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: process.env['JWT_ACCESS_SECRET'] })],
      controllers: [ReturnsController, OperationsController],
      providers: [
        { provide: DatabaseService, useValue: database },
        { provide: RedisService, useValue: redis },
        { provide: OutboxDispatcher, useValue: outbox },
        { provide: PaymentsService, useValue: {} },
        AuditService,
        BusinessCalendarService,
        SettlementAdjustmentService,
        ReconciliationService,
        CommissionReversalService,
        ReturnsService,
        WorkerLeaseService,
        OpsAlertService,
        OpsControlService,
        P13MonitorService,
        PilotControlService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    // listen(0), not init(): init() builds the graph but never binds a socket,
    // so `address()` would be null and there would be nothing to fetch against.
    await app.listen(0, '127.0.0.1');

    const server = app.getHttpServer() as { address(): AddressInfo };
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    jwt = app.get(JwtService);
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  /** Deterministic financial fixture + no leftover configuration per test. */
  beforeEach(async () => {
    await pool.query(`DELETE FROM settlement_adjustment_approvals`);
    await pool.query(`DELETE FROM settlement_adjustments`);
    await pool.query(`DELETE FROM reconciliation_discrepancies`);
    await pool.query(`DELETE FROM reconciliation_runs`);
    await pool.query(`DELETE FROM commission_reversals`);
    await pool.query(`DELETE FROM return_request_events`);
    await pool.query(`DELETE FROM refunds`);
    await pool.query(`DELETE FROM outbox_events`);
    await pool.query(`DELETE FROM ops_alerts`);
    await pool.query(`DELETE FROM ops_control_audit`);
    await pool.query(`DELETE FROM ops_controls`);
    await pool.query(`DELETE FROM p13_pilot_allowlist`);
    await pool.query(`DELETE FROM feature_flags WHERE key = $1`, [P13_PILOT_FLAG_KEY]);
    await pool.query(
      `UPDATE return_requests SET status='REQUESTED', escalated_at=NULL, escalation_deadline=NULL`,
    );
    await seedFinancialFixture();
    resetOpsCounters();
  });

  async function seedBusinessFixture(): Promise<void> {
    await pool.query(
      `INSERT INTO organizations (id, type, name, country) VALUES ($1,'WHOLESALER','P4 HTTP Org A','SY'),($2,'WHOLESALER','P4 HTTP Org B','SY')`,
      [orgA, orgB],
    );
    await pool.query(
      `INSERT INTO users (id, full_name, phone) VALUES
        ($1,'Buyer A','+966501100001'),($2,'Buyer B','+966501100002'),
        ($3,'Merchant Owner A','+966501100003'),($4,'Merchant Owner B','+966501100004'),
        ($5,'Platform Admin','+966501100005'),($6,'Finance A','+966501100006'),($7,'Finance B','+966501100007')`,
      [buyerA, buyerB, merchantOwnerA, merchantOwnerB, adminUser, finUserA, finUserB],
    );
    storeA = randomUUID(); storeB = randomUUID();
    await pool.query(
      `INSERT INTO stores (id, org_id, slug, display_name, currency, status, verification_status)
       VALUES ($1,$2,'p4-http-store-a','P4 HTTP Store A','SYP','ACTIVE','VERIFIED'),
              ($3,$4,'p4-http-store-b','P4 HTTP Store B','SYP','ACTIVE','VERIFIED')`,
      [storeA, orgA, storeB, orgB],
    );
    // Store-level membership (migration 0054): owners are ACTIVE members of their own store only.
    await pool.query(
      `INSERT INTO store_members (id, store_id, user_id, role, status) VALUES ($1,$2,$3,'OWNER','ACTIVE'),($4,$5,$6,'OWNER','ACTIVE')`,
      [randomUUID(), storeA, merchantOwnerA, randomUUID(), storeB, merchantOwnerB],
    );

    const masterA = randomUUID(); const masterB = randomUUID();
    await pool.query(`INSERT INTO master_orders (id, buyer_id, status) VALUES ($1,$2,'SUBMITTED'),($3,$4,'SUBMITTED')`, [masterA, buyerA, masterB, buyerB]);
    orderA = randomUUID(); orderB = randomUUID();
    await pool.query(
      `INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor)
       VALUES ($1,$2,$3,$4,'DELIVERED',5000,0,500,0,5500),($5,$6,$7,$8,'DELIVERED',7000,0,500,0,7500)`,
      [orderA, masterA, storeA, buyerA, orderB, masterB, storeB, buyerB],
    );
    payA = randomUUID(); payB = randomUUID();
    await pool.query(
      `INSERT INTO payment_records (id, order_id, payment_method, status, amount_minor, currency)
       VALUES ($1,$2,'CASH_ON_DELIVERY','CONFIRMED',5500,'SYP'),($3,$4,'CASH_ON_DELIVERY','CONFIRMED',7500,'SYP')`,
      [payA, orderA, payB, orderB],
    );
    retA = randomUUID(); retB = randomUUID();
    await pool.query(
      `INSERT INTO return_requests (id, sub_order_id, payment_record_id, buyer_id, status, reason, requested_refund_minor, expires_at)
       VALUES ($1,$2,$3,$4,'REQUESTED','PRODUCT_NOT_AS_DESCRIBED',5000, now() + interval '3 days'),
              ($5,$6,$7,$8,'REQUESTED','PRODUCT_NOT_AS_DESCRIBED',7000, now() + interval '3 days')`,
      [retA, orderA, payA, buyerA, retB, orderB, payB, buyerB],
    );
  }

  /** One adjustment, one reversal and one reconciliation run per organization. */
  async function seedFinancialFixture(): Promise<void> {
    adjA = randomUUID(); adjB = randomUUID();
    await pool.query(
      `INSERT INTO settlement_adjustments (id, sub_order_id, return_request_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id)
       VALUES ($1,$2,$3,'SETTLEMENT_CORRECTION',500,'SYP','BLOCKED','PENDING_APPROVAL','Org A correction',true,$4,$5),
              ($6,$7,$8,'SETTLEMENT_CORRECTION',600,'SYP','BLOCKED','PENDING_APPROVAL','Org B correction',true,$9,$10)`,
      [adjA, orderA, retA, finUserA, orgA, adjB, orderB, retB, finUserB, orgB],
    );
    await pool.query(
      `INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id)
       VALUES ($1,$2,200,200,'MERCHANT',$3,'POSTED','SYP',$4),($5,$6,300,300,'PLATFORM',$7,'POSTED','SYP',$8)`,
      [randomUUID(), retA, `p4-http-${randomUUID()}`, orgA, randomUUID(), retB, `p4-http-${randomUUID()}`, orgB],
    );
    runA = randomUUID(); runB = randomUUID();
    await pool.query(
      `INSERT INTO reconciliation_runs (id, period_start, period_end, currency, status, summary, discrepancy_count, executed_by, org_id, version)
       VALUES ($1,'2026-01-01','2026-01-31','SYP','COMPLETED','{}'::jsonb,0,$2,$3,1),
              ($4,'2026-02-01','2026-02-28','SYP','COMPLETED','{}'::jsonb,0,$5,$6,1)`,
      [runA, adminUser, orgA, runB, adminUser, orgB],
    );
  }

  // ── HTTP + token helpers ──────────────────────────────────────────────────

  async function req(
    method: 'GET' | 'POST',
    route: string,
    opts: { token?: string; body?: unknown } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {};
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? (JSON.parse(text) as Record<string, unknown>) : {}; }
    catch { body = { raw: text }; }
    return { status: res.status, body, type: res.headers.get('content-type') };
  }

  /** Real grants for a role, read from the seeded RBAC tables. */
  async function permsOf(roleKey: string): Promise<string[]> {
    const { rows } = await pool.query(
      `SELECT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
       WHERE r.key = $1 ORDER BY p.key`,
      [roleKey],
    );
    return rows.map((row: { key: string }) => row.key);
  }

  function userOf(roleKey: string): string {
    switch (roleKey) {
      case 'BUYER': return buyerA;
      case 'MERCHANT_OWNER': return merchantOwnerA;
      case 'FINANCE': return finUserA;
      default: return adminUser;
    }
  }

  async function mint(
    roleKey: string,
    activeOrg: string | null,
    opts: { sub?: string; perms?: string[]; jti?: string; expiresIn?: string | number } = {},
  ): Promise<string> {
    const perms = opts.perms ?? (await permsOf(roleKey));
    return jwt.sign(
      {
        sub: opts.sub ?? userOf(roleKey),
        role: roleKey,
        activeOrg,
        perms,
        sid: 'p4-http-spec',
        jti: opts.jti ?? `p4-${randomUUID()}`,
      },
      { expiresIn: opts.expiresIn ?? '1h' },
    );
  }

  function detailOf(res: HttpResult): string {
    return typeof res.body['detail'] === 'string' ? res.body['detail'] as string : '';
  }

  function codeOf(res: HttpResult): string | undefined {
    return typeof res.body['code'] === 'string' ? res.body['code'] as string : undefined;
  }

  /** Body of an endpoint that wraps its rows (`{ alerts: [...] }`, `{ changes: [...] }`). */
  function rowsOf(res: HttpResult, key: string): Array<Record<string, unknown>> {
    return Array.isArray(res.body[key]) ? res.body[key] as Array<Record<string, unknown>> : [];
  }

  /** Body of an endpoint that returns a bare JSON array (every P13 list route). */
  function listBody(res: HttpResult): Array<Record<string, unknown>> {
    return Array.isArray(res.body)
      ? res.body as unknown as Array<Record<string, unknown>>
      : [];
  }

  function idsOf(rows: Array<Record<string, unknown>>): string[] {
    return rows.map((row) => String(row['id']));
  }

  function expectGranted(status: number): void {
    expect([200, 201]).toContain(status);
  }

  /**
   * A return-creation body that is *invalid on purpose*: it satisfies every
   * check up to line validation, so the response distinguishes "the pilot gate
   * denied this org" (403) from "the gate let this org through" (400).
   */
  function gateProbeBody(subOrderId: string): Record<string, unknown> {
    return { subOrderId, reason: 'PRODUCT_NOT_AS_DESCRIBED', lines: [] };
  }

  /** POST that must be granted, returning its body — keeps multi-step drills readable. */
  async function grantedPost(
    token: string, route: string, body?: unknown,
  ): Promise<Record<string, unknown>> {
    const res = await req('POST', route, { token, body });
    expectGranted(res.status);
    return res.body;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // §8.1 — Authentication at the edge
  // ═════════════════════════════════════════════════════════════════════════

  describe('§8.1 Authentication', () => {
    it('HA-01: an unauthenticated request is 401 and never reaches the handler', async () => {
      const res = await req('GET', '/v1/admin/ops/p13/status');
      expect(res.status).toBe(401);
      expect(res.body['status']).toBe(401);
      expect(detailOf(res)).toMatch(/missing or invalid authorization/i);
    });

    it('HA-02: a token with a tampered signature is 401', async () => {
      const token = await mint('ADMIN', orgA);
      const [head, payload, sig] = token.split('.');
      const flipped = `${sig![0] === 'A' ? 'B' : 'A'}${sig!.slice(1)}`;
      const res = await req('GET', '/v1/admin/ops/p13/status', {
        token: `${head}.${payload}.${flipped}`,
      });
      expect(res.status).toBe(401);
      expect(detailOf(res)).toMatch(/invalid or expired access token/i);
    });

    it('HA-03: an expired token is 401', async () => {
      const token = await mint('ADMIN', orgA, { expiresIn: -10 });
      const res = await req('GET', '/v1/admin/ops/p13/status', { token });
      expect(res.status).toBe(401);
    });

    it('HA-04: a revoked jti on the denylist is 401 even while cryptographically valid', async () => {
      const token = await mint('ADMIN', orgA, { jti: revokedJti });
      const res = await req('GET', '/v1/admin/ops/p13/status', { token });
      expect(res.status).toBe(401);
      expect(detailOf(res)).toMatch(/revoked/i);
    });

    it('HA-05: error bodies are RFC 7807 application/problem+json', async () => {
      const res = await req('GET', '/v1/admin/ops/p13/status');
      expect(res.type).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        type: expect.any(String),
        title: expect.any(String),
        status: 401,
        detail: expect.any(String),
        instance: '/v1/admin/ops/p13/status',
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §8.2 — Permission enforcement on the new admin endpoints
  // ═════════════════════════════════════════════════════════════════════════

  describe('§8.2 Permission enforcement on the Phase 4 operations endpoints', () => {
    it('HA-06: every operations route requires its permission key', async () => {
      const buyer = await mint('BUYER', null);
      for (const route of OPS_ROUTES) {
        const res = await req(route.method, route.path, { token: buyer, body: route.body });
        expect(res.status, `${route.method} ${route.path}`).toBe(403);
        expect(detailOf(res), route.path).toContain(route.perm);
      }
    });

    it('HA-07: the required keys are exactly the two audited returns keys', () => {
      const keys = new Set(OPS_ROUTES.map((r) => r.perm));
      expect([...keys].sort()).toEqual(['admin:returns:read', 'admin:returns:write']);
      // No new RBAC key was minted for Phase 4, so the Phase 3 baseline stays intact.
      expect(keys.has('admin:ops:write')).toBe(false);
    });

    it('HA-08: an authorized ADMIN can reach every operations route', async () => {
      const admin = await mint('ADMIN', orgA);
      for (const route of OPS_ROUTES) {
        const body = route.body
          ? JSON.parse(JSON.stringify(route.body).replace('PLACEHOLDER_ORG_A', orgA))
          : undefined;
        const res = await req(route.method, route.path, { token: admin, body });
        expect(res.status, `${route.method} ${route.path}`).toBeGreaterThanOrEqual(200);
        expect(res.status, `${route.method} ${route.path}`).toBeLessThan(300);
      }
    });

    it('HA-09: FINANCE holds financial approval rights but no worker/pilot control', async () => {
      const financePerms = await permsOf('FINANCE');
      expect(financePerms).toContain('admin:adjustments:approve');
      expect(financePerms).toContain('admin:refunds:approve');
      expect(financePerms).not.toContain('admin:returns:read');
      expect(financePerms).not.toContain('admin:returns:write');

      const finance = await mint('FINANCE', orgA);
      expect((await req('GET', '/v1/admin/ops/p13/status', { token: finance })).status).toBe(403);
      const pause = await req('POST', '/v1/admin/ops/p13/worker/pause', {
        token: finance, body: { reason: 'finance should not be able to pause' },
      });
      expect(pause.status).toBe(403);
      // Denial must not have changed anything either.
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ops_controls`);
      expect(rows[0]!.c).toBe(0);
    });

    it('HA-10: the role claim grants nothing on its own — permissions are the decision', async () => {
      // A token that claims role ADMIN but carries no grants. Guards read `perms`,
      // so a forged/mis-granted role string must not open a single admin route.
      const emptyAdmin = await mint('ADMIN', orgA, { perms: [] });
      const status = await req('GET', '/v1/admin/ops/p13/status', { token: emptyAdmin });
      expect(status.status).toBe(403);
      const adjustments = await req('GET', '/v1/admin/settlement-adjustments', { token: emptyAdmin });
      expect(adjustments.status).toBe(403);
    });

    it('HA-11: input validation happens after authorization, and denial leaves no state', async () => {
      const admin = await mint('ADMIN', orgA);
      const noReason = await req('POST', '/v1/admin/ops/p13/worker/pause', {
        token: admin, body: { reason: '   ' },
      });
      expect(noReason.status).toBe(400);
      expect(detailOf(noReason)).toMatch(/reason is required/i);

      const badOrg = await req('POST', '/v1/admin/ops/p13/pilot/allowlist', {
        token: admin, body: { orgId: 'not-a-uuid' },
      });
      expect(badOrg.status).toBe(400);

      const badFlag = await req('POST', '/v1/admin/ops/p13/pilot/flag', {
        token: admin, body: { enabled: 'yes' },
      });
      expect(badFlag.status).toBe(400);

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ops_controls`,
      );
      expect(rows[0]!.c).toBe(0);
      const flag = await pool.query(`SELECT COUNT(*)::int AS c FROM feature_flags WHERE key = $1`, [P13_PILOT_FLAG_KEY]);
      expect(flag.rows[0]!.c).toBe(0);
    });

    it('HA-12: pausing over HTTP is audited and cannot approve or refund anything', async () => {
      const admin = await mint('ADMIN', orgA);
      const paused = await req('POST', '/v1/admin/ops/p13/worker/pause', {
        token: admin, body: { reason: 'pilot drill' },
      });
      expectGranted(paused.status);
      expect(paused.body['paused']).toBe(true);

      const { rows } = await pool.query(
        `SELECT action, actor_id FROM audit_logs WHERE resource = 'ops_control' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(rows[0]?.['action']).toMatch(/pause/);
      expect(rows[0]?.['actor_id']).toBe(adminUser);

      // The control changed; no financial row moved.
      const stillPending = await pool.query(
        `SELECT COUNT(*)::int AS c FROM return_requests WHERE status = 'REQUESTED'`,
      );
      expect(stillPending.rows[0]!.c).toBe(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §8.3 — Financial-record tenant isolation over HTTP
  // ═════════════════════════════════════════════════════════════════════════

  describe('§8.3 Financial-record tenant isolation over HTTP', () => {
    it('HA-13: a FINANCE reader sees only its own organization\u0027s adjustments', async () => {
      const finance = await mint('FINANCE', orgA);
      const res = await req('GET', '/v1/admin/settlement-adjustments', { token: finance });
      expectGranted(res.status);
      expect(idsOf(listBody(res))).toEqual([adjA]);
      expect(idsOf(listBody(res))).not.toContain(adjB);
    });

    it('HA-14: reading another org\u0027s adjustment by its real UUID is 404 and leaks nothing', async () => {
      const finance = await mint('FINANCE', orgA);
      const res = await req('GET', `/v1/admin/settlement-adjustments/${adjB}`, { token: finance });
      expect(res.status).toBe(404);
      expect(detailOf(res)).toMatch(/not found/i);
      // The row exists, so the only honest answer is the same one an absent id gets —
      // and it must not carry the foreign reason text or amount.
      expect(JSON.stringify(res.body)).not.toContain('Org B correction');
    });

    it('HA-15: approving another org\u0027s adjustment is denied before any row is touched', async () => {
      const finance = await mint('FINANCE', orgA);
      const res = await req('POST', `/v1/admin/settlement-adjustments/${adjB}/approve`, {
        token: finance, body: { notes: 'cross-tenant attempt' },
      });
      expect(res.status).toBe(404);

      const { rows } = await pool.query(
        `SELECT status FROM settlement_adjustments WHERE id = $1`, [adjB],
      );
      expect(rows[0]!.status).toBe('PENDING_APPROVAL');
      const approvals = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_adjustment_approvals`,
      );
      expect(approvals.rows[0]!.c).toBe(0);
    });

    it('HA-16: posting another org\u0027s adjustment is denied and posts nothing', async () => {
      const financeB = await mint('FINANCE', orgB, { sub: finUserB });
      const res = await req('POST', `/v1/admin/settlement-adjustments/${adjA}/post`, {
        token: financeB,
      });
      expect(res.status).toBe(404);

      const { rows } = await pool.query(
        `SELECT status FROM settlement_adjustments WHERE id = $1`, [adjA],
      );
      expect(rows[0]!.status).toBe('PENDING_APPROVAL');
      const posted = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_adjustments WHERE status = 'POSTED'`,
      );
      expect(posted.rows[0]!.c).toBe(0);
    });

    it('HA-17: a token with no active organization is denied every financial route and counted', async () => {
      // The Phase 3 services scope "when an orgId is supplied", which is a
      // fail-open at an HTTP edge: an unscoped token would widen the query to
      // every organization. `financialOrgScope` closes it and counts it, because
      // this is exactly alert 8 (unauthorized financial operation) input.
      const unscoped = await mint('FINANCE', null);
      const denied = [
        ['GET', '/v1/admin/settlement-adjustments'] as const,
        ['GET', '/v1/admin/commission-reversals'] as const,
        ['GET', '/v1/admin/reconciliation'] as const,
      ];
      for (const [method, route] of denied) {
        const res = await req(method, route, { token: unscoped });
        expect(res.status, route).toBe(403);
        expect(detailOf(res), route).toMatch(/active organization is required/i);
      }
      expect(getOpsCounter('financial_isolation_denials_total')).toBe(3);

      const mutate = await req(
        'POST', `/v1/admin/settlement-adjustments/${adjA}/approve`,
        { token: unscoped, body: { notes: 'unscoped attempt' } },
      );
      expect(mutate.status).toBe(403);
      expect(getOpsCounter('financial_isolation_denials_total')).toBe(4);

      const approvals = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_adjustment_approvals`,
      );
      expect(approvals.rows[0]!.c).toBe(0);
    });

    it('HA-18: platform staff keep the deliberate cross-org query, and lose it when scoped', async () => {
      // TISO-07 pins ADMIN/SUPER_ADMIN cross-org visibility as intentional.
      // The asymmetry is load-bearing: it is why the fail-closed edge check in
      // HA-17 exempts BYPASS_ROLES instead of denying them too.
      const unscopedAdmin = await mint('ADMIN', null);
      const everything = await req('GET', '/v1/admin/settlement-adjustments', {
        token: unscopedAdmin,
      });
      expectGranted(everything.status);
      expect(idsOf(listBody(everything)).sort()).toEqual([adjA, adjB].sort());

      const scopedAdmin = await mint('ADMIN', orgA);
      const scoped = await req('GET', '/v1/admin/settlement-adjustments', { token: scopedAdmin });
      expect(idsOf(listBody(scoped))).toEqual([adjA]);
    });

    it('HA-19: reconciliation runs are isolated per organization', async () => {
      const foreign = await req('GET', `/v1/admin/reconciliation/${runA}`, {
        token: await mint('FINANCE', orgB, { sub: finUserB }),
      });
      expect(foreign.status).toBe(404);

      const own = await req('GET', `/v1/admin/reconciliation/${runA}`, {
        token: await mint('FINANCE', orgA),
      });
      expectGranted(own.status);
      expect(own.body['id']).toBe(runA);
      expect(Array.isArray(own.body['discrepancies'])).toBe(true);

      const list = await req('GET', '/v1/admin/reconciliation', {
        token: await mint('FINANCE', orgA),
      });
      expect(idsOf(listBody(list))).toEqual([runA]);
    });

    it('HA-20: a guessed id is a client error, never a 500 and never a leak', async () => {
      const finance = await mint('FINANCE', orgA);
      const absent = await req('GET', `/v1/admin/settlement-adjustments/${randomUUID()}`, {
        token: finance,
      });
      expect(absent.status).toBe(404);

      // Malformed UUID reaches the driver as a uuid comparison: SQLSTATE 22P02
      // must surface as 400, not as an opaque internal server error.
      const malformed = await req('GET', '/v1/admin/settlement-adjustments/not-a-uuid', {
        token: finance,
      });
      expect(malformed.status).toBe(400);
      expect(codeOf(malformed)).toBe('22P02');

      const malformedPost = await req(
        'POST', '/v1/admin/settlement-adjustments/not-a-uuid/approve',
        { token: finance, body: { notes: 'guess' } },
      );
      expect(malformedPost.status).toBe(400);
    });

    it('HA-21: merchant and buyer roles cannot approve or post adjustments at all', async () => {
      const merchant = await mint('MERCHANT_OWNER', orgA, { sub: merchantOwnerA });
      const buyer = await mint('BUYER', orgA, { sub: buyerA });
      for (const [label, token] of [['MERCHANT_OWNER', merchant], ['BUYER', buyer]] as const) {
        for (const suffix of ['approve', 'post'] as const) {
          const res = await req(
            'POST', `/v1/admin/settlement-adjustments/${adjA}/${suffix}`,
            { token, body: { notes: `${label} attempt` } },
          );
          expect(res.status, `${label} ${suffix}`).toBe(403);
          expect(detailOf(res), `${label} ${suffix}`).toContain('admin:adjustments:approve');
        }
      }
      const { rows } = await pool.query(
        `SELECT status FROM settlement_adjustments WHERE id = $1`, [adjA],
      );
      expect(rows[0]!.status).toBe('PENDING_APPROVAL');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §8.4 — Return-object isolation over HTTP
  // ═════════════════════════════════════════════════════════════════════════

  describe('§8.4 Return-object isolation over HTTP', () => {
    it('HA-22: a buyer reads their own return, another buyer gets 403 without leaking it', async () => {
      const own = await req('GET', `/v1/returns/${retA}`, {
        token: await mint('BUYER', orgA, { sub: buyerA }),
      });
      expectGranted(own.status);
      expect(own.body['id']).toBe(retA);

      const foreign = await req('GET', `/v1/returns/${retA}`, {
        token: await mint('BUYER', orgB, { sub: buyerB }),
      });
      expect(foreign.status).toBe(403);
      const leaked = JSON.stringify(foreign.body);
      expect(leaked).not.toContain('PRODUCT_NOT_AS_DESCRIBED');
      expect(leaked).not.toContain('5000');
    });

    it('HA-23: merchant detail access requires membership of the fulfilling store', async () => {
      const ownerA = await req('GET', `/v1/returns/${retA}`, {
        token: await mint('MERCHANT_OWNER', orgA, { sub: merchantOwnerA }),
      });
      expectGranted(ownerA.status);
      expect(ownerA.body['id']).toBe(retA);

      const ownerB = await req('GET', `/v1/returns/${retA}`, {
        token: await mint('MERCHANT_OWNER', orgB, { sub: merchantOwnerB }),
      });
      expect(ownerB.status).toBe(403);
    });

    it('HA-24: the merchant list is store-scoped, and a revoked membership stops working', async () => {
      const ownerAToken = await mint('MERCHANT_OWNER', orgA, { sub: merchantOwnerA });
      const mine = await req('GET', `/v1/merchant/returns?storeId=${storeA}`, { token: ownerAToken });
      expectGranted(mine.status);
      expect(idsOf(listBody(mine))).toEqual([retA]);

      const foreign = await req('GET', `/v1/merchant/returns?storeId=${storeA}`, {
        token: await mint('MERCHANT_OWNER', orgB, { sub: merchantOwnerB }),
      });
      expect(foreign.status).toBe(403);

      const missing = await req('GET', '/v1/merchant/returns', { token: ownerAToken });
      expect(missing.status).toBe(400);
      expect(detailOf(missing)).toMatch(/storeId query parameter is required/i);

      // Store-level membership (migration 0054) is the real gate, not org alone.
      await pool.query(
        `UPDATE store_members SET status = 'INACTIVE' WHERE store_id = $1 AND user_id = $2`,
        [storeA, merchantOwnerA],
      );
      try {
        const revoked = await req(
          'GET', `/v1/merchant/returns?storeId=${storeA}`, { token: ownerAToken },
        );
        expect(revoked.status).toBe(403);
        expect(detailOf(revoked)).toMatch(/not authorized for this store/i);
      } finally {
        await pool.query(
          `UPDATE store_members SET status = 'ACTIVE' WHERE store_id = $1 AND user_id = $2`,
          [storeA, merchantOwnerA],
        );
      }
    });

    it('HA-25: /returns/my never lists another buyer\u0027s return', async () => {
      const a = await req('GET', '/v1/returns/my', {
        token: await mint('BUYER', orgA, { sub: buyerA }),
      });
      expectGranted(a.status);
      expect(idsOf(listBody(a))).toEqual([retA]);

      const b = await req('GET', '/v1/returns/my', {
        token: await mint('BUYER', orgB, { sub: buyerB }),
      });
      expect(idsOf(listBody(b))).toEqual([retB]);

      const malformed = await req('GET', '/v1/returns/not-a-uuid', {
        token: await mint('BUYER', orgA, { sub: buyerA }),
      });
      expect(malformed.status).toBe(400);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // §8.5 — Adjustment creation and the FX block over HTTP
  // ════════════════════════════════════════════════════════════════════

  describe('§8.5 Adjustment creation and FX block over HTTP', () => {
    // A function, not a constant: `orderA` is only assigned once beforeAll has
    // built the fixture, and a describe-level literal would run at collection time.
    function createBody() {
      return {
        subOrderId: orderA,
        adjustmentType: 'SETTLEMENT_CORRECTION',
        amountMinor: 1500,
        currency: 'SYP',
        reason: 'HTTP pilot correction',
      };
    }

    it('HA-26: an admin can actually create an adjustment (fx_status CHECK regression guard)', async () => {
      // Before the Phase 4 fix this route could never persist a row: the service
      // wrote fx_status='BLOCKED_FX', which migration 0061's CHECK rejects, so
      // every create — including the returns delivery-fee-exception path — died
      // as SQLSTATE 23514. 'BLOCKED_FX' is a *status* value, not an FX value.
      const admin = await mint('ADMIN', orgA);
      const res = await req('POST', '/v1/admin/settlement-adjustments', {
        token: admin, body: createBody(),
      });
      expect(res.status).toBe(201);
      expect(res.body['status']).toBe('DRAFT');
      expect(res.body['fxStatus']).toBe('BLOCKED');
      expect(res.body['requiresDualApproval']).toBe(true);

      const { rows } = await pool.query(
        `SELECT fx_status, status, org_id FROM settlement_adjustments WHERE id = $1`,
        [String(res.body['id'])],
      );
      expect(rows[0]).toMatchObject({ fx_status: 'BLOCKED', status: 'DRAFT', org_id: orgA });

      // FINANCE approves but never creates.
      const finance = await mint('FINANCE', orgA);
      const denied = await req('POST', '/v1/admin/settlement-adjustments', {
        token: finance, body: createBody(),
      });
      expect(denied.status).toBe(403);
      expect(detailOf(denied)).toContain('admin:adjustments:write');
    });

    it('HA-27: the creator cannot approve their own dual-approval adjustment', async () => {
      const admin = await mint('ADMIN', orgA);
      const created = await req('POST', '/v1/admin/settlement-adjustments', {
        token: admin, body: createBody(),
      });
      const id = String(created.body['id']);

      const submitted = await req('POST', `/v1/admin/settlement-adjustments/${id}/submit`, {
        token: admin,
      });
      expectGranted(submitted.status);
      expect(submitted.body['status']).toBe('PENDING_APPROVAL');

      const self = await req('POST', `/v1/admin/settlement-adjustments/${id}/approve`, {
        token: admin, body: { notes: 'I approve my own correction' },
      });
      expect(self.status).toBe(409);
      expect(detailOf(self)).toMatch(/Creator cannot approve their own/i);

      const approvals = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_adjustment_approvals WHERE adjustment_id = $1`,
        [id],
      );
      expect(approvals.rows[0]!.c).toBe(0);
      const { rows } = await pool.query(
        `SELECT status FROM settlement_adjustments WHERE id = $1`, [id],
      );
      expect(rows[0]!.status).toBe('PENDING_APPROVAL');
    });

    it('HA-28: dual approval succeeds, and posting is still refused without an authoritative FX rate', async () => {
      const admin = await mint('ADMIN', orgA);
      const created = await req('POST', '/v1/admin/settlement-adjustments', {
        token: admin, body: createBody(),
      });
      const id = String(created.body['id']);
      const submit = await req('POST', `/v1/admin/settlement-adjustments/${id}/submit`, {
        token: admin,
      });
      expectGranted(submit.status);

      // Two distinct approvers, one of each role, neither of them the creator.
      const financeA = await mint('FINANCE', orgA, { sub: finUserA });
      const first = await req('POST', `/v1/admin/settlement-adjustments/${id}/approve`, {
        token: financeA, body: { notes: 'finance approval' },
      });
      expectGranted(first.status);
      expect(first.body['status']).toBe('PENDING_APPROVAL'); // one of two

      const adminB = await mint('ADMIN', orgA, { sub: finUserB });
      const second = await req('POST', `/v1/admin/settlement-adjustments/${id}/approve`, {
        token: adminB, body: { notes: 'admin approval' },
      });
      expectGranted(second.status);
      expect(second.body['status']).toBe('APPROVED');

      // §7: no authoritative FX source exists, so even a fully approved
      // adjustment must stay blocked. Posting is allow-listed on the FX position.
      const posted = await req('POST', `/v1/admin/settlement-adjustments/${id}/post`, {
        token: financeA,
      });
      expect(posted.status).toBe(409);
      expect(detailOf(posted)).toMatch(/FX status is BLOCKED, not RESOLVED/i);

      const { rows } = await pool.query(
        `SELECT status, fx_status FROM settlement_adjustments WHERE id = $1`, [id],
      );
      expect(rows[0]).toMatchObject({ status: 'APPROVED', fx_status: 'BLOCKED' });
      // Alert 7's invariant (a POSTED row whose FX is not RESOLVED) must hold.
      const violating = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_adjustments
          WHERE status = 'POSTED'
            AND fx_status NOT IN ('RESOLVED', 'NOT_REQUIRED')`,
      );
      expect(violating.rows[0]!.c).toBe(0);
      const settlements = await pool.query(
        `SELECT COUNT(*)::int AS c FROM settlement_records WHERE sub_order_id = $1`, [orderA],
      );
      expect(settlements.rows[0]!.c).toBe(0);
    });

    it('HA-34: DELIVERY_FEE_EXCEPTION is a creatable type end to end (0062 §5 + fx_status fix)', async () => {
      // This is the exact adjustmentType the returns service writes when a buyer
      // asks for a delivery-fee refund on a partial return (Phase 3 §3.4). Before
      // migration 0062 §5 widened the CHECK, that value was rejected by the
      // database, so the financial exception could never reach dual approval —
      // and the returns path swallowed the failure, leaving the fee unhandled.
      const admin = await mint('ADMIN', orgA);
      const res = await req('POST', '/v1/admin/settlement-adjustments', {
        token: admin,
        body: {
          subOrderId: orderA,
          adjustmentType: 'DELIVERY_FEE_EXCEPTION',
          amountMinor: 500,
          currency: 'SYP',
          reason: 'HTTP carrier-damage delivery fee exception',
        },
      });
      expect(res.status).toBe(201);
      expect(res.body['adjustmentType']).toBe('DELIVERY_FEE_EXCEPTION');
      // Both defects would have blocked this row; the FX guard still holds.
      expect(res.body['fxStatus']).toBe('BLOCKED');

      const {
        rows } = await pool.query(
        `SELECT adjustment_type, fx_status, status FROM settlement_adjustments WHERE id = $1`,
        [String(res.body['id'])],
      );
      expect(rows[0]).toMatchObject({
        adjustment_type: 'DELIVERY_FEE_EXCEPTION', fx_status: 'BLOCKED', status: 'DRAFT',
      });

      // It behaves like any other adjustment: approvable, but never postable
      // without an authoritative rate.
      const id = String(res.body['id']);
      const posted = await req('POST', `/v1/admin/settlement-adjustments/${id}/post`, {
        token: admin,
      });
      expect(posted.status).toBe(409);
      expect(detailOf(posted)).toMatch(/must be APPROVED/i);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // §8.6 — Pilot enforcement at the HTTP edge
  // ════════════════════════════════════════════════════════════════════

  describe('§8.6 Pilot enforcement at the HTTP edge', () => {
    it('HA-29: with enforcement off the edge keeps legacy Phase 3 behaviour', async () => {
      const admin = await mint('ADMIN', orgA);
      const pilot = await req('GET', '/v1/admin/ops/p13/pilot', { token: admin });
      expectGranted(pilot.status);
      expect(pilot.body['mode']).toBe('legacy');
      expect(pilot.body['enforced']).toBe(false);

      // 400 from line validation, not 403 from the gate: the gate did not run.
      const res = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgA, { sub: buyerA }), body: gateProbeBody(orderA),
      });
      expect(res.status).toBe(400);
      expect(detailOf(res)).toMatch(/At least one return line is required/i);
      expect(getOpsCounter('pilot_eligibility_denials_total')).toBe(0);
    });

    it('HA-30: turning the flag on over HTTP denies a non-allowlisted org at the edge', async () => {
      const admin = await mint('ADMIN', orgA);
      const flagged = await req('POST', '/v1/admin/ops/p13/pilot/flag', {
        token: admin, body: { enabled: true, description: 'http spec drill' },
      });
      expectGranted(flagged.status);
      expect(flagged.body['enforced']).toBe(true);

      const res = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgA, { sub: buyerA }), body: gateProbeBody(orderA),
      });
      expect(res.status).toBe(403);
      expect(codeOf(res)).toBe('p13_pilot_org_not_allowlisted');
      expect(getOpsCounter('pilot_eligibility_denials_total')).toBe(1);

      // The denial is observable by an operator, not only inside this process.
      const status = await req('GET', '/v1/admin/ops/p13/status', { token: admin });
      expectGranted(status.status);
      const pilot = status.body['pilot'] as Record<string, unknown>;
      expect(pilot['denials']).toBe(1);
      expect(pilot['enforced']).toBe(true);

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM return_requests`,
      );
      expect(rows[0]!.c).toBe(2); // nothing was created
    });

    it('HA-31: allowlisting one org opens that org only, and grants no extra permission', async () => {
      const admin = await mint('ADMIN', orgA);
      await grantedPost(admin, '/v1/admin/ops/p13/pilot/flag', {
        enabled: true, description: 'http spec drill',
      });

      const added = await grantedPost(admin, '/v1/admin/ops/p13/pilot/allowlist', {
        orgId: orgA, note: 'http spec orgA',
      });
      expect(added['enabledCount']).toBe(1);

      // Org A now passes the gate and fails on the deliberately invalid body.
      const inside = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgA, { sub: buyerA }), body: gateProbeBody(orderA),
      });
      expect(inside.status).toBe(400);
      expect(detailOf(inside)).toMatch(/At least one return line is required/i);

      // Org B is still outside, even though its buyer has the same role and perms.
      const outside = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgB, { sub: buyerB }), body: gateProbeBody(orderB),
      });
      expect(outside.status).toBe(403);
      expect(codeOf(outside)).toBe('p13_pilot_org_not_allowlisted');

      // Eligibility is not a permission: an allowlisted buyer still cannot read
      // financial records.
      const financeAsBuyer = await req('GET', '/v1/admin/settlement-adjustments', {
        token: await mint('BUYER', orgA, { sub: buyerA }),
      });
      expect(financeAsBuyer.status).toBe(403);
      expect(detailOf(financeAsBuyer)).toContain('admin:adjustments:read');
    });

    it('HA-32: revoking denies again and preserves the allowlist row as a durable record', async () => {
      const admin = await mint('ADMIN', orgA);
      await grantedPost(admin, '/v1/admin/ops/p13/pilot/flag', { enabled: true });
      await grantedPost(admin, '/v1/admin/ops/p13/pilot/allowlist', {
        orgId: orgA, note: 'granted',
      });

      const revoked = await grantedPost(admin, '/v1/admin/ops/p13/pilot/allowlist/revoke', {
        orgId: orgA, note: 'drill complete',
      });
      expect(Number(revoked['rowsAffected'])).toBe(1);

      const res = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgA, { sub: buyerA }), body: gateProbeBody(orderA),
      });
      expect(res.status).toBe(403);
      expect(codeOf(res)).toBe('p13_pilot_entry_disabled');

      // Disable, never delete: the entry and its reason survive for the audit trail.
      const { rows } = await pool.query(
        `SELECT enabled, note FROM p13_pilot_allowlist WHERE org_id = $1`, [orgA],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.enabled).toBe(false);
      expect(rows[0]!.note).toBe('drill complete');
    });

    it('HA-33: switching enforcement off keeps the records and audits every change', async () => {
      const admin = await mint('ADMIN', orgA);
      await grantedPost(admin, '/v1/admin/ops/p13/pilot/flag', { enabled: true });
      await grantedPost(admin, '/v1/admin/ops/p13/pilot/allowlist', {
        orgId: orgA, note: 'kept for the next drill',
      });

      const off = await grantedPost(admin, '/v1/admin/ops/p13/pilot/flag', {
        enabled: false, description: 'http spec drill over',
      });
      expect(off['enforced']).toBe(false);
      expect(off['flagEnabled']).toBe(false);

      // Durable configuration survives the flag flip.
      const pilot = await req('GET', '/v1/admin/ops/p13/pilot', { token: admin });
      expect(pilot.body['allowlistCount']).toBe(1);
      expect(pilot.body['enabledCount']).toBe(1);

      const res = await req('POST', '/v1/returns', {
        token: await mint('BUYER', orgA, { sub: buyerA }), body: gateProbeBody(orderA),
      });
      expect(res.status).toBe(400); // legacy behaviour restored

      const { rows } = await pool.query(
        `SELECT action FROM audit_logs
          WHERE resource IN ('feature_flag', 'p13_pilot_allowlist') ORDER BY created_at`,
      );
      expect(rows.map((row: { action: string }) => row.action)).toEqual(
        expect.arrayContaining([
          'p13.pilot.enable', 'p13.pilot.allowlist.add', 'p13.pilot.disable',
        ]),
      );
    });
  });
});
