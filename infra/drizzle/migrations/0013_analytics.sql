-- 0013_analytics.sql — Analytics events partitioning + pg_partman setup
-- Module boundary: modules/analytics/*

-- Install pg_partman extension for automated partition management
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- The analytics_events table was created in migration 0002_platform.
-- Now we convert it to a partitioned table.
--
-- Strategy: RANGE partition on created_at, monthly partitions managed by pg_partman.
-- pg_partman will auto-create future partitions and detach old ones.

-- Step 1: Create the partitioned table (replacing the non-partitioned one)
-- First, rename the old table
ALTER TABLE analytics_events RENAME TO analytics_events_legacy;

-- Create new partitioned table with same structure
CREATE TABLE analytics_events (
  id            UUID NOT NULL,
  event_type    VARCHAR(80) NOT NULL,
  user_id       UUID,
  org_id        UUID,
  session_id    VARCHAR(64),
  properties    JSONB NOT NULL DEFAULT '{}',
  device        VARCHAR(20),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create default partition for any data outside defined ranges
CREATE TABLE analytics_events_default PARTITION OF analytics_events DEFAULT;

-- Step 2: Configure pg_partman for monthly partitioning
-- This creates partitions automatically
SELECT partman.create_parent(
  p_parent_table   => 'analytics_events',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => '1 month',
  p_premake        => 3,           -- pre-create 3 future partitions
  p_start_partition => '2026-01-01' -- start from January 2026
);

-- Step 3: Update the configuration for automatic maintenance
UPDATE partman.part_config
SET
  retention = '12 months',        -- keep 12 months of data
  retention_keep_table = FALSE,   -- drop old partitions
  retention_keep_index = FALSE
WHERE parent_table = 'analytics_events';

-- Step 4: Indexes on partitioned table
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id, created_at DESC);
CREATE INDEX idx_analytics_events_org ON analytics_events(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_analytics_events_session ON analytics_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_analytics_events_properties ON analytics_events USING GIN (properties);

-- Step 5: Migrate data from legacy table (if any)
INSERT INTO analytics_events (id, event_type, user_id, org_id, session_id, properties, device, created_at)
SELECT id, event_type, user_id, org_id, session_id, properties, device, created_at
FROM analytics_events_legacy
ON CONFLICT DO NOTHING;

-- Step 6: Drop legacy table
DROP TABLE IF EXISTS analytics_events_legacy;

-- Step 7: Schedule pg_partman maintenance (should be run via cron/pg_cron)
-- If pg_cron is available:
-- SELECT cron.schedule('partman-maintenance', '1 hour', 'SELECT partman.run_maintenance()');
