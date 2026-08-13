-- ============================================================================
-- Itera migration 0064 — restore the `status` predicate on the learner-facing
-- SELECT policy of itera.activities.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- WHAT IS WRONG IN PRODUCTION TODAY
-- ---------------------------------
-- `activities_select_tenant` filters on TENANT MEMBERSHIP ONLY. It carries no
-- `status` predicate, so `draft` hides an activity from nobody. Measured
-- 2026-08-10 through the real PostgREST path, as the smoke identity — a
-- `learner` of `dfl-batch`, NOT an author there:
--
--     GET /rest/v1/activities?lesson_id=eq.2310d0a8-…&select=id,status
--     -> 200, 12 rows, every one of them {"status":"draft"}
--
-- The same count came back through `SET LOCAL ROLE authenticated` + real JWT
-- claims. Both routes agree, and neither is the BYPASSRLS admin path.
--
-- Fleet-wide at the time of writing: 24 draft activities were readable by
-- learners — 23 in `dfl-batch` across 4 lessons, 1 in `plg-5bd104869948`.
--
-- THIS IS A REGRESSION, NOT AN OMISSION
-- -------------------------------------
-- Migration 0047 (`0047_mcp0003_activity_status_draft_published.sql`, applied
-- to production by hand around 2026-07-06 out of `itera-mcp` as its 0003)
-- created this policy WITH the predicate. The evidence that it really ran:
--
--   * `itera.activity_status` exists;
--   * `itera.activities.status` is `NOT NULL DEFAULT 'draft'::itera.activity_status`;
--   * `activities_status_idx` exists;
--   * the original pre-consolidation file in `itera-mcp` history contains the
--     same `DROP POLICY` / `CREATE POLICY` block byte-for-byte.
--
-- All four sections of that file ran. The policy was then put back to its 0002
-- shape by something outside the ledger. The revert was SURGICAL, not a
-- wholesale replay of 0002: `tenants_select_public` still carries the 0026
-- refinement (`slug not like 'plg-%'`), so 0002 was not simply re-run. The
-- likeliest vehicle is the old `itera-supabase-helpers migrate` side door,
-- which could apply arbitrary DDL to this database outside
-- `itera.schema_migrations` and was removed on 2026-08-04 for exactly this
-- class of reason. By construction it left no trace.
--
-- WHY NEITHER EXISTING GUARD SAW IT — AND WHAT NOW DOES
-- -----------------------------------------------------
-- Both blind spots are structural, so both are worth stating:
--
--   * `fresh-apply.sh` builds from ZERO, and in that order 0002 runs long
--     before 0047, so a from-scratch build produces the CORRECT policy. A
--     from-zero check can never detect a drift that only exists in production.
--   * `db-drift` / `itera.schema_object_census` record object NAMES, not
--     definitions. `pol itera.activities activities_select_tenant` is byte-
--     identical in all six census snapshots — before and after the regression.
--     A policy can have its WHERE clause replaced without moving the digest.
--
-- So the durable guard cannot be another shape check. It has to be a
-- BEHAVIOURAL one: `db/scripts/test-rls-activity-visibility.sh`, added
-- alongside this migration and run by `db-migration-check`, stands up a learner
-- and an author against a throwaway database and asserts what each may SELECT.
-- It fails if this predicate ever disappears again.
--
-- THE SHAPE, AND WHY AUTHORS MUST KEEP THEIR DRAFTS
-- -------------------------------------------------
-- Modelled on the sibling policy `activity_defs_select_tenant` (migration
-- 0024), which never regressed and is the reason publishing the 7 defs changed
-- learner visibility while publishing the 7 activities changed nothing:
--
--     tenant member AND (status = 'published' OR caller authors this tenant)
--
-- `itera.current_author_tenant_ids()` resolves the roles
-- `author | instructor | tenant_admin | owner`, so this restores the learner
-- filter WITHOUT blinding authors to their own drafts. That matters: the
-- lesson player's `getLessonWithActivities` deliberately does NOT filter on
-- `status` and does not even select it — the back-office preview reads drafts
-- through that same query, under the caller's own JWT. RLS is the only correct
-- place for this filter, and no player change is needed or wanted.
--
-- BLAST RADIUS — MEASURED BEFORE WRITING, NOT ASSUMED
-- ---------------------------------------------------
-- ⚠️ READ THE 2026-08-13 UPDATE BELOW FIRST. The drafts were published on
-- 2026-08-13, so this section is the state BEFORE that. The blast radius today
-- is zero.
--
-- Hiding a draft REMOVES rows a learner can currently see, so the risk is a
-- lesson that goes blank mid-course, or progress that is stranded on a row its
-- owner can no longer read. Measured 2026-08-10:
--
--   * 24 draft activities: 23 in `dfl-batch` (4 lessons), 1 in `plg-5bd104869948`.
--   * Learner traffic on a draft — `activity_results` 21 rows, `progress` 4,
--     `activity_traces` 14, `class_answers` 0 — comes from exactly TWO users:
--       taigfs@gmail.com                (instructor of dfl-batch, owner of
--                                        itera, author of plg-5bd104869948)
--       samuelstefanodocarmo@gmail.com  (tenant_admin of dfl-batch)
--     BOTH hold author-tier roles in the affected tenant, so both are inside
--     `current_author_tenant_ids()` and BOTH KEEP SEEING EVERY DRAFT after this
--     migration. No plain learner has ever touched a draft activity.
--     Rows of learner work orphaned by this change: ZERO.
--   * `class_sessions` on the affected lessons: 3, all `ended` (last
--     2026-08-05). None live, none scheduled.
--
-- Four of the five affected lessons hold NO published activity, so a learner
-- who opens them will now see an empty lesson instead of unfinished content.
-- That is the intended correction and not a side effect: those lessons were
-- never publishable in the first place. Named here so the change is not a
-- surprise —
--     dfl-batch  educar-mais-codigo  u0/l6  "Git 3 · Treino no terminal…"  12 draft / 0 published
--     dfl-batch  teste-personalizacao-fill-2026-08-05  u0/l0                5 draft / 0 published
--     dfl-batch  teste-personalizacao-fill-2026-08-05  u0/l1                4 draft / 0 published
--     dfl-batch  byoc-peca-certo-a-ia  u1/l6  "Monte o seu pedido"          2 draft / 0 published
--     plg-…9948  arquivo-demos-antigas u1/l2  "Contexto muda tudo"          1 draft / 12 published
--
-- PUBLISHING ANY OF THEM IS A DATA DECISION AND IS NOT PART OF THIS MIGRATION.
-- Per CLAUDE.md (DDL vs DML) that goes through an MCP tool with the caller's
-- user-JWT — `itera-mcp` already exposes publish/unpublish. This file changes
-- schema only: it creates no row, updates no row, deletes no row.
--
-- UPDATE 2026-08-13 — THE DATA DECISION WAS MADE, AND IT RAN FIRST
-- ----------------------------------------------------------------
-- Tainan answered option B on plan `20260812-ux-map-observed-reality-lens`
-- (question 829f734a, answered 2026-08-13): *publish the drafts first, then
-- apply the gate*. So the numbers above are HISTORY. They describe the state
-- on 2026-08-10, when this file was written. They are kept for provenance.
--
-- What ran, before this migration and outside this repository: the MCP tool
-- `publish_activity` (itera-mcp), called once per activity with an author
-- identity's user-JWT. It set `status = 'published'` on 32 of the 33 drafts.
-- No SQL, no migration, no service_role — the sanctioned DML path.
--
-- Re-measured in production on 2026-08-13, AFTER that publish:
--
--   * `itera.activities`: 353 published, 1 draft (was 321 / 33).
--   * The 1 remaining draft is `273e631e-940c-43e2-a544-d5a1495bc056`, in
--     `plg-5bd104869948` / `arquivo-demos-antigas`. It was not published
--     because no credential in the vault holds an authoring role in that
--     tenant. `taigfs@gmail.com` is its only member, and its only author.
--   * Activities this migration hides from AT LEAST ONE user:            0
--   * Of those, activities holding learner work:                         0
--
-- The second number is the point of the ordering, so it is stated on its own:
-- APPLYING THIS MIGRATION NOW HIDES **ZERO** ACTIVITIES THAT HOLD LEARNER
-- WORK. The one surviving draft hides from nobody, because the only member of
-- its tenant is an author of that tenant, and authors keep their drafts.
--
-- That count is a simulation of both predicates over every (member, activity)
-- pair. It was corroborated through the RLS-enforced as-user path, which is
-- the app's real code path and not the BYPASSRLS admin one:
--
--     identity   visible today   visible after this migration
--     aluno1     241             241
--     aluno2     241             241
--     smoke      319             319
--
-- Equal on every row. No learner loses a single activity.
--
-- IDEMPOTENT: `DROP POLICY IF EXISTS` then `CREATE POLICY`, per this repo's
-- requirement that every migration be re-runnable (apply-migrations.sh header,
-- and fresh-apply.sh's second pass).
-- ============================================================================

-- The original policy applied to PUBLIC (no `TO` clause) in both 0002 and 0047.
-- That is preserved deliberately: narrowing it to `authenticated` here would be
-- an unrelated, unmeasured change to anonymous reads, and `anon` holds no
-- membership so `current_tenant_ids()` is already empty for it.
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

COMMENT ON POLICY activities_select_tenant ON itera.activities IS
  'Learners read only published activities; authors of the owning tenant also '
  'read drafts (itera.current_author_tenant_ids() = author|instructor|'
  'tenant_admin|owner). Restored by migration 0064 after the predicate created '
  'by 0047 was reverted outside the ledger — see that file''s header. Behaviour '
  'is asserted by db/scripts/test-rls-activity-visibility.sh in CI; a shape or '
  'census check cannot catch its removal.';
