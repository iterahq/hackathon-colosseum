-- ============================================================================
-- Itera migration 0039 — the MIGRATION LEDGER and the SCHEMA OBJECT CENSUS.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260728-itera-migration-ci-lock — Fase 1 + Fase 5 camada 1.
-- Trigger: Tainan TG 2026-08-04, *"isso n pode acontecer. faz isso virar
-- automação bro"* — about 0036, 0037 and 0038 sitting merged-and-unapplied for
-- days while live attempts were written without the cursor topic, without
-- `spec_snapshot`/`spec_locale` and without `pedagogical_context`. Permanently:
-- an attempt settled in that window cannot be back-filled, ever.
--
-- WHY A LEDGER, WHEN THE OLD SCRIPT "WORKED"
-- ------------------------------------------
-- `apply-migrations.sh` had no ledger and replayed EVERY file from 0001 on
-- every invocation. That is survivable for a rare manual run of files that are
-- all idempotent by convention. It is NOT survivable as something that fires on
-- every merge to `main`: the day one non-idempotent file lands — a `DROP`, a
-- data backfill without `ON CONFLICT`, an `UPDATE ... SET x = x + 1` — the
-- automation re-runs it against production on the next unrelated merge. The
-- ledger is what makes "apply on merge" safe enough to be automatic: each file
-- applies EXACTLY ONCE, recorded with its checksum.
--
-- IDEMPOTENCY IS STILL MANDATORY. The ledger protects against KNOWN
-- re-application; idempotency protects against UNKNOWN re-application — a
-- restore from backup, a bad baseline, a `-- itera:no-transaction` file that
-- died between the DDL and its ledger row, a brand-new environment. They are
-- different layers and the cost of keeping both is ~zero. See db/README.md.
--
-- KEYED BY (repo, filename), NOT BY NUMBER — AND THAT IS LOAD-BEARING
-- -------------------------------------------------------------------
-- A ledger of the form "apply everything numbered above the highest applied"
-- would be actively dangerous here, for two reasons that are facts about this
-- repo and not hypotheticals:
--
--   1. NUMBERS COLLIDE. `0006_dfl_federation_dfl_batch.sql` and
--      `0006_flatten_dfl_batch_spec_i18n.sql` both exist on `main` today.
--   2. NUMBERS ARRIVE OUT OF ORDER. PR #188 claimed 0023 while PR #189 merged
--      0024 ahead of it. A "highest applied" cursor would have skipped 0023
--      forever, silently.
--
-- So the unit of record is the FILENAME, and the unit of decision is
-- SET DIFFERENCE — "which files have no row" — never a high-water mark.
--
-- `repo` exists because THREE repos write DDL into this one database:
-- `itera-player` (db/migrations, this series), `itera-api` (migrations/) and
-- `itera-mcp` (migrations/), with fully overlapping numbering. Only this repo
-- is automated today; the column is here so the other two can join the same
-- ledger without a schema change when Fase 6 lands.
--
-- WHY THE CENSUS TABLE IS HERE TOO
-- --------------------------------
-- The ledger answers "was every merged migration applied?". It cannot answer
-- the other half — "does the database contain objects no migration accounts
-- for?" — because out-of-band DDL leaves no trace in a table that only the
-- apply script writes. `itera.schema_object_census` is that other half: a
-- periodic fingerprint of every relation, column, index, function, enum, policy
-- and trigger in `itera` + `billing` (plus the `itera%` policies this project
-- owns on `realtime.messages`). The drift job recomputes it and diffs against
-- the last stored row.
--
-- It is a stored census rather than a checked-in expected-objects file on
-- purpose: a file in the repo has to be hand-refreshed after every legitimate
-- migration, so it goes stale and then gets ignored — the failure mode this
-- whole exercise exists to kill. A stored census self-heals on the legitimate
-- path (the apply script refreshes it after a successful apply) and requires a
-- human to sign off on the illegitimate one (`--census-accept "<reason>"`).
--
-- Expect it to fire when someone hand-applies an `itera-api` / `itera-mcp`
-- migration. That is CORRECT: from this repo's pipeline those changes ARE
-- out-of-band, and saying so is the point until Fase 6 unifies the series.
--
-- Idempotent: `create table if not exists` + `create index if not exists` +
-- `comment on`. Required, not optional.
--
-- ⚠️ CHICKEN AND EGG, RESOLVED DELIBERATELY. `apply-migrations.sh` cannot read
-- a ledger that does not exist yet, so it creates these two tables itself, from
-- the same DDL, before it does anything else. This file is therefore a NO-OP
-- against a database the script has already touched — and it exists anyway, so
-- that the census does not report the ledger as an object no migration accounts
-- for. The tool bootstraps the table; the migration ACCOUNTS for it.
-- ============================================================================

