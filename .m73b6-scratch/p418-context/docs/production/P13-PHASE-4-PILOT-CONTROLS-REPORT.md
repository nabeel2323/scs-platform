# P13 Phase 4 — Pilot Controls Report

**Mandate section:** §6 — allowlisted pilot controls: default disabled, non-allowlisted traffic
blocked, tenant isolation for every request *and* background job, eligibility granting no extra
financial permission, disabling preserving durable records, missing/invalid config failing closed,
and every change audited.

**Claim level achieved:** **implemented, default-disabled, and runtime-verified** — 13
service-level assertions (PL-01…PL-13) on PostgreSQL plus 5 HTTP-edge assertions
(HA-29…HA-33) through a real Nest application. **No pilot was activated**, and none can be
activated from this work alone: enforcement is off in code defaults *and* off in the actual
environment.

---

## 1. Two independent switches, one gate

Enforcement turns on if **either** control says so (`pilot-control.service.ts` L87-90):

```ts
async isEnforced(): Promise<boolean> {
  if (this.config.pilotMode === 'allowlist') return true;      // P13_PILOT_MODE=allowlist
  return await this.isFlagEnabled();                           // feature_flags['p13.pilot.enabled']
}
```

| Switch | Type | Default | Reachable by |
|---|---|---|---|
| `P13_PILOT_MODE` | env (`legacy` \| `allowlist`) | `legacy` — anything unrecognised falls back to `legacy` | deployment config only |
| `p13.pilot.enabled` | durable `feature_flags` row | **row absent** → false (verified in the live dev DB: the query returns no rows) | `POST /v1/admin/ops/p13/pilot/flag`, permission-gated and audited |

Verified current state of the development database:

```powershell
docker exec scs-postgres psql -U scs -d scs_platform -tAc "select key, enabled from feature_flags where key='p13.pilot.enabled'"
```

```text
(no rows returned)
```

and `apps/api/.env` contains no `P13_` variable at all, so both switches are off. PL-01 and
HA-29 assert the same fact from inside the running code path: mode `legacy`, `enforced: false`,
and a create-return request behaves exactly as in Phase 3.

---

## 2. The gate's position in the request path

Inside `ReturnsService.createReturnRequest()` — after authentication, after object ownership, and
**before** any eligibility or financial evaluation:

```ts
// 1b. P13 Phase 4 §6 — pilot entry gate. Runs after ownership and before any
// eligibility/financial check, so a non-allowlisted organization cannot even
// start a pilot-only workflow. It grants nothing: RBAC has already been
// enforced by the guard, and an eligible org still needs the same roles.
// When enforcement is inactive (the default) this is a single cheap read.
if (await this.pilot.isEnforced()) {
  await this.pilot.assertEligible(
    await this.orgForStore(order.storeId),
    order.storeId ?? null,
  );
}
```

That ordering is a security property, and HA-29 exploits it as an oracle: a body with no return
lines returns **403** when the gate denies and **400** (`At least one return line is required`)
when the gate passed, so "did the gate run?" is observable from outside without inspecting code.

Background jobs are covered by the same rule from the other direction: the protected worker only
escalates returns that already exist, and a return can only have been created by an eligible org
(PL-09, PL-10). No pilot-scoped branch exists inside the worker, which removes the classic failure
mode where a background path silently skips a request-time guard.

---

## 3. Eligibility decision table (fail-closed in every row)

`evaluate(orgId, storeId)` returns a machine-readable reason; each denial also increments
`pilot_eligibility_denials_total` with that reason as the tag:

| Condition | `eligible` | `reason` | Counter tag |
|---|---|---|---|
| enforcement off | **true** | `not_enforced` | — (no denial counted) |
| enforcement on, org id missing/null | **false** | `missing_org_id` | `missing_org_id` |
| allowlist read throws | **false** | `allowlist_unreadable` | `allowlist_unreadable` |
| no org row and no store row | **false** | `org_not_allowlisted` | `org_not_allowlisted` |
| row present but `enabled = false` | **false** | `entry_disabled` | `entry_disabled` |
| store-scoped row present | true | `eligible_store` | — |
| org-wide row present, no store row | true | `eligible_org_wide` | — |

Store scope is resolved before org scope (`if (storeEntry) … else if (orgEntry) …`), so a
store-level entry narrows eligibility and PL-04 proves it does not silently widen to the whole
organization.

Denials surface to clients as a structured `ForbiddenException` carrying
`code: 'p13_pilot_<reason>'`, and over HTTP they arrive as RFC 7807
`application/problem+json` with that code preserved (HA-30, HA-32) — an operator can tell *which*
control denied them without reading source.

---

## 4. Configuration changes are audited and observable

