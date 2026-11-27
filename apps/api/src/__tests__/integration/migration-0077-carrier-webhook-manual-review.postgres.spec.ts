/**
 * Migration 0077 quarantines legacy carrier webhook links without reopening
 * previously processed events or touching events with credential ownership.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../../../infra/drizzle/migrations/0077_carrier_webhook_legacy_manual_review.sql'),
  'utf8',
);

describe('Migration 0077 — legacy carrier webhook manual review', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
      CREATE TABLE carrier_webhook_events (
        id UUID PRIMARY KEY,
        credential_id UUID,
        shipment_id UUID,
        processing_error TEXT,
        processed BOOLEAN NOT NULL DEFAULT false,
        processed_at TIMESTAMPTZ
      )
    `);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('detaches uncredentialed links while preserving processed state and credential-bound rows', async () => {
    const pendingLegacy = randomUUID();
    const processedLegacy = randomUUID();
    const credentialBound = randomUUID();
    const unlinkedLegacy = randomUUID();
    const longErrorLegacy = randomUUID();
    const longError = 'x'.repeat(1900);
    const shipment = randomUUID();
    const credential = randomUUID();
    const processedAt = new Date('2026-11-20T12:00:00.000Z');

    await pool.query(
      `INSERT INTO carrier_webhook_events
       (id, credential_id, shipment_id, processing_error, processed, processed_at)
       VALUES
       ($1, NULL, $5, NULL, false, NULL),
       ($2, NULL, $5, NULL, true, $6),
       ($3, $7, $5, NULL, false, NULL),
       ($4, NULL, NULL, NULL, false, NULL),
       ($8, NULL, $5, $9, false, NULL)`,
      [pendingLegacy, processedLegacy, credentialBound, unlinkedLegacy, shipment, processedAt, credential, longErrorLegacy, longError],
    );

    await pool.query(MIGRATION);

    const rows = await pool.query(
      'SELECT id, credential_id, shipment_id, processing_error, processed, processed_at FROM carrier_webhook_events ORDER BY id',
    );
    const byId = new Map(rows.rows.map((row: any) => [row.id, row]));

    const pending = byId.get(pendingLegacy) as any;
    expect(pending.shipment_id).toBeNull();
    expect(pending.processed).toBe(false);
    expect(pending.processed_at).toBeNull();
    expect(pending.processing_error).toMatch(/manual review/);

    const processed = byId.get(processedLegacy) as any;
    expect(processed.shipment_id).toBeNull();
    expect(processed.processed).toBe(true);
    expect(new Date(processed.processed_at).toISOString()).toBe(processedAt.toISOString());
    expect(processed.processing_error).toMatch(/manual review/);

    const bound = byId.get(credentialBound) as any;
    expect(bound.shipment_id).toBe(shipment);
    expect(bound.processing_error).toBeNull();

    const unlinked = byId.get(unlinkedLegacy) as any;
    expect(unlinked.shipment_id).toBeNull();
    expect(unlinked.processing_error).toBeNull();

    const longErrorRow = byId.get(longErrorLegacy) as any;
    expect(longErrorRow.shipment_id).toBeNull();
    expect(longErrorRow.processing_error).toContain('manual review');
    expect(longErrorRow.processing_error.length).toBeLessThanOrEqual(2000);
  });
});
