-- ============================================================================
-- Itera migration 0033 — how long the learner spent on the activity.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
-- Plan: 20260731-itera-eventos-aprendizagem (Phase 1 — Duração).
--
-- WHY
-- ---
-- Self-paced mode collects NO duration at all today: itera.activity_results
-- carries only `created_at`, and `elapsed_ms` exists exclusively in
-- itera.class_answers (live class, one row per learner per activity per
-- session). The two questions that motivated the telemetry plan — "which
-- activity is hard" and "where do learners give up" — are not measurable
-- without time-on-screen, in either direction: a wrong answer given in four
-- seconds and one given after four minutes are the same row today.
--
-- WHY COLUMNS AND NOT `feedback` jsonb
-- ------------------------------------
-- `feedback` holds the answer's CONTENT (response / response_truncated /
-- response_length, capped at 2000 chars) — free-shaped, read one row at a time
-- to see WHAT a learner wrote. Duration is the opposite kind of thing: a
-- fixed-width number that every difficulty/abandonment query aggregates over the
-- whole table. Two consequences decide it: inside jsonb every aggregate becomes
-- a per-row cast with no type guarantee behind it, and there is nowhere to hang
-- the definition — whereas COMMENT ON COLUMN puts the meaning in front of the
-- next person who runs `\d+`, which is where they will actually look. The house
-- precedent already exists one table over (class_answers.elapsed_ms, migration
-- 0020) and this deliberately mirrors its name, type and check.
--
-- WHAT THE NUMBERS MEAN — the window is stated in full in the COMMENTs below,
-- because in six months nobody will remember, and a duration whose boundaries
-- are unstated WILL be read as something it is not.
--
-- BOTH COLUMNS ARE NULLABLE. NULL means "not measured", which is a different
-- fact from "took no time"; the client stores NULL rather than a fabricated 0
-- when it has no origin (today: an offline-outbox entry serialised before this
-- field existed). Every row written after the client ships carries both.
--
-- NO BACKFILL, and none is possible: the 475 pre-existing rows were never timed
-- and nothing else in the system holds the missing measurement. Same rule as
-- migration 0028 — a number that was never collected is not estimated.
--
-- NO INDEX: the queries this enables are aggregates over the table (group by
-- kind / activity / cohort), which scan regardless; an index on a column nobody
-- filters on would cost every INSERT for nothing. Add one when a real query asks.
--
-- RLS: unchanged and none needed. results_rw_self / results_select_admin /
-- results_select_instructor are row policies with no column list, and the 0002
-- grants are table-wide (`grant select on all tables in schema itera`), so new
-- columns are covered by construction.
--
-- Idempotent: `add column if not exists` + `drop constraint if exists` before
-- `add constraint`, and COMMENT ON is a replace. Required, not optional —
-- db/scripts/apply-migrations.sh has NO ledger table and replays every file from
-- 0001 on every run, so a non-idempotent file here poisons every future apply.
-- ============================================================================

alter table itera.activity_results
  add column if not exists elapsed_ms integer,
  add column if not exists visible_ms integer;

-- Sanity guards only. Deliberately NOT a cross-column check
-- (`visible_ms <= elapsed_ms`): that invariant is enforced client-side by
-- clamping, because a constraint violation here would reject the whole INSERT
-- and cost us the attempt row itself — which is worth far more than the timing
-- that produced it. Never let telemetry be able to destroy the record it decorates.
alter table itera.activity_results
  drop constraint if exists activity_results_elapsed_ms_nonneg;
alter table itera.activity_results
  add constraint activity_results_elapsed_ms_nonneg
  check (elapsed_ms is null or elapsed_ms >= 0);

alter table itera.activity_results
  drop constraint if exists activity_results_visible_ms_nonneg;
alter table itera.activity_results
  add constraint activity_results_visible_ms_nonneg
  check (visible_ms is null or visible_ms >= 0);

comment on column itera.activity_results.elapsed_ms is
  $$WALL-CLOCK milliseconds the learner spent on this activity.

THE WINDOW — both duration columns share it:
  OPENS  when the activity became the one on screen for THIS learner (self-paced:
         the player advanced to it, after the resume gate released; live class:
         the professor's pointer landed on it, restarted if a timer was armed).
  CLOSES when the learner SETTLED their answer (the activity's onComplete), NOT
         when this row was written. Those differ in self-paced mode: a graded
         activity holds the feedback footer while the learner reads the
         explanation and only "Continuar" persists. Counting that review beat
         would inflate every graded kind by reading time.

INCLUDED: time with the tab in the background, the window minimised, the laptop
lid shut. This is time-since-opened, not attention. Uncapped on purpose — a cap
invents a number, and "opened it and came back the next day" is a real signal.
So this column has a heavy right tail BY CONSTRUCTION: use medians and
percentiles, never a naive mean, and prefer visible_ms for difficulty analysis.

NOT INCLUDED: anything before the activity appeared (lesson load, resume
read-back) or after the answer settled (feedback reading, saving, the next
activity). A retry of a failed write replays the ORIGINAL measurement.

NULL = not measured (an offline-outbox entry queued by a client build older than
this column). NULL is never 0, and 0 is never "unknown".

One row per settled ATTEMPT, so a learner who retries an activity produces
several rows with independent windows — this is per-attempt time, not
cumulative time-on-activity. Sum over the learner if you want the latter.

Mirrors itera.class_answers.elapsed_ms (migration 0020) in name, type and check;
that column remains the live-class-scoped copy, this one is the per-learner
attempt log and covers BOTH modes. Client: src/utils/activityDuration.ts.
Migration 0033, plan 20260731-itera-eventos-aprendizagem.$$;

comment on column itera.activity_results.visible_ms is
  $$The same window as elapsed_ms, MINUS every stretch in which the document was
hidden (tab switched away, window minimised) — measured via the browser's
visibilitychange. Clamped client-side into [0, elapsed_ms].

This is the honest TIME-ON-SCREEN number and the one difficulty/abandonment
analysis should use. `elapsed_ms - visible_ms` is itself the away signal.

⚠️ It is NOT "time actively working". A learner staring at a visible tab while
thinking about lunch counts in full, and one reading the activity on paper
counts as zero. We can observe attention leaving the PAGE; we cannot observe it
leaving the LEARNER. Do not rename this to active_ms, and do not present it to
an instructor as effort.

Also not a keystroke/mouse idle measure: no interaction events feed it.

NULL = not measured, exactly as for elapsed_ms — including rows written by any
client older than this column. Migration 0033.$$;
