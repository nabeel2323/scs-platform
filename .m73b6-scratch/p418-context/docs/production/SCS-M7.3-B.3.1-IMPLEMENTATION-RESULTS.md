# SCS M7.3-B.3.1 — Implementation Results

## Carrier-Cancel State Foundation

Status line: **M7.3-B.3.1 — IMPLEMENTATION COMPLETE**

---

## Executive Summary

M7.3-B.3.1 delivered the **state foundation only** for carrier cancellation, exactly as locked by `SCS-M7.3-B.3-BUSINESS-RULES-ARCHITECTURE-LOCK.md`:

- Authored additive, idempotent migration **`0049_carrier_cancellation.sql`**.
- Added carrier-pickup persistence columns (`carrier_pickup_id`, `pickup_scheduled`) and the dedicated carrier-cancellation state group (`carrier_cancel_*`) to the `shipments` table and to the Drizzle schema.
- Added the canonical cancellation state vocabulary, the namespaced recovery tokens, a validator, and a deterministic idempotency-key helper to `shipping.types.ts`.
- Added a pure-TS unit spec and a real-PostgreSQL schema spec.

Deliberately **NOT** implemented (belongs to later B.3 phases):

- No provider/`ShippingProvider`/Aramex changes; no `canCancelPickup`; no `cancelPickup()` abstraction.
- No `handleCancel()` implementation; no carrier HTTP calls; no worker routing change.
- No cancellation outbox change; no reconciliation change; no tracking-poller change.
- No delivered-after-cancel handling; no admin-recovery change; no public API; no retry/circuit-breaker change.
- No transitions/state-machine execution — vocabulary and storage only.

**Final verdict: PASS.** No behavior changed. `cancelOrder()` remains byte-for-byte the B.2 flow (proven by B.1 + B.2 regression, including `EO-B2-01` exactly-once side effects).

---

## Baseline

| Item | Value |
| --- | --- |
| Branch | `develop` |
| Commit (pre-change) | `2834fa5` |
| Working tree before | clean |
| Migration baseline | latest committed = `0048_cancellation_metadata.sql` |
| Prior phases | M7.3-B.2 = CLOSED/PASS; M7.3-B.3.0 = DECISION-LOCK COMPLETE (GO) |

---

## Migration

**File:** `infra/drizzle/migrations/0049_carrier_cancellation.sql`

Properties: additive · idempotent (`IF NOT EXISTS`) · fresh-DB safe · existing-DB safe · zero-downtime · non-destructive · repeatable. Contains idempotent DDL only; **no** applied-name-log INSERT (the migration runner owns that bookkeeping).

### Columns added to `shipments`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `carrier_pickup_id` | `VARCHAR(200)` | yes | `NULL` |
| `pickup_scheduled` | `BOOLEAN` | **no** | `false` |
| `carrier_cancel_status` | `VARCHAR(24)` | yes | `NULL` |
| `carrier_cancel_error` | `TEXT` | yes | `NULL` |
| `carrier_cancel_error_class` | `VARCHAR(40)` | yes | `NULL` |
| `carrier_cancel_retries` | `INTEGER` | **no** | `0` |
| `carrier_cancel_attempted_at` | `TIMESTAMPTZ` | yes | `NULL` |
| `carrier_cancel_idempotency_key` | `VARCHAR(120)` | yes | `NULL` |

`carrier_pickup_id VARCHAR(200)` matches the existing `carrier_shipment_id VARCHAR(200)` reference convention. The optional `pickup_status` / `pickup_date` columns were **not** added — no existing architecture need; adding them would be speculative.

### Index

```sql
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_cancel
  ON shipments (carrier_cancel_status, next_reconciliation_at)
  WHERE carrier_cancel_status IN
    ('PENDING', 'IN_PROGRESS', 'UNKNOWN', 'RETRY', 'RECONCILIATION_REQUIRED');
```

The optional outbox uniqueness defense-in-depth index was **not** created (deferred to B.3.5 per the lock).

### Migration safety

