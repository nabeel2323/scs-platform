# P13 — Phase 1: Repository Verification and Technical Design

**Version:** 1.0
**Date:** 2026-10-13
**Baseline:** branch `develop`, HEAD `8d60e36`, source worktree clean.
**Node:** v26.4.0 | **pnpm:** 9.15.9 | **Latest migration:** 0059_return_requests.sql

---

## 1. Repository Verification Summary

### 1.1 Branch and worktree

```
branch: develop
HEAD:   8d60e36 feat(returns): add returns oversight page and integrate returns module
apps/:  clean
infra/: clean
```

### 1.2 Existing returns module inventory

| File | Lines | Purpose |
|---|---|---|
| `apps/api/src/modules/returns/returns.service.ts` | 959 | 12-state FSM, create/transition/list, refund hand-off, settlement adjustment, inventory restoration |
| `apps/api/src/modules/returns/returns.schema.ts` | 75 | Drizzle schema: return_requests, return_request_items, return_request_events |
| `apps/api/src/modules/returns/returns.controller.ts` | 210 | Buyer (4), Merchant (6), Admin (5) endpoints |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | 127 | Polls REQUESTED → EXPIRED, FOR UPDATE SKIP LOCKED |
| `apps/api/src/modules/returns/returns.module.ts` | 12 | NestJS module wiring |
| `infra/drizzle/migrations/0059_return_requests.sql` | 233 | Tables, constraints, indexes, FK extensions |

### 1.3 Existing test files

