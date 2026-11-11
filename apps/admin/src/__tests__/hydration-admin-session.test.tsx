import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import AdminHomePage from '../app/page';
import { AuthGuard } from '../components/AuthGuard';
import { AccessDenied, useRequirePerms } from '../hooks/useRequirePerms';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
} from './document-root-harness';

/**
 * Phase 1E (4) and (5) — a signed-in administrator's document root hydrates
 * cleanly and the sidebar shows exactly the links their permissions allow.
 *
 * The break the first test catches is the same document-root divergence as the
 * signed-out case, on the path that actually renders `AdminSidebar`, the
 * dashboard and the permission filter. The second test is the security guard
 * that must survive the CSS and clock remediation: dropping a permission check,
 * or inverting the filter, changes which links appear.
 *
 * The session is written to localStorage inside `vi.hoisted`, which Vitest runs
 * before this file's imports, because `src/lib/auth.ts` restores the session at
 * module scope (`restoreSession()` runs on import) and a later write would be
 * invisible to it.
 */

// Vitest hoists this above the imports, so the session exists before
// `src/lib/auth.ts` runs its module-scope `restoreSession()`.
// The permission set is enough for /users and /organizations, not for /brands.
vi.hoisted((): void => {
  localStorage.setItem(
    'scs_admin_session',
    JSON.stringify({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.parse('2999-01-01T00:00:00.000Z'),
    }),
  );
  localStorage.setItem(
    'scs_admin_user',
    JSON.stringify({
      id: 'admin-1',
      phone: '+966500000001',
      fullName: 'Platform Admin',
      role: 'SUPER_ADMIN',
      perms: ['admin:users:read'],
    }),
  );
});

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter-mock', className: '', style: {} }),
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));

// `AdminSidebar`'s responsive effect picks the mobile overlay below 1080px and
// hides the navigation there; pin a desktop viewport so the link list exists.
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });

// Dashboard data calls stay pending so only deterministic markup is compared.
vi.mock('../lib/api', () => ({
  fetchKpis: () => new Promise(() => {}),
  fetchAdminOrgUpdateRequests: () => new Promise(() => {}),
}));

afterEach(cleanupDocumentRoots);

const dashboard = (
  <RootLayout>
    <AdminHomePage />
  </RootLayout>
);

/** A permission-checked screen in the shape the 43 Admin routes use. */
const SCREEN = 'User administration screen';

function PermsProbe({ requiredPerms }: { requiredPerms: string[] }) {
  const { hasAccess, missingPerms } = useRequirePerms(requiredPerms);
  if (!hasAccess) return <AccessDenied requiredPerms={requiredPerms} missingPerms={missingPerms} />;
  return <div>{SCREEN}</div>;
}

describe('Admin document-root hydration with an active session', () => {
  it('hydrates the signed-in Admin document root without a recoverable error', async () => {
    const run = await hydrateDocumentRoot(dashboard);

    expectHydrationClean(run);
    // The gate opened after hydration, so the protected tree is on screen.
    expect(document.querySelector('#main-content')).not.toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('renders only the navigation links the administrator’s permissions allow', async () => {
    await hydrateDocumentRoot(dashboard);

    const hrefs = Array.from(document.querySelectorAll('nav a'), (link) => link.getAttribute('href'));

    // Granted: admin:users:read. Always available: links with no permission
    // requirement (/ and /account).
    expect(hrefs).toContain('/users');
    expect(hrefs).toContain('/account');
    // Denied: catalog:brands:manage is not in this administrator's permission set.
    expect(hrefs).not.toContain('/brands');
    expect(hrefs).not.toContain('/catalog-import');
  });
});

describe('Admin permission hook with an active session', () => {
  /**
   * Phase 1E (5) at the primitive the 43 permission-checked routes share: the
   * seeded session grants `admin:users:read` and nothing else, so the same
   * screen must open for one permission key and stay denied for another.
   */
  async function screenFor(requiredPerms: string[]) {
    const run = await hydrateDocumentRoot(
      asDocumentRoot(
        <AuthGuard>
          <PermsProbe requiredPerms={requiredPerms} />
        </AuthGuard>,
      ),
    );

    expectHydrationClean(run);
    return document.body.textContent ?? '';
  }

  it('grants the screen when the administrator holds every required permission', async () => {
    const text = await screenFor(['admin:users:read']);

    expect(text).toContain(SCREEN);
    expect(text).not.toContain('Access Denied');
  });

  it('denies the screen and names the missing permission otherwise', async () => {
    const text = await screenFor(['admin:users:read', 'catalog:brands:manage']);

    expect(text).not.toContain(SCREEN);
    expect(text).toContain('Access Denied');
    expect(text).toContain('catalog:brands:manage');
  });
});
