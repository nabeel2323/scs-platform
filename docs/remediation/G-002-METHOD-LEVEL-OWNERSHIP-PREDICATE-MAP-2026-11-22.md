# G-002 Method-Level Ownership Predicate Map — 22 November 2026

## Scope and status

Source checkpoint: 25a68979ea886b1b49f515216b77e454e88f9de5. This first method-level pass covers OrdersService, PaymentsService and InventoryService because they own order/financial/stock data. It connects public controller callsites to the actual service predicates and identifies internal helpers that intentionally omit CallerContext. It is not a complete service inventory and is not an RLS policy specification.

## OrdersService

| Method family | Tables read/written | Ownership predicate and context |
|---|---|---|
| getOrderWithItems / getStatusHistory | orders, order_items, order_status_history, stores | Loads order by ID, then calls assertOrderAccessible when caller is supplied. Public OrdersController passes CallerContext. Buyer access is buyerId; merchant access resolves order.storeId→stores.orgId; privileged platform roles bypass. |
| getMasterOrder / listMasterOrders | master_orders, orders, stores | Loads master and sub-orders, then assertMasterOrderAccessible when caller is supplied. Buyer ownership is master buyerId; merchant visibility is any sub-order store in activeOrg; privileged roles bypass. Public controller passes caller. |
| listOrders | orders, stores | Buyer callers without a store filter are pinned to caller.sub; merchant store filter is resolved through store/org scope; platform roles may query broader results. Public controller passes caller. |
| acceptOrder / partiallyAcceptOrder / rejectOrder / confirmItem / transitionStatus / cancelOrder | orders, order_items, stores, order_status_history, outbox_events and related fulfillment rows | Mutations check caller access through assertOrderAccessible and/or store→org checks before writes. Public controller passes CallerContext. |
| reportShipmentException / authorizeShipmentRetry / requestRTS / approveRTS / rejectRTS / completeRTS / getReturnEligibility / recordReturn | shipments, orders, stores, shipment_events, outbox_events and related return rows | assertShipmentAccessibleForException resolves shipment→store→org; driver context is constrained by assignedDriverId; platform roles bypass. Merchant scope is organization-level, not active store membership. |
| getTracking | master_orders / orders / shipments | Called with current user ID; checks master buyerId before returning tracking information. |
| listDriverShipments | shipments / orders | Called with current user ID and filters assignedDriverId; no arbitrary driver ID accepted from request body. |

### Internal/unscoped OrdersService helpers

- getOrder(id) and getShipmentByOrderId(orderId) load by primary key without caller context. They are internal building blocks; public controller paths wrap them with order/shipment ownership checks.
- getMasterOrder(id, caller?) and getOrderWithItems(id, caller?) allow caller omission for internal workflows. Public controller callsites pass caller; internal callers must remain explicitly classified as system/service context.
- Some access checks occur after the initial primary-key read. Unauthorized results are not returned, but a future RLS/transaction design must account for these pre-authorization reads and avoid breaking service-internal flows.

## PaymentsService

| Method family | Tables read/written | Ownership predicate and context |
|---|---|---|
| getPaymentOrThrow / getPaymentEvents / getRefund / getSettlement / listRefunds | payment_records, payment_events, refunds, settlement_records, orders, stores | Several are unscoped lookup helpers. PaymentsController resolves the associated order and calls assertOrderAccessible before returning payment/event/refund details to a non-platform caller. Keep the controller/service wrapper pairing intact. |
| submitProof / requestRefund | payment_records, payment_events, refunds, orders | Buyer ownership is checked against order.buyerId; platform privileged roles may bypass. Controller passes CallerContext. |
| confirmCash | payment_records, payment_events, orders, stores | Merchant authorization resolves the order store to caller.activeOrg; platform privileged roles bypass. Controller passes CallerContext. |
| verifyPayment / approveRefund / calculateSettlement | payment_records, payment_events, refunds, order_financial_breakdown, settlement_records | Platform privileged roles only; controller permission is administrative and service also checks the privileged caller context. |
| markSettlementPaid | settlement_records, stores, payment_events | Platform privileged roles bypass; non-privileged path resolves settlement.storeId→stores.orgId and compares activeOrg. Controller passes CallerContext. |
| listMerchantPayments / listMerchantSettlements | payment_records, orders, stores, settlement_records | Non-platform callers are scoped through stores.orgId=activeOrg and optional storeId; privileged roles may query broader results. |
| listPayments / getRequestedRefunds / getVerificationQueue / getStalePayments / listSettlements | payment_records, refunds, settlement_records, orders | Global/admin read models. Route permissions are platform ADMIN/SUPER_ADMIN only; do not grant analytics/financial global permissions to merchant roles. |

