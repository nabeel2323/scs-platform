/**
 * Production Catalog Seed — Report script.
 *
 * Outputs a summary of the seed data: entity counts, product breakdown by
 * category/brand/type, and validation status.  Does NOT require a database
 * connection — it reads the seed data modules directly.
 *
 * Usage:
 *   pnpm --filter @scs/api catalog:report
 */

import { CATEGORIES } from './categories';
import { BRANDS } from './brands';
import { ATTRIBUTE_GROUPS, ATTRIBUTES } from './attributes';
import { PRODUCT_TYPES } from './product-types';
import { ALL_PRODUCTS } from './products';
import { PRODUCT_SOURCES } from './sources';
import { validateCatalogSeed } from './validate';

function report(): void {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Production Catalog Seed — Data Report            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Entity counts ───────────────────────────────────────────────────────
  const totalOptions = ATTRIBUTES.reduce((sum, a) => sum + (a.options?.length ?? 0), 0);
  const totalTypeAttrs = PRODUCT_TYPES.reduce((sum, pt) => sum + (pt.attributes?.length ?? 0), 0);
  const totalVariants = ALL_PRODUCTS.reduce((sum, p) => sum + (p.variants?.length ?? 0), 0);
  const totalProductAttrs = ALL_PRODUCTS.reduce((sum, p) => sum + (p.attributes?.length ?? 0), 0);
  const totalVariantAttrs = ALL_PRODUCTS.reduce(
    (sum, p) => sum + (p.variants ?? []).reduce((vs, v) => vs + (v.attributes?.length ?? 0), 0), 0,
  );

  console.log('── Reference Data ─────────────────────────────────────');
  console.log(`  Categories:            ${CATEGORIES.length}`);
  console.log(`  Brands:                ${BRANDS.length}`);
  console.log(`  Attribute Groups:      ${ATTRIBUTE_GROUPS.length}`);
  console.log(`  Attribute Definitions: ${ATTRIBUTES.length}`);
  console.log(`  Attribute Options:     ${totalOptions}`);
  console.log(`  Product Types:         ${PRODUCT_TYPES.length}`);
  console.log(`  Product Type Attrs:    ${totalTypeAttrs}`);
  console.log('');

  console.log('── Products ───────────────────────────────────────────');
  console.log(`  Canonical Products:    ${ALL_PRODUCTS.length}`);
  console.log(`  Total Variants:        ${totalVariants}`);
  console.log(`  Product Attr Values:   ${totalProductAttrs}`);
  console.log(`  Variant Attr Values:   ${totalVariantAttrs}`);
  console.log('');

  // ── Breakdown by category ───────────────────────────────────────────────
  console.log('── Products by Category ───────────────────────────────');
  const byCat = new Map<string, number>();
  for (const p of ALL_PRODUCTS) {
    byCat.set(p.categorySlug, (byCat.get(p.categorySlug) ?? 0) + 1);
  }
  for (const [cat, count] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(25)} ${count}`);
  }
  console.log('');

  // ── Breakdown by brand ──────────────────────────────────────────────────
  console.log('── Products by Brand ──────────────────────────────────');
  const byBrand = new Map<string, number>();
  for (const p of ALL_PRODUCTS) {
    byBrand.set(p.brandSlug, (byBrand.get(p.brandSlug) ?? 0) + 1);
  }
  for (const [brand, count] of [...byBrand.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${brand.padEnd(25)} ${count}`);
  }
  console.log('');

  // ── Breakdown by product type ───────────────────────────────────────────
  console.log('── Products by Type ───────────────────────────────────');
  const byType = new Map<string, number>();
  for (const p of ALL_PRODUCTS) {
    byType.set(p.productTypeCode, (byType.get(p.productTypeCode) ?? 0) + 1);
  }
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(25)} ${count}`);
  }
  console.log('');

  // ── Source provenance ───────────────────────────────────────────────────
  console.log('── Source Provenance ───────────────────────────────────');
  console.log(`  Products with sources: ${PRODUCT_SOURCES.length} / ${ALL_PRODUCTS.length}`);
  const sourcedSlugs = new Set(PRODUCT_SOURCES.map(s => s.productSlug));
  const unsourced = ALL_PRODUCTS.filter(p => !sourcedSlugs.has(p.slug));
  if (unsourced.length > 0) {
    console.log(`  ⚠ Unsourced products:`);
    for (const p of unsourced) {
      console.log(`    - ${p.slug} (${p.title})`);
    }
  }
  console.log('');

  // ── Validation status ───────────────────────────────────────────────────
  console.log('── Validation ──────────────────────────────────────────');
  const errors = validateCatalogSeed();
  const errorCount = errors.filter(e => e.level === 'error').length;
  const warnCount = errors.filter(e => e.level === 'warning').length;

  if (errors.length === 0) {
    console.log('  ✓ All validation checks passed.');
  } else {
    for (const err of errors.filter(e => e.level === 'error')) {
      console.log(`  ❌ [${err.module}] ${err.message}`);
    }
    for (const err of errors.filter(e => e.level === 'warning')) {
      console.log(`  ⚠️  [${err.module}] ${err.message}`);
    }
    console.log(`  ── ${errorCount} error(s), ${warnCount} warning(s) ──`);
  }
  console.log('');

  // ── Estimated DB row counts ─────────────────────────────────────────────
  console.log('── Estimated Database Rows ─────────────────────────────');
  console.log(`  categories:              ${CATEGORIES.length}`);
  console.log(`  brands:                  ${BRANDS.length}`);
  console.log(`  attribute_groups:        ${ATTRIBUTE_GROUPS.length}`);
  console.log(`  attribute_definitions:   ${ATTRIBUTES.length}`);
  console.log(`  attribute_options:       ${totalOptions}`);
  console.log(`  product_types:           ${PRODUCT_TYPES.length}`);
  console.log(`  product_type_attributes: ${totalTypeAttrs}`);
  console.log(`  products:                ${ALL_PRODUCTS.length}`);
  console.log(`  product_variants:        ${totalVariants}`);
  console.log(`  product_attr_values:     ${totalProductAttrs}`);
  console.log(`  variant_attr_values:     ${totalVariantAttrs}`);
  console.log(`  merchant_offers (demo):  ~${totalVariants > 20 ? 40 : totalVariants * 2}`);
  console.log('');
}

// ── CLI entry point ──────────────────────────────────────────────────────────

const isDirectRun =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.endsWith('report.ts') || process.argv[1]?.endsWith('report');

if (isDirectRun) {
  report();
}
