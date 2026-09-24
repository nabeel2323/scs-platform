import { and, desc, eq, inArray, lte, isNull, or } from 'drizzle-orm';
import { priceLists, priceTiers } from './pricing.schema';
import { merchantOffers } from '../catalog/catalog.offer.schema';
import { productVariants } from '../catalog/catalog.schema';
import type { DatabaseService } from '../../common/database/database.service';

/**
 * Shared price resolution (A5-1).
 *
 * The cart and the product/detail views must not disagree about what a unit
 * costs, so the selection rule lives here once: among the store's **active**
 * price lists that have a tier at or below the requested quantity, take the
 * highest-`priority` list, and within it the largest `minQty` tier. Tiers are
 * `min_qty <= qty < max_qty` — the upper bound is exclusive, and a null
 * `max_qty` means unlimited (see `pricing.service.resolvePrice`).
 *
 * A plain function over the drizzle handle rather than an injectable service:
 * the orders and catalog modules already reach into each other's schemas, and
 * this way neither module has to import the other's providers.
 */

/** Structural alias for `databaseService.db` so callers pass it straight through. */
type Db = DatabaseService['db'];

export interface PriceTierDisplay {
  minQty: number;
  maxQty: number | null;
  unitPriceMinor: number;
}

export interface VariantPricing {
  priceListId: string;
  priceListName: string;
  currency: string;
  /** Unit price of the winning tier at the requested quantity. */
  unitPriceMinor: number;
  /** Lower bound of that tier — tells a buyer at what volume the price applies. */
  minQty: number;
  /** PHASE 10: The merchant offer that provided this pricing (if any). */
  offerId?: string;
  /**
   * Every tier of the winning list for this variant, so a page can re-price as
   * the quantity changes without another round-trip (empty when the caller asked
   * for no ladder). A quantity that falls in a gap (e.g. tiers at 1-10 and 50+,
   * quantity 25) has no match — callers should then fall back to
   * `unitPriceMinor` rather than invent a number.
   */
  tiers: PriceTierDisplay[];
}

/** Pick the applicable tier for `qty` out of an unordered ladder. */
export function priceForQty(tiers: PriceTierDisplay[], qty: number): number | undefined {
  let best: PriceTierDisplay | undefined;
  for (const tier of tiers) {
    if (tier.minQty > qty) continue;
    const maxQty = tier.maxQty;
    if (maxQty !== null && maxQty !== undefined && qty >= maxQty) continue;
    if (!best || tier.minQty > best.minQty) best = tier;
  }
  return best?.unitPriceMinor;
}

/**
 * Resolve the effective price for each variant of a single store at `qty`.
 * Variants with no matching tier are simply absent from the map.
 *
 * Costs one query, or two: the second fetches the winning lists' full tier
 * ladders for display. Callers that only need a unit price (the cart) pass
 * `ladder: false` and get `tiers: []`, keeping that read off the write path.
 * Either way the query count is independent of how many variants are asked for,
 * and an empty request short-circuits so no `IN ()` is ever emitted.
 */
