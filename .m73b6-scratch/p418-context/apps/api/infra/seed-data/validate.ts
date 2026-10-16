/**
 * Production Catalog Seed — Validation script.
 *
 * Checks the seed data modules for structural correctness BEFORE running the
 * database seed.  This catches referential integrity issues, duplicate slugs,
 * missing attributes, and type mismatches without needing a database connection.
 *
 * Usage:
 *   pnpm --filter @scs/api catalog:validate
 */

import { CATEGORIES } from './categories';
import { BRANDS } from './brands';
import { ATTRIBUTE_GROUPS, ATTRIBUTES } from './attributes';
import { PRODUCT_TYPES } from './product-types';
import { ALL_PRODUCTS } from './products';
import { PRODUCT_SOURCES } from './sources';
import type { SeedProduct, SeedAttributeValue } from './types';

interface ValidationError {
  level: 'error' | 'warning';
  module: string;
  message: string;
}

export function validateCatalogSeed(): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── 1. Category checks ──────────────────────────────────────────────────
  const catSlugs = new Set<string>();
  for (const cat of CATEGORIES) {
    if (catSlugs.has(cat.slug)) {
      errors.push({ level: 'error', module: 'categories', message: `Duplicate category slug: '${cat.slug}'` });
    }
    catSlugs.add(cat.slug);

    if (cat.parentSlug && !CATEGORIES.some(c => c.slug === cat.parentSlug)) {
      errors.push({ level: 'error', module: 'categories', message: `Category '${cat.slug}' references unknown parent '${cat.parentSlug}'` });
    }
  }

  // ── 2. Brand checks ─────────────────────────────────────────────────────
  const brandSlugs = new Set<string>();
  for (const brand of BRANDS) {
    if (brandSlugs.has(brand.slug)) {
      errors.push({ level: 'error', module: 'brands', message: `Duplicate brand slug: '${brand.slug}'` });
    }
    brandSlugs.add(brand.slug);
  }

  // ── 3. Attribute checks ─────────────────────────────────────────────────
  const attrCodes = new Set<string>();
  const groupNames = new Set<string>();
  const selectAttrs = new Map<string, Set<string>>(); // code → option values

  for (const grp of ATTRIBUTE_GROUPS) {
    if (groupNames.has(grp.name)) {
      errors.push({ level: 'error', module: 'attributes', message: `Duplicate attribute group: '${grp.name}'` });
    }
    groupNames.add(grp.name);
  }

  for (const attr of ATTRIBUTES) {
    if (attrCodes.has(attr.code)) {
      errors.push({ level: 'error', module: 'attributes', message: `Duplicate attribute code: '${attr.code}'` });
    }
    attrCodes.add(attr.code);

    if ((attr.type === 'SELECT' || attr.type === 'MULTI_SELECT') && (!attr.options || attr.options.length === 0)) {
      errors.push({ level: 'error', module: 'attributes', message: `SELECT attribute '${attr.code}' has no options` });
    }

    if (attr.options) {
      const optValues = new Set<string>();
      for (const opt of attr.options) {
        if (optValues.has(opt.value)) {
          errors.push({ level: 'error', module: 'attributes', message: `Duplicate option '${opt.value}' in attribute '${attr.code}'` });
        }
        optValues.add(opt.value);
      }
      selectAttrs.set(attr.code, optValues);
    }
  }

  // ── 4. Product type checks ──────────────────────────────────────────────
  const ptCodes = new Set<string>();
  for (const pt of PRODUCT_TYPES) {
    if (ptCodes.has(pt.code)) {
      errors.push({ level: 'error', module: 'product-types', message: `Duplicate product type code: '${pt.code}'` });
    }
    ptCodes.add(pt.code);

    if (pt.categorySlug && !catSlugs.has(pt.categorySlug)) {
      errors.push({ level: 'error', module: 'product-types', message: `Product type '${pt.code}' references unknown category '${pt.categorySlug}'` });
    }

    for (const ta of (pt.attributes ?? [])) {
      if (!attrCodes.has(ta.attributeCode)) {
        errors.push({ level: 'error', module: 'product-types', message: `Product type '${pt.code}' references unknown attribute '${ta.attributeCode}'` });
      }
      if (ta.groupName && !groupNames.has(ta.groupName)) {
        errors.push({ level: 'warning', module: 'product-types', message: `Product type '${pt.code}' attr '${ta.attributeCode}' references unknown group '${ta.groupName}'` });
      }
    }

    // Check variant dimensions reference valid attributes.
    for (const dim of (pt.variantDimensions ?? [])) {
      if (!attrCodes.has(dim)) {
        errors.push({ level: 'error', module: 'product-types', message: `Product type '${pt.code}' variant dimension '${dim}' not found` });
      }
    }
  }

  // ── 5. Product checks ───────────────────────────────────────────────────
  const productSlugs = new Set<string>();
  const allSkus = new Set<string>();

  for (const prod of ALL_PRODUCTS) {
    // Duplicate slug.
    if (productSlugs.has(prod.slug)) {
      errors.push({ level: 'error', module: 'products', message: `Duplicate product slug: '${prod.slug}'` });
    }
    productSlugs.add(prod.slug);

    // Brand reference.
    if (!brandSlugs.has(prod.brandSlug)) {
      errors.push({ level: 'error', module: 'products', message: `Product '${prod.slug}' references unknown brand '${prod.brandSlug}'` });
    }

    // Category reference.
    if (!catSlugs.has(prod.categorySlug)) {
      errors.push({ level: 'error', module: 'products', message: `Product '${prod.slug}' references unknown category '${prod.categorySlug}'` });
    }

    // Product type reference.
    if (!ptCodes.has(prod.productTypeCode)) {
      errors.push({ level: 'error', module: 'products', message: `Product '${prod.slug}' references unknown product type '${prod.productTypeCode}'` });
    }

    // No fabricated GTIN/EAN.
    if (prod.gtin && !/^\d{8,14}$/.test(prod.gtin)) {
      errors.push({ level: 'warning', module: 'products', message: `Product '${prod.slug}' has suspicious GTIN: '${prod.gtin}'` });
    }
    if (prod.ean && !/^\d{8,14}$/.test(prod.ean)) {
      errors.push({ level: 'warning', module: 'products', message: `Product '${prod.slug}' has suspicious EAN: '${prod.ean}'` });
    }

    // Product attribute values reference valid attributes.
    for (const av of (prod.attributes ?? [])) {
      validateAttributeValue(av, attrCodes, selectAttrs, `product '${prod.slug}'`, errors);
    }

    // Variants.
    for (const variant of (prod.variants ?? [])) {
      if (allSkus.has(variant.sku)) {
        errors.push({ level: 'error', module: 'products', message: `Duplicate SKU: '${variant.sku}'` });
      }
      allSkus.add(variant.sku);

      for (const av of (variant.attributes ?? [])) {
        validateAttributeValue(av, attrCodes, selectAttrs, `variant '${variant.sku}'`, errors);
      }
    }

    // Must have at least one variant.
    if (!prod.variants || prod.variants.length === 0) {
      errors.push({ level: 'warning', module: 'products', message: `Product '${prod.slug}' has no variants` });
    }
  }

  // ── 6. Source provenance checks ──────────────────────────────────────────
  for (const src of PRODUCT_SOURCES) {
    if (!productSlugs.has(src.productSlug)) {
      errors.push({ level: 'warning', module: 'sources', message: `Source references unknown product slug: '${src.productSlug}'` });
    }
  }

  return errors;
}

