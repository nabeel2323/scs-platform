import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { OpsAlertService } from '../../../modules/operations/ops-alert.service';

const input = {
  conditionKey: 'p13.worker.poll_failures',
  severity: 'CRITICAL' as const,
  title: 'Worker failed polling',
  detail: { leaseKey: 'p13-return-expiration' },
  resourceType: 'worker_lease',
};

const existing = {
  id: 'alert-existing',
  dedup_key: 'p13.worker.poll_failures:worker_lease',
  condition_key: input.conditionKey,
  severity: input.severity,
  title: input.title,
  status: 'PENDING',
  detail: input.detail,
  fire_count: 1,
  suppressed_count: 0,
  attempt_count: 0,
  delivery_channel: null,
  org_id: null,
  resource_type: 'worker_lease',
  resource_id: null,
  first_observed_at: new Date(),
  last_observed_at: new Date(),
  delivered_at: null,
  resolved_at: null,
  last_error: null,
};

describe('OpsAlertService concurrent delivery ownership', () => {
  it('uses the existing alert when a concurrent insert wins ON CONFLICT DO NOTHING', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const service = new OpsAlertService({ db: { execute } } as any);
    const find = vi.spyOn(service as any, 'findByDedupKey')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const handle = vi.spyOn(service as any, 'handleExisting').mockResolvedValue({
      id: existing.id,
      status: 'PENDING',
      notified: false,
      deduped: true,
      fireCount: 2,
    });

    await expect(service.raise(input)).resolves.toMatchObject({
      id: existing.id,
      deduped: true,
    });

    expect(find).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledWith(existing, input, 'p13.worker.poll_failures:worker_lease');
    const insertQuery = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(insertQuery.sql).toContain('ON CONFLICT (dedup_key) DO NOTHING');
    expect(insertQuery.sql).toContain('RETURNING id');
  });

  it('does not deliver when another monitor owns a fresh SENDING claim', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const service = new OpsAlertService({ db: { execute } } as any);
    vi.spyOn(service as any, 'findByDedupKey').mockResolvedValue({
      ...existing,
      status: 'SENDING',
    });

    await expect(
      (service as any).deliver(existing.id, input, existing.dedup_key, true),
    ).resolves.toMatchObject({
      id: existing.id,
      status: 'SENDING',
      notified: false,
      deduped: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    const claimQuery = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(claimQuery.sql).toContain("SET status = 'SENDING'");
    expect(claimQuery.sql).toContain("status IN ('PENDING', 'FAILED')");
    expect(claimQuery.sql).toContain("status = 'SENDING'");
  });
});
