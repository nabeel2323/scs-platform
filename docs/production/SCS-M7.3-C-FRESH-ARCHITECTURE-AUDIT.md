# SCS-M7.3-C — FRESH PRE-IMPLEMENTATION ARCHITECTURE AUDIT

## Returns — Inventory Return-to-Stock + RTS Physical Handling

| Field | Value |
|-------|-------|
| Milestone | M7.3-C |
| Phase | Fresh Pre-Implementation Architecture Audit |
| Type | READ-ONLY GOVERNANCE AUDIT |
| Governing Baseline | `develop` @ `229949f934f6bfe447d4bce600a84fcbfe4dc365` (verified, clean tree) |
| Predecessor Milestone | M7.3-B.6 — Ship-Ops Visibility — CLOSED / PASS |
| Historical (superseded) Audit | SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md (against B.5 `5c6649d`) |
| Historical (superseded) Lock | SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md (against B.5 `5c6649d`) |
| Verdict | **GO WITH CONDITIONS** |
| Implementation | STRICTLY FORBIDDEN IN THIS PHASE |
| Next Gate | M7.3-C Business Rules + Architecture Decision Lock (NOT implementation) |

---

## 1. Audit Identity

This document is a **fresh, evidence-based re-audit** of M7.3-C against the **actual post-B.6 repository state**. It is required because the M7.3-B.6 release closure explicitly mandated a fresh M7.3-C audit, and because B.6 advanced the repository baseline beyond the `5c6649d` (B.5) baseline on which the historical M7.3-C audit and lock were authored.

This audit does **not** treat the historical documents as authoritative. Every historical decision is independently re-validated against current code in §5 and §6 and classified as **RETAINED / REVISED / REJECTED / NEW**.

The purpose is to establish a defensible architecture baseline from which the next governance phase (Decision Lock) can operate. It resolves **no** business decisions by fiat; it enumerates them.

---

## 2. Read-Only Statement

This phase produced exactly one artifact — this document. During the audit:

```text
No production code was modified.
No tests were modified.
No migration was created.
No database schema was changed.
No configuration was changed.
No endpoint was added or modified.
No UI / mobile / seed data was changed.
No proposed fix was implemented.
The Business Rules + Architecture Decision Lock was NOT created.
M7.3-C implementation was NOT started.
No unresolved business decision was silently resolved through code.
```

Discrepancies found in existing documents (see §3.3) are **recorded here, not silently edited**, per brief §2.

---

## 3. Current Repository Baseline

### 3.1 Verified git state

Commands executed against `scs-platform`:

```bash
git branch --show-current   # develop
git rev-parse HEAD          # 229949f934f6bfe447d4bce600a84fcbfe4dc365
git status --short          # (empty — clean working tree)
git log -10 --oneline
```

| Item | Value |
|------|-------|
| Branch | `develop` |
| Actual HEAD | `229949f934f6bfe447d4bce600a84fcbfe4dc365` |
| HEAD subject | `feat(shipops): add Admin Ship Operations console and carrier recovery page` |
| Working tree | **CLEAN** |
| HEAD ↔ origin | `HEAD -> develop, origin/develop` (pushed) |

Recent history (newest first):

```text
229949f  feat(shipops): add Admin Ship Operations console and carrier recovery page   ← ACTUAL post-B.6 HEAD
d554fd7  docs(production): add SCS B2B API UI parity and feature completeness matrices ← documented "B.6 baseline"
5c6649d  fix(tests): update OUT_FOR_DELIVERY cancel tests (B.5)                         ← historical M7.3-C baseline
f6b7b22  fix(api): allow cancellation of OUT_FOR_DELIVERY orders (B.5)
...
0d3eb70  feat(api): M7.3-B.5 RTS + Reconciliation implementation
```

### 3.2 Baseline discrepancy (brief §3 — must be recorded, not assumed)

The B.6 Release Closure documented its baseline as `d554fd7`. The **actual current HEAD is `229949f`**, whose parent is `d554fd7`. Therefore:

- `d554fd7` is a **documentation-only commit** (adds matrices, completeness report, roadmap, B.5/B.6 governance docs, and the two historical M7.3-C documents). It contains **no application code**.
- `229949f` is the **actual B.6 code commit** and lands **after** the documented baseline.

Consequence: the "post-B.6 repository" that M7.3-C must target is `229949f`, which is a **superset** of the `d554fd7` state recorded in the B.6 closure. Any M7.3-C reasoning anchored on `d554fd7` would omit the shipped Ship-Ops code. This audit is anchored on `229949f`.

### 3.3 What B.6 (`229949f`) changed that is relevant to M7.3-C

Relevant files in the `229949f` diff (44 files, +5566 / −156):

| File | Δ | M7.3-C relevance |
|------|---|------------------|
| `apps/api/src/modules/orders/orders.service.ts` | +35 / − | Added `BUYER_INTERNAL_EVENT_TYPES` (L911-916) and buyer-projection filtering in `getTracking()`. This is the **only** server-side behavior change touching the RTS/exception area. |
| `apps/api/src/modules/shipping/shipment-operations.controller.ts` | +234 | Added `GET /v1/shipments` list + `GET /v1/shipments/:id` detail; route-prefix fix. New read surfaces M7.3-C may reuse for UI. |
| `apps/api/infra/drizzle/seed-pg.ts` | +3 | Granted `fulfillment:shipments:read` to ADMIN fulfillment role. |
| admin `shipments/page.tsx`, `shipments/[id]/page.tsx`, `shipops.ts` | new | Admin Ship-Ops console — candidate host for return entry UI. |
| web `merchant/deliveries/page.tsx`, `merchant/deliveries/[id]/page.tsx` | new | Merchant deliveries console — candidate host for merchant return entry. |
| web `orders/[id]/page.tsx`, `buyer-api.ts` | mod | Buyer tracking projection (B.6 leak remediation surface). |

**No inventory movement, settlement, reservation, or RTS transition logic was changed by B.6.** The RTS lifecycle and the inventory ledger behave identically to the B.5 baseline for M7.3-C purposes; the material change is **read/visibility**, plus the **baseline itself moved**.

---

## 4. Authoritative Documents

