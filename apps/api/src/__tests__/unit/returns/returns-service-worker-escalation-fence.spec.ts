import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ForbiddenException } from '@nestjs/common';
import { ReturnsService } from '../../../modules/returns/returns.service';

function makeService(options?: { leaseRows?: unknown[]; updatedRows?: unknown[] }) {
  const ret = { id: 'return-a', status: 'REQUESTED', subOrderId: 'order-a' };
  const findFirst = vi.fn().mockResolvedValue(ret);
  const txExecute = vi.fn().mockResolvedValue({ rows: options?.leaseRows ?? [{ lease_key: 'p13-return-expiration' }] });
  const returning = vi.fn().mockResolvedValue(options?.updatedRows ?? [{ id: 'return-a' }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const values = vi.fn().mockResolvedValue([]);
  const insert = vi.fn().mockReturnValue({ values });
  const tx = { execute: txExecute, update, insert };
  const transaction = vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(tx));
  const db = { db: { query: { returnRequests: { findFirst } }, transaction } };
  const calendar = { addBusinessDays: vi.fn().mockResolvedValue(new Date('2026-11-25T00:00:00.000Z')) };
  const outbox = { publish: vi.fn().mockResolvedValue('outbox-a') };
  const service = new ReturnsService(db as any, outbox as any, {} as any, calendar as any, {} as any, {} as any, {} as any);
  return { service, findFirst, txExecute, update, where, insert, values, outbox, transaction };
}

describe('ReturnsService return-expiration worker fencing', () => {
  it('locks the live worker lease and repeats its fence in the return mutation', async () => {
    const h = makeService();
    await h.service.escalateReturn('return-a', {
      kind: 'worker',
      holderId: 'worker-host-123',
      epoch: 42,
    });

    expect(h.txExecute).toHaveBeenCalledOnce();
    const leaseQuery = new PgDialect().sqlToQuery(h.txExecute.mock.calls[0]![0]);
    expect(leaseQuery.sql).toContain('FOR UPDATE');
    expect(leaseQuery.params).toEqual(expect.arrayContaining([
      'p13-return-expiration',
      'worker-host-123',
      42,
    ]));

    const mutationQuery = new PgDialect().sqlToQuery(h.where.mock.calls[0]![0]);
    expect(mutationQuery.sql).toContain('EXISTS');
    expect(mutationQuery.sql).toContain('worker_leases');
    expect(mutationQuery.sql).toContain('expires_at > now()');
    expect(mutationQuery.params).toEqual(expect.arrayContaining([
      'p13-return-expiration',
      'worker-host-123',
      42,
    ]));
    expect(h.outbox.publish).toHaveBeenCalledOnce();
  });

  it('does not mutate or publish when the worker no longer owns a live lease', async () => {
    const h = makeService({ leaseRows: [] });

    await expect(
      h.service.escalateReturn('return-a', {
        kind: 'worker',
        holderId: 'stale-worker',
        epoch: 41,
      }),
    ).resolves.toBeNull();

    expect(h.update).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.outbox.publish).not.toHaveBeenCalled();
  });


  it('fails closed for an unknown runtime authority kind', async () => {
    const h = makeService();
    await expect(
      h.service.escalateReturn('return-a', { kind: 'unknown' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('allows an explicitly privileged platform caller without a worker lease', async () => {
    const h = makeService();
    await h.service.escalateReturn('return-a', {
      kind: 'platform',
      caller: { sub: 'admin-a', role: 'SUPER_ADMIN', activeOrg: null },
    });

    expect(h.txExecute).not.toHaveBeenCalled();
    expect(h.outbox.publish).toHaveBeenCalledOnce();
  });

  it('rejects direct platform escalation from a non-platform caller', async () => {
    const h = makeService();
    await expect(
      h.service.escalateReturn('return-a', {
        kind: 'platform',
        caller: { sub: 'buyer-a', role: 'BUYER', activeOrg: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});
