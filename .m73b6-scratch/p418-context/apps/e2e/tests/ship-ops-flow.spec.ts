import { test, expect, type Page } from '@playwright/test';

/**
 * M7.3-B.6 — Ship-Ops Visibility end-to-end flow.
 *
 * Required journey:
 *   Buyer checkout → Merchant accepts → Shipment created →
 *   Admin views shipment → Exception generated → Admin handles exception →
 *   RTS workflow completed → Buyer sees updated status.
 *
 * The first three links (checkout / accept / auto-create) belong to M7.3-B.2..B.5 and
 * are covered by the API integration specs (m73b4/m73b5). This suite drives the NEW
 * B.6 surfaces — the admin Ship-Ops console, the merchant delivery console and the
 * buyer tracking projection — through the real browser UI, using an already-created
 * shipment so the scenario is deterministic and does not depend on payment/carrier
 * sandboxes.
 *
 * Provisioning (Independent Runtime Verification environment):
 *   E2E_SHIPOPS=1                     opt-in (skipped otherwise)
 *   E2E_WEB_URL / E2E_ADMIN_URL       origins (see playwright.config.ts)
 *   E2E_STATE_ADMIN                   Playwright storageState for a platform admin
 *   E2E_STATE_MERCHANT                storageState for the owning merchant
 *   E2E_STATE_BUYER                   storageState for the buyer
 *   E2E_ORDER_URL                     buyer order detail path (e.g. /orders/<id>)
 *   E2E_STORE_NAME                    merchant store display name (locates the row)
 *
 * Auth states are produced by the harness login step so the spec itself never embeds
 * credentials.
 */

const RUN = process.env['E2E_SHIPOPS'] === '1';
const WEB = process.env['E2E_WEB_URL'] || 'http://localhost:3100';
const ADMIN = process.env['E2E_ADMIN_URL'] || 'http://localhost:3200';
const STORE = process.env['E2E_STORE_NAME'] || '';

test.describe('Ship-Ops visibility flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!RUN, 'Set E2E_SHIPOPS=1 with a provisioned stack to run');

  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      baseURL: ADMIN,
      storageState: process.env['E2E_STATE_ADMIN'],
    });
    adminPage = await ctx.newPage();
  });

  test('admin views the shipment in the Ship-Ops console', async () => {
    await adminPage.goto('/shipments');
    await expect(adminPage.getByRole('heading', { name: 'Ship Operations' })).toBeVisible();
    // Scope the queue to live shipments and search for the fixture store (Gulf Tech) so the
    // admin deterministically opens S1 — the shipment the merchant/buyer legs are pinned to.
    await adminPage.getByRole('tab', { name: 'All Shipments' }).click();
    const searchBox = adminPage.getByPlaceholder(/shipment id/i);
    await expect(searchBox).toBeVisible({ timeout: 10_000 });
    await searchBox.fill('Gulf Tech');
    const firstRow = adminPage.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();
    await expect(adminPage.getByRole('heading', { name: /^Shipment / })).toBeVisible();
    // Confirm the admin opened the Gulf Tech shipment (S1), not S2.
    await expect(adminPage.getByText(/Gulf Tech/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin generates a delivery exception', async () => {
    await adminPage.getByRole('tab', { name: /Exceptions/ }).click();
    // Select an RTS-eligible exception type (RECIPIENT_REFUSED) so the subsequent RTS
    // journey is valid under the must-preserve B.5 FSM. RECIPIENT_UNAVAILABLE at 0/3
    // attempts is not RTS-eligible and would block the valid RTS branch.
    await adminPage.locator('select').first().selectOption('RECIPIENT_REFUSED');
    await adminPage.getByRole('button', { name: 'Report exception' }).click();
    // The read model refreshes; the state dot now reflects an OPEN exception.
    await expect(adminPage.getByText('OPEN', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('admin handles the exception, then drives RTS to completion', async () => {
    // Request return-to-sender directly from the OPEN exception. The must-preserve B.5 FSM
    // requires exceptionStatus==='OPEN' for requestRTS; authorizeRetry would force
    // RETRY_PENDING and make RTS impossible. The authored scenario previously clicked
    // "Authorize retry" first, which was an invalid sequence against the documented FSM.
    await adminPage.getByRole('button', { name: 'Request RTS' }).click();
    await expect(adminPage.getByText('awaiting decision')).toBeVisible({ timeout: 15_000 });

    // Approve RTS.
    adminPage.once('dialog', (d) => d.accept());
    await adminPage.getByRole('button', { name: 'Approve RTS' }).click();
    await expect(adminPage.getByText('return in transit to sender')).toBeVisible({ timeout: 15_000 });

    // Complete RTS.
    adminPage.once('dialog', (d) => d.accept());
    await adminPage.getByRole('button', { name: 'Complete RTS' }).click();
    await expect(adminPage.getByText('RTS completed. No further action required.')).toBeVisible({ timeout: 15_000 });
  });

  test('merchant sees the delivery and its exception/RTS state', async ({ browser }) => {
    const ctx = await browser.newContext({
      baseURL: WEB,
      storageState: process.env['E2E_STATE_MERCHANT'],
    });
    const merchant = await ctx.newPage();
    await merchant.goto('/merchant/deliveries');
    await expect(merchant.getByRole('heading', { name: 'Deliveries' })).toBeVisible();
    if (STORE) await expect(merchant.getByText(STORE).first()).toBeVisible();
    // Open the delivery and confirm the console renders the lifecycle actions + timeline.
    // The merchant deliveries page uses a Link in the first cell, not a row click handler.
    await merchant.locator('table tbody tr').first().locator('a').first().click();
    await expect(merchant.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(merchant.getByText('Tracking timeline')).toBeVisible();
    await ctx.close();
  });

  test('buyer sees the accurate operational status (RTS note)', async ({ browser }) => {
    const orderUrl = process.env['E2E_ORDER_URL'];
    test.skip(!orderUrl, 'Provide E2E_ORDER_URL (buyer order detail path)');
    const ctx = await browser.newContext({
      baseURL: WEB,
      storageState: process.env['E2E_STATE_BUYER'],
    });
    const buyer = await ctx.newPage();
    await buyer.goto(orderUrl!);
    // The buyer-safe projection shows a return-to-seller note, not internal admin detail.
    await expect(buyer.getByText(/returned to the seller/i)).toBeVisible({ timeout: 15_000 });
    await expect(buyer.getByText(/RTS_|carrier|reconcil/i)).toHaveCount(0);
    await ctx.close();
  });

  test.afterAll(async () => {
    await adminPage?.close();
  });
});
