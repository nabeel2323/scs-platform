-- 0035: Widen attribute_definitions.type from varchar(20) to varchar(40)
-- to accommodate all valid AttributeType values including compound names.
ALTER TABLE attribute_definitions
  ALTER COLUMN type TYPE VARCHAR(40);