| Document | Role | Baseline it reflects | Status |
|----------|------|----------------------|--------|
| This audit | Current post-B.6 architecture truth | `229949f` | Fresh |
| SCS-M7.3-B.6-RELEASE-CLOSURE.md | Predecessor closure; mandates fresh M7.3-C audit | `d554fd7` (docs) | CLOSED / PASS |
| SCS-B2B-FRAMEWORK-ROADMAP.md | M7.3-C / R1 = "Returns Loop" | post-B.6 | Current |
| SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv | Feature state F-001..F-085 | post-B.6 | Current |
| SCS-B2B-API-UI-PARITY-MATRIX.csv | API↔UI parity | post-B.6 | Current |
| SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html | Framework completeness | post-B.6 | Current |
| SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md | **Historical** audit | B.5 `5c6649d` | Historical input only |
| SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md | **Historical** lock | B.5 `5c6649d` | Historical input only — **NOT authoritative here** |

The historical lock is treated as an **input**, not a constraint. It says "LOCKED" against a baseline that is now two commits behind HEAD and built on an inventory premise revised in §10.

---

## 5. Historical M7.3-C Audit Comparison

The historical audit (against `5c6649d`) concluded **GO WITH CONDITIONS** with 8 Open Business Decisions (OBD-001..008), 3 ADRs, 8 conditions, 8 risks (R-01 double adjustment, R-02 LOST inflation, R-05 wrong warehouse flagged HIGH).

| Historical finding | Still valid? | Post-B.6 evidence | Action |
|--------------------|--------------|-------------------|--------|
| RTS FSM = OPEN→RTS_PENDING→RTS_IN_PROGRESS→RTS_COMPLETED→CLOSED | YES | `EXCEPTION_TRANSITIONS` L925-933 unchanged | RETAIN |
| `completeRTS()` performs **no** inventory movement | YES | L2475-2573: only status flip + events/outbox | RETAIN |
| `RETURN` exists in DB vocabulary/constraint | YES | `0020` CHECK L33-35 | RETAIN |
| `RETURN` has **no** operational implementation | YES | grep: `movementType:'RETURN'` → 0 writes in `apps/api/src` | RETAIN |
| No new order status needed for return | YES | `TRANSITIONS` L3333-3350 has no RETURNED | RETAIN |
| Warehouse must be traced from original reservation | YES | RESERVE movement carries `inventoryItemId` L3090 | RETAIN |
| Condition can live in `stock_movements.metadata` (no schema change) | YES | `metadata` JSONB NOT NULL, inventory.schema L38 | RETAIN |
| Recommended model: **RETURN = +qty_on_hand, no migration** | **NO / CHANGED** | RTS goods are **reserved, not sold** — see §10 | **REVISE (core)** |
| LOST must produce zero inventory movement | YES (intent) | LOST stops at RTS_IN_PROGRESS, never auto-completes, no movement L2580-2734 | RETAIN + sharpen |
| Baseline for the audit = `5c6649d` | **CHANGED** | Actual HEAD `229949f` | REVISE (re-baselined) |

Net: most **structural** observations survive; the single **semantic** recommendation (RETURN = +qty_on_hand) does **not** survive scrutiny of the actual reservation/settlement mechanics, and is elevated into the central revision in §10 and blocking decision BCF-001.

---

## 6. Historical Lock Comparison

The historical lock (BD-C0-001..008, ADR-C0-001..003) is re-audited item by item.

| Historical item | Current evidence | Still valid? | Reason | Required action |
|-----------------|------------------|--------------|--------|-----------------|
| **BD-C0-001** Order status unchanged; no RETURNED; stays OUT_FOR_DELIVERY | `TRANSITIONS` L3333-3350; `RTS_ACTIVE_STATES` L903 | YES | Return is a shipment/inventory concern; FSM confirms no return edge exists | **RETAIN** |
| **BD-C0-002** Return is a separate explicit op (`POST /v1/shipments/:id/return`), not an auto side-effect of `completeRTS` | `completeRTS` L2475-2573 has no inventory hook | YES (architecturally sound) | Endpoint design remains valid; contents depend on §10 outcome | **RETAIN** (mechanism), revisit payload semantics |
| **BD-C0-003** LOST creates NO movement; cancellation is the release authority | LOST flow stops at RTS_IN_PROGRESS L2670; no movement | YES | Confirmed no movement path for LOST | **RETAIN** (sharpen: define LOST terminal) |
| **BD-C0-004** DAMAGED physically returns → **RETURN movement increments qty_on_hand** | Settlement L3138-3266; reservation L3036-3114 | **NO** | Goods were **never removed from qty_on_hand** (SALE fires only at DELIVERED, which RTS never reaches). Incrementing on_hand **inflates** stock | **REVOKE / REVISE** → see §10, BCF-001 |
| **BD-C0-005** Cancellation nets RETURN: `outstanding = RESERVE − RELEASE − SALE − RETURN` | Netting L3161-3172 handles only RESERVE/RELEASE/SALE; RETURN → `delta=0` → **skipped** | **PARTIAL** | The formula the lock assumed is **not** what the code does; RETURN is ignored today. If return uses RELEASE semantics, the **existing** netting already prevents double release | **REVISE** — movement type determines whether code change is needed |
| **BD-C0-006** Partial / item-level return | `orderItems` has **no** qty_returned column (schema L74-90) | OPEN | Feasible only via metadata or a new column | **REVISE / re-decide** (BCF-004) |
| **BD-C0-007** Return quantity stored in `stock_movements.quantity` | `quantity` integer NOT NULL, signed (schema L33) | YES | Column exists and supports signed amounts | **RETAIN** |
| **BD-C0-008** Return condition stored in `stock_movements.metadata` JSONB | `metadata` JSONB NOT NULL default {} (schema L38) | YES | No schema change needed | **RETAIN** |
| **ADR-C0-001** Separate endpoint over auto-trigger | consistent with `completeRTS` today | YES | Preserves LOST-without-return + condition input timing | **RETAIN** |
| **ADR-C0-002** No migration; existing schema sufficient | Constraint already allows RETURN/CANCEL; metadata available | YES **for the chosen vocabulary**, but the "sufficient" claim assumed the flawed on_hand model | Migration-avoidance is still achievable | **RETAIN (conditionally)** — see §20 |
| **ADR-C0-003** Reservation-traced warehouse routing | RESERVE movement → `inventoryItemId` → warehouse | YES | Mechanism confirmed | **RETAIN** |

