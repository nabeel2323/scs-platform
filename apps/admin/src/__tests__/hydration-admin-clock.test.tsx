import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminHomePage from '../app/page';
import {
  asDocumentRoot,
  cleanupDocumentRoots,
  expectHydrationClean,
  hydrateDocumentRoot,
} from './document-root-harness';

/**
 * Phase 1E (3) and (6) — the Admin dashboard clock is hydration-safe.
 *
 * `src/app/page.tsx` computes `const now = new Date()` during render, so the
 * server's string and the browser's first-render string diverge whenever wall
 * time crosses a minute between the two passes, or whenever the browser's
 * timezone/locale formats differently from the server's. Both were reproduced
 * against the 09f6d7d5 baseline: a 66-second gap alone produced React #425 →
 * #418 → #423 and a full root replacement.
 *
 * The dashboard is rendered at document scope rather than through `RootLayout`
 * because `AuthGuard` keeps it out of server HTML until an effect opens the
 * gate — that gate is what makes this defect latent today, and it is audited
 * separately under Phase 1C. Bypassing the gate does not bypass the code under
 * test: the real `AdminHomePage` and the real `PageHeader` are prerendered,
 * parsed by a real HTML parser and hydrated at `document`.
 */

// The two dashboard data calls are the slow/external layer; leaving them
// pending keeps the KPI cells on their '—' loading text, so the only
// server/client-dependent output is the clock.
vi.mock('../lib/api', () => ({
  fetchKpis: () => new Promise(() => {}),
  fetchAdminOrgUpdateRequests: () => new Promise(() => {}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

const ORIGINAL_TZ = process.env['TZ'];

/** 2026-03-14T18:33:01Z formats to this exact string when TZ=UTC — hand-checked. */
const BROWSER_DATE_LABEL = 'Saturday, March 14, 2026';
const BROWSER_TIME_LABEL = '06:33 PM';
/** A dashboard landmark that is in server HTML with or without the clock. */
const DASHBOARD_LANDMARK = 'Total Users';

beforeEach(() => {
  // UTC pins the expected strings; the suites below reintroduce a non-UTC
  // browser deliberately.
  process.env['TZ'] = 'UTC';
});

afterEach(() => {
  cleanupDocumentRoots();
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

describe('Admin dashboard clock hydration', () => {
  it('hydrates the dashboard document root after 61 seconds of elapsed wall time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    const run = await hydrateDocumentRoot(asDocumentRoot(<AdminHomePage />), {
      beforePrerender: () => vi.setSystemTime(new Date('2026-03-14T18:32:00Z')),
      beforeHydrate: () => vi.setSystemTime(new Date('2026-03-14T18:33:01Z')),
    });

    expect(run.prerenderedHtml).toContain(DASHBOARD_LANDMARK);
    expectHydrationClean(run);
  });

  it('hydrates the dashboard document root when the browser timezone differs from the server', async () => {
    const run = await hydrateDocumentRoot(asDocumentRoot(<AdminHomePage />), {
      beforePrerender: () => {
        process.env['TZ'] = 'UTC';
      },
      beforeHydrate: () => {
        process.env['TZ'] = 'Asia/Riyadh';
      },
    });

    // The server formatted its instant in UTC; a Riyadh browser formats the
    // same instant three hours later, which is a text mismatch at the root.
    expect(run.prerenderedHtml).toContain(DASHBOARD_LANDMARK);
    expectHydrationClean(run);
  });

  it('shows the mounted browser date and time on the dashboard', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });

    const run = await hydrateDocumentRoot(asDocumentRoot(<AdminHomePage />), {
      beforePrerender: () => vi.setSystemTime(new Date('2026-03-14T18:32:00Z')),
      beforeHydrate: () => vi.setSystemTime(new Date('2026-03-14T18:33:01Z')),
    });

    // The clock stays functional: after mounting, the visitor's own date and
    // time are on screen — not blank, and not the stale server value.
    expect(document.body.textContent).toContain(BROWSER_DATE_LABEL);
    expect(document.body.textContent).toContain(BROWSER_TIME_LABEL);
    expectHydrationClean(run);
  });
});
