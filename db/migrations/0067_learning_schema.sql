-- ============================================================================
-- Itera migration 0067 — schema `learning`: the Itera Learning Engine store.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260828-itera-learning-engine-v1, milestone M3, ADR-5.
-- Parent plan: 20260803-itera-learning-control-plane-prototipo (LCPWCI).
--
-- WHAT THIS IS
-- -----------
-- The Learning Engine watches Tainan's real work with coding agents. It ships
-- work episodes from the CLI, extracts evidence from them, reduces the evidence
-- into a learner state, and generates activities. This migration creates the
-- nine tables that hold all of it.
--
-- WHY A NEW SCHEMA AND NOT MORE TABLES IN `itera` (ADR-5)
-- ------------------------------------------------------
-- The engine's tables version at a different rhythm than the player's content
-- tables. A separate schema keeps the two rhythms apart. The migration door
-- does not change: this file is in db/migrations/, a code owner merges it, and
-- db-apply applies it. One door, as before.
--
-- WHY THE LEARNER KEY IS itera.users.id AND NOT auth.uid()
-- -------------------------------------------------------
-- Every Itera surface resolves identity by the chain
-- JWT.sub -> itera.identities.provider_subject -> itera.users.id, through the
-- SECURITY DEFINER helper itera.current_itera_user_id() from migration 0002.
-- A second key would be a second answer to "who is this", and the two would
-- drift. So `learning.learners.id` IS `itera.users.id`, and every policy below
-- calls the same helper the rest of the database calls.
--
-- ⚠️ CONSEQUENCE FOR THE ENGINE: a learner row must exist before any other
-- row. The learners table is the one place the chain is written down, so the
-- ingest path upserts `learning.learners` first, then writes episodes.
--
-- APPEND-ONLY, AND WHERE IT STOPS
-- -------------------------------
-- `work_episodes`, `evidence` and `activity_responses` hold RECORDS OF THINGS
-- THAT HAPPENED. `authenticated` gets INSERT and SELECT on them and nothing
-- else — the same posture itera.activity_traces took in migration 0034, and
-- for the same reason: an account of the past that can be edited is not an
-- account. A wrong evidence row is corrected by writing a `weakens` row, not by
-- rewriting history.
--
-- `learner_state` is the deliberate exception, and it is stated rather than
-- implied. The state is DERIVED — a deterministic reducer recomputes it from
-- evidence. In v1 the engine runs that reducer with the LEARNER'S OWN JWT
-- (plan ADR-2: no new credential, no service_role in a user-invoked path), so
-- the learner's role must be able to write the derived row. The trade is real:
-- a learner holding their own token could write a state row the reducer would
-- not have produced. What limits the damage is that the row is REPRODUCIBLE —
-- it carries `reducer_version` and `inputs`, so re-running the reducer over the
-- append-only evidence detects and overwrites any hand-made value. The state is
-- a cache with a receipt, not a source of truth. When the engine gets its own
-- identity, the fix is to revoke INSERT/UPDATE here; nothing else changes.
--
-- CROSS-LEARNER WRITES ARE BLOCKED STRUCTURALLY, NOT BY POLICY ALONE
-- -----------------------------------------------------------------
-- RLS `with check (learner_id = itera.current_itera_user_id())` proves the ROW
-- is mine. It says nothing about what the row POINTS AT. A foreign-key check
-- runs inside the system and does not consult RLS, so a plain
-- `claim_id references learning.claims(id)` would happily accept another
-- learner's claim id — invisible to the writer, and silently corrupting the
-- evidence of somebody else's objective.
--
-- So every child carries `learner_id` and references its parent by the PAIR
-- (parent_id, learner_id) against a unique index on (id, learner_id). The
-- database then refuses the cross-learner reference outright. Structural, so no
-- future query author has to remember it — the same argument migration 0066
-- made for test-identity isolation.
--
-- `checkpoints` is the one child WITHOUT `learner_id`: it is owned through its
-- episode. The LCPWCI bridge writes it knowing the episode and nothing else,
-- and a `learner_id` there would be a second copy of a fact the episode already
-- holds. Its policy joins to work_episodes instead.
--
-- ⚠️ ONE TRAP THE PAIR-FK CARRIES, and how it is disarmed. A plain
-- `ON DELETE SET NULL` on a two-column foreign key nulls BOTH columns, and
-- `learner_id` is NOT NULL — so deleting an episode would abort with a
-- constraint violation instead of orphaning the evidence. Every such reference
-- therefore names the column to null: `ON DELETE SET NULL (episode_id)`. That
-- spelling is PostgreSQL 15 and later; the ITERA project runs 17.6 and
-- db-migration-check pins the same major, so it is available on both.
--
-- WHY `activities.kind` IS `text` AND NOT itera.activity_kind (ADR-5)
-- ------------------------------------------------------------------
-- A generated activity never enters `itera.activities`. Binding it to the enum
-- would mean an `ALTER TYPE ... ADD VALUE` — which needs `-- itera:no-
-- transaction`, cannot be undone, and needs a human merge — every time the
-- engine invents a kind. `spec` is validated against @iterahq/activity-spec
-- with parseActivitySpec BEFORE the insert; the check constraint here only
-- asserts the shape the database can see.
--
-- ⚠️ MEASURED, NOT ASSUMED: `itera.activity_traces.activity_id` IS A HARD FK.
-- Read from production 2026-08-28 (read-only, admin path):
--   activity_traces_activity_id_fkey
--     FOREIGN KEY (activity_id) REFERENCES itera.activities(id) ON DELETE CASCADE
--   and pg_attribute.attnotnull = true on that column.
-- So an activity that lives only in `learning.activities` CANNOT have an
-- attempt trace in `itera.activity_traces`. This migration does not weaken that
-- FK. Attempts on generated activities are recorded in
-- `learning.activity_responses`, which is why that table exists at all rather
-- than reusing the itera telemetry. There is still no second telemetry
-- pipeline: activities RENDERED BY ITERA keep writing itera.activity_traces
-- unchanged.
--
-- ⚠️ THIS SCHEMA IS INVISIBLE TO THE DRIFT GUARDS, TODAY.
-- db/scripts/census.sql scopes every one of its queries to
-- `n.nspname in ('itera','billing')`. So schema-parity, db-drift and
-- itera.schema_object_census will not see one object created below, and
-- db/census/expected-schema.txt needs no update for this PR to pass. That is
-- convenient and it is also a hole: nothing would notice a `learning` policy
-- disappearing. Extending the census to `learning` needs
-- `schema-parity.sh update` run against a throwaway from-zero build, which is a
-- change to the census baseline and belongs in its own PR. Named in the PR
-- body, not left implied.
--
-- ⚠️ POSTGREST DOES NOT EXPOSE THIS SCHEMA, TODAY. Read from production
-- 2026-08-28: `authenticator` carries
-- `pgrst.db_schemas=public, graphql_public, itera`. The dashboard reads the
-- Supabase client directly (plan ADR-2), so `learning` must be added to that
-- list before any browser can read these tables. That setting is Supabase
-- project configuration, not migration DDL — putting it in a migration would
-- fight the dashboard for ownership of the value. It is a Tainan step, named in
-- the PR body.
-- ============================================================================

