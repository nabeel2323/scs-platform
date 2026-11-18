-- 0070_public_access_and_function_search_path_hardening.sql
--
-- G-002 / G-020 remediation.
--
-- The audited Supabase project had 114 public tables owned by the migration
-- role. anon/authenticated had no CRUD grants, but retained TRUNCATE,
-- REFERENCES, TRIGGER and (on PostgreSQL 17) MAINTAIN privileges on every
-- table. The migration role's default ACL repeated those grants for future
-- public tables.
--
-- Revoke all table/sequence privileges from the public client roles on the
-- existing application schema and from future objects created by the role
-- executing this migration. This is intentionally scoped to anon/authenticated:
-- service_role is server-only and its Supabase-managed grants are not changed.
--
-- RLS is NOT enabled here. The deployed API's actual DATABASE_URL username has
-- not yet been confirmed, and enabling RLS without a matching policy for a
-- non-owner application role could break every API query. RLS policy design is
-- a separate gated step after the runtime DB role and all direct access paths
-- are verified.
--
-- G-020: normalize_arabic uses only pg_catalog built-ins. Pin its search_path
-- to pg_catalog so an untrusted schema cannot shadow a function/operator name.
--
-- Forward-only and safe to re-run.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

DO $migration$
DECLARE
  migration_role name := current_user;
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
    migration_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated',
    migration_role
  );
END
$migration$;

ALTER FUNCTION public.normalize_arabic(text) SET search_path = pg_catalog;