No `DROP COLUMN` · No `DROP TABLE` · No destructive `ALTER` · No data rewrite · No blocking backfill · No rewrite of existing shipment rows. `recovery_status VARCHAR(24)` was **not** widened and has **no** CHECK constraint (unchanged).

### Idempotency / fresh-vs-existing results

- Fresh DB (all migrations incl. 0049): **SUCCESS**
- Re-executed `0049` twice directly: **SUCCESS**, no duplicate columns (still exactly 6 `carrier_cancel%` columns) and still exactly 1 `idx_shipments_carrier_cancel`.

Verified live in `m73b31-carrier-cancel-schema.postgres.spec.ts` (B31-P-01, B31-P-05).

---

## Schema (Drizzle)

**File:** `apps/api/src/modules/orders/shipment.schema.ts` (the canonical shipment table, re-exported by `apps/api/src/drizzle/schema.ts`). Added `boolean` to the `drizzle-orm/pg-core` import and the 8 columns:

```ts
carrierPickupId: varchar('carrier_pickup_id', { length: 200 }),
pickupScheduled: boolean('pickup_scheduled').notNull().default(false),
carrierCancelStatus: varchar('carrier_cancel_status', { length: 24 }),
carrierCancelError: text('carrier_cancel_error'),
carrierCancelErrorClass: varchar('carrier_cancel_error_class', { length: 40 }),
carrierCancelRetries: integer('carrier_cancel_retries').notNull().default(0),
carrierCancelAttemptedAt: timestamp('carrier_cancel_attempted_at', { withTimezone: true }),
carrierCancelIdempotencyKey: varchar('carrier_cancel_idempotency_key', { length: 120 }),
```

Nullability, varchar lengths, timestamp/integer typing and defaults mirror the SQL exactly. No unrelated shipment field changed.

---

## Types / State Model / Helpers

**File:** `apps/api/src/modules/shipping/shipping.types.ts`

### Canonical `carrier_cancel_status` vocabulary (all ≤ VARCHAR(24))

| State | Len |
| --- | --- |
| `PENDING` | 7 |
| `IN_PROGRESS` | 11 |
| `SUCCEEDED` | 9 |
| `FAILED` | 6 |
| `UNKNOWN` | 7 |
| `NOT_REQUIRED` | 12 |
| `RECONCILIATION_REQUIRED` | 23 |
| `RETRY` | 5 |

Modeled as a dedicated `CarrierCancelStatus` type + `CARRIER_CANCEL_STATUSES` const, independent from `CarrierCreateStatus` (note: cancellation uses `SUCCEEDED`, creation uses `SUCCESS` — deliberately different lifecycles). `assertCarrierCancelStatus()` mirrors `assertCarrierCreateStatus()`. **No transition table** was added (state machine execution is a later B.3 phase).

### Recovery tokens (written to `recovery_status VARCHAR(24)`)

`CANCEL_UNKNOWN` · `CANCEL_TIMEOUT` · `CANCEL_FAILED` · `CANCEL_RECONCILE` · `DELIVERED_AFTER_CANCEL` — all ≤ 24 chars, namespaced so they never collide with create-flow recovery values. Exposed as `CARRIER_CANCEL_RECOVERY_TOKENS` / `CarrierCancelRecoveryToken`. `CARRIER_CANCEL_NOT_SUPPORTED` (28 chars) was **rejected** per the lock; unsupported cancellation is represented by `NOT_REQUIRED` status instead.

### Idempotency key

```ts
generateCarrierCancelIdempotencyKey(shipmentId) => `carrier-cancel:${shipmentId}`
```

Deterministic, no random UUIDs, distinct from the create key `carrier-create:${shipmentId}`; fits VARCHAR(120).

`NOT_REQUIRED` lives on `carrier_cancel_status`, never on `recovery_status`, as required.

---

## Tests

### New — unit (`m73b31-carrier-cancel-state.spec.ts`) — 8 passed

