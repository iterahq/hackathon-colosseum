-- ============================================================================
-- Itera migration 0037 — itera.activity_traces: snapshot the ENUNCIADO.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Plan: 20260803-itera-replay-de-sessao-de-atividade — FASE 0.
-- Decided by Tainan, TG 2026-08-04, Q1 option A: *"sim, guarda snapshot
-- (0 antes de qq interface)"*. This is the whole of Fase 0. NO replay UI ships
-- with it, on purpose — see "WHY THIS IS PHASE ZERO" below.
--
-- WHY
-- ---
-- 0034 gave every settled attempt its SEQUENCE. It did not give it the thing
-- the sequence refers to. A trace says `option_selected {option_id: 'b'}`; what
-- `b` actually SAID lives in `itera.activities.spec`, and that column is
-- mutable jsonb with no version, no `updated_at` and no content hash
-- (`0001_itera_schema_v1.sql:99-106`). Nothing on the trace row pins it: before
-- this migration `activity_traces` carried `activity_id` and nothing else about
-- the content.
--
-- This is not hypothetical drift. It has already happened, twice, by design:
--
--   * `activity_defs_sync_instances` (`0024:205-227`) propagates an edit of a
--     definition to EVERY instance — `update itera.activities set spec = ...` —
--     without checking whether attempts already exist against those instances.
--   * the i18n backfill of PR #253 (`scripts/i18n/activity-i18n.ts:444-467`)
--     rewrote `spec`/`rubric` in place, and `0035_activity_i18n_backup.sql:5-11`
--     calls that, in writing, *"lossy edits to authored content"*.
--   * `0017_sandbox_evaluate_quality_gate.sql:22-68` had already rewritten
--     unlock/evaluation rules for `sandbox_scenario` in place.
--
-- And the LOCALE was never recorded at all. `src/utils/resolveLocalizedSpec.ts`
-- collapses the `{pt,en}` bags at RENDER time, reading `localStorage`; nothing
-- durable says which language the learner was shown, and `itera.users.locale`
-- is overwritable at any moment (`src/services/profile.service.ts:74`).
--
-- Net effect without these two columns: a replay re-rendering `activities.spec`
-- shows TODAY's wording, in the language of WHOEVER IS WATCHING. That is worse
-- than having no replay, because it looks like the truth.
--
-- WHY THIS IS PHASE ZERO AND NOT PART OF THE REPLAY UI
-- ---------------------------------------------------
-- Everything else in that plan can be built later against the same data. This
-- cannot: an attempt settled before these columns exist has no enunciado
-- anywhere, and no later work recovers it. Same rule as 0028 and 0034 —
-- the UI waits, the data does not.
--
-- WHAT IS STORED: THE RESOLVED SPEC, NOT A HASH, NOT A POINTER
-- ------------------------------------------------------------
-- A hash (32 bytes) would DETECT drift and never RECOVER the wording — it turns
-- an attempt into "I know this is wrong and I do not know what it was". The
-- `activity_i18n_backup` of 0035 is no substitute: it is scoped per batch and
-- explicitly prunable (`0035:42-43`).
--
-- Measured on the live project 2026-08-04, over all 275 activities:
-- mean spec 1263 bytes, max 8331, 339 kB for the WHOLE catalogue, against an
-- 18 MB database. At the current attempt rate this is well under 1 MB/month.
-- The cost is not an argument against anything.
--
-- `spec_snapshot` is the spec **as the learner was rendered it**: bilingual bags
-- already collapsed to plain strings for `spec_locale`. ⚠️ ONE EXCEPTION, and it
-- is inherited rather than introduced here: `programs.service.ts` deliberately
-- leaves `sandbox_scenario` specs UNRESOLVED, because that runtime resolves its
-- own bags. So for that one kind the snapshot holds bags — which is still an
-- exact record of what was rendered, and `spec_locale` is exactly what a reader
-- needs to resolve it the same way. Read the snapshot WITH the locale, never
-- without.
--
-- WHAT IS NOT STORED, DECLARED RATHER THAN HIDDEN
-- -----------------------------------------------
--   * `rubric` — the grading rules. 0017 shows those get rewritten in place too,
--     so this is a real gap. It is left out because the verdict the learner was
--     SHOWN already rides in the terminal action's payload (`passed`), and
--     snapshotting the rules invites re-grading a historical attempt against
--     them, which is a different feature with a different privacy question.
--   * MEDIA. The snapshot preserves `image_url` / `video_url` / `audio_url`
--     (`InstructionPanel.tsx:53-86`, plus per-option media on `multi_choice` /
--     `match`) — the URL, never the asset. If the host loses the file the replay
--     degrades to a missing image, and the reader must SAY so rather than render
--     a broken box. Storing the binaries is a different order of cost.
--   * anything about attempts settled BEFORE this is applied. Not retroactive,
--     and no backfill is possible: the wording is gone. Rows keep NULL here
--     forever and every reader must treat NULL as "unknown", never as "the
--     current spec".
--
-- NULLABLE, AND NO CHECK CONSTRAINT — BOTH DELIBERATE
-- ---------------------------------------------------
-- NULLABLE because `not null` would make the whole trace unwritable by any
-- client older than this migration, and because the outbox legitimately replays
-- entries serialised before the field existed. A NULL snapshot is the honest
-- record of "this build did not capture it".
--
-- NO CHECK, unlike `actions`. 0034 constrains `actions` because a malformed
-- envelope makes the row meaningless — rejecting it is correct. The snapshot is
-- the opposite: it DECORATES the sequence. A constraint here would let an
-- oddly-shaped enunciado reject the whole trace, i.e. cost the sequence to
-- protect its annotation. That is the same rule 0033 and 0034 are built on —
-- TELEMETRY MUST NEVER DESTROY THE RECORD IT DECORATES — applied one level
-- down. `spec_locale` is likewise unconstrained in its VOCABULARY, for the
-- reason `schema_version` is `>= 1` and not `in (1)`: a database that rejects a
-- locale it has not been told about would silently drop the first attempt by
-- the first learner of the third language.
--
-- NO INDEX. Nothing filters on either column — a replay arrives by
-- `(user_id, activity_id, started_at)`, which is already the unique index. An
-- index nobody queries taxes every insert for nothing (same call as 0034).
--
-- ⚠️ NO `schema_version` BUMP. A NEW COLUMN IS NOT AN ENVELOPE CHANGE. The rule
-- is written at the top of `src/utils/learningTrace.ts` and it is not a
-- formality: the version exists so a reader can tell whether an OLD row is
-- interpretable, and bumping it for additive change destroys exactly that
-- signal. `started_at`, `at_ms` and `actions` all keep their meaning here, so
-- rows written before and after this migration are the same envelope, v1.
--
-- ⚠️ DEPLOY ORDER — THIS MIGRATION FIRST, THEN THE PLAYER, and the client does
-- not depend on it. Merging applies NOTHING here (db/README.md: no workflow
-- touches `db/`); a human runs `db/scripts/apply-migrations.sh`. So the window
-- "build live, column absent" is the NORMAL state during a rollout, not an
-- anomaly — and PostgREST rejects the whole statement for an unknown column,
-- which would cost every trace until someone applied this by hand. The client
-- therefore retries the trace WITHOUT the snapshot on any failure
-- (`src/services/progress.service.ts`), so the window costs snapshots and never
-- sequences. Applying this sooner shrinks the window; it cannot break anything.
--
-- Idempotent: `add column if not exists` + `comment on`, nothing else. Required,
-- not optional — `db/scripts/apply-migrations.sh` has NO ledger and replays
-- every file from 0001 on every run, so a non-idempotent file here poisons every
-- future apply for everyone.
-- ============================================================================

