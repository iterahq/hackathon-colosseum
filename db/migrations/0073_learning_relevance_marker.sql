-- ============================================================================
-- Itera migration 0073 — schema `learning`: the RELEVANCE-STATUS marker on
-- `work_episodes`. Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn)
-- ONLY. NOT dfl-schema. NOT DFL production (yoojxnggaxcqtsyjdrdx). Idempotent.
--
-- Plan: 20260901-learning-engine-collect-and-judge-better, item F3, ADR-5.
--
-- MERGE ORDER. This file is 0073. It follows 0072 (learning generation-config
-- calibration columns), already on `main`. It has no dependency on 0072 or any
-- other open PR — it only adds two columns + a narrow grant to `work_episodes`,
-- a table on `main` since 0067.
--
-- WHAT THIS IS
-- -----------
-- The cost bug (Fable analysis, F3): idempotence in `apps/engine`'s pipeline
-- keyed ONLY on `evidence.episode_id` — an episode the relevance stage judged
-- `not_relevant` produces no evidence row, so it was RE-CLASSIFIED BY THE LLM
-- ON EVERY PIPELINE RUN. ~92% of the corpus produces no evidence. There was no
-- column, and no table, that remembered a `not_relevant` verdict.
--
-- `relevance_status` + `relevance_checked_at` are that memory: once every
-- active objective has judged an episode this run, the engine writes the
-- verdict here (`relevant` or `not_relevant`) and never re-classifies that
-- episode again, unless the caller explicitly asks for `reprocess`. The SAME
-- two columns answer the M11 backoffice PENDING queue's question — "which
-- episodes are unprocessed?" is `relevance_status is null`.
--
-- WHY A COLUMN ON `work_episodes`, NOT A NEW `learning.pipeline_runs` TABLE
-- (ADR-5)
-- --------------------------------------------------------------------------
-- ADR-5 named both shapes. A `pipeline_runs` table would also give per-run
-- cost/model telemetry — real, but a second and separate gap (flagged as its
-- own DRIFT in the plan's Verification table, not closed here). The column is
-- the smaller, sufficient fix for THIS bug: it is what `loadEpisodes` in
-- `apps/engine/src/pipeline/run.ts` needs to skip an already-judged episode,
-- and it is directly queryable for the PENDING queue
-- (`select count(*) from learning.work_episodes where relevance_status is
-- null`) without joining anything. A `pipeline_runs` table remains open for a
-- follow-up plan item that actually needs per-run telemetry.
--
-- WHY `relevance_status` IS `text` + CHECK, NOT AN ENUM (0067/0071 discipline)
-- -----------------------------------------------------------------------------
-- Same reasoning as `work_episodes.machine_class` (0071): a new value is then
-- a one-line CHECK edit, never an `ALTER TYPE ... ADD VALUE`, which cannot run
-- in a transaction and cannot be undone.
--
-- WHY THIS COLUMN NEEDS AN UPDATE GRANT, AND `machine_class` DID NOT
-- --------------------------------------------------------------------
-- `work_episodes` is append-only for `authenticated` — INSERT and SELECT only
-- (0067 header: "A wrong evidence row is corrected by writing a `weakens`
-- row, not by rewriting history"). `machine_class` (0071) fit that shape
-- exactly because it is written ONCE, at INSERT time, via a constant DEFAULT —
-- no UPDATE grant was needed there, and none was added.
--
-- `relevance_status` is different: it is not known at ingestion. It is decided
-- LATER, by a pipeline run reading the episode against the CALLER's own
-- objectives. So it MUST be an UPDATE, issued after the row already exists.
-- Granting a blanket `update` on `work_episodes` would break the append-only
-- invariant for `source`, `payload`, `user_prompt` etc. — the actual captured
-- record this table exists to protect.
--
-- The fix is a COLUMN-LEVEL grant: `update (relevance_status,
-- relevance_checked_at)` and nothing else. Postgres enforces column-scoped
-- UPDATE privileges natively — a statement that touches any other column is
-- refused at the grant level, before RLS is even evaluated. So:
--   * every OTHER column stays exactly as append-only as it was;
--   * this pair becomes a narrow, purpose-built exception: derived PROCESSING
--     STATE about the episode, not a rewrite of what was captured. The same
--     distinction 0067 draws for `learner_state` (a "cache with a receipt")
--     applies here, at column grain instead of table grain.
-- RLS is unchanged: `episodes_rw_self` (0067) is already `for all`, gated on
-- `learner_id = itera.current_itera_user_id()`, so it already permits UPDATE
-- by the owning learner — only the GRANT was missing.
--
-- WHY THE ENGINE STILL WORKS BEFORE AND AFTER THIS MIGRATION
-- -----------------------------------------------------------
-- The engine degrades safely in BOTH directions around this column (see
-- `apps/engine/src/pipeline/run.ts`, `loadEpisodes` / `markEpisodeRelevance`):
--   * BEFORE it lands — a select naming `relevance_status` fails `42703`, and
--     `loadEpisodes` retries with the pre-F3 column list. Every episode is
--     treated as unmarked — exactly the pre-F3 (current) behaviour: re-judged
--     every run. The post-classification UPDATE attempt also 42703's and is
--     swallowed, never failing the run.
--   * AFTER it lands — a fresh episode has `relevance_status = null` (queued,
--     the PENDING state) until a run classifies it; from then on it is
--     skipped, unless `reprocess`.
-- So this migration adds capability; it never gates the engine on itself, in
-- either direction.
--
-- ⚠️ INVISIBLE TO THE DRIFT GUARDS, as all of schema `learning` is (0067
-- header): db/scripts/census.sql scopes to ('itera','billing'), so
-- db/census/expected-schema.txt needs no update for this PR. Extending the
-- census to `learning` is its own PR (named in 0067).
-- ============================================================================

alter table learning.work_episodes
  add column if not exists relevance_status text;

alter table learning.work_episodes
  add column if not exists relevance_checked_at timestamptz;

alter table learning.work_episodes
  drop constraint if exists work_episodes_relevance_status_known;
alter table learning.work_episodes
  add constraint work_episodes_relevance_status_known
  check (relevance_status is null or relevance_status in ('relevant', 'not_relevant'));

-- A verdict without a timestamp (or vice versa) is not a fact the engine ever
-- writes — it always sets both together (`markEpisodeRelevance`). Enforced so
-- a hand-written or partial UPDATE cannot leave the pair half-set.
alter table learning.work_episodes
  drop constraint if exists work_episodes_relevance_marker_paired;
alter table learning.work_episodes
  add constraint work_episodes_relevance_marker_paired
  check (
    (relevance_status is null and relevance_checked_at is null)
    or (relevance_status is not null and relevance_checked_at is not null)
  );

create index if not exists idx_work_episodes_relevance_pending
  on learning.work_episodes (learner_id)
  where relevance_status is null;

-- Column-scoped UPDATE — see the header. Every other column on this table
-- stays append-only (0067: `grant select, insert on learning.work_episodes`).
grant update (relevance_status, relevance_checked_at) on learning.work_episodes to authenticated;

comment on column learning.work_episodes.relevance_status is
  $$The persisted relevance verdict (plan 20260901-learning-engine-collect-and-
judge-better, F3, ADR-5): `relevant` or `not_relevant`, or `null` while the
episode is still queued (the M11 backoffice PENDING state — `select count(*)
from learning.work_episodes where relevance_status is null`). Written once a
pipeline run's active objectives have all judged the episode; a later run
skips any episode already marked, unless `reprocess` is requested. Fixes the
cost bug where a `not_relevant` episode (no evidence row) was re-classified by
the LLM on every run — ~92% of the corpus, every time.$$;

comment on column learning.work_episodes.relevance_checked_at is
  $$When `relevance_status` was last written. Always set together with
`relevance_status` (see `work_episodes_relevance_marker_paired`); `null` while
the episode is unclassified.$$;
