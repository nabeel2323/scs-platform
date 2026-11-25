# G-002 Foreign-Key to Tenant-Ownership Crosswalk — 26 November 2026

## Evidence boundary

This is a focused source/schema review of high-risk shipping, payment, returns and reconciliation relationships on `remediation/phase-0-1-tenant-security`. It is not yet the complete 75-migration FK inventory, not a live catalog inspection, and not proof that every service callsite enforces ownership. No database was queried or changed.

## Ownership graph and reviewed relationships

| Child relation / FK | Parent / ownership path | Database constraint evidence | Runtime ownership evidence and remaining review |
|---|---|---|---|
| `stores.org_id` | `organizations.id` | Direct FK in merchant schema. | Root tenant anchor for store-owned rows. |
| `warehouses.store_id` | `stores.id → organizations.id` | Direct FK to store; no direct org column. | `assertWarehouseInOrg` derives store→org. Continue route/callsite review. |
| `orders.store_id` | `stores.id → organizations.id` | Direct FK to store; `orders.buyer_id` independently references users. | Order access must check buyer or store organization, not trust a client org claim. |
| `shipments.order_id` + `shipments.store_id` | Order and store are independent FKs. | Both FKs exist; no composite FK proves `orders.store_id = shipments.store_id`. | ShippingCarrierWorker's `assertOutboxTenantMatchesShipment` explicitly checks order.storeId equals shipment.storeId and derives organization from store before provider side effects. Audit all other shipment reads/writes for equivalent checks. |
| `carrier_credentials.org_id` | `organizations.id` | Direct FK. | Credential service filters by both credential ID and org ID for decryption; webhook context is selected only after credential lookup and signature verification. |
| `carrier_configurations.org_id`, `credential_id`, `store_id` | Organization, credential and optional store are independent FKs. | Schema has independent FKs; no composite tenant FK. | `CarrierConfigurationsService.create` verifies credential.orgId equals input.orgId and store.orgId equals input.orgId; `resolveForStore` checks store and active credential in same org. Preserve these checks on updates and internal callers. |
| `carrier_webhook_events.credential_id` + `shipment_id` | Credential→organization; shipment→store→organization. | Migration 0072 adds credential FK with RESTRICT and partial unique index on credential_id/external_delivery_id. Shipment and credential remain independent FKs. | Webhook route binds credential after token lookup and HMAC verification; routing resolves shipment only within credential org; worker validates credential/provider and shipment/store/order ownership. Migration 0072 backfills only unique provider credentials and detaches mismatched/ambiguous historical links for manual review. |
| `payment_records.order_id` | Order→store→organization. | Direct FK to orders. | Payment service loads payment and its order, then checks buyer/platform authority or store membership. |
| `payment_proof_upload_intents.payment_record_id` | Payment→order→store→organization. | Migration/schema FK to payment_records; storage key is unique. No direct org/store column. | Upload flow authorizes payment before storage I/O, records intent in scoped DB phases, and keeps object storage outside DB transactions. Cleanup checks whether any payment row references the exact storage key before deleting it; cleanup state changes are fenced by intent status and lease owner. |
| `return_requests.sub_order_id` + `payment_record_id` | Order→store→organization and payment→order. | Independent FKs to orders and payment_records; no composite FK proves payment.order_id equals sub_order_id. | CommissionReversalService explicitly checks payment.orderId equals return.subOrderId and derives org from order→store. SettlementAdjustmentService also checks payment.orderId/subOrderId and settlement merchantStoreId/order.storeId before posting. Audit all return creation/transition paths for the same relationship. |
| `reconciliation_runs.org_id` and `reconciliation_discrepancies.org_id` | Tenant scope is organization; discrepancies also point to run. | `reconciliation_discrepancies.run_id` FK to reconciliation_runs; org_id is nullable and schema does not declare an organization FK. Migration 0074 versions per period/currency/org with NULLS NOT DISTINCT uniqueness and a self-reference for supersession. | ReturnsController uses class-level TenantDatabaseContextInterceptor and `financialOrgScope`: non-platform callers must have activeOrg; platform roles may use null for explicit global scope. Reconciliation queries derive tenant from order→store→org; ensure discrepancy.orgId always equals parent run.orgId and test null/global vs tenant-specific behavior. |
| `settlement_adjustments.org_id`, `commission_reversals.org_id` | Financial records derived from order/return→store→organization. | These schema org columns are not direct FKs to organizations in the reviewed schema excerpt. | Financial controller's `financialOrgScope` prevents non-platform HTTP callers without activeOrg from widening optional service filters. Services must continue deriving/validating org from authoritative order/store relationships. |