**Historical lock verdict:** 5 decisions RETAINED as-is (BD-C0-001, 002, 003, 007, 008) plus 3 ADRs retained conditionally; **2 REVISED** (BD-C0-005 netting dependency, BD-C0-006 partial); **1 REVOKED/REVISED as materially incorrect** (BD-C0-004, the RETURN=+qty_on_hand premise). The lock's "GRANTED implementation authorization" is **void** because its baseline moved and its central inventory assumption does not hold.

---

## 7. Current Architecture (post-B.6 snapshot)

Two independent state machines govern the return area:

```text
Order FSM          (orders.status)            — TRANSITIONS, orders.service L3333-3350
Exception FSM      (shipments.exception_status) — EXCEPTION_TRANSITIONS, L925-933
Inventory ledger   (stock_movements + inventory_items counters)
```

Key structural facts (all verified in code):

- A **shipment** is the aggregate root for delivery exceptions and RTS. `shipments` carries `storeId` (not `warehouseId`) and `orderId` (shipment.schema L44-45). There is **no warehouse column on shipments**.
- Stock is reserved **per (variant, warehouse)** in `inventory_items` (unique pair), never per order directly. Orders link to stock only through `stock_movements` rows keyed by `referenceType='ORDER'` + `referenceId=orderId` + `inventoryItemId`.
- `qty_available` is a **generated column** `= qty_on_hand − qty_reserved` (intentionally omitted from the Drizzle table; declared only in SQL `0005`). Writes go to `qty_on_hand` / `qty_reserved`; availability is derived.

---

## 8. RTS Architecture (current, verified)

RTS request → approve → complete chain, as it exists today:

```text
OPEN ──(RTS request)──▶ RTS_PENDING ──(approve)──▶ RTS_IN_PROGRESS ──(completeRTS)──▶ RTS_COMPLETED ──▶ CLOSED
  ▲                        │
  └──────(reject)──────────┘        (EXCEPTION_TRANSITIONS L925-933)
```

- **`completeRTS()`** (L2475-2573): guarded to `RTS_IN_PROGRESS`; atomic optimistic flip `.where(exceptionStatus='RTS_IN_PROGRESS').returning()`; idempotent when already `RTS_COMPLETED`; inserts one `shipment_events(RTS_COMPLETED)` + one `outbox(shipment.rts_completed)`. **No inventory effect.** Roles: MERCHANT_OWNER/STAFF/MANAGER + ADMIN/SUPER_ADMIN/MODERATOR (L2481-2485); tenant-checked via `assertShipmentAccessibleForException`.
- **`requestAndApproveLostRTS()`** (L2580-2734): **admin-only**, mandatory investigation notes, atomic `OPEN→RTS_PENDING→RTS_IN_PROGRESS`; emits `RTS_REQUESTED`+`RTS_APPROVED` events and matching outbox. **It stops at `RTS_IN_PROGRESS`, not `RTS_COMPLETED`.** No inventory.
- **RTS_ACTIVE_STATES** = `[RTS_PENDING, RTS_IN_PROGRESS, RTS_COMPLETED]` (L903) — used to block retry/delivery while an RTS is in flight.
- **CANCELLABLE_EXCEPTION_STATES** includes `RTS_COMPLETED` (L921-923) — an order can still be **cancelled after** the RTS completed. This is the structural basis of Race A (§9).
- **B.6 filter**: `BUYER_INTERNAL_EVENT_TYPES = {RTS_REQUESTED, RTS_APPROVED, RTS_REJECTED, RTS_COMPLETED}` (L911-916) are **excluded from the buyer tracking projection**; buyers instead see a derived state via `buyerDeliveryNote()`.

Implication for M7.3-C: the RTS lifecycle is a **clean seam**. A return operation can hang off `RTS_COMPLETED` (or the admin LOST terminal) **without** touching RTS transitions — matching BD-C0-001/002.

---

## 9. Inventory Architecture (current, verified)

Movement vocabulary (DB-enforced, `0020` L33-35):

```text
('ADJUST','RESERVE','RELEASE','SALE','CANCEL','IMPORT','RETURN')
sign convention (0005 / 0020 comments): positive = in, negative = out
```

Which types are actually **written by production code** (grep across `apps/api/src`, definitive):

| Type | Written? | Where | Counter effect |
|------|----------|-------|----------------|
| `RESERVE` | YES | reserveStock L3091; inventory.service L354 | `qty_reserved +=` (movement qty **negative**) |
| `RELEASE` | YES | settleStockForStatus L3209/3254; inventory.service L393 | `qty_reserved −=` (movement qty positive) |
| `SALE` | YES | settleStockForStatus L3209/3254 | `qty_on_hand −=`, `qty_reserved −=` (movement qty negative) |
| `ADJUST` | YES | inventory.service L209/298/470/496 | `qty_on_hand ±` |
| `IMPORT` | YES | inventory.service L174 | `qty_on_hand +=` |
| **`RETURN`** | **NO** | — (vocabulary/constraint only) | — |
| **`CANCEL`** | **NO** | — (vocabulary/constraint only) | — |

**Both `RETURN` and `CANCEL` are defined-but-unused.** Per brief §8, this distinction is explicit: they exist as vocabulary/constraint with **no operational implementation**.

Reservation mechanics — `reserveStock()` (L3036-3114):
- Loads the store's warehouses `.where(eq(warehouses.storeId, storeId))` — a store may have **many** warehouses (L3042-3045, no unique on storeId).
- For each order line, iterates warehouses; `SELECT ... FOR UPDATE` locks the matching `inventory_items` row (L3058-3072).
- `available = qtyOnHand − qtyReserved`; `qtyToReserve = min(item.quantity, available)` (L3076-3077).
- `qtyReserved += qtyToReserve` (**qty_on_hand untouched**), then writes `RESERVE` movement `{inventoryItemId: locked.id, quantity: -qtyToReserve, referenceType:'ORDER', referenceId: orderId}` and **breaks at the first warehouse with stock** (L3080-3099).

Settlement mechanics — `settleStockForStatus()` (L3138-3266):
- Early-return unless `toStatus ∈ {CANCELLED, REJECTED, DELIVERED}` (L3144-3146).
- Reads the order's own `stock_movements` and nets per `inventoryItemId` (L3161-3172):
  ```typescript
  if (type === 'RESERVE') delta = quantity;
  else if (type === 'RELEASE' || type === 'SALE') delta = -quantity;
  if (delta === 0) continue;            // RETURN / CANCEL / ADJUST / IMPORT fall through
  ```
  i.e. **`RETURN` is silently ignored by the netting today** (delta 0 → continue).
