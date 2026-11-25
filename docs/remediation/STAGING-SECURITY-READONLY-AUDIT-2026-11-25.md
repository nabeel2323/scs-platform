# Staging security and deployment read-only audit

**Date:** 25 November 2026  
**Scope:** Connected Supabase staging database, live Render staging API service, current `develop` source, and relevant release/worker code.  
**Mode:** Read-only. No SQL writes, migrations, grants, RLS changes, role changes, service-setting changes, worker activation, deployment, restart, or business workflow was performed.

## Executive summary

The staging database is not ready for blanket RLS activation. All 114 public table relations have RLS disabled, and all are owned by `postgres`. The live API diagnostic reports that the API connects as `postgres`, which has `BYPASSRLS`, `CREATEROLE`, and `CREATEDB`. The existing `anon`, `authenticated`, and `service_role` roles have no effective CRUD privileges on existing public table relations, but each has `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` on all 114 relations. The schema is usable by those roles, and all 32 public functions are executable by `anon` and `authenticated`; none is `SECURITY DEFINER`.

The OTP log-redaction change (PR #152) is already merged and included in the deployed `develop` build. The generic outbox dispatcher is still active in staging and still marks non-carrier events as `DISPATCHED` after a log-only no-op; PR #153 fixes this but is not merged/deployed. The current auto-completion worker is also still the pre-lease implementation; PR #154 adds durable claims but remains unmerged. Render has one API service and no separate worker service.

The handoff's claim that Render runs migrations and seeds at API startup is incorrect for the current source/configuration. Production startup only starts the API. The separate staging release workflow runs migrations, RBAC seed, migration-ledger verification, then deploys the same commit and checks readiness. Manual dispatch is a real mutating release, not a dry run.

## 1. Database inventory and access model

### 1.1 Relations and RLS

Current catalog counts:

| Object | Count |
|---|---:|
| Ordinary public tables | 100 |
| Partitioned parent tables | 1 |
| Public partition children | 13 |
| Total table relations (ordinary + parent + children) | **114** |
| Views / materialized views | 0 |
| Public sequences | 1 |
| Relations with RLS enabled | **0** |
| Relations with FORCE RLS | **0** |

The earlier handoff's 111-table count is stale; the current catalog has 114 table relations. The 13 analytics partitions must be considered explicitly in any future policy/grant design.

### 1.2 Effective table privileges

For each of the 114 public table relations, catalog checks returned:

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `anon` | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| `authenticated` | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| `service_role` | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| `postgres` | 114 | 114 | 114 | 114 | 114 | 114 | 114 | 114 |

The `anon`, `authenticated`, and `service_role` roles have `USAGE` on schema `public` but not `CREATE`. None has privileges on the one public sequence. This means the current snapshot does **not** show direct table CRUD exposure through those roles, but the non-CRUD privileges are still excessive and should be removed deliberately after checking Supabase's platform expectations.

### 1.3 Ownership, roles, and runtime identity

- All 114 public table relations are owned by `postgres`.
- Supabase role flags: `anon` and `authenticated` do not have `BYPASSRLS`; `service_role` does. The `postgres` role is not a superuser but has `BYPASSRLS`, `CREATEROLE`, and `CREATEDB`.
- Render's actual API runtime diagnostic reports `session_user = current_user = postgres`, with `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, and `ssl=false`.
- The API therefore bypasses RLS today. Enabling RLS while leaving this runtime identity unchanged would not provide the intended defense-in-depth.
- Treat `service_role` and any service-role key as server-only; it is a bypass role, not a suitable replacement for a narrowly scoped API login.

### 1.4 Default privileges

Default ACL inspection found:

- Objects created by `postgres` in `public` automatically grant `MAINTAIN`, `REFERENCES`, `TRIGGER`, and `TRUNCATE` to `anon`, `authenticated`, and `service_role`. They do not receive CRUD by this default ACL.
- Objects created by `supabase_admin` in `public` have a broader default ACL that grants CRUD and other table privileges to `anon`, `authenticated`, and `service_role`, plus sequence privileges and function EXECUTE. No existing public table relation is owned by `supabase_admin`; the broader default matters if future objects are created by that role.
- Do not blindly alter Supabase-managed `supabase_admin` defaults. First establish which role creates application objects in each migration path and distinguish platform-managed defaults from application-owned defaults.

### 1.5 Functions and extensions

- 32 functions exist in `public`; all 32 are executable by `anon` and `authenticated`.
- None is marked `SECURITY DEFINER`, which is positive.
- Supabase's security advisor reports `function_search_path_mutable` for `public.normalize_arabic`; the function currently has no function-local `proconfig` search-path setting.
- Supabase's security advisor also reports `pg_trgm` installed in `public`.
- PR #145 contains a narrow `search_path = pg_catalog` hardening migration numbered 0070. It is not applied. PR #138 has a conflicting, much broader migration also numbered 0070 and must not be merged wholesale.
- Supabase's performance advisor reports **55 foreign keys without covering indexes**. Treat this as a separate performance follow-up, not a reason to make immediate schema changes.

### 1.6 Migration ledger

The application's `public._migration_log` contains 69 entries, from `0001_identity.sql` through `0069_organization_onboarding_permission.sql`. No 0070 or 0071 migration is applied. PR #145's 0070 and PR #154's 0071 remain pending code changes; no staging migration was run during this audit.

## 2. Initial table classification for policy design

This is a source/catalog-based classification, not approval to expose any table. The catalog heuristic found 101 base/parent tables (excluding the 13 partition children): 45 have a direct tenant-like key, 41 of the 56 without a direct tenant-like key have a foreign-key path to another public table, and 15 have neither a direct tenant-like key nor a public-table FK. Those groups need table-by-table review; the heuristic is not a substitute for inspecting every FK and workflow.

| Class | Representative tables | Intended posture |
|---|---|---|
| Platform/internal control | `_migration_log`, `outbox_events`, `worker_leases`, `ops_controls`, `ops_control_audit`, `ops_alerts`, `p13_pilot_allowlist`, `backfill_errors`, `bootstrap_authorizations`, `reconciliation_runs`, `reconciliation_discrepancies` | Backend/worker/admin only; never expose directly to browser roles |
| Identity and user-private | `users`, `sessions`, `device_credentials`, `device_tokens`, `account_link_log`, `verification_requests`, `notifications`, `notification_preferences`, `favorites` | Self-scoped or service/admin-only; secrets and credentials strictly backend-only |
| Organization/store tenant data | `organizations`, `organization_members`, `stores`, `store_members`, `business_documents`, `carrier_configurations`, `catalog_imports`, `catalog_import_errors`, `catalog_requests` | Organization/store membership policies; child tables inherit scope through verified FK paths |
| Merchant catalog and offers | `categories`, `products`, `product_variants`, `product_media`, `product_attribute_values`, `merchant_offers`, `price_lists`, `price_tiers`, `inventory_items`, `warehouses` | Merchant-owned writes; buyer reads only through an explicit published/approved product and active-offer policy or curated read surface |
| Orders, shipping, returns, and communication | `carts`, `cart_items`, `orders`, `master_orders`, `order_items`, `shipments`, `shipment_events`, `delivery_proofs`, `return_requests`, `return_request_items`, `conversations`, `messages` | Buyer, merchant-store, assigned-driver, or participant scope through direct keys and FK joins |
| Finance and disputes | `payment_records`, `payment_events`, `refunds`, `disputes`, `commission_reversals`, `settlement_records`, `settlement_adjustments`, `settlement_adjustment_approvals` | Strict backend/finance/admin scope; buyer/merchant access only through narrowly defined API actions and views |
| Shared reference/configuration | `brands`, `attribute_definitions`, `attribute_groups`, `attribute_options`, `product_types`, `product_type_attributes`, `roles`, `permissions`, `role_permissions`, `feature_flags` | Read-only curated access where genuinely needed; roles, permissions, flags and internal configuration remain backend/admin-only |
| Analytics | `analytics_events` and 13 child partitions | User/tenant-scoped; parent and child partition access must be handled explicitly |

Tables without direct tenant keys must not receive a permissive policy by default. Examples include `order_items` via `orders`/offers, `delivery_proofs` via `shipments`, `messages` via `conversations`, `refunds` via orders/payments/returns, and `inventory_items` via variants/warehouses. Root tables such as `organizations`, `stores`, and `users` require membership/self policies rather than a same-row `organization_id` check.

**Current public exposure decision:** no existing table is approved for direct `anon` or `authenticated` CRUD. If buyer-facing catalog access is required, use curated views or the authenticated API over published/approved records rather than granting raw-table access.

## 3. Recommended access-control architecture

Do not enable RLS indiscriminately while the API connects as `postgres`.

1. **Separate runtime and migration identities.** Create a dedicated API login (for example, `scs_api`) with `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`, no table ownership, and only the table/sequence privileges the API actually uses. Keep a separate migration owner/role for DDL. Do not reuse Supabase `service_role` as the API login.
2. **Move the API off `postgres`.** Change the runtime connection secret only through an approved release plan with rollback and connection verification. The release workflow's migration identity remains separate.
3. **Establish transaction-local actor context.** The Nest API issues its own JWTs; do not assume Supabase Auth's `auth.uid()` represents the application user. Set trusted values such as `app.user_id`, `app.organization_id`, `app.store_id`, and actor type with transaction-local `set_config(..., true)` on the same connection/transaction that performs the queries. Never use session-global `SET` on pooled connections.
4. **Refactor request DB access before RLS.** Current services commonly use the shared Drizzle pool directly. RLS context is safe only when every request's queries run through a transaction-aware actor-context wrapper. Audit all query paths, background jobs, cron workers, and raw SQL before switching.
5. **Write table-specific policies.** Use direct tenant columns where present; use verified parent-FK joins for child tables; use user self-scope for identity data; keep platform/financial/worker tables backend-only; handle analytics partitions explicitly. Default-deny when context is missing or invalid.
6. **Allowlist Data API access.** Revoke `TRUNCATE`, `MAINTAIN`, `REFERENCES`, and `TRIGGER` from `anon`, `authenticated`, and `service_role` on existing application relations and correct application-owned default ACLs after role ownership is confirmed. Revoke broad function EXECUTE and allowlist only intentionally public-safe functions. Review platform-managed `supabase_admin` defaults separately.
7. **Separate worker privileges and context.** Workers should use a dedicated worker identity/context and only the tables required for their job. The current in-process workers share the API's privileged pool; do not enable financial or carrier workflows as part of an RLS migration.
8. **Test in an isolated database first.** Cover missing-context denial, cross-user and cross-tenant isolation, buyer/merchant/driver boundaries, parent/child tables, analytics partitions, worker permissions, pool connection reuse, transaction rollback, and attempts to bypass policies. Run full migrations and integration tests on a disposable database before any staging change.

## 4. OTP logging review

PR #152 is already merged and included in the deployed `develop` commit `fde20420bbb759d2e562f9ff747c9e824ac58e25`.

The prior `OtpDeliveryService` success/failure/error log lines included the raw request subject, provider message ID, provider-supplied `errorReason`, and raw exception message. Provider errors can contain recipient details or echoed request content, including an OTP. PR #152 changed success logs to a stable channel-only message, failure logs to channel plus a boolean retryable flag, and exception logs to a sanitized error class. Its regression tests inject an OTP, email, phone, provider message ID, and raw exception content and assert none appears in the captured logs.

The identity service masks email/phone identifiers; the mock provider stores test OTPs in memory and logs only subject type/correlation metadata. The available Render log window from 1–25 November contained 267 OTP-tagged app log entries and 94 OTP-route-related entries; no six-digit values were found in those messages. This only verifies accessible retained logs, not logs outside the available window. Provider-specific success logs still include opaque provider message IDs and correlation IDs; these are not OTP values or full recipients, but can be minimized further if the logging policy classifies them as sensitive identifiers.

### 4.1 HTTP request/response logging credential leak

A separate review of `main.ts` and retained Render request-completion logs found a distinct issue from OTP provider logging:

- The pino-http redaction covers incoming authorization/cookie headers but omits `res.headers["set-cookie"]`.
- Four retained request-completion records contain the `scs_device_trust` Set-Cookie value. The inspected cookie has a 90-day Max-Age. Values are intentionally not reproduced in this report.
- The same request serializer records carrier webhook URL paths containing a credential-like `webhookToken`, as well as `x-carrier-signature` / `x-webhook-signature` headers, device IDs and forwarded client-IP headers, without explicit redaction.
- The device-trust cookie is a remembered-device credential. Treat the historical logged values as potentially compromised until expiry/revocation is confirmed. This may permit OTP bypass after the separate primary authentication step; it is not an access JWT by itself.
- A narrow source fix and Pino-output regression test are in PR #156. It is not merged/deployed and does not erase historical logs or revoke cookies. No credential rotation or revocation was performed.

A read-only count found five active device-trust credentials issued before the latest staging deployment, associated with two users; none is hard-expired. This is an upper-bound revocation scope, not proof that all five values were present in logs. No user IDs, hashes, or cookie values are included here, and no credential was revoked.

The OTP delivery service fix in PR #152 remains valid and separate: no six-digit OTP values were found in the accessible OTP-related log window, but the response-cookie exposure is still a security issue until PR #156 is reviewed, merged and deployed.

## 5. Worker and outbox runtime review

Render currently has one API service, one instance, and no separate worker service. The latest live deployment is `develop` at `fde20420bbb759d2e562f9ff747c9e824ac58e25`; auto-deploy is disabled.

Runtime logs confirm:

- `OutboxDispatcher` is registered and polls every second. The deployed `develop` source dispatches non-carrier events by writing a log line and then setting `status = DISPATCHED`; it does not call a generic downstream adapter.
- `ShippingCarrierWorker` is registered and polls every five seconds. It is the dedicated consumer for `shipping.carrier.*`.
- `AutoCompleteWorker` is registered and polls every 60 seconds. The deployed version still uses statement-scoped `FOR UPDATE SKIP LOCKED` without a durable persisted claim. PR #154 adds the durable five-minute lease and transactional fencing but is not merged/deployed.
- `ReturnExpirationWorker` is disabled because `P13_WORKER_ENABLED` is not set.

The staging `outbox_events` snapshot contained one `merchant.store.created` event, created 17 November and marked `DISPATCHED` about one second later. The current source shows this was a log-only no-op, not a downstream delivery acknowledgment. There were no pending outbox rows in the snapshot. PR #153 disables the generic placeholder poller and preserves pending events until a real adapter exists; it remains open/draft and is not deployed.

The orders table currently has zero rows eligible for auto-completion. This is only a point-in-time read; it is not permission to activate, pause, replay, or otherwise control workers.

## 6. Deployment and migration safety

- Render's configured start command is `pnpm --filter @scs/api start:prod`.
- `DatabaseService` auto-migrates and seeds only when `NODE_ENV` is `development` or `test`; production startup does not run migrations or the RBAC seed.
- The separate `Staging Release` workflow is invoked by CI on `develop` and can also be manually dispatched. It performs `db:migrate`, `db:seed`, migration-ledger verification, Render deployment of the same SHA, and readiness verification. A manual dispatch is a real mutating release, not a dry run.
- The release workflow supplies a CA certificate via `PGSSLROOTCERT` for its database operations. The live API runtime identity diagnostic currently reports `ssl=false`; verify whether the runtime connection is private-network or missing required TLS before production. Do not assume the release workflow's SSL setting applies to the Render API pool.
- The workflow comments describe required reviewers on the GitHub `staging` environment; the actual environment protection configuration was not independently verified in this read-only pass.
- The latest applied database migration is 0069. No migration, seed, deployment, or restart was triggered.

## 7. Performance follow-up

Supabase's performance advisor currently reports 55 foreign-key constraints without covering indexes. Review each finding against actual query patterns and existing composite indexes; add indexes only through separately reviewed migrations and measured plans. This is not an access-control fix and should not be bundled into a blanket RLS migration.

## 8. Next sequence

1. Keep PR #153 open/draft until independent review; it is a high-priority correctness fix because the deployed generic dispatcher can falsely acknowledge non-carrier events.
2. Keep PR #154 open/draft until exact-head CI and independent review; its durable claim is not in staging yet.
3. Resolve PR #145's narrow 0070 migration with the conflicting PR #138 0070 history; do not merge PR #138 wholesale.
4. Design a staged runtime-role/context refactor and table-specific RLS policy migration in an isolated database. Do not change staging roles/grants/policies until tests and rollback are reviewed.
5. Confirm the runtime TLS route and correct it through an approved configuration change if required.
6. Keep P13/financial worker activation disabled until the dedicated worker identity, lease, pause controls, and release plan are verified.
7. Run a new read-only audit after any approved changes; only then plan controlled write tests with explicit authorization.

**Audit result:** access-control architecture, generic outbox delivery, and HTTP response-cookie log redaction remain staging release blockers. OTP provider log redaction is merged/deployed and current retained logs show no six-digit OTP values, but historical device-trust cookies were recorded in HTTP response logs and require an explicit revocation/retention decision. No staging writes or operational actions were performed.
