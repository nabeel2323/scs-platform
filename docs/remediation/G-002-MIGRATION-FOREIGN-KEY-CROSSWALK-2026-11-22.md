# G-002 — Migration Foreign-Key and Ownership Crosswalk

**Review date:** 24 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Source baseline:** `f21dbe4aca75ba04e9173b1fc28a9591829af554`  
**Status:** Partial static migration crosswalk; no live catalog verification and no policy approval.

## Why this document exists

The Drizzle schema review is not sufficient to establish database ownership. Several constraints are added later by SQL migrations, some relationships are deferred until both parent tables exist, and some columns used for tenant scoping deliberately have no FK to organizations. This crosswalk records only relationships explicitly found in the reviewed migrations.

It is not an exhaustive FK catalog. The final authority for deployed constraints is the protected read-only PostgreSQL catalog snapshot, which has not been refreshed in this work session. Migration history may also differ from the connected staging database.

## Verified migration-defined relationships

| Migration                               | Table/column                                            | Target                                      | Ownership implication                                                                      |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0054_store_members.sql                  | store_members.store_id                                  | stores.id ON DELETE CASCADE                 | Membership row inherits store/org boundary through store                                   |
| 0054_store_members.sql                  | store_members.user_id                                   | users.id ON DELETE CASCADE                  | User is member identity, not the tenant owner                                              |
| 0034_catalog_imports.sql                | catalog_imports.uploaded_by                             | users.id                                    | Platform-level admin import; uploader attribution does not make it a user-private import   |
| 0034_catalog_imports.sql                | catalog_import_errors.import_id                         | catalog_imports.id ON DELETE CASCADE        | Error rows inherit platform import scope                                                   |
| 0043_carrier_integration.sql            | carrier_credentials.org_id                              | organizations.id                            | Credential row is organization-owned                                                       |
| 0043_carrier_integration.sql            | carrier_configurations.org_id                           | organizations.id                            | Configuration has organization scope                                                       |
| 0043_carrier_integration.sql            | carrier_configurations.credential_id                    | carrier_credentials.id                      | Credential/configuration must be same-org; no composite FK was observed                    |
| 0043_carrier_integration.sql            | carrier_configurations.store_id                         | stores.id                                   | Optional store override; verify store.org_id equals configuration.org_id in service/policy |
| 0058_payment_financial_architecture.sql | payment_records.order_id                                | orders.id ON DELETE CASCADE                 | Payment inherits order/suborder participant boundary                                       |
| 0058_payment_financial_architecture.sql | payment_records.verified_by                             | users.id                                    | Verifier is actor attribution                                                              |
| 0058_payment_financial_architecture.sql | payment_events.payment_record_id                        | payment_records.id ON DELETE CASCADE        | Event inherits payment/order boundary                                                      |
| 0058_payment_financial_architecture.sql | payment_events.actor_id                                 | users.id                                    | Actor attribution                                                                          |
| 0058_payment_financial_architecture.sql | refunds.payment_record_id                               | payment_records.id ON DELETE CASCADE        | Refund inherits payment/order boundary                                                     |
| 0058_payment_financial_architecture.sql | refunds.order_id                                        | orders.id ON DELETE CASCADE                 | Explicit order ownership path; must agree with payment_record.order_id                     |
| 0058_payment_financial_architecture.sql | refunds.requested_by / approved_by                      | users.id                                    | Actor attribution, not ownership                                                           |
| 0058_payment_financial_architecture.sql | settlement_records.sub_order_id                         | orders.id ON DELETE CASCADE                 | Merchant suborder boundary                                                                 |
| 0058_payment_financial_architecture.sql | settlement_records.payment_record_id                    | payment_records.id ON DELETE CASCADE        | Payment lineage                                                                            |
| 0058_payment_financial_architecture.sql | settlement_records.merchant_store_id                    | stores.id ON DELETE CASCADE                 | Store boundary; verify store matches suborder store                                        |
| 0059_return_requests.sql                | return_requests.sub_order_id                            | orders.id ON DELETE CASCADE                 | Return inherits suborder/store boundary                                                    |
| 0059_return_requests.sql                | return_requests.payment_record_id                       | payment_records.id ON DELETE CASCADE        | Payment lineage must match suborder                                                        |
| 0059_return_requests.sql                | return_requests.buyer_id                                | users.id                                    | Buyer is an explicit participant                                                           |
| 0059_return_requests.sql                | return_requests.inspected_by                            | users.id                                    | Actor attribution                                                                          |
| 0059_return_requests.sql                | return_request_items.return_request_id                  | return_requests.id ON DELETE CASCADE        | Parent return boundary                                                                     |
| 0059_return_requests.sql                | return_request_items.order_item_id                      | order_items.id ON DELETE CASCADE            | Order-item lineage must match the same parent order                                        |
| 0059_return_requests.sql                | return_request_events.return_request_id                 | return_requests.id ON DELETE CASCADE        | Parent return boundary                                                                     |
| 0059_return_requests.sql                | return_request_events.actor_id                          | users.id                                    | Actor attribution                                                                          |
| 0059_return_requests.sql                | refunds.return_request_id                               | return_requests.id ON DELETE SET NULL       | Deferred refund-to-return relationship                                                     |
| 0059_return_requests.sql                | disputes.return_request_id                              | return_requests.id ON DELETE SET NULL       | Deferred dispute-to-return relationship                                                    |
| 0059_return_requests.sql                | return_request_items.inventory_item_id                  | inventory_items.id ON DELETE SET NULL       | Inventory item linkage added after inspection                                              |
| 0059_return_requests.sql                | return_requests.refund_id                               | refunds.id ON DELETE SET NULL               | Deferred reverse link; avoid assuming one-way lineage                                      |
| 0061_phase3_financial_correctness.sql   | commission_reversals.return_request_id                  | return_requests.id ON DELETE CASCADE        | Reversal inherits return/order/store boundary                                              |
| 0061_phase3_financial_correctness.sql   | commission_reversals.refund_id                          | refunds.id                                  | Refund lineage                                                                             |
| 0061_phase3_financial_correctness.sql   | commission_reversals.settlement_id                      | settlement_records.id                       | Settlement lineage                                                                         |
| 0061_phase3_financial_correctness.sql   | commission_reversals.created_by                         | users.id                                    | Actor attribution                                                                          |
| 0061_phase3_financial_correctness.sql   | settlement_adjustments.settlement_id                    | settlement_records.id                       | Settlement lineage                                                                         |
| 0061_phase3_financial_correctness.sql   | settlement_adjustments.sub_order_id                     | orders.id ON DELETE CASCADE                 | Suborder/store boundary                                                                    |
| 0061_phase3_financial_correctness.sql   | settlement_adjustments.return_request_id                | return_requests.id                          | Optional return lineage                                                                    |
| 0061_phase3_financial_correctness.sql   | settlement_adjustments.created_by                       | users.id                                    | Actor attribution                                                                          |
| 0061_phase3_financial_correctness.sql   | settlement_adjustment_approvals.adjustment_id           | settlement_adjustments.id ON DELETE CASCADE | Approval inherits adjustment boundary                                                      |
| 0061_phase3_financial_correctness.sql   | settlement_adjustment_approvals.approver_id             | users.id                                    | Approver attribution; approval authority is separately permission-gated                    |
| 0061_phase3_financial_correctness.sql   | reconciliation_runs.executed_by                         | users.id                                    | Executor attribution                                                                       |
| 0061_phase3_financial_correctness.sql   | reconciliation_discrepancies.run_id                     | reconciliation_runs.id ON DELETE CASCADE    | Discrepancy inherits run scope                                                             |
| 0061_phase3_financial_correctness.sql   | reconciliation_discrepancies.resolved_by                | users.id                                    | Resolver attribution                                                                       |
| 0062_phase3_1_hardening.sql             | reconciliation_runs.superseded_by                       | reconciliation_runs.id                      | Run version lineage                                                                        |
| 0071_auto_complete_claim_leases.sql     | No FK added; orders claim timestamp/worker columns only | —                                           | Claim owner is worker ID, not user or tenant identity                                      |

