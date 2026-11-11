import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import { cleanupDocumentRoots, hydrateDocumentRoot, servedStyleBlocks } from './document-root-harness';

/**
 * Phase 1A acceptance — moving the Admin global CSS reset into a stylesheet
 * preserves every declaration and leaves none of it inlined.
 *
 * Test 1 catches a declaration dropped or altered during the extraction; the
 * expected values are hand-written literals taken from the reset as it exists at
 * 09f6d7d5, normalized by removing comments and whitespace so formatting cannot
 * affect them. Test 2 catches the reset being *copied* rather than moved, which
 * would keep the hydration defect (React escaping `'Segoe UI'` into `&#x27;`
 * inside raw-text `<style>`) while adding a second, duplicated source of truth.
 */

const GLOBAL_CSS = resolve(__dirname, '../app/globals.css');

/** Collapse to a formatting-insensitive form: no comments, no whitespace. */
function normalizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/;(\s*})/g, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Every declaration of the reset as authored at the remediation baseline. */
const REQUIRED_RESET_DECLARATIONS = [
  '*,*::before,*::after{box-sizing:border-box}',
  'html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}',
  "body{margin:0;font-family:var(--font-inter),'Segoe UI',system-ui,-apple-system,sans-serif}",
  ':focus-visible{outline:3pxsolidrgba(30,97,120,0.35);outline-offset:2px}',
  '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}}',
  // Admin-specific, mandated to survive the move.
  '.admin-content{margin-left:var(--admin-sidebar-width,220px);min-height:100vh;transition:margin-left0.2sease}',
  '@media(max-width:1079px){.admin-content{margin-left:0}}',
];

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-inter-mock', className: '', style: {} }),
}));
vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
  return { useRouter: () => router, usePathname: () => '/' };
});

afterEach(cleanupDocumentRoots);

describe('Admin global stylesheet', () => {
  it('carries every declaration from the root-layout reset it replaced', () => {
    const css = normalizeCss(readFileSync(GLOBAL_CSS, 'utf8'));

    for (const declaration of REQUIRED_RESET_DECLARATIONS) {
      expect(css).toContain(declaration.replace(/\s+/g, '').toLowerCase());
    }
  });

  it('does not inline the global reset into the served document', async () => {
    const run = await hydrateDocumentRoot(
      <RootLayout>
        <div>content</div>
      </RootLayout>,
    );

    const inlined = normalizeCss(servedStyleBlocks(run.prerenderedHtml).join('\n'));

    expect(inlined).not.toContain('box-sizing:border-box');
    expect(inlined).not.toContain('font-family:var(--font-inter)');
  });
});
