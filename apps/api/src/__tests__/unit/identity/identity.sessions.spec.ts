import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdentityService } from '../../../modules/identity/identity.service';

/**
 * Identity Service — session contract unit tests (WEB-B3).
 *
 * Focus: GET /v1/me/sessions must flag exactly the caller's own session as
 * `isCurrent`, derived server-side from the `sid` JWT claim (passed in as
 * `currentSessionId`) rather than a spoofable client header.
 *
 * IdentityService is instantiated with mocked collaborators; only the session
 * query path is exercised here.
 */

// ── Mock builder ──────────────────────────────────────────────────
function createMocks() {
  const db = {
    query: {
      sessions: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
      organizationMembers: { findMany: vi.fn(), findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      roles: { findFirst: vi.fn() },
      rolePermissions: { findMany: vi.fn() },
      permissions: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };

  const mockDb = { db } as any;
  const mockRedis = {
    client: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  } as any;
  const mockJwt = { sign: vi.fn().mockReturnValue('signed.token'), verify: vi.fn() } as any;
  const mockRateLimit = { checkAndIncrement: vi.fn(), resetAttempts: vi.fn() } as any;
  const mockAudit = { record: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, mockDb, mockRedis, mockJwt, mockRateLimit, mockAudit };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new IdentityService(
    mocks.mockDb,
    mocks.mockRedis,
    mocks.mockJwt,
    mocks.mockRateLimit,
    mocks.mockAudit,
  );
}

const SESSION_ROWS = [
  {
    id: 'sess-A',
    device: 'web',
    deviceId: 'dev-1',
    ip: '1.1.1.1',
    createdAt: new Date('2026-09-01'),
    expiresAt: new Date('2026-10-01'),
    revokedAt: null,
  },
  {
    id: 'sess-B',
    device: 'ios',
    deviceId: 'dev-2',
    ip: '2.2.2.2',
    createdAt: new Date('2026-08-20'),
    expiresAt: new Date('2026-09-20'),
    revokedAt: null,
  },
  {
    id: 'sess-C',
    device: 'android',
    deviceId: 'dev-3',
    ip: '3.3.3.3',
    createdAt: new Date('2026-08-10'),
    expiresAt: new Date('2026-09-10'),
    revokedAt: new Date('2026-08-15'),
  },
];

describe('IdentityService — getUserSessions (WEB-B3 isCurrent contract)', () => {
  let service: IdentityService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
    mocks.db.query.sessions.findMany.mockResolvedValue(SESSION_ROWS);
  });

  it('flags the session matching the current sid as isCurrent', async () => {
    const result = await service.getUserSessions('user-1', 'sess-B');
    const current = result.filter((s) => s.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]!.id).toBe('sess-B');
  });

  it('marks all other sessions as not current', async () => {
    const result = await service.getUserSessions('user-1', 'sess-B');
    const others = result.filter((s) => s.id !== 'sess-B');
    expect(others.every((s) => s.isCurrent === false)).toBe(true);
  });

  it('returns no current session when the sid matches none (e.g. legacy token without sid)', async () => {
    const result = await service.getUserSessions('user-1', 'sess-UNKNOWN');
    expect(result.every((s) => s.isCurrent === false)).toBe(true);
  });

  it('treats an omitted currentSessionId as "no current session" (back-compat)', async () => {
    const result = await service.getUserSessions('user-1');
    expect(result.every((s) => s.isCurrent === false)).toBe(true);
  });

  it('maps revokedAt to isRevoked independently of isCurrent', async () => {
    const result = await service.getUserSessions('user-1', 'sess-A');
    const byId = Object.fromEntries(result.map((s) => [s.id, s]));
    expect(byId['sess-C']!.isRevoked).toBe(true);
    expect(byId['sess-A']!.isRevoked).toBe(false);
    expect(byId['sess-A']!.isCurrent).toBe(true);
  });

  it('projects only the public session fields', async () => {
    const result = await service.getUserSessions('user-1', 'sess-A');
    expect(Object.keys(result[0]!).sort()).toEqual(
      ['createdAt', 'device', 'deviceId', 'expiresAt', 'id', 'ip', 'isCurrent', 'isRevoked'].sort(),
    );
  });

  it('returns an empty list for a user with no sessions', async () => {
    mocks.db.query.sessions.findMany.mockResolvedValue([]);
    const result = await service.getUserSessions('user-1', 'sess-A');
    expect(result).toEqual([]);
  });
});
