-- ============================================================================
-- Itera migration 0074 — schema `learning`: the concept graph.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260901-learning-engine-x-ast-gaps (v2), gaps 1-4. Founding ADR-1.
-- Parent plan: 20260828-itera-learning-engine-v1 (schema created in 0067).
--
-- 🔑 THIS SCHEMA IS THE WRITE TARGET OF ALREADY-MERGED CODE
-- --------------------------------------------------------
-- The extraction writer `apps/engine/src/pipeline/concepts.ts` (+ the
-- `evidence.misconception_id` link in `pipeline/run.ts`) is ALREADY MERGED and
-- LIVE in `iterahq/itera-learning-monorepo`. It degrades safely while these
-- tables are absent (a missing table/column is logged and swallowed, never
-- thrown), so a NAME MISMATCH here is invisible: concept writes would silently
-- no-op forever. Therefore every table and column below is matched 1:1 to what
-- that merged code writes. The column names are the CODE's, not this plan's
-- prose — where the two disagreed, the merged code won (it is live). The exact
-- reads used to derive each name are cited per table.
--
-- WHAT THIS IS
-- -----------
-- 0067 gave the engine a flat, per-learner store: objectives -> claims ->
-- evidence -> learner_state. Every claim is undifferentiated free text. This
-- migration adds the concept graph that closes gaps 1-4:
--   1. misconceptions get a home (their own table),
--   2. concepts get a type (kind: kc / capability / principle),
--   3. concepts get typed relations between them (the connections), and
--   4. evidence and activities get links that close the diagnose->intervene
--      loop.
--
-- THE FOUNDING CONSTRAINT: THE SCHEMA MUST NEVER LOCK (ADR-1)
-- ----------------------------------------------------------
-- Tainan's central concern (2026-09-01): "nao travar esse esquema... a gente
-- possa mudar depois... tirar um type, adicionar outro, mesclar." So:
--   * `concepts.kind`, `concept_relations.relation_type`, `claim_concepts.
--     relation` carry NO `check (... in (...))` enum. A type is added, removed,
--     or merged by a reviewed DATA import, never a schema migration.
--   * concept and misconception ids are FREE-TEXT primary keys, not uuids. A
--     later ast re-consolidation RE-KEYS a concept with an UPDATE, so every FK
--     that points at `concepts.id` / `misconceptions.id` is `on update cascade`
--     -- the re-key propagates itself and nothing breaks.
--   * the only column guards are PRESENCE (`length(btrim(...)) > 0`) and jsonb
--     SHAPE (`jsonb_typeof(...) = 'object'`). Neither constrains the SET of
--     values, so neither locks the vocabulary.
--
-- GLOBAL VOCABULARY vs. PER-LEARNER USE
-- -------------------------------------
-- `concepts`, `misconceptions`, and `concept_relations` are the SHARED
-- ontology: one vocabulary and one graph for the whole ecosystem. Every
-- authenticated learner reads all of it. `claim_concepts` is the PER-LEARNER
-- layer -- which of a learner's own claims demonstrate which shared concept --
-- and it is owner-scoped exactly like `claims` in 0067 (the composite
-- FK-same-learner pattern). No cross-learner leak: the vocabulary is shared on
-- purpose; WHICH concepts a learner demonstrated lives in that learner's own
-- `claim_concepts` / `evidence` / `activities` rows, each still RLS-scoped.
--
-- MISCONCEPTIONS ARE A SEPARATE TABLE (matched to the merged writer)
-- -----------------------------------------------------------------
-- `concepts.ts` writes misconceptions via `learning.from('misconceptions')`
-- with `{ id, label, description, source }`, distinct from `from('concepts')`
-- with `{ id, kind, label, source }`. `run.ts` links `evidence.misconception_id
-- -> misconceptions.id` (its comment says so verbatim). So misconceptions are
-- their OWN table here, not a `kind` of concept. (This also matches the plan's
-- §2 and its Verification, which counts `learning.misconceptions` separately.)
--
-- APPEND-ONLY TABLES ARE NOT WEAKENED
-- -----------------------------------
-- 0067 makes `evidence` append-only for `authenticated` (INSERT + SELECT). This
-- migration adds `evidence.misconception_id` as a nullable column; it grants no
-- UPDATE. The `on delete set null` there is a SYSTEM op (a misconception being
-- re-keyed/removed), like the existing `on delete set null (episode_id)`.
--
-- DRIFT GUARDS / POSTGREST (unchanged from 0067's notes)
-- ------------------------------------------------------
-- db/scripts/census.sql scopes to ('itera','billing'), so `learning` stays
-- invisible to schema-parity / db-drift; no expected-schema.txt change needed.
-- PostgREST already exposes `learning` (0068); the file ends with a NOTIFY so
-- the new tables enter the schema cache (a no-op with no listener).
-- ============================================================================

create schema if not exists learning;
grant usage on schema learning to authenticated;
revoke all on schema learning from anon;

-- ---------------------------------------------------------------------------
-- concepts — shared, kind-tagged vocabulary. GLOBAL.
-- Columns matched to concepts.ts `upsertConcepts`: { id, kind, label, source }.
-- ---------------------------------------------------------------------------
create table if not exists learning.concepts (
  id          text primary key,
  kind        text not null,
  label       text not null,
  description text,
  source      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- PRESENCE and SHAPE only. NO `check (kind in (...))` -- ADR-1.
alter table learning.concepts drop constraint if exists concepts_id_present;
alter table learning.concepts add constraint concepts_id_present
  check (length(btrim(id)) > 0);
alter table learning.concepts drop constraint if exists concepts_kind_present;
alter table learning.concepts add constraint concepts_kind_present
  check (length(btrim(kind)) > 0);
alter table learning.concepts drop constraint if exists concepts_label_present;
alter table learning.concepts add constraint concepts_label_present
  check (length(btrim(label)) > 0);
alter table learning.concepts drop constraint if exists concepts_source_object;
alter table learning.concepts add constraint concepts_source_object
  check (jsonb_typeof(source) = 'object');

create index if not exists idx_concepts_kind on learning.concepts(kind);

comment on table learning.concepts is
  $$Shared concept vocabulary: one row per kc / capability / principle. GLOBAL.
`kind`, `label`, `source` match the merged `apps/engine/.../concepts.ts`
`upsertConcepts` write. `kind` is FREE TEXT, no CHECK enum (ADR-1). `id` is a
free-text PK; every FK here is `on update cascade` so an ast re-key is a data
import, not a breaking migration (ADR-4). `source` mirrors the extractor's
`{proposed_by_extraction, emergent, confirmed}`; a seed import writes
`{ontology_export_version, ...}` there instead.$$;

-- ---------------------------------------------------------------------------
-- misconceptions — SEPARATE table (a wrong model, not a unit of knowledge).
-- Columns matched to concepts.ts `upsertMisconceptions`:
--   { id, label, description, source }.
-- ---------------------------------------------------------------------------
create table if not exists learning.misconceptions (
  id          text primary key,
  label       text not null,
  description text,
  source      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table learning.misconceptions drop constraint if exists misconceptions_id_present;
alter table learning.misconceptions add constraint misconceptions_id_present
  check (length(btrim(id)) > 0);
alter table learning.misconceptions drop constraint if exists misconceptions_label_present;
alter table learning.misconceptions add constraint misconceptions_label_present
  check (length(btrim(label)) > 0);
alter table learning.misconceptions drop constraint if exists misconceptions_source_object;
alter table learning.misconceptions add constraint misconceptions_source_object
  check (jsonb_typeof(source) = 'object');

comment on table learning.misconceptions is
  $$Shared misconception vocabulary: one row per named wrong model. GLOBAL,
separate from `concepts` -- matched to the merged writer's
`from('misconceptions')` upsert { id, label, description, source }. `id` is the
target of `evidence.misconception_id`. Free-text PK, no enum (ADR-1).$$;

-- ---------------------------------------------------------------------------
-- concept_relations — the connections. GLOBAL. "the gold".
-- Columns matched to concepts.ts `writeConceptRelations`:
--   { from_concept_id, to_concept_id, relation_type, source }
-- where source = { proposed_by, confirmed, evidence_ref, note }. ADR-6 lives
-- ENTIRELY inside `source` -- there is deliberately NO separate `confirmed`
-- column, because the merged code writes none.
-- ---------------------------------------------------------------------------
create table if not exists learning.concept_relations (
  id              uuid primary key default gen_random_uuid(),
  from_concept_id text not null,
  to_concept_id   text not null,
  relation_type   text not null,
  source          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- `on update cascade` makes an ADR-4 re-key non-breaking; `on delete cascade`
-- removes dangling edges when a concept is removed (a curated op).
alter table learning.concept_relations drop constraint if exists concept_relations_from_fk;
alter table learning.concept_relations add constraint concept_relations_from_fk
  foreign key (from_concept_id) references learning.concepts(id)
  on update cascade on delete cascade;
alter table learning.concept_relations drop constraint if exists concept_relations_to_fk;
alter table learning.concept_relations add constraint concept_relations_to_fk
  foreign key (to_concept_id) references learning.concepts(id)
  on update cascade on delete cascade;

alter table learning.concept_relations drop constraint if exists concept_relations_type_present;
alter table learning.concept_relations add constraint concept_relations_type_present
  check (length(btrim(relation_type)) > 0);
alter table learning.concept_relations drop constraint if exists concept_relations_source_object;
alter table learning.concept_relations add constraint concept_relations_source_object
  check (jsonb_typeof(source) = 'object');
-- The writer forbids self-loops (concepts.ts `writeConceptRelations`); assert it.
alter table learning.concept_relations drop constraint if exists concept_relations_no_self_loop;
alter table learning.concept_relations add constraint concept_relations_no_self_loop
  check (from_concept_id <> to_concept_id);

-- Idempotency key matches the writer's app-level dedup on
-- (from_concept_id, to_concept_id, relation_type).
create unique index if not exists uq_concept_relations_edge
  on learning.concept_relations(from_concept_id, to_concept_id, relation_type);
create index if not exists idx_concept_relations_from
  on learning.concept_relations(from_concept_id);
create index if not exists idx_concept_relations_to
  on learning.concept_relations(to_concept_id);

comment on table learning.concept_relations is
  $$The concept graph: typed, directional edges between concepts -- "the gold".
GLOBAL. Columns match the merged `writeConceptRelations`. `relation_type` is
FREE TEXT, no enum (ADR-1). ADR-6 lives inside `source`
({proposed_by, confirmed, evidence_ref, note}): the extractor always writes
`confirmed: false`; the flip to confirmed happens later by evidence threshold or
human curation, never on the LLM's say-so. There is no separate `confirmed`
column because the writer writes none.$$;

-- ---------------------------------------------------------------------------
-- claim_concepts — PER-LEARNER link from a learner's claim to a shared concept.
-- Columns matched to concepts.ts `writeClaimConcepts` insert:
--   { claim_id, learner_id, concept_id, relation }.
-- ---------------------------------------------------------------------------
create table if not exists learning.claim_concepts (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null,
  learner_id  uuid not null references learning.learners(id) on delete cascade,
  concept_id  text not null,
  relation    text not null default 'targets',
  created_at  timestamptz not null default now()
);

-- FK-same-learner against 0067's uq_claims_id_learner.
alter table learning.claim_concepts drop constraint if exists claim_concepts_claim_same_learner;
alter table learning.claim_concepts add constraint claim_concepts_claim_same_learner
  foreign key (claim_id, learner_id)
  references learning.claims(id, learner_id) on delete cascade;
-- concept_id -> shared vocabulary; `on update cascade` for ADR-4 re-keys.
alter table learning.claim_concepts drop constraint if exists claim_concepts_concept_fk;
alter table learning.claim_concepts add constraint claim_concepts_concept_fk
  foreign key (concept_id) references learning.concepts(id)
  on update cascade on delete cascade;

alter table learning.claim_concepts drop constraint if exists claim_concepts_relation_present;
alter table learning.claim_concepts add constraint claim_concepts_relation_present
  check (length(btrim(relation)) > 0);

-- Idempotency key matches the writer's app-level dedup on (claim_id, concept_id).
create unique index if not exists uq_claim_concepts_claim_concept
  on learning.claim_concepts(claim_id, concept_id);
create index if not exists idx_claim_concepts_concept
  on learning.claim_concepts(concept_id);
create index if not exists idx_claim_concepts_learner
  on learning.claim_concepts(learner_id);

comment on table learning.claim_concepts is
  $$PER-LEARNER: which of a learner's own claims demonstrate which shared
concept. Owner-scoped like claims (FK-same-learner, 0067). Columns match the
merged `writeClaimConcepts` insert { claim_id, learner_id, concept_id, relation }.
`relation` is free text (default 'targets'), no enum (ADR-1).$$;

-- ---------------------------------------------------------------------------
-- gap 4 — loop-closing links. Free-text ids referencing the shared vocabulary,
-- `on update cascade` (ADR-4 re-key), `on delete set null` (removed row leaves
-- the record intact).
-- ---------------------------------------------------------------------------

-- evidence.misconception_id -> misconceptions.id. Written by run.ts on the
-- evidence insert (degrade-safe there too). Nullable column on an APPEND-ONLY
-- table; no UPDATE grant added.
alter table learning.evidence add column if not exists misconception_id text;
alter table learning.evidence drop constraint if exists evidence_misconception_fk;
alter table learning.evidence add constraint evidence_misconception_fk
  foreign key (misconception_id) references learning.misconceptions(id)
  on update cascade on delete set null;
create index if not exists idx_evidence_misconception
  on learning.evidence(misconception_id);

comment on column learning.evidence.misconception_id is
  $$Optional free-text FK to learning.misconceptions(id): the misconception this
observation revealed (gap 4). Matched to run.ts, which links
evidence.misconception_id -> misconceptions.id. Not kind-enforced at the FK
(ADR-1, flag-not-lock).$$;

-- activities.targets_concept_id -> concepts.id;
-- activities.targets_misconception_id -> misconceptions.id.
-- No merged code writes these yet; they are the plan's gap-4 loop-closing
-- columns for the governor's future diagnose->intervene pass. Nullable.
alter table learning.activities add column if not exists targets_concept_id text;
alter table learning.activities add column if not exists targets_misconception_id text;
alter table learning.activities drop constraint if exists activities_targets_concept_fk;
alter table learning.activities add constraint activities_targets_concept_fk
  foreign key (targets_concept_id) references learning.concepts(id)
  on update cascade on delete set null;
alter table learning.activities drop constraint if exists activities_targets_misconception_fk;
alter table learning.activities add constraint activities_targets_misconception_fk
  foreign key (targets_misconception_id) references learning.misconceptions(id)
  on update cascade on delete set null;
create index if not exists idx_activities_targets_concept
  on learning.activities(targets_concept_id);
create index if not exists idx_activities_targets_misconception
  on learning.activities(targets_misconception_id);

comment on column learning.activities.targets_concept_id is
  $$Optional free-text FK to learning.concepts(id): the concept a generated
activity teaches (gap 4). `on update cascade` for ADR-4 re-keys.$$;
comment on column learning.activities.targets_misconception_id is
  $$Optional free-text FK to learning.misconceptions(id): the misconception a
generated activity confronts (gap 4).$$;

-- ============================================================================
-- RLS
--   concepts / misconceptions / concept_relations: GLOBAL shared vocabulary.
--     Every authenticated learner reads all of it (using true). Writes gated by
--     GRANT (no DELETE), the same trust model 0067 uses for learner_state
--     writes with the learner's own JWT: the extractor and the import tool both
--     run as `authenticated` (UserScopedClient carries the learner's JWT).
--   claim_concepts: owner-scoped, exactly like claims.
-- ============================================================================

alter table learning.concepts           enable row level security;
alter table learning.misconceptions     enable row level security;
alter table learning.concept_relations  enable row level security;
alter table learning.claim_concepts     enable row level security;

drop policy if exists concepts_rw_shared on learning.concepts;
create policy concepts_rw_shared on learning.concepts
  for all using (true) with check (true);

drop policy if exists misconceptions_rw_shared on learning.misconceptions;
create policy misconceptions_rw_shared on learning.misconceptions
  for all using (true) with check (true);

drop policy if exists concept_relations_rw_shared on learning.concept_relations;
create policy concept_relations_rw_shared on learning.concept_relations
  for all using (true) with check (true);

drop policy if exists claim_concepts_rw_self on learning.claim_concepts;
create policy claim_concepts_rw_self on learning.claim_concepts
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

-- ============================================================================
-- GRANTS — RLS still applies on top. Written out per-table (0002's blanket
-- grant does not reach a table created afterwards), every anon revoke with it.
--   concepts / misconceptions / concept_relations: SELECT + INSERT + UPDATE,
--     no DELETE (a concept is merged/re-keyed by a reviewed op, never dropped
--     by a learner session).
--   claim_concepts: full CRUD, like claims -- a learner's own link is mutable.
-- ============================================================================

grant select, insert, update on learning.concepts to authenticated;
revoke all on learning.concepts from anon;

grant select, insert, update on learning.misconceptions to authenticated;
revoke all on learning.misconceptions from anon;

grant select, insert, update on learning.concept_relations to authenticated;
revoke all on learning.concept_relations from anon;

grant select, insert, update, delete on learning.claim_concepts to authenticated;
revoke all on learning.claim_concepts from anon;

-- New tables in the already-exposed `learning` schema: nudge PostgREST to
-- reload its schema cache. No-op when nothing is listening (fresh-apply).
notify pgrst, 'reload schema';
