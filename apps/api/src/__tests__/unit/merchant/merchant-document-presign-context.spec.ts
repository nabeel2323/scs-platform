import { describe, expect, it, vi } from 'vitest';
import { MerchantService } from '../../../modules/merchant/merchant.service';

describe('MerchantService document presign actor-context boundaries (G-002)', () => {
  it('performs membership reads and metadata writes in separate actor scopes around storage signing', async () => {
    const events: string[] = [];
    const actorContexts: unknown[] = [];
    const document = {
      id: 'document-a',
      orgId: 'org-a',
      storageKey: 'docs/org-a/document-a.pdf',
    };
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    }));
    const db = {
      withActorContext: vi.fn(async (actor: unknown, operation: () => Promise<unknown>) => {
        actorContexts.push(actor);
        events.push('actor-start');
        const result = await operation();
        events.push('actor-commit');
        return result;
      }),
      db: {
        query: {
          businessDocuments: {
            findFirst: vi.fn().mockResolvedValue(document),
          },
          organizationMembers: {
            findFirst: vi.fn().mockResolvedValue({ id: 'membership-a' }),
          },
        },
        update,
      },
    };
    const storage = {
      createPresignedGetUrl: vi.fn(async () => {
        events.push('storage-sign');
        return 'https://storage.example/signed-document';
      }),
    };
    const service = new MerchantService(db as any, {} as any, storage as any);

    const result = await service.presignForMerchant('document-a', 'merchant-a', {
      sub: 'merchant-a',
      role: 'MERCHANT',
      activeOrg: 'org-a',
    });

    expect(result).toEqual({ downloadUrl: 'https://storage.example/signed-document' });
    expect(actorContexts).toEqual([
      {
        actorKind: 'user',
        actorId: 'merchant-a',
        actorRole: 'MERCHANT',
        activeOrgId: 'org-a',
      },
      {
        actorKind: 'user',
        actorId: 'merchant-a',
        actorRole: 'MERCHANT',
        activeOrgId: 'org-a',
      },
    ]);
    expect(events.indexOf('actor-commit')).toBeLessThan(events.indexOf('storage-sign'));
    expect(events.lastIndexOf('storage-sign')).toBeLessThan(events.lastIndexOf('actor-start'));
    expect(update).toHaveBeenCalledOnce();
  });
});
