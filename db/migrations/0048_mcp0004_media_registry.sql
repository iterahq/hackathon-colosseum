-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-mcp` — original path `migrations/0004_media_registry.sql`.
-- Moved here 2026-08-04. Renumbered 0004 -> 0048.
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

-- 0004_media_registry.sql
-- Adds itera.media — a versioned media registry (single source of truth for
-- InstructionPanel assets). Activity specs reference media by `media_id`
-- (resolved to the current `url` at render time), NEVER raw URLs.
--
-- Plan: 20260706-iterahq-activity-authoring-canvas-testing (ADR-11).
--
-- The S3 `iterahq` bucket that these rows point into is provisioned in a
-- separate infra phase (Phase 6) — THIS migration only creates the table +
-- enum + RLS. `url` points into that public bucket.
--
-- Versioning model: a logical media item keeps its `id`; re-hosting / CDN
-- swap / re-encode bumps `version` so citing specs (which pin `media_id`,
-- optionally `media_version`) follow automatically. `checksum` gives dedup of
-- identical uploads within a tenant.
--
-- IDEMPOTENT (re-runnable), matching 0002/0003 conventions:
--   * enum creation guarded by a duplicate_object catch.
--   * CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--   * DROP POLICY IF EXISTS before CREATE POLICY.
-- Applied directly against the Itera project via `itera-supabase-helpers`.

-- 1. Media kind enum. Guarded so re-runs are no-ops.
DO $$
BEGIN
  CREATE TYPE itera.media_kind AS ENUM ('audio', 'image', 'video');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Table. tenant_id is carried directly (media is a tenant-scoped asset),
--    so RLS keys straight off it (no join needed, unlike activities).
CREATE TABLE IF NOT EXISTS itera.media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES itera.tenants(id) ON DELETE CASCADE,
  kind        itera.media_kind NOT NULL,
  url         text NOT NULL,                 -- points into the public S3 `iterahq` bucket
  version     int  NOT NULL DEFAULT 1,       -- bump on re-host / replace
  checksum    text,                          -- content hash for dedup
  metadata    jsonb NOT NULL DEFAULT '{}',   -- {width,height,duration,mime,bytes,alt_pt,alt_en,...}
  created_by  uuid NOT NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, checksum)               -- dedup identical uploads within a tenant
);

CREATE INDEX IF NOT EXISTS media_tenant_id_idx ON itera.media (tenant_id);
CREATE INDEX IF NOT EXISTS media_kind_idx      ON itera.media (kind);

-- 3. Table-level GRANTs (PostgREST needs the base privilege; RLS narrows it).
GRANT SELECT, INSERT, UPDATE ON itera.media TO authenticated;

-- 4. RLS — tenant members read; authors of the tenant write (INSERT/UPDATE).
ALTER TABLE itera.media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_select_tenant ON itera.media;
CREATE POLICY media_select_tenant ON itera.media
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT itera.current_tenant_ids()));

DROP POLICY IF EXISTS media_author_insert ON itera.media;
CREATE POLICY media_author_insert ON itera.media
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));

DROP POLICY IF EXISTS media_author_update ON itera.media;
CREATE POLICY media_author_update ON itera.media
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT itera.current_author_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT itera.current_author_tenant_ids()));
