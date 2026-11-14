import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../components/AuthGuard';
import { AccessDenied, useRequirePerms } from '../hooks/useRequirePerms';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
} from './document-root-harness';

/**
 * Phase 1E (4) — a signed-out administrator is denied permission-protected
 * content, at document scope, through the real gate and the real permission
 * hook.
 *
 * `apps/admin/src/hooks/useRequirePerms.tsx:13` reads the session during
 * render. That is only safe while `AuthGuard` keeps the subtree out of the
 * served document — the property Phase 1C audits and these tests lock: with no
 * session the screen is absent from the bytes, absent after mount, and the
 * visitor is sent to sign in.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/brands',
}));

const REQUIRED_PERMS = ['catalog:brands:manage'];
const PROTECTED_SCREEN = 'Brand governance screen';

function GuardedScreen() {
  const { hasAccess, missingPerms } = useRequirePerms(REQUIRED_PERMS);
  if (!hasAccess) return <AccessDenied requiredPerms={REQUIRED_PERMS} missingPerms={missingPerms} />;
  return <div>{PROTECTED_SCREEN}</div>;
}

function guardedRoute() {
  return asDocumentRoot(
    <AuthGuard>
      <GuardedScreen />
    </AuthGuard>,
  );
}

afterEach(() => {
  cleanupDocumentRoots();
  router.push.mockClear();
});

describe('Admin permission gate with no session', () => {
  it('never puts permission-protected content in the served document', async () => {
    const run = await hydrateDocumentRoot(guardedRoute());

    expect(run.prerenderedHtml).not.toContain(PROTECTED_SCREEN);
    expectHydrationClean(run);
  });

  it('denies the screen after mount and sends the visitor to sign in', async () => {
    const run = await hydrateDocumentRoot(guardedRoute());

    expectHydrationClean(run);
    expect(document.body.textContent).not.toContain(PROTECTED_SCREEN);
    expect(router.push).toHaveBeenCalledWith('/auth/login');
  });
});
