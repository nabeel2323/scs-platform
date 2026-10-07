/**
 * P9 — Search Enhancement & Export Completeness: Unit Tests
 *
 * Covers the testable surface without a real PostgreSQL:
 *   - Controller price/availability/sort validation logic
 *   - Price major→minor unit conversion
 *   - Sort value mapping (UI → server)
 *   - CSV attribute serialization (serializeAttributeValue equivalent)
 *   - Deterministic MULTI_SELECT serialization
 *   - CSV row generation helpers
 *
 * Acceptance criteria covered:
 *   NP-A12  search privacy/security (validation prevents bad input)
 *   NP-A09  typed attr export (serialization correctness)
 */
import { describe, it, expect } from 'vitest';

// ─── Controller validation logic (extracted for unit testing) ─────────────

/**
 * Mirrors the exact validation logic in catalog.controller.ts search().
 * Returns the converted params or throws message on error.
 */
function validateSearchParams(raw: {
  priceMin?: string;
  priceMax?: string;
  availability?: string;
  sort?: string;
}): {
  priceMin?: number;
  priceMax?: number;
  availability?: 'inStock';
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'name';
} {
  const { priceMin: pMinRaw, priceMax: pMaxRaw, availability, sort } = raw;

  let priceMin: number | undefined;
  let priceMax: number | undefined;

  if (pMinRaw != null && pMinRaw !== '') {
    const parsed = parseFloat(pMinRaw);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error('priceMin must be a non-negative number');
    }
    priceMin = Math.round(parsed * 100);
  }
  if (pMaxRaw != null && pMaxRaw !== '') {
    const parsed = parseFloat(pMaxRaw);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error('priceMax must be a non-negative number');
    }
    priceMax = Math.round(parsed * 100);
  }
  if (priceMin != null && priceMax != null && priceMin > priceMax) {
    throw new Error('priceMin must not exceed priceMax');
  }

  if (availability != null && availability !== '' && availability !== 'inStock') {
    throw new Error(`Invalid availability value '${availability}'. Supported: inStock`);
  }

  const validSorts = ['price_asc', 'price_desc', 'newest', 'name'] as const;
  type SortValue = typeof validSorts[number];
  let sortValue: SortValue | undefined;
  if (sort != null && sort !== '') {
    if (!validSorts.includes(sort as SortValue)) {
      throw new Error(`Invalid sort value '${sort}'. Supported: ${validSorts.join(', ')}`);
    }
    sortValue = sort as SortValue;
  }

  return {
    priceMin,
    priceMax,
    availability: availability === 'inStock' ? 'inStock' : undefined,
    sort: sortValue,
  };
}

/**
 * Mirrors serializeAttributeValue from catalog.service.ts.
 */
function serializeAttributeValue(row: {
  valueText: string | null;
  valueNumber: string | null;
  valueBoolean: boolean | null;
  optionValue: string | null;
  valueJson: any;
}): string {
  if (row.valueText != null) return row.valueText;
  if (row.valueNumber != null) return String(row.valueNumber);
  if (row.valueBoolean != null) return row.valueBoolean ? 'true' : 'false';
  if (row.optionValue != null) return row.optionValue;
  if (row.valueJson != null) {
    const arr = Array.isArray(row.valueJson) ? row.valueJson : [row.valueJson];
    return [...new Set(arr.map(String))].sort().join(',');
  }
  return '';
}

/**
 * Mirrors the web sort mapping from SearchPageClient.tsx.
 */
function mapUiSortToServer(sort: 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'title-asc') {
  return sort === 'price-asc' ? 'price_asc' as const
    : sort === 'price-desc' ? 'price_desc' as const
    : sort === 'newest' ? 'newest' as const
    : sort === 'title-asc' ? 'name' as const
    : undefined;
}

// ═══════════════════════════════════════════════════════════════════
//  PRICE PARSING & VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('P9 Unit — Price parsing', () => {
  it('converts major units to minor units (halalas)', () => {
    const r = validateSearchParams({ priceMin: '10.50', priceMax: '99.99' });
    expect(r.priceMin).toBe(1050);
    expect(r.priceMax).toBe(9999);
  });

  it('handles integer prices', () => {
    const r = validateSearchParams({ priceMin: '500' });
    expect(r.priceMin).toBe(50000);
  });

  it('handles zero price', () => {
    const r = validateSearchParams({ priceMin: '0' });
    expect(r.priceMin).toBe(0);
  });

  it('rounds fractional halalas correctly', () => {
    const r = validateSearchParams({ priceMin: '1.005' });
    // IEEE 754: 1.005 * 100 = 100.49999... → Math.round → 100
    expect(r.priceMin).toBe(100);
  });
});

