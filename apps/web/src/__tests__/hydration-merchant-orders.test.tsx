import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MerchantOrdersPage from '../app/merchant/orders/page';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
  styleBlocksWithArtifacts,
} from './document-root-harness';

/**
 * Phase 1D + 1E (2) — the merchant orders screen ships its responsive CSS as a
 * stylesheet, not as React text.
 *
 * The break this catches: `src/app/merchant/orders/page.tsx` renders
 * `<style>{…}` containing `.mo-filterbar > * { flex: 0 0 auto; }`. React's text
 * escaper turns that child combinator into `&gt;`, a real HTML parser leaves it
 * literal inside raw-text `<style>`, and hydration fails with #425 → #418 →
 * #423 — the same class of defect as the root layout, on the screen named in
 * Phase 1D.
 *
 * The page is mounted at document scope because `src/app/merchant/layout.tsx`
 * returns `null` until an effect confirms the session, which keeps the page out
 * of server HTML behind the gate. The gate itself is audited under Phase 1C;
 * mounting the real page directly does not change the markup being compared.
 */

// Network + socket boundaries only; every component in the tree stays real.
vi.mock('../lib/buyer-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/buyer-api')>()),
  fetchOrders: vi.fn(() => new Promise(() => {})),
  fetchMerchantCustomersCached: vi.fn(() => new Promise(() => {})),
  clearMerchantCustomersCache: vi.fn(),
}));

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  fetchMyStores: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../lib/merchant-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/merchant-store')>()),
  pickStore: vi.fn(() => undefined),
  rememberStoreId: vi.fn(),
}));

vi.mock('../lib/useMerchantRealtime', () => ({
  useMerchantRealtime: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
  return { useRouter: () => router, usePathname: () => '/merchant/orders', useParams: () => ({}) };
});

/** Collapse to a formatting-insensitive form: no comments, no whitespace. */
function normalizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/;(\s*})/g, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Every responsive rule the screen authored at the remediation baseline. */
const REQUIRED_ORDERS_DECLARATIONS = [
  '@media(max-width:768px)',
  '.mo-filterbar{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px}',
  '.mo-filterbar>*{flex:00auto}',
  '.mo-card-head{flex-direction:column!important;align-items:stretch!important}',
  '.mo-row-actions{justify-content:flex-start!important}',
];

function allSrcCss(): string {
  const src = resolve(__dirname, '..');
  const files: string[] = [];
  for (const entry of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    if (entry.endsWith('.css')) files.push(join(src, entry));
  }
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

afterEach(cleanupDocumentRoots);

const orders = asDocumentRoot(<MerchantOrdersPage />);

describe('Merchant orders document-root hydration', () => {
  it('hydrates the merchant orders document root without a recoverable error', async () => {
    const run = await hydrateDocumentRoot(orders);

    // Premise: the screen really did render, so a clean result is not vacuous.
    expect(run.prerenderedHtml).toContain('Merchant Orders');
    expectHydrationClean(run);
  });

  it('serves the orders filter-bar CSS without character-reference artifacts', async () => {
    const run = await hydrateDocumentRoot(orders);

    expect(styleBlocksWithArtifacts(run.prerenderedHtml)).toEqual([]);
  });

  it('keeps every orders-screen declaration in a stylesheet under src/', () => {
    const css = normalizeCss(allSrcCss());

    for (const declaration of REQUIRED_ORDERS_DECLARATIONS) {
      // Normalize both sides so the literals stay readable CSS.
      expect(css).toContain(normalizeCss(declaration));
    }
  });
});
