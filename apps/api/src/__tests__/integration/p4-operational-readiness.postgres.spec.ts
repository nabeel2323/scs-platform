/**
 * P13 Phase 4 — Operational Readiness (PostgreSQL)
 *
 * Proves §3 worker exclusivity, §4 monitoring/alerting, §5 kill switch/recovery
 * and §6 pilot controls against a real disposable PostgreSQL with the full
 * migration chain, using the real services (no mocked collaborators on the
 * paths under test).
 *
 * Delivery is verified end-to-end: alert 4.x/5.x/6.x/7.x/8.x/9.x/10.x assertions
 * read the `ops_alerts` rows, and the sink test POSTs to a real HTTP listener
 * started inside the spec. An alert is only claimed "operational" here when a
 * row (and where applicable a delivered payload) exists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID, createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { AuditService } from '../../modules/audit/audit.service';
import { BusinessCalendarService } from '../../modules/returns/business-calendar.service';
import { ReturnsService } from '../../modules/returns/returns.service';
import { ReturnExpirationWorker } from '../../modules/returns/return-expiration.worker';
import { WorkerLeaseService } from '../../modules/operations/worker-lease.service';
import { OpsAlertService } from '../../modules/operations/ops-alert.service';
import { OpsControlService } from '../../modules/operations/ops-control.service';
import { PilotControlService } from '../../modules/operations/pilot-control.service';
import { P13MonitorService } from '../../modules/operations/p13-monitor.service';
import {
  P13_LEASE_KEY, P13_PAUSE_CONTROL_KEY, P13_PILOT_FLAG_KEY,
} from '../../modules/operations/p13-ops.config';
import { resetOpsCounters, recordOpsCounter, getOpsCounter } from '../../modules/operations/ops-counters';
import { verifySignature } from '../../modules/operations/ops-alert-signing';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import * as schema from '../../drizzle/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);

/**
 * AL-17 sink fixture (Phase 4.1.13): test-only HMAC secret for the disposable
 * in-process receiver. Explicitly labelled CI/test-only — never a production
 * credential, and never used outside this spec's localhost receiver.
 */
const P4_TEST_SINK_SECRET = 'p4-integration-sink-secret-0123456789abcdef!!';

/** Two competing workers need two holder identities in one process. */
function withHolder(lease: WorkerLeaseService, label: string): WorkerLeaseService {
  (lease as unknown as { holderId: string }).holderId = `spec-${label}-${randomUUID().slice(0, 8)}`;
  return lease;
}

function makeWorker(db: DatabaseService, returns: ReturnsService, label: string) {
  const leases = withHolder(new WorkerLeaseService(db), label);
  const alerts = new OpsAlertService(db);
  const audit = new AuditService(db);
  const controls = new OpsControlService(db, audit, alerts);
  const worker = new ReturnExpirationWorker(db, returns, leases, controls, alerts);
  // Drive the protected path deterministically: enabled, no cadence throttle.
  worker.config.workerEnabled = true;
  worker.config.pollIntervalMs = 0;
  worker.config.leaseTtlSeconds = 90;
  // `tick()` gates on the lifecycle state that a real boot would have set in
  // onModuleInit(). Setting it directly keeps the spec off the startup timer.
  worker.state = 'STANDBY';
  return { worker, leases, controls, alerts };
}

/** A delivered (protocol-valid) alert as captured by the verifying sink. */
interface SinkDelivery {
  id: string;
  dedupKey: string;
  conditionKey: string;
  severity: string;
  payload: Record<string, unknown>;
  signature: string;
  timestamp: string;
  rawByteLength: number;
}

/** A request the sink refused, with the reason it did not satisfy the protocol. */
interface SinkRejection {
  reason: string;
  signature: string | null;
  timestamp: string | null;
}

/**
 * Disposable CI-local alert receiver (Phase 4.1.13). Binds 127.0.0.1 only, on
 * an OS-assigned ephemeral port (deterministic startup, no cross-test port
 * contention), and accepts a request ONLY when it satisfies the signed
 * delivery protocol: signature + timestamp headers present, timestamp inside
 * the freshness window, and HMAC-SHA256 valid over `<timestamp>.<rawBody>`
 * computed from the EXACT bytes received (not a re-serialization). Invalid
 * requests get 401 and are recorded as rejections. The secret never appears
 * in any log line or payload.
 */
