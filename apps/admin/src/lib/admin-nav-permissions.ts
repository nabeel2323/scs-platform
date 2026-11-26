export interface AdminNavPermissionRule {
  perms?: readonly string[];
  anyPerms?: readonly string[];
}

/**
 * A navigation item may require every permission in `perms` and, when
 * supplied, at least one permission in `anyPerms`. Empty requirements keep
 * genuinely public navigation items visible.
 */
export function hasAdminNavAccess(
  rule: AdminNavPermissionRule,
  userPerms: readonly string[],
): boolean {
  const allRequired = rule.perms ?? [];
  const anyRequired = rule.anyPerms ?? [];
  return (
    allRequired.every((permission) => userPerms.includes(permission)) &&
    (anyRequired.length === 0 || anyRequired.some((permission) => userPerms.includes(permission)))
  );
}
