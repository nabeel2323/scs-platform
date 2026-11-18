# SCS Platform — Audit-Driven Remediation & Testability Implementation Plan

| Field | Value |
|---|---|
| Document type | Authoritative remediation implementation plan |
| Version | 1.0 |
| Created | 18 November 2026 |
| Baseline | Comprehensive readiness audit dated 18 November 2026 |
| Repository | `nabeel2323/scs-platform` |
| Baseline branch / commit | `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36` |
| Runtime evidence | Render staging addendum, 18 November 2026 |
| Status | PLANNED — implementation has not started under this plan |
| Companion | [Implementation Progress Tracker](./IMPLEMENTATION-PROGRESS.md) |
| Supersedes | Remediation sequencing only; historical milestone records remain intact |

> **Purpose.** Close the evidenced readiness gaps in the order that makes the platform safe and practical to test as early as possible. Keep implementation moving with small automated checks, avoid repeated manual end-to-end testing after every fix, and perform one comprehensive release-candidate test campaign after all planned remediation is complete.

---

## 1. Executive direction

The current codebase contains substantial marketplace functionality across the NestJS API, buyer/merchant web application, admin console, Flutter mobile application, PostgreSQL/Supabase and Render staging. The November audit nevertheless concludes **NOT READY** for production.

The remediation programme is not a rewrite and does not restart the old Phase 0–7 product roadmap. It is a focused stabilization and release-readiness programme against the current codebase and the 22 findings in the audit register.

### 1.1 Primary outcomes

1. Close the P0 cross-merchant authorization vulnerability and establish a verified database access model.
2. Make core commercial data truthful: the seller/offer displayed is the seller/offer added to cart; quantity rules are enforced; currencies and tax are represented correctly; unsupported payment methods are rejected.
3. Make asynchronous order/shipping/return processing reliable and observable, including explicit worker ownership, leases, alerting and safe activation.
4. Make buyer, merchant and admin workflows coherent across web, mobile and API for the agreed release scope.
5. Establish repeatable deployment, migration, recovery, CI and documentation controls.
6. After all fixes are integrated, execute one coordinated full test campaign against a controlled staging release candidate and make a documented go/no-go decision.

### 1.2 Testing philosophy — fast feedback, one full campaign

The user does not want to spend time manually retesting the whole platform after each fix. The programme therefore uses three deliberately different levels:

| Level | When | Required activity | Manual user effort |
|---|---|---|---|
| A — change-local checks | During each implementation task | Focused unit tests, affected integration tests, type-check/build/lint as applicable, migration validation | None expected |
| B — integration checkpoints | At phase boundaries and dependency handoffs | Automated API/database/worker contract checks; one staging health/readiness check when a deployment is authorized | Only if a product decision or access approval is needed |
| C — comprehensive final campaign | Once, after all planned fixes are implemented and merged into the release candidate | Full automated suites, browser journeys, mobile integration, tenant isolation, concurrency, migration/recovery, provider sandbox, performance and business UAT | One consolidated review of results and exceptions |

**Important:** “One full test at the end” does not mean shipping untested changes. Each fix must have a narrow automated regression check that proves the defect it changes is corrected. We will not ask the user to repeat long manual test scripts for every individual fix. Full journey testing is intentionally consolidated into the final campaign.

No phase is considered complete merely because code was changed or a build is green. It must satisfy its written acceptance criteria and attach evidence to the progress tracker.

---

## 2. Baseline and evidence rules

### 2.1 Audited gap register

The authoritative starting gap IDs are those in the November comprehensive readiness audit:

