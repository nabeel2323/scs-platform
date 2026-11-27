/**
 * Migration 0074 reconciliation-history preflight tests.
 * Uses isolated PostgreSQL so invalid historical graphs are proven to fail
 * before any pointer rewrite or unique-index creation can commit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../../../infra/drizzle/migrations/0074_reconciliation_tenant_version_integrity.sql'),
  'utf8',
);

describe('Migration 0074 — reconciliation history integrity', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  async function reset() {
    await pool.query('DROP TABLE IF EXISTS reconciliation_runs CASCADE');
    await pool.query(`
      CREATE TABLE reconciliation_runs (
        id UUID PRIMARY KEY,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        currency CHAR(3) NOT NULL,
        org_id UUID,
        version INTEGER NOT NULL,
        superseded_by UUID
      )
    `);
  }

  async function apply() {
    await pool.query('BEGIN');
    try {
      await pool.query(MIGRATION);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async function seed(rows: Array<{
    id: string; version: number; supersededBy?: string | null; orgId?: string | null;
    periodStart?: string; periodEnd?: string; currency?: string;
  }>) {
    for (const row of rows) {
      await pool.query(
        `INSERT INTO reconciliation_runs
          (id, period_start, period_end, currency, org_id, version, superseded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.id, row.periodStart ?? '2026-01-01', row.periodEnd ?? '2026-01-31',
          row.currency ?? 'SAR', row.orgId ?? null, row.version, row.supersededBy ?? null,
        ],
      );
    }
  }

  async function expectRejectedWithoutRewrite(message: RegExp) {
    await pool.query('BEGIN');
    let failure: unknown;
    try {
      await pool.query(MIGRATION);
      await pool.query('COMMIT');
    } catch (error) {
      failure = error;
      await pool.query('ROLLBACK');
    }
    expect(String((failure as Error | undefined)?.message ?? failure)).toMatch(message);
  }

  it('reverses a valid three-version backward-pointer chain without losing the middle link', async () => {
    await reset();
    const v1 = randomUUID(), v2 = randomUUID(), v3 = randomUUID();
    await seed([
      { id: v1, version: 1 },
      { id: v2, version: 2, supersededBy: v1 },
      { id: v3, version: 3, supersededBy: v2 },
    ]);

    await apply();

    const result = await pool.query(
      'SELECT id, superseded_by FROM reconciliation_runs ORDER BY version',
    );
    expect(result.rows).toEqual([
      { id: v1, superseded_by: v2 },
      { id: v2, superseded_by: v3 },
      { id: v3, superseded_by: null },
    ]);
  });

  it('fails closed on dangling references', async () => {
    await reset();
    const newer = randomUUID(), missing = randomUUID();
    await seed([{ id: newer, version: 2, supersededBy: missing }]);
    await expectRejectedWithoutRewrite(/dangling reconciliation superseded_by/);
  });

  it('fails closed on cross-organization or cross-period pointers', async () => {
    await reset();
    const older = randomUUID(), newer = randomUUID();
    await seed([
      { id: older, version: 1, orgId: randomUUID() },
      { id: newer, version: 2, supersededBy: older, orgId: randomUUID() },
    ]);
    await expectRejectedWithoutRewrite(/crosses period, currency, or organization scope/);
  });

  it('fails closed on non-monotonic version pointers', async () => {
    await reset();
    const older = randomUUID(), newer = randomUUID();
    await seed([
      { id: older, version: 2 },
      { id: newer, version: 1, supersededBy: older },
    ]);
    await expectRejectedWithoutRewrite(/not strictly increasing/);
  });

  it('fails closed on branching history', async () => {
    await reset();
    const older = randomUUID(), newerA = randomUUID(), newerB = randomUUID();
    await seed([
      { id: older, version: 1 },
      { id: newerA, version: 2, supersededBy: older },
      { id: newerB, version: 3, supersededBy: older },
    ]);
    await expectRejectedWithoutRewrite(/branching reconciliation history/);
  });

  it('fails closed on duplicate versions in the NULL organization scope', async () => {
    await reset();
    await seed([
      { id: randomUUID(), version: 1 },
      { id: randomUUID(), version: 1 },
    ]);
    await expectRejectedWithoutRewrite(/duplicate reconciliation version/);
  });
});
