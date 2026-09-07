-- ============================================================================
-- Itera migration 0079 — schema `learning`: MERGE B of the v0.4 remodel.
-- The capability family, the claim templates, the ontology versions, the
-- residue and the capability proposals. ONE file, seven objects, all additive.
--
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260903-itera-learning-schema-v04-remodel v4, tasks T8 + T13, gate B.
--   https://plans.devfellowship.com/20260903-itera-learning-schema-v04-remodel
-- Parent plan: 20260828-itera-learning-engine-v1 (schema created in 0067).
--
-- WHAT THIS IS
-- -----------
-- Today the vocabulary of the learning map lives in `learning.concepts` as 15
-- rows with `kind='capability'`. That table is a free-text bag: the extractor
-- writes into it, and it already holds three near-duplicate clusters over eight
-- rows because a prompt line is not an enforcement mechanism.
--
-- Merge B lifts that vocabulary into a table of its own, with a version on
-- every row, a human gate in front of every new row, and a place for the
-- moments the map does not model yet. Seven objects:
--
--   1. `learning.ontology_versions`  — one row per editorial change of the map.
--                                      Row 1 is this lift.
--   2. `learning.capabilities`       — the map. 15 rows after the lift, one per
--                                      `concepts.kind='capability'` row.
--   3. `learning.claim_templates`    — the diagram's AbstractClaim (Q11 = A,
--                                      ADR-18). A claim reaches its capability
--                                      through its template.
--   4. `learning.claims.claim_template_id` — the nullable back-pointer. All 10
--                                      existing claims stay NULL: a free-form
--                                      claim is still legal (B.2).
--   5. `learning.capability_states`  — `learner_state` for a capability instead
--                                      of a claim. Same reducer receipt shape.
--   6. `learning.residue`            — evidence's twin: the moment that found no
--                                      claim, distilled to one sentence.
--   7. `learning.capability_proposals` — the human gate. A proposal writes ZERO
--                                      capability rows. Only a decision does.
--
-- WHY IT IS SAFE TO MERGE ALONE
-- -----------------------------
--   * Every object is NEW except one nullable column on `claims`.
--   * `learning.concepts` is not touched. All 45 rows stay, `claim_concepts`
--     stays, and every existing reader keeps working. The 15 lifted rows are
--     COPIED, not moved; merge D drops them later, after the call-site check
--     reports zero readers.
--   * `residue` and `capability_proposals` land empty.
--   * This file references NOTHING from merge A. It may apply before or after
--     it. The one soft link — `residue.moment_id` → `learning.episode_moments`
--     — is added by a guarded DO block that does nothing when merge A has not
--     landed yet, and merge A's own file adds it from the other side. See
--     "THE ONE SOFT LINK TO MERGE A" below.
--
-- WHAT THIS FILE DOES NOT DO, DELIBERATELY
-- ----------------------------------------
--   * It does NOT deduplicate the three clusters. The lift is one-to-one and
--     deterministic, so it is schema (ADR-10). Deciding that
--     `cap_adversarial_case_gen` and `cap_adversarial_testing` are the same
--     capability is JUDGMENT, so it goes through the DML tool under a user JWT
--     (T7), which writes `retired_in` on the losers and inserts
--     `ontology_versions` rows 2, 3 and 4. Fifteen rows land here; ten remain
--     after T7 runs.
--   * It creates NO enum. `kind`, `status`, `state` and `quality` are all
--     `text` with a PRESENCE check and no value list (ADR-1 of the parent plan,
--     ADR-5 here). The one exception in this schema — `learner_state.level` —
--     is bound because the four levels are product vocabulary that the UI
--     renders by name. None of the columns here is that.
--   * It seeds NO claim template and NO capability beyond the lift. The 13
--     ingested templates arrive through the tool under Tainan's own JWT (T9).
--
-- THE THREE THINGS EVERY NEW TABLE SHIPS WITH (plan design principle 4)
-- --------------------------------------------------------------------
-- Its RLS policy set, its grant line in the 0067 pattern, and `kind text` where
-- the design says kind. Written out per table, never `grant ... on all tables`
-- — migrations 0063 and 0065 are the record of what a copied grant block costs.
-- ============================================================================

begin;

-- ============================================================================
-- 1. ontology_versions — a map version is a pass.
--
-- Created FIRST, because `capabilities.introduced_in` references it.
--
-- One row per editorial change of the map. Row 1 is this lift. Row 2, 3 and 4
-- are the three dedup merges T7 runs. Every approved capability proposal adds
-- one; a merge adds one only when the operator also edits the description.
--
-- "The current map" is `retired_in is null`, never a delete: a merged
-- capability is RETIRED, and its `source` names the winner. `residue` and
-- (from T14) `evidence.provenance` carry the version they were judged against,
-- so growing the map costs a re-pass over short sentences instead of a re-read
-- of every episode.
--
-- `version` is an int the editorial chooses, not a sequence: the number is
-- quoted in reports and in the `## Verification` blocks of the plan, so it must
-- be stable and readable, and a gap would mean a lost decision rather than a
-- rolled-back transaction.
-- ============================================================================

create table if not exists learning.ontology_versions (
  version    int primary key,
  created_at timestamptz not null default now(),

  -- The operator who made the change. NULL for row 1: this migration is the
  -- editorial act, and no user session runs it.
  created_by uuid,

  -- `note` is the short label the UI shows. `reason` is the long form.
  note       text,
  reason     text
);

alter table learning.ontology_versions
  drop constraint if exists ontology_versions_version_positive;