## Earlier core schema migration relationships

| Migration                | Table/column                                                | Target                                                                                        | Ownership implication                                                                               |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0001_identity.sql        | role_permissions.role_id / permission_id                    | roles.id / permissions.id ON DELETE CASCADE                                                   | Global RBAC join; platform governance only                                                          |
| 0001_identity.sql        | organization_members.org_id / user_id / role_id             | organizations.id / users.id ON DELETE CASCADE / roles.id                                      | Membership edge; enforce org, user, role and ACTIVE status                                          |
| 0001_identity.sql        | sessions.user_id / replaced_by                              | users.id ON DELETE CASCADE / sessions.id                                                      | User-private session and session-chain scope                                                        |
| 0003_merchant.sql        | stores.org_id                                               | organizations.id ON DELETE CASCADE                                                            | Store belongs to organization                                                                       |
| 0003_merchant.sql        | warehouses.store_id                                         | stores.id ON DELETE CASCADE                                                                   | Warehouse inherits store/org scope                                                                  |
| 0003_merchant.sql        | business_documents.org_id / store_id                        | organizations.id / stores.id ON DELETE CASCADE                                                | Verify optional store belongs to the same org; uploader/reviewer are actors                         |
| 0003_merchant.sql        | verification_requests.store_id / org_id                     | stores.id / organizations.id ON DELETE CASCADE                                                | Both owner columns must agree; reviewer is attribution                                              |
| 0004_catalog.sql         | categories.store_id / parent_id                             | stores.id ON DELETE CASCADE / categories.id ON DELETE SET NULL                                | Store-scoped category or platform category; recursive parent must preserve scope                    |
| 0004_catalog.sql         | products.store_id / category_id / brand_id                  | stores.id ON DELETE CASCADE / categories.id ON DELETE SET NULL / brands.id ON DELETE SET NULL | Product store owner; category/brand are references, not tenant ownership                            |
| 0004_catalog.sql         | product_variants.product_id                                 | products.id ON DELETE CASCADE                                                                 | Variant inherits product/store scope                                                                |
| 0004_catalog.sql         | product_media.product_id / variant_id                       | products.id / product_variants.id ON DELETE CASCADE                                           | Media inherits product/variant scope                                                                |
| 0004_catalog.sql         | import_jobs.store_id / created_by                           | stores.id ON DELETE CASCADE / users.id                                                        | Store-owned import job; created_by is attribution                                                   |
| 0005_inventory.sql       | inventory_items.variant_id / warehouse_id                   | product_variants.id / warehouses.id ON DELETE CASCADE                                         | Inventory row must connect a variant to a warehouse in the same permitted store scope               |
| 0005_inventory.sql       | stock_movements.inventory_item_id / performed_by            | inventory_items.id ON DELETE CASCADE / users.id                                               | Movement inherits inventory item/warehouse; performer is attribution                                |
| 0009_cart.sql            | carts.user_id / promotion_id                                | users.id ON DELETE CASCADE / promotions.id                                                    | Cart is buyer-private; promotion is a reference                                                     |
| 0009_cart.sql            | cart_items.cart_id / store_id / variant_id                  | carts.id ON DELETE CASCADE / stores.id / product_variants.id                                  | Cart owner plus store/variant consistency; no composite FK enforces same-store relationships        |
| 0010_orders.sql          | master_orders.buyer_id                                      | users.id                                                                                      | Buyer-owned order aggregate                                                                         |
| 0010_orders.sql          | orders.master_order_id / store_id / buyer_id / promotion_id | master_orders.id / stores.id / users.id / promotions.id                                       | Multi-party order; buyer and store participants both matter                                         |
| 0010_orders.sql          | order_items.order_id / variant_id                           | orders.id / product_variants.id                                                               | Order child; variant must be consistent with the order's store/offer snapshot                       |
| 0010_orders.sql          | order_financial_breakdown.order_id                          | orders.id                                                                                     | Financial child inherits order access with restricted actions/columns                               |
| 0010_orders.sql          | order_status_history.order_id / changed_by                  | orders.id / users.id                                                                          | Order child; changed_by is attribution                                                              |
| 0023_attributes.sql      | attribute_options.attribute_id                              | attribute_definitions.id ON DELETE CASCADE                                                    | Global taxonomy child                                                                               |
| 0026_merchant_offers.sql | merchant_offers.store_id / product_id / variant_id          | stores.id / products.id / product_variants.id ON DELETE CASCADE                               | Offer store owner plus product compatibility                                                        |
| 0026_merchant_offers.sql | merchant_offers.price_list_id / warehouse_id                | price_lists.id ON DELETE SET NULL / warehouses.id ON DELETE SET NULL                          | Referenced pricing/warehouse must belong to same store; no composite FK                             |
| 0026_merchant_offers.sql | merchant_offers.created_by / reviewed_by                    | users.id                                                                                      | Actor attribution                                                                                   |
| 0040_shipments.sql       | shipments.order_id / store_id / assigned_driver_id          | orders.id / stores.id / users.id                                                              | Order/store owner plus explicit assigned-driver access; verify store matches order                  |
| 0040_shipments.sql       | shipment_events.shipment_id / actor_user_id                 | shipments.id / users.id                                                                       | Event inherits shipment; actor is attribution                                                       |
| 0041_shipping.sql        | shipping_methods.store_id / delivery_zones.store_id         | stores.id                                                                                     | Store-scoped shipping configuration                                                                 |
| 0041_shipping.sql        | delivery_zone_methods.zone_id / shipping_method_id          | delivery_zones.id / shipping_methods.id                                                       | Both parents must belong to same store; no composite FK                                             |
| 0041_shipping.sql        | shipment_labels.shipment_id / delivery_proofs.shipment_id   | shipments.id                                                                                  | Child rows inherit shipment/order/store/driver scope                                                |
| 0041_shipping.sql        | driver_profiles.user_id / org_id                            | users.id / organizations.id                                                                   | Driver identity plus organization; assignment is a separate store edge                              |
| 0041_shipping.sql        | driver_store_assignments.driver_profile_id / store_id       | driver_profiles.id / stores.id                                                                | Verify driver organization matches store organization; no composite FK                              |
| 0041_shipping.sql        | carrier_webhook_events.shipment_id                          | shipments.id                                                                                  | Provider callback inherits shipment when resolved; unauthenticated payload fields are not ownership |