| ID | Priority | Area | Finding |
|---|---:|---|---|
| G-001 | P0 | Security | Merchant offer list/analytics lack tenant authorization |
| G-002 | P1 | Database/security | RLS disabled on public tables; excessive anon/auth grants |
| G-003 | P1 | Shipping/reliability | Generic outbox dispatcher competes with carrier worker |
| G-004 | P1 | Catalog/commerce | Search card displays lowest offer but adds owning store without offerId |
| G-005 | P1 | Checkout/finance | Web checkout combines different currencies into one SAR-formatted estimate |
| G-006 | P1 | Catalog/commerce | Offer orderIncrement is persisted but not enforced |
| G-007 | P1 | Mobile/checkout | Mobile checkout omits per-store shipping and payment selection; VAT disclosure conflicts with API |
| G-008 | P1 | Payments | API accepts DIGITAL but registry has only manual provider |
| G-009 | P2 | Notifications | General SMS, FCM and WhatsApp channels are stubs but mark SENT |
| G-010 | P2 | Shipping | Carrier label event handler is a no-op |
| G-011 | P2 | Orders/workers | AutoCompleteWorker claim does not remove row from eligibility |
| G-012 | P2 | Payments/finance | Payments are manual; no automatic gateway or payout transfer |
| G-013 | P2 | Database/performance | 55 foreign-key constraints lack covering indexes |
| G-014 | P2 | CI/CD | develop branch is unprotected; no repository rulesets |
| G-015 | P2 | CI/CD | Formatting and boundary lint are non-blocking/miswired |
| G-016 | P2 | Repository hygiene | Large tracked .m73b6-scratch context tree |
| G-017 | P2 | Repository hygiene/security | JWT-shaped test artifact committed twice |
| G-018 | P2 | Documentation | Architecture and readiness documentation has mixed-age baselines |
| G-019 | P2 | Mobile/promotions | Applied promo cannot be removed from mobile cart |
| G-020 | P2 | Database/security | normalize_arabic has mutable search_path |
| G-021 | P3 | Procurement | Formal RFQ / quotation / purchase-order workflow absent |
| G-022 | P3 | Database | pg_trgm extension installed in public schema |

The audit classifies the register as 1 P0, 7 P1, 12 P2 and 2 P3 findings. These IDs are stable references; if implementation discovers a wider root cause, record linked sub-findings rather than silently rewriting the original finding.

### 2.2 Runtime evidence that changes the order

The Render staging addendum observed:

- `scs-api-staging` is live on `develop`, but auto-deploy is disabled. New commits do not automatically reach staging.
- Health checks for `/v1/readyz` returned HTTP 200 after deployment.
- OTP email is the permitted channel; Resend is configured. Historical provider sample showed 12 accepted sends and 3 SMTP timeouts; provider acceptance does not prove inbox delivery.
- No plaintext OTP was identified in the bounded provider-log sample reviewed. Source comments/tests include redaction protections, but all possible logging paths are not forensically cleared.
- OutboxDispatcher and ShippingCarrierWorker both register in the API process. The source-level event ownership conflict remains open.
- ReturnExpirationWorker explicitly did not start protected P13 jobs because `P13_WORKER_ENABLED` was not set, as inferred from startup logs. The exact environment value was not inspected.
- A prior critical P13 worker-count anomaly was logged while no alert sink was configured.
- No authenticated buyer/merchant transaction, cross-tenant exploit test, external provider dashboard verification, or backup/restore drill was performed.

These observations make worker ownership, deployment safety and a controlled staging test harness prerequisites. Do not infer that the service is safe for business writes merely because readiness is green.

### 2.3 Database and OTP evidence qualifications

- The audit report and subsequent database-check note report different public-table counts (114 vs 111). Reconcile against the live schema snapshot and migration ledger before writing a grant/RLS migration.
- The database note reports no `SECURITY DEFINER` functions and no `BYPASSRLS` on anon/authenticated roles; the service role is privileged as expected in some Supabase architectures. This does not eliminate the need to establish the API's actual database identity and least-privilege contract.
- A project note records an earlier plaintext-OTP concern, while the latest bounded Render investigation found no plaintext OTP in the sampled provider logs. Treat this as a **verification requirement**, not a proven current leak or a proven complete fix. Inspect all logging and exception paths, retain redaction tests, and never generate OTP test traffic against production.

### 2.4 Evidence labels

Use these labels in every phase report:

- **SOURCE VERIFIED** — current code/schema/config inspected.
- **TEST VERIFIED** — named automated test executed and result recorded.
- **STAGING VERIFIED** — authorized staging behavior observed against the stated deployment SHA.
- **PROVIDER VERIFIED** — provider sandbox/dashboard evidence proves the provider operation; accepted API request alone is not delivery.
- **NOT VERIFIED** — no adequate evidence; never convert absence of an error into success.
- **BLOCKED** — dependency, authorization, decision or environment prevents completion.

All evidence must identify branch/commit, command or test name, environment, date/time and result. Redact secrets, customer data, OTPs and tokens.

---

## 3. Sequencing strategy and dependency graph

The implementation order is based on four questions:

1. What could expose another tenant's data or corrupt business/financial state?
2. What must be reliable before realistic buyer/merchant test flows can run?
3. What can be implemented in parallel without destabilizing shared foundations?
4. What is genuinely required for the agreed first release versus a later product expansion?

### 3.1 Phase sequence