begin;

create table if not exists itera.schema_migrations (
  id           text primary key,
  repo         text        not null,
  filename     text        not null,
  checksum     text        not null,
  applied_at   timestamptz not null default now(),
  applied_by   text        not null,
  duration_ms  integer
);

create unique index if not exists schema_migrations_repo_filename_idx
  on itera.schema_migrations (repo, filename);

create table if not exists itera.schema_object_census (
  id           bigint generated by default as identity primary key,
  captured_at  timestamptz not null default now(),
  digest       text        not null,
  objects      text        not null,
  captured_by  text        not null,
  note         text
);

create index if not exists schema_object_census_captured_at_idx
  on itera.schema_object_census (captured_at desc);

comment on table itera.schema_migrations is
  $$Which migration files have been applied to THIS database, and with what
contents. Written only by db/scripts/apply-migrations.sh (manually or from the
`db-apply` workflow on merge to main).

KEY IS `id` = '<repo>:<filename>'. NOT the numeric prefix: numbers collide in
this repo (two 0006 files on main) and arrive out of order (0023 merged after
0024), and three separate repos — itera-player, itera-api, itera-mcp — write
DDL into this one database with overlapping numbering. Deciding what to apply
is a SET DIFFERENCE over filenames, never a high-water mark over numbers.

`checksum` is the sha256 of the file AS APPLIED. If the file on disk later
differs, the apply script REFUSES to run rather than silently skipping: an
edited applied migration means the repo and the database disagree about what is
in the database, which is exactly the state this table exists to make
impossible. Rebaseline explicitly with `apply-migrations.sh --rebaseline <file>
--reason '<why>'` and the row records that a human decided it.

`applied_by` is 'ci:<run_id>' | 'manual:<user>@<host>' | 'baseline:<git sha>'.
Baseline rows are the one-shot reconciliation of the pre-ledger past: files that
were already applied by hand before this table existed, recorded WITHOUT being
re-run. They are honest about their own uncertainty — a baseline checksum is the
content at reconciliation time, not proof of what was actually executed.$$;

comment on table itera.schema_object_census is
  $$Periodic fingerprint of the schema, used to detect DDL applied outside the
migration pipeline. One row per capture; the drift job diffs the live schema
against the newest row.

Covers relations, columns (with type + NOT NULL), indexes, functions, enums and
domains, policies and non-internal triggers in `itera` and `billing`, plus the
`itera%`-named policies this project owns on `realtime.messages`.

Refreshed automatically by apply-migrations.sh after a successful apply, so the
LEGITIMATE path self-heals. A difference with no apply behind it is out-of-band
DDL and stays RED until a human runs `--census-accept "<reason>"`, which records
the acknowledgement in `note`. Do not paper over a diff by refreshing it.

⚠️ Hand-applied itera-api / itera-mcp migrations WILL show up here. That is
correct — those are out-of-band with respect to this repo's pipeline — and it
stays that way until the two series join this ledger (plan
20260728-itera-migration-ci-lock, Fase 6).$$;

commit;
