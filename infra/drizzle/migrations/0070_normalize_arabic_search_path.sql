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
