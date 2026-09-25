-- Migration 0036: Widen catalog_imports.status to accommodate 'COMPLETED_WITH_ERRORS' (21 chars)
-- The previous varchar(20) was too short, causing the status update to fail after a successful import.
ALTER TABLE catalog_imports ALTER COLUMN status TYPE VARCHAR(30);
