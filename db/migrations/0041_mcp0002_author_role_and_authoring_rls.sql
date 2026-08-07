-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0002_author_role_and_authoring_rls.sql`.
-- Moved here 2026-08-04. Renumbered 0002 -> 0041.
--
-- Tainan, TG 2026-08-04: *"deleta /migrations nesses dois repos e não permite
-- mais criar via CI check"*. `itera-player` is now the SINGLE owner of the Itera
-- schema; `itera-api` and `itera-mcp` no longer carry a `migrations/` directory
-- and a CI guard in each fails if one reappears. This file exists so the DDL
-- behind live production objects keeps a home in a repository — deleting it
-- outright would have destroyed the provenance of objects that are still there.
--
-- ⚠️ ALREADY APPLIED BEFORE CONSOLIDATION — merging it applies NOTHING.
-- It was applied to the Itera database (kjefmwlopzeaqgqtlbdn) by hand out of
-- `itera-mcp` around 2026-06-19, long before it arrived here. Every object it
-- creates was confirmed present by a read-only SELECT on 2026-08-04, and it is
-- recorded in `itera.schema_migrations` as applied WITHOUT being executed, via
-- `db/scripts/apply-migrations.sh baseline-add`. Do NOT "re-apply" it.
--
-- The new number is the order in which it was ACTUALLY applied, which is also
-- its dependency order — the old numbers could not be: itera-api's 0003 landed
-- after its 0010/0011, and itera-mcp's 0002 must precede itera-api's 0012, which
-- calls itera.current_author_tenant_ids(). Three independent 00NN sequences
-- against one database is exactly the collision this consolidation ends.
--
-- THE SQL BELOW IS BYTE-FOR-BYTE THE ORIGINAL. Nothing was edited — an edited
-- migration and a live database that disagree is the failure this file guards.
-- ============================================================================

-- 0002_author_role_and_authoring_rls.sql
-- Adds the `author` value to itera.member_role and the author-role RLS WRITE
-- policies for the authoring surface (programs / units / lessons / activities).
--
-- Context: the initial itera.* schema (0001) shipped only SELECT policies
-- (tenant-scoped reads). The itera-mcp authoring MCP needs author-role users
-- to INSERT/UPDATE/DELETE program graph entities, governed by RLS (NOT
-- service_role). This migration is IDEMPOTENT so it coexists with the sibling
-- plan #6 migration that adds `tenant_admin` (already present) and a custom
-- access-token hook:
--   * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for the enum.
--   * `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
--   * `CREATE OR REPLACE FUNCTION` for the helper.
--
-- Auth model: a caller's Supabase JWT is validated by the MCP server against
-- itera's SUPABASE_JWT_SECRET; supabase-js attaches it so Postgres sees
-- auth.uid() = the JWT `sub`. itera.current_itera_user_id() maps that to the
-- itera.users.id; the helper below returns the set of tenant_ids where the
-- current user holds an authoring role.

-- 1. Enum value (idempotent; ADD VALUE cannot run inside the same tx as its
--    use, so it's a standalone statement — psql -1 wraps the file, but
--    ADD VALUE IF NOT EXISTS is a no-op when present and Postgres 12+ allows
--    ADD VALUE in a transaction as long as the new value is not used in the
--    same tx. We only USE it inside a SECURITY DEFINER function body that is
--    evaluated at call time, never at migration time, so this is safe.)
ALTER TYPE itera.member_role ADD VALUE IF NOT EXISTS 'author';

-- 2. Helper: tenant_ids where the current user can author content.
--    Authoring roles = author, instructor, tenant_admin, owner.
--    (instructor/admin/owner implicitly can author; author is the dedicated
--    least-privilege authoring role for the MCP.)
CREATE OR REPLACE FUNCTION itera.current_author_tenant_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'itera', 'public'
AS $function$
  SELECT m.tenant_id
  FROM itera.memberships m
  WHERE m.user_id = itera.current_itera_user_id()
    AND m.role IN ('author', 'instructor', 'tenant_admin', 'owner');
$function$;

GRANT EXECUTE ON FUNCTION itera.current_author_tenant_ids() TO authenticated, anon;