## Confirmed service-level cross-column guards

- Carrier configuration creation verifies the selected credential and optional store both belong to the requested organization; store-specific resolution filters both the store and credential by organization.
- Carrier webhook routing resolves only within credential-owned stores. Shipping worker verifies the shipment's store organization and confirms the shipment's order belongs to that same store before any provider call.
- Commission reversal checks that the payment belongs to the return's sub-order and derives organization through order→store.
- Settlement adjustment posting checks that the sub-order's store matches the settlement merchant store and that the settlement payment record belongs to the same sub-order.
- Payment proof cleanup checks for any payment row referencing the exact storage key before deleting the object and fences intent state transitions by status and lease owner.
- Financial HTTP scope is fail-closed for non-platform roles without an active organization. Platform roles are intentionally allowed global scope by `financialOrgScope`; do not mistake a null org for an ordinary tenant caller.

## Open crosswalk work

1. Complete all 75 migration files and reconcile every FK/unique/check constraint against the Drizzle schema, including constraints created only in SQL migrations and reverse links.
2. Review all tenant-bearing relations not covered above: catalog product/variant/offer/store chains, inventory item→warehouse→store, store membership, organization membership, documents/verification requests, order financial breakdown, refunds, settlements, adjustments, commissions, audit/outbox and notifications.
3. Identify independent FKs that permit cross-tenant combinations (for example, two separate parent references on the same row) and decide whether to add composite constraints or retain explicit transactional service checks. Do not add a constraint until existing data has been profiled and a repair/rollback plan exists.
4. Trace every internal/system/worker callsite that omits CallerContext; the common tenant-scope helpers explicitly document that such calls bypass object-level caller checks by design.
5. Verify query predicates include both object identity and authoritative tenant ownership at each read/update/delete, including update row counts and race-safe transaction boundaries.
6. Compare the schema/migration inventory with a fresh protected catalog snapshot before making claims about physical relations, ownership, RLS or policies.

## Non-actions

No tests, lint, typecheck, build, migration, SQL execution, live database/catalog inspection, staging/shared DB write, grant/default-ACL change, RLS change, provider/storage call, worker activation, deployment or merge occurred. Findings are static source evidence only.


## 26 November 2026 — migration and financial lineage source-review addendum

This pass inspected migrations 0054, 0058, 0059, 0061 and 0070–0075, plus the corresponding return, settlement-adjustment, commission-reversal and carrier-webhook routing service paths. This is static source evidence only; no SQL was executed and no tests were run.

### Confirmed schema relationships and service checks