| Order | Phase | Priority | Main outcome | Blocks |
|---:|---|---|---|---|
| 0 | Baseline reconciliation & testability foundation | Critical prerequisite | Reproducible local/test environment, safe staging procedure, reliable evidence baseline | All implementation phases |
| 1 | Tenant security & database access safety | P0/P1 | Secure merchant data boundaries and verified DB role/grant model | Any authenticated business testing |
| 2 | Commercial correctness & checkout contract | P1 | Correct seller attribution, quantity, currency, payment-method and tax/fulfillment behavior | Buyer/merchant transaction testing |
| 3 | Event, worker & fulfillment reliability | P1/P2 | No lost carrier events, durable worker claims, safe P13 activation and alerting | Shipping/returns/order lifecycle tests |
| 4 | Client workflow parity & truthful notifications | P2 | Web/mobile/API parity for agreed buyer/merchant flows; no false delivery states | Complete user-journey testing |
| 5 | Operational hardening, CI, data hygiene & documentation | P2/P3 | Safe releases, recovery evidence, blocking quality gates and maintainable docs | Final release candidate |
| 6 | Consolidated full verification & release decision | Release gate | One comprehensive test campaign and evidence-based go/no-go | Production authorization |

### 3.2 Critical dependency graph

```text
Phase 0 — Baseline + test harness + deployment safety
                         |
                         v
Phase 1 — Tenant authorization + DB access model
                         |
                         v
Phase 2 — Seller/offer + quantity + currency + payment/tax correctness
                         |
             +-----------+-----------+
             |                       |
             v                       v
Phase 3 — Outbox/workers       Phase 4 — Web/mobile parity
             |                       |
             +-----------+-----------+
                         |
                         v
Phase 5 — CI/operations/docs/recovery hardening
                         |
                         v
Phase 6 — Full release-candidate verification
```

Phase 3 and non-conflicting Phase 4 tasks may proceed in parallel after Phase 2's shared contracts are agreed. Do not parallelize competing changes to the same order/checkout contract, outbox schema, worker lease model or database permission model without an explicit owner and integration plan.

---

## 4. Phase 0 — Baseline reconciliation & testability foundation

**Priority:** Critical prerequisite  
**Purpose:** Establish a safe, repeatable way to implement and later test fixes without repeatedly asking the user to troubleshoot the environment.

### Work packages

**0.1 Reconcile the current repository baseline**
- Record current `develop` HEAD and compare it with the audit commit `9f5bc397...`.
- Re-check whether the 22 findings still reproduce on current HEAD before editing each affected area.
- Identify existing fixes, later regressions, duplicate work and migrations already applied.
- Reconcile the older September implementation documents with the November audit. Preserve historical milestone evidence; mark obsolete status claims as historical, not current readiness.
- Record exact app/package commands from the current manifests rather than assuming the old plan's commands remain accurate.

**0.2 Establish a test execution matrix**
- Inventory existing API unit/integration tests, web/admin tests, Flutter tests, database migration tests, CI workflows and staging smoke checks.
- Identify which suites require Docker/Testcontainers, Supabase, secrets, provider sandboxes or device/emulator infrastructure.
- Create a deterministic test-data strategy with isolated buyer, merchant A, merchant B, merchant staff, admin and unauthorized identities.
- Ensure tests use generated credentials/tokens and never commit real or reusable tokens.
- Define the final full-suite command set and expected reports now, but defer the full campaign to Phase 6.

**0.3 Establish staging/deployment safety**
- Document the current Render service, branch, deploy SHA, health endpoint, auto-deploy-disabled behavior and manual deploy approval requirement.
- Verify startup migration and seed behavior from source and logs. Do not trigger a deployment during this phase without explicit authorization.
- Define pre-deploy checks: pending migration list, migration lock/compatibility review, backup/restore availability, deploy SHA, readiness and rollback/forward-fix procedure.
- Define how workers are disabled/enabled safely per environment. Do not turn on P13 or other financial workers just to make a test pass.
- Add a runbook for test data creation/cleanup and a hard separation between staging and production.

**0.4 Focused security evidence preparation**
- Inventory all route-level tenant guards and database connection roles used by the API.
- Trace OTP generation, persistence, delivery and every logger/exception path. Do not send OTPs in this phase.
- Capture baseline DB schema/table count, grants, RLS flags, policies, functions, extensions and migration ledger.

### Acceptance criteria
- Current baseline commit and all known findings are reconciled into the tracker.
- Test matrix lists executable commands, prerequisites and owners for API, web, admin, mobile and DB.
- Safe staging/deploy/migration/backup procedure is documented.
- Test identities and fixtures are isolated and repeatable.
- Database and OTP evidence discrepancies are explicitly resolved or recorded as blockers.
- No production data writes, staging business transactions, worker activation or deploy is performed as part of read-only discovery.