- Outstanding>0 → `RELEASE` (cancel/reject) or `SALE` (deliver), each under `SELECT ... FOR UPDATE`, all inside the caller's tx when provided (L3174-3204) or a self-managed tx on the legacy path (L3219-3264).
- Idempotency is **netting-based**: a replayed transition recomputes `outstanding` from the ledger and becomes a no-op rather than a double release.

Callers: `REJECTED` (L819/990), `CANCELLED` (L1118), `DELIVERED` (L1718/3640).

---

## 10. Return Movement Analysis (the central fresh finding)

**The historical premise `RETURN = +qty_on_hand` is invalid for the in-scope RTS case.** Trace the real ledger for an order that reaches RTS:

```text
acceptOrder        → RESERVE:   qty_reserved += n     qty_on_hand  unchanged   (SALE not yet)
outForDelivery     → (no settlement; SALE is deferred to DELIVERED only)
delivery exception → order STAYS OUT_FOR_DELIVERY     SALE never fires
RTS lifecycle      → goods physically come back; qty_on_hand STILL contains them
```

At `RTS_COMPLETED`, for the goods being returned:
- `qty_on_hand` **still includes them** (the SALE decrement never happened, because SALE fires only at `DELIVERED`, which an RTS order by definition never reaches).
- `qty_reserved` **still holds them** (the reservation is outstanding).
- `qty_available` is **suppressed** by that outstanding reservation.

Therefore, an incrementing `RETURN` (`+qty_on_hand`) would **add stock that was never removed → inventory inflation (double count).** The correct ledger consequence for an in-scope (pre-SALE) physical return is a **release of the outstanding reservation** — raising `qty_available` back — which is precisely the `RELEASE`/`CANCEL` semantic family, **not** the post-sale `RETURN` family.

This reading is corroborated by the codebase's own vocabulary definition (`0005` comments):

```text
CANCEL — order cancelled after shipment started (return)   ← matches RTS (pre-sale physical return)
RETURN — customer return restocked                          ← matches post-DELIVERED restock (M7.3-E, OUT of scope)
```

Consequences the lock did not anticipate:

1. **Movement-type selection is now a blocking decision (BCF-001).** Options with distinct ledger effects:
   - **(a) RELEASE** — `qty_reserved −=`, mirrors cancellation. If chosen, the **existing** `settleStockForStatus` netting **already** nets a RELEASE against a later cancellation → **no double release, no code change to the netting.**
   - **(b) CANCEL** — same counters as RELEASE today but a distinct audit label; **not** handled by the netting (delta 0 → skipped) → would require extending netting to include CANCEL or cancellation double-releases.
   - **(c) RETURN (+qty_on_hand)** — the historical choice — **inflates on_hand for pre-sale goods** and is **not** netted by cancellation. Requires both a netting change **and** a compensating SALE to be correct, contradicting ADR-C0-002's "no migration / no complication" intent.
2. **BD-C0-005's netting formula is not implemented and may be unnecessary.** The lock assumed `outstanding = RESERVE − RELEASE − SALE − RETURN`. The code nets only RESERVE/RELEASE/SALE. If returns use **RELEASE** (option a), the interaction with cancellation is **already** correct without touching the netting. If returns use RETURN/CANCEL (b/c), the netting **must** be extended or double-release/inflation occurs.
3. **"No migration" (ADR-C0-002) is still achievable** — a RELEASE-based return writes only existing columns (`stock_movements` + counters), condition in `metadata`, quantity in `quantity`. Migration-avoidance survives; it simply no longer requires `RETURN`-on-`qty_on_hand`.

This is why the audit **cannot** simply re-ratify the historical lock. The physical-return semantics must be **re-decided**, which is exactly the job of the next (Decision Lock) phase — surfaced here, not resolved here.

---

## 11. LOST Analysis

- Current flow: admin `requestAndApproveLostRTS` drives LOST exceptions to **`RTS_IN_PROGRESS` and stops** (L2670). There is no code path that completes a LOST RTS with a physical restock; `completeRTS` is generic and could be called, but nothing in the LOST flow does so.
- LOST means the package is **unrecoverable** — no physical goods return. Therefore **zero inventory movement is correct** (BD-C0-003 retained). A RETURN/RELEASE for LOST would inflate or mis-release stock.
- **Open question sharpened by this audit:** because goods were reserved-not-sold and LOST creates no movement, the **reservation stays outstanding indefinitely** until a cancellation or manual adjustment releases it. The historical lock said "cancellation is the release authority" (RETAINED), but left the **terminal state of a LOST that is never cancelled** undefined. Enumerated as **BCF-003**.
- **Race E (LOST RTS vs physical return)**: SAFE *provided* M7.3-C refuses to author a physical-return movement for a LOST exception. The guard must be explicit (reject `POST /return` when `exceptionType='LOST'`), because nothing in the current FSM structurally prevents `completeRTS` on a LOST. Blocking condition **C-LOST**.

---

## 12. DAMAGED Analysis

- Historical BD-C0-004 said DAMAGED goods return as `RETURN (+qty_on_hand)` with condition in metadata. The **condition-in-metadata** part is architecturally fine (schema supports it). The **+qty_on_hand** part inherits the inflation defect of §10 — DAMAGED RTS goods were also reserved-not-sold, so on_hand was never reduced; incrementing is double-counting.
- Condition vocabulary (`GOOD / DAMAGED / DEFECTIVE / UNSALEABLE`) is **representable without schema change** as metadata; nothing enforces or forbids it in code today.
- **Deeper disposition question the model must answer:** should a DAMAGED/UNSALEABLE return land back in *sellable* availability at all? A RELEASE-based return **does** raise `qty_available`, making the unit resellable — which contradicts "damaged/defective/unsaleable". Options (documented, not chosen, per brief §11):
  - (a) RELEASE reservation + a following ADJUST-out for non-sellable units (two-movement, honest accounting),
  - (b) keep condition purely as metadata and accept that "return-to-stock" means "return-to-available" for GOOD, deferring write-off to a later milestone,
  - (c) a distinct non-sellable location/holding (new model — explicitly discouraged "merely for convenience").
- Enumerated as **BCF-002**. Blocking, because it determines whether M7.3-C is one movement or a movement pair, and whether "return-to-stock" and "return-to-available" diverge.

---

## 13. Quantity / Partial Return Analysis

Current data model (verified):

