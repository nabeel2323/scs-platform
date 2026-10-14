-- P13 Phase 2: ESCALATED state, responsibility classification, business calendar
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.
--
-- Rollback considerations:
--   This migration adds columns and tables. Rolling back would require dropping
--   them, which destroys any escalation or calendar data. For production, prefer
--   forward-only corrections over destructive rollback. The migration is designed
--   to be safely re-runnable (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS patterns).

-- ═══════════════════════════════════════════════════════════════════
-- 1. ESCALATED state — extend CHECK constraint
-- ═══════════════════════════════════════════════════════════════════

-- Drop old constraint and recreate with ESCALATED included.
-- ESCALATED is a non-terminal state: admin can still resolve it.
-- The partial unique index idx_return_requests_active_per_order excludes only
-- terminal states (REFUNDED, MERCHANT_REJECTED, CANCELLED, EXPIRED,
-- REJECTED_AFTER_INSPECTION). ESCALATED is intentionally NOT excluded, so an
-- escalated return still counts as "active" and prevents duplicate active
-- returns for the same sub-order. This preserves the duplicate-prevention
-- invariant without any index change.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_requests_status') THEN
    ALTER TABLE return_requests DROP CONSTRAINT chk_return_requests_status;
  END IF;
  ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
    CHECK (status IN (
      'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
      'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
      'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION',
      'ESCALATED'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Responsibility classification
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS responsibility_category VARCHAR(30);

-- Validate supported values (NULL allowed — set during resolution)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_requests_responsibility') THEN
    ALTER TABLE return_requests DROP CONSTRAINT chk_return_requests_responsibility;
  END IF;
  ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_responsibility
    CHECK (responsibility_category IS NULL OR responsibility_category IN (
      'MERCHANT', 'BUYER_REMORSE', 'PLATFORM', 'CARRIER_DAMAGE'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Escalation tracking columns
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ;

-- Admin resolution audit
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Index for escalation queries (admin oversight, worker retry, deadline monitoring)
CREATE INDEX IF NOT EXISTS idx_return_requests_escalated
  ON return_requests(status, escalated_at)
  WHERE status = 'ESCALATED';

CREATE INDEX IF NOT EXISTS idx_return_requests_escalation_deadline
  ON return_requests(escalation_deadline)
  WHERE status = 'ESCALATED' AND escalation_deadline IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Business calendar configuration
-- ═══════════════════════════════════════════════════════════════════

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

-- Validate working days (1=Mon..7=Sun) and working-hour range
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendars_working_days') THEN
    ALTER TABLE business_calendars ADD CONSTRAINT chk_calendars_working_days
      CHECK (
        working_days <@ '{1,2,3,4,5,6,7}'::integer[]
        AND array_length(working_days, 1) > 0
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendars_hours') THEN
    ALTER TABLE business_calendars ADD CONSTRAINT chk_calendars_hours
      CHECK (start_time < end_time);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Business calendar holidays
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS business_calendar_holidays (
  id              UUID PRIMARY KEY,
  calendar_id     UUID NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  holiday_date    DATE NOT NULL,
  description     VARCHAR(200),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_holidays_calendar_date
  ON business_calendar_holidays(calendar_id, holiday_date);

-- ═══════════════════════════════════════════════════════════════════
-- 6. Business calendar audit log
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS business_calendar_audit (
  id            UUID PRIMARY KEY,
  calendar_id   UUID NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  changed_by    UUID REFERENCES users(id),
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_audit_calendar
  ON business_calendar_audit(calendar_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 7. Seed default business calendar (idempotent)
-- ═══════════════════════════════════════════════════════════════════

-- Use a fixed UUID so the application can reference it deterministically.
-- ON CONFLICT DO NOTHING ensures re-runs don't fail or create duplicates.
INSERT INTO business_calendars (id, name, timezone, start_time, end_time, working_days, is_default, enabled)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Default Business Calendar',
  'UTC',
  '08:00:00',
  '18:00:00',
  '{1,2,3,4,5}',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;
