-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- The answer key stays on the server, part 2: the direct paths close.
-- Apply only once the web app that reads lessons through the `lesson` function
-- and no longer writes results or xp is live.
--
-- 1. `spec` and `rubric` of `itera.activities` and `itera.activity_defs` are no
--    longer readable with a browser's key: `anon` and `authenticated` keep every
--    other column (the trail, the counts and the joins read those), and the
--    content leaves only through the `lesson` function, sealed for a learner and
--    whole for whoever teaches or authors the program. Row level security is
--    untouched; writes by authors are untouched.
-- 2. `itera.activity_results` is written by the `grade` function only. A learner
--    may still read their own rows.
-- 3. `itera.award_activity_xp` is not callable from a browser: xp is written by
--    `itera.record_graded_attempt_v2` with a passing verdict.
--
-- Undo: `grant select on itera.activities, itera.activity_defs to anon, authenticated;`
-- `grant insert, update, delete on itera.activity_results to authenticated;`
-- `grant execute on function itera.award_activity_xp(uuid, int) to authenticated;`
-- Idempotent.
-- ============================================================================

revoke select on itera.activities from anon, authenticated;
grant select (id, lesson_id, ordinal, kind, status, def_id, artifact_policy) on itera.activities to anon, authenticated;

revoke select on itera.activity_defs from anon, authenticated;
grant select (id, tenant_id, kind, title_i18n, summary_i18n, tags, thumbnail_media_id, status, created_at, updated_at, artifact_policy)
  on itera.activity_defs to anon, authenticated;

revoke insert, update, delete on itera.activity_results from anon, authenticated;

revoke all on function itera.award_activity_xp(uuid, int) from public, anon, authenticated;
grant execute on function itera.award_activity_xp(uuid, int) to service_role;
