# SCS Platform — M6.2 Migration Verification

**Date:** 2026-09-27  
**Migration:** `0039_cart_offer_unique.sql`  
**Predecessor:** `0038_product_sources.sql`  

---

## 1. Migration Content

```sql
-- 0039_cart_offer_unique.sql
-- Replace the original UNIQUE(cart_id, variant_id) constraint with two
-- partial unique indexes that include offer_id.

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_variant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_offer_unique
  ON cart_items (cart_id, variant_id, offer_id)
  WHERE offer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_legacy_unique
  ON cart_items (cart_id, variant_id)
  WHERE offer_id IS NULL;
```

---

## 2. Idempotency Verification

### On Existing M6 Database (manual script already ran)

```
$ pnpm --filter @scs/api exec tsx infra/drizzle/migrate-pg.ts

   ▶ 0039_cart_offer_unique.sql ...
   ✅ 0039_cart_offer_unique.sql applied

Done — 1 migration(s) applied, 36 already up-to-date (total 37).
```

All three statements are safe no-ops:
- `DROP CONSTRAINT IF EXISTS` → NOTICE: constraint does not exist, skipping
- `CREATE UNIQUE INDEX IF NOT EXISTS` → NOTICE: relation already exists, skipping (×2)

### On Fresh Database

On a fresh database that ran migrations 0001-0038:
- `0009_cart.sql` creates `UNIQUE (cart_id, variant_id)` as a table constraint → named `cart_items_cart_id_variant_id_key`
- `0028_offer_atomization.sql` adds `offer_id` column (nullable)
- `0039_cart_offer_unique.sql` drops the old constraint and creates the two new partial indexes

Result: correct final state.

### Rerun Safety

Running the migration a second time:
- `DROP CONSTRAINT IF EXISTS` → no-op (already dropped)
- `CREATE UNIQUE INDEX IF NOT EXISTS` → no-op (already exists)

Result: safe to rerun.

---

## 3. Migration Ordering

### Full Chain (37 migrations)

```
0001_identity.sql              — users, organizations, roles
0002_platform.sql              — stores, organizations
0003_merchant.sql              — merchant verification
0004_catalog.sql               — products, variants
0005_inventory.sql             — warehouses, inventory_items, stock_movements
0006_pricing.sql               — price_lists, price_tiers
0007_search.sql                — FTS indexes
0008_promotions.sql            — promotions
0009_cart.sql                  — carts, cart_items (with old UNIQUE constraint)
0010_orders.sql                — orders, order_items
0011_trust.sql                 — device_trust
0012_comms.sql                 — notifications
0013_analytics.sql             — [EXCLUDED from CI — requires pg_partman]
0014_dual_auth.sql             — email/password auth
0015_import_stats.sql          — import statistics
0016_org_invite_code.sql       — organization invite codes
0017_saved_suppliers.sql       — saved suppliers
0018_analytics_retention.sql   — [EXCLUDED from CI — requires pg_partman]
0019_order_currency.sql        — order currency snapshot
0020_stock_movement_constraint.sql
0021_org_is_active.sql
0022_org_update_requests.sql
0023_attributes.sql            — product attributes
0024_product_types.sql         — product types
0025_canonical_products.sql    — canonical products
0026_merchant_offers.sql       — merchant offers
0027_performance_indexes.sql   — composite indexes
0028_offer_atomization.sql     — offer_id on cart_items/order_items
0029_offer_snapshot.sql        — offer snapshot columns
0030_store_popularity_disclosure.sql
0031_catalog_requests.sql
0032_merchant_catalog_permissions.sql
0033_idempotency_fingerprint.sql
0034_catalog_imports.sql
0035_widen_attribute_type.sql
0036_widen_import_status.sql
0037_favorites_unique.sql
0038_product_sources.sql
0039_cart_offer_unique.sql     — NEW: cart uniqueness with offer_id
```

### Dependency Chain

```
0009 creates cart_items with UNIQUE(cart_id, variant_id)
  ↓
0028 adds offer_id column to cart_items
  ↓
0039 replaces old constraint with partial indexes including offer_id
```

The dependency chain is correct: 0039 depends on 0009 (table creation) and 0028 (offer_id column).

---

## 4. Commands

### Apply migrations (production)

```bash
# Set DATABASE_URL
export DATABASE_URL=postgresql://user:pass@host:5432/scs_platform

# Dry-run (validate all files, report pending)
pnpm --filter @scs/api exec tsx infra/drizzle/migrate-pg.ts --dry-run

# Apply pending migrations
pnpm --filter @scs/api exec tsx infra/drizzle/migrate-pg.ts
```

### Verify schema after migration

```bash
# Check indexes
docker exec scs-postgres psql -U scs -d scs_platform \
  -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cart_items' ORDER BY indexname;"

# Check constraints
docker exec scs-postgres psql -U scs -d scs_platform \
  -c "SELECT conname FROM pg_constraint WHERE conrelid = 'cart_items'::regclass;"

# Check migration log
docker exec scs-postgres psql -U scs -d scs_platform \
  -c "SELECT name FROM _migration_log ORDER BY name DESC LIMIT 5;"
```

---

## 5. Production Upgrade Procedure

```
1. Backup database
   pg_dump -U scs scs_platform > backup_$(date +%Y%m%d_%H%M%S).dump

2. Run migrations
   pnpm --filter @scs/api exec tsx infra/drizzle/migrate-pg.ts

3. Verify schema
   (commands above)

4. Start API
   pnpm --filter api build
   node apps/api/dist/main.js

5. Run regression
   node apps/api/scripts/m6-uat-run.ts
   node apps/api/scripts/m6.1-inventory-concurrency.ts
   node apps/api/scripts/m6.1-security-regression.ts
```

---

## 6. Verification Results

| Check | Result |
|---|---|
| Migration applied via runner | PASS |
| Tracked in `_migration_log` | PASS |
| `cart_items_cart_variant_offer_unique` exists | PASS |
| `cart_items_cart_variant_legacy_unique` exists | PASS |
| Old `cart_items_cart_id_variant_id_key` absent | PASS |
| Idempotent on existing DB | PASS |
| API starts after migration | PASS |
| Regression tests pass | PASS |
