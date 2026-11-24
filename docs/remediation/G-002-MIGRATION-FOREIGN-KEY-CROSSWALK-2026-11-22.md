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
| 0059_return_requests.sql                | refunds.dispute_id                                      | disputes.id ON DELETE SET NULL              | Deferred refund-to-dispute relationship; keep migration-owned to avoid a payments/support/returns module cycle |
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


## Reconciliation parent-scope hardening and driver assignment disposition — 24 November 2026

**Source commit:** `98843bfe455667f7a96d7cbdd6dfb2253ce2af0f`.

### Reconciliation run/discrepancy relationship

The Drizzle schema gives `reconciliation_discrepancies.run_id` an FK to `reconciliation_runs.id`, while each table independently stores nullable `org_id` without an organization FK. The writer already stamps each run and its discrepancy rows from the same resolved `tenantId`. The service now adds fail-closed checks around that intended denormalized invariant:

- A non-null requested organization must exist before a reconciliation run is created.
- `getReconciliationRun` loads all children for the selected run and rejects the read if any child `org_id` differs from the parent run's `org_id`; it no longer silently hides a mismatched child through a second organization filter.
- `resolveDiscrepancy` verifies that the parent run exists and that its `org_id` equals the discrepancy's `org_id`, as well as the requested organization scope, before updating the discrepancy.

These are service checks, not a composite FK or live-data proof. Global platform reconciliation intentionally uses a null run scope and writes null scope to its child discrepancies; tenant-scoped runs use the active organization scope.

### Driver/store assignment relationship

The inspected `shipping.schema.ts` declares `driver_profiles.org_id → organizations.id` and `driver_store_assignments.driver_profile_id → driver_profiles.id` plus `store_id → stores.id`. There is no composite constraint tying `driver_profiles.org_id` to `stores.org_id`. The separate `shipments.assigned_driver_id` currently references `users.id`, not `driver_profiles.id`. The inspected `ShippingModule` and `ShipmentOperationsController` do not expose a driver/store assignment mutation path; the shipment list/detail only reads `assignedDriverId`. Therefore no assignment-path guard is claimed. The table's actual consumers and any assignment write path remain to be located before implementation or policy decisions.

### Additional regression cases required

- Unknown non-null organization is rejected before a reconciliation run is inserted.
- A run read fails closed when any child discrepancy has a different `org_id`.
- Resolving a discrepancy fails closed when its parent run is missing or has a different `org_id`.
- Driver profile/store assignment rejects cross-organization assignment if/when a real write path is located; no speculative endpoint was added.

No tests or live database queries were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Refund/payment/order consistency follow-up — 24 November 2026

**Source commit:** `e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d`.

The `refunds` table has independent FKs to `payment_records` and `orders`; those FKs do not prove `refunds.order_id = payment_records.order_id`. The request path writes the order ID and currency from the locked payment, and failed/retry transitions already validate payment/order/currency. The review found the approval path did not repeat that check, and idempotent request recovery did not compare the stored order/currency. The source now:

- Rejects an idempotent refund replay when the stored refund order or currency differs from the locked payment.
- Applies the same order/currency checks to the concurrent idempotency-conflict recovery path.
- Rejects approval before state changes if the locked refund's order or currency does not match its locked payment.

The return-refund flow already checks the return/payment/order/refund/buyer/currency links under locks before marking a return REFUNDED. The new payment-service guard closes the corresponding standalone refund approval path. These checks supplement independent FKs; no schema or migration was changed.

Add regression coverage for mismatched `refunds.order_id` or currency on idempotent replay, concurrent key recovery, and approval; each must fail without changing refund/payment state or emitting events/outbox rows. Tests remain unexecuted. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Shipment order/store ownership hardening — 24 November 2026

**Source commits:** `b1e5490401d9602205d46351ee4eaf1ab2db7d30`, `02edaa89d75b06e6c8a4170cc306662965d8fd30`, and `15d328c952dfd0805a9eee00374c6ad74ed1d6a1`.

