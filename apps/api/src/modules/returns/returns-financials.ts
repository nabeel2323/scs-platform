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

/**
 * Calculate the cumulative-target commission reversal in exact minor units.
 * BigInt multiplication is required even when each input is a safe integer:
 * the product of two safe integers can exceed Number.MAX_SAFE_INTEGER.
 */
export function calculateProportionalCommissionReversalMinor(
  originalCommissionMinor: number,
  orderNetGoodsMinor: number,
  returnNetGoodsMinor: number,
  alreadyReversedMinor: number,
): number {
  const amounts = [
    originalCommissionMinor,
    orderNetGoodsMinor,
    returnNetGoodsMinor,
    alreadyReversedMinor,
  ];
  if (amounts.some((amount) => !Number.isSafeInteger(amount))) {
    throw new RangeError('Commission reversal inputs must be safe integer minor-unit amounts');
  }
  if (alreadyReversedMinor < 0) {
    throw new RangeError('Already-reversed commission cannot be negative');
  }
  if (originalCommissionMinor <= 0 || orderNetGoodsMinor <= 0 || returnNetGoodsMinor <= 0) {
    return 0;
  }

  const remaining = originalCommissionMinor - alreadyReversedMinor;
  if (remaining <= 0) return 0;

  const raw =
    (BigInt(originalCommissionMinor) * BigInt(returnNetGoodsMinor)) / BigInt(orderNetGoodsMinor);
  const capped = raw > BigInt(remaining) ? BigInt(remaining) : raw;
  return Number(capped);
}

/**
 * Round a proportional minor-unit allocation to the nearest integer using
 * half-up semantics. BigInt keeps amount × numerator exact for large values.
 */
export function roundProportionalMinorUnits(
  amountMinor: bigint,
  numeratorMinor: number,
  denominatorMinor: number,
): number {
  if (amountMinor < 0n) {
    throw new RangeError('Proportional amount cannot be negative');
  }
  if (!Number.isSafeInteger(numeratorMinor) || numeratorMinor < 0) {
    throw new RangeError('Proportional numerator must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(denominatorMinor) || denominatorMinor <= 0) {
    throw new RangeError('Proportional denominator must be a positive safe integer');
  }

  const numerator = BigInt(numeratorMinor);
  const denominator = BigInt(denominatorMinor);
  const rounded = (amountMinor * numerator + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Proportional result exceeds the safe integer range');
  }
  return result;
}