### Deliverables
- Baseline reconciliation note.
- Test matrix and final campaign manifest.
- Staging deployment/migration/backup runbook.
- Security and database access inventory.

---

## 5. Phase 1 — Tenant security & database access safety

**Priority:** P0 / P1  
**Release significance:** This phase establishes the minimum safe platform boundary for authenticated testing.

### 1.1 Close G-001 — merchant offer authorization (P0)
- Trace `GET /v1/merchant/offers`, `/analytics`, `/analytics/trend` and every related controller/service/query.
- Derive store/organization scope from authenticated membership, not a caller-supplied store ID alone.
- Verify owner, manager/staff roles, active organization, revoked membership, inactive store and admin exception behavior.
- Apply consistent object-level authorization to list, detail, analytics, exports and mutations where relevant.
- Avoid leaking whether a foreign store or offer exists; choose consistent 403/404 behavior based on the established API policy.
- Audit adjacent `storeId`/`orgId` read endpoints for the same pattern; add linked findings for newly discovered omissions.

**Acceptance:** foreign merchant IDs cannot return offer, pricing, sales or analytics data; authorized merchant access remains functional; route-level tests cover owner, staff, same-tenant unauthorized role, buyer, foreign merchant and admin policy.

### 1.2 Close G-002 — database privileges and RLS architecture
- Identify the exact runtime DB role used by the API, migrations, admin tools and any client-side Supabase access.
- Classify every table: server-private, tenant-scoped, public-read, intentionally client-accessible, audit/financial sensitive, queue/system.
- Reconcile 111 vs 114 table counts against the current live schema and migration ledger.
- Inventory table, sequence, schema, function and default privileges for anon/authenticated/service roles.
- Remove only privileges proven unnecessary and compatible with the actual API connection model.
- Design table-specific RLS policies only for tables accessed through roles subject to RLS. Do not blindly enable RLS on every table or accidentally block the backend.
- Ensure service-role credentials remain server-only and never appear in web/mobile bundles.
- Add negative tests for direct client access where supported, and HTTP-level tenant tests for API-mediated access.
- Include rollback/forward-fix strategy and staging verification before production migration.

**Acceptance:** least-privilege matrix reviewed; no unintended client privilege remains; RLS is enabled/policy-tested where required by the access architecture; backend paths continue to work; cross-tenant reads/writes are denied at the appropriate layer.

### 1.3 Close G-020 — normalize_arabic search_path
- Inspect function owner, schema, callers, extension dependencies and privileges.
- Set a safe explicit search_path or schema-qualify references in a reviewed migration.
- Verify behavior and function resolution under the real application roles.

**Acceptance:** function cannot be redirected through an attacker-controlled schema; Arabic search normalization regression tests pass.

### 1.4 OTP logging and secret hygiene safeguard
- Resolve the earlier OTP plaintext report against current source and a bounded authorized staging log sample.
- Redact OTP values, full email/phone identifiers, authorization headers, cookies and provider secrets on both success and failure/exception paths.
- Confirm error serialization does not leak provider payloads or verification secrets.
- Keep explicit tests that fail if OTP values or sensitive identifiers are logged.
- Do not include real OTPs, bearer tokens or API keys in evidence.

**Acceptance:** source and tests demonstrate redaction across all identified paths; a bounded staging check finds no sensitive values in relevant logs. If evidence is unavailable, mark NOT VERIFIED.

### Phase 1 exit gate — AUTHORIZED BUSINESS TESTING
Only after the P0 is closed, the DB access model is verified, and the test identities/fixtures are ready may controlled staging buyer/merchant write tests be considered. This is permission to begin limited testing, not production approval.

---

## 6. Phase 2 — Commercial correctness & checkout contract

**Priority:** P1  
**Purpose:** Make prices, seller identity, quantity, currency, payment method and tax/fulfillment terms consistent between the API and all clients.

### 2.1 Close G-004 — search offer attribution
- Establish one authoritative offer identity in search result DTOs.
- Display the seller/offer whose price is shown.
- Add to cart using that exact offer/store reference, or require explicit seller selection on product detail.
- Prevent fallback to a different store while retaining the displayed lowest price.
- Keep API validation authoritative; UI values are never trusted for price.

**Acceptance:** search display seller/offer, cart seller/offer, price snapshot and checkout seller are identical for selected line; tests include multiple sellers and stale/inactive offers.

### 2.2 Close G-006 — MOQ and orderIncrement
- Agree the business formula for increments relative to MOQ (for example, quantity >= MOQ and (quantity - MOQ) divisible by increment) before coding.
- Enforce server-side at add-to-cart, quantity update and final checkout to prevent API bypass/stale carts.
- Re-read authoritative offer terms within the transaction or validate the snapshot policy.
- Return structured validation errors and expose the rule in web/mobile quantity controls.

