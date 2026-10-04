import { test, expect, type Page } from '@playwright/test';

/**
 * M7.3-C — Inventory Return-to-Stock end-to-end flows.
 *
 * Drives the NEW "Record return" surfaces through a real browser once the
 * backend is running against a seeded stack:
 *   1. Merchant return happy path          (web  /merchant/deliveries/:id)
 *   2. Admin return happy path             (admin /shipments/:id, Exceptions)
 *   3. LOST return rejection               (no return control for a LOST shipment)
 *   4. Partial return UI                   (return < remaining, remainder preserved)
 *   5. Buyer never sees RETURN_PROCESSED   (buyer tracking projection stays clean)
 *
 * Provisioning (Independent Runtime Verification environment — same contract as
 * ship-ops-flow.spec.ts; the spec never embeds credentials):
 *   E2E_RETURN=1                     opt-in (skipped otherwise)
 *   E2E_WEB_URL / E2E_ADMIN_URL      origins (see playwright.config.ts)
 *   E2E_STATE_ADMIN                  storageState for a platform admin
 *   E2E_STATE_MERCHANT               storageState for the owning merchant
 *   E2E_STATE_BUYER                  storageState for the buyer
 *   E2E_ADMIN_SHIPMENT_URL           admin shipment detail path at RTS_COMPLETED
 *   E2E_MERCHANT_DELIVERY_URL        merchant delivery detail path at RTS_COMPLETED (fresh)
 *   E2E_PARTIAL_DELIVERY_URL         merchant delivery detail path reserving >= 2 units
 *   E2E_LOST_SHIPMENT_URL            admin shipment detail path with a LOST exception
 *   E2E_BUYER_ORDER_URL              buyer order detail path for the returned order
 *
 * Each journey is pinned to its own already-prepared shipment so the suite stays
 * deterministic and idempotent; tests without their fixture path are skipped.
 */

const RUN = process.env['E2E_RETURN'] === '1';
const WEB = process.env['E2E_WEB_URL'] || 'http://localhost:3100';
const ADMIN = process.env['E2E_ADMIN_URL'] || 'http://localhost:3200';

/**
 * VR-UI-01: a recorded return is legitimately surfaced in TWO places on the
 * merchant delivery console — the ReturnPanel result line
 * ("Recorded return of N unit(s).") and the tracking-timeline event note
 * ("MERCHANT — Recorded return of N unit(s)"). A page-level text locator
 * therefore resolves to 2 elements and Playwright strict mode rejects it (and it
 * is timing-dependent on the timeline repaint). Each journey is scoped to the
 * <section> that owns it, addressed by its stable heading, so both surfaces are
 * asserted independently and deterministically.
 */
function panelOn(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });
}

async function openPage(browser: any, baseURL: string, state: string | undefined, path: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, storageState: state });
  const page = await ctx.newPage();
  await page.goto(path);
  return page;
}

