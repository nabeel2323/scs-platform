# P13 Phase 4 — HTTP Authorization and Security Report

**Mandate section:** §8 — close the identified gaps: the Windows admin production build
(`jest-worker`), **HTTP authorization + tenant isolation integration tests**, the
settlement-adjustment creation form assessment, and a full regression that separates real failures
from known environment issues.

**Claim level achieved:** **implemented and runtime-verified.** A new 34-assertion integration
suite boots the real Nest HTTP application against a disposable PostgreSQL built from the full
migration chain plus the production RBAC seed, and drives it over the network. It found **three
production defects that no unit or service-level test could see**, all three fixed and re-verified.
The Windows admin build limitation inherited from Phase 3.1.1 **no longer reproduces** after the
environment repair documented in the baseline report.

---

## 1. Why this suite did not exist before Phase 4

Everything before Phase 4 proved P13 authorization at the **service** boundary —
`p311-tenant-isolation.postgres.spec.ts` calls `SettlementAdjustmentService` and friends directly.
That leaves the actual attack surface unproven:

- the guards (`JwtAuthGuard`, `PermissionsGuard`) and their decorator metadata;
- the controller edge that derives an organization scope from the token;
- the RFC 7807 error shape a client actually receives;
- whether a route exists at all with the permission the design claims.

§8 names five specific categories. Their mapping to this suite is exact:

| §8 requirement | Assertions | Section of the spec |
|---|---|---|
| missing active org | HA-17 (+ HA-18 boundary of the exemption) | §8.3 |
| cross-org reads and mutations | HA-13, HA-14, HA-15, HA-16, HA-19, HA-22, HA-23, HA-24, HA-25, HA-31 | §8.3, §8.4 |
| unauthorized roles approving or posting adjustments | HA-21, HA-27, HA-28, HA-34, HA-09 | §8.5, §8.2 |
| guessed financial record IDs | HA-14, HA-20, HA-22 | §8.3, §8.4 |
| permission enforcement on the new admin endpoints | HA-06, HA-07, HA-08, HA-10, HA-11, HA-12 | §8.2 |

---

## 2. What "real HTTP" means in this harness

`apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts` (1,206 lines) builds the
database from `infra/drizzle/migrations` (every file except the two analytics migrations `0013`,
`0018` that the existing integration suites also exclude), applies `seedPlatformRbac` from
`infra/drizzle/seed-pg.ts`, then creates a Nest application through `@nestjs/testing` with the real
`ReturnsController`, `OperationsController`, `JwtAuthGuard`, `PermissionsGuard`,
`AllExceptionsFilter`, `DatabaseService`, and the Phase 4 operations services. It binds with
`await app.listen(0, '127.0.0.1')` and calls the routes with `fetch`.

Four properties matter for how far these results travel:

1. **Nothing on the authorization path is mocked.** `JwtAuthGuard`, `PermissionsGuard`,
   `ReturnsController`, `OperationsController`, `SettlementAdjustmentService`, `ReturnsService`,
   `PilotControlService` and the four Phase 4 operations services are the production classes against
   a real `pg.Pool`. Three deliberate substitutions exist, none of them on a decision this suite
   asserts: `OutboxDispatcher` is a no-op stub (the real dispatcher would start a 1 s polling timer
   against the test database, and §8 asserts no outbox behaviour), `PaymentsService` is an empty
   provider object (no route under test reaches it), and `RedisService.client.get` is a two-line
   fake whose only behaviour is to answer `'1'` for one revoked `jti`. That last substitution is
   asserted *through*, not *on*: HA-04 proves the guard consults the denylist and rejects a
   cryptographically valid, unexpired token — it does not claim anything about Redis itself.
2. **Permission expectations are read from the seeded `role_permissions` tables, not copied into the
   file.** A grant change in `seed-pg.ts` is reflected here automatically, and a *missing* grant
   breaks the positive controls loudly instead of silently passing a hardcoded list.
