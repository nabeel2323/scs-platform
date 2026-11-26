# G-002 Authenticated Identity Actor-Context Adoption — 24 November 2026

## Status and source checkpoint

**Status:** Implemented in source; automated verification pending.  
**Source commit:** `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f`.  
**Branch:** `remediation/phase-0-1-tenant-security`.  
**PR:** [#138](https://github.com/nabeel2323/scs-platform/pull/138), OPEN / DRAFT / UNMERGED to `develop`.

This source group extends the existing opt-in, transaction-bound DatabaseService actor context. It does not add a global interceptor, schema migration, RLS policy or database privilege change.

## Principal provenance

AuthController and ProfileController are protected by JWT authentication. They forward only the verified user ID, role and active-organization claims from `request.user` to IdentityService. The service helper constructs the existing typed principal:

- `actorKind: 'user'`
- `actorId: userId`
- `actorRole: verified JWT role`
- `activeOrgId: verified JWT activeOrg`

No request-body actor, organization or user identifier is used to manufacture the actor principal.

## Adopted operation boundaries

### Credential setup

- The user lookup needed for password validation executes in a short user actor scope.
- Password strength validation and bcrypt hashing stay outside the DB transaction.
- A second user-scoped DB operation rechecks the account and email uniqueness, updates email/password/passwordSetAt and writes the credential audit row.
- The existing OTP-authenticated setup session is preserved; setup does not revoke sessions.

### Password change

- The authenticated user read is scoped.
- Current-password verification, strength validation and bcrypt hashing happen outside transactions.
- One user actor transaction updates the password using an optimistic predicate on the previously-read password hash, writes the credential audit row, revokes trusted-device credentials and revokes sessions (all sessions, or sessions for the supplied device ID).
- A lost optimistic race returns a conflict instead of overwriting a concurrently changed password.
- The general non-throwing audit log entry for device-trust revocation is written later in a separate `audit` actor context; it is not part of the credential mutation transaction.

### Email and phone account linking

- The OTP challenge is consumed by the existing Redis-backed challenge flow before opening a database actor transaction. OTP consumption is not included in the DB transaction.
- The user lookup, collision check, optimistic identifier update and hashed account-link audit insert run within one user actor transaction.
- Existing uniqueness and last-usable-identifier database constraints remain authoritative; existing domain error translation is retained.

### Email and phone account unlinking

- The account read, last-authentication-method check, optimistic clear operation and hashed audit insertion run in one user actor transaction.
- No external I/O occurs inside these transaction callbacks.

### Organization switching

- Membership for the target organization is resolved in a user actor transaction with `activeOrgId: null`, because the requested target organization is not yet trusted.
- Only after the membership lookup succeeds does the service build role/permission claims for that organization in the same DB transaction.
- Redis jti denylisting and JWT signing remain outside the DB transaction.

## Test coverage added or updated

- Updated AuthController tests for actor claim forwarding in switch/link/unlink handlers.
- Updated ProfileController tests for actor claim forwarding in credential setup/change handlers.
- Updated account-linking tests, including an assertion on the verified user actor context.
- Updated email-OTP error-coverage test fixtures and calls.
- Updated IdentityService organization N+1 tests to provide actor context to switchOrg.
- Added `identity.credentials-context.spec.ts` for actor context values, bcrypt-outside-transaction boundaries, and password/device/session DB operations. Test-only commit `c8405a33388731095ef08b64d744a36d7b079cd3` corrected its update mock so `where().returning()` remains chainable; this was not a production source change.

**Tests were not run**, per the standing implementation-first instruction. No formatter, lint, typecheck, E6 or CI workflow was executed for this source commit. Source implementation is not RLS or runtime verification.

## Explicit exclusions and next source work

The following remain outside this authenticated slice because identity must first be safely established or because the method crosses non-database side effects:

- Phone OTP login and email OTP login/verification.
- Password login and trusted-device/OTP challenge flows.
- Refresh-token rotation, refresh-token reuse handling and logout.
- OTP Redis challenge creation/consumption, rate limiting, provider delivery, Redis token denylisting, bcrypt and JWT signing.
- Payment/refund/checkout flows and Merchant file/object-storage flows.

The next G-002 Identity task is to define a safe pre-authentication database-principal contract for OTP/password login and bearer refresh/logout. The initial lookup that resolves an account from a phone/email or refresh-token hash must not be wrapped in a user principal that has not yet been proven. Do not substitute untrusted request claims, and do not use a broad system principal without an approved design. Separate DB-only post-proof work from Redis/provider/bcrypt/JWT operations.

Remaining G-002 gates also include actual API/migration runtime identity evidence, protected read-only catalog inventory, exact operation/ownership predicates, physical relation count reconciliation (114/116), independent review and eventual consolidated test/CI verification.

## Safety

No tests, formatter, lint, typecheck, E6 or CI were run. No migration, RLS enablement, grant/default-ACL change, shared/staging database write, deployment, worker activation, PR merge or release occurred. PR #138 remains draft and unmerged.

## Pre-authentication principal — 24 November 2026 follow-up

Source commit: `4e9e04757e0ab5f6b3c7ac924240216de0b39d0f`.

DatabaseService supports an operation-scoped `authentication` actor with no user ID, role, organization or worker identity. It requires one of five fixed operation labels and sets `app.auth_operation` transaction-locally. IdentityService uses it only for initial account lookup in phone OTP, email OTP and password login, and initial session lookup in refresh/logout.

This is only the first lookup boundary. Post-proof account creation, claims reads, session rotation/revocation and device-credential DB work remain open. Next, scope those DB-only phases under a verified user actor after OTP/password proof or refresh-token owner resolution. Keep Redis, bcrypt, provider, rate-limit and JWT work outside transactions. Future RLS policies must restrict authentication-context reads by operation and must not grant general identity-table access. No RLS, grants, migrations or database changes were made. No tests/CI were run.

## Post-proof login/session actor-context adoption — 24 November 2026

Source commits: `5a6eba900eabe021352a0f7f3307bddaeb2d6333` and `b939a335a5bc126241131ab48bb03c9ed3cfaea6`.

- Phone/email OTP: Redis challenge consumption stays outside. Account lookup/create and claims resolution use the fixed authentication operation. Once role/org claims are resolved, session insertion and device-credential issuance run in a verified user actor transaction.
- Password login: rate limiting and bcrypt comparison stay outside. Post-password claims resolution uses the authentication operation; device-credential validation and trusted session insertion/anchor update use the user actor.
- Refresh: initial session lookup and claims resolution use the authentication operation. A user actor transaction conditionally revokes the still-active old session, inserts its replacement and validates/anchors device trust. A zero-row conditional revoke rejects a concurrent rotation. JWT signing remains outside.
- Refresh reuse and logout: resolve session owner first, then perform owner-bound session/device-credential revocations under the user actor. Logout's revocations share one DB-only transaction; unknown tokens remain non-disclosing.
- OTP Redis, rate limits, bcrypt, provider delivery, external audit side effects and JWT signing remain outside database actor transactions.

A new `database-authentication-context.spec.ts` covers purpose validation, rejection of identity-bearing authentication contexts, transaction-local context and nested-purpose switching. OTP lifecycle/concurrency/security and email-enumeration fixtures were updated for actor contexts; the identity N+1 mock supports the conditional update's `returning()` chain. Tests remain unexecuted.

## Payments bounded read-route actor context — 24 November 2026

Source commit: `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6`.

Added `TenantDatabaseContextInterceptor` to eight JWT-protected, database-only GET handlers in PaymentsController: buyer payment detail (including order ownership, payment events and refunds), admin requested-refund queue, payment list, verification queue, stale payments, settlement list, merchant payment list and merchant settlement list. The existing service-layer object/tenant authorization and permission guards remain in place. No payment/refund/provider mutation route, file upload route or storage operation was wrapped. Added a controller metadata regression test for the interceptor allowlist; it has not been run.

This is method-scoped transaction context only. It does not enable RLS or change grants.

## Identity session/device route reconciliation — 24 November 2026

A follow-up controller audit confirmed that ProfileController's session list, revoke-by-device, trusted-device list and trusted-device revoke handlers already carry `TenantDatabaseContextInterceptor`. The interceptor derives the actor from the verified JWT after guards and scopes the complete awaited handler. These routes were therefore already covered; no redundant service-level wrapper or controller signature change was added. Credential setup/change remain explicitly scoped inside IdentityService because those handlers intentionally stay outside the interceptor for bcrypt separation.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.


## Orders cancellation/rejection actor-context fail-closed correction — 24 November 2026

A source call-graph review confirmed that the un-intercepted `POST /orders/:id/cancel` and `POST /orders/:id/reject` routes deliberately use service-level `runAsCaller` scopes rather than a controller-wide interceptor. This is correct for the operation boundaries: cancellation keeps the database transaction and final order read under the user actor, then emits realtime after commit; rejection scopes its order/inventory/history/outbox transaction, the separate DB-only refund request phase, and final master-order recalculation/read. The rejection refund path currently persists refund state/event/outbox; it does not invoke a payment provider from this request path.

The review found a fail-open condition inside both service helpers: a caller object with a missing subject or role silently bypassed `withActorContext`. The helpers now distinguish trusted internal calls (`caller === undefined`, which retain their existing internal behavior) from an HTTP caller object. A supplied caller must have a non-empty subject and role or the operation throws `ForbiddenException` before any database read/write. Added unit regression cases for missing subject and missing role in both cancellation and rejection. These tests were authored but not executed under the implementation-first restriction.

Do not add the controller-wide interceptor to these two routes without re-reviewing the split external/post-commit lifetime. The service-level scope is the intentional boundary.


## Catalog controller actor-context pass — database-only mutation routes (24 November 2026)

A route-to-service call-graph review found a set of database-only catalog mutations that had no controller interceptor and no service-level `withActorContext`. Added `TenantDatabaseContextInterceptor` to 23 verified DB-only mutation routes: category create/update/delete; brand create/update/deactivate; product create; product governance submit/withdraw/publish/unpublish; product/variant typed attribute writes; variant create/update and bulk operations; bulk product operations; media reorder/remove; import-job create/mapping/cancel/retry. Added a metadata regression spec asserting the interceptor is attached to every listed handler.

The request-wide interceptor was deliberately not added to mixed/long-running routes: product update/delete (cache invalidation, outbox/audit work), media add (storage-backed URL resolution), staged-row upload/processing/preview (Redis/object storage and chunk processing), and CSV error export. These require short service-level actor scopes around each DB phase; wrapping the entire request would hold a DB transaction open across external I/O or long-running processing. These mixed paths remain open follow-up work and must not be treated as actor-context complete.

No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IN_PROGRESS / NOT VERIFIED.


## Catalog media mutation actor-context boundary — 24 November 2026

The mixed catalog media-add path now resolves the verified caller context in two bounded DB-only phases. The controller performs product edit authorization inside a user actor transaction. CatalogService.addMedia requires a non-empty authenticated subject and role, then scopes product lookup, variant-to-product ownership validation and the media-row insert in a second short user actor transaction. Media URL resolution remains after commit because it may call external storage; no DB transaction is held over that operation. The unit regression fixture now supplies a user actor and transaction mock. This test was not executed. Other mixed catalog/import paths remain open; this change does not mark the broader catalog actor-context audit complete.
