-- 0076_public_api_role_privilege_hardening.sql
-- G-002: remove non-CRUD table and sequence privileges from Supabase API client roles.
-- This is deliberately separate from 0070_normalize_arabic_search_path.sql,
-- which already pins normalize_arabic(search_path) on develop. No RLS is enabled.
-- The server-only service_role and the configured API database role are untouched.
-- Safe on disposable PostgreSQL and Supabase: create the client roles only when absent.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

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
