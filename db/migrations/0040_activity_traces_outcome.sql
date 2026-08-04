-- ============================================================================
-- Itera migration 0040 — itera.activity_traces.outcome: the row finally says
-- whether the learner ANSWERED or LEFT.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260803-itera-learning-control-plane-prototipo (LCPWCI) — FASE 1,
-- unidade "tentativa abandonada" (approved by Tainan, TG 2026-08-04).
--
-- WHY
-- ---
-- The v6 of the plan says it flatly, as the thing Fase 1 did NOT resolve:
-- *"tentativa abandonada continua invisível"*. A learner who opens an activity,
-- reads it, and leaves without submitting produces NO ROW ANYWHERE — not in
-- `activity_results` (written only on a settled attempt), not in `progress`
-- (only on reach/pass), not in `activity_traces` (one row per SETTLED attempt
-- since 0034). The give-up signal Fase 4 wants is discarded at the instant it
-- happens, every single day, and the governing sentence of the whole plan is
-- that *"você nunca vai conseguir voltar no tempo e coletar esses dados"*.
--
-- WHY A COLUMN AND NOT A NEW TABLE
-- ---------------------------------
-- An abandonment IS a trace: same learner, same activity, same origin, same
-- ordered sequence of what they touched before leaving, and the SAME two
-- annotations the settled row carries (`spec_snapshot`/`spec_locale` from 0037,
-- `pedagogical_context` from 0038). A separate table would duplicate the
-- envelope, the RLS, the idempotency key and both annotations, and — the part
-- that actually matters — would make "what fraction of opens of this activity
-- ended in an answer?" a UNION instead of a GROUP BY. Fase 4 asks that question
-- of every cell of the grammar matrix.
--
-- WHAT THE COLUMN DOES THAT THE ACTION VOCABULARY CANNOT
-- ------------------------------------------------------
-- The sequence already distinguishes the two: an abandoned trace ends on
-- `attempt_abandoned`, a settled one on `attempt_settled`, and adding an action
-- type needs no migration at all (rule at the top of src/utils/learningTrace.ts).
-- So this column is NOT how the client says what happened — it is how a READER
-- asks, without unnesting jsonb on every row of the table.
--
-- It is also the thing that keeps 0034's meaning intact. Every query written
-- against this table until today assumed one row = one settled attempt. Landing
-- abandonment rows in it without a discriminator would silently change the
-- denominator of every "how many tries", "accuracy", "median time" question
-- anyone has already written — a corrupted answer that still looks valid, which
-- is the failure mode 0037 exists to prevent one level up.
--
--   Settled attempts, past and future, in one predicate that needs no backfill:
--     where outcome is distinct from 'abandoned'
--   Abandonments:
--     where outcome = 'abandoned'
--
-- NULLABLE, NO DEFAULT, NO CHECK — the 0037/0038 reasons, plus one more
-- --------------------------------------------------------------------
-- NULLABLE and NO DEFAULT because a `not null default 'settled'` would make
-- every historical row CLAIM 'settled' when in fact it never made a claim at
-- all. The inference "a row written before 0040 is a settled attempt" is sound
-- — no client before this migration could write anything else — but it is an
-- inference about the WRITE PATH's history, and it belongs to the reader, not
-- to a backfill that erases the distinction between "said settled" and "was
-- written before the question existed". NULL means NOT CAPTURED here exactly as
-- it does on 0037 and 0038.
--
-- NO CHECK, and NO vocabulary constraint: same rule as 0038. A CHECK listing
-- ('settled','abandoned') would reject the first row of the first outcome we
-- have not thought of yet — and this is precisely the kind of vocabulary that
-- grows (`expired`, `interrupted`, `force_advanced` are all plausible next).
-- The column DECORATES the sequence; a badly-shaped decoration must never
-- reject the whole trace. TELEMETRY MUST NEVER DESTROY THE RECORD IT DECORATES.
--
-- ⚠️ BUT THE CLIENT TREATS IT ASYMMETRICALLY, AND THAT IS THE ONE PLACE THIS
-- COLUMN DIFFERS FROM 0037/0038. Those two are pure annotation: dropping them
-- during a deploy window costs detail. Dropping THIS one from an ABANDONED row
-- would not cost detail — it would produce a row that reads as a settled
-- attempt, i.e. a FALSE record rather than a poorer one. So the client's
-- degradation ladder (src/services/progress.service.ts) may drop `outcome` from
-- a SETTLED write (where NULL is historically readable as settled) and may
-- NEVER drop it from an ABANDONED write: if this column is absent, the
-- abandonment is not written at all and stays in the durable outbox until it
-- can be. Less data, never false data.
--
-- ⚠️ NO `schema_version` BUMP. A NEW COLUMN IS NOT AN ENVELOPE CHANGE — the
-- rule is at the top of src/utils/learningTrace.ts, and 0037 and 0038 are the
-- precedents. `started_at`, `at_ms` and `actions` all keep their meaning.
--
-- THE INDEX — and why 0038's "no index" reasoning does not apply here
-- -------------------------------------------------------------------
-- 0038 shipped without an index because nothing filters on `pedagogical_context`
-- and the Fase 4 reports are whole-table analytical passes. This column is the
-- opposite: it exists TO BE FILTERED, the filtered set is the minority one
-- (abandonments are rarer than answers), and a PARTIAL index is maintained only
-- for the rows that match — so it costs nothing on the insert path that carries
-- 100% of today's volume. `(activity_id)` is the leading column because the
-- question is per-activity ("which activity do learners leave?"), matching
-- `idx_activity_traces_activity` from 0034.
--
-- WHAT AN ABANDONED ROW DELIBERATELY DOES *NOT* GET
-- --------------------------------------------------
-- No `activity_results` row and no `progress` row. Both are deliberate and both
-- are correctness, not economy:
--   * `activity_results` is the ATTEMPT LOG. Writing an abandonment there as
--     `passed = false` would count non-attempts as failures and make every
--     accuracy number wrong — D2 (the log that only ever held wins) in mirror
--     image, and just as unrecoverable once mixed in.
--   * `progress` is the COMPLETION signal. Opening something is not progress on
--     it, and `resumeIndexFor` already lands a returning learner on the first
--     activity that is not `completed`.
-- The abandonment therefore lives in exactly one place, and that place already
-- carries the origin, the sequence, the enunciado and the pedagogical tag.
--
-- ⚠️ DEPLOY ORDER — MERGING THIS **APPLIES** IT, since 2026-08-04.
-- `.github/workflows/db-apply.yml` runs `db/scripts/apply-migrations.sh` on
-- every push to `main` touching `db/migrations/**`, and the ledger
-- `itera.schema_migrations` (0039) makes each file apply exactly once. Read
-- `db/README.md` before assuming anything else — the older migrations in this
-- directory still say "applied by hand", because they were written before that
-- workflow existed. THIS FILE IS THE FIRST ONE THAT IS NOT TRUE OF.
--
-- 🪜 SO WHY DOES THE CLIENT STILL DEGRADE? Because "applied at merge" is not
-- "applied before the build that needs it". Merging to `main` starts the app
-- deploy and the `db-apply` run CONCURRENTLY, and nothing orders them; a run
-- that fails STOPS AT THE FAILING FILE, leaving later ones pending; and a
-- restore, a rollback or a fresh environment all reproduce "build live, column
-- absent". The window went from DAYS (0036/0037/0038 sat merged-and-unapplied
-- long enough to permanently lose the enunciado and the tagging of every
-- attempt settled in between) to MINUTES — which is a different risk, not an
-- absent one. Losing minutes of abandonment data to a race would be a smaller
-- version of exactly the incident that produced the automation.
--
-- Idempotent: `add column if not exists` + `create index if not exists` +
-- `comment on`, nothing else. STILL REQUIRED even with the ledger, and
-- db/README.md says why: the ledger prevents KNOWN re-application, idempotency
-- prevents UNKNOWN re-application — a restore from backup, a fresh
-- environment, a bad baseline, or a run that died between the DDL and its
-- ledger row.
-- ============================================================================

