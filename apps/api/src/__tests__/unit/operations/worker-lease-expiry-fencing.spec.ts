import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { WorkerLeaseService } from '../../../modules/operations/worker-lease.service';

describe('WorkerLeaseService expiry fencing', () => {
  it('cannot renew an already expired lease even when holder and epoch still match', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const service = new WorkerLeaseService({ db: { execute } } as any);

    await expect(service.renewAndFence(12, 'p13-return-expiration')).resolves.toBe(false);

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain('expires_at > now()');
    expect(query.params).toContain('p13-return-expiration');
    expect(query.params).toContain(service.holderId);
    expect(query.params).toContain(12);
  });

  it('does not report an expired holder as live', async () => {
    const service = new WorkerLeaseService({ db: { execute: vi.fn() } } as any);
    vi.spyOn(service, 'read').mockResolvedValue({
      leaseKey: 'p13-return-expiration',
      holderId: service.holderId,
      holderHost: 'host-a',
      holderPid: 1,
      epoch: 12,
      acquiredAt: new Date(Date.now() - 120_000),
      heartbeatAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 1_000),
      pollFailures: 0,
      lastErrorCode: null,
      lastJobAt: null,
      lastJobSummary: null,
    });

    await expect(service.isLiveHolder(12, 'p13-return-expiration')).resolves.toBe(false);
  });

  it('fences poll success, poll failure and release after lease expiry', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const service = new WorkerLeaseService({ db: { execute } } as any);

    await service.recordPollSuccess(12, 'claimed=0', 'p13-return-expiration');
    await expect(service.recordPollFailure(12, 'FAILED', 'p13-return-expiration')).resolves.toBeNull();
    await expect(service.release(12, 'p13-return-expiration')).resolves.toBe(false);

    const queries = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query as any));
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.sql).toContain('expires_at > now()');
      expect(query.params).toContain('p13-return-expiration');
      expect(query.params).toContain(service.holderId);
      expect(query.params).toContain(12);
    }
  });
});