**Acceptance:** valid/invalid boundary cases, increment changes after cart creation, concurrency and stale offer tests pass.

### 2.3 Close G-005 — mixed-currency checkout
- Do not add minor units across currencies.
- Show per-supplier/per-currency subtotals and shipping totals.
- Only show a grand total if a real, sourced and disclosed FX conversion policy is implemented; otherwise explicitly show that no cross-currency grand total is available.
- Ensure all currency formatting uses the actual ISO currency, exponent/minor-unit rules and no SAR fallback for unknown/mixed currency.

**Acceptance:** two or more currencies never produce a misleading single total; same-currency totals remain correct; API, web and order summary agree.

### 2.4 Close G-008 — unsupported DIGITAL payment
- Until a real digital gateway is implemented and approved, reject DIGITAL at the API boundary.
- Align DTOs, generated clients, web/mobile controls, admin configuration and documentation with supported manual methods.
- If gateway scope is later approved, treat it as a separate architecture project: intent/auth/capture, signed webhooks, idempotency, reconciliation, refunds, failure recovery and provider sandbox verification.

**Acceptance:** unsupported methods fail explicitly and consistently; no order can be marked paid without a valid provider/manual verification path.

### 2.5 Close the commercial portion of G-007 — mobile checkout contract
- Align mobile with the canonical checkout API for per-store shipping selections, payment selection and tax treatment.
- Make VAT/fees visible before order submission using the same backend calculation and wording.
- Do not silently default to COD or a global shipping method when the buyer expects per-store selection.
- If the initial release intentionally restricts choices, disclose the restriction consistently and validate it server-side.

**Acceptance:** mobile request and review screen reflect the exact choices and totals persisted by the API; no contradictory VAT disclosure.

### Phase 2 exit gate
API contract, generated clients and web/mobile commercial calculations agree. Targeted tests cover each corrected rule. No full browser/mobile journey campaign yet.

---

## 7. Phase 3 — Event, worker & fulfillment reliability

**Priority:** P1 / P2  
**Purpose:** Prevent silent event loss, duplicate side effects and disabled/unguarded lifecycle jobs.

### 3.1 Close G-003 — outbox consumer ownership
- Define exactly one authoritative consumer/dispatcher for each event type.
- Generic dispatcher must not claim and mark carrier events dispatched without performing their required handler/provider action.
- Choose explicit routing, separate queues or event-type predicates; document ownership and retry semantics.
- Preserve at-least-once delivery with idempotent consumers and durable state transitions.
- Add observability for pending age, attempts, terminal failures and queue lag.

**Acceptance:** integration test inserts each relevant event class and proves it is consumed by exactly the intended handler; carrier events cannot be marked complete without provider success; retries/dead-letter behavior is deterministic.

### 3.2 Close G-010 — carrier label handler
- Connect worker handler to the existing provider label-generation implementation.
- Persist provider response, label reference/object metadata, tracking reference and shipment state atomically where possible.
- Handle provider timeout, duplicate event, retry and terminal failure safely.
- Verify sandbox behavior only with approved credentials; no live shipment should be created without explicit authorization.

**Acceptance:** successful label path, timeout/retry, duplicate delivery and terminal failure tests pass; provider evidence is clearly labeled sandbox/live.

### 3.3 Close G-011 — durable AutoCompleteWorker claim
- Replace timestamp-only claim behavior with a durable lease/processing state or atomic claim token.
- Define lease owner, expiry, heartbeat/reclaim and idempotent completion behavior.
- Test two or more worker instances racing with buyer confirmation and order status changes.

**Acceptance:** one logical completion; no duplicate financial/notification side effects; expired leases recover; worker concurrency tests pass.

### 3.4 P13 worker activation and alerting
- Inspect worker registration, feature/env flags, lease-holder model, expected holder count and deployment topology.
- Determine whether P13 workers should run inside the API process or as a separate worker service. Do not assume one Render instance proves correct topology.
- Define explicit staging and production activation values through reviewed configuration, not ad hoc changes.
- Configure a real alert sink and test delivery for worker-count anomalies, stale leases, queue backlog and repeated job failure.
- Keep protected financial/return jobs disabled until schema, idempotency, lease and alert gates are verified.
- Document startup logs and health/metrics that prove the intended worker topology.

**Acceptance:** expected holder count is explained and observed; alerts reach a tested sink; P13 jobs run only when intentionally enabled; multi-instance lease tests pass.

