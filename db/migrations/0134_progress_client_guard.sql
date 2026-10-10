-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Cheap, honest mitigations for client-written progress (security review,
-- finding 1). They do NOT make progress trustworthy: grading still happens in
-- the browser. They remove the cheapest lies.
--
-- * `itera.progress.written_by_client`: true when the completion was recorded
--   by a client role (`authenticated` / `anon`). Rows written by the service
--   role or by an operator in psql keep `false`; so does everything that
--   existed before this migration (grandfathered, unknown origin).
-- * Trigger `progress_client_guard` (BEFORE INSERT OR UPDATE), for client
--   roles only:
--     - `completed_at` is the server's clock at the moment the row BECOMES
--       `completed`, whatever date the client sent: streaks, the weekly goal,
--       `early_bird` / `night_owl` can no longer be fabricated with fake dates;
--     - a row that is already `completed` keeps its `completed_at`;
--     - a row that is not `completed` has no `completed_at`.
--   The player's own writes still work unchanged: the pass upsert
--   (`status = 'completed'`), the miss insert (`in_progress`, ignore
--   duplicates) and the live-class reopen (`completed -> in_progress`).
--   The service role and psql (seeding, backdating) are not touched.
--
-- The `passport` function reads `written_by_client` for its plausibility floor
-- (`_shared/plausibility.ts`).
-- Idempotent.
-- ============================================================================

alter table itera.progress add column if not exists written_by_client boolean not null default false;

-- The floor checks that a client-recorded completion has a passed attempt. The
-- service role had no grant on this table at all (it bypasses RLS, not grants).
grant select on itera.activity_results to service_role;

create or replace function itera.progress_client_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only requests that arrive with a client role. `current_user` is the role
  -- PostgREST switched to; the service role and operators pass through.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.written_by_client := true;

  if new.status::text = 'completed' then
    if tg_op = 'UPDATE' and old.status::text = 'completed' and old.completed_at is not null then
      -- Completed before this write: the completion keeps its time and its origin.
      new.completed_at := old.completed_at;
      new.written_by_client := old.written_by_client;
    else
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists progress_client_guard on itera.progress;
create trigger progress_client_guard
  before insert or update on itera.progress
  for each row execute function itera.progress_client_guard();