export async function resolveVariantPrices(
  db: Db,
  storeId: string,
  variantIds: string[],
  qty: number,
  options: { ladder?: boolean } = {},
): Promise<Map<string, VariantPricing>> {
  const result = new Map<string, VariantPricing>();
  if (variantIds.length === 0) return result;

  const candidates = await db
    .select({
      variantId: priceTiers.variantId,
      minQty: priceTiers.minQty,
      unitPriceMinor: priceTiers.unitPriceMinor,
      priceListId: priceLists.id,
      priceListName: priceLists.name,
      currency: priceLists.currency,
    })
    .from(priceTiers)
    .innerJoin(priceLists, eq(priceLists.id, priceTiers.priceListId))
    .where(
      and(
        eq(priceLists.storeId, storeId),
        eq(priceLists.isActive, true),
        inArray(priceTiers.variantId, variantIds),
        lte(priceTiers.minQty, qty),
      ),
    )
    // Order encodes the rule: best list first, then the deepest qualifying tier.
    .orderBy(desc(priceLists.priority), desc(priceTiers.minQty));

  const winners = new Map<string, (typeof candidates)[number]>();
  for (const row of candidates) {
    if (!winners.has(row.variantId)) winners.set(row.variantId, row);
  }
  if (winners.size === 0) return result;

  const ladders = new Map<string, PriceTierDisplay[]>();
  if (options.ladder !== false) {
    const ladderRows = await db
      .select({
        variantId: priceTiers.variantId,
        priceListId: priceTiers.priceListId,
        minQty: priceTiers.minQty,
        maxQty: priceTiers.maxQty,
        unitPriceMinor: priceTiers.unitPriceMinor,
      })
      .from(priceTiers)
      .where(
        and(
          inArray(priceTiers.priceListId, [
            ...new Set([...winners.values()].map(w => w.priceListId)),
          ]),
          inArray(priceTiers.variantId, variantIds),
        ),
      )
      .orderBy(priceTiers.minQty);

    for (const row of ladderRows) {
      const key = `${row.priceListId}|${row.variantId}`;
      const ladder = ladders.get(key);
      if (ladder)
        ladder.push({ minQty: row.minQty, maxQty: row.maxQty, unitPriceMinor: row.unitPriceMinor });
      else
        ladders.set(key, [
          { minQty: row.minQty, maxQty: row.maxQty, unitPriceMinor: row.unitPriceMinor },
        ]);
    }
  }

  for (const [variantId, winner] of winners) {
    result.set(variantId, {
      priceListId: winner.priceListId,
      priceListName: winner.priceListName,
      currency: winner.currency,
      unitPriceMinor: winner.unitPriceMinor,
      minQty: winner.minQty,
      tiers: ladders.get(`${winner.priceListId}|${variantId}`) ?? [],
    });
  }

  return result;
}

/**
 * Offer-aware price resolution (PHASE 4c).
 *
 * Realises the "offers fully absorb pricing" decision: for each variant, find
 * the ACTIVE offer for (store, variant) or (store, product-default); if the
 * offer has a price_list_id, resolve via that list's tiers; else fall back to
 * legacy. This preserves existing behavior when no offers exist (the current
 * state for all products created before Phase 4).
 *
 * Variant-level offers take precedence over product-level offers. The offer's
 * price_list_id points to the store's price book (whose price_tiers hold the
 * quantity ladder), so pricing is "owned" by the offer without duplicating the
 * tier data.
 */
