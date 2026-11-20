import { describe, expect, it } from 'vitest';
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, currencyMinorUnits } from '../lib/reference-data';

describe('ISO reference selectors', () => {
  it('includes the complete ISO 3166-1 country/territory set', () => {
    expect(COUNTRY_OPTIONS).toHaveLength(249);
    expect(new Set(COUNTRY_OPTIONS.map((country) => country.value)).size).toBe(249);
    expect(COUNTRY_OPTIONS.every((country) => /^[A-Z]{2}$/.test(country.value))).toBe(true);
  });

  it('includes broad active currency coverage and correct minor-unit precision', () => {
    expect(CURRENCY_OPTIONS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(CURRENCY_OPTIONS.map((currency) => currency.value)).size).toBe(CURRENCY_OPTIONS.length);
    expect(currencyMinorUnits('JPY')).toBe(0);
    expect(currencyMinorUnits('USD')).toBe(2);
    expect(currencyMinorUnits('KWD')).toBe(3);
  });
});