### Internal/unscoped PaymentsService helpers

getPaymentOrThrow, getPaymentEvents, getRefund, getSettlement and listRefunds do not independently accept CallerContext. The public controller performs the order ownership check before returning those results. Admin queues and global list methods rely on platform-only route permissions plus service role checks where implemented. Preserve both layers; do not treat a service lookup by UUID as an ownership predicate.

## InventoryService

| Method family | Tables read/written | Ownership predicate and context |
|---|---|---|
| listByWarehouse / getLowStockItems(warehouseId) | inventory_items, warehouses, stores, store_members | assertWarehouseMember resolves warehouse→store→org and requires ACTIVE membership for non-platform callers. |
| listByVariant | inventory_items, product_variants, products, stores, store_members | assertVariantStoreMember resolves variant→product→store and requires ACTIVE membership. |
| listByStore / exportInventoryCsv / exportMovementsCsv | inventory_items, stock_movements, warehouses, stores, store_members | Store org and active membership are checked before warehouse IDs and inventory rows are returned. |
| createItem / updateItem | inventory_items, warehouses, product_variants, products, stores, store_members | Warehouse and variant must resolve to the same store; caller must be in activeOrg and an ACTIVE store member. |
| adjustStock / reserveStock / releaseStock / bulkAdjustStock / listMovements | inventory_items, stock_movements, warehouses, product_variants, products, stores, store_members | Controller passes CallerContext; item/warehouse/variant helpers enforce active org and store membership before read/write. |
| transferStock | inventory_items, stock_movements, warehouses, product_variants, products, stores, store_members, outbox_events | Caller path checks source/destination warehouse membership and inventory item/variant membership. New invariant additionally requires source warehouse, destination warehouse and product variant to resolve to the same store, for both user and system callers. Quantity lock and source/destination updates remain in one transaction; outbox publishes after commit. |
| getOrCreateItem / getItem | inventory_items | Unscoped internal helpers used by trusted service workflows; not exposed as a direct controller route. |
| checkAndNotifyLowStock | inventory_items, warehouses, stores and notification/outbox paths | Worker/system operation may omit CallerContext; must be classified as a system actor in any future RLS/transaction design. |

### Inventory transfer defect fixed

Before this pass, transferStock verified that the caller could access both warehouses and the source inventory item, but did not compare the destination warehouse's store to the source variant's owning store. Because createItem already enforces warehouse-store equals variant-store, transferStock could create an inventory row that violated the same-store invariant when both stores belonged to one organization.

The method now resolves the source item, obtains source/destination warehouse store IDs and variant store ID, and rejects unless all three match. The same relationship invariant is checked for internal/system callers without CallerContext. Added apps/api/src/__tests__/unit/inventory/inventory-transfer-store-boundary.spec.ts. The test has not been run.

## Cross-cutting implications for the RLS design

1. Many service methods accept optional CallerContext because they are shared by HTTP and internal service/worker flows. RLS cannot assume every query is always executed with an end-user context.
2. Some service lookups read by primary key before the controller's ownership check. The request-context/transaction design must either move the check into the same transaction or define an explicit trusted internal context.
3. Shared tenant-scope helpers use the singleton DatabaseService, not the active Drizzle transaction. Authorization reads can therefore occur outside the mutation transaction; this must be addressed before relying on transaction-local tenant settings.
4. Inventory and catalog membership rules are stricter than organization-level shipment visibility. Do not flatten all tenant ownership into one generic org predicate.
5. Global payment queues and global analytics aggregates are platform-admin-only read paths; their permission assignments are part of the boundary.

## Next method-level batches

Continue with CatalogService/ProductGovernanceService/OfferService/CatalogTaxonomyService, then Pricing/Merchant/StoreMembership, then Returns/Disputes/Reviews, then carrier/shipping and worker/outbox/bootstrap/system actors. Each batch must identify unscoped internal helpers and route permission dependencies before any RLS policy is designed.

## Explicit non-actions

No tests were run, no CI was triggered, no DB query/write, migration, seed, reset, grant, default-ACL change, RLS activation, staging deployment, worker action or provider call occurred.


## Catalog, Offers, Product Governance and Taxonomy — method-level batch 2

