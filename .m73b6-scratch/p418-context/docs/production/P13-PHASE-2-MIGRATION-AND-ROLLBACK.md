# P13 Phase 2 — Migration & Rollback

**Date:** 2026-10-13
**Migration:** `0060_escalated_and_business_calendar.sql`
**Location:** `infra/drizzle/migrations/0060_escalated_and_business_calendar.sql`

---

## 1. Migration Overview

| Property | Value |
|----------|-------|
| Migration number | 0060 |
| Filename | `0060_escalated_and_business_calendar.sql` |
| Depends on | `0059_return_requests.sql` (P13 Phase 1) |
| Idempotent | Yes — safe for repeated runs |
| Destructive | No — additive only |
| _migration_log writes | None — runner owns bookkeeping |
| Transaction | Each statement auto-wrapped by migration runner |

---

## 2. DDL Operations

### 2.1 CHECK constraint update (ESCALATED state)

```sql
-- Drop old constraint, recreate with ESCALATED included
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS chk_return_requests_status;
ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
  CHECK (status IN (
    'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
    'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION',
    'ESCALATED'
  ));
```

**Safety:** Uses `IF EXISTS` for constraint drop. Existing rows with valid statuses remain valid. No data loss.

### 2.2 New columns on return_requests

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `responsibility_category` | VARCHAR(30) | YES | NULL | CHECK constraint limits values |
| `escalated_at` | TIMESTAMPTZ | YES | NULL | Set during escalation |
| `escalation_deadline` | TIMESTAMPTZ | YES | NULL | Business-day deadline |
| `resolved_by` | UUID → users(id) | YES | NULL | Admin who resolved |
| `resolved_at` | TIMESTAMPTZ | YES | NULL | Resolution timestamp |

**Safety:** All columns are nullable with `ADD COLUMN IF NOT EXISTS`. Existing rows get NULL values — no backfill into invented states.

### 2.3 Responsibility category CHECK

```sql
CHECK (responsibility_category IS NULL OR responsibility_category IN (
  'MERCHANT', 'BUYER_REMORSE', 'PLATFORM', 'CARRIER_DAMAGE'
))
```

### 2.4 New indexes

| Index | Table | Columns | Filter |
|-------|-------|---------|--------|
| `idx_return_requests_escalated` | return_requests | (status, escalated_at) | WHERE status = 'ESCALATED' |
| `idx_return_requests_escalation_deadline` | return_requests | (escalation_deadline) | WHERE status = 'ESCALATED' |
| `idx_calendar_holidays_calendar_date` | business_calendar_holidays | (calendar_id, holiday_date) | — |
| `idx_calendar_audit_calendar` | business_calendar_audit | (calendar_id, created_at DESC) | — |

**Safety:** All use `CREATE INDEX IF NOT EXISTS`.

### 2.5 New tables