```text
order_items   : quantity (NOT NULL), qtyConfirmed (nullable), NO qty_returned   (schema L74-90)
shipments     : no line-level quantity columns
inventory_items: (variant,warehouse) counters
stock_movements: signed integer quantity + inventoryItemId + metadata
```

- There is **no first-class return-quantity** anywhere. Partial/item-level return (BD-C0-006) is therefore representable **only** via `stock_movements.quantity` (one movement per returned item line) — which is sufficient for full and partial returns **without a migration**.
- **Full vs partial** is a policy decision, not a schema constraint. Per brief §12, partial return is **not yet sufficiently defined** (no cumulative cap enforcement; no place that records "already returned" per line, so double-return-of-the-same-line is only caught by metadata inspection, not by a column). Marked **BLOCKING (BCF-004)**.
- Idempotency for partial returns needs a stable reference (the lock proposed "matching reference" in BD-C0-002); today `referenceType='ORDER'`+`referenceId=orderId` is the only linkage — it does **not** distinguish shipment or line, so duplicate-return detection needs a defined key. Enumerated in §26 R-DET.

---

## 14. Warehouse Resolution

- `shipments` has **no warehouse column**; `warehouses` are keyed by `storeId` with **no unique constraint** → a store may legitimately have **multiple** warehouses. Resolving "the warehouse" from the shipment/store alone is **ambiguous** (historical R-05 "wrong warehouse", HIGH).
- A **deterministic** origin exists: the `RESERVE` movement stores `inventoryItemId` (L3090), and `inventory_items` is unique on `(variant_id, warehouse_id)`. So `order → RESERVE movement → inventoryItemId → warehouse_id` yields the exact warehouse the goods were reserved from.
- **Caveat the lock under-specified:** reservation picks the **first warehouse with stock** (L3056-3099 `break`). Multi-warehouse orders can span warehouses across lines, and a line reserved from warehouse A must return to **warehouse A**, not the store default. Any return implementation **must** read the destination per `inventoryItemId`, never re-derive it from `storeId`.
- Historical ADR-C0-003 (reservation-traced routing) is **RETAINED and validated**, with the sharpened requirement above. **Non-blocking** architecturally (the data exists), but **blocking as a locked rule** so implementation cannot take the store-first shortcut. Enumerated **BCF-005**.

---

## 15. Order FSM Boundary

Question posed by brief §14: *Can return-to-stock be implemented without modifying the order FSM?*

**Answer: YES.** Evidence:

- `TRANSITIONS` (L3333-3350) has **no** RETURNED state, and `OUT_FOR_DELIVERY → [DELIVERED]` is its only forward edge; cancellation is a dedicated endpoint (L958-960), not an FSM edge. Return-to-stock does not require a new order status.
- RTS operates entirely on `shipments.exception_status`, a **separate** FSM from `orders.status`. A return can be recorded purely as (i) a `stock_movements` ledger entry and (ii) a `shipment_events`/`outbox` entry, with **zero** order-status change — fully consistent with BD-C0-001.
- The order already lives at `OUT_FOR_DELIVERY` through the whole RTS window; the buyer projection (post-B.6) deliberately hides `RTS_*` events (L911-916), so adding a return movement does not leak new states to the buyer.

**Constraint that must be preserved:** return must **not** silently unlock `OUT_FOR_DELIVERY → CANCELLED` differently than cancellation already behaves; because `RTS_COMPLETED` remains cancellable (L922), the return/cancel interaction (§10, Race A) is a **state-machine-adjacent** concern resolved at the ledger, not the FSM.

Order/master-order/shipment/exception FSMs therefore all remain **unmodified** by M7.3-C — RETAINED from the historical lock, independently reconfirmed.


---

## 16. Buyer RMA Analysis

Brief §15 requires a **fresh** scope decision on post-delivery buyer returns/RMA — not inherited from the historical document.

Investigation of current surfaces:

- Buyer order APIs and the tracking projection **hide** all `RTS_*` internal events (L911-916); buyers see only a derived delivery note. There is **no** buyer-facing "start a return" capability today.
- The order FSM offers no RETURNED/RETURN_REQUESTED state; `DELIVERED → [COMPLETED, DISPUTED]` and `COMPLETED → [DISPUTED]` are the only post-delivery edges (L3344-3345). Buyer dissatisfaction after delivery flows to **DISPUTED**, handled by the dispute subsystem — not a return subsystem.
- There is no RMA schema (no `returns`, `rma`, or `return_requests` table; grep of schemas shows none), no `qty_returned`, and no buyer return endpoint.
- Post-delivery restock is exactly the **`RETURN` (+qty_on_hand)** semantic — the one that is coherent **only after a SALE has decremented on_hand** — and it belongs to a completed/delivered order, i.e. the **M7.3-E** territory the historical lock itself placed OUT OF SCOPE.

Classification: **Buyer-initiated / post-delivery RMA is NOT supported** by the current architecture (no schema, no endpoint, no FSM edge, no UI). M7.3-C (physical return of **pre-delivery** RTS goods) does not require it.

Fresh scope recommendation: **EXCLUDE buyer RMA from M7.3-C** (defer to M7.3-E). Including it would demand new order states, buyer write endpoints, and the genuinely-correct `RETURN`-on-`qty_on_hand` accounting that is out of place for RTS. Recorded as **BCF-007**.

---

## 17. B.6 UI Impact

B.6 (`229949f`) shipped three consoles relevant to where a return action would live:

| Surface | Path (from diff) | Role for M7.3-C |
|---------|------------------|-----------------|
| Admin Ship-Ops console | `apps/admin/.../shipments/page.tsx`, `shipments/[id]/page.tsx`, `lib/shipops.ts` | Admin-side list/detail of shipments incl. exception state — natural host for an admin return action/confirmation. |
| Merchant Deliveries | `apps/web/.../merchant/deliveries/page.tsx`, `[id]/page.tsx`, `lib/shipops.ts` | Merchant-side fulfillment view — natural host for merchant return entry (condition/quantity). |
| Buyer Tracking | `apps/web/.../orders/[id]/page.tsx`, `lib/buyer-api.ts` | Projection deliberately hides `RTS_*`; must likewise hide raw return mechanics from buyers. |
| Admin carrier page | `apps/admin/.../carrier/page.tsx` | Not return-relevant. |

Assessment:

