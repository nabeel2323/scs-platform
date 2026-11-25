import { describe, expect, it } from 'vitest';
import { computeCheckoutTotalsByCurrency } from '../lib/checkout-currency';

describe('computeCheckoutTotalsByCurrency', () => {
  it('combines item and selected shipping amounts in the same currency', () => {
    expect(
      computeCheckoutTotalsByCurrency(
        [
          { lineTotalMinor: 2500, currency: 'SAR' },
          { lineTotalMinor: 500, currency: 'sar' },
        ],
        [
          {
            shippingMethodId: 'ship-1',
            estimate: { methods: [{ methodId: 'ship-1', feeMinor: 300, currency: 'SAR' }] },
          },
        ],
      ),
    ).toEqual({ totalsByCurrency: { SAR: 3300 }, hasUnpricedAmounts: false });
  });

  it('keeps mixed supplier currencies in separate totals', () => {
    expect(
      computeCheckoutTotalsByCurrency(
        [
          { lineTotalMinor: 2500, currency: 'SAR' },
          { lineTotalMinor: 1200, currency: 'USD' },
        ],
        [],
      ),
    ).toEqual({ totalsByCurrency: { SAR: 2500, USD: 1200 }, hasUnpricedAmounts: false });
  });

  it('uses the selected delivery method currency rather than the cart currency', () => {
    expect(
      computeCheckoutTotalsByCurrency(
        [{ lineTotalMinor: 2500, currency: 'SAR' }],
        [
          {
            shippingMethodId: 'ship-usd',
            estimate: { methods: [{ methodId: 'ship-usd', feeMinor: 500, currency: 'USD' }] },
          },
        ],
      ),
    ).toEqual({ totalsByCurrency: { SAR: 2500, USD: 500 }, hasUnpricedAmounts: false });
  });

  it('does not invent a currency for missing item or shipping currency', () => {
    expect(
      computeCheckoutTotalsByCurrency(
        [{ lineTotalMinor: 2500, currency: null }],
        [
          {
            shippingMethodId: 'ship-unknown',
            estimate: { methods: [{ methodId: 'ship-unknown', feeMinor: 200 }] },
          },
        ],
      ),
    ).toEqual({ totalsByCurrency: {}, hasUnpricedAmounts: true });
  });

  it('does not add a pickup fee', () => {
    expect(
      computeCheckoutTotalsByCurrency(
        [{ lineTotalMinor: 2500, currency: 'SAR' }],
        [
          {
            fulfillmentMethod: 'PICKUP',
            shippingMethodId: 'ship-1',
            estimate: { methods: [{ methodId: 'ship-1', feeMinor: 300, currency: 'SAR' }] },
          },
        ],
      ),
    ).toEqual({ totalsByCurrency: { SAR: 2500 }, hasUnpricedAmounts: false });
  });
});