### Important no-composite-FK observations

- Several relationships are individually FK-backed but their cross-column consistency is not: verification_requests.store_id/org_id, business_documents.store_id/org_id, cart_items.store_id/variant_id, inventory_items.variant_id/warehouse_id, merchant_offers store/price-list/warehouse/product/variant, orders master-order/store/buyer, settlement_records order/payment/store, carrier_configurations org/credential/store, delivery_zone_methods zone/method, and driver_store_assignments driver/store.
- RLS policies on a child table must not merely test one FK parent if the service contract requires multiple parents to agree. Either the write path must enforce the invariant atomically and tests must prove it, or the database needs a reviewed constraint strategy.
- The migration parser can encounter CHECK expressions that mention a users table or string values; only explicit column REFERENCES clauses are counted as FKs in this crosswalk. Do not treat CHECK text or comments as relationships.

## Important columns with no organization FK

Migration 0062 adds nullable org_id columns to reconciliation_runs, settlement_adjustments, commission_reversals and reconciliation_discrepancies, but does **not** add foreign keys to organizations. Those columns are application-maintained tenant-scope metadata. Before relying on them in RLS, prove that every writer derives the value from the canonical order/store/return parent and that it cannot disagree with that parent.

Migration 0063 creates several system tables without tenant/user FKs:

