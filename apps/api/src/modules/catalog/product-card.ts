import { and, eq, inArray } from 'drizzle-orm';
import { productVariants, productMedia } from './catalog.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import { inventoryItems } from '../inventory/inventory.schema';
import { resolveOfferPrices, type VariantPricing } from '../pricing/price-resolution';
import type { DatabaseService } from '../../common/database/database.service';
import type { StorageService } from '../../common/storage/storage.service';
import { imageReferences, isProductMediaKey } from './product-images';

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
  name: string;
  slug: string;
  verificationStatus: string;
  currency: string;
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

  const storeIds = [...new Set(items.map(item => item.storeId).filter((s): s is string => !!s))];
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
          },
        })
      : [];
  const storeById = new Map<string, StoreCard>();
  for (const row of storeRows) {
    storeById.set(row['id'], {
      id: row['id'],
      name: row['displayName'],
      slug: row['slug'],
      verificationStatus: row['verificationStatus'],
      currency: row['currency'],
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

  // Price is a function of (store, quantity), and the quantity a buyer pays is
  // the product's MOQ — so one batch per distinct pair. A store whose products
  // all share an MOQ costs a single query; the resolver's rule is not duplicated
  // here to save a few indexed reads, because a displayed price that disagrees
  // with the cart is a trust bug, not an optimisation.
  const variantIdsByBatch = new Map<string, string[]>();
  for (const item of items) {
    if (!item.storeId) continue; // canonical products without a store have no pricing
    const variantIds = variantsByProduct.get(item.id);
    if (!variantIds || variantIds.length === 0) continue;
    const key = `${item.storeId}|${item.moq ?? 1}`;
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
    const prices = pricesByBatch.get(`${item.storeId}|${item.moq ?? 1}`);
    let cheapest: VariantPricing | undefined;
    for (const variantId of variantsByProduct.get(item.id) ?? []) {
      const pricing = prices?.get(variantId);
      if (!pricing) continue;
      if (!cheapest || pricing.unitPriceMinor < cheapest.unitPriceMinor) cheapest = pricing;
    }
    return {
      ...item,
      store: item.storeId ? (storeById.get(item.storeId) ?? null) : null,
      priceFromMinor: cheapest ? cheapest.unitPriceMinor : null,
      priceCurrency: cheapest ? cheapest.currency : null,
      stockStatus: stockByProduct.get(item.id) ?? 'UNKNOWN',
      imageUrl: imageByProduct.get(item.id) ?? null,
    };
  });
}