3. **vitest transpiles with esbuild, which does not implement `emitDecoratorMetadata`.** The spec
   therefore declares `Reflect.defineMetadata('design:paramtypes', …)` for the 15 classes it wires,
   reproducing the metadata the SWC builder emits for the real app. This changes no wiring, but it
   *is* a harness difference from `nest start`, and it is why this suite is a network-level proof
   rather than a substitute for the production bootstrap.
4. **The URL surface is reproduced, not inherited.** `main.ts` produces `/v1/...` through
   `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`; the harness has no
   `AppModule`, so it declares the same surface with `app.setGlobalPrefix('v1')`. Every path in
   `OPS_ROUTES` and every assertion is written against `/v1/...`, so a prefix or versioning change in
   `main.ts` would not be caught here — the CI build and the existing `p3-*.postgres.spec.ts` suites
   cover the real bootstrap.

---

## 3. Test inventory — 34 assertions, all `[PASSED]`

Freshly executed in this session against the repaired environment:

```powershell
cd c:\TAIF\scs-platform\apps\api
npx vitest run src/__tests__/integration/p4-operational-readiness.postgres.spec.ts `
  src/__tests__/integration/p4-http-authorization.postgres.spec.ts `
  --no-file-parallelism --reporter=json --outputFile=../../p4-spec-final.json
```

```text
REPAIR_EXIT=0
TEST_EXIT=0
failed=0 total=93
```

The security half is `34/34 passed` in the JSON report
(`testResults[p4-http-authorization.postgres.spec.ts]`).

### §8.1 Authentication — HA-01…HA-05

```text
HA-01: an unauthenticated request is 401 and never reaches the handler
HA-02: a token with a tampered signature is 401
HA-03: an expired token is 401
HA-04: a revoked jti on the denylist is 401 even while cryptographically valid
HA-05: error bodies are RFC 7807 application/problem+json
```

HA-04 is the one that requires a real denylist read: the token is still cryptographically valid and
unexpired, and only `RedisService`/`token-denylist` state can reject it. HA-05 pins the content type
and the `type`/`title`/`status`/`detail` members, including the `code` extension that later
assertions use to prove *why* a request was refused (a Postgres `22P02` bad-UUID input surfaces as
400, never as a 500).

### §8.2 Permission enforcement on the Phase 4 operations endpoints — HA-06…HA-12

```text
HA-06: every operations route requires its permission key
HA-07: the required keys are exactly the two audited returns keys
HA-08: an authorized ADMIN can reach every operations route
HA-09: FINANCE holds financial approval rights but no worker/pilot control
HA-10: the role claim grants nothing on its own — permissions are the decision
HA-11: input validation happens after authorization, and denial leaves no state
HA-12: pausing over HTTP is audited and cannot approve or refund anything
```

HA-06 iterates the 10 routes in `OPS_ROUTES` twice: once with a token whose permission list lacks
the key (expect 403) and once with it (expect non-403). HA-07 asserts the *set* of keys used is
exactly `{admin:returns:read, admin:returns:write}` — that the module did not quietly mint a new
permission outside the 87-key / 8-role Phase 3 baseline. HA-11 is an ordering proof: an unauthenticated
or under-permissioned caller with a deliberately malformed body must receive 403 rather than the 400
that validation would produce, and the `ops_controls` / `audit_logs` tables must be unchanged after
the denial.

### §8.3 Financial-record tenant isolation over HTTP — HA-13…HA-21

```text
HA-13: a FINANCE reader sees only its own organization's adjustments
HA-14: reading another org's adjustment by its real UUID is 404 and leaks nothing
HA-15: approving another org's adjustment is denied before any row is touched
HA-16: posting another org's adjustment is denied and posts nothing
HA-17: a token with no active organization is denied every financial route and counted
HA-18: platform staff keep the deliberate cross-org query, and lose it when scoped
HA-19: reconciliation runs are isolated per organization
HA-20: a guessed id is a client error, never a 500 and never a leak
HA-21: merchant and buyer roles cannot approve or post adjustments at all
```

HA-14 and HA-16 use **real UUIDs belonging to the other organization** — the point is that knowledge
of the identifier is not authorization, and that the denial does not distinguish "exists elsewhere"
from "does not exist" (404, empty body, no `org_id` echo).

### §8.4 Return-object isolation over HTTP — HA-22…HA-25

