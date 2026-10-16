-- Migration 0056: Product Governance & Submission Workflow.
--
-- P11 Product Governance — lifecycle states, moderation ledger, data backfill.
-- Idempotent: safe to run multiple times.
-- Non-destructive: ACTIVE products are grandfathered to PUBLISHED (no data loss).
-- Compatible with migration 0055 (import chunking + inventory integrity).

-- 1. Governance columns on products ──────────────────────────────────────────
-- submitted_at: when the merchant submitted for review
-- reviewed_at: when an admin/moderator last reviewed
-- reviewed_by: who performed the last review
-- rejection_reason: why the product was rejected (nullable)

ALTER TABLE products ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. product_moderation ledger ───────────────────────────────────────────────
-- Append-only audit trail for every governance transition.
-- Application code must NEVER update or delete historical records.

CREATE TABLE IF NOT EXISTS product_moderation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    action          VARCHAR(16)  NOT NULL,
    from_status     VARCHAR(16),
    to_status       VARCHAR(16)  NOT NULL,
    actor_user_id   UUID         NOT NULL REFERENCES users(id),
    actor_role      VARCHAR(16)  NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for moderation history lookups and queue ordering
CREATE INDEX IF NOT EXISTS idx_product_moderation_product_id
    ON product_moderation (product_id);

CREATE INDEX IF NOT EXISTS idx_product_moderation_created_at_desc
    ON product_moderation (created_at DESC);

-- 3. Data migration: ACTIVE → PUBLISHED ─────────────────────────────────────
-- Grandfather existing approved products into the new PUBLISHED state.
-- No products are deleted or lose their data.
-- DRAFT products remain DRAFT.

UPDATE products
SET status = 'PUBLISHED'
WHERE status = 'ACTIVE';

-- 4. Status check constraint (advisory — varchar(16) remains flexible) ───────
-- The application enforces the valid state set:
--   DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, PUBLISHED, REJECTED
-- Legacy ACTIVE is migrated above; no new rows will use it.