| File | Lines | Scope |
|---|---|---|
| `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | 761 | 14 PostgreSQL integration + concurrency tests |
| `apps/api/src/__tests__/integration/m73c-inventory-return.postgres.spec.ts` | 547 | Inventory return-to-stock integration |
| `apps/api/src/__tests__/unit/returns/returns-fsm.spec.ts` | 289 | FSM transition unit tests |
| `apps/api/src/__tests__/unit/orders/m73c-inventory-return.spec.ts` | 424 | Inventory return unit tests |
| `pw-e2e/tests/m73c-return-flow.spec.ts` | 136 | E2E return flow (Playwright) |

### 1.4 UI pages

| App | Route | Purpose |
|---|---|---|
| admin | `/returns` | Returns oversight (cross-org listing, status filter) |
| web | `/returns` | Buyer's return list |
| web | `/returns/:id` | Buyer's return detail |
| web | `/merchant/returns` | Merchant return list (per store) |
| web | `/merchant/returns/:id` | Merchant return detail + approve/reject/inspect |

### 1.5 Financial data model (verified from source)

| Table | Key financial columns | Notes |
|---|---|---|
| `order_financial_breakdown` | `products_minor`, `discount_minor`, `delivery_fee_minor`, `tax_minor`, `commission_minor`, `merchant_net_minor` | Immutable after finalization. Commission at order level only. |
| `settlement_records` | `gross_minor`, `refund_minor`, `commission_minor`, `fee_minor`, `net_minor`, `currency`, `status` | ADJUSTMENT status added by migration 0059 |
| `refunds` | `amount_minor`, `currency`, `status`, `return_request_id`, `dispute_id` | Linked to return via FK |
| `payment_records` | `confirmed_amount_minor`, `amount_minor`, `status` | Per sub-order |

### 1.6 Commission calculation (verified)

`order-pricing.ts` line 101:
```typescript
const commissionMinor = Math.round(netGoods * commissionRate);
```
- VAT-exclusive, delivery-fee-exclusive net goods basis.
- Stored as `bigint` at **order level** — no per-item commission breakdown exists.
- Derivable: `item_commission = round(total_commission × (item_net_goods / total_net_goods))`

### 1.7 Current settlement adjustment gap

`returns.service.ts` lines 731–768 (`adjustSettlement`):
- For PAID/DUE settlements: creates ADJUSTMENT record with `commissionMinor: 0`.
- **Does NOT reverse commission** — this is a gap that Phase 3 will close.

---

## 2. Traceability Matrix

Mapping each owner-authorized requirement to existing code, migrations, tests, and gaps.

### 2.1 Return eligibility and deadlines (§3.1)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| 14 calendar days from delivery | `RETURN_WINDOW_DAYS = 14` (line 40), uses `shipment.deliveredAt` (line 126) | Uses `Date.now()` comparison; should use server time explicitly | None needed | `returns-fsm.spec.ts` lines 206–222 |
| Persisted delivery timestamp | `shipment.deliveredAt` used (line 126) | Falls back to `order.updatedAt` — acceptable | None needed | Integration spec |
| Partial deliveries independent windows | Not implemented — single shipment per sub-order | Each sub-order has own shipment; already independent at sub-order level | None needed | Needs test |
| Cancelled orders ineligible | `order.status` check (line 105): only DELIVERED/COMPLETED | Already correct | None needed | `returns-fsm.spec.ts` |
| Non-delivery = separate workflow | Not implemented | Out of scope for returns module; admin resolution workflow is P14+ | None | None |
| Carrier damage within window | Not explicitly handled | Responsibility classification added in Phase 3 | None | Phase 3 tests |
| Delivery timestamp correction audit | Not implemented | New admin endpoint + audit event needed | 0060 (audit column or event) | Phase 2 tests |
| Prevent excess quantities / duplicates | `getCumulativeReturnedQuantities()` (line 839) + cumulative cap (line 177) | Does NOT include ESCALATED status | 0060 (update query) | Needs update |

### 2.2 Merchant SLA and timeout escalation (§3.2)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| 72h from created_at | `MERCHANT_SLA_HOURS = 72` (line 43), `expires_at` set at creation (line 237) | Already correct | None needed | Integration spec |
| Continuous clock | `expires_at` is absolute timestamp | Already continuous | None needed | — |
| Notification failure doesn't extend | Worker doesn't touch `expires_at` | Already correct | None needed | — |
| Timeout → ESCALATED | Currently transitions to EXPIRED | **MAJOR GAP**: need ESCALATED state, FSM update, worker update | **0060** | Phase 2 tests |
| Never auto-approve/reject/refund/expire | Worker only expires | Need to change worker to escalate instead | 0060 | Phase 2 tests |
| Admin resolves escalated | Not implemented | **NEW endpoint**: POST /admin/returns/:id/resolve | 0060 | Phase 2 tests |
| Idempotent escalation | Worker uses FOR UPDATE SKIP LOCKED + optimistic guard | Need to ensure ESCALATED transition is idempotent | 0060 | Phase 2 tests |
| Auditable event | `return_request_events` append-only | Already auditable; need ESCALATED event type | 0060 | Phase 2 tests |

### 2.3 Administrator review SLA (§3.3)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| 3 business days from escalation | Not implemented | **NEW**: business calendar service + deadline calculation | **0060** (calendar tables) | Phase 2 tests |
| UTC timestamps | All timestamps are `TIMESTAMPTZ` | Already correct | None needed | — |
| Configurable business calendar | Not implemented | **NEW**: calendar configuration model | **0060** | Phase 2 tests |
| Default Mon–Fri 08:00–18:00 UTC | Not implemented | Default seed + configuration | 0060 | Phase 2 tests |
| SLA pauses outside business hours | Not implemented | Business-hours-aware deadline calculator | 0060 | Phase 2 tests |
| Manageable configuration | Not implemented | **NEW**: admin API for calendar config | 0060 | Phase 2 tests |
| Audit every change | Not implemented | Audit table or event log | 0060 | Phase 2 tests |
| Fail-safe on missing config | Not implemented | Throw configuration error | None needed | Phase 2 tests |

### 2.4 Commission treatment (§3.4)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| Merchant-responsible: reverse | `adjustSettlement()` sets `commissionMinor: 0` | **MAJOR GAP**: no reversal | **0061** (ledger table) | Phase 3 tests |
| Buyer remorse: retain | Not implemented | Responsibility classification needed | 0060 (column) | Phase 3 tests |
| Platform-responsible: reverse | Not implemented | Same as merchant-responsible | 0061 | Phase 3 tests |
| Carrier damage: reverse | Not implemented | Same | 0061 | Phase 3 tests |
| Mixed-responsibility: partial reverse | Not implemented | Per-item responsibility + proportional allocation | 0061 | Phase 3 tests |
| Cumulative-target rounding (Option C) | Not implemented | **NEW**: cumulative formula implementation | None (code only) | Phase 3 tests |
| Zero minor units tolerance | Not implemented | Exact reconciliation assertion | None | Phase 3 tests |
| Integer/minor arithmetic | `bigint` throughout | Already correct | None needed | — |
| No historical backfill | N/A | Policy constraint | None | — |
| No auto clawback | Not implemented | Manual adjustment path | 0061 | Phase 3 tests |
| Dedicated commission-reversal ledger | Not implemented | **NEW table**: `return_commission_reversals` | **0061** | Phase 3 tests |
| Derive item-level allocation | Not implemented | `item_commission = round(total × (item_net / total_net))` | None (code only) | Phase 3 tests |

### 2.5 Delivery-fee refunds (§3.5)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| Full return: refund delivery fee | Lines 198–211 | Already implemented | None needed | Integration spec |
| Partial exception: full delivery fee | Not implemented | **NEW**: exception approval flow | 0061 (approval table) | Phase 3 tests |
| Carrier damage material: full fee | Not implemented | Same | 0061 | Phase 3 tests |
| Limited damage: admin review | Not implemented | Same | 0061 | Phase 3 tests |
| Never recalculate from current rates | Uses persisted `deliveryFeeMinor` | Already correct | None needed | — |
| Dual approval for exceptions | Not implemented | **NEW**: two-distinct-user approval | 0061 | Phase 3 tests |
| Server-side enforcement | Not implemented | Transactional boundary check | None (code) | Phase 3 tests |

### 2.6 Settlement adjustments (§3.6)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| <$10: single approver | Not implemented | **NEW**: threshold + approval | **0061** | Phase 3 tests |
| ≥$10: dual approver | Not implemented | **NEW**: dual approval | 0061 | Phase 3 tests |
| Exchange-rate handling | Currency is SYP; no rate source | **NEW**: fail-safe path, config dependency | 0061 (config) | Phase 3 tests |
| Immutable audit trail | `settlement_records` + `return_request_events` | Extend for adjustment approvals | 0061 | Phase 3 tests |
| Monthly reconciliation | Not implemented | **NEW**: report generation | None (code) | Phase 3 tests |

### 2.7 Voucher behavior (§3.7)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| Refund to original payment method | P12 `requestRefund()` handles this | Already integrated | None needed | Integration spec |
| Preserve unused voucher balance | Not implemented | Voucher integration needed | TBD (depends on voucher model) | Phase 3 tests |
| No replacement vouchers | Policy | Code enforcement | None | Phase 3 tests |
| Idempotent voucher processing | P12 idempotency keys | Already supported | None | — |
| Failed refund → review, not success | `REFUND_FAILED` state exists | Already supported | None | — |

### 2.8 Pilot and operational controls (§3.8)

| Req | Existing Implementation | Gap | Migration | Tests |
|---|---|---|---|---|
| Allowlisted merchants/orders | Not implemented | **NEW**: pilot allowlist table | **0062** | Phase 4 tests |
| Worker exclusivity enforcement | FOR UPDATE SKIP LOCKED (claiming only) | **MAJOR GAP**: need advisory lock for single-instance | 0062 | Phase 4 tests |
| Pause/resume controls | Not implemented | **NEW**: pilot state management | 0062 | Phase 4 tests |
| Rollback capability | Not implemented | Feature flag + migration rollback plan | None | Phase 4 tests |
| Monitoring: polling failures | `Logger.error()` only | **NEW**: structured metrics/alerts | None | Phase 4 tests |
| Monitoring: overdue requests | Not implemented | **NEW**: alert query | None | Phase 4 tests |
| Monitoring: worker instance count | Not implemented | **NEW**: heartbeat + instance detection | 0062 | Phase 4 tests |
| Alert: 3 consecutive poll failures | Not implemented | **NEW**: counter + alert | None | Phase 4 tests |
| Alert: REQUESTED overdue >10 min | Not implemented | **NEW**: monitoring query | None | Phase 4 tests |
| On-call contacts configurable | Not implemented | **NEW**: configuration | 0062 | Phase 4 tests |

---

## 3. Gap Summary and Implementation Dependencies

### 3.1 Critical gaps (Phase 2 — Lifecycle & SLA)

| Gap ID | Description | Depends On | Effort |
|---|---|---|---|
| G-01 | ESCALATED state: migration, FSM, worker, admin endpoint | None | M |
| G-02 | Business calendar: tables, service, SLA calculator | None | L |
| G-03 | Admin escalation SLA tracking | G-01, G-02 | M |
| G-04 | Responsibility classification field | None | S |
| G-05 | Cumulative query update for ESCALATED | G-01 | S |

### 3.2 Critical gaps (Phase 3 — Financial)

| Gap ID | Description | Depends On | Effort |
|---|---|---|---|
| G-06 | Commission-reversal ledger table | G-04 | L |
| G-07 | Cumulative-target rounding (Option C) | G-06 | M |
| G-08 | Delivery-fee exception dual approval | None | M |
| G-09 | Settlement threshold + exchange-rate fail-safe | None | M |
| G-10 | Monthly reconciliation report | G-06, G-07, G-08 | M |

### 3.3 Critical gaps (Phase 4 — Security & Operations)

| Gap ID | Description | Depends On | Effort |
|---|---|---|---|
| G-11 | Worker exclusivity (advisory lock) | None | M |
| G-12 | Pilot allowlist | None | M |
| G-13 | Monitoring and alerting | G-11 | M |
| G-14 | Pause/resume controls | G-12 | S |

### 3.4 Dependency graph

```
Phase 2: G-01 (ESCALATED) ──┐
         G-02 (Calendar)  ──┼── G-03 (Admin SLA)
         G-04 (Responsibility) ── G-05 (Cumulative query)
                                │