- **0054 store membership:** `store_members` has independent FKs to `stores` and `users`, with unique `(store_id,user_id)`; it does not encode that the user is an organization member of the store's organization. The migration backfills from store-created outbox events, then falls back to the earliest ACTIVE `MERCHANT_OWNER` in the store organization; stores without a candidate remain unassigned. Membership grant/update paths must keep verifying both store organization and user membership/authority.
- **0058 payments/refunds/settlements:** `refunds.payment_record_id` and `refunds.order_id` are independent FKs. `settlement_records.sub_order_id`, `payment_record_id` and `merchant_store_id` are three independent FKs. No composite FK proves payment.order_id=sub_order_id or order.store_id=merchant_store_id. These require explicit service checks and a data-profiled decision before any composite constraint is considered.
- **0059 returns:** `return_requests.sub_order_id` and `payment_record_id` are independent FKs. `return_request_items.return_request_id` and `order_item_id` are also independent; the schema does not prove the item belongs to the return's sub-order. Return creation currently loads order items by the selected sub-order and rejects a submitted item ID outside that set. Refund creation and finalization revalidate payment/order/return/refund lineage under transaction locks. Continue auditing every transition and any internal caller, not just creation/finalization.
- **0061 financial correctness:** commission reversals, settlement adjustments and reconciliation records add further independent links (return/refund/settlement/order/payment/store). Reviewed service paths derive organization from order→store, verify return→sub-order, and at posting verify settlement store and payment order against the adjustment sub-order. Preserve those checks; schema FKs alone do not establish lineage.
- **0071 auto-completion:** adds durable claim owner/time columns and a claimable index. Retain one canonical migration with PR #154 and validate claim, expiry, reclaim and stale-owner fencing in PostgreSQL before rollout.
- **0075 upload intents:** the new table links only to payment_records (plus a globally unique storage key); it has no direct organization/store FK. Payment→order→store→org is authoritative. Before storage I/O and cleanup, verify payment ownership and prove no payment references the exact object key; retain lease fencing and failure recovery.

### New review blockers / questions — not yet confirmed defects

1. **0070 default ACL scope:** existing-object revokes cover `anon` and `authenticated` tables/sequences, while default-ACL revocation is created only for `current_user` (the migration executor). It does not alter `PUBLIC`, `service_role`, or default ACLs belonging to other roles that may create public objects. Before treating G-002 as closed, inventory every object-creating role/default ACL and confirm the actual migration executor matches the intended owner/creator set. Do not broaden the migration without role-by-role evidence and a rollback plan.
2. **0072 unresolved historical webhook links:** credential backfill is only performed when `provider_key` identifies exactly one credential. Revalidation/detachment updates require a non-NULL credential_id, so ambiguous/no-match legacy events can retain an existing shipment_id while credential_id remains NULL. This may be acceptable only if all replay/worker/administrative paths refuse to trust such a legacy association without authenticated credential context. Trace every consumer and decide whether a separately reviewed detach/manual-reconciliation step is required.
3. **0074 reconciliation history rewrite:** the migration reverses legacy backward pointers and then creates a unique index on period/currency/version/org (NULLS NOT DISTINCT). Static review does not establish that predecessor/successor links always share period, currency and org, that histories are acyclic, or that existing duplicate versions are absent. Add isolated preflight fixtures/queries for cross-scope links, cycles, duplicate versions and NULL/global scope before migration approval; preserve a recovery snapshot because the rewrite is forward-only.
4. **Cross-column constraints:** refunds, returns, return items, settlements, reversals and adjustments contain independent parent FKs. Current service checks are valuable but do not prove all direct/internal call paths. Complete the callsite matrix before deciding whether composite FKs are practical; any new constraint requires an existing-data profile and repair/rollback plan.

### Carrier webhook routing source review

The runtime router checks the authenticated credential's provider against the event provider, obtains store IDs for the credential organization, then resolves shipment references only within those stores and returns AMBIGUOUS for multiple matches. The 0072 migration's nullable credential_id history case remains open as described above. This review did not exercise the controller, persistence path or worker against PostgreSQL.

### Remaining migration inventory

The repository tree contains 75 numbered SQL migrations (0001–0075). This pass is a focused review of the financial/membership and latest G-002 migrations, not a completed line-by-line audit of all 75. Remaining migration-by-migration review must cover identity/auth, organization/merchant, catalog/product/offer, inventory/warehouse, cart/order, shipping, notification/outbox, and import/governance constraints; reconcile SQL-created constraints with Drizzle schema and service predicates. Do not report the full 75-file audit complete.

