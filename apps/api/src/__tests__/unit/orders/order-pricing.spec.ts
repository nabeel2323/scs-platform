import { describe, it, expect } from 'vitest';
import {
  computeOrderFinancials,
  resolveDeliveryFeeMinor,
  DEFAULT_VAT_RATE,
  DEFAULT_COMMISSION_RATE,
} from '../../../modules/orders/order-pricing';

/**
 * Order Pricing — Unit Tests (API-B4)
 *
 * These exercise the REAL pure functions used by checkout, verifying the
 * acceptance criteria from the Gap & Roadmap Report:
 *   - promo discount is deducted from goods,
 *   - 15% KSA VAT is charged on the discounted taxable base (goods + delivery),
 *   - delivery fee is applied only for PLATFORM_DELIVERY,
 *   - commission is taken on net goods (not VAT/delivery),
 *   - totals can never go negative and are always integer minor units.
 */

describe('resolveDeliveryFeeMinor', () => {
  it('charges the platform fee for PLATFORM_DELIVERY', () => {
    expect(resolveDeliveryFeeMinor('PLATFORM_DELIVERY', 1500)).toBe(1500);
  });

  it('charges nothing for PICKUP', () => {
    expect(resolveDeliveryFeeMinor('PICKUP', 1500)).toBe(0);
  });

  it('charges nothing for MERCHANT_DELIVERY', () => {
    expect(resolveDeliveryFeeMinor('MERCHANT_DELIVERY', 1500)).toBe(0);
  });

  it('defaults to platform delivery when method is absent', () => {
    expect(resolveDeliveryFeeMinor(undefined, 1500)).toBe(1500);
    expect(resolveDeliveryFeeMinor(null, 1500)).toBe(1500);
  });

  it('is case-insensitive', () => {
    expect(resolveDeliveryFeeMinor('pickup', 1500)).toBe(0);
    expect(resolveDeliveryFeeMinor('Platform_Delivery', 1500)).toBe(1500);
  });

  it('never returns a negative fee', () => {
    expect(resolveDeliveryFeeMinor('PLATFORM_DELIVERY', -500)).toBe(0);
  });
});

describe('computeOrderFinancials — VAT', () => {
  it('applies 15% VAT to goods with no discount or delivery', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      vatRate: DEFAULT_VAT_RATE,
      commissionRate: DEFAULT_COMMISSION_RATE,
    });
    expect(r.taxMinor).toBe(300); // 2000 * 0.15
    expect(r.totalMinor).toBe(2300); // 2000 + 300
  });

  it('charges VAT on the discounted base, not the gross', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 500,
      deliveryFeeMinor: 0,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    // netGoods 1500 -> VAT 225 -> total 1725
    expect(r.discountMinor).toBe(500);
    expect(r.taxMinor).toBe(225);
    expect(r.totalMinor).toBe(1725);
  });

  it('includes the delivery fee in the taxable base', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 0,
      deliveryFeeMinor: 1000,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    // taxable 3000 -> VAT 450 -> total 3450
    expect(r.taxMinor).toBe(450);
    expect(r.totalMinor).toBe(3450);
  });

  it('rounds VAT to the nearest minor unit', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 3333,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    expect(r.taxMinor).toBe(500); // round(499.95)
    expect(Number.isInteger(r.taxMinor)).toBe(true);
  });

  it('charges no VAT when the rate is zero', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      vatRate: 0,
      commissionRate: 0.05,
    });
    expect(r.taxMinor).toBe(0);
    expect(r.totalMinor).toBe(2000);
  });
});

describe('computeOrderFinancials — commission & merchant net', () => {
  it('takes commission on net goods only (excludes VAT and delivery)', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 500,
      deliveryFeeMinor: 1000,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    // netGoods = 1500 -> commission = 75 -> merchantNet = 1425
    expect(r.commissionMinor).toBe(75);
    expect(r.merchantNetMinor).toBe(1425);
  });

  it('satisfies merchantNet + commission = netGoods', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 12345,
      discountMinor: 1234,
      deliveryFeeMinor: 567,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    expect(r.merchantNetMinor + r.commissionMinor).toBe(12345 - 1234);
  });
});

describe('computeOrderFinancials — clamping & invariants', () => {
  it('clamps a discount that exceeds the subtotal', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 2000,
      discountMinor: 5000,
      deliveryFeeMinor: 0,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    expect(r.discountMinor).toBe(2000);
    expect(r.totalMinor).toBe(0);
    expect(r.merchantNetMinor).toBe(0);
  });

  it('never produces negative totals from negative inputs', () => {
    const r = computeOrderFinancials({
      subtotalMinor: -100,
      discountMinor: -50,
      deliveryFeeMinor: -10,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    expect(r.productsMinor).toBe(0);
    expect(r.discountMinor).toBe(0);
    expect(r.deliveryFeeMinor).toBe(0);
    expect(r.totalMinor).toBe(0);
  });

  it('returns integer minor units for every field', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 9999,
      discountMinor: 333,
      deliveryFeeMinor: 777,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    for (const v of Object.values(r)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('handles a zero-value order', () => {
    const r = computeOrderFinancials({
      subtotalMinor: 0,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      vatRate: 0.15,
      commissionRate: 0.05,
    });
    expect(r).toEqual({
      productsMinor: 0,
      discountMinor: 0,
      deliveryFeeMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      commissionMinor: 0,
      merchantNetMinor: 0,
    });
  });
});
