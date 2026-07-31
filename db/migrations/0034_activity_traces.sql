-- ============================================================================
-- Itera migration 0034 — itera.activity_traces: the learning-event trace.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
-- Plan: 20260731-itera-eventos-aprendizagem (Phases 2 + 3).
--
-- WHY
-- ---
-- The player records the RESULT of an attempt and nothing about how the learner
-- got there. `activity_results` says which activity, which outcome, what was
-- answered and (since 0033) how long it took. It cannot say what was tried
-- first, what was changed and changed back, or where the learner stalled — and
-- those are the observations the two motivating questions actually need: where
-- does a learner get stuck, and which activity confuses people.
--
-- Tainan, 2026-07-31: "você nunca vai conseguir voltar no tempo e coletar esses
-- dados". This table exists so that the collecting starts now, in a shape that
-- survives the format changing later.
--
-- WHAT IS AND IS NOT BEING BUILT HERE
-- -----------------------------------
-- This is the PIPE, not its contents. The rich sequence — every click, every
-- option swapped before submitting — DOES NOT EXIST YET; it arrives when the
-- activities become reducers (sub-plan 1), because the reducer's actions ARE
-- the events. So this table is shaped for a long sequence and is filled today
-- with the two actions the persistence path genuinely observes (opened,
-- settled). That is the entire reason `schema_version` is here from row one.
--
-- ONE ROW PER ATTEMPT, NOT ONE ROW PER MICRO-EVENT
-- ------------------------------------------------
-- Explicit decision (Tainan, 2026-07-31), and it is the decision that decides
-- whether "milhões de rows" arrives in months or never. Two reasons, both load
-- bearing:
--   * Nobody queries an isolated click. Every question worth asking is about a
--     SEQUENCE, and a sequence spread over N rows has to be re-assembled with a
--     window function on every single read.
--   * Replay becomes the read of ONE ROW. Fan-out of one row per event would
--     multiply today's ~80-200 attempt rows/week by 20-50 and buy nothing.
-- Measured 2026-07-31 for scale: the whole database is 17 MB,
-- `activity_results` is 532 rows / 216 kB, 45 users (29 active). This table
-- grows at the rate of settled attempts — the same order of magnitude as
-- `activity_results` — not at the rate of interactions.
--
-- WHY A NEW TABLE INSTEAD OF A jsonb COLUMN ON activity_results
-- -------------------------------------------------------------
-- Isolation of failure, and it is the same principle that shaped 0033: the
-- attempt row is worth incomparably more than the telemetry decorating it.
-- Adding a column to `activity_results` means the trace rides INSIDE the insert
-- that records the attempt, so a malformed payload or an unapplied migration
-- can reject the attempt itself. As a separate table it is a separate,
-- best-effort statement issued AFTER the attempt has landed: the worst case is
-- a missing trace. That property is what lets this table carry a real CHECK
-- constraint at all (see below) without the constraint ever being able to cost
-- a learner's answer.
--
-- Secondary, but real: retention and size profiles differ. A trace is a
-- growing blob; the attempt row is a narrow fact that instructor-facing queries
-- scan constantly. Keeping them apart keeps `activity_results` narrow.
--
-- WHY `schema_version` IS A COLUMN AND NOT A KEY INSIDE THE jsonb
-- ---------------------------------------------------------------
-- Because every reader needs it BEFORE deciding how to interpret the payload,
-- and because "give me everything written under the old format" must be an
-- indexable predicate rather than a per-row jsonb cast. It is `not null`: an
-- unversioned trace is precisely the ambiguous artefact this migration exists
-- to prevent.
--
--   CHECK IS `>= 1`, NOT `IN (1)` — ON PURPOSE.
--   Pinning to a known set would make the database reject rows from any client
--   NEWER than the last applied migration. This repo auto-deploys on merge to
--   `main` and applies migrations BY HAND, so "client ahead of schema" is the
--   normal state during every rollout, not an anomaly. A constraint that
--   rejects the future would silently drop exactly the newest data, which is
--   the failure this whole plan is about. The version's job is to let a READER
--   interpret a row, not to let the writer's schema veto it.
--
-- WHAT THE CONSTRAINT ACTUALLY VALIDATES: SHAPE, NEVER VOCABULARY, NEVER SIZE
-- --------------------------------------------------------------------------
-- `itera.is_action_trace(jsonb)` asserts that `actions` is an array of objects,
-- each with a string `type` and a non-negative numeric `at_ms`, and a `payload`
-- that is an object when present. That is the envelope, and it is the part that
-- is versioned.
--
-- It deliberately does NOT check:
--   * the `type` STRING — the vocabulary must be able to grow without a
--     migration, and a database that rejects an action type it has not been
--     told about would block every new event the client learns to emit.
--   * the PAYLOAD KEYS — new keys must never invalidate an old row, and a
--     schema for them here would have to be bumped for every additive change.
--   * the LENGTH — capping actions is a CLIENT policy (MAX_TRACE_ACTIONS in
--     src/utils/learningTrace.ts, 500 today), and a DB cap would mean a
--     migration every time a legitimately longer sequence becomes possible.
--     A rejected long trace is also a SILENTLY rejected long trace, since the
--     write is best-effort by design — a guard nobody hears is not a guard.
--
-- So: a well-formed trace can never be rejected by this constraint, and the
-- only rows it stops are malformed ones, which is the case where stopping is
-- the correct answer.
--
-- RLS
-- ---
-- Mirrors `activity_results` exactly: `traces_rw_self` (`for all`, self-scoped
-- on both `using` and `with check`), plus admin and instructor SELECT policies
-- joined through `itera.memberships`, using the same SECURITY DEFINER helpers
-- (`current_itera_user_id`, `current_admin_tenant_ids` from 0004,
-- `current_instructor_tenant_ids` from 0013). The learner writes their own row;
-- staff of their tenant read it. NO service_role anywhere.
--
-- ⚠️ GRANTS ARE NARROWER THAN THE POLICY, AND THAT IS INTENTIONAL. The policy
-- is `for all` so it matches the house shape and so a future update path needs
-- no policy change; the GRANT is only `select, insert`, because a trace is
-- append-only by nature — nothing in the product edits or deletes one, and a
-- learner who could UPDATE their own trace could rewrite the record of how they
-- solved something. Policy shape follows the house; privilege follows the need.
--
-- ⚠️ The `grant ... on all tables in schema itera` in 0002 does NOT cover this
-- table on a fresh replay: 0002 runs BEFORE 0034 in lexical order, and
-- `on all tables` is evaluated at execution time, not as a standing rule. The
-- explicit grants below are required, not decorative.
--
-- THE TIMESTAMP IS THE LEARNER'S, NOT THE DATABASE'S
-- ---------------------------------------------------
-- `started_at` is supplied by the client and is the instant the activity opened
-- FOR THE LEARNER — derived from the moment they answered, which is stamped at
-- the settle and carried through the durable outbox
-- (`src/utils/answerOutbox.ts`). It is deliberately NOT `default now()`: a write
-- that failed on school wifi is queued and replayed on reconnect, sometimes
-- much later, and a trace dated to the reconnection describes the network
-- rather than the learner. `created_at` is the row's own clock and keeps that
-- distinction visible — the two differ by exactly the queue's latency.
--
-- That choice is also what makes the write IDEMPOTENT: because the anchor is a
-- stable function of the attempt, a re-sent outbox entry derives the same
-- `started_at` and collides with the unique index below instead of duplicating
-- the sequence. `activity_results` tolerates a duplicate row (over-counting an
-- attempt beats losing one); a duplicated TRACE has no such excuse, since it
-- would corrupt every "how many tries" and "what did they do first" question
-- this table exists to answer.
--
-- INDEXES: two, both dimensions that will actually be filtered, plus the
-- idempotency key.
--   * `activity_id` — "how is THIS activity being solved" is the per-activity
--     question the plan is for.
--   * `user_id` — every RLS predicate on the self policy filters it, and it
--     mirrors `idx_results_user` from 0001.
-- Nothing on `created_at` or inside the jsonb yet: at this volume they scan in
-- milliseconds, and an index on a column nobody filters costs every INSERT for
-- nothing. Add one when a real query asks for it.
--
-- NO FOREIGN KEY TO activity_results — deliberate. Capturing the attempt row's
-- id would mean asking the attempt INSERT to return its representation, which
-- couples the trace to the one write that must never be endangered (and, with
-- 0033's re-insert fallback, could turn a returning-select hiccup into a
-- duplicated attempt row). The trace is self-sufficient for replay — the
-- outcome rides in the terminal action's payload — and correlates to the
-- attempt on `(user_id, activity_id, created_at)` for analysis.
--
-- Idempotent: `create table if not exists`, `create or replace function`,
-- `drop constraint/policy if exists` before `add/create`, `create index if not
-- exists`. Required, not optional — db/scripts/apply-migrations.sh has NO
-- ledger table and replays every file from 0001 on every run, so a
-- non-idempotent file here poisons every future apply for everyone.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Envelope validator. IMMUTABLE so a CHECK constraint may call it, and a
-- function rather than an inline CHECK because per-element validation needs a
-- subquery, which CHECK does not allow directly.
--
-- Written with jsonb-to-jsonb comparisons and NO casts on purpose: SQL does not
-- promise short-circuit evaluation of OR, so `(e ->> 'at_ms')::numeric` could
-- be evaluated on a non-numeric value and raise instead of returning false —
-- turning a malformed row into an ERROR rather than a rejection.
-- ---------------------------------------------------------------------------
create or replace function itera.is_action_trace(a jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select jsonb_typeof(a) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(a) as e(value)
       where jsonb_typeof(e.value) is distinct from 'object'
          or jsonb_typeof(e.value -> 'type') is distinct from 'string'
          or jsonb_typeof(e.value -> 'at_ms') is distinct from 'number'
          or e.value -> 'at_ms' < '0'::jsonb
          or (e.value ? 'payload' and jsonb_typeof(e.value -> 'payload') is distinct from 'object')
     );
