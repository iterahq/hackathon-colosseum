-- ============================================================================
-- Itera migration 0078 — schema `learning`: MERGE A of the v0.4 remodel.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260903-itera-learning-schema-v04-remodel v4, phase P1, task T4.
--   https://plans.devfellowship.com/20260903-itera-learning-schema-v04-remodel
-- ADRs: 2 (expand/verify/contract), 4 (WorkContext + EpisodeMoment beside
--   work_episodes), 5 amended (11 provenance generated columns), 6 (status
--   written, supersede-at-read still the reader), 8 + 21 (model tables, link
--   tables, scope), 10 + Q12=A (same-row derivations ship in the DDL), 26
--   (project_root), 27 (session_refs), 28 (the regroup drops no evidence row).
--
-- WHAT THIS IS
-- ------------
-- Merge A is the FIRST of four merges. It is ADDITIVE ONLY: every new column is
-- nullable or defaulted, no column is renamed, no column is dropped, no table
-- is dropped. The old capture client, the old engine and the old dashboard keep
-- working unchanged after this file lands. That is the whole safety argument of
-- ADR-2: an additive merge has nothing to be half of.
--
-- It creates six tables and adds ten columns plus eleven generated columns:
--
--   1. learning.work_contexts               the WorkContext node (ADR-4, ADR-26)
--   2. learning.episode_moments             the EpisodeMoment node (ADR-4)
--   3. work_episodes  + work_context_id, grain, agent_version,
--                       session_episode_id, session_refs
--   4. evidence       + status, moment_id, turn_episode_id,
--                     + 11 provenance generated columns (ADR-5 amended)
--   5. learning.evidence_models             the calibration knobs (ADR-8/21)
--      learning.assembly_models             cadence, cap, ttl, ranking (ADR-8/21)
--      learning.evidence_model_objectives   link table, PK on both (ADR-21)
--      learning.assembly_model_objectives   link table, PK on both (ADR-21)
--
-- Two same-row derivations ride inside this file, and they are DDL under ADR-10
-- (confirmed by Tainan, round 1, Q12 = A): `grain = 'turn'` on every row that
-- exists when the column appears, and the `work_context_id` backfill. Both are
-- deterministic functions of columns the row already carries. Neither creates,
-- merges or deletes a row by judgment, so neither needs an actor or a JWT.
-- The regroup of the past into SESSION rows is NOT here — it is merge A2, a
-- separate PR (T21), which inserts rows and therefore carries ADR-24's explicit,
-- one-purpose exception.
--
-- NO ENUM IS CREATED. Every `kind`, `grain`, `scope` and `status` here is
-- `text`, guarded by a CHECK where the value set is product vocabulary and left
-- open where it is an implementation detail that grows (0067's argument for
-- `activities.kind`, 0074 ADR-1's for `concepts.kind`). Block B.6 of the plan
-- asserts `pg_type … typtype='e'` in schema `learning` returns zero rows.
--
-- ⚠️ ONE BLOCK IN HERE IS A JUDGEMENT CALL AND IS MARKED FOR THE GATE:
-- the `project_root` normalisation CTE. Read "THE PROJECT ROOT COLLAPSE" below
-- BEFORE merging — it is measured, it is severe, and ADR-26 says the fix is to
-- edit the CTE, not the rows.
--
-- ============================================================================
-- THE PROJECT ROOT COLLAPSE — read this before merging
-- ============================================================================
-- ADR-26 defines `project_root` as "the top-most ancestor path among the
-- learner's known `project_ref` values". This file implements exactly that
-- rule. Measured against production on 2026-09-07 (read-only), it collapses
-- **29 (learner, project_ref) pairs into 5 (learner, project_root) pairs**, and
-- into **6 work_contexts rows** once `machine` and `machine_class` join the key:
--
--   learner 1e5a270e  15 refs -> /Users/tainanfidelis          (386 episodes)
--   learner af6b18e6  11 refs -> /root                         (446 episodes)
--   learner af6b18e6   1 ref  -> /tmp/bcd-verify/repo            (2 episodes)
--   learner a153605c   3 refs -> /root                           (6 episodes)
--   learner a153605c   1 ref  -> /home/user/proj                 (2 episodes)
--
-- The rule is correct as written and it over-collapses, because two learners
-- ran the agent from a bare home directory once. `/Users/tainanfidelis` is
-- itself a `project_ref` (5 episodes), so it swallows `podsfinance`,
-- `rivool-monorepo`, `deframe-api` and `gestorai` into ONE project. `/root` does
-- the same to eleven unrelated repos and skills.
--
-- Alternative normalisations, measured on the same data:
--
--   raw project_ref, no normalisation           29 roots  (T10: fragments)
--   ancestor must have >= 4 path segments       21 roots
--   ancestor must have >= 3 path segments       16 roots
--   ADR-26 as written (this file)                5 roots
--
-- WHY IT SHIPS AS WRITTEN ANYWAY, and what it costs if it is wrong:
--   * `work_contexts` is a NEW table and `work_episodes.work_context_id` is
--     NULLABLE. Nothing reads either one today. A wrong grouping here changes
--     no verdict, no state row and no rendered page.
--   * The repair is a later migration that re-derives the column. No row loses
--     its id and no evidence row is touched.
--   * The consumer that WOULD be hurt is merge A2, the regroup, which runs the
--     gap rule on `(learner_id, project_root)`. A2 is a SEPARATE PR (T21) and it
--     has not been opened. There is time to change the CTE first.
-- Editing the `project_root_rule` CTE below (one `WHERE` clause) is the whole
-- change. ADR-26 anticipated exactly this: "A wrong collapse is visible in the
-- PR body table and is fixed by editing the CTE, not the rows."
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. learning.work_contexts — the WorkContext node.
--
-- Extracted from the flat columns work_episodes already carries. The original
-- `project_ref`, `machine` and `machine_class` columns STAY on work_episodes
-- (ADR-4): the v1 capture client keeps writing them and retiring them is a
-- client release, which is outside this plan.
--
-- `project_root` is the normalised project (ADR-26) and is the key. The raw
-- `cwd` of the first row that produced the context is kept as `project_ref`,
-- as an attribute, so the mapping stays auditable after the fact.
-- ---------------------------------------------------------------------------
create table if not exists learning.work_contexts (
  id            uuid primary key default gen_random_uuid(),
  learner_id    uuid not null references learning.learners(id) on delete cascade,

  -- The normalised project. NOT NULL: a context with no project is not a
  -- context, and the backfill below simply skips an episode whose project_ref
  -- is null rather than inventing a root for it (measured 2026-09-07: zero
  -- such episodes exist).
  project_root  text not null,

  -- The raw `cwd` of the first episode that produced this context. Kept as
  -- data, never as a key.
  project_ref   text,

  machine       text,
  machine_class text not null default 'human',
  created_at    timestamptz not null default now()
);

alter table learning.work_contexts
  drop constraint if exists work_contexts_project_root_present;
alter table learning.work_contexts
  add constraint work_contexts_project_root_present
  check (length(btrim(project_root)) > 0);

alter table learning.work_contexts
  drop constraint if exists work_contexts_machine_class_present;
alter table learning.work_contexts
  add constraint work_contexts_machine_class_present
  check (length(btrim(machine_class)) > 0);

-- THE IDENTITY OF A CONTEXT (ADR-26). `nulls not distinct` is load-bearing and
-- not decoration: `machine` is nullable, and under the default NULLS DISTINCT
-- two rows with a null machine would both be accepted, so the engine's
-- insert-or-find would create a new context on every ingest of a machine-less
-- episode. PostgreSQL 15+; the ITERA project runs 17.6 and db-migration-check
-- pins the same major.
create unique index if not exists uq_work_contexts_identity
  on learning.work_contexts(learner_id, project_root, machine, machine_class)
  nulls not distinct;

-- The pair-FK target (0067's rule): every child references its parent by
-- (parent_id, learner_id) so a cross-learner reference is refused structurally,
-- because a foreign-key check does not consult RLS.
create unique index if not exists uq_work_contexts_id_learner
  on learning.work_contexts(id, learner_id);

comment on table learning.work_contexts is
  $$The WorkContext node of the v0.4 ontology: one row per
(learner, project_root, machine, machine_class) the learner has worked in.

Extracted from learning.work_episodes' flat columns, not copied out of them --
work_episodes keeps project_ref, machine and machine_class, and the v1 capture
client keeps writing them (ADR-4).

`project_root` is the NORMALISED project (ADR-26), the top-most ancestor path
among the learner's known project_ref values. `project_ref` is the raw cwd of
the first episode that produced the context, kept so the normalisation stays
auditable. The session gap rule of merge A2 runs on (learner_id, project_root),
never on the raw cwd.$$;

comment on column learning.work_contexts.project_root is
  $$The normalised project. ADR-26: the top-most ancestor path among the
learner's known project_ref values, or the git root once the v2 capture client
sends one explicitly. Measured 2026-09-07, this rule collapses 29 raw
(learner, project_ref) pairs into 5 (learner, project_root) pairs; see the
migration header, "THE PROJECT ROOT COLLAPSE".$$;

alter table learning.work_contexts enable row level security;

drop policy if exists work_contexts_rw_self on learning.work_contexts;
create policy work_contexts_rw_self on learning.work_contexts
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists work_contexts_read_operator on learning.work_contexts;
create policy work_contexts_read_operator on learning.work_contexts
  for select using (itera.is_learning_operator());

-- 0002's blanket grant does not reach a table created afterwards, so both lines
-- are written out (0067's rule). `anon` gets nothing.
-- SELECT + INSERT only: the engine resolves a context by insert-or-find on
-- ingest and never edits one. A context that becomes wrong is replaced, not
-- rewritten -- the same argument work_episodes makes for being append-only.
grant select, insert on learning.work_contexts to authenticated;
revoke all on learning.work_contexts from anon;


-- ---------------------------------------------------------------------------
-- 2. learning.episode_moments — the EpisodeMoment node.
--
-- A moment inside an episode: a turn, a decision, whatever the vocabulary grows
-- to. `kind` is text and is DELIBERATELY NOT bound to a set -- a new moment kind
-- is an extractor change, and binding it would push a human-gated migration in
-- front of every one (0067's argument for activities.kind).
--
-- Merge A creates it EMPTY. Merge A2 inserts one `turn` moment per existing
-- work_episodes row; from T14 the extractor writes moments as it reads.
-- ---------------------------------------------------------------------------
create table if not exists learning.episode_moments (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null,
  learner_id  uuid not null references learning.learners(id) on delete cascade,
  kind        text not null,
  at          timestamptz not null,

  -- The agent's own session id for the turn this moment came from. Data, never
  -- identity (ADR-27). Nullable: a moment the extractor invents from a digest
  -- has no session ref.
  session_ref text,

  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table learning.episode_moments
  drop constraint if exists episode_moments_episode_same_learner;
alter table learning.episode_moments
  add constraint episode_moments_episode_same_learner
  foreign key (episode_id, learner_id)
  references learning.work_episodes(id, learner_id) on delete cascade;

alter table learning.episode_moments
  drop constraint if exists episode_moments_kind_present;
alter table learning.episode_moments
  add constraint episode_moments_kind_present
  check (length(btrim(kind)) > 0 and length(kind) <= 64);

alter table learning.episode_moments
  drop constraint if exists episode_moments_payload_object;
alter table learning.episode_moments
  add constraint episode_moments_payload_object
  check (jsonb_typeof(payload) = 'object');

create unique index if not exists uq_episode_moments_id_learner
  on learning.episode_moments(id, learner_id);

-- The one read every consumer does: the moments of one episode, in order.
create index if not exists idx_episode_moments_episode
  on learning.episode_moments(episode_id, at);

comment on table learning.episode_moments is
  $$The EpisodeMoment node of the v0.4 ontology: one row per moment inside a
work episode. `kind` is text and unbound on purpose -- today `turn`, later
`decision` and whatever the extractor learns to name.

STARTS EMPTY. Merge A2 (plan task T21) inserts one `turn` moment per existing
work_episodes row when it regroups the past into sessions; the extractor writes
moments from T14 on. Until then every consumer renders the absence.

`checkpoints` is dropped in merge D (ADR-20): what it meant to hold is a
`decision` moment here, with its four typed fields in `payload`.$$;

alter table learning.episode_moments enable row level security;

drop policy if exists episode_moments_rw_self on learning.episode_moments;
create policy episode_moments_rw_self on learning.episode_moments
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists episode_moments_read_operator on learning.episode_moments;
create policy episode_moments_read_operator on learning.episode_moments
  for select using (itera.is_learning_operator());

grant select, insert on learning.episode_moments to authenticated;
revoke all on learning.episode_moments from anon;


-- ---------------------------------------------------------------------------
-- 3. learning.work_episodes — five new columns, all nullable or defaulted.
-- ---------------------------------------------------------------------------

alter table learning.work_episodes
  add column if not exists work_context_id uuid;

-- Nulling by name is required, not stylistic: a plain `on delete set null` on a
-- two-column FK nulls BOTH columns, and `learner_id` is NOT NULL, so deleting a
-- context would abort instead of orphaning the episode (0067's disarming).
alter table learning.work_episodes
  drop constraint if exists work_episodes_context_same_learner;
alter table learning.work_episodes
  add constraint work_episodes_context_same_learner
  foreign key (work_context_id, learner_id)
  references learning.work_contexts(id, learner_id)
  on delete set null (work_context_id);

-- `agent_version` — T11 measured that POST /v1/episodes already parses the
-- client's agent_version and episodeToRow() DROPS it. This column is where it
-- lands. The PROTOCOL version is NOT here: it is the existing `schema_version`
-- column, and this plan adds no second one.
alter table learning.work_episodes
  add column if not exists agent_version text;

-- The regroup's two columns (ADR-24, ADR-27). NULL on every row until merge A2.
alter table learning.work_episodes
  add column if not exists session_episode_id uuid;

alter table learning.work_episodes
  drop constraint if exists work_episodes_session_same_learner;
alter table learning.work_episodes
  add constraint work_episodes_session_same_learner
  foreign key (session_episode_id, learner_id)
  references learning.work_episodes(id, learner_id)
  on delete set null (session_episode_id);

alter table learning.work_episodes
  add column if not exists session_refs text[];

-- ── grain, and the one-shot derivation that fills it ────────────────────────
-- T10 measured every existing row as a TURN: packages/protocol/src/episode.ts
-- says "A work episode: one user prompt and the turn that answered it", and all
-- payloads carry exactly one `prompt` and one `turn_end` (median duration 62 s).
-- So every row that exists when this column appears takes 'turn'.
--
-- The UPDATE is guarded by "did the column just appear", NOT by
-- `where grain = 'unknown'`. That difference is the whole idempotency argument:
-- a v1 client keeps landing rows with grain 'unknown' AFTER this migration, and
-- a re-run with the naive predicate would relabel them 'turn' -- a silent lie
-- about rows nobody measured. Guarded this way the derivation runs exactly once,
-- at the instant the column is created, and a replay is a no-op.
do $$
begin
  -- pg_catalog, NOT information_schema: information_schema.columns filters by
  -- the caller's privileges, so a role that cannot see the column would read
  -- "absent" and try to add it again. pg_attribute is unfiltered.
  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'learning.work_episodes'::regclass
       and a.attname  = 'grain'
       and a.attnum   > 0
       and not a.attisdropped
  ) then
    alter table learning.work_episodes
      add column grain text not null default 'unknown';

    update learning.work_episodes set grain = 'turn';
  end if;
end $$;

-- `grain` IS bound to a set, unlike `episode_moments.kind`. Three values are the
-- product's vocabulary here, the verification block counts on each of them by
-- name, and a fourth grain would be a design decision rather than an
-- implementation detail (0067's line between `direction` and `activities.kind`).
alter table learning.work_episodes
  drop constraint if exists work_episodes_grain_known;
alter table learning.work_episodes
  add constraint work_episodes_grain_known
  check (grain in ('session', 'turn', 'unknown'));

-- A session row's own session_episode_id must be empty: a session has no parent
-- session, and a self-parent would make the A2 verification count itself.
alter table learning.work_episodes
  drop constraint if exists work_episodes_session_not_self;
alter table learning.work_episodes
  add constraint work_episodes_session_not_self
  check (session_episode_id is null or session_episode_id <> id);

-- Turns of one session are read together (merge A2 and the dashboard follow-up).
create index if not exists idx_work_episodes_session_parent
  on learning.work_episodes(session_episode_id, started_at)
  where session_episode_id is not null;

create index if not exists idx_work_episodes_context
  on learning.work_episodes(work_context_id)
  where work_context_id is not null;

comment on column learning.work_episodes.grain is
  $$What this row IS. `turn` = one prompt and the turn that answered it, which
is what every row captured before 2026-09-07 is (T10, measured). `session` = a
run of consecutive turns of one learner in one project_root with no gap longer
than the session gap parameter (ADR-23); merge A2 inserts those rows. `unknown`
= a row from a v1 client that never declared its grain.

The default is 'unknown' on purpose: a v1 client keeps shipping after this
migration and must not be silently labelled.$$;

comment on column learning.work_episodes.session_episode_id is
  $$The `grain='session'` row this turn belongs to. NULL until merge A2 fills it
(plan task T21), and NULL forever on a session row itself. Turn rows keep their
ids and stay readable: the regroup adds a parent, it does not replace a child.$$;

comment on column learning.work_episodes.session_refs is
  $$The distinct agent `session_ref`s of the turns of a session row (ADR-27).
The agent's session id is a client artefact -- a new terminal, a /clear -- and
it disagrees with the gap rule on the live corpus (7 sessions span more than one
session_ref, 10 session_refs split across sessions; T10). It is kept as data so
the disagreement stays auditable. NOTHING keys on it.$$;

comment on column learning.work_episodes.agent_version is
  $$The capture agent's own version, as reported by the client. NULL on every
row today: POST /v1/episodes already parses it and episodeToRow() drops it
(T11); the engine PR that follows merge A stores it. The PROTOCOL version is
`schema_version`, not this column.$$;


-- ---------------------------------------------------------------------------
-- 4. learning.evidence — status, two links, and eleven provenance columns.
-- ---------------------------------------------------------------------------

-- ── status (ADR-6) ──────────────────────────────────────────────────────────
-- The engine will WRITE 'superseded' at the moment pipeline/supersede.ts would
-- compute it, and supersede-at-read STAYS the reader until `verify-evidence-
-- status` (T5) shows the column and the computation agree on every row. A
-- column that disagrees with the read-time rule on one of 58 rows would change
-- a learner's verdict silently, which is the one thing this schema may not do.
alter table learning.evidence
  add column if not exists status text not null default 'active';

alter table learning.evidence
  drop constraint if exists evidence_status_known;
alter table learning.evidence
  add constraint evidence_status_known
  check (status in ('active', 'superseded'));

-- ── the two new links ───────────────────────────────────────────────────────
-- `moment_id` — the moment this evidence judged. NULL on all pre-existing rows;
-- the extractor fills it from T14 on.
alter table learning.evidence
  add column if not exists moment_id uuid;

alter table learning.evidence
  drop constraint if exists evidence_moment_same_learner;
alter table learning.evidence
  add constraint evidence_moment_same_learner
  foreign key (moment_id, learner_id)
  references learning.episode_moments(id, learner_id)
  on delete set null (moment_id);

-- `turn_episode_id` — the TURN the evidence came from, kept when merge A2
-- re-points `episode_id` at the session row (ADR-28). NULL until A2. The
-- regroup never deletes, merges or re-ranks an evidence row; it moves a key and
-- keeps the old one here, which is what makes the move reversible.
alter table learning.evidence
  add column if not exists turn_episode_id uuid;

alter table learning.evidence
  drop constraint if exists evidence_turn_episode_same_learner;
alter table learning.evidence
  add constraint evidence_turn_episode_same_learner
  foreign key (turn_episode_id, learner_id)
  references learning.work_episodes(id, learner_id)
  on delete set null (turn_episode_id);

create index if not exists idx_evidence_moment
  on learning.evidence(moment_id)
  where moment_id is not null;

create index if not exists idx_evidence_turn_episode
  on learning.evidence(turn_episode_id)
  where turn_episode_id is not null;

-- ── the eleven provenance columns (ADR-5, AMENDED by T1) ────────────────────
-- One STORED generated column per provenance key that has NO existing column.
-- Pure DDL: no UPDATE, no per-learner JWT, no tool, and the column cannot
-- disagree with the jsonb while both exist. Merge D runs
-- `alter column ... drop expression` and then drops the jsonb.
--
-- Every value in `provenance` is a JSON string -- there is no number and no
-- nested object in any of the 58 live rows (T1 §3.1) -- so every column is
-- `text` with no cast.
--
-- ⚠️ `episode_id` AND `activity_response_id` GET NO GENERATED COLUMN. `evidence`
-- already has real `uuid` columns for both, and they are BROADER than the jsonb:
-- 56 rows carry the `episode_id` COLUMN and only 24 carry the jsonb KEY. A
-- generated column would be NULL on 32 rows where the real column holds the
-- truth -- a regression dressed as a migration. Readers use the real column.
-- This is ADR-5 as amended after the T1 field audit.
--
-- Key counts measured in production 2026-09-07, over 58 rows:
--   extractor 58 · prompt_version 58 · activity_id 34 · activity_kind 34
--   source 34 · surface 34 · assessment_method 32 · model 24 · model_version 24
--   relevance_extractor 24 · relevance_model 24
-- Provenance has TWO DISJOINT SHAPES (34 activity-sourced rows, 24
-- episode-sourced rows, sharing only extractor and prompt_version), so "no
-- generated column is NULL" is FALSE BY CONSTRUCTION and is not the check.
-- Block A.5 asserts per-key parity instead:
--   count(*) where <col> is not null  =  count(*) where provenance ? '<key>'.
--
-- None of the eleven names collides with an existing evidence column, so each
-- takes its bare key name (checked against the live catalogue, T1 §5.2; note
-- `source` is a column of work_episodes, NOT of evidence).
alter table learning.evidence
  add column if not exists extractor text
  generated always as (provenance ->> 'extractor') stored;

alter table learning.evidence
  add column if not exists prompt_version text
  generated always as (provenance ->> 'prompt_version') stored;

alter table learning.evidence
  add column if not exists model text
  generated always as (provenance ->> 'model') stored;

alter table learning.evidence
  add column if not exists model_version text
  generated always as (provenance ->> 'model_version') stored;

alter table learning.evidence
  add column if not exists relevance_extractor text
  generated always as (provenance ->> 'relevance_extractor') stored;

alter table learning.evidence
  add column if not exists relevance_model text
  generated always as (provenance ->> 'relevance_model') stored;

alter table learning.evidence
  add column if not exists activity_id text
  generated always as (provenance ->> 'activity_id') stored;

alter table learning.evidence
  add column if not exists activity_kind text
  generated always as (provenance ->> 'activity_kind') stored;

alter table learning.evidence
  add column if not exists source text
  generated always as (provenance ->> 'source') stored;

alter table learning.evidence
  add column if not exists surface text
  generated always as (provenance ->> 'surface') stored;

alter table learning.evidence
  add column if not exists assessment_method text
  generated always as (provenance ->> 'assessment_method') stored;

comment on column learning.evidence.status is
  $$'active' or 'superseded'. Written by the engine at the moment
pipeline/supersede.ts would compute it (ADR-6). The READ path still uses
supersede-at-read until `verify-evidence-status` (plan task T5) proves the
column and the computation agree on every row; only then does the reader switch.$$;

comment on column learning.evidence.turn_episode_id is
  $$The TURN this evidence came from. NULL until merge A2, which re-points
`episode_id` at the session row and records the turn here (ADR-28). Keeping both
is what makes the regroup reversible and what stops a session-grain supersede
from dropping a `supports` that a `neutral` of the same pass landed beside.$$;


-- ---------------------------------------------------------------------------
-- 5. The ECD model tables (ADR-8 as amended by ADR-21).
--
-- `learning.generation_config` is a SINGLETON with 12 knobs. It splits in two:
-- the calibration knobs become an EvidenceModel, the cadence/cap/ttl/ranking
-- knobs become an AssemblyModel. Neither table carries `objective_id`: Tainan
-- answered Q13 that an evidence model updates SEVERAL objectives at once and an
-- assembly model scopes a whole form or module, and a single nullable FK cannot
-- say "these two objectives". Scope is many-to-many through the two link tables
-- below, and A ROW WITH ZERO LINKS IS THE GLOBAL DEFAULT.
--
-- generation_config itself is NOT touched here. It is read-only in the meantime
-- and merge D drops it, after its 3 dashboard + backoffice readers move.
-- ---------------------------------------------------------------------------

create table if not exists learning.evidence_models (
  id                           uuid primary key default gen_random_uuid(),
  title                        text,

  -- The four calibration knobs, types copied from generation_config exactly
  -- (T1 §4.1): numeric, integer, integer, numeric.
  decay_half_life_days         numeric not null default 30,
  strong_min_distinct_episodes integer not null default 3,
  strong_min_distinct_projects integer not null default 2,
  per_episode_cap              numeric not null default 3,

  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid
);

alter table learning.evidence_models
  drop constraint if exists evidence_models_calibration_sane;
alter table learning.evidence_models
  add constraint evidence_models_calibration_sane
  check (decay_half_life_days > 0
     and strong_min_distinct_episodes >= 0
     and strong_min_distinct_projects >= 0
     and per_episode_cap > 0);

create table if not exists learning.assembly_models (
  id                   uuid primary key default gen_random_uuid(),
  title                text,

  -- 'global' · 'module' · 'form' (ADR-21). Bound, because the three are the
  -- product's vocabulary and the engine resolves a model by reading them. A
  -- fourth scope is a design decision and therefore a migration, on purpose.
  scope                text not null default 'global',

  cadence_min_per_hour integer not null default 1,
  cadence_max_per_hour integer not null default 5,
  daily_cap            integer not null default 5,
  ttl_hours            integer not null default 48,
  ranking_mode         text not null default 'info_gain',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

alter table learning.assembly_models
  drop constraint if exists assembly_models_scope_known;
alter table learning.assembly_models
  add constraint assembly_models_scope_known
  check (scope in ('global', 'module', 'form'));

-- `ranking_mode` is NOT bound to a set: generation_config never bound it either,
-- and a new ranking strategy is an engine change.
alter table learning.assembly_models
  drop constraint if exists assembly_models_ranking_mode_present;
alter table learning.assembly_models
  add constraint assembly_models_ranking_mode_present
  check (length(btrim(ranking_mode)) > 0);

alter table learning.assembly_models
  drop constraint if exists assembly_models_cadence_sane;
alter table learning.assembly_models
  add constraint assembly_models_cadence_sane
  check (cadence_min_per_hour >= 0
     and cadence_max_per_hour >= cadence_min_per_hour
     and daily_cap >= 0
     and ttl_hours > 0);

-- ── The two link tables (ADR-21) ────────────────────────────────────────────
-- PK on both columns. No `kind`, no learner column, and no RLS of their own
-- beyond the operator pair -- the model rows are SHARED, so the pair-FK rule of
-- 0067 does not apply here: there is no owner to compare an objective against,
-- and only an operator may write a link at all.
create table if not exists learning.evidence_model_objectives (
  evidence_model_id uuid not null references learning.evidence_models(id) on delete cascade,
  objective_id      uuid not null references learning.learning_objectives(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (evidence_model_id, objective_id)
);

create table if not exists learning.assembly_model_objectives (
  assembly_model_id uuid not null references learning.assembly_models(id) on delete cascade,
  objective_id      uuid not null references learning.learning_objectives(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (assembly_model_id, objective_id)
);

create index if not exists idx_evidence_model_objectives_objective
  on learning.evidence_model_objectives(objective_id);

create index if not exists idx_assembly_model_objectives_objective
  on learning.assembly_model_objectives(objective_id);

comment on table learning.evidence_models is
  $$The EvidenceModel node: the calibration knobs the reducer weighs evidence
with. Split out of the learning.generation_config singleton (ADR-8, ADR-21).

Scope is many-to-many through learning.evidence_model_objectives. A ROW WITH
ZERO LINKS IS THE GLOBAL DEFAULT, and the engine resolves a model for an
objective as: the rows linked to it, else the zero-link row.

The seeded row carries generation_config's values, which T1 measured to be its
column DEFAULTS -- the singleton was never edited (12 values, updated_by NULL).
So the seed preserves defaults, not tuning.$$;

comment on table learning.assembly_models is
  $$The AssemblyModel node: cadence, daily cap, TTL and ranking mode. Split out
of learning.generation_config (ADR-8, ADR-21), with `scope` and `title` added.

`scope` is 'global' | 'module' | 'form'. Objective scope is many-to-many through
learning.assembly_model_objectives; a row with zero links is the global default.$$;

comment on table learning.evidence_model_objectives is
  $$Which objectives an evidence model measures. ADR-21: an evidence model
updates several objectives at once, which a nullable objective_id on the model
row cannot express. ZERO ROWS FOR A MODEL MEANS THAT MODEL IS THE GLOBAL
DEFAULT -- an empty link set is a meaning, not a gap.$$;

comment on table learning.assembly_model_objectives is
  $$Which objectives an assembly model balances. Same shape and same zero-link
rule as learning.evidence_model_objectives (ADR-21).$$;

-- ── RLS: shared read, operator write ────────────────────────────────────────
-- A model row is SHARED vocabulary, not a learner's row, so there is no
-- `learner_id` and no self policy. Every authenticated caller reads (the engine
-- needs the knobs for whoever it runs for); only an operator writes.
--
-- Note the grant is `select, insert, update` and NOT `select` alone. The
-- operator ALL policy has to be exercisable by SOMEBODY: an operator reaches
-- this table as the `authenticated` role like everyone else, and a select-only
-- grant would make the write policy dead text and leave merge B's
-- `update_evidence_model` verb (T7) unable to run at all. The grant decides
-- which verbs may be ATTEMPTED; the policy decides who succeeds. This is
-- strictly tighter than the existing `concepts_rw_shared` pattern, which lets
-- any authenticated caller write.
--
-- DELETE is granted on neither: a model row that is wrong is edited, and one
-- that is retired keeps its rows pointing at it.

alter table learning.evidence_models enable row level security;

drop policy if exists evidence_models_read_all on learning.evidence_models;
create policy evidence_models_read_all on learning.evidence_models
  for select using (true);

drop policy if exists evidence_models_rw_operator on learning.evidence_models;
create policy evidence_models_rw_operator on learning.evidence_models
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

grant select, insert, update on learning.evidence_models to authenticated;
revoke all on learning.evidence_models from anon;

alter table learning.assembly_models enable row level security;

drop policy if exists assembly_models_read_all on learning.assembly_models;
create policy assembly_models_read_all on learning.assembly_models
  for select using (true);

drop policy if exists assembly_models_rw_operator on learning.assembly_models;
create policy assembly_models_rw_operator on learning.assembly_models
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

grant select, insert, update on learning.assembly_models to authenticated;
revoke all on learning.assembly_models from anon;

alter table learning.evidence_model_objectives enable row level security;

drop policy if exists evidence_model_objectives_read_all on learning.evidence_model_objectives;
create policy evidence_model_objectives_read_all on learning.evidence_model_objectives
  for select using (true);

drop policy if exists evidence_model_objectives_rw_operator on learning.evidence_model_objectives;
create policy evidence_model_objectives_rw_operator on learning.evidence_model_objectives
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

grant select, insert, delete on learning.evidence_model_objectives to authenticated;
revoke all on learning.evidence_model_objectives from anon;

alter table learning.assembly_model_objectives enable row level security;

drop policy if exists assembly_model_objectives_read_all on learning.assembly_model_objectives;
create policy assembly_model_objectives_read_all on learning.assembly_model_objectives
  for select using (true);

drop policy if exists assembly_model_objectives_rw_operator on learning.assembly_model_objectives;
create policy assembly_model_objectives_rw_operator on learning.assembly_model_objectives
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

grant select, insert, delete on learning.assembly_model_objectives to authenticated;
revoke all on learning.assembly_model_objectives from anon;


-- ---------------------------------------------------------------------------
-- 6. The seed — one global-default row per model table, from the singleton.
--
-- `INSERT ... SELECT`, guarded by "the table is still empty", so a replay adds
-- nothing and an edited row is never overwritten. Zero links are inserted: a
-- row with zero links IS the global default (ADR-21).
--
-- If `generation_config` holds no row the seed inserts nothing rather than
-- inventing one. That is the honest failure: an empty model table is visible,
-- a fabricated calibration is not. (Fresh-apply from an empty database hits
-- exactly this path, because 0070's seed runs there too and does insert one.)
-- ---------------------------------------------------------------------------
insert into learning.evidence_models
  (title, decay_half_life_days, strong_min_distinct_episodes,
   strong_min_distinct_projects, per_episode_cap)
select
  'Global default',
  g.decay_half_life_days,
  g.strong_min_distinct_episodes,
  g.strong_min_distinct_projects,
  g.per_episode_cap
from learning.generation_config g
where g.id = 1
  and not exists (select 1 from learning.evidence_models);

insert into learning.assembly_models
  (title, scope, cadence_min_per_hour, cadence_max_per_hour,
   daily_cap, ttl_hours, ranking_mode)
select
  'Global default',
  'global',
  g.cadence_min_per_hour,
  g.cadence_max_per_hour,
  g.daily_cap,
  g.ttl_hours,
  g.ranking_mode
from learning.generation_config g
where g.id = 1
  and not exists (select 1 from learning.assembly_models);


-- ---------------------------------------------------------------------------
-- 7. The work_context backfill (ADR-10 / Q12 = A, ADR-26).
--
-- A same-row derivation: every value comes from columns the episode already
-- carries. It creates no information, needs no actor and needs no JWT, so it is
-- DDL by ADR-10's line ("does a row appear, vanish, or change meaning") -- the
-- context row is a REPRESENTATION of tuples that already exist.
--
-- Both statements are idempotent AND useful on a replay: `on conflict do
-- nothing` against uq_work_contexts_identity, and `where work_context_id is
-- null` on the update. A v1-client row that lands after this migration with no
-- context gets one if the file is ever replayed, which is the correct outcome.
--
-- An episode with a NULL project_ref is SKIPPED rather than given an invented
-- root. Measured 2026-09-07: zero such episodes exist, so block A.6's
-- "work_context_id is null count = 0" holds today; the skip is what keeps it
-- honest if one ever appears.
--
-- ⚠️ THE `project_root_rule` CTE IS THE JUDGEMENT CALL OF THIS FILE.
-- See "THE PROJECT ROOT COLLAPSE" in the header. Editing the ancestor
-- predicate below is the whole change if the mapping in the PR body is wrong.
-- ---------------------------------------------------------------------------
with known_refs as (
  -- Every (learner, raw cwd) the corpus has seen.
  select distinct learner_id, project_ref
    from learning.work_episodes
   where project_ref is not null
),
project_root_rule as (
  -- ADR-26: the project_root of a raw cwd is the TOP-MOST ancestor path among
  -- the SAME learner's known project_ref values. A ref with no shallower
  -- ancestor is its own root. `length` orders ancestors because every candidate
  -- is a prefix of the same string, so the shortest is the top-most; the
  -- `project_ref` tie-break keeps the choice deterministic.
  select r.learner_id,
         r.project_ref,
         (select a.project_ref
            from known_refs a
           where a.learner_id = r.learner_id
             and (r.project_ref = a.project_ref
                  or r.project_ref like a.project_ref || '/%')
           order by length(a.project_ref) asc, a.project_ref asc
           limit 1) as project_root
    from known_refs r
),
contexts as (
  select distinct
         e.learner_id,
         p.project_root,
         -- The raw cwd of the FIRST episode of the context, kept as data.
         first_value(e.project_ref) over (
           partition by e.learner_id, p.project_root, e.machine, e.machine_class
           order by e.started_at nulls last, e.created_at, e.id
         ) as project_ref,
         e.machine,
         e.machine_class
    from learning.work_episodes e
    join project_root_rule p
      on p.learner_id = e.learner_id
     and p.project_ref = e.project_ref
   where e.project_ref is not null
)
insert into learning.work_contexts
  (learner_id, project_root, project_ref, machine, machine_class)
select learner_id, project_root, project_ref, machine, machine_class
  from contexts
on conflict do nothing;

with known_refs as (
  select distinct learner_id, project_ref
    from learning.work_episodes
   where project_ref is not null
),
project_root_rule as (
  select r.learner_id,
         r.project_ref,
         (select a.project_ref
            from known_refs a
           where a.learner_id = r.learner_id
             and (r.project_ref = a.project_ref
                  or r.project_ref like a.project_ref || '/%')
           order by length(a.project_ref) asc, a.project_ref asc
           limit 1) as project_root
    from known_refs r
)
update learning.work_episodes e
   set work_context_id = c.id
  from project_root_rule p
  join learning.work_contexts c
    on c.learner_id      = p.learner_id
   and c.project_root    = p.project_root
 where p.learner_id      = e.learner_id
   and p.project_ref     = e.project_ref
   and c.machine         is not distinct from e.machine
   and c.machine_class   = e.machine_class
   and e.work_context_id is null;


-- A set of new tables in the already-exposed `learning` schema (0068): nudge
-- PostgREST to reload its schema cache, so GET /rest/v1/work_contexts answers
-- 200 rather than 404. No-op when nothing is listening (fresh-apply).
notify pgrst, 'reload schema';