-- 2b. Table-level write GRANTs for the `authenticated` role. RLS policies gate
--     WHICH rows can be written, but PostgREST still requires the Postgres role
--     to hold the INSERT/UPDATE/DELETE privilege on the table. Without these,
--     every authoring write is denied (42501) even for an author. The RLS
--     policies in section 3 then narrow these grants to the author's tenants.
GRANT INSERT, UPDATE, DELETE ON itera.programs   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON itera.units      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON itera.lessons    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON itera.activities TO authenticated;

-- 3. Author WRITE policies, one entity at a time. Each is tenant-scoped: the
--    row must belong (transitively) to a tenant the caller can author in.

-- 3a. programs ------------------------------------------------------------
DROP POLICY IF EXISTS programs_author_insert ON itera.programs;
CREATE POLICY programs_author_insert ON itera.programs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));

DROP POLICY IF EXISTS programs_author_update ON itera.programs;
CREATE POLICY programs_author_update ON itera.programs
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT itera.current_author_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));

DROP POLICY IF EXISTS programs_author_delete ON itera.programs;
CREATE POLICY programs_author_delete ON itera.programs
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT itera.current_author_tenant_ids()));

-- 3b. units ---------------------------------------------------------------
DROP POLICY IF EXISTS units_author_insert ON itera.units;
CREATE POLICY units_author_insert ON itera.units
  FOR INSERT TO authenticated
  WITH CHECK (program_id IN (
    SELECT p.id FROM itera.programs p
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS units_author_update ON itera.units;
CREATE POLICY units_author_update ON itera.units
  FOR UPDATE TO authenticated
  USING (program_id IN (
    SELECT p.id FROM itera.programs p
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())))
  WITH CHECK (program_id IN (
    SELECT p.id FROM itera.programs p
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS units_author_delete ON itera.units;
CREATE POLICY units_author_delete ON itera.units
  FOR DELETE TO authenticated
  USING (program_id IN (
    SELECT p.id FROM itera.programs p
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

-- 3c. lessons -------------------------------------------------------------
DROP POLICY IF EXISTS lessons_author_insert ON itera.lessons;
CREATE POLICY lessons_author_insert ON itera.lessons
  FOR INSERT TO authenticated
  WITH CHECK (unit_id IN (
    SELECT u.id FROM itera.units u
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS lessons_author_update ON itera.lessons;
CREATE POLICY lessons_author_update ON itera.lessons
  FOR UPDATE TO authenticated
  USING (unit_id IN (
    SELECT u.id FROM itera.units u
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())))
  WITH CHECK (unit_id IN (
    SELECT u.id FROM itera.units u
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS lessons_author_delete ON itera.lessons;
CREATE POLICY lessons_author_delete ON itera.lessons
  FOR DELETE TO authenticated
  USING (unit_id IN (
    SELECT u.id FROM itera.units u
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

-- 3d. activities ----------------------------------------------------------
DROP POLICY IF EXISTS activities_author_insert ON itera.activities;
CREATE POLICY activities_author_insert ON itera.activities
  FOR INSERT TO authenticated
  WITH CHECK (lesson_id IN (
    SELECT l.id FROM itera.lessons l
    JOIN itera.units u ON u.id = l.unit_id
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS activities_author_update ON itera.activities;
CREATE POLICY activities_author_update ON itera.activities
  FOR UPDATE TO authenticated
  USING (lesson_id IN (
    SELECT l.id FROM itera.lessons l
    JOIN itera.units u ON u.id = l.unit_id
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())))
  WITH CHECK (lesson_id IN (
    SELECT l.id FROM itera.lessons l
    JOIN itera.units u ON u.id = l.unit_id
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));

DROP POLICY IF EXISTS activities_author_delete ON itera.activities;
CREATE POLICY activities_author_delete ON itera.activities
  FOR DELETE TO authenticated
  USING (lesson_id IN (
    SELECT l.id FROM itera.lessons l
    JOIN itera.units u ON u.id = l.unit_id
    JOIN itera.programs p ON p.id = u.program_id
    WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())));
