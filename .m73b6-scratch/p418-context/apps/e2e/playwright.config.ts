import { defineConfig, devices } from '@playwright/test';

/**
 * M7.3-B.6 — Playwright configuration for the Ship-Ops Visibility suites.
 *
 * The end-to-end flow spans THREE surfaces, each served on its own origin:
 *   - buyer + merchant  → @scs/web    (default http://localhost:3100)
 *   - platform admin     → @scs/admin  (default http://localhost:3200)
 *   - the API            → @scs/api    (default http://localhost:3000)
 *
 * Services are expected to be running (the launch/test guide starts them). This
 * config intentionally does NOT auto-boot webServers, because the flow requires a
 * seeded database and the full API stack; that orchestration belongs to the
 * Independent Runtime Verification environment. Override with env vars:
 *   E2E_WEB_URL, E2E_ADMIN_URL, E2E_API_URL, and the fixture credentials below.
 */
const WEB = process.env['E2E_WEB_URL'] || 'http://localhost:3100';
const ADMIN = process.env['E2E_ADMIN_URL'] || 'http://localhost:3200';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // the ship-ops flow is a single ordered scenario over shared state
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      // A single ordered scenario; each role context sets its own baseURL explicitly,
      // so no project-level baseURL is required.
      name: 'ship-ops',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
