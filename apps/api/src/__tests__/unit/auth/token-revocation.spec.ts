import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { IdentityService } from '../../../modules/identity/identity.service';
import {
  DENYLIST_KEY_PREFIX,
  denylistKey,
  secondsUntilExp,
} from '../../../common/auth/token-denylist';

/**
 * Access-token revocation unit tests (API-B9).
 *
 * Covers the three cooperating pieces that let `switchOrg` revoke the presenting
 * access token and close the 15-minute stale-permission window:
 *   1. the pure denylist key/TTL helpers,
 *   2. JwtAuthGuard rejecting a denylisted jti,
 *   3. IdentityService.switchOrg denylisting the prior token's jti.
 */

// ── Pure helpers ────────────────────────────────────────────────
describe('token-denylist helpers', () => {
  it('builds a namespaced redis key from a jti', () => {
    expect(denylistKey('abc-123')).toBe(`${DENYLIST_KEY_PREFIX}abc-123`);
    expect(denylistKey('abc-123')).toBe('jwt:deny:abc-123');
  });

  it('computes remaining seconds until exp', () => {
    const now = 1_000_000;
    expect(secondsUntilExp(now + 600, now)).toBe(600);
    expect(secondsUntilExp(now + 0.4, now)).toBe(1); // rounds up to a whole second
  });

  it('returns 0 for missing or already-expired tokens (nothing to denylist)', () => {
    const now = 1_000_000;
    expect(secondsUntilExp(undefined, now)).toBe(0);
    expect(secondsUntilExp(now - 10, now)).toBe(0);
    expect(secondsUntilExp(now, now)).toBe(0);
  });
});

// ── Guard enforcement ───────────────────────────────────────────
function mockContext(headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  return {
    request,
    ctx: { switchToHttp: () => ({ getRequest: () => request }) } as any,
  };
}

describe('JwtAuthGuard — denylist enforcement (API-B9)', () => {
  let jwt: { verify: ReturnType<typeof vi.fn> };
  let redis: { client: { get: ReturnType<typeof vi.fn> } };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verify: vi.fn() };
    redis = { client: { get: vi.fn() } };
    guard = new JwtAuthGuard(jwt as any, redis as any);
  });

  it('allows a valid token whose jti is not denylisted', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', jti: 'j-1', perms: [] });
    redis.client.get.mockResolvedValue(null);
    const { ctx, request } = mockContext({ authorization: 'Bearer good.token' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redis.client.get).toHaveBeenCalledWith('jwt:deny:j-1');
    expect(request['user']).toMatchObject({ sub: 'u1', jti: 'j-1' });
  });

  it('rejects a valid-signature token whose jti has been revoked', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', jti: 'j-revoked', perms: [] });
    redis.client.get.mockResolvedValue('1');
    const { ctx } = mockContext({ authorization: 'Bearer revoked.token' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { detail: 'Access token has been revoked' },
    });
  });

  it('skips the denylist for legacy tokens without a jti', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', perms: [] });
    const { ctx } = mockContext({ authorization: 'Bearer legacy.token' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redis.client.get).not.toHaveBeenCalled();
  });

  it('rejects a token that fails signature/expiry verification', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { ctx } = mockContext({ authorization: 'Bearer bad.token' });

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { detail: 'Invalid or expired access token' },
    });
    expect(redis.client.get).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const { ctx } = mockContext({});
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { detail: 'Missing or invalid Authorization header' },
    });
  });
});

// ── switchOrg revocation ────────────────────────────────────────
function createIdentityMocks() {
  const db = {
    query: {
      organizationMembers: { findMany: vi.fn(), findFirst: vi.fn() },
      organizations: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findMany: vi.fn(), findFirst: vi.fn() },
      roles: { findMany: vi.fn(), findFirst: vi.fn() },
      rolePermissions: { findMany: vi.fn() },
      permissions: { findMany: vi.fn(), findFirst: vi.fn() },
      sessions: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };
  const redis = {
    client: {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('signed.token'), verify: vi.fn() };
  const rateLimit = {
    checkAndIncrement: vi.fn(),
    resetAttempts: vi.fn(),
    getResetSeconds: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { db, redis, jwt, rateLimit, audit };
}

describe('IdentityService.switchOrg — prior-token revocation (API-B9)', () => {
  let service: IdentityService;
  let mocks: ReturnType<typeof createIdentityMocks>;

  beforeEach(() => {
    mocks = createIdentityMocks();
    service = new IdentityService(
      { db: mocks.db } as any,
      { client: mocks.redis.client } as any,
      mocks.jwt as any,
      mocks.rateLimit as any,
      mocks.audit as any,
    );
    // Membership check + claims resolution.
    mocks.db.query.organizationMembers.findFirst.mockResolvedValue({
      id: 'm1',
      orgId: 'org-2',
      userId: 'u1',
      roleId: 'role-1',
      status: 'ACTIVE',
    });
    mocks.db.query.organizationMembers.findMany.mockResolvedValue([
      { id: 'm1', orgId: 'org-2', userId: 'u1', roleId: 'role-1', status: 'ACTIVE' },
    ]);
    mocks.db.query.roles.findFirst.mockResolvedValue({ id: 'role-1', key: 'MERCHANT_OWNER' });
    mocks.db.query.rolePermissions.findMany.mockResolvedValue([]);
  });

  it('denylists the presenting token jti for its remaining lifetime', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    await service.switchOrg('u1', 'org-2', 'sess-1', { jti: 'prior-jti', exp });

    expect(mocks.redis.client.set).toHaveBeenCalledTimes(1);
    const [key, value, mode, ttl] = mocks.redis.client.set.mock.calls[0]!;
    expect(key).toBe('jwt:deny:prior-jti');
    expect(value).toBe('1');
    expect(mode).toBe('EX');
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('mints the new token with a fresh jti and the carried sid', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    await service.switchOrg('u1', 'org-2', 'sess-1', { jti: 'prior-jti', exp });

    const payload = mocks.jwt.sign.mock.calls[0]![0];
    expect(payload.sid).toBe('sess-1');
    expect(payload.activeOrg).toBe('org-2');
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti).not.toBe('prior-jti'); // new token is independently revocable
  });

  it('does not denylist when no prior token is supplied (back-compat)', async () => {
    await service.switchOrg('u1', 'org-2', 'sess-1');
    expect(mocks.redis.client.set).not.toHaveBeenCalled();
  });

  it('does not denylist an already-expired prior token (ttl 0)', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    await service.switchOrg('u1', 'org-2', 'sess-1', { jti: 'old-jti', exp });
    expect(mocks.redis.client.set).not.toHaveBeenCalled();
  });
});
