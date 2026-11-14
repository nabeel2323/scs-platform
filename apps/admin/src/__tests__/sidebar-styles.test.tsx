import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from '../components/AdminSidebar';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
  styleBlocksWithArtifacts,
} from './document-root-harness';

/**
 * Phase 1D acceptance — the admin sidebar ships its CSS as a stylesheet, not as
 * React text.
 *
 * Test 1 catches the defect the way a browser sees it: the sidebar renders
 * `<style>{…}` containing `.admin-sidebar-link[data-active="true"]`, React
 * escapes the double quotes into `&quot;`, a real HTML parser leaves them
 * literal inside raw-text `<style>`, and hydration fails with #425 → #418 →
 * #423. Test 2 catches the rules being deleted instead of moved, so the active
 * link highlight, the scrollbar width and the collapsed tooltip cannot quietly
 * disappear along with the defect.
 *
 * The stylesheet assertion deliberately searches every CSS file under `src/`,
 * so the remediation may place the rules wherever they belong.
 */

vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
  return { useRouter: () => router, usePathname: () => '/' };
});

/** Collapse to a formatting-insensitive form: no comments, no whitespace. */
function normalizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/;(\s*})/g, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Every sidebar declaration as authored at the remediation baseline. */
const REQUIRED_SIDEBAR_DECLARATIONS = [
  '.admin-sidebar-nav::-webkit-scrollbar{width:4px}',
  '.admin-sidebar-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}',
  '.admin-sidebar-link{display:flex;align-items:center;gap:10px;text-decoration:none;transition:background0.15sease,color0.15sease;position:relative}',
  '.admin-sidebar-link:hover{background:rgba(255,255,255,0.08)}',
  '.admin-sidebar-link[data-active="true"]{background:rgba(255,255,255,0.12)}',
  ".admin-sidebar-link[data-active=\"true\"]::before{content:'';position:absolute;left:0;top:4px;bottom:4px;width:3px;background:#38bdf8;border-radius:02px2px0}",
  '.admin-sidebar-tooltip{display:none;position:absolute;left:calc(100%+8px);top:50%;transform:translateY(-50%);background:#0c2831;color:#fff;font-size:12px;padding:4px10px;border-radius:4px;white-space:nowrap;z-index:1001;pointer-events:none;box-shadow:02px8pxrgba(0,0,0,0.2)}',
  '.admin-sidebar-collapsed .admin-sidebar-link:hover .admin-sidebar-tooltip{display:block}',
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

describe('Admin sidebar CSS', () => {
  it('serves the sidebar style rules without character-reference artifacts', async () => {
    const run = await hydrateDocumentRoot(asDocumentRoot(<AdminSidebar />));

    // The only text the sidebar puts inside a raw-text element is this
    // stylesheet, so its served form must contain no escaped reference at all.
    expect(styleBlocksWithArtifacts(run.prerenderedHtml)).toEqual([]);
    expectHydrationClean(run);
  });

  it('keeps every sidebar declaration in a stylesheet under src/', () => {
    const css = normalizeCss(allSrcCss());

    for (const declaration of REQUIRED_SIDEBAR_DECLARATIONS) {
      // Normalize both sides: the literals stay readable CSS, the comparison
      // stays formatting- and case-insensitive (CSS property names such as
      // `translateY` are case-insensitive in a style sheet).
      expect(css).toContain(normalizeCss(declaration));
    }
  });
});
