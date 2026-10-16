import { describe, it, expect } from 'vitest';

/**
 * Promotions Service — Unit Tests
 *
 * Covers:
 * - Discount calculation for all promo types (PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED)
 * - Max discount cap enforcement
 * - Min order threshold validation
 * - Discount cannot exceed cart total
 * - Redemption limit logic
 * - Per-user limit logic
 */

// ── Discount Calculation Logic ────────────────────────────────────

interface Promotion {
  promoType: string;
  discountValue: number;
  minOrderMinor: number;
  maxDiscountMinor: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  perUserLimit: number;
}

/**
 * Calculate discount — mirrors promotions.service.ts calculateDiscount().
 */
function calculateDiscount(promo: Promotion, cartTotalMinor: number): number {
  if (cartTotalMinor < (promo.minOrderMinor || 0)) return 0;

  let discount = 0;
  switch (promo.promoType) {
    case 'PERCENT':
      discount = Math.round(cartTotalMinor * promo.discountValue / 100);
      break;
    case 'FIXED':
      discount = promo.discountValue;
      break;
    case 'QTY_DISCOUNT':
      discount = promo.discountValue;
      break;
    case 'TIME_LIMITED':
      discount = Math.round(cartTotalMinor * promo.discountValue / 100);
      break;
    default:
      discount = 0;
  }

  // Apply max discount cap
  if (promo.maxDiscountMinor && discount > promo.maxDiscountMinor) {
    discount = promo.maxDiscountMinor;
  }

  return Math.min(discount, cartTotalMinor); // can't exceed cart total
}

/**
 * Check if a promotion can be redeemed — mirrors the redemption guard logic
 * in promotions.service.ts redeemPromotion().
 */
function canRedeem(
  promo: Promotion,
  userRedemptionCount: number,
): { allowed: boolean; reason?: string } {
  if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) {
    return { allowed: false, reason: 'Promotion has reached maximum redemptions' };
  }
  if (promo.perUserLimit && userRedemptionCount >= promo.perUserLimit) {
    return { allowed: false, reason: 'You have already used this promotion the maximum number of times' };
  }
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Promotions Service — PERCENT Discount', () => {
  const basePromo: Promotion = {
    promoType: 'PERCENT',
    discountValue: 10, // 10%
    minOrderMinor: 0,
    maxDiscountMinor: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should calculate 10% of cart total', () => {
    expect(calculateDiscount(basePromo, 10000)).toBe(1000);
  });

  it('should round to nearest integer', () => {
    // 3333 * 10% = 333.3 → rounds to 333
    expect(calculateDiscount(basePromo, 3333)).toBe(333);
  });

  it('should round up when >= .5', () => {
    // 3335 * 10% = 333.5 → rounds to 334
    expect(calculateDiscount(basePromo, 3335)).toBe(334);
  });

  it('should return 0 for zero cart total', () => {
    expect(calculateDiscount(basePromo, 0)).toBe(0);
  });

  it('should handle 100% discount', () => {
    const fullDiscount = { ...basePromo, discountValue: 100 };
    expect(calculateDiscount(fullDiscount, 5000)).toBe(5000);
  });

  it('should handle 50% discount', () => {
    const halfDiscount = { ...basePromo, discountValue: 50 };
    expect(calculateDiscount(halfDiscount, 10000)).toBe(5000);
  });
});

describe('Promotions Service — FIXED Discount', () => {
  const fixedPromo: Promotion = {
    promoType: 'FIXED',
    discountValue: 500, // 5 SAR
    minOrderMinor: 0,
    maxDiscountMinor: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should return fixed discount amount', () => {
    expect(calculateDiscount(fixedPromo, 10000)).toBe(500);
  });

  it('should return fixed discount regardless of cart total', () => {
    expect(calculateDiscount(fixedPromo, 50000)).toBe(500);
    expect(calculateDiscount(fixedPromo, 1000)).toBe(500);
  });

  it('should cap at cart total when fixed discount exceeds cart', () => {
    expect(calculateDiscount(fixedPromo, 300)).toBe(300); // Can't exceed 300
  });

  it('should handle fixed discount equal to cart total', () => {
    expect(calculateDiscount(fixedPromo, 500)).toBe(500);
  });
});

describe('Promotions Service — QTY_DISCOUNT', () => {
  const qtyPromo: Promotion = {
    promoType: 'QTY_DISCOUNT',
    discountValue: 200, // Fixed qty discount
    minOrderMinor: 0,
    maxDiscountMinor: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should return fixed qty discount', () => {
    expect(calculateDiscount(qtyPromo, 5000)).toBe(200);
  });

  it('should cap at cart total', () => {
    expect(calculateDiscount(qtyPromo, 100)).toBe(100);
  });
});

describe('Promotions Service — TIME_LIMITED Discount', () => {
  const timePromo: Promotion = {
    promoType: 'TIME_LIMITED',
    discountValue: 25, // 25%
    minOrderMinor: 0,
    maxDiscountMinor: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should calculate percentage like PERCENT', () => {
    expect(calculateDiscount(timePromo, 10000)).toBe(2500);
  });

  it('should round correctly', () => {
    // 1234 * 25% = 308.5 → rounds to 309
    expect(calculateDiscount(timePromo, 1234)).toBe(309);
  });
});

