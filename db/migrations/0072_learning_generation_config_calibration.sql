-- ============================================================================
-- Itera migration 0072 — schema `learning`: the F1 CALIBRATION columns on the
-- existing `learning.generation_config` global row. Applies to the ITERA
-- Supabase project (kjefmwlopzeaqgqtlbdn) ONLY. NOT dfl-schema. NOT DFL
-- production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260901-learning-engine-collect-and-judge-better, item F1, ADR-3
--       (the calibration VALUES) + ADR-6 (WHERE they live), question Q3
--       (id 183b81a1), answer A.
--
-- WHAT THIS IS
-- -----------
-- F1 fixes grade inflation in the reducer: two `medium`-strength, high-
-- confidence observations from one afternoon used to be enough to call a claim
-- `strong`. The fix has three parts — exponential time decay, a
-- per-(claim, episode) cap, and a distinctness floor `strong` must clear
-- (≥3 distinct episodes AND ≥2 distinct projects). This migration adds the
-- FOUR parameters those three mechanisms read, as columns on the config row
-- migration 0070 created:
--   decay_half_life_days           : evidence weight halves every this-many days.
--   strong_min_distinct_episodes   : `strong` needs mastery-bearing evidence from
--                                     at least this many distinct episodes.
--   strong_min_distinct_projects   : ...and at least this many distinct projects.
--   per_episode_cap                : the most one episode may contribute
--                                     (decayed) to one claim's score.
--
-- WHY THE SAME ROW AS THE CADENCE GOVERNOR, NOT A NEW TABLE (ADR-6)
-- ------------------------------------------------------------------
-- Tainan's own framing on the question was explicit: the calibration logic
-- "should be exposed in the admin (learning-backoffice, learning-engine)…
-- ajustável no learning-engine.iterahq.dev global (nao por user)" — the SAME
-- one dial he already asked to look at for cadence (question `67591496`,
-- migration 0070). A second, F1-only config store would fragment that one
-- place into two, for no operational benefit: both sets of parameters are
-- global, operator-owned, and edited from the same backoffice screen. So this
-- migration ALTERs the existing `learning.generation_config` table rather than
-- creating a second one.
--
-- WHY THE ENGINE STILL WORKS BEFORE AND AFTER THIS MIGRATION
-- ------------------------------------------------------------
-- Exactly the same contract as 0070's governor columns: the reducer hard-codes
-- the Q3 values as CALIBRATION_DEFAULTS
-- (apps/engine/src/pipeline/reducer.ts) and `calibration.ts`'s
-- `loadCalibrationConfig` reads this row only to OVERRIDE them. A missing
-- table, a missing row, missing columns (PostgREST `42703` — exactly the state
-- before this migration merges), or any other read error all degrade to
-- CALIBRATION_DEFAULTS. So F1 shipped and works correctly before this
-- migration merges; this migration only makes the values EDITABLE.
--
-- RLS AND GRANTS — SAME POSTURE AS 0070, NO NEW POLICY NEEDED
-- -------------------------------------------------------------
-- These are new COLUMNS on an existing table, not a new table: 0070's
-- `generation_config_read_all` SELECT policy (`using (true)`) and its grants
-- (`select` to `authenticated`, nothing to `anon`) already cover them — a
-- policy is defined per row, not per column. No RLS change belongs in this
-- file.
--
-- ⚠️ INVISIBLE TO THE DRIFT GUARDS, as all of schema `learning` is (0067
-- header): db/scripts/census.sql scopes to ('itera','billing'), so
-- db/census/expected-schema.txt needs no update for this PR.
-- ============================================================================

alter table learning.generation_config
  add column if not exists decay_half_life_days numeric not null default 30,
  add column if not exists strong_min_distinct_episodes int not null default 3,
  add column if not exists strong_min_distinct_projects int not null default 2,
  add column if not exists per_episode_cap numeric not null default 3;

-- A non-positive half-life would make the reducer's decay formula
-- (2^(-age/half_life)) undefined/nonsensical. The engine additionally floors a
-- bad value defensively (calibration.ts), but the database should not accept
-- one in the first place.
alter table learning.generation_config
  drop constraint if exists generation_config_decay_half_life_sane;
alter table learning.generation_config
  add constraint generation_config_decay_half_life_sane
  check (decay_half_life_days > 0);

-- A floor of 0 would mean "no distinctness requirement", which is a different
-- feature (disabling the gate) than a calibration VALUE — disabling belongs to
-- a future explicit flag, not a 0 smuggled through this column. Both floors
-- need at least 1.
alter table learning.generation_config
  drop constraint if exists generation_config_strong_episodes_sane;
alter table learning.generation_config
  add constraint generation_config_strong_episodes_sane
  check (strong_min_distinct_episodes >= 1);

alter table learning.generation_config
  drop constraint if exists generation_config_strong_projects_sane;
alter table learning.generation_config
  add constraint generation_config_strong_projects_sane
  check (strong_min_distinct_projects >= 1);

-- A negative cap is nonsensical; 0 is a valid (if extreme) operator choice —
-- it would mean no single episode may contribute anything to a claim's score.
alter table learning.generation_config
  drop constraint if exists generation_config_per_episode_cap_sane;
alter table learning.generation_config
  add constraint generation_config_per_episode_cap_sane
  check (per_episode_cap >= 0);

comment on column learning.generation_config.decay_half_life_days is
  $$F1 (plan 20260901-learning-engine-collect-and-judge-better, ADR-3/Q3
183b81a1): the reducer's exponential time-decay half-life, in days. An
observation's weight is multiplied by 2^(-age_days / decay_half_life_days), so
evidence this many days old counts at half weight, evidence twice that old at a
quarter, and so on. Default 30 (Tainan's Q3 answer). See
apps/engine/src/pipeline/reducer.ts.$$;

comment on column learning.generation_config.strong_min_distinct_episodes is
  $$F1 (ADR-3/Q3 183b81a1): `strong` requires mastery-bearing evidence from at
least this many DISTINCT episodes — sustained competence, not one sitting.
Default 3. Combined with strong_min_distinct_projects; both floors must be met
or the level caps at `intermediate` (reducer gate
`strong-blocked-distinctness`).$$;

comment on column learning.generation_config.strong_min_distinct_projects is
  $$F1 (ADR-3/Q3 183b81a1): `strong` requires mastery-bearing evidence from at
least this many DISTINCT projects (work_episodes.project_ref) — cross-context
competence, not one repo. Default 2. Combined with
strong_min_distinct_episodes; both floors must be met.$$;

comment on column learning.generation_config.per_episode_cap is
  $$F1 (ADR-3/Q3 183b81a1): the most one episode may contribute (after decay) to
one claim's score. Stops N near-duplicate observations from a single episode
out-counting one real one — e.g. two medium@0.95 observations from the same
episode (raw 3.8) are scaled down to this cap (default 3) before they reach the
level thresholds. Applies per (claim, episode), pooled across every actor/
direction bucket that episode contributed to that claim.$$;
