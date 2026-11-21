import { and, eq, inArray, asc } from 'drizzle-orm';
import { productVariants, productMedia } from './catalog.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import { inventoryItems } from '../inventory/inventory.schema';
import { resolveOfferPrices, resolveSelectedOfferPrices, selectedOfferPriceKey, type OfferPriceSource, type VariantPricing } from '../pricing/price-resolution';
import type { DatabaseService } from '../../common/database/database.service';
import type { StorageService } from '../../common/storage/storage.service';
import { imageReferences, isProductMediaKey } from './product-images';
import { merchantOffers } from './catalog.offer.schema';

/**
 * Listing-card enrichment (A5-2).
 *
 * A search hit is a *product*, but price lives on its variants and the seller
 * lives on its store, so a card that shows neither cannot be compared — which is
 * the whole point of a B2B listing. This attaches both in as few reads as
 * possible, and prices through the same resolver the cart uses (`ladder: false`,
 * since a card only needs one number) so a listed price is never cheaper than
 * what the buyer is charged.
 */

/** Structural alias for `databaseService.db`. */
type Db = DatabaseService['db'];

/** The minimum an item must carry to be enrichable. */
export interface CardSource {
  id: string;
  storeId: string | null;
  moq: number | null;
}

export interface StoreCard {
  id: string;
  displayName: string;
  name: string;
  slug: string;
  verificationStatus: string;
  currency: string;
  status: string;
}

export interface CardEnrichment {
  /** Null when the seller row is missing — a card is never dropped for that. */
  store: StoreCard | null;
  /**
   * Lowest tier price across the product's active variants, each evaluated at
   * that variant's own product MOQ. Null when no active price list covers them
   * (the cart would reject such a line, so the card shows no price rather than a
   * misleading one).
   */
  priceFromMinor: number | null;
  priceCurrency: string | null;
  /**
   * Aggregate stock status across all store warehouses for the product's active
   * variants. 'IN_STOCK' if any variant has available stock, 'LOW_STOCK' if max
   * available is between 1 and 10, 'OUT_OF_STOCK' otherwise.
   */
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  /**
   * Browser-renderable card image: the product's first image reference resolved
   * through object storage (signed GET) or passed through when already a full
   * URL. Null when the product has no renderable image — the client then shows
   * its placeholder rather than a broken <img>.
   */
  imageUrl: string | null;
  /**
   * Number of ACTIVE and available merchant offers for this product (across all stores).
   * Zero when the product has no competing offers — the buyer then knows the
   * product-owner's price is the only one available.
   */
  activeOfferCount: number;
  /**
   * Lowest available offer in the product price currency (or the sole offer
   * currency for canonical products without an owner price). Never compares
   * minor units across currencies. Null when no safe comparable offer exists.
   */
  lowestOfferPriceMinor: number | null;
  lowestOfferCurrency: string | null;
  lowestOfferId: string | null;
  lowestOfferStoreId: string | null;
  lowestOfferVariantId: string | null;
  lowestOfferMoq: number | null;
  lowestOfferOrderIncrement: number | null;
  lowestOfferStore: StoreCard | null;
}

/**
 * Turn a stored media reference into a URL a browser can render.
 *
 * Media columns hold either full URLs (already-hosted images) or object-storage
 * keys like `products/{uuid}/{file}`. Only keys are signed; failures resolve to
 * null so callers can fall back to a placeholder. Shared by card enrichment and
 * the media endpoints so every surface agrees on what is renderable.
 */
export function createMediaRefResolver(storage: StorageService): (ref: string | null | undefined) => Promise<string | null> {
  return async (ref: string | null | undefined): Promise<string | null> => {
    const trimmed = (ref ?? '').trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (!isProductMediaKey(trimmed)) return null;
    try {
      return await storage.createPresignedGetUrl(
        process.env['S3_MEDIA_BUCKET'] || 'scs-media',
        trimmed,
      );
    } catch {
      return null;
    }
  };
}