- **No existing RTS-completion UI** is present to reuse directly for a return — B.6 gives *read/visibility*, not a return action. The `RTS_COMPLETED` state is visible in the consoles, but there is no button/form that submits condition + quantity.
- Return condition and quantity entry points **do not exist** anywhere; they would be new form controls on the Admin or Merchant detail screen.
- Warehouse selection should be **automatic/resolved** (per §14), not a user dropdown, to avoid the store-first ambiguity.
- Whether **admin vs merchant** confirmation is required is a policy choice (**BCF-008**), mirrored by the fact that `requestAndApproveLostRTS` is admin-only while `completeRTS` is merchant-or-admin.
- Buyer visibility: a return, like RTS, should stay **internal**; the buyer projection filter list (L911-916) is the existing mechanism any new return event type would extend.

Minimal UI contract needed later: one entry point (merchant and/or admin shipment detail) that captures **condition per line + quantity per line**, submits to a return endpoint, renders the resolved warehouse read-only, and is gated by the same roles as `completeRTS`. **New UI is required; B.6 is not sufficient.**

---

## 18. Authorization / Tenant Isolation

Re-audited against the current (post-B.6) guard model — `completeRTS` L2480-2497 and `requestAndApproveLostRTS` L2585-2603:

| Actor | RTS complete | LOST direct | Return (proposed) |
|-------|--------------|-------------|-------------------|
| ADMIN / SUPER_ADMIN / MODERATOR | YES | YES (admin-only) | Should be YES (any store) |
| MERCHANT_OWNER / STAFF / MANAGER | YES (own store) | NO | YES (own store) |
| DRIVER | NO | NO | NO |
| BUYER | NO | NO | NO (see RMA §16) |

- Tenant enforcement is centralized in **`assertShipmentAccessibleForException(shipment, caller)`** (L2497/L2603, defined ~L2740): driver must be assigned, merchant must match the shipment's store org, admin bypasses. A return endpoint **must** reuse this exact guard to inherit correct isolation.
- `resolveActorType` (L937-945) maps roles to ADMIN/MERCHANT/DRIVER/BUYER/SYSTEM for event attribution — return events should reuse it.
- B.6 seed change granted `fulfillment:shipments:read` to ADMIN; **write** authority for returns is a separate permission the next phase must name (do not assume read implies write).
- Risk: introducing a return endpoint that checks only role (not store ownership) would bypass tenant isolation — mitigated by mandating reuse of the existing accessor guard (condition **C-10**).

Permissions are **not** changed by this audit; they are enumerated for the lock.

---

## 19. Events / Outbox / Audit

Current event plumbing a return must slot into (all verified in `completeRTS` L2544-2562 and LOST L2684-2721):

```text
shipment_events  : append-only, sequence-ordered, actorType + metadata
outbox_events    : eventType, aggregateId, payload, metadata{storeId}, status PENDING
BUYER_INTERNAL_EVENT_TYPES : projection filter (B.6) — hides RTS_* from buyers
```

Architectural placement:

- A return is a **shipment-scoped** consequence → its audit row belongs in `shipment_events` (a new `eventType`, e.g. `RETURN_PROCESSED`, name to be locked), with condition/quantity in `metadata`.
- Downstream (M7.3-D refunds) needs an **outbox** event (e.g. `shipment.return_processed`) carrying `shipmentId`, `orderId`, returned lines, condition — emitted **in the same transaction** as the movement for atomicity.
- Any new `RTS/RETURN_*` `shipment_events` type **must be added to the buyer-projection internal set** (L911-916) or it will leak to buyers, re-opening the exact B.6 defect that was just closed. This is a concrete, load-bearing dependency introduced by B.6 and is captured as **ACF-009 / C-09**.
- The milestone boundary is preserved: **M7.3-C emits the physical/inventory consequence events; M7.3-D consumes them for financial refund automation.** M7.3-C emits no refund/credit events.

---

## 20. Database / Migration Impact

Verdict: **No migration is required** for a RELEASE/RETURN-vocabulary model — but this must be tied to the movement-type decision.

Evidence:

- The `0020` CHECK (L33-35) **already permits** `RETURN` and `CANCEL`; writing either needs no DDL.
- `stock_movements` has a signed `quantity` (amount, BD-C0-007) and `metadata` JSONB (condition, BD-C0-008) → both representable without schema change.
- Warehouse is recoverable from existing `RESERVE` movements → no new FK/column needed.

Migration would become necessary **only if** the lock chooses to enforce partial returns with a first-class column:

- If cumulative-return caps must be enforced by the DB (not by scanning metadata), a migration adding e.g. `order_items.qty_returned` (integer NOT NULL default 0) — or a dedicated `shipment_return_lines` table (shipment_id, order_item_id, variant_id, warehouse_id, quantity, condition, created_at, unique(shipment_id, order_item_id)) — would be required.
- Any such migration must follow the house rules (idempotent DDL, no `_migration_log` writes, next free number `0051` after `0050_delivery_exceptions.sql`). **Not created here.**

Recommendation for the lock: prefer the **migration-free** path (metadata + movement-per-line) and only introduce `0051` if a hard cumulative cap is a locked requirement. Migration decision is therefore **conditional on BCF-004/BCF-006**.

---

## 21. API Contract Impact

Minimum contract for M7.3-C (specified, not implemented):

| Change | Endpoint | Classification |
|--------|----------|----------------|
| Return-to-stock action | `POST /v1/shipments/:id/return` | **NEW endpoint** (BD-C0-002/ADR-C0-001 retained) |
| Shipment detail enrichment | `GET /v1/shipments/:id` (B.6) | **EXISTING — possibly MODIFIED** to include return status |
| Buyer tracking | `getTracking()` | **EXISTING — MODIFIED only** to keep return events internal |

Contract fields the lock must fix for the new endpoint:

- **Authorization:** reuse `assertShipmentAccessibleForException`; merchant own-store, admin any.
- **Request:** per-line `orderItemId`/`variantId`, `quantity`, `condition` ∈ {GOOD,DAMAGED,DEFECTIVE,UNSALEABLE}; condition required (400 otherwise). Warehouse **not** accepted from caller (server-resolved).
- **State preconditions:** `exception_status = RTS_COMPLETED` **and** `exception_type ≠ LOST` (guard §11) **and** order not CANCELLED.
- **Transaction boundary:** movements + `shipment_events` + `outbox` atomically; `SELECT ... FOR UPDATE` on target `inventory_items`.
- **Idempotency:** defined natural key (shipment + line) → replay returns existing result, no duplicate movement.
- **Concurrency:** cancellation-wins precedence (B.5 rule) must reject/neutralize a return when cancellation commits first.
- **Error cases:** 404 shipment, 403 tenant, 409 wrong state / concurrent change / LOST, 400 missing condition/quantity or over-return.
- **Tenant scope:** store org enforced via accessor guard.
- **Audit/event:** see §19.

