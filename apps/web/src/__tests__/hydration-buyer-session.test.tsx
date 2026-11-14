import { afterEach, describe, expect, it, vi } from 'vitest';
import MerchantLayout from '../app/merchant/layout';
import { setCurrentUser } from '../lib/auth';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
} from './document-root-harness';

/**
 * Phase 1E (5) — an authenticated Buyer receives exactly the access their role
 * grants, and the merchant gate stays enforced while that is worked out.
 *
 * `apps/web/src/app/merchant/layout.tsx` is the client-side role gate (GAP-4).
 * It renders nothing until an effect has checked the session, so protected
 * merchant content is never in the server HTML nor in the browser's first
 * render — the same effect-initialized pattern that makes the Buyer clock safe.
 * These tests keep that property under document-root hydration for a real
 * session, and prove the two role outcomes: merchant ⇒ screen, non-merchant ⇒
 * redirect away with the screen never rendered.
 */

// Seeded before `src/lib/auth.ts` runs its module-scope `restoreSession()`.
vi.hoisted((): void => {
  localStorage.setItem(
    'scs_web_session',
    JSON.stringify({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.parse('2999-01-01T00:00:00.000Z'),
    }),
  );
  localStorage.setItem(
    'scs_web_user',
    JSON.stringify({
      id: 'merchant-1',
      phone: '+966500000002',
      email: 'owner@example.test',
      fullName: 'Merchant Owner',
      role: 'MERCHANT_OWNER',
      perms: ['merchant:orders:read'],
    }),
  );
});

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/merchant/orders',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter-mock', className: '', style: {} }),
}));

/** Content only a merchant may see, behind the real gate. */
const PROTECTED_SCREEN = 'Merchant order pipeline';

function merchantRoute() {
  return asDocumentRoot(
    <MerchantLayout>
      <div data-testid="protected-screen">{PROTECTED_SCREEN}</div>
    </MerchantLayout>,
  );
}

afterEach(() => {
  cleanupDocumentRoots();
  router.replace.mockClear();
  router.push.mockClear();
});

describe('Buyer merchant route gate with an active session', () => {
  it('renders the protected merchant screen for a merchant role and never redirects', async () => {
    const run = await hydrateDocumentRoot(merchantRoute());

    expectHydrationClean(run);
    // Premise: the gate really did open, so the clean result is not vacuous.
    expect(document.body.textContent).toContain(PROTECTED_SCREEN);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the protected merchant screen away from a signed-in non-merchant', async () => {
    // Public API, same one the org-switch flow uses: the session stays valid,
    // only the projected role changes — so this exercises role enforcement, not
    // session handling.
    setCurrentUser({
      id: 'retailer-1',
      phone: '+966500000003',
      email: 'buyer@example.test',
      fullName: 'Retail Buyer',
      role: 'RETAILER',
      perms: ['product:read'],
    });

    const run = await hydrateDocumentRoot(merchantRoute());

    expectHydrationClean(run);
    expect(document.body.textContent).not.toContain(PROTECTED_SCREEN);
    expect(router.replace).toHaveBeenCalledWith('/search');
  });

  it('serves no protected merchant markup before the gate has been checked', async () => {
    setCurrentUser({
      id: 'merchant-2',
      phone: '+966500000004',
      email: 'staff@example.test',
      fullName: 'Merchant Staff',
      role: 'MERCHANT_STAFF',
      perms: ['merchant:orders:read'],
    });

    const run = await hydrateDocumentRoot(merchantRoute());

    // The bytes a signed-in merchant is sent contain nothing they were not
    // entitled to see — the gate defers the decision, it does not pre-render it.
    expect(run.prerenderedHtml).not.toContain(PROTECTED_SCREEN);
    expectHydrationClean(run);
  });
});
