# G-002 — Migration Foreign-Key and Ownership Crosswalk

**Review date:** 22 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Source baseline:** `933e2900eda662fbfd5148bf23a839357651910f`  
**Status:** Partial static migration crosswalk; no live catalog verification and no policy approval.

## Why this document exists

The Drizzle schema review is not sufficient to establish database ownership. Several constraints are added later by SQL migrations, some relationships are deferred until both parent tables exist, and some columns used for tenant scoping deliberately have no FK to organizations. This crosswalk records only relationships explicitly found in the reviewed migrations.

It is not an exhaustive FK catalog. The final authority for deployed constraints is the protected read-only PostgreSQL catalog snapshot, which has not been refreshed in this work session. Migration history may also differ from the connected staging database.

## Verified migration-defined relationships

| Migration | Table/column | Target | Ownership implication |
|---|---|---|---|
| 0054_store_members.sql | store_members.store_id | stores.id ON DELETE CASCADE | Membership row inherits store/org boundary through store |
| 0054_store_members.sql | store_members.user_id | users.id ON DELETE CASCADE | User is member identity, not the tenant owner |
| 0034_catalog_imports.sql | catalog_imports.uploaded_by | users.id | Platform-level admin import; uploader attribution does not make it a user-private import |
| 0034_catalog_imports.sql | catalog_import_errors.import_id | catalog_imports.id ON DELETE CASCADE | Error rows inherit platform import scope |
| 0043_carrier_integration.sql | carrier_credentials.org_id | organizations.id | Credential row is organization-owned |
| 0043_carrier_integration.sql | carrier_configurations.org_id | organizations.id | Configuration has organization scope |
| 0043_carrier_integration.sql | carrier_configurations.credential_id | carrier_credentials.id | Credential/configuration must be same-org; no composite FK was observed |
| 0043_carrier_integration.sql | carrier_configurations.store_id | stores.id | Optional store override; verify store.org_id equals configuration.org_id in service/policy |
| 0058_payment_financial_architecture.sql | payment_records.order_id | orders.id ON DELETE CASCADE | Payment inherits order/suborder participant boundary |
| 0058_payment_financial_architecture.sql | payment_records.verified_by | users.id | Verifier is actor attribution |
| 0058_payment_financial_architecture.sql | payment_events.payment_record_id | payment_records.id ON DELETE CASCADE | Event inherits payment/order boundary |
| 0058_payment_financial_architecture.sql | payment_events.actor_id | users.id | Actor attribution |
| 0058_payment_financial_architecture.sql | refunds.payment_record_id | payment_records.id ON DELETE CASCADE | Refund inherits payment/order boundary |
| 0058_payment_financial_architecture.sql | refunds.order_id | orders.id ON DELETE CASCADE | Explicit order ownership path; must agree with payment_record.order_id |
| 0058_payment_financial_architecture.sql | refunds.requested_by / approved_by | users.id | Actor attribution, not ownership |
| 0058_payment_financial_architecture.sql | settlement_records.sub_order_id | orders.id ON DELETE CASCADE | Merchant suborder boundary |
| 0058_payment_financial_architecture.sql | settlement_records.payment_record_id | payment_records.id ON DELETE CASCADE | Payment lineage |
| 0058_payment_financial_architecture.sql | settlement_records.merchant_store_id | stores.id ON DELETE CASCADE | Store boundary; verify store matches suborder store |
| 0059_return_requests.sql | return_requests.sub_order_id | orders.id ON DELETE CASCADE | Return inherits suborder/store boundary |
| 0059_return_requests.sql | return_requests.payment_record_id | payment_records.id ON DELETE CASCADE | Payment lineage must match suborder |
| 0059_return_requests.sql | return_requests.buyer_id | users.id | Buyer is an explicit participant |
| 0059_return_requests.sql | return_requests.inspected_by | users.id | Actor attribution |
| 0059_return_requests.sql | return_request_items.return_request_id | return_requests.id ON DELETE CASCADE | Parent return boundary |
| 0059_return_requests.sql | return_request_items.order_item_id | order_items.id ON DELETE CASCADE | Order-item lineage must match the same parent order |
| 0059_return_requests.sql | return_request_events.return_request_id | return_requests.id ON DELETE CASCADE | Parent return boundary |
| 0059_return_requests.sql | return_request_events.actor_id | users.id | Actor attribution |
| 0059_return_requests.sql | refunds.return_request_id | return_requests.id ON DELETE SET NULL | Deferred refund-to-return relationship |
| 0059_return_requests.sql | disputes.return_request_id | return_requests.id ON DELETE SET NULL | Deferred dispute-to-return relationship |
| 0059_return_requests.sql | return_request_items.inventory_item_id | inventory_items.id ON DELETE SET NULL | Inventory item linkage added after inspection |
| 0059_return_requests.sql | return_requests.refund_id | refunds.id ON DELETE SET NULL | Deferred reverse link; avoid assuming one-way lineage |
| 0061_phase3_financial_correctness.sql | commission_reversals.return_request_id | return_requests.id ON DELETE CASCADE | Reversal inherits return/order/store boundary |
| 0061_phase3_financial_correctness.sql | commission_reversals.refund_id | refunds.id | Refund lineage |
| 0061_phase3_financial_correctness.sql | commission_reversals.settlement_id | settlement_records.id | Settlement lineage |
| 0061_phase3_financial_correctness.sql | commission_reversals.created_by | users.id | Actor attribution |
| 0061_phase3_financial_correctness.sql | settlement_adjustments.settlement_id | settlement_records.id | Settlement lineage |
| 0061_phase3_financial_correctness.sql | settlement_adjustments.sub_order_id | orders.id ON DELETE CASCADE | Suborder/store boundary |
| 0061_phase3_financial_correctness.sql | settlement_adjustments.return_request_id | return_requests.id | Optional return lineage |
| 0061_phase3_financial_correctness.sql | settlement_adjustments.created_by | users.id | Actor attribution |
| 0061_phase3_financial_correctness.sql | settlement_adjustment_approvals.adjustment_id | settlement_adjustments.id ON DELETE CASCADE | Approval inherits adjustment boundary |
| 0061_phase3_financial_correctness.sql | settlement_adjustment_approvals.approver_id | users.id | Approver attribution; approval authority is separately permission-gated |
| 0061_phase3_financial_correctness.sql | reconciliation_runs.executed_by | users.id | Executor attribution |
| 0061_phase3_financial_correctness.sql | reconciliation_discrepancies.run_id | reconciliation_runs.id ON DELETE CASCADE | Discrepancy inherits run scope |
| 0061_phase3_financial_correctness.sql | reconciliation_discrepancies.resolved_by | users.id | Resolver attribution |
| 0062_phase3_1_hardening.sql | reconciliation_runs.superseded_by | reconciliation_runs.id | Run version lineage |
| 0071_auto_complete_claim_leases.sql | No FK added; orders claim timestamp/worker columns only | — | Claim owner is worker ID, not user or tenant identity |

## Important columns with no organization FK

Migration 0062 adds nullable org_id columns to reconciliation_runs, settlement_adjustments, commission_reversals and reconciliation_discrepancies, but does **not** add foreign keys to organizations. Those columns are application-maintained tenant-scope metadata. Before relying on them in RLS, prove that every writer derives the value from the canonical order/store/return parent and that it cannot disagree with that parent.

Migration 0063 creates several system tables without tenant/user FKs:

| Table | Columns | Migration intent / consequence |
|---|---|---|
| worker_leases | lease_key, holder_id, holder_host, holder_pid, epoch | Infrastructure lease, explicitly no FK to users/orgs |
| ops_controls | control_key, updated_by | Global pause/kill-switch control; updated_by has no FK |
| ops_control_audit | actor_id, actor_kind | Global append-only control history; actor_id has no FK |
| ops_alerts | optional org_id, resource_type, resource_id | Operational alerts; org_id/resource_id are metadata without FKs |
| p13_pilot_allowlist | org_id, optional store_id, created_by | Operator-managed allowlist; org/store/user columns have no FKs |
| feature_flags | updated_by | Platform feature-flag attribution; no FK added |

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
