-- 0011_trust.sql — Reviews, trust scores, disputes, conversations
-- Module boundary: modules/reviews/*

-- ── Reviews ───────────────────────────────────────────────────────────────────
-- Order-gated: one review per subject per order.
-- subject_type: STORE, DRIVER, BUYER (buyer reviews merchant, merchant reviews buyer)

CREATE TABLE reviews (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders(id),
  reviewer_id     UUID NOT NULL REFERENCES users(id),
  subject_id      UUID NOT NULL,
  subject_type    VARCHAR(16) NOT NULL,
  rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title           VARCHAR(200),
  body            TEXT,
  dimensions      JSONB NOT NULL DEFAULT '{}',
  is_verified     BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, reviewer_id, subject_id, subject_type)
);

CREATE INDEX idx_reviews_subject ON reviews(subject_id, subject_type);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_order ON reviews(order_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- ── Trust Snapshots ───────────────────────────────────────────────────────────
-- Periodic snapshot of trust metrics per entity (store/buyer/driver).
-- Recomputed on each new review or daily batch.

CREATE TABLE trust_snapshots (
  id              UUID PRIMARY KEY,
  entity_id       UUID NOT NULL,
  entity_type     VARCHAR(16) NOT NULL,
  avg_rating      DECIMAL(3,2),
  total_reviews   INT NOT NULL DEFAULT 0,
  dimensions      JSONB NOT NULL DEFAULT '{}',
  badges          JSONB NOT NULL DEFAULT '[]',
  score           DECIMAL(5,2) NOT NULL DEFAULT 0,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trust_entity ON trust_snapshots(entity_id, entity_type);
CREATE INDEX idx_trust_score ON trust_snapshots(score DESC);

-- ── Disputes ──────────────────────────────────────────────────────────────────
-- Dispute window: 72h from DELIVERED.
-- Status: OPEN → EVIDENCE → RESPONSE → REVIEW → RESOLVED | CLOSED

CREATE TABLE disputes (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders(id),
  raised_by       UUID NOT NULL REFERENCES users(id),
  against_id      UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  reason          TEXT NOT NULL,
  resolution      TEXT,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_order ON disputes(order_id);
CREATE INDEX idx_disputes_raised_by ON disputes(raised_by);
CREATE INDEX idx_disputes_status ON disputes(status);

-- ── Dispute Events ────────────────────────────────────────────────────────────
-- Append-only log of dispute actions (evidence submitted, responses, etc.)

CREATE TABLE dispute_events (
  id              UUID PRIMARY KEY,
  dispute_id      UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  actor_id        UUID NOT NULL REFERENCES users(id),
  event_type      VARCHAR(32) NOT NULL,
  body            TEXT,
  attachments     JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispute_events_dispute ON dispute_events(dispute_id);

-- ── Conversations ─────────────────────────────────────────────────────────────
-- Order-linked chat only (no free-form messaging in Phase 1).

CREATE TABLE conversations (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders(id),
  participant_1   UUID NOT NULL REFERENCES users(id),
  participant_2   UUID NOT NULL REFERENCES users(id),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, participant_1, participant_2)
);

CREATE INDEX idx_conversations_order ON conversations(order_id);
CREATE INDEX idx_conversations_participants ON conversations(participant_1), conversations(participant_2);

-- ── Messages ──────────────────────────────────────────────────────────────────
-- Individual messages within a conversation.

CREATE TABLE messages (
  id              UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