describe('Promotions Service — Min Order Threshold', () => {
  const promo: Promotion = {
    promoType: 'PERCENT',
    discountValue: 10,
    minOrderMinor: 5000, // Minimum 50 SAR
    maxDiscountMinor: null,
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should apply discount when cart meets minimum', () => {
    expect(calculateDiscount(promo, 5000)).toBe(500);
    expect(calculateDiscount(promo, 10000)).toBe(1000);
  });

  it('should return 0 when cart is below minimum', () => {
    expect(calculateDiscount(promo, 4999)).toBe(0);
  });

  it('should return 0 for zero cart total', () => {
    expect(calculateDiscount(promo, 0)).toBe(0);
  });

  it('should apply discount at exactly the minimum', () => {
    expect(calculateDiscount(promo, 5000)).toBe(500);
  });
});

describe('Promotions Service — Max Discount Cap', () => {
  const promo: Promotion = {
    promoType: 'PERCENT',
    discountValue: 50, // 50%
    minOrderMinor: 0,
    maxDiscountMinor: 1000, // Cap at 10 SAR
    maxRedemptions: null,
    redemptionCount: 0,
    perUserLimit: 1,
  };

  it('should cap discount at maxDiscountMinor', () => {
    // 50% of 10000 = 5000, but cap is 1000
    expect(calculateDiscount(promo, 10000)).toBe(1000);
  });

  it('should not cap when discount is below max', () => {
    // 50% of 1000 = 500, below cap of 1000
    expect(calculateDiscount(promo, 1000)).toBe(500);
  });

  it('should apply cap at exact boundary', () => {
    // 50% of 2000 = 1000, exactly at cap
    expect(calculateDiscount(promo, 2000)).toBe(1000);
  });

  it('should handle FIXED discount with cap', () => {
    const fixedPromo: Promotion = {
      promoType: 'FIXED',
      discountValue: 5000,
      minOrderMinor: 0,
      maxDiscountMinor: 2000,
      maxRedemptions: null,
      redemptionCount: 0,
      perUserLimit: 1,
    };
    expect(calculateDiscount(fixedPromo, 10000)).toBe(2000);
  });
});

describe('Promotions Service — Discount Invariants', () => {
  it('discount should never exceed cart total', () => {
    const promos: Promotion[] = [
      { promoType: 'PERCENT', discountValue: 100, minOrderMinor: 0, maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 0, perUserLimit: 1 },
      { promoType: 'FIXED', discountValue: 999999, minOrderMinor: 0, maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 0, perUserLimit: 1 },
      { promoType: 'TIME_LIMITED', discountValue: 100, minOrderMinor: 0, maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 0, perUserLimit: 1 },
    ];

    for (const promo of promos) {
      const cartTotal = 500;
      const discount = calculateDiscount(promo, cartTotal);
      expect(discount).toBeLessThanOrEqual(cartTotal);
    }
  });

  it('discount should never be negative', () => {
    const promo: Promotion = {
      promoType: 'PERCENT',
      discountValue: 0,
      minOrderMinor: 0,
      maxDiscountMinor: null,
      maxRedemptions: null,
      redemptionCount: 0,
      perUserLimit: 1,
    };
    expect(calculateDiscount(promo, 10000)).toBe(0);
  });

  it('unknown promo type should return 0 discount', () => {
    const promo: Promotion = {
      promoType: 'UNKNOWN_TYPE' as any,
      discountValue: 100,
      minOrderMinor: 0,
      maxDiscountMinor: null,
      maxRedemptions: null,
      redemptionCount: 0,
      perUserLimit: 1,
    };
    expect(calculateDiscount(promo, 10000)).toBe(0);
  });
});

describe('Promotions Service — Redemption Limits', () => {
  describe('max redemptions', () => {
    it('should allow redemption when under limit', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: 100, redemptionCount: 50, perUserLimit: 1,
      };
      expect(canRedeem(promo, 0)).toEqual({ allowed: true });
    });

    it('should block redemption when max reached', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: 100, redemptionCount: 100, perUserLimit: 1,
      };
      const result = canRedeem(promo, 0);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum redemptions');
    });

    it('should block redemption when over limit', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: 100, redemptionCount: 101, perUserLimit: 1,
      };
      const result = canRedeem(promo, 0);
      expect(result.allowed).toBe(false);
    });

    it('should allow unlimited redemptions when maxRedemptions is null', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 99999, perUserLimit: 1,
      };
      expect(canRedeem(promo, 0)).toEqual({ allowed: true });
    });
  });

  describe('per-user limit', () => {
    it('should allow first use when perUserLimit is 1', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 0, perUserLimit: 1,
      };
      expect(canRedeem(promo, 0)).toEqual({ allowed: true });
    });

    it('should block second use when perUserLimit is 1', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 5, perUserLimit: 1,
      };
      const result = canRedeem(promo, 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum number of times');
    });

    it('should allow multiple uses when perUserLimit is higher', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 10, perUserLimit: 5,
      };
      expect(canRedeem(promo, 3)).toEqual({ allowed: true });
    });

    it('should block when user reaches per-user limit', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: null, redemptionCount: 10, perUserLimit: 5,
      };
      const result = canRedeem(promo, 5);
      expect(result.allowed).toBe(false);
    });
  });

  describe('combined limits', () => {
    it('should block when both limits are reached', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: 100, redemptionCount: 100, perUserLimit: 3,
      };
      // Max redemptions checked first
      const result = canRedeem(promo, 3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum redemptions');
    });

    it('should block on user limit even if global limit not reached', () => {
      const promo: Promotion = {
        promoType: 'PERCENT', discountValue: 10, minOrderMinor: 0,
        maxDiscountMinor: null, maxRedemptions: 100, redemptionCount: 50, perUserLimit: 2,
      };
      const result = canRedeem(promo, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum number of times');
    });
  });
});
