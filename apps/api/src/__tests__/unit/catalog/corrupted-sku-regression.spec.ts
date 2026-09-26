/**
 * Unit tests — Corrupted SKU regression (M3 Phase 21).
 *
 * Verifies that the SKU generation pipeline never produces the corrupted
 * `SKU-[...]` pattern caused by the old useProductStudio.ts bug where
 * `JSON.stringify([{attrId, value}])` was used as the SKU.
 *
 * These tests run without Docker and guard against regression.
 */
import { describe, it, expect } from 'vitest';
import { generateSku, appendCollisionSuffix } from '../../../common/utils/sku-generator';

// The server-side SKU generator (apps/api/src/common/utils/sku-generator.ts)
// is the authoritative source. Both client and server must produce identical
// output for the same inputs.

describe('Corrupted SKU regression (Phase 21)', () => {
  // The corrupted pattern: SKU-[{"attrId":"...","value":"..."}]
  const CORRUPTED_PATTERN = /^SKU-\[/;

  it('generateSku never produces SKU-[...] pattern', () => {
    const sku = generateSku({
      brand: 'Dell',
      productTitle: 'Latitude 5550',
      attributeValues: ['Intel Core i5', '16 GB', '512 GB SSD'],
    });
    expect(sku).not.toMatch(CORRUPTED_PATTERN);
    expect(sku.length).toBeGreaterThan(0);
    expect(sku.length).toBeLessThanOrEqual(100);
  });

  it('generateSku produces deterministic output for same input', () => {
    const input = {
      brand: 'Lenovo',
      productTitle: 'ThinkPad T14',
      attributeValues: ['AMD Ryzen 5', '8 GB'],
    };
    expect(generateSku(input)).toBe(generateSku(input));
  });

  it('generateSku handles empty attribute values', () => {
    const sku = generateSku({
      brand: 'HP',
      productTitle: 'ProBook 450',
      attributeValues: [],
    });
    expect(sku).not.toMatch(CORRUPTED_PATTERN);
    expect(sku.length).toBeGreaterThan(0);
  });

  it('generateSku handles null/undefined inputs gracefully', () => {
    const sku = generateSku({
      brand: null,
      productTitle: 'Test Product',
      attributeValues: undefined,
    });
    expect(sku).not.toMatch(CORRUPTED_PATTERN);
  });

  it('appendCollisionSuffix does not produce corrupted pattern', () => {
    const base = generateSku({ brand: 'Dell', productTitle: 'Test' });
    const suffixed = appendCollisionSuffix(base, 1);
    expect(suffixed).not.toMatch(CORRUPTED_PATTERN);
    expect(suffixed).toMatch(/-1$/);
  });

  it('SKU never contains JSON artifacts (braces, brackets, quotes)', () => {
    const sku = generateSku({
      brand: 'ASUS',
      productTitle: 'ROG Strix G15',
      attributeValues: ['NVIDIA RTX 4060', '32 GB DDR5', '1 TB NVMe'],
    });
    expect(sku).not.toContain('{');
    expect(sku).not.toContain('}');
    expect(sku).not.toContain('[');
    expect(sku).not.toContain(']');
    expect(sku).not.toContain('"');
  });

  it('SKU is human-readable and contains abbreviated tokens', () => {
    const sku = generateSku({
      brand: 'Dell',
      productTitle: 'Latitude 5550',
      attributeValues: ['Intel Core i7-1315U', '16 GB'],
    });
    // Should contain abbreviated brand + product tokens
    expect(sku.length).toBeGreaterThan(3);
    // Should be uppercase/hyphenated (not JSON)
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
  });
});