The `shipments` table has independent FKs to `orders.id` and `stores.id`; those FKs do not enforce `orders.store_id = shipments.store_id`. The source now checks that relationship at three boundaries:

- `OrdersService.createShipment` rejects a missing order or a supplied store that differs from the persisted sub-order store before inserting a shipment.
- `ShipmentOperationsController.assertShipmentAccessible` resolves both parent rows and returns not-found if the order is absent or belongs to a different store. This check runs before the platform-privileged bypass as well as merchant organization checks, preventing shipment detail from exposing an unrelated order.
- `ShippingCarrierWorker.assertOutboxTenantMatchesShipment` verifies the shipment's order/store relationship in the shipment's owning organization context before carrier provider operations and webhook retry processing.

Regression cases: shipment creation with a mismatched store creates no shipment; merchant and privileged shipment detail both fail closed on an order/store mismatch; carrier create/cancel/label/track and webhook retry perform no provider/storage side effect for a mismatched order/store pair. Tests remain unexecuted. No migration or schema change was made.


## Shipment read-path completeness follow-up — 24 November 2026

**Source commit:** `56d605a7377c49766b990abfc023e6ae4a5cea1d`.

The first shipment/order/store fix covered shipment detail authorization and the carrier worker. A second callsite pass found additional order-owned and driver-facing reads. The source now:

- Validates the order/store relationship before driver or privileged bypass in `OrdersService.assertShipmentAccessibleForException`.
- Makes `getShipmentByOrderId` resolve the authoritative order store and fail closed if the shipment store differs.
- Makes `listDriverShipments` inner-join orders on both order ID and same store before returning shipment records.
- The prior `ShipmentOperationsController.listShipments` change adds the same-store join predicate for merchant and platform lists and applies the join to the count query.

The regression matrix must also cover shipment exception/RTS operations for driver and platform roles, buyer/order shipment lookup, and driver shipment listing when order/store are inconsistent. No tests were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Carrier administration, webhook and tracking read/write paths — 24 November 2026

**Source commits:**
- `0581776dc42e87e4206377b45c971612368ab0ef` — direct create/cancel reconciliation guards.
- `83a4073c20d14519f9c9f02757bd2386bbe9de58` — admin recovery and recovery queue.
- `2b2810e14e41f40023e610dcda9e9064fb846e9c` — carrier webhook shipment resolution.
- `5bbd35da8f3f04c132d12f773192de0a4a27fad8` — scheduled reconciliation claim predicates.
- `9c9d7f479ae332e6760238c7a9789f9e56febbea` — carrier tracking poller.

The independent `shipments.order_id` and `shipments.store_id` FKs are now checked at the remaining inspected carrier paths:

- Admin recovery resolves both the store and order and rejects a mismatched pair before tenant checks or privileged-role bypass. The recovery queue joins orders on both order ID and store ID, so malformed rows are not presented as actionable recovery candidates.
- Both create and cancel reconciliation claim queries require an existing order whose `store_id` equals the shipment store. The public/direct `reconcileShipment` and `reconcileCancelShipment` entry points independently re-check the relationship before provider calls, so callers cannot bypass the SQL claim predicate.
- Carrier webhook resolution now joins shipments to orders on both IDs and same-store ownership before a credential-scoped shipment can be linked to the authenticated webhook event.
- The tracking poller's claim query excludes inconsistent pairs, and its per-shipment method repeats the order/store check before provider tracking, event persistence, or the delivery bridge.

### Driver/store assignment ownership — source-path correction, 24 November 2026

The earlier ShippingModule-only review missed the existing shipment assignment path in `OrdersController` / `OrdersService.assignDriver`. The route `POST /orders/:id/assign-driver` writes `shipments.assigned_driver_id` (a FK to `users.id`), but previously accepted an arbitrary user ID without checking the driver's profile or store eligibility.

