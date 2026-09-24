-- 0028_offer_atomization.sql
-- Phase 10: Capture the merchant offer reference in cart_items and order_items.
-- Nullable columns preserve backward compatibility with legacy (pre-offer) rows.

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS offer_id UUID
    REFERENCES merchant_offers(id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS offer_id UUID
    REFERENCES merchant_offers(id) ON DELETE SET NULL;

-- Index: lookup cart lines by offer (e.g. for offer-suspend checks in cart)
CREATE INDEX IF NOT EXISTS idx_cart_items_offer
  ON cart_items(offer_id)
  WHERE offer_id IS NOT NULL;

-- Index: order analytics by offer attribution
CREATE INDEX IF NOT EXISTS idx_order_items_offer
  ON order_items(offer_id)
  WHERE offer_id IS NOT NULL;
