-- 0018_analytics_retention.sql
-- Correct pg_partman retention configuration for analytics_events.
-- Module boundary: modules/analytics/*

UPDATE partman.part_config
SET
  retention = '12 months',
  retention_keep_table = FALSE,
  retention_keep_index = FALSE
WHERE parent_table = 'public.analytics_events';