| Table               | Columns                                              | Migration intent / consequence                                  |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| worker_leases       | lease_key, holder_id, holder_host, holder_pid, epoch | Infrastructure lease, explicitly no FK to users/orgs            |
| ops_controls        | control_key, updated_by                              | Global pause/kill-switch control; updated_by has no FK          |
| ops_control_audit   | actor_id, actor_kind                                 | Global append-only control history; actor_id has no FK          |
| ops_alerts          | optional org_id, resource_type, resource_id          | Operational alerts; org_id/resource_id are metadata without FKs |
| p13_pilot_allowlist | org_id, optional store_id, created_by                | Operator-managed allowlist; org/store/user columns have no FKs  |
| feature_flags       | updated_by                                           | Platform feature-flag attribution; no FK added                  |

These are SYSTEM or SYSTEM/MIXED rows. A missing org_id must never be interpreted as a user-visible global scope. System access must be explicit and separate from ordinary tenant requests.

## Business calendar and platform import scope

- Migration 0060 creates business_calendars with created_by → users but no org_id/store_id. The schema comment mentions tenant/global calendars, but the physical table definition does not encode a tenant key. The current implementation therefore cannot claim database-enforced tenant calendar ownership. Resolve the intended global-vs-tenant model before RLS.
- Migration 0034 explicitly describes catalog_imports as platform-level admin-driven Excel imports, separate from store-scoped import_jobs created in migration 0004. uploaded_by → users is attribution and must not be used as the row-visibility owner.
- catalog_import_errors are children of catalog_imports and cascade on parent deletion.

