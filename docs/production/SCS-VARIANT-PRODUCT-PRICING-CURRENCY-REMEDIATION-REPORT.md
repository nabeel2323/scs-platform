# SCS Variant Identity, Product Management, Pricing & Currency — Remediation Report

> **Date:** 2026-09-26  
> **Status:** COMPLETE  
> **Audit doc:** `docs/production/SCS-VARIANT-PRODUCT-PRICING-CURRENCY-AUDIT.md`

---

## 1. Executive Summary

This report documents the remediation of critical defects in variant identity (SKU generation), product management UX, pricing currency safety, and the merchant offer creation workflow across the SCS Platform (API, Web, Mobile).

**Key outcomes:**
- Eliminated the `SKU-[{"attrId"...}]` bug that produced non-human-readable, non-deterministic SKUs
- Created reusable SKU generators (server + client) that produce deterministic, ASCII-safe, human-readable SKUs
- Added canonical product search API for the merchant "Existing Product Selector"
- Fixed cross-currency price comparison in offer enrichment
- Redesigned the Product Studio wizard with free-text canonical search, existing variant selector, and currency mismatch warnings
- Updated the mobile offer create flow with canonical catalog search and currency warnings
- All changes verified: API/Web TypeScript clean, Mobile Dart analyzer clean, 711 backend unit tests pass, 51 mobile model tests pass

---

## 2. Issues Found & Remediated

### 2.1 CRITICAL: SKU Generation Bug

**Problem:** `useProductStudio.ts` line 163 generated SKUs as `` `${state.slug || 'SKU'}-${comboKey}` `` where `comboKey = JSON.stringify([{attrId, value}])`. This produced SKUs like `SKU-[{"attrId":"abc-123","value":"red"}]` — non-deterministic (UUIDs in attrId), non-human-readable, and exceeding the varchar(100) column limit.

**Fix:**
- Created `apps/api/src/common/utils/sku-generator.ts` — server-side deterministic SKU generator
- Created `apps/web/src/lib/sku-utils.ts` — client-side counterpart (identical output)
- Fixed `useProductStudio.ts` to use `generateSku({brand, productTitle, attributeValues})` and `buildVariantTitle(resolved)` instead of raw comboKey

**SKU format:** `BRAND-MODEL-ATTR1-ATTR2-...` (e.g., `LEN-TPE16-I313-16GB-512G-W11P`)

### 2.2 HIGH: Cross-Currency Price Comparison

**Problem:** `enrichProductCards()` compared `basePriceMinor` across offers without checking currency. A SAR 100 offer was incorrectly considered "lower" than a USD 1 offer.

**Fix:** Changed from single `lowestPrice/lowestCurrency` to `lowestByCurrency: Map<string, number>`. The return mapping prefers the store's currency, falls back to the first available currency.

### 2.3 MEDIUM: Missing Canonical Product Search

**Problem:** The existing `GET /v1/canonical/match` only supported GTIN/EAN/MPN matching. Merchants had no way to search by title to find existing canonical products and link offers to them.

**Fix:**
- Added `searchCanonicalProducts()` to `catalog.service.ts` — free-text title search with brand/category filters, variant count, and offer count enrichment
- Added `GET /v1/canonical/search` route to `catalog.controller.ts`
- Added `searchCanonicalCatalog()` client helper and `CanonicalProductSummary` interface to `buyer-api.ts`

### 2.4 MEDIUM: Web Product Studio UX Gaps

**Problem:** StepIdentity only supported GTIN/EAN/MPN search. StepVariants had no existing variant selector. StepOffer had no currency mismatch warning.

**Fix:**
- StepIdentity: Added free-text canonical search section with brand/category filtering, scrollable results showing variant count and offer count
- StepVariants: When an existing product is selected, shows its variants with SKU/title in a selectable list; merchant can pick a variant or skip to create at product level
- StepOffer: Shows selected variant context, store currency mismatch warning, and variant SKU in price preview

### 2.5 MEDIUM: Mobile Offer Create Flow

**Problem:** Step 1 only searched store products, not the canonical catalog. Review showed truncated UUID instead of variant SKU. No currency mismatch warning.

**Fix:**
- Added `CanonicalProduct` and `CanonicalSearchResult` models to `models.dart`
- Added `searchCanonicalCatalog()` method to `api_service.dart`
- Step 1: Added ChoiceChip toggle between "My Products" and "Search Canonical" with live search
- Step 3: Added currency mismatch warning banner
- Step 5: Review now shows variant SKU (resolved from provider) instead of truncated UUID

---

## 3. Files Modified

