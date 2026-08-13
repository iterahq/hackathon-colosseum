-- ============================================================================
-- Itera migration 0063 — revoke the table grants that no migration ever made.
-- This applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- It is NOT dfl-schema. It is NOT DFL production. ADR-3 / ADR-26. Idempotent.
--
-- Plan: 20260812-ux-map-observed-reality-lens. Question
-- "SECURITY - anon holds SELECT on ITERA relations no migration grants",
-- answered A by Tainan on 2026-08-13: revoke them, after a check for a real
-- anonymous reader on each relation.
--
-- WHAT WAS FOUND
-- --------------
-- A census compared live production against a from-zero build of this same
-- db/migrations series. The two agree on every object. They disagree on TEN
-- grant rows, over NINE relations. Production holds these grants. A fresh
-- build does not:
--
--   itera.activity_comments  anon           SELECT
--   itera.api_keys           anon           SELECT
--   itera.api_keys           authenticated  SELECT
--   itera.byoc_generations   anon           SELECT
--   itera.class_answers      anon           SELECT
--   itera.class_attendance   anon           SELECT
--   itera.class_guests       anon           SELECT
--   itera.media              anon           SELECT
--   itera.my_subscription    anon           SELECT
--   itera.unit_versions      anon           SELECT
--
-- WHY PRODUCTION HAS THEM
-- -----------------------
-- Migration 0002 line 152 says:
--
--     grant select on all tables in schema itera to anon, authenticated;
--
-- `GRANT ... ON ALL TABLES` is a SNAPSHOT, not a rule. It grants on the tables
-- that exist at the moment it runs. In a from-zero build that moment is
-- directly after 0001, so it reaches the 14 tables of 0001 and no more.
--
-- The pre-ledger applier re-ran every file on every invocation. So production
-- executed that one line again and again, against a schema that kept growing.
-- Each re-run swept up whatever tables existed that day. The set of relations
-- above is therefore a record of how many times a script happened to run. It is
-- not a decision that a person made.
--
-- The ledger (migration 0039, `itera.schema_migrations`) stopped the re-runs.
-- The grants that the re-runs left behind stayed.
--
-- WHY THIS FILE DOES NOT WRITE THE GRANTS INTO THE REPO INSTEAD
-- ------------------------------------------------------------
-- That was option C of the question. It makes the census green and it makes the
-- repo agree with production. It also ratifies an accident as a decision, and
-- the next reader has no way to tell the two apart. So the repo stays the
-- authority, and production moves to it.
--
-- EACH RELATION WAS CHECKED FOR A REAL ANONYMOUS READER FIRST
-- ----------------------------------------------------------
-- A blind revoke can take a public page down, and a learner finds out before we
-- do. So each relation was measured on 2026-08-13, over the app's literal path
-- (PostgREST, `apikey: <anon>`, no Authorization header):
--
--   * All nine relations answer HTTP 200 with ZERO rows to an unauthenticated
--     caller. The grant exists. The data does not come out.
--   * The reason is the RLS policies. Every SELECT policy on these nine names
--     the role `authenticated`, so no permissive policy applies to `anon` and
--     the row set is empty. `itera.api_keys` is stronger still: RLS is enabled
--     and it carries NO policy at all, which is a default deny.
--   * The control for that probe is `itera.tenants`, which holds a deliberate
--     `for select to public` policy from migration 0026 (white-label login
--     branding). It answers with rows to the same anonymous caller. So the
--     probe can see data when a policy permits it, and the nine empty answers
--     are a real result rather than a broken request.
--
-- No client reads any of the nine as `anon`:
--
--   * itera-player reads `my_subscription`, `class_answers`, `class_attendance`,
--     `class_guests`, `activity_comments` and `unit_versions` only after login.
--   * The guest of a live class is NOT anonymous to the database. `/g/:code`
--     trades the code for a REAL Supabase session at itera-api
--     (`POST /v1/live/guest-session`), so the guest is an `authenticated` JWT
--     with zero memberships. Its reads never used the `anon` role.
--   * itera-api reads `api_keys` and `byoc_generations` server-side over its own
--     Postgres connection as the schema owner, not over PostgREST.
--   * itera-mcp builds an anon client for ONE purpose, `auth.refreshSession`.
--     It reads no table with it.
--   * itera-landing holds no Supabase key at all.
--
-- Conclusion: all ten grant rows are revoked outright. None of them needs a
-- replacement credential, because none of them has a consumer.
--
-- THE EXTRA ROW ON itera.api_keys
-- -------------------------------
-- `api_keys` is the one relation where BOTH grants are unaccounted: migration
-- 0042 creates the table and grants nothing to anybody. `authenticated` holds
-- SELECT there for the same reason `anon` does, from the same line of 0002.
-- The table stores a sha256 hash and a key prefix, never a raw key, and RLS
-- returns nothing to either role today. It is still the credential table of the
-- Results API, and the two roles that reach the internet hold a standing read
-- on it that nobody asked for. Both go.
--
-- WHAT THIS FILE DOES NOT CLAIM TO FIX
-- ------------------------------------
-- `revoke` removes today's privilege. It cannot stop a future migration from
-- copying the `grant ... on all tables ... to anon` shape and re-opening these
-- tables in silence. Migration 0060 already carries the correct habit for a new
-- table — an explicit `grant ... to authenticated` and an explicit
-- `revoke all ... from anon` — and that habit, not this file, is the guard.
-- The daily `db-drift` job is what notices if the two diverge again.
--
-- `anon` KEEPS what the repo genuinely gives it: USAGE on the `itera` schema
-- (0001), SELECT on the 14 tables of 0001, on `itera.class_sessions` (0013), on
-- `itera.activity_defs` (0024) and on `itera.activity_traces` (0034), plus
-- EXECUTE on `itera.catalog_programs()` (0012). The public catalogue and the
-- white-label login branding continue to work.
--
-- IDEMPOTENCY
-- -----------
-- `revoke` is repeatable: a second run removes a privilege that is already
-- absent and succeeds. `comment on` is repeatable. This file therefore survives
-- the second pass that db-migration-check runs over the whole series.
-- ============================================================================

-- The eight relations where only `anon` holds an unaccounted grant.
-- `revoke all` rather than `revoke select`: SELECT is the only privilege each of
-- these grants to `anon` today (measured 2026-08-13), so the two are the same
-- change now, and `revoke all` also removes anything a later stray
-- `grant ... on all tables` adds before this file is re-read.
revoke all on itera.activity_comments from anon;
revoke all on itera.byoc_generations  from anon;
revoke all on itera.class_answers     from anon;
revoke all on itera.class_attendance  from anon;
revoke all on itera.class_guests      from anon;
revoke all on itera.media             from anon;
revoke all on itera.my_subscription   from anon;
revoke all on itera.unit_versions     from anon;

-- The credential table of the Results API. Migration 0042 grants nothing here,
-- so BOTH roles are removed. itera-api reads this table over its own Postgres
-- connection as the schema owner and is not affected.
revoke all on itera.api_keys from anon, authenticated;

comment on table itera.api_keys is
  'Per-tenant API keys for the Results API (migration 0042). Stores key_prefix '
  'and a sha256 key_hash - never a raw key. Read ONLY server-side by itera-api '
  'over its own Postgres connection as the schema owner. Migration 0063 revoked '
  'the SELECT that anon and authenticated held here: no migration ever granted '
  'it, and no client ever used it.';