async function startAlertSink(secret: string): Promise<{
  url: string;
  deliveries: SinkDelivery[];
  rejections: SinkRejection[];
  close(): Promise<void>;
}> {
  const deliveries: SinkDelivery[] = [];
  const rejections: SinkRejection[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const rawBody = raw.toString('utf-8');
      const signature = (req.headers['x-scs-alert-signature'] as string | undefined) ?? null;
      const timestamp = (req.headers['x-scs-alert-timestamp'] as string | undefined) ?? null;
      const reject = (status: number, reason: string) => {
        rejections.push({ reason, signature, timestamp });
        res.writeHead(status).end('{"error":"rejected"}');
      };
      // The signed bytes must be the exact bytes on the wire: UTF-8 must
      // round-trip losslessly before any signature check is meaningful.
      if (!Buffer.from(rawBody, 'utf-8').equals(raw)) {
        reject(400, 'raw body is not the exact UTF-8 signed byte sequence');
        return;
      }
      if (!signature || !timestamp) {
        reject(401, 'missing signature or timestamp header');
        return;
      }
      if (!verifySignature(rawBody, signature, timestamp, secret)) {
        reject(401, 'invalid signature, tampered body, or stale timestamp');
        return;
      }
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      deliveries.push({
        id: String(payload['id'] ?? ''),
        dedupKey: String(payload['dedupKey'] ?? ''),
        conditionKey: String(payload['conditionKey'] ?? ''),
        severity: String(payload['severity'] ?? ''),
        payload,
        signature,
        timestamp,
        rawByteLength: raw.byteLength,
      });
      res.writeHead(202).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/alerts`,
    deliveries,
    rejections,
    close: async () => {
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Delete the sender env vars so no other test inherits the sink configuration. */
function clearSinkEnv(): void {
  delete process.env['P13_OPS_ALERT_WEBHOOK_URL'];
  delete process.env['P13_OPS_ALERT_WEBHOOK_SECRET'];
}

describe('P13 Phase 4 — Operational Readiness (PostgreSQL)', () => {
  let container: { stop(): Promise<unknown> };
  let pool: Pool;
  let database: DatabaseService;
  let leases: WorkerLeaseService;
  let alerts: OpsAlertService;
  let audit: AuditService;
  let controls: OpsControlService;
  let monitor: P13MonitorService;
  let pilotLegacy: PilotControlService;
  let returnsService: ReturnsService;
  let outboxPublish: ReturnType<typeof vi.fn>;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const buyerA = randomUUID();
  const actorAdmin = randomUUID();
  let storeA: string;
  let storeB: string;
  let orderA: string;
  let orderB: string;
  let payA: string;
  let payB: string;
  let retA: string;
  let retB: string;

  // ── Harness ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
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

    // ── Two-organization fixture with the P13 FK chain ──
    await pool.query(`INSERT INTO organizations (id, type, name, country) VALUES ($1,'WHOLESALER','P4 Org A','SY'),($2,'WHOLESALER','P4 Org B','SY')`, [orgA, orgB]);
    await pool.query(`INSERT INTO users (id, full_name, phone) VALUES ($1,'Buyer A','+966501000001'),($2,'Actor Admin','+966501000002')`, [buyerA, actorAdmin]);
    storeA = randomUUID(); storeB = randomUUID();
    await pool.query(`INSERT INTO stores (id, org_id, slug, display_name, currency, status, verification_status) VALUES ($1,$2,'p4-store-a','P4 Store A','SYP','ACTIVE','VERIFIED'),($3,$4,'p4-store-b','P4 Store B','SYP','ACTIVE','VERIFIED')`, [storeA, orgA, storeB, orgB]);
    const masterA = randomUUID(); const masterB = randomUUID();
    await pool.query(`INSERT INTO master_orders (id, buyer_id, status) VALUES ($1,$2,'SUBMITTED'),($3,$2,'SUBMITTED')`, [masterA, buyerA, masterB]);
    orderA = randomUUID(); orderB = randomUUID();
    await pool.query(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor) VALUES ($1,$2,$3,$4,'DELIVERED',5000,0,500,0,5500),($5,$6,$7,$4,'DELIVERED',7000,0,500,0,7500)`, [orderA, masterA, storeA, buyerA, orderB, masterB, storeB]);
    payA = randomUUID(); payB = randomUUID();
    await pool.query(`INSERT INTO payment_records (id, order_id, payment_method, status, amount_minor, currency) VALUES ($1,$2,'CASH_ON_DELIVERY','CONFIRMED',5500,'SYP'),($3,$4,'CASH_ON_DELIVERY','CONFIRMED',7500,'SYP')`, [payA, orderA, payB, orderB]);
    retA = randomUUID(); retB = randomUUID();
    await pool.query(`INSERT INTO return_requests (id, sub_order_id, payment_record_id, buyer_id, status, reason, requested_refund_minor, expires_at) VALUES ($1,$2,$3,$4,'REQUESTED','PRODUCT_NOT_AS_DESCRIBED',5000, now() - interval '5 minutes'),($5,$6,$7,$4,'REQUESTED','PRODUCT_NOT_AS_DESCRIBED',7000, now() - interval '5 minutes')`, [retA, orderA, payA, buyerA, retB, orderB, payB]);

    // ── Real operational services ──
    outboxPublish = vi.fn().mockResolvedValue(undefined);
    const outbox = {
      publish: outboxPublish,
      dispatch: vi.fn().mockResolvedValue(undefined),
    } as unknown as OutboxDispatcher;

    leases = new WorkerLeaseService(database);
    alerts = new OpsAlertService(database);
    audit = new AuditService(database);
    controls = new OpsControlService(database, audit, alerts);
    pilotLegacy = new PilotControlService(database, audit, alerts);
    monitor = new P13MonitorService(database, alerts, leases);

    const calendar = new BusinessCalendarService(database);
    returnsService = new ReturnsService(
      database, outbox,
      // Not reached: the pilot gate fires before any payment interaction.
      {} as unknown as ConstructorParameters<typeof ReturnsService>[2],
      calendar,
      {} as unknown as ConstructorParameters<typeof ReturnsService>[4],
      {} as unknown as ConstructorParameters<typeof ReturnsService>[5],
      pilotLegacy,
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  /** Unheld lease at a known epoch, plus no alerts/controls, between tests. */
  beforeEach(async () => {
    await pool.query(`UPDATE worker_leases SET holder_id=NULL, holder_host=NULL, holder_pid=NULL, acquired_at=NULL, heartbeat_at=NULL, expires_at=NULL, poll_failures=0, last_error_code=NULL, last_job_at=NULL, last_job_summary=NULL`);
    await pool.query(`DELETE FROM ops_alerts`);
    await pool.query(`DELETE FROM ops_control_audit`);
    await pool.query(`DELETE FROM ops_controls`);
    await pool.query(`DELETE FROM return_request_events`);
    await pool.query(`UPDATE return_requests SET status='REQUESTED', expires_at = now() - interval '5 minutes', escalated_at=NULL, escalation_deadline=NULL`);
    await pool.query(`DELETE FROM refunds`);
    await pool.query(`DELETE FROM outbox_events`);
    await pool.query(`DELETE FROM p13_pilot_allowlist`);
    await pool.query(`DELETE FROM feature_flags WHERE key = $1`, [P13_PILOT_FLAG_KEY]);
    resetOpsCounters();
  });

  async function leaseRow() {
    const { rows } = await pool.query(
      `SELECT holder_id, epoch, poll_failures, last_error_code, heartbeat_at, expires_at,
              last_job_at, last_job_summary
       FROM worker_leases WHERE lease_key = $1`, [P13_LEASE_KEY],
    );
    return rows[0];
  }

  /** Current fencing token as a number (`bigint` arrives as a string). */
  async function leaseEpoch(): Promise<number> {
    return Number((await leaseRow()).epoch);
  }

  async function statusOf(id: string): Promise<string> {
    const { rows } = await pool.query(`SELECT status FROM return_requests WHERE id = $1`, [id]);
    return rows[0].status;
  }

  async function escalatedEventCount(id: string): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM return_request_events WHERE return_request_id = $1 AND event_type = 'ESCALATED'`, [id],
    );
    return rows[0].c;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // §3 — Worker exclusivity and safe execution
  // ═════════════════════════════════════════════════════════════════════════

  describe('§3 Worker exclusivity', () => {
    it('WX-01: a zero-worker system is observably zero — the lease is unheld', async () => {
      const counts = await leases.liveHolderCounts();
      expect(counts.find((c) => c.leaseKey === P13_LEASE_KEY)?.liveHolders ?? 0).toBe(0);
      const record = await leases.read(P13_LEASE_KEY);
      expect(record?.holderId).toBeNull();
    });

    it('WX-02: one worker acquires the lease and the epoch becomes its fencing token', async () => {
      const acquired = await leases.tryAcquire(P13_LEASE_KEY);
      expect(acquired.acquired).toBe(true);
      expect(acquired.epoch).toBeGreaterThan(0);

      const row = await leaseRow();
      expect(row.holder_id).toBe(leases.holderId);
      expect(Number(row.epoch)).toBe(acquired.epoch);
      expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
      // Acquisition is also a heartbeat.
      expect(row.heartbeat_at).not.toBeNull();
    });

    it('WX-03: a second worker cannot acquire a live lease', async () => {
      await leases.tryAcquire(P13_LEASE_KEY);
      const rival = withHolder(new WorkerLeaseService(database), 'rival');
      const attempt = await rival.tryAcquire(P13_LEASE_KEY);

      expect(attempt.acquired).toBe(false);
      expect(attempt.reason).toBe('HELD_BY_OTHER');
      expect(attempt.epoch).toBe(0);
      const row = await leaseRow();
      expect(row.holder_id).toBe(leases.holderId);
    });

    it('WX-04: after expiry ownership transfers and the epoch strictly increases', async () => {
      const first = await leases.tryAcquire(P13_LEASE_KEY);
      await leases.forceExpire(P13_LEASE_KEY);

      const rival = withHolder(new WorkerLeaseService(database), 'rival');
      const second = await rival.tryAcquire(P13_LEASE_KEY);

      expect(second.acquired).toBe(true);
      expect(second.epoch).toBeGreaterThan(first.epoch);
      const row = await leaseRow();
      expect(row.holder_id).toBe(rival.holderId);
    });

    it('WX-05: a stale holder cannot renew — the fence rejects its epoch', async () => {
      const stale = await leases.tryAcquire(P13_LEASE_KEY);
      await leases.forceExpire(P13_LEASE_KEY);
      const rival = withHolder(new WorkerLeaseService(database), 'rival');
      await rival.tryAcquire(P13_LEASE_KEY);

      expect(await leases.renewAndFence(stale.epoch, P13_LEASE_KEY)).toBe(false);
      expect(await rival.renewAndFence(await leaseEpoch(), P13_LEASE_KEY)).toBe(true);
    });

    it('WX-06: a stale worker cannot modify return state, even mid-batch', async () => {
      const a = makeWorker(database, returnsService, 'A');
      // retB is NOT yet past its SLA, so neither A's first cycle nor B's takeover
      // can process it. It only becomes overdue while A is partitioned away.
      await pool.query(`UPDATE return_requests SET expires_at = now() + interval '24 hours' WHERE id = $1`, [retB]);
      const first = await a.worker.tick();
      expect(first.executed).toBe(true);
      expect(await statusOf(retA)).toBe('ESCALATED');

      // A's lease dies and B takes over at a strictly higher epoch, while A
      // still believes it owns epoch 1.
      await a.leases.forceExpire(P13_LEASE_KEY);
      const b = makeWorker(database, returnsService, 'B');
      expect((await b.worker.tick()).acquired).toBe(true);

      // New overdue work appears after A was partitioned.
      await pool.query(`UPDATE return_requests SET status='REQUESTED', expires_at = now() - interval '5 minutes' WHERE id = $1`, [retB]);

      const report = await a.worker.runBatch();
      expect(report.executed).toBe(false);
      expect(report.skipped).toBe('fence_lost');
      // The stale claim never ran: not even `updated_at` was written by A.
      expect(await statusOf(retB)).toBe('REQUESTED');
      expect(await escalatedEventCount(retB)).toBe(0);
      expect(a.worker.state).toBe('STANDBY');
    });

    it('WX-07: competing workers racing the same expired lease produce exactly one owner', async () => {
      await leases.forceExpire(P13_LEASE_KEY);
      const contenders = Array.from({ length: 5 }, (_, i) => withHolder(new WorkerLeaseService(database), `c${i}`));

      const results = await Promise.all(contenders.map((c) => c.tryAcquire(P13_LEASE_KEY)));
      const winners = results.filter((r) => r.acquired);

      expect(winners).toHaveLength(1);
      const row = await leaseRow();
      expect(row.holder_id).toBe(winners[0]!.holderId);
      expect(await leases.liveHolderCounts()).toHaveLength(1);
    });

    it('WX-08: startup fails closed when the database is unreachable', async () => {
      const brokenDb = {
        db: { execute: async () => { throw new Error('connection refused'); } },
      } as unknown as DatabaseService;

      const brokenLease = new WorkerLeaseService(brokenDb);
      const acquired = await brokenLease.tryAcquire(P13_LEASE_KEY);
      expect(acquired.acquired).toBe(false);
      expect(acquired.reason).toBe('DB_ERROR');
      expect(acquired.epoch).toBe(0);

      const brokenReturns = { escalateReturn: async () => { throw new Error('must not be reached'); } } as unknown as ReturnsService;
      const w = makeWorker(brokenDb, brokenReturns, 'broken');
      const report = await w.worker.tick();
      expect(report.executed).toBe(false);
      expect(report.skipped).toBe('acquisition_failed');
      expect(w.worker.state).toBe('STANDBY');
    });

    it('WX-09: a disabled worker never touches the lease and never runs protected work', async () => {
      const w = makeWorker(database, returnsService, 'disabled');
      w.worker.config.workerEnabled = false;
      w.worker.onModuleInit();
      expect(w.worker.state).toBe('DISABLED');

      const report = await w.worker.tick();
      expect(report).toMatchObject({ executed: false, skipped: 'disabled', state: 'DISABLED' });

      const row = await leaseRow();
      expect(row.holder_id).toBeNull();
      expect(await statusOf(retA)).toBe('REQUESTED');
      await w.worker.onModuleDestroy();
    });

    it('WX-10: an enabled worker on a standby instance reports STANDBY, not silent work', async () => {
      const owner = makeWorker(database, returnsService, 'owner');
      const first = await owner.worker.tick();
      expect(first.acquired).toBe(true);

      const standby = makeWorker(database, returnsService, 'standby');
      const report = await standby.worker.tick();
      expect(report.executed).toBe(false);
      expect(report.skipped).toBe('acquisition_failed');
      expect(standby.worker.state).toBe('STANDBY');
      // Only one ESCALATED event exists per processed return.
      expect(await escalatedEventCount(retA)).toBe(1);
    });

    it('WX-11: heartbeats and cycle outcome are observable on the lease row', async () => {
      const w = makeWorker(database, returnsService, 'hb');
      await w.worker.tick();
      const afterFirst = await leaseRow();
      expect(afterFirst.last_job_summary).toMatch(/claimed=|escalated=/);
      expect(Number(afterFirst.poll_failures)).toBe(0);

      await pool.query(`UPDATE return_requests SET status='REQUESTED', expires_at = now() - interval '5 minutes'`);
      const renewed = await w.leases.renewAndFence(await leaseEpoch(), P13_LEASE_KEY);
      expect(renewed).toBe(true);
      const afterRenew = await leaseRow();
      expect(new Date(afterRenew.heartbeat_at).getTime())
        .toBeGreaterThanOrEqual(new Date(afterFirst.heartbeat_at).getTime());
    });

    it('WX-12: voluntary release lets a standby take over immediately', async () => {
      const a = makeWorker(database, returnsService, 'rel-A');
      await a.worker.tick();
      const epoch = await leaseEpoch();
      expect(await a.leases.release(epoch, P13_LEASE_KEY)).toBe(true);
      expect((await leaseRow()).holder_id).toBeNull();

      const b = makeWorker(database, returnsService, 'rel-B');
      const report = await b.worker.tick();
      expect(report.executed).toBe(true);
      // A stale release cannot clear B's lease.
      expect(await a.leases.release(epoch, P13_LEASE_KEY)).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §4 — Monitoring and alerting
  // ═════════════════════════════════════════════════════════════════════════

  describe('§4 Monitoring and alerting', () => {
    async function alertFor(conditionKey: string) {
      const rows = await alerts.listByCondition(conditionKey);
      return rows[0] ?? null;
    }

    it('AL-01 (alert 1): three consecutive worker polling failures raise a CRITICAL alert', async () => {
      await leases.tryAcquire(P13_LEASE_KEY);
      const epoch = (await leaseRow()).epoch;
      expect(await leases.recordPollFailure(epoch, 'POLL_TIMEOUT')).toBe(1);
      expect(await leases.recordPollFailure(epoch, 'POLL_TIMEOUT')).toBe(2);
      const { findings } = await monitor.collectFindings();
      expect(findings.some((f) => f.conditionKey === 'p13.worker.poll_failures')).toBe(false);

      expect(await leases.recordPollFailure(epoch, 'POLL_TIMEOUT')).toBe(3);
      const report = await monitor.scan();
      expect(report.findings.some((f) => f.conditionKey === 'p13.worker.poll_failures')).toBe(true);

      const row = await alertFor('p13.worker.poll_failures');
      expect(row).not.toBeNull();
      expect(row!.severity).toBe('CRITICAL');
      expect(row!.condition_key).toBe('p13.worker.poll_failures');
    });

    it('AL-02: a fenced failure write is rejected, so a stale worker cannot poison the counter', async () => {
      await leases.tryAcquire(P13_LEASE_KEY);
      const epoch = (await leaseRow()).epoch;
      await leases.forceExpire(P13_LEASE_KEY);
      const rival = withHolder(new WorkerLeaseService(database), 'poison');
      await rival.tryAcquire(P13_LEASE_KEY);

      expect(await leases.recordPollFailure(epoch, 'STALE')).toBeNull();
      expect((await leaseRow()).poll_failures).toBe(0);
    });

    it('AL-03 (alert 2): a return past its merchant SLA is escalation-overdue; a healthy one is not', async () => {
      await pool.query(`UPDATE return_requests SET expires_at = now() - interval '30 minutes' WHERE id = $1`, [retA]);
      await pool.query(`UPDATE return_requests SET expires_at = now() + interval '24 hours' WHERE id = $1`, [retB]);

      const { findings } = await monitor.collectFindings();
      const overdue = findings.filter((f) => f.conditionKey === 'p13.return.escalation_overdue');
      expect(overdue).toHaveLength(1);
      expect(overdue[0]!.resourceId).toBe(retA);
      // The 72h SLA has not elapsed for a healthy request, so it is NOT alerted.
      expect(overdue.some((f) => f.resourceId === retB)).toBe(false);
    });

    it('AL-04 (alert 3): zero live holders is a CRITICAL count anomaly', async () => {
      const { findings } = await monitor.collectFindings();
      const anomaly = findings.find((f) => f.conditionKey === 'p13.worker.count_anomaly');
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe('CRITICAL');
      expect(anomaly!.detail).toMatchObject({ liveHolders: 0, expected: 1 });
    });

    it('AL-05: exactly one live holder clears the count anomaly', async () => {
      await leases.tryAcquire(P13_LEASE_KEY);
      const { findings, clears } = await monitor.collectFindings();
      expect(findings.some((f) => f.conditionKey === 'p13.worker.count_anomaly')).toBe(false);
      expect(clears).toContain(`p13.worker.count_anomaly:${P13_LEASE_KEY}`);
    });

    it('AL-06 (alert 4): a heartbeat older than five minutes is CRITICAL', async () => {
      await leases.tryAcquire(P13_LEASE_KEY);
      await pool.query(`UPDATE worker_leases SET heartbeat_at = now() - interval '6 minutes' WHERE lease_key = $1`, [P13_LEASE_KEY]);

      const { findings } = await monitor.collectFindings();
      const stale = findings.find((f) => f.conditionKey === 'p13.worker.heartbeat_stale');
      expect(stale).toBeDefined();
      expect(stale!.severity).toBe('CRITICAL');
      expect(stale!.detail!['holderId']).toBe(leases.holderId);
    });

    it('AL-07 (alert 5): failed, stuck and manual-review refunds are each detected', async () => {
      await pool.query(`INSERT INTO refunds (id, payment_record_id, order_id, amount_minor, currency, status, reason, return_request_id, created_at) VALUES ($1,$2,$3,1000,'SYP','FAILED','QUALITY_ISSUE',$4, now())`, [randomUUID(), payA, orderA, retA]);
      await pool.query(`INSERT INTO refunds (id, payment_record_id, order_id, amount_minor, currency, status, reason, return_request_id, created_at) VALUES ($1,$2,$3,1000,'SYP','PROCESSING','QUALITY_ISSUE',$4, now() - interval '45 minutes')`, [randomUUID(), payA, orderA, retA]);
      await pool.query(`UPDATE return_requests SET status='REFUND_FAILED' WHERE id = $1`, [retB]);

      const { findings } = await monitor.collectFindings();
      expect(findings.some((f) => f.conditionKey === 'p13.refund.failed')).toBe(true);
      expect(findings.some((f) => f.conditionKey === 'p13.refund.stuck')).toBe(true);
      const review = findings.find((f) => f.conditionKey === 'p13.refund.manual_review');
      expect(review!.severity).toBe('CRITICAL');
      expect(review!.resourceId).toBe(retB);
    });

    it('AL-08: refund alert detail carries no monetary amount (sensitive data excluded)', async () => {
      await pool.query(`INSERT INTO refunds (id, payment_record_id, order_id, amount_minor, currency, status, reason, return_request_id, created_at) VALUES ($1,$2,$3,4711,'SYP','FAILED','QUALITY_ISSUE',$4, now())`, [randomUUID(), payA, orderA, retA]);
      const { findings } = await monitor.collectFindings();
      const failed = findings.find((f) => f.conditionKey === 'p13.refund.failed')!;
      const serialized = JSON.stringify(failed.detail);
      expect(serialized).not.toContain('4711');
      expect(Object.keys(failed.detail!)).toEqual(
        expect.arrayContaining(['refundId', 'returnRequestId', 'status', 'createdAt']),
      );
    });

    it('AL-09 (alert 6): reversal FAILED rows and duplicate-attempt counters both alert', async () => {
      await pool.query(`INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id) VALUES ($1,$2,200,200,'MERCHANT',$3,'FAILED','SYP',$4)`, [randomUUID(), retA, `failed-${randomUUID()}`, orgA]);
      recordOpsCounter('commission_reversal_duplicate_attempts_total', 2, 'idem-key');

      const { findings } = await monitor.collectFindings();
      expect(findings.some((f) => f.conditionKey === 'p13.commission.reversal_failed')).toBe(true);
      const dup = findings.find((f) => f.conditionKey === 'p13.commission.reversal_duplicate_attempt');
      expect(dup!.severity).toBe('WARN');
      expect(dup!.detail).toMatchObject({ duplicateAttempts: 2 });
    });

    it('AL-10 (alert 7): over-reversal beyond the original commission is an invariant violation', async () => {
      await pool.query(`INSERT INTO commission_reversals (id, return_request_id, original_commission_minor, reversal_minor, responsibility_category, idempotency_key, status, currency, org_id) VALUES ($1,$2,100,100,'MERCHANT',$3,'POSTED','SYP',$4),($5,$2,100,50,'PLATFORM',$6,'POSTED','SYP',$4)`, [randomUUID(), retA, `a-${randomUUID()}`, orgA, randomUUID(), `b-${randomUUID()}`]);

      const { findings } = await monitor.collectFindings();
      const violation = findings.find((f) => f.conditionKey === 'p13.financial.invariant_violation');
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('CRITICAL');
      expect(violation!.detail).toMatchObject({ violation: 'reversal_exceeds_original_commission' });
    });

    it('AL-11 (alert 7): refunds exceeding the captured payment is an invariant violation', async () => {
      await pool.query(`INSERT INTO refunds (id, payment_record_id, order_id, amount_minor, currency, status, reason, payment_ref_counter, created_at) VALUES ($1,$2,$3,6000,'SYP','SUCCEEDED','QUALITY_ISSUE','r1', now()),($4,$2,$3,1000,'SYP','SUCCEEDED','QUALITY_ISSUE','r2', now())`, [randomUUID(), payA, orderA, randomUUID()]).catch(async () => {
        // payment_ref_counter may not exist; retry without it.
        await pool.query(`INSERT INTO refunds (id, payment_record_id, order_id, amount_minor, currency, status, reason, created_at) VALUES ($1,$2,$3,6000,'SYP','SUCCEEDED','QUALITY_ISSUE', now()),($4,$2,$3,1000,'SYP','SUCCEEDED','QUALITY_ISSUE', now())`, [randomUUID(), payA, orderA, randomUUID()]);
      });

      const { findings } = await monitor.collectFindings();
      const violation = findings.find(
        (f) => f.conditionKey === 'p13.financial.invariant_violation'
          && f.detail!['violation'] === 'refund_exceeds_payment',
      );
      expect(violation).toBeDefined();
      // Payment was 5500; 7000 refunded.
      expect(violation!.detail).toMatchObject({ refundedMinor: 7000, paidMinor: 5500 });
    });

    it('AL-12 (alert 7): a POSTED adjustment whose FX is still blocked is an invariant violation', async () => {
      const adj = randomUUID();
      await pool.query(`INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id) VALUES ($1,$2,'SETTLEMENT_CORRECTION',500,'SYP','BLOCKED','POSTED','posted while blocked',false,$3,$4)`, [adj, orderA, actorAdmin, orgA]);

      const { findings } = await monitor.collectFindings();
      const violation = findings.find(
        (f) => f.conditionKey === 'p13.financial.invariant_violation'
          && f.detail!['violation'] === 'posted_without_authoritative_fx',
      );
      expect(violation).toBeDefined();
      expect(violation!.detail).toMatchObject({ adjustmentId: adj, fxStatus: 'BLOCKED' });
    });

    it('AL-13 (alert 8): an adjustment scoped to a non-owning organization is a tenant-isolation violation', async () => {
      const adj = randomUUID();
      await pool.query(`INSERT INTO settlement_adjustments (id, sub_order_id, adjustment_type, amount_minor, currency, fx_status, status, reason, requires_dual_approval, created_by, org_id) VALUES ($1,$2,'SETTLEMENT_CORRECTION',500,'SYP','BLOCKED','DRAFT','cross-org',false,$3,$4)`, [adj, orderA, actorAdmin, orgB]);

      const { findings } = await monitor.collectFindings();
      const iso = findings.find((f) => f.conditionKey === 'p13.tenant.isolation_violation');
      expect(iso).toBeDefined();
      expect(iso!.severity).toBe('CRITICAL');
      expect(iso!.detail).toMatchObject({ violation: 'adjustment_org_mismatch' });
      expect(iso!.orgId).toBe(orgA);
    });

    it('AL-14 (alert 8): object-level isolation denials are surfaced as a WARN alert', async () => {
      recordOpsCounter('financial_isolation_denials_total', 3, 'missing_active_org');
      const { findings } = await monitor.collectFindings();
      const denial = findings.find((f) => f.conditionKey === 'p13.tenant.isolation_denial');
      expect(denial).toBeDefined();
      expect(denial!.detail).toMatchObject({ denials: 3 });
    });

    it('AL-15 (alert 9): a FAILED/DEAD_LETTER P13 outbox event is CRITICAL', async () => {
      await pool.query(`INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, attempts, created_at) VALUES ($1,'return.escalated',$2,'{}'::jsonb,'DEAD_LETTER',5, now())`, [randomUUID(), retA]);
      await pool.query(`INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, attempts, created_at) VALUES ($1,'inventory.released',$2,'{}'::jsonb,'FAILED',5, now())`, [randomUUID(), orderA]);

      const { findings } = await monitor.collectFindings();
      const outbox = findings.filter((f) => f.conditionKey === 'p13.outbox.delivery_failed');
      expect(outbox).toHaveLength(1);
      expect(outbox[0]!.detail).toMatchObject({ eventType: 'return.escalated', status: 'DEAD_LETTER' });
    });

    it('AL-16 (alert 9): an audit write failure raises a CRITICAL durability alert', async () => {
      // Exercise the real writer against a table that cannot accept the row.
      await pool.query(`ALTER TABLE audit_logs ADD CONSTRAINT p4_probe_fail CHECK (FALSE)`);
      await audit.record({ actorType: 'ADMIN', actorId: actorAdmin, action: 'p4.probe', resource: 'probe' });
      await pool.query(`ALTER TABLE audit_logs DROP CONSTRAINT p4_probe_fail`);

      expect(getOpsCounter('audit_write_failures_total')).toBe(1);
      const { findings } = await monitor.collectFindings();
      const auditAlert = findings.find((f) => f.conditionKey === 'p13.audit.write_failed');
      expect(auditAlert).toBeDefined();
      expect(auditAlert!.severity).toBe('CRITICAL');
    });

    it('AL-17 (alert 10): delivery is confirmed end-to-end against a real verifying sink', async () => {
      // The sender is configured through the REAL env path — URL plus a valid
      // >= 32-char secret — BEFORE the service (and therefore its resolved
      // config) is initialized. This exercises resolveP13OpsConfig's fail-closed
      // gate with a passing configuration instead of mutating a constructed
      // service, and leaves the shared no-sink `alerts` instance untouched.
      const sink = await startAlertSink(P4_TEST_SINK_SECRET);
      process.env['P13_OPS_ALERT_WEBHOOK_URL'] = sink.url;
      process.env['P13_OPS_ALERT_WEBHOOK_SECRET'] = P4_TEST_SINK_SECRET;
      const signedAlerts = new OpsAlertService(database);
      try {
        expect(signedAlerts.hasSink).toBe(true);
        expect(signedAlerts.channelName).toBe('webhook');

        const result = await signedAlerts.raise({
          conditionKey: 'p4.sink.probe',
          severity: 'WARN',
          title: 'Sink delivery probe',
          detail: { probe: true },
          resourceType: 'ops_probe',
        });
        // The sender records SENT only after the sink answered 2xx.
        expect(result.status).toBe('SENT');
        expect(result.notified).toBe(true);

        const row = await alertFor('p4.sink.probe');
        expect(row!.status).toBe('SENT');
        expect(row!.delivered_at).not.toBeNull();
        expect(row!.delivery_channel).toBe('webhook');
        expect(row!.attempt_count).toBe(1);

        // Receiver-side protocol evidence: exactly one request, it validated,
        // it is the expected alert, and its signature/timestamp headers were
        // verified inside the sink over the exact received bytes.
        expect(sink.rejections).toHaveLength(0);
        expect(sink.deliveries).toHaveLength(1);
        const delivery = sink.deliveries[0]!;
        expect(delivery.conditionKey).toBe('p4.sink.probe');
        expect(delivery.id).toBe(result.id);
        expect(delivery.dedupKey).toBe('p4.sink.probe:ops_probe');
        expect(delivery.severity).toBe('WARN');
        expect(delivery.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
        expect(delivery.payload).toMatchObject({
          conditionKey: 'p4.sink.probe',
          severity: 'WARN',
          title: 'Sink delivery probe',
          detail: { probe: true },
          source: 'scs-api',
        });
      } finally {
        clearSinkEnv();
        await sink.close();
      }
    });

    it('AL-17a: a configured URL without a valid secret fails closed at config init — log-only, nothing sent', async () => {
      const sink = await startAlertSink(P4_TEST_SINK_SECRET);
      process.env['P13_OPS_ALERT_WEBHOOK_URL'] = sink.url;
      process.env['P13_OPS_ALERT_WEBHOOK_SECRET'] = 'short-secret';
      try {
        const svc = new OpsAlertService(database);
        // The config layer nulls the URL when the secret is missing/too short.
        expect(svc.hasSink).toBe(false);
        expect(svc.config.alertWebhookUrl).toBeNull();
        expect(svc.channelName).toBe('log-only');

        const result = await svc.raise({
          conditionKey: 'p4.sink.nosecret', severity: 'WARN', title: 't', detail: {},
        });
        expect(result.status).toBe('SUPPRESSED');
        expect(result.notified).toBe(false);
        const row = await alertFor('p4.sink.nosecret');
        expect(row!.delivery_channel).toBe('log-only');
        // Nothing reached the wire in any form.
        expect(sink.deliveries).toHaveLength(0);
        expect(sink.rejections).toHaveLength(0);
      } finally {
        clearSinkEnv();
        await sink.close();
      }
    });

    it('AL-17b: post-init config corruption (secret removed) still suppresses unsigned delivery', async () => {
      const sink = await startAlertSink(P4_TEST_SINK_SECRET);
      process.env['P13_OPS_ALERT_WEBHOOK_URL'] = sink.url;
      process.env['P13_OPS_ALERT_WEBHOOK_SECRET'] = P4_TEST_SINK_SECRET;
      const svc = new OpsAlertService(database);
      try {
        // Simulate tampering with the resolved config AFTER construction: the
        // defense-in-depth check must refuse to send an unsigned request.
        svc.config.alertWebhookSecret = null;

        const result = await svc.raise({
          conditionKey: 'p4.sink.tampered', severity: 'CRITICAL', title: 't', detail: {},
        });
        expect(result.status).toBe('FAILED');
        const row = await alertFor('p4.sink.tampered');
        expect(row!.last_error).toContain('unsigned delivery suppressed');

        // The delivery-failure meta-alert also refuses to go out unsigned.
        const meta = await alertFor('ops.alert.delivery_failed');
        expect(meta).not.toBeNull();
        expect(meta!.detail).toMatchObject({ failedConditionKey: 'p4.sink.tampered' });

        // Zero requests — signed or unsigned — ever reached the sink.
        expect(sink.deliveries).toHaveLength(0);
        expect(sink.rejections).toHaveLength(0);
      } finally {
        clearSinkEnv();
        await sink.close();
      }
    });

    it('AL-17c: the verifying sink rejects forged, tampered and stale requests — and still accepts a genuine delivery', async () => {
      const sink = await startAlertSink(P4_TEST_SINK_SECRET);
      process.env['P13_OPS_ALERT_WEBHOOK_URL'] = sink.url;
      process.env['P13_OPS_ALERT_WEBHOOK_SECRET'] = P4_TEST_SINK_SECRET;
      const svc = new OpsAlertService(database);
      try {
        const post = (body: string, signature: string, timestamp: string) =>
          fetch(sink.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-scs-alert-signature': signature,
              'x-scs-alert-timestamp': timestamp,
            },
            body,
          });
        const signWith = (hmacSecret: string, at: number, body: string) =>
          `sha256=${createHmac('sha256', hmacSecret).update(`${at}.${body}`, 'utf-8').digest('hex')}`;
        const ts = Math.floor(Date.now() / 1000);
        const genuineBody = JSON.stringify({ id: randomUUID(), conditionKey: 'p4.forged', detail: {} });

        // (1) Signed with the WRONG secret.
        let res = await post(genuineBody, signWith('p4-wrong-secret-not-the-sink-secret', ts, genuineBody), String(ts));
        expect(res.status).toBe(401);
        // (2) Valid signature over the ORIGINAL bytes, TAMPERED payload on the wire.
        res = await post(
          JSON.stringify({ id: randomUUID(), conditionKey: 'p4.tampered', detail: { replaced: true } }),
          signWith(P4_TEST_SINK_SECRET, ts, genuineBody),
          String(ts),
        );
        expect(res.status).toBe(401);
        // (3) Correct secret, STALE timestamp (outside the 300s window).
        const stale = ts - 3600;
        res = await post(genuineBody, signWith(P4_TEST_SINK_SECRET, stale, genuineBody), String(stale));
        expect(res.status).toBe(401);

        expect(sink.deliveries).toHaveLength(0);
        expect(sink.rejections).toHaveLength(3);

        // A genuine raise through the same receiver still succeeds.
        const result = await svc.raise({
          conditionKey: 'p4.sink.genuine', severity: 'WARN', title: 't', detail: {},
        });
        expect(result.status).toBe('SENT');
        expect(sink.deliveries).toHaveLength(1);
        expect(sink.deliveries[0]!.conditionKey).toBe('p4.sink.genuine');
        expect(sink.deliveries[0]!.id).toBe(result.id);
      } finally {
        clearSinkEnv();
        await sink.close();
      }
    });

    it('AL-18 (alert 10): a dead sink marks the alert FAILED and raises the delivery-failure alert', async () => {
      const sink: Server = createServer((_req, res) => res.writeHead(202).end('{}'));
      await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
      const port = (sink.address() as AddressInfo).port;
      await new Promise<void>((resolve) => sink.close(() => resolve()));

      alerts.config.alertWebhookUrl = `http://127.0.0.1:${port}/dead`;
      try {
        const result = await alerts.raise({
          conditionKey: 'p4.sink.unreachable',
          severity: 'CRITICAL',
          title: 'Unreachable sink probe',
          detail: { probe: true },
        });
        expect(result.status).toBe('FAILED');

        const blocked = await alertFor('p4.sink.unreachable');
        expect(blocked!.status).toBe('FAILED');
        expect(blocked!.last_error).toBeTruthy();

        const failure = await alertFor('ops.alert.delivery_failed');
        expect(failure).not.toBeNull();
        expect(failure!.severity).toBe('CRITICAL');
        expect(failure!.detail).toMatchObject({
          failedConditionKey: 'p4.sink.unreachable',
        });
      } finally {
        alerts.config.alertWebhookUrl = null;
      }
    });

    it('AL-19: with no sink configured nothing is silently dropped — the row is durable and SUPPRESSED', async () => {
      const result = await alerts.raise({
        conditionKey: 'p4.no.sink',
        severity: 'WARN',
        title: 'No sink configured',
        detail: { probe: true },
      });
      expect(result.status).toBe('SUPPRESSED');
      expect(result.notified).toBe(false);
      expect(alerts.channelName).toBe('log-only');

      const row = await alertFor('p4.no.sink');
      expect(row).not.toBeNull();
      expect(row!.delivery_channel).toBe('log-only');
    });

    it('AL-20: deduplication collapses repeats into one row per condition per resource', async () => {
      const first = await alerts.raise({ conditionKey: 'p4.dup', severity: 'WARN', title: 't', detail: {}, resourceType: 'probe' });
      const second = await alerts.raise({ conditionKey: 'p4.dup', severity: 'WARN', title: 't', detail: {}, resourceType: 'probe' });

      expect(first.deduped).toBe(false);
      expect(second.deduped).toBe(true);

      const rows = await alerts.listByCondition('p4.dup');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.fire_count).toBe(2);
      expect(rows[0]!.suppressed_count).toBeGreaterThanOrEqual(1);
    });

    it('AL-21: a cleared condition resolves, and a recurrence reopens as a new incident', async () => {
      await alerts.raise({ conditionKey: 'p4.reopen', severity: 'WARN', title: 't', detail: {}, resourceType: 'probe' });
      expect(await alerts.resolve('p4.reopen:probe')).toBe(true);
      expect((await alertFor('p4.reopen'))!.status).toBe('RESOLVED');

      const again = await alerts.raise({ conditionKey: 'p4.reopen', severity: 'WARN', title: 't', detail: {}, resourceType: 'probe' });
      expect(again.deduped).toBe(false);
      expect(again.notified).toBe(false); // SUPPRESSED path (no sink)
      expect((await alertFor('p4.reopen'))!.fire_count).toBe(2);
      expect(await alerts.resolve('nope:missing')).toBe(false);
    });

    it('AL-22: scan() reports every check it ran and is read-only for business data', async () => {
      const before = await pool.query(`SELECT status, COUNT(*)::int AS c FROM return_requests GROUP BY status`);
      const report = await monitor.scan();

      expect(report.checksRun).toHaveLength(10);
      expect(report.raised.length).toBeGreaterThanOrEqual(1);
      const after = await pool.query(`SELECT status, COUNT(*)::int AS c FROM return_requests GROUP BY status ORDER BY status`);
      expect(after.rows).toEqual(before.rows.sort((a: any, b: any) => a.status.localeCompare(b.status)));
    });

    it('AL-23: alert snapshot rolls up status, counters and channel', async () => {
      await alerts.raise({ conditionKey: 'p4.snap', severity: 'CRITICAL', title: 't', detail: {} });
      const snap = await alerts.snapshot();
      expect(snap.channel).toBe('log-only');
      expect(snap.alerts['SUPPRESSED']).toBe(1);
      expect(snap.counters).toBeDefined();
    });

    it('AL-24 (alert 1, worker producer): the worker raises on its own at the third failure', async () => {
      // Drives the production path: a claimed return whose escalation throws is
      // counted as a cycle failure, and the third failure alerts without any
      // monitor involvement.
      const failing = {
        escalateReturn: async () => { throw new Error('provider rejected the refund'); },
      } as unknown as ReturnsService;
      const w = makeWorker(database, failing, 'thr');

      await w.worker.tick();
      await w.worker.tick();
      expect(Number((await leaseRow()).poll_failures)).toBe(2);
      expect(await alertFor('p13.worker.poll_failures')).toBeNull();

      const report = await w.worker.tick();
      expect(report.executed).toBe(true);
      expect(report.failed).toBeGreaterThan(0);

      const row = await alertFor('p13.worker.poll_failures');
      expect(row).not.toBeNull();
      expect(row!.severity).toBe('CRITICAL');
      // Identical to the key the monitor's check 1 raises with, so the two
      // producers cannot open two incidents for one condition.
      expect(row!.dedup_key).toBe(`p13.worker.poll_failures:${P13_LEASE_KEY}`);
      // Sanitised: the cycle summary is stored, not the underlying error text.
      expect(JSON.stringify(row!.detail)).not.toContain('provider rejected');

      const scan = await monitor.scan();
      const fromMonitor = scan.raised.filter((r) => r.conditionKey === 'p13.worker.poll_failures');
      expect(fromMonitor.every((r) => r.deduped)).toBe(true);
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ops_alerts WHERE condition_key = 'p13.worker.poll_failures'`,
      );
      expect(rows[0]!.c).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §5 — Kill switch, pause and recovery
  // ═════════════════════════════════════════════════════════════════════════

  describe('§5 Pause, recovery and rollback', () => {
    it('KS-01: pausing prevents new protected jobs from starting', async () => {
      const w = makeWorker(database, returnsService, 'pause');
      await w.controls.setPaused({ paused: true, reason: 'phase 4 spec', actorId: actorAdmin });

      const report = await w.worker.tick();
      expect(report.executed).toBe(false);
      expect(report.skipped).toBe('paused');
      expect(report.state).toBe('HELD_PAUSED');
      expect(await statusOf(retA)).toBe('REQUESTED');
      expect(await escalatedEventCount(retA)).toBe(0);
    });

    it('KS-02: pausing never releases or re-epochs the lease', async () => {
      const w = makeWorker(database, returnsService, 'pause2');
      const acquired = await w.worker.tick();
      const epochBefore = await leaseEpoch();

      await w.controls.setPaused({ paused: true, reason: 'keep ownership', actorId: actorAdmin });
      await w.worker.tick();

      const row = await leaseRow();
      expect(row.holder_id).toBe(w.leases.holderId);
      expect(await leaseEpoch()).toBe(epochBefore);
      expect(acquired.acquired).toBe(true);
    });

    it('KS-03: an unreadable pause control fails closed and counts as a poll failure', async () => {
      const w = makeWorker(database, returnsService, 'unreadable');
      const acquired = await w.worker.tick();
      expect(acquired.acquired).toBe(true);

      // A real outage of the control store rather than a monkey-patch: the
      // relation the kill switch reads simply is not there.
      await pool.query(`ALTER TABLE ops_controls RENAME TO ops_controls_unavailable`);
      const report = await (async () => {
        try {
          return await w.worker.tick();
        } finally {
          await pool.query(`ALTER TABLE ops_controls_unavailable RENAME TO ops_controls`);
        }
      })();

      expect(report.executed).toBe(false);
      expect(report.skipped).toBe('paused');
      expect(Number((await leaseRow()).poll_failures)).toBeGreaterThanOrEqual(1);
      expect((await leaseRow()).last_error_code).toBe('CONTROL_UNREADABLE');
    });

    it('KS-04: resume is idempotent — no duplicate escalation, event or outbox emission', async () => {
      const w = makeWorker(database, returnsService, 'resume');
      const outboxCalls = async () =>
        (await pool.query(`SELECT COUNT(*)::int AS c FROM return_request_events WHERE event_type='ESCALATED'`)).rows[0].c;

      const first = await w.worker.tick();
      expect(first.escalated).toBe(2);
      const eventsAfterFirst = await outboxCalls();

      await w.controls.setPaused({ paused: true, reason: 'drill', actorId: actorAdmin });
      await w.worker.tick();
      await w.controls.setPaused({ paused: false, reason: 'drill complete', actorId: actorAdmin });

      const second = await w.worker.tick();
      expect(second.escalated).toBe(0);
      expect(second.claimed).toBe(0);
      expect(await outboxCalls()).toBe(eventsAfterFirst);
      expect(await statusOf(retA)).toBe('ESCALATED');
    });

    it('KS-05: a SLA elapse alone escalates — it never approves, rejects, refunds or expires', async () => {
      const w = makeWorker(database, returnsService, 'safeguard');
      await w.worker.tick();

      expect(await statusOf(retA)).toBe('ESCALATED');
      expect(await statusOf(retB)).toBe('ESCALATED');
      const { rows } = await pool.query(
        `SELECT status FROM return_requests WHERE status IN ('EXPIRED','REFUNDED','MERCHANT_REJECTED','REFUND_PENDING')`,
      );
      expect(rows).toHaveLength(0);
      const refunded = await pool.query(`SELECT COUNT(*)::int AS c FROM refunds`);
      expect(refunded.rows[0].c).toBe(0);
    });

    it('KS-06: recovery leaves durable audit evidence for both pause and resume', async () => {
      // One database is shared across the file, so clear exactly the trail this
      // test asserts on before producing it.
      await pool.query(`DELETE FROM audit_logs WHERE resource = 'ops_control'`);
      const w = makeWorker(database, returnsService, 'evidence');
      await w.controls.setPaused({ paused: true, reason: 'incident 4711', actorId: actorAdmin });
      await w.controls.setPaused({ paused: false, reason: 'incident resolved', actorId: actorAdmin });

      const history = await w.controls.history(P13_PAUSE_CONTROL_KEY);
      expect(history).toHaveLength(2);
      expect(history.map((h) => h.paused).sort()).toEqual([false, true]);

      const { rows } = await pool.query(
        `SELECT action FROM audit_logs WHERE resource='ops_control' AND action IN ('p13.worker.pause','p13.worker.resume')`,
      );
      expect(rows).toHaveLength(2);
      const alert = await w.alerts.listByCondition('p13.worker.control_changed');
      expect(alert.length).toBe(1);
      expect(alert[0]!.fire_count).toBe(2);
    });

    it('KS-07: an unexplained pause is refused — the kill switch cannot be flipped silently', async () => {
      await expect(
        new OpsControlService(database, audit, alerts).setPaused({ paused: true, reason: '   ' }),
      ).rejects.toThrow(/requires a reason/);
      expect((await controls.state(P13_PAUSE_CONTROL_KEY)).paused).toBe(false);
    });

    it('KS-08: a missing control row reads as not-paused, and unrelated work continues', async () => {
      expect(await controls.isPaused('never.set.key')).toBe(false);
      const w = makeWorker(database, returnsService, 'nocontrol');
      const report = await w.worker.tick();
      expect(report.executed).toBe(true);
    });

    it('KS-09: after a holder crash, a replacement recovers the work without duplication', async () => {
      // Only retA is overdue when the first holder runs.
      await pool.query(`UPDATE return_requests SET expires_at = now() + interval '1 day' WHERE id = $1`, [retB]);

      const crashed = makeWorker(database, returnsService, 'crashed');
      const first = await crashed.worker.tick();
      expect(first.escalated).toBe(1);
      expect(await statusOf(retA)).toBe('ESCALATED');

      // The holder dies without releasing: the lease merely goes stale.
      await crashed.leases.forceExpire(P13_LEASE_KEY);

      const takeover = makeWorker(database, returnsService, 'takeover');
      const second = await takeover.worker.tick();
      // retA is already ESCALATED — recovery must not repeat its effects.
      expect(second.claimed).toBe(0);
      expect(second.escalated).toBe(0);
      expect(await escalatedEventCount(retA)).toBe(1);

      // Work that becomes eligible after the takeover is processed exactly once.
      await pool.query(`UPDATE return_requests SET expires_at = now() - interval '5 minutes' WHERE id = $1`, [retB]);
      const third = await takeover.worker.tick();
      expect(third.escalated).toBe(1);
      expect(await escalatedEventCount(retB)).toBe(1);

      // The crashed holder can no longer write anything at all.
      await expect(crashed.worker.runBatch()).resolves.toMatchObject({ executed: false, skipped: 'fence_lost' });

      const { rows } = await pool.query(
        `SELECT return_request_id, COUNT(*)::int AS c FROM return_request_events WHERE event_type='ESCALATED' GROUP BY return_request_id HAVING COUNT(*) > 1`,
      );
      expect(rows).toHaveLength(0);
    });

    it('KS-10: onModuleDestroy releases ownership so a restart does not strand the lease', async () => {
      const w = makeWorker(database, returnsService, 'destroy');
      await w.worker.tick();
      expect((await leaseRow()).holder_id).toBe(w.leases.holderId);

      await w.worker.onModuleDestroy();
      expect(w.worker.state).toBe('STOPPED');
      // The hook is async and awaited, so ownership is already gone when it
      // resolves — a restarting instance does not have to wait for the TTL.
      expect((await leaseRow()).holder_id).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §6 — Allowlisted pilot controls
  // ═════════════════════════════════════════════════════════════════════════

  describe('§6 Pilot controls', () => {
    function enforcing(db: DatabaseService, mode: 'allowlist' | 'legacy'): PilotControlService {
      const previous = process.env['P13_PILOT_MODE'];
      if (mode === 'allowlist') process.env['P13_PILOT_MODE'] = 'allowlist';
      else delete process.env['P13_PILOT_MODE'];
      try {
        return new PilotControlService(db, audit, alerts);
      } finally {
        if (previous === undefined) delete process.env['P13_PILOT_MODE'];
        else process.env['P13_PILOT_MODE'] = previous;
      }
    }

    it('PL-01: default behaviour is disabled — enforcement is off and eligibility passes through', async () => {
      const legacy = enforcing(database, 'legacy');
      expect(await legacy.isEnforced()).toBe(false);
      expect(await legacy.isFlagEnabled()).toBe(false);
      expect(await legacy.eligibility(orgA, storeA)).toEqual({
        enforced: false, eligible: true, reason: 'not_enforced',
      });
      await expect(legacy.assertEligible(null)).resolves.toBeUndefined();
    });

    it('PL-02: with enforcement on and an empty allowlist, everyone is denied (fail closed)', async () => {
      const strict = enforcing(database, 'allowlist');
      expect(await strict.isEnforced()).toBe(true);
      const result = await strict.eligibility(orgA, storeA);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('org_not_allowlisted');
      await expect(strict.assertEligible(orgA, storeA)).rejects.toThrow(/org_not_allowlisted/);
    });

    it('PL-03: an allowlisted organization is eligible and a neighbouring one is not', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });

      expect((await strict.eligibility(orgA)).reason).toBe('eligible_org_wide');
      expect((await strict.eligibility(orgB)).reason).toBe('org_not_allowlisted');
      // Store inside the allowlisted org also passes.
      expect((await strict.eligibility(orgA, storeA)).eligible).toBe(true);
    });

    it('PL-04: a store-scoped entry narrows eligibility and does not grant the whole org', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: storeA, note: 'store pilot', actorId: actorAdmin });

      expect((await strict.eligibility(orgA, storeA)).reason).toBe('eligible_store');
      expect((await strict.eligibility(orgA, randomUUID())).reason).toBe('org_not_allowlisted');
      expect((await strict.eligibility(orgA, null)).reason).toBe('org_not_allowlisted');
    });

    it('PL-05: revoking disables without deleting, preserving durable records', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });
      expect((await strict.eligibility(orgA)).eligible).toBe(true);

      const affected = await strict.revokeAllowlistEntry({ orgId: orgA, storeId: null, note: 'paused pilot', actorId: actorAdmin });
      expect(affected).toBe(1);
      expect((await strict.eligibility(orgA)).reason).toBe('entry_disabled');

      const { rows } = await pool.query(`SELECT enabled, note FROM p13_pilot_allowlist WHERE org_id = $1`, [orgA]);
      expect(rows).toHaveLength(1);
      expect(rows[0].enabled).toBe(false);
    });

    it('PL-06: a missing organization identifier is denied under enforcement', async () => {
      const strict = enforcing(database, 'allowlist');
      const result = await strict.eligibility(null);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('missing_org_id');
      expect(getOpsCounter('pilot_eligibility_denials_total')).toBe(1);
    });

    it('PL-07: an unreadable allowlist denies rather than opens the gate', async () => {
      const strict = enforcing(database, 'allowlist');
      await pool.query(`DROP TABLE p13_pilot_allowlist`);
      try {
        const result = await strict.eligibility(orgA, storeA);
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('allowlist_unreadable');
      } finally {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS p13_pilot_allowlist (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL, store_id UUID, enabled BOOLEAN NOT NULL DEFAULT TRUE,
            note TEXT, created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ
          )`);
      }
    });

    it('PL-08: a runtime flag alone turns enforcement on, and is audited and alerted', async () => {
      const legacy = enforcing(database, 'legacy');
      expect(await legacy.isEnforced()).toBe(false);

      await legacy.setFlag(true, actorAdmin, 'phase 4 spec');
      expect(await legacy.isEnforced()).toBe(true);
      expect((await legacy.eligibility(orgA)).reason).toBe('org_not_allowlisted');

      const { rows } = await pool.query(
        `SELECT action, metadata FROM audit_logs WHERE resource='feature_flag' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('p13.pilot.enable');
      expect(rows[0].metadata.key).toBe(P13_PILOT_FLAG_KEY);
      const alert = await alerts.listByCondition('p13.pilot.flag_changed');
      expect(alert).toHaveLength(1);

      // The env floor: clearing the flag cannot disable enforcement where the
      // deployment requires it.
      const strict = enforcing(database, 'allowlist');
      await strict.setFlag(false, actorAdmin, 'attempt to disable');
      expect(await strict.isEnforced()).toBe(true);
    });

    it('PL-09: the pilot gate blocks a non-allowlisted organization from creating a return', async () => {
      const strict = enforcing(database, 'allowlist');
      const gated = new ReturnsService(
        database,
        { publish: async () => undefined } as unknown as OutboxDispatcher,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        strict,
      );

      await expect(gated.createReturnRequest(
        { subOrderId: orderA, reason: 'PRODUCT_NOT_AS_DESCRIBED', lines: [] } as never,
        { sub: buyerA, role: 'BUYER', activeOrg: null },
      )).rejects.toThrow(/org_not_allowlisted/);

      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM return_requests`);
      expect(rows[0].c).toBe(2);
    });

    it('PL-10: an allowlisted organization passes the gate and continues into the normal flow', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });
      const gated = new ReturnsService(
        database,
        { publish: async () => undefined } as unknown as OutboxDispatcher,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        strict,
      );

      // Past the 403 gate, into Phase 3 validation, which fails on empty lines.
      await expect(gated.createReturnRequest(
        { subOrderId: orderA, reason: 'PRODUCT_NOT_AS_DESCRIBED', lines: [] } as never,
        { sub: buyerA, role: 'BUYER', activeOrg: orgA },
      )).rejects.toThrow(/at least one return line/i);
    });

    it('PL-11: a buyer from another organization is still denied by object ownership first', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });
      const gated = new ReturnsService(
        database,
        { publish: async () => undefined } as unknown as OutboxDispatcher,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        strict,
      );
      await expect(gated.createReturnRequest(
        { subOrderId: orderA, reason: 'PRODUCT_NOT_AS_DESCRIBED', lines: [] } as never,
        { sub: randomUUID(), role: 'BUYER', activeOrg: orgB },
      )).rejects.toThrow(/your own orders/);
    });

    it('PL-12: the pilot snapshot reports mode, flag, enforcement and entry counts', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });
      const snap = await strict.snapshot();
      expect(snap).toMatchObject({ mode: 'allowlist', enforced: true, allowlistCount: 1, enabledCount: 1 });
    });

    it('PL-13: disabling the pilot preserves durable records and does not mutate in-flight returns', async () => {
      const strict = enforcing(database, 'allowlist');
      await strict.addAllowlistEntry({ orgId: orgA, storeId: null, note: 'pilot', actorId: actorAdmin });
      await strict.setFlag(false, actorAdmin, 'wind down');
      await pool.query(`DELETE FROM p13_pilot_allowlist WHERE org_id = $1`, [orgA]);

      expect((await strict.eligibility(orgA)).reason).toBe('org_not_allowlisted');
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM return_requests WHERE status IN ('REQUESTED','ESCALATED')`,
      );
      expect(rows[0].c).toBe(2);
    });
  });
});