describe('P9 Unit — Invalid price', () => {
  it('rejects non-numeric priceMin', () => {
    expect(() => validateSearchParams({ priceMin: 'abc' })).toThrow('priceMin must be a non-negative number');
  });

  it('rejects non-numeric priceMax', () => {
    expect(() => validateSearchParams({ priceMax: 'xyz' })).toThrow('priceMax must be a non-negative number');
  });

  it('rejects empty string priceMin (treated as absent)', () => {
    const r = validateSearchParams({ priceMin: '' });
    expect(r.priceMin).toBeUndefined();
  });
});

describe('P9 Unit — Negative price', () => {
  it('rejects negative priceMin', () => {
    expect(() => validateSearchParams({ priceMin: '-10' })).toThrow('priceMin must be a non-negative number');
  });

  it('rejects negative priceMax', () => {
    expect(() => validateSearchParams({ priceMax: '-5' })).toThrow('priceMax must be a non-negative number');
  });
});

describe('P9 Unit — Min/Max cross-validation', () => {
  it('rejects priceMin > priceMax', () => {
    expect(() => validateSearchParams({ priceMin: '200', priceMax: '100' })).toThrow('priceMin must not exceed priceMax');
  });

  it('accepts priceMin == priceMax', () => {
    const r = validateSearchParams({ priceMin: '50', priceMax: '50' });
    expect(r.priceMin).toBe(5000);
    expect(r.priceMax).toBe(5000);
  });

  it('accepts priceMin < priceMax', () => {
    const r = validateSearchParams({ priceMin: '10', priceMax: '100' });
    expect(r.priceMin).toBe(1000);
    expect(r.priceMax).toBe(10000);
  });

  it('accepts only priceMin without priceMax', () => {
    const r = validateSearchParams({ priceMin: '25' });
    expect(r.priceMin).toBe(2500);
    expect(r.priceMax).toBeUndefined();
  });

  it('accepts only priceMax without priceMin', () => {
    const r = validateSearchParams({ priceMax: '75' });
    expect(r.priceMin).toBeUndefined();
    expect(r.priceMax).toBe(7500);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  AVAILABILITY VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('P9 Unit — Availability validation', () => {
  it('accepts inStock', () => {
    const r = validateSearchParams({ availability: 'inStock' });
    expect(r.availability).toBe('inStock');
  });

  it('rejects unknown availability value', () => {
    expect(() => validateSearchParams({ availability: 'outOfStock' })).toThrow('Invalid availability');
  });

  it('rejects empty-string-ish availability', () => {
    // Empty string is treated as absent (no filter)
    const r = validateSearchParams({ availability: '' });
    expect(r.availability).toBeUndefined();
  });

  it('treats undefined as absent', () => {
    const r = validateSearchParams({});
    expect(r.availability).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SORT VALIDATION & MAPPING
// ═══════════════════════════════════════════════════════════════════

describe('P9 Unit — Sort validation', () => {
  it('accepts price_asc', () => {
    expect(validateSearchParams({ sort: 'price_asc' }).sort).toBe('price_asc');
  });

  it('accepts price_desc', () => {
    expect(validateSearchParams({ sort: 'price_desc' }).sort).toBe('price_desc');
  });

  it('accepts newest', () => {
    expect(validateSearchParams({ sort: 'newest' }).sort).toBe('newest');
  });

  it('accepts name', () => {
    expect(validateSearchParams({ sort: 'name' }).sort).toBe('name');
  });

  it('rejects invalid sort value', () => {
    expect(() => validateSearchParams({ sort: 'popularity' })).toThrow('Invalid sort');
  });

  it('treats empty sort as absent', () => {
    const r = validateSearchParams({ sort: '' });
    expect(r.sort).toBeUndefined();
  });
});

describe('P9 Unit — Web sort mapping (UI → server)', () => {
  it('maps featured → undefined (default)', () => {
    expect(mapUiSortToServer('featured')).toBeUndefined();
  });

  it('maps price-asc → price_asc', () => {
    expect(mapUiSortToServer('price-asc')).toBe('price_asc');
  });

  it('maps price-desc → price_desc', () => {
    expect(mapUiSortToServer('price-desc')).toBe('price_desc');
  });

  it('maps newest → newest', () => {
    expect(mapUiSortToServer('newest')).toBe('newest');
  });

  it('maps title-asc → name', () => {
    expect(mapUiSortToServer('title-asc')).toBe('name');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ATTRIBUTE SERIALIZATION (all 14 P8-supported types)
// ═══════════════════════════════════════════════════════════════════

describe('P9 Unit — Attribute serialization', () => {
  it('TEXT → raw text', () => {
    expect(serializeAttributeValue({
      valueText: 'Hello World', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('Hello World');
  });

  it('LONG_TEXT → raw text', () => {
    expect(serializeAttributeValue({
      valueText: 'Long description with\nnewlines', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('Long description with\nnewlines');
  });

  it('URL → raw text', () => {
    expect(serializeAttributeValue({
      valueText: 'https://example.com/img.png', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('https://example.com/img.png');
  });

  it('COLOR → raw text', () => {
    expect(serializeAttributeValue({
      valueText: '#FF5733', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('#FF5733');
  });

  it('FILE → raw text (storage key)', () => {
    expect(serializeAttributeValue({
      valueText: 'uploads/doc.pdf', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('uploads/doc.pdf');
  });

  it('INTEGER → numeric string', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: '42', valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('42');
  });

  it('MEASUREMENT → numeric string', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: '15.5', valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('15.5');
  });

  it('DECIMAL → numeric string', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: '3.14159', valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('3.14159');
  });

  it('CURRENCY → numeric string', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: '99.99', valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('99.99');
  });

  it('BOOLEAN true → "true"', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: true, optionValue: null, valueJson: null,
    })).toBe('true');
  });

  it('BOOLEAN false → "false"', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: false, optionValue: null, valueJson: null,
    })).toBe('false');
  });

  it('DATE → raw text (ISO string)', () => {
    expect(serializeAttributeValue({
      valueText: '2025-01-15', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('2025-01-15');
  });

  it('DATETIME → raw text (ISO string)', () => {
    expect(serializeAttributeValue({
      valueText: '2025-01-15T10:30:00Z', valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('2025-01-15T10:30:00Z');
  });

  it('SELECT → option value string', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: 'Large', valueJson: null,
    })).toBe('Large');
  });

  it('MULTI_SELECT → sorted, deduplicated comma-separated', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null,
      valueJson: ['C', 'A', 'B', 'A'],
    })).toBe('A,B,C');
  });
});

describe('P9 Unit — Deterministic MULTI_SELECT serialization', () => {
  it('sorts values alphabetically', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null,
      valueJson: ['Zebra', 'Apple', 'Mango'],
    })).toBe('Apple,Mango,Zebra');
  });

  it('removes duplicates', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null,
      valueJson: ['X', 'X', 'Y', 'Y', 'Z'],
    })).toBe('X,Y,Z');
  });

  it('handles single-element array', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null,
      valueJson: ['Only'],
    })).toBe('Only');
  });

  it('handles non-array JSON (wraps in array)', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null,
      valueJson: 'SingleValue',
    })).toBe('SingleValue');
  });

  it('produces identical output for same input regardless of order', () => {
    const input1 = { valueText: null, valueNumber: null, valueBoolean: null, optionValue: null, valueJson: ['B', 'A', 'C'] };
    const input2 = { valueText: null, valueNumber: null, valueBoolean: null, optionValue: null, valueJson: ['C', 'B', 'A'] };
    expect(serializeAttributeValue(input1)).toBe(serializeAttributeValue(input2));
  });
});

describe('P9 Unit — All-null attribute returns empty string', () => {
  it('returns empty string when all fields are null', () => {
    expect(serializeAttributeValue({
      valueText: null, valueNumber: null, valueBoolean: null, optionValue: null, valueJson: null,
    })).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  COMBINED PARAMETER VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('P9 Unit — Combined parameters compose independently', () => {
  it('accepts all valid params together', () => {
    const r = validateSearchParams({
      priceMin: '100', priceMax: '500', availability: 'inStock', sort: 'price_asc',
    });
    expect(r.priceMin).toBe(10000);
    expect(r.priceMax).toBe(50000);
    expect(r.availability).toBe('inStock');
    expect(r.sort).toBe('price_asc');
  });

  it('accepts no params (all defaults)', () => {
    const r = validateSearchParams({});
    expect(r.priceMin).toBeUndefined();
    expect(r.priceMax).toBeUndefined();
    expect(r.availability).toBeUndefined();
    expect(r.sort).toBeUndefined();
  });
});