test.describe('M7.3-C Inventory return flows', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!RUN, 'Set E2E_RETURN=1 with a provisioned stack to run');

  // 1. Merchant return happy path.
  test('merchant records a GOOD return and sees confirmation', async ({ browser }) => {
    const path = process.env['E2E_MERCHANT_DELIVERY_URL'];
    test.skip(!path, 'Provide E2E_MERCHANT_DELIVERY_URL (RTS_COMPLETED shipment)');
    const merchant = await openPage(browser, WEB, process.env['E2E_STATE_MERCHANT'], path!);
    const record = panelOn(merchant, 'Record return');
    const timeline = panelOn(merchant, 'Tracking timeline');
    await expect(record.getByRole('heading', { name: 'Record return' })).toBeVisible({ timeout: 15_000 });
    await expect(record.getByText(/warehouse is resolved from the original reservation/i)).toBeVisible();
    await record.getByRole('button', { name: 'Submit return' }).click();
    // 1. The ReturnPanel confirmation itself (not a page-wide text match).
    await expect(record.getByText(/Recorded return of \d+ unit\(s\)/)).toBeVisible({ timeout: 15_000 });
    // 2. The separate tracking-timeline echo of the same return, actor-prefixed.
    await expect(timeline.getByText(/MERCHANT\s*\u2014\s*Recorded return of \d+ unit\(s\)/)).toBeVisible({ timeout: 15_000 });
    await merchant.context().close();
  });

  // 2. Admin return happy path.
  test('admin records a return from the shipment console', async ({ browser }) => {
    const path = process.env['E2E_ADMIN_SHIPMENT_URL'];
    test.skip(!path, 'Provide E2E_ADMIN_SHIPMENT_URL (RTS_COMPLETED shipment)');
    const admin = await openPage(browser, ADMIN, process.env['E2E_STATE_ADMIN'], path!);
    await admin.getByRole('tab', { name: /Exceptions/ }).click();
    const section = admin.getByText('Inventory return (record return)');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await admin.getByRole('button', { name: 'Submit return' }).click();
    // A full return empties the remaining balance; the panel confirms all returned.
    await expect(admin.getByText(/all reserved units have already been returned/i)).toBeVisible({ timeout: 15_000 });
    await admin.context().close();
  });

  // 3. LOST return rejection — no return affordance is offered for a LOST shipment.
  test('LOST shipment offers no record-return control', async ({ browser }) => {
    const path = process.env['E2E_LOST_SHIPMENT_URL'];
    test.skip(!path, 'Provide E2E_LOST_SHIPMENT_URL (LOST exception shipment)');
    const admin = await openPage(browser, ADMIN, process.env['E2E_STATE_ADMIN'], path!);
    await admin.getByRole('tab', { name: /Exceptions/ }).click();
    await expect(admin.getByText('Inventory return (record return)')).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Submit return' })).toHaveCount(0);
    await admin.context().close();
  });

  // 4. Partial return UI — return fewer units than remaining, remainder preserved.
  test('merchant records a partial return, remainder stays returnable', async ({ browser }) => {
    const path = process.env['E2E_PARTIAL_DELIVERY_URL'];
    test.skip(!path, 'Provide E2E_PARTIAL_DELIVERY_URL (shipment reserving >= 2 units)');
    const merchant = await openPage(browser, WEB, process.env['E2E_STATE_MERCHANT'], path!);
    const record = panelOn(merchant, 'Record return');
    const timeline = panelOn(merchant, 'Tracking timeline');
    await expect(record.getByRole('heading', { name: 'Record return' })).toBeVisible({ timeout: 15_000 });
    const remaining = record.locator('table tbody tr').first().locator('td').nth(3);
    const before = Number((await remaining.innerText()).trim());
    test.skip(!(before >= 2), `Fixture needs >= 2 reserved units on a line (saw ${before})`);
    // Clamp the first quantity input to 1 (a partial of the remaining balance).
    const qty = record.locator('table tbody tr').first().locator('input[type="number"]');
    await qty.fill('1');
    await record.getByRole('button', { name: 'Submit return' }).click();
    // 1. The ReturnPanel confirmation is the one-row-per-return result surface.
    await expect(record.getByText(/Recorded return of 1 unit\(s\)/)).toBeVisible({ timeout: 15_000 });
    // 2. The timeline separately records the same partial return event.
    await expect(timeline.getByText(/MERCHANT\s*\u2014\s*Recorded return of 1 unit\(s\)/)).toBeVisible({ timeout: 15_000 });
    // After reload the remaining balance dropped by exactly one.
    await expect(record.locator('table tbody tr').first().locator('td').nth(3)).toHaveText(String(before - 1), { timeout: 15_000 });
    await merchant.context().close();
  });

  // 5. Buyer never sees the internal RETURN_PROCESSED event.
  test('buyer tracking hides RETURN_PROCESSED and internal return detail', async ({ browser }) => {
    const path = process.env['E2E_BUYER_ORDER_URL'];
    test.skip(!path, 'Provide E2E_BUYER_ORDER_URL (buyer order detail path)');
    const buyer = await openPage(browser, WEB, process.env['E2E_STATE_BUYER'], path!);
    // The buyer-safe projection may show a return-to-seller note, but never the
    // internal event name or raw return metadata.
    await expect(buyer.getByText(/RETURN_PROCESSED|return processed|recorded return|write-?off|inventoryItemId|fingerprint/i)).toHaveCount(0);
    await buyer.context().close();
  });
});
