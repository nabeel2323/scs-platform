# Public Database Table Access Classification — 19 November 2026

**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Finding:** G-002 — database privileges and RLS architecture  
**Database:** Shared Supabase PostgreSQL project `wplsxxevoevzqbgtpctw`  
**Evidence:** Read-only PostgreSQL catalog queries and Supabase table inventory on 19 November 2026  
**Mutation performed:** None

## Executive result

The live public-schema inventory contains **114 relations**: 1 partitioned parent, 12 monthly analytics partitions, 1 default analytics partition, and 100 ordinary tables. All 114 currently have RLS disabled and no policies exist in `pg_policies`. No views, materialized views or foreign tables were returned by the public-schema relation inventory query.

The classification below is a **source-informed access-intent classification**, not a claim that the required row-level policies have been implemented. The application uses the NestJS API and direct node-postgres/Drizzle access as its primary data path; the browser/mobile clients use the SCS API. Therefore no public-schema table is currently approved for direct browser/mobile Supabase Data API CRUD. Buyer-facing catalog visibility is an API-level read contract, not a direct table grant.

## Classification rules

| Class | Intended access boundary | Required authorization |
|---|---|---|
| Migration metadata | Migration runner only | Dedicated migration identity; never client-accessible |
| Identity and authorization | Internal API/authentication services only | User/session ownership, organization membership, platform staff policy |
| Merchant organization and onboarding | Authenticated API only | Active organization and store membership; document/verification permissions |
| Catalog and merchandising | API-mediated buyer read of approved/published fields; merchant/admin writes | Published-state visibility plus owning-organization/store membership for private states and mutations |
| Catalog ingestion and moderation | API/admin/merchant workflow only | Job/request owner, organization/store membership, explicit moderation permissions |
| Inventory | API/worker only | Warehouse → store → organization and active store membership |
| Pricing and promotions | API only | Offer/list ownership, buyer eligibility, quantity and promotion rules |
| Buyer commerce and orders | API only | Buyer ownership, fulfilling-store organization, platform staff policy |
| Communications and user preferences | API only | User/participant ownership; device-token and notification data remain private |
| Payments, disputes and financial operations | API/admin/worker only | Buyer/order/store organization scope, approval permissions and immutable audit trail |
| Fulfillment and returns | API/carrier/worker only | Shipment/store/organization, assigned driver, carrier credential and return ownership |
| Platform operations and audit | Internal API/worker/admin only | Explicit operational permission; no merchant/buyer direct access |
| Analytics | Internal ingestion and authorized aggregate/report APIs | Tenant and privacy filtering; raw events not client-accessible |

**Important:** these classes describe intended application access. They do not create PostgreSQL grants or RLS policies. Exact per-table row predicates and the runtime database role must be verified before DDL is designed.

## Complete live inventory

Every listed relation is currently in `public`, has RLS disabled, and has no row-level policy. Direct browser/mobile access is **not approved** for any relation.

### Migration metadata — 1 relation

- `_migration_log` — migration runner only.

### Identity and authorization — 11 relations

- `account_link_log`
- `bootstrap_authorizations`
- `credential_audit_log`
- `device_credentials`
- `organization_members`
- `organizations`
- `permissions`
- `role_permissions`
- `roles`
- `sessions`
- `users`

### Merchant organization and onboarding — 7 relations

- `business_documents`
- `organization_update_requests`
- `saved_suppliers`
- `store_members`
- `stores`
- `verification_requests`
- `warehouses`

### Catalog and merchandising — 16 relations

- `attribute_definitions`
- `attribute_groups`
- `attribute_options`
- `brands`
- `categories`
- `merchant_offers`
- `product_attribute_values`
- `product_media`
- `product_moderation`
- `product_offer_review_state`
- `product_sources`
- `product_type_attributes`
- `product_types`
- `product_variants`
- `products`
- `variant_attribute_values`

### Catalog ingestion and moderation — 5 relations

- `catalog_import_errors`
- `catalog_imports`
- `catalog_requests`
- `import_job_chunks`
- `import_jobs`

### Inventory — 2 relations

- `inventory_items`
- `stock_movements`

### Pricing and promotions — 4 relations

- `price_lists`
- `price_tiers`
- `promotion_redemptions`
- `promotions`

### Buyer commerce and orders — 11 relations

- `cart_items`
- `carts`
- `favorites`
- `master_orders`
- `order_financial_breakdown`
- `order_items`
- `order_status_history`
- `orders`
- `reviews`
- `search_queries`
- `trust_snapshots`

### Communications and user preferences — 5 relations

- `conversations`
- `device_tokens`
- `messages`
- `notification_preferences`
- `notifications`

### Payments, disputes and financial operations — 11 relations

- `commission_reversals`
- `dispute_events`
- `disputes`
- `payment_events`
- `payment_records`
- `reconciliation_discrepancies`
- `reconciliation_runs`
- `refunds`
- `settlement_adjustment_approvals`
- `settlement_adjustments`
- `settlement_records`

