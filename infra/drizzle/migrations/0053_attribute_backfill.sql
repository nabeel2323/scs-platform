-- 0053: Phase 3 — Attribute JSONB → typed-table backfill
--
-- Migrates attribute data from the legacy JSONB columns (products.attributes,
-- product_variants.attributes) into the authoritative typed attribute tables
-- (product_attribute_values, variant_attribute_values).
--
-- Current database state: all JSONB attributes are '{}' (empty), so this
-- migration processes 0 data rows.  The PL/pgSQL block is nevertheless
-- production-safe for a database containing real JSONB attribute data.
--
-- Rules (per Phase 3 Business Rules + Architecture Lock):
--   BD-04: '{}' or null → SKIP (no typed row created)
--   BD-05: unknown attribute definition → ERROR (logged, skipped)
--   BD-06: invalid value for type → ERROR (logged, skipped)
--   BD-03: typed value is authoritative on conflict (not overwritten)
--
-- The migration also creates a backfill_errors audit table so that conflicts,
-- unknown attributes, and invalid values are observable.

-- ── Schema: backfill error / conflict audit table ─────────────────

CREATE TABLE IF NOT EXISTS backfill_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration     VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(20)  NOT NULL,   -- 'PRODUCT' or 'VARIANT'
  entity_id     UUID         NOT NULL,
  attribute_key TEXT         NOT NULL,    -- JSONB key (attribute_definition id or code)
  source_value  TEXT,
  error_type    VARCHAR(40)  NOT NULL,    -- UNKNOWN_ATTRIBUTE, INVALID_VALUE, CONFLICT, CONVERSION_ERROR
  detail        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backfill_errors_migration
  ON backfill_errors (migration);

-- ── PL/pgSQL backfill ─────────────────────────────────────────────
-- Processes all products and variants whose JSONB attributes column is
-- non-empty.  For each key-value pair in the JSONB:
--   1. Resolve key → attribute_definitions.id (try UUID match, then code match)
--   2. If not found → log UNKNOWN_ATTRIBUTE, skip
--   3. Coerce value to the appropriate typed column based on definition type
--   4. If coercion fails → log INVALID_VALUE, skip
--   5. INSERT with ON CONFLICT DO NOTHING (typed value is authoritative)
--   6. If a typed row already exists with a different value → log CONFLICT

DO $$
DECLARE
  v_product_id    UUID;
  v_variant_id    UUID;
  v_attr_id       UUID;
  v_attr_code     TEXT;
  v_attr_type     TEXT;
  v_attr_scope    TEXT;
  v_jsonb_key     TEXT;
  v_jsonb_value   JSONB;
  v_text_value    TEXT;
  v_num_value     NUMERIC;
  v_bool_value    BOOLEAN;
  v_option_value  TEXT;
  v_json_value    JSONB;
  v_existing_text TEXT;
  v_existing_num  TEXT;
  v_existing_bool BOOLEAN;
  v_existing_opt  TEXT;
  v_count         INTEGER := 0;
  v_batch_size    CONSTANT INTEGER := 500;