## Migration 0070 boundary — no RLS activation

Migration 0070_public_access_and_function_search_path_hardening.sql:

- Creates anon/authenticated roles only in disposable environments where absent.
- Revokes all privileges on existing public tables and sequences from anon/authenticated.
- Revokes future table/sequence default privileges for those two roles from the role executing the migration.
- Pins public.normalize_arabic(text) search_path to pg_catalog.
- Does **not** enable or force RLS.
- Does **not** alter service_role grants.
- Does **not** verify or change the live API runtime role.

The migration comment explicitly gates RLS on actual API DATABASE_URL username confirmation and complete access-path review. It is not authority to apply the migration or enable RLS in staging.

Migration 0071_auto_complete_claim_leases.sql adds worker claim fields and an index to orders. The worker claim itself is a global system operation, while the subsequent order transition must be executed through the canonical OrdersService with an explicit worker actor and order/store owner context.

## Open verification items

1. Reconcile all listed migration constraints with the current staging pg_constraint/pg_attribute snapshot. No live catalog query was performed for this document.
2. Enumerate FKs added by earlier migrations for organizations, stores, products, variants, orders, shipments, outbox, support/disputes and shipping tables; this crosswalk is intentionally scoped to the high-risk migrations above.
3. Verify consistency constraints not represented by composite FKs: carrier config org/store/credential, settlement store/suborder/payment, refund order/payment, return order/payment/buyer, and adjustment/reversal org_id vs parent store.
4. Determine whether any migration path, manual repair or import can create orphaned or mismatched rows.
5. Reconcile 114-versus-116 physical relation count and all partition children/views/functions/sequences from a protected read-only catalog snapshot.

## Explicit non-actions

No live database query/write, migration, grant/default-ACL change, RLS policy, staging deployment, worker activation or provider call occurred. This crosswalk is source evidence only; no SQL policy is approved or ready to apply.


## 24 November 2026 — complete numbered migration REFERENCES scan

A static scan of all 75 numbered SQL migrations (0001–0075) at source checkpoint `f21dbe4aca75ba04e9173b1fc28a9591829af554` found **183 explicit REFERENCES clauses in 40 migration files**; 35 migration files contain no explicit REFERENCES clause. This includes inline references and table constraints in migration SQL. The table below records the count and distinct referenced parent tables per file. It is source text evidence, not proof that all constraints exist in the deployed database; the protected catalog remains authoritative.