```text
HA-22: a buyer reads their own return, another buyer gets 403 without leaking it
HA-23: merchant detail access requires membership of the fulfilling store
HA-24: the merchant list is store-scoped, and a revoked membership stops working
HA-25: /returns/my never lists another buyer's return
```

HA-23/HA-24 exercise membership as a *mutable* fact: the merchant is provisioned, gains access, is
removed, and loses access — all through HTTP, with no re-login and no cache bypass.

### §8.5 Adjustment creation and FX block over HTTP — HA-26…HA-28, HA-34

```text
HA-26: an admin can actually create an adjustment (fx_status CHECK regression guard)
HA-27: the creator cannot approve their own dual-approval adjustment
HA-28: dual approval succeeds, and posting is still refused without an authoritative FX rate
HA-34: DELIVERY_FEE_EXCEPTION is a creatable type end to end (0062 §5 + fx_status fix)
```

These four are the assertions that produced the defects in §4 below. HA-26 did not exist as an
intentional test — it is the literal requirement "an admin can create an adjustment", and before
Phase 4 that was false for **every** adjustment type.

### §8.6 Pilot enforcement at the HTTP edge — HA-29…HA-33

```text
HA-29: with enforcement off the edge keeps legacy Phase 3 behaviour
HA-30: turning the flag on over HTTP denies a non-allowlisted org at the edge
HA-31: allowlisting one org opens that org only, and grants no extra permission
HA-32: revoking denies again and preserves the allowlist row as a durable record
HA-33: switching enforcement off keeps the records and audits every change
```

Covered in detail in `P13-PHASE-4-PILOT-CONTROLS-REPORT.md`; listed here because they are HTTP-edge
authorization assertions and because HA-31 is the negative control for "eligibility grants no extra
financial permission" (§6).

---

## 4. Production defects this suite exposed

Three genuine defects in committed production code, each invisible to unit tests (which mock the
transaction or call the service directly) and to the Phase 3 service-level suites. All three are
fixed and re-verified in this session.

### D-1 — no settlement adjustment could ever be created (`fx_status` CHECK violation)

`SettlementAdjustmentService.createAdjustment()` wrote a *status-machine* vocabulary value into the
FX column. Migration 0061 constrains `fx_status` to
`NOT_REQUIRED | RESOLVED | BLOCKED | PENDING_REVIEW`, so every INSERT raised `23514` and every
adjustment creation failed. The Phase 3 suites never caught it because they seeded adjustment rows
with raw SQL.

```diff
-    const fxStatus = 'BLOCKED_FX';
+    //
+    // `fx_status` is constrained by migration 0061 to
+    // NOT_REQUIRED | RESOLVED | BLOCKED | PENDING_REVIEW. 'BLOCKED_FX' is a
+    // *status* (state-machine) value, not an FX value: writing it here violated
+    // the CHECK constraint, so no adjustment could ever be created, and the
+    // monitor's posted-without-FX invariant (Phase 4 alert 7) reads 'BLOCKED'.
+    const fxStatus = 'BLOCKED';
```

Detected by: HA-26 (500/400 where 201 was expected). Also closed a second-order risk: the Phase 4
monitor's financial-invariant check (alert 7) reads `fx_status = 'BLOCKED'`, so the wrong value
would have made that check permanently vacuous.

### D-2 — the posting guard was deny-listed against a value the schema cannot store

The §7 requirement "adjustments without an authoritative FX stay blocked" was implemented as
`if (adj.fxStatus === 'BLOCKED_FX') throw …`. Since `fx_status` can never equal `'BLOCKED_FX'`, the
guard **never fired**: any `APPROVED` adjustment could post regardless of FX state, and
`PENDING_REVIEW` or `NULL` would have passed too.

