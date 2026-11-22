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

## Additional service and worker operation map — source slice 2

The following source files were also inspected. Schema-backed operations use the same R/I/U/D labels defined above. Raw-SQL worker tables are listed as **SQL touchpoints** only where the source uses SQL fragments; exact statement-by-statement read/write classification is deliberately not inferred from keyword matching.

| Source path | Tables and observed operations |
|---|---|
| `apps/api/src/modules/orders/cart.service.ts` | `carts` R/I/U; `cart_items` R/I/U/D; `products` R; `product_variants` R; `merchant_offers` R |
| `apps/api/src/modules/promotions/promotions.service.ts` | `promotions` R/I/U; `promotion_redemptions` R/I |
| `apps/api/src/modules/notifications/notifications.service.ts` | `notifications` R/I/U; `notification_preferences` R/I/U; `device_tokens` R/I/U |
| `apps/api/src/modules/analytics/analytics.service.ts` | `analytics_events` R/I |
| `apps/api/src/modules/reviews/disputes.service.ts` | `disputes` R/I/U; `dispute_events` R/I; `conversations` R/I/U; `messages` R/I/U; `orders` R; `payment_records` R; `refunds` R/U |
| `apps/api/src/modules/reviews/reviews.service.ts` | `reviews` R/I; `trust_snapshots` R/I/U; `orders` R |
| `apps/api/src/common/outbox/outbox-dispatcher.service.ts` | `outbox_events` R/I/U |
| `apps/api/src/modules/shipping/shipping-carrier.worker.ts` | `outbox_events` U; `shipments` R/U; `carrier_webhook_events` R/U; `shipment_labels` R/I |
| `apps/api/src/modules/operations/p13-monitor.service.ts` | Raw SQL touchpoints: `return_requests`, `orders`, `stores`, `worker_leases`, `refunds`, `commission_reversals`, `payment_records`, `settlement_adjustments`, `outbox_events`, `ops_alerts` |
| `apps/api/src/modules/operations/worker-lease.service.ts` | Raw SQL touchpoint: `worker_leases` (lease acquisition/renewal/release) |
| `apps/api/src/modules/operations/ops-alert.service.ts` | Raw SQL touchpoint: `ops_alerts` (durable alert state and delivery lifecycle) |
| `apps/api/src/modules/orders/auto-complete.worker.ts` | Raw SQL touchpoint: `orders` for due-order claiming; delegates the state transition to OrdersService |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | Raw SQL touchpoint: `return_requests` for due-return selection/claiming; delegates return transitions to ReturnsService |

### Worker and system-context implications

- The generic OutboxDispatcher reads and updates `outbox_events`; the dedicated ShippingCarrierWorker also consumes carrier outbox events and updates shipment/carrier records. Event-type ownership and claim predicates must be recorded so the same event cannot be acknowledged by a non-owning consumer.
- WorkerLeaseService and P13MonitorService use raw SQL rather than Drizzle schema objects for at least part of their operations. A scoped DB abstraction must cover these raw SQL paths; wrapping only typed Drizzle query-builder calls would be incomplete.
- P13MonitorService is an operational monitor with read-only domain scans plus durable alert coordination. OpsAlertService owns the `ops_alerts` lifecycle; WorkerLeaseService owns `worker_leases`. Keep these system tables distinct from tenant-owned business rows.
- AutoCompleteWorker and ReturnExpirationWorker execute outside HTTP request context and delegate domain transitions to OrdersService and ReturnsService. Their claim/lease queries and delegated service operations need an explicit worker identity and, where applicable, the owning order/store context.
- Notifications and analytics contain user/org-associated rows but are not automatically safe for broad tenant reads. Device tokens and notification preferences are user-private; analytics requires event-level access and aggregation rules.
- Disputes/conversations/messages inherit order-participant and conversation membership rules. A dispute's parent order and payment references are part of the ownership path; a generic org-only filter is insufficient.

## Administrative, import, membership, webhook and reconciliation paths — source slice 3

This slice extends the static map into platform-admin, import, membership, carrier ingress/tracking, reconciliation and durable operations-control paths.

