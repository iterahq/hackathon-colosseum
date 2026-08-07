-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0006_activity_comments.sql`.
-- Moved here 2026-08-04. Renumbered 0006 -> 0050.
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

-- 0006_activity_comments.sql
-- Adds itera.activity_comments — Figma-style review comments anchored to an
-- activity cell on the per-unit review canvas, stamped with the unit-version
-- active at creation. Mirrors lesson_studio.slide_comments, re-keyed onto
-- itera entities (program/unit/lesson/activity + unit_version).
--
-- Plan: 20260706-iterahq-activity-authoring-canvas-testing (ADR-2 / ADR-7).
--
-- MUST land AFTER 0005 (FK unit_version_id → itera.unit_versions).
--
-- RLS model (ADR-2, owner-based edit like lesson-studio):
--   * SELECT — any tenant member (itera.current_tenant_ids()) can read.
--   * INSERT — authors of the tenant (itera.current_author_tenant_ids()).
--   * UPDATE/DELETE — authors of the tenant AND author_id = auth.uid()
--     (owner-based, so an author can only edit/delete their OWN comments).
-- author_id defaults to auth.uid(); the owner check compares auth.uid(), so
-- the default and the check are internally consistent (per plan spec).
--
-- IDEMPOTENT (re-runnable): CREATE TABLE/INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE, CREATE OR REPLACE FUNCTION + guarded
-- trigger. Applied directly against the Itera project via `itera-supabase-helpers`.

-- 1. Table. Denormalized program_id/unit_id/lesson_id/tenant_id give the
--    clipboard ref-line context (see the copy→agent format) without extra
--    joins; tenant_id also keys RLS directly.
CREATE TABLE IF NOT EXISTS itera.activity_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES itera.programs(id) ON DELETE CASCADE,
  unit_id         uuid NOT NULL REFERENCES itera.units(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES itera.lessons(id) ON DELETE CASCADE,
  activity_id     uuid NOT NULL REFERENCES itera.activities(id) ON DELETE CASCADE,
  unit_version_id uuid NOT NULL REFERENCES itera.unit_versions(id) ON DELETE CASCADE,
  body            text NOT NULL,
  author_id       uuid NOT NULL DEFAULT auth.uid(),
  resolved        boolean NOT NULL DEFAULT false,
  anchor_x        double precision,          -- 0..1 relative
  anchor_y        double precision,          -- 0..1 relative
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_comments_unit_version_idx
  ON itera.activity_comments (unit_id, unit_version_id);
CREATE INDEX IF NOT EXISTS activity_comments_activity_idx
  ON itera.activity_comments (activity_id);

-- 2. updated_at trigger. itera has no shared updated_at helper yet, so define
--    an itera-native one (CREATE OR REPLACE = idempotent) and attach it.
CREATE OR REPLACE FUNCTION itera.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS activity_comments_set_updated_at ON itera.activity_comments;
CREATE TRIGGER activity_comments_set_updated_at
  BEFORE UPDATE ON itera.activity_comments
  FOR EACH ROW EXECUTE FUNCTION itera.set_updated_at();

-- 3. Table-level GRANTs (PostgREST base privilege; RLS narrows the rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON itera.activity_comments TO authenticated;

-- 4. RLS — tenant members read; authors write; owner-based edit/delete.
ALTER TABLE itera.activity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_comments_select_tenant ON itera.activity_comments;
CREATE POLICY activity_comments_select_tenant ON itera.activity_comments
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT itera.current_tenant_ids()));

DROP POLICY IF EXISTS activity_comments_author_insert ON itera.activity_comments;
CREATE POLICY activity_comments_author_insert ON itera.activity_comments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));

DROP POLICY IF EXISTS activity_comments_owner_update ON itera.activity_comments;
CREATE POLICY activity_comments_owner_update ON itera.activity_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT itera.current_author_tenant_ids())
    AND author_id = auth.uid()
  )
  WITH CHECK (
    tenant_id IN (SELECT itera.current_author_tenant_ids())
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS activity_comments_owner_delete ON itera.activity_comments;
CREATE POLICY activity_comments_owner_delete ON itera.activity_comments
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT itera.current_author_tenant_ids())
    AND author_id = auth.uid()
  );
