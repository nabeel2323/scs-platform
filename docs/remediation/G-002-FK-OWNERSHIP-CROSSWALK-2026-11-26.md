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
