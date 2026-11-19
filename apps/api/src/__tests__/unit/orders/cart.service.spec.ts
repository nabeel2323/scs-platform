import { describe, it, expect, vi } from 'vitest';
import { inspect } from 'node:util';
import { CartService } from '../../../modules/orders/cart.service';

/**
 * A5-3 — Cart line enrichment.
 *
 * `listCartItems` used to be a plain `query.cartItems.findMany({ where })`, which
 * gave the UI no product/supplier labels ("Item" + UUID everywhere). It is now a
 * hand-built join, and a hand-built chain can silently lose its WHERE clause —
 * which would return EVERY cart line on the platform. These tests pin both the
 * scoping predicate and the projected labels.
 */

interface Captured {
  where?: unknown;
}

/** Chainable fake of the Drizzle query builder that records the clauses used. */
function dbReturning(rows: unknown[], captured: Captured) {
  const chain: Record<string, unknown> = {};
  chain['from'] = () => chain;
  chain['leftJoin'] = () => chain;
  chain['innerJoin'] = () => chain;
  chain['where'] = (predicate: unknown) => {
    captured.where = predicate;
    return chain;
  };
  chain['orderBy'] = () => chain;
  // The service awaits the builder, so make the chain thenable.
  chain['then'] = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled);

  return { db: { select: () => chain } } as never;
}

/** Column names and parameter values are reachable through the SQL chunks. */
function sqlText(node: unknown): string {
  // Drizzle SQL wrappers are circular, so JSON.stringify throws — inspect
  // renders the whole clause tree (column names + bound param values).
  return inspect(node, { depth: 12, breakLength: Infinity, compact: true });
}

function service(rows: unknown[], captured: Captured): CartService {
  return new CartService(dbReturning(rows, captured), {
    resolveApplicable: async () => null,
  } as never);
}

function line(overrides: Record<string, unknown>) {
  return {
    id: 'ci-1',
    cartId: 'cart-1',
    storeId: 'st-1',
    variantId: 'v-1',
    quantity: 1,
    priceMinor: 100,
    lineTotalMinor: 100,
    ...overrides,
  };
}

