import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

import * as bcrypt from 'bcrypt';
import { IdentityService } from '../../../modules/identity/identity.service';
import type { DatabaseActorContext } from '../../../common/database/database.service';

process.env['OTP_HMAC_SECRET'] = 'test-hmac-secret-for-unit-tests-only-32chars-min!!';

const ACTOR = { role: 'MERCHANT_OWNER', activeOrg: 'org-1' };

function createHarness(user: Record<string, unknown>, userReads: unknown[] = [user]) {
  let contextActive = false;
  const contextCalls: DatabaseActorContext[] = [];
  const findFirst = vi.fn();
  for (const row of userReads) {
    findFirst.mockResolvedValueOnce(row);
  }

  const returningRows = [{ id: 'user-1' }];
  const updates: Array<{ table: unknown; values?: unknown }> = [];
  const update = vi.fn((table: unknown) => {
    const call: { table: unknown; values?: unknown } = { table };
    updates.push(call);
    const terminal = {
      rowCount: table === undefined ? 0 : 1,
      returning: vi.fn().mockResolvedValue(returningRows),
    };
    return {
      set: vi.fn((values: unknown) => {
        call.values = values;
        return { where: vi.fn().mockReturnValue(terminal) };
      }),
    };
  });
  const insert = vi.fn(() => ({
    values: vi.fn().mockResolvedValue(undefined),
  }));
  const database = {
    db: {
      query: { users: { findFirst } },
      update,
      insert,
    },
    withActorContext: vi.fn(async (context: DatabaseActorContext, operation: () => Promise<unknown>) => {
      contextCalls.push(context);
      contextActive = true;
      try {
        return await operation();
      } finally {
        contextActive = false;
      }
    }),
  };

  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new IdentityService(
    database as any,
    { client: {} } as any,
    { sign: vi.fn().mockReturnValue('signed.jwt') } as any,
    { checkAndIncrement: vi.fn(), resetAttempts: vi.fn() } as any,
    audit as any,
    { deliverOtp: vi.fn() } as any,
    { getMockProvider: vi.fn().mockReturnValue(null) } as any,
  );

  return { service, database, contextCalls, updates, audit, isContextActive: () => contextActive };
}

describe('IdentityService credential actor-context boundaries (G-002)', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.hash).mockImplementation(async () => 'new-password-hash' as never);
    vi.mocked(bcrypt.compare).mockImplementation(async () => true as never);
  });

  it('keeps password hashing outside actor transactions and scopes credential setup reads/writes', async () => {
    const user = {
      id: 'user-1',
      email: 'old@example.com',
      phone: null,
      passwordHash: null,
    };
    const h = createHarness(user, [user, user, undefined]);

    vi.mocked(bcrypt.hash).mockImplementation(async () => {
      expect(h.isContextActive()).toBe(false);
      return 'new-password-hash' as never;
    });

    await h.service.setupCredentials('user-1', 'New@Example.com', 'Str0ng!Passphrase2026', ACTOR);

    expect(h.database.withActorContext).toHaveBeenCalledTimes(2);
    expect(h.contextCalls).toEqual([
      { actorKind: 'user', actorId: 'user-1', actorRole: 'MERCHANT_OWNER', activeOrgId: 'org-1' },
      { actorKind: 'user', actorId: 'user-1', actorRole: 'MERCHANT_OWNER', activeOrgId: 'org-1' },
    ]);
    expect(h.database.db.update).toHaveBeenCalledTimes(1);
    expect(h.database.db.insert).toHaveBeenCalledTimes(1);
  });

  it('commits password, credential audit, trust revocation and session revocation in one user scope', async () => {
    const user = {
      id: 'user-1',
      email: 'owner@example.com',
      phone: null,
      passwordHash: 'old-password-hash',
    };
    const h = createHarness(user, [user]);

    vi.mocked(bcrypt.compare).mockImplementation(async () => {
      expect(h.isContextActive()).toBe(false);
      return true as never;
    });
    vi.mocked(bcrypt.hash).mockImplementation(async () => {
      expect(h.isContextActive()).toBe(false);
      return 'new-password-hash' as never;
    });

    await h.service.changePassword(
      'user-1',
      'Old!Password9876',
      'New!Password98765',
      ACTOR,
    );

    expect(h.database.withActorContext).toHaveBeenCalledTimes(3);
    expect(h.contextCalls.slice(0, 2)).toEqual([
      { actorKind: 'user', actorId: 'user-1', actorRole: 'MERCHANT_OWNER', activeOrgId: 'org-1' },
      { actorKind: 'user', actorId: 'user-1', actorRole: 'MERCHANT_OWNER', activeOrgId: 'org-1' },
    ]);
    expect(h.contextCalls[2]).toEqual({
      actorKind: 'audit',
      actorId: 'user-1',
      actorRole: 'MERCHANT_OWNER',
      activeOrgId: 'org-1',
    });
    expect(h.database.db.update).toHaveBeenCalledTimes(3);
    expect(h.database.db.insert).toHaveBeenCalledTimes(1);
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.device_trust_revoked' }),
    );
  });
});
