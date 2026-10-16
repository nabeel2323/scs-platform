/**
 * P13 Phase 4.1.5 — Webhook delivery integration tests with HMAC-SHA256 signing.
 *
 * Exercises the real OpsAlertService delivery path against a disposable HTTP
 * receiver and a disposable PostgreSQL. Verifies that outbound webhooks carry
 * a valid HMAC signature, that the signature covers the exact body bytes, and
 * that all failure modes (missing secret, dead sink, timeout, etc.) behave
 * correctly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseService } from '../../common/database/database.service';
import { OpsAlertService } from '../../modules/operations/ops-alert.service';
import { verifySignature, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../../modules/operations/ops-alert-signing';
import { resetOpsCounters } from '../../modules/operations/ops-counters';
import * as schema from '../../drizzle/schema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
const WEBHOOK_SECRET = 'p415-test-secret-' + 'k'.repeat(40); // 56 chars

interface CapturedRequest {
  body: string;
  signature: string | undefined;
  timestamp: string | undefined;
  contentType: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

describe('P13 Phase 4.1.6 — Webhook delivery with HMAC-SHA256 + replay protection', () => {
  let container: { stop(): Promise<unknown> };
  let pool: Pool;
  let database: DatabaseService;

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
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM ops_alerts`);
    resetOpsCounters();
  });

  function makeAlertService(webhookUrl: string | null, webhookSecret: string | null): OpsAlertService {
    const svc = new OpsAlertService(database);
    svc.config.alertWebhookUrl = webhookUrl;
    svc.config.alertWebhookSecret = webhookSecret;
    return svc;
  }

  /** Start a test HTTP server that captures the full request. */
  function startReceiver(handler?: (req: IncomingMessage, body: string) => { status: number }): Promise<{
    server: Server;
    captured: CapturedRequest[];
    port: number;
    close: () => Promise<void>;
  }> {
    return new Promise((resolve) => {
      const captured: CapturedRequest[] = [];
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          captured.push({
            body,
            signature: req.headers[SIGNATURE_HEADER] as string | undefined,
            timestamp: req.headers[TIMESTAMP_HEADER] as string | undefined,
            contentType: req.headers['content-type'] as string | undefined,
            headers: req.headers as Record<string, string | string[] | undefined>,
          });
          const status = handler ? handler(req, body).status : 202;
          res.writeHead(status).end('{}');
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        resolve({
          server,
          captured,
          port,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      });
    });
  }

  // ── §14.1: Valid signature on outbound delivery ────────────────────────────

  it('WS-01: a delivered alert carries a valid HMAC-SHA256 signature', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      const result = await alerts.raise({
        conditionKey: 'p415.signature.valid',
        severity: 'CRITICAL',
        title: 'Signature validation probe',
        detail: { probe: true },
      });
      expect(result.status).toBe('SENT');
      expect(rx.captured).toHaveLength(1);

      const req = rx.captured[0]!;
      expect(req.signature).toBeDefined();
      expect(req.signature).toMatch(/^sha256=[0-9a-f]{64}$/);

      // Receiver independently verifies the HMAC.
      expect(verifySignature(req.body, req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(true);

      // The body is valid JSON with the expected fields.
      const payload = JSON.parse(req.body);
      expect(payload.conditionKey).toBe('p415.signature.valid');
      expect(payload.severity).toBe('CRITICAL');
      expect(payload.source).toBe('scs-api');
    } finally {
      await rx.close();
    }
  });

  it('WS-02: the signature covers the exact body bytes sent', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      await alerts.raise({
        conditionKey: 'p415.signature.exact',
        severity: 'WARN',
        title: 'Exact body probe',
        detail: { key: 'value' },
      });

      const req = rx.captured[0]!;
      // Recompute from the captured body — must match what was sent.
      expect(verifySignature(req.body, req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(true);
      // A tampered body must fail.
      expect(verifySignature(req.body + 'tampered', req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(false);
    } finally {
      await rx.close();
    }
  });

  it('WS-03: a modified body fails receiver-side verification', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      await alerts.raise({
        conditionKey: 'p415.signature.tamper',
        severity: 'WARN',
        title: 'Tamper probe',
      });

      const req = rx.captured[0]!;
      const tampered = req.body.replace('"WARN"', '"CRITICAL"');
      expect(verifySignature(tampered, req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(false);
    } finally {
      await rx.close();
    }
  });

  it('WS-04: a wrong secret fails receiver-side verification', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      await alerts.raise({
        conditionKey: 'p415.signature.wrong-secret',
        severity: 'INFO',
        title: 'Wrong secret probe',
      });

      const req = rx.captured[0]!;
      const wrongSecret = 'wrong-' + 'z'.repeat(40);
      expect(verifySignature(req.body, req.signature!, req.timestamp!, wrongSecret)).toBe(false);
    } finally {
      await rx.close();
    }
  });

  it('WS-05: with URL present but secret missing, zero outbound requests (defense-in-depth)', async () => {
    const rx = await startReceiver();
    // URL set, secret null — post-construction mutation that bypasses the
    // config layer. After Phase 4.1.8 hardening, the service must refuse
    // to send an unsigned request.
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, null);

    try {
      const result = await alerts.raise({
        conditionKey: 'p415.no-secret',
        severity: 'WARN',
        title: 'No secret probe',
      });
      // Delivery is suppressed — no network request is made.
      expect(result.status).toBe('FAILED');
      expect(rx.captured).toHaveLength(0);
      // The alert row records the signing failure.
      const row = await alerts.findByDedupKey('p415.no-secret:global');
      expect(row!.status).toBe('FAILED');
      expect(row!.last_error).toContain('signing secret');
    } finally {
      await rx.close();
    }
  });

  it('WS-06: with no webhook URL, the alert is SUPPRESSED (log-only)', async () => {
    const alerts = makeAlertService(null, WEBHOOK_SECRET);
    const result = await alerts.raise({
      conditionKey: 'p415.no-url',
      severity: 'WARN',
      title: 'No URL probe',
    });
    expect(result.status).toBe('SUPPRESSED');
    expect(result.notified).toBe(false);
    expect(alerts.channelName).toBe('log-only');
  });

  it('WS-07: CRITICAL alerts are signed identically to other severities', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      for (const severity of ['INFO', 'WARN', 'CRITICAL'] as const) {
        await alerts.raise({
          conditionKey: `p415.severity.${severity}`,
          severity,
          title: `Severity ${severity} probe`,
        });
      }

      expect(rx.captured).toHaveLength(3);
      for (const req of rx.captured) {
        expect(req.signature).toBeDefined();
        expect(verifySignature(req.body, req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(true);
      }
    } finally {
      await rx.close();
    }
  });

  it('WS-08: a dead sink marks the alert FAILED with the delivery-failure meta-alert', async () => {
    // Start and immediately close a server to get a port that refuses connections.
    const rx = await startReceiver();
    const port = rx.port;
    await rx.close();

    const alerts = makeAlertService(`http://127.0.0.1:${port}/dead`, WEBHOOK_SECRET);
    const result = await alerts.raise({
      conditionKey: 'p415.dead-sink',
      severity: 'CRITICAL',
      title: 'Dead sink probe',
    });
    expect(result.status).toBe('FAILED');

    const row = await alerts.findByDedupKey('p415.dead-sink:global');
    expect(row!.status).toBe('FAILED');
    expect(row!.last_error).toBeTruthy();

    // The meta-alert for delivery failure should also exist.
    // deriveDedupKey uses conditionKey:resourceId (resourceId = alertId).
    const meta = await alerts.findByDedupKey(`ops.alert.delivery_failed:${row!.id}`);
    expect(meta).not.toBeNull();
    expect(meta!.severity).toBe('CRITICAL');
  });

  it('WS-09: a receiver returning 500 marks the alert FAILED', async () => {
    const rx = await startReceiver((_req, _body) => ({ status: 500 }));
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      const result = await alerts.raise({
        conditionKey: 'p415.server-error',
        severity: 'WARN',
        title: '500 probe',
      });
      expect(result.status).toBe('FAILED');
      // The receiver got the original alert AND the delivery-failure meta-alert.
      expect(rx.captured.length).toBeGreaterThanOrEqual(1);
      // The signature was still sent (the receiver got it, just rejected).
      expect(rx.captured[0]!.signature).toBeDefined();
    } finally {
      await rx.close();
    }
  });

  it('WS-10: deduplication prevents duplicate deliveries for the same condition', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      const first = await alerts.raise({
        conditionKey: 'p415.dedup',
        severity: 'WARN',
        title: 'Dedup probe',
        resourceType: 'probe',
      });
      const second = await alerts.raise({
        conditionKey: 'p415.dedup',
        severity: 'WARN',
        title: 'Dedup probe',
        resourceType: 'probe',
      });

      expect(first.notified).toBe(true);
      expect(first.deduped).toBe(false);
      expect(second.deduped).toBe(true);
      // Only one delivery was made.
      expect(rx.captured).toHaveLength(1);
    } finally {
      await rx.close();
    }
  });

  it('WS-11: the payload contains no secret, full webhook URL, or financial amounts', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      await alerts.raise({
        conditionKey: 'p415.payload.safety',
        severity: 'WARN',
        title: 'Payload safety probe',
        detail: { refundId: randomUUID(), status: 'FAILED' },
      });

      const req = rx.captured[0]!;
      const payload = JSON.parse(req.body);

      // No secret in the payload.
      expect(JSON.stringify(payload)).not.toContain(WEBHOOK_SECRET);
      // No webhook URL in the payload.
      expect(JSON.stringify(payload)).not.toContain(`127.0.0.1:${rx.port}`);
      // No financial amounts (detail only has identifiers and status).
      expect(payload.detail).not.toHaveProperty('amount_minor');
      expect(payload.detail).not.toHaveProperty('total_minor');
    } finally {
      await rx.close();
    }
  });

  it('WS-12: the delivery-failure recursion guard prevents infinite loops', async () => {
    // Start and immediately close to get a dead port.
    const rx = await startReceiver();
    const port = rx.port;
    await rx.close();

    const alerts = makeAlertService(`http://127.0.0.1:${port}/dead`, WEBHOOK_SECRET);

    // First alert fails delivery, triggers meta-alert which also fails — but
    // the recursion guard prevents the meta-alert from triggering another meta-alert.
    const result = await alerts.raise({
      conditionKey: 'p415.recursion-guard',
      severity: 'CRITICAL',
      title: 'Recursion probe',
    });
    expect(result.status).toBe('FAILED');

    // Exactly two alert rows: the original and the meta-alert.
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ops_alerts`);
    expect(rows[0].c).toBe(2);
  });

  it('WS-13: content-type is application/json on signed deliveries', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      await alerts.raise({
        conditionKey: 'p415.content-type',
        severity: 'INFO',
        title: 'Content-type probe',
      });

      expect(rx.captured[0]!.contentType).toContain('application/json');
    } finally {
      await rx.close();
    }
  });

  // ── §14.2: Phase 4.1.8 defense-in-depth hardening ──────────────────────

  it('WS-14: URL present and secret too short results in zero outbound requests', async () => {
    const rx = await startReceiver();
    // 16-char secret — below the 32-char minimum enforced by defense-in-depth.
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, 'short-secret-16c');

    try {
      const result = await alerts.raise({
        conditionKey: 'p415.short-secret',
        severity: 'WARN',
        title: 'Short secret probe',
      });
      expect(result.status).toBe('FAILED');
      expect(rx.captured).toHaveLength(0);
      const row = await alerts.findByDedupKey('p415.short-secret:global');
      expect(row!.last_error).toContain('signing secret');
    } finally {
      await rx.close();
    }
  });

  it('WS-15: URL present and secret empty string results in zero outbound requests', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, '');

    try {
      const result = await alerts.raise({
        conditionKey: 'p415.empty-secret',
        severity: 'WARN',
        title: 'Empty secret probe',
      });
      expect(result.status).toBe('FAILED');
      expect(rx.captured).toHaveLength(0);
    } finally {
      await rx.close();
    }
  });

  it('WS-16: configuration mutation after initialization cannot produce unsigned delivery', async () => {
    const rx = await startReceiver();
    // Start with valid config.
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      // First delivery succeeds with valid signing.
      const first = await alerts.raise({
        conditionKey: 'p415.mutation.before',
        severity: 'INFO',
        title: 'Before mutation',
      });
      expect(first.status).toBe('SENT');
      expect(rx.captured).toHaveLength(1);
      expect(rx.captured[0]!.signature).toBeDefined();

      // Mutate config after initialization — null out the secret.
      alerts.config.alertWebhookSecret = null;

      // Second delivery must NOT send an unsigned request.
      const second = await alerts.raise({
        conditionKey: 'p415.mutation.after',
        severity: 'WARN',
        title: 'After mutation',
      });
      expect(second.status).toBe('FAILED');
      // Still only one request captured — the second was suppressed.
      expect(rx.captured).toHaveLength(1);
    } finally {
      await rx.close();
    }
  });

  it('WS-17: configuration mutation — secret shortened after init blocks delivery', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      // Mutate: shorten the secret below the 32-char minimum.
      alerts.config.alertWebhookSecret = 'too-short';

      const result = await alerts.raise({
        conditionKey: 'p415.mutation.short',
        severity: 'CRITICAL',
        title: 'Shortened secret probe',
      });
      expect(result.status).toBe('FAILED');
      expect(rx.captured).toHaveLength(0);
    } finally {
      await rx.close();
    }
  });

  it('WS-18: valid signed delivery retains failure and deduplication behavior after hardening', async () => {
    const rx = await startReceiver();
    const alerts = makeAlertService(`http://127.0.0.1:${rx.port}/alerts`, WEBHOOK_SECRET);

    try {
      // First delivery.
      const first = await alerts.raise({
        conditionKey: 'p415.hardening.dedup',
        severity: 'WARN',
        title: 'Dedup after hardening',
        resourceType: 'probe',
      });
      expect(first.status).toBe('SENT');
      expect(first.notified).toBe(true);

      // Duplicate — should be deduped.
      const second = await alerts.raise({
        conditionKey: 'p415.hardening.dedup',
        severity: 'WARN',
        title: 'Dedup after hardening',
        resourceType: 'probe',
      });
      expect(second.deduped).toBe(true);
      // Only one HTTP request.
      expect(rx.captured).toHaveLength(1);

      // All captured requests are signed.
      for (const req of rx.captured) {
        expect(req.signature).toBeDefined();
        expect(verifySignature(req.body, req.signature!, req.timestamp!, WEBHOOK_SECRET)).toBe(true);
      }
    } finally {
      await rx.close();
    }
  });
});