### Non-actions

No migration execution, SQL/catalog access, staging/shared database write, grant/default-ACL change, RLS change, storage/provider call, worker activation, deployment, merge, test, lint, typecheck, build or CI occurred in this pass.


## 26 November 2026 — foundational tenancy and commerce migration review (0001–0011)

Static source review covered migrations 0001–0006 and 0008–0011. Migration 0007 (search) and later migrations remain to be reviewed in sequence. The findings below are schema-level relationship risks to reconcile with service guards; independent FKs are not by themselves proof of an exploitable defect.

| Migration / relation | Independent references or missing relational invariant | Required callsite evidence |
|---|---|---|
| 0001 `organization_members` | org_id, user_id and role_id are independent FKs; uniqueness is (org_id,user_id). | Membership grant/revoke must ensure role is valid for organization type and actor authority; no FK proves user is eligible for that org. |
| 0002 `audit_logs`, `outbox_events`, `analytics_events` | audit/org and analytics user/org are nullable scalar IDs without visible FKs in this migration. | Treat actor/resource/org as untrusted lineage; audit writers must derive org from authoritative resource and preserve actor context. Partitioned analytics parent/child RLS/access needs separate inventory. |
| 0003 `business_documents`, `verification_requests` | business_documents.org_id and optional store_id are independent FKs; verification_requests.org_id and store_id are independent FKs. | Upload, review, list and status-transition paths must prove store.org_id = document/request.org_id; uploader/reviewer must be authorized in that org. |
| 0003 `warehouses` | warehouse.store_id is the authoritative owner; downstream inventory rows do not carry org/store. | Inventory paths must derive store/org through warehouse and variant/product, not accept a caller-provided store as sufficient. |
| 0004 `categories`, `products` | product.store_id and category_id are independent; categories can be store-scoped or platform-level. Parent category references are independent of store scope. | Product create/update must allow only platform categories or categories owned by the same store; category parent moves must preserve compatible scope and prevent cross-store trees. |
| 0004 `product_media` | product_id and optional variant_id are independent FKs. | Media attach/update must prove variant belongs to product; media read/delete must derive ownership from product. |
| 0004 `import_jobs` | store_id and created_by are independent FKs. | Import creation/processing must validate caller membership in store org and ensure job's actor remains authorized where required. |
| 0005 `inventory_items` | variant_id and warehouse_id are independent FKs; uniqueness is (variant_id,warehouse_id). | Must prove variant.product.store_id equals warehouse.store_id on create, transfer and mutation. Stock movement inherits item ownership; reference_type/reference_id is polymorphic and has no FK. |
| 0006 `price_lists`, `price_tiers` | price_list_id and variant_id are independent; list has store_id while variant resolves through product.store_id. | Price tier create/update/read must prove variant product belongs to price-list store. segment_id is an untyped scalar in this migration and requires validation against the intended buyer-segment relation. |
| 0008 `promotions`, `promotion_redemptions` | promotion scope_id is polymorphic; redemption order_id is a scalar without FK in this migration. | Promotion scope must be resolved and tenant checked by scope type; redemption must validate user/order/promotion ownership and idempotency. |
| 0009 `cart_items` | cart_id, store_id and variant_id are independent FKs. | Must prove variant's product belongs to cart_items.store_id and cart belongs to the acting user. This is a cross-tenant consistency boundary in multi-merchant carts. |
| 0010 `orders`, `order_items` | orders.master_order_id, store_id, buyer_id and optional promotion_id are independent; order_items.order_id and variant_id are independent. | Checkout must prove each item variant belongs to that sub-order's store, master-order buyer matches sub-order buyer, and promotion scope/store is valid. Preserve snapshot/locking rules. |
| 0011 trust/conversations | disputes.order_id and raised_by/against_id are independent; conversations.order_id and both participant IDs are independent; messages.sender_id is independent of conversation. | Must validate disputants/participants are permitted for the order and sender is a conversation participant, with tenant/order checks on every read/write. |

