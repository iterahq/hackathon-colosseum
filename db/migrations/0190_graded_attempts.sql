-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Server-side grading, part 1 (additive): the attempt log written by the
-- `grade` edge function.
--
-- `itera.graded_attempts` holds one row per answer the server received:
--   * `mode`: `server` (the function graded the answer against the stored
--     spec), `self_reported` (the kind needs a browser; the player's claim is
--     recorded as a claim), `participation` (nothing to grade).
--   * `passed`: the server's verdict. `claimed_passed`: what the player said.
--   * `answer_hash` / `spec_hash`: sha256 hex of the answer and of the spec it
--     was graded against. The answer itself is not stored here.
--   * `created_at`: the server's clock.
-- Clients cannot write it: no insert/update/delete grant and no such policy. A
-- learner reads only their own rows.
--
-- The service role gains INSERT/UPDATE on `itera.progress`: from now on the
-- function is what records a completion (0191 closes the client path).
-- Idempotent.
-- ============================================================================

create table if not exists itera.graded_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references itera.users(id) on delete cascade,
  activity_id uuid not null references itera.activities(id) on delete cascade,
  lesson_id uuid not null,
  kind text not null,
  mode text not null check (mode in ('server', 'self_reported', 'participation')),
  passed boolean not null,
  claimed_passed boolean not null,
  reason text,
  answer_hash text not null check (answer_hash ~ '^[0-9a-f]{64}$'),
  spec_hash text not null check (spec_hash ~ '^[0-9a-f]{64}$'),
  grader text not null,
  created_at timestamptz not null default now()
);

create index if not exists graded_attempts_user_activity_idx on itera.graded_attempts (user_id, activity_id, created_at);
create index if not exists graded_attempts_user_created_idx on itera.graded_attempts (user_id, created_at);

alter table itera.graded_attempts enable row level security;

revoke all on itera.graded_attempts from anon, authenticated;
grant select on itera.graded_attempts to authenticated;
grant select, insert on itera.graded_attempts to service_role;

drop policy if exists graded_attempts_select_self on itera.graded_attempts;
create policy graded_attempts_select_self on itera.graded_attempts
  for select to authenticated
  using (user_id = itera.current_itera_user_id());

grant select, insert, update on itera.progress to service_role;

comment on table itera.graded_attempts is
  'One row per answer received by the grade edge function. Written by the service role only; the source of a completion.';