### Phase 3 exit gate
Carrier, outbox and order-worker processing are proven with automated integration/concurrency tests. No unresolved event ownership ambiguity. Protected P13 jobs have a documented and verified activation plan.

---

## 8. Phase 4 — Client workflow parity & truthful notifications

**Priority:** P2  
**Purpose:** Complete the agreed user-facing workflow without promising behavior the backend does not deliver.

### 4.1 Complete G-007 mobile parity
- Complete per-store shipping/payment choices and tax/fee review in mobile.
- Align validation, error display, loading/retry and order confirmation with web/API.
- Confirm order detail and tracking show per-sub-order fulfillment accurately.

### 4.2 Close G-019 — remove applied promotion on mobile
- Expose the supported remove-promotion operation in mobile client/UI.
- Keep cart recalculation authoritative on the API.
- Handle expired/invalid promo, partial cart changes and network retry.

### 4.3 Close G-009 — truthful notification status
- Keep in-app notification path distinct from external provider channels.
- For SMS, FCM and WhatsApp, either implement a real provider adapter with delivery-state semantics, retry/backoff and receipts, or mark the channel unavailable/not configured. Never mark a simulated provider operation SENT.
- Define what SENT, ACCEPTED, DELIVERED, FAILED and NOT_CONFIGURED mean.
- Add provider sandbox tests and ensure provider acceptance is not represented as inbox/device delivery.

### 4.4 Admin and merchant workflow verification
- Inspect all in-scope admin list/detail/create/edit/archive/review actions and ensure permissions match the API.
- Fix only gaps that prevent the agreed pilot workflows; create separate findings for additional missing screens.
- Verify error, empty, loading, permission-denied and destructive-action states.
- Keep UI work aligned with the existing design system and accessibility/RTL requirements.

### Phase 4 exit gate
The agreed buyer and merchant operations are supported across API/web/mobile with truthful status and error behavior. Automated focused tests pass; full journey UAT remains reserved for Phase 6.

---

## 9. Phase 5 — Operational hardening, CI, data hygiene & documentation

**Priority:** P2 / P3  
**Purpose:** Make the final release reproducible, reviewable and recoverable.

### 5.1 Close G-014 — branch protection
- Add repository rulesets/protection for develop and release branches.
- Require PR review and mandatory relevant CI checks; block force-push/deletion.
- Confirm branch policy does not prevent authorized emergency recovery.

### 5.2 Close G-015 — blocking quality gates
- Correct the boundary-lint workflow to invoke the actual root boundary-lint script.
- Remove `continue-on-error` from formatting and architecture checks after existing violations are addressed.
- Ensure CI reports the real command, scope and exit code.
- Keep fast affected-package checks on PRs; schedule/trigger full suites at the release candidate.

### 5.3 Close G-016 and G-017 — repository hygiene
- Classify the tracked `.m73b6-scratch` tree and determine which artifacts are legitimate audit evidence.
- Scan for secrets, tokens, customer data and duplicated source snapshots.
- Remove unnecessary tracked artifacts and add ignore rules.
- Verify JWT-shaped test artifact provenance; remove it and duplicates if not required. If any real credential was ever exposed, rotate/revoke through the proper owner process.
- Do not rewrite shared history without an agreed repository recovery procedure.

### 5.4 Close G-018 — documentation baseline
- Mark old September roadmap statuses as historical.
- Keep this remediation plan and progress tracker authoritative for current gap closure.
- Update API, admin, merchant, buyer, mobile, deployment, migration, permissions, worker, backup/restore and troubleshooting docs alongside relevant implementation.
- Documentation must describe implemented and verified behavior, include version/commit metadata and avoid aspirational claims.

### 5.5 Close G-013 — FK indexes
- Use workload evidence, query plans and lock/maintenance cost to prioritize the 55 unindexed foreign keys.
- Add only justified indexes, preferably in safe batches/concurrent index strategy where supported by the migration system.
- Measure before/after plans and ensure migration rollback/forward-fix strategy.

### 5.6 Close G-022 — extension schema
- Review `pg_trgm` schema placement, dependencies, function/operator resolution and Supabase migration conventions.
- Move/relocate only if supported and safe; schema-qualify references and test search behavior.
- Do not make a cosmetic schema move that breaks operator lookup.

### 5.7 Payments scope decision (G-012)
- Record whether the first release explicitly supports manual bank transfer/COD/voucher only, or requires a digital gateway.
- For a manual-payment pilot, document operational controls, reconciliation, refund approval, settlement and payout responsibilities; label automated money movement as out of scope.
- Do not implement a gateway implicitly inside a defect fix. A gateway requires separate product/provider/security approval and its own plan.

