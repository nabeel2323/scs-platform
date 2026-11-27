/**
 * Canonical MOQ/order-increment rule shared by cart writes and checkout.
 *
 * Quantities are valid at MOQ, then every configured increment above MOQ:
 * MOQ, MOQ + increment, MOQ + (2 * increment), ...
 */
export function getOrderQuantityViolation(
  quantity: number,
  moq: number,
  orderIncrement: number | null = null,
): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 'Quantity must be a positive integer';
  }
  if (!Number.isInteger(moq) || moq < 1) {
    return 'The seller order quantity terms are invalid';
  }
  if (orderIncrement != null && (!Number.isInteger(orderIncrement) || orderIncrement < 1)) {
    return 'The seller order increment is invalid';
  }
  if (quantity < moq) {
    return `Minimum order quantity is ${moq}; requested quantity is ${quantity}`;
  }
  if (orderIncrement != null && (quantity - moq) % orderIncrement !== 0) {
    return `Quantity must be ${moq} or increase from the minimum in increments of ${orderIncrement}`;
  }
  return null;
}