| Source path | Tables and observed operations |
|---|---|
| apps/api/src/modules/admin/admin.service.ts | orders R; order_items R; order_status_history R; stores R; warehouses R; business_documents R; users R/I/U; organizations R/U; organization_members R/I/U/D; organization_update_requests R/U; roles R; permissions R; role_permissions R/I/D; products R/U; product_media R; product_variants R; disputes R; dispute_events R. Product/taxonomy/governance work delegates to separately mapped services. |
| apps/api/src/modules/catalog-import/catalog-import.service.ts | catalog_imports R/I/U; catalog_import_errors R/I/D; brands R; categories R; products R; product_variants R; product_sources R; attribute_definitions R; attribute_options R; product_types R. |
| apps/api/src/modules/merchant/store-membership.service.ts | store_members R/I/U/D; stores R; organization_members R; users R. |
| apps/api/src/modules/shipping/carrier-tracking-poller.ts | Raw SQL: shipments U with an inner SELECT ... FOR UPDATE SKIP LOCKED candidate claim and RETURNING *. Schema-backed shipments U and shipment_events I during polling. |
| apps/api/src/modules/shipping/carrier-webhook.controller.ts | carrier_webhook_events I/U; carrier_credentials R; shipments R; outbox_events I. |
| apps/api/src/modules/returns/reconciliation.service.ts | reconciliation_runs R/I/U; reconciliation_discrepancies R/I/U; settlement_adjustments R; settlement_adjustment_approvals R; commission_reversals R; return_requests R; refunds R; settlement_records R; order_financial_breakdown R. |
| apps/api/src/modules/operations/ops-control.service.ts | Raw SQL: ops_controls R/I/U (upsert); ops_control_audit R. Schema-backed ops_control_audit I. The control upsert and append-only audit insert share a transaction; platform audit/alert writes are separate service calls. |

### Explicit raw-SQL statements observed

- Carrier tracking claim: updates eligible shipments rows, selecting a bounded batch with FOR UPDATE SKIP LOCKED, then returns claimed rows. This is a worker/system operation, not a request-scoped tenant query.
- Operations pause read: reads ops_controls by control_key; a DB error is intentionally fail-closed by the caller.
- Operations state read: reads ops_controls by control_key.
- Operations state mutation: upserts ops_controls and inserts ops_control_audit in one Drizzle transaction. Platform audit and alert writes occur after that transaction as separate service calls.
- Operations history read: reads ops_control_audit by control_key, ordered newest-first with a bounded limit.

### Route and principal handoff observations

- Admin routes in admin.controller.ts delegate to AdminService; the service performs cross-domain reads and selected user/organization/role mutations. This is a platform-governance principal, not a tenant-owned merchant request. Controller permission metadata and per-action checks remain part of the route matrix.
- Catalog import routes in catalog-import.controller.ts delegate upload/list/detail/preview/execute/retry/error/report/template/export operations to CatalogImportService. Execution delegates to an import executor and downstream catalog/taxonomy services. Executor/planner transaction internals still need a dedicated source pass; uploadedBy alone is not a complete tenant/organization owner.
- Store-membership routes delegate to StoreMembershipService. These are tenant administration paths: the membership row is owned through its parent store and organization; the user row is a referenced identity, not a tenant-owned child.
- Carrier webhooks use provider signature/security checks and resolve tenant identity from the stored carrier credential and shipment relationship. The controller explicitly does not trust storeId/orgId supplied in webhook payload. Treat the provider credential as the authenticated system principal, and derive shipment/store/org ownership from persisted records.
- CarrierTrackingPoller runs outside HTTP request context. Its shipment claim is a global worker query over eligible rows, after which each shipment must be handled under the owning store/org context when domain state is changed.
- ReconciliationService accepts an optional orgId and applies it to run selection/creation and downstream checks. Null-org/global mode is a distinct platform/system scope and must not be conflated with a tenant request; confirm controller/worker callers and authorization before defining policies.

### Database-independent provider/realtime paths

- PaymentProviderRegistry, ProviderRegistryService, OtpDeliveryService, WebhookSecurityService and RealtimeGateway do not directly use DatabaseService in the inspected source. They may call DB-backed services or Redis, but are not themselves direct PostgreSQL access paths in this slice.
- CarrierCredentialsService is DB-backed and is reached from shipping configuration/webhook code; its table carrier_credentials is read and written by that service. A full CRUD operation map for the credential lifecycle remains in the shipping-specific source pass.

