-- ============================================================================
-- Itera migration 0038 — itera.activity_traces: the PEDAGOGICAL CONTEXT of the
-- attempt, captured with the attempt.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260803-itera-learning-control-plane-prototipo (LCPWCI) — FASE 1.
-- Surface fixed by Q `b819fa14`, answered by Tainan TG 2026-08-03, option A:
-- *"Só Itera Player"* — the Lesson Studio is explicitly out of scope, and the
-- activities of the grammar matrix go to a dfl-labs project instead.
--
-- WHY
-- ---
-- The plan's Fase 1 exists for one sentence: *"você nunca vai conseguir voltar
-- no tempo e coletar esses dados"*. 0034 gave every settled attempt its
-- SEQUENCE and 0037 gave it the ENUNCIADO. Neither says what the activity was
-- FOR. The plan states the requirement without hedging:
--
--   *"Contexto pedagógico em TODO evento: activityId, template,
--    mentalStructure[], metaphor, difficulty, objective. Sem isso, daqui a 5
--    anos não dá pra perguntar 'atividades de Estado usando a metáfora Fábrica
--    geram mais transferência que Cidade?'."*
--
-- That question is the whole of Fase 4 (ablation, competing grammars,
-- contrastive diagnostic activities). It is answerable only if the tag rides
-- WITH the attempt. Joining a trace to `itera.activities` at analysis time
-- would answer it against TODAY's tagging — and the tagging is precisely the
-- thing the plan expects to change, because ADR-5 makes the grammar competitive
-- and alive:
--
--   *"Nenhuma estrutura entra por autoridade — entra porque melhora poder
--    explicativo/preditivo medido em traces."*
--
-- So a trace tagged by join would silently RE-TAG itself every time the grammar
-- moved, and the ablation would be measuring its own bookkeeping. Same defect
-- 0037 fixed one level up (`activities.spec` is mutable jsonb), same fix:
-- capture at the moment of the attempt, never re-derive.
--
-- ADR-2 IS THE REASON THIS IS ONE GENEROUS COLUMN AND NOT SIX NARROW ONES
-- ----------------------------------------------------------------------
-- ADR-2 splits telemetry into four layers — DOM → Interaction → Learning →
-- Mastery — and says only the first two are captured, the last two DERIVED by
-- offline reprocessing:
--
--   *"Toda mudança de gramática vira um job de reprocessamento, não uma
--    migração de cliente. Exige que os eventos brutos sejam guardados de forma
--    generosa e imutável."*
--
-- Six typed columns would make every grammar change a migration plus a client
-- release plus a coordinated deploy — i.e. exactly the client migration ADR-2
-- forbids. One jsonb object holds the six named fields AND keeps every other
-- key the author wrote, verbatim, under `extra`. A field invented next month
-- (`role`, `varied_attribute`, `held_constant[]` — the manifest fields of the
-- v5 matrix, Verification item 11) is therefore already being COLLECTED today
-- by a build that has never heard of it. That is the whole of "generous".
--
-- IMMUTABLE, ALSO BY CONSTRUCTION
-- -------------------------------
-- Nothing updates this row. `progress.service.ts` writes it once, with
-- `onConflict (user_id, activity_id, started_at) ignoreDuplicates`, so an
-- outbox replay of the same attempt is a no-op rather than an overwrite. The
-- immutability ADR-2 asks for is not a policy anybody has to remember.
--
-- WHAT IS STORED
-- --------------
--   {
--     "schema": 1,
--     "template": "single_choice",       -- itera.activities.kind, as rendered
--     "family": "selection",             -- the reducer family, as classified
--                                        --   AT CAPTURE TIME
--     "mental_structures": ["estado"],   -- [] when the activity is untagged
--     "metaphor": "tanques_valvulas",    -- null when untagged
--     "difficulty": 2,                   -- as authored: number OR string
--     "objective": "…",                  -- null when untagged
--     "authored": true,                  -- was there an authored block at all?
--     "extra": { … }                     -- every other authored key, verbatim
--   }
--
-- `activityId` — the sixth field the plan names — is NOT in here. It is already
-- `activity_traces.activity_id`, a NOT NULL FK. Restating it inside the jsonb
-- would be the same mistake as putting a wall clock on every action when the
-- row already carries `started_at`: two places to keep in step, one of which is
-- unconstrained.
--
-- ⚠️ `family` IS SNAPSHOTTED RATHER THAN DERIVED AT READ TIME, and that is the
-- 0037 argument again. `ACTIVITY_FAMILY` (src/utils/activityFamilies.ts) is a
-- live map: a kind can be reclassified into another family, and the module's
-- own header calls each row *"a hypothesis"*. Re-deriving at read time would
-- re-attribute a historical action vocabulary to a family that did not exist
-- when the learner acted.
--
-- WHERE THE TAG COMES FROM, AND WHAT IS HONESTLY MISSING TODAY
-- ------------------------------------------------------------
-- The authored source is `itera.activities.spec.pedagogy` — the only authoring
-- surface that exists right now, which means the pipe can ship today instead of
-- waiting on an authoring UI. NO ACTIVITY IN THE CATALOGUE CARRIES THAT BLOCK
-- YET, so every row written the day this lands has `authored: false`,
-- `mental_structures: []` and three nulls. That is not a defect and it is not
-- hidden: `authored` exists precisely so the audit can tell *"untagged"* from
-- *"tagged with nothing"*, and the plan's Verification item 2 (*"zero eventos
-- com mentalStructure vazio"*) is therefore NOT satisfiable until the activities
-- of the v5 matrix are authored with the block. Shipping the pipe first is the
-- point: attempts that run before it exist are unrecoverable, attempts that run
-- untagged are re-taggable by reprocessing, because the row still pins WHICH
-- activity and WHICH template.
--
-- NULLABLE, NO CHECK, NO INDEX — ALL THREE FOR THE 0037 REASONS
-- -------------------------------------------------------------
-- NULLABLE because `not null` makes the trace unwritable by any client older
-- than this migration, and because the durable outbox legitimately replays
-- entries serialised before the field existed. NULL means NOT CAPTURED, never
-- *"the activity's current tagging"*.
--
-- NO CHECK, exactly as 0037: this column DECORATES the sequence. A constraint
-- here would let an oddly-shaped authored block reject the whole trace — paying
-- the sequence to protect its annotation, which inverts
-- TELEMETRY MUST NEVER DESTROY THE RECORD IT DECORATES. In particular the
-- grammar VOCABULARY is deliberately not pinned: a CHECK listing the v0 terms
-- (estado/fluxo/dependencia/feedback ·
-- tanques_valvulas/interruptores_lampadas/fila) would make the database reject
-- the first attempt of the first activity of the first NEW structure — and
-- ADR-5 exists to add and remove structures. Vocabulary discipline belongs in
-- the activity-manifest lint (Verification 11, in the dfl-labs repo), where a
-- violation costs a red build instead of a learner's attempt.
--
-- NO INDEX. Nothing filters on it yet; the grammar reports of Fase 4 are
-- whole-table analytical passes, not point lookups, and an index nobody queries
-- taxes every insert. When a report needs one, the shape it needs will be known
-- (probably a GIN on `mental_structures`) — guessing it now is guessing.
--
-- ⚠️ NO `schema_version` BUMP. A NEW COLUMN IS NOT AN ENVELOPE CHANGE — the
-- rule is at the top of `src/utils/learningTrace.ts` and 0037 is the precedent.
-- `started_at`, `at_ms` and `actions` all keep their meaning, so rows written
-- before and after this migration are the same envelope, v1. The context object
-- carries its OWN `schema` field for its own evolution, which is what keeps the
-- two versions from being confused with each other.
--
-- ⚠️ DEPLOY ORDER — MIGRATION FIRST, and the client does not depend on it.
-- Merging applies NOTHING here (db/README.md: no workflow touches `db/`); a
-- human runs `db/scripts/apply-migrations.sh`. So "build live, column absent"
-- is the NORMAL state of a rollout, and PostgREST rejects the whole statement
-- for an unknown column. The client therefore degrades one decoration at a time
-- (`src/services/progress.service.ts`): context+snapshot, then snapshot only,
-- then the bare envelope. The window costs annotations and never sequences —
-- and it can be long: 0036 sat merged-and-unapplied for days while 0037 was
-- being written.
--
-- Idempotent: `add column if not exists` + `comment on`, nothing else.
-- Required, not optional — `db/scripts/apply-migrations.sh` has NO ledger and
-- replays every file from 0001 on every run, so a non-idempotent file here
-- poisons every future apply for everyone.
-- ============================================================================

