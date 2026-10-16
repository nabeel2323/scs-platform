-- Migration 0010: Dual Authentication Support
-- Adds email/password credentials alongside OTP-based authentication
-- Includes device trust tracking and credential audit logging

BEGIN;

-- Add password support to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- Add device tracking to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions(user_id, device_id);

-- Create credential audit log table
CREATE TABLE IF NOT EXISTS credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL, -- 'PASSWORD_SET', 'PASSWORD_CHANGE', 'EMAIL_CHANGE', 'CREDENTIAL_SETUP'
  device_id VARCHAR(128),
  ip_address INET,
  user_agent VARCHAR(256),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credential_audit_user ON credential_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credential_audit_created ON credential_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_credential_audit_action ON credential_audit_log(action);

-- Add index for email lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

COMMIT;
