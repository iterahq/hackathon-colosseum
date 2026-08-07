-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0005_unit_versions.sql`.
-- Moved here 2026-08-04. Renumbered 0005 -> 0049.
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
-- `itera-mcp` around 2026-07-06, long before it arrived here. Every object it
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

-- 0005_unit_versions.sql
-- Adds itera.unit_versions — UNIT-level version stamping for the per-unit
-- review/comment canvas. Comments (0006) are tagged with the unit-version
-- active when they were written; "current" = max(version_number) per unit.
--
-- Plan: 20260706-iterahq-activity-authoring-canvas-testing (ADR-6 / ADR-7).
--
-- Why unit-level (not program_versions): the canvas is per-UNIT (a program
-- has ~100 lessons — too broad; a unit ~8–10 is the review grain), so the
-- version stamp is naturally unit-scoped. Mirrors lesson_studio.project_versions
-- (max(version_number) = current; no back-reference FK on the parent, kept
-- simple), re-keyed onto itera.units.
--
-- MUST land BEFORE 0006 (activity_comments FKs unit_version_id → here).
--
-- IDEMPOTENT (re-runnable): CREATE TABLE/INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE, CREATE OR REPLACE FUNCTION.
-- Applied directly against the Itera project via `itera-supabase-helpers`.

-- 1. Table. tenant_id carried directly for RLS; unit_id FKs the parent unit.
CREATE TABLE IF NOT EXISTS itera.unit_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  unit_id        uuid NOT NULL REFERENCES itera.units(id) ON DELETE CASCADE,
  version_number int  NOT NULL,               -- max() per unit = "current"
  label          text,
  created_by     uuid NOT NULL DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, version_number)
);

CREATE INDEX IF NOT EXISTS unit_versions_unit_id_idx ON itera.unit_versions (unit_id);

-- 2. Table-level GRANTs. Versions are append-only from the UI (a "Bump
--    version" creates the next row) → SELECT + INSERT only.
GRANT SELECT, INSERT ON itera.unit_versions TO authenticated;

-- 3. RLS — tenant members read; authors of the tenant create versions.
ALTER TABLE itera.unit_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_versions_select_tenant ON itera.unit_versions;
CREATE POLICY unit_versions_select_tenant ON itera.unit_versions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT itera.current_tenant_ids()));

DROP POLICY IF EXISTS unit_versions_author_insert ON itera.unit_versions;
CREATE POLICY unit_versions_author_insert ON itera.unit_versions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));

-- 4. ensureCurrentUnitVersion(unit_id) helper — returns the current
--    unit_version id, auto-creating v1 on first call (mirrors lesson-studio's
--    useCreateComment auto-provisioning). SECURITY DEFINER so it can create
--    the row on behalf of the author; still guarded to author tenants via a
--    membership check on the unit's tenant. Derives tenant_id from the unit's
--    program (units carry no tenant_id column).
CREATE OR REPLACE FUNCTION itera.ensure_current_unit_version(p_unit_id uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'itera', 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_version_id uuid;
BEGIN
  -- Resolve the unit's tenant via its program.
  SELECT p.tenant_id
    INTO v_tenant_id
    FROM itera.units u
    JOIN itera.programs p ON p.id = u.program_id
    WHERE u.id = p_unit_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unit % not found', p_unit_id;
  END IF;

  -- Caller must be an author of the unit's tenant.
  IF v_tenant_id NOT IN (SELECT itera.current_author_tenant_ids()) THEN
    RAISE EXCEPTION 'not an author of tenant % for unit %', v_tenant_id, p_unit_id
      USING ERRCODE = '42501';
  END IF;

  -- Latest version for this unit, if any.
  SELECT uv.id
    INTO v_version_id
    FROM itera.unit_versions uv
    WHERE uv.unit_id = p_unit_id
    ORDER BY uv.version_number DESC
    LIMIT 1;

  -- None yet → create v1.
  IF v_version_id IS NULL THEN
    INSERT INTO itera.unit_versions (tenant_id, unit_id, version_number)
    VALUES (v_tenant_id, p_unit_id, 1)
    RETURNING id INTO v_version_id;
  END IF;

  RETURN v_version_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION itera.ensure_current_unit_version(uuid) TO authenticated;
