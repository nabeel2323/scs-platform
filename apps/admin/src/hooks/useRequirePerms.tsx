'use client';

import { getUser } from '../lib/auth';

/**
 * Check if the current admin user has all required permissions.
 * Returns an object with `hasAccess` boolean and `missingPerms` array.
 */
export function useRequirePerms(requiredPerms: string[]): {
  hasAccess: boolean;
  missingPerms: string[];
} {
  const user = getUser();
  const userPerms = user?.perms ?? [];

  const missingPerms = requiredPerms.filter((p) => !userPerms.includes(p));
  const hasAccess = missingPerms.length === 0;

  return { hasAccess, missingPerms };
}

/**
 * Component that renders an access-denied message when the user lacks required permissions.
 * Returns null if the user has access, otherwise renders a styled error banner.
 */
export function AccessDenied({
  requiredPerms,
  missingPerms,
}: {
  requiredPerms: string[];
  missingPerms: string[];
}) {
  if (missingPerms.length === 0) return null;

  return (
    <div
      style={{
        padding: '24px',
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: 8,
        marginBottom: 20,
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: '#856404' }}>
        Access Denied
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#856404' }}>
        You don't have permission to access this page.
      </p>
      <div style={{ fontSize: 13, color: '#856404' }}>
        <strong>Missing permissions:</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {missingPerms.map((perm) => (
            <li key={perm} style={{ marginBottom: 4 }}>
              <code style={{ background: '#fff3cd', padding: '2px 6px', borderRadius: 3 }}>
                {perm}
              </code>
            </li>
          ))}
        </ul>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: '#856404' }}>
        Contact your administrator if you believe you should have access.
      </p>
    </div>
  );
}
