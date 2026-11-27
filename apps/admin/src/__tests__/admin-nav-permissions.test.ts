import { describe, expect, it } from 'vitest';
import { hasAdminNavAccess } from '../lib/admin-nav-permissions';

describe('Admin navigation permission rules', () => {
  it('preserves all-of requirements for existing navigation items', () => {
    const rule = { perms: ['admin:users:read', 'admin:roles:write'] };
    expect(hasAdminNavAccess(rule, ['admin:users:read'])).toBe(false);
    expect(hasAdminNavAccess(rule, ['admin:users:read', 'admin:roles:write'])).toBe(true);
  });

  it('allows carrier recovery-only users to reach the shared carrier page', () => {
    const rule = { perms: [], anyPerms: ['admin:carrier:read', 'admin:shipping:recovery'] };
    expect(hasAdminNavAccess(rule, ['admin:carrier:read'])).toBe(true);
    expect(hasAdminNavAccess(rule, ['admin:shipping:recovery'])).toBe(true);
    expect(hasAdminNavAccess(rule, [])).toBe(false);
  });

  it('allows payment users with any supported capability to reach Payments', () => {
    const rule = {
      perms: [],
      anyPerms: ['admin:payments:read', 'admin:payments:verify', 'admin:refunds:approve'],
    };
    expect(hasAdminNavAccess(rule, ['admin:payments:read'])).toBe(true);
    expect(hasAdminNavAccess(rule, ['admin:payments:verify'])).toBe(true);
    expect(hasAdminNavAccess(rule, ['admin:refunds:approve'])).toBe(true);
    expect(hasAdminNavAccess(rule, [])).toBe(false);
  });

  it('keeps public navigation visible when no permission rule is supplied', () => {
    expect(hasAdminNavAccess({}, [])).toBe(true);
  });
});
