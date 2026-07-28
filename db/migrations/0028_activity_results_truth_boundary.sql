-- ============================================================================
-- activity_results — label the truth boundary. Documentation ONLY (COMMENTs).
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx).
--
-- WHY
-- ---
-- Until 2026-07-28 the player only wrote an `activity_results` row when the
-- learner answered CORRECTLY, and wrote `passed` as a hard-coded `true`
-- (`persistActivityProgress` was called from inside an `if (correct)` branch and
-- inserted the literal). A wrong answer produced no row here, none in
-- `itera.progress`, and none in `itera.xp_events`.
--
-- The result is not "the pass rate was computed wrong". The misses were never
-- collected, so any pass rate over pre-cutover rows is pinned at 100% by
-- construction. Measured DB-wide on 2026-07-28: 473 rows `passed = true` vs 3
-- `passed = false`, and all three `false` rows came from the 0005 verification
-- fixture rather than from a learner.
--
-- THE HISTORY IS NOT RECOVERABLE. A backfill restores rows that were written and
-- lost; these were never written, and nothing else in the system holds them.
-- Reconstructing pre-cutover accuracy would mean inventing it, so we do not.
-- Pre-cutover rows are left exactly as they are, and simply labelled.
--
-- This migration changes NO data and NO structure. It attaches the warning to
-- the objects themselves, so that it is found by the next person who writes
-- `SELECT count(*) FILTER (WHERE passed) ... FROM itera.activity_results` — who
-- will look at the schema, not at a plan doc. `\d+ itera.activity_results` and
-- every schema-introspection tool surface these strings.
--
-- Idempotent: COMMENT ON is a replace. Safe to re-run (apply-migrations.sh
-- re-runs every file, every time — see db/README.md).
-- ============================================================================

comment on table itera.activity_results is
  $$Attempt log: one row per SETTLED attempt at an activity, right or wrong.

⚠️ TRUST BOUNDARY — rows created BEFORE 2026-07-29T00:00:00Z are NOT a valid
basis for any accuracy / pass-rate figure. Before that date the client only
inserted a row when the learner answered correctly, so the misses are absent
from the denominator and every pass rate over that window is 100% by
construction, not by measurement. The missing rows are NOT recoverable and must
NOT be estimated or backfilled.

Safe over the full history: "did this learner ever pass activity X" (passed =
true was always genuine) and completion/engagement counts. Unsafe over the full
history: pass rate, error rate, attempts-per-activity, per-kind difficulty.

Scope an accuracy query with `WHERE created_at >= '2026-07-29T00:00:00Z'`.
See src/lib/dataQuality.ts (ACCURACY_TRUSTWORTHY_SINCE) for the app-side
constant, and src/services/progress.service.ts for the fixed write path.$$;

comment on column itera.activity_results.passed is
  $$Real outcome of the attempt — since 2026-07-29T00:00:00Z.

⚠️ Before that timestamp this column was a DEAD COLUMN: the only writer inserted
the literal `true`, and only ever ran on a correct answer, so it never held
`false` outside the 0005 fixture. A pre-cutover `WHERE passed = false` returns
essentially nothing — which means "not recorded", NOT "never happened".$$;

comment on column itera.activity_results.attempt is
  $$Attempt ordinal (1-based). The player does not yet increment this — it
inserts one row per settled attempt and leaves the default 1, so repeated
attempts at the same activity are distinguishable by created_at but not by this
column. The Results-API judge path (itera-api src/judge/repo.ts) DOES compute
MAX(attempt)+1. Do not read this as a reliable retry count for player traffic.$$;

comment on column itera.progress.status is
  $$Completion signal, monotonic per (user_id, activity_id).

'completed' is set on a pass and is never demoted. 'in_progress' means the
learner reached and attempted the activity without passing it — written since
2026-07-29T00:00:00Z; before that a miss wrote nothing at all, so the ABSENCE of
a row over the pre-cutover window does not mean the learner never tried.

This is the completion signal. It is NOT an accuracy signal — use
itera.activity_results for that.$$;
