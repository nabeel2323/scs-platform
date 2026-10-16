import { inArray, sql } from 'drizzle-orm';
import { stores } from '../merchant/merchant.schema';
import { users } from '../identity/identity.schema';
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
 * Buyer contact batch resolver for list and detail order responses.
 *
 * Order rows carry only a `buyerId`, which forced the merchant list to
 * reconstruct names/phones from `GET /v1/merchant/customers` — an org-scoped,
 * status-filtered, 60-second-cached directory that misses (a) buyers whose
 * first order arrived seconds ago, (b) buyers under a mismatched activeOrg,
 * and (c) buyers whose only orders are CANCELLED/REJECTED. Resolving here
 * makes the response authoritative for contact display: the order's own
 * `buyerId` is the same value `assertOrderAccessible` already authorised for
 * this caller, and the customers endpoint exposes the identical fields, so
 * there is no new disclosure surface. One batched `users` read per page, not
 * one per row.
 *
 * `db.query.users` is accessed through optional chaining because unit-spec
 * fixtures commonly omit it — a mock `db` that only knows about `stores`
 * returns `{}` for `db.query`, and the short-circuit preserves a graceful
 * null-degrade path rather than crashing. Real `DatabaseService` always has
 * `users` (it is a top-level `relations` target), so production callers get
 * the full record.
 */
export interface BuyerContact {
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
}

export async function attachBuyerContacts<T extends { buyerId?: string | null }>(
  db: Db,
  rows: T[],
): Promise<Array<T & BuyerContact>> {
  if (rows.length === 0) return [];

  const buyerIds = [
    ...new Set(
      rows
        .map(row => row.buyerId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  type UserContactRow = {
    id: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
  };
  let userRows: UserContactRow[] = [];
  if (buyerIds.length > 0) {
    try {
      // Optional chaining short-circuits when the mock/spec db never defined
      // `query.users`; try/catch additionally protects against a fake whose
      // findMany is present but throws. Either way the response null-degrades
      // the contact fields rather than failing the whole list.
      const found = (await db.query.users?.findMany?.({
        where: inArray(users.id, buyerIds),
        columns: { id: true, fullName: true, phone: true, email: true },
      })) as UserContactRow[] | undefined;
      userRows = found ?? [];
    } catch {
      userRows = [];
    }
  }
  const byId = new Map<string, UserContactRow>();
  for (const u of userRows) byId.set(u['id'], u);

  return rows.map(row => {
    const u = row.buyerId ? byId.get(row.buyerId) : undefined;
    return {
      ...row,
      buyerName: u?.['fullName'] ?? null,
      buyerPhone: u?.['phone'] ?? null,
      buyerEmail: u?.['email'] ?? null,
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