| Action | Audit action recorded | Resource |
|---|---|---|
| enable/disable the flag | `p13.pilot.enable` / `p13.pilot.disable` | `feature_flag` |
| add an allowlist entry | `p13.pilot.allowlist.add` | `p13_pilot_allowlist` |
| revoke an allowlist entry | `p13.pilot.allowlist.revoke` | `p13_pilot_allowlist` |

Revocation **sets `enabled = false` and stores the note; it never deletes the row** (PL-05,
HA-32), which is what makes "disabling preserves durable records" testable rather than rhetorical.
HA-33 closes the loop: switching enforcement back off leaves the allowlist row present with
`allowlistCount = 1` and the audit trail containing `p13.pilot.enable`, `p13.pilot.allowlist.add`
and `p13.pilot.disable`.

Every flag/allowlist mutation also raises an alert, so a configuration change is visible in
`GET /v1/admin/ops/p13/status` → `pilot` (mode, flag, enforcement, entry counts, denials) as well
as in the audit trail.

---

## 5. Eligibility grants nothing (§6 requirement, §7 boundary)

- The gate is additive-only in the negative direction: it can turn an allowed request into a
  denial. Nothing in `PilotControlService` grants a permission, changes a status, or approves money.
- HA-31 states this as an assertion: allowlisting orgA opens **orgA only** — a buyer in orgB is
  still denied — and the same caller still needs the same RBAC keys for every financial route.
  Permission keys are read exclusively from the JWT `perms` array by `PermissionsGuard`; the
  `role` claim grants nothing (HA-10).
- PL-11 pins the interaction order: a buyer from another organization is denied by object ownership
  **first**, so opening the pilot cannot turn the gate into a cross-tenant read primitive.
- HA-30 additionally shows the denial is visible to an operator: `pilot.denials` in the status
  snapshot increments after the blocked request.

---

## 6. Test evidence (freshly executed in this session)

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

§6 service-level assertions, all `[PASSED]`:

```text
PL-01 default behaviour is disabled — enforcement is off and eligibility passes through
PL-02 with enforcement on and an empty allowlist, everyone is denied (fail closed)
PL-03 an allowlisted organization is eligible and a neighbouring one is not
PL-04 a store-scoped entry narrows eligibility and does not grant the whole org
PL-05 revoking disables without deleting, preserving durable records
PL-06 a missing organization identifier is denied under enforcement
PL-07 an unreadable allowlist denies rather than opens the gate
PL-08 a runtime flag alone turns enforcement on, and is audited and alerted
PL-09 the pilot gate blocks a non-allowlisted organization from creating a return
PL-10 an allowlisted organization passes the gate and continues into the normal flow
PL-11 a buyer from another organization is still denied by object ownership first
PL-12 the pilot snapshot reports mode, flag, enforcement and entry counts
PL-13 disabling the pilot preserves durable records and does not mutate in-flight returns
```

§6 at the HTTP edge, all `[PASSED]`:

```text
HA-29 with enforcement off the edge keeps legacy Phase 3 behaviour
HA-30 turning the flag on over HTTP denies a non-allowlisted org at the edge
HA-31 allowlisting one org opens that org only, and grants no extra permission
HA-32 revoking denies again and preserves the allowlist row as a durable record
HA-33 switching enforcement off keeps the records and audits every change
```

---

## 7. Limitations

1. **Allowlist granularity is org and store.** There is no merchant-, user-, or category-level
   scope. That is sufficient for a named-organization pilot and is deliberately not over-built.
2. **`isEnforced()` + `evaluate()` cost two reads per return creation while enforcement is on.**
   With enforcement off, the single `isEnforced()` read short-circuits. Not measured under load;
   `p9-performance.postgres.spec.ts` covers other paths.
3. **Flag absence is treated as off, not as an error.** PL-01/HA-29 document this; it is
   fail-closed for *pilot scope* (nothing is enabled) but it is not a configuration-completeness
   check. A pre-flight step in the runbook therefore requires the operator to confirm the flag and
   mode explicitly rather than infer them from silence.
4. **No pilot has been activated anywhere.** Enabling the pilot for a real organization requires an
   audited decision, an allowlist entry, and the worker/paused pre-flight checks in the runbook.
   This phase produced the controls and the evidence that they fail closed — not a pilot.

---

## 8. Files

| File | Role |
|---|---|
| `apps/api/src/modules/operations/pilot-control.service.ts` | enforcement, eligibility, allowlist mutation + audit + alert, snapshot |
| `apps/api/src/modules/operations/operations.schema.ts` | `p13_pilot_allowlist` |
| `apps/api/src/modules/returns/returns.service.ts` | pilot gate placement inside `createReturnRequest` (step 1b) |
| `apps/api/src/modules/operations/operations.controller.ts` | `GET pilot`, `POST pilot/flag`, `POST pilot/allowlist`, `POST pilot/allowlist/revoke` |
| `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` | PL-01…PL-13 |
| `apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts` | HA-29…HA-33 |