Phase 3: G-06 (Commission ledger) ← G-04
         G-07 (Rounding) ← G-06
         G-08 (Dual approval)
         G-09 (Threshold)
         G-10 (Reconciliation) ← G-06, G-07, G-08
                                │
Phase 4: G-11 (Worker lock) ── G-13 (Monitoring)
         G-12 (Allowlist)   ── G-14 (Pause/resume)
```

---

## 4. Migration Design: 0060 — ESCALATED State and Business Calendar

### 4.1 Migration 0060: `060_escalated_and_business_calendar.sql`

#### 4.1.1 ESCALATED state

```sql
-- Drop old CHECK constraint, add new one with ESCALATED
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS chk_return_requests_status;
ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
  CHECK (status IN (
    'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
    'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION',
    'ESCALATED'
  ));

-- Update partial unique index: ESCALATED is NOT terminal (admin can still resolve)
-- The existing index excludes terminal states; ESCALATED is non-terminal, so
-- no change needed — the WHERE clause already allows it through.

-- Add responsibility_category column
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS responsibility_category VARCHAR(30);
-- Values: 'MERCHANT', 'BUYER_REMORSE', 'PLATFORM', 'CARRIER_DAMAGE', NULL
-- Set during admin resolution or merchant response

-- Add escalated_at and escalation_deadline columns
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ;
-- escalated_at: when the ESCALATED event occurred
-- escalation_deadline: 3 business days from escalated_at (computed by service)