describe('CartService.addItem selected offer pricing', () => {
  it('stores the exact selected offer and the same resolved unit price shown on its card', async () => {
    const inserted: any[] = [];
    const offer = {
      id: 'offer-seller',
      storeId: 'store-seller',
      productId: 'product-1',
      variantId: 'variant-1',
      status: 'ACTIVE',
      isAvailable: true,
      currency: 'SAR',
      basePriceMinor: 900,
      moq: 5,
      priceListId: 'price-list-seller',
    };
    const builder: Record<string, any> = {};
    builder['from'] = () => builder;
    builder['innerJoin'] = () => builder;
    builder['where'] = () => builder;
    builder['then'] = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([
      {
        priceListId: 'price-list-seller',
        priceListStoreId: 'store-seller',
        priceListName: 'Seller price book',
        currency: 'SAR',
        variantId: 'variant-1',
        minQty: 5,
        maxQty: null,
        unitPriceMinor: 950,
      },
    ]).then(resolve);

    const db = {
      query: {
        productVariants: { findFirst: vi.fn(async () => ({ id: 'variant-1', productId: 'product-1', isActive: true })) },
        products: { findFirst: vi.fn(async () => ({ id: 'product-1', storeId: 'owner-store' })) },
        merchantOffers: { findFirst: vi.fn(async () => offer) },
        cartItems: { findFirst: vi.fn(async () => null) },
      },
      select: vi.fn(() => builder),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: unknown) => { inserted.push(value); return []; }),
      })),
      update: vi.fn(),
    };

    const svc = new CartService({ db } as any, { resolveApplicable: async () => null } as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1', userId: 'buyer-1' }));
    (svc as any).recalculateTotal = vi.fn(async () => undefined);
    (svc as any).getActiveCartWithItems = vi.fn(async () => ({ id: 'cart-1', items: [] }));

    await svc.addItem('buyer-1', {
      variantId: 'variant-1',
      quantity: 5,
      offerId: 'offer-seller',
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      cartId: 'cart-1',
      storeId: 'store-seller',
      variantId: 'variant-1',
      quantity: 5,
      priceMinor: 950,
      tierMinQty: 5,
      offerId: 'offer-seller',
      lineTotalMinor: 4750,
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('does not merge an owner-priced line into an existing seller-offer line', async () => {
    let cartItemWhere: unknown;
    const builder: Record<string, any> = {};
    builder['from'] = () => builder;
    builder['innerJoin'] = () => builder;
    builder['where'] = () => builder;
    builder['orderBy'] = () => builder;
    builder['then'] = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([
      { variantId: 'variant-1', minQty: 1, unitPriceMinor: 1000, priceListId: 'owner-list', priceListName: 'Owner', currency: 'SAR' },
    ]).then(resolve);

    const db = {
      query: {
        productVariants: {
          findFirst: vi.fn(async () => ({ id: 'variant-1', productId: 'product-1', isActive: true })),
          findMany: vi.fn(async () => [{ id: 'variant-1', productId: 'product-1' }]),
        },
        products: { findFirst: vi.fn(async () => ({ id: 'product-1', storeId: 'owner-store' })) },
        merchantOffers: { findMany: vi.fn(async () => []) },
        cartItems: {
          findFirst: vi.fn(async (query: { where: unknown }) => {
            cartItemWhere = query.where;
            return null;
          }),
        },
      },
      select: vi.fn(() => builder),
      insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
      update: vi.fn(),
    };

    const svc = new CartService({ db } as any, { resolveApplicable: async () => null } as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1', userId: 'buyer-1' }));
    (svc as any).recalculateTotal = vi.fn(async () => undefined);
    (svc as any).getActiveCartWithItems = vi.fn(async () => ({ id: 'cart-1', items: [] }));

    await svc.addItem('buyer-1', { variantId: 'variant-1', quantity: 1 });

    const predicate = inspect(cartItemWhere, { depth: 12, breakLength: Infinity, compact: true });
    expect(predicate).toContain('offer_id');
    expect(predicate).toMatch(/is null/i);
  });
});

describe('CartService.listCartItems', () => {
  it('filters the join by the requested cart', async () => {
    const captured: Captured = {};
    const svc = service([], captured);

    await svc.listCartItems('cart-1');

    // Regression guard: without this clause the join leaks other users' carts.
    const text = sqlText(captured.where);
    expect(captured.where).toBeDefined();
    expect(text).toContain('cart_id');
    expect(text).toContain('cart-1');
  });

  it('projects title, sku, supplier name/slug and currency onto each line', async () => {
    const captured: Captured = {};
    const svc = service(
      [
        {
          item: line({ id: 'ci-1', storeId: 'st-1', variantId: 'v-1', quantity: 2, priceMinor: 1500, lineTotalMinor: 3000 }),
          variantTitle: null,
          productTitle: 'Rice 5kg',
          sku: 'SKU-RICE-5',
          storeName: 'Al Madina Wholesale',
          storeSlug: 'al-madina',
          storeCurrency: 'SAR',
        },
        {
          item: line({ id: 'ci-2', storeId: 'st-2', variantId: 'v-2', priceMinor: 900 }),
          variantTitle: 'Basmati 10kg (case)',
          productTitle: 'Basmati Rice',
          sku: 'SKU-BASM-10',
          storeName: 'Eastern Foods',
          storeSlug: 'eastern-foods',
          storeCurrency: 'AED',
        },
      ],
      captured,
    );

    const items = await svc.listCartItems('cart-1');
    const [rice, basmati] = items;

    expect(items).toHaveLength(2);
    // Variant title wins; the product title is the fallback.
    expect(rice?.title).toBe('Rice 5kg');
    expect(basmati?.title).toBe('Basmati 10kg (case)');
    expect(basmati?.storeName).toBe('Eastern Foods');
    expect(basmati?.storeSlug).toBe('eastern-foods');
    expect(basmati?.currency).toBe('AED');
    // Raw cart columns must survive the projection (checkout reads them).
    expect(rice?.quantity).toBe(2);
    expect(rice?.storeId).toBe('st-1');
    expect(rice?.lineTotalMinor).toBe(3000);
  });

  it('keeps lines whose variant/product/store no longer resolve', async () => {
    const captured: Captured = {};
    const svc = service(
      [
        {
          item: line({ id: 'ci-3', storeId: 'st-3', variantId: 'v-3', quantity: 5, lineTotalMinor: 500 }),
          variantTitle: null,
          productTitle: null,
          sku: null,
          storeName: null,
          storeSlug: null,
          storeCurrency: null,
        },
      ],
      captured,
    );

    const items = await svc.listCartItems('cart-1');
    const orphan = items[0];

    expect(items).toHaveLength(1);
    // Absent rather than null, so the UI fallbacks ("Item", supplier stub) apply.
    expect(orphan?.title).toBeUndefined();
    expect(orphan?.storeName).toBeUndefined();
    expect(orphan?.quantity).toBe(5);
  });
});

/**
 * A4-7 residual — addItems batch path.
 *
 * Reorder was calling addItem once per line, re-reading the whole cart each
 * time. The batch path adds multiple lines in one call and does a single
 * recalculateTotal at the end. These tests pin the skip/added accounting.
 */

describe('CartService.addItems', () => {
  it('rejects non-positive quantities without hitting the DB', async () => {
    const cart = { id: 'cart-1', userId: 'u-1', status: 'ACTIVE', totalMinor: 0 };
    const db = {
      query: {
        carts: { findFirst: vi.fn(async () => cart) },
        productVariants: { findFirst: vi.fn() },
        products: { findFirst: vi.fn() },
        cartItems: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const svc = new CartService(db as any, { resolveApplicable: async () => null } as any);
    (svc as any).getOrCreateCart = vi.fn(async () => cart);
    (svc as any).recalculateTotal = vi.fn(async () => undefined);
    (svc as any).getActiveCartWithItems = vi.fn(async () => ({ ...cart, items: [] }));

    const result = await svc.addItems('u-1', [
      { variantId: 'v-rice', quantity: 0 },
      { variantId: 'v-oil', quantity: -5 },
    ]);

    expect(result.added).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every(s => s.reason === 'Invalid quantity')).toBe(true);
    // The variant lookup should never be called for invalid quantities.
    expect(db.query.productVariants.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an empty items array', async () => {
    const svc = new CartService({} as any, {} as any);
    await expect(svc.addItems('u-1', [])).rejects.toThrow('items must be a non-empty array');
  });
});

describe('CartService MOQ and order-increment enforcement', () => {
  const offer = {
    id: 'offer-1',
    storeId: 'store-1',
    productId: 'product-1',
    variantId: 'variant-1',
    status: 'ACTIVE',
    isAvailable: true,
    moq: 5,
    orderIncrement: 3,
    currency: 'SAR',
    basePriceMinor: 100,
    priceListId: null,
  };

  it('rejects an invalid final quantity when adding to a selected offer', async () => {
    const db = {
      query: {
        productVariants: { findFirst: vi.fn(async () => ({ id: 'variant-1', productId: 'product-1', isActive: true })) },
        products: { findFirst: vi.fn(async () => ({ id: 'product-1', storeId: 'store-1' })) },
        merchantOffers: { findFirst: vi.fn(async () => offer) },
        cartItems: { findFirst: vi.fn(async () => ({ id: 'line-1', quantity: 5 })) },
      },
      select: vi.fn(),
      insert: vi.fn(),
    };
    const svc = new CartService({ db } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));

    await expect(svc.addItem('buyer-1', { variantId: 'variant-1', quantity: 1, offerId: 'offer-1' }))
      .rejects.toThrow('increments of 3');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('skips an invalid batch-added quantity without persisting it', async () => {
    const db = {
      query: {
        productVariants: { findFirst: vi.fn(async () => ({ id: 'variant-1', productId: 'product-1', isActive: true })) },
        products: { findFirst: vi.fn(async () => ({ id: 'product-1', storeId: 'store-1' })) },
        merchantOffers: { findFirst: vi.fn(async () => offer) },
        cartItems: { findFirst: vi.fn(async () => ({ id: 'line-1', quantity: 5 })) },
      },
      insert: vi.fn(),
    };
    const svc = new CartService({ db } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));
    (svc as any).recalculateTotal = vi.fn(async () => undefined);
    (svc as any).getActiveCartWithItems = vi.fn(async () => ({ id: 'cart-1', items: [] }));

    const result = await svc.addItems('buyer-1', [{ variantId: 'variant-1', quantity: 1, offerId: 'offer-1' }]);
    expect(result.added).toEqual([]);
    expect(result.skipped[0]?.reason).toContain('increments of 3');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an invalid quantity update before repricing', async () => {
    const db = {
      query: {
        carts: { findFirst: vi.fn(async () => ({ id: 'cart-1' })) },
        cartItems: { findFirst: vi.fn(async () => ({ id: 'line-1', cartId: 'cart-1', variantId: 'variant-1', storeId: 'store-1', offerId: 'offer-1' })) },
        merchantOffers: { findFirst: vi.fn(async () => offer) },
      },
      select: vi.fn(),
      update: vi.fn(),
    };
    const svc = new CartService({ db } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));

    await expect(svc.updateItemQuantity('buyer-1', 'line-1', 7)).rejects.toThrow('increments of 3');
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects fractional quantities in quantity updates', async () => {
    const db = {
      query: {
        carts: { findFirst: vi.fn(async () => ({ id: 'cart-1' })) },
        cartItems: { findFirst: vi.fn(async () => ({ id: 'line-1', cartId: 'cart-1' })) },
      },
    };
    const svc = new CartService({ db } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));
    await expect(svc.updateItemQuantity('buyer-1', 'line-1', 2.5)).rejects.toThrow('positive integer');
  });

  it('rejects negative quantity updates without deleting the cart line', async () => {
    const svc = new CartService({ db: {} } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));
    (svc as any).getCartItem = vi.fn(async () => ({ id: 'line-1', cartId: 'cart-1' }));
    const remove = vi.fn();
    (svc as any).removeItem = remove;

    await expect(svc.updateItemQuantity('buyer-1', 'line-1', -1))
      .rejects.toThrow('positive integer or zero');
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps zero as the explicit remove-item operation', async () => {
    const svc = new CartService({ db: {} } as any, {} as any);
    (svc as any).getOrCreateCart = vi.fn(async () => ({ id: 'cart-1' }));
    (svc as any).getCartItem = vi.fn(async () => ({ id: 'line-1', cartId: 'cart-1' }));
    const remove = vi.fn(async () => ({ removed: true }));
    (svc as any).removeItem = remove;

    await expect(svc.updateItemQuantity('buyer-1', 'line-1', 0)).resolves.toEqual({ removed: true });
    expect(remove).toHaveBeenCalledWith('buyer-1', 'line-1');
  });
});
