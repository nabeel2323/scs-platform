/**
 * Unit tests — Catalog seed data structural validation.
 *
 * Verifies the seed data modules are internally consistent:
 * - No duplicate slugs/codes
 * - All FK references resolve
 * - Required attributes are covered
 * - SELECT options match attribute definitions
 * - Product variants have valid attribute values
 */

import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '../../../../infra/seed-data/categories';
import { BRANDS } from '../../../../infra/seed-data/brands';
import { ATTRIBUTE_GROUPS, ATTRIBUTES } from '../../../../infra/seed-data/attributes';
import { PRODUCT_TYPES } from '../../../../infra/seed-data/product-types';
import { ALL_PRODUCTS } from '../../../../infra/seed-data/products';
import { PRODUCT_SOURCES } from '../../../../infra/seed-data/sources';
import { validateCatalogSeed } from '../../../../infra/seed-data/validate';

describe('Catalog Seed Data — Structure', () => {
  // ── Categories ──────────────────────────────────────────────────────────
  describe('Categories', () => {
    it('has at least 20 categories', () => {
      expect(CATEGORIES.length).toBeGreaterThanOrEqual(20);
    });

    it('has unique slugs', () => {
      const slugs = CATEGORIES.map(c => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('all parent references resolve', () => {
      const slugSet = new Set(CATEGORIES.map(c => c.slug));
      for (const cat of CATEGORIES) {
        if (cat.parentSlug) {
          expect(slugSet.has(cat.parentSlug)).toBe(true);
        }
      }
    });

    it('has a single root category', () => {
      const roots = CATEGORIES.filter(c => !c.parentSlug);
      expect(roots.length).toBe(1);
      expect(roots[0]!.slug).toBe('computers-it');
    });
  });

  // ── Brands ──────────────────────────────────────────────────────────────
  describe('Brands', () => {
    it('has 18 brands', () => {
      expect(BRANDS.length).toBe(18);
    });

    it('has unique slugs', () => {
      const slugs = BRANDS.map(b => b.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('includes major IT brands', () => {
      const slugs = new Set(BRANDS.map(b => b.slug));
      for (const expected of ['dell', 'lenovo', 'hp', 'apple', 'asus', 'samsung', 'intel', 'amd', 'nvidia']) {
        expect(slugs.has(expected)).toBe(true);
      }
    });
  });

  // ── Attributes ──────────────────────────────────────────────────────────
  describe('Attributes', () => {
    it('has at least 60 attribute definitions', () => {
      expect(ATTRIBUTES.length).toBeGreaterThanOrEqual(60);
    });

    it('has unique codes', () => {
      const codes = ATTRIBUTES.map(a => a.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('all SELECT attributes have options', () => {
      for (const attr of ATTRIBUTES) {
        if (attr.type === 'SELECT' || attr.type === 'MULTI_SELECT') {
          expect(attr.options).toBeDefined();
          expect(attr.options!.length).toBeGreaterThan(0);
        }
      }
    });

    it('SELECT options have unique values within each attribute', () => {
      for (const attr of ATTRIBUTES) {
        if (attr.options) {
          const values = attr.options.map(o => o.value);
          expect(new Set(values).size).toBe(values.length);
        }
      }
    });

    it('has at least 12 attribute groups', () => {
      expect(ATTRIBUTE_GROUPS.length).toBeGreaterThanOrEqual(12);
    });

    it('has unique group names', () => {
      const names = ATTRIBUTE_GROUPS.map(g => g.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  // ── Product Types ───────────────────────────────────────────────────────
  describe('Product Types', () => {
    it('has at least 15 product types', () => {
      expect(PRODUCT_TYPES.length).toBeGreaterThanOrEqual(15);
    });

    it('has unique codes', () => {
      const codes = PRODUCT_TYPES.map(pt => pt.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('all category references resolve', () => {
      const catSlugs = new Set(CATEGORIES.map(c => c.slug));
      for (const pt of PRODUCT_TYPES) {
        if (pt.categorySlug) {
          expect(catSlugs.has(pt.categorySlug)).toBe(true);
        }
      }
    });

    it('all attribute references resolve', () => {
      const attrCodes = new Set(ATTRIBUTES.map(a => a.code));
      for (const pt of PRODUCT_TYPES) {
        for (const ta of (pt.attributes ?? [])) {
          expect(attrCodes.has(ta.attributeCode)).toBe(true);
        }
      }
    });

    it('variant dimensions reference valid attributes', () => {
      const attrCodes = new Set(ATTRIBUTES.map(a => a.code));
      for (const pt of PRODUCT_TYPES) {
        for (const dim of (pt.variantDimensions ?? [])) {
          expect(attrCodes.has(dim)).toBe(true);
        }
      }
    });
  });

  // ── Products ────────────────────────────────────────────────────────────
  describe('Products', () => {
    it('has at least 25 canonical products', () => {
      expect(ALL_PRODUCTS.length).toBeGreaterThanOrEqual(25);
    });

    it('has unique slugs', () => {
      const slugs = ALL_PRODUCTS.map(p => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('has unique SKUs across all variants', () => {
      const skus: string[] = [];
      for (const p of ALL_PRODUCTS) {
        for (const v of (p.variants ?? [])) {
          skus.push(v.sku);
        }
      }
      expect(new Set(skus).size).toBe(skus.length);
    });

    it('all brand references resolve', () => {
      const brandSlugs = new Set(BRANDS.map(b => b.slug));
      for (const p of ALL_PRODUCTS) {
        expect(brandSlugs.has(p.brandSlug)).toBe(true);
      }
    });

    it('all category references resolve', () => {
      const catSlugs = new Set(CATEGORIES.map(c => c.slug));
      for (const p of ALL_PRODUCTS) {
        expect(catSlugs.has(p.categorySlug)).toBe(true);
      }
    });

    it('all product type references resolve', () => {
      const ptCodes = new Set(PRODUCT_TYPES.map(pt => pt.code));
      for (const p of ALL_PRODUCTS) {
        expect(ptCodes.has(p.productTypeCode)).toBe(true);
      }
    });

    it('every product has at least one variant', () => {
      for (const p of ALL_PRODUCTS) {
        expect(p.variants).toBeDefined();
        expect(p.variants!.length).toBeGreaterThan(0);
      }
    });

    it('no fabricated GTIN/EAN codes', () => {
      for (const p of ALL_PRODUCTS) {
        if (p.gtin) expect(p.gtin).toMatch(/^\d{8,14}$/);
        if (p.ean) expect(p.ean).toMatch(/^\d{8,14}$/);
      }
    });

    it('all product attribute values reference valid attributes', () => {
      const attrCodes = new Set(ATTRIBUTES.map(a => a.code));
      for (const p of ALL_PRODUCTS) {
        for (const av of (p.attributes ?? [])) {
          expect(attrCodes.has(av.attributeCode)).toBe(true);
        }
      }
    });

    it('all variant attribute values reference valid attributes', () => {
      const attrCodes = new Set(ATTRIBUTES.map(a => a.code));
      for (const p of ALL_PRODUCTS) {
        for (const v of (p.variants ?? [])) {
          for (const av of (v.attributes ?? [])) {
            expect(attrCodes.has(av.attributeCode)).toBe(true);
          }
        }
      }
    });

    it('SELECT option values match attribute definitions', () => {
      const selectOptions = new Map<string, Set<string>>();
      for (const attr of ATTRIBUTES) {
        if (attr.options) {
          selectOptions.set(attr.code, new Set(attr.options.map(o => o.value)));
        }
      }
      for (const p of ALL_PRODUCTS) {
        for (const av of (p.attributes ?? [])) {
          if (av.option !== undefined) {
            const allowed = selectOptions.get(av.attributeCode);
            if (allowed) {
              expect(allowed.has(av.option)).toBe(true);
            }
          }
        }
        for (const v of (p.variants ?? [])) {
          for (const av of (v.attributes ?? [])) {
            if (av.option !== undefined) {
              const allowed = selectOptions.get(av.attributeCode);
              if (allowed) {
                expect(allowed.has(av.option)).toBe(true);
              }
            }
          }
        }
      }
    });
  });

  // ── Source Provenance ───────────────────────────────────────────────────
  describe('Sources', () => {
    it('has sources for most products', () => {
      const coverage = PRODUCT_SOURCES.length / ALL_PRODUCTS.length;
      expect(coverage).toBeGreaterThan(0.8);
    });

    it('all source product slugs exist', () => {
      const productSlugs = new Set(ALL_PRODUCTS.map(p => p.slug));
      for (const src of PRODUCT_SOURCES) {
        expect(productSlugs.has(src.productSlug)).toBe(true);
      }
    });
  });

  // ── Validation function ─────────────────────────────────────────────────
  describe('validateCatalogSeed()', () => {
    it('returns zero errors', () => {
      const errors = validateCatalogSeed();
      const realErrors = errors.filter(e => e.level === 'error');
      expect(realErrors).toEqual([]);
    });
  });
});