### Fulfillment and returns — 18 relations

- `business_calendar_audit`
- `business_calendar_holidays`
- `business_calendars`
- `carrier_configurations`
- `carrier_credentials`
- `carrier_webhook_events`
- `delivery_proofs`
- `delivery_zone_methods`
- `delivery_zones`
- `driver_profiles`
- `driver_store_assignments`
- `return_request_events`
- `return_request_items`
- `return_requests`
- `shipment_events`
- `shipment_labels`
- `shipments`
- `shipping_methods`

### Platform operations and audit — 9 relations

- `audit_logs`
- `backfill_errors`
- `feature_flags`
- `ops_alerts`
- `ops_control_audit`
- `ops_controls`
- `outbox_events`
- `p13_pilot_allowlist`
- `worker_leases`

### Analytics — 14 relations

- `analytics_events` — partitioned parent.
- `analytics_events_default` — default partition.
- `analytics_events_p20260101`
- `analytics_events_p20260201`
- `analytics_events_p20260301`
- `analytics_events_p20260401`
- `analytics_events_p20260501`
- `analytics_events_p20260601`
- `analytics_events_p20260701`
- `analytics_events_p20260801`
- `analytics_events_p20260901`
- `analytics_events_p20261001`
- `analytics_events_p20261101`
- `analytics_events_p20261201`

## Live access facts

- Public relations: 114.
- RLS enabled: 0.
- RLS forced: 0.
- Policies in `pg_policies` for `public`: 0.
- Public views/materialized views/foreign tables in the inspected relation query: 0.
- `anon`, `authenticated` and `service_role`: no effective SELECT/INSERT/UPDATE/DELETE privileges on these 114 tables.
- Those three roles do retain TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on all 114 tables.
- The `authenticator` role is a member of `anon`, `authenticated` and `service_role`; PostgREST role switching therefore makes the effective grants and RLS state relevant even though the direct login role differs.
- The connected inspection session is `postgres` with BYPASSRLS. It is not evidence of the Render API or migration identity.

## Design implications and required controls

1. Keep all 114 tables private to the SCS API and trusted operational processes. Do not grant browser/mobile clients direct table CRUD as a shortcut for UI functionality.
2. Keep buyer-visible catalog reads behind API queries that explicitly filter published/active products, variants, offers and safe fields. The catalog tables are not globally public database resources.
3. Remove unnecessary client-role TRUNCATE, REFERENCES, TRIGGER and MAINTAIN privileges only after reviewing the migration role and Supabase-managed default ACL ownership. The current migration 0070 does not address every role/default-ACL owner.
4. Do not apply blanket `ENABLE ROW LEVEL SECURITY` until the API runtime role is known. A BYPASSRLS role will bypass policies; a non-BYPASSRLS role will be denied by default because there are currently no policies.
5. A genuine tenant-aware RLS design requires request-scoped database context to be established transaction-locally and safely for every query path, including background workers, cron/queue handlers and raw SQL. The current shared-pool Drizzle architecture must be audited for transaction coverage and context leakage before selecting that design.
6. Never use client-editable JWT user metadata as an authorization source. If policies use a trusted app claim, establish how it is signed, refreshed, validated and mapped to SCS organization/store membership.
7. Separate the migration owner from the runtime API role. The migration identity may own objects and perform DDL; the API identity should receive only the table/sequence/function privileges needed at runtime. Avoid giving the runtime role superuser or BYPASSRLS solely to make migrations work.
8. Test the proposed role model on isolated PostgreSQL with two tenants, buyer/merchant/staff/admin contexts, pooled connection reuse, concurrent requests, worker context and negative cross-tenant reads/writes before a staging change is considered.

## Remaining evidence gaps

- The Render API `DATABASE_URL` effective/login role has not been captured.
- The staging migration `STAGING_DATABASE_URL` effective/login role has not been captured.
- The GitHub workflow is `workflow_dispatch` only and must be run from the default branch; the current GitHub connector does not expose a workflow-dispatch action.
- The Render connector does not expose environment-variable values or their usernames. Do not retrieve or print secrets.
- Supabase Data API exposed-schema configuration was not independently confirmed in this pass.
- The intended tenant key/ownership path and exact policy predicate must still be mapped per table against the application schema and service queries. The domain grouping above is not a substitute for this predicate review.

## Decision

**P1-07: PARTIAL — live inventory and domain/access-intent classification complete; exact per-table row ownership and policy predicates remain open.**

**P1-06: PARTIAL — source-level connection paths identified; effective API and migration roles remain unverified.**

**P1-09: BLOCKED — do not draft production RLS policies or apply migrations until role identity and transaction-scoped tenant context are proven.**

No live grants, RLS settings, policies, migrations, data or deployments were changed.
