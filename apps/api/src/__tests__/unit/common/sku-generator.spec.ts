import { describe, it, expect } from 'vitest';
import {
  generateSku,
  appendCollisionSuffix,
  buildVariantTitle,
} from '../../../common/utils/sku-generator';

describe('SKU Generator (Variant Identity Remediation)', () => {
  // ── generateSku ──────────────────────────────────────────────

  describe('generateSku', () => {
    it('produces a deterministic SKU from brand + title + attributes', () => {
      const sku = generateSku({
        brand: 'Lenovo',
        productTitle: 'ThinkPad E16 Gen 2',
        attributeValues: ['Intel Core i3-1315U', '16GB', '512GB', 'Windows 11 Pro'],
      });
      expect(sku).toBeTruthy();
      expect(sku).toMatch(/^[A-Z0-9-]+$/);
      expect(sku.length).toBeLessThanOrEqual(100);
      // Same inputs → same output
      const sku2 = generateSku({
        brand: 'Lenovo',
        productTitle: 'ThinkPad E16 Gen 2',
        attributeValues: ['Intel Core i3-1315U', '16GB', '512GB', 'Windows 11 Pro'],
      });
      expect(sku).toBe(sku2);
    });

    it('omits brand prefix when brand is null', () => {
      const sku = generateSku({
        brand: null,
        productTitle: 'Generic Widget',
        attributeValues: ['Red', 'Large'],
      });
      expect(sku).toMatch(/^[A-Z0-9-]+$/);
      // Should not start with a brand abbreviation
      expect(sku.length).toBeGreaterThan(0);
    });

    it('handles empty attribute values', () => {
      const sku = generateSku({
        brand: 'Apple',
        productTitle: 'iPhone 15',
        attributeValues: [],
      });
      expect(sku).toMatch(/^[A-Z0-9-]+$/);
    });

    it('skips empty/whitespace attribute values', () => {
      const a = generateSku({ brand: 'X', productTitle: 'Y', attributeValues: ['', '  ', 'Red'] });
      const b = generateSku({ brand: 'X', productTitle: 'Y', attributeValues: ['Red'] });
      expect(a).toBe(b);
    });

    it('truncates to 100 characters max', () => {
      const longTitle = 'A'.repeat(200);
      const sku = generateSku({ brand: 'Brand', productTitle: longTitle });
      expect(sku.length).toBeLessThanOrEqual(100);
    });

    it('strips diacritics and non-ASCII characters', () => {
      const sku = generateSku({
        brand: 'Ñoño',
        productTitle: 'Café Résumé',
        attributeValues: ['Größe M'],
      });
      expect(sku).toMatch(/^[A-Z0-9-]+$/);
      expect(sku).not.toContain('Ñ');
      expect(sku).not.toContain('é');
      expect(sku).not.toContain('ö');
    });

    it('never produces JSON or attrId patterns', () => {
      const sku = generateSku({
        brand: 'Test',
        productTitle: 'Product',
        attributeValues: ['attr-123-value'],
      });
      expect(sku).not.toContain('{');
      expect(sku).not.toContain('}');
      expect(sku).not.toContain('attrId');
      expect(sku).not.toContain('[');
    });
  });

  // ── appendCollisionSuffix ────────────────────────────────────

  describe('appendCollisionSuffix', () => {
    it('appends a numeric suffix', () => {
      expect(appendCollisionSuffix('ABC-DEF', 1)).toBe('ABC-DEF-1');
      expect(appendCollisionSuffix('ABC-DEF', 42)).toBe('ABC-DEF-42');
    });

    it('truncates base to 96 chars before appending', () => {
      const long = 'A'.repeat(100);
      const result = appendCollisionSuffix(long, 1);
      // 96 chars base + '-' + '1' = 98
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toMatch(/-1$/);
    });
  });

  // ── buildVariantTitle ────────────────────────────────────────

  describe('buildVariantTitle', () => {
    it('joins attribute values with " / "', () => {
      const title = buildVariantTitle([
        { name: 'Processor', value: 'Intel Core i3-1315U' },
        { name: 'RAM', value: '16GB' },
        { name: 'Storage', value: '512GB' },
      ]);
      expect(title).toBe('Intel Core i3-1315U / 16GB / 512GB');
    });

    it('skips attributes with empty values', () => {
      const title = buildVariantTitle([
        { name: 'Color', value: 'Red' },
        { name: 'Size', value: '' },
        { name: 'Material', value: 'Cotton' },
      ]);
      expect(title).toBe('Red / Cotton');
    });

    it('returns empty string when all values are empty', () => {
      const title = buildVariantTitle([
        { name: 'A', value: '' },
        { name: 'B', value: '  ' },
      ]);
      expect(title).toBe('');
    });
  });
});