The exact **movement semantics** behind this endpoint depend on BCF-001 — the contract shell is stable, the ledger effect is not yet decided.

---

## 22. UI Contract Impact

| Surface | Need | Classification |
|---------|------|----------------|
| Merchant deliveries detail | Return entry form (condition + qty per line) | **NEW** control on existing B.6 page |
| Admin shipments detail | Return entry / confirmation | **NEW** control on existing B.6 page |
| Buyer order/tracking | No change; returns remain internal | **NO new UI** (projection filter reuse) |
| Driver / mobile | No return operation | **NO change** |

B.6 supplies **host pages** but **no return actions**; new UI is required, but it is additive on existing consoles rather than whole new screens. Admin-vs-merchant confirmation visibility keys off **BCF-008**.

---

## 23. Testing Architecture

Tests that **must exist** before M7.3-C is complete (defined here, **not written** in this phase):

Unit:
- condition validation (required, ∈ controlled vocabulary),
- quantity validation (> 0, ≤ outstanding per line),
- warehouse resolution from `inventoryItemId` (never store-first),
- LOST rejection guard,
- authorization (merchant own-store, admin cross-store, driver/buyer denied),
- idempotency (replay = no duplicate movement),
- movement-type ledger effect per BCF-001 decision (esp. no `qty_on_hand` inflation for pre-sale).

PostgreSQL integration (extends existing `stock-settlement.integration.spec.ts` / `m73b4-delivery-exceptions.postgres.spec.ts` patterns):
- real movement written + counters correct (`qty_available` generated value observed),
- full return, partial return (multi-line), duplicate return,
- LOST (zero movement), DAMAGED (per disposition model),
- **Race A**: return vs cancellation (assert cancellation-wins precedence and no double release),
- **Race B/D**: concurrent returns / return vs release,
- event + outbox atomicity (rollback removes both movement and events),
- tenant isolation.

E2E / Playwright: only after the §22 UI contract is locked; a merchant/admin return happy-path and a LOST-rejection path.

---

## 24. Business Decisions (fresh, enumerated — not resolved)

| ID | Question | Why it matters | Options | Recommended candidate | Blocking? |
|----|----------|----------------|---------|-----------------------|-----------|
| **BCF-001** | Which movement semantics for an **in-scope (pre-SALE) RTS return**? | Determines whether stock inflates and whether netting must change | (a) RELEASE reservation; (b) CANCEL label; (c) RETURN +qty_on_hand | **(a) RELEASE** (netting-safe, no on_hand inflation) | **YES** |
| **BCF-002** | Does DAMAGED/DEFECTIVE/UNSALEABLE return land in **sellable** availability? | A RELEASE makes goods resellable | (a) RELEASE + compensating ADJUST-out; (b) metadata-only; (c) separate holding | (a) or (b), pending finance intent | **YES** |
| **BCF-003** | Terminal state & reservation disposition for **LOST that is never cancelled**? | Reservation could linger indefinitely | (a) rely on cancel authority; (b) explicit LOST terminal releases | (a) reaffirmed + document terminal | **YES** |
| **BCF-004** | **Full-only vs partial** item-level return, and cumulative enforcement? | No qty_returned column today | (a) full only; (b) partial via movements; (c) partial + new column | (b) partial, movement-per-line | **YES** |
| **BCF-005** | Warehouse destination = **per-inventoryItemId**, never store-first? | Multi-warehouse mis-routing | rule (lock it) | Lock the deterministic rule | **YES** |
| **BCF-006** | Return **idempotency/duplicate** natural key? | Only ORDER-scoped reference exists today | (a) shipment+line; (b) request token | (a) shipment+line | **YES** |
| **BCF-007** | Include **buyer/post-delivery RMA** in M7.3-C? | Not supported; wrong accounting | (a) exclude→M7.3-E; (b) include | **(a) exclude** | **YES (scope)** |
| **BCF-008** | Return confirmation actor: merchant, admin, or both? | Mirrors LOST-admin-only vs RTS-either | (a) merchant+admin; (b) admin-gated | (a) merchant+admin, own-store | No (policy) |

---

## 25. Architecture Decisions (required before implementation)

| ID | Decision | Dependency |
|----|----------|-----------|
| **ACF-001** | Return transaction boundary: movements + events + outbox in one TX; `SELECT FOR UPDATE` on items | BCF-001 |
| **ACF-002** | Explicit separate endpoint vs auto-trigger (**retain**: separate, `POST /return`) | — |
| **ACF-003** | Movement design & **whether `settleStockForStatus` netting must change** (RELEASE → no change; RETURN/CANCEL → must extend, else double release/inflation) | BCF-001 |
| **ACF-004** | Condition/disposition model (metadata schema; optional ADJUST-out pairing) | BCF-002 |
| **ACF-005** | Warehouse resolution implementation (per `inventoryItemId`) | BCF-005 |
| **ACF-006** | Concurrency: optimistic shipment-state lock + FOR UPDATE + **cancellation-wins** precedence | BCF-001, §18 |
| **ACF-007** | Idempotency mechanism (natural key) | BCF-006 |
| **ACF-008** | Partial-return representation (movement-per-line; column only if enforced) | BCF-004, §20 |
| **ACF-009** | Event/outbox taxonomy **+ buyer-projection filtering** of any new internal event type | B.6 L911-916 |
| **ACF-010** | API boundary (§21) | BCF-001 |
| **ACF-011** | UI boundary (host on B.6 consoles) | BCF-008 |
| **ACF-012** | Order-FSM boundary: **no FSM change** (retain, §15) | — |

---

## 26. Risk Register (fresh)

