-- 0012_comms.sql — Notifications, preferences, device tokens
-- Module boundary: modules/notifications/*

-- ── Notifications ─────────────────────────────────────────────────────────────
-- Types: TRANSACTIONAL (always sent), PROMOTIONAL (opt-in), BEHAVIORAL (opt-in)
-- Channels: SMS, PUSH (FCM), IN_APP, WHATSAPP
-- Status: PENDING → SENT → DELIVERED → READ | FAILED

CREATE TABLE notifications (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,                  -- TRANSACTIONAL, PROMOTIONAL, BEHAVIORAL
  channel         VARCHAR(16) NOT NULL,                  -- SMS, PUSH, IN_APP, WHATSAPP
  template        VARCHAR(64) NOT NULL,                  -- otp.login, order.submitted, etc.
  title           VARCHAR(200),
  body            TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',           -- deep-link data, order IDs, etc.
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  provider        VARCHAR(32),                           -- SMS provider that sent it
  provider_msg_id VARCHAR(128),                          -- provider's message ID
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_status ON notifications(status) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── Notification Preferences ──────────────────────────────────────────────────
-- Per-user opt-in/out per type+channel.

CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,                  -- PROMOTIONAL, BEHAVIORAL
  channel         VARCHAR(16) NOT NULL,                  -- SMS, PUSH, IN_APP, WHATSAPP
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type, channel)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

-- ── Device Tokens ─────────────────────────────────────────────────────────────
-- FCM/APNs tokens for push notifications.

CREATE TABLE device_tokens (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token           VARCHAR(500) NOT NULL,
  platform        VARCHAR(16) NOT NULL,                  -- ANDROID, IOS, WEB
  app_version     VARCHAR(20),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE is_active = TRUE;