#### business_calendars
```sql
CREATE TABLE IF NOT EXISTS business_calendars (
  id            UUID PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  timezone      VARCHAR(50) NOT NULL DEFAULT 'UTC',
  start_time    TIME NOT NULL DEFAULT '08:00:00',
  end_time      TIME NOT NULL DEFAULT '18:00:00',
  working_days  INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Constraints:
- `chk_calendars_working_days`: working_days ⊆ {1..7}, non-empty
- `chk_calendars_hours`: start_time < end_time

#### business_calendar_holidays
```sql
CREATE TABLE IF NOT EXISTS business_calendar_holidays (
  id              UUID PRIMARY KEY,
  calendar_id     UUID NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  holiday_date    DATE NOT NULL,
  description     VARCHAR(200),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, holiday_date)
);
```

#### business_calendar_audit
```sql
CREATE TABLE IF NOT EXISTS business_calendar_audit (
  id            UUID PRIMARY KEY,
  calendar_id   UUID NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  changed_by    UUID REFERENCES users(id),
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.6 Default calendar seed

```sql
INSERT INTO business_calendars (id, name, timezone, start_time, end_time, working_days, is_default, enabled)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Default Business Calendar', 'UTC',
  '08:00:00', '18:00:00', '{1,2,3,4,5}',
  true, true
)
ON CONFLICT (id) DO NOTHING;
```

Fixed UUID `a0000000-0000-0000-0000-000000000001` allows deterministic application reference.

---

## 3. Partial Unique Index — Design Decision

The existing index `idx_return_requests_active_per_order` excludes terminal states:

```sql
CREATE UNIQUE INDEX idx_return_requests_active_per_order
  ON return_requests(sub_order_id)
  WHERE status NOT IN ('REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION');
```

**ESCALATED is intentionally NOT in the exclusion list.** This means:
- An escalated return is still "active" — it prevents a second active return for the same sub-order
- The duplicate-prevention invariant is preserved without any index change
- Only when the admin resolves to a terminal state (MERCHANT_APPROVED → ... → REFUNDED, or MERCHANT_REJECTED, or CANCELLED) does the return become "inactive"

---

## 4. Rollback Considerations

### Forward-only preference
**This migration is designed for forward-only operation.** Rolling back would require:

1. Dropping the 3 new tables (business_calendars, business_calendar_holidays, business_calendar_audit)
2. Dropping the 5 new columns from return_requests
3. Restoring the original CHECK constraint without ESCALATED

### What would be lost
- All escalation records (escalated_at, escalation_deadline)
- All responsibility classifications
- All resolution audit data (resolved_by, resolved_at)
- All business calendar configurations and holidays
- All calendar audit history

### Safe rollback procedure (if absolutely necessary)

```sql
-- WARNING: Destructive. Only for pre-production environments.

-- 1. Drop new tables (CASCADE removes indexes, constraints)
DROP TABLE IF EXISTS business_calendar_audit;
DROP TABLE IF EXISTS business_calendar_holidays;
DROP TABLE IF EXISTS business_calendars;

-- 2. Drop new columns
ALTER TABLE return_requests DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE return_requests DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE return_requests DROP COLUMN IF EXISTS escalation_deadline;
ALTER TABLE return_requests DROP COLUMN IF EXISTS escalated_at;
ALTER TABLE return_requests DROP COLUMN IF EXISTS responsibility_category;

-- 3. Restore original CHECK constraint (12 states, no ESCALATED)
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS chk_return_requests_status;
ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
  CHECK (status IN (
    'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
    'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
    'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION'
  ));

-- 4. Handle any ESCALATED rows (MUST be done before constraint change)
-- UPDATE return_requests SET status = 'REQUESTED' WHERE status = 'ESCALATED';
```

### Production rollback policy
For production: **do not roll back.** If Phase 2 causes issues, implement a forward fix. The migration is additive and cannot corrupt existing data. If the ESCALATED state must be disabled, update the application code to skip escalation and revert to the EXPIRED behavior — the database changes are harmless.

---

## 5. Migration Testing

### Pre-requisites
- PostgreSQL 14+ with the existing 0059 migration applied
- Representative P13 records in return_requests (various statuses)

### Test procedure
1. Apply migration: the runner reads `.sql` files from `infra/drizzle/migrations/`, sorted alphabetically
2. Verify constraint: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_return_requests_status';`
3. Verify columns: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'return_requests' AND column_name LIKE '%escalat%';`
4. Verify tables: `SELECT tablename FROM pg_tables WHERE tablename LIKE 'business_calendar%';`
5. Verify seed: `SELECT id, name, is_default FROM business_calendars;`
6. Verify idempotency: run migration again — should succeed without errors

### Expected outcomes
- 13 states in CHECK constraint
- 5 new nullable columns on return_requests
- 3 new tables created
- 1 default calendar row
- All indexes created
- No data loss in existing records

---

## 6. Convention Compliance

| Convention | Status |
|------------|--------|
| UUID primary keys | ✅ |
| TIMESTAMPTZ for all timestamps | ✅ |
| Foreign keys to users(id) | ✅ |
| ON DELETE CASCADE for child tables | ✅ |
| IF NOT EXISTS / IF EXISTS for idempotency | ✅ |
| No _migration_log writes | ✅ |
| Alphabetical sorting compatible (0060_...) | ✅ |
| Matches existing naming conventions | ✅ |
| CHECK constraints for enum-like columns | ✅ |
| Partial indexes for query optimization | ✅ |