### Highest-priority commerce consistency checks

1. Product→category scope (store-owned category versus platform category) and product_media variant→product.
2. Inventory variant→product.store_id equals warehouse.store_id.
3. Price tier variant→product.store_id equals price_list.store_id.
4. Cart item variant→product.store_id equals cart_items.store_id, and cart ownership matches caller.
5. Order item variant→product.store_id equals orders.store_id; master order buyer equals sub-order buyer; promotion scope matches store/order.
6. Business document / verification request store.org_id equals row.org_id; user roles/membership match the organization.
7. Conversation sender and dispute participants are authorized for the linked order.

Do not add composite constraints blindly: profile existing data first, inspect Drizzle schema and all service/internal callsites, and define repair/rollback for any inconsistent historical rows. Continue migration 0007 and 0012–0069 inventory; this still does not complete the 75-file audit.


## 26 November 2026 — service-callsite spot-check for commerce ownership links

Reviewed source sections in CatalogService, InventoryService/Controller, PricingService/Controller, CartService/Controller and OrdersService. Findings below are limited to the inspected paths; this is not exhaustive callsite closure.

### Positive guards observed

- Catalog product creation calls `assertCategoryAvailableForStore(categoryId, storeId)` before insert; category lookup allows platform categories or the same store. Recheck category update/parent changes and every import/bulk product write path separately.
- Inventory HTTP controller passes authenticated `JwtPayload` to create/list/adjust/transfer methods under JWT, permission guard and TenantDatabaseContextInterceptor. `createItem` checks warehouse membership, variant-store membership and equality when caller is supplied. Transfer verifies source warehouse, target warehouse and variant resolve to the same store.
- Pricing controller verifies active organization/store membership for price-list access and variant store; add/update/delete/resolve tier paths require variant store to equal price-list store. PricingService repeats the variant/list consistency check for tier add/update/delete/resolve.
- Cart controller derives operations from the authenticated user's active cart and is guarded by JWT, permissions and TenantDatabaseContextInterceptor. CartService derives store from variant→product (not client storeId), validates a selected offer applies to the exact variant/product and routes through that offer's store; cart rows are keyed to the user's cart. This is a useful mitigation for the cart_items independent-FK combination.
- OrdersService has a dedicated user actor-context wrapper for checkout mutation paths. Continue verifying every checkout/order write and cart snapshot uses the authenticated buyer, store grouping and item variant lineage.

### Remaining callsite risks / evidence gaps

1. InventoryService exposes caller-optional methods (including `createItem` and list helpers) and a no-caller `getOrCreateItem` helper. HTTP routes pass caller, but enumerate every internal/system callsite and prove it runs inside the intended actor context and independently validates variant↔warehouse store equality. A missing caller skips the object-level membership checks in `createItem`.
2. PricingService methods such as price-list creation are not themselves CallerContext-bound; the HTTP controller performs the store/org/member gate. Inventory internal callers and pricing internal callers therefore remain in the G-002 service-boundary matrix.
3. Cart helper `getCart(cartId)` reads by ID alone; current controller paths use user-scoped active-cart helpers, but ensure no direct/internal route exposes it without owner verification. Checkout must revalidate persisted cart item store/variant/offer lineage rather than assume earlier cart writes remain valid.
4. Catalog product creation's category check is positive evidence for that path only. Review product update, category reparent/move, product-media attach, imports, bulk operations and canonical product/offer linkage.
5. Orders migration has independent master_order, store, buyer, promotion and order-item variant links. Checkout source review must prove all links agree; the partial OrdersService excerpt confirms per-store grouping and offer/store validation but is not enough to close the full invariant.

No source code was changed in this pass. Do not treat these spot checks as closure of the remaining internal/system callsite audit.
