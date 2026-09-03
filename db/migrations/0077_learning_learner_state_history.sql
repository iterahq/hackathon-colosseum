-- ============================================================================
-- Itera migration 0077 — schema `learning`: learner_state TRANSITION history,
-- plus two unrelated repairs that ride along because ADR-12 makes this the
-- round's ONLY crossing of the db/migrations/** human gate:
--   * the DELETE grants T19's cleanup endpoint needs (see "THE THIRD OBJECT")
--   * an index on work_episodes(session_ref) (see "THE SECOND OBJECT")
--
-- ⚠️ ONE LINE IN HERE IS A JUDGEMENT CALL AND IS MARKED STRIKEABLE:
-- `grant delete on learning.evidence to authenticated`. Read "THE THIRD
-- OBJECT" before deciding — striking it does NOT degrade the cleanup endpoint,
-- it breaks it.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260902-itera-learning-apps-ux-redesign, task T15, ADR-12.
-- Question Q14 (`0a376325-103c-4ed5-afe2-fca23ad812c9`), answered **A** by
-- Tainan 2026-09-03T02:13Z: "Append-only learning.learner_state_history written
-- by the reducer. One row per recompute: claim_id, level, reducer_version,
-- computed_at, episode_id or activity_response_id that triggered it. RLS
-- *_rw_self like the parent. Achievements = diff between the rows before and
-- after a session."
-- Parent plan: 20260828-itera-learning-engine-v1 (schema created in 0067).
--
-- WHAT THIS IS
-- -----------
-- `learning.learner_state` (0067) is 1:1 with `learning.claims`. The reducer
-- UPSERTS it, so the previous level is overwritten and gone. Three surfaces of
-- the redesign need the level's PAST:
--
--   S1 Focus       a delta icon per claim row: level rose / gained evidence /
--                  still open.
--   S4 /claims/:id §HOW IT GOT HERE — the series of transitions for one claim.
--   S7 session     the achievement band — the diff of a learner's state across
--                  the turns of ONE session.
--
-- This migration creates the append-only table those three read. It creates
-- nothing else. Q15, Q16, Q20 and Q23 were still unanswered when this file was
-- written, so their columns and the `learning.sessions` view are NOT here —
-- ADR-12 says a later schema need is a SECOND crossing of this gate, said out
-- loud, not a column smuggled in now.
--
-- ⚠️ THERE IS NOTHING TO BACK-FILL, AND THE UI MUST SAY SO
-- --------------------------------------------------------
-- A transition is an EVENT. `learner_state` records only the latest value, and
-- `evidence.created_at` cannot reconstruct the levels the reducer actually
-- concluded on the way (decay is anchored to the computation instant, the
-- calibration config has changed between runs, and `reducer_version` moved
-- v1 -> v3). A back-fill would therefore be a plausible invention, which is the
-- one thing a receipt may never be.
--
-- So THIS TABLE STARTS EMPTY. Until the reducer records its first transition
-- for a claim, that claim has NO history row, and every consumer must render
-- the ABSENCE, not a guess: the S1 delta icon shows `open`, the S4 section
-- §HOW IT GOT HERE renders nothing at all (the plan's "no placeholder" rule),
-- and the S7 band shows no band. Nobody should expect arrows on day one.
--
-- ONE ROW PER TRANSITION, NOT PER RECOMPUTE
-- -----------------------------------------
-- The answer's words are "one row per recompute". Taken literally that is a row
-- per claim per pipeline run: `runPipeline` recomputes EVERY claim of every
-- objective in scope on every run, precisely so a claim with no evidence still
-- carries an explicit `unknown` row (0067's reasoning). Ten claims and a
-- nightly run would write ~3,650 rows a year of which almost none records a
-- change, and §HOW IT GOT HERE would read as a log of nothing happening.
--
-- So a row is written when the recompute CHANGED something — `level`,
-- `evidence_count`, or the reducer's `gate` branch. That is the same set of
-- events the three consumers render, and it is what makes "the diff before and
-- after a session" (the answer's own achievement rule) a SELECT rather than a
-- reduction. The rule is enforced HERE, by `learner_state_history_is_a_change`
-- below, not by the engine's good behaviour: a no-op row is refused by the
-- database.
--
-- WHY THE KEY IS (learner_id, claim_id) AND NOT learner_state.id
-- --------------------------------------------------------------
-- Three reasons, in order of weight.
--
--  1. `learner_state` is A CACHE. Its own table comment says so: "a cache with
--     a receipt, not a source of truth — the evidence is the truth." A repair
--     that deletes and recomputes a state row is a legitimate operation. If the
--     history referenced `learner_state.id` with `on delete cascade`, that
--     operation would DESTROY the very record it exists to keep; with
--     `on delete set null` the history would survive but point at nothing. The
--     history must outlive the cache, so it hangs off the durable noun:
--     `learning.claims`.
--  2. THE PAIR-FK RULE OF THIS SCHEMA. 0067's header states it: every child
--     carries `learner_id` and references its parent by the PAIR
--     (parent_id, learner_id) against a unique index on (id, learner_id),
--     because a foreign-key check does not consult RLS and a single-column FK
--     would happily accept another learner's row. `claims` already has
--     `uq_claims_id_learner`; `learner_state` has no `(id, learner_id)` index,
--     so keying on it would mean adding one to reference a cache.
--  3. EVERY CONSUMER READS BY CLAIM. S1 wants the newest row per claim, S4 the
--     series for one claim, S7 the rows whose trigger episode belongs to one
--     session. None of them needs the state row's identity, and the SPA reads
--     PostgREST directly with no server, so a join it does not need is a join
--     it cannot afford.
--
-- WHY previous_* IS DENORMALISED ONTO THE ROW
-- -------------------------------------------
-- `progress.iterahq.dev` has NO server and NO RPC in its read path (as-built
-- §2, and the 2026-06-23 fleet rule: the UI talks to Supabase directly). It
-- cannot run `lag()` and it does not fetch the whole series to render one
-- arrow. A row that carries BOTH sides of the transition makes the S1 delta
-- icon a single filtered select, and it makes each S4 line self-describing
-- ("weak -> intermediate") without reading its neighbour. The cost is two
-- narrow columns; the alternative is a window function the client cannot run.
--
-- WHY `gate` IS HERE AND THE FULL RECEIPT IS NOT
-- ----------------------------------------------
-- `learner_state.inputs` is the receipt: weights, thresholds, calibration and
-- one `contributions[]` entry per evidence row. It is NOT copied here. It grows
-- with a claim's evidence, it is not needed by any of the three consumers, and
-- the receipt surface (S10, question Q11) is still unanswered — storing a
-- per-step copy now would be building an answer nobody has given.
--
-- The T1 field audit (2026-09-03, live catalog) settles that the receipt needs
-- NO migration at all: `learner_state.reducer_version` is NOT NULL and
-- `inputs.contributions[]` already carries `weight`, `raw_weight`,
-- `decay_factor`, `age_days`, `capped` and `mastery_bearing`, alongside
-- `thresholds`, `weights`, a `calibration` snapshot and
-- `distinct_mastery_episode_count` / `_project_count`. So this table is for the
-- DELTA OVER TIME, and only that. Nothing here duplicates what the current row
-- already holds.
--
-- `inputs.gate` is the exception, and it is one narrow text column. It names
-- the reducer BRANCH that produced the level:
-- `unknown-no-mastery-evidence` | `scored` | `strong-blocked-distinctness`.
-- The S7 band's `✓ gate passed` achievement is exactly a `gate` transition —
-- without this column that achievement type is not derivable from the history
-- at all, and adding it later is a second crossing of a human gate for one
-- `text`. It also makes a level that did NOT move for a real reason
-- (distinctness floor cleared) a visible event rather than a silent one.
--
-- `gate` carries NO `check (... in (...))`. It is a reducer implementation
-- detail that grows with `reducer_version`; binding it would force a migration
-- through this human gate every time the reducer learns a new branch. Same
-- argument 0067 makes for `activities.kind` and 0074's ADR-1 makes for
-- `concepts.kind`: assert PRESENCE and SHAPE, never the SET of values.
--
-- ⚠️ `gate` DID NOT ALWAYS EXIST, AND THAT IS A TRAP THE CONSTRAINT DISARMS.
-- The T1 audit found 4 live `reducer-v1` rows whose `inputs` carries no `gate`
-- key at all. `previous_gate` is therefore NULLABLE — a claim last computed by
-- reducer-v1 has no previous gate to record. `gate` itself stays NOT NULL,
-- because the value is read from the reducer's OWN output and reducer-v3
-- always emits it.
--
-- The trap: with a naive `previous_gate is distinct from gate`, the FIRST v3
-- recompute of one of those 4 rows would look like a gate transition purely
-- because the key appeared, and the S7 band would render a `gate passed`
-- achievement that nobody achieved. So the change test below requires
-- `previous_gate IS NOT NULL` before a gate difference counts. `NULL -> scored`
-- is the schema catching up, not the learner moving.
--
-- APPEND-ONLY, AND WHAT ENFORCES IT
-- ---------------------------------
-- `authenticated` gets INSERT and SELECT and nothing else, the same posture
-- 0067 gives `work_episodes`, `evidence` and `activity_responses`. There is no
-- UPDATE and no DELETE grant, so Postgres refuses a rewrite of the record
-- rather than a policy refusing it later. A wrong history row is corrected by
-- the next recompute writing the next transition, never by editing the past.
--
-- This is deliberately STRICTER than the parent. `learner_state` holds
-- INSERT + UPDATE for `authenticated` because the reducer runs with the
-- learner's own JWT (0067's stated v1 trade). The history does not need UPDATE
-- to be written, so it does not get it.
--
-- WHY THE ENGINE WRITES THIS AND NOT A TRIGGER, STATED RATHER THAN IMPLIED
-- -----------------------------------------------------------------------
-- An `after insert or update` trigger on `learner_state` would be ATOMIC with
-- the state write, and it would also catch a state row written by hand — which
-- 0067's header admits is possible while the reducer runs on the learner's own
-- token. The answer to Q14 says "written by the reducer", and the engine
-- already funnels every state write through ONE function
-- (`recomputeClaimState` in `apps/engine/src/pipeline/run.ts`), so that is
-- where the append goes. Both writers would double-write, so there is only one.
--
-- The cost of that choice, named: the state upsert and the history insert are
-- two PostgREST calls, not one transaction. A failed append leaves a state
-- change with no history row. It is DETECTABLE — `learner_state.computed_at`
-- newer than the claim's newest `learner_state_history.computed_at` with a
-- different `level` means a lost append — and the engine logs the failure
-- rather than swallowing it. It is not repaired automatically, because
-- inventing the missing row is the invention this file's back-fill note
-- refuses.
--
-- ⚠️ THIS TABLE IS INVISIBLE TO THE DRIFT GUARDS, LIKE THE REST OF `learning`.
-- `db/scripts/census.sql` scopes every query to `nspname in ('itera','billing')`
-- (verified on this branch), so schema-parity, db-drift and
-- itera.schema_object_census will not see one object below, and
-- `db/census/expected-schema.txt` needs no update for this PR to pass. That is
-- 0067's hole, not a new one, and closing it means re-baselining the census in
-- its own PR. Named here rather than left implied.
--
-- Behavioural cover this file DOES have: `db/scripts/
-- test-rls-learner-state-history.sh`, run by `db-migration-check` against the
-- schema it just built from zero. It proves a learner reads only their own
-- rows, that `anon` reads nothing, that a real transition appends, that a
-- no-op is refused, and that UPDATE/DELETE are refused — and it proves each of
-- those assertions can go RED by mutating the object under it.
--
-- THE SECOND OBJECT: an index on work_episodes(session_ref). UNRELATED.
-- --------------------------------------------------------------------
-- It has nothing to do with the history table, and it is here for one reason:
-- ADR-12 makes this the ONLY pull request of this round that crosses the
-- `db/migrations/**` human gate, and a lone `create index` is not worth a
-- second crossing.
--
-- What it fixes (T1 audit, 2026-09-03): `learning.work_episodes.session_ref`
-- has NO index, and both new session surfaces filter on it — S6 `/sessions`
-- groups a learner's episodes by `session_ref`, S7 `/sessions/:sessionRef`
-- selects one. At 571 rows for one learner, under `ENTITY_PAGE_LIMIT = 1000`,
-- a sequential scan is invisible. It stops being invisible QUIETLY as the
-- capture agent keeps shipping, which is the failure mode worth pre-empting.
--
-- Plain `create index`, not `create index concurrently`: concurrently cannot
-- run inside a transaction block and would force this file to carry
-- `-- itera:no-transaction`, trading a whole-file rollback for a lock that is
-- measured in milliseconds on 571 rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- learner_state_history — one row per state TRANSITION, append-only.
-- ---------------------------------------------------------------------------
create table if not exists learning.learner_state_history (
  id                      uuid primary key default gen_random_uuid(),
  learner_id              uuid not null references learning.learners(id) on delete cascade,
  claim_id                uuid not null,

  -- The state AFTER this transition. Mirrors learning.learner_state.
  level                   text not null,
  evidence_count          int  not null,
  gate                    text not null,

  -- The state BEFORE it. NULL means "no previous row" — the first transition
  -- this table ever recorded for the claim, which is not the same thing as a
  -- transition from `unknown`.
  previous_level          text,
  previous_evidence_count int,
  previous_gate           text,

  -- Which reducer concluded it. Read straight from the state row that was
  -- written, so a history line is attributable to a named implementation.
  reducer_version         text not null,

  -- WHAT TRIGGERED THE RECOMPUTE. At most one of the two, and both may be null
  -- when a whole-learner re-run recomputed a claim no single input touched.
  -- `episode_id` is what makes the S7 achievement band possible: a session is
  -- `work_episodes` grouped by `session_ref` (there is no sessions table), so
  -- the band selects the session's episode ids and reads the transitions they
  -- caused.
  episode_id              uuid,
  activity_response_id    uuid,

  -- The reducer's own decay anchor for this computation — the value it wrote to
  -- learner_state.computed_at, NOT the time this row landed. A caller that must
  -- reproduce the computation exactly passes this back as the reducer's `now`.
  computed_at             timestamptz not null,
  created_at              timestamptz not null default now()
);

-- ── Cross-learner references are refused structurally (0067's rule) ─────────
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_claim_same_learner;
alter table learning.learner_state_history
  add constraint learner_state_history_claim_same_learner
  foreign key (claim_id, learner_id)
  references learning.claims(id, learner_id) on delete cascade;

-- Naming the column to null is required, not stylistic: a plain
-- `on delete set null` on a two-column FK nulls BOTH columns, and `learner_id`
-- is NOT NULL, so deleting an episode would abort instead of orphaning the
-- history. Same disarming 0067 applies to `evidence`.
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_episode_same_learner;
alter table learning.learner_state_history
  add constraint learner_state_history_episode_same_learner
  foreign key (episode_id, learner_id)
  references learning.work_episodes(id, learner_id) on delete set null (episode_id);

alter table learning.learner_state_history
  drop constraint if exists learner_state_history_response_same_learner;
alter table learning.learner_state_history
  add constraint learner_state_history_response_same_learner
  foreign key (activity_response_id, learner_id)
  references learning.activity_responses(id, learner_id)
  on delete set null (activity_response_id);

-- ── Value guards ────────────────────────────────────────────────────────────
-- `level` and `previous_level` take the same four words as learner_state.level.
-- This one IS bound to a set, because the four levels are the product's
-- vocabulary and `lib/levels.ts` renders each of them by name; a fifth level is
-- a design decision, not an implementation detail.
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_level_known;
alter table learning.learner_state_history
  add constraint learner_state_history_level_known
  check (level in ('unknown','weak','intermediate','strong'));

alter table learning.learner_state_history
  drop constraint if exists learner_state_history_previous_level_known;
alter table learning.learner_state_history
  add constraint learner_state_history_previous_level_known
  check (previous_level is null
         or previous_level in ('unknown','weak','intermediate','strong'));

-- `gate` is NOT bound to a set. See the header.
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_gate_present;
alter table learning.learner_state_history
  add constraint learner_state_history_gate_present
  check (length(btrim(gate)) > 0 and length(gate) <= 64);

alter table learning.learner_state_history
  drop constraint if exists learner_state_history_previous_gate_shape;
alter table learning.learner_state_history
  add constraint learner_state_history_previous_gate_shape
  check (previous_gate is null
         or (length(btrim(previous_gate)) > 0 and length(previous_gate) <= 64));

alter table learning.learner_state_history
  drop constraint if exists learner_state_history_reducer_version_present;
alter table learning.learner_state_history
  add constraint learner_state_history_reducer_version_present
  check (length(btrim(reducer_version)) > 0);

alter table learning.learner_state_history
  drop constraint if exists learner_state_history_evidence_count_sane;
alter table learning.learner_state_history
  add constraint learner_state_history_evidence_count_sane
  check (evidence_count >= 0
         and (previous_evidence_count is null or previous_evidence_count >= 0));

-- A recompute has ONE trigger, or none. Both set at once would be a row that
-- names two causes for one effect, and the S7 band would count it twice.
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_one_trigger;
alter table learning.learner_state_history
  add constraint learner_state_history_one_trigger
  check (episode_id is null or activity_response_id is null);

-- ── THE CONSTRAINT THAT MAKES THE TABLE MEAN WHAT ITS NAME SAYS ─────────────
-- A row must record a CHANGE. Without this, an engine bug or a second writer
-- turns the transition log into a recompute log, and §HOW IT GOT HERE fills
-- with lines where nothing got anywhere. The database refuses the no-op rather
-- than trusting every future writer to remember.
--
-- `is distinct from` and not `<>` on the first two, because the previous_*
-- columns are NULL on a claim's first recorded transition and `NULL <> 'weak'`
-- is NULL, not true.
--
-- The gate clause is deliberately NOT symmetric with them: it requires
-- `previous_gate IS NOT NULL`. A NULL previous gate means the claim was last
-- computed by reducer-v1, whose `inputs` has no `gate` key at all (4 such rows
-- live today, T1 audit). `NULL -> scored` is the receipt gaining a field, not
-- the learner passing a gate, and counting it would put a phantom achievement
-- on the S7 band. The asymmetry costs nothing: a genuine first transition still
-- passes on the `previous_level` clause, because `NULL is distinct from
-- <any level>` is true.
alter table learning.learner_state_history
  drop constraint if exists learner_state_history_is_a_change;
alter table learning.learner_state_history
  add constraint learner_state_history_is_a_change
  check (
    previous_level             is distinct from level
    or previous_evidence_count is distinct from evidence_count
    or (previous_gate is not null and previous_gate <> gate)
  );

-- ── Indexes, one per consumer ───────────────────────────────────────────────
-- S4 §HOW IT GOT HERE (the series for one claim) and S1's newest-row-per-claim.
-- `claim_id` alone is selective: a claim id is globally unique, the same reason
-- 0067 indexes `evidence(claim_id, created_at desc)` without the learner.
--
-- `created_at` is in the key as a TIE-BREAK, not as decoration. `computed_at`
-- is the reducer's run-wide decay anchor: `runPipeline` loads it ONCE and every
-- claim of that run shares the value on purpose (state rows of one run must be
-- mutually consistent). The T1 audit measured exactly that — all 6 live
-- learner_state rows carry one `computed_at`. So `computed_at` alone cannot
-- order two transitions of the same claim from one run, and a series ordered by
-- it alone would render in an arbitrary order.
create index if not exists idx_learner_state_history_claim
  on learning.learner_state_history(claim_id, computed_at desc, created_at desc);

-- The progress series for one learner, across every claim.
create index if not exists idx_learner_state_history_learner_time
  on learning.learner_state_history(learner_id, computed_at desc);

-- S7: the transitions caused by the episodes of one session.
create index if not exists idx_learner_state_history_episode
  on learning.learner_state_history(episode_id)
  where episode_id is not null;

-- ── Comments ────────────────────────────────────────────────────────────────
comment on table learning.learner_state_history is
  $$Append-only history of learning.learner_state TRANSITIONS: one row each time
a recompute changed a claim's level, its evidence count, or the reducer gate
that produced it. A recompute that changed nothing writes NOTHING — the
`learner_state_history_is_a_change` constraint refuses it.

Written by the reducer (apps/engine/src/pipeline/run.ts, recomputeClaimState) in
iterahq/itera-learning-monorepo. Question Q14 of plan
20260902-itera-learning-apps-ux-redesign, answered A by Tainan 2026-09-03.

Keyed on (learner_id, claim_id), NOT on learner_state.id: the state row is a
cache that a repair may legitimately delete and rebuild, and the history has to
survive that. Reads: S1's delta icon (newest row per claim), S4's HOW IT GOT
HERE (the series for one claim), S7's achievement band (the rows whose
episode_id belongs to one session_ref).

STARTS EMPTY. There is nothing to back-fill — a past level cannot be
reconstructed from evidence timestamps, because decay is anchored to the
computation instant and both the calibration and the reducer version have moved.
Until a claim has its first row, every consumer renders the ABSENCE.

APPEND-ONLY for `authenticated`: INSERT and SELECT. No UPDATE, no DELETE.$$;

comment on column learning.learner_state_history.previous_level is
  $$The level before this transition. NULL means this is the FIRST transition
recorded for the claim, which is NOT the same as a transition out of `unknown`.
Denormalised on purpose: the dashboard reads PostgREST directly with no server,
so it cannot run a window function to find the preceding row.$$;

comment on column learning.learner_state_history.gate is
  $$The reducer branch that produced `level` — today
unknown-no-mastery-evidence | scored | strong-blocked-distinctness, read from
learner_state.inputs->>'gate'. Deliberately UNCONSTRAINED as a set: it is a
reducer implementation detail that grows with reducer_version, and binding it
would force a migration through the human gate for every new branch (0067's
argument for activities.kind, 0074 ADR-1's for concepts.kind).

A gate transition with no level change is the S7 band's `gate passed`
achievement.$$;

comment on column learning.learner_state_history.episode_id is
  $$The work episode whose evidence triggered this recompute, when exactly one
did. NULL when a whole-learner re-run recomputed the claim, or when more than
one episode of the same run touched it — ambiguous attribution is left NULL
rather than guessed.

This column is what makes the S7 achievement band possible: there is no sessions
table, so a session is work_episodes grouped by session_ref, and the band reads
the transitions its episode ids caused.$$;

comment on column learning.learner_state_history.computed_at is
  $$The reducer's decay anchor for this computation — the value written to
learner_state.computed_at, not the moment this row landed (that is created_at).
Pass it back as the reducer's `now` to reproduce the computation exactly;
otherwise decay keeps moving between the write and the verify and the two runs
disagree without either being wrong.$$;

-- ============================================================================
-- RLS — mirrors learning.learner_state exactly, and the mirror was MEASURED,
-- not assumed. Read from the ITERA project 2026-09-03 (read-only admin path,
-- pg_policies on schema `learning`):
--
--   learner_state_rw_self       ALL     qual/with_check
--                                       (learner_id = itera.current_itera_user_id())
--   learner_state_read_operator SELECT  itera.is_learning_operator()
--
-- Both are reproduced below. The operator SELECT is not scope creep: the
-- Learning Backoffice reads every learner's state (0069), and a history the
-- operator cannot read would make the backoffice's state view unexplainable
-- while the learner's own is explainable.
--
-- `for all` with `using` AND `with check`, per 0067: `using` alone would let a
-- learner INSERT a row they cannot then read.
-- ============================================================================

alter table learning.learner_state_history enable row level security;

drop policy if exists learner_state_history_rw_self on learning.learner_state_history;
create policy learner_state_history_rw_self on learning.learner_state_history
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists learner_state_history_read_operator on learning.learner_state_history;
create policy learner_state_history_read_operator on learning.learner_state_history
  for select using (itera.is_learning_operator());

-- ============================================================================
-- GRANTS — RLS still applies on top; these decide which VERBS may be attempted.
-- 0002's blanket grant does not reach a table created afterwards, so both lines
-- are written out. `anon` gets nothing: there is no anonymous reader of a
-- person's learning history, and 0063/0065 are the record of what one copied
-- grant block costs.
--
-- APPEND-ONLY: SELECT + INSERT. The absence of UPDATE and DELETE is the
-- enforcement, not a convention — see the header.
-- ============================================================================

grant select, insert on learning.learner_state_history to authenticated;
revoke all on learning.learner_state_history from anon;

-- ============================================================================
-- THE THIRD OBJECT — the DELETE grants T19's cleanup endpoint needs.
-- Unrelated to the history table. Here for the same ADR-12 reason as the index
-- below: this is the round's single crossing of the db/migrations/** gate.
--
-- MEASURED IN PRODUCTION 2026-09-03 (read-only admin path,
-- information_schema.role_table_grants, schema `learning`):
--
--   activities          authenticated  INSERT, SELECT, UPDATE
--   activity_responses  authenticated  INSERT, SELECT
--   evidence            authenticated  INSERT, SELECT
--
-- No DELETE on any of the three. RLS is NOT the problem — `activities_rw_self`
-- is `FOR ALL` and already scopes a delete to the caller's own rows. The TABLE
-- GRANT is what refuses, and Postgres refuses it with `42501 permission denied`
-- before RLS is ever consulted.
--
-- WHAT IS BROKEN TODAY BECAUSE OF IT
--   * T19's `DELETE /v1/activities/:id` cannot delete anything.
--   * T26's acceptance criterion "then the smoke row is cleaned up" is
--     UNSATISFIABLE BY CONSTRUCTION — no grant, no cleanup, at any effort.
--   * Three seeded rows sit in production now, all terminal and inert, and
--     nothing short of a migration can remove them.
--
-- RLS still scopes every one of these: a learner deletes only their own rows.
-- ============================================================================

grant delete on learning.activities to authenticated;
grant delete on learning.activity_responses to authenticated;

-- ⚠️ NOTE, so it is not discovered later: `activity_responses` is one of the
-- three tables 0067's header names as APPEND-ONLY ("an account of the past that
-- can be edited is not an account"). The grant above weakens that property for
-- a learner's own rows. It is included unconditionally because the endpoint
-- deletes responses explicitly and cannot function without it. The composite FK
-- `activity_responses_activity_same_learner` is `on delete cascade`, so a
-- future refactor could drop this grant by letting the activity delete cascade
-- instead — that is an engine change, not a schema one.

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ⚠️  STRIKEABLE AT THE GATE — the ONE line here that is a judgement call.  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `learning.evidence` is the strongest of 0067's append-only guarantees: it is
-- the record the whole learner_state is derived from, and "a wrong evidence row
-- is corrected by writing a `weakens` row, not by rewriting history". T27 met
-- that property an hour ago and correctly could not rewrite three historical
-- pt-BR rows. Granting DELETE weakens it for every learner, on their own rows.
--
-- ⚠️ BUT STRIKING THIS LINE DOES NOT DEGRADE THE ENDPOINT — IT BREAKS IT.
-- Measured in T19's code on `main`: the evidence delete is step 2 of 4, it runs
-- BEFORE the responses and the activity ("evidence points at the response, so
-- the other order strands a foreign key"), and a failure THROWS
-- (`evidence_delete_failed`). So without this grant,
-- `DELETE /v1/activities/:id` returns 500 and deletes NOTHING for any activity
-- that has at least one response — which is exactly the T26 case (submit, then
-- clean up). An activity with no responses still deletes fine.
--
-- So the choice is not "keep append-only and lose one smoke row". It is:
--   KEEP this line   -> the endpoint works; evidence loses append-only for a
--                       learner's own rows.
--   STRIKE this line -> append-only holds; the cleanup endpoint stays broken,
--                       T26 stays unsatisfiable, the three stuck rows stay
--                       stuck. Restoring both then needs an ENGINE change:
--                       T19 tolerating an un-deletable evidence row instead of
--                       throwing, and accepting that the orphaned evidence keeps
--                       feeding the reducer.
grant delete on learning.evidence to authenticated;

-- ============================================================================
-- THE SECOND OBJECT — work_episodes(session_ref). Unrelated to everything
-- above; here because ADR-12 makes this the round's only crossing of the
-- db/migrations/** human gate. See the header.
--
-- The existing index is `idx_work_episodes_learner_started(learner_id,
-- started_at desc)` (0067). Nothing indexes `session_ref`, and the two new
-- session surfaces both filter on it:
--
--   S6 /sessions              every episode of the learner, grouped by session_ref
--   S7 /sessions/:sessionRef  session_ref = :ref, ordered by started_at
--
-- `learner_id` leads because RLS puts it in the predicate of every query
-- regardless of what the SPA asked for. `started_at` trails so S7's ordering is
-- read from the index rather than sorted after the fetch.
--
-- Partial on `session_ref is not null`: 0067 already treats a null session_ref
-- as a real, storable state (a line that lost its ref is still worth keeping;
-- `uq_work_episodes_ingest` is partial for the same reason). Those rows belong
-- to no session and no session query will ever look for them.
-- ============================================================================

create index if not exists idx_work_episodes_learner_session
  on learning.work_episodes(learner_id, session_ref, started_at)
  where session_ref is not null;

comment on index learning.idx_work_episodes_learner_session is
  $$Serves the S6 /sessions grouping and the S7 /sessions/:sessionRef filter of
plan 20260902-itera-learning-apps-ux-redesign. There is no sessions table: a
session IS work_episodes grouped by session_ref. Added with the history table
only because ADR-12 makes that PR the round's single crossing of the
db/migrations/** human gate.$$;

-- A new table in the already-exposed `learning` schema (0068): nudge PostgREST
-- to reload its schema cache. No-op when nothing is listening (fresh-apply).
notify pgrst, 'reload schema';
