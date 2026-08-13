-- ============================================================================
-- Itera migration 0065 — make a re-apply of this series a genuine no-op.
-- This applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- It is NOT dfl-schema. It is NOT DFL production. Idempotent.
--
-- Plan: 20260812-ux-map-observed-reality-lens.
-- Task: "The migration applier is not safe to re-run — a second pass changes
--        the schema."
--
-- WHAT WAS MEASURED, AND HOW
-- --------------------------
-- On 2026-08-13 the whole series was applied twice to a throwaway
-- supabase/postgres:17.6.1.160, and the schema was fingerprinted after each
-- pass. The second pass exited 0 and added EIGHT grant rows over FIVE
-- relations that the first pass does not produce:
--
--   itera.activity_i18n_backup   anon           SELECT
--   itera.activity_i18n_backup   authenticated  SELECT
--   itera.class_removals         anon           SELECT
--   itera.class_stars            anon           SELECT
--   itera.schema_migrations      anon           SELECT
--   itera.schema_migrations      authenticated  SELECT
--   itera.schema_object_census   anon           SELECT
--   itera.schema_object_census   authenticated  SELECT
--
-- Nothing else in the schema differed: no table, column, constraint, index,
-- policy, function, enum or trigger. The whole delta is grants.
--
-- WHY
-- ---
-- The same line that produced the 0063 finding. Migration 0002 says:
--
--     grant select on all tables in schema itera to anon, authenticated;
--
-- `GRANT ... ON ALL TABLES` is a SNAPSHOT, not a rule. In a from-zero build
-- 0002 runs directly after 0001, so it reaches the 14 tables of 0001. Re-run
-- against a schema that already holds all 65 tables, it reaches all of them.
--
-- 0063 already revokes the ten rows that the pre-ledger applier left in
-- production, and it runs after 0002, so on a second pass it takes its own ten
-- back off. These eight are the rows 0063 does not name — production never held
-- them, so the census that produced 0063 could not see them.
--
-- WHY THIS IS WORSE THAN THE 0063 SET, NOT EQUAL TO IT
-- ---------------------------------------------------
-- Every relation in the 0063 set is protected by RLS underneath the grant: the
-- grant is real, the rows do not come out. That is NOT true here.
--
--   itera.schema_migrations      relrowsecurity = FALSE, zero policies
--   itera.schema_object_census   relrowsecurity = FALSE, zero policies
--
-- The `itera` schema is exposed over PostgREST — `GET /rest/v1/tenants` with
-- only the anon key answers 200 with rows today. So for these two relations the
-- grant is the ONLY thing standing between an unauthenticated caller and the
-- full migration ledger plus the schema census. Verified on production
-- 2026-08-13: `GET /rest/v1/schema_migrations` with the anon key answers 401
-- `42501 permission denied`, and the error hint is literally the statement a
-- second pass of 0002 would execute.
--
--   itera.activity_i18n_backup   RLS enabled, zero policies -> default deny
--   itera.class_removals         RLS enabled, authenticated-only policies
--   itera.class_stars            RLS enabled, authenticated-only policies
--
-- PRODUCTION IS NOT AFFECTED TODAY
-- -------------------------------
-- Measured 2026-08-13, after 0063 was applied: the anon/authenticated grant set
-- of schema `itera` in production is IDENTICAL, row for row, to a one-pass
-- from-zero build of this series. 88 rows on each side, zero difference. The
-- ledger (0039) is what keeps it that way — apply-migrations.sh never re-runs
-- an applied file, so `db-apply` on merge cannot trigger this.
--
-- This file is therefore preventive. It closes the paths the ledger does not
-- cover: a restore from backup into a fresh ledger, a rebuilt environment, a
-- hand-run of the series, and the `.baseline` one-shot.
--
-- WHY NOT EDIT 0002 INSTEAD
-- ------------------------
-- Naming the 14 tables of 0001 in 0002 would remove the defect at its source
-- and would need no maintenance afterwards. It also edits a migration that is
-- recorded as applied, which changes its checksum, trips check 2 of the daily
-- `db-drift` job, and requires `apply-migrations.sh rebaseline` against
-- production to clear. That is a deliberate, audited operation and it belongs
-- to Tainan, not to this file. Raised separately.
--
-- WHAT KEEPS THIS FROM ROTTING
-- ----------------------------
-- `db/scripts/fresh-apply.sh` now fingerprints the schema after pass 1 and
-- after pass 2 and exits 5 if they differ. A new table that 0002 sweeps up on a
-- re-run therefore turns this class of defect into a red check on the pull
-- request that introduces it, naming the exact grant. The repaired habit is
-- migration 0060's: grant explicitly to the roles that need the table, and
-- `revoke all ... from anon`.
--
-- IDEMPOTENCY
-- -----------
-- `revoke` is a fixpoint: removing a privilege that is already absent succeeds
-- and changes nothing. On a from-zero first pass every statement below is a
-- no-op, which is exactly why pass 1 and pass 2 now agree.
--
-- SCOPE — READ THIS BEFORE ADDING A LINE
-- --------------------------------------
-- The role list per relation is exact, not generous. `itera.class_removals`
-- and `itera.class_stars` hold REAL `authenticated` grants from 0029 and 0061,
-- which run before this file. Revoking `from anon, authenticated` there would
-- delete them on every pass and break the live-class UI.
-- ============================================================================

-- Only `anon` is unaccounted here. `authenticated` holds SELECT/INSERT/DELETE
-- from 0029 (and 0061), granted explicitly, and must keep them.
revoke all on itera.class_removals from anon;
revoke all on itera.class_stars    from anon;

-- Neither role is accounted for on these three: 0035 creates the i18n backup
-- table and 0039 creates the two ledger tables, and none of the three grants
-- anything to anybody.
revoke all on itera.activity_i18n_backup from anon, authenticated;
revoke all on itera.schema_migrations    from anon, authenticated;
revoke all on itera.schema_object_census from anon, authenticated;

comment on table itera.schema_migrations is
  'The migration ledger (migration 0039). One row per applied file, keyed by '
  'filename, with a checksum. Read by apply-migrations.sh and by the db-drift '
  'job over a privileged connection as the schema owner. No client reads it. '
  'RLS is not enabled here, so the absence of a grant to anon and authenticated '
  'is the whole of the protection - migration 0065 revoked the SELECT that a '
  'second pass of 0002 would grant.';

comment on table itera.schema_object_census is
  'The schema fingerprint (migration 0039), refreshed by apply-migrations.sh on '
  'every successful run and compared by the daily db-drift job. Same protection '
  'as itera.schema_migrations: no RLS, therefore no grant. See migration 0065.';
