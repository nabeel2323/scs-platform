-- P13 operational alert delivery claim visibility.
-- SENDING is a transient durable claim held while one API instance attempts
-- delivery. The service reclaims it only after its bounded stale-claim window.

DROP INDEX IF EXISTS idx_ops_alerts_open;

CREATE INDEX IF NOT EXISTS idx_ops_alerts_open
  ON ops_alerts(status, last_observed_at DESC)
  WHERE status IN ('PENDING', 'SENDING', 'SENT', 'FAILED');