```diff
-      // FX safety: BLOCKED_FX prevents posting
-      if (adj.fxStatus === 'BLOCKED_FX') {
+      // FX safety: posting is allow-listed, not deny-listed. Only an explicitly
+      // resolved FX position (or one the schema marked NOT_REQUIRED) may post;
+      // BLOCKED, PENDING_REVIEW, NULL or any unexpected value stays blocked.
+      // This mirrors the Phase 4 monitor's invariant (alert 7) and satisfies §7:
+      // adjustments without an authoritative FX source stay blocked.
+      if (adj.fxStatus !== 'RESOLVED' && adj.fxStatus !== 'NOT_REQUIRED') {
         throw new ConflictException(
-          'Cannot post adjustment: FX status is BLOCKED. ' +
+          `Cannot post adjustment: FX status is ${adj.fxStatus ?? 'NULL'}, not RESOLVED. ` +
           'An admin with access to an authoritative rate must resolve the FX status first.',
         );
       }
```

Detected by: HA-28 (posting an FX-blocked adjustment unexpectedly returned 2xx once D-1 was fixed),
then pinned by HA-34, which additionally proves the type CHECK widening in migration 0062 §5 holds
over HTTP for `DELIVERY_FEE_EXCEPTION`.

The same vocabulary inversion existed in the admin UI and is fixed in §6.

### D-3 — three financial mutation endpoints returned empty representations (dead code)

`submitForApproval`, `approveAdjustment` and `postAdjustment` each ended with a read-back, but the
transaction was **returned** rather than awaited, so the trailing
`return this.getAdjustment(adjustmentId, orgId);` was unreachable. The transition committed, and the
caller received `undefined` as its body — an admin clicking "Approve" saw nothing come back and had
no way to know the operation succeeded.

```diff
   async submitForApproval(adjustmentId: string, submittedBy: string, orgId?: string | null) {
-    return this.db.db.transaction(async (tx) => {
+    // BD-P4-ADJ-RESPONSE-001: this must `await`, not `return`. Returning the
+    // transaction promise made the trailing read below dead code, so every
+    // caller (including the admin HTTP endpoint) got an empty representation
+    // even though the transition had committed.
+    await this.db.db.transaction(async (tx) => {
```

Applied identically at `approveAdjustment` and `postAdjustment` (with their own `BD-P4-ADJ-RESPONSE-001`
comments). Detected by: HA-27/HA-28 asserting the returned `status` and finding `undefined`.
Caller-impact scan: the only in-repo callers are the controller and `p311-concurrency` TC-02 /
`p311-tenant-isolation` TISO-03, neither of which consumes the resolved value, so the change is
response-only and cannot alter a committed state.

---

## 5. §8 "missing active org": the fail-open closed at the HTTP edge

The financial services scope their queries *"when an orgId is supplied"*. Correct for trusted
internal callers; a fail-open at an HTTP boundary, because a token without an `activeOrg` claim
produced `orgId = undefined` and therefore **no filter at all** — a guessed UUID would read, approve
or post a foreign record. `apps/api/src/common/tenant-scope.ts` now owns the edge decision:

```ts
export function financialOrgScope(caller: CallerContext): string | null {
  if (isTenantPrivileged(caller)) return caller.activeOrg ?? null;
  if (!caller.activeOrg) {
    recordOpsCounter('financial_isolation_denials_total', 1, 'missing_active_org');
    throw new ForbiddenException(
      'An active organization is required to access financial records',
    );
  }
  return caller.activeOrg;
}
```

`ReturnsController` routes all eleven financial endpoints through `this.finScope(user)`, replacing
`user.activeOrg`. Two deliberate properties:

- **Platform staff keep the cross-organization query.** `BYPASS_ROLES` (`SUPER_ADMIN`, `ADMIN`,
  `MODERATOR`, `SYSTEM`) may act across organizations — that asymmetry is pinned as intentional by
  `p311-tenant-isolation` TISO-07, so HA-18 keeps it and asserts it disappears when an admin is
  *given* a scoped active organization.
- **Every other role must be pinned, or the request is denied and counted.** The
  `financial_isolation_denials_total` counter with reason `missing_active_org` is an input to the
  monitor's tenant-isolation alert (§4 alert 8), so an authorization denial is not only blocked, it
  is observable. HA-17 asserts both the 403 and the increment.

---

## 6. Settlement-adjustment creation form assessment (§8, third bullet)

Assessed against the actual repository, not against an assumed design.