$$;

comment on function itera.is_action_trace(jsonb) is
  $$Structural validator for itera.activity_traces.actions.

Asserts the ENVELOPE and nothing else: an array of objects, each with a string
`type` and a non-negative numeric `at_ms`, plus a `payload` that is an object
when present.

Deliberately silent about the `type` vocabulary, the payload keys and the array
length — all three must be able to grow without a migration. See the 0034
header. Client contract: src/utils/learningTrace.ts.$$;

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------
create table if not exists itera.activity_traces (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references itera.users(id) on delete cascade,
  activity_id       uuid not null references itera.activities(id) on delete cascade,
  schema_version    smallint not null,
  started_at        timestamptz not null,
  actions           jsonb not null default '[]'::jsonb,
  actions_truncated boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table itera.activity_traces
  drop constraint if exists activity_traces_schema_version_known;
alter table itera.activity_traces
  add constraint activity_traces_schema_version_known
  check (schema_version >= 1);

alter table itera.activity_traces
  drop constraint if exists activity_traces_actions_shape;
alter table itera.activity_traces
  add constraint activity_traces_actions_shape
  check (itera.is_action_trace(actions));

create index if not exists idx_activity_traces_activity on itera.activity_traces(activity_id);
create index if not exists idx_activity_traces_user     on itera.activity_traces(user_id);

-- IDEMPOTENCY KEY. The client's write is `on conflict do nothing` against this
-- index, which is what makes an outbox retry a no-op instead of a duplicated
-- sequence — see the header. It only works because `started_at` is stamped at
-- the SETTLE and carried through the queue: a `now()`-at-write-time anchor
-- would differ on every retry and this index would never fire.
--
-- Two settled attempts by the same learner on the same activity in the same
-- millisecond are not physically possible, so this never collapses genuine
-- retries by the learner (which are distinct attempts, seconds apart).
create unique index if not exists uq_activity_traces_attempt
  on itera.activity_traces(user_id, activity_id, started_at);

-- ---------------------------------------------------------------------------
-- RLS — same shape as itera.activity_results.
-- ---------------------------------------------------------------------------
alter table itera.activity_traces enable row level security;

drop policy if exists traces_rw_self on itera.activity_traces;
create policy traces_rw_self on itera.activity_traces
  for all using (user_id = itera.current_itera_user_id())
  with check (user_id = itera.current_itera_user_id());

-- Admin sees traces of any user who is a member of the admin's tenant
-- (no tenant_id on the row — join via memberships, exactly like 0004 does for
-- activity_results).
drop policy if exists traces_select_admin on itera.activity_traces;
create policy traces_select_admin on itera.activity_traces
  for select using (
    user_id in (
      select m.user_id
      from itera.memberships m
      where m.tenant_id in (select itera.current_admin_tenant_ids())
    )
  );

-- Instructor/staff: same membership-join scoping (mirrors 0013).
drop policy if exists traces_select_instructor on itera.activity_traces;
create policy traces_select_instructor on itera.activity_traces
  for select using (
    user_id in (
      select m.user_id
      from itera.memberships m
      where m.tenant_id in (select itera.current_instructor_tenant_ids())
    )
  );

-- Grants — RLS still applies; these only allow the roles to attempt access.
-- INSERT + SELECT only: a trace is append-only (see the header).
grant select on itera.activity_traces to anon, authenticated;
grant insert on itera.activity_traces to authenticated;

-- ---------------------------------------------------------------------------
-- Documentation on the objects themselves. `\d+ itera.activity_traces` and
-- every introspection tool surface these — which is where the next person will
-- actually look, unlike a plan doc.
-- ---------------------------------------------------------------------------
comment on table itera.activity_traces is
  $$Learning-event trace: ONE ROW PER SETTLED ATTEMPT, holding the ordered
sequence of actions the learner took, as a jsonb array.

NOT one row per micro-event. That was an explicit decision (Tainan 2026-07-31):
nobody queries an isolated click, and one row per attempt makes a REPLAY the
read of a single row instead of a windowed re-assembly.

WHAT IT IS AND IS NOT
  IS:     the HOW — the sequence, its timing, its shape.
  IS NOT: the outcome record. That is itera.activity_results, which holds
          passed / the answer text / elapsed_ms / visible_ms. There is no FK
          between them on purpose (see migration 0034); correlate on
          (user_id, activity_id, created_at).

⚠️ TODAY'S TRACES HAVE TWO ACTIONS. The rich sequence does not exist yet — it
arrives when the activity components become reducers (sub-plan 1 of plan
20260731-itera-eventos-aprendizagem), because the reducer's actions ARE the
events. Rows written before that are complete accounts of what the client could
observe, not truncated ones. `actions_truncated` tells you about truncation;
a two-action trace is not truncated, it is early.

⚠️ NOT RETROACTIVE, and it cannot be. Attempts settled before this table
existed left no sequence anywhere, and a reconstruction would be an invention.
Same rule as migration 0028.

Write path: src/services/progress.service.ts (best-effort, AFTER the attempt
row has landed — telemetry must never be able to destroy the record it
decorates). Client contract: src/utils/learningTrace.ts.$$;

comment on column itera.activity_traces.schema_version is
  $$Version of the ENVELOPE (`started_at` + `actions` + `actions_truncated`) as
this row was written. NOT NULL, and never inferred at read time.

WHY IT EXISTS: "você nunca vai conseguir voltar no tempo e coletar esses dados"
(Tainan, 2026-07-31). The format WILL change; an unversioned row written before
it changed is data nobody can safely interpret afterwards, and unlike a bug
that is not fixable later.

BUMPED only when an existing field changes MEANING or SHAPE — e.g. `at_ms`
ceasing to be an offset from `started_at`, or `actions` ceasing to be
chronological. NOT bumped for additive change: a new action `type`, a new
payload key, or a new column on this table. That distinction is the whole value
of the field — a version that ticks on additive change tells a reader nothing
about whether an old row is readable.

CHECK is `>= 1`, not a fixed set: a client is routinely AHEAD of the schema here
(the app auto-deploys on merge; migrations are applied by hand), and a
constraint that rejected an unknown-but-newer version would silently discard
exactly the newest data. Readers tolerate unknown versions instead — see
`readTrace` in src/utils/learningTrace.ts.$$;

comment on column itera.activity_traces.started_at is
  $$Wall-clock instant that `at_ms: 0` refers to — the moment the activity
became the one on screen for this learner.

Same window origin as itera.activity_results.elapsed_ms (migration 0033), by
construction: the client derives it as (settle instant − elapsed_ms), where the
settle instant is stamped when the learner ANSWERS and carried through the
durable offline outbox. A row is written ONLY when that origin is known; an
attempt with no measured duration or no known settle (an outbox entry queued by
a client older than those fields) produces an attempt row and NO trace, because
offsets without an origin mean nothing and a fabricated anchor is worse than
none.

⚠️ Not the same as created_at, which is when the ROW was written. Those differ
by the network, and for a queued offline write they can differ by hours. Use
this column for anything about the learner; use created_at only to reason about
ingestion.

Also the idempotency key (see uq_activity_traces_attempt): being a stable
function of the attempt is what makes a replayed outbox entry a no-op.$$;

comment on column itera.activity_traces.actions is
  $$The ordered action sequence. Array of `{type, at_ms, payload?}`.

  type    text    — WHAT happened. Open vocabulary: readers MUST tolerate a type
                    they do not recognise. New types are additive and do NOT
                    bump schema_version.
  at_ms   number  — WHEN, as milliseconds since `started_at`. Not a wall clock:
                    the origin is on the row once, absolute time is recoverable
                    by addition, and a per-action wall clock would let an NTP
                    jump produce a sequence that is out of order with itself.
  payload object  — type-specific detail, absent when there is none. New keys
                    never invalidate an old row, because nothing reads a key it
                    did not ask for.

Today's vocabulary is exactly two: `activity_opened` (at_ms 0, by construction)
and `attempt_settled` (at_ms EQUALS activity_results.elapsed_ms, by
construction; payload carries `passed` so a replay knows the verdict shown).

The constraint validates SHAPE only — never the vocabulary, never the payload
keys, never the length. See itera.is_action_trace.

Deliberately NOT stored here: the learner's answer text and the durations. Both
live on itera.activity_results, written in the same call; duplicating them
would mean two places to keep in step and two places to purge.$$;

comment on column itera.activity_traces.actions_truncated is
  $$True when the client cut the sequence at its cap (MAX_TRACE_ACTIONS,
src/utils/learningTrace.ts — 500 today). The HEAD is kept plus the terminal
action, so a truncated trace never loses its outcome.

FALSE on a two-action trace: that is early, not truncated. Do not read this
column as "the sequence is short".

There is no length limit in the database on purpose (see the 0034 header), so
this flag is the ONLY record that a cut happened.$$;
