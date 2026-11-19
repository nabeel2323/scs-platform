# Modular Boundary Lint Baseline — 19 November 2026

## Result

The corrected E6 checker now executes against `apps/api/src/modules`. Its initial scan produced 198 violation lines, representing 196 unique import violations (two duplicate reports). Comparison of the 27 changed production module source files against the PR base (`develop`, `3f7268d`) identified three newly introduced violations. Those three were fixed using explicit public module APIs and a CatalogService boundary. The reviewed legacy baseline therefore contains **193 unique violations**.

The CI gate now blocks any violation not present in `infra/ci/boundary-lint-baseline.json`. It also reports how many baseline violations have been resolved. This is an incremental regression guard, not a claim that the modular monolith is fully isolated.

## Largest remaining module-to-module import groups

| Source module | Target module | Baseline violations |
|---|---|---:|
| shipping | orders | 13 |
| catalog-import | catalog | 12 |
| admin | catalog | 11 |
| orders | catalog | 8 |
| returns | operations | 8 |
| returns | payments | 8 |
| catalog | merchant | 7 |
| returns | orders | 7 |
| shipping | merchant | 7 |
| orders | merchant | 6 |
| catalog | identity | 5 |
| catalog | pricing | 5 |
| orders | identity | 5 |
| shipping | audit | 5 |
| identity | notifications | 4 |
| orders | promotions | 4 |
| returns | merchant | 4 |
| reviews | orders | 4 |
| merchant | identity | 3 |
| operations | audit | 3 |

## Three PR-introduced violations corrected

- `orders/orders.service.ts` imported payment-method support from `payments.types.ts`; it now imports through `payments/index.ts`.
- `pricing/price-resolution.ts` imported the MOQ helper from the orders module internals; it now imports through `orders/index.ts`.
- `pricing/pricing.controller.ts` directly queried catalog schemas; it now calls `CatalogService.getVariantStoreId()` through `catalog/index.ts`, and `PricingModule` imports `CatalogModule`.

## Gate behavior

- New cross-module imports fail the CI boundary job.
- Existing baseline violations remain visible debt and do not silently disappear.
- When a legacy import is removed, the checker reports the resolved entry. Remove it from the baseline in the same reviewed change that demonstrates the refactor.
- Do not regenerate the baseline wholesale to make CI green.
- The checker currently analyzes relative imports matching its module-path rule. TypeScript path-alias imports and dynamic imports require a future parser-based enhancement.

## Next remediation priorities

1. Replace `shipping → orders` and `shipping → merchant` internal dependencies with explicit shipping/order/merchant service contracts.
2. Separate catalog import orchestration from catalog persistence internals.
3. Replace admin cross-module schema/service imports with module APIs or dedicated admin query services.
4. Reduce returns dependencies on operations, payments, orders and merchant internals.
5. Keep the baseline blocking while reducing it incrementally; do not claim zero E6 violations until the baseline is empty.


The repository-wide `pnpm format:check` passed in CI #738, so the CI workflow now treats formatting as a blocking gate as well. The boundary gate is also blocking, with the 193-entry legacy baseline described above.