| Migration | REFERENCES clauses | Distinct referenced tables |
|---|---:|---|
| 0001_identity.sql | 7 | roles, permissions, organizations, users, sessions |
| 0003_merchant.sql | 10 | organizations, stores, users |
| 0004_catalog.sql | 10 | stores, categories, brands, products, product_variants, users |
| 0005_inventory.sql | 4 | product_variants, warehouses, inventory_items, users |
| 0006_pricing.sql | 3 | stores, price_lists, product_variants |
| 0007_search.sql | 2 | stores, users |
| 0008_promotions.sql | 3 | stores, promotions, users |
| 0009_cart.sql | 5 | users, promotions, carts, stores, product_variants |
| 0010_orders.sql | 10 | users, master_orders, stores, promotions, orders, product_variants |
| 0011_trust.sql | 13 | orders, users, disputes, conversations |
| 0012_comms.sql | 3 | users |
| 0014_dual_auth.sql | 1 | users |
| 0017_saved_suppliers.sql | 2 | users, stores |
| 0022_org_update_requests.sql | 3 | organizations, users |
| 0023_attributes.sql | 1 | attribute_definitions |
| 0024_product_types.sql | 4 | categories, product_types, attribute_definitions, attribute_groups |
| 0025_canonical_products.sql | 5 | product_types, products, attribute_definitions, product_variants |
| 0026_merchant_offers.sql | 7 | stores, products, product_variants, price_lists, warehouses, users |
| 0028_offer_atomization.sql | 2 | merchant_offers |
| 0031_catalog_requests.sql | 3 | stores, users |
| 0034_catalog_imports.sql | 2 | users, catalog_imports |
| 0037_favorites_unique.sql | 2 | users, products |
| 0038_product_sources.sql | 1 | products |
| 0040_shipments.sql | 5 | orders, stores, users, shipments |
| 0041_shipping.sql | 11 | stores, delivery_zones, shipping_methods, shipments, users, organizations, driver_profiles |
| 0042_shipping_methods_enhancement.sql | 1 | shipping_methods |
| 0043_carrier_integration.sql | 5 | organizations, users, carrier_credentials, stores |
| 0054_store_members.sql | 2 | stores, users |
| 0055_import_chunking_inventory_integrity.sql | 1 | import_jobs |
| 0056_product_governance.sql | 3 | users, products |
| 0057_governance_index_offer_snapshot.sql | 2 | products, merchant_offers |
| 0058_payment_financial_architecture.sql | 11 | orders, users, payment_records, stores |
| 0059_return_requests.sql | 13 | orders, payment_records, users, return_requests, order_items, disputes, inventory_items, refunds |
| 0060_escalated_and_business_calendar.sql | 6 | users, business_calendars |
| 0061_phase3_financial_correctness.sql | 14 | return_requests, refunds, settlement_records, users, orders, settlement_adjustments, reconciliation_runs |
| 0062_phase3_1_hardening.sql | 1 | reconciliation_runs |
| 0064_email_identity.sql | 1 | users |
| 0066_device_trust_credential.sql | 2 | public.users, public.sessions |
| 0072_carrier_webhook_credential_scoping.sql | 1 | carrier_credentials |
| 0075_payment_proof_upload_intents.sql | 1 | payment_records |

The 35 zero-reference migrations are: 0002, 0013, 0015, 0016, 0018, 0019, 0020, 0021, 0027, 0029, 0030, 0032, 0033, 0035, 0036, 0039, 0044, 0045, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0063, 0065, 0067, 0068, 0069, 0070, 0071, 0073, 0074.

### Interpretation and remaining work

- The 183 count is a static count of explicit REFERENCES clauses, not a count of distinct constraints after deduplication or a live pg_constraint count.
- The list must be reconciled with Drizzle declarations, later ALTER TABLE changes, partition children, and the protected staging pg_constraint/pg_attribute snapshot.
- Individually valid FKs do not enforce cross-column consistency (e.g. org/store, config/credential/store, settlement/payment/order/store, refund/payment/order, delivery-zone/method/store, driver/store, reconciliation org vs parent). Those require composite constraints or atomic service checks with tests; no policy decision is implied.
- No live database query was performed. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Cross-column ownership consistency review — 24 November 2026