### 5.8 Procurement scope decision (G-021)
- Obtain a business decision whether RFQ, quotation, negotiation, purchase order approvals and credit terms are required for the intended release.
- If required, create a separate bounded project plan and architecture audit; do not mix it into stabilization unless it blocks the agreed launch.
- If deferred, mark explicitly DEFERRED with rationale and roadmap owner.

### 5.9 Backup/restore and deployment controls
- Prove a recoverable backup exists and complete a restore drill in an isolated environment.
- Document migration ordering, seed behavior, startup behavior, rollback/forward-fix, worker activation and health checks.
- Verify deployment SHA and readiness after an authorized staging deployment.
- Confirm alerting, log retention, secret rotation ownership and incident runbooks.

### Phase 5 exit gate
Quality gates are meaningful and blocking; repository hygiene decisions are evidenced; documentation is current; backup/restore and deploy safety are demonstrated; P2/P3 deferrals have explicit owners and rationale.

---

## 10. Phase 6 — Consolidated full verification & release decision

**Start condition:** All implementation phases 0–5 are complete or have explicitly approved deferrals; code is merged to a single release-candidate commit; staging is provisioned and safe; required test credentials/providers are available; migrations are reviewed; worker topology is intentional.

This is the **one comprehensive platform test campaign**. It is not run repeatedly after every small fix.

### 6.1 Test campaign scope

1. **Repository and build:** clean install, generated contracts, type-check, lint, format, boundary checks, production builds for API/web/admin and Flutter analyze/build.
2. **Database:** fresh migration from empty DB, upgrade from representative prior schema, constraints/indexes/policies/grants, seed repeatability, rollback/forward-fix procedure.
3. **Security:** authentication/session/OTP redaction, RBAC, object-level authorization, cross-tenant negative matrix, direct DB/client access model, admin privilege boundaries, secret scanning.
4. **Buyer journey:** registration/login, organization selection, search, offer selection, cart, quantity validation, promotion apply/remove, per-store shipping, payment method, tax/currency review, checkout, order detail, status/notification and cancellation/return as in scope.
5. **Merchant journey:** onboarding, verification, product/offer management, quantity/pricing, inventory, order acceptance/rejection, fulfillment, analytics and membership permissions.
6. **Admin journey:** users/organizations, merchant verification, catalog moderation, orders, payment verification/refunds/settlements, disputes/returns, operational queues and audit history.
7. **Workers/concurrency:** outbox ownership, retry/dead-letter, carrier label/tracking, order auto-complete, return expiration, lease expiry/reclaim, multi-instance races and idempotency.
8. **External integrations:** OTP email, approved notification providers, carrier sandbox, payment sandbox only if in scope. Record provider acceptance separately from final delivery/settlement.
9. **Mobile:** supported flavors, auth persistence, cart/checkout parity, offline/retry behavior, order status, promo removal, accessibility and RTL.
10. **Performance/reliability:** k6 scenarios for readiness/auth/search/cart/checkout/order reads; error rate, p95 latency, saturation and queue lag thresholds defined before run.
11. **Recovery:** backup restore, migration recovery, secret rotation procedure, rollback/forward-fix and alert delivery.

### 6.2 Test data and safety
- Use isolated synthetic accounts, organizations, stores, products and payment references.
- Include at least two independent merchants and buyer organizations to prove tenant boundaries.
- Never use real payment capture, live shipment creation or customer notifications without explicit approval.
- Ensure cleanup is scoped to generated test records and cannot touch production data.
- Capture evidence with sensitive values redacted.

### 6.3 Release gates

| Gate | Required result |
|---|---|
| P0 security | PASS; no known cross-tenant data access |
| P1 correctness | PASS or explicit product-approved release restriction; no misleading totals or unsupported methods |
| Database access | PASS; role/grant/RLS design verified against actual access paths |
| Migration safety | PASS; clean and upgrade paths verified |
| Worker/event reliability | PASS; ownership, idempotency, leases and alerts verified |
| Buyer/merchant/admin journeys | PASS for agreed in-scope scenarios |
| Mobile parity | PASS for supported release scope |
| External providers | PASS in sandbox or explicitly disabled and truthfully represented |
| CI/repository controls | PASS; required checks block merge |
| Backup/restore | PASS with recorded restore evidence |
| Performance | PASS against pre-agreed thresholds |
| Documentation | PASS; user/admin/deployment/troubleshooting docs match tested behavior |

**Go/no-go rule:** any P0 failure, tenant-isolation failure, data corruption, financial inconsistency, lost order/carrier event, unsafe migration, or inability to restore is NO-GO. P1/P2/P3 items may only be deferred with explicit scope, risk, owner and mitigation; a deferral must not conceal a security or financial correctness failure.