begin;

alter table itera.activity_traces
  add column if not exists spec_snapshot jsonb;

alter table itera.activity_traces
  add column if not exists spec_locale text;

comment on column itera.activity_traces.spec_snapshot is
  $$The activity's `spec` EXACTLY AS RENDERED TO THIS LEARNER, captured at the
moment of the attempt. Bilingual `{pt,en}` bags are already collapsed to plain
strings for `spec_locale` — except for `sandbox_scenario`, whose runtime
resolves its own bags and whose spec is therefore snapshotted unresolved (read
this column WITH `spec_locale`, never without).

WHY IT EXISTS: `itera.activities.spec` is mutable jsonb with no version and no
hash, and the trigger `activity_defs_sync_instances` (migration 0024) rewrites
it across every instance without regard for existing attempts. Re-rendering the
live spec to replay an old attempt would show today's wording in the watcher's
language — a replay that diverges from what the learner saw, and looks correct
while doing it.

⚠️ NULL means UNKNOWN, never "same as current". Every row settled before
migration 0037 carries NULL and always will: the wording is gone and no backfill
can invent it. A reader must say "enunciado not captured" rather than fall back
to `itera.activities.spec`.

⚠️ URLS, NOT ASSETS. Media referenced by the spec (`image_url`, `video_url`,
`audio_url`, per-option media) survives here as a link. If the host drops the
file the replay degrades, and should say so.

NOT the `rubric` — grading rules are deliberately out (see the 0037 header).

Write path: src/services/progress.service.ts (best-effort, retried WITHOUT this
column if the schema lacks it). Client contract: src/utils/learningTrace.ts.$$;

comment on column itera.activity_traces.spec_locale is
  $$The locale `spec_snapshot` was resolved for — i.e. the language this learner
actually read the activity in. 'pt' | 'en' today.

Recorded because nothing else does. `resolveLocalizedSpec` collapses the bags at
RENDER time from a localStorage read, and `itera.users.locale` is overwritable
at any moment, so without this column the language of a past attempt is
unknowable.

DELIBERATELY UNCONSTRAINED as to value: a CHECK pinning the known set would make
the database reject the first attempt in a language it had not been told about —
the same reason `schema_version` checks `>= 1` rather than `in (1)`.

NULL means the attempt predates migration 0037, or a client older than it.$$;

commit;