**Source baseline:** `f21dbe4aca75ba04e9173b1fc28a9591829af554`; implementation follow-ups: `01b6e6c729c1a458f20aaeaed043df4c569119e4` and `fa2547997c4b4dad490b582f92c9a69b8c01ed8f`. This is source-level evidence only; it is not a live catalog/data audit or an approved RLS policy.

The schema defines several independent foreign keys but does not encode the cross-column owner relationships. The following service-level invariants were reviewed and hardened:

| Relationship | Required invariant | Source behavior / disposition |
| --- | --- | --- |
| `carrier_configurations` → credential/store/org | `carrier_credentials.org_id = carrier_configurations.org_id`; when `store_id` is set, `stores.org_id = carrier_configurations.org_id`; the selected credential must remain active and organization-bound. | `CarrierConfigurationsService.create` verifies both organization relationships; `resolveForStore` constrains the requested store to the organization and validates the active credential by credential ID + organization. Update does not mutate the relationship columns. The database has separate FKs, not a composite same-org constraint. |
| `return_requests` → payment/order | `payment_records.order_id = return_requests.sub_order_id`. | The return-creation path resolves the payment for the selected sub-order. Commission reversal now independently rejects a return whose payment record belongs to a different order. |
| `return_request_items` → return/order item | Every `order_items.id` referenced by a return item must have `order_items.order_id = return_requests.sub_order_id`. | Commission reversal now constrains the order-item query by both the selected IDs and the return's sub-order, and fails closed if any referenced item is absent from that order. The two independent FKs alone do not prove this relationship. |
| `settlement_records` → sub-order/payment/store | `payment_records.order_id = settlement_records.sub_order_id` and `orders.store_id = settlement_records.merchant_store_id`. | Settlement-adjustment posting now verifies the selected primary settlement's payment record belongs to the adjustment sub-order, in addition to the existing store equality check. Commission reversal selects only a non-adjustment settlement matching the exact sub-order, payment record and merchant store. |
| `settlement_adjustments` → sub-order/org/return | `org_id` must equal the organization derived from `sub_order_id → orders.store_id → stores.org_id`; optional `return_request_id` must point to a return for the same sub-order. | Creation now always derives the authoritative organization, rejects a supplied mismatching org, rejects a missing sub-order owner, and checks the optional return's parent sub-order before inserting. This prevents creation of an adjustment that would subsequently fail its own organization-scoped readback. |
| `commission_reversals` → return/org/settlement | `org_id` is derived from the return sub-order's store; optional caller org is an assertion, not an override. Payment, order items and settlement must all resolve to the same return sub-order and store. | Commission reversal now validates payment/order equality, derives and checks the organization, constrains return items to the parent sub-order, and binds its optional settlement to the same payment/store while excluding adjustment ledger rows. |

### Regression cases required before verification

Add/retain automated coverage for: mismatching supplied org on adjustment creation; return ID belonging to another sub-order; adjustment posting against a settlement whose payment belongs to another order; return payment/order mismatch; foreign-order return item; commission-reversal org mismatch; and settlement selection that excludes another payment, store or ADJUSTMENT ledger row. These cases have **not** been executed in this implementation session. No live rows were inspected or changed.

### Remaining cross-column review

The source pass above does not close the full matrix. Driver/store assignment organization consistency, reconciliation run/discrepancy organization inheritance, all remaining order/payment/refund/settlement and carrier/shipment relationships, migration-defined FK reconciliation against the Drizzle declarations, and protected staging `pg_constraint` evidence remain open. The 183 migration REFERENCES scan remains static evidence only; the historical 114/116 relation counts remain unresolved pending the authorized read-only catalog snapshot.
