import type { Product, ProductStore } from './buyer-api';

type SearchCardProduct = Pick<
  Product,
  | 'store'
  | 'storeId'
  | 'priceFromMinor'
  | 'priceCurrency'
  | 'lowestOfferPriceMinor'
  | 'lowestOfferCurrency'
  | 'lowestOfferId'
  | 'lowestOfferStoreId'
  | 'lowestOfferVariantId'
  | 'lowestOfferMoq'
  | 'lowestOfferStore'
>;

export interface SearchCardDisplay {
  priceMinor: number | null;
  currency: string | null;
  seller: ProductStore | null;
  usesOffer: boolean;
  offerId: string | null;
  offerStoreId: string | null;
  offerVariantId: string | null;
  offerMoq: number | null;
}

/**
 * Keep the card's displayed price, seller identity and cart offer selection
 * tied to the same source. Minor-unit values are compared only when currencies
 * match; canonical products can use a sole-currency offer because they have no
 * owner price to compare against.
 */
export function getSearchCardDisplay(product: SearchCardProduct): SearchCardDisplay {
  const hasSelectableOffer = Boolean(
    product.lowestOfferId &&
    product.lowestOfferStoreId &&
    product.lowestOfferPriceMinor != null &&
    product.lowestOfferCurrency,
  );
  const offerIsComparableAndCheaper =
    product.priceFromMinor == null ||
    (product.priceCurrency != null &&
      product.lowestOfferCurrency === product.priceCurrency &&
      product.lowestOfferPriceMinor != null &&
      product.lowestOfferPriceMinor < product.priceFromMinor);
  const usesOffer = hasSelectableOffer && offerIsComparableAndCheaper;

  return {
    priceMinor: usesOffer
      ? (product.lowestOfferPriceMinor ?? null)
      : (product.priceFromMinor ?? null),
    currency: usesOffer ? (product.lowestOfferCurrency ?? null) : (product.priceCurrency ?? null),
    seller: usesOffer ? (product.lowestOfferStore ?? null) : (product.store ?? null),
    usesOffer,
    offerId: usesOffer ? (product.lowestOfferId ?? null) : null,
    offerStoreId: usesOffer ? (product.lowestOfferStoreId ?? null) : null,
    offerVariantId: usesOffer ? (product.lowestOfferVariantId ?? null) : null,
    offerMoq: usesOffer ? (product.lowestOfferMoq ?? null) : null,
  };
}