**Finding: the admin `settlement-adjustments` page has no creation form, and Phase 4 deliberately did
not add one.** What exists is a read/approve/post surface:
`useRequirePerms(['admin:adjustments:read'])`, a status filter, a list, an Approve button for
`PENDING_APPROVAL` rows, a Post button for `APPROVED` rows, and a blocked-FX banner. Creation is
API-only (`POST /v1/admin/settlement-adjustments`), and the automatic path — a buyer requesting a
delivery-fee refund on a partial return — writes `DELIVERY_FEE_EXCEPTION` from
`ReturnsService` itself.

Phase 4 fixed two real defects in this page, both consequences of D-2's vocabulary inversion:

```diff
+/**
+ * Posting is allow-listed on the FX position, mirroring the API guard: only an
+ * explicitly resolved FX — or one the schema marked NOT_REQUIRED — may post.
+ * … The previous `fxStatus !== 'BLOCKED_FX'` test therefore matched every real
+ * row: it offered the Post button exactly on adjustments the server refuses (409)
+ * and hid the blocked-explanation banner on the rows that are blocked.
+ */
+function canPostFx(fxStatus: string) {
+  return fxStatus === 'RESOLVED' || fxStatus === 'NOT_REQUIRED';
+}
```

```diff
-              {adj.fxStatus === 'BLOCKED_FX' && (
+              {!canPostFx(adj.fxStatus) && (
                 <div …>
-                  Posting blocked: no authoritative FX rate available. Dual approval required as safe default.
+                  Posting blocked: FX status is {adj.fxStatus}. No authoritative FX rate is configured, so an admin must resolve it before this adjustment can post.

-                {adj.status === 'APPROVED' && adj.fxStatus !== 'BLOCKED_FX' && (
+                {adj.status === 'APPROVED' && canPostFx(adj.fxStatus) && (
```

plus a missing `FAILED` option in the status filter, and the banner text corrected to name the actual
FX status (the old copy promised a "dual approval" remedy that has nothing to do with FX).

**Browser-automation coverage is not a substitute.** `pw-e2e/p13-e2e.mjs` contains one adjacent
scenario, `P13-D03 admin settlements page (settlement adjustment info)`, and its recorded evidence is
`pass: true, checks: []` — it navigates `/settlements` (not `/settlement-adjustments`) and asserts
nothing beyond the page loading with `GET /v1/admin/settlements -> 200`.

**Verdict for §8:** no remediation required for a pilot, because no pilot flow needs a human to type
an adjustment: dual approval, self-approval protection and the FX block are all enforced server-side
and now covered over HTTP (HA-26…HA-28, HA-34). Recording it as **documented, not closed**: an
operator who must create a manual correction has no UI and must use the API. A Phase 5 candidate with
three concrete requirements — create form with `adjustmentType` vocabulary from the server, an FX
resolution affordance that is what unblocks posting, and an E2E scenario that asserts on
`/settlement-adjustments` instead of only loading it.

---

## 7. Windows admin production build re-verification (§8, first bullet)

Phase 3.1.1 recorded "admin prod build fails on Windows (`jest-worker`)" as a known limitation.
Re-verified from a clean state in this session — repair the virtual store, then build:

```powershell
cd c:\TAIF\scs-platform
pnpm install --offline --force          # REPAIR_EXIT=0
pnpm --filter @scs/admin build          # ADMIN_EXIT=0
Get-Content apps\admin\.next\BUILD_ID   # WDJLNRiLYNBj7fZ98TrQt
pnpm store status                       # STORE_EXIT=0  (still clean after the build)
```

The build emitted its full route table, including the P13 surfaces:

```text
├ ○ /returns                            2.86 kB         113 kB
├ ƒ /returns/[id]                       4.09 kB         114 kB
├ ○ /settlement-adjustments             3.17 kB         104 kB
├ ○ /settlements                        2.56 kB         104 kB
├ ○ /reconciliation                     3.35 kB         104 kB
├ ○ /disputes                           216 B           131 kB
├ ƒ /disputes/[id]                      2.24 kB         118 kB
```