alter table learning.ontology_versions
  add constraint ontology_versions_version_positive
  check (version >= 1);

comment on table learning.ontology_versions is
  $$One row per editorial change of the capability map (plan 20260903 v4,
ADR-14). Row 1 = the lift of the 15 `concepts.kind='capability'` rows into
`learning.capabilities`.

`capabilities.introduced_in` / `retired_in` and `claim_templates.introduced_in`
/ `retired_in` point here. `residue.ontology_version` records which map a moment
was classified against, so a re-pass reads `status='open' and ontology_version <
max(version)` and never re-reads an episode.

The dashboard reads `max(version)` here to show the Map's version. There is no
`map` table and no `map` view (Q8 = A, ADR-7).$$;

alter table learning.ontology_versions enable row level security;

-- Read by everyone with a session: the Map's version is not a secret, and the
-- dashboard's `map.ts` reads `max(version)` under the learner's own JWT (T25).
drop policy if exists ontology_versions_read_all on learning.ontology_versions;
create policy ontology_versions_read_all on learning.ontology_versions
  for select using (true);

-- Written only by the operator. An approved proposal inserts a row here inside
-- the same transaction that inserts the capability, and only an operator may
-- approve (ADR-22).
drop policy if exists ontology_versions_rw_operator on learning.ontology_versions;
create policy ontology_versions_rw_operator on learning.ontology_versions
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

grant select, insert on learning.ontology_versions to authenticated;
revoke all on learning.ontology_versions from anon;

-- Row 1 — this migration. `on conflict do nothing` keeps the file idempotent:
-- a second apply must not rewrite the note of a version the editorial has since
-- explained differently.
insert into learning.ontology_versions (version, note, reason)
values (
  1,
  'lifted from concepts',
  'Merge B of plan 20260903-itera-learning-schema-v04-remodel: the 15 rows of '
  || 'learning.concepts with kind=''capability'' become learning.capabilities, '
  || 'one to one, by INSERT ... SELECT. No dedup here — the three duplicate '
  || 'clusters are merged through the DML tool (T7), which writes versions 2-4.'
)
on conflict (version) do nothing;

-- ============================================================================
-- 2. capabilities — the map itself.
--
-- OWNERSHIP. `learner_id` is NULLABLE and every row this migration writes is
-- NULL. NULL means SHARED vocabulary; a value would mean a learner-owned
-- override. Tainan answered Q10 = A: capability rows stay shared. The column
-- exists so that a future override is a row and not a migration, and the RLS
-- below reads it, so the two answers have one shape (plan design principle 3).
--
-- `id` is `text`, not `uuid`, and it carries the concept ids verbatim
-- (`cap_decomposition`, ...). Three reasons: the lift stays one-to-one and
-- readable; `claim_concepts` and every report that quotes a `cap_*` id keeps
-- reading the same string; and a human writing a proposal can suggest an id.
--
-- `concept_id` is a TEMPORARY back-pointer to the row this one was lifted from.
-- Merge D drops the column and the 15 concept rows together, after the
-- call-site check reports zero readers of either.
--
-- `source` names the CORPUS of every row and is the whole of the top-down /
-- bottom-up merge:
--     {"kind":"lifted",    "concept_id": "..."}   the 15 rows here
--     {"kind":"editorial"}                        a row seeded by hand
--     {"kind":"promoted",  "proposal_id": "..."}  a row an approved proposal made
-- The constraint below requires the key to be PRESENT. It does NOT bind the
-- value to that list — that is ADR-1, and the closed-vocabulary check
-- (`verify-vocabulary-closed`, T14, block R.1) is where the list lives, in CI,
-- where a fourth value becomes a red check instead of a failed INSERT nobody
-- reads.
-- ============================================================================