The migration 0041 comment is a binding compatibility rule: a driver with **zero** `driver_store_assignments` rows is eligible for every store in that driver's organization ("unrestricted mode"). Once one or more rows exist, the driver is eligible only for stores represented by those rows. Do not turn this into a mandatory assignment-row requirement.

The source now validates eligibility in `ShippingService.assertDriverEligibleForStore` before the OrdersService assignment writes:

- The target store must resolve to an organization.
- The target user must have an active `driver_profiles` row whose `org_id` equals the store's `org_id`.
- The user account must be ACTIVE and have an ACTIVE organization membership with the DRIVER role in that same organization.
- If the driver has no explicit store-assignment rows, the migration's unrestricted-within-org behavior is preserved. If rows exist, the target store must be among them.
- The eligibility check runs before the optimistic order transition, shipment update, event/history writes and outbox publication. Missing ShippingService validation fails closed.

No writer/controller for managing `driver_store_assignments` itself was found. This is not a reason to invent a new endpoint or redefine `shipments.assigned_driver_id`; the optional allowlist remains an existing provisioning/data-management concern. Any future writer must preserve profile-org/store-org equality and the documented zero-row behavior. No composite FK or migration was added.

Regression source added (not executed): `apps/api/src/__tests__/unit/shipping/shipping-tenant-context.spec.ts`, `apps/api/src/__tests__/unit/orders/driver-assignment-eligibility.spec.ts`, and the disposable-PostgreSQL `apps/api/src/__tests__/integration/m722-shipping.postgres.spec.ts`. Coverage includes unrestricted mode, explicit store allowlisting, cross-org denial, inactive profile/user/membership/role rejection, and no order/shipment mutation when eligibility fails.

### Additional regression cases required

- Unknown non-null organization is rejected before a reconciliation run is inserted.
- A run read fails closed when any child discrepancy has a different `org_id`.
- Resolving a discrepancy fails closed when its parent run is missing or has a different `org_id`.
- Confirm through the consolidated disposable-PostgreSQL campaign that driver assignment rejects cross-organization profiles and respects the migration 0041 zero-row/explicit-row semantics.

These are source-level guards and authored regression cases only. No tests or live database queries were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

## Persisted webhook credential-to-shipment lineage — 24 November 2026

**Source commit:** `926c475fb9c59ffa1688dccee3d4f9dfbeea59e2`.

A final webhook retry pass found that the unlinked-event retry path revalidated the bound credential, but the already-linked path loaded the shipment and checked its store/order without comparing that store's organization to the event's bound credential organization. The retry worker now loads and validates the bound credential for every unprocessed event, including already-linked events; rejects missing/inactive credentials and provider-key mismatch; and, when credential-bound, requires the linked shipment's owning store organization to equal the credential organization before marking the event processed. Unlinked events still require a credential binding before attempting shipment resolution. Already-linked legacy rows with a null credential remain compatible, but still pass the shipment/order/store integrity guard and derive the active org from the shipment store.

Regression cases: a linked event bound to Org A but linked to an Org B shipment is rejected without marking processed; inactive/deleted credentials and provider-key mismatch are rejected; an unlinked legacy event without a credential is non-retryable; a valid credential-bound event can retry only within its organization. Tests remain unexecuted. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Driver assignment path and store-eligibility correction — 24 November 2026

**Source commits:** `9d461e1c25381d4528fc733059ee58afb320fa6b`, `fca4c3569976fd6e5a8b9db767e876f8f449c367`, and formatting follow-up `efa6349651b7f2b5083475e4bdaa9104ee3402cc`.

A broader Orders callsite review located the existing `POST /orders/:id/assign-driver` path. The service now validates an active driver profile, active user, active DRIVER organization membership and profile/store organization equality before writing `shipments.assigned_driver_id`. It also honors migration 0041's compatibility semantics: no explicit assignment rows means unrestricted eligibility within the profile organization; once rows exist, only listed stores are eligible. Missing eligibility infrastructure fails closed before any fulfillment write.

