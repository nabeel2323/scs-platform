import { describe, expect, it, vi } from 'vitest';
import { AdminService } from '../../../modules/admin/admin.service';
import { orderItems } from '../../../modules/orders/orders.schema';
import { products, productVariants } from '../../../modules/catalog/catalog.schema';

describe('AdminService order detail item labels', () => {
  it('joins product and variant labels for admin order item rows', async () => {
    const order = { id: 'order-a' };
    const items = [
      {
        id: 'item-a',
        orderId: 'order-a',
        variantId: 'variant-a',
        productTitle: 'Cotton Shirt',
        variantSku: 'SHIRT-BLU-L',
        variantTitle: 'Blue / Large',
      },
    ];
    const history: Array<{ id: string }> = [];
    const orderLimit = vi.fn().mockResolvedValue([order]);
    const orderWhere = vi.fn().mockReturnValue({ limit: orderLimit });
    const orderJoin2 = vi.fn().mockReturnValue({ where: orderWhere });
    const orderJoin1 = vi.fn().mockReturnValue({ leftJoin: orderJoin2 });
    const orderFrom = vi.fn().mockReturnValue({ leftJoin: orderJoin1 });

    const itemWhere = vi.fn().mockResolvedValue(items);
    const itemJoin2 = vi.fn().mockReturnValue({ where: itemWhere });
    const itemJoin1 = vi.fn().mockReturnValue({ leftJoin: itemJoin2 });
    const itemFrom = vi.fn().mockReturnValue({ leftJoin: itemJoin1 });

    const historyOrderBy = vi.fn().mockResolvedValue(history);
    const historyWhere = vi.fn().mockReturnValue({ orderBy: historyOrderBy });
    const historyFrom = vi.fn().mockReturnValue({ where: historyWhere });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: orderFrom })
      .mockReturnValueOnce({ from: itemFrom })
      .mockReturnValueOnce({ from: historyFrom });
    const service = new AdminService(
      { db: { select } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getOrderDetail('order-a')).resolves.toMatchObject({ items });

    expect(select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        productTitle: products.title,
        variantSku: productVariants.sku,
        variantTitle: productVariants.title,
      }),
    );
    expect(itemFrom).toHaveBeenCalledWith(orderItems);
  });
});
