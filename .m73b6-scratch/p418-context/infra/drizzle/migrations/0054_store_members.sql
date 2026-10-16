-- Migration 0054: Store-level membership for Product Studio authorization.
--
-- Introduces store_members to enforce that only ACTIVE members of a product's
-- owning store may edit canonical product data through Merchant Product Studio.
--
-- Idempotent: safe to run multiple times.
-- Backfill: Phase 1 uses outbox creation events; Phase 2 falls back to the
--           organisation's MERCHANT_OWNER member; Phase 3 leaves remaining
--           stores fail-closed (merchant access denied until assigned).

-- 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS store_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(16)  NOT NULL DEFAULT 'MEMBER',
    status      VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_store_members_store_user
        UNIQUE (store_id, user_id),
    CONSTRAINT ck_store_members_role
        CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
    CONSTRAINT ck_store_members_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_store_members_store
    ON store_members (store_id);

CREATE INDEX IF NOT EXISTS idx_store_members_user
    ON store_members (user_id);

CREATE INDEX IF NOT EXISTS idx_store_members_store_active
    ON store_members (store_id, status)
    WHERE status = 'ACTIVE';

-- 3. Backfill — Phase 1: authoritative outbox creation events ───────────────
--    merchant.store.created events carry aggregate_id = storeId and
--    metadata.userId = creator.

INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT
    e.aggregate_id,
    (e.metadata ->> 'userId')::uuid,
    'OWNER',
    'ACTIVE'
FROM outbox_events e
WHERE e.event_type = 'merchant.store.created'
  AND e.aggregate_id IS NOT NULL
  AND e.metadata ->> 'userId' IS NOT NULL
  AND (e.metadata ->> 'userId')::uuid IN (SELECT id FROM users)
  AND e.aggregate_id         ::uuid IN (SELECT id FROM stores)
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 4. Backfill — Phase 2: fallback for stores still without any member ───────
--    Assign the earliest ACTIVE MERCHANT_OWNER of the store's organisation.

INSERT INTO store_members (store_id, user_id, role, status)
SELECT DISTINCT ON (s.id)
    s.id,
    om.user_id,
    'OWNER',
    'ACTIVE'
FROM stores s
JOIN organization_members om ON om.org_id = s.org_id
JOIN roles r              ON r.id  = om.role_id
WHERE r.key = 'MERCHANT_OWNER'
  AND om.status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM store_members sm WHERE sm.store_id = s.id
  )
ORDER BY s.id, om.created_at ASC
ON CONFLICT (store_id, user_id) DO NOTHING;
