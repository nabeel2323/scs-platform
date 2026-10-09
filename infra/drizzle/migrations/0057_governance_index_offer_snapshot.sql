-- Migration 0057: Governance status index + offer review snapshot table
--
-- P11 Remediation:
--   D-1: Add missing idx_products_governance_status index
--   D-3: Add product_offer_review_state table for per-offer availability snapshots
--
-- Idempotent: safe to run multiple times.
-- Non-destructive: no data modification.

-- 1. D-1: Governance status index on products ─────────────────────────────────
-- Supports moderation queue queries and governance status filtering.

CREATE INDEX IF NOT EXISTS idx_products_governance_status
    ON products (status);

-- 2. D-3: Offer review snapshot table ────────────────────────────────────────
-- Preserves each offer's isAvailable state before re-review suspension.
-- Restoration uses this snapshot to restore per-offer, not blindly to true.

CREATE TABLE IF NOT EXISTS product_offer_review_state (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    offer_id            UUID         NOT NULL REFERENCES merchant_offers(id) ON DELETE CASCADE,
    previous_is_available BOOLEAN    NOT NULL,
    review_cycle_id     UUID         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    restored_at         TIMESTAMPTZ,
    -- Prevent duplicate snapshots for the same offer/review cycle
    CONSTRAINT uq_offer_review_cycle UNIQUE (offer_id, review_cycle_id)
);

-- Index for looking up snapshots by product (for batch restoration)
CREATE INDEX IF NOT EXISTS idx_offer_review_state_product_id
    ON product_offer_review_state (product_id);

-- Index for looking up active (unrestored) snapshots
CREATE INDEX IF NOT EXISTS idx_offer_review_state_active
    ON product_offer_review_state (product_id, restored_at)
    WHERE restored_at IS NULL;
