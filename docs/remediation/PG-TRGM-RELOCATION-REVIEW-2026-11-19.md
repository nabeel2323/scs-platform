# pg_trgm Extension Relocation Review — 19 November 2026

**Finding:** G-022 — pg_trgm installed in the public schema  
**Environment:** Connected Supabase PostgreSQL project  
**Method:** Read-only extension, role, dependency, index and source inspection  
**Mutation performed:** None

## Executive result

The `pg_trgm` extension is marked relocatable and the `extensions` schema already exists. However, the extension is owned by the Supabase-managed `supabase_admin` superuser. The connected `postgres` role is not a member of that owner role and cannot `SET ROLE` to it.

The current connection therefore cannot safely perform `ALTER EXTENSION pg_trgm SET SCHEMA extensions`. No extension ownership or schema change was attempted.

## Verified database facts

- Extension schema: `public`.
- Extension owner: `supabase_admin`.
- Owner attributes: login-capable superuser with BYPASSRLS.
- Connected role: `postgres`, not a superuser.
- `postgres` is not a member of `supabase_admin` and cannot assume it.
- The extension is relocatable and has 47 extension-owned objects.
- The `extensions` schema exists; the connected `postgres` role has USAGE and CREATE there.
- The connected `postgres` search path includes `public, extensions`.
- The actual Render API and migration connection roles remain unverified.

## Dependent application objects

Five application GIN indexes use `gin_trgm_ops`:

- `categories.idx_categories_path`
- `product_variants.idx_variants_barcode_trgm`
- `product_variants.idx_variants_sku_trgm`
- `products.idx_products_title_trgm`
- `search_queries.idx_search_queries_text`

Catalog search uses unqualified `similarity()` calls in its raw SQL. If the extension is moved, the API and migration connection search paths must include `extensions`, or the calls must be schema-qualified in a reviewed code change.

The `normalize_arabic(text)` function is owned by `postgres`, is not SECURITY DEFINER, and its body uses PostgreSQL built-ins only. Migration 0070's `search_path = pg_catalog` hardening is compatible with the inspected function body.

## Safe next steps

1. Confirm the actual Render API and release-migration database roles without exposing the DSN.
2. Obtain an owner-supported Supabase mechanism for moving a Supabase-managed extension. Do not change extension ownership or attempt to assume `supabase_admin`.
3. In a Supabase-compatible isolated database, test the extension relocation with all five GIN indexes and the catalog search queries.
4. Verify that the API and migration roles resolve `similarity()` after relocation, and compare search results and index usage before/after.
5. Only then create and review a migration or supported administrative change.

## Status

**BLOCKED — owner-supported Supabase action required.** The connected `postgres` role cannot move the extension. No live database object, owner, grant or search path was changed.
