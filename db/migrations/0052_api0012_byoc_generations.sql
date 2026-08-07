-- ============================================================================
-- CONSOLIDATED FROM `iterahq/itera-api` — original path `migrations/0012_byoc_generations.sql`.
-- Moved here 2026-08-04. Renumbered 0012 -> 0052.
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
-- `itera-api` around 2026-07-23, long before it arrived here. Every object it
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

-- BYOC (Bring Your Own Context) — persist the activity generated FOR a learner.
-- Targets the ITERA Supabase project (kjefmwlopzeaqgqtlbdn), NOT DFL prod.
-- Applied via the itera-supabase-helpers `migrate` flow.
--
-- Plan: 20260723-itera-code-live-byoc-arch (ADR-5/6/7/8/13).
--
-- WHY THIS TABLE EXISTS (ADR-8)
-- -----------------------------
-- In BYOC the learner supplies a free-text seed (a hobby) and the LLM generates
-- the activity content around it ONCE, at generation time. Runtime does NOT call
-- an LLM and does NOT judge: correction is a deterministic lookup against the
-- gabarito the generation already embedded (ADR-13). That only holds if the
-- generated content is DURABLE — if a page reload re-rolled the question, the
-- learner would be graded against a tree they never saw. So the generated
-- activity is persisted "como se fosse a resposta do aluno" (Tainan): one row per
-- (learner, activity, attempt), reused on subsequent reads.
--
-- It is deliberately NOT `itera.activity_results`: that table holds the learner's
-- VERDICT (passed/score/feedback). This holds the QUESTION they were given. The
-- two are 1:N in principle (a generated tree can be answered, re-answered, or
-- never answered) and mixing them would overload `feedback` jsonb with content.
--
-- Numbering note: `itera-api/migrations/` is its OWN sequence, independent of
-- `itera-player/db/migrations/`. Both apply to the same DB; numbers may repeat
-- across the two repos (0010/0011 already do). Apply by repo, in-repo order.
--
-- Idempotent + safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itera.byoc_generations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES itera.users(id) ON DELETE CASCADE,
  activity_id     uuid NOT NULL REFERENCES itera.activities(id) ON DELETE CASCADE,
  -- 1-based, mirrors itera.activity_results.attempt. A learner who re-seeds
  -- (regenerate=true) gets attempt N+1; the previous rows stay for auditing.
  attempt         integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  -- The learner's raw step-1 input, bounded at write time by the API (1..500
  -- chars). Kept verbatim so a bad generation can be reproduced/diagnosed.
  seed            text NOT NULL CHECK (length(seed) BETWEEN 1 AND 2000),
  -- WHAT was generated. 'choice_tree' = the deterministic single-path tree of
  -- ADR-13 (validated against @iterahq/activity-spec GeneratedChoiceTreeSchema).
  -- Open text + CHECK rather than an enum so the planned cosmetic-content mode
  -- (BYOC over the code snack: only labels are generated, structure and checks
  -- stay authored) lands as a one-line CHECK change, not an enum migration.
  mode            text NOT NULL DEFAULT 'choice_tree'
                    CHECK (mode IN ('choice_tree', 'cosmetic')),
  -- The validated generated payload — the shape depends on `mode`. For
  -- 'choice_tree' this is a GeneratedChoiceTree, gabarito included.
  generated       jsonb NOT NULL,
  -- true => generation failed validation after every retry and the activity's
  -- authored `spec.fallback` was served instead. Makes "how often does the LLM
  -- fail us" a SQL question, which is the whole point of persisting.
  fallback_used   boolean NOT NULL DEFAULT false,
  -- How many LLM calls this row cost (0 when the fallback was served without the
  -- model ever being reachable).
  attempts_used   smallint NOT NULL DEFAULT 0 CHECK (attempts_used >= 0),
  model           text NULL,
  -- Why generation degraded, when it did. NULL on a clean generation.
  degraded_reason text NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per (learner, activity, attempt) — makes the API's "next attempt"
-- read/insert race-safe and blocks accidental duplicate generations.
CREATE UNIQUE INDEX IF NOT EXISTS uq_byoc_generations_user_activity_attempt
  ON itera.byoc_generations (user_id, activity_id, attempt);

-- The hot read: "the latest generation for this learner on this activity".
CREATE INDEX IF NOT EXISTS idx_byoc_generations_latest
  ON itera.byoc_generations (user_id, activity_id, created_at DESC);

-- Author/instructor review sweep: "everything generated for this activity".
CREATE INDEX IF NOT EXISTS idx_byoc_generations_activity
  ON itera.byoc_generations (activity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Grants — the itera-api connects as `postgres` (BYPASSRLS) and scopes every
--    query by user_id in SQL. These grants are for the PLAYER's direct Supabase
--    access (role `authenticated`), where RLS below is the real gate.
--    No DELETE: a generated question is an audit record; learners don't erase it.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON itera.byoc_generations TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS — mirrors itera.activity_results (self read/write) plus an author lane.
-- ---------------------------------------------------------------------------
ALTER TABLE itera.byoc_generations ENABLE ROW LEVEL SECURITY;

-- The learner: full read/insert of their OWN generations, nobody else's.
DROP POLICY IF EXISTS byoc_generations_rw_self ON itera.byoc_generations;
CREATE POLICY byoc_generations_rw_self ON itera.byoc_generations
  FOR ALL
  TO authenticated
  USING (user_id = itera.current_itera_user_id())
  WITH CHECK (user_id = itera.current_itera_user_id());

-- The instructor: read the generations of learners in THEIR tenants — the live
-- class needs to see what each student was actually asked (plan Frente 2).
DROP POLICY IF EXISTS byoc_generations_select_instructor ON itera.byoc_generations;
CREATE POLICY byoc_generations_select_instructor ON itera.byoc_generations
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT m.user_id FROM itera.memberships m
       WHERE m.tenant_id IN (SELECT itera.current_instructor_tenant_ids())
    )
  );

-- The tenant admin: same read lane (mirrors results_select_admin).
DROP POLICY IF EXISTS byoc_generations_select_admin ON itera.byoc_generations;
CREATE POLICY byoc_generations_select_admin ON itera.byoc_generations
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT m.user_id FROM itera.memberships m
       WHERE m.tenant_id IN (SELECT itera.current_admin_tenant_ids())
    )
  );

-- The AUTHOR of the activity: read every generation of the activities they own,
-- scoped through the content tree (same join the activities_author_* policies
-- use). This is the ADR-8 purpose — "revisar depois quais questões foram geradas
-- e avaliar a qualidade" is the author's job, and an author is not necessarily an
-- instructor of the learner's tenant.
DROP POLICY IF EXISTS byoc_generations_select_author ON itera.byoc_generations;
CREATE POLICY byoc_generations_select_author ON itera.byoc_generations
  FOR SELECT
  TO authenticated
  USING (
    activity_id IN (
      SELECT a.id
        FROM itera.activities a
        JOIN itera.lessons  l ON l.id = a.lesson_id
        JOIN itera.units    u ON u.id = l.unit_id
        JOIN itera.programs p ON p.id = u.program_id
       WHERE p.tenant_id IN (SELECT itera.current_author_tenant_ids())
    )
  );

COMMENT ON TABLE itera.byoc_generations IS
  'BYOC (ADR-8): the activity generated for one learner from their seed. Durable so '
  'runtime correction stays a deterministic lookup and generation quality is auditable.';
