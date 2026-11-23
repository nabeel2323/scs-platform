/**
 * Allocate the order-level discount to a returned subset of goods using the
 * same proportional basis as the original order. BigInt arithmetic avoids
 * floating-point drift in minor-unit commission calculations.
 */
export function calculateReturnNetGoodsMinor(
  returnGrossGoodsMinor: bigint,
  productsMinor: number,
  discountMinor: number,
): number {
  if (!Number.isSafeInteger(productsMinor) || productsMinor <= 0) {
    throw new RangeError('Order products amount must be a positive safe integer');
  }
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0 || discountMinor > productsMinor) {
    throw new RangeError('Order discount must be a safe integer between zero and products amount');
  }
  if (returnGrossGoodsMinor <= 0n) return 0;

  const products = BigInt(productsMinor);
  const netGoods = products - BigInt(discountMinor);
  const boundedReturnGross = returnGrossGoodsMinor > products ? products : returnGrossGoodsMinor;
  const returnNetGoods = (boundedReturnGross * netGoods) / products;
  const result = Number(returnNetGoods);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Returned net-goods amount exceeds the safe integer range');
  }
  return result;
}