export async function resolveOfferPrices(
  db: Db,
  storeId: string,
  variantIds: string[],
  qty: number,
  options: { ladder?: boolean } = {},
): Promise<Map<string, VariantPricing>> {
  const result = new Map<string, VariantPricing>();
  if (variantIds.length === 0) return result;

  // 1. Fetch variants to get product_ids.
  const variants = await db.query.productVariants.findMany({
    where: inArray(productVariants.id, variantIds),
    columns: { id: true, productId: true },
  });
  const variantToProduct = new Map(variants.map(v => [v.id, v.productId]));
  const productIds = [...new Set(variants.map(v => v.productId))];

  // 2. Fetch ACTIVE offers for the store + variants/products.
  const offers = await db.query.merchantOffers.findMany({
    where: and(
      eq(merchantOffers.storeId, storeId),
      eq(merchantOffers.status, 'ACTIVE'),
      or(
        inArray(merchantOffers.variantId, variantIds),
        and(isNull(merchantOffers.variantId), inArray(merchantOffers.productId, productIds)),
      ),
    ),
  });

  // 3. Build map: variantId → offer (variant-level takes precedence).
  const offerByVariant = new Map<string, (typeof offers)[0]>();
  const offerByProduct = new Map<string, (typeof offers)[0]>();
  for (const offer of offers) {
    if (offer.variantId) offerByVariant.set(offer.variantId, offer);
    else if (offer.productId) offerByProduct.set(offer.productId, offer);
  }

  // 4. Partition variants: with offer (has price_list_id) vs without.
  const variantsWithOffer: string[] = [];
  const variantsWithoutOffer: string[] = [];
  for (const variantId of variantIds) {
    const offer =
      offerByVariant.get(variantId) || offerByProduct.get(variantToProduct.get(variantId) ?? '');
    if (offer && offer.priceListId) variantsWithOffer.push(variantId);
    else variantsWithoutOffer.push(variantId);
  }

  // 5. For variants with offers, resolve via offer's price_list.
  if (variantsWithOffer.length > 0) {
    // Group by priceListId to batch queries.
    const byPriceList = new Map<string, string[]>();
    for (const variantId of variantsWithOffer) {
      const offer =
        offerByVariant.get(variantId) || offerByProduct.get(variantToProduct.get(variantId) ?? '');
      const plId = offer!.priceListId!;
      const list = byPriceList.get(plId);
      if (list) list.push(variantId);
      else byPriceList.set(plId, [variantId]);
    }

    // For each price list, resolve prices via that list's tiers.
    for (const [priceListId, vids] of byPriceList) {
      const candidates = await db
        .select({
          variantId: priceTiers.variantId,
          minQty: priceTiers.minQty,
          unitPriceMinor: priceTiers.unitPriceMinor,
          priceListId: priceLists.id,
          priceListName: priceLists.name,
          currency: priceLists.currency,
        })
        .from(priceTiers)
        .innerJoin(priceLists, eq(priceLists.id, priceTiers.priceListId))
        .where(
          and(
            eq(priceLists.id, priceListId),
            eq(priceLists.isActive, true),
            inArray(priceTiers.variantId, vids),
            lte(priceTiers.minQty, qty),
          ),
        )
        .orderBy(desc(priceLists.priority), desc(priceTiers.minQty));

      const winners = new Map<string, (typeof candidates)[number]>();
      for (const row of candidates) {
        if (!winners.has(row.variantId)) winners.set(row.variantId, row);
      }

      const ladders = new Map<string, PriceTierDisplay[]>();
      if (options.ladder !== false && winners.size > 0) {
        const ladderRows = await db
          .select({
            variantId: priceTiers.variantId,
            priceListId: priceTiers.priceListId,
            minQty: priceTiers.minQty,
            maxQty: priceTiers.maxQty,
            unitPriceMinor: priceTiers.unitPriceMinor,
          })
          .from(priceTiers)
          .where(
            and(
              eq(priceTiers.priceListId, priceListId),
              inArray(priceTiers.variantId, vids),
            ),
          )
          .orderBy(priceTiers.minQty);

        for (const row of ladderRows) {
          const key = `${row.priceListId}|${row.variantId}`;
          const ladder = ladders.get(key);
          if (ladder)
            ladder.push({ minQty: row.minQty, maxQty: row.maxQty, unitPriceMinor: row.unitPriceMinor });
          else
            ladders.set(key, [
              { minQty: row.minQty, maxQty: row.maxQty, unitPriceMinor: row.unitPriceMinor },
            ]);
        }
      }

      for (const [variantId, winner] of winners) {
        const offer =
          offerByVariant.get(variantId) || offerByProduct.get(variantToProduct.get(variantId) ?? '');
        result.set(variantId, {
          priceListId: winner.priceListId,
          priceListName: winner.priceListName,
          currency: winner.currency,
          unitPriceMinor: winner.unitPriceMinor,
          minQty: winner.minQty,
          offerId: offer?.id,
          tiers: ladders.get(`${winner.priceListId}|${variantId}`) ?? [],
        });
      }
    }
  }

  // 6. For variants without offers, fall back to legacy.
  if (variantsWithoutOffer.length > 0) {
    const legacy = await resolveVariantPrices(db, storeId, variantsWithoutOffer, qty, options);
    for (const [variantId, pricing] of legacy) {
      result.set(variantId, pricing);
    }
  }

  return result;
}