create schema if not exists learning;

comment on schema learning is
  $$Itera Learning Engine store (plan 20260828-itera-learning-engine-v1, ADR-5).

Work episodes captured from coding-agent CLIs, the evidence extracted from them,
the objectives and claims that evidence is about, the derived learner state, the
activities the engine generates, and the checkpoint decisions.

Learner identity is itera.users.id, resolved by itera.current_itera_user_id().
Player content stays in schema `itera`; this schema versions on its own rhythm.$$;

-- `authenticated` needs USAGE to reach anything below; the per-table grants at
-- the end decide what it may actually do. `anon` gets nothing: there is no
-- anonymous reader of a person's work history, and migration 0063 is the record
-- of what happens when a grant nobody meant to make is left standing.
grant usage on schema learning to authenticated;
revoke all on schema learning from anon;

-- ---------------------------------------------------------------------------
-- learners — the one place the identity chain is written down.
-- ---------------------------------------------------------------------------
create table if not exists learning.learners (
  id           uuid primary key references itera.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table learning.learners is
  $$One row per person the engine follows. `id` IS itera.users.id — the same key
every other Itera table uses, resolved by itera.current_itera_user_id().

The ingest path upserts this row before writing an episode, because every other
table in this schema references it.$$;

-- ---------------------------------------------------------------------------
-- learning_objectives — what the learner is trying to become able to do.
-- ---------------------------------------------------------------------------
create table if not exists learning.learning_objectives (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references learning.learners(id) on delete cascade,
  title       text not null,
  description text,
  scope_kind  text not null default 'global',
  scope_value jsonb,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table learning.learning_objectives
  drop constraint if exists learning_objectives_scope_kind_known;
alter table learning.learning_objectives
  add constraint learning_objectives_scope_kind_known
  check (scope_kind in ('global','project','domain','time_range'));

alter table learning.learning_objectives
  drop constraint if exists learning_objectives_status_known;
alter table learning.learning_objectives
  add constraint learning_objectives_status_known
  check (status in ('active','paused','achieved','archived'));

-- The scope VALUE stays open on purpose: {repos:[...]} for `project`,
-- {domain:...} for `domain`, {from,to} for `time_range`. The vocabulary grows in
-- TypeScript, not in a migration.
alter table learning.learning_objectives
  drop constraint if exists learning_objectives_scope_value_object;
alter table learning.learning_objectives
  add constraint learning_objectives_scope_value_object
  check (scope_value is null or jsonb_typeof(scope_value) = 'object');

alter table learning.learning_objectives
  drop constraint if exists learning_objectives_title_present;
alter table learning.learning_objectives
  add constraint learning_objectives_title_present
  check (length(btrim(title)) > 0);

-- The target of every child's composite foreign key. See the header.
create unique index if not exists uq_learning_objectives_id_learner
  on learning.learning_objectives(id, learner_id);

create index if not exists idx_learning_objectives_learner_status
  on learning.learning_objectives(learner_id, status);

comment on table learning.learning_objectives is
  $$A Learning Objective: what the learner is trying to become able to do
("Harness Evaluation"). Scope decides which work counts as relevant to it.$$;

-- ---------------------------------------------------------------------------
-- claims — the capabilities an objective decomposes into.
-- ---------------------------------------------------------------------------
create table if not exists learning.claims (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null,
  learner_id   uuid not null references learning.learners(id) on delete cascade,
  title        text not null,
  description  text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

alter table learning.claims
  drop constraint if exists claims_objective_same_learner;
alter table learning.claims
  add constraint claims_objective_same_learner
  foreign key (objective_id, learner_id)
  references learning.learning_objectives(id, learner_id) on delete cascade;

alter table learning.claims
  drop constraint if exists claims_title_present;
alter table learning.claims
  add constraint claims_title_present
  check (length(btrim(title)) > 0);

create unique index if not exists uq_claims_id_learner
  on learning.claims(id, learner_id);

create index if not exists idx_claims_objective
  on learning.claims(objective_id, sort_order);

comment on table learning.claims is
  $$A Claim / Capability: one thing the learner either can or cannot do yet
("define evaluation criteria"). Evidence attaches here, not to the objective —
the objective is too coarse to be either supported or weakened by one episode.$$;

-- ---------------------------------------------------------------------------
-- work_episodes — the raw unit of captured work.
-- ---------------------------------------------------------------------------
create table if not exists learning.work_episodes (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid not null references learning.learners(id) on delete cascade,
  source          text not null,
  machine         text,
  session_ref     text,
  project_ref     text,
  started_at      timestamptz,
  ended_at        timestamptz,
  user_prompt     text,
  agent_summary   text,
  payload         jsonb not null default '{}'::jsonb,
  schema_version  smallint not null default 1,
  ingest_batch_id uuid,
  created_at      timestamptz not null default now()
);

alter table learning.work_episodes
  drop constraint if exists work_episodes_source_present;
alter table learning.work_episodes
  add constraint work_episodes_source_present
  check (length(btrim(source)) > 0);

alter table learning.work_episodes
  drop constraint if exists work_episodes_payload_object;
alter table learning.work_episodes
  add constraint work_episodes_payload_object
  check (jsonb_typeof(payload) = 'object');

alter table learning.work_episodes
  drop constraint if exists work_episodes_schema_version_known;
alter table learning.work_episodes
  add constraint work_episodes_schema_version_known
  check (schema_version >= 1);

create unique index if not exists uq_work_episodes_id_learner
  on learning.work_episodes(id, learner_id);

-- IDEMPOTENCY KEY, and the reason the shipper can retry without lying.
-- The spool is append-only and the shipper retries with backoff, so the same
-- batch reaches the engine more than once by design. The insert is
-- `on conflict do nothing` against this index. It works only because
-- `started_at` is stamped by the HOOK, on the learner's machine, and carried
-- through the spool — a now()-at-write-time anchor would differ on every retry
-- and this index would never fire. Same reasoning as
-- uq_activity_traces_attempt in migration 0034.
-- Partial, because a line that lost its session ref is still worth storing; it
-- just cannot be de-duplicated.
create unique index if not exists uq_work_episodes_ingest
  on learning.work_episodes(learner_id, source, session_ref, started_at)
  where session_ref is not null and started_at is not null;

create index if not exists idx_work_episodes_learner_started
  on learning.work_episodes(learner_id, started_at desc);

comment on table learning.work_episodes is
  $$One bounded stretch of work with a coding agent: the prompt that opened it,
the agent's final summary, and a normalized payload.

Captured by hook scripts that append one NDJSON line to a local spool and exit;
an async shipper posts them. `schema_version` versions the ENVELOPE so later
layers can be derived by reprocessing rather than by a migration (LCPWCI ADR-2:
store raw generously, derive later).

APPEND-ONLY for `authenticated`: INSERT and SELECT, no UPDATE, no DELETE.$$;

-- ---------------------------------------------------------------------------
-- activities — pedagogical activity instances the engine generates.
-- ---------------------------------------------------------------------------
create table if not exists learning.activities (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid not null references learning.learners(id) on delete cascade,
  claim_id     uuid,
  episode_id   uuid,
  kind         text not null,
  spec         jsonb not null,
  intent       text not null default 'pedagogical',
  status       text not null default 'pending',
  generated_by jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table learning.activities
  drop constraint if exists activities_claim_same_learner;
alter table learning.activities
  add constraint activities_claim_same_learner
  foreign key (claim_id, learner_id)
  references learning.claims(id, learner_id) on delete set null (claim_id);

alter table learning.activities
  drop constraint if exists activities_episode_same_learner;
alter table learning.activities
  add constraint activities_episode_same_learner
  foreign key (episode_id, learner_id)
  references learning.work_episodes(id, learner_id) on delete set null (episode_id);

-- `kind` is deliberately text, not itera.activity_kind (header). The shape is
-- still asserted, so a typo does not become a row nothing can render.
alter table learning.activities
  drop constraint if exists activities_kind_shape;
alter table learning.activities
  add constraint activities_kind_shape
  check (kind ~ '^[a-z][a-z0-9_]*$' and length(kind) <= 64);

alter table learning.activities
  drop constraint if exists activities_spec_object;
alter table learning.activities
  add constraint activities_spec_object
  check (jsonb_typeof(spec) = 'object');

alter table learning.activities
  drop constraint if exists activities_intent_known;
alter table learning.activities
  add constraint activities_intent_known
  check (intent in ('pedagogical','operational','decision'));

alter table learning.activities
  drop constraint if exists activities_status_known;
alter table learning.activities
  add constraint activities_status_known
  check (status in ('pending','shown','answered','skipped','deferred','expired'));

create unique index if not exists uq_activities_id_learner
  on learning.activities(id, learner_id);

create index if not exists idx_activities_learner_status
  on learning.activities(learner_id, status, created_at desc);

create index if not exists idx_activities_claim
  on learning.activities(claim_id);

comment on table learning.activities is
  $$An activity instance the engine generated for this learner.

`kind` is text, NOT itera.activity_kind: a generated activity never enters
itera.activities, and binding it to the enum would need an irreversible
ALTER TYPE per new kind (plan ADR-5). `spec` is validated with parseActivitySpec
from @iterahq/activity-spec before the insert.

`intent` carries the semantics of ONE interaction primitive (plan ADR-6):
pedagogical (teach), operational (get work done), decision (ask the human).$$;

-- ---------------------------------------------------------------------------
-- activity_responses — what the learner did with an activity.
-- ---------------------------------------------------------------------------
create table if not exists learning.activity_responses (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null,
  learner_id   uuid not null references learning.learners(id) on delete cascade,
  response     jsonb not null,
  correct      boolean,
  surface      text,
  responded_at timestamptz not null default now()
);

alter table learning.activity_responses
  drop constraint if exists activity_responses_activity_same_learner;
alter table learning.activity_responses
  add constraint activity_responses_activity_same_learner
  foreign key (activity_id, learner_id)
  references learning.activities(id, learner_id) on delete cascade;

alter table learning.activity_responses
  drop constraint if exists activity_responses_response_object;
alter table learning.activity_responses
  add constraint activity_responses_response_object
  check (jsonb_typeof(response) = 'object');

create unique index if not exists uq_activity_responses_id_learner
  on learning.activity_responses(id, learner_id);

create index if not exists idx_activity_responses_activity
  on learning.activity_responses(activity_id);

create index if not exists idx_activity_responses_learner_time
  on learning.activity_responses(learner_id, responded_at desc);

comment on table learning.activity_responses is
  $$The learner's completion of a generated activity: option ids, free text,
whatever the kind's completion detail carries.

This exists INSTEAD OF writing itera.activity_traces for generated activities,
because itera.activity_traces.activity_id is a NOT NULL foreign key to
itera.activities and a generated activity has no row there (measured
2026-08-28). Activities rendered by Itera itself keep writing
itera.activity_traces unchanged — there is no second telemetry pipeline for
them.

APPEND-ONLY for `authenticated`: INSERT and SELECT.$$;

-- ---------------------------------------------------------------------------
-- evidence — what the work showed about a claim.
-- ---------------------------------------------------------------------------
create table if not exists learning.evidence (
  id                   uuid primary key default gen_random_uuid(),
  claim_id             uuid not null,
  learner_id           uuid not null references learning.learners(id) on delete cascade,
  episode_id           uuid,
  activity_response_id uuid,
  observed             text not null,
  actor                text not null,
  direction            text not null,
  strength             text not null,
  confidence           numeric,
  provenance           jsonb not null,
  created_at           timestamptz not null default now()
);

alter table learning.evidence
  drop constraint if exists evidence_claim_same_learner;
alter table learning.evidence
  add constraint evidence_claim_same_learner
  foreign key (claim_id, learner_id)
  references learning.claims(id, learner_id) on delete cascade;

alter table learning.evidence
  drop constraint if exists evidence_episode_same_learner;
alter table learning.evidence
  add constraint evidence_episode_same_learner
  foreign key (episode_id, learner_id)
  references learning.work_episodes(id, learner_id) on delete set null (episode_id);

alter table learning.evidence
  drop constraint if exists evidence_response_same_learner;
alter table learning.evidence
  add constraint evidence_response_same_learner
  foreign key (activity_response_id, learner_id)
  references learning.activity_responses(id, learner_id)
  on delete set null (activity_response_id);

-- THE CORE DISTINCTION OF THE WHOLE PRODUCT, as a constraint.
-- "the agent did X" is not "the learner knows X". `actor` is NOT NULL and has
-- no default, so the extractor must decide every time.
alter table learning.evidence
  drop constraint if exists evidence_actor_known;
alter table learning.evidence
  add constraint evidence_actor_known
  check (actor in ('learner','agent','mixed','unknown'));

alter table learning.evidence
  drop constraint if exists evidence_direction_known;
alter table learning.evidence
  add constraint evidence_direction_known
  check (direction in ('supports','weakens','neutral'));

alter table learning.evidence
  drop constraint if exists evidence_strength_known;
alter table learning.evidence
  add constraint evidence_strength_known
  check (strength in ('weak','medium','strong'));

alter table learning.evidence
  drop constraint if exists evidence_confidence_range;
alter table learning.evidence
  add constraint evidence_confidence_range
  check (confidence is null or (confidence >= 0 and confidence <= 1));

-- Provenance is what makes a state row auditable back to a model run. An empty
-- object is not provenance, so the shape is asserted here.
alter table learning.evidence
  drop constraint if exists evidence_provenance_object;
alter table learning.evidence
  add constraint evidence_provenance_object
  check (jsonb_typeof(provenance) = 'object' and provenance <> '{}'::jsonb);

alter table learning.evidence
  drop constraint if exists evidence_observed_present;
alter table learning.evidence
  add constraint evidence_observed_present
  check (length(btrim(observed)) > 0);

create index if not exists idx_evidence_claim
  on learning.evidence(claim_id, created_at desc);

create index if not exists idx_evidence_learner_time
  on learning.evidence(learner_id, created_at desc);

create index if not exists idx_evidence_episode
  on learning.evidence(episode_id);

comment on table learning.evidence is
  $$One observation about one claim, from one episode or one activity response.

`actor` carries the distinction the whole product rests on: "the agent did X"
does not mean "the learner knows X". It is NOT NULL with no default, so the
extractor decides every time rather than inheriting a value.

`direction` lets evidence WEAKEN a claim, which is how a wrong reading is
corrected: by writing the counter-observation, never by editing the record.

APPEND-ONLY for `authenticated`: INSERT and SELECT.$$;

comment on column learning.evidence.provenance is
  $${extractor, model, version, input_refs} — what produced this row. Without it
a learner_state level is an opinion; with it the level is traceable to a model
run over named inputs.$$;

-- ---------------------------------------------------------------------------
-- learner_state — derived, materialized, and explainable.
-- ---------------------------------------------------------------------------
create table if not exists learning.learner_state (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid not null references learning.learners(id) on delete cascade,
  claim_id        uuid not null,
  level           text not null default 'unknown',
  evidence_count  int not null default 0,
  reducer_version text not null,
  inputs          jsonb not null,
  computed_at     timestamptz not null default now()
);

alter table learning.learner_state
  drop constraint if exists learner_state_claim_same_learner;
alter table learning.learner_state
  add constraint learner_state_claim_same_learner
  foreign key (claim_id, learner_id)
  references learning.claims(id, learner_id) on delete cascade;

-- `unknown` is the DEFAULT, which is what keeps it distinct from
-- "does not know". A learner with no evidence is unknown; a learner with
-- weakening evidence is `weak`. The reducer never writes `unknown` as a
-- conclusion.
alter table learning.learner_state
  drop constraint if exists learner_state_level_known;
alter table learning.learner_state
  add constraint learner_state_level_known
  check (level in ('unknown','weak','intermediate','strong'));

alter table learning.learner_state
  drop constraint if exists learner_state_evidence_count_sane;
alter table learning.learner_state
  add constraint learner_state_evidence_count_sane
  check (evidence_count >= 0);

alter table learning.learner_state
  drop constraint if exists learner_state_reducer_version_present;
alter table learning.learner_state
  add constraint learner_state_reducer_version_present
  check (length(btrim(reducer_version)) > 0);

-- `inputs` is the receipt: the evidence ids and weights that produced `level`.
-- An object, and not an empty one — a state row nobody can explain is exactly
-- what the hybrid design exists to prevent.
alter table learning.learner_state
  drop constraint if exists learner_state_inputs_object;
alter table learning.learner_state
  add constraint learner_state_inputs_object
  check (jsonb_typeof(inputs) = 'object' and inputs <> '{}'::jsonb);

-- One state row per (learner, claim). The reducer upserts against this.
create unique index if not exists uq_learner_state_learner_claim
  on learning.learner_state(learner_id, claim_id);

comment on table learning.learner_state is
  $$The current level of one claim for one learner: materialized AND explainable
(plan ADR-5).

A deterministic rule-based reducer recomputes the row from
learning.evidence. `reducer_version` and `inputs` are the receipt: re-running
that version over those inputs must reproduce `level`. This is a CACHE WITH A
RECEIPT, not a source of truth — the evidence is the truth.

⚠️ `authenticated` holds INSERT and UPDATE here, unlike every other derived
thing in this database, because in v1 the engine runs the reducer with the
learner's own JWT (plan ADR-2 — no new credential). Revoking those two grants is
the whole change when the engine gets its own identity.$$;

-- ---------------------------------------------------------------------------
-- checkpoints — the home LCPWCI's checkpoint decision never had.
-- ---------------------------------------------------------------------------
create table if not exists learning.checkpoints (
  id               uuid primary key default gen_random_uuid(),
  episode_id       uuid not null references learning.work_episodes(id) on delete cascade,
  question         text not null,
  options          jsonb not null default '[]'::jsonb,
  chosen_option_id text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table learning.checkpoints
  drop constraint if exists checkpoints_options_array;
alter table learning.checkpoints
  add constraint checkpoints_options_array
  check (jsonb_typeof(options) = 'array');

alter table learning.checkpoints
  drop constraint if exists checkpoints_question_present;
alter table learning.checkpoints
  add constraint checkpoints_question_present
  check (length(btrim(question)) > 0);

-- A decision has both halves or neither. A `chosen_option_id` with no
-- `decided_at` is a row that cannot be ordered in time, and a `decided_at` with
-- no choice is a decision nobody made.
alter table learning.checkpoints
  drop constraint if exists checkpoints_decision_complete;
alter table learning.checkpoints
  add constraint checkpoints_decision_complete
  check ((chosen_option_id is null) = (decided_at is null));

create index if not exists idx_checkpoints_episode
  on learning.checkpoints(episode_id, created_at desc);

comment on table learning.checkpoints is
  $$A blocking checkpoint put to the learner mid-session, and the decision they
made.

This answers the open blocking question of plan
20260803-itera-learning-control-plane-prototipo (LCPWCI v15, section 3): the
checkpoint DECISION had no home. itera.activity_traces is append-only by design
and the decision belongs to the checkpoint, not to the attempt. So the decision
lands here, and activity_traces keeps its append-only property untouched.

OWNERSHIP: through `episode_id`, not through a `learner_id` column. The
lcpwci-bridge writes this knowing the episode; a learner_id here would be a
second copy of a fact work_episodes already holds. The policy joins.

`chosen_option_id` and `decided_at` are the ONLY columns `authenticated` may
update — a column-level grant, so Postgres refuses the rest rather than a
trigger refusing it later.$$;

-- ============================================================================
-- RLS — owner-scoped on every table, using the same helper the rest of the
-- database uses. `itera.current_itera_user_id()` is SECURITY DEFINER and STABLE
-- (migration 0002) and `authenticated` already holds EXECUTE on it.
--
-- Every policy is FOR ALL with both USING and WITH CHECK. USING alone would let
-- a learner INSERT a row they then could not see — a write nobody can read is
-- worse than a refused write.
-- ============================================================================

alter table learning.learners            enable row level security;
alter table learning.learning_objectives enable row level security;
alter table learning.claims              enable row level security;
alter table learning.work_episodes       enable row level security;
alter table learning.activities          enable row level security;
alter table learning.activity_responses  enable row level security;
alter table learning.evidence            enable row level security;
alter table learning.learner_state       enable row level security;
alter table learning.checkpoints         enable row level security;

drop policy if exists learners_rw_self on learning.learners;
create policy learners_rw_self on learning.learners
  for all using (id = itera.current_itera_user_id())
  with check (id = itera.current_itera_user_id());

drop policy if exists objectives_rw_self on learning.learning_objectives;
create policy objectives_rw_self on learning.learning_objectives
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists claims_rw_self on learning.claims;
create policy claims_rw_self on learning.claims
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists episodes_rw_self on learning.work_episodes;
create policy episodes_rw_self on learning.work_episodes
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists activities_rw_self on learning.activities;
create policy activities_rw_self on learning.activities
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists activity_responses_rw_self on learning.activity_responses;
create policy activity_responses_rw_self on learning.activity_responses
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists evidence_rw_self on learning.evidence;
create policy evidence_rw_self on learning.evidence
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists learner_state_rw_self on learning.learner_state;
create policy learner_state_rw_self on learning.learner_state
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

-- Owned through the episode. The subquery is itself RLS-filtered, which is
-- harmless: a learner can read their own episodes, and reading somebody else's
-- returns nothing either way.
drop policy if exists checkpoints_rw_own_episode on learning.checkpoints;
create policy checkpoints_rw_own_episode on learning.checkpoints
  for all using (
    exists (
      select 1 from learning.work_episodes e
       where e.id = checkpoints.episode_id
         and e.learner_id = itera.current_itera_user_id()
    )
  )
  with check (
    exists (
      select 1 from learning.work_episodes e
       where e.id = checkpoints.episode_id
         and e.learner_id = itera.current_itera_user_id()
    )
  );

-- ============================================================================
-- GRANTS — RLS still applies on top; these only decide which VERBS the role may
-- attempt. The `grant ... on all tables` of migration 0002 does not reach a
-- table created afterwards, and it targets `anon, authenticated` in one block —
-- so every grant here is written out, and every anon revoke with it. Migrations
-- 0063 and 0065 are the record of what a copied grant block costs.
--
-- APPEND-ONLY (INSERT + SELECT only): work_episodes, evidence,
-- activity_responses. See the header.
-- ============================================================================

grant select, insert, update on learning.learners to authenticated;
revoke all on learning.learners from anon;

grant select, insert, update, delete on learning.learning_objectives to authenticated;
revoke all on learning.learning_objectives from anon;

grant select, insert, update, delete on learning.claims to authenticated;
revoke all on learning.claims from anon;

grant select, insert on learning.work_episodes to authenticated;
revoke all on learning.work_episodes from anon;

grant select, insert, update on learning.activities to authenticated;
revoke all on learning.activities from anon;

grant select, insert on learning.activity_responses to authenticated;
revoke all on learning.activity_responses from anon;

grant select, insert on learning.evidence to authenticated;
revoke all on learning.evidence from anon;

-- INSERT + UPDATE here is the v1 trade recorded in the header and on the table
-- comment: the reducer runs with the learner's own JWT.
grant select, insert, update on learning.learner_state to authenticated;
revoke all on learning.learner_state from anon;

-- COLUMN-LEVEL UPDATE. The bridge creates a checkpoint and the learner decides
-- it; nobody rewrites the question after the fact. Postgres enforces the column
-- list itself, so there is no trigger to keep in sync with a policy.
-- The revoke runs first: a table-level UPDATE granted by an earlier run would
-- otherwise still stand and make the column list decorative.
revoke all on learning.checkpoints from anon;
revoke update on learning.checkpoints from authenticated;
grant select, insert on learning.checkpoints to authenticated;
grant update (chosen_option_id, decided_at) on learning.checkpoints to authenticated;