BEGIN
  -- ── Product backfill ──────────────────────────────────────────
  FOR v_product_id, v_jsonb_key, v_jsonb_value IN
    SELECT p.id, kv.key, kv.value
    FROM products p,
         LATERAL jsonb_each(p.attributes) kv
    WHERE p.attributes IS NOT NULL
      AND p.attributes != '{}'::jsonb
  LOOP
    v_count := v_count + 1;

    -- Resolve attribute definition: try UUID match first, then code match
    SELECT ad.id, ad.code, ad.type, ad.scope
      INTO v_attr_id, v_attr_code, v_attr_type, v_attr_scope
    FROM attribute_definitions ad
    WHERE ad.id::text = v_jsonb_key OR ad.code = v_jsonb_key
    LIMIT 1;

    IF v_attr_id IS NULL THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'UNKNOWN_ATTRIBUTE',
              'No attribute definition found for key');
      CONTINUE;
    END IF;

    -- Only PRODUCT-scope attributes belong on products
    IF v_attr_scope != 'PRODUCT' THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'SCOPE_MISMATCH',
              'Attribute scope is ' || v_attr_scope || ', expected PRODUCT');
      CONTINUE;
    END IF;

    -- Coerce value based on attribute type
    v_text_value := NULL;
    v_num_value  := NULL;
    v_bool_value := NULL;
    v_option_value := NULL;
    v_json_value := NULL;

    BEGIN
      IF v_jsonb_value IS NULL OR v_jsonb_value = 'null'::jsonb OR v_jsonb_value = '""'::jsonb THEN
        CONTINUE;  -- Skip null values
      END IF;

      CASE v_attr_type
        WHEN 'INTEGER' THEN
          IF v_jsonb_value #>> '{}' ~ '^-?\d+$' THEN
            v_text_value := v_jsonb_value #>> '{}';
            v_num_value  := (v_jsonb_value #>> '{}')::NUMERIC;
          ELSE
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected integer, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'DECIMAL', 'MEASUREMENT', 'CURRENCY' THEN
          IF v_jsonb_value #>> '{}' ~ '^-?\d+(\.\d+)?$' THEN
            v_text_value := v_jsonb_value #>> '{}';
            v_num_value  := (v_jsonb_value #>> '{}')::NUMERIC;
          ELSE
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected number, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'BOOLEAN' THEN
          v_text_value := v_jsonb_value #>> '{}';
          v_bool_value := CASE
            WHEN v_jsonb_value #>> '{}' = 'true'  THEN TRUE
            WHEN v_jsonb_value #>> '{}' = 'false' THEN FALSE
            WHEN v_jsonb_value #>> '{}' = '1'     THEN TRUE
            WHEN v_jsonb_value #>> '{}' = '0'     THEN FALSE
            ELSE NULL
          END;
          IF v_bool_value IS NULL THEN
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected boolean, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'SELECT' THEN
          v_option_value := v_jsonb_value #>> '{}';

        WHEN 'MULTI_SELECT' THEN
          IF jsonb_typeof(v_jsonb_value) = 'array' THEN
            v_json_value := v_jsonb_value;
          ELSE
            v_json_value := jsonb_build_array(v_jsonb_value);
          END IF;

        WHEN 'DATE', 'DATETIME' THEN
          BEGIN
            v_text_value := (v_jsonb_value #>> '{}')::TIMESTAMPTZ::TEXT;
          EXCEPTION WHEN OTHERS THEN
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected valid date, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END;

        ELSE  -- TEXT, LONG_TEXT, URL, FILE, COLOR, etc.
          v_text_value := v_jsonb_value #>> '{}';
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'PRODUCT', v_product_id, v_jsonb_key, v_jsonb_value::text, 'CONVERSION_ERROR', SQLERRM);
      CONTINUE;
    END;

    -- Check for existing typed row (conflict detection)
    IF EXISTS (
      SELECT 1 FROM product_attribute_values pav
      WHERE pav.product_id = v_product_id
        AND pav.attribute_definition_id = v_attr_id
    ) THEN
      -- Typed row exists — check if values differ (conflict)
      SELECT pav.value_text, pav.value_number::text, pav.value_boolean, pav.option_value
        INTO v_existing_text, v_existing_num, v_existing_bool, v_existing_opt
      FROM product_attribute_values pav
      WHERE pav.product_id = v_product_id
        AND pav.attribute_definition_id = v_attr_id;

      IF (v_existing_text IS DISTINCT FROM v_text_value)
         OR (v_existing_num IS DISTINCT FROM v_num_value::text)
         OR (v_existing_bool IS DISTINCT FROM v_bool_value)
         OR (v_existing_opt IS DISTINCT FROM v_option_value)
      THEN
        INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
        VALUES ('0053', 'PRODUCT', v_product_id, v_attr_code, v_jsonb_value::text, 'CONFLICT',
                'Typed value exists but differs from JSONB; typed value preserved as authoritative');
      END IF;
      -- BD-03: typed is authoritative — do NOT overwrite
      CONTINUE;
    END IF;

    -- Insert typed row
    INSERT INTO product_attribute_values (id, product_id, attribute_definition_id, value_text, value_number, value_boolean, option_value, value_json)
    VALUES (gen_random_uuid(), v_product_id, v_attr_id, v_text_value, v_num_value, v_bool_value, v_option_value, v_json_value);

    -- Batch commit every 500 rows
    IF v_count % v_batch_size = 0 THEN
      RAISE NOTICE 'Product backfill: % rows processed', v_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Product backfill complete: % total rows processed', v_count;

  -- ── Variant backfill ──────────────────────────────────────────
  v_count := 0;

  FOR v_variant_id, v_jsonb_key, v_jsonb_value IN
    SELECT v.id, kv.key, kv.value
    FROM product_variants v,
         LATERAL jsonb_each(v.attributes) kv
    WHERE v.attributes IS NOT NULL
      AND v.attributes != '{}'::jsonb
  LOOP
    v_count := v_count + 1;

    -- Resolve attribute definition
    SELECT ad.id, ad.code, ad.type, ad.scope
      INTO v_attr_id, v_attr_code, v_attr_type, v_attr_scope
    FROM attribute_definitions ad
    WHERE ad.id::text = v_jsonb_key OR ad.code = v_jsonb_key
    LIMIT 1;

    IF v_attr_id IS NULL THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'UNKNOWN_ATTRIBUTE',
              'No attribute definition found for key');
      CONTINUE;
    END IF;

    -- Only VARIANT-scope attributes belong on variants
    IF v_attr_scope != 'VARIANT' THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'SCOPE_MISMATCH',
              'Attribute scope is ' || v_attr_scope || ', expected VARIANT');
      CONTINUE;
    END IF;

    -- Coerce value (same logic as product backfill)
    v_text_value := NULL;
    v_num_value  := NULL;
    v_bool_value := NULL;
    v_option_value := NULL;
    v_json_value := NULL;

    BEGIN
      IF v_jsonb_value IS NULL OR v_jsonb_value = 'null'::jsonb OR v_jsonb_value = '""'::jsonb THEN
        CONTINUE;
      END IF;

      CASE v_attr_type
        WHEN 'INTEGER' THEN
          IF v_jsonb_value #>> '{}' ~ '^-?\d+$' THEN
            v_text_value := v_jsonb_value #>> '{}';
            v_num_value  := (v_jsonb_value #>> '{}')::NUMERIC;
          ELSE
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected integer, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'DECIMAL', 'MEASUREMENT', 'CURRENCY' THEN
          IF v_jsonb_value #>> '{}' ~ '^-?\d+(\.\d+)?$' THEN
            v_text_value := v_jsonb_value #>> '{}';
            v_num_value  := (v_jsonb_value #>> '{}')::NUMERIC;
          ELSE
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected number, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'BOOLEAN' THEN
          v_text_value := v_jsonb_value #>> '{}';
          v_bool_value := CASE
            WHEN v_jsonb_value #>> '{}' = 'true'  THEN TRUE
            WHEN v_jsonb_value #>> '{}' = 'false' THEN FALSE
            WHEN v_jsonb_value #>> '{}' = '1'     THEN TRUE
            WHEN v_jsonb_value #>> '{}' = '0'     THEN FALSE
            ELSE NULL
          END;
          IF v_bool_value IS NULL THEN
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected boolean, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END IF;

        WHEN 'SELECT' THEN
          v_option_value := v_jsonb_value #>> '{}';

        WHEN 'MULTI_SELECT' THEN
          IF jsonb_typeof(v_jsonb_value) = 'array' THEN
            v_json_value := v_jsonb_value;
          ELSE
            v_json_value := jsonb_build_array(v_jsonb_value);
          END IF;

        WHEN 'DATE', 'DATETIME' THEN
          BEGIN
            v_text_value := (v_jsonb_value #>> '{}')::TIMESTAMPTZ::TEXT;
          EXCEPTION WHEN OTHERS THEN
            INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
            VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'INVALID_VALUE',
                    'Expected valid date, got: ' || (v_jsonb_value #>> '{}'));
            CONTINUE;
          END;

        ELSE
          v_text_value := v_jsonb_value #>> '{}';
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
      VALUES ('0053', 'VARIANT', v_variant_id, v_jsonb_key, v_jsonb_value::text, 'CONVERSION_ERROR', SQLERRM);
      CONTINUE;
    END;

    -- Check for existing typed row (conflict detection)
    IF EXISTS (
      SELECT 1 FROM variant_attribute_values vav
      WHERE vav.variant_id = v_variant_id
        AND vav.attribute_definition_id = v_attr_id
    ) THEN
      SELECT vav.value_text, vav.value_number::text, vav.value_boolean, vav.option_value
        INTO v_existing_text, v_existing_num, v_existing_bool, v_existing_opt
      FROM variant_attribute_values vav
      WHERE vav.variant_id = v_variant_id
        AND vav.attribute_definition_id = v_attr_id;

      IF (v_existing_text IS DISTINCT FROM v_text_value)
         OR (v_existing_num IS DISTINCT FROM v_num_value::text)
         OR (v_existing_bool IS DISTINCT FROM v_bool_value)
         OR (v_existing_opt IS DISTINCT FROM v_option_value)
      THEN
        INSERT INTO backfill_errors (migration, entity_type, entity_id, attribute_key, source_value, error_type, detail)
        VALUES ('0053', 'VARIANT', v_variant_id, v_attr_code, v_jsonb_value::text, 'CONFLICT',
                'Typed value exists but differs from JSONB; typed value preserved as authoritative');
      END IF;
      CONTINUE;
    END IF;

    -- Insert typed row
    INSERT INTO variant_attribute_values (id, variant_id, attribute_definition_id, value_text, value_number, value_boolean, option_value, value_json)
    VALUES (gen_random_uuid(), v_variant_id, v_attr_id, v_text_value, v_num_value, v_bool_value, v_option_value, v_json_value);

    IF v_count % v_batch_size = 0 THEN
      RAISE NOTICE 'Variant backfill: % rows processed', v_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Variant backfill complete: % total rows processed', v_count;
END $$;