### Backend (apps/api)
| File | Change |
|------|--------|
| `src/common/utils/sku-generator.ts` | **Created** — deterministic SKU generator, collision suffix, variant title builder |
| `src/modules/catalog/catalog.service.ts` | Added `searchCanonicalProducts()` method |
| `src/modules/catalog/catalog.controller.ts` | Added `GET /v1/canonical/search` route |
| `src/modules/catalog/product-card.ts` | Fixed cross-currency comparison: `lowestByCurrency: Map<string, number>` |
| `src/__tests__/unit/common/sku-generator.spec.ts` | **Created** — 12 unit tests |

### Web (apps/web)
| File | Change |
|------|--------|
| `src/lib/sku-utils.ts` | **Created** — client-side SKU generator + `resolveComboAttributes()` |
| `src/lib/buyer-api.ts` | Added `CanonicalProductSummary`, `searchCanonicalCatalog()` |
| `src/hooks/useProductStudio.ts` | Fixed SKU bug, added canonical search state, existing variant loading, skip variant creation when using existing variant |
| `src/app/merchant/product-studio/steps/StepIdentity.tsx` | Added free-text canonical search section |
| `src/app/merchant/product-studio/steps/StepVariants.tsx` | Added existing variant selector for canonical products |
| `src/app/merchant/product-studio/steps/StepOffer.tsx` | Added variant context, currency mismatch warning |
| `src/app/merchant/product-studio/page.tsx` | Wired new props to all step components |

### Mobile (mobile/)
| File | Change |
|------|--------|
| `lib/models/models.dart` | Added `CanonicalProduct`, `CanonicalSearchResult` models |
| `lib/services/api_service.dart` | Added `searchCanonicalCatalog()` method |
| `lib/screens/merchant/offer_create_screen.dart` | Canonical search toggle, currency warning, variant SKU in review |
| `test/models_test.dart` | Added 3 tests for CanonicalProduct + CanonicalSearchResult |

---

## 4. Verification Results

| Check | Result |
|-------|--------|
| `apps/api` TypeScript `tsc --noEmit` | **Clean** (0 errors) |
| `apps/web` TypeScript `tsc --noEmit` | **Clean** (0 errors) |
| `mobile/` Dart `dart analyze lib` | **No issues found** |
| Backend unit tests (vitest) | **711 passed**, 267 skipped, 9 integration files failed (Docker/PostgreSQL — pre-existing, unrelated) |
| Mobile model tests (flutter test) | **51 passed** (including 3 new CanonicalProduct tests) |
| SKU generator tests | **12 passed** (determinism, ASCII safety, truncation, no JSON/attrId patterns) |
| Dangerous pattern grep (`SKU-${JSON`, `JSON.stringify.*attr.*sku`) | **0 matches** — bug fully eliminated |
| Cross-currency safety (`lowestByCurrency`) | **8 references** — fix intact |

---

## 5. Architecture Preservation

All changes preserve the canonical marketplace architecture:

```
Category → Product Type → Canonical Product (store_id IS NULL)
                            → Variant (SKU, attributes)
                              → Merchant Offer (pricing, currency, MOQ)
                                → Merchant Store
```

- Canonical products remain `store_id IS NULL`
- Variants remain product-owned with `sku varchar(100) NOT NULL`
- Offers remain store-owned with their own `currency char(3)` and `basePriceMinor`
- Price lists/tiers remain the shared pricing layer
- The SKU generator is deterministic and collision-safe

---

## 6. Deferred Items

| Item | Reason |
|------|--------|
| Database migration for existing bad SKUs | Requires production data audit; recommend a separate migration script that regenerates SKUs using the new generator for all variants with `sku LIKE 'SKU-[%'` |
| Currency registry table | Current `char(3)` columns on price_lists and merchant_offers are sufficient; a registry table is a nice-to-have for admin governance |
| Web sku-utils vitest | No web test infrastructure exists (vitest not configured for apps/web); the SKU generator is fully tested on the backend side with identical logic |
| Full mobile offer create E2E test | The app was never run on a device; UI tests require a running backend |

---

## 7. Recommendations

1. **Run the bad-SKU migration** before the next catalog import cycle to prevent buyer-facing display issues
2. **Add the canonical search to the mobile merchant catalog screen** (currently only the offer create flow has it)
3. **Consider adding a unique constraint on `productVariants.sku`** (currently a partial unique index) after the bad-SKU migration
4. **Monitor cross-currency safety** — the fix prevents numerical comparison across currencies, but a future price-list feature should enforce same-currency constraints at the schema level