and the specific `jest-worker` artifacts the Phase 3 failure pointed at are all present in the
resolved Next.js virtual store directory
`node_modules\.pnpm\next@14.2.35_@opentelemetry+api@1.9.1_@playwright+test@1.63.0_react-dom@18.3.1_react@18.3.1__react@18.3.1\node_modules\next`:

```text
dist\compiled\jest-worker\index.js     => True
dist\compiled\jest-worker\processChild.js => True
dist\bin\next                          => True
dist\pages\_app.js                     => True
dist\build\entries.js                  => True
```

**Interpretation, stated carefully.** The Phase 3 symptom was not a Next.js defect and not a repo
defect: it was the pnpm virtual store losing files (directories surviving, package contents absent),
which is why `docs/production/SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md` existed before
Phase 4 began. With the store repaired, `@scs/admin build` exits 0 on this Windows host, and
`pnpm store status` reported exit 0 (clean) immediately after this particular build. That is not a
claim that the build is safe on this host: an earlier run of the same sequence saw `pnpm store
status` return `ERR_PNPM_MODIFIED_DEPENDENCY` in the middle of the admin step. `@scs/web` likewise
builds `WEB_EXIT=0` when it follows a relink. A full parallel `pnpm build` through turbo remains
unreliable on this host — the corruption recurs mid-session, reproducibly during a Next.js build
step — and the mitigation is the runbook relink immediately before each Next app build, not a code
change. The authoritative cross-platform check is CI's Linux build job, which the repo already has:

```yaml
# .github/workflows/ci.yml L251-265
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [test-unit, test-integration]
    …
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

Per the mandate's "verify in a Linux/CI-like env, **no lockfile deletion**": `pnpm-lock.yaml`,
`package.json` and the lockfile-adjacent files are untouched —
`git status --porcelain pnpm-lock.yaml package.json` returns empty after every relink performed here.

---

## 8. Limitations — what this suite does not prove

1. **The harness declares decorator metadata.** The `design:paramtypes` block reproduces what SWC
   emits, so a DI-graph break that only `nest build`'s metadata could surface would not fail these
   tests. Mitigated by `pnpm --filter @scs/api typecheck` (clean) and the CI build job. The
   fifteen-entry `paramTypes` table is the declared graph: adding a constructor argument to a
   production class without extending it would mis-wire the harness, which is a maintenance
   obligation this spec now carries.
2. **`PermissionsGuard` decisions are proven for the routes this spec enumerates** — the 10
   operations routes in `OPS_ROUTES`, plus the financial and return routes §8.3–§8.6 address. It is not an
   exhaustive audit of every route in the application.
3. **No rate limiting, CORS or header-policy assertions here.** Those live in
   `phase3-security.e2e.spec.ts`, `unit/shipping/webhook-rate-limiting.spec.ts`,
   `rate-limit.spec.ts` and the tenant-security suites; this suite owns authorization and tenant
   isolation only.
4. **A real browser flow over the adjustments page is still unasserted** (§6). The API path is proven;
   the operator click-path is not.
5. **The build evidence is host-specific.** The Windows `jest-worker` limitation is resolved *after a
   documented environment repair*; the underlying store corruption is an external condition this repo
   cannot fix, and its runbook says so. Nothing in this section claims the host defect is gone — only
   that the build is not blocked by a repository defect.

---

## 9. Files

| File | Role |
|---|---|
| `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts` | HA-01…HA-34, 34 assertions over real HTTP |
| `apps/api/src/common/tenant-scope.ts` | `financialOrgScope()` — the missing-active-org fail-open closed, denial counted |
| `apps/api/src/modules/returns/returns.controller.ts` | 11 financial routes switched from `user.activeOrg` to `finScope(user)` |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | D-1 `fx_status` value, D-2 allow-listed posting guard, D-3 `return` → `await` ×3 |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | `canPostFx()` allow-list, `FAILED` filter option, corrected blocked-FX copy |
| `apps/api/src/modules/operations/operations.controller.ts` | the routes HA-06…HA-12 authorize |
| `.github/workflows/ci.yml` | Linux `build` job — the cross-platform verification authority |
| `docs/production/SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md` | pre-existing runbook that governed the environment repair |