begin;

alter table itera.activity_traces
  add column if not exists pedagogical_context jsonb;

comment on column itera.activity_traces.pedagogical_context is
  $$WHAT THIS ACTIVITY WAS FOR, as tagged at the moment of THIS attempt.
Fase 1 of plan `20260803-itera-learning-control-plane-prototipo` (LCPWCI).

Shape (client contract: src/utils/pedagogicalContext.ts):
  { schema, template, family, mental_structures[], metaphor, difficulty,
    objective, authored, extra? }

`template` is `itera.activities.kind` as rendered; `family` is the reducer
family (src/utils/activityFamilies.ts) AS CLASSIFIED AT CAPTURE TIME — both
snapshotted rather than joined, because both maps are live. The grammar fields
come from the authored `itera.activities.spec.pedagogy` block and are stored
VERBATIM; unrecognised keys of that block survive under `extra`, so a grammar
field invented later is already being collected by builds that never heard of
it (ADR-2: a grammar change is a reprocessing job, not a client migration).

⚠️ `activity_id` is NOT restated in here — it is already a NOT NULL column on
this table.

⚠️ NULL means NOT CAPTURED — an attempt settled before migration 0038, or by a
client older than it, or one whose trace write had to degrade during a deploy
window. It NEVER means "the activity's current tagging"; a reader must say
"context not captured" rather than join to `itera.activities`.

⚠️ `authored: false` (with `mental_structures: []` and null metaphor/difficulty/
objective) means the activity carried NO pedagogy block. That is the expected
state of the whole catalogue on the day this lands and is distinct from NULL:
NULL is "this build did not capture it", `authored: false` is "we looked and
there was nothing to capture". Untagged attempts stay RE-TAGGABLE offline,
because the row still pins which activity and which template.

DELIBERATELY UNCONSTRAINED as to grammar vocabulary: ADR-5 makes the grammar
competitive, so structures and metaphors enter and leave. A CHECK would reject
the first attempt of the first activity of a new structure. Vocabulary
discipline lives in the activity-manifest lint, not here.

Write path: src/services/progress.service.ts (best-effort; the trace degrades
by dropping this column before it drops the sequence).$$;

commit;
