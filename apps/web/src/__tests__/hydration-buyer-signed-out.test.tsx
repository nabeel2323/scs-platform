import { afterEach, describe, expect, it, vi } from 'vitest';
import MerchantLayout from '../app/merchant/layout';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
} from './document-root-harness';

/**
 * Phase 1E (4) — a signed-out visitor is denied protected content.
 *
 * No session is seeded in this file, so `src/lib/auth.ts` restores nothing at
 * import and `isAuthenticated()` is false for the whole run: this is the state
 * a signed-out browser is really in. The checks are deliberately at document
 * scope, because that is where Next.js hydrates, and they cover both halves of
 * the requirement — the *served* bytes must not contain the merchant screen,
 * and the gate must still redirect rather than open once the effect runs.
 */

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

const PROTECTED_SCREEN = 'Merchant order pipeline';

function merchantRoute() {
  return asDocumentRoot(
    <MerchantLayout>
      <div>{PROTECTED_SCREEN}</div>
    </MerchantLayout>,
  );
}

afterEach(() => {
  cleanupDocumentRoots();
  router.replace.mockClear();
  router.push.mockClear();
});

describe('Buyer merchant route gate with no session', () => {
  it('never puts protected merchant content in the served document', async () => {
    const run = await hydrateDocumentRoot(merchantRoute());

    expect(run.prerenderedHtml).not.toContain(PROTECTED_SCREEN);
    expectHydrationClean(run);
  });

  it('keeps the screen out of the DOM and sends the visitor to sign in', async () => {
    const run = await hydrateDocumentRoot(merchantRoute());

    expectHydrationClean(run);
    expect(document.body.textContent).not.toContain(PROTECTED_SCREEN);
    expect(router.replace).toHaveBeenCalledWith('/auth/login');
  });
});