### 6.4 Final deliverables
- Full test campaign report with command-by-command results and commit SHA.
- Buyer, merchant and admin UAT result summary.
- Tenant-isolation and concurrency evidence.
- Migration, backup/restore and deployment evidence.
- Provider sandbox evidence and explicit non-configured channels.
- Updated gap register: CLOSED / PARTIAL / DEFERRED / NOT APPLICABLE, each with evidence.
- Final release recommendation: GO / CONDITIONAL GO / NO-GO.

---

## 11. Cross-phase engineering rules

1. **No speculative fixes.** Re-read current code and reproduce the finding on the active branch before implementation.
2. **One root cause at a time.** Keep changes small enough to review; avoid broad refactors unless required by the accepted design.
3. **Contract-first for shared behavior.** API schema, generated clients, web and mobile must move together when public contracts change.
4. **Migrations are deliberate.** Review schema diff, lock impact, existing data, compatibility, deployment ordering and recovery.
5. **Authorization is server-side.** UI hiding is not a security control.
6. **Money is never guessed.** Minor units are not added across currencies; payment status must reflect actual provider/manual evidence.
7. **Workers must be idempotent.** Every queue consumer needs ownership, claim/lease, retry and terminal-state semantics.
8. **No false success states.** A log line, HTTP 200, provider acceptance or build success does not prove a business workflow completed.
9. **No live side effects without approval.** Deploys, environment changes, production migrations, payment capture, shipments, customer notifications and data writes require the relevant authorization.
10. **Documentation is part of Definition of Done.** Update both living documents and the relevant user/technical guide in the same implementation task.
11. **Preserve audit history.** Do not rewrite old reports or historical milestones to make the new plan appear complete.
12. **Record every deferral.** Include reason, risk, mitigation, owner/decision and target milestone.

---

## 12. Definition of Done for each remediation item

A finding can be marked **CLOSED** only when all applicable conditions are met:

- [ ] Finding reproduced or revalidated on the active baseline.
- [ ] Root cause and chosen design documented.
- [ ] Code/schema/config change implemented and reviewed.
- [ ] Focused regression test added and executed.
- [ ] Affected package type-check/build/lint passes as applicable.
- [ ] Migration is validated and safe if schema changed.
- [ ] Authorization, idempotency, concurrency and failure paths tested where relevant.
- [ ] API contracts and generated clients updated where relevant.
- [ ] Relevant user/admin/operations documentation updated.
- [ ] Evidence recorded in the progress tracker with commit SHA and test output reference.
- [ ] No unapproved staging/production side effect occurred.

If any condition is not met, use PARTIAL, BLOCKED or NOT VERIFIED rather than CLOSED.

---

## 13. Living-document maintenance protocol

These two files are the authoritative working references for this remediation programme:

- `docs/remediation/IMPLEMENTATION-PLAN.md`
- `docs/remediation/IMPLEMENTATION-PROGRESS.md`

**Update automatically as part of implementation work, without asking the user for permission to maintain the documents:**

1. Before starting a phase, update the tracker with the selected phase, scope, dependencies and baseline commit.
2. When a task starts, record IN PROGRESS, task ID, branch/commit and expected evidence.
3. When code changes, update the plan only if scope/dependencies/acceptance criteria genuinely changed; update the tracker with files, migration IDs and focused tests.
4. When a task finishes, record exact test command/results, commit SHA, evidence links and any remaining risk. Never mark complete based only on an implementation report.
5. At each phase boundary, update phase status, acceptance checklist, outstanding blockers and next recommended task.
6. If a new finding is discovered, append it to the tracker and link it to the nearest original gap ID; update this plan only if sequencing or release scope changes.
7. Before a full test campaign, freeze the release-candidate SHA and update the test manifest.
8. After the final campaign, update both files with final evidence and release decision.

**Authority and sync:** the copies committed in this Git repository are the canonical source of truth because they can be versioned with the code and updated in the same commits. Any Library copy is a convenience snapshot and must not be treated as automatically synchronized with GitHub. In future implementation turns, read the current repository versions first and commit updates to these paths as part of the work; do not rely on stale chat summaries.

---

## 14. Current recommendation

Start with **Phase 0**, then Phase 1. Do not begin broad buyer/merchant staging testing until the P0 authorization gap and database access model are closed. Once Phase 1 passes, allow narrow controlled business tests while implementation continues. Keep full manual journey testing consolidated in Phase 6.

**Current overall status: PLANNED. No remediation implementation is claimed by this document.**
