# G-002 — Database Operation Map (Source Slice 1)

**Audit date:** 22 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Source checkpoint:** `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae`  
**Status:** Preliminary static operation map — partial; not an approved ownership/RLS policy.

## Purpose and evidence boundary

This document extends the preliminary access-path inventory with direct Drizzle table-operation evidence from 13 API service files in the identity, merchant, catalog, pricing, inventory, orders, payments, returns, shipping and audit modules.

The source files were fetched from the remediation branch and inspected for schema imports and direct Drizzle query-builder usage: relational `db.query.<table>.findFirst/findMany`, `.from(table)`, `.insert(table)`, `.update(table)` and `.delete(table)` patterns. The operation labels below mean:

- **R** — direct query-builder read observed.
- **I** — direct insert observed.
- **U** — direct update observed.
- **D** — direct delete observed.

These are source-symbol observations, not runtime query counts, a complete call graph, or proof that a route can access every listed row. A table imported but only used through raw SQL, helper functions, dynamic imports or another service may be underrepresented. Conversely, an operation may be conditional or internal to a workflow. Tenant predicates must be verified at the query/service boundary and independently against PostgreSQL behavior.

## Service-to-table operation map

| Service source | Tables and observed direct operations |
|---|---|
| `apps/api/src/modules/identity/identity.service.ts` | `users` R/I/U; `organizations` R/I/U; `organization_members` R/I/D; `organization_update_requests` R/I; `sessions` R/I/U; `roles` R; `role_permissions` R; `permissions` R; `credential_audit_log` I; `account_link_log` I; `device_credentials` R/I/U |
| `apps/api/src/modules/merchant/merchant.service.ts` | `stores` R/I/U; `warehouses` R/I/U; `business_documents` R/I/U; `verification_requests` R/I/U; `store_members` I; `organizations` R/U; `organization_members` R; `orders` R; `products` U; `outbox_events` I |
| `apps/api/src/modules/catalog/catalog.service.ts` | `categories` R/I/U/D; `brands` R/I/U; `products` R/I/U; `product_variants` R/I/U/D; `product_media` R/I/U/D; `import_jobs` R/I/U; `import_job_chunks` R/I/U; `favorites` R/I/D; `saved_suppliers` R/I/D; `product_attribute_values` R/I/D; `variant_attribute_values` R/I/D; `attribute_definitions` R; `product_type_attributes` R; `product_types` R; `attribute_options` R; `stores` R; `warehouses` R; `price_lists` R/I; `price_tiers` R/I/U; `inventory_items` R/I; `merchant_offers` R |
| `apps/api/src/modules/catalog/catalog.offer.service.ts` | `merchant_offers` R/I/U; `products` R; `product_variants` R; `stores` R; `warehouses` R; `price_lists` R; `order_items` R |
| `apps/api/src/modules/catalog/catalog.requests.service.ts` | `catalog_requests` R/I/U |
| `apps/api/src/modules/catalog/catalog.taxonomy.service.ts` | `attribute_definitions` R/I/U; `attribute_options` R/I/D; `attribute_groups` R/I; `product_types` R/I/U; `product_type_attributes` R/I/D; `product_attribute_values` R/I/D; `variant_attribute_values` R/I/D; `products` R; `product_variants` R/U; `categories` R |
| `apps/api/src/modules/pricing/pricing.service.ts` | `price_lists` R/I/U; `price_tiers` R/I/U/D |
| `apps/api/src/modules/inventory/inventory.service.ts` | `inventory_items` R/I/U; `stock_movements` R/I; `stores` R; `warehouses` R; `store_members` R; `product_variants` R; `products` R |
| `apps/api/src/modules/orders/orders.service.ts` | `master_orders` R/I/U; `orders` R/I/U; `order_items` R/I/U; `order_financial_breakdown` R/I/U; `order_status_history` R/I; `shipments` R/I/U; `shipment_events` R/I; `carts` R/U; `cart_items` R; `products` R; `product_variants` R; `merchant_offers` R; `inventory_items` R/U; `stock_movements` R/I; `outbox_events` I; `warehouses` R; `stores` R; `organization_members` R |
| `apps/api/src/modules/payments/payments.service.ts` | `payment_records` R/I/U; `payment_events` R/I; `refunds` R/I/U; `settlement_records` R/I/U; `orders` R/U; `order_financial_breakdown` R/U; `order_status_history` I; `stores` R |
| `apps/api/src/modules/returns/returns.service.ts` | `return_requests` R/I/U; `return_request_items` R/I/U; `return_request_events` R/I; `commission_reversals` R; `orders` R; `order_items` R; `order_financial_breakdown` R; `payment_records` R; `refunds` R/U; `settlement_records` R/I/U; `shipments` R; `inventory_items` R/U; `stock_movements` I; `stores` R |
| `apps/api/src/modules/shipping/shipping.service.ts` | `shipping_methods` R/I/U; `delivery_zones` R/I/U; `delivery_zone_methods` R/I/D; `stores` R |
| `apps/api/src/modules/audit/audit.service.ts` | `audit_logs` I |

