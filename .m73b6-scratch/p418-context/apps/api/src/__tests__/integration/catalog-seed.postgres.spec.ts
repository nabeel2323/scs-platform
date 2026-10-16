/**
 * Integration test — Catalog seed against a real PostgreSQL container.
 *
 * Verifies:
 *   1. Clean DB → migrate → seed catalog → correct entity counts
 *   2. Re-running the seed is idempotent (all "reused", no duplicates)
 *   3. Products can be queried with their typed attribute values
 *   4. Variant combination keys are populated
 *   5. Demo profile creates merchant offers
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { seedPlatformRbac } from '../../../infra/drizzle/seed-pg';
import { seedCatalog } from '../../../infra/drizzle/seed-catalog';
import { ALL_PRODUCTS } from '../../../infra/seed-data/products';
import { CATEGORIES } from '../../../infra/seed-data/categories';
import { BRANDS } from '../../../infra/seed-data/brands';
import { ATTRIBUTES, ATTRIBUTE_GROUPS } from '../../../infra/seed-data/attributes';
import { PRODUCT_TYPES } from '../../../infra/seed-data/product-types';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../infra/drizzle/migrations');
const EXCLUDED_MIGRATIONS = ['0013_analytics.sql', '0018_analytics_retention.sql'];

async function runMigrations(pool: Pool): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql') && !EXCLUDED_MIGRATIONS.includes(f))
    .sort();
  for (const file of files) {
    await pool.query(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
}

describe('Catalog Seed — PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    // Run all migrations.
    await runMigrations(pool);

    // Seed RBAC (required for FK integrity if demo profile creates users).
    const client = await pool.connect();
    try {
      await seedPlatformRbac(client);
    } finally {
      client.release();
    }
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  }, 30_000);

  it('seeds the full production catalog with correct counts', async () => {
    const client = await pool.connect();
    try {
      const result = await seedCatalog(client, 'production');

      // Categories.
      expect(result.categories.created + result.categories.reused).toBe(CATEGORIES.length);
      expect(result.categories.created).toBe(CATEGORIES.length);

      // Brands.
      expect(result.brands.created + result.brands.reused).toBe(BRANDS.length);
      expect(result.brands.created).toBe(BRANDS.length);

      // Attribute groups.
      expect(result.attributeGroups.created).toBe(ATTRIBUTE_GROUPS.length);

      // Attribute definitions.
      expect(result.attributeDefinitions.created).toBe(ATTRIBUTES.length);

      // Product types.
      expect(result.productTypes.created).toBe(PRODUCT_TYPES.length);

      // Products.
      expect(result.products.created).toBe(ALL_PRODUCTS.length);

      // Variants — count expected.
      const expectedVariants = ALL_PRODUCTS.reduce((s, p) => s + (p.variants?.length ?? 0), 0);
      expect(result.variants.created).toBe(expectedVariants);

      // No merchant offers in production.
      expect(result.merchantOffers.created).toBe(0);
      expect(result.profile).toBe('production');
    } finally {
      client.release();
    }
  }, 60_000);

  it('is idempotent — second run reuses all rows', async () => {
    const client = await pool.connect();
    try {
      const result = await seedCatalog(client, 'production');

      // Everything should be "reused", nothing "created".
      expect(result.categories.created).toBe(0);
      expect(result.brands.created).toBe(0);
      expect(result.attributeGroups.created).toBe(0);
      expect(result.attributeDefinitions.created).toBe(0);
      expect(result.productTypes.created).toBe(0);
      expect(result.products.created).toBe(0);
      expect(result.variants.created).toBe(0);
      expect(result.productAttributeValues.created).toBe(0);
      expect(result.variantAttributeValues.created).toBe(0);

      // Reused counts should match.
      expect(result.categories.reused).toBe(CATEGORIES.length);
      expect(result.products.reused).toBe(ALL_PRODUCTS.length);
    } finally {
      client.release();
    }
  }, 60_000);

  it('canonical products have store_id NULL', async () => {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM products WHERE store_id IS NOT NULL`,
    );
    // The only products with store_id should be from other tests; canonical seed products are NULL.
    // At minimum, verify our seed products are NULL.
    const seedRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM products WHERE store_id IS NULL AND product_type_id IS NOT NULL`,
    );
    expect(seedRes.rows[0].cnt).toBeGreaterThanOrEqual(ALL_PRODUCTS.length);
  });

  it('variants with attributes have populated combination_key', async () => {
    // Variants with attribute values should have a combination_key.
    // Single-variant products with no variant-scope attrs may have NULL (valid).
    const res = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM product_variants WHERE combination_key IS NOT NULL`,
    );
    // At least the laptop/monitor/peripheral variants should have keys.
    expect(res.rows[0].cnt).toBeGreaterThan(0);

    // Verify no duplicate combination_keys within a product.
    const dupRes = await pool.query(
      `SELECT product_id, combination_key, COUNT(*) AS cnt
       FROM product_variants
       WHERE combination_key IS NOT NULL
       GROUP BY product_id, combination_key
       HAVING COUNT(*) > 1`,
    );
    expect(dupRes.rows.length).toBe(0);
  });

  it('typed attribute values are correctly populated', async () => {
    // Check product_attribute_values has rows.
    const pavRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM product_attribute_values`);
    expect(pavRes.rows[0].cnt).toBeGreaterThan(0);

    // Check variant_attribute_values has rows.
    const vavRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM variant_attribute_values`);
    expect(vavRes.rows[0].cnt).toBeGreaterThan(0);

    // Verify a specific product — Dell Latitude 5450 should have model attribute.
    const prodRes = await pool.query(
      `SELECT pav.value_text FROM product_attribute_values pav
       JOIN products p ON p.id = pav.product_id
       JOIN attribute_definitions ad ON ad.id = pav.attribute_definition_id
       WHERE p.slug = 'dell-latitude-5450' AND ad.code = 'model'`,
    );
    expect(prodRes.rows.length).toBe(1);
    expect(prodRes.rows[0].value_text).toBe('Latitude 5450');
  });

  it('category hierarchy has correct materialized paths', async () => {
    // Root category should have path '/computers-it'.
    const rootRes = await pool.query(
      `SELECT path FROM categories WHERE slug = 'computers-it' AND store_id IS NULL`,
    );
    expect(rootRes.rows[0].path).toBe('/computers-it');

    // Child category should have nested path.
    const childRes = await pool.query(
      `SELECT path FROM categories WHERE slug = 'laptops' AND store_id IS NULL`,
    );
    expect(childRes.rows[0].path).toBe('/computers-it/laptops');

    // Grandchild should have deeper path.
    const grandchildRes = await pool.query(
      `SELECT path FROM categories WHERE slug = 'business-laptops' AND store_id IS NULL`,
    );
    expect(grandchildRes.rows[0].path).toBe('/computers-it/laptops/business-laptops');
  });

  it('product types have resolved variant_dimensions (UUIDs, not codes)', async () => {
    const res = await pool.query(
      `SELECT variant_dimensions FROM product_types WHERE code = 'laptop' AND version = 1`,
    );
    const dims = res.rows[0].variant_dimensions;
    expect(Array.isArray(dims)).toBe(true);
    // After seeding, variant dimensions should be resolved UUIDs (not string codes).
    for (const dim of dims) {
      expect(dim).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('demo profile creates merchant offers', async () => {
    const client = await pool.connect();
    try {
      const result = await seedCatalog(client, 'demo');

      expect(result.profile).toBe('demo');
      expect(result.merchantOffers.created).toBeGreaterThan(0);

      // Verify offers exist in DB.
      const offerRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM merchant_offers WHERE metadata->>'demo' = 'true'`,
      );
      expect(offerRes.rows[0].cnt).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  }, 60_000);
});
