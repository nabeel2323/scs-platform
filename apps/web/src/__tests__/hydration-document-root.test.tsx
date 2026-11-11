import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import HomePage from '../app/page';
import {
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
  styleBlocksWithArtifacts,
} from './document-root-harness';

/**
 * Phase 1E (1), (2) and (6) — the complete Buyer document root hydrates
 * without a recoverable error.
 *
 * The break these tests catch: any server/client divergence at document scope.
 * At the 09f6d7d5 baseline `src/app/layout.tsx` puts the global CSS reset in a
 * `<style>` text child, React escapes the apostrophes around `'Segoe UI'` to
 * `&#x27;`, and a real HTML parser will not decode character references inside
 * raw-text `<style>` — so the browser's DOM text no longer equals the React
 * text child and hydration fails with #425 → #418 → #423.
 *
 * The `<html suppressHydrationWarning>` the layout carries today does *not*
 * cover the `<head>` subtree, so these failures are not masked here; they are
 * reproduced exactly as a browser sees them.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter-mock', className: '', style: {} }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanupDocumentRoots);

const home = (
  <RootLayout>
    <HomePage />
  </RootLayout>
);

describe('Buyer document-root hydration', () => {
  it('hydrates the complete Buyer document root without a recoverable error', async () => {
    expectHydrationClean(await hydrateDocumentRoot(home));
  });

  it('serves application-authored style text without character-reference artifacts', async () => {
    const run = await hydrateDocumentRoot(home);

    expect(styleBlocksWithArtifacts(run.prerenderedHtml)).toEqual([]);
  });

  it('hydrates the home page document root when the browser timezone differs from the server', async () => {
    const run = await hydrateDocumentRoot(home, {
      beforePrerender: () => {
        process.env['TZ'] = 'UTC';
      },
      beforeHydrate: () => {
        process.env['TZ'] = 'Asia/Riyadh';
      },
    });

    expectHydrationClean(run);
  });
});