begin;

alter table itera.activity_traces
  add column if not exists outcome text;

-- Partial by design: only abandoned rows are indexed, so the settled-attempt
-- insert path — 100% of today's writes — pays nothing.
create index if not exists idx_activity_traces_abandoned
  on itera.activity_traces (activity_id)
  where outcome = 'abandoned';

comment on column itera.activity_traces.outcome is
  $$HOW THIS TRACE ENDED — the learner answered, or the learner left.
Fase 1 of plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI).

Values this build writes (client contract: src/utils/learningTrace.ts):
  'settled'   — the learner submitted an answer. The sequence ends on
                `attempt_settled` and there is a matching `activity_results`
                row for the same (user_id, activity_id).
  'abandoned' — the activity was rendered, dwelt on past the minimum, and left
                without a settled answer. The sequence ends on
                `attempt_abandoned`, whose payload carries the reason and the
                dwell (`elapsed_ms` / `visible_ms`). There is NO
                `activity_results` row and NO `progress` row for it, on
                purpose — see the migration header.

⚠️ NULL means NOT CAPTURED: a row written before this migration, or by a client
older than it. It is NOT a default and it does NOT mean 'settled'. It happens
to be true that every client predating this column could only write settled
attempts, so a reader may infer settled for such rows — but that is an
inference about the write path's history, not a value this column asserts.

⚠️ THE PORTABLE PREDICATES, which need no backfill and work on every row ever
written:
    settled attempts   →  where outcome is distinct from 'abandoned'
    abandonments       →  where outcome = 'abandoned'
Never write `where outcome = 'settled'` for a historical population: it silently
excludes everything written before this migration.

DELIBERATELY UNCONSTRAINED as to vocabulary, exactly like
`pedagogical_context`: a CHECK would reject the first row of the first outcome
nobody has thought of yet (`expired`, `interrupted`, `force_advanced` are all
plausible), and this column decorates the sequence — it must never be able to
reject it.

⚠️ AN ABANDONED ROW IS EVIDENCE THE LEARNER LEFT. It is NOT evidence they found
the activity hard. Leaving is also what a bell, a dead battery, a closed laptop
and simple loss of interest look like from here. Read the rate, never the row.

Write path: src/services/progress.service.ts. The ladder there may drop this
column from a SETTLED write (NULL stays readable) and NEVER from an ABANDONED
one — an abandonment that cannot say so is not written at all.$$;

commit;
