-- ============================================================================
-- Itera migration 0071 — schema `learning`: the MACHINE-CLASS tag on
-- `work_episodes`. Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn)
-- ONLY. NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260901-learning-engine-collect-and-judge-better, item F4, ADR-2,
--       question Q2 (id 20bd650c), answer A.
--
-- MERGE ORDER. This file is 0071. It follows two migrations that are OPEN and
-- awaiting Tainan when this PR is written:
--   * PR #451 — 0069_learning_operator_read.sql   (operator cross-learner READ)
--   * PR #452 — 0070_learning_generation_config.sql (global generation governor)
-- 0071 has NO dependency on 0069 or 0070 — it only touches `work_episodes`, a
-- table already on `main` since 0067. The numbering is sequential for tidiness,
-- not for correctness. Merge order 0069 → 0070 → 0071 is the clean path; any
-- order applies, because the three files touch different objects.
--
-- WHAT THIS IS
-- -----------
-- The Learning Engine watches real work with coding agents. Some of that work
-- runs on a HUMAN's laptop; some runs on an AGENT-operated machine — a VPS
-- workforce such as `openclaw-tainan`. The Fable analysis found that agent-
-- machine episodes sit inside a "human" learner and inflate that human's
-- competence state. The unit of learning is "a human demonstrated X", and an
-- agent doing X on a VPS is not that.
--
-- `machine_class` tags each episode at the grain that carries the fact: the
-- machine that produced it. `human` is the default; `agent` marks agent-
-- workforce work. The engine derives it from the machine hostname on ingestion
-- and the reducer SEGREGATES agent-class evidence, so it never moves a human
-- learner's level. Later, an agent-workforce competence view can read the same
-- column from the other side.
--
-- WHY ON `work_episodes` AND NOT ON `learners` (ADR-2)
-- ----------------------------------------------------
-- One learner identity can run on both a human laptop and an agent VPS, so the
-- class is a property of the EPISODE, not of the learner. A flag on `learners`
-- would force one answer per identity and lose the split. A read-time allowlist
-- would be invisible to the store and fragile. So the class lives on the
-- episode, written once at ingestion.
--
-- WHY `text` + CHECK AND NOT AN ENUM (0067 discipline)
-- ---------------------------------------------------
-- The `learning` schema states its small vocabularies as `text` with a CHECK
-- (see `evidence.actor`, `evidence.direction`, `activities.intent` in 0067),
-- never as a Postgres enum. A new value is then a one-line CHECK edit, never an
-- `ALTER TYPE ... ADD VALUE` that cannot run in a transaction and cannot be
-- undone. `machine_class` follows that same discipline.
--
-- WHY THE ENGINE STILL WORKS BEFORE AND AFTER THIS MIGRATION
-- ---------------------------------------------------------
-- The engine degrades safely in BOTH directions around this column:
--   * BEFORE it lands — the ingest path strips `machine_class` from the insert
--     when the column is absent (PGRST204), and the reducer's machine-class
--     lookup returns empty, so every episode collapses to `human`. That is
--     exactly the pre-F4 behaviour.
--   * AFTER it lands — new episodes carry the class, and the reducer segregates
--     the agent-class ones. Existing rows default to `human` (see below), which
--     is the correct, conservative reading of work whose class was never tagged.
-- So this migration adds capability; it never gates the engine on itself.
--
-- APPEND-ONLY, AND WHY A DEFAULT IS SAFE HERE
-- -------------------------------------------
-- `work_episodes` is append-only for `authenticated` (INSERT + SELECT, no
-- UPDATE — see 0067). A NOT NULL column with a constant DEFAULT is exactly the
-- shape that fits: every existing row is backfilled to `'human'` by the default
-- (a metadata-only operation on PG 11+, no table rewrite), and every future
-- INSERT that omits the column also gets `'human'`. No UPDATE grant is needed,
-- and none is added.
--
-- ⚠️ INVISIBLE TO THE DRIFT GUARDS, as all of schema `learning` is (0067
-- header): db/scripts/census.sql scopes to ('itera','billing'), so
-- db/census/expected-schema.txt needs no update for this PR. Extending the
-- census to `learning` is its own PR (named in 0067).
-- ============================================================================

alter table learning.work_episodes
  add column if not exists machine_class text not null default 'human';

-- The vocabulary is small and known, so a typo is a refused write, not a row
-- the reducer silently mis-segregates. It grows here when a new class ships in
-- apps/engine (e.g. a finer agent taxonomy), the same discipline as the enums
-- in 0067.
alter table learning.work_episodes
  drop constraint if exists work_episodes_machine_class_known;
alter table learning.work_episodes
  add constraint work_episodes_machine_class_known
  check (machine_class in ('human', 'agent'));

comment on column learning.work_episodes.machine_class is
  $$Class of the machine that produced this episode (plan
20260901-learning-engine-collect-and-judge-better, F4, ADR-2). `human` is a
person at a laptop; `agent` is an agent-operated machine (a VPS workforce such
as openclaw-tainan). Written at ingestion by the engine from the machine
hostname; default `'human'`. The reducer segregates `agent`-class evidence so
agent-workforce work never inflates a human learner's competence state.$$;