> Table names above use the physical PostgreSQL names corresponding to the imported Drizzle schema symbols. Confirm every mapping against the schema declaration and migration before translating it into a policy.

## Cross-module implications confirmed by this slice

1. **Identity and membership are not isolated to IdentityService.** Merchant, inventory and order services also read organization membership and/or store membership. A policy design that only covers the identity controllers would miss these access paths.
2. **Catalog reads cross module boundaries.** CatalogService reads merchant/store, warehouse, pricing, inventory, offer and taxonomy data while constructing product/discovery projections. The policy must distinguish public product projection from merchant-private offer, price-list, warehouse and inventory data.
3. **Order lifecycle is a multi-table transaction surface.** OrdersService reads and writes order/master-order, order-item, financial-breakdown, shipment/event, inventory/stock-movement and outbox rows. It also reads product, offer, store, warehouse and organization-membership rows. Ownership must be traced through the parent order/store and preserved for each child row.
4. **Payments and returns cross financial ownership boundaries.** PaymentsService mutates payment, refund and settlement rows while also changing order financial/status records. ReturnsService joins return rows to order, payment, refund, settlement, shipment and inventory state. These cannot be assigned one generic `org_id` policy without inspecting the actual foreign-key paths and transaction invariants.
5. **Audit and outbox are separate system concerns.** The audit service inserts audit rows; merchant and order services insert outbox events. The separate dispatcher/worker paths still need their own explicit operation and actor classification.
6. **Catalog taxonomy has both platform-governed and product-linked rows.** Attribute definitions/options/groups and product-type relations need explicit platform-vs-tenant ownership classification; product/variant attribute values inherit product/variant ownership rather than an assumed direct organization column.

## Still unmapped

This slice does **not** complete DB-003. It does not yet enumerate all service/controller/worker/webhook/CLI paths, raw SQL, dynamic imports, database functions/triggers/views/sequences, partition children, extension-owned objects or all 99 Drizzle-exported tables. The access-path inventory remains authoritative for the worker, audit-middleware, bootstrap, runtime identity and nested-transaction blockers.

Next source slices should cover: cart/promotions/reviews/disputes/notifications/analytics/operations; carrier webhook and all worker/monitor/lease paths; bootstrap and migration scripts; then reconcile each service operation to controller route, principal/actor context, exact direct/indirect FK owner and read/write/delete predicates. The 114-versus-116 relation discrepancy still requires a refreshed protected read-only catalog snapshot.

## Explicit non-actions

No request transaction interceptor, AsyncLocalStorage context, session-level tenant setting, RLS policy, migration, grant/default-ACL change, shared database query/write, staging action, deployment, provider call or worker activation was performed. This source map is not authorization to perform any of those actions.