B31-U-01 vocabulary · U-02 width · U-03 create/cancel independence · U-04 recovery tokens · U-05 NOT_SUPPORTED rejected · U-06 validator accept/reject · U-07 key deterministic+prefixed · U-08 key distinct from create.

### New — PostgreSQL (`m73b31-carrier-cancel-schema.postgres.spec.ts`) — 6 passed

B31-P-01 columns exist · P-02 exact types/nullability/defaults · P-03 partial index + predicate · P-04 `recovery_status` still VARCHAR(24) with no CHECK · P-05 idempotent re-run (no duplicate objects) · P-06 a new shipment is behaviorally inactive (`pickup_scheduled=false`, `carrier_cancel_retries=0`, all other cancel fields `NULL`).

### Regression (run for this phase)

| Suite | Result |
| --- | --- |
| B.1 `m73b1-cancellation-concurrency.postgres.spec.ts` | **14 / 14 PASS** |
| B.2 `m73b2-merchant-cancellation.postgres.spec.ts` | **21 / 21 PASS** (incl. EO-B2-01 exactly-once shipment cancel + outbox) |
| M7.2.3-C `m723c-carrier-operations.postgres.spec.ts` | **11 / 11 PASS** (shipment schema + 0045 introspection) |
| `src/__tests__/unit/shipping/*` | **384 / 385** — 1 timeout flake (see below); the full shipping unit suite passes in isolation |

### TypeScript / Build

| Check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | **0 errors** |
| `pnpm exec nest build` | **PASS** — 258 files compiled, 0 issues |

---

## Pre-existing / Environment Failure (proven unrelated)

`webhook-rate-limiting.spec.ts > CarrierWebhookController imports ThrottlerGuard` timed out at 5000 ms during the parallel folder run, then **passed 18/18 in isolation** (that Nest `Test.createTestingModule().compile()` case runs ~1.6 s, near the per-test timeout under load). It is a Nest module-compile timing flake. Root cause is unrelated to this phase: B3.1 touched only shipment columns and pure types/helpers — no webhook, controller, guard, provider, worker, or module file. No unrelated test or production code was modified to force green.

---

## Scope Compliance

Explicitly confirmed that **no B.3.2+ behavior** was introduced:

- No provider changes · No `canCancelPickup` · No `cancelPickup`/`cancelShipment` implementation · No `handleCancel` change · No `shipping.carrier.cancel` publication · No carrier worker routing · No reconciliation change · No tracking-poller change · No delivered-after-cancel handling · No admin-recovery change · No public API · No retry/circuit-breaker change · No returns/RTS/refunds/payments/disputes/notifications change.

`git status` shows only: 2 modified source files (`shipment.schema.ts`, `shipping.types.ts`), the new `0049` migration, 2 new test specs, and the 2 pre-existing B.3 planning docs. Nothing else.

---

## Known Limitations

- Live Aramex sandbox `CancelPickup` semantics remain **REQUIRES EXTERNAL CARRIER VERIFICATION** (deferred to B.3.6, unchanged from B.3.0). B.3.1 does not call any carrier API.
- PostgreSQL specs ran successfully via `testcontainers` in this environment; if Docker/testcontainers is unavailable they fall back to the direct `localhost:15432` container, matching the M7.2.3-C hybrid strategy.

---

## Final Gate

```text
PASS
```

**Ready for M7.3-B.3.2.**

All 23 acceptance criteria met: migration `0049` exists, additive, fresh-DB safe, existing-DB safe, idempotent; pickup fields exist; carrier-cancel fields exist; state vocabulary and recovery tokens match B.3.0; partial cancellation index exists; existing/new shipment rows remain behaviorally inactive; no fake pickup data, no carrier HTTP, no provider/worker/reconciliation/tracking behavior change; B.1 and B.2 regression green; TypeScript clean; build clean; no unrelated production behavior changed; this report complete.

Final status:

```text
M7.3-B.3.1 — IMPLEMENTATION COMPLETE
```

Awaiting independent review / runtime verification before proceeding to B.3.2.
