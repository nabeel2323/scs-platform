import { describe, expect, it } from 'vitest';
import { getSearchCardDisplay } from '../lib/search-card-offer';
import type { ProductStore } from '../lib/buyer-api';

const ownerStore: ProductStore = {
  id: 'store-owner',
  displayName: 'Owner Store',
  name: 'Owner Store',
  slug: 'owner-store',
  currency: 'SAR',
  verificationStatus: 'VERIFIED',
  status: 'ACTIVE',
};

const offerStore: ProductStore = {
  id: 'store-offer',
  displayName: 'Offer Store',
  name: 'Offer Store',
  slug: 'offer-store',
  currency: 'SAR',
  verificationStatus: 'VERIFIED',
  status: 'ACTIVE',
};

const baseProduct = {
  store: ownerStore,
  storeId: 'store-owner',
  priceFromMinor: 1000,
  priceCurrency: 'SAR',
  lowestOfferPriceMinor: 900,
  lowestOfferCurrency: 'SAR',
  lowestOfferId: 'offer-1',
  lowestOfferStoreId: 'store-offer',
  lowestOfferVariantId: 'variant-1',
  lowestOfferMoq: 5,
  lowestOfferStore: offerStore,
};

describe('getSearchCardDisplay', () => {
  it('selects the cheaper same-currency offer and its seller identity', () => {
    expect(getSearchCardDisplay(baseProduct)).toEqual({
      priceMinor: 900,
      currency: 'SAR',
      seller: offerStore,
      usesOffer: true,
      offerId: 'offer-1',
      offerStoreId: 'store-offer',
      offerVariantId: 'variant-1',
      offerMoq: 5,
    });
  });

  it('keeps the product owner price when the offer is in another currency', () => {
    const display = getSearchCardDisplay({
      ...baseProduct,
      lowestOfferCurrency: 'USD',
      lowestOfferPriceMinor: 500,
    });

    expect(display.priceMinor).toBe(1000);
    expect(display.currency).toBe('SAR');
    expect(display.seller).toBe(ownerStore);
    expect(display.usesOffer).toBe(false);
    expect(display.offerId).toBeNull();
  });

  it('uses a sole-currency offer for a canonical product with no owner price', () => {
    const display = getSearchCardDisplay({
      ...baseProduct,
      store: null,
      storeId: null,
      priceFromMinor: null,
      priceCurrency: null,
      lowestOfferCurrency: 'USD',
      lowestOfferStore: { ...offerStore, currency: 'USD' },
    });

    expect(display.priceMinor).toBe(900);
    expect(display.currency).toBe('USD');
    expect(display.usesOffer).toBe(true);
    expect(display.offerId).toBe('offer-1');
  });

  it('does not select an offer without a concrete offer id and seller id', () => {
    const display = getSearchCardDisplay({
      ...baseProduct,
      lowestOfferId: null,
    });

    expect(display.priceMinor).toBe(1000);
    expect(display.seller).toBe(ownerStore);
    expect(display.usesOffer).toBe(false);
  });
});
