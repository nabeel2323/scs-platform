-- 0070_normalize_arabic_search_path.sql
--
-- G-020: pin the immutable Arabic normalization function to pg_catalog.
-- Every routine referenced by normalize_arabic (regexp_replace, chr,
-- translate, replace, lower and trim) is a PostgreSQL built-in. Excluding
-- writable schemas from the function search path prevents object shadowing.
--
-- This is a function-local setting; it does not change database, role, or
-- session defaults and does not modify data or grants.

ALTER FUNCTION public.normalize_arabic(TEXT)
  SET search_path = pg_catalog;

-- Verification is performed by the migration test suite / post-migration
-- catalog inspection: pg_proc.proconfig must contain search_path=pg_catalog.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'normalize_arabic'
      AND pg_get_function_identity_arguments(p.oid) = 'input text'
      AND COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog']
  ) THEN
    RAISE EXCEPTION 'G-020: normalize_arabic search_path was not pinned to pg_catalog';
  END IF;
END;
$$;