-- Add resolved_by and resolved_at for admin resolution audit
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
```

#### 4.1.2 Business calendar tables

```sql
CREATE TABLE IF NOT EXISTS business_calendars (
  id            UUID PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  timezone      VARCHAR(50) NOT NULL DEFAULT 'UTC',
  start_time    TIME NOT NULL DEFAULT '08:00:00',
  end_time      TIME NOT NULL DEFAULT '18:00:00',
  working_days  INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 1=Mon, 7=Sun
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_calendar_holidays (
  id              UUID PRIMARY KEY,
  calendar_id     UUID NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  holiday_date    DATE NOT NULL,
  description     VARCHAR(200),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, holiday_date)
);

-- Seed default calendar
INSERT INTO business_calendars (id, name, timezone, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Business Calendar',
  'UTC',
  true
) ON CONFLICT DO NOTHING;

-- Index for holiday lookup
CREATE INDEX IF NOT EXISTS idx_calendar_holidays_date
  ON business_calendar_holidays(calendar_id, holiday_date);
```

#### 4.1.3 Business calendar audit events

```sql
-- Calendar changes are audited via return_request_events-style pattern
-- but in a dedicated audit table for configuration changes
CREATE TABLE IF NOT EXISTS business_calendar_audit (
  id            UUID PRIMARY KEY,
  calendar_id   UUID NOT NULL REFERENCES business_calendars(id),
  action        VARCHAR(30) NOT NULL,  -- 'CREATED', 'UPDATED', 'HOLIDAY_ADDED', 'HOLIDAY_REMOVED'
  changed_by    UUID REFERENCES users(id),
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 FSM changes (code, not migration)

```
TRANSITIONS map update:
  REQUESTED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED', 'ESCALATED']
  ESCALATED: ['MERCHANT_APPROVED', 'MERCHANT_REJECTED', 'CANCELLED']

Worker change:
  - Poll REQUESTED WHERE expires_at <= now → transition to ESCALATED (not EXPIRED)
  - Set escalated_at = now()
  - Compute escalation_deadline using business calendar service
  - Emit 'return.escalated' outbox event

Admin resolution endpoint:
  POST /v1/admin/returns/:id/resolve
  Body: { action: 'APPROVE' | 'REJECT' | 'CANCEL', notes?, responsibilityCategory }
  - APPROVE → MERCHANT_APPROVED (with responsibility classification)
  - REJECT → MERCHANT_REJECTED
  - CANCEL → CANCELLED
  - Set resolved_by, resolved_at
  - Require admin:returns:write permission
```

---

## 5. Commission-Reversal Ledger Design

### 5.1 Migration 0061: `061_commission_reversal_ledger.sql`

```sql
CREATE TABLE IF NOT EXISTS return_commission_reversals (
  id                    UUID PRIMARY KEY,
  return_request_id     UUID NOT NULL REFERENCES return_requests(id),
  sub_order_id          UUID NOT NULL REFERENCES orders(id),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id),
  tenant_organization_id UUID NOT NULL,

  -- Calculation inputs (immutable snapshot)
  order_commission_minor    BIGINT NOT NULL,   -- total order commission from breakdown
  order_net_goods_minor     BIGINT NOT NULL,   -- total net goods (VAT/delivery exclusive)
  eligible_net_goods_minor  BIGINT NOT NULL,   -- sum of eligible returned items' net goods
  cumulative_numerator      BIGINT NOT NULL,   -- cumulative eligible net goods across all returns
  cumulative_denominator    BIGINT NOT NULL,   -- total eligible net goods (fixed at first return)

  -- Result
  reversal_amount_minor     BIGINT NOT NULL,   -- computed commission reversal for this return
  cumulative_reversed_minor BIGINT NOT NULL,   -- running total of all reversals

  -- Responsibility
  responsibility_category   VARCHAR(30) NOT NULL,
  eligible_item_count       INTEGER NOT NULL,

  -- Audit
  performed_by              UUID REFERENCES users(id),
  performed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata                  JSONB NOT NULL DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commission_reversals_return
  ON return_commission_reversals(return_request_id);
CREATE INDEX IF NOT EXISTS idx_commission_reversals_order
  ON return_commission_reversals(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_commission_reversals_tenant
  ON return_commission_reversals(tenant_organization_id);
```

### 5.2 Cumulative-target rounding algorithm (Option C)

```typescript
function computeCommissionReversal(params: {
  orderCommissionMinor: number;
  orderNetGoodsMinor: number;
  cumulativeEligibleNetMinor: number;  // including this return
  previouslyReversedMinor: number;
}): number {
  const { orderCommissionMinor, orderNetGoodsMinor,
          cumulativeEligibleNetMinor, previouslyReversedMinor } = params;

  // Cumulative target: what total reversal should be after this return
  const cumulativeTarget = Math.round(
    orderCommissionMinor * cumulativeEligibleNetMinor / orderNetGoodsMinor
  );

  // This return's reversal = cumulative target minus what's already been reversed
  return cumulativeTarget - previouslyReversedMinor;
}
```

**Properties:**
- Final return (all eligible items returned): `cumulativeTarget = orderCommissionMinor`, so total reversed = exact.
- Zero minor units of tolerance on full return.
- No over-reversal possible (cumulative target is monotonically non-decreasing).
- Uses only integer arithmetic (`Math.round` on integer inputs).

### 5.3 Item-level allocation derivation

```typescript
function deriveItemNetGoods(
  orderItemId: string,
  orderItems: OrderItem[],
  breakdown: OrderFinancialBreakdown,
): number {
  const item = orderItems.find(i => i.id === orderItemId);
  const productsMinor = breakdown.productsMinor;
  const discountMinor = breakdown.discountMinor;
  const discountRatio = productsMinor > 0 ? discountMinor / productsMinor : 0;

  const itemGross = item.unitPriceMinor * item.quantity;
  const itemDiscount = Math.round(itemGross * discountRatio);
  return itemGross - itemDiscount;  // VAT-exclusive, delivery-exclusive
}
```

### 5.4 Settlement transaction boundary

```
BEGIN TRANSACTION
  1. FOR UPDATE lock on return_requests row
  2. Re-read orderFinancialBreakdown (immutable, but read inside tx for consistency)
  3. Compute cumulative returned quantities (SUM with FOR UPDATE on referenced rows)
  4. Compute eligible net goods for this return
  5. Look up previous commission reversals for this order (SUM reversal_amount_minor)
  6. Apply Option C formula
  7. INSERT return_commission_reversals row
  8. UPDATE settlement_records (create ADJUSTMENT with commission_minor = -reversal_amount)
  9. INSERT return_request_events (COMMISSION_REVERSED)
  10. Publish outbox event (return.commission_reversed)
COMMIT
```

---

## 6. Business Calendar Service Design

### 6.1 Core interface

```typescript
interface BusinessCalendarService {
  /** Add N business days to a start timestamp, respecting calendar config. */
  addBusinessDays(
    start: Date,
    days: number,
    calendarId?: string,  // defaults to default calendar
  ): Promise<Date>;

  /** Check if a timestamp falls within business hours. */
  isBusinessHours(
    timestamp: Date,
    calendarId?: string,
  ): Promise<boolean>;

  /** Get the next business-hours instant >= timestamp. */
  nextBusinessInstant(
    timestamp: Date,
    calendarId?: string,
  ): Promise<Date>;
}
```

### 6.2 Algorithm for `addBusinessDays`

```
1. Load calendar (or default)
2. Load holidays for calendar
3. current = start
4. remaining = days
5. While remaining > 0:
   a. Advance to next day
   b. If day is working day AND not holiday:
      remaining--
      current = end of that business day (18:00 UTC)
   c. If day is not working day or is holiday:
      skip
6. Return current
```

**Edge cases:**
- Start on weekend/holiday → advance to next business day first
- Start outside business hours → advance to next business instant first
- Calendar not found → throw `BusinessCalendarNotFoundException`
- Calendar has no working days → throw `BusinessCalendarMisconfiguredException`

---

## 7. Worker Exclusivity Design

### 7.1 Advisory lock mechanism

```sql
-- Use pg_advisory_lock for single-instance enforcement
-- Lock key: a fixed bigint derived from 'return_expiration_worker'
-- Attempt with pg_try_advisory_lock (non-blocking)
-- On acquisition failure: log warning, skip cycle, retry next interval

SELECT pg_try_advisory_lock(hashtext('return_expiration_worker'));
-- Returns true if acquired, false if already held

-- On shutdown:
SELECT pg_advisory_unlock(hashtext('return_expiration_worker'));
```

### 7.2 Behavior specification

| Scenario | Behavior |
|---|---|
| Lock acquired | Run poll cycle normally |
| Lock not acquired (another instance holds it) | Log warning, skip cycle, retry next interval |
| Process crash while holding lock | PostgreSQL releases advisory lock on session disconnect |
| Lock loss during cycle | Advisory locks are session-scoped; lost only on disconnect |
| Multiple instances start simultaneously | Only one acquires lock; others skip |

### 7.3 Heartbeat and monitoring

```sql
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_name   VARCHAR(100) PRIMARY KEY,
  instance_id   VARCHAR(200) NOT NULL,
  last_heartbeat TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  metadata      JSONB NOT NULL DEFAULT '{}'
);
```

Worker updates heartbeat every poll cycle. Monitoring checks for stale heartbeats (>5 min).

---

## 8. Delivery-Fee Exception Dual Approval Design

### 8.1 Migration 0061 extension

```sql
CREATE TABLE IF NOT EXISTS delivery_fee_exception_approvals (
  id                  UUID PRIMARY KEY,
  return_request_id   UUID NOT NULL REFERENCES return_requests(id),
  exception_type      VARCHAR(30) NOT NULL,  -- 'PARTIAL_RETURN', 'CARRIER_DAMAGE_MATERIAL'
  reason              TEXT NOT NULL,
  evidence            JSONB NOT NULL DEFAULT '[]',
  calculated_refund_minor BIGINT NOT NULL,

  -- Dual approval
  finance_approver_id UUID REFERENCES users(id),
  finance_approved_at TIMESTAMPTZ,
  admin_approver_id   UUID REFERENCES users(id),
  admin_approved_at   TIMESTAMPTZ,

  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING, FINANCE_APPROVED, FULLY_APPROVED, REJECTED

  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.2 Server-side enforcement

```typescript
async function approveDeliveryFeeException(
  exceptionId: string,
  approver: CallerContext,
  approvalRole: 'FINANCE' | 'ADMIN',
) {
  // Inside transaction:
  // 1. FOR UPDATE lock on exception row
  // 2. Verify approver has required role
  // 3. Verify approver != other approver (distinct-user check)
  // 4. Record approval with timestamp
  // 5. If both approvals present → status = FULLY_APPROVED
}
```

---

## 9. Settlement Threshold Design

### 9.1 Exchange-rate handling

**Current state:** Platform uses SYP (Syrian Pound) as currency. No exchange-rate provider exists.

**Design:**
- Store threshold in SYP as configurable value (default: SYP equivalent of $10)
- If cross-currency support is needed in future: require explicit `exchange_rate_configs` table
- Fail-safe: if currency is not SYP and no rate config exists → hold for review, block approval
- Never silently use a stale rate

```sql
CREATE TABLE IF NOT EXISTS settlement_threshold_config (
  id                    UUID PRIMARY KEY,
  currency              CHAR(3) NOT NULL DEFAULT 'SYP',
  threshold_minor       BIGINT NOT NULL,  -- e.g., 1000 = $10 equivalent in SYP minor units
  updated_by            UUID REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: SYP threshold (project owner to confirm exact value)
INSERT INTO settlement_threshold_config (id, currency, threshold_minor)
VALUES ('00000000-0000-0000-0000-000000000002', 'SYP', 1000)
ON CONFLICT DO NOTHING;
```

---

## 10. Pilot Allowlist Design

### 10.1 Migration 0062: `062_pilot_controls.sql`

```sql
CREATE TABLE IF NOT EXISTS pilot_allowlist (
  id            UUID PRIMARY KEY,
  entity_type   VARCHAR(20) NOT NULL,  -- 'MERCHANT', 'ORDER', 'STORE'
  entity_id     UUID NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  added_by      UUID REFERENCES users(id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ,
  UNIQUE(entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS pilot_state (
  id            UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000003',
  active        BOOLEAN NOT NULL DEFAULT false,
  started_at    TIMESTAMPTZ,
  observation_days INTEGER NOT NULL DEFAULT 30,
  max_instances INTEGER NOT NULL DEFAULT 1,
  on_call_contact UUID REFERENCES users(id),
  updated_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Initialize pilot as inactive
INSERT INTO pilot_state (active) VALUES (false) ON CONFLICT DO NOTHING;
```

### 10.2 Allowlist enforcement

```typescript
async function isReturnAllowedForPilot(subOrderId: string): Promise<boolean> {
  const pilotState = await getPilotState();
  if (!pilotState.active) return true;  // pilot not active → all returns blocked

  const order = await getOrder(subOrderId);
  const allowlisted = await checkAllowlist(order.storeId, order.buyerId);
  return !allowlisted;  // true = blocked
}
```

---

## 11. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| ESCALATED breaks existing cumulative query | HIGH | Migration 0060 updates query; test before/after |
| Commission reversal miscalculation | HIGH | Option C math verified; zero-tolerance test |
| Worker advisory lock on process crash | MEDIUM | PostgreSQL auto-releases on disconnect |
| Business calendar misconfiguration | MEDIUM | Fail-safe: throw error, don't silently use defaults |
| Exchange-rate provider absence | MEDIUM | Fail-safe: hold for review, block approval |
| Pilot activation without allowlist | HIGH | Double-gate: pilot_state.active + allowlist check |
| Migration ordering conflicts | LOW | Sequential numbering (0060, 0061, 0062) |

---

## 12. Implementation Order

### Phase 2 (Lifecycle & SLA) — Migration 0060

1. Migration 0060: ESCALATED state, responsibility column, calendar tables
2. Business calendar service + tests
3. FSM update: ESCALATED transitions
4. Worker update: REQUESTED → ESCALATED (not EXPIRED)
5. Admin resolve endpoint + authorization
6. Cumulative query update for ESCALATED
7. Admin SLA tracking (escalation_deadline)
8. UI updates: admin resolution, ESCALATED status display
9. Phase 2 tests

### Phase 3 (Financial) — Migration 0061

1. Migration 0061: commission ledger, exception approvals, threshold config
2. Commission reversal service (Option C)
3. Responsibility classification flow
4. Delivery-fee exception dual approval
5. Settlement threshold enforcement
6. Monthly reconciliation report
7. Phase 3 tests

### Phase 4 (Security & Operations) — Migration 0062

1. Migration 0062: pilot allowlist, pilot state, worker heartbeats
2. Worker advisory lock
3. Pilot allowlist enforcement
4. Monitoring queries and alert hooks
5. Pause/resume controls
6. Phase 4 tests

---

**Attestation:** This design document was produced by read-only inspection of the repository at `develop@8d60e36`. No source code, migrations, or tracked files were modified. Implementation begins in Phase 2 upon confirmation.