| ID | Risk | Prob. | Impact | Subsystem | Mitigation | Blocking? |
|----|------|-------|--------|-----------|------------|-----------|
| **RCF-01** | **Inventory inflation** — RETURN +qty_on_hand on reserved-not-sold goods double-counts | High | High | inventory | Choose RELEASE semantics (BCF-001a) | **YES** |
| **RCF-02** | **Double release / mis-settlement** in return↔cancellation race | High | High | orders/inventory | RELEASE nets under existing settlement; else extend netting (ACF-003) | **YES** |
| **RCF-03** | **LOST mis-restock** — movement written for unrecoverable goods | Med | High | inventory | Explicit LOST guard on endpoint (§11, C-LOST) | **YES** |
| **RCF-04** | Wrong warehouse (store-first shortcut across multi-warehouse) | Med | Med (High if shortcut taken) | inventory | Resolve per `inventoryItemId` (BCF-005) | No |
| **RCF-05** | Damaged goods re-enter sellable availability | Med | Med | inventory | Disposition model (BCF-002) | No |
| **RCF-06** | Partial-return inconsistency / no cumulative cap | Med | Med | orders | Movement-per-line + validation (BCF-004) | No |
| **RCF-07** | Duplicate return (weak idempotency) | Med | Med | inventory | Natural key (BCF-006) | No |
| **RCF-08** | Tenant/auth bypass on new endpoint | Low | High | security | Reuse `assertShipmentAccessibleForException` | No |
| **RCF-09** | Scope creep into refunds | Med | Med | milestone | Enforce M7.3-C vs M7.3-D boundary | No |
| **RCF-10** | Reusing voided B.5-based lock assumptions | Med | High | governance | This fresh re-baseline; lock against `229949f` | Addressed |

**HIGH risks: 3** (RCF-01, RCF-02, RCF-03). RCF-04 escalates to HIGH if the store-first warehouse shortcut is chosen; RCF-10 is neutralized by this audit.

---

## 27. Scope Boundary (fresh)

### IN SCOPE (evidence-supported)
1. Physical return-to-stock for RTS-completed, **pre-SALE** shipments.
2. Movement-type semantics selection (BCF-001) and, if RELEASE, integration with existing settlement netting.
3. Return **quantity** per line via `stock_movements.quantity`.
4. Return **condition** via `stock_movements.metadata` (subject to BCF-002 disposition).
5. **Warehouse resolution** from the original reservation (`inventoryItemId`).
6. LOST = zero-movement handling with an explicit endpoint guard.
7. `shipment_events` + `outbox` emission for return audit; buyer-projection filtering.
8. Authorization (merchant own-store / admin any) + tenant isolation via existing guard.
9. Optimistic + pessimistic concurrency; cancellation-wins precedence.
10. Transactional atomicity (movement + events same TX).

### OUT OF SCOPE (each verified against current repo)
| Item | Reason / deferral |
|------|-------------------|
| Financial refunds / payment-provider / invoice / credit note | M7.3-D — no payment code touched by M7.3-C |
| Dispute financial settlement | Dispute subsystem, not return |
| Buyer-initiated / post-delivery RMA | **Not supported** (§16); defer to M7.3-E — BCF-007 |
| Post-DELIVERED restock (true RETURN +qty_on_hand) | Requires SALE-first; belongs with RMA/M7.3-E |
| New order/master-order/exception FSM states | Confirmed unnecessary (§15) |
| Reconciliation worker / scheduled jobs | No evidence required |
| Automatic redelivery, photo evidence, carrier return labels/shipping | No carrier return API; out of scope |
| Notification expansion | M7.3-F unless explicitly required |
| Migration (unless BCF-004/006 demand a column) | Prefer migration-free (§20) |

---

## 28. Implementation Conditions (must be resolved in the Decision Lock, NOT here)

```text
C-01  Resolve BCF-001 movement semantics BEFORE any code (inflation control).
C-02  Define BCF-002 DAMAGED/condition disposition (available vs non-sellable).
C-03  Define LOST terminal + explicit no-movement endpoint guard (RCF-03).
C-04  Decide BCF-004 full vs partial return + cumulative enforcement (drives §20).
C-05  Lock BCF-005 warehouse = per-inventoryItemId; forbid store-first shortcut.
C-06  Define BCF-006 idempotency natural key (shipment + line).
C-07  Reaffirm BCF-007 buyer RMA OUT of scope (or explicitly promote to M7.3-E).
C-08  Specify whether settleStockForStatus netting changes (ACF-003) — depends on C-01.
C-09  Define return event/outbox types AND add them to BUYER_INTERNAL_EVENT_TYPES (ACF-009).
C-10  Mandate reuse of assertShipmentAccessibleForException; name the write permission.
```

All ten are **governance/decision** conditions; none require code in this phase.

---

## 29. Final Audit Verdict

```text
VERDICT: GO WITH CONDITIONS
```

Rationale:

- **GO** because M7.3-C is architecturally feasible on the current post-B.6 repository **without** code/FSM changes, and in most likely configurations **without a migration**: the RTS lifecycle is a clean seam, `stock_movements` vocabulary + counters + metadata already support a correct return, warehouse is deterministically recoverable, and authorization/tenant primitives already exist to reuse.
- **WITH CONDITIONS** because the historical lock's central inventory premise (`RETURN = +qty_on_hand`) is **invalid for in-scope pre-SALE RTS returns** and, if implemented literally, would inflate stock (RCF-01). Movement semantics (BCF-001), LOST/DAMAGED handling, partial-return enforcement, warehouse rule, and idempotency are **blocking** and must be resolved in the next Decision Lock (C-01..C-10). They are enumerated here, **not** silently decided.
- **Not NO-GO** because no prerequisite work (schema, worker, FSM extension) is mandatory before M7.3-C; the defects are decision defects, not capability gaps.
- **Not GO** because real blocking business/architecture decisions remain open.

This audit **supersedes** the B.5-based historical audit and lock for baseline purposes; its historical content is retained only where individually re-validated in §5–§6.

---

## 30. Next Gate

```text
M7.3-C BUSINESS RULES + ARCHITECTURE DECISION LOCK
```

- The Decision Lock must **re-baseline against `229949f`**, resolve conditions **C-01..C-10**, and formally classify each BCF/ACF as LOCKED.
- It must explicitly **revoke** historical BD-C0-004's `RETURN = +qty_on_hand` effect and replace it with the decided semantics, and **void** the historical lock's implementation authorization.
- **No implementation, migration, endpoint, UI, or test may begin from this audit.** The four-gate sequence hard-stops here for user review; the next gate is the Decision Lock only.

---

*End of fresh architecture audit. Baseline `229949f`; working tree clean; no production code, tests, migrations, endpoints, or UI modified.*
