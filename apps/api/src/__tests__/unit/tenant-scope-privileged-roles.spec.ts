import { describe, expect, it } from 'vitest';
import { isTenantPrivileged } from '../../common/tenant-scope';

describe('tenant-scope privileged platform roles', () => {
  it.each(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SYSTEM'])(
    'preserves the explicit platform bypass for %s',
    (role) => {
      expect(isTenantPrivileged({ sub: 'platform-user', role })).toBe(true);
    },
  );

  it.each(['MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT', 'BUYER', ''])(
    'does not grant the platform bypass to %s',
    (role) => {
      expect(isTenantPrivileged({ sub: 'ordinary-user', role })).toBe(false);
    },
  );

  it('fails closed when the caller role is absent', () => {
    expect(isTenantPrivileged({ sub: 'unknown-user' })).toBe(false);
  });
});