No driver-store assignment CRUD endpoint, schema change, composite FK or migration was introduced. Regression tests were authored for the helper, pre-write fail-closed behavior and disposable PostgreSQL unrestricted/restricted cases. They remain unexecuted under the implementation-first restriction. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Drizzle declaration parity — complete source-level comparison (24 November 2026)

This pass inspected all **25 module schema files** containing the **100 `pgTable` declarations** (98 re-exported by `apps/api/src/drizzle/schema.ts`; the two catalog-import tables remain defined outside that barrel). The source contains **178 Drizzle `.references()` declarations** across those files.

The prior 75-migration static scan reported **183 textual `REFERENCES` matches across 40 numbered SQL files**. Reconciling the source and SQL evidence accounts for the five-match difference:

| Difference | Count | Reconciliation |
| --- | ---: | --- |
| Genuine migration-owned FKs intentionally not modeled with Drizzle `.references()` | 3 | Listed below; keep migration-owned to preserve module dependency direction |
| Conditional duplicate reference in migration 0061 | 1 | `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS return_request_id UUID REFERENCES return_requests(id)` is a no-op on the ordered migration path because migration 0059 already created that column and its named FK |
| Comment-only match in migration 0070 | 1 | The word `REFERENCES` appears in the migration's privilege-hardening comment, not in an executable FK declaration |
| **Total textual difference** | **5** | **183 − 1 comment − 1 conditional no-op = 181 effective source FK declarations; 178 Drizzle + 3 intentional migration-owned** |

### The three intentional migration-owned relationships

| Table/column | Migration-defined target | Why it remains migration-owned |
| --- | --- | --- |
| `products.product_type_id` | `product_types.id ON DELETE SET NULL` (0025) | `catalog.taxonomy.schema.ts` imports catalog products; importing `productTypes` back into `catalog.schema.ts` would reverse the established taxonomy → catalog dependency and create a module initialization cycle. The column comment in `catalog.schema.ts` already records this design. |
| `refunds.return_request_id` | `return_requests.id ON DELETE SET NULL` (0059) | `returns.schema.ts` imports payments. A reverse payments → returns import would create a cycle. |
| `refunds.dispute_id` | `disputes.id ON DELETE SET NULL` (0059) | Support imports returns, and returns imports payments. A payments → support import would close a cycle. |

### Previously corrected parity gaps

The following links are now expressed in Drizzle with the migration's nullable / `ON DELETE SET NULL` semantics: `return_requests.refund_id → refunds.id`, `return_request_items.inventory_item_id → inventory_items.id`, and `disputes.return_request_id → return_requests.id`. Migration 0062's `reconciliation_runs.superseded_by` self-reference is also represented using a typed lazy Drizzle reference. The two payment-owned links above remain plain UUID columns with an explicit cycle rationale in `payments.schema.ts`.

The nullable financial `org_id` columns on `commission_reversals`, `settlement_adjustments`, `reconciliation_runs` and `reconciliation_discrepancies` are application-maintained tenant metadata, not missing organization FKs. Do not synthesize an organizations FK; derive and validate them against canonical financial/order/store parents.

### Evidence boundary and remaining work

This is a **source-level reconciliation** of the current 25 schema modules against the numbered migration source inventory and targeted migration SQL inspection. It does not prove that constraints are present in any deployed database, validate existing rows, or authorize schema/RLS/grant changes. The protected read-only PostgreSQL catalog remains authoritative for deployed state. Cross-column relationships (store/org, offer/product/variant, payment/order/store, return/payment/order, carrier credential/org/store, and others) still require operation-level ownership checks; individual FKs do not enforce those equalities.

No database was queried, no migration or schema DDL was changed, and no tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
