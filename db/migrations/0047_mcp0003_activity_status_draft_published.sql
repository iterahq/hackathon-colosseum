-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0003_activity_status_draft_published.sql`.
-- Moved here 2026-08-04. Renumbered 0003 -> 0047.
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

-- 0003_activity_status_draft_published.sql
-- Adds a draft|published lifecycle to itera.activities and updates the
-- student-facing SELECT policy so learners only ever read `published`
-- activities, while authors of the tenant continue to see drafts.
--
-- Plan: 20260706-iterahq-activity-authoring-canvas-testing (ADR-8).
--
-- Context: today every write to itera.activities is instantly live to
-- students (the only SELECT policy, `activities_select_tenant`, is gated
-- purely on tenant membership via itera.current_tenant_ids()). Authors need
-- to stage MCP/agent edits and review them on the per-unit canvas BEFORE
-- students see them. This migration:
--   1. Adds an `itera.activity_status` enum (draft|published).
--   2. Adds `itera.activities.status` (NOT NULL DEFAULT 'draft') so all NEW
--      writes (create_activity/update_activity via itera-mcp) land as drafts.
--   3. Backfills EXISTING rows to 'published' — they are already live to
--      students, so they must NOT vanish when the filter turns on.
--   4. Replaces `activities_select_tenant` so learners read only 'published'
--      while author-tenant users also read drafts.
--
-- IDEMPOTENT (re-runnable), matching the conventions of 0002:
--   * enum creation guarded by a duplicate_object catch.
--   * ADD COLUMN + backfill run only when the column does not yet exist, so a
--     re-run never re-publishes rows an author has since drafted.
--   * DROP POLICY IF EXISTS before CREATE POLICY.
-- The Itera project is OURS — this is applied directly via the
-- `itera-supabase-helpers` skill (`migrate`), NOT dfl-schema, NOT psql-write
-- against DFL prod.

-- 1. Enum type (draft|published). Guarded so re-runs are no-ops.
DO $$
BEGIN
  CREATE TYPE itera.activity_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2 + 3. Column + one-time backfill. Wrapped in an existence check so the
--    backfill runs exactly once (when the column is first added). On a re-run
--    the column already exists → the whole block is a no-op and drafts created
--    since the first apply are preserved (NOT re-published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'itera'
      AND table_name = 'activities'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE itera.activities
      ADD COLUMN status itera.activity_status NOT NULL DEFAULT 'draft';

    -- Existing rows are already live to students → publish them so nothing
    -- disappears when the published-only student filter (section 4) turns on.
    UPDATE itera.activities SET status = 'published';
  END IF;
END $$;

-- Partial index to make the student read path (status = 'published') cheap.
CREATE INDEX IF NOT EXISTS activities_status_idx
  ON itera.activities (status);

-- 4. Student-visibility SELECT policy. Replaces the tenant-only
--    `activities_select_tenant` with: a caller must be a member of the
--    activity's tenant AND either the activity is published OR the caller is
--    an author of that tenant (authors see drafts + published). This is the
--    ONLY change to reads — writes stay governed by the 0002 author policies.
--    (Original policy applied to PUBLIC — no TO clause — so we preserve that.)
DROP POLICY IF EXISTS activities_select_tenant ON itera.activities;
CREATE POLICY activities_select_tenant ON itera.activities
  FOR SELECT
  USING (
    lesson_id IN (
      SELECT l.id
      FROM itera.lessons l
      JOIN itera.units u ON u.id = l.unit_id
      JOIN itera.programs p ON p.id = u.program_id
      WHERE p.tenant_id IN (SELECT itera.current_tenant_ids())
    )
    AND (
      status = 'published'
      OR lesson_id IN (
        SELECT l.id
        FROM itera.lessons l
        JOIN itera.units u ON u.id = l.unit_id
        JOIN itera.programs p ON p.id = u.program_id
        WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())
      )
    )
  );
