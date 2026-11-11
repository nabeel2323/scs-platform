import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import AdminHomePage from '../app/page';
import {
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
  styleBlocksWithArtifacts,
} from './document-root-harness';

/**
 * Phase 1E (1) and (4) — the complete Admin document root hydrates without a
 * recoverable error, and a signed-out visitor never sees protected content.
 *
 * The break the first test catches: any server/client divergence at document
 * scope, which is what turned React #425 into #418 and #423 and made Next
 * replace the whole root. The known cause at the 09f6d7d5 baseline is the
 * `<style>` text child in `src/app/layout.tsx`: React escapes `'` to `&#x27;`,
 * a real HTML parser keeps it literal inside raw-text `<style>`, so the DOM
 * text no longer equals the React text child.
 *
 * Nothing here is simulated: the real root layout with the real `ToastProvider`,
 * `AuthGuard` and dashboard tree is prerendered, parsed by a real HTML parser
 * and hydrated at `document`, exactly as Next's client entry does.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));

// `next/font/google` is a Next build-time transform; the only thing the layout
// reads from it is the CSS-variable name, so a fixed stand-in keeps the font
// pipeline out of the test without changing what gets compared.
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter-mock', className: '', style: {} }),
}));

// Router identity is stable on purpose: AuthGuard's effect depends on it, and a
// fresh object per render would re-trigger the redirect on every commit.
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));

// Signed-out visitor: the polyfilled localStorage from setup.ts starts empty, so
// `restoreSession()` at import finds no admin session.
afterEach(cleanupDocumentRoots);

const dashboard = (
  <RootLayout>
    <AdminHomePage />
  </RootLayout>
);

describe('Admin document-root hydration', () => {
  it('hydrates the complete Admin document root without a recoverable error', async () => {
    expectHydrationClean(await hydrateDocumentRoot(dashboard));
  });

  it('serves application-authored style text without character-reference artifacts', async () => {
    const run = await hydrateDocumentRoot(dashboard);

    // The style blocks that reached the browser must contain no `&#x27;`,
    // `&quot;`, `&gt;`, `&lt;` or `&amp;` artifacts. A correctly authored
    // stylesheet has none, and a document with no app-authored `<style>` at all
    // also satisfies this — the point is the artifact, not the count.
    expect(styleBlocksWithArtifacts(run.prerenderedHtml)).toEqual([]);
  });

  it('keeps protected dashboard content out of the document while authentication is unknown', async () => {
    const run = await hydrateDocumentRoot(dashboard);

    // Server HTML: the gate holds.
    expect(run.prerenderedHtml).not.toContain('Pending Organization Updates');
    expect(run.prerenderedHtml).toContain('Checking authentication');
    // First client render and the effects that follow it: still gated, because
    // there is no session for `isAuthenticated()` to accept.
    expect(document.body.textContent).toContain('Checking authentication');
    expect(document.body.textContent).not.toContain('Pending Organization Updates');
    expect(router.push).toHaveBeenCalledWith('/auth/login');
  });
});