export async function enrichProductCards<T extends CardSource>(
  db: Db,
  items: T[],
  opts?: { resolveImage?: (ref: string) => Promise<string | null> },
): Promise<Array<T & CardEnrichment>> {
  if (items.length === 0) return [];

  type OfferCardRow = {
    id: string;
    productId: string;
    storeId: string;
    variantId: string | null;
    basePriceMinor: number | null;
    currency: string;
    moq: number;
    orderIncrement: number | null;
    priceListId: string | null;
  };

  // Fetch the offer identity together with its display price. The exact row
  // selected here is also the row the search card will submit to the cart.
  let offerRows: OfferCardRow[] = [];
  try {
    offerRows = await db.query.merchantOffers.findMany({
      where: and(
        inArray(merchantOffers.productId, items.map(item => item.id)),
        eq(merchantOffers.status, 'ACTIVE'),
        eq(merchantOffers.isAvailable, true),
      ),
      columns: {
        id: true,
        productId: true,
        storeId: true,
        variantId: true,
        basePriceMinor: true,
        currency: true,
        moq: true,
        orderIncrement: true,
        priceListId: true,
      },
      orderBy: [asc(merchantOffers.activatedAt), asc(merchantOffers.id)],
    }) as OfferCardRow[];
  } catch {
    // Offer table may not exist in all environments (e.g. test mocks).
  }

  const storeIds = [...new Set([
    ...items.map(item => item.storeId).filter((s): s is string => !!s),
    ...offerRows.map(offer => offer.storeId),
  ])];
  const storeRows =
    storeIds.length > 0
      ? await db.query.stores.findMany({
          where: inArray(stores.id, storeIds),
          columns: {
            id: true,
            displayName: true,
            slug: true,
            verificationStatus: true,
            currency: true,
            status: true,
          },
        })
      : [];
  const storeById = new Map<string, StoreCard>();
  for (const row of storeRows) {
    storeById.set(row['id'], {
      id: row['id'],
      displayName: row['displayName'],
      name: row['displayName'],
      slug: row['slug'],
      verificationStatus: row['verificationStatus'],
      currency: row['currency'],
      status: row['status'],
    });
  }

  const variantRows = await db.query.productVariants.findMany({
    where: and(
      inArray(
        productVariants.productId,
        items.map(item => item.id),
      ),
      eq(productVariants.isActive, true),
    ),
    columns: { id: true, productId: true },
  });
  const variantsByProduct = new Map<string, string[]>();
  for (const row of variantRows) {
    const productId = row['productId'];
    const existing = variantsByProduct.get(productId);
    if (existing) existing.push(row['id']);
    else variantsByProduct.set(productId, [row['id']]);
  }

  // Resolve every selectable offer at its own MOQ using the same exact-offer
  // pricing function used by the cart. A product-level offer is pinned to the
  // first active variant here and that concrete variant is returned to the UI.
  const offerRequests = offerRows.flatMap(row => {
    const activeVariantIds = variantsByProduct.get(row.productId) ?? [];
    const variantId = row.variantId
      ? (activeVariantIds.includes(row.variantId) ? row.variantId : null)
      : (activeVariantIds[0] ?? null);
    return variantId
      ? [{ offerId: row.id, variantId, quantity: row.moq }]
      : [];
  });
  const resolvedOffers = await resolveSelectedOfferPrices(
    db,
    offerRows.map(row => ({
      ...row,
      status: 'ACTIVE',
      isAvailable: true,
    })) as OfferPriceSource[],
    offerRequests,
  );
  const offerRequestById = new Map(offerRequests.map(request => [request.offerId, request]));

  const offerByProduct = new Map<string, {
    count: number;
    lowestByCurrency: Map<string, OfferCardRow>;
  }>();
  for (const row of offerRows) {
    const entry = offerByProduct.get(row.productId);
    if (entry) entry.count++;
    else offerByProduct.set(row.productId, { count: 1, lowestByCurrency: new Map() });

    const request = offerRequestById.get(row.id);
    const resolved = request
      ? resolvedOffers.get(selectedOfferPriceKey(request.offerId, request.variantId, request.quantity))
      : undefined;
    if (!resolved) continue;
    const pricedRow: OfferCardRow = {
      ...row,
      variantId: resolved.variantId,
      basePriceMinor: resolved.unitPriceMinor,
      currency: resolved.currency,
    };
    const productEntry = offerByProduct.get(row.productId)!;
    const previous = productEntry.lowestByCurrency.get(resolved.currency);
    if (previous == null || resolved.unitPriceMinor < (previous.basePriceMinor ?? Infinity)) {
      productEntry.lowestByCurrency.set(resolved.currency, pricedRow);
    }
  }


  // Price is resolved per (store, quantity). MOQ is now offer-owned, so we
  // resolve at quantity=1 (base tier) for display cards. The cart uses the
  // actual offer MOQ during checkout. One batch per store keeps queries minimal.
  const variantIdsByBatch = new Map<string, string[]>();
  for (const item of items) {
    if (!item.storeId) continue; // canonical products without a store have no pricing
    const variantIds = variantsByProduct.get(item.id);
    if (!variantIds || variantIds.length === 0) continue;
    const key = `${item.storeId}|1`;
    const batch = variantIdsByBatch.get(key);
    if (batch) variantIdsByBatch.set(key, [...batch, ...variantIds]);
    else variantIdsByBatch.set(key, [...variantIds]);
  }

  const pricesByBatch = new Map<string, Map<string, VariantPricing>>();
  for (const [key, variantIds] of variantIdsByBatch) {
    const separator = key.lastIndexOf('|');
    const storeId = key.slice(0, separator);
    const quantity = Number(key.slice(separator + 1));
    pricesByBatch.set(
      key,
      await resolveOfferPrices(db, storeId, variantIds, quantity, { ladder: false }),
    );
  }

  // Batch-fetch stock data for all products' variants across their store warehouses
  const stockByProduct = new Map<string, 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'>();
  try {
    const storeIdsForStock = [...new Set(items.map(i => i.storeId).filter((s): s is string => !!s))];
    const allWhs = storeIdsForStock.length > 0
      ? await db.query.warehouses.findMany({
          where: inArray(warehouses.storeId, storeIdsForStock),
          columns: { id: true, storeId: true },
        })
      : [];
    // Filter warehouses to only those belonging to the product stores
    const relevantWhs = allWhs.filter(w => storeIdsForStock.includes(w['storeId']));
    if (relevantWhs.length > 0) {
      const whIds = relevantWhs.map(w => w.id);
      const allVariantIds = [...new Set(variantRows.map(v => v.id))];
      if (allVariantIds.length > 0) {
        const invRows = await db.query.inventoryItems.findMany({
          where: and(
            inArray(inventoryItems.warehouseId, whIds),
            inArray(inventoryItems.variantId, allVariantIds),
          ),
          columns: { variantId: true, qtyOnHand: true, qtyReserved: true },
        });
        // Group available stock by variant
        const stockByVariant = new Map<string, number>();
        for (const row of invRows) {
          const vid = row.variantId;
          const prev = stockByVariant.get(vid) ?? 0;
          stockByVariant.set(vid, prev + (row.qtyOnHand - row.qtyReserved));
        }
        // Compute per-product stock status
        for (const item of items) {
          const pVariantIds = variantsByProduct.get(item.id) ?? [];
          const totalAvailable = pVariantIds.reduce((sum, vid) => sum + (stockByVariant.get(vid) ?? 0), 0);
          if (totalAvailable > 10) stockByProduct.set(item.id, 'IN_STOCK');
          else if (totalAvailable > 0) stockByProduct.set(item.id, 'LOW_STOCK');
          else stockByProduct.set(item.id, 'OUT_OF_STOCK');
        }
      }
    }
  } catch {
    // Stock tables may not be available in all environments
  }

  // Card image: resolve the product's first renderable image reference
  // (images JSONB + product_media) to a signed/absolute URL. Every caller
  // projects `images` onto its rows, so only product_media needs its own read
  // here — re-querying products would double-read the listing. Wrapped in
  // try-catch so environments without the media tables degrade to null.
  const imageByProduct = new Map<string, string | null>();
  if (opts?.resolveImage) {
    try {
      const ids = items.map(item => item.id);
      const mediaRows = await db.query.productMedia.findMany({
        where: inArray(productMedia.productId, ids),
        columns: { productId: true, mediaType: true, url: true, sortOrder: true },
      });
      const mediaByProduct = new Map<string, { mediaType: string; url: string; sortOrder: number }[]>();
      for (const row of mediaRows) {
        const pid = row['productId'];
        const list = mediaByProduct.get(pid);
        if (list) list.push({ mediaType: row['mediaType'], url: row['url'], sortOrder: row['sortOrder'] });
        else mediaByProduct.set(pid, [{ mediaType: row['mediaType'], url: row['url'], sortOrder: row['sortOrder'] }]);
      }
      await Promise.all(items.map(async item => {
        const refs = imageReferences(
          (item as { images?: unknown }).images,
          mediaByProduct.get(item.id) ?? [],
        );
        let resolved: string | null = null;
        for (const ref of refs) {
          resolved = await opts.resolveImage!(ref);
          if (resolved) break;
        }
        imageByProduct.set(item.id, resolved);
      }));
    } catch {
      // Media tables may not be available in all environments (e.g. test mocks)
    }
  }

  return items.map(item => {
    const prices = pricesByBatch.get(`${item.storeId}|1`);
    let cheapest: VariantPricing | undefined;
    for (const variantId of variantsByProduct.get(item.id) ?? []) {
      const pricing = prices?.get(variantId);
      if (!pricing) continue;
      if (!cheapest || pricing.unitPriceMinor < cheapest.unitPriceMinor) cheapest = pricing;
    }
    const offerData = offerByProduct.get(item.id);
    // Compare only within the resolved product-price currency. Canonical
    // products have no owner currency, so a sole offer currency is unambiguous;
    // multiple currencies require seller selection on the detail page.
    const comparisonCurrency =
      cheapest?.currency ?? (item.storeId ? storeById.get(item.storeId)?.currency : null);
    let selectedOffer: OfferCardRow | undefined;
    if (offerData && offerData.lowestByCurrency.size > 0) {
      if (comparisonCurrency) {
        selectedOffer = offerData.lowestByCurrency.get(comparisonCurrency.trim());
      } else if (offerData.lowestByCurrency.size === 1) {
        selectedOffer = offerData.lowestByCurrency.values().next().value;
      }
    }
    const lowestPrice = selectedOffer?.basePriceMinor ?? null;
    const lowestCurrency = selectedOffer?.currency.trim() ?? null;
    return {
      ...item,
      store: item.storeId ? (storeById.get(item.storeId) ?? null) : null,
      priceFromMinor: cheapest ? cheapest.unitPriceMinor : null,
      priceCurrency: cheapest ? cheapest.currency : null,
      stockStatus: stockByProduct.get(item.id) ?? 'UNKNOWN',
      imageUrl: imageByProduct.get(item.id) ?? null,
      activeOfferCount: offerData?.count ?? 0,
      lowestOfferPriceMinor: lowestPrice,
      lowestOfferCurrency: lowestCurrency,
      lowestOfferId: selectedOffer?.id ?? null,
      lowestOfferStoreId: selectedOffer?.storeId ?? null,
      lowestOfferVariantId: selectedOffer?.variantId ?? null,
      lowestOfferMoq: selectedOffer?.moq ?? null,
      lowestOfferOrderIncrement: selectedOffer?.orderIncrement ?? null,
      lowestOfferStore: selectedOffer ? (storeById.get(selectedOffer.storeId) ?? null) : null,
    };
  });
}