create table if not exists learning.capabilities (
  id            text primary key,

  -- NULL = shared vocabulary (every row today, Q10 = A).
  learner_id    uuid references learning.learners(id) on delete cascade,

  title         text not null,
  description   text,

  -- Dropped in merge D. See the header.
  concept_id    text,

  source        jsonb not null default '{}'::jsonb,

  introduced_in int not null references learning.ontology_versions(version),
  retired_in    int references learning.ontology_versions(version),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- `on update cascade` makes a re-key of a concept non-breaking; `on delete set
-- null` is what merge D relies on if the concept rows go before the column
-- does. The pointer is provenance, not a dependency.
alter table learning.capabilities
  drop constraint if exists capabilities_concept_fk;
alter table learning.capabilities
  add constraint capabilities_concept_fk
  foreign key (concept_id) references learning.concepts(id)
  on update cascade on delete set null;

-- PRESENCE and SHAPE only. No `check (... in (...))` anywhere — ADR-1.
alter table learning.capabilities
  drop constraint if exists capabilities_id_present;
alter table learning.capabilities
  add constraint capabilities_id_present
  check (length(btrim(id)) > 0);

alter table learning.capabilities
  drop constraint if exists capabilities_title_present;
alter table learning.capabilities
  add constraint capabilities_title_present
  check (length(btrim(title)) > 0);

alter table learning.capabilities
  drop constraint if exists capabilities_source_object;
alter table learning.capabilities
  add constraint capabilities_source_object
  check (jsonb_typeof(source) = 'object');

-- Every row names its corpus. This is the write-time half of block R.1: without
-- it, a row with no `kind` is invisible to the closed-vocabulary check, which
-- counts rows whose kind is NOT IN the known list and would count zero.
alter table learning.capabilities
  drop constraint if exists capabilities_source_names_kind;
alter table learning.capabilities
  add constraint capabilities_source_names_kind
  check (source ? 'kind' and length(btrim(source->>'kind')) > 0);

-- A row cannot be retired before it was introduced. Reading "the current map"
-- as `retired_in is null` depends on this staying true.
alter table learning.capabilities
  drop constraint if exists capabilities_retired_after_introduced;
alter table learning.capabilities
  add constraint capabilities_retired_after_introduced
  check (retired_in is null or retired_in >= introduced_in);

-- THE LIFT IS ONE-TO-ONE, ENFORCED. Block B.1 asserts that every
-- `concepts.kind='capability'` row has exactly one `capabilities` row pointing
-- back at it. A partial unique index makes "exactly one" a property of the
-- database rather than a query that happened to return 15.
create unique index if not exists uq_capabilities_concept
  on learning.capabilities(concept_id) where concept_id is not null;

-- The extractor builds its closed set from `retired_in is null` at pass start
-- (T14), and the backoffice lists the current map. Small table, cheap index.
create index if not exists idx_capabilities_current
  on learning.capabilities(retired_in);

create index if not exists idx_capabilities_learner
  on learning.capabilities(learner_id) where learner_id is not null;

comment on table learning.capabilities is
  $$The capability map: the closed vocabulary the extractor classifies into
(plan 20260903 v4, merge B, ADR-3 / ADR-11 / ADR-14).

Lifted from `learning.concepts` where `kind='capability'`, one to one. The
concept rows stay until merge D; `concept_id` is the back-pointer and it is
dropped with them.

`learner_id is null` means SHARED (Q10 = A: every row today). RLS refuses a
shared-row write from anyone but an operator, which is the database half of the
three-layer guard that stops the pipeline minting vocabulary. The other two
layers are the extractor's zod enum (T14) and `verify-vocabulary-closed` in CI.

`source->>'kind'` names the corpus: `lifted` (this migration), `editorial` (a
row seeded by hand), `promoted` (a row an approved `capability_proposals` row
created). Nothing else creates a row.$$;

comment on column learning.capabilities.concept_id is
  $$TEMPORARY back-pointer to the `learning.concepts` row this capability was
lifted from. Dropped in merge D together with the 15 concept rows, once the
call-site check reports zero readers. Unique where not null: the lift is
one-to-one by construction, not by convention.$$;

comment on column learning.capabilities.learner_id is
  $$NULL = shared vocabulary. A value = a learner-owned override. Q10 = A made
every row shared; the column stays so that an override is a row, not a
migration. RLS reads it: a learner may write only its own rows, and only an
operator may write a shared one.$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Three PERMISSIVE policies, which OR together. The gate that matters is the
-- INSERT / UPDATE path, so read the WITH CHECK side:
--
--   * a NON-operator inserting `learner_id = null` satisfies neither
--     `capabilities_rw_operator` (not an operator) nor `capabilities_rw_self`
--     (`null = <uuid>` is NULL, not true) → refused. That is block R.2, and it
--     is what makes the pipeline structurally unable to mint a capability, even
--     if the extractor's schema check regressed.
--   * an OPERATOR inserting a shared row passes the first policy.
--   * ANY authenticated session inserting a row with its own `learner_id`
--     passes the second. No such row exists today (Q10 = A) and none is
--     expected; the policy is the shape of the future override.
--
-- SELECT is open to every authenticated session: the map is the product's
-- vocabulary, the dashboard renders it, and a learner who cannot read the map
-- cannot be shown why a claim was judged the way it was.
-- ────────────────────────────────────────────────────────────────────────────

alter table learning.capabilities enable row level security;

drop policy if exists capabilities_read_all on learning.capabilities;
create policy capabilities_read_all on learning.capabilities
  for select using (true);

drop policy if exists capabilities_rw_operator on learning.capabilities;
create policy capabilities_rw_operator on learning.capabilities
  for all using (learner_id is null and itera.is_learning_operator())
  with check (learner_id is null and itera.is_learning_operator());

drop policy if exists capabilities_rw_self on learning.capabilities;
create policy capabilities_rw_self on learning.capabilities
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

-- No DELETE. A capability is RETIRED (`retired_in`), never removed: the
-- evidence and the residue that name it must stay explainable. The absence of
-- the grant is the enforcement, not a convention.
grant select, insert, update on learning.capabilities to authenticated;
revoke all on learning.capabilities from anon;

-- ── THE LIFT ────────────────────────────────────────────────────────────────
-- One row per `concepts.kind='capability'` row, same id, `learner_id null`,
-- `introduced_in = 1`. Deterministic and one-to-one, so it is schema and it
-- ships inside the migration (ADR-10, confirmed by Q12 = A).
--
-- Measured on the ITERA production database on 2026-09-07 (T1): 45 concept
-- rows, of which 15 are capabilities. The count is re-read on the merge day and
-- pasted in the PR body; this statement does not depend on the number.
--
-- `on conflict (id) do nothing` for idempotency: a second apply must not
-- overwrite a title the editorial has since corrected, and must not resurrect a
-- row T7 has since retired.
-- ────────────────────────────────────────────────────────────────────────────

insert into learning.capabilities
  (id, learner_id, title, description, concept_id, source, introduced_in)
select
  c.id,
  null,
  c.label,
  c.description,
  c.id,
  jsonb_build_object('kind', 'lifted', 'concept_id', c.id),
  1
from learning.concepts c
where c.kind = 'capability'
on conflict (id) do nothing;

-- ============================================================================
-- 3. claim_templates — the diagram's AbstractClaim (Q11 = A, ADR-18).
--
-- A claim template is the SENTENCE ("I can define evaluation criteria for an
-- LLM judge"); a `learning.claims` row is that sentence instantiated for one
-- learner against one objective. The template carries the capability, so a
-- claim reaches its capability THROUGH its template — there is no direct
-- `claims.capability_id`, which is exactly what Q11 = A settled.
--
-- SHARED. There is no `learner_id`: a template is editorial vocabulary, like a
-- capability. `created_by` records which operator wrote it, for the audit
-- trail, and is not an ownership column.
--
-- `introduced_in` has NO DEFAULT on purpose. A template that does not say which
-- map version it belongs to cannot be re-passed, and a default would let the
-- tool forget silently.
-- ============================================================================

create table if not exists learning.claim_templates (
  id            uuid primary key default gen_random_uuid(),

  -- NULL is legal: a template may exist before the editorial decides which
  -- capability it belongs to. The 13 ingested templates (T9) all set it.
  capability_id text references learning.capabilities(id)
                on update cascade on delete set null,

  statement     text not null,
  description   text,

  introduced_in int not null references learning.ontology_versions(version),
  retired_in    int references learning.ontology_versions(version),

  created_at    timestamptz not null default now(),
  created_by    uuid
);

alter table learning.claim_templates
  drop constraint if exists claim_templates_statement_present;
alter table learning.claim_templates
  add constraint claim_templates_statement_present
  check (length(btrim(statement)) > 0);

alter table learning.claim_templates
  drop constraint if exists claim_templates_retired_after_introduced;
alter table learning.claim_templates
  add constraint claim_templates_retired_after_introduced
  check (retired_in is null or retired_in >= introduced_in);

create index if not exists idx_claim_templates_capability
  on learning.claim_templates(capability_id);

create index if not exists idx_claim_templates_current
  on learning.claim_templates(retired_in);

comment on table learning.claim_templates is
  $$AbstractClaim (plan 20260903 v4, merge B, ADR-18; Q11 = A). The reusable
sentence a `learning.claims` row instantiates for one learner.

A claim reaches its capability through its template
(`claims.claim_template_id` -> `claim_templates.capability_id`). There is no
`claims.capability_id`.

Shared vocabulary, versioned like `capabilities`: `introduced_in` /
`retired_in` against `ontology_versions`, retire instead of delete. A claim
whose `claim_template_id` is NULL is still legal and still renders — free-form
claims are the pre-existing shape and merge B does not break them (block B.2).$$;

alter table learning.claim_templates enable row level security;

drop policy if exists claim_templates_read_all on learning.claim_templates;
create policy claim_templates_read_all on learning.claim_templates
  for select using (true);

-- Editorial vocabulary: only the operator writes. Tainan is the operator, and
-- T9 runs the 13-template ingestion under his own JWT, so no service_role path
-- is needed or wanted.
drop policy if exists claim_templates_rw_operator on learning.claim_templates;
create policy claim_templates_rw_operator on learning.claim_templates
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

-- No DELETE, same reason as `capabilities`: retire, never remove.
grant select, insert, update on learning.claim_templates to authenticated;
revoke all on learning.claim_templates from anon;

-- ============================================================================
-- 4. claims.claim_template_id — the back-pointer.
--
-- NULLABLE, and NULL on all 10 existing rows. A free-form claim stays legal;
-- block B.2 asserts the 10 still render at /claims/:id after this merge.
--
-- `on delete set null`, not cascade: retiring the vocabulary must never delete
-- a learner's claim or the evidence attached to it.
-- ============================================================================

alter table learning.claims
  add column if not exists claim_template_id uuid;

alter table learning.claims
  drop constraint if exists claims_claim_template_fk;
alter table learning.claims
  add constraint claims_claim_template_fk
  foreign key (claim_template_id) references learning.claim_templates(id)
  on delete set null;

create index if not exists idx_claims_claim_template
  on learning.claims(claim_template_id) where claim_template_id is not null;

comment on column learning.claims.claim_template_id is
  $$The `claim_templates` row this claim instantiates, or NULL for a free-form
claim (plan 20260903 v4, merge B, Q11 = A). NULL on every claim that predates
this migration. The capability of a claim is read through the template.$$;

-- No grant change: `learning.claims` already carries select/insert/update/
-- delete for `authenticated` (0067), and a new column on an existing table
-- inherits the table's grants.

-- ============================================================================
-- 5. capability_states — `learner_state`, one level up.
--
-- `learner_state` is one row per (learner, claim). This is one row per
-- (learner, capability): what the learner can do, rather than what one
-- objective's claim says. Same explainability contract as its sibling —
-- `reducer_version` says WHICH implementation concluded it and `inputs` is the
-- receipt of WHICH rows produced it, so re-running the named reducer over the
-- named inputs reproduces the state (parent ADR-5).
--
-- `state` is NOT bound to a value list, and that differs from
-- `learner_state.level` on purpose. The four levels are product vocabulary the
-- UI renders by name; the capability state is a reducer output whose vocabulary
-- the reducer has not been written yet (ADR-1: presence and shape, never a
-- value list, unless the product names the values).
-- ============================================================================

create table if not exists learning.capability_states (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid not null references learning.learners(id) on delete cascade,
  capability_id   text not null references learning.capabilities(id)
                  on update cascade on delete cascade,
  state           text not null,
  reducer_version text not null,
  inputs          jsonb not null,
  computed_at     timestamptz not null default now()
);

alter table learning.capability_states
  drop constraint if exists capability_states_state_present;
alter table learning.capability_states
  add constraint capability_states_state_present
  check (length(btrim(state)) > 0);

alter table learning.capability_states
  drop constraint if exists capability_states_reducer_version_present;
alter table learning.capability_states
  add constraint capability_states_reducer_version_present
  check (length(btrim(reducer_version)) > 0);

-- The receipt, and not an empty one — a state row nobody can explain is exactly
-- what the hybrid design exists to prevent. Copied verbatim from
-- `learner_state_inputs_object` (0067).
alter table learning.capability_states
  drop constraint if exists capability_states_inputs_object;
alter table learning.capability_states
  add constraint capability_states_inputs_object
  check (jsonb_typeof(inputs) = 'object' and inputs <> '{}'::jsonb);

-- One state row per (learner, capability). The reducer upserts against this.
create unique index if not exists uq_capability_states_learner_capability
  on learning.capability_states(learner_id, capability_id);

comment on table learning.capability_states is
  $$The current state of one capability for one learner: materialized AND
explainable (plan 20260903 v4, merge B; parent ADR-5).

Mirrors `learning.learner_state`, one level up: that table is per (learner,
claim), this one is per (learner, capability). `reducer_version` and `inputs`
are the receipt — re-running the named reducer over the named inputs reproduces
`state`.

Empty on merge day. The reducer that fills it ships after the closed-set
extractor (T14).$$;

alter table learning.capability_states enable row level security;

-- Same pair as `learner_state`: the learner owns its rows, the operator reads
-- every learner's (0069, the Learning Backoffice).
drop policy if exists capability_states_rw_self on learning.capability_states;
create policy capability_states_rw_self on learning.capability_states
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists capability_states_read_operator on learning.capability_states;
create policy capability_states_read_operator on learning.capability_states
  for select using (itera.is_learning_operator());

-- select/insert/update, exactly like `learner_state`: the reducer runs with the
-- learner's own JWT and upserts. No DELETE.
grant select, insert, update on learning.capability_states to authenticated;
revoke all on learning.capability_states from anon;

-- ============================================================================
-- 6. residue — the evidence that found no claim.
--
-- Tainan's phrase, and the design target: THE RESIDUE IS THE OBVIOUS FUTURE
-- MAP. Everything a learner does that the ontology does not model yet lands
-- here, distilled to one sentence per moment. The editorial reads this table to
-- decide what to model next. The learner never sees it.
--
-- WHY A TABLE AND NOT A BUCKET. If a moment that fits no claim is discarded,
-- every growth of the map costs a re-read of every episode, forever. Kept as a
-- row with its candidate sentence, growth costs a re-read of short sentences.
-- The gain is not that the table is small — it will not be small — it is that
-- the row is DISTILLED.
--
-- RESIDUE IS EVIDENCE'S TWIN. Same provenance keys (`pass_id`, `pass_at`), same
-- supersede rule, written in the same pass by the same extractor under the same
-- identity. A moment writes evidence OR residue, never both (block R.4).
--
-- WHO WRITES IT
--   * the extractor (T14), one row per moment that maps to no claim, at
--     `quality='transcript'`;
--   * the digest backfill (T22), one pass, once, over the sessions that carry
--     the agent half of the turn, at `quality='digest'` and `moment_id null`
--     (Q16 = B, ADR-25).
--
-- WHO READS IT: the proposal verb (T7), the decision verbs (T16), the
-- backoffice (T17, T24) and the re-pass (T15). NOT the dashboard — that is a
-- product rule, and the call-site check enforces it (zero `.from('residue')` in
-- apps/dashboard), because the pipeline writes residue under the LEARNER's own
-- identity and RLS therefore cannot be the mechanism.
-- ============================================================================

create table if not exists learning.residue (
  id                        uuid primary key default gen_random_uuid(),
  learner_id                uuid not null references learning.learners(id) on delete cascade,

  -- The episode the moment belongs to. After merge A2 that is the SESSION row.
  episode_id                uuid not null,

  -- NULL only for an episode with no moments, and for every row the digest
  -- backfill writes. The FK is added by a guarded block below — see
  -- "THE ONE SOFT LINK TO MERGE A".
  moment_id                 uuid,

  -- The one sentence the extractor wrote for what the learner did or showed.
  candidate                 text not null,

  -- The ONLY place the extractor writes free vocabulary. A hint for the
  -- editorial, never an id: nothing resolves it, nothing joins on it.
  suggested_label           text,

  -- "near X, but not X". What makes `merge` a one-click decision later.
  nearest_capability_id     text references learning.capabilities(id)
                            on update cascade on delete set null,
  nearest_score             numeric,

  -- Same provenance keys as `evidence.provenance` carries today.
  pass_id                   text not null,
  pass_at                   timestamptz not null,

  -- Which map this moment was judged against. The re-pass reads
  -- `status='open' and ontology_version < max(version)` and re-reads no episode.
  ontology_version          int not null references learning.ontology_versions(version),

  -- `transcript` = written from the full turn. `digest` = written by the T22
  -- backfill from a digest, which is weaker evidence and is shown as such in
  -- /residue/clusters. `kind text`, never an enum (ADR-25).
  quality                   text not null default 'transcript',

  -- `open` · `promoted` · `dismissed`. `kind text`, never an enum.
  status                    text not null default 'open',

  -- Written ONLY by a decision on a proposal (approve or merge), through the
  -- low-level promotion verb. Never by the extractor.
  promoted_to_capability_id text references learning.capabilities(id)
                            on update cascade on delete set null,
  promoted_by               uuid,
  promoted_at               timestamptz,

  created_at                timestamptz not null default now()
);

-- Cross-learner references are refused structurally, as 0067 requires of every
-- learner-scoped table: the FK is on the PAIR, against
-- `uq_work_episodes_id_learner`. A residue row can therefore never point at
-- another learner's episode, whatever the writer intended.
alter table learning.residue
  drop constraint if exists residue_episode_same_learner;
alter table learning.residue
  add constraint residue_episode_same_learner
  foreign key (episode_id, learner_id)
  references learning.work_episodes(id, learner_id) on delete cascade;

alter table learning.residue
  drop constraint if exists residue_candidate_present;
alter table learning.residue
  add constraint residue_candidate_present
  check (length(btrim(candidate)) > 0);

alter table learning.residue
  drop constraint if exists residue_pass_id_present;
alter table learning.residue
  add constraint residue_pass_id_present
  check (length(btrim(pass_id)) > 0);

-- PRESENCE, not a value list (ADR-1). `verify-vocabulary-closed` and block R.3
-- hold the vocabulary; a fourth quality is a red check, not a failed insert.
alter table learning.residue
  drop constraint if exists residue_quality_present;
alter table learning.residue
  add constraint residue_quality_present
  check (length(btrim(quality)) > 0);

alter table learning.residue
  drop constraint if exists residue_status_present;
alter table learning.residue
  add constraint residue_status_present
  check (length(btrim(status)) > 0);

-- A promoted residue row names the capability it became. Without this, a broken
-- decision verb leaves `status='promoted'` rows that point nowhere, and the
-- cluster silently disappears from /residue/clusters with nothing to show for
-- it. This binds the SHAPE of a promotion, not the set of statuses.
alter table learning.residue
  drop constraint if exists residue_promoted_names_capability;
alter table learning.residue
  add constraint residue_promoted_names_capability
  check (status <> 'promoted' or promoted_to_capability_id is not null);

-- ONE RESIDUE ROW PER MOMENT PER PASS. The partial unique index is what makes a
-- re-run of the same pass idempotent instead of doubling the cluster sizes the
-- editorial reads. It is partial because the digest backfill writes
-- `moment_id null` on every row, and NULLs would not collide anyway — stating
-- the predicate says so on purpose.
create unique index if not exists uq_residue_moment_pass
  on learning.residue(moment_id, pass_id) where moment_id is not null;

-- The three reads that matter: the clusters screen (open rows, newest first),
-- the re-pass (open rows below the current version), and the proposal verb
-- resolving a list of ids it must own.
create index if not exists idx_residue_open
  on learning.residue(status, ontology_version, pass_at desc);

create index if not exists idx_residue_learner
  on learning.residue(learner_id, status);

create index if not exists idx_residue_episode
  on learning.residue(episode_id);

create index if not exists idx_residue_nearest
  on learning.residue(nearest_capability_id) where nearest_capability_id is not null;

comment on table learning.residue is
  $$The moment that found no claim, distilled to one sentence (plan 20260903 v4,
merge B, ADR-12 / ADR-13 / ADR-25).

Evidence's twin: same pass keys, same supersede rule, same writer, same
identity. A moment writes evidence OR residue, never both.

`quality` says how the row was made — `transcript` (the extractor, from the full
turn) or `digest` (the one-off T22 backfill). A digest row is weaker and is
shown as weaker; its quality travels into any evidence a later re-pass builds
from it, so a verdict stays explainable.

Read by the proposal verb, the decision verbs, the backoffice and the re-pass.
NOT by the dashboard: the learner sees evidence against claims and nothing else,
which is what keeps the product pedagogical rather than analytic. That rule is
enforced by the call-site check, not by RLS, because the pipeline writes and
re-reads residue under the learner's own JWT.$$;

comment on column learning.residue.suggested_label is
  $$The label the extractor proposes for what it saw. THE ONLY PLACE THE
EXTRACTOR WRITES FREE VOCABULARY. It is a hint for the editorial, never an id:
nothing resolves it and nothing joins on it. The ids live in
`learning.capabilities`, and only a human decision puts one there.$$;

comment on column learning.residue.quality is
  $$`transcript` or `digest` (ADR-25, Q16 = B). `kind text`, never an enum. Every
row the T22 backfill writes is `digest` and carries `moment_id is null`.$$;

-- ── THE ONE SOFT LINK TO MERGE A ────────────────────────────────────────────
-- `residue.moment_id` points at `learning.episode_moments`, which MERGE A
-- creates. Merge B must not depend on merge A — the plan states that B may land
-- first if A2's review takes longer, and the two PRs are open at the same time.
--
-- So the column ships unconstrained and the FK is added only if the table is
-- already there. If merge A lands afterwards, its own file adds the constraint
-- from the other side; if it landed first, the block below adds it here. Either
-- order ends with the same constraint, and neither order fails.
--
-- This is deliberately a DO block and not a comment saying "add it later": a
-- comment is not a mechanism.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('learning.episode_moments') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'residue_moment_fk'
         and conrelid = 'learning.residue'::regclass
     )
  then
    execute $ddl$
      alter table learning.residue
        add constraint residue_moment_fk
        foreign key (moment_id) references learning.episode_moments(id)
        on delete set null
    $ddl$;
  end if;
end
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The learner owns its rows: the pipeline writes residue under the learner's
-- own JWT, exactly as it writes evidence. The operator reads every learner's
-- rows, because the editorial reads this table to decide what to model next.
-- The operator also UPDATEs, because the decision verbs promote and dismiss.
--
-- WHICH COLUMNS AN UPDATE MAY TOUCH IS NOT EXPRESSIBLE IN RLS. A policy's WITH
-- CHECK sees the NEW row, not the diff, so "you may change `status` but not
-- `candidate`" cannot be written as a policy. Two mechanisms can do it: a
-- trigger, or a column-level GRANT. This file uses the COLUMN-LEVEL GRANT, the
-- same shape 0067 already uses for `checkpoints`, for three reasons: Postgres
-- enforces the column list itself, there is no trigger to keep in sync with a
-- policy, and the refusal arrives at the right layer.
--
-- WHAT THAT BUYS AND WHAT IT DOES NOT, STATED PLAINLY. A GRANT is per ROLE, and
-- the learner and the operator are BOTH `authenticated`. So the column list
-- limits everybody: nobody may rewrite `candidate`, `pass_id` or
-- `ontology_version` through PostgREST. But `residue_rw_self` is `for all`, so
-- a learner CAN flip `status` on a row it owns. That is a real residual and it
-- is small: `status` on one's own residue mints nothing. The gate that matters
-- is `capabilities`, and R.2 proves a non-operator cannot write a row there.
-- The proposal path is fenced separately below (P.6).
-- ────────────────────────────────────────────────────────────────────────────

alter table learning.residue enable row level security;

drop policy if exists residue_rw_self on learning.residue;
create policy residue_rw_self on learning.residue
  for all using (learner_id = itera.current_itera_user_id())
  with check (learner_id = itera.current_itera_user_id());

drop policy if exists residue_read_operator on learning.residue;
create policy residue_read_operator on learning.residue
  for select using (itera.is_learning_operator());

drop policy if exists residue_update_operator on learning.residue;
create policy residue_update_operator on learning.residue
  for update using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

-- The revoke runs FIRST: a table-level UPDATE granted by an earlier run would
-- otherwise still stand and make the column list decorative (0067's own note).
revoke all on learning.residue from anon;
revoke update on learning.residue from authenticated;
grant select, insert on learning.residue to authenticated;
grant update (status, promoted_to_capability_id, promoted_by, promoted_at)
  on learning.residue to authenticated;

-- ============================================================================
-- 7. capability_proposals — the human gate between the two corpora.
--
-- Tainan asked for exactly this (Q14): "teremos que montar uma forma de humanos
-- aprovarem, mesclarem e rejeitarem capacidades propostas. Assim o corpus
-- gerado pelos humanos (top down) vai sendo mesclado com o corpus aprovado
-- bottom-up."
--
-- The TOP-DOWN corpus is what the editorial wrote: the 15 lifted rows and every
-- row seeded by hand. The BOTTOM-UP corpus is what the residue shows: clusters
-- of moments the map does not model. They meet in ONE table, `capabilities`,
-- and the thing that moves a cluster from the second corpus into the first is a
-- proposal a human approves, merges or rejects.
--
-- A PROPOSAL WRITES ZERO CAPABILITY ROWS. That is the whole point of the table.
-- Only a decision does:
--
--   approve  one `capabilities` row (source kind `promoted`) + a NEW
--            `ontology_versions` row, in the same transaction; the cluster's
--            residue rows -> `promoted`; this row -> `approved`.
--   merge    the cluster's residue rows -> `promoted` into an EXISTING
--            capability the operator picks; this row -> `merged`. A new
--            version row only if the operator also edits the description.
--   reject   the cluster's residue rows -> `dismissed`; this row -> `rejected`
--            with `decision_note` = the reason.
--
-- All three write ZERO evidence. Evidence comes from the next re-pass, which
-- now finds the capability in the map. So the extractor stays the only writer
-- of evidence, and a human decision stays the only writer of a capability row
-- besides the editorial seed (ADR-13 amended, ADR-22).
--
-- THIS IS THE STAGING AREA, AND IT HOLDS PROPOSALS, NOT CAPABILITIES. There is
-- no second vocabulary table, no "candidate capability" table, no staging
-- schema.
-- ============================================================================

create table if not exists learning.capability_proposals (
  id                    uuid primary key default gen_random_uuid(),

  -- The id the proposer SUGGESTS (`cap_...`). A suggestion, not a row: nothing
  -- references it, and the operator may override it when approving.
  proposed_id           text,

  title                 text not null,
  description           text,

  -- The cluster. Every id must resolve to a `residue` row the proposer may
  -- read; the INSERT policy below enforces exactly that.
  residue_ids           uuid[] not null,

  -- The closest existing entry, with its score. This is what makes `merge` a
  -- one-click decision instead of a search.
  nearest_capability_id text references learning.capabilities(id)
                        on update cascade on delete set null,
  nearest_score         numeric,

  -- `agent` · `human`. `kind text`, never an enum. claude-main files proposals
  -- under its own JWT and records `agent`; it may never approve one.
  proposed_by_kind      text not null,
  proposed_by           text not null,
  proposed_at           timestamptz not null default now(),

  -- `proposed` · `approved` · `merged` · `rejected`. Only the operator UPDATEs
  -- it, and that is enforced by the absence of a learner UPDATE policy below.
  status                text not null default 'proposed',

  -- Written only by a decision verb.
  decided_by            uuid,
  decided_at            timestamptz,
  decision_note         text,

  -- The row the decision created (approve) or merged into (merge). NULL while
  -- proposed, and NULL when rejected.
  capability_id         text references learning.capabilities(id)
                        on update cascade on delete set null,

  -- The version row an approval inserted.
  ontology_version      int references learning.ontology_versions(version)
);

alter table learning.capability_proposals
  drop constraint if exists capability_proposals_title_present;
alter table learning.capability_proposals
  add constraint capability_proposals_title_present
  check (length(btrim(title)) > 0);

alter table learning.capability_proposals
  drop constraint if exists capability_proposals_proposer_present;
alter table learning.capability_proposals
  add constraint capability_proposals_proposer_present
  check (length(btrim(proposed_by_kind)) > 0
         and length(btrim(proposed_by)) > 0);

alter table learning.capability_proposals
  drop constraint if exists capability_proposals_status_present;
alter table learning.capability_proposals
  add constraint capability_proposals_status_present
  check (length(btrim(status)) > 0);

-- A proposal with no cluster is not a proposal. The array must hold at least
-- one id and no NULL element — `array_position(arr, null)` finds a NULL entry
-- and returns its index, so `is null` means there is none.
alter table learning.capability_proposals
  drop constraint if exists capability_proposals_cluster_present;
alter table learning.capability_proposals
  add constraint capability_proposals_cluster_present
  check (cardinality(residue_ids) >= 1
         and array_position(residue_ids, null) is null);

-- A decision names WHO and WHEN together. Half of a decision is worse than
-- none: the inbox would show a decided proposal with nobody accountable.
alter table learning.capability_proposals
  drop constraint if exists capability_proposals_decision_pair;
alter table learning.capability_proposals
  add constraint capability_proposals_decision_pair
  check ((decided_by is null) = (decided_at is null));

-- The inbox: by status, newest first, and sortable by cluster size.
create index if not exists idx_capability_proposals_status
  on learning.capability_proposals(status, proposed_at desc);

create index if not exists idx_capability_proposals_capability
  on learning.capability_proposals(capability_id) where capability_id is not null;

-- "Which proposal names this residue row?" — the clusters screen asks it per
-- row, so the array gets a GIN index rather than a scan.
create index if not exists idx_capability_proposals_residue
  on learning.capability_proposals using gin (residue_ids);

comment on table learning.capability_proposals is
  $$The human gate between the top-down and the bottom-up corpus (plan 20260903
v4, merge B, ADR-22; Tainan's answer to Q14).

A proposal writes ZERO `capabilities` rows. Only a decision does: approve
creates one and a new `ontology_versions` row, merge points the cluster at an
existing one, reject dismisses the cluster. All three write zero evidence —
evidence comes from the next re-pass, which now finds the capability in the map.

`proposed_by_kind` distinguishes agent from human; the JWT distinguishes
operator from learner. claude-main proposes and never approves, and the RLS on
`status` is what makes that hold without trusting a screen.

This is the staging area, and it holds proposals, not capabilities.$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Operator: everything (the three decisions).
--
-- Learner: may INSERT a proposal whose `residue_ids` ALL resolve to residue
-- rows it owns, and may SELECT such a proposal. That is how the pipeline, and
-- how claude-main under its own JWT, propose.
--
-- Ownership is checked by a correlated NOT EXISTS over `unnest(residue_ids)`.
-- It is inline in both policies rather than in a helper function on purpose: a
-- function in the `learning` schema is an exposed PostgREST RPC, and this is
-- not a verb anybody should be able to call. It is also NOT security-definer,
-- so RLS on `learning.residue` still applies inside it — a row the caller
-- cannot read is a row that fails the check, which is exactly the rule.
--
-- THERE IS NO LEARNER UPDATE POLICY, AND THAT ABSENCE IS THE GATE. `status` is
-- operator-only because no other policy permits an UPDATE at all. Block P.6
-- asserts it as a behaviour: as the smoke learner, `update ... set
-- status='approved'` on its OWN proposal affects 0 rows.
-- ────────────────────────────────────────────────────────────────────────────

alter table learning.capability_proposals enable row level security;

drop policy if exists capability_proposals_rw_operator on learning.capability_proposals;
create policy capability_proposals_rw_operator on learning.capability_proposals
  for all using (itera.is_learning_operator())
  with check (itera.is_learning_operator());

drop policy if exists capability_proposals_insert_own_residue on learning.capability_proposals;
create policy capability_proposals_insert_own_residue on learning.capability_proposals
  for insert with check (
    not exists (
      select 1
      from unnest(residue_ids) as t(rid)
      where not exists (
        select 1 from learning.residue r
        where r.id = t.rid
          and r.learner_id = itera.current_itera_user_id()
      )
    )
  );

drop policy if exists capability_proposals_read_own_residue on learning.capability_proposals;
create policy capability_proposals_read_own_residue on learning.capability_proposals
  for select using (
    not exists (
      select 1
      from unnest(residue_ids) as t(rid)
      where not exists (
        select 1 from learning.residue r
        where r.id = t.rid
          and r.learner_id = itera.current_itera_user_id()
      )
    )
  );

-- UPDATE is granted at the table level because the operator edits several
-- columns at once when deciding, and RLS — not the grant — is what limits the
-- verb to the operator here. There is no DELETE: a rejected proposal keeps its
-- reason, and the inbox keeps its history.
grant select, insert, update on learning.capability_proposals to authenticated;
revoke all on learning.capability_proposals from anon;

commit;

-- PostgREST caches the schema. `learning` is already exposed (0068), so the new
-- tables need no `pgrst.db_schemas` change — only a cache reload, or they are
-- invisible to the dashboard and the backoffice until the next restart.
notify pgrst, 'reload schema';