function validateAttributeValue(
  av: SeedAttributeValue,
  attrCodes: Set<string>,
  selectAttrs: Map<string, Set<string>>,
  context: string,
  errors: ValidationError[],
): void {
  if (!attrCodes.has(av.attributeCode)) {
    errors.push({ level: 'error', module: 'products', message: `${context} references unknown attribute '${av.attributeCode}'` });
    return;
  }

  // Exactly one value field populated.
  const populated = [
    av.text !== undefined,
    av.number !== undefined,
    av.boolean !== undefined,
    av.option !== undefined,
    av.json !== undefined,
  ].filter(Boolean).length;

  if (populated === 0) {
    errors.push({ level: 'warning', module: 'products', message: `${context} attr '${av.attributeCode}' has no value` });
  }
  if (populated > 1) {
    errors.push({ level: 'warning', module: 'products', message: `${context} attr '${av.attributeCode}' has multiple value fields populated` });
  }

  // SELECT option must be in the allowed set.
  if (av.option !== undefined) {
    const allowed = selectAttrs.get(av.attributeCode);
    if (allowed && !allowed.has(av.option)) {
      errors.push({ level: 'error', module: 'products', message: `${context} attr '${av.attributeCode}' has invalid option '${av.option}'` });
    }
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────

function main(): void {
  console.log('🔍 Validating catalog seed data...\n');

  const errors = validateCatalogSeed();
  const errorCount = errors.filter(e => e.level === 'error').length;
  const warnCount = errors.filter(e => e.level === 'warning').length;

  if (errors.length === 0) {
    console.log('✓ All validation checks passed.\n');
  } else {
    for (const err of errors) {
      const icon = err.level === 'error' ? '❌' : '⚠️';
      console.log(`  ${icon} [${err.module}] ${err.message}`);
    }
    console.log(`\n── Validation: ${errorCount} error(s), ${warnCount} warning(s) ──\n`);
  }

  if (errorCount > 0) process.exit(1);
}

const isDirectRun =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.endsWith('validate.ts') || process.argv[1]?.endsWith('validate');

if (isDirectRun) {
  main();
}