## Catalog execution, carrier credentials and financial subservices — source slice 4

| Source path | Tables and observed operations |
|---|---|
| apps/api/src/modules/catalog-import/excel-executor.service.ts | brands I/U; categories R/I/U; products I/U; product_variants I/U; product_sources I; attribute_groups I; attribute_definitions I; attribute_options I; product_types I; product_type_attributes I; product_attribute_values I; variant_attribute_values I. Executor comment and transaction code define 12 ordered per-entity-type transactions; a failure in one entity type does not poison unrelated entity types. |
| apps/api/src/modules/shipping/carrier-credentials.service.ts | carrier_credentials R/I/U; credentials are encrypted before persistence and returned through a masked projection. |
| apps/api/src/modules/shipping/carrier-configurations.service.ts | carrier_configurations R/I/U; carrier_credentials R; stores R. Configuration references credential and optional store, so org/store consistency is required. |
| apps/api/src/modules/shipping/carrier-reconciliation.service.ts | shipments U; source contains SQL claim/reconciliation paths for shipment state. Exact predicates and full statement classification remain a dedicated review item. |
| apps/api/src/modules/returns/commission-reversal.service.ts | commission_reversals R/I; return_requests R; return_request_items R; orders R; order_financial_breakdown R; order_items R; settlement_records R; stores R. |
| apps/api/src/modules/returns/settlement-adjustment.service.ts | settlement_adjustments R/I/U; settlement_adjustment_approvals R/I; settlement_records R/I; orders R; stores R. |
| apps/api/src/modules/returns/business-calendar.service.ts | business_calendars R/I/U; business_calendar_holidays R/I/D; business_calendar_audit R/I. |

### Transaction and actor-context implications

- ExcelExecutorService uses ordered per-entity-type transactions rather than one all-or-nothing transaction for the entire import. A request-scoped transaction wrapper must not accidentally collapse these transaction boundaries or change partial-failure semantics. The import orchestration also updates catalog_imports and catalog_import_errors outside the executor's individual entity transactions.
- CarrierCredentialsService is organization-scoped; decryption is a privileged application operation. A tenant query may access masked metadata for its organization, but plaintext credential material must not be exposed by a general row policy or ordinary API projection.
- CarrierConfigurationsService links an organization credential to an optional store. Verify credential.org_id equals store.org_id whenever store_id is present; do not rely only on a configuration row's org_id.
- CarrierReconciliationService is a system/worker/admin operation over shipments. Shipment ownership still resolves through the shipment's store and order, while retry/circuit-breaker/lease metadata may be system-owned.
- CommissionReversalService and SettlementAdjustmentService are financial subservices. Their records connect returns, refunds, settlements and suborders. The service-level org scope and financial approval state machine must be preserved; a row's created_by or approver_id is attribution, not the owner predicate.
- BusinessCalendarService schema has no direct org_id field in the inspected declarations despite comments describing tenant or global calendars. The actual calendar scope may be encoded elsewhere; treat the row as unresolved global/configuration scope until service logic and migrations establish the tenant mapping.

## Still unmapped

This map now includes 33 service files plus supporting outbox/worker/monitor/lease/alert paths, but does not yet prove full coverage of every controller caller, every import-executor transaction edge, all shipping retry/recovery/webhook paths, migration/bootstrap/CLI scripts, dynamic imports, DB functions/triggers/views/sequences, partition children, extension-owned objects or all 99 Drizzle-exported tables. The bounded access-path inventory remains authoritative for shared DatabaseService behavior, asynchronous audit middleware, bootstrap, runtime identity and nested-transaction blockers.

Next source slices should cover the remaining service files in catalog-import execution/planning, carrier credential lifecycle/retry/recovery, all API controller-to-service caller paths, migration/bootstrap scripts and any standalone CLI jobs; then reconcile each operation to principal/actor context, exact direct/indirect FK owner and read/write/delete predicates. The 114-versus-116 relation discrepancy still requires a refreshed protected read-only catalog snapshot.

## Explicit non-actions

No request transaction interceptor, AsyncLocalStorage context, session-level tenant setting, RLS policy, migration, grant/default-ACL change, shared database query/write, staging action, deployment, provider call or worker activation was performed. This source map is not authorization to perform any of those actions.
