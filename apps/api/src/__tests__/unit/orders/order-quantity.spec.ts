import { describe, expect, it } from 'vitest';
import { getOrderQuantityViolation } from '../../../modules/orders/order-quantity';

describe('getOrderQuantityViolation — MOQ and order increments', () => {
  it.each([
    [5, 5, 3],
    [8, 5, 3],
    [11, 5, 3],
    [14, 5, 3],
    [1, 1, null],
    [5, 5, null],
  ] as const)('accepts quantity %i for MOQ %i and increment %s', (quantity, moq, increment) => {
    expect(getOrderQuantityViolation(quantity, moq, increment)).toBeNull();
  });

  it('rejects a quantity below MOQ', () => {
    expect(getOrderQuantityViolation(4, 5, 3)).toContain('Minimum order quantity is 5');
  });

  it.each([6, 7, 9, 10])('rejects quantity %i when it is not MOQ plus a full increment', quantity => {
    expect(getOrderQuantityViolation(quantity, 5, 3)).toContain('increments of 3');
  });

  it('keeps legacy no-increment offers unrestricted above MOQ', () => {
    expect(getOrderQuantityViolation(6, 5, null)).toBeNull();
    expect(getOrderQuantityViolation(7, 5, undefined)).toBeNull();
  });

  it('rejects non-positive and fractional quantities', () => {
    expect(getOrderQuantityViolation(0, 1)).toContain('positive integer');
    expect(getOrderQuantityViolation(1.5, 1)).toContain('positive integer');
  });

  it('rejects invalid persisted terms rather than silently accepting them', () => {
    expect(getOrderQuantityViolation(5, 0)).toContain('terms are invalid');
    expect(getOrderQuantityViolation(5, 5, 0)).toContain('increment is invalid');
    expect(getOrderQuantityViolation(5, 5, 1.5)).toContain('increment is invalid');
  });
});
