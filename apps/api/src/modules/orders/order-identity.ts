import { inArray, sql } from 'drizzle-orm';
import { stores } from '../merchant/merchant.schema';
import { orderItems } from './orders.schema';
import type { DatabaseService } from '../../common/database/database.service';

/**
 * Order money identity (A2-4, A4-6/A5-4).
 *
 * An amount with no currency and a total with no seller are not information.
 * `orders` carried minor units and a `storeId`, so every client had to guess:
 * an AED supplier's total printed as "… SAR" in the buyer's list, in the order
 * detail and in the merchant queue, and the order screens named suppliers by
 * their first eight hex characters. This resolves both from one batched read of
 * `stores`, so a list page costs one extra query rather than one per row.
 *
 * Currency precedence is the snapshot, never the live store: `orders.currency`
 * records what was actually charged (migration 0019), because a seller who
 * changes `stores.currency` afterwards must not silently restate past invoices.
 * Rows predating that column have nothing to recover, so the seller's current
 * currency is the least-wrong answer — and `currencyFromSnapshot: false` says
 * out loud that a client is looking at an inference instead of a record.
 */

/** Structural alias for `databaseService.db`. */
type Db = DatabaseService['db'];

/** What an order row must carry to be resolvable. */
export interface OrderIdentitySource {
  storeId: string;
  /** The 0019 snapshot; absent on rows written before it. */
  currency?: string | null;
}

export interface OrderIdentity {
  /** Null when the seller row cannot be found — the order is still shown. */
  storeName: string | null;
  storeSlug: string | null;
  /**
   * The organization that owns the fulfilling store. Lets a client detect an
   * activeOrg/order mismatch (e.g. a merchant opening a linked order whose
   * store lives in a different org) and re-issue a token scoped to that org.
   * Non-PII — the same value is already exposed via the stores table.
   */
  storeOrgId: string | null;
  /** ISO 4217 code every minor-unit amount on this order is expressed in. */
  currency: string;
  /** False when the row predates the snapshot column and the store was used. */
  currencyFromSnapshot: boolean;
}

/**
 * Last resort for a legacy row whose seller cannot be read either. The platform
 * seeded SAR (`stores.currency` defaults to it), so this preserves what the
 * clients used to assume while making the assumption explicit and single.
 */
export const FALLBACK_ORDER_CURRENCY = 'SAR';

export async function attachOrderIdentity<T extends OrderIdentitySource>(
  db: Db,
  rows: T[],
): Promise<Array<T & OrderIdentity>> {
  if (rows.length === 0) return [];

  const storeIds = [...new Set(rows.map(row => row.storeId).filter(Boolean))];
  const storeRows =
    storeIds.length > 0
      ? await db.query.stores.findMany({
          where: inArray(stores.id, storeIds),
          columns: { id: true, displayName: true, slug: true, currency: true, orgId: true },
        })
      : [];
  const storeById = new Map<string, (typeof storeRows)[number]>();
  for (const row of storeRows) storeById.set(row['id'], row);

  return rows.map(row => {
    const store = storeById.get(row.storeId);
    const snapshot = row.currency ?? null;
    return {
      ...row,
      storeName: store ? store['displayName'] : null,
      storeSlug: store ? store['slug'] : null,
      storeOrgId: store?.['orgId'] ?? null,
      currency: snapshot ?? store?.['currency'] ?? FALLBACK_ORDER_CURRENCY,
      currencyFromSnapshot: snapshot !== null,
    };
  });
}

/**
 * Line counts for order rows that are returned without their items.
 *
 * `listOrders` deliberately ships bare orders, but both list pages rendered
 * `order.items?.length`, which is `undefined` on such a response — so every card
 * claimed "0 items" (A5-16). Rather than delete the number, the count comes back
 * as one grouped aggregate for the whole page: it costs the list one query and
 * keeps it from having to load every line item just to size a sentence.
 */
export async function attachItemCounts<T extends { id: string }>(
  db: Db,
  rows: T[],
): Promise<Array<T & { itemCount: number }>> {
  if (rows.length === 0) return [];

  const counted = await db
    .select({
      orderId: orderItems.orderId,
      itemCount: sql<number>`count(*)::int`,
    })
    .from(orderItems)
    .where(
      inArray(orderItems.orderId, rows.map(row => row.id)),
    )
    .groupBy(orderItems.orderId);

  const countByOrder = new Map<string, number>();
  for (const row of counted) countByOrder.set(row['orderId'], row['itemCount']);

  // An order with no rows returns nothing above, and 0 is its real answer.
  return rows.map(row => ({ ...row, itemCount: countByOrder.get(row.id) ?? 0 }));
}

/**
 * Totals per currency for a master order.
 *
 * A master order spans suppliers, and suppliers need not share a currency, so a
 * single grand total is not an amount anybody could pay. Grouping it keeps the
 * arithmetic honest without deciding platform policy about mixed carts.
 */
export function totalsByCurrency(
  subOrders: Array<{ currency: string; totalMinor: number }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const sub of subOrders) {
    totals[sub.currency] = (totals[sub.currency] ?? 0) + sub.totalMinor;
  }
  return totals;
}