| Method family | Tables / ownership predicate | Boundary notes |
|---|---|---|
| Catalog canonical lookup: findProductByIdentifiers/searchCanonicalProducts | products, brands, categories, product_variants, merchant_offers | Canonical discovery filters products.storeId IS NULL, deletedAt IS NULL and status ACTIVE. Merchant-owned/unpublished products are not disclosed through canonical identifier/search endpoints. |
| Catalog product mutations: create/update/delete/bulkProductOperations | products, stores | Controller applies assertProductEditableByMerchant/canManageStoreCatalog and store org/member checks. bulkProductOperations first selects IDs with both products.id IN ids and products.storeId=storeId, then updates only the returned valid IDs. |
| Variant create/update/delete/bulkVariantOperations | product_variants, products, variant_attribute_values, price lists/tiers | Controller authorizes the parent product. updateVariant prechecks (variantId, productId); both optimistic and legacy UPDATE predicates now include productId. Bulk delete/toggle filters include productId; create path binds productId and typed attributes are written through setVariantAttributeValues, which locks the (variantId, productId) row. |
| Product media: addMedia/reorderMedia/removeMedia/listMediaByProduct | product_media, products, product_variants | Controller authorizes product edit. reorderMedia updates by (mediaId, productId); removeMedia verifies media.productId before delete. addMedia now verifies an optional variantId belongs to the same product before insert. |
| Variant attribute read/write | variant_attribute_values, product_variants, products | GET route authorizes product, then verifies product_variants.id=variantId AND product_variants.productId=productId before calling the unscoped getVariantAttributeValues(variantId). PUT service locks the same composite relationship before replacing typed rows. |
| Import jobs | import_jobs, import_job_chunks, stores | Controller resolves job storeId and requires activeOrg + ACTIVE store membership before reading/updating job/chunk state. Service methods use job IDs after controller authorization. |
| Product Governance submit/withdraw | products, product_moderation, outbox_events | Service checks product.storeId equals supplied storeId and deletedAt IS NULL; conditional UPDATE includes productId, storeId, source status and optional updatedAt. Controller first checks product edit access; audit and outbox are transactional. |
| Product Governance admin review/moderation | products, product_moderation, audit/outbox | Global moderation queue and review actions are admin permission routes. Service enforces state transitions and optimistic locking; actor role/user are supplied from authenticated controller. |
| Offer create/update/withdraw | merchant_offers, products, product_variants, price_lists, warehouses, stores | createOffer asserts merchant role, active org and ACTIVE store membership; optional price list and warehouse must belong to offer store; optional variant must belong to product; product must be canonical (storeId NULL) or owned by the same offer store; duplicate offer constraints are checked. Merchant detail uses getOfferForMerchant, which resolves offer.storeId then checks org and ACTIVE membership and returns 404 for foreign IDs. |
| Offer analytics/trend | merchant_offers, order_items, orders, product_variants, products | Controller validates store access before service calls. Queries first resolve offer IDs by storeId, then aggregate order_items only for those IDs. Buyer-facing product offers are limited to ACTIVE/available offers and ACTIVE stores. |
| Offer approval/rejection/suspension/reactivation | merchant_offers, audit | Admin lifecycle routes require platform offer-management permissions and service validates allowed state transitions. These methods accept reviewerId rather than CallerContext, so their protection depends on controller permission guards; keep them platform-only. |
| Taxonomy global governance | attribute_definitions, attribute_options, attribute_groups, product_types, product_type_attributes, conditional rules | Authenticated taxonomy reads are intentionally available to dynamic merchant/buyer forms; create/update/delete/publish/version operations are guarded by platform taxonomy permissions. Product/variant typed-value operations are bound to their parent product/variant. |

### Catalog security fixes in this batch

1. GET /products/:productId/variants/:variantId/attribute-values previously authorized productId but queried variant values by variantId alone. A merchant authorized for product A could submit product A with another product's variant UUID and read its typed values. The controller now checks the composite (variantId, productId) relationship before calling the unscoped taxonomy read. Added a focused controller regression test.
2. CatalogService.addMedia previously accepted variantId without checking that it belonged to productId. It now rejects a foreign variant before inserting product_media. Added a focused service regression test.
3. CatalogService.updateVariant's legacy non-optimistic UPDATE previously filtered only by variantId after a composite preflight. The write predicate now also includes productId, matching the optimistic path and closing the preflight/write gap.
4. CatalogOfferService.createOffer previously loaded a product by ID without checking whether it was a private product owned by another store. The lookup now accepts only canonical products (storeId IS NULL) or products owned by the offer's store. Added a focused service regression test.

All focused tests are committed but not run.

### Remaining Catalog notes

- CatalogController.presignMedia creates a temporary unassociated object-storage key behind merchant:products:write; it does not attach a product/variant row. Treat orphan-upload quota/cleanup as an operational follow-up, not as a confirmed cross-tenant record leak.
- Several catalog service methods are unscoped by ID and depend on controller prechecks. Preserve the controller/service pairing; direct service calls must be classified as internal/system context.
- Shared tenant-scope helpers still use singleton DatabaseService rather than the caller's active transaction. Ownership reads and subsequent writes can therefore be separated by a concurrency window; the later request transaction design must address this.

