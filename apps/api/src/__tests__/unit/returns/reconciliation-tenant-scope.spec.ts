import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ReturnsController } from '../../../modules/returns/returns.controller';
import { ReconciliationService } from '../../../modules/returns/reconciliation.service';

describe('ReturnsController — reconciliation tenant scope', () => {
  it('fails closed when a finance caller has no active organization', async () => {
    const reconciliation = { resolveDiscrepancy: vi.fn() };
    const controller = new ReturnsController(
      {} as any,
      {} as any,
      {} as any,
      reconciliation as any,
      {} as any,
    );

    await expect(
      controller.resolveDiscrepancy(
        { sub: 'finance-a', role: 'FINANCE', activeOrg: null } as any,
        'discrepancy-a',
        { notes: 'Reviewed' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(reconciliation.resolveDiscrepancy).not.toHaveBeenCalled();
  });

  it('passes the resolved financial organization to discrepancy resolution', async () => {
    const reconciliation = {
      resolveDiscrepancy: vi.fn().mockResolvedValue({ resolved: true }),
    };
    const controller = new ReturnsController(
      {} as any,
      {} as any,
      {} as any,
      reconciliation as any,
      {} as any,
    );

    await controller.resolveDiscrepancy(
      { sub: 'finance-a', role: 'FINANCE', activeOrg: 'org-a' } as any,
      'discrepancy-a',
      { notes: 'Reviewed' },
    );

    expect(reconciliation.resolveDiscrepancy).toHaveBeenCalledWith(
      'discrepancy-a',
      'finance-a',
      'Reviewed',
      'org-a',
    );
  });
});

describe('ReconciliationService — scoped discrepancy mutation', () => {
  it('includes the tenant predicate in the update, not only the pre-read', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'disc-a', orgId: 'org-a' });
    const returning = vi.fn().mockResolvedValue([{ id: 'disc-a' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const service = new ReconciliationService({
      db: {
        query: {
          reconciliationDiscrepancies: { findFirst },
          reconciliationRuns: { findFirst: vi.fn().mockResolvedValue({ id: 'run-a', orgId: 'org-a' }) },
        },
        update,
      },
    } as any);

    await service.resolveDiscrepancy('disc-a', 'admin-a', 'Reviewed', 'org-a');

    const compiled = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(compiled.params).toContain('org-a');
  });
});
