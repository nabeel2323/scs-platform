import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { priceLists, priceTiers } from './pricing.schema';
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
